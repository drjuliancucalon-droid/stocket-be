-- ============================================================
-- Orbit Inventory — stocket-be schema
-- Multi-tenant: todos los datos están aislados por organization_id
-- ============================================================

CREATE TABLE IF NOT EXISTS organizations (
  id           TEXT PRIMARY KEY,
  name         TEXT NOT NULL,
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS users (
  id              TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  full_name       TEXT NOT NULL,
  email           TEXT NOT NULL UNIQUE,
  password_hash   TEXT NOT NULL,
  role            TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('admin','member')),
  is_super_admin  INTEGER NOT NULL DEFAULT 0,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS products (
  id              TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  name            TEXT NOT NULL,
  description     TEXT,
  price           REAL NOT NULL DEFAULT 0,
  quantity        INTEGER NOT NULL DEFAULT 0,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS transactions (
  id              TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  product_id      TEXT NOT NULL REFERENCES products(id),
  user_id         TEXT NOT NULL REFERENCES users(id),
  type            TEXT NOT NULL CHECK (type IN ('IN','OUT')),
  quantity        INTEGER NOT NULL CHECK (quantity > 0),
  notes           TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Índices para queries frecuentes
CREATE INDEX IF NOT EXISTS idx_users_org        ON users(organization_id);
CREATE INDEX IF NOT EXISTS idx_users_email      ON users(email);
CREATE INDEX IF NOT EXISTS idx_products_org     ON products(organization_id);
CREATE INDEX IF NOT EXISTS idx_products_name    ON products(organization_id, name);
CREATE INDEX IF NOT EXISTS idx_transactions_org ON transactions(organization_id);
CREATE INDEX IF NOT EXISTS idx_transactions_product ON transactions(product_id);
CREATE INDEX IF NOT EXISTS idx_transactions_date    ON transactions(organization_id, created_at DESC);
