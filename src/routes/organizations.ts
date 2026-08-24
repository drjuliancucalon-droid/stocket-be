import { Hono } from 'hono';
import { Env, Vars } from '../db';
import { requireAuth, requireAdmin } from '../middleware';

const orgs = new Hono<{ Bindings: Env; Variables: Vars }>();
orgs.use('*', requireAuth);

// GET /organizations/me — info de la organización del usuario
orgs.get('/me', async (c) => {
  const orgId = c.get('orgId');
  const org = await c.env.DB.prepare('SELECT * FROM organizations WHERE id = ?').bind(orgId).first();
  if (!org) return c.json({ error: 'Organización no encontrada' }, 404);
  return c.json(org);
});

// GET /organizations/me/members — listado de miembros
orgs.get('/me/members', async (c) => {
  const orgId = c.get('orgId');
  const rows = await c.env.DB.prepare(
    'SELECT u.id, u.full_name, u.email, m.role, m.created_at FROM org_members m JOIN users u ON u.id = m.user_id WHERE m.org_id = ? ORDER BY m.created_at ASC'
  ).bind(orgId).all();
  return c.json(rows.results);
});

// POST /organizations/me/members — invitar usuario existente
orgs.post('/me/members', requireAdmin, async (c) => {
  const orgId = c.get('orgId');
  const body = await c.req.json<{ email: string; role?: string }>().catch(() => null);
  if (!body?.email) return c.json({ error: 'email es requerido' }, 400);
  const role = body.role && ['admin', 'member'].includes(body.role) ? body.role : 'member';
  const user = await c.env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(body.email.toLowerCase()).first<{ id: string }>();
  if (!user) return c.json({ error: 'Usuario no encontrado — debe registrarse primero' }, 404);
  const existing = await c.env.DB.prepare('SELECT id FROM org_members WHERE org_id = ? AND user_id = ?').bind(orgId, user.id).first();
  if (existing) return c.json({ error: 'El usuario ya es miembro de esta organización' }, 409);
  const memberId = crypto.randomUUID();
  await c.env.DB.prepare('INSERT INTO org_members (id, org_id, user_id, role) VALUES (?, ?, ?, ?)').bind(memberId, orgId, user.id, role).run();
  return c.json({ success: true, member_id: memberId }, 201);
});

// DELETE /organizations/me/members/:userId — remover miembro
orgs.delete('/me/members/:userId', requireAdmin, async (c) => {
  const orgId = c.get('orgId');
  const targetId = c.req.param('userId');
  const member = await c.env.DB.prepare(
    'SELECT id, role FROM org_members WHERE org_id = ? AND user_id = ?'
  ).bind(orgId, targetId).first<{ id: string; role: string }>();
  if (!member) return c.json({ error: 'Miembro no encontrado' }, 404);
  if (member.role === 'owner') return c.json({ error: 'No puedes remover al owner de la organización' }, 403);
  await c.env.DB.prepare('DELETE FROM org_members WHERE id = ?').bind(member.id).run();
  return c.json({ success: true });
});

export default orgs;
