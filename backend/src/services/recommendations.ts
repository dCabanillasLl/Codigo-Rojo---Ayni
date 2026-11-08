import type { PoolConnection, RowDataPacket } from "mysql2/promise";
import { z } from "zod";
import { assertAllowedCommunityText } from "../lib/request-policy.js";
import { AppError } from "../lib/http.js";
import { idSchema } from "../lib/validation.js";
import { one, query, transaction } from "../db/index.js";
import { publicName } from "./community-data.js";
import { deriveRecommendationVerificationState } from "./recommendation-rules.js";
import type { PublicationInteractionState, RecommendationVerificationState } from "../models/recommendations.js";

export const recommendationInputSchema = z.object({
  calificacion: z.number().int().min(1).max(5),
  comentario: z.string().trim().max(1200).nullable().optional(),
  interaccionId: idSchema.nullable().optional(),
}).strict();

export const recommendationListSchema = z.object({
  filtro: z.enum(["todas", "verificadas", "no_verificadas", "pendientes"]).default("todas"),
  pagina: z.coerce.number().int().min(1).max(10000).default(1),
  porPagina: z.coerce.number().int().min(1).max(100).default(20),
  orden: z.enum(["recientes", "antiguas"]).default("recientes"),
}).strict();

export type RecommendationInput = z.infer<typeof recommendationInputSchema>;
export type RecommendationListOptions = z.infer<typeof recommendationListSchema>;

interface InteractionEvidenceRow extends RowDataPacket {
  id: string; publicacionId: string; solicitanteId: string; propietarioId: string;
  estado: PublicationInteractionState; solicitanteConfirmoEn: Date | null;
  propietarioConfirmoEn: Date | null; confirmadaEn: Date | null;
}

const currentState = `(CASE
  WHEN r.interaccion_id IS NULL THEN 'NO_VERIFICADA'
  WHEN i.interaccion_id IS NULL OR i.estado IN ('RECHAZADA','CANCELADA') THEN 'NO_VERIFICADA'
  WHEN i.publicacion_id=r.publicacion_id AND i.solicitante_id=r.usuario_id AND i.propietario_id=p.propietario_id
    AND i.estado='CONFIRMADA' AND i.solicitante_confirmo_en IS NOT NULL AND i.propietario_confirmo_en IS NOT NULL AND i.confirmada_en IS NOT NULL
    AND EXISTS (SELECT 1 FROM verificaciones_identidad vi WHERE vi.usuario_id=r.usuario_id
      AND vi.estado='VERIFICADA' AND vi.verificada_en IS NOT NULL AND vi.revocada_en IS NULL)
    AND EXISTS (SELECT 1 FROM pertenencias_zona pz WHERE pz.usuario_id=r.usuario_id AND pz.sector_id=l.sector_id
      AND pz.estado='VERIFICADA' AND pz.verificada_en IS NOT NULL AND pz.revocada_en IS NULL
      AND (pz.vence_en IS NULL OR pz.vence_en>UTC_TIMESTAMP(3)))
    THEN 'VERIFICADA'
  WHEN i.estado IN ('PENDIENTE','ACEPTADA','EN_CURSO','CONFIRMADA') THEN 'PENDIENTE'
  ELSE 'NO_VERIFICADA' END)`;

const recommendationFrom = `FROM resenas r
  JOIN publicaciones p ON p.publicacion_id=r.publicacion_id
  JOIN ubicaciones l ON l.ubicacion_id=p.ubicacion_id
  JOIN usuarios u ON u.usuario_id=r.usuario_id
  LEFT JOIN interacciones_publicacion i ON i.interaccion_id=r.interaccion_id`;

async function publicationVisible(publicationId: string, viewerId?: string) {
  const publication = await one<{ propietarioId: string; estado: string }>(`SELECT CAST(propietario_id AS CHAR) AS propietarioId, estado
    FROM publicaciones WHERE publicacion_id=?`, [publicationId]);
  if (!publication || (publication.estado !== "publicada" && publication.propietarioId !== viewerId)) {
    throw new AppError(404, "PUBLICATION_NOT_FOUND", "No encontramos esta publicación.");
  }
  return publication;
}

async function authorEligibility(connection: PoolConnection, authorId: string, sectorId: string) {
  const [rows] = await connection.execute<RowDataPacket[]>(`SELECT
    EXISTS(SELECT 1 FROM verificaciones_identidad vi WHERE vi.usuario_id=? AND vi.estado='VERIFICADA'
      AND vi.verificada_en IS NOT NULL AND vi.revocada_en IS NULL) AS identidad,
    EXISTS(SELECT 1 FROM pertenencias_zona pz WHERE pz.usuario_id=? AND pz.sector_id=? AND pz.estado='VERIFICADA'
      AND pz.verificada_en IS NOT NULL AND pz.revocada_en IS NULL
      AND (pz.vence_en IS NULL OR pz.vence_en>UTC_TIMESTAMP(3))) AS zona`, [authorId, authorId, sectorId]);
  return { identidad: Number(rows[0]?.identidad) === 1, zona: Number(rows[0]?.zona) === 1 };
}

export async function createPublicationRecommendation(authorId: string, publicationId: string, data: RecommendationInput) {
  const parsedPublicationId = idSchema.parse(publicationId);
  const comment = data.comentario?.trim() || null;
  if (comment) assertAllowedCommunityText(comment);
  try {
    const reviewId = await transaction(async (connection) => {
      const [publicationRows] = await connection.execute<RowDataPacket[]>(`SELECT CAST(p.propietario_id AS CHAR) AS propietarioId,
        CAST(l.sector_id AS CHAR) AS sectorId, p.estado FROM publicaciones p
        JOIN ubicaciones l ON l.ubicacion_id=p.ubicacion_id WHERE p.publicacion_id=? FOR UPDATE`, [parsedPublicationId]);
      const publication = publicationRows[0];
      if (!publication || publication.estado !== "publicada") throw new AppError(404, "PUBLICATION_NOT_FOUND", "No encontramos una publicación disponible.");
      if (String(publication.propietarioId) === authorId) throw new AppError(409, "SELF_REVIEW_FORBIDDEN", "No puedes recomendar tu propia publicación.");

      const [userRows] = await connection.execute<RowDataPacket[]>("SELECT usuario_id FROM usuarios WHERE usuario_id=? AND estado_cuenta='activo' FOR SHARE", [authorId]);
      if (!userRows.length) throw new AppError(401, "UNAUTHENTICATED", "Inicia sesión para continuar.");
      const [existingReviews] = await connection.execute<RowDataPacket[]>(`SELECT resena_id FROM resenas
        WHERE publicacion_id=? AND usuario_id=? FOR UPDATE`, [parsedPublicationId, authorId]);
      if (existingReviews.length) throw new AppError(409, "REVIEW_ALREADY_EXISTS", "Ya compartiste una opinión sobre esta publicación.");

      let status: RecommendationVerificationState = "NO_VERIFICADA";
      if (data.interaccionId) {
        const [interactions] = await connection.execute<InteractionEvidenceRow[]>(`SELECT CAST(interaccion_id AS CHAR) AS id,
          CAST(publicacion_id AS CHAR) AS publicacionId, CAST(solicitante_id AS CHAR) AS solicitanteId,
          CAST(propietario_id AS CHAR) AS propietarioId, estado, solicitante_confirmo_en AS solicitanteConfirmoEn,
          propietario_confirmo_en AS propietarioConfirmoEn, confirmada_en AS confirmadaEn
          FROM interacciones_publicacion WHERE interaccion_id=? FOR SHARE`, [data.interaccionId]);
        const interaction = interactions[0];
        if (!interaction || interaction.publicacionId !== parsedPublicationId || interaction.solicitanteId !== authorId ||
            interaction.propietarioId !== String(publication.propietarioId)) {
          throw new AppError(409, "INTERACTION_MISMATCH", "La experiencia no corresponde a tu cuenta, a esta publicación y a su proveedor.");
        }
        if (interaction.estado === "RECHAZADA" || interaction.estado === "CANCELADA") {
          throw new AppError(409, "INTERACTION_INVALID", "Una experiencia cancelada o rechazada no puede respaldar una opinión.");
        }
        const eligibility = await authorEligibility(connection, authorId, String(publication.sectorId));
        status = deriveRecommendationVerificationState({
          interactionId: interaction.id,
          interactionState: interaction.estado,
          participantsMatch: interaction.publicacionId === parsedPublicationId && interaction.solicitanteId === authorId,
          providerMatchesPublication: interaction.propietarioId === String(publication.propietarioId),
          authorIsOwner: authorId === String(publication.propietarioId),
          requesterConfirmed: interaction.solicitanteConfirmoEn !== null,
          providerFulfilled: interaction.propietarioConfirmoEn !== null,
          authorIdentityVerified: eligibility.identidad,
          authorZoneVerified: eligibility.zona,
        });
      }

      await connection.execute(`INSERT INTO resenas
        (publicacion_id, usuario_id, interaccion_id, calificacion, comentario, estado_verificacion, verificada_en)
        VALUES (?, ?, ?, ?, ?, ?, ?)` , [parsedPublicationId, authorId, data.interaccionId ?? null, data.calificacion,
        comment, status, status === "VERIFICADA" ? new Date() : null]);
      const [idRows] = await connection.execute<RowDataPacket[]>("SELECT CAST(LAST_INSERT_ID() AS CHAR) AS id");
      return String(idRows[0]?.id);
    });
    return await getRecommendationById(reviewId);
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "ER_DUP_ENTRY") {
      throw new AppError(409, "REVIEW_ALREADY_EXISTS", "Esta opinión o experiencia ya tiene una recomendación asociada.");
    }
    throw error;
  }
}

async function getRecommendationById(id: string) {
  const row = await one(`SELECT CAST(r.resena_id AS CHAR) AS id, CAST(r.publicacion_id AS CHAR) AS publicacionId,
    ${publicName("u")} AS autor, r.calificacion, r.comentario, r.creado_en AS creadoEn,
    ${currentState} AS estadoVerificacion, (${currentState}='VERIFICADA') AS vistoBuenoVerificado,
    CASE WHEN ${currentState}='VERIFICADA' THEN COALESCE(r.verificada_en,i.confirmada_en) ELSE NULL END AS verificadaEn
    ${recommendationFrom} WHERE r.resena_id=?`, [id]);
  if (!row) throw new AppError(500, "REVIEW_CREATE_FAILED", "No pudimos recuperar la opinión creada.");
  return row;
}

export async function listPublicationRecommendations(publicationId: string, viewerId: string | undefined, options: RecommendationListOptions) {
  const id = idSchema.parse(publicationId);
  await publicationVisible(id, viewerId);
  const selectedState = options.filtro === "verificadas" ? "VERIFICADA"
    : options.filtro === "no_verificadas" ? "NO_VERIFICADA" : options.filtro === "pendientes" ? "PENDIENTE" : null;
  const filterSql = selectedState ? ` AND ${currentState}=?` : "";
  const count = await one<{ total: number | string }>(`SELECT COUNT(*) AS total ${recommendationFrom}
    WHERE r.publicacion_id=?${filterSql}`, selectedState ? [id, selectedState] : [id]);
  const direction = options.orden === "antiguas" ? "ASC" : "DESC";
  const offset = (options.pagina - 1) * options.porPagina;
  const rows = await query(`SELECT CAST(r.resena_id AS CHAR) AS id, CAST(r.publicacion_id AS CHAR) AS publicacionId,
    ${publicName("u")} AS autor, r.calificacion, r.comentario, r.creado_en AS creadoEn,
    ${currentState} AS estadoVerificacion, (${currentState}='VERIFICADA') AS vistoBuenoVerificado,
    CASE WHEN ${currentState}='VERIFICADA' THEN COALESCE(r.verificada_en,i.confirmada_en) ELSE NULL END AS verificadaEn
    ${recommendationFrom} WHERE r.publicacion_id=?${filterSql}
    ORDER BY r.creado_en ${direction}, r.resena_id ${direction} LIMIT ? OFFSET ?`,
  selectedState ? [id, selectedState, options.porPagina, offset] : [id, options.porPagina, offset]);
  const total = Number(count?.total ?? 0);
  return { data: rows, paginacion: { pagina: options.pagina, porPagina: options.porPagina, total, totalPaginas: Math.ceil(total / options.porPagina) } };
}

export async function getPublicationRecommendationSummary(publicationId: string, viewerId?: string) {
  const id = idSchema.parse(publicationId);
  await publicationVisible(id, viewerId);
  const summary = await one<{ total: number | string; verificadas: number | string; noVerificadas: number | string;
    pendientes: number | string; promedioVerificado: number | string | null; promedioGeneral: number | string | null }>(
    `SELECT COUNT(*) AS total,
      SUM(${currentState}='VERIFICADA') AS verificadas,
      SUM(${currentState}='NO_VERIFICADA') AS noVerificadas,
      SUM(${currentState}='PENDIENTE') AS pendientes,
      AVG(CASE WHEN ${currentState}='VERIFICADA' THEN r.calificacion END) AS promedioVerificado,
      AVG(r.calificacion) AS promedioGeneral ${recommendationFrom} WHERE r.publicacion_id=?`, [id]);
  const own = viewerId ? await one<{ existe: number | string }>(
    "SELECT EXISTS(SELECT 1 FROM resenas WHERE publicacion_id=? AND usuario_id=?) AS existe", [id, viewerId]) : undefined;
  return {
    total: Number(summary?.total ?? 0),
    verificadas: Number(summary?.verificadas ?? 0),
    noVerificadas: Number(summary?.noVerificadas ?? 0),
    pendientes: Number(summary?.pendientes ?? 0),
    promedioVerificado: summary?.promedioVerificado == null ? null : Math.round(Number(summary.promedioVerificado) * 10) / 10,
    promedioGeneral: summary?.promedioGeneral == null ? null : Math.round(Number(summary.promedioGeneral) * 10) / 10,
    miOpinion: Number(own?.existe ?? 0) === 1,
  };
}
