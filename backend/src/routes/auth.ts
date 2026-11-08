import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { createHmac, randomInt } from "node:crypto";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { config } from "../config.js";
import { one, query, transaction } from "../db/index.js";
import { AppError, asyncHandler } from "../lib/http.js";
import { idSchema, phoneSchema, registerSchema } from "../lib/validation.js";
import { clearSession, requireAuth, setSession } from "../middlewares/auth.js";
import { sendCommunityEmail } from "../services/email.js";

const router = Router();
const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 15, standardHeaders: "draft-7", legacyHeaders: false,
  message: { error: { code: "RATE_LIMITED", message: "Demasiados intentos. Espera unos minutos." } } });
const dummyHash = bcrypt.hashSync("ayni-only-used-for-login-timing", 12);

export const userSelect = `SELECT CAST(u.usuario_id AS CHAR) AS id, u.nombres, u.apellidos, u.correo, u.telefono,
  u.correo_verificado AS correoVerificado, u.notificaciones_correo AS notificacionesCorreo, u.telefono_publico AS telefonoPublico,
  CAST(l.sector_id AS CHAR) AS sectorId, s.nombre AS sectorNombre,
  l.direccion AS direccion, l.latitud AS latitud, l.longitud AS longitud
  FROM usuarios u LEFT JOIN ubicaciones l ON l.ubicacion_id = u.ubicacion_id
  LEFT JOIN sectores_vecinales s ON s.sector_id = l.sector_id`;

router.post("/auth/register", loginLimiter, asyncHandler(async (req, res) => {
  if (!config.jwtSecret) throw new AppError(503, "AUTH_NOT_CONFIGURED", "La autenticación todavía no está configurada.");
  const data = registerSchema.parse(req.body);
  if (!config.dniHashSecret) throw new AppError(503, "DNI_LOGIN_NOT_CONFIGURED", "El registro con DNI aún no está configurado.");
  let dniHash: string;
  try {
    const proof = jwt.verify(data.dniProof, config.jwtSecret, { algorithms: ["HS256"], issuer: "ayni-api", audience: "ayni-dni-prefill" });
    const expectedHash = createHmac("sha256", config.dniHashSecret).update(data.dni).digest("hex");
    if (typeof proof === "string" || proof.dniHash !== expectedHash || typeof proof.nombres !== "string" || typeof proof.apellidos !== "string") throw new Error("invalid");
    data.nombres = proof.nombres;
    data.apellidos = proof.apellidos;
    dniHash = expectedHash;
  } catch { throw new AppError(400, "DNI_PROOF_INVALID", "Vuelve a consultar tu DNI antes de crear la cuenta."); }
  const hash = await bcrypt.hash(data.contrasena, 12);
  const userId = await transaction(async (connection) => {
    const [sectors] = data.sectorId
      ? await connection.execute<RowDataPacket[]>("SELECT sector_id FROM sectores_vecinales WHERE sector_id = ?", [data.sectorId])
      : await connection.execute<RowDataPacket[]>("SELECT sector_id FROM sectores_vecinales WHERE nombre = 'Pueblo Libre' AND distrito = 'Pueblo Libre' AND ciudad = 'Lima' AND codigo_pais = 'PE' LIMIT 1");
    if (!sectors.length) {
      if (data.sectorId) throw new AppError(400, "INVALID_SECTOR", "Elige un sector existente.");
      throw new AppError(503, "DEFAULT_SECTOR_NOT_CONFIGURED", "Falta aplicar la migración 005 para habilitar registros sin selector de zona.");
    }
    const sectorId = data.sectorId ?? String(sectors[0].sector_id);
    const [location] = await connection.execute<ResultSetHeader>(
      "INSERT INTO ubicaciones (sector_id, etiqueta, direccion, latitud, longitud) VALUES (?, 'Ubicación privada del vecino', ?, ?, ?)",
      [sectorId, data.direccion?.trim() || null, data.latitud ?? null, data.longitud ?? null],
    );
    const [user] = await connection.execute<ResultSetHeader>(
      "INSERT INTO usuarios (ubicacion_id, nombres, apellidos, correo, telefono, hash_contrasena, dni_hash) VALUES (?, ?, ?, ?, ?, ?, ?)",
      [location.insertId, data.nombres, data.apellidos, data.correo ?? null, data.telefono ?? null, hash, dniHash],
    );
    return String(user.insertId);
  });
  const user = await one(`${userSelect} WHERE u.usuario_id = ?`, [userId]);
  setSession(res, userId);
  res.status(201).json({ data: user });
}));

router.post("/auth/login", loginLimiter, asyncHandler(async (req, res) => {
  if (!config.jwtSecret) throw new AppError(503, "AUTH_NOT_CONFIGURED", "La autenticación todavía no está configurada.");
  const body = z.object({ identificador: z.string().trim().min(1).max(254).optional(), correo: z.string().trim().email().max(254).transform((value) => value.toLowerCase()).optional(), contrasena: z.string().min(1).max(200) }).strict().refine((value) => Boolean(value.identificador || value.correo), "Ingresa correo o DNI").parse(req.body);
  const identifier = body.identificador ?? body.correo!;
  const isDni = /^\d{8}$/.test(identifier);
  if (/^\d+$/.test(identifier) && !isDni) throw new AppError(400, "INVALID_DNI", "El DNI debe tener 8 dígitos.");
  if (isDni && !config.dniHashSecret) throw new AppError(503, "DNI_LOGIN_NOT_CONFIGURED", "El acceso con DNI aún no está configurado.");
  const account = await one<{ id: string; hash: string; estado: string }>(
    `SELECT CAST(usuario_id AS CHAR) AS id, hash_contrasena AS hash, estado_cuenta AS estado FROM usuarios WHERE ${isDni ? "dni_hash" : "correo"} = ?`,
    [isDni ? createHmac("sha256", config.dniHashSecret).update(identifier).digest("hex") : identifier.toLowerCase()],
  );
  const valid = await bcrypt.compare(body.contrasena, account?.hash ?? dummyHash);
  if (!valid || !account || account.estado !== "activo") throw new AppError(401, "INVALID_CREDENTIALS", "DNI o correo y contraseña incorrectos.");
  setSession(res, account.id);
  res.json({ data: await one(`${userSelect} WHERE u.usuario_id = ?`, [account.id]) });
}));

router.post("/auth/logout", (_req, res) => { clearSession(res); res.json({ data: { cerrado: true } }); });
router.get("/auth/me", requireAuth, asyncHandler(async (req, res) => {
  const user = await one(`${userSelect} WHERE u.usuario_id = ? AND u.estado_cuenta = 'activo'`, [req.userId]);
  if (!user) throw new AppError(401, "UNAUTHENTICATED", "Inicia sesión para continuar.");
  res.json({ data: user });
}));

const emailLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 5, standardHeaders: "draft-7", legacyHeaders: false });
router.post("/auth/email/verification", requireAuth, emailLimiter, asyncHandler(async (req, res) => {
  const account = await one<{ correo: string | null; correoVerificado: number }>("SELECT correo, correo_verificado AS correoVerificado FROM usuarios WHERE usuario_id = ? AND estado_cuenta = 'activo'", [req.userId]);
  if (!account?.correo) throw new AppError(400, "EMAIL_REQUIRED", "Primero guarda tu correo en el perfil.");
  if (Number(account.correoVerificado)) { res.json({ data: { verificado: true } }); return; }
  if (!config.emailConfigured) throw new AppError(503, "EMAIL_NOT_CONFIGURED", "El envío de correo aún no está configurado en el servidor.");
  const code = String(randomInt(100000, 1000000));
  const codeHash = createHmac("sha256", config.jwtSecret).update(`${req.userId}:${code}`).digest("hex");
  await query("UPDATE usuarios SET correo_codigo_hash = ?, correo_codigo_vence = DATE_ADD(UTC_TIMESTAMP(), INTERVAL 10 MINUTE) WHERE usuario_id = ?", [codeHash, req.userId]);
  const sent = await sendCommunityEmail(account.correo, "Confirma tu correo de AYNI", `Tu código de confirmación es: ${code}\n\nVence en 10 minutos. Si no solicitaste este código, ignora este mensaje.`);
  if (!sent.sent) {
    const message = config.emailProvider === 'gmail' && sent.providerCode === 'EAUTH' ? "Google rechazó el acceso SMTP. Revisa GMAIL_USER y la contraseña de aplicación en backend/.env."
      : config.emailProvider === 'gmail' && sent.providerCode === 'EDNS' ? "El backend no pudo encontrar smtp.gmail.com. Revisa la conexión DNS del equipo donde ejecutas AYNI y vuelve a intentar."
      : config.emailProvider === 'gmail' ? "No se pudo conectar con Gmail SMTP. Revisa la conexión de red y que el equipo permita conexiones seguras al puerto 465."
      : sent.status === 401 ? "Resend rechazó la clave API. Revisa RESEND_API_KEY en backend/.env y reinicia el backend."
      : sent.status === 403 ? "Resend rechazó el remitente. Verifica en Resend que el dominio de EMAIL_FROM esté aprobado para enviar."
      : sent.status === 422 ? "Resend rechazó la dirección remitente o destinataria. Revisa el remitente y el dominio configurado."
      : sent.status === 429 ? "Resend limitó temporalmente los envíos. Espera unos minutos antes de volver a intentar."
      : "No se pudo enviar el correo. Revisa la configuración del proveedor y la conexión del backend.";
    throw new AppError(503, "EMAIL_DELIVERY_FAILED", message);
  }
  res.json({ data: { enviado: true } });
}));
router.post("/auth/email/verify", requireAuth, emailLimiter, asyncHandler(async (req, res) => {
  const { codigo } = z.object({ codigo: z.string().regex(/^\d{6}$/) }).strict().parse(req.body);
  const account = await one<{ correo: string | null; correoVerificado: number; codigoHash: string | null; vence: Date | null }>(
    "SELECT correo, correo_verificado AS correoVerificado, correo_codigo_hash AS codigoHash, correo_codigo_vence AS vence FROM usuarios WHERE usuario_id = ? AND estado_cuenta = 'activo'", [req.userId]);
  if (!account?.correo || Number(account.correoVerificado)) throw new AppError(409, "EMAIL_NOT_PENDING", "No hay un correo pendiente de confirmar.");
  const expected = createHmac("sha256", config.jwtSecret).update(`${req.userId}:${codigo}`).digest("hex");
  if (!account.codigoHash || account.vence == null || new Date(account.vence).getTime() <= Date.now() || expected !== account.codigoHash) throw new AppError(400, "EMAIL_CODE_INVALID", "El código no es válido o venció. Solicita uno nuevo.");
  await query("UPDATE usuarios SET correo_verificado = 1, correo_codigo_hash = NULL, correo_codigo_vence = NULL WHERE usuario_id = ?", [req.userId]);
  res.json({ data: await one(`${userSelect} WHERE u.usuario_id = ?`, [req.userId]) });
}));

router.patch("/auth/me", requireAuth, asyncHandler(async (req, res) => {
  const body = z.object({
    correo: z.string().trim().email().max(254).transform((value) => value.toLowerCase()).nullable().optional(),
    notificacionesCorreo: z.boolean().optional(),
    telefono: phoneSchema.nullable().optional(),
    telefonoPublico: z.boolean().optional(),
    sectorId: idSchema.optional(),
    direccion: z.string().trim().min(3).max(255).optional(),
    latitud: z.number().finite().min(-90).max(90).optional(),
    longitud: z.number().finite().min(-180).max(180).optional(),
  }).strict().refine((value) => Object.keys(value).length > 0, "Indica qué deseas actualizar")
    .refine((value) => (value.latitud === undefined) === (value.longitud === undefined), "Proporciona ambas coordenadas")
    .parse(req.body);
  await transaction(async (connection) => {
    const [locked] = await connection.execute<RowDataPacket[]>(`SELECT u.usuario_id, u.telefono, u.correo, u.notificaciones_correo,
      CAST(l.sector_id AS CHAR) AS sector_id, l.direccion, l.latitud, l.longitud
      FROM usuarios u LEFT JOIN ubicaciones l ON l.ubicacion_id = u.ubicacion_id
      WHERE u.usuario_id = ? AND u.estado_cuenta = 'activo' FOR UPDATE`, [req.userId]);
    if (!locked.length) throw new AppError(401, "UNAUTHENTICATED", "Inicia sesión para continuar.");
    const resultingPhone = body.telefono !== undefined ? body.telefono : locked[0].telefono;
    const resultingEmail = body.correo !== undefined ? body.correo : locked[0].correo;
    const wantsEmailNotifications = body.notificacionesCorreo ?? Boolean(locked[0].notificaciones_correo);
    if (wantsEmailNotifications && !resultingEmail) throw new AppError(400, "EMAIL_REQUIRED_FOR_NOTIFICATIONS", "Añade un correo electrónico para activar los avisos.");
    if (wantsEmailNotifications && body.correo && body.correo !== locked[0].correo) throw new AppError(400, "EMAIL_MUST_BE_VERIFIED", "Confirma el correo nuevo antes de activar avisos por correo.");
    if (body.correo) {
      const [existingEmail] = await connection.execute<RowDataPacket[]>(
        "SELECT usuario_id FROM usuarios WHERE correo = ? AND usuario_id <> ? LIMIT 1 FOR UPDATE", [body.correo, req.userId]);
      if (existingEmail.length) throw new AppError(409, "EMAIL_ALREADY_REGISTERED", "Ese correo ya está asociado a otra cuenta.");
    }
    if (body.telefonoPublico === true && !resultingPhone) throw new AppError(400, "PHONE_REQUIRED", "Añade un teléfono antes de mostrarlo como contacto.");
    if (body.telefonoPublico === true && !/^\+[1-9]\d{7,14}$/.test(String(resultingPhone))) {
      throw new AppError(400, "PHONE_INTERNATIONAL_FORMAT_REQUIRED", "Para crear el enlace de WhatsApp, guarda el teléfono con prefijo internacional, por ejemplo +51987654321.");
    }
    const fields: string[] = [];
    const values: unknown[] = [];
    for (const key of ["correo", "telefono"] as const) {
      if (body[key] !== undefined) { fields.push(`${key} = ?`); values.push(body[key]); }
    }
    if (body.correo !== undefined && body.correo !== locked[0].correo) {
      fields.push("correo_verificado = 0", "correo_codigo_hash = NULL", "correo_codigo_vence = NULL", "notificaciones_correo = 0");
    }
    if (body.notificacionesCorreo !== undefined || body.correo === null) {
      fields.push("notificaciones_correo = ?");
      values.push(body.correo === null ? false : body.notificacionesCorreo ?? false);
    }
    if (body.telefonoPublico !== undefined || body.telefono === null) {
      fields.push("telefono_publico = ?");
      values.push(body.telefono === null ? false : body.telefonoPublico ?? false);
    }
    const locationChanged = body.sectorId !== undefined || body.direccion !== undefined || body.latitud !== undefined;
    if (locationChanged) {
      const sectorId = body.sectorId ?? String(locked[0].sector_id ?? '');
      if (!sectorId) throw new AppError(400, "LOCATION_NOT_CONFIGURED", "No hay una zona base configurada para guardar tu ubicación.");
      const [sectors] = await connection.execute<RowDataPacket[]>("SELECT sector_id FROM sectores_vecinales WHERE sector_id = ?", [sectorId]);
      if (!sectors.length) throw new AppError(400, "INVALID_SECTOR", "Elige un sector existente.");
      // Create a private location snapshot; previous requests keep their original location.
      const [location] = await connection.execute<ResultSetHeader>(
        "INSERT INTO ubicaciones (sector_id, etiqueta, direccion, latitud, longitud) VALUES (?, 'Ubicación privada del vecino', ?, ?, ?)",
        [sectorId, body.direccion ?? locked[0].direccion ?? null, body.latitud ?? locked[0].latitud ?? null, body.longitud ?? locked[0].longitud ?? null],
      );
      fields.push("ubicacion_id = ?"); values.push(location.insertId);
    }
    await connection.execute(`UPDATE usuarios SET ${fields.join(", ")} WHERE usuario_id = ?`, [...values, req.userId] as never[]);
  });
  res.json({ data: await one(`${userSelect} WHERE u.usuario_id = ?`, [req.userId]) });
}));

export default router;
