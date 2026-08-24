import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { Env, Vars } from './db';
import { authRoutes } from './routes/auth';
import { productRoutes } from './routes/products';
import { transactionRoutes } from './routes/transactions';
import { dashboardRoutes } from './routes/dashboard';

const app = new Hono<{ Bindings: Env; Variables: Vars }>();

app.use(
  '*',
  cors({
    origin: '*', // TODO producción: reemplazar por URL exacta de orbit-inventory en Pages
    allowHeaders: ['Content-Type', 'Authorization'],
    allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  })
);

app.route('/auth', authRoutes);
app.route('/products', productRoutes);
app.route('/transactions', transactionRoutes);
app.route('/dashboard', dashboardRoutes);

app.get('/', (c) => c.json({ status: 'ok', service: 'stocket-be', version: '2.0.0' }));

app.notFound((c) => c.json({ error: 'Not found' }, 404));
app.onError((err, c) => {
  console.error(err);
  return c.json({ error: 'Error interno del servidor' }, 500);
});

export default app;
