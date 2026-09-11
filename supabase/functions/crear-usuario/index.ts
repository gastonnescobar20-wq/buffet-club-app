// ============================================================================
// Edge Function: crear-usuario
// ----------------------------------------------------------------------------
// Crea el login de Supabase Auth (email + contraseña) Y la fila en
// public.usuarios en un solo paso, usando la service role key (que solo
// existe acá, del lado del servidor — nunca en el navegador).
//
// Dos modos:
//   - Bootstrap: si public.usuarios está vacía todavía, no hace falta estar
//     logueado — esto crea al primer usuario del sistema (el dueño) con rol
//     forzado a "admin". Solo funciona una vez: apenas exista un usuario,
//     este modo se cierra solo.
//   - Alta normal: si ya hay usuarios, quien llama tiene que estar logueado
//     y tener rol "admin" (se valida acá mismo con el token recibido).
// ============================================================================
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

const ROLES_VALIDOS = ["admin", "cajera", "mesera"];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") return json({ error: "Método no permitido." }, 405);

  let body: { email?: string; password?: string; nombre?: string; rol?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "JSON inválido." }, 400);
  }

  const email = (body.email || "").trim().toLowerCase();
  const password = body.password || "";
  const nombre = (body.nombre || "").trim();
  let rol = body.rol || "mesera";

  if (!email || !password || !nombre) {
    return json({ error: "Faltan datos (email, contraseña o nombre)." }, 400);
  }
  if (password.length < 6) {
    return json({ error: "La contraseña tiene que tener al menos 6 caracteres." }, 400);
  }
  if (!ROLES_VALIDOS.includes(rol)) {
    return json({ error: "Rol inválido." }, 400);
  }

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { count, error: countError } = await admin
    .from("usuarios")
    .select("*", { count: "exact", head: true });
  if (countError) {
    return json({ error: "No se pudo verificar el estado del sistema." }, 500);
  }

  const esBootstrap = (count ?? 0) === 0;

  if (esBootstrap) {
    rol = "admin"; // el primer usuario del sistema siempre queda como dueño/admin
  } else {
    const token = (req.headers.get("Authorization") || "").replace("Bearer ", "");
    if (!token) return json({ error: "No autorizado." }, 401);

    const { data: callerData, error: callerError } = await admin.auth.getUser(token);
    if (callerError || !callerData?.user) return json({ error: "No autorizado." }, 401);

    const { data: callerPerfil } = await admin
      .from("usuarios")
      .select("rol, activo")
      .eq("id", callerData.user.id)
      .single();

    if (!callerPerfil?.activo || callerPerfil.rol !== "admin") {
      return json({ error: "Solo un administrador puede crear usuarios." }, 403);
    }
  }

  const { data: nuevoAuth, error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (createError || !nuevoAuth?.user) {
    const msg = createError?.message?.includes("already been registered")
      ? "Ese email ya tiene una cuenta."
      : "No se pudo crear el login: " + (createError?.message || "error desconocido");
    return json({ error: msg }, 400);
  }

  const { error: perfilError } = await admin.from("usuarios").insert({
    id: nuevoAuth.user.id,
    nombre,
    rol,
    activo: true,
  });
  if (perfilError) {
    await admin.auth.admin.deleteUser(nuevoAuth.user.id);
    return json({ error: "No se pudo guardar el perfil: " + perfilError.message }, 400);
  }

  return json({ ok: true, id: nuevoAuth.user.id, bootstrap: esBootstrap });
});
