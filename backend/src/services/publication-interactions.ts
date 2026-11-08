import type { PoolConnection, RowDataPacket } from "mysql2/promise";
import { one, query, transaction } from "../db/index.js";
import { AppError } from "../lib/http.js";
import { idSchema } from "../lib/validation.js";
import { decidePublicationInteractionAction, type PublicationInteractionAction, type PublicationInteractionState } from "./publication-interaction-rules.js";

export const publicationInteractionTypes = ["CONSULTA", "COMPRA", "CONTRATACION", "OTRO"] as const;
export type PublicationInteractionType = typeof publicationInteractionTypes[number];

interface InteractionDbRow extends RowDataPacket {
  interaccionId: string; publicacionId: string; solicitanteId: string; propietarioId: string;
  tipo: PublicationInteractionType; estado: PublicationInteractionState;
  solicitanteConfirmoEn: Date | null; propietarioConfirmoEn: Date | null; confirmadaEn: Date | null;
  creadoEn: Date; actualizadoEn: Date; publicacionTitulo: string; publicacionTipo: string;
  solicitante: string; propietario: string; resenaCreada?: boolean | number | string;
}

const viewSelect = `SELECT CAST(i.interaccion_id AS CHAR) AS interaccionId,
  CAST(i.publicacion_id AS CHAR) AS publicacionId, CAST(i.solicitante_id AS CHAR) AS solicitanteId,
  CAST(i.propietario_id AS CHAR) AS propietarioId, i.tipo, i.estado,
  i.solicitante_confirmo_en AS solicitanteConfirmoEn, i.propietario_confirmo_en AS propietarioConfirmoEn,
  i.confirmada_en AS confirmadaEn, i.creado_en AS creadoEn, i.actualizado_en AS actualizadoEn,
  p.titulo AS publicacionTitulo, p.tipo AS publicacionTipo,
  CONCAT(us.nombres, ' ', LEFT(us.apellidos, 1), '.') AS solicitante,
  CONCAT(up.nombres, ' ', LEFT(up.apellidos, 1), '.') AS propietario
  FROM interacciones_publicacion i JOIN publicaciones p ON p.publicacion_id=i.publicacion_id
  JOIN usuarios us ON us.usuario_id=i.solicitante_id JOIN usuarios up ON up.usuario_id=i.propietario_id`;

function toView(row: InteractionDbRow, viewerId: string) {
  const viewerIsRequester = row.solicitanteId === viewerId;
  return {
    id: row.interaccionId,
    publicacionId: row.publicacionId,
    publicacion: { titulo: row.publicacionTitulo, tipo: row.publicacionTipo },
    tipo: row.tipo,
    estado: row.estado,
    miRol: viewerIsRequester ? "SOLICITANTE" : "PROPIETARIO",
    otroParticipante: viewerIsRequester ? row.propietario : row.solicitante,
    creadaEn: row.creadoEn,
    actualizadaEn: row.actualizadoEn,
    cumplimientoMarcado: row.propietarioConfirmoEn !== null,
    cumplimientoMarcadoEn: row.propietarioConfirmoEn,
    recepcionConfirmada: row.solicitanteConfirmoEn !== null,
    recepcionConfirmadaEn: row.solicitanteConfirmoEn,
    confirmadaEn: row.confirmadaEn,
    // mysql2 may return EXISTS as a numeric string when bigNumberStrings is enabled.
    resenaCreada: row.resenaCreada === true || row.resenaCreada === 1 || row.resenaCreada === "1",
  };
}

async function lockInteraction(connection: PoolConnection, id: string, viewerId: string) {
  const [lookupRows] = await connection.execute<RowDataPacket[]>(`SELECT CAST(publicacion_id AS CHAR) AS publicacionId
    FROM interacciones_publicacion WHERE interaccion_id=? AND (solicitante_id=? OR propietario_id=?)`, [id, viewerId, viewerId]);
  if (!lookupRows[0]) throw new AppError(404, "INTERACTION_NOT_FOUND", "No encontramos esta interacción.");
  // All mutations lock publication first, interaction second, matching creation's lock order.
  await connection.execute("SELECT publicacion_id FROM publicaciones WHERE publicacion_id=? FOR UPDATE", [lookupRows[0].publicacionId]);
  const [rows] = await connection.execute<InteractionDbRow[]>(`SELECT CAST(interaccion_id AS CHAR) AS interaccionId,
    CAST(publicacion_id AS CHAR) AS publicacionId, CAST(solicitante_id AS CHAR) AS solicitanteId,
    CAST(propietario_id AS CHAR) AS propietarioId, tipo, estado,
    solicitante_confirmo_en AS solicitanteConfirmoEn, propietario_confirmo_en AS propietarioConfirmoEn,
    confirmada_en AS confirmadaEn, creado_en AS creadoEn, actualizado_en AS actualizadoEn,
    '' AS publicacionTitulo, '' AS publicacionTipo, '' AS solicitante, '' AS propietario
    FROM interacciones_publicacion WHERE interaccion_id=? AND (solicitante_id=? OR propietario_id=?) FOR UPDATE`,
  [id, viewerId, viewerId]);
  const row = rows[0];
  if (!row) throw new AppError(404, "INTERACTION_NOT_FOUND", "No encontramos esta interacción.");
  return row;
}

export async function createPublicationInteraction(userId: string, publicationId: string, tipo: PublicationInteractionType) {
  const parsedId = idSchema.parse(publicationId);
  const result = await transaction(async (connection) => {
    const [publicationRows] = await connection.execute<RowDataPacket[]>(`SELECT CAST(p.publicacion_id AS CHAR) AS publicacionId,
      CAST(p.propietario_id AS CHAR) AS propietarioId FROM publicaciones p JOIN usuarios u ON u.usuario_id=p.propietario_id
      WHERE p.publicacion_id=? AND p.estado='publicada' AND u.estado_cuenta='activo' FOR UPDATE`, [parsedId]);
    const publication = publicationRows[0];
    if (!publication) throw new AppError(404, "PUBLICATION_NOT_AVAILABLE", "La publicación no existe o ya no está disponible.");
    const ownerId = String(publication.propietarioId);
    if (ownerId === userId) throw new AppError(409, "SELF_INTERACTION", "No puedes iniciar una interacción con tu propia publicación.");

    // Serializing creation on the publication row prevents simultaneous active duplicates.
    const [existingRows] = await connection.execute<RowDataPacket[]>(`SELECT CAST(interaccion_id AS CHAR) AS id, tipo
      FROM interacciones_publicacion WHERE publicacion_id=? AND solicitante_id=?
        AND estado IN ('PENDIENTE','ACEPTADA','EN_CURSO') ORDER BY interaccion_id DESC LIMIT 1 FOR UPDATE`, [parsedId, userId]);
    if (existingRows[0]) {
      if (String(existingRows[0].tipo) !== tipo) {
        throw new AppError(409, "ACTIVE_INTERACTION_EXISTS", "Ya tienes una interacción activa con esta publicación. Cancélala o espera a que concluya antes de iniciar otra.");
      }
      return { id: String(existingRows[0].id), reused: true };
    }

    const [inserted] = await connection.execute(`INSERT INTO interacciones_publicacion
      (publicacion_id, solicitante_id, propietario_id, tipo, estado) VALUES (?, ?, ?, ?, 'PENDIENTE')`,
    [parsedId, userId, ownerId, tipo]);
    return { id: String((inserted as { insertId: number | bigint }).insertId), reused: false };
  });
  const row = await one<InteractionDbRow>(`${viewSelect} WHERE i.interaccion_id=?`, [result.id]);
  if (!row) throw new AppError(500, "INTERACTION_CREATE_FAILED", "No pudimos crear la interacción.");
  return { data: toView(row, userId), reused: result.reused };
}

export async function listMyPublicationInteractions(userId: string, publicationId?: string) {
  const params: unknown[] = [userId, userId, userId];
  const publicationFilter = publicationId ? " AND i.publicacion_id=?" : "";
  if (publicationId) params.push(idSchema.parse(publicationId));
  const listSelect = viewSelect.replace("  FROM interacciones_publicacion i",
    "  , EXISTS(SELECT 1 FROM resenas r WHERE r.interaccion_id=i.interaccion_id AND r.usuario_id=?) AS resenaCreada\n  FROM interacciones_publicacion i");
  const rows = await query<InteractionDbRow>(`${listSelect}
    WHERE (i.solicitante_id=? OR i.propietario_id=?)${publicationFilter}
    ORDER BY i.actualizado_en DESC, i.interaccion_id DESC LIMIT 100`, params);
  return rows.map((row) => toView(row, userId));
}

export async function getPublicationInteraction(id: string, userId: string) {
  const parsedId = idSchema.parse(id);
  const row = await one<InteractionDbRow>(`${viewSelect}
    WHERE i.interaccion_id=? AND (i.solicitante_id=? OR i.propietario_id=?)`, [parsedId, userId, userId]);
  if (!row) throw new AppError(404, "INTERACTION_NOT_FOUND", "No encontramos esta interacción.");
  return toView(row, userId);
}

export async function updatePublicationInteraction(userId: string, id: string, accion: PublicationInteractionAction) {
  const parsedId = idSchema.parse(id);
  await transaction(async (connection) => {
    const row = await lockInteraction(connection, parsedId, userId);
    const role = row.solicitanteId === userId ? "SOLICITANTE" : "PROPIETARIO";
    const decision = decidePublicationInteractionAction({
      estado: row.estado,
      rol: role,
      solicitanteConfirmo: row.solicitanteConfirmoEn !== null,
      propietarioConfirmo: row.propietarioConfirmoEn !== null,
    }, accion);
    if (decision.sinCambios) return;
    await connection.execute(`UPDATE interacciones_publicacion SET estado=?,
      propietario_confirmo_en=CASE WHEN ? THEN COALESCE(propietario_confirmo_en, UTC_TIMESTAMP(3)) ELSE propietario_confirmo_en END,
      solicitante_confirmo_en=CASE WHEN ? THEN COALESCE(solicitante_confirmo_en, UTC_TIMESTAMP(3)) ELSE solicitante_confirmo_en END,
      confirmada_en=CASE WHEN ?='CONFIRMADA' THEN COALESCE(confirmada_en, UTC_TIMESTAMP(3)) ELSE confirmada_en END
      WHERE interaccion_id=?`, [decision.estado, decision.marcarCumplimiento ? 1 : 0,
      decision.confirmarRecepcion ? 1 : 0, decision.estado, parsedId]);
  });
  return getPublicationInteraction(parsedId, userId);
}

/** Fase 5 can use this query as the sole evidence source for a verified publication review. */
export async function getConfirmedPublicationInteraction(connection: PoolConnection, id: string, requesterId: string, publicationId: string) {
  const [rows] = await connection.execute<RowDataPacket[]>(`SELECT CAST(interaccion_id AS CHAR) AS id,
    CAST(publicacion_id AS CHAR) AS publicacionId, CAST(solicitante_id AS CHAR) AS solicitanteId,
    CAST(propietario_id AS CHAR) AS propietarioId, tipo, confirmada_en AS confirmadaEn
    FROM interacciones_publicacion WHERE interaccion_id=? AND publicacion_id=? AND solicitante_id=?
      AND estado='CONFIRMADA' AND solicitante_confirmo_en IS NOT NULL AND propietario_confirmo_en IS NOT NULL AND confirmada_en IS NOT NULL`,
  [idSchema.parse(id), idSchema.parse(publicationId), idSchema.parse(requesterId)]);
  if (!rows[0]) throw new AppError(409, "CONFIRMED_EXPERIENCE_REQUIRED", "La reseña requiere una experiencia confirmada para esta publicación.");
  return rows[0];
}
