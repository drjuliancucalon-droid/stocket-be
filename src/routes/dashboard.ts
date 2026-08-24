import { Hono } from 'hono';
import { Env, Vars } from '../db';
import { requireAuth } from '../middleware';

const dashboard = new Hono<{ Bindings: Env; Variables: Vars }>();
dashboard.use('*', requireAuth);

// GET /dashboard/metrics — métricas principales (corrige bug v1 que exponia /stats)
dashboard.get('/metrics', async (c) => {
  const orgId = c.get('orgId');
  const [totals, lowStock] = await c.env.DB.batch([
    c.env.DB.prepare(
      'SELECT COUNT(*) as total_products, SUM(quantity) as total_units, SUM(price * quantity) as inventory_value FROM products WHERE org_id = ?'
    ).bind(orgId),
    c.env.DB.prepare(
      'SELECT COUNT(*) as low_stock_count FROM products WHERE org_id = ? AND quantity <= 5'
    ).bind(orgId),
  ]);
  return c.json({ ...totals.results[0], ...lowStock.results[0] });
});

// GET /dashboard/top-products
dashboard.get('/top-products', async (c) => {
  const orgId = c.get('orgId');
  const rows = await c.env.DB.prepare(
    'SELECT p.id, p.name, p.quantity, p.price, COUNT(t.id) as tx_count FROM products p LEFT JOIN transactions t ON t.product_id = p.id WHERE p.org_id = ? GROUP BY p.id ORDER BY tx_count DESC LIMIT 5'
  ).bind(orgId).all();
  return c.json(rows.results);
});

// GET /dashboard/recent-transactions
dashboard.get('/recent-transactions', async (c) => {
  const orgId = c.get('orgId');
  const rows = await c.env.DB.prepare(
    'SELECT t.*, p.name as product_name, u.full_name as user_name FROM transactions t JOIN products p ON p.id = t.product_id JOIN users u ON u.id = t.user_id WHERE t.org_id = ? ORDER BY t.created_at DESC LIMIT 10'
  ).bind(orgId).all();
  return c.json(rows.results);
});

export default dashboard;
