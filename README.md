# stocket-be

Backend multi-tenant para Orbit Inventory — Hono + Cloudflare Workers + D1.

## Stack

- **Runtime:** Cloudflare Workers (V8 isolates)
- **Framework:** Hono v4
- **Base de datos:** Cloudflare D1 (SQLite en el edge)
- **Auth:** JWT HS256 con Web Crypto API (sin dependencias externas)
- **Passwords:** bcryptjs (implementación 100% JS, compatible con Workers)

## Arquitectura Multi-Tenant

Cada organización tiene su propio espacio de datos aislado por `organization_id`.
El JWT incluye `org_id`, `org_role` e `is_super_admin` para control de acceso granular.

## Setup Local

```bash
npm install
cp .dev.vars.example .dev.vars   # agrega JWT_SECRET
npx wrangler d1 execute stocket --local --file=./schema.sql
npx wrangler dev
```

## Deploy

```bash
npx wrangler login
npx wrangler d1 create stocket
# pega el database_id en wrangler.toml
npx wrangler d1 execute stocket --remote --file=./schema.sql
npx wrangler secret put JWT_SECRET
npx wrangler deploy
```

## Endpoints

| Método | Ruta | Auth | Descripción |
|--------|------|------|-------------|
| POST | /auth/register | No | Crea usuario + organización, devuelve JWT |
| POST | /auth/login | No | Devuelve JWT con org_id y rol |
| GET | /auth/me | Sí | Perfil del usuario autenticado |
| GET | /auth/users | Sí (admin) | Lista usuarios de la organización |
| GET | /products | Sí | Lista productos de la org |
| POST | /products | Sí | Crea producto en la org |
| GET | /products/:id | Sí | Detalle de producto |
| PUT | /products/:id | Sí | Actualiza producto |
| DELETE | /products/:id | Sí | Elimina producto |
| POST | /products/:id/transactions | Sí | Registra movimiento de stock |
| GET | /transactions | Sí | Historial de movimientos |
| GET | /dashboard/metrics | Sí | KPIs del panel |
| GET | /dashboard/top-products | Sí | Top productos por movimiento |
| GET | /dashboard/recent-transactions | Sí | Últimos movimientos |

## Variables de Entorno

| Variable | Descripción |
|----------|-------------|
| `JWT_SECRET` | Clave secreta para firmar JWT (usar `wrangler secret put`) |

## Relacionado

- Frontend: [orbit-inventory](https://github.com/drjuliancucalon-droid/orbit-inventory)
