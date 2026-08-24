import type { MiddlewareHandler } from "hono";
import { verifyJwt } from "./auth";
import type { Env, Vars } from "./db";

// Protege una ruta: exige un header "Authorization: Bearer <token>" con un
// JWT válido y no expirado. Si pasa, deja el usuario Y su negocio disponibles
// en el contexto para los handlers: c.get("userId"), c.get("orgId"),
// c.get("orgRole"), c.get("isSuperAdmin").
export const requireAuth: MiddlewareHandler<{ Bindings: Env; Variables: Vars }> = async (c, next) => {
  const header = c.req.header("Authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : null;
  if (!token) return c.json({ detail: "No autenticado: falta el token" }, 401);

  const payload = await verifyJwt(token, c.env.JWT_SECRET);
  if (!payload) return c.json({ detail: "Token inválido o expirado" }, 401);

  c.set("userId", payload.sub);
  c.set("userEmail", payload.email);
  c.set("orgId", payload.org_id);
  c.set("orgRole", payload.org_role);
  c.set("isSuperAdmin", payload.is_super_admin);
  await next();
};

// Helper para las rutas de datos: agrega "AND organization_id = ?" a un WHERE
// existente, salvo que la cuenta sea super admin (esa sí ve todos los
// negocios a propósito — es la única excepción al aislamiento de datos).
export function orgScope(c: { get: (key: "orgId" | "isSuperAdmin") => unknown }): { clause: string; binds: unknown[] } {
  if (c.get("isSuperAdmin")) return { clause: "", binds: [] };
  return { clause: " AND organization_id = ?", binds: [c.get("orgId")] };
}
