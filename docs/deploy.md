# Guía de despliegue gratuito

## 1. Crear repo en GitHub

Crear un repositorio llamado `prode-mundial-2026` y subir este proyecto.

## 2. Crear base D1 en Cloudflare

Desde la carpeta `apps/api`:

```bash
npx wrangler login
npx wrangler d1 create prode_mundial_2026
```

Cloudflare devuelve un `database_id`. Copiarlo en `apps/api/wrangler.toml` donde dice:

```toml
database_id = "REEMPLAZAR_EN_CLOUDFLARE"
```

## 3. Migrar base remota

Desde la raíz del proyecto:

```bash
npm run db:migrate:remote
npm run db:seed:remote
```

## 4. Publicar API Worker

```bash
npm run deploy:api
```

Guardar la URL que devuelve Cloudflare. Ejemplo:

```txt
https://prode-mundial-2026-api.tu-subdominio.workers.dev
```

## 5. Configurar frontend

En Cloudflare Pages, crear proyecto conectado al repositorio GitHub.

Configuración:

- Framework preset: `Vite`
- Build command: `npm run build -w apps/web`
- Build output directory: `apps/web/dist`
- Root directory: `/`

Variable de entorno en Cloudflare Pages:

```txt
VITE_API_URL=https://URL_DEL_WORKER
```

## 6. Ajustar CORS en Worker

En Cloudflare Worker, configurar variable:

```txt
CORS_ORIGIN=https://URL_DE_CLOUDFLARE_PAGES
```

Luego volver a desplegar API:

```bash
npm run deploy:api
```

## 7. Cambiar contraseña admin

Entrar con:

- `admin@prode.local`
- `admin12345`

Luego se debe implementar pantalla de cambio de contraseña o cambiarla desde base. No abrir al público con esa contraseña.

## 8. Dominio

Usar el subdominio gratuito de Cloudflare Pages. No comprar dominio para mantener costo cero.
