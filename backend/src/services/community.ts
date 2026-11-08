import type { PoolConnection } from 'mysql2/promise';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { one, query, transaction } from '../db/index.js';
import { AppError } from '../lib/http.js';
import { locationSchema } from '../lib/validation.js';
import { publicMapColumns } from '../lib/location.js';
import { sendCommunityEmail } from './email.js';
import { assertAllowedCommunityText, assertAllowedRequestText, generateRequestTitle } from '../lib/request-policy.js';
import { approximateDistance, createLocation, geoClause, idSchema, insert, publicName, row, rows, uuidSchema, type ListOptions } from './community-data.js';
import { assertCanCloseRequest, assertRequestActive, contentHash, requireSameContent, transitionOffer, type OfferState, type RequestState } from './community-rules.js';

export const createRequestSchema = z.object({
  clientRequestId: uuidSchema,
  categoriaId: idSchema,
  sectorId: idSchema,
  ubicacion: locationSchema.optional(),
  titulo: z.string().trim().min(5).max(160).optional(),
  descripcion: z.string().trim().min(5).max(5000),
  urgencia: z.enum(['normal', 'urgente']).default('normal'),
}).strict();
export const closeRequestSchema = z.object({
  accion: z.enum(['completar', 'cancelar']),
  motivo: z.string().trim().min(5).max(1200).optional(),
}).strict().refine((data) => data.accion !== 'cancelar' || !!data.motivo, {
  message: 'Explica por qué cancelas el pedido.', path: ['motivo'],
});
export const offerSchema = z.object({ mensaje: z.string().trim().min(5).max(1200) }).strict();
export const offerActionSchema = z.object({
  accion: z.enum(['aceptar', 'rechazar', 'retirar', 'entregar', 'confirmar']),
  motivo: z.string().trim().min(3).max(1200).optional(),
}).strict();
export const reviewSchema = z.object({
  calificacion: z.number().int().min(1).max(5),
  comentario: z.string().trim().max(1200).optional(),
}).strict();

function notificationExcerpt(value: string, maxLength = 240): string {
  const normalized = value.replace(/\s+/g, ' ').trim();
  const characters = Array.from(normalized);
  return characters.length > maxLength ? `${characters.slice(0, maxLength - 1).join('').trimEnd()}…` : normalized;
}

async function notifyInteraction(connection: PoolConnection, recipientId: string, requestId: string, offerId: string, type: string, text: string) {
  await connection.execute(`INSERT INTO notificaciones_interacciones
    (notificacion_id, usuario_id, solicitud_id, oferta_id, tipo, texto)
    VALUES (?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE texto = VALUES(texto)`,
  [randomUUID(), recipientId, requestId, offerId, type, notificationExcerpt(text, 500)]);
}

interface RequestLock {
  solicitud_id: string;
  solicitante_id: string;
  estado: RequestState;
  vencida: number | string;
}
interface OfferLock {
  oferta_id: string;
  solicitud_id: string;
  voluntario_id: string;
  estado: OfferState;
  entregada_en: Date | null;
  confirmada_en: Date | null;
}
interface PublicRequest {
  id: string; solicitanteId: string; solicitante: string; categoriaId: string;
  categoria: string; sectorId: string; sectorNombre: string; titulo: string;
  descripcion: string; urgencia: string; estado: RequestState; creadoEn: Date; venceEn: Date | null;
  distanciaMetros: number | string | null; clientRequestId: string | null;
  motivoCancelacion: string | null;
  miAporteEstado?: OfferState | null;
}
const requestColumns = `CAST(s.solicitud_id AS CHAR) AS id,
  CAST(s.solicitante_id AS CHAR) AS solicitanteId, ${publicName('u')} AS solicitante,
  CAST(s.categoria_ayuda_id AS CHAR) AS categoriaId, c.nombre AS categoria,
  CAST(l.sector_id AS CHAR) AS sectorId, v.nombre AS sectorNombre,
  s.titulo, s.descripcion, s.urgencia, s.estado, s.creado_en AS creadoEn, s.vence_en AS venceEn,
  s.client_request_id AS clientRequestId, s.motivo_cancelacion AS motivoCancelacion,
  ${publicMapColumns}`;
const requestFrom = `FROM solicitudes_ayuda s
  JOIN usuarios u ON u.usuario_id = s.solicitante_id
  JOIN ubicaciones l ON l.ubicacion_id = s.ubicacion_id
  JOIN sectores_vecinales v ON v.sector_id = l.sector_id
  JOIN categorias_ayuda c ON c.categoria_ayuda_id = s.categoria_ayuda_id`;

function privateRequestFields(request: PublicRequest, userId?: string): PublicRequest {
  return approximateDistance({ ...request, clientRequestId: request.solicitanteId === userId ? request.clientRequestId : null });
}
export async function listRequests(options: ListOptions, userId?: string): Promise<PublicRequest[]> {
  if ((options.mios === '1' || options.participando === '1') && !userId) throw new AppError(401, 'AUTH_REQUIRED', 'Inicia sesión para ver tus pedidos y aportes.');
  await expireOpenRequests();
  const geo = geoClause(options);
  const participating = options.participando === '1';
  const conditions = ["u.estado_cuenta = 'activo'", ...geo.where];
  const params = [...geo.whereParams];
  if (options.mios === '1') {
    conditions.push('s.solicitante_id = ?'); params.push(userId);
  } else if (options.participando === '1') {
    conditions.push('mi_aporte.oferta_id IS NOT NULL');
  } else {
    conditions.push("s.estado IN ('abierta','en_curso')", '(s.vence_en IS NULL OR s.vence_en > UTC_TIMESTAMP())');
    if (userId) { conditions.push('s.solicitante_id <> ?'); params.push(userId); }
  }
  if (options.q) { conditions.push('(s.titulo LIKE ? OR s.descripcion LIKE ?)'); params.push(`%${options.q}%`, `%${options.q}%`); }
  if (options.sectorId) { conditions.push('l.sector_id = ?'); params.push(options.sectorId); }
  if (options.categoriaId) { conditions.push('s.categoria_ayuda_id = ?'); params.push(options.categoriaId); }
  if (options.urgencia) { conditions.push('s.urgencia = ?'); params.push(options.urgencia); }
  const result = await query<PublicRequest>(`SELECT ${requestColumns}, ${geo.select}${participating ? ', mi_aporte.estado AS miAporteEstado' : ''}
    ${requestFrom}${participating ? ' JOIN ofertas_ayuda mi_aporte ON mi_aporte.solicitud_id = s.solicitud_id AND mi_aporte.voluntario_id = ?' : ''}
    WHERE ${conditions.join(' AND ')} ${geo.having}
    ORDER BY s.urgencia = 'urgente' DESC, s.creado_en DESC LIMIT 100`,
  [...geo.selectParams, ...(participating ? [userId] : []), ...params, ...geo.havingParams]);
  return result.map((request) => privateRequestFields(request, userId));
}
export async function getRequest(id: string, userId?: string): Promise<PublicRequest> {
  await expireOpenRequests();
  const request = await one<PublicRequest>(`SELECT ${requestColumns}, NULL AS distanciaMetros ${requestFrom}
    WHERE s.solicitud_id = ? AND u.estado_cuenta = 'activo'`, [id]);
  if (!request) throw new AppError(404, 'REQUEST_NOT_FOUND', 'No se encontró el pedido.');
  return privateRequestFields(request, userId);
}
async function expireOpenRequests(): Promise<void> {
  await transaction(async (connection) => {
    await connection.execute(`UPDATE solicitudes_ayuda SET estado = 'vencida'
      WHERE estado = 'abierta' AND vence_en IS NOT NULL AND vence_en <= UTC_TIMESTAMP()`);
    await connection.execute(`UPDATE ofertas_ayuda o
      JOIN solicitudes_ayuda s ON s.solicitud_id = o.solicitud_id
      SET o.estado = 'rechazada', o.motivo_cancelacion = 'El pedido venció antes de aceptar la propuesta.'
      WHERE s.estado = 'vencida' AND o.estado = 'pendiente'`);
  });
}
async function lockRequest(connection: PoolConnection, id: string): Promise<RequestLock> {
  const request = await row<RequestLock>(connection, `SELECT CAST(solicitud_id AS CHAR) AS solicitud_id,
    CAST(solicitante_id AS CHAR) AS solicitante_id, estado,
    (vence_en IS NOT NULL AND vence_en <= UTC_TIMESTAMP()) AS vencida
    FROM solicitudes_ayuda WHERE solicitud_id = ? FOR UPDATE`, [id]);
  if (!request) throw new AppError(404, 'REQUEST_NOT_FOUND', 'No se encontró el pedido.');
  return request;
}
function assertNotExpired(request: RequestLock): void {
  if (Number(request.vencida) !== 0) throw new AppError(409, 'REQUEST_EXPIRED', 'Este pedido venció y ya no acepta nuevas colaboraciones.');
}
export async function createRequest(userId: string, data: z.infer<typeof createRequestSchema>): Promise<{ request: PublicRequest; replayed: boolean }> {
  assertAllowedRequestText(data.descripcion);
  assertAllowedRequestText(data.titulo ?? '');
  const title = generateRequestTitle(data.descripcion);
  const fingerprint = contentHash({ categoriaId: data.categoriaId, sectorId: data.sectorId, titulo: data.titulo ?? title, descripcion: data.descripcion, urgencia: data.urgencia, ...(data.ubicacion ? { ubicacion: data.ubicacion } : {}) });
  const result = await transaction(async (connection) => {
    // Serializes creations for one user. UNIQUE remains the final protection against races.
    await row(connection, 'SELECT usuario_id FROM usuarios WHERE usuario_id = ? FOR UPDATE', [userId]);
    const previous = await row<{ id: string; request_hash: string }>(connection,
      'SELECT CAST(solicitud_id AS CHAR) AS id, request_hash FROM solicitudes_ayuda WHERE solicitante_id = ? AND client_request_id = ? FOR UPDATE',
      [userId, data.clientRequestId]);
    if (previous) { requireSameContent(previous.request_hash, fingerprint); return { id: previous.id, replayed: true }; }
    const category = await row<{ categoria_ayuda_id: string; nombre: string }>(connection, 'SELECT categoria_ayuda_id, nombre FROM categorias_ayuda WHERE categoria_ayuda_id = ?', [data.categoriaId]);
    if (!category) throw new AppError(400, 'UNKNOWN_CATEGORY', 'Selecciona una categoría de ayuda disponible.');
    const categoryName = category.nombre.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es');
    const urgent = categoryName.includes('urgent');
    const urgency = urgent ? 'urgente' : 'normal';
    const expiryHours = urgent ? 24 : categoryName.includes('favor') ? 72 : 168;
    const locationId = await createLocation(connection, userId, data.sectorId, data.ubicacion);
    const id = await insert(connection, `INSERT INTO solicitudes_ayuda
      (solicitante_id, categoria_ayuda_id, ubicacion_id, titulo, descripcion, urgencia, client_request_id, request_hash, vence_en)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, DATE_ADD(UTC_TIMESTAMP(), INTERVAL ? HOUR))`,
    [userId, data.categoriaId, locationId, title, data.descripcion, urgency, data.clientRequestId, fingerprint, expiryHours]);
    return { id, replayed: false };
  });
  return { request: await getRequest(result.id, userId), replayed: result.replayed };
}
export async function closeRequest(userId: string, id: string, data: z.infer<typeof closeRequestSchema>): Promise<PublicRequest> {
  await transaction(async (connection) => {
    const request = await lockRequest(connection, id);
    if (request.solicitante_id !== userId) throw new AppError(403, 'FORBIDDEN', 'Solo quien publicó el pedido puede cerrarlo.');
    const target = data.accion === 'completar' ? 'completada' : 'cancelada';
    if (request.estado === target) return;
    if (request.estado !== 'vencida') assertRequestActive(request.estado);
    const contributions = await row<{ total: number }>(connection,
      "SELECT COUNT(*) AS total FROM ofertas_ayuda WHERE solicitud_id = ? AND estado = 'aceptada'", [id]);
    assertCanCloseRequest(Number(contributions?.total ?? 0));
    const reservation = await row(connection,
      "SELECT reserva_id FROM reservas_recursos WHERE solicitud_id = ? AND estado = 'reservada' LIMIT 1", [id]);
    if (reservation) throw new AppError(409, 'PENDING_RESERVATIONS', 'Revisa las reservas de recursos pendientes de entrega antes de cerrar este pedido.');
    const collaborators = await rows<{ offerId: string; userId: string }>(connection,
      `SELECT CAST(oferta_id AS CHAR) AS offerId, CAST(voluntario_id AS CHAR) AS userId FROM ofertas_ayuda
       WHERE solicitud_id = ? AND estado ${target === 'completada' ? '= \'completada\'' : 'NOT IN (\'rechazada\',\'retirada\')'} FOR UPDATE`, [id]);
    await connection.execute(`UPDATE solicitudes_ayuda SET estado = ?, motivo_cancelacion = ?,
      completada_en = CASE WHEN ? = 'completada' THEN UTC_TIMESTAMP() ELSE completada_en END WHERE solicitud_id = ?`,
    [target, data.accion === 'cancelar' ? data.motivo! : null, target, id]);
    await connection.execute("UPDATE ofertas_ayuda SET estado = 'rechazada', motivo_cancelacion = 'El solicitante cerró el pedido.' WHERE solicitud_id = ? AND estado = 'pendiente'", [id]);
    // Pending reservations do not consume inventory; accepted reservations are blocked above.
    await connection.execute("UPDATE reservas_recursos SET estado = 'cancelada', cancelada_en = UTC_TIMESTAMP() WHERE solicitud_id = ? AND estado = 'pendiente'", [id]);
    for (const collaborator of collaborators) await notifyInteraction(connection, collaborator.userId, id, collaborator.offerId,
      target === 'completada' ? 'pedido_completado' : 'pedido_cancelado',
      target === 'completada' ? 'El pedido quedó resuelto. Gracias por aportar; tu reputación ya refleja esta ayuda confirmada.' : 'El pedido fue cancelado por quien lo publicó.');
  });
  return getRequest(id, userId);
}

interface OfferView {
  id: string; solicitudId: string; voluntarioId: string; voluntario: string;
  mensaje: string; estado: OfferState; entregadaEn: Date | null; confirmadaEn: Date | null;
  motivoCancelacion: string | null;
  resenaSolicitanteId: string | null; calificacionSolicitante: number | null; comentarioSolicitante: string | null;
  resenaColaboradorId: string | null; calificacionColaborador: number | null; comentarioColaborador: string | null;
}
const offerColumns = `CAST(o.oferta_id AS CHAR) AS id, CAST(o.solicitud_id AS CHAR) AS solicitudId,
  CAST(o.voluntario_id AS CHAR) AS voluntarioId, ${publicName('u')} AS voluntario,
  o.mensaje, o.estado, o.entregada_en AS entregadaEn, o.confirmada_en AS confirmadaEn,
  o.motivo_cancelacion AS motivoCancelacion,
  CAST(rs.resena_colaboracion_id AS CHAR) AS resenaSolicitanteId, rs.calificacion AS calificacionSolicitante,
  rs.comentario AS comentarioSolicitante,
  CAST(rv.resena_colaboracion_id AS CHAR) AS resenaColaboradorId, rv.calificacion AS calificacionColaborador,
  rv.comentario AS comentarioColaborador`;
const offerFrom = `FROM ofertas_ayuda o JOIN usuarios u ON u.usuario_id = o.voluntario_id
  JOIN solicitudes_ayuda s ON s.solicitud_id = o.solicitud_id
  LEFT JOIN resenas_colaboracion rs ON rs.oferta_id = o.oferta_id AND rs.autor_id = s.solicitante_id
  LEFT JOIN resenas_colaboracion rv ON rv.oferta_id = o.oferta_id AND rv.autor_id = o.voluntario_id`;
function offerView(data: OfferView) {
  const { resenaSolicitanteId, calificacionSolicitante, comentarioSolicitante,
    resenaColaboradorId, calificacionColaborador, comentarioColaborador, ...offer } = data;
  const resena = resenaSolicitanteId ? { id: resenaSolicitanteId, calificacion: Number(calificacionSolicitante), comentario: comentarioSolicitante } : null;
  const resenaColaborador = resenaColaboradorId ? { id: resenaColaboradorId, calificacion: Number(calificacionColaborador), comentario: comentarioColaborador } : null;
  return { ...offer, entregaPendiente: offer.estado === 'aceptada' && offer.entregadaEn !== null,
    resena, resenaColaborador };
}
async function getOffer(id: string) {
  const offer = await one<OfferView>(`SELECT ${offerColumns} ${offerFrom} WHERE o.oferta_id = ?`, [id]);
  if (!offer) throw new AppError(404, 'OFFER_NOT_FOUND', 'No se encontró la colaboración.');
  return offerView(offer);
}
export async function listOffers(userId: string, requestId: string) {
  const request = await getRequest(requestId, userId);
  const mineOnly = request.solicitanteId !== userId;
  return (await query<OfferView>(`SELECT ${offerColumns} ${offerFrom} WHERE o.solicitud_id = ?
    ${mineOnly ? 'AND o.voluntario_id = ?' : ''} ORDER BY o.creado_en ASC`, mineOnly ? [requestId, userId] : [requestId])).map(offerView);
}
export async function createOffer(userId: string, requestId: string, data: z.infer<typeof offerSchema>) {
  assertAllowedCommunityText(data.mensaje);
  const result = await transaction(async (connection) => {
    const request = await lockRequest(connection, requestId);
    if (request.solicitante_id === userId) throw new AppError(400, 'SELF_OFFER', 'No puedes ofrecerte en tu propio pedido.');
    const previous = await row<{ id: string; mensaje: string }>(connection,
      'SELECT CAST(oferta_id AS CHAR) AS id, mensaje FROM ofertas_ayuda WHERE solicitud_id = ? AND voluntario_id = ? FOR UPDATE', [requestId, userId]);
    if (previous) {
      if (previous.mensaje !== data.mensaje) throw new AppError(409, 'OFFER_EXISTS', 'Ya tienes una colaboración en este pedido.');
      return { id: previous.id, replayed: true };
    }
    assertRequestActive(request.estado); assertNotExpired(request);
    const id = await insert(connection,
      'INSERT INTO ofertas_ayuda (solicitud_id, voluntario_id, mensaje) VALUES (?, ?, ?)', [requestId, userId, data.mensaje]);
    const details = await row<{ voluntario: string; titulo: string }>(connection,
      `SELECT ${publicName('voluntario')} AS voluntario, s.titulo
       FROM usuarios voluntario JOIN solicitudes_ayuda s ON s.solicitud_id = ?
       WHERE voluntario.usuario_id = ?`, [requestId, userId]);
    const offerText = notificationExcerpt(data.mensaje);
    await notifyInteraction(connection, request.solicitante_id, requestId, id, 'nueva_propuesta',
      `${details?.voluntario ?? 'Un vecino'} te ofrece: “${offerText}” para “${details?.titulo ?? 'tu pedido'}”. Toca para revisar y aceptar o rechazar.`);
    return { id, replayed: false };
  });
  const offer = await getOffer(result.id);
  if (!result.replayed) {
    const recipient = await one<{ correo: string | null; enabled: number; titulo: string; voluntario: string }>(
      `SELECT owner.correo, owner.notificaciones_correo AS enabled, s.titulo, ${publicName('voluntario')} AS voluntario
       FROM solicitudes_ayuda s JOIN usuarios owner ON owner.usuario_id = s.solicitante_id
       JOIN usuarios voluntario ON voluntario.usuario_id = ? WHERE s.solicitud_id = ?`, [userId, requestId]);
    if (recipient?.enabled) await sendCommunityEmail(recipient.correo, 'Alguien ofreció ayudarte en AYNI',
      `Hola, ${offer.voluntario} ofreció ayuda en tu pedido “${recipient.titulo}”.\n\nEntra a AYNI para revisar la propuesta y decidir si la aceptas.`);
  }
  return { offer, replayed: result.replayed };
}
export async function updateOffer(userId: string, id: string, data: z.infer<typeof offerActionSchema>) {
  const lookup = await one<{ solicitudId: string }>(
    'SELECT CAST(solicitud_id AS CHAR) AS solicitudId FROM ofertas_ayuda WHERE oferta_id = ?', [id]);
  if (!lookup) throw new AppError(404, 'OFFER_NOT_FOUND', 'No se encontró la colaboración.');
  const changed = await transaction(async (connection) => {
    // All offer mutations lock the request before the offer, including completion/reviews.
    const request = await lockRequest(connection, lookup.solicitudId);
    const offer = await row<OfferLock>(connection, `SELECT CAST(oferta_id AS CHAR) AS oferta_id,
      CAST(solicitud_id AS CHAR) AS solicitud_id, CAST(voluntario_id AS CHAR) AS voluntario_id,
      estado, entregada_en, confirmada_en FROM ofertas_ayuda WHERE oferta_id = ? FOR UPDATE`, [id]);
    if (!offer) throw new AppError(404, 'OFFER_NOT_FOUND', 'No se encontró la colaboración.');
    if (data.accion === 'aceptar' && offer.estado === 'pendiente') assertNotExpired(request);
    const next = transitionOffer({ action: data.accion, state: offer.estado,
      requester: userId === request.solicitante_id, volunteer: userId === offer.voluntario_id,
      requestState: request.estado, delivered: offer.entregada_en !== null });
    if (next.state === offer.estado && !next.markConfirmed && !next.markDelivered) return false;
    await connection.execute(`UPDATE ofertas_ayuda SET estado = ?,
      entregada_en = CASE WHEN ? THEN COALESCE(entregada_en, UTC_TIMESTAMP()) ELSE entregada_en END,
      confirmada_en = CASE WHEN ? THEN COALESCE(confirmada_en, UTC_TIMESTAMP()) ELSE confirmada_en END,
      motivo_cancelacion = CASE WHEN ? IN ('rechazada','retirada') THEN ? ELSE motivo_cancelacion END
      WHERE oferta_id = ?`,
    [next.state, next.markDelivered, next.markConfirmed, next.state, data.motivo ?? null, id]);
    const actors = await row<{ owner: string; volunteer: string; titulo: string; mensaje: string }>(connection,
      `SELECT ${publicName('owner')} AS owner, ${publicName('volunteer')} AS volunteer, s.titulo, o.mensaje
       FROM ofertas_ayuda o JOIN solicitudes_ayuda s ON s.solicitud_id = o.solicitud_id
       JOIN usuarios owner ON owner.usuario_id = s.solicitante_id
       JOIN usuarios volunteer ON volunteer.usuario_id = o.voluntario_id
       WHERE o.oferta_id = ?`, [id]);
    const contribution = notificationExcerpt(actors?.mensaje ?? 'el aporte acordado');
    const requestTitle = notificationExcerpt(actors?.titulo ?? 'tu pedido', 100);
    const notification = data.accion === 'aceptar' ? { recipient: offer.voluntario_id, type: 'propuesta_aceptada', text: `${actors?.owner ?? 'El vecino'} aceptó tu propuesta “${contribution}” para “${requestTitle}”. Ya pueden coordinar en AYNI.` }
      : data.accion === 'rechazar' ? { recipient: offer.voluntario_id, type: 'propuesta_respondida', text: `${actors?.owner ?? 'El vecino'} no aceptó tu propuesta “${contribution}” para “${requestTitle}”. Gracias por ofrecer tu ayuda.` }
        : data.accion === 'retirar' ? { recipient: request.solicitante_id, type: 'propuesta_retirada', text: `${actors?.volunteer ?? 'Un vecino'} retiró su propuesta “${contribution}” para “${requestTitle}”.` }
          : data.accion === 'entregar' ? { recipient: request.solicitante_id, type: 'aporte_entregado', text: `${actors?.volunteer ?? 'Tu colaborador'} indicó que ya entregó “${contribution}” para “${requestTitle}”. Confirma si lo recibiste.` }
            : { recipient: offer.voluntario_id, type: 'aporte_confirmado', text: `${actors?.owner ?? 'El vecino'} confirmó que recibió “${contribution}” para “${requestTitle}”. Ya puedes dejarle una reseña en AYNI.` };
    await notifyInteraction(connection, notification.recipient, lookup.solicitudId, id, notification.type, notification.text);
    if (data.accion === 'aceptar') {
      await connection.execute("UPDATE solicitudes_ayuda SET estado = 'en_curso' WHERE solicitud_id = ?", [lookup.solicitudId]);
    } else if ((data.accion === 'rechazar' || data.accion === 'retirar') && request.estado === 'en_curso') {
      const active = await row<{ total: number }>(connection,
        "SELECT COUNT(*) AS total FROM ofertas_ayuda WHERE solicitud_id = ? AND estado IN ('aceptada','completada')", [lookup.solicitudId]);
      if (Number(active?.total ?? 0) === 0) {
        await connection.execute("UPDATE solicitudes_ayuda SET estado = 'abierta' WHERE solicitud_id = ?", [lookup.solicitudId]);
      }
    }
    return true;
  });
  const updated = await getOffer(id);
  if (changed) {
    const details = await one<{ ownerEmail: string | null; ownerNotifications: number; ownerName: string; volunteerEmail: string | null; volunteerNotifications: number; titulo: string }>(
      `SELECT owner.correo AS ownerEmail, owner.notificaciones_correo AS ownerNotifications,
        ${publicName('owner')} AS ownerName, volunteer.correo AS volunteerEmail,
        volunteer.notificaciones_correo AS volunteerNotifications, s.titulo
       FROM ofertas_ayuda o JOIN solicitudes_ayuda s ON s.solicitud_id = o.solicitud_id
       JOIN usuarios owner ON owner.usuario_id = s.solicitante_id
       JOIN usuarios volunteer ON volunteer.usuario_id = o.voluntario_id WHERE o.oferta_id = ?`, [id]);
    if (details) {
      const subject = data.accion === 'aceptar' ? 'Aceptaron tu ayuda en AYNI'
        : data.accion === 'rechazar' ? 'Respondieron a tu propuesta en AYNI'
          : data.accion === 'retirar' ? 'Se retiró una propuesta en AYNI'
            : data.accion === 'entregar' ? 'Un vecino indicó que entregó su aporte'
              : 'Un vecino confirmó que recibió tu ayuda';
      const body = data.accion === 'aceptar' ? `Tu propuesta para “${details.titulo}” fue aceptada. Entra a AYNI para coordinar con tu vecino.`
        : data.accion === 'rechazar' ? `Tu propuesta para “${details.titulo}” no fue aceptada. Gracias por ofrecer tu ayuda en AYNI.`
          : data.accion === 'retirar' ? `Una propuesta para “${details.titulo}” fue retirada. Entra a AYNI para revisar el estado del pedido.`
            : data.accion === 'entregar' ? `El colaborador indicó que ya entregó su aporte para “${details.titulo}”. Entra a AYNI para confirmar si lo recibiste.`
              : `El vecino confirmó que recibió tu ayuda para “${details.titulo}”. ¡Gracias por colaborar en AYNI!`;
      const toOwner = data.accion === 'retirar' || data.accion === 'entregar';
      if (toOwner && details.ownerNotifications) await sendCommunityEmail(details.ownerEmail, subject, `Hola, ${details.ownerName}.\n\n${body}`);
      if (!toOwner && details.volunteerNotifications) await sendCommunityEmail(details.volunteerEmail, subject, `Hola.\n\n${body}`);
    }
  }
  return updated;
}
export async function saveReview(userId: string, offerId: string, data: z.infer<typeof reviewSchema>) {
  assertAllowedCommunityText(data.comentario || '');
  const lookup = await one<{ solicitudId: string; requesterId: string; volunteerId: string }>(
    `SELECT CAST(o.solicitud_id AS CHAR) AS solicitudId,
      CAST(s.solicitante_id AS CHAR) AS requesterId, CAST(o.voluntario_id AS CHAR) AS volunteerId
     FROM ofertas_ayuda o JOIN solicitudes_ayuda s ON s.solicitud_id = o.solicitud_id WHERE o.oferta_id = ?`, [offerId]);
  if (!lookup) throw new AppError(404, 'OFFER_NOT_FOUND', 'No se encontró la colaboración.');
  let evaluatedId = '';
  await transaction(async (connection) => {
    const request = await lockRequest(connection, lookup.solicitudId);
    const offer = await row<OfferLock>(connection, `SELECT CAST(oferta_id AS CHAR) AS oferta_id,
      CAST(voluntario_id AS CHAR) AS voluntario_id, estado, confirmada_en FROM ofertas_ayuda WHERE oferta_id = ? FOR UPDATE`, [offerId]);
    if (!offer) throw new AppError(404, 'OFFER_NOT_FOUND', 'No se encontró la colaboración.');
    const isRequester = request.solicitante_id === userId;
    const isVolunteer = offer.voluntario_id === userId;
    if (!isRequester && !isVolunteer) {
      throw new AppError(403, 'FORBIDDEN', 'Solo los participantes de la colaboración pueden valorarse.');
    }
    if (offer.estado !== 'completada' || !offer.confirmada_en) {
      throw new AppError(409, 'UNCONFIRMED_COLLABORATION', 'Ambos participantes pueden valorarse después de confirmar el aporte.');
    }
    evaluatedId = isRequester ? offer.voluntario_id : request.solicitante_id;
    const existingReview = await row<{ id: string }>(connection,
      'SELECT CAST(resena_colaboracion_id AS CHAR) AS id FROM resenas_colaboracion WHERE oferta_id = ? AND autor_id = ? FOR UPDATE',
    [offerId, userId]);
    await connection.execute(`INSERT INTO resenas_colaboracion (oferta_id, autor_id, evaluado_id, calificacion, comentario)
      VALUES (?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE calificacion = VALUES(calificacion), comentario = VALUES(comentario)`,
    [offerId, userId, evaluatedId, data.calificacion, data.comentario || null]);
    const people = await row<{ requester: string; volunteer: string; titulo: string }>(connection,
      `SELECT ${publicName('owner')} AS requester, ${publicName('volunteer')} AS volunteer, s.titulo
       FROM solicitudes_ayuda s JOIN usuarios owner ON owner.usuario_id = s.solicitante_id
       JOIN ofertas_ayuda o ON o.solicitud_id = s.solicitud_id
        JOIN usuarios volunteer ON volunteer.usuario_id = o.voluntario_id
        WHERE s.solicitud_id = ? AND o.oferta_id = ?`, [lookup.solicitudId, offerId]);
    const note = data.comentario ? ` Comentario: “${notificationExcerpt(data.comentario, 180)}”` : '';
    const evaluatorName = isRequester ? people?.requester ?? 'El vecino' : people?.volunteer ?? 'El colaborador';
    const reviewText = isRequester
      ? `${evaluatorName} te calificó con ${data.calificacion}/5 por tu ayuda en “${notificationExcerpt(people?.titulo ?? 'un pedido', 100)}”.${note}`
      : `${evaluatorName} valoró cómo cuidaste el aporte en “${notificationExcerpt(people?.titulo ?? 'un pedido', 100)}”: ${data.calificacion}/5.${note}`;
    if (!existingReview) {
      await notifyInteraction(connection, evaluatedId, lookup.solicitudId, offerId,
        isRequester ? 'resena_recibida' : 'resena_del_colaborador', reviewText);
    }
  });
  return await one(`SELECT CAST(resena_colaboracion_id AS CHAR) AS id, calificacion, comentario
    FROM resenas_colaboracion WHERE oferta_id = ? AND autor_id = ?`, [offerId, userId]);
}
export async function getReputation(userId: string, viewerId?: string) {
  const user = await one('SELECT usuario_id FROM usuarios WHERE usuario_id = ? AND estado_cuenta = ?', [userId, 'activo']);
  if (!user) throw new AppError(404, 'USER_NOT_FOUND', 'No se encontró el vecino.');
  const total = await one<{ total: number }>(`SELECT COUNT(*) AS total FROM ofertas_ayuda
    WHERE voluntario_id = ? AND estado = 'completada' AND confirmada_en IS NOT NULL`, [userId]);
  const reputation = await one<{ vistosBuenos: number | string | null; promedio: number | string | null }>(
    `SELECT SUM(r.calificacion >= 4) AS vistosBuenos, AVG(r.calificacion) AS promedio
     FROM resenas_colaboracion r JOIN ofertas_ayuda o ON o.oferta_id = r.oferta_id
     WHERE r.evaluado_id = ? AND o.estado = 'completada' AND o.confirmada_en IS NOT NULL`, [userId]);
  const reviews = await query(`SELECT CAST(r.resena_colaboracion_id AS CHAR) AS id,
    CAST(s.solicitud_id AS CHAR) AS solicitudId, CAST(o.oferta_id AS CHAR) AS ofertaId,
    CAST(mi_resena.calificacion AS UNSIGNED) AS miCalificacion,
    ${publicName('u')} AS autor, r.calificacion, r.comentario, r.creado_en AS creadoEn
    FROM resenas_colaboracion r JOIN ofertas_ayuda o ON o.oferta_id = r.oferta_id
    JOIN solicitudes_ayuda s ON s.solicitud_id = o.solicitud_id
    JOIN usuarios u ON u.usuario_id = r.autor_id
    LEFT JOIN resenas_colaboracion mi_resena ON mi_resena.oferta_id = o.oferta_id AND mi_resena.autor_id = ?
    WHERE r.evaluado_id = ? AND o.estado = 'completada' AND o.confirmada_en IS NOT NULL
    ORDER BY r.creado_en DESC LIMIT 100`, [viewerId === userId ? viewerId : null, userId]);
  return { colaboracionesConfirmadas: Number(total?.total ?? 0), vistosBuenos: Number(reputation?.vistosBuenos ?? 0),
    promedio: reputation?.promedio == null ? null : Math.round(Number(reputation.promedio) * 10) / 10, resenas: reviews };
}
