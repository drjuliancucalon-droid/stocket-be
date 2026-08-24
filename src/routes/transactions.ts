import { Hono } from "hono";
import { requireAuth, orgScope } from "../middleware";
import type { Env, Vars } from "../db";

const transactions = new Hono<{ Bindings: Env; Variables: Vars }>();
transactions.use("*", requireAuth);

// GET /transactions?product_id=... — historial de movimientos del negocio de
// quien consulta, más reciente primero.
transactions.get("/", async (c) => {
  const productId = c.req.query("product_id");
  const scope = orgScope(c);
  let query = `SELECT t.*, p.name as product_name
               FROM transactions t JOIN products p ON p.id = t.product_id
               WHERE 1=1${scope.clause.replace("organization_id", "t.organization_id")}`;
  const binds: unknown[] = [...scope.binds];
  if (productId) {
    query += " AND t.product_id = ?";
    binds.push(productId);
  }
  query += " ORDER BY t.created_at DESC LIMIT 200";
  const { results } = await c.env.DB.prepare(query).bind(...binds).all();
  return c.json(results);
});

// POST /transactions — registra una entrada (IN) o salida (OUT). El ajuste
// del stock lo hace el frontend con una llamada separada a
// PUT /products/:id (así ya está construido en orbit-inventory) — aquí solo
// se valida que no deje el stock en negativo y se guarda el movimiento.
transactions.post("/", async (c) => {
  if (!c.get("orgId") && !c.get("isSuperAdmin")) {
    return c.json({ detail: "Esta cuenta no pertenece a ningún negocio" }, 403);
  }
  const body = await c.req
    .json<{ product_id?: string; quantity_change?: number; type?: string }>()
    .catch(() => null);
  if (!body?.product_id || !body?.type || !["IN", "OUT"].includes(body.type) || !body.quantity_change) {
    return c.json({ detail: "product_id, type ('IN' | 'OUT') y quantity_change son obligatorios" }, 400);
  }

  const scope = orgScope(c);
  const product = await c.env.DB.prepare(`SELECT id, organization_id, quantity FROM products WHERE id = ?${scope.clause}`)
    .bind(body.product_id, ...scope.binds)
    .first<{ id: string; organization_id: string; quantity: number }>();
  if (!product) return c.json({ detail: "Producto no encontrado" }, 404);

  const resulting = product.quantity + body.quantity_change;
  if (resulting < 0) return c.json({ detail: "No hay suficiente stock para registrar esta salida" }, 400);

  const id = crypto.randomUUID();
  await c.env.DB.prepare(
    "INSERT INTO transactions (id, organization_id, product_id, type, quantity_change, created_by) VALUES (?, ?, ?, ?, ?, ?)"
  ).bind(id, product.organization_id, body.product_id, body.type, body.quantity_change, c.get("userId")).run();

  const created = await c.env.DB.prepare(
    `SELECT t.*, p.name as product_name FROM transactions t JOIN products p ON p.id = t.product_id WHERE t.id = ?`
  ).bind(id).first();
  return c.json(created, 201);
});

export default transactions;
