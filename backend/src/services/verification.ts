import type { PoolConnection, RowDataPacket } from "mysql2/promise";
import { one, query, transaction } from "../db/index.js";
import { AppError } from "../lib/http.js";

export type VerificationState = "PENDIENTE" | "VERIFICADA" | "RECHAZADA" | "REVOCADA";
export type ReviewMethod = "REVISION_PRESENCIAL" | "REFERENCIA_VECINAL" | "VALIDACION_INSTITUCIONAL" | "OTRO";
export type ReviewAction = "aprobar" | "rechazar" | "revocar";

type IdentityRow = RowDataPacket & {
  estado: VerificationState; metodo: string; verificadaEn: Date | null; revocadaEn: Date | null;
};

export async function ensureIdentityPending(userId: string) {
  await transaction(async (connection) => {
    const [result] = await connection.execute(`INSERT IGNORE INTO verificaciones_identidad (usuario_id, estado, metodo)
      VALUES (?, 'PENDIENTE', 'SIN_ACREDITACION')`, [userId]);
    if (Number((result as { affectedRows?: number }).affectedRows) > 0) {
      await insertAudit(connection, "IDENTIDAD", userId, null, userId, null, "PENDIENTE", "SIN_ACREDITACION", null);
    }
  });
}

export async function getIdentityStatus(userId: string) {
  await ensureIdentityPending(userId);
  return one(`SELECT estado, metodo, verificada_en AS verificadaEn, revocada_en AS revocadaEn
    FROM verificaciones_identidad WHERE usuario_id = ?`, [userId]);
}

export async function listMyZoneMemberships(userId: string) {
  return query(`SELECT CAST(p.pertenencia_id AS CHAR) AS id, CAST(p.sector_id AS CHAR) AS sectorId,
      s.nombre AS sectorNombre, s.distrito, s.ciudad, p.estado, p.metodo,
      p.solicitada_en AS solicitadaEn, p.verificada_en AS verificadaEn,
      p.vence_en AS venceEn, p.revocada_en AS revocadaEn,
      CAST((p.estado = 'VERIFICADA' AND (p.vence_en IS NULL OR p.vence_en > UTC_TIMESTAMP(3))) AS SIGNED) AS vigente
    FROM pertenencias_zona p JOIN sectores_vecinales s ON s.sector_id = p.sector_id
    WHERE p.usuario_id = ? ORDER BY p.solicitada_en DESC, p.pertenencia_id DESC`, [userId]);
}

export async function requestZoneMembership(userId: string, sectorId: string) {
  return transaction(async (connection) => {
    const [users] = await connection.execute<RowDataPacket[]>(
      "SELECT usuario_id FROM usuarios WHERE usuario_id = ? AND estado_cuenta = 'activo' FOR UPDATE", [userId]);
    if (!users.length) throw new AppError(401, "UNAUTHENTICATED", "Inicia sesión para continuar.");
    const [sectors] = await connection.execute<RowDataPacket[]>("SELECT sector_id FROM sectores_vecinales WHERE sector_id = ?", [sectorId]);
    if (!sectors.length) throw new AppError(400, "INVALID_SECTOR", "Elige una zona existente.");

    const [memberships] = await connection.execute<RowDataPacket[]>(`SELECT pertenencia_id AS id, estado, metodo,
      CAST((estado = 'VERIFICADA' AND (vence_en IS NULL OR vence_en > UTC_TIMESTAMP(3))) AS SIGNED) AS vigente
      FROM pertenencias_zona WHERE usuario_id = ? AND sector_id = ? FOR UPDATE`, [userId, sectorId]);
    if (memberships[0]?.estado === "PENDIENTE") {
      if (memberships[0].metodo === "DECLARADA_EN_PERFIL") {
        await connection.execute(`UPDATE pertenencias_zona SET metodo='SOLICITUD_VECINAL', solicitada_en=UTC_TIMESTAMP(3)
          WHERE pertenencia_id=?`, [memberships[0].id]);
        await insertAudit(connection, "ZONA", userId, sectorId, userId, "PENDIENTE", "PENDIENTE", "SOLICITUD_VECINAL", null);
        return { id: String(memberships[0].id), estado: "PENDIENTE", solicitada: true };
      }
      return { id: String(memberships[0].id), estado: "PENDIENTE", solicitada: false };
    }
    if (Number(memberships[0]?.vigente) === 1) throw new AppError(409, "ZONE_ALREADY_VERIFIED", "Tu pertenencia a esta zona ya está verificada y vigente.");

    if (memberships.length) {
      const previous = String(memberships[0].estado) as VerificationState;
      await connection.execute(`UPDATE pertenencias_zona SET estado='PENDIENTE', metodo='SOLICITUD_VECINAL',
        solicitada_en=UTC_TIMESTAMP(3), verificada_en=NULL, vence_en=NULL, revocada_en=NULL, responsable_id=NULL
        WHERE pertenencia_id=?`, [memberships[0].id]);
      await insertAudit(connection, "ZONA", userId, sectorId, userId, previous, "PENDIENTE", "SOLICITUD_VECINAL", null);
      return { id: String(memberships[0].id), estado: "PENDIENTE", solicitada: true };
    }

    const [inserted] = await connection.execute(`INSERT INTO pertenencias_zona
      (usuario_id, sector_id, metodo, estado) VALUES (?, ?, 'SOLICITUD_VECINAL', 'PENDIENTE')`, [userId, sectorId]);
    const id = String((inserted as { insertId: number | bigint }).insertId);
    await insertAudit(connection, "ZONA", userId, sectorId, userId, null, "PENDIENTE", "SOLICITUD_VECINAL", null);
    return { id, estado: "PENDIENTE", solicitada: true };
  });
}

export async function requestIdentityReview(userId: string) {
  return transaction(async (connection) => {
    const [rows] = await connection.execute<RowDataPacket[]>(
      "SELECT estado, metodo FROM verificaciones_identidad WHERE usuario_id = ? FOR UPDATE", [userId]);
    if (!rows.length) throw new AppError(404, "IDENTITY_STATUS_NOT_FOUND", "No encontramos el estado de identidad de tu cuenta.");
    const previous = String(rows[0].estado) as VerificationState;
    if (previous === "PENDIENTE") {
      if (rows[0].metodo === "SOLICITUD_REVISION_MANUAL") return { estado: "PENDIENTE", solicitada: false };
      await connection.execute(`UPDATE verificaciones_identidad SET metodo='SOLICITUD_REVISION_MANUAL'
        WHERE usuario_id=?`, [userId]);
      await insertAudit(connection, "IDENTIDAD", userId, null, userId, "PENDIENTE", "PENDIENTE", "SOLICITUD_REVISION_MANUAL", null);
      return { estado: "PENDIENTE", solicitada: true };
    }
    if (previous === "VERIFICADA") throw new AppError(409, "IDENTITY_ALREADY_VERIFIED", "Tu identidad ya está acreditada.");
    await connection.execute(`UPDATE verificaciones_identidad SET estado='PENDIENTE', metodo='SOLICITUD_REVISION_MANUAL',
      verificada_en=NULL, revocada_en=NULL, responsable_id=NULL WHERE usuario_id=?`, [userId]);
    await insertAudit(connection, "IDENTIDAD", userId, null, userId, previous, "PENDIENTE", "SOLICITUD_REVISION_MANUAL", null);
    return { estado: "PENDIENTE", solicitada: true };
  });
}

export async function listPendingReviews(kind: "identidad" | "zona") {
  if (kind === "identidad") {
    // DNI hash and contact details are intentionally excluded from this reviewer view.
    return query(`SELECT CAST(v.usuario_id AS CHAR) AS usuarioId, u.nombres, u.apellidos,
        v.estado, v.metodo, v.creado_en AS creadaEn
      FROM verificaciones_identidad v JOIN usuarios u ON u.usuario_id=v.usuario_id
      WHERE v.estado='PENDIENTE' AND u.estado_cuenta='activo'
      ORDER BY v.creado_en ASC, v.usuario_id ASC LIMIT 100`);
  }
  return query(`SELECT CAST(p.pertenencia_id AS CHAR) AS id, CAST(p.usuario_id AS CHAR) AS usuarioId,
      CAST(p.sector_id AS CHAR) AS sectorId, u.nombres, u.apellidos, s.nombre AS sectorNombre,
      s.distrito, s.ciudad, p.estado, p.metodo, p.solicitada_en AS solicitadaEn
    FROM pertenencias_zona p JOIN usuarios u ON u.usuario_id=p.usuario_id
    JOIN sectores_vecinales s ON s.sector_id=p.sector_id
    WHERE p.estado='PENDIENTE' AND u.estado_cuenta='activo'
    ORDER BY p.solicitada_en ASC, p.pertenencia_id ASC LIMIT 100`);
}

export async function reviewIdentity(userId: string, actorId: string, action: ReviewAction, method: ReviewMethod, reason: string | null) {
  if (userId === actorId) throw new AppError(403, "SELF_REVIEW_FORBIDDEN", "No puedes revisar tu propia identidad.");
  return transaction(async (connection) => {
    const [rows] = await connection.execute<IdentityRow[]>(`SELECT estado, metodo,
      verificada_en AS verificadaEn, revocada_en AS revocadaEn
      FROM verificaciones_identidad WHERE usuario_id=? FOR UPDATE`, [userId]);
    if (!rows.length) throw new AppError(404, "IDENTITY_STATUS_NOT_FOUND", "No encontramos una solicitud de identidad para revisar.");
    const before = rows[0].estado;
    const next = nextReviewState(before, action);
    const verifiedAt = action === "aprobar" ? "UTC_TIMESTAMP(3)" : action === "revocar" ? "verificada_en" : "NULL";
    const revoked = action === "revocar" ? "UTC_TIMESTAMP(3)" : "NULL";
    await connection.execute(`UPDATE verificaciones_identidad SET estado=?, metodo=?, responsable_id=?,
      verificada_en=${verifiedAt}, revocada_en=${revoked} WHERE usuario_id=?`, [next, method, actorId, userId]);
    await insertAudit(connection, "IDENTIDAD", userId, null, actorId, before, next, method, reason);
    return { usuarioId: userId, estado: next };
  });
}

export async function reviewZoneMembership(id: string, actorId: string, action: ReviewAction, method: ReviewMethod,
  reason: string | null, expiresAt: Date | null) {
  return transaction(async (connection) => {
    const [rows] = await connection.execute<RowDataPacket[]>(`SELECT usuario_id AS usuarioId, sector_id AS sectorId,
      estado, vence_en AS venceEn FROM pertenencias_zona WHERE pertenencia_id=? FOR UPDATE`, [id]);
    if (!rows.length) throw new AppError(404, "ZONE_REQUEST_NOT_FOUND", "No encontramos la solicitud de zona.");
    const userId = String(rows[0].usuarioId), sectorId = String(rows[0].sectorId);
    if (userId === actorId) throw new AppError(403, "SELF_REVIEW_FORBIDDEN", "No puedes aprobar tu propia pertenencia a una zona.");
    const before = String(rows[0].estado) as VerificationState;
    const next = nextReviewState(before, action);
    if (action === "aprobar" && expiresAt && expiresAt.getTime() <= Date.now()) {
      throw new AppError(400, "INVALID_EXPIRATION", "El vencimiento debe ser una fecha futura.");
    }
    await connection.execute(`UPDATE pertenencias_zona SET estado=?, metodo=?, responsable_id=?,
      verificada_en=${action === "aprobar" ? "UTC_TIMESTAMP(3)" : action === "revocar" ? "verificada_en" : "NULL"},
      vence_en=?, revocada_en=${action === "revocar" ? "UTC_TIMESTAMP(3)" : "NULL"}
      WHERE pertenencia_id=?`, [next, method, actorId, action === "aprobar" ? expiresAt : null, id]);
    await insertAudit(connection, "ZONA", userId, sectorId, actorId, before, next, method, reason);
    return { id, usuarioId: userId, sectorId, estado: next, venceEn: action === "aprobar" ? expiresAt : null };
  });
}

function nextReviewState(before: VerificationState, action: ReviewAction): VerificationState {
  if (action === "aprobar" || action === "rechazar") {
    if (before !== "PENDIENTE") throw new AppError(409, "REVIEW_NOT_PENDING", "Solo puedes aprobar o rechazar solicitudes pendientes.");
    return action === "aprobar" ? "VERIFICADA" : "RECHAZADA";
  }
  if (before !== "VERIFICADA") throw new AppError(409, "REVIEW_NOT_VERIFIED", "Solo puedes revocar una verificación vigente.");
  return "REVOCADA";
}

async function insertAudit(connection: PoolConnection, type: "IDENTIDAD" | "ZONA", subjectId: string,
  sectorId: string | null, actorId: string, previous: VerificationState | null, next: VerificationState,
  method: string, reason: string | null) {
  await connection.execute(`INSERT INTO auditoria_verificaciones
    (tipo, usuario_afectado_id, sector_id, actor_id, estado_anterior, estado_nuevo, metodo, motivo)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, [type, subjectId, sectorId, actorId, previous, next, method, reason]);
}

/** Reusable guard for the forthcoming recommendation API. Both parties must hold
 * active identity accreditation and verified membership in the publication's zone. */
export async function assertInteractionEligibleForVerifiedRecommendation(connection: PoolConnection,
  requesterId: string, ownerId: string, sectorId: string) {
  if (requesterId === ownerId) throw new AppError(403, "SELF_RECOMMENDATION_FORBIDDEN", "No puedes recomendar tu propia publicación.");
  for (const userId of [requesterId, ownerId]) {
    const [identity] = await connection.execute<RowDataPacket[]>(`SELECT estado FROM verificaciones_identidad
      WHERE usuario_id=? FOR SHARE`, [userId]);
    if (identity[0]?.estado !== "VERIFICADA") {
      throw new AppError(409, "IDENTITY_NOT_VERIFIED", "La recomendación requiere identidad acreditada de ambas personas.");
    }
    const [zone] = await connection.execute<RowDataPacket[]>(`SELECT pertenencia_id FROM pertenencias_zona
      WHERE usuario_id=? AND sector_id=? AND estado='VERIFICADA'
        AND (vence_en IS NULL OR vence_en > UTC_TIMESTAMP(3)) AND revocada_en IS NULL
      LIMIT 1 FOR SHARE`, [userId, sectorId]);
    if (!zone.length) throw new AppError(409, "ZONE_NOT_VERIFIED", "Ambas personas deben tener pertenencia vigente a la zona de la publicación.");
  }
}
