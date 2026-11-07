import type { RequestHandler } from "express";
import { AppError } from "../lib/http.js";

export function protectMutations(origins: string[]): RequestHandler {
  return (req, _res, next) => {
    if (["GET", "HEAD", "OPTIONS"].includes(req.method)) { next(); return; }
    if (!req.headers.origin || !origins.includes(req.headers.origin) || req.get("X-AYNI-Client") !== "web") {
      next(new AppError(403, "INVALID_ORIGIN", "La solicitud no procede de la aplicación autorizada.")); return;
    }
    if (!req.is("application/json")) {
      next(new AppError(415, "JSON_REQUIRED", "Envía el contenido en formato JSON.")); return;
    }
    next();
  };
}
