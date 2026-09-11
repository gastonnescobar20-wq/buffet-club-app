// ============================================================================
// Cola de pedidos offline.
// Si se corta el wifi del club, los pedidos NO se pierden: se guardan acá,
// en el propio dispositivo (IndexedDB), y se mandan solos a Supabase apenas
// vuelve la conexión. Mientras tanto la mesa/pedido ya queda marcado en la
// pantalla como si estuviera cargado.
// ============================================================================
import { supabase } from "./supabaseClient.js";

const DB_NAME = "buffet-offline";
const DB_VERSION = 1;
const STORE = "pedidos_pendientes";

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "localId" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

// Guarda un pedido NUEVO (con sus items) en la cola local.
// pedido: fila para la tabla "pedidos" (sin id todavía)
// items: filas para "pedido_items" (sin pedido_id todavía)
export async function encolarPedido(pedido, items) {
  return guardarEnCola({ tipo: "nuevo", pedido, items });
}

// Guarda ítems que se agregan a un pedido de mesa YA EXISTENTE (por ejemplo,
// la mesa pide una segunda tanda de bebidas). pedidoId es el id real que ya
// existe en Supabase.
export async function encolarItemsExtra(pedidoId, items) {
  return guardarEnCola({ tipo: "extra", pedido_id: pedidoId, items });
}

async function guardarEnCola(registro) {
  const db = await openDb();
  const localId = "local-" + Date.now() + "-" + Math.random().toString(36).slice(2, 8);
  await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).add({ localId, ...registro, creado_at: new Date().toISOString() });
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
  return localId;
}

export async function listarPendientes() {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function borrarPendiente(localId) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(localId);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}

let sincronizando = false;

// Intenta mandar todos los pedidos pendientes a Supabase. Se puede llamar
// las veces que haga falta (por ejemplo al volver la conexión); si ya hay
// una sincronización en curso, no arranca otra en paralelo.
export async function sincronizarPendientes(onSync) {
  if (sincronizando || !navigator.onLine) return;
  sincronizando = true;
  try {
    const pendientes = await listarPendientes();
    for (const p of pendientes) {
      try {
        let pedidoId = p.pedido_id;
        let pedidoInsertado = null;

        if (p.tipo === "nuevo") {
          const { data, error: errPedido } = await supabase
            .from("pedidos")
            .insert(p.pedido)
            .select()
            .single();
          if (errPedido) throw errPedido;
          pedidoInsertado = data;
          pedidoId = data.id;

          if (p.pedido.mesa_id) {
            await supabase
              .from("mesas")
              .update({ estado: "ocupada", pedido_actual_id: pedidoId })
              .eq("id", p.pedido.mesa_id);
          }

          if (p.pedido.pagado) {
            const total = p.items.reduce((acc, it) => acc + it.cantidad * it.precio_unitario, 0);
            await supabase.from("pagos").insert({
              pedido_id: pedidoId,
              medio: "plataforma",
              monto: total,
              usuario_id: p.pedido.usuario_id,
            });
          }
        }

        const itemsConId = p.items.map((it) => ({ ...it, pedido_id: pedidoId }));
        const { error: errItems } = await supabase.from("pedido_items").insert(itemsConId);
        if (errItems) throw errItems;

        await borrarPendiente(p.localId);
        if (onSync) onSync(p, pedidoInsertado);
      } catch (e) {
        // Si falla uno (por ejemplo, se volvió a cortar la conexión a mitad
        // de camino), lo dejamos en la cola y probamos de nuevo más tarde.
        console.warn("No se pudo sincronizar un pedido pendiente todavía:", e);
        break;
      }
    }
  } finally {
    sincronizando = false;
  }
}

export function contarPendientes() {
  return listarPendientes().then((p) => p.length);
}

// Se sincroniza solo al volver la conexión y cada 30s como respaldo.
window.addEventListener("online", () => sincronizarPendientes());
setInterval(() => sincronizarPendientes(), 30000);
