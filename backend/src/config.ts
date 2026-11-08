import "dotenv/config";
import { readFileSync } from "node:fs";

const bool = (value: string | undefined, fallback = false) => {
  if (value === undefined) return fallback;
  if (value === "true") return true;
  if (value === "false") return false;
  throw new Error("Las variables booleanas deben ser true o false.");
};
const production = process.env.NODE_ENV === "production";
const configuredOrigins = (process.env.FRONTEND_ORIGIN ?? "http://localhost:8443,http://127.0.0.1:8443")
  .split(",").map((value) => value.trim()).filter(Boolean);
// Vite may move to the next available port (for example, 8445). Keep this
// development-only allowlist local; production must use explicit origins.
const devOrigins = production ? [] : [8443, 8444, 8445].flatMap((port) => [
  `http://localhost:${port}`, `http://127.0.0.1:${port}`,
]);
const origins = [...new Set([...configuredOrigins, ...devOrigins])];
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
const dniHashSecret = process.env.DNI_HASH_SECRET ?? "";
if (dniHashSecret && Buffer.byteLength(dniHashSecret) < 32) throw new Error("DNI_HASH_SECRET debe tener al menos 32 bytes.");
const cookieSecure = bool(process.env.COOKIE_SECURE, production);
if (production && (!cookieSecure || !jwtSecret)) throw new Error("Producción requiere JWT_SECRET y COOKIE_SECURE=true.");
const port = Number(process.env.PORT ?? 3002);
const dbPort = Number(process.env.DB_PORT ?? 3306);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("PORT debe ser un puerto válido.");
if (!Number.isInteger(dbPort) || dbPort < 1 || dbPort > 65535) throw new Error("DB_PORT debe ser un puerto válido.");
const emailProvider = process.env.EMAIL_PROVIDER ?? "gmail";
if (emailProvider !== "gmail" && emailProvider !== "resend") throw new Error("EMAIL_PROVIDER debe ser gmail o resend.");
const gmailUser = process.env.GMAIL_USER ?? "";
const gmailAppPassword = (process.env.GMAIL_APP_PASSWORD ?? "").replace(/\s/g, "");
const emailFrom = process.env.EMAIL_FROM ?? (gmailUser ? `AYNI <${gmailUser}>` : "");
if (emailProvider === "gmail" && emailFrom && gmailUser) {
  const fromAddress = emailFrom.match(/<([^<>]+)>/)?.[1] ?? emailFrom;
  if (fromAddress.toLowerCase() !== gmailUser.toLowerCase()) {
    throw new Error("Con Gmail SMTP, EMAIL_FROM debe usar la misma dirección indicada en GMAIL_USER.");
  }
}

export const config = {
  production,
  port,
  origins,
  jwtSecret,
  dniHashSecret,
  apiPeruKey: process.env.APIPERU_API_KEY ?? "",
  emailProvider,
  gmailUser,
  gmailAppPassword,
  resendApiKey: process.env.RESEND_API_KEY ?? "",
  emailFrom,
  emailConfigured: emailProvider === "gmail"
    ? Boolean(gmailUser && gmailAppPassword && emailFrom)
    : Boolean(process.env.RESEND_API_KEY && emailFrom),
  geminiApiKey: process.env.GEMINI_API_KEY ?? "",
  geminiModel: process.env.GEMINI_MODEL ?? "gemini-3.8-flash",
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
