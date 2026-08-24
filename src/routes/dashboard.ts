import { Hono } from 'hono';
import type { Env, Vars } from '../db';
import { requireAuth } from '../middleware';

export const dashboardRoutes = new Hono<{ Bindings: Env; Variables: Vars }>();
dashboardRoutes.use('*', requireAuth);

// GET /dashboard/metrics — KPIs principales
dashboardRoutes.get('/metrics', async (c) => {
  const orgId = c.get('orgId');
  const [totalProducts, lowStock, totalTx, inventoryValue] = await c.env.DB.batch([
    c.env.DB.prepare('SELECT COUNT(*) as count FROM products WHERE organization_id = ?').bind(orgId),
    c.env.DB.prepare('SELECT COUNT(*) as count FROM products WHERE organization_id = ? AND quantity <= 5').bind(orgId),
    c.env.DB.prepare('SELECT COUNT(*) as count FROM transactions WHERE organization_id = ?').bind(orgId),
    c.env.DB.prepare('SELECT COALESCE(SUM(price * quantity), 0) as total FROM products WHERE organization_id = ?').bind(orgId),
  ]);
  return c.json({
    total_products: (totalProducts.results[0] as { count: number }).count,
    low_stock_count: (lowStock.results[0] as { count: number }).count,
    total_transactions: (totalTx.results[0] as { count: number }).count,
    inventory_value: (inventoryValue.results[0] as { total: number }).total,
  });
});

// GET /dashboard/top-products — top 5 por movimientos
dashboardRoutes.get('/top-products', async (c) => {
  const orgId = c.get('orgId');
  const { results } = await c.env.DB.prepare(`
    SELECT p.id, p.name, p.quantity, p.price,
           COUNT(t.id) as transaction_count,
           COALESCE(SUM(CASE WHEN t.type='IN' THEN t.quantity ELSE 0 END), 0) as total_in,
           COALESCE(SUM(CASE WHEN t.type='OUT' THEN t.quantity ELSE 0 END), 0) as total_out
    FROM products p
    LEFT JOIN transactions t ON t.product_id = p.id AND t.organization_id = p.organization_id
    WHERE p.organization_id = ?
    GROUP BY p.id, p.name, p.quantity, p.price
    ORDER BY transaction_count DESC
    LIMIT 5
  `).bind(orgId).all();
  return c.json(results);
});

// GET /dashboard/recent-transactions — últimos 10 movimientos
dashboardRoutes.get('/recent-transactions', async (c) => {
  const orgId = c.get('orgId');
  const { results } = await c.env.DB.prepare(`
    SELECT t.id, t.type, t.quantity, t.notes, t.created_at,
           p.name as product_name,
           u.full_name as user_name
    FROM transactions t
    JOIN products p ON p.id = t.product_id
    JOIN users u ON u.id = t.user_id
    WHERE t.organization_id = ?
    ORDER BY t.created_at DESC
    LIMIT 10
  `).bind(orgId).all();
  return c.json(results);
});
