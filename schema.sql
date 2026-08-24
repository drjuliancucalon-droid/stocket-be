-- ============================================================
-- STOCKET v2 — Schema multi-tenant
-- ============================================================

PRAGMA foreign_keys = ON;

-- Organizaciones (tenants)
CREATE TABLE IF NOT EXISTS organizations (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  slug        TEXT NOT NULL UNIQUE,
  plan        TEXT NOT NULL DEFAULT 'free' CHECK (plan IN ('free','pro','enterprise')),
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Usuarios
CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,
  full_name     TEXT NOT NULL,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  is_super_admin INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Membresías usuario ↔ organización
CREATE TABLE IF NOT EXISTS org_members (
  id              TEXT PRIMARY KEY,
  org_id          TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role            TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner','admin','member')),
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(org_id, user_id)
);

-- Productos (scoped por organización)
CREATE TABLE IF NOT EXISTS products (
  id          TEXT PRIMARY KEY,
  org_id      TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  description TEXT,
  sku         TEXT,
  price       REAL NOT NULL DEFAULT 0,
  quantity    INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Transacciones (scoped por organización)
CREATE TABLE IF NOT EXISTS transactions (
  id          TEXT PRIMARY KEY,
  org_id      TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  product_id  TEXT NOT NULL REFERENCES products(id),
  user_id     TEXT NOT NULL REFERENCES users(id),
  type        TEXT NOT NULL CHECK (type IN ('IN','OUT','ADJUSTMENT')),
  quantity    INTEGER NOT NULL,
  notes       TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_products_org      ON products(org_id);
CREATE INDEX IF NOT EXISTS idx_transactions_org  ON transactions(org_id);
CREATE INDEX IF NOT EXISTS idx_transactions_prod ON transactions(product_id);
CREATE INDEX IF NOT EXISTS idx_org_members_user  ON org_members(user_id);
CREATE INDEX IF NOT EXISTS idx_org_members_org   ON org_members(org_id);
