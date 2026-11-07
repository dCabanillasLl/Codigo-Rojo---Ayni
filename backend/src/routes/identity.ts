import { Router } from "express";
import rateLimit from "express-rate-limit";
import jwt from "jsonwebtoken";
import { createHmac } from "node:crypto";
import { z } from "zod";
import { config } from "../config.js";
import { AppError, asyncHandler } from "../lib/http.js";

const router = Router();
const lookupLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 8, standardHeaders: "draft-7", legacyHeaders: false,
  message: { error: { code: "RATE_LIMITED", message: "Has consultado demasiados DNI. Espera unos minutos." } } });

router.post("/identity/dni/lookup", lookupLimiter, asyncHandler(async (req, res) => {
  const { dni, consentimiento } = z.object({ dni: z.string().regex(/^\d{8}$/), consentimiento: z.literal(true) }).strict().parse(req.body);
  if (!config.apiPeruKey) throw new AppError(503, "DNI_LOOKUP_NOT_CONFIGURED", "La consulta de DNI no está configurada. Añade la clave de API Perú al backend.");
  if (!config.jwtSecret || !config.dniHashSecret) throw new AppError(503, "DNI_LOOKUP_NOT_CONFIGURED", "La autenticación segura de DNI no está configurada.");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  let response: Response;
  try {
    response = await fetch(`https://dniruc.apisperu.com/api/v1/dni/${dni}`, {
      method: "GET", signal: controller.signal,
      headers: { Authorization: `Bearer ${config.apiPeruKey}`, Accept: "application/json" },
    });
  } catch {
    throw new AppError(502, "DNI_PROVIDER_UNAVAILABLE", "No pudimos consultar el servicio de DNI. Inténtalo más tarde.");
  } finally { clearTimeout(timeout); }
  if (!response.ok) {
    if (response.status === 401 || response.status === 403) throw new AppError(503, "DNI_PROVIDER_AUTH_FAILED", "La clave de API Perú no fue aceptada. Revisa la configuración del backend.");
    if (response.status === 404) throw new AppError(404, "DNI_NOT_FOUND", "No encontramos datos para ese DNI. Revísalo e inténtalo de nuevo.");
    throw new AppError(502, "DNI_PROVIDER_ERROR", "El servicio de consulta de DNI respondió con un error.");
  }
  let payload: unknown;
  try { payload = await response.json(); } catch { throw new AppError(502, "DNI_PROVIDER_ERROR", "El servicio de consulta de DNI devolvió una respuesta inválida."); }
  const root = payload as Record<string, unknown> | null;
  const data = root?.data && typeof root.data === "object" ? root.data as Record<string, unknown> : root;
  const nombres = typeof data?.nombres === "string" ? data.nombres.trim() : "";
  const apellidos = [data?.apellidoPaterno, data?.apellidoMaterno].filter((value): value is string => typeof value === "string" && value.trim().length > 0).map((value) => value.trim()).join(" ");
  if (nombres.length < 2 || apellidos.length < 2 || nombres.length > 80 || apellidos.length > 100) throw new AppError(502, "DNI_PROVIDER_ERROR", "No pudimos validar los datos recibidos. Inténtalo más tarde.");
  const dniHash = createHmac("sha256", config.dniHashSecret).update(dni).digest("hex");
  const proof = jwt.sign({ dniHash, nombres, apellidos }, config.jwtSecret, { algorithm: "HS256", issuer: "ayni-api", audience: "ayni-dni-prefill", expiresIn: "10m" });
  res.json({ data: { nombres, apellidos, proof, venceEnSegundos: 600 } });
}));

export default router;
