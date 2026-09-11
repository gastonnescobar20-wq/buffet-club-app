-- ============================================================================
-- Esquema de base de datos — Sistema de gestión del buffet
-- ============================================================================
-- Cómo usar este archivo:
-- 1. Entrá a tu proyecto en https://supabase.com -> pestaña "SQL Editor"
-- 2. Pegá todo este archivo y ejecutalo una sola vez ("Run")
-- 3. Después ejecutá seed.sql para cargar datos de ejemplo
--
-- Este archivo crea las tablas de la Fase 1 (pedidos, mesas, caja, usuarios)
-- y deja preparadas (pero sin usar todavía) las tablas de stock/insumos de
-- la Fase 2, para no tener que rehacer nada más adelante.
-- ============================================================================

create extension if not exists "pgcrypto"; -- para gen_random_uuid()

-- ----------------------------------------------------------------------------
-- USUARIOS Y ROLES
-- ----------------------------------------------------------------------------
-- Cada usuario del sistema tiene un login en Supabase Auth (email/contraseña)
-- y una fila acá con su nombre y su rol. El id de esta tabla es EL MISMO id
-- que genera Supabase Auth al crear el usuario.
--
-- Roles reconocidos por la aplicación: 'admin', 'cajera', 'mesera'.
-- Se puede escribir otro texto en rol, pero hasta que no se programen permisos
-- específicos para ese rol nuevo, el sistema lo trata como el más restringido
-- (mesera). Roles totalmente configurables (con permisos a medida) quedan
-- para una fase posterior.
create table public.usuarios (
  id uuid primary key references auth.users(id) on delete cascade,
  nombre text not null,
  rol text not null default 'mesera',
  activo boolean not null default true,
  creado_at timestamptz not null default now()
);

-- Función helper: rol del usuario que está haciendo la consulta ahora mismo.
create or replace function public.rol_actual()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select rol from public.usuarios where id = auth.uid() and activo = true;
$$;

-- ----------------------------------------------------------------------------
-- MESAS
-- ----------------------------------------------------------------------------
create table public.mesas (
  id uuid primary key default gen_random_uuid(),
  numero int not null unique,
  nombre text,
  estado text not null default 'libre' check (estado in ('libre','ocupada')),
  pedido_actual_id uuid, -- se completa después de crear la tabla pedidos
  creado_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- PRODUCTOS (el menú)
-- ----------------------------------------------------------------------------
create table public.productos (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  categoria text not null default 'General',
  precio numeric(10,2) not null check (precio >= 0),
  activo boolean not null default true,
  creado_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- TURNOS DE CAJA
-- ----------------------------------------------------------------------------
create table public.turnos_caja (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references public.usuarios(id),
  apertura_at timestamptz not null default now(),
  monto_apertura numeric(10,2) not null default 0,
  cierre_at timestamptz,
  monto_declarado_efectivo numeric(10,2),
  monto_sistema_efectivo numeric(10,2),
  diferencia numeric(10,2),
  estado text not null default 'abierto' check (estado in ('abierto','cerrado')),
  notas_cierre text
);

-- ----------------------------------------------------------------------------
-- PEDIDOS
-- ----------------------------------------------------------------------------
create table public.pedidos (
  id uuid primary key default gen_random_uuid(),
  numero bigint generated always as identity, -- número de orden corto, para mostrar en cocina
  canal text not null check (canal in ('mostrador','mesa','telefono','whatsapp','rappi','pedidos_ya','delivery_propio')),
  mesa_id uuid references public.mesas(id),
  usuario_id uuid not null references public.usuarios(id), -- quién lo tomó
  turno_id uuid references public.turnos_caja(id), -- se asigna al cobrar
  estado text not null default 'abierto'
    check (estado in ('abierto','en_preparacion','listo','entregado','cobrado','anulado')),
  -- pagado es independiente de estado: Rappi/PedidosYa se cobran solos al
  -- crearse y siguen en preparación en cocina; mostrador/mesa/delivery propio
  -- se pagan después, en Caja.
  pagado boolean not null default false,
  monto_abona numeric(10,2), -- con cuánto dijo que paga el cliente (para calcular vuelto), solo informativo
  notas text,
  motivo_anulacion text,
  cliente_nombre text, -- para pedidos de teléfono/whatsapp/rappi/pedidosya/delivery propio
  creado_at timestamptz not null default now(),
  actualizado_at timestamptz not null default now(),
  constraint anulado_necesita_motivo check (estado <> 'anulado' or motivo_anulacion is not null)
);

alter table public.mesas
  add constraint mesas_pedido_actual_fk foreign key (pedido_actual_id) references public.pedidos(id);

-- ----------------------------------------------------------------------------
-- ITEMS DE CADA PEDIDO
-- ----------------------------------------------------------------------------
create table public.pedido_items (
  id uuid primary key default gen_random_uuid(),
  pedido_id uuid not null references public.pedidos(id) on delete cascade,
  producto_id uuid references public.productos(id),
  nombre_producto text not null, -- copia del nombre al momento de la venta
  cantidad int not null check (cantidad > 0),
  precio_unitario numeric(10,2) not null check (precio_unitario >= 0),
  descuento numeric(10,2) not null default 0 check (descuento >= 0),
  motivo_descuento text,
  anulado boolean not null default false,
  motivo_anulacion_item text,
  listo boolean not null default false, -- para que la cocina tilde ítem por ítem
  creado_at timestamptz not null default now(),
  constraint descuento_necesita_motivo check (descuento = 0 or motivo_descuento is not null),
  constraint anulacion_item_necesita_motivo check (anulado = false or motivo_anulacion_item is not null)
);

-- ----------------------------------------------------------------------------
-- CUENTAS CORRIENTES DE SOCIOS (fiado)
-- ----------------------------------------------------------------------------
create table public.cuentas_corrientes (
  id uuid primary key default gen_random_uuid(),
  socio_nombre text not null,
  saldo numeric(10,2) not null default 0,
  activo boolean not null default true,
  creado_at timestamptz not null default now()
);

create table public.movimientos_cuenta_corriente (
  id uuid primary key default gen_random_uuid(),
  cuenta_id uuid not null references public.cuentas_corrientes(id),
  pedido_id uuid references public.pedidos(id),
  monto numeric(10,2) not null,
  tipo text not null check (tipo in ('cargo','pago')),
  creado_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- PAGOS
-- ----------------------------------------------------------------------------
create table public.pagos (
  id uuid primary key default gen_random_uuid(),
  pedido_id uuid not null references public.pedidos(id),
  turno_id uuid references public.turnos_caja(id),
  medio text not null check (medio in ('efectivo','tarjeta','transferencia','cuenta_corriente','plataforma')),
  monto numeric(10,2) not null check (monto >= 0),
  cuenta_corriente_id uuid references public.cuentas_corrientes(id),
  usuario_id uuid not null references public.usuarios(id),
  creado_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- AUDITORÍA (quién hizo qué)
-- ----------------------------------------------------------------------------
create table public.auditoria (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid references public.usuarios(id),
  accion text not null, -- ej: 'anular_item', 'descuento', 'cerrar_turno'
  detalle jsonb,
  creado_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- STOCK E INSUMOS (preparado para la Fase 2 — todavía sin usar en la app)
-- ----------------------------------------------------------------------------
create table public.insumos (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  unidad text not null default 'unidad', -- kg, litro, unidad, etc.
  stock_actual numeric(10,3) not null default 0,
  stock_minimo numeric(10,3) not null default 0,
  creado_at timestamptz not null default now()
);

create table public.recetas (
  id uuid primary key default gen_random_uuid(),
  producto_id uuid not null references public.productos(id) on delete cascade,
  insumo_id uuid not null references public.insumos(id),
  cantidad numeric(10,3) not null check (cantidad > 0)
);

create table public.movimientos_stock (
  id uuid primary key default gen_random_uuid(),
  insumo_id uuid not null references public.insumos(id),
  tipo text not null check (tipo in ('venta','ajuste','compra','merma')),
  cantidad numeric(10,3) not null,
  pedido_id uuid references public.pedidos(id),
  usuario_id uuid references public.usuarios(id),
  creado_at timestamptz not null default now()
);

-- ============================================================================
-- SEGURIDAD (Row Level Security)
-- ============================================================================
-- Regla general: todo el mundo que inició sesión puede VER lo necesario para
-- trabajar, pero solo el admin puede crear/editar productos, mesas y usuarios,
-- y solo admin/cajera pueden cobrar, anular o cerrar caja.

alter table public.usuarios enable row level security;
alter table public.mesas enable row level security;
alter table public.productos enable row level security;
alter table public.turnos_caja enable row level security;
alter table public.pedidos enable row level security;
alter table public.pedido_items enable row level security;
alter table public.cuentas_corrientes enable row level security;
alter table public.movimientos_cuenta_corriente enable row level security;
alter table public.pagos enable row level security;
alter table public.auditoria enable row level security;
alter table public.insumos enable row level security;
alter table public.recetas enable row level security;
alter table public.movimientos_stock enable row level security;

-- usuarios: cada uno ve su propia fila; admin ve y edita todas
create policy "usuarios: ver propia o admin ve todas" on public.usuarios
  for select using (id = auth.uid() or public.rol_actual() = 'admin');
create policy "usuarios: solo admin inserta" on public.usuarios
  for insert with check (public.rol_actual() = 'admin');
create policy "usuarios: solo admin edita" on public.usuarios
  for update using (public.rol_actual() = 'admin');
create policy "usuarios: solo admin borra" on public.usuarios
  for delete using (public.rol_actual() = 'admin');

-- mesas: cualquier autenticado ve y cambia el estado (libre/ocupada); solo admin agrega/borra mesas
create policy "mesas: cualquiera autenticado ve" on public.mesas
  for select using (auth.role() = 'authenticated');
create policy "mesas: cualquiera autenticado actualiza estado" on public.mesas
  for update using (auth.role() = 'authenticated');
create policy "mesas: solo admin crea" on public.mesas
  for insert with check (public.rol_actual() = 'admin');
create policy "mesas: solo admin borra" on public.mesas
  for delete using (public.rol_actual() = 'admin');

-- productos: cualquiera ve; solo admin crea/edita/borra
create policy "productos: cualquiera autenticado ve" on public.productos
  for select using (auth.role() = 'authenticated');
create policy "productos: solo admin crea" on public.productos
  for insert with check (public.rol_actual() = 'admin');
create policy "productos: solo admin edita" on public.productos
  for update using (public.rol_actual() = 'admin');
create policy "productos: solo admin borra" on public.productos
  for delete using (public.rol_actual() = 'admin');

-- pedidos: cualquiera autenticado ve y crea; solo admin/cajera pueden marcar cobrado o anulado
create policy "pedidos: cualquiera autenticado ve" on public.pedidos
  for select using (auth.role() = 'authenticated');
create policy "pedidos: cualquiera autenticado crea" on public.pedidos
  for insert with check (
    auth.role() = 'authenticated'
    and (pagado = false or canal in ('rappi','pedidos_ya'))
  );
create policy "pedidos: actualiza segun estado" on public.pedidos
  for update using (auth.role() = 'authenticated')
  with check (
    estado not in ('cobrado','anulado') or public.rol_actual() in ('admin','cajera')
  );

-- Nadie puede tocar "pagado" en una fila ya existente salvo admin/cajera
-- (evita que alguien se marque un pedido como cobrado sin pasar por caja).
create or replace function public.proteger_pagado()
returns trigger
language plpgsql
as $$
begin
  if new.pagado is distinct from old.pagado and public.rol_actual() not in ('admin','cajera') then
    raise exception 'Solo administración o caja puede cambiar el estado de pago.';
  end if;
  return new;
end;
$$;

create trigger trg_proteger_pagado
before update on public.pedidos
for each row execute function public.proteger_pagado();

-- pedido_items: mismo criterio que pedidos
create policy "items: cualquiera autenticado ve" on public.pedido_items
  for select using (auth.role() = 'authenticated');
create policy "items: cualquiera autenticado crea" on public.pedido_items
  for insert with check (auth.role() = 'authenticated');
create policy "items: anular o descontar solo admin/cajera" on public.pedido_items
  for update using (auth.role() = 'authenticated')
  with check (
    (anulado = false and descuento = 0) or public.rol_actual() in ('admin','cajera')
  );

-- turnos de caja: cajera ve y maneja el propio; admin ve y maneja todos
create policy "turnos: propio o admin" on public.turnos_caja
  for select using (usuario_id = auth.uid() or public.rol_actual() = 'admin');
create policy "turnos: cajera/admin abren" on public.turnos_caja
  for insert with check (
    public.rol_actual() in ('admin','cajera') and usuario_id = auth.uid()
  );
create policy "turnos: propio o admin cierra" on public.turnos_caja
  for update using (usuario_id = auth.uid() or public.rol_actual() = 'admin');

-- pagos: solo admin/cajera
create policy "pagos: admin/cajera ven" on public.pagos
  for select using (public.rol_actual() in ('admin','cajera'));
-- "plataforma" (Rappi/PedidosYa) puede insertarlo cualquier autenticado, porque
-- se registra solo al tomar el pedido, sin pasar por una mesera/cajera en Caja.
create policy "pagos: admin/cajera crean, o plataforma cualquiera" on public.pagos
  for insert with check (
    public.rol_actual() in ('admin','cajera') or medio = 'plataforma'
  );

-- cuentas corrientes: solo admin/cajera
create policy "cc: admin/cajera ven" on public.cuentas_corrientes
  for select using (public.rol_actual() in ('admin','cajera'));
create policy "cc: admin/cajera crean" on public.cuentas_corrientes
  for insert with check (public.rol_actual() in ('admin','cajera'));
create policy "cc: admin/cajera editan" on public.cuentas_corrientes
  for update using (public.rol_actual() in ('admin','cajera'));
create policy "cc movs: admin/cajera ven" on public.movimientos_cuenta_corriente
  for select using (public.rol_actual() in ('admin','cajera'));
create policy "cc movs: admin/cajera crean" on public.movimientos_cuenta_corriente
  for insert with check (public.rol_actual() in ('admin','cajera'));

-- auditoría: cualquiera autenticado puede dejar registro; solo admin lee
create policy "auditoria: cualquiera autenticado inserta" on public.auditoria
  for insert with check (auth.role() = 'authenticated');
create policy "auditoria: solo admin lee" on public.auditoria
  for select using (public.rol_actual() = 'admin');

-- stock (fase 2): visible para admin/cajera, editable solo por admin
create policy "insumos: admin/cajera ven" on public.insumos
  for select using (public.rol_actual() in ('admin','cajera'));
create policy "insumos: admin edita" on public.insumos
  for all using (public.rol_actual() = 'admin') with check (public.rol_actual() = 'admin');
create policy "recetas: admin/cajera ven" on public.recetas
  for select using (public.rol_actual() in ('admin','cajera'));
create policy "recetas: admin edita" on public.recetas
  for all using (public.rol_actual() = 'admin') with check (public.rol_actual() = 'admin');
create policy "mov stock: admin/cajera ven" on public.movimientos_stock
  for select using (public.rol_actual() in ('admin','cajera'));
create policy "mov stock: admin/cajera crean" on public.movimientos_stock
  for insert with check (public.rol_actual() in ('admin','cajera'));

-- ============================================================================
-- REALTIME (para que la pantalla de cocina se actualice sola)
-- ============================================================================
alter publication supabase_realtime add table public.pedidos;
alter publication supabase_realtime add table public.pedido_items;
alter publication supabase_realtime add table public.mesas;

-- ============================================================================
-- Fin del esquema. Seguí con seed.sql para cargar datos de ejemplo,
-- y con el paso "Crear tu primer usuario admin" del README.
-- ============================================================================
