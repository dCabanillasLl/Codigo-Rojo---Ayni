import type { RequestHandler } from "express";
import { AppError } from "../lib/http.js";

export const verifyExpectedUser: RequestHandler = (req, _res, next) => {
  const expected = req.get('X-AYNI-User');
  if (expected && expected !== req.userId) { next(new AppError(409, 'SESSION_CHANGED', 'La cuenta activa cambió. Actualiza tu sesión antes de continuar.')); return; }
  next();
};

export function protectMutations(origins: string[]): RequestHandler {
  return (req, _res, next) => {
    if (["GET", "HEAD", "OPTIONS"].includes(req.method)) { next(); return; }
    if (!req.headers.origin || !origins.includes(req.headers.origin)) {
      next(new AppError(403, "INVALID_ORIGIN", "El origen recibido por el backend no coincide con el origen autorizado.")); return;
    }
    if (req.get("X-AYNI-Client") !== "web") {
      next(new AppError(403, "CLIENT_HEADER_REQUIRED", "Falta el encabezado de seguridad de AYNI. Recarga la app con Ctrl+F5 e inténtalo otra vez.")); return;
    }
    if (!req.is("application/json")) {
      next(new AppError(415, "JSON_REQUIRED", "Envía el contenido en formato JSON.")); return;
    }
    next();
  };
}
