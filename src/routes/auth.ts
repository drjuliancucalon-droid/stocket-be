import { Hono } from 'hono';
import { hash, compare } from 'bcryptjs';
import { signJwt } from '../auth';
import { Env, Vars } from '../db';
import { requireAuth } from '../middleware';

const auth = new Hono<{ Bindings: Env; Variables: Vars }>();

// POST /auth/register — crea usuario + organización propia automáticamente
auth.post('/register', async (c) => {
  const body = await c.req.json<{ email: string; password: string; full_name: string; org_name?: string }>().catch(() => null);
  if (!body?.email || !body?.password || !body?.full_name)
    return c.json({ error: 'email, password y full_name son requeridos' }, 400);
  if (body.password.length < 6)
    return c.json({ error: 'La contraseña debe tener al menos 6 caracteres' }, 400);

  const email = body.email.toLowerCase().trim();
  const existing = await c.env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(email).first();
  if (existing) return c.json({ error: 'El correo ya está registrado' }, 409);

  const userId = crypto.randomUUID();
  const orgId = crypto.randomUUID();
  const memberId = crypto.randomUUID();
  const passwordHash = await hash(body.password, 10);
  const orgName = body.org_name ?? `Org de ${body.full_name}`;
  const slug = orgName.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '') + '-' + orgId.slice(0, 6);

  await c.env.DB.batch([
    c.env.DB.prepare('INSERT INTO users (id, full_name, email, password_hash) VALUES (?, ?, ?, ?)')
      .bind(userId, body.full_name, email, passwordHash),
    c.env.DB.prepare('INSERT INTO organizations (id, name, slug) VALUES (?, ?, ?)')
      .bind(orgId, orgName, slug),
    c.env.DB.prepare('INSERT INTO org_members (id, org_id, user_id, role) VALUES (?, ?, ?, ?)')
      .bind(memberId, orgId, userId, 'owner'),
  ]);

  const token = await signJwt(
    { sub: userId, email, org_id: orgId, org_role: 'owner', is_super_admin: false },
    c.env.JWT_SECRET
  );

  return c.json({
    access_token: token,
    token_type: 'bearer',
    user: { id: userId, email, full_name: body.full_name, org_id: orgId, org_role: 'owner' },
  }, 201);
});

// POST /auth/login
auth.post('/login', async (c) => {
  const email = (c.req.query('email') || '').toLowerCase().trim();
  const password = c.req.query('password') || '';
  if (!email || !password) return c.json({ detail: 'email y password son requeridos' }, 400);

  const user = await c.env.DB.prepare(
    'SELECT u.id, u.email, u.full_name, u.password_hash, u.is_super_admin, m.org_id, m.role FROM users u LEFT JOIN org_members m ON m.user_id = u.id ORDER BY m.created_at ASC LIMIT 1'
  ).bind().first<{ id: string; email: string; full_name: string; password_hash: string; is_super_admin: number; org_id: string; role: string }>();

  // timing-safe: siempre ejecuta compare aunque el usuario no exista
  const dummyHash = '$2a$10$abcdefghijklmnopqrstuuABC123456789012345678901234567890';
  const valid = user ? await compare(password, user.password_hash) : await compare(password, dummyHash).then(() => false);

  if (!user || !valid) return c.json({ detail: 'Credenciales inválidas' }, 401);

  const token = await signJwt(
    {
      sub: user.id,
      email: user.email,
      org_id: user.org_id,
      org_role: user.role,
      is_super_admin: user.is_super_admin === 1,
    },
    c.env.JWT_SECRET
  );

  return c.json({
    access_token: token,
    token_type: 'bearer',
    user: { id: user.id, email: user.email, full_name: user.full_name, org_id: user.org_id, org_role: user.role },
  });
});

// GET /auth/me
auth.get('/me', requireAuth, async (c) => {
  const userId = c.get('userId');
  const user = await c.env.DB.prepare(
    'SELECT u.id, u.email, u.full_name, u.created_at, m.org_id, m.role, o.name as org_name FROM users u LEFT JOIN org_members m ON m.user_id = u.id LEFT JOIN organizations o ON o.id = m.org_id WHERE u.id = ?'
  ).bind(userId).first();
  if (!user) return c.json({ error: 'Usuario no encontrado' }, 404);
  return c.json(user);
});

export default auth;
