import { Hono } from "hono";
import { cors } from "hono/cors";
import type { Env, Vars } from "./db";
import authRoutes from "./routes/auth";
import productRoutes from "./routes/products";
import transactionRoutes from "./routes/transactions";
import dashboardRoutes from "./routes/dashboard";

const app = new Hono<{ Bindings: Env; Variables: Vars }>();

app.use(
  "*",
  cors({
    origin: "*",
    allowHeaders: ["Content-Type", "Authorization", "X-Bootstrap-Secret"],
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  })
);

app.get("/", (c) => c.json({ message: "Stocket API (Cloudflare Workers + D1) — multi-cliente" }));

app.route("/auth", authRoutes);
app.route("/products", productRoutes);
app.route("/transactions", transactionRoutes);
app.route("/dashboard", dashboardRoutes);

app.notFound((c) => c.json({ detail: "No encontrado" }, 404));
app.onError((err, c) => {
  console.error(err);
  return c.json({ detail: "Error interno del servidor" }, 500);
});

export default app;
