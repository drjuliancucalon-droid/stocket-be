import { Hono } from 'hono';
import type { Env, Vars } from '../db';
import { requireAuth } from '../middleware';

export const transactionRoutes = new Hono<{ Bindings: Env; Variables: Vars }>();
transactionRoutes.use('*', requireAuth);

// GET /transactions?product_id=
transactionRoutes.get('/', async (c) => {
  const orgId = c.get('orgId');
  const productId = c.req.query('product_id');
  let query: string;
  let params: unknown[];

  if (productId) {
    query = `
      SELECT t.*, p.name as product_name, u.full_name as user_name
      FROM transactions t
      JOIN products p ON p.id = t.product_id
      JOIN users u ON u.id = t.user_id
      WHERE t.organization_id = ? AND t.product_id = ?
      ORDER BY t.created_at DESC LIMIT 200`;
    params = [orgId, productId];
  } else {
    query = `
      SELECT t.*, p.name as product_name, u.full_name as user_name
      FROM transactions t
      JOIN products p ON p.id = t.product_id
      JOIN users u ON u.id = t.user_id
      WHERE t.organization_id = ?
      ORDER BY t.created_at DESC LIMIT 200`;
    params = [orgId];
  }

  const { results } = await c.env.DB.prepare(query).bind(...params).all();
  return c.json(results);
});
