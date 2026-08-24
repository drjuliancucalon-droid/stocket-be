import { Hono } from 'hono';
import { hash, compare } from 'bcryptjs';
import type { Env, Vars } from '../db';
import { signJwt } from '../auth';
import { requireAuth } from '../middleware';

export const authRoutes = new Hono<{ Bindings: Env; Variables: Vars }>();

function authResponse(token: string, user: { id: string; full_name: string; email: string; role: string; org_id: string }) {
  return {
    access_token: token,
    token_type: 'bearer',
    user: { id: user.id, full_name: user.full_name, email: user.email, role: user.role, org_id: user.org_id },
  };
}

// POST /auth/register — crea usuario + organización propia
authRoutes.post('/register', async (c) => {
  const body = await c.req.json().catch(() => null);
  if (!body?.email || !body?.password || !body?.full_name || !body?.org_name) {
    return c.json({ detail: 'Campos requeridos: email, password, full_name, org_name' }, 400);
  }
  if (body.password.length < 6)
    return c.json({ detail: 'La contraseña debe tener al menos 6 caracteres' }, 400);

  const email = body.email.toLowerCase().trim();
  const existing = await c.env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(email).first();
  if (existing) return c.json({ detail: 'El correo ya está registrado' }, 409);

  const orgId = crypto.randomUUID();
  const userId = crypto.randomUUID();
  const passwordHash = await hash(body.password, 10);

  await c.env.DB.batch([
    c.env.DB.prepare('INSERT INTO organizations (id, name) VALUES (?, ?)')
      .bind(orgId, body.org_name.trim()),
    c.env.DB.prepare(
      'INSERT INTO users (id, organization_id, full_name, email, password_hash, role) VALUES (?, ?, ?, ?, ?, ?)'
    ).bind(userId, orgId, body.full_name.trim(), email, passwordHash, 'admin'),
  ]);

  const token = await signJwt(
    { sub: userId, email, org_id: orgId, org_role: 'admin', is_super_admin: false },
    c.env.JWT_SECRET
  );
  return c.json(authResponse(token, { id: userId, full_name: body.full_name, email, role: 'admin', org_id: orgId }), 201);
});

// POST /auth/login
authRoutes.post('/login', async (c) => {
  const email = (c.req.query('email') || '').toLowerCase().trim();
  const password = c.req.query('password') || '';
  if (!email || !password)
    return c.json({ detail: 'email y password son requeridos' }, 400);

  const user = await c.env.DB.prepare(
    'SELECT id, full_name, email, password_hash, role, organization_id FROM users WHERE email = ?'
  ).bind(email).first<{ id: string; full_name: string; email: string; password_hash: string; role: string; organization_id: string }>();

  if (!user) return c.json({ detail: 'Credenciales inválidas' }, 401);
  const valid = await compare(password, user.password_hash);
  if (!valid) return c.json({ detail: 'Credenciales inválidas' }, 401);

  const token = await signJwt(
    { sub: user.id, email: user.email, org_id: user.organization_id, org_role: user.role as 'admin' | 'member', is_super_admin: false },
    c.env.JWT_SECRET
  );
  return c.json(authResponse(token, { id: user.id, full_name: user.full_name, email: user.email, role: user.role, org_id: user.organization_id }));
});

// GET /auth/me
authRoutes.get('/me', requireAuth, async (c) => {
  const user = await c.env.DB.prepare(
    'SELECT id, full_name, email, role, organization_id, created_at FROM users WHERE id = ?'
  ).bind(c.get('userId')).first();
  if (!user) return c.json({ error: 'Usuario no encontrado' }, 404);
  return c.json(user);
});

// GET /auth/users — lista usuarios de la organización (solo admin)
authRoutes.get('/users', requireAuth, async (c) => {
  const orgId = c.get('orgId');
  const role = c.get('orgRole');
  if (role !== 'admin') return c.json({ error: 'Acceso restringido' }, 403);
  const { results } = await c.env.DB.prepare(
    'SELECT id, full_name, email, role, created_at FROM users WHERE organization_id = ? ORDER BY created_at DESC'
  ).bind(orgId).all();
  return c.json(results);
});
