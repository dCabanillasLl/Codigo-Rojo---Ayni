import "dotenv/config";
import { readFileSync } from "node:fs";

const bool = (value: string | undefined, fallback = false) => {
  if (value === undefined) return fallback;
  if (value === "true") return true;
  if (value === "false") return false;
  throw new Error("Las variables booleanas deben ser true o false.");
};
const production = process.env.NODE_ENV === "production";
const origins = (process.env.FRONTEND_ORIGIN ?? "http://localhost:8443,http://127.0.0.1:8443")
  .split(",").map((value) => value.trim()).filter(Boolean);
for (const origin of origins) {
  const parsed = new URL(origin);
  if (parsed.origin !== origin || !["http:", "https:"].includes(parsed.protocol)) {
    throw new Error("FRONTEND_ORIGIN debe contener orígenes HTTP(S) sin ruta ni barra final.");
  }
}
const host = process.env.DB_HOST ?? "";
const localDatabase = ["localhost", "127.0.0.1", "::1"].includes(host.toLowerCase());
const tls = bool(process.env.DB_TLS, true);
if (!tls && host && !localDatabase) {
  throw new Error("DB_TLS=false solo se permite para una base local.");
}
const caPath = process.env.DB_SSL_CA;
if (host && !localDatabase && tls && !caPath) {
  throw new Error("DB_SSL_CA es obligatorio para validar el certificado de MySQL remoto.");
}
const ca = caPath ? readFileSync(caPath, "utf8") : undefined;
const jwtSecret = process.env.JWT_SECRET ?? "";
if (jwtSecret && Buffer.byteLength(jwtSecret) < 32) throw new Error("JWT_SECRET debe tener al menos 32 bytes.");
const cookieSecure = bool(process.env.COOKIE_SECURE, production);
if (production && (!cookieSecure || !jwtSecret)) throw new Error("Producción requiere JWT_SECRET y COOKIE_SECURE=true.");
const port = Number(process.env.PORT ?? 3001);
const dbPort = Number(process.env.DB_PORT ?? 3306);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("PORT debe ser un puerto válido.");
if (!Number.isInteger(dbPort) || dbPort < 1 || dbPort > 65535) throw new Error("DB_PORT debe ser un puerto válido.");

export const config = {
  production,
  port,
  origins,
  jwtSecret,
  cookieSecure,
  trustProxy: bool(process.env.TRUST_PROXY),
  dbConfigured: Boolean(host && process.env.DB_USER && process.env.DB_PASSWORD && process.env.DB_NAME),
  db: {
    host: host || "127.0.0.1",
    port: dbPort,
    user: process.env.DB_USER ?? "",
    password: process.env.DB_PASSWORD ?? "",
    database: process.env.DB_NAME ?? "ayni",
    ssl: tls ? { rejectUnauthorized: true as const, ...(ca ? { ca } : {}) } : undefined,
  },
};
