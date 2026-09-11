// ============================================================================
// Cliente único de Supabase, compartido por toda la app.
// Se carga la librería directo desde un CDN como módulo ES — no hace falta
// instalar nada con npm ni tener un paso de build.
// ============================================================================
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./config.js";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
});
