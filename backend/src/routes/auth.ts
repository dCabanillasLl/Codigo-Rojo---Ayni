import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { createHmac } from "node:crypto";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { config } from "../config.js";
import { one, transaction } from "../db/index.js";
import { AppError, asyncHandler } from "../lib/http.js";
import { idSchema, phoneSchema, registerSchema } from "../lib/validation.js";
import { clearSession, requireAuth, setSession } from "../middlewares/auth.js";

const router = Router();
const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 15, standardHeaders: "draft-7", legacyHeaders: false,
  message: { error: { code: "RATE_LIMITED", message: "Demasiados intentos. Espera unos minutos." } } });
const dummyHash = bcrypt.hashSync("ayni-only-used-for-login-timing", 12);

export const userSelect = `SELECT CAST(u.usuario_id AS CHAR) AS id, u.nombres, u.apellidos, u.correo, u.telefono,
  u.telefono_publico AS telefonoPublico,
  CAST(l.sector_id AS CHAR) AS sectorId, s.nombre AS sectorNombre
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

router.patch("/auth/me", requireAuth, asyncHandler(async (req, res) => {
  const body = z.object({
    nombres: z.string().trim().min(2).max(80).optional(),
    apellidos: z.string().trim().min(2).max(100).optional(),
    telefono: phoneSchema.nullable().optional(),
    telefonoPublico: z.boolean().optional(),
    sectorId: idSchema.optional(),
    latitud: z.number().finite().min(-90).max(90).optional(),
    longitud: z.number().finite().min(-180).max(180).optional(),
  }).strict().refine((value) => Object.keys(value).length > 0, "Indica qué deseas actualizar")
    .refine((value) => (value.latitud === undefined) === (value.longitud === undefined), "Proporciona ambas coordenadas")
    .refine((value) => value.latitud === undefined || Boolean(value.sectorId), "Selecciona el sector para actualizar la ubicación")
    .parse(req.body);
  await transaction(async (connection) => {
    const [locked] = await connection.execute<RowDataPacket[]>("SELECT usuario_id, telefono FROM usuarios WHERE usuario_id = ? AND estado_cuenta = 'activo' FOR UPDATE", [req.userId]);
    if (!locked.length) throw new AppError(401, "UNAUTHENTICATED", "Inicia sesión para continuar.");
    const resultingPhone = body.telefono !== undefined ? body.telefono : locked[0].telefono;
    if (body.telefonoPublico === true && !resultingPhone) throw new AppError(400, "PHONE_REQUIRED", "Añade un teléfono antes de mostrarlo como contacto.");
    if (body.telefonoPublico === true && !/^\+[1-9]\d{7,14}$/.test(String(resultingPhone))) {
      throw new AppError(400, "PHONE_INTERNATIONAL_FORMAT_REQUIRED", "Para crear el enlace de WhatsApp, guarda el teléfono con prefijo internacional, por ejemplo +51987654321.");
    }
    const fields: string[] = [];
    const values: unknown[] = [];
    for (const key of ["nombres", "apellidos", "telefono"] as const) {
      if (body[key] !== undefined) { fields.push(`${key} = ?`); values.push(body[key]); }
    }
    if (body.telefonoPublico !== undefined || body.telefono === null) {
      fields.push("telefono_publico = ?");
      values.push(body.telefono === null ? false : body.telefonoPublico ?? false);
    }
    if (body.sectorId) {
      const [sectors] = await connection.execute<RowDataPacket[]>("SELECT sector_id FROM sectores_vecinales WHERE sector_id = ?", [body.sectorId]);
      if (!sectors.length) throw new AppError(400, "INVALID_SECTOR", "Elige un sector existente.");
      // Create an immutable location snapshot so updating a profile cannot move old requests.
      const [location] = await connection.execute<ResultSetHeader>(
        "INSERT INTO ubicaciones (sector_id, etiqueta, latitud, longitud) VALUES (?, 'Ubicación privada del vecino', ?, ?)",
        [body.sectorId, body.latitud ?? null, body.longitud ?? null],
      );
      fields.push("ubicacion_id = ?"); values.push(location.insertId);
    }
    await connection.execute(`UPDATE usuarios SET ${fields.join(", ")} WHERE usuario_id = ?`, [...values, req.userId] as never[]);
  });
  res.json({ data: await one(`${userSelect} WHERE u.usuario_id = ?`, [req.userId]) });
}));

export default router;
