import type { PoolConnection } from 'mysql2/promise';
import { z } from 'zod';
import { one, query, transaction } from '../db/index.js';
import { AppError } from '../lib/http.js';
import { approximateDistance, createLocation, geoClause, idSchema, insert, publicName, row, uuidSchema, type ListOptions } from './community-data.js';
import { assertRequestActive, contentHash, remainingResource, requireSameContent, transitionReservation, type RequestState, type ReservationState } from './community-rules.js';

export const resourceSchema = z.object({
  titulo: z.string().trim().min(3).max(160),
  unidad: z.string().trim().min(1).max(40),
  cantidadTotal: z.number().int().min(1).max(1000000),
  sectorId: idSchema,
}).strict();
export const reservationSchema = z.object({
  cantidad: z.number().int().min(1).max(1000000),
  solicitudId: idSchema.optional(),
  clientRequestId: uuidSchema,
}).strict();
export const reservationActionSchema = z.object({
  accion: z.enum(['confirmar', 'entregar', 'cancelar']),
}).strict();

interface ResourceView {
  id: string; propietarioId: string; propietario: string; titulo: string; unidad: string;
  cantidadTotal: number; reservada: string | number; entregada: string | number;
  sectorId: string; sectorNombre: string; actualizadoEn: Date; distanciaMetros: number | string | null;
}
const resourceColumns = `CAST(r.recurso_id AS CHAR) AS id, CAST(r.propietario_id AS CHAR) AS propietarioId,
  ${publicName('u')} AS propietario, r.titulo, r.unidad, r.cantidad_total AS cantidadTotal,
  COALESCE((SELECT SUM(b.cantidad) FROM reservas_recursos b WHERE b.recurso_id = r.recurso_id AND b.estado = 'reservada'), 0) AS reservada,
  COALESCE((SELECT SUM(b.cantidad) FROM reservas_recursos b WHERE b.recurso_id = r.recurso_id AND b.estado = 'entregada'), 0) AS entregada,
  CAST(l.sector_id AS CHAR) AS sectorId, v.nombre AS sectorNombre, r.actualizado_en AS actualizadoEn`;
const resourceFrom = `FROM recursos_comunitarios r JOIN usuarios u ON u.usuario_id = r.propietario_id
  JOIN ubicaciones l ON l.ubicacion_id = r.ubicacion_id JOIN sectores_vecinales v ON v.sector_id = l.sector_id`;
function resourceView(resource: ResourceView) {
  const total = Number(resource.cantidadTotal), reserved = Number(resource.reservada), delivered = Number(resource.entregada);
  return approximateDistance({ ...resource, cantidadTotal: total, reservada: reserved, entregada: delivered,
    disponible: remainingResource(total, reserved, delivered) });
}
export async function listResources(options: ListOptions, userId?: string) {
  if ((options.mios === '1' || options.participando === '1') && !userId) throw new AppError(401, 'AUTH_REQUIRED', 'Inicia sesión para consultar tus recursos.');
  const geo = geoClause(options);
  const conditions = ["u.estado_cuenta = 'activo'", ...geo.where];
  const params = [...geo.whereParams];
  if (options.q) { conditions.push('r.titulo LIKE ?'); params.push(`%${options.q}%`); }
  if (options.sectorId) { conditions.push('l.sector_id = ?'); params.push(options.sectorId); }
  if (options.mios === '1') { conditions.push('r.propietario_id = ?'); params.push(userId); }
  if (options.participando === '1') { conditions.push('EXISTS (SELECT 1 FROM reservas_recursos propias WHERE propias.recurso_id = r.recurso_id AND propias.solicitante_id = ?)'); params.push(userId); }
  return (await query<ResourceView>(`SELECT ${resourceColumns}, ${geo.select}
    ${resourceFrom} WHERE ${conditions.join(' AND ')} ${geo.having}
    ORDER BY r.actualizado_en DESC LIMIT 100`, [...geo.selectParams, ...params, ...geo.havingParams])).map(resourceView);
}
export async function getResource(id: string) {
  const resource = await one<ResourceView>(`SELECT ${resourceColumns}, NULL AS distanciaMetros ${resourceFrom}
    WHERE r.recurso_id = ? AND u.estado_cuenta = 'activo'`, [id]);
  if (!resource) throw new AppError(404, 'RESOURCE_NOT_FOUND', 'No se encontró el recurso.');
  return resourceView(resource);
}
export async function createResource(userId: string, data: z.infer<typeof resourceSchema>) {
  const id = await transaction(async (connection) => {
    const locationId = await createLocation(connection, userId, data.sectorId);
    return insert(connection, `INSERT INTO recursos_comunitarios (propietario_id, ubicacion_id, titulo, unidad, cantidad_total)
      VALUES (?, ?, ?, ?, ?)`, [userId, locationId, data.titulo, data.unidad, data.cantidadTotal]);
  });
  return getResource(id);
}
interface LockedResource { recurso_id: string; propietario_id: string; cantidad_total: number }
async function lockResource(connection: PoolConnection, id: string): Promise<LockedResource> {
  const resource = await row<LockedResource>(connection, `SELECT CAST(recurso_id AS CHAR) AS recurso_id,
    CAST(propietario_id AS CHAR) AS propietario_id, cantidad_total FROM recursos_comunitarios
    WHERE recurso_id = ? FOR UPDATE`, [id]);
  if (!resource) throw new AppError(404, 'RESOURCE_NOT_FOUND', 'No se encontró el recurso.');
  return resource;
}
interface ReservationView {
  id: string; recursoId: string; solicitanteId: string; solicitante: string;
  solicitudId: string | null; cantidad: number; estado: ReservationState; clientRequestId: string;
  creadoEn: Date; reservadaEn: Date | null; entregadaEn: Date | null;
}
const reservationColumns = `CAST(b.reserva_id AS CHAR) AS id, CAST(b.recurso_id AS CHAR) AS recursoId,
  CAST(b.solicitante_id AS CHAR) AS solicitanteId, ${publicName('u')} AS solicitante,
  CAST(b.solicitud_id AS CHAR) AS solicitudId, b.cantidad, b.estado, b.client_request_id AS clientRequestId,
  b.creado_en AS creadoEn, b.reservada_en AS reservadaEn, b.entregada_en AS entregadaEn`;
async function getReservation(id: string): Promise<ReservationView> {
  const reservation = await one<ReservationView>(`SELECT ${reservationColumns} FROM reservas_recursos b
    JOIN usuarios u ON u.usuario_id = b.solicitante_id WHERE b.reserva_id = ?`, [id]);
  if (!reservation) throw new AppError(404, 'RESERVATION_NOT_FOUND', 'No se encontró la reserva.');
  return reservation;
}
export async function listReservations(userId: string, resourceId: string) {
  const resource = await getResource(resourceId);
  const onlyOwn = resource.propietarioId !== userId;
  return query<ReservationView>(`SELECT ${reservationColumns} FROM reservas_recursos b
    JOIN usuarios u ON u.usuario_id = b.solicitante_id WHERE b.recurso_id = ?
    ${onlyOwn ? 'AND b.solicitante_id = ?' : ''} ORDER BY b.creado_en DESC LIMIT 100`, onlyOwn ? [resourceId, userId] : [resourceId]);
}
export async function createReservation(userId: string, resourceId: string, data: z.infer<typeof reservationSchema>) {
  const fingerprint = contentHash({ recursoId: resourceId, cantidad: data.cantidad, solicitudId: data.solicitudId ?? null });
  const result = await transaction(async (connection) => {
    await row(connection, 'SELECT usuario_id FROM usuarios WHERE usuario_id = ? FOR UPDATE', [userId]);
    const previous = await row<{ id: string; request_hash: string }>(connection,
      'SELECT CAST(reserva_id AS CHAR) AS id, request_hash FROM reservas_recursos WHERE solicitante_id = ? AND client_request_id = ? FOR UPDATE',
      [userId, data.clientRequestId]);
    if (previous) { requireSameContent(previous.request_hash, fingerprint); return { id: previous.id, replayed: true }; }
    const resource = await lockResource(connection, resourceId);
    if (resource.propietario_id === userId) throw new AppError(400, 'SELF_RESERVATION', 'No puedes reservar tu propio recurso.');
    if (data.cantidad > Number(resource.cantidad_total)) throw new AppError(409, 'INSUFFICIENT_STOCK', 'La cantidad supera el total ofrecido.');
    if (data.solicitudId) {
      const request = await row<{ solicitanteId: string; estado: RequestState; vencida: number | string }>(connection,
        `SELECT CAST(solicitante_id AS CHAR) AS solicitanteId, estado,
        (vence_en IS NOT NULL AND vence_en <= UTC_TIMESTAMP()) AS vencida
        FROM solicitudes_ayuda WHERE solicitud_id = ? FOR UPDATE`, [data.solicitudId]);
      if (!request) throw new AppError(404, 'REQUEST_NOT_FOUND', 'No se encontró el pedido asociado.');
      if (request.solicitanteId !== userId) throw new AppError(403, 'FORBIDDEN', 'Solo puedes reservar recursos para tus propios pedidos.');
      assertRequestActive(request.estado);
      if (Number(request.vencida) !== 0) throw new AppError(409, 'REQUEST_EXPIRED', 'El pedido asociado ya venció.');
    }
    const id = await insert(connection, `INSERT INTO reservas_recursos
      (recurso_id, solicitante_id, solicitud_id, cantidad, client_request_id, request_hash)
      VALUES (?, ?, ?, ?, ?, ?)`, [resourceId, userId, data.solicitudId ?? null, data.cantidad, data.clientRequestId, fingerprint]);
    await connection.execute('UPDATE recursos_comunitarios SET actualizado_en = UTC_TIMESTAMP() WHERE recurso_id = ?', [resourceId]);
    return { id, replayed: false };
  });
  return { reservation: await getReservation(result.id), replayed: result.replayed };
}
export async function updateReservation(userId: string, id: string, data: z.infer<typeof reservationActionSchema>) {
  const lookup = await one<{ recursoId: string; solicitudId: string | null }>(
    'SELECT CAST(recurso_id AS CHAR) AS recursoId, CAST(solicitud_id AS CHAR) AS solicitudId FROM reservas_recursos WHERE reserva_id = ?', [id]);
  if (!lookup) throw new AppError(404, 'RESERVATION_NOT_FOUND', 'No se encontró la reserva.');
  await transaction(async (connection) => {
    // A single parent row serializes stock allocations across every request for this resource.
    const resource = await lockResource(connection, lookup.recursoId);
    let requestState: RequestState | undefined;
    if (lookup.solicitudId) {
      const request = await row<{ estado: RequestState }>(connection,
        'SELECT estado FROM solicitudes_ayuda WHERE solicitud_id = ? FOR UPDATE', [lookup.solicitudId]);
      requestState = request?.estado;
    }
    const reservation = await row<{ solicitante_id: string; estado: ReservationState; cantidad: number }>(connection,
      'SELECT CAST(solicitante_id AS CHAR) AS solicitante_id, estado, cantidad FROM reservas_recursos WHERE reserva_id = ? FOR UPDATE', [id]);
    if (!reservation) throw new AppError(404, 'RESERVATION_NOT_FOUND', 'No se encontró la reserva.');
    const totals = await row<{ reserved: number | string; delivered: number | string }>(connection,
      `SELECT COALESCE(SUM(CASE WHEN estado = 'reservada' THEN cantidad ELSE 0 END), 0) AS reserved,
      COALESCE(SUM(CASE WHEN estado = 'entregada' THEN cantidad ELSE 0 END), 0) AS delivered
      FROM reservas_recursos WHERE recurso_id = ?`, [lookup.recursoId]);
    const available = remainingResource(Number(resource.cantidad_total), Number(totals?.reserved ?? 0), Number(totals?.delivered ?? 0));
    const next = transitionReservation({ action: data.accion, state: reservation.estado,
      owner: resource.propietario_id === userId, requester: reservation.solicitante_id === userId,
      quantity: Number(reservation.cantidad), available });
    if (next === reservation.estado) return;
    if (data.accion === 'confirmar' && requestState) assertRequestActive(requestState);
    await connection.execute(`UPDATE reservas_recursos SET estado = ?,
      reservada_en = CASE WHEN ? = 'reservada' THEN COALESCE(reservada_en, UTC_TIMESTAMP()) ELSE reservada_en END,
      entregada_en = CASE WHEN ? = 'entregada' THEN COALESCE(entregada_en, UTC_TIMESTAMP()) ELSE entregada_en END,
      cancelada_en = CASE WHEN ? = 'cancelada' THEN COALESCE(cancelada_en, UTC_TIMESTAMP()) ELSE cancelada_en END
      WHERE reserva_id = ?`, [next, next, next, next, id]);
    await connection.execute('UPDATE recursos_comunitarios SET actualizado_en = UTC_TIMESTAMP() WHERE recurso_id = ?', [lookup.recursoId]);
  });
  return getReservation(id);
}
