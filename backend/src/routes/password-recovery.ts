import { Router } from "express";
import { createHmac, randomInt, timingSafeEqual } from "node:crypto";
import bcrypt from "bcryptjs";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import type { RowDataPacket } from "mysql2/promise";
import { config } from "../config.js";
import { query, transaction } from "../db/index.js";
import { AppError, asyncHandler } from "../lib/http.js";
import { passwordSchema } from "../lib/validation.js";
import { clearSession, credentialTag } from "../middlewares/auth.js";
import { sendCommunityEmail } from "../services/email.js";

const emailSchema = z.string().trim().email().max(254).transform(value => value.toLowerCase());
const requestSchema = z.object({ correo: emailSchema }).strict();
const resetSchema = z.object({ correo: emailSchema, codigo: z.string().regex(/^\d{6}$/), nueva: passwordSchema, confirmacion: z.string().max(72) })
  .strict().refine(value => value.nueva === value.confirmacion, "Las contraseñas nuevas no coinciden");
export function recoveryCodeHash(userId: string, code: string) {
  return createHmac("sha256", config.jwtSecret).update(`password-recovery:${userId}:${code}`).digest("hex");
}
// The injectable sender lets tests exercise delivery without sending real emails.
export function passwordRecoveryRouter(sendEmail = sendCommunityEmail) {
  const router = Router();
  const limiter = (limit: number) => rateLimit({ windowMs: 15 * 60 * 1000, limit, standardHeaders: "draft-7", legacyHeaders: false,
    message: { error: { code: "RATE_LIMITED", message: "Demasiados intentos. Espera unos minutos y vuelve a intentar." } } });
  router.post("/auth/password/recovery", limiter(5), asyncHandler(async (req, res) => {
    const { correo } = requestSchema.parse(req.body);
    if (!config.jwtSecret || !config.emailConfigured) throw new AppError(503, "RECOVERY_NOT_CONFIGURED", "La recuperación por correo no está disponible en este momento.");
    const delivery = await transaction(async connection => {
      const [users] = await connection.execute<RowDataPacket[]>("SELECT CAST(usuario_id AS CHAR) AS id, hash_contrasena AS hash FROM usuarios WHERE correo = ? AND correo_verificado = 1 AND estado_cuenta = 'activo' FOR UPDATE", [correo]);
      const user = users[0];
      if (!user) return null;
      const [recent] = await connection.execute<RowDataPacket[]>("SELECT usuario_id FROM recuperaciones_contrasena WHERE usuario_id = ? AND solicitado_en > DATE_SUB(UTC_TIMESTAMP(), INTERVAL 60 SECOND)", [user.id]);
      if (recent.length) return null;
      const code = String(randomInt(100000, 1000000));
      const codeHash = recoveryCodeHash(user.id, code);
      await connection.execute(`INSERT INTO recuperaciones_contrasena (usuario_id, correo, codigo_hash, credencial_hash, vence, solicitado_en, intentos)
        VALUES (?, ?, ?, ?, DATE_ADD(UTC_TIMESTAMP(), INTERVAL 10 MINUTE), UTC_TIMESTAMP(), 0)
        ON DUPLICATE KEY UPDATE correo = VALUES(correo), codigo_hash = VALUES(codigo_hash), credencial_hash = VALUES(credencial_hash),
        vence = VALUES(vence), solicitado_en = VALUES(solicitado_en), intentos = 0`, [user.id, correo, codeHash, credentialTag(user.hash)]);
      return { id: user.id, code, codeHash };
    });
    if (delivery) {
      const result = await sendEmail(correo, "Recupera tu acceso a AYNI", `Tu código para restablecer la contraseña es: ${delivery.code}\n\nVence en 10 minutos y solo se puede usar una vez. No lo compartas. Si no lo solicitaste, ignora este mensaje; tu contraseña sigue igual.`);
      if (!result.sent) {
        await query("DELETE FROM recuperaciones_contrasena WHERE usuario_id = ? AND codigo_hash = ?", [delivery.id, delivery.codeHash]);
        // Keep the same public response so delivery failures cannot disclose registered accounts.
      }
    }
    res.json({ data: { mensaje: "Si ese correo está confirmado en una cuenta activa, recibirás un código. Revisa tu bandeja de entrada y spam." } });
  }));
  router.post("/auth/password/reset", limiter(15), asyncHandler(async (req, res) => {
    const body = resetSchema.parse(req.body);
    if (!config.jwtSecret) throw new AppError(503, "RECOVERY_NOT_CONFIGURED", "La recuperación no está disponible en este momento.");
    const changed = await transaction(async connection => {
      const [users] = await connection.execute<RowDataPacket[]>("SELECT CAST(usuario_id AS CHAR) AS id, hash_contrasena AS hash FROM usuarios WHERE correo = ? AND correo_verificado = 1 AND estado_cuenta = 'activo' FOR UPDATE", [body.correo]);
      const user = users[0];
      if (!user) return false;
      const [codes] = await connection.execute<RowDataPacket[]>("SELECT codigo_hash, credencial_hash, intentos FROM recuperaciones_contrasena WHERE usuario_id = ? AND correo = ? AND vence > UTC_TIMESTAMP() FOR UPDATE", [user.id, body.correo]);
      const saved = codes[0];
      if (!saved || saved.intentos >= 5 || saved.credencial_hash !== credentialTag(user.hash)) return false;
      const expected = Buffer.from(recoveryCodeHash(user.id, body.codigo), 'hex');
      const actual = Buffer.from(saved.codigo_hash, 'hex');
      if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
        await connection.execute("UPDATE recuperaciones_contrasena SET intentos = intentos + 1 WHERE usuario_id = ?", [user.id]);
        return false; // Commit failed attempts, rather than rolling them back with an exception.
      }
      const hash = await bcrypt.hash(body.nueva, 12);
      await connection.execute("UPDATE usuarios SET hash_contrasena = ? WHERE usuario_id = ?", [hash, user.id]);
      await connection.execute("DELETE FROM recuperaciones_contrasena WHERE usuario_id = ?", [user.id]);
      return true;
    });
    if (!changed) throw new AppError(400, "RECOVERY_CODE_INVALID", "El código no es válido, venció o agotó sus intentos. Solicita otro código.");
    clearSession(res);
    res.json({ data: { cambiado: true } });
  }));
  return router;
}
export default passwordRecoveryRouter();
