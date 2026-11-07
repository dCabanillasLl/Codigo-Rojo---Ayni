import type { ErrorRequestHandler } from "express";
import { ZodError } from "zod";
import { AppError } from "../lib/http.js";

export const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  if (error instanceof AppError) { res.status(error.status).json({ error: { code: error.code, message: error.message } }); return; }
  if (error instanceof ZodError) {
    res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "Revisa los datos ingresados.", details: error.issues.map((issue) => ({ campo: issue.path.join("."), mensaje: issue.message })) } }); return;
  }
  const code = typeof error?.code === "string" ? error.code : "INTERNAL_ERROR";
  if (code === "ER_DUP_ENTRY") { res.status(409).json({ error: { code: "DUPLICATE", message: "Este registro ya existe. Revisa los datos e inténtalo nuevamente." } }); return; }
  if (["ER_NO_REFERENCED_ROW_2", "ER_CHECK_CONSTRAINT_VIOLATED", "WARN_DATA_TRUNCATED"].includes(code)) {
    res.status(400).json({ error: { code: "INVALID_DATA", message: "Los datos no cumplen las reglas del registro." } }); return;
  }
  if (error?.type === "entity.parse.failed") { res.status(400).json({ error: { code: "INVALID_JSON", message: "El contenido JSON no es válido." } }); return; }
  if (error?.type === "entity.too.large") { res.status(413).json({ error: { code: "BODY_TOO_LARGE", message: "El contenido supera el tamaño permitido." } }); return; }
  if (["ER_NO_SUCH_TABLE", "ER_BAD_FIELD_ERROR"].includes(code)) {
    res.status(503).json({ error: { code: "DATABASE_SCHEMA_REQUIRED", message: "La base de datos necesita la migración de AYNI." } }); return;
  }
  if (["ECONNREFUSED", "ETIMEDOUT", "ENOTFOUND", "ER_ACCESS_DENIED_ERROR", "ER_BAD_DB_ERROR", "PROTOCOL_CONNECTION_LOST", "CERT_HAS_EXPIRED", "UNABLE_TO_VERIFY_LEAF_SIGNATURE", "SELF_SIGNED_CERT_IN_CHAIN", "DEPTH_ZERO_SELF_SIGNED_CERT", "ERR_TLS_CERT_ALTNAME_INVALID", "ERR_TLS_CERT_SIGNATURE_ALGORITHM_UNSUPPORTED", "ERR_TLS_CERT_ALTNAME_INVALID"].includes(code)) {
    res.status(503).json({ error: { code: "DATABASE_UNAVAILABLE", message: "No se pudo conectar con la base de datos. Inténtalo más tarde." } }); return;
  }
  // Do not log SQL strings, parameters, passwords, tokens or personal data.
  console.error("AYNI request failed:", code);
  res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Ocurrió un error inesperado." } });
};
