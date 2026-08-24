import { Hono } from 'hono';
import { Env, Vars } from '../db';
import { requireAuth } from '../middleware';

const products = new Hono<{ Bindings: Env; Variables: Vars }>();
products.use('*', requireAuth);

// GET /products?search=
products.get('/', async (c) => {
  const orgId = c.get('orgId');
  const search = (c.req.query('search') || '').trim();
  let rows;
  if (search) {
    rows = await c.env.DB.prepare(
      "SELECT * FROM products WHERE org_id = ? AND (name LIKE ? OR description LIKE ?) ORDER BY name"
    ).bind(orgId, `%${search}%`, `%${search}%`).all();
  } else {
    rows = await c.env.DB.prepare(
      'SELECT * FROM products WHERE org_id = ? ORDER BY name'
    ).bind(orgId).all();
  }
  return c.json(rows.results);
});

// POST /products
products.post('/', async (c) => {
  const orgId = c.get('orgId');
  const body = await c.req.json<{ name: string; description?: string; sku?: string; price?: number; quantity?: number }>().catch(() => null);
  if (!body?.name) return c.json({ error: 'name es requerido' }, 400);
  const id = crypto.randomUUID();
  await c.env.DB.prepare(
    'INSERT INTO products (id, org_id, name, description, sku, price, quantity) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).bind(id, orgId, body.name, body.description ?? null, body.sku ?? null, body.price ?? 0, body.quantity ?? 0).run();
  const product = await c.env.DB.prepare('SELECT * FROM products WHERE id = ?').bind(id).first();
  return c.json(product, 201);
});

// GET /products/:id
products.get('/:id', async (c) => {
  const orgId = c.get('orgId');
  const product = await c.env.DB.prepare(
    'SELECT * FROM products WHERE id = ? AND org_id = ?'
  ).bind(c.req.param('id'), orgId).first();
  if (!product) return c.json({ error: 'Producto no encontrado' }, 404);
  return c.json(product);
});

// PUT /products/:id — actualización parcial
products.put('/:id', async (c) => {
  const orgId = c.get('orgId');
  const body = await c.req.json<Record<string, unknown>>().catch(() => null);
  if (!body) return c.json({ error: 'Body inválido' }, 400);
  const existing = await c.env.DB.prepare(
    'SELECT id FROM products WHERE id = ? AND org_id = ?'
  ).bind(c.req.param('id'), orgId).first();
  if (!existing) return c.json({ error: 'Producto no encontrado' }, 404);
  const editable = ['name', 'description', 'price', 'quantity', 'sku'] as const;
  const sets: string[] = [];
  const binds: unknown[] = [];
  for (const field of editable) {
    if (body[field] !== undefined) { sets.push(`${field} = ?`); binds.push(body[field]); }
  }
  if (sets.length === 0) return c.json({ error: 'Sin campos para actualizar' }, 400);
  sets.push("updated_at = datetime('now')");
  binds.push(c.req.param('id'), orgId);
  await c.env.DB.prepare(
    `UPDATE products SET ${sets.join(', ')} WHERE id = ? AND org_id = ?`
  ).bind(...binds).run();
  const updated = await c.env.DB.prepare('SELECT * FROM products WHERE id = ?').bind(c.req.param('id')).first();
  return c.json(updated);
});

// DELETE /products/:id
products.delete('/:id', async (c) => {
  const orgId = c.get('orgId');
  const existing = await c.env.DB.prepare(
    'SELECT id FROM products WHERE id = ? AND org_id = ?'
  ).bind(c.req.param('id'), orgId).first();
  if (!existing) return c.json({ error: 'Producto no encontrado' }, 404);
  try {
    await c.env.DB.prepare('DELETE FROM products WHERE id = ? AND org_id = ?').bind(c.req.param('id'), orgId).run();
    return c.json({ success: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('FOREIGN KEY'))
      return c.json({ error: 'No puedes eliminar este producto: tiene transacciones registradas.' }, 409);
    throw err;
  }
});

export default products;
