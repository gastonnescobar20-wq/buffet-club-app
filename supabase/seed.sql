-- ============================================================================
-- Datos de ejemplo — para probar el sistema antes de cargar el menú real
-- ============================================================================
-- Ejecutá esto DESPUÉS de schema.sql, también en el SQL Editor de Supabase.
-- Podés borrar o editar estos datos en cualquier momento desde el panel de
-- Administración de la propia app (ABM de productos y mesas), no hace falta
-- volver a tocar SQL para el uso normal del día a día.
-- ============================================================================

-- Mesas de ejemplo (numeradas 1 a 10)
insert into public.mesas (numero, nombre)
select numero, 'Mesa ' || numero
from generate_series(1, 10) as numero
on conflict (numero) do nothing;

-- Menú de ejemplo (EJEMPLO — reemplazar por el menú real del buffet)
insert into public.productos (nombre, categoria, precio) values
  ('Parrillada para 2', 'Parrilla', 18000.00),
  ('Bife de chorizo', 'Parrilla', 9500.00),
  ('Choripán', 'Parrilla', 3500.00),
  ('Ñoquis con tuco', 'Pastas', 6800.00),
  ('Ñoquis con salsa blanca', 'Pastas', 6800.00),
  ('Ravioles de ricota', 'Pastas', 7200.00),
  ('Empanada de carne', 'Entradas', 900.00),
  ('Empanada de jamón y queso', 'Entradas', 900.00),
  ('Ensalada mixta', 'Guarniciones', 2800.00),
  ('Papas fritas', 'Guarniciones', 3200.00),
  ('Gaseosa línea Coca-Cola', 'Bebidas', 2500.00),
  ('Agua mineral', 'Bebidas', 1800.00),
  ('Cerveza artesanal', 'Bebidas', 3800.00),
  ('Flan casero', 'Postres', 2600.00)
on conflict do nothing;

-- ============================================================================
-- Nota sobre usuarios: no se puede crear un usuario con login (email +
-- contraseña) desde acá. Eso se hace desde el panel de Supabase
-- (Authentication -> Users -> Add user) o desde la pantalla de Admin de la
-- app una vez que exista el primer admin. El README explica el paso a paso
-- para crear el primer usuario admin.
-- ============================================================================
