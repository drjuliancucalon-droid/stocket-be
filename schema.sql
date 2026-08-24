-- Esquema de Stocket (SQLite / Cloudflare D1) — multi-cliente desde el diseño.
--
-- Tres niveles de acceso:
--   - is_super_admin = 1  -> cuenta de plataforma, sin organization_id, ve todos los negocios
--   - org_role = 'admin'  -> dueño/administrador de UN negocio
--   - org_role = 'staff'  -> usuario de uso diario de ese mismo negocio

CREATE TABLE IF NOT EXISTS organizations (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  plan TEXT NOT NULL DEFAULT 'free',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  organization_id TEXT REFERENCES organizations(id),
  full_name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  org_role TEXT CHECK (org_role IN ('admin', 'staff')),
  is_super_admin INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  name TEXT NOT NULL,
  description TEXT,
  price REAL NOT NULL DEFAULT 0,
  quantity INTEGER NOT NULL DEFAULT 0,
  created_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS transactions (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  product_id TEXT NOT NULL REFERENCES products(id),
  type TEXT NOT NULL CHECK (type IN ('IN', 'OUT')),
  quantity_change INTEGER NOT NULL,
  created_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_users_org ON users(organization_id);
CREATE INDEX IF NOT EXISTS idx_products_org ON products(organization_id);
CREATE INDEX IF NOT EXISTS idx_products_name ON products(name);
CREATE INDEX IF NOT EXISTS idx_transactions_org ON transactions(organization_id);
CREATE INDEX IF NOT EXISTS idx_transactions_product ON transactions(product_id);
