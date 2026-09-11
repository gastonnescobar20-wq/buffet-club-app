// ============================================================================
// Edge Function: pedido-qr
// ----------------------------------------------------------------------------
// Gateway público (sin login) para el pedido por QR de cada mesa. Ni la
// carta ni el alta de pedidos pasan por las políticas normales de la app
// (que exigen usuario logueado): esta función usa la service role y valida
// todo del lado del servidor — en particular, los precios siempre se
// recalculan acá contra la tabla productos, nunca se confía en lo que
// mande el navegador del cliente.
//
// Acciones (todas por POST, { accion: "menu" | "crear", ... }):
//   - "menu":  { mesaId } -> carta activa + pedido en curso de esa mesa (si hay).
//   - "crear": { mesaId, items:[{producto_id, variante, cantidad}], clienteNombre? }
//              -> crea el pedido (o se lo suma a uno abierto de esa mesa) y
//                 lo manda directo a cocina, sin pasar por ningún mozo.
// ============================================================================
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") return json({ error: "Método no permitido." }, 405);

  let body: any;
  try {
    body = await req.json();
  } catch {
    return json({ error: "JSON inválido." }, 400);
  }

  const mesaId = body.mesaId;
  if (!mesaId) return json({ error: "Falta la mesa." }, 400);

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: mesa, error: errMesa } = await admin
    .from("mesas")
    .select("id, numero, estado, pedido_actual_id")
    .eq("id", mesaId)
    .single();
  if (errMesa || !mesa) return json({ error: "Esa mesa no existe." }, 404);

  async function pedidoActualDeLaMesa() {
    if (!mesa.pedido_actual_id) return null;
    const { data: pedido } = await admin
      .from("pedidos")
      .select("id, numero, estado")
      .eq("id", mesa.pedido_actual_id)
      .single();
    if (!pedido || ["cobrado", "anulado"].includes(pedido.estado)) return null;
    const { data: items } = await admin
      .from("pedido_items")
      .select("nombre_producto, cantidad, precio_unitario, anulado")
      .eq("pedido_id", pedido.id)
      .eq("anulado", false);
    const total = (items || []).reduce((acc, it) => acc + it.cantidad * Number(it.precio_unitario), 0);
    return { id: pedido.id, numero: pedido.numero, items: items || [], total };
  }

  if (body.accion === "menu") {
    const { data: productos } = await admin
      .from("productos")
      .select("id, nombre, categoria, precio, precio_docena")
      .eq("activo", true)
      .order("categoria")
      .order("nombre");
    return json({
      mesaNumero: mesa.numero,
      productos: productos || [],
      pedidoActual: await pedidoActualDeLaMesa(),
    });
  }

  if (body.accion === "crear") {
    const itemsPedidos = Array.isArray(body.items) ? body.items : [];
    if (!itemsPedidos.length) return json({ error: "El pedido está vacío." }, 400);
    if (itemsPedidos.length > 40) return json({ error: "Demasiados renglones distintos en un solo pedido." }, 400);

    const { data: productos } = await admin.from("productos").select("id, nombre, precio, precio_docena, activo");
    const porId = new Map((productos || []).map((p) => [p.id, p]));

    const itemsAInsertar = [];
    for (const it of itemsPedidos) {
      const p = porId.get(it.producto_id);
      if (!p || !p.activo) return json({ error: "Uno de los productos ya no está disponible. Recargá la carta." }, 400);
      const cantidad = Number(it.cantidad);
      if (!Number.isInteger(cantidad) || cantidad <= 0 || cantidad > 50) {
        return json({ error: "Cantidad inválida." }, 400);
      }
      const esDocena = it.variante === "docena";
      if (esDocena && !p.precio_docena) return json({ error: `${p.nombre} no se vende por docena.` }, 400);
      itemsAInsertar.push({
        producto_id: p.id,
        nombre_producto: esDocena ? `${p.nombre} (docena)` : p.nombre,
        cantidad,
        precio_unitario: esDocena ? p.precio_docena : p.precio,
      });
    }

    const clienteNombre = (body.clienteNombre || "").trim() || null;
    const pedidoAbierto = await pedidoActualDeLaMesa();

    let pedidoId: string;
    let numero: number;
    if (pedidoAbierto) {
      pedidoId = pedidoAbierto.id;
      numero = pedidoAbierto.numero;
      const { error: errItems } = await admin
        .from("pedido_items")
        .insert(itemsAInsertar.map((it) => ({ ...it, pedido_id: pedidoId })));
      if (errItems) return json({ error: "No se pudo guardar el pedido." }, 500);
      await admin.from("pedidos").update({ estado: "en_preparacion", actualizado_at: new Date().toISOString() }).eq("id", pedidoId);
    } else {
      const { data: pedidoInsertado, error: errPedido } = await admin
        .from("pedidos")
        .insert({
          canal: "mesa",
          mesa_id: mesa.id,
          usuario_id: null,
          cliente_nombre: clienteNombre,
          estado: "en_preparacion",
          pagado: false,
        })
        .select("id, numero")
        .single();
      if (errPedido || !pedidoInsertado) return json({ error: "No se pudo crear el pedido." }, 500);
      pedidoId = pedidoInsertado.id;
      numero = pedidoInsertado.numero;
      const { error: errItems } = await admin
        .from("pedido_items")
        .insert(itemsAInsertar.map((it) => ({ ...it, pedido_id: pedidoId })));
      if (errItems) return json({ error: "No se pudo guardar el pedido." }, 500);
      await admin.from("mesas").update({ estado: "ocupada", pedido_actual_id: pedidoId }).eq("id", mesa.id);
    }

    return json({ ok: true, numero });
  }

  return json({ error: "Acción desconocida." }, 400);
});
