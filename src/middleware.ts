import { MiddlewareHandler } from 'hono';
import { verifyJwt } from './auth';
import { Env, Vars } from './db';

export const requireAuth: MiddlewareHandler<{ Bindings: Env; Variables: Vars }> =
  async (c, next) => {
    const header = c.req.header('Authorization') || '';
    const token = header.startsWith('Bearer ') ? header.slice(7).trim() : null;
    if (!token) return c.json({ error: 'No autenticado: falta el token' }, 401);

    const payload = await verifyJwt(token, c.env.JWT_SECRET);
    if (!payload) return c.json({ error: 'Token inválido o expirado' }, 401);

    c.set('userId', payload.sub);
    c.set('userEmail', payload.email);
    c.set('orgId', payload.org_id ?? '');
    c.set('orgRole', payload.org_role ?? 'member');
    c.set('isSuperAdmin', payload.is_super_admin ?? false);
    await next();
  };

export const requireAdmin: MiddlewareHandler<{ Bindings: Env; Variables: Vars }> =
  async (c, next) => {
    const role = c.get('orgRole');
    const isSuperAdmin = c.get('isSuperAdmin');
    if (!isSuperAdmin && role !== 'owner' && role !== 'admin') {
      return c.json({ error: 'Acceso denegado: se requiere rol admin u owner' }, 403);
    }
    await next();
  };
