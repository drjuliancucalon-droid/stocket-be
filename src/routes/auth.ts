import { Hono } from "hono";
import { hash, compare } from "bcryptjs";
import { signJwt } from "../auth";
import { requireAuth } from "../middleware";
import type { Env, Vars } from "../db";

const auth = new Hono<{ Bindings: Env; Variables: Vars }>();

type UserRow = {
  id: string;
  full_name: string;
  email: string;
  password_hash: string;
  organization_id: string | null;
  org_role: "admin" | "staff" | null;
  is_super_admin: number;
};

function toProfile(row: Omit<UserRow, "password_hash">, organizationName: string | null) {
  return {
    id: row.id,
    email: row.email,
    full_name: row.full_name,
    organization_id: row.organization_id,
    organization_name: organizationName,
    org_role: row.org_role,
    is_super_admin: !!row.is_super_admin,
  };
}

// POST /auth/register — crea un negocio nuevo y su primer usuario (admin de
// ese negocio), y devuelve una sesión ya iniciada. Unirse a un negocio
// EXISTENTE como staff es trabajo de la Fase 3 (invitar por correo) — hoy
// todo registro nuevo funda su propio negocio.
auth.post("/register", async (c) => {
  const body = await c.req
    .json<{ email?: string; password?: string; full_name?: string; organization_name?: string }>()
    .catch(() => null);
  if (!body?.email || !body?.password || !body?.full_name || !body?.organization_name) {
    return c.json({ detail: "email, password, full_name y organization_name son obligatorios" }, 400);
  }
  if (body.password.length < 6) {
    return c.json({ detail: "La contraseña debe tener al menos 6 caracteres" }, 400);
  }
  const email = body.email.toLowerCase().trim();

  const existing = await c.env.DB.prepare("SELECT id FROM users WHERE email = ?").bind(email).first();
  if (existing) return c.json({ detail: "Ese correo ya está registrado" }, 409);

  const orgId = crypto.randomUUID();
  const userId = crypto.randomUUID();
  const passwordHash = await hash(body.password, 10);

  await c.env.DB.batch([
    c.env.DB.prepare("INSERT INTO organizations (id, name, plan) VALUES (?, ?, 'free')").bind(
      orgId,
      body.organization_name.trim()
    ),
    c.env.DB.prepare(
      "INSERT INTO users (id, organization_id, full_name, email, password_hash, org_role, is_super_admin) VALUES (?, ?, ?, ?, ?, 'admin', 0)"
    ).bind(userId, orgId, body.full_name.trim(), email, passwordHash),
  ]);

  const token = await signJwt({ sub: userId, email, org_id: orgId, org_role: "admin", is_super_admin: false }, c.env.JWT_SECRET);
  const user = toProfile(
    { id: userId, full_name: body.full_name.trim(), email, organization_id: orgId, org_role: "admin", is_super_admin: 0 },
    body.organization_name.trim()
  );
  return c.json({ access_token: token, token_type: "bearer", user }, 201);
});

// POST /auth/login?email=...&password=... — el frontend manda las
// credenciales como query params (no como body), así se mantiene el
// contrato ya construido en orbit-inventory/src/lib/api.ts.
auth.post("/login", async (c) => {
  const email = (c.req.query("email") || "").toLowerCase().trim();
  const password = c.req.query("password") || "";
  if (!email || !password) {
    return c.json({ detail: "email y password son obligatorios" }, 400);
  }

  const row = await c.env.DB.prepare(
    "SELECT id, organization_id, full_name, email, password_hash, org_role, is_super_admin FROM users WHERE email = ?"
  ).bind(email).first<UserRow>();
  if (!row) return c.json({ detail: "Credenciales inválidas" }, 401);

  const valid = await compare(password, row.password_hash);
  if (!valid) return c.json({ detail: "Credenciales inválidas" }, 401);

  let organizationName: string | null = null;
  if (row.organization_id) {
    const org = await c.env.DB.prepare("SELECT name FROM organizations WHERE id = ?")
      .bind(row.organization_id)
      .first<{ name: string }>();
    organizationName = org?.name ?? null;
  }

  const token = await signJwt(
    { sub: row.id, email: row.email, org_id: row.organization_id, org_role: row.org_role, is_super_admin: !!row.is_super_admin },
    c.env.JWT_SECRET
  );
  return c.json({ access_token: token, token_type: "bearer", user: toProfile(row, organizationName) });
});

// GET /auth/me — perfil del usuario autenticado, con su negocio.
auth.get("/me", requireAuth, async (c) => {
  const row = await c.env.DB.prepare(
    "SELECT id, organization_id, full_name, email, org_role, is_super_admin FROM users WHERE id = ?"
  ).bind(c.get("userId")).first<Omit<UserRow, "password_hash">>();
  if (!row) return c.json({ detail: "Usuario no encontrado" }, 404);

  let organizationName: string | null = null;
  if (row.organization_id) {
    const org = await c.env.DB.prepare("SELECT name FROM organizations WHERE id = ?")
      .bind(row.organization_id)
      .first<{ name: string }>();
    organizationName = org?.name ?? null;
  }
  return c.json(toProfile(row, organizationName));
});

// POST /auth/logout — con JWT sin estado no hay nada que invalidar en el
// servidor; el frontend ya borra el token localmente. Existe solo para que
// esa llamada no falle.
auth.post("/logout", requireAuth, async (c) => {
  return c.json({ ok: true });
});

// POST /auth/bootstrap-admin — crea la ÚNICA cuenta de super admin de toda la
// plataforma. Protegida por un secreto de servidor (BOOTSTRAP_SECRET, nunca
// el mismo que JWT_SECRET) y se niega a correr una segunda vez.
auth.post("/bootstrap-admin", async (c) => {
  const header = c.req.header("X-Bootstrap-Secret") || "";
  if (!header || header !== c.env.BOOTSTRAP_SECRET) {
    return c.json({ detail: "No autorizado" }, 401);
  }
  const already = await c.env.DB.prepare("SELECT id FROM users WHERE is_super_admin = 1 LIMIT 1").first();
  if (already) return c.json({ detail: "Ya existe una cuenta de super admin" }, 409);

  const body = await c.req.json<{ email?: string; password?: string; full_name?: string }>().catch(() => null);
  if (!body?.email || !body?.password || !body?.full_name) {
    return c.json({ detail: "email, password y full_name son obligatorios" }, 400);
  }
  const email = body.email.toLowerCase().trim();
  const userId = crypto.randomUUID();
  const passwordHash = await hash(body.password, 10);

  await c.env.DB.prepare(
    "INSERT INTO users (id, organization_id, full_name, email, password_hash, org_role, is_super_admin) VALUES (?, NULL, ?, ?, ?, NULL, 1)"
  ).bind(userId, body.full_name.trim(), email, passwordHash).run();

  const token = await signJwt({ sub: userId, email, org_id: null, org_role: null, is_super_admin: true }, c.env.JWT_SECRET);
  const user = toProfile({ id: userId, full_name: body.full_name.trim(), email, organization_id: null, org_role: null, is_super_admin: 1 }, null);
  return c.json({ access_token: token, token_type: "bearer", user }, 201);
});

// GET /auth/users — lista los usuarios (staff) del propio negocio. Solo un
// admin de un negocio real puede verla (no aplica a super admins de plataforma,
// que no tienen organization_id).
auth.get("/users", requireAuth, async (c) => {
  const orgId = c.get("orgId");
  if (!orgId) return c.json({ detail: "No aplica para cuentas de plataforma" }, 403);
  if (c.get("orgRole") !== "admin") return c.json({ detail: "Solo un admin puede ver el equipo" }, 403);

  const { results } = await c.env.DB.prepare(
    "SELECT id, full_name, email, org_role FROM users WHERE organization_id = ? ORDER BY full_name"
  ).bind(orgId).all();
  return c.json({ users: results });
});

// POST /auth/users — crea un usuario nuevo DENTRO del mismo negocio del admin
// autenticado (a diferencia de /register, que siempre funda un negocio
// nuevo). Solo un admin de un negocio real puede crear usuarios así.
auth.post("/users", requireAuth, async (c) => {
  const orgId = c.get("orgId");
  if (!orgId) return c.json({ detail: "No aplica para cuentas de plataforma" }, 403);
  if (c.get("orgRole") !== "admin") return c.json({ detail: "Solo un admin puede crear usuarios" }, 403);

  const body = await c.req
    .json<{ email?: string; password?: string; full_name?: string; org_role?: string }>()
    .catch(() => null);
  if (!body?.email || !body?.password || !body?.full_name) {
    return c.json({ detail: "email, password y full_name son obligatorios" }, 400);
  }
  if (body.password.length < 6) {
    return c.json({ detail: "La contraseña debe tener al menos 6 caracteres" }, 400);
  }
  const role = body.org_role === "admin" ? "admin" : "staff";
  const email = body.email.toLowerCase().trim();

  const existing = await c.env.DB.prepare("SELECT id FROM users WHERE email = ?").bind(email).first();
  if (existing) return c.json({ detail: "Ese correo ya está registrado" }, 409);

  const userId = crypto.randomUUID();
  const passwordHash = await hash(body.password, 10);
  await c.env.DB.prepare(
    "INSERT INTO users (id, organization_id, full_name, email, password_hash, org_role, is_super_admin) VALUES (?, ?, ?, ?, ?, ?, 0)"
  ).bind(userId, orgId, body.full_name.trim(), email, passwordHash, role).run();

  return c.json({ id: userId, email, full_name: body.full_name.trim(), org_role: role }, 201);
});

export default auth;
