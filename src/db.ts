// Forma de las variables de entorno / bindings que Cloudflare inyecta en el Worker.
// DB llega por el binding declarado en wrangler.toml ([[d1_databases]]).
// JWT_SECRET y BOOTSTRAP_SECRET se definen como secrets con `wrangler secret put`.
export type Env = {
  DB: D1Database;
  JWT_SECRET: string;
  BOOTSTRAP_SECRET: string;
};

export type Vars = {
  userId: string;
  userEmail: string;
  orgId: string | null;
  orgRole: "admin" | "staff" | null;
  isSuperAdmin: boolean;
};
