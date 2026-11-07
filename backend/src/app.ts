import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { config } from "./config.js";
import { query } from "./db/index.js";
import { AppError, asyncHandler } from "./lib/http.js";
import { optionalAuth } from "./middlewares/auth.js";
import { protectMutations } from "./middlewares/security.js";
import { errorHandler } from "./middlewares/errors.js";
import auth from "./routes/auth.js";
import catalog from "./routes/catalog.js";
import publications from "./routes/publications.js";
import notices from "./routes/notices.js";
import community from "./routes/community.js";

export const app = express();
app.disable("x-powered-by");
if (config.trustProxy) app.set("trust proxy", 1);
app.use(helmet());
app.use(cors({
  origin(origin, callback) {
    if (!origin || config.origins.includes(origin)) { callback(null, true); return; }
    callback(new AppError(403, "INVALID_ORIGIN", "Origen no autorizado."));
  },
  credentials: true,
  methods: ["GET", "POST", "PATCH", "PUT", "OPTIONS"],
  allowedHeaders: ["Content-Type", "X-AYNI-Client", "X-AYNI-User"],
}));
app.use("/api", protectMutations(config.origins));
app.use(express.json({ limit: "64kb" }));
app.use(cookieParser());
app.use("/api", rateLimit({ windowMs: 60 * 1000, limit: 180, standardHeaders: "draft-7", legacyHeaders: false,
  message: { error: { code: "RATE_LIMITED", message: "Has realizado muchas solicitudes. Espera un momento." } } }));
app.get("/api/health", asyncHandler(async (_req, res) => {
  await query("SELECT 1 AS conectado");
  await query("SELECT client_request_id FROM solicitudes_ayuda LIMIT 0");
  await query("SELECT entregada_en, confirmada_en FROM ofertas_ayuda LIMIT 0");
  await query("SELECT imagen_url FROM avisos LIMIT 0");
  await query("SELECT telefono_publico FROM usuarios LIMIT 0");
  if (!config.jwtSecret) throw new AppError(503, "AUTH_NOT_CONFIGURED", "La autenticación todavía no está configurada.");
  res.json({ data: { estado: "ok", baseDeDatos: "conectada" } });
}));
app.use("/api", (req, res, next) => req.path === "/auth/logout" ? next() : optionalAuth(req, res, next));
app.use("/api", auth, catalog, publications, notices, community);
app.use((_req, _res, next) => next(new AppError(404, "NOT_FOUND", "La ruta solicitada no existe.")));
app.use(errorHandler);
export default app;
