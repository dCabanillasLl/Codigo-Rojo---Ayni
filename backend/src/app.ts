import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { config } from "./config.js";
import { query } from "./db/index.js";
import { AppError, asyncHandler } from "./lib/http.js";
import { optionalAuth } from "./middlewares/auth.js";
import { protectMutations, verifyExpectedUser } from "./middlewares/security.js";
import { errorHandler } from "./middlewares/errors.js";
import { defaultJson } from "./middlewares/json.js";
import auth from "./routes/auth.js";
import catalog from "./routes/catalog.js";
import publications from "./routes/publications.js";
import notices from "./routes/notices.js";
import community from "./routes/community.js";
import identity from "./routes/identity.js";
import locations from "./routes/locations.js";
import notifications from './routes/notifications.js';
import assistant from './routes/assistant.js';

export const app = express();
app.disable("x-powered-by");
if (config.trustProxy) app.set("trust proxy", 1);
app.use(helmet());
app.use(cors({
  origin(origin, callback) {
    if (!origin || config.origins.includes(origin)) { callback(null, true); return; }
    callback(new AppError(403, "CORS_ORIGIN_REJECTED", "El navegador llegó con un origen distinto al configurado en el backend."));
  },
  credentials: true,
  methods: ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "X-AYNI-Client", "X-AYNI-User"],
}));
app.get("/api/version", (_req, res) => res.json({ data: { api: "ayni-api", build: "dni-apiperu-v1" } }));
app.use("/api", protectMutations(config.origins));
app.use(defaultJson);
app.use(cookieParser());
app.use("/api", rateLimit({ windowMs: 60 * 1000, limit: 180, standardHeaders: "draft-7", legacyHeaders: false,
  message: { error: { code: "RATE_LIMITED", message: "Has realizado muchas solicitudes. Espera un momento." } } }));
app.get("/api/health", asyncHandler(async (_req, res) => {
  await query("SELECT 1 AS conectado");
  await query("SELECT client_request_id FROM solicitudes_ayuda LIMIT 0");
  await query("SELECT entregada_en, confirmada_en FROM ofertas_ayuda LIMIT 0");
  await query("SELECT imagen_url, imagen, imagen_hash FROM avisos LIMIT 0");
  await query('SELECT revision_evento, motivo_cambio, ultimo_cambio_evento, ubicacion_publica FROM avisos LIMIT 0');
  await query('SELECT confirmada FROM asistencias_avisos LIMIT 0');
  await query('SELECT leida_en FROM notificaciones_avisos LIMIT 0');
  await query("SELECT telefono_publico FROM usuarios LIMIT 0");
  await query("SELECT notificaciones_correo FROM usuarios LIMIT 0");
  await query("SELECT correo_verificado, correo_codigo_hash, correo_codigo_vence FROM usuarios LIMIT 0");
  await query("SELECT notificacion_id, usuario_id, solicitud_id, oferta_id, tipo, leida_en FROM notificaciones_interacciones LIMIT 0");
  await query("SELECT imagen, imagen_hash FROM publicaciones LIMIT 0");
  if (!config.jwtSecret) throw new AppError(503, "AUTH_NOT_CONFIGURED", "La autenticación todavía no está configurada.");
  res.json({ data: { estado: "ok", baseDeDatos: "conectada" } });
}));
app.use("/api", (req, res, next) => req.path === "/auth/logout" ? next() : optionalAuth(req, res, next));
app.use('/api', verifyExpectedUser);
app.use("/api", identity, auth, catalog, publications, notices, community, locations, notifications, assistant);
app.use((_req, _res, next) => next(new AppError(404, "NOT_FOUND", "La ruta solicitada no existe.")));
app.use(errorHandler);
export default app;
