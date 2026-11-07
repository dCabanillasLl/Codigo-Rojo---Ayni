import type { CookieOptions, RequestHandler, Response } from "express";
import jwt from "jsonwebtoken";
import { config } from "../config.js";
import { one } from "../db/index.js";
import { AppError, asyncHandler } from "../lib/http.js";

declare global { namespace Express { interface Request { userId: string; } } }

export const sessionCookie = "ayni_session";
const cookieOptions: CookieOptions = { httpOnly: true, secure: config.cookieSecure, sameSite: "lax", path: "/api" };

export function setSession(res: Response, userId: string) {
  if (!config.jwtSecret) throw new AppError(503, "AUTH_NOT_CONFIGURED", "La autenticación todavía no está configurada.");
  const token = jwt.sign({}, config.jwtSecret, { subject: userId, issuer: "ayni-api", audience: "ayni-web", expiresIn: "8h", algorithm: "HS256" });
  res.cookie(sessionCookie, token, { ...cookieOptions, maxAge: 8 * 60 * 60 * 1000 });
}
export function clearSession(res: Response) { res.clearCookie(sessionCookie, cookieOptions); }

export const optionalAuth: RequestHandler = asyncHandler(async (req, _res, next) => {
  const token = req.cookies?.[sessionCookie];
  if (!token || typeof token !== "string" || !config.jwtSecret) { next(); return; }
  let userId: string | undefined;
  try {
    const payload = jwt.verify(token, config.jwtSecret, { algorithms: ["HS256"], issuer: "ayni-api", audience: "ayni-web" });
    if (typeof payload !== "string" && typeof payload.sub === "string" && /^[1-9]\d*$/.test(payload.sub)) userId = payload.sub;
  } catch { next(); return; }
  if (userId) {
    const user = await one<{ id: string }>("SELECT CAST(usuario_id AS CHAR) AS id FROM usuarios WHERE usuario_id = ? AND estado_cuenta = 'activo'", [userId]);
    if (user) req.userId = user.id;
  }
  next();
});

export const requireAuth: RequestHandler = (req, _res, next) => {
  if (!req.userId) { next(new AppError(401, "UNAUTHENTICATED", "Inicia sesión para continuar.")); return; }
  const expectedUser = req.get("X-AYNI-User");
  if (expectedUser && expectedUser !== req.userId) {
    next(new AppError(409, "SESSION_CHANGED", "La cuenta activa cambió. Abre de nuevo tu sesión antes de enviar el pedido.")); return;
  }
  next();
};
