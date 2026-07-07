# Prode Mundial 2026

App web gratuita para jugar un prode del Mundial 2026.

## Stack

- Frontend: React + Vite + TypeScript + Tailwind CSS.
- Backend/API: Cloudflare Workers + Hono.
- Base de datos: Cloudflare D1 SQLite.
- Hosting frontend: Cloudflare Pages.
- Repositorio: GitHub.

## Estructura

```txt
prode-mundial-2026/
├─ apps/
│  ├─ api/          # Cloudflare Worker + Hono
│  └─ web/          # React + Vite
├─ database/
│  └─ seed.sql      # Datos iniciales
└─ docs/
   └─ deploy.md     # Guía de despliegue
```

## Requisitos locales

- Node.js 20 o superior.
- Cuenta gratuita de Cloudflare para deploy.
- Cuenta de GitHub para conectar el repositorio.

## Instalación local

```bash
npm install
```

Crear archivo de entorno para el frontend:

```bash
cp apps/web/.env.example apps/web/.env
```

Variables disponibles para `apps/web/.env`:

```txt
VITE_API_URL=http://localhost:8787
VITE_DONATION_URL=https://www.mercadopago.com.ar/...
```

`VITE_DONATION_URL` es opcional. Si queda vacío, no se muestra el bloque ni el link de donación.

Aplicar migraciones locales:

```bash
npm run db:migrate:local
```

Cargar seed local:

```bash
npm run db:seed:local
```

Levantar API:

```bash
npm run dev:api
```

En otra terminal, levantar frontend:

```bash
npm run dev:web
```

URLs locales:

- Frontend: `http://localhost:5173`
- API: `http://localhost:8787`

## Usuario admin inicial

- Email: `admin@prode.local`
- Contraseña: `admin12345`

Cambiar la contraseña antes de abrir la app al público.

## Scripts principales

```bash
npm run typecheck
npm run build
npm run db:migrate:local
npm run db:seed:local
npm run db:migrate:remote
npm run db:seed:remote
npm run deploy:api
npm run deploy:web
```

## Estado actual

Incluye MVP base:

- Registro/login/logout.
- Sesión por cookie HTTP-only.
- Fixture editable desde base/admin.
- Carga de pronósticos.
- Bloqueo backend cuando el partido empezó.
- Carga admin de resultados.
- Recalculo de puntos.
- Ranking público.
- Reglas configurables.
- Panel admin básico.
- Botón opcional para donaciones por Mercado Pago.

## Nota sobre fixture

El seed inicial trae placeholders editables para los 104 partidos. Esto evita depender de APIs pagas o scraping. Cuando se confirme/cierre el fixture final, se reemplaza `database/seed.sql` por el seed real versionado.
