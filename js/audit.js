// ============================================================================
// Un solo lugar para dejar registro de auditoría. Se usa cada vez que alguien
// anula un ítem, aplica un descuento, o cierra una caja con diferencia — así
// queda quién, cuándo y por qué, sin depender de acordarse de hacerlo en cada
// pantalla por separado.
// ============================================================================
import { supabase } from "./supabaseClient.js";

export async function registrarAuditoria(usuarioId, accion, detalle) {
  const { error } = await supabase
    .from("auditoria")
    .insert({ usuario_id: usuarioId, accion, detalle });
  if (error) {
    // La auditoría no debería nunca bloquear la operación principal del
    // usuario (cobrar, anular, etc.) — si falla, se avisa por consola.
    console.warn("No se pudo registrar la auditoría:", error);
  }
}
