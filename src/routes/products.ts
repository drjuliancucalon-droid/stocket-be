import { Hono } from 'hono';
import type { Env, Vars } from '../db';
import { requireAuth } from '../middleware';

export const productRoutes = new Hono<{ Bindings: Env; Variables: Vars }>();
productRoutes.use('*', requireAuth);

// GET /products?search=
productRoutes.get('/', async (c) => {
  const orgId = c.get('orgId');
  const search = c.req.query('search')?.trim() ?? '';
  let query: string;
  let params: unknown[];
  if (search) {
    query = 'SELECT * FROM products WHERE organization_id = ? AND (name LIKE ? OR description LIKE ?) ORDER BY name';
    params = [orgId, `%${search}%`, `%${search}%`];
  } else {
    query = 'SELECT * FROM products WHERE organization_id = ? ORDER BY name';
    params = [orgId];
  }
  const stmt = c.env.DB.prepare(query);
  const { results } = await (params.length === 1
    ? stmt.bind(params[0])
    : stmt.bind(params[0], params[1], params[2])
  ).all();
  return c.json(results);
});

// POST /products
productRoutes.post('/', async (c) => {
  const body = await c.req.json().catch(() => null);
  if (!body?.name) return c.json({ detail: 'El campo name es requerido' }, 400);
  const id = crypto.randomUUID();
  const orgId = c.get('orgId');
  await c.env.DB.prepare(
    'INSERT INTO products (id, organization_id, name, description, price, quantity) VALUES (?, ?, ?, ?, ?, ?)'
  ).bind(id, orgId, body.name.trim(), body.description ?? '', Number(body.price ?? 0), Number(body.quantity ?? 0)).run();
  const product = await c.env.DB.prepare('SELECT * FROM products WHERE id = ?').bind(id).first();
  return c.json(product, 201);
});

// GET /products/:id
productRoutes.get('/:id', async (c) => {
  const orgId = c.get('orgId');
  const product = await c.env.DB.prepare(
    'SELECT * FROM products WHERE id = ? AND organization_id = ?'
  ).bind(c.req.param('id'), orgId).first();
  if (!product) return c.json({ error: 'Producto no encontrado' }, 404);
  return c.json(product);
});

// PUT /products/:id
productRoutes.put('/:id', async (c) => {
  const orgId = c.get('orgId');
  const existing = await c.env.DB.prepare(
    'SELECT id FROM products WHERE id = ? AND organization_id = ?'
  ).bind(c.req.param('id'), orgId).first();
  if (!existing) return c.json({ error: 'Producto no encontrado' }, 404);

  const body = await c.req.json().catch(() => null);
  if (!body) return c.json({ detail: 'Body inválido' }, 400);

  const editable = ['name', 'description', 'price', 'quantity'] as const;
  const sets: string[] = [];
  const binds: unknown[] = [];
  for (const field of editable) {
    if (body[field] !== undefined) {
      sets.push(`${field} = ?`);
      binds.push(body[field]);
    }
  }
  if (sets.length === 0) return c.json({ detail: 'Nada que actualizar' }, 400);

  sets.push("updated_at = datetime('now')");
  binds.push(c.req.param('id'), orgId);
  await c.env.DB.prepare(
    `UPDATE products SET ${sets.join(', ')} WHERE id = ? AND organization_id = ?`
  ).bind(...binds).run();

  const updated = await c.env.DB.prepare('SELECT * FROM products WHERE id = ?').bind(c.req.param('id')).first();
  return c.json(updated);
});

// DELETE /products/:id
productRoutes.delete('/:id', async (c) => {
  const orgId = c.get('orgId');
  const existing = await c.env.DB.prepare(
    'SELECT id FROM products WHERE id = ? AND organization_id = ?'
  ).bind(c.req.param('id'), orgId).first();
  if (!existing) return c.json({ error: 'Producto no encontrado' }, 404);
  try {
    await c.env.DB.prepare('DELETE FROM products WHERE id = ? AND organization_id = ?').bind(c.req.param('id'), orgId).run();
    return c.json({ message: 'Producto eliminado correctamente' });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes('FOREIGN KEY'))
      return c.json({ detail: 'No puedes eliminar este producto: tiene transacciones registradas.' }, 409);
    throw err;
  }
});

// POST /products/:id/transactions — registra movimiento y actualiza stock en batch atómico
productRoutes.post('/:id/transactions', async (c) => {
  const orgId = c.get('orgId');
  const userId = c.get('userId');
  const productId = c.req.param('id');

  const product = await c.env.DB.prepare(
    'SELECT * FROM products WHERE id = ? AND organization_id = ?'
  ).bind(productId, orgId).first<{ id: string; quantity: number; name: string }>();
  if (!product) return c.json({ error: 'Producto no encontrado' }, 404);

  const body = await c.req.json().catch(() => null);
  if (!body?.type || !body?.quantity)
    return c.json({ detail: 'Campos requeridos: type (IN|OUT), quantity' }, 400);
  if (!['IN', 'OUT'].includes(body.type))
    return c.json({ detail: 'type debe ser IN o OUT' }, 400);
  const qty = Number(body.quantity);
  if (!Number.isInteger(qty) || qty <= 0)
    return c.json({ detail: 'quantity debe ser un entero positivo' }, 400);
  if (body.type === 'OUT' && product.quantity < qty)
    return c.json({ detail: `Stock insuficiente. Disponible: ${product.quantity}` }, 422);

  const newQuantity = body.type === 'IN' ? product.quantity + qty : product.quantity - qty;
  const txId = crypto.randomUUID();

  // operación atómica: inserta la transacción Y actualiza el stock en el mismo batch
  await c.env.DB.batch([
    c.env.DB.prepare(
      'INSERT INTO transactions (id, organization_id, product_id, user_id, type, quantity, notes) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).bind(txId, orgId, productId, userId, body.type, qty, body.notes ?? null),
    c.env.DB.prepare(
      "UPDATE products SET quantity = ?, updated_at = datetime('now') WHERE id = ? AND organization_id = ?"
    ).bind(newQuantity, productId, orgId),
  ]);

  const tx = await c.env.DB.prepare('SELECT * FROM transactions WHERE id = ?').bind(txId).first();
  return c.json(tx, 201);
});
