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

// POST /transactions — registra una entrada (IN) o salida (OUT) y actualiza
// el stock del producto en una operación atómica (D1 batch).
// El frontend NO debe hacer una segunda llamada a PUT /products/:id para
// actualizar la cantidad — eso ya ocurre aquí de forma transaccional.
transactions.post("/", async (c) => {
  if (!c.get("orgId") && !c.get("isSuperAdmin")) {
    return c.json({ detail: "Esta cuenta no pertenece a ningún negocio" }, 403);
  }

  const body = await c.req
    .json<{
      product_id?: string;
      quantity_change?: number;
      type?: string;
      notes?: string;
    }>()
    .catch(() => null);

  if (
    !body?.product_id ||
    !body?.type ||
    !["IN", "OUT"].includes(body.type) ||
    !body.quantity_change ||
    body.quantity_change <= 0
  ) {
    return c.json(
      {
        detail:
          "product_id, type ('IN' | 'OUT') y quantity_change (> 0) son obligatorios",
      },
      400
    );
  }

  const scope = orgScope(c);
  const product = await c.env.DB.prepare(
    `SELECT id, organization_id, quantity FROM products WHERE id = ?${scope.clause}`
  )
    .bind(body.product_id, ...scope.binds)
    .first<{ id: string; organization_id: string; quantity: number }>();

  if (!product) return c.json({ detail: "Producto no encontrado" }, 404);

  const delta =
    body.type === "IN" ? body.quantity_change : -body.quantity_change;
  const resulting = product.quantity + delta;

  if (resulting < 0) {
    return c.json(
      {
        detail: `Stock insuficiente. Disponible: ${product.quantity}, solicitado: ${body.quantity_change}`,
      },
      400
    );
  }

  const txId = crypto.randomUUID();

  // Operación atómica: insertar transacción + actualizar stock en un batch.
  // Si cualquiera de los dos pasos falla, D1 no aplica ninguno.
  await c.env.DB.batch([
    c.env.DB.prepare(
      `INSERT INTO transactions
         (id, organization_id, product_id, type, quantity_change, notes, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      txId,
      product.organization_id,
      body.product_id,
      body.type,
      body.quantity_change,
      body.notes ?? null,
      c.get("userId")
    ),
    c.env.DB.prepare(
      `UPDATE products
          SET quantity   = ?,
              updated_at = datetime('now')
        WHERE id = ?`
    ).bind(resulting, body.product_id),
  ]);

  const created = await c.env.DB.prepare(
    `SELECT t.*, p.name as product_name, p.quantity as stock_after
       FROM transactions t
       JOIN products p ON p.id = t.product_id
      WHERE t.id = ?`
  )
    .bind(txId)
    .first();

  return c.json(created, 201);
});

export default transactions;
