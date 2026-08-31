-- Esquema de Orbit / Stocket (SQLite / Cloudflare D1) — multi-cliente desde el diseño.
--
-- Tres niveles de acceso:
--   - is_super_admin = 1  -> cuenta de plataforma, sin organization_id, ve todos los negocios
--   - org_role = 'admin'  -> dueño/administrador de UN negocio
--   - org_role = 'staff'  -> usuario de uso diario de ese mismo negocio
--
-- REGLA DE ORO: el campo 'quantity' en products es de solo lectura para el cliente.
-- El stock SOLO se modifica mediante INSERT en transactions (operación atómica).
-- PUT /products/:id NO permite cambiar quantity directamente.
--
-- IMPORTANTE — este archivo NO se aplica solo automáticamente al hacer deploy:
-- `wrangler deploy` publica el código, pero nunca ejecuta este esquema contra la
-- base D1 ya existente. CREATE TABLE IF NOT EXISTS no modifica una tabla que ya
-- existe, así que cualquier columna nueva agregada aquí requiere además correr
-- manualmente el ALTER TABLE correspondiente contra la base D1 en producción
-- (Cloudflare Dashboard → D1 → tu base → Consola). Ver migrations/ para el
-- historial de cambios de esquema que ya requirieron ese paso manual.

CREATE TABLE IF NOT EXISTS organizations (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  plan        TEXT NOT NULL DEFAULT 'free',
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS users (
  id              TEXT PRIMARY KEY,
  organization_id TEXT REFERENCES organizations(id),
  full_name       TEXT NOT NULL,
  email           TEXT NOT NULL UNIQUE,
  password_hash   TEXT NOT NULL,
  org_role        TEXT CHECK (org_role IN ('admin', 'staff')),
  is_super_admin  INTEGER NOT NULL DEFAULT 0,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS products (
  id              TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  name            TEXT NOT NULL,
  sku             TEXT,                          -- código interno o de barras (opcional)
  description     TEXT,
  price           REAL NOT NULL DEFAULT 0,
  cost_price      REAL DEFAULT 0,                -- costo de compra; base para margen/rentabilidad
  category        TEXT,                          -- categoría o etiqueta libre para filtrar
  quantity        INTEGER NOT NULL DEFAULT 0,   -- SOLO lectura para clientes; cambia via transactions
  min_stock       INTEGER NOT NULL DEFAULT 5,    -- umbral de stock bajo, específico por producto
  created_by      TEXT REFERENCES users(id),
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS transactions (
  id              TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  product_id      TEXT NOT NULL REFERENCES products(id),
  type            TEXT NOT NULL CHECK (type IN ('IN', 'OUT')),
  quantity_change INTEGER NOT NULL CHECK (quantity_change > 0),
  notes           TEXT,                          -- motivo del movimiento (auditoría)
  created_by      TEXT REFERENCES users(id),
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Índices de rendimiento
CREATE INDEX IF NOT EXISTS idx_users_org        ON users(organization_id);
CREATE INDEX IF NOT EXISTS idx_products_org     ON products(organization_id);
CREATE INDEX IF NOT EXISTS idx_products_name    ON products(name);
CREATE INDEX IF NOT EXISTS idx_products_sku     ON products(sku);
CREATE INDEX IF NOT EXISTS idx_transactions_org ON transactions(organization_id);
CREATE INDEX IF NOT EXISTS idx_transactions_product ON transactions(product_id);
CREATE INDEX IF NOT EXISTS idx_transactions_date    ON transactions(created_at);
