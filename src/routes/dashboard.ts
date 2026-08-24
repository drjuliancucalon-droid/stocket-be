import { Hono } from "hono";
import { requireAuth, orgScope } from "../middleware";
import type { Env, Vars } from "../db";

const dashboard = new Hono<{ Bindings: Env; Variables: Vars }>();
dashboard.use("*", requireAuth);

const LOW_STOCK_THRESHOLD = 10;

// GET /dashboard/metrics — estadísticas del negocio de quien consulta.
dashboard.get("/metrics", async (c) => {
  const scope = orgScope(c);

  const totals = await c.env.DB.prepare(
    `SELECT COUNT(*) as total_products,
            COALESCE(SUM(price * quantity), 0) as total_value,
            COALESCE(SUM(CASE WHEN quantity <= ${LOW_STOCK_THRESHOLD} THEN 1 ELSE 0 END), 0) as low_stock_products
     FROM products WHERE 1=1${scope.clause}`
  ).bind(...scope.binds).first<{ total_products: number; total_value: number; low_stock_products: number }>();

  const recentTx = await c.env.DB.prepare(
    `SELECT COUNT(*) as count FROM transactions
     WHERE created_at >= datetime('now', '-1 day')${scope.clause}`
  ).bind(...scope.binds).first<{ count: number }>();

  return c.json({
    total_products: totals?.total_products ?? 0,
    total_value: totals?.total_value ?? 0,
    recent_transactions: recentTx?.count ?? 0,
    low_stock_products: totals?.low_stock_products ?? 0,
  });
});

// GET /dashboard/top-products — productos con más movimientos.
dashboard.get("/top-products", async (c) => {
  const scope = orgScope(c);
  const clause = scope.clause.replace("organization_id", "t.organization_id");
  const { results } = await c.env.DB.prepare(
    `SELECT p.id, p.name, COUNT(t.id) as transactions
     FROM products p JOIN transactions t ON t.product_id = p.id
     WHERE 1=1${clause}
     GROUP BY p.id, p.name
     ORDER BY transactions DESC
     LIMIT 5`
  ).bind(...scope.binds).all();
  return c.json(results);
});

// GET /dashboard/recent-transactions — últimos movimientos para "Actividad reciente".
dashboard.get("/recent-transactions", async (c) => {
  const scope = orgScope(c);
  const clause = scope.clause.replace("organization_id", "t.organization_id");
  const { results } = await c.env.DB.prepare(
    `SELECT t.*, p.name as product_name
     FROM transactions t JOIN products p ON p.id = t.product_id
     WHERE 1=1${clause}
     ORDER BY t.created_at DESC
     LIMIT 5`
  ).bind(...scope.binds).all();
  return c.json(results);
});

export default dashboard;
