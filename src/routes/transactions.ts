import { Hono } from 'hono';
import { Env, Vars } from '../db';
import { requireAuth } from '../middleware';

const transactions = new Hono<{ Bindings: Env; Variables: Vars }>();
transactions.use('*', requireAuth);

// POST /products/:id/transactions — registra movimiento Y actualiza stock atómicamente
transactions.post('/products/:id/transactions', async (c) => {
  const orgId = c.get('orgId');
  const userId = c.get('userId');
  const productId = c.req.param('id');
  const body = await c.req.json<{ type: 'IN' | 'OUT' | 'ADJUSTMENT'; quantity: number; notes?: string }>().catch(() => null);
  if (!body?.type || body?.quantity === undefined) return c.json({ error: 'type y quantity son requeridos' }, 400);
  if (!['IN', 'OUT', 'ADJUSTMENT'].includes(body.type)) return c.json({ error: 'type debe ser IN, OUT o ADJUSTMENT' }, 400);
  if (!Number.isInteger(body.quantity) || body.quantity <= 0) return c.json({ error: 'quantity debe ser entero positivo' }, 400);

  const product = await c.env.DB.prepare(
    'SELECT id, quantity FROM products WHERE id = ? AND org_id = ?'
  ).bind(productId, orgId).first<{ id: string; quantity: number }>();
  if (!product) return c.json({ error: 'Producto no encontrado' }, 404);

  if (body.type === 'OUT' && product.quantity < body.quantity)
    return c.json({ error: 'Stock insuficiente' }, 400);

  const txId = crypto.randomUUID();
  const delta = body.type === 'OUT' ? -body.quantity : body.quantity;

  // batch atómico: inserta transacción + actualiza stock en una sola operación D1
  await c.env.DB.batch([
    c.env.DB.prepare(
      'INSERT INTO transactions (id, org_id, product_id, user_id, type, quantity, notes) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).bind(txId, orgId, productId, userId, body.type, body.quantity, body.notes ?? null),
    c.env.DB.prepare(
      "UPDATE products SET quantity = quantity + ?, updated_at = datetime('now') WHERE id = ? AND org_id = ?"
    ).bind(delta, productId, orgId),
  ]);

  const tx = await c.env.DB.prepare('SELECT * FROM transactions WHERE id = ?').bind(txId).first();
  return c.json(tx, 201);
});

// GET /transactions?product_id=
transactions.get('/', async (c) => {
  const orgId = c.get('orgId');
  const productId = c.req.query('product_id');
  let rows;
  if (productId) {
    rows = await c.env.DB.prepare(
      'SELECT t.*, p.name as product_name FROM transactions t JOIN products p ON p.id = t.product_id WHERE t.org_id = ? AND t.product_id = ? ORDER BY t.created_at DESC LIMIT 100'
    ).bind(orgId, productId).all();
  } else {
    rows = await c.env.DB.prepare(
      'SELECT t.*, p.name as product_name FROM transactions t JOIN products p ON p.id = t.product_id WHERE t.org_id = ? ORDER BY t.created_at DESC LIMIT 100'
    ).bind(orgId).all();
  }
  return c.json(rows.results);
});

export default transactions;
