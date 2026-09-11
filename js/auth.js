// ============================================================================
// Sesión, rol del usuario, y la barra superior compartida por todas las
// pantallas. Cada página llama a requireAuth([...roles permitidos]) apenas
// carga; si no hay sesión o el rol no alcanza, manda de vuelta al login.
// ============================================================================
import { supabase } from "./supabaseClient.js";

const NAV_ITEMS = [
  { href: "mesas.html", label: "Mesas / pedidos", roles: ["admin", "cajera", "mesera"] },
  { href: "cocina.html", label: "Cocina", roles: ["admin", "cajera", "mesera"] },
  { href: "caja.html", label: "Caja", roles: ["admin", "cajera"] },
  { href: "admin.html", label: "Administración", roles: ["admin"] },
];

// Trae el usuario logueado + su fila en public.usuarios (con el rol).
// Devuelve null si no hay sesión activa.
export async function getCurrentUser() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return null;
  const { data: perfil, error } = await supabase
    .from("usuarios")
    .select("id, nombre, rol, activo")
    .eq("id", session.user.id)
    .single();
  if (error || !perfil || !perfil.activo) return null;
  return { authUser: session.user, ...perfil };
}

// Llamar al inicio de cada página protegida.
// allowedRoles: lista de roles que pueden ver esta pantalla.
export async function requireAuth(allowedRoles) {
  const user = await getCurrentUser();
  if (!user) {
    window.location.href = "index.html";
    return null;
  }
  if (allowedRoles && !allowedRoles.includes(user.rol)) {
    // Rol sin permiso para esta pantalla: lo mandamos a la primera que sí puede ver.
    const primero = NAV_ITEMS.find((item) => item.roles.includes(user.rol));
    window.location.href = primero ? primero.href : "index.html";
    return null;
  }
  renderTopbar(user);
  return user;
}

export async function logout() {
  await supabase.auth.signOut();
  window.location.href = "index.html";
}

function renderTopbar(user) {
  const mount = document.getElementById("topbar-mount");
  if (!mount) return;
  const current = window.location.pathname.split("/").pop();
  const links = NAV_ITEMS.filter((item) => item.roles.includes(user.rol))
    .map(
      (item) =>
        `<a href="${item.href}" class="${item.href === current ? "active" : ""}">${item.label}</a>`
    )
    .join("");

  mount.innerHTML = `
    <div class="topbar">
      <span class="brand">🥩 Buffet · Gestión</span>
      <nav>${links}</nav>
      <div class="who">
        <span><b>${escapeHtml(user.nombre)}</b> · ${escapeHtml(user.rol)}</span>
        <button class="logout" id="btn-logout">Salir</button>
      </div>
    </div>
    <div class="offline-banner" id="offline-banner" hidden>
      Sin conexión — los pedidos se guardan igual y se envían solos cuando vuelva internet.
    </div>
  `;
  document.getElementById("btn-logout").addEventListener("click", logout);

  const banner = document.getElementById("offline-banner");
  const updateBanner = () => { banner.hidden = navigator.onLine; };
  window.addEventListener("online", updateBanner);
  window.addEventListener("offline", updateBanner);
  updateBanner();
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str ?? "";
  return div.innerHTML;
}

// Toast simple para mensajes de éxito/error, usado en todas las páginas.
export function toast(message, type = "ok") {
  const el = document.createElement("div");
  el.className = "toast" + (type === "error" ? " error" : "");
  el.textContent = message;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 3200);
}
