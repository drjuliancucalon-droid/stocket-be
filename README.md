# stocket-be v2 — Multi-tenant Inventory API

Backend de Orbit Inventory, reescrito en arquitectura **multi-tenant** sobre Cloudflare Workers + D1.
Cada organización ve únicamente sus propios productos y transacciones. El JWT incluye `org_id`, `org_role` e `is_super_admin`.

## Stack

- **Runtime**: Cloudflare Workers (V8, sin Node.js)
- **Framework**: [Hono](https://hono.dev) v4
- **Base de datos**: Cloudflare D1 (SQLite gestionado)
- **Auth**: JWT HS256 implementado con Web Crypto nativa
- **Hash**: bcryptjs (implementación JS pura, sin módulos nativos)
- **Costo**: 0 USD en plan gratuito de Cloudflare

## Diferencias con v1 (inventario-be)

| Aspecto | v1 | v2 (stocket-be) |
|---|---|---|
| Tenancy | Single-tenant | Multi-tenant por `org_id` |
| JWT payload | `{sub, email}` | `{sub, email, org_id, org_role, is_super_admin}` |
| Registro | Crea solo usuario | Crea usuario + organización (owner automático) |
| Dashboard | `/dashboard/stats` (bug FE) | `/dashboard/metrics`, `/top-products`, `/recent-transactions` |
| Stock update | 2 llamadas del FE (race condition) | `db.batch()` atómico en el BE |
| Roles | Sin roles | `owner`, `admin`, `member` + middleware `requireAdmin` |
| Tipo TX | `IN`, `OUT` | `IN`, `OUT`, `ADJUSTMENT` |

## Setup local

```bash
npm install
cp .dev.vars.example .dev.vars  # edita JWT_SECRET
npx wrangler d1 create stocket  # copia el database_id al wrangler.toml
npx wrangler d1 execute stocket --local --file=./schema.sql
npx wrangler dev
```

## Deploy

```bash
npx wrangler d1 execute stocket --remote --file=./schema.sql
npx wrangler secret put JWT_SECRET
npx wrangler deploy
```

## Endpoints

| Método | Ruta | Auth | Descripción |
|---|---|---|---|
| GET | /health | No | Estado del servicio |
| POST | /auth/register | No | Crea usuario + org, devuelve JWT |
| POST | /auth/login | No | Login, devuelve JWT |
| GET | /auth/me | Sí | Perfil + org del usuario |
| GET | /products | Sí | Lista productos de la org |
| POST | /products | Sí | Crea producto |
| GET | /products/:id | Sí | Detalle |
| PUT | /products/:id | Sí | Actualización parcial |
| DELETE | /products/:id | Sí | Elimina (falla si tiene transacciones) |
| POST | /products/:id/transactions | Sí | Movimiento atómico (actualiza stock en batch) |
| GET | /transactions | Sí | Historial (`?product_id=` opcional) |
| GET | /dashboard/metrics | Sí | KPIs principales |
| GET | /dashboard/top-products | Sí | Top 5 productos por movimiento |
| GET | /dashboard/recent-transactions | Sí | Últimas 10 transacciones |
| GET | /organizations/me | Sí | Info de la org |
| GET | /organizations/me/members | Sí | Miembros |
| POST | /organizations/me/members | Admin | Invitar usuario |
| DELETE | /organizations/me/members/:userId | Admin | Remover miembro |
