# Sistema de gestión del buffet — Fase 1 (MVP)

Pedidos (mostrador, mesas, teléfono/WhatsApp, Rappi manual), pantalla de cocina,
caja con apertura/cierre de turno y diferencia automática, y un panel de
administración para productos, mesas y usuarios.

No usa ningún framework ni paso de "build": son archivos HTML/CSS/JS que
cualquier hosting de páginas estáticas puede servir tal cual, y que corren
directo en el navegador. Esto es a propósito: así no hace falta instalar
Node, ni `npm install`, ni nada — se edita y se sube, así de simple.

## 1. Crear el proyecto en Supabase (gratis)

1. Entrá a [supabase.com](https://supabase.com), creá una cuenta y un proyecto nuevo.
2. Andá a **SQL Editor**, pegá todo el contenido de `supabase/schema.sql` y ejecutalo.
3. Repetí lo mismo con `supabase/seed.sql` (carga mesas y un menú de ejemplo — lo podés borrar o editar después desde la app).
4. Andá a **Authentication → Providers** y confirmá que "Email" esté habilitado (viene así por defecto).
5. Andá a **Settings → API** y copiá el **Project URL** y la clave **anon public**.
6. Desplegá la Edge Function `supabase/functions/crear-usuario` (con la CLI de Supabase: `supabase functions deploy crear-usuario`, o pegando su código en el dashboard). Es la que permite crear usuarios desde la propia app sin tocar nunca el dashboard de Supabase.

## 2. Configurar la app

Abrí `js/config.js` y completá:

```js
export const SUPABASE_URL = "https://tu-proyecto.supabase.co";
export const SUPABASE_ANON_KEY = "tu-clave-anon";
```

## 3. Probarla en tu computadora

No hace falta nada especial: cualquier "servidor de archivos estáticos" alcanza. Por ejemplo, con Python ya instalado:

```bash
cd buffet-app
python3 -m http.server 8080
```

Y abrís `http://localhost:8080` en el navegador. La primera vez, entrá a `setup.html` para crear la cuenta del dueño (email + contraseña, directo desde la app). Las próximas veces, entrás por `index.html` con ese email y contraseña.

(No abras el archivo `index.html` directo con doble clic — los navegadores bloquean los módulos de JavaScript cuando se abren como `file://`. Siempre tiene que servirse por http.)

## 4. Publicarla gratis en Cloudflare Pages

1. Entrá a [pages.cloudflare.com](https://pages.cloudflare.com) con una cuenta gratuita de Cloudflare.
2. "Create a project" → "Upload assets" (o conectalo a un repositorio de GitHub si preferís que quede versionado — recomendable a mediano plazo).
3. Subís la carpeta `buffet-app` completa (con `js/config.js` ya completado con tus datos reales).
4. Cloudflare te da una dirección gratis (`algo.pages.dev`). Si más adelante querés un dominio propio, se conecta desde ahí mismo.

No hay paso de build: es "subir y listo".

## 5. Uso del día a día

- **Mesas / pedidos**: mapa de mesas + accesos directos a mostrador, teléfono/WhatsApp y carga manual de Rappi.
- **Cocina**: se actualiza sola a medida que entran pedidos. Ideal dejarla abierta en una tablet o monitor en la cocina.
- **Caja**: cada cajera abre su turno con el efectivo inicial, cobra pedidos, y al cerrar cuenta el efectivo SIN mirar el sistema (conteo ciego) — recién ahí el sistema muestra si hay diferencia.
- **Administración** (solo admin): productos y precios, mesas, y alta/baja de usuarios y roles — el alta de usuarios crea el login (email + contraseña) directo desde ahí, sin pasar por Supabase.

## 6. Cómo se resuelve el wifi que se corta

Cada pantalla revisa la conexión todo el tiempo. Si se corta:

- Los pedidos nuevos se guardan en el propio dispositivo (no se pierden) y aparece un aviso de "sin conexión" arriba de la pantalla.
- Apenas vuelve la señal, se mandan solos a la base de datos — no hace falta hacer nada manualmente.
- Lo único que necesita conexión sí o sí es la pantalla de **cocina en tiempo real** y ver reportes actualizados de otros dispositivos.

## 7. Qué es Fase 1 y qué todavía falta (a propósito)

Ya construido:
- Pedidos multicanal, mesas, cocina en tiempo real, caja con diferencia automática, anulaciones/descuentos con motivo obligatorio y auditoría, ABM de productos/mesas/usuarios.

Preparado en la base de datos pero sin pantalla propia todavía (fases siguientes del plan):
- **Stock e insumos / recetas** (tablas `insumos`, `recetas`, `movimientos_stock` ya existen).
- **Reportes** (ventas por mozo/turno/producto) — hoy los datos ya están, falta la pantalla que los cruza y los muestra lindo.
- **Facturación con ARCA** — no conectado a propósito, según lo que charlamos.

## 8. Seguridad, en criollo

Las reglas de seguridad (quién puede ver o tocar qué) están en el propio
`schema.sql`, en la sección "Row Level Security". Es lo que impide, por
ejemplo, que una mesera pueda anular un cobro. Es un buen punto de partida,
pero antes de que el sistema maneje plata real de forma definitiva, vale la
pena que alguien con experiencia en Supabase les eche una revisión.

## 9. Nota sobre el registro `E403 npm` / por qué no hay `package.json`

Esta primera versión se armó sin depender de ningún paquete de npm a
propósito (la librería de Supabase se carga directo desde un CDN dentro del
propio HTML). Fue una decisión práctica para poder entregarles algo que
corre en cualquier lado sin instalar nada — y de paso, hace que hostearlo
gratis en Cloudflare Pages sea literalmente "arrastrar la carpeta y listo".
