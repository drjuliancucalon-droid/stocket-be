import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { Env, Vars } from './db';
import authRoutes from './routes/auth';
import productRoutes from './routes/products';
import transactionRoutes from './routes/transactions';
import dashboardRoutes from './routes/dashboard';
import orgRoutes from './routes/organizations';

const app = new Hono<{ Bindings: Env; Variables: Vars }>();

app.use(
  '*',
  cors({
    origin: '*', // TODO producción: reemplazar por URL de orbit-inventory en Pages
    allowHeaders: ['Content-Type', 'Authorization'],
    allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  })
);

app.get('/health', (c) => c.json({ status: 'ok', version: '2.0.0', project: 'stocket-be' }));

app.route('/auth', authRoutes);
app.route('/products', productRoutes);
app.route('/transactions', transactionRoutes);
app.route('/dashboard', dashboardRoutes);
app.route('/organizations', orgRoutes);

app.notFound((c) => c.json({ error: 'Ruta no encontrada' }, 404));
app.onError((err, c) => {
  console.error('[stocket-be error]', err);
  return c.json({ error: 'Error interno del servidor' }, 500);
});

export default app;
