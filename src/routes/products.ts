import { Hono } from "hono";
import { requireAuth, orgScope } from "../middleware";
import type { Env, Vars } from "../db";

const products = new Hono<{ Bindings: Env; Variables: Vars }>();
products.use("*", requireAuth);

// GET /products?search=teclado — catálogo del negocio de quien consulta
// (o de todos los negocios si es super admin), con búsqueda opcional.
products.get("/", async (c) => {
  const search = c.req.query("search");
  const scope = orgScope(c);
  let query = "SELECT * FROM products WHERE 1=1" + scope.clause;
  const binds: unknown[] = [...scope.binds];
  if (search) {
    query += " AND (name LIKE ? OR description LIKE ?)";
    binds.push(`%${search}%`, `%${search}%`);
  }
  query += " ORDER BY created_at DESC";
  const { results } = await c.env.DB.prepare(query).bind(...binds).all();
  return c.json(results);
});

// POST /products — crea un producto dentro del negocio de quien lo crea.
products.post("/", async (c) => {
  if (!c.get("orgId")) return c.json({ detail: "Esta cuenta no pertenece a ningún negocio" }, 403);
  const body = await c.req
    .json<{ name?: string; description?: string; quantity?: number; price?: number }>()
    .catch(() => null);
  if (!body?.name || body.price === undefined || body.price === null) {
    return c.json({ detail: "name y price son obligatorios" }, 400);
  }
  const id = crypto.randomUUID();
  await c.env.DB.prepare(
    `INSERT INTO products (id, organization_id, name, description, price, quantity, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(id, c.get("orgId"), body.name, body.description ?? null, body.price, body.quantity ?? 0, c.get("userId"))
    .run();
  const created = await c.env.DB.prepare("SELECT * FROM products WHERE id = ?").bind(id).first();
  return c.json(created, 201);
});

// GET /products/:id — respeta el mismo aislamiento por negocio.
products.get("/:id", async (c) => {
  const scope = orgScope(c);
  const product = await c.env.DB.prepare(`SELECT * FROM products WHERE id = ?${scope.clause}`)
    .bind(c.req.param("id"), ...scope.binds)
    .first();
  if (!product) return c.json({ detail: "Producto no encontrado" }, 404);
  return c.json(product);
});

// PUT /products/:id — actualización parcial, solo dentro del propio negocio.
products.put("/:id", async (c) => {
  const id = c.req.param("id");
  const scope = orgScope(c);
  const existing = await c.env.DB.prepare(`SELECT id FROM products WHERE id = ?${scope.clause}`)
    .bind(id, ...scope.binds)
    .first();
  if (!existing) return c.json({ detail: "Producto no encontrado" }, 404);

  const body = await c.req.json<Record<string, unknown>>().catch(() => ({} as Record<string, unknown>));
  const editable = ["name", "description", "price", "quantity"] as const;
  const sets: string[] = [];
  const binds: unknown[] = [];
  for (const field of editable) {
    if (body[field] !== undefined) {
      sets.push(`${field} = ?`);
      binds.push(body[field]);
    }
  }
  if (!sets.length) return c.json({ detail: "No enviaste ningún campo para actualizar" }, 400);
  sets.push("updated_at = datetime('now')");
  binds.push(id);

  await c.env.DB.prepare(`UPDATE products SET ${sets.join(", ")} WHERE id = ?`).bind(...binds).run();
  const updated = await c.env.DB.prepare("SELECT * FROM products WHERE id = ?").bind(id).first();
  return c.json(updated);
});

// DELETE /products/:id
products.delete("/:id", async (c) => {
  const id = c.req.param("id");
  const scope = orgScope(c);
  const existing = await c.env.DB.prepare(`SELECT id FROM products WHERE id = ?${scope.clause}`)
    .bind(id, ...scope.binds)
    .first();
  if (!existing) return c.json({ detail: "Producto no encontrado" }, 404);
  try {
    await c.env.DB.prepare("DELETE FROM products WHERE id = ?").bind(id).run();
  } catch (err) {
    // El producto tiene transacciones asociadas (FOREIGN KEY) — no se puede
    // borrar sin perder ese historial.
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes("FOREIGN KEY")) {
      return c.json(
        { detail: "No puedes eliminar este producto: tiene transacciones registradas. Márcalo como inactivo en vez de borrarlo, o borra primero sus transacciones." },
        409
      );
    }
    throw err;
  }
  return c.json({ ok: true });
});

export default products;
