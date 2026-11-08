import { Router } from "express";
import { z } from "zod";
import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { one, query, transaction } from "../db/index.js";
import { AppError, asyncHandler } from "../lib/http.js";
import { geoFilter, resolveLocation } from "../lib/location.js";
import { idSchema, listSchema, locationSchema } from "../lib/validation.js";
import { requireAuth } from "../middlewares/auth.js";
import { publicationJson } from '../middlewares/json.js';
import { photoSchema, preparePhoto } from '../lib/photos.js';
import { noticeDateSql, noticeExpired, validateNoticeDates } from '../lib/notices.js';
import { notifyEventChange, type EventSnapshot } from '../services/notice-attendance.js';

const router = Router();
const select = `SELECT CAST(a.aviso_id AS CHAR) AS id, CAST(a.autor_id AS CHAR) AS autorId,
  u.nombres AS autor, CAST(a.categoria_aviso_id AS CHAR) AS categoriaId, c.nombre AS categoria,
  a.titulo, a.contenido, CASE WHEN a.estado = 'publicado' AND NOT (${noticeDateSql}) THEN 'vencido' ELSE a.estado END AS estado,
  CAST(l.sector_id AS CHAR) AS sectorId, s.nombre AS sectorNombre,
  CASE WHEN a.ubicacion_publica = 1 THEN l.direccion ELSE NULL END AS direccionActividad,
  CASE WHEN a.ubicacion_publica = 1 THEN l.latitud ELSE NULL END AS latitudActividad,
  CASE WHEN a.ubicacion_publica = 1 THEN l.longitud ELSE NULL END AS longitudActividad,
  CASE WHEN a.imagen_hash IS NULL THEN a.imagen_url ELSE CONCAT('/api/avisos/', CAST(a.aviso_id AS CHAR), '/imagen?v=', a.imagen_hash) END AS imagenUrl,
  a.fecha_evento AS fechaEvento, a.vence_en AS venceEn, a.creado_en AS creadoEn,
  a.revision_evento AS revisionEvento, a.motivo_cambio AS motivoCambio, a.ultimo_cambio_evento AS ultimoCambioEvento,
  (SELECT COUNT(*) FROM asistencias_avisos aa JOIN usuarios au ON au.usuario_id = aa.usuario_id WHERE aa.aviso_id = a.aviso_id AND aa.confirmada = 1 AND au.estado_cuenta = 'activo') AS totalAsistentes,
  EXISTS(SELECT 1 FROM asistencias_avisos ma WHERE ma.aviso_id = a.aviso_id AND ma.usuario_id = ? AND ma.confirmada = 1) AS miAsistencia`;
const joins = ` FROM avisos a JOIN usuarios u ON u.usuario_id = a.autor_id
  JOIN ubicaciones l ON l.ubicacion_id = a.ubicacion_id JOIN sectores_vecinales s ON s.sector_id = l.sector_id
  JOIN categorias_avisos c ON c.categoria_aviso_id = a.categoria_aviso_id`;
const fields = z.object({
  categoriaId: idSchema,
  titulo: z.string().trim().min(3).max(180),
  contenido: z.string().trim().min(3).max(8000),
  sectorId: idSchema,
  ubicacion: locationSchema.optional(),
  foto: photoSchema,
  imagenUrl: z.string().trim().url().max(2048).refine((value) => {
    try { return new URL(value).protocol === "https:"; } catch { return false; }
  }, "La imagen debe usar una URL HTTPS").nullable().optional(),
  fechaEvento: z.string().datetime({ offset: true }).nullable().optional(),
  venceEn: z.string().datetime({ offset: true }).nullable().optional(),
  estado: z.enum(["borrador", "publicado", "cancelado", "vencido"]).optional(),
}).strict();

router.get("/avisos", asyncHandler(async (req, res) => {
  const { asistire, ...queryFields } = req.query;
  const filters = { ...listSchema.parse(queryFields), asistire: z.literal('1').optional().parse(asistire) };
  if (filters.mios === '1' && filters.asistire) throw new AppError(400, 'INVALID_FILTER', 'Elige una sola vista.');
  if (filters.mios === "1" && !req.userId) throw new AppError(401, "UNAUTHENTICATED", "Inicia sesión para ver tus avisos.");
  if (filters.asistire && !req.userId) throw new AppError(401, 'UNAUTHENTICATED', 'Inicia sesión para ver tus asistencias.');
  const geo = geoFilter(filters);
  const conditions = ["u.estado_cuenta = 'activo'", ...geo.conditions];
  const params: unknown[] = [...geo.params];
  if (filters.mios === "1") { conditions.push("a.autor_id = ?"); params.push(req.userId); }
  else if (filters.asistire) { conditions.push('EXISTS(SELECT 1 FROM asistencias_avisos aa WHERE aa.aviso_id = a.aviso_id AND aa.usuario_id = ? AND aa.confirmada = 1)'); params.push(req.userId); }
  else { conditions.push("a.estado = 'publicado'", noticeDateSql); }
  if (filters.q) { conditions.push("(a.titulo LIKE ? OR a.contenido LIKE ?)"); params.push(`%${filters.q}%`, `%${filters.q}%`); }
  if (filters.sectorId) { conditions.push("l.sector_id = ?"); params.push(filters.sectorId); }
  if (filters.categoriaId) { conditions.push("a.categoria_aviso_id = ?"); params.push(filters.categoriaId); }
  res.setHeader('Cache-Control', 'no-store');
  res.json({ data: await query(`${select}, ${geo.select}${joins} WHERE ${conditions.join(" AND ")} ORDER BY a.creado_en DESC LIMIT 100`, [req.userId ?? null, ...geo.selectParams, ...params]) });
}));

router.get("/avisos/:id", asyncHandler(async (req, res) => {
  const item = await one<{ autorId: string; miAsistencia: number; estado: string; fechaEvento: Date | null; venceEn: Date | null }>(`${select}${joins} WHERE a.aviso_id = ? AND u.estado_cuenta = 'activo'`, [req.userId ?? null, idSchema.parse(req.params.id)]);
  if (!item || (item.autorId !== req.userId && !item.miAsistencia && (item.estado !== "publicado" || noticeExpired(item)))) {
    throw new AppError(404, "NOT_FOUND", "No encontramos este aviso vigente.");
  }
  res.setHeader('Cache-Control', 'no-store');
  res.json({ data: item });
}));

router.get('/avisos/:id/imagen', asyncHandler(async (req, res) => {
  const id = idSchema.parse(req.params.id);
  const { v } = z.object({ v: z.string().regex(/^[a-f0-9]{64}$/).optional() }).strict().parse(req.query);
  const item = await one<{ imagen: Buffer | null; imagen_hash: string | null; autorId: string; miAsistencia: number; estado: string; fechaEvento: Date | null; venceEn: Date | null }>(
    `SELECT a.imagen, a.imagen_hash, CAST(a.autor_id AS CHAR) AS autorId, a.estado, a.fecha_evento AS fechaEvento, a.vence_en AS venceEn,
     EXISTS(SELECT 1 FROM asistencias_avisos aa WHERE aa.aviso_id = a.aviso_id AND aa.usuario_id = ? AND aa.confirmada = 1) AS miAsistencia
     FROM avisos a JOIN usuarios u ON u.usuario_id = a.autor_id WHERE a.aviso_id = ? AND u.estado_cuenta = 'activo'`, [req.userId ?? null, id]);
  if (!item?.imagen || !item.imagen_hash || (v && v !== item.imagen_hash) || (item.autorId !== req.userId && !item.miAsistencia && (item.estado !== 'publicado' || noticeExpired(item)))) throw new AppError(404, 'PHOTO_NOT_FOUND', 'Este flyer no está disponible.');
  res.set({ 'Content-Type': 'image/jpeg', 'Cache-Control': 'private, max-age=0, must-revalidate', 'Cross-Origin-Resource-Policy': 'cross-origin', ETag: `"${item.imagen_hash}"` });
  res.send(item.imagen);
}));

router.post("/avisos", requireAuth, publicationJson, asyncHandler(async (req, res) => {
  const body = fields.parse(req.body);
  validateNoticeDates(body, true);
  if (!body.ubicacion) throw new AppError(400, 'EVENT_LOCATION_REQUIRED', 'Elige la ubicación de la actividad en el mapa o selecciona una dirección sugerida.');
  if (body.foto && body.imagenUrl) throw new AppError(400, 'AMBIGUOUS_PHOTO', 'Elige un archivo o un enlace de flyer, solo uno.');
  const photo = await preparePhoto(body.foto);
  const id = await transaction(async (connection) => {
    const locationId = await resolveLocation(connection, req.userId, body.sectorId, body.ubicacion);
    const [result] = await connection.execute<ResultSetHeader>(
      "INSERT INTO avisos (autor_id, categoria_aviso_id, ubicacion_id, titulo, contenido, estado, fecha_evento, vence_en, imagen_url, imagen, imagen_hash, ubicacion_publica) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)",
      [req.userId, body.categoriaId, locationId, body.titulo, body.contenido, body.estado ?? "publicado", new Date(body.fechaEvento!), body.venceEn ? new Date(body.venceEn) : null, body.imagenUrl ?? null, photo?.buffer ?? null, photo?.hash ?? null],
    );
    return String(result.insertId);
  });
  res.status(201).json({ data: await one(`${select}${joins} WHERE a.aviso_id = ?`, [req.userId, id]) });
}));

router.patch("/avisos/:id", requireAuth, publicationJson, asyncHandler(async (req, res) => {
  const id = idSchema.parse(req.params.id);
  const body = fields.partial().extend({ revisionEvento: z.number().int().min(0).optional() }).refine((value) => Object.keys(value).some(key => key !== 'revisionEvento'), "Indica qué deseas modificar").parse(req.body);
  validateNoticeDates(body);
  if (body.foto !== undefined && body.imagenUrl !== undefined) throw new AppError(400, 'AMBIGUOUS_PHOTO', 'Modifica el archivo o el enlace de flyer, solo uno.');
  await transaction(async (connection) => {
    const [rows] = await connection.execute<RowDataPacket[]>("SELECT autor_id, titulo, estado, fecha_evento, vence_en, revision_evento, (SELECT sector_id FROM ubicaciones WHERE ubicacion_id = avisos.ubicacion_id) AS sector_id FROM avisos WHERE aviso_id = ? FOR UPDATE", [id]);
    if (!rows.length) throw new AppError(404, "NOT_FOUND", "No encontramos este aviso.");
    if (String(rows[0].autor_id) !== req.userId) throw new AppError(403, "FORBIDDEN", "Solo puedes modificar tus avisos.");
    if (rows[0].estado === 'cancelado') throw new AppError(409, 'EVENT_CANCELLED', 'Una actividad cancelada no se puede editar. Puedes eliminarla permanentemente.');
    if (body.revisionEvento !== undefined && body.revisionEvento !== Number(rows[0].revision_evento || 0)) throw new AppError(409, 'EVENT_CHANGED', 'La actividad cambió mientras la editabas. Cierra el formulario y vuelve a abrirlo para cargar los datos actuales.');
    if ((body.fechaEvento !== undefined || body.venceEn !== undefined) && !(body.fechaEvento === undefined ? rows[0].fecha_evento : body.fechaEvento) && !(body.venceEn === undefined ? rows[0].vence_en : body.venceEn)) throw new AppError(400, 'EVENT_DATE_REQUIRED', 'El aviso debe conservar una fecha de actividad o vencimiento.');
    const map = { categoriaId: "categoria_aviso_id", titulo: "titulo", contenido: "contenido", estado: "estado", imagenUrl: "imagen_url" } as const;
    const changes: string[] = [], values: unknown[] = [];
    for (const key of Object.keys(map) as (keyof typeof map)[]) if (body[key] !== undefined) { changes.push(`${map[key]} = ?`); values.push(body[key]); }
    const photo = await preparePhoto(body.foto);
    if (photo !== undefined) {
      changes.push('imagen = ?', 'imagen_hash = ?', 'imagen_url = ?');
      values.push(photo?.buffer ?? null, photo?.hash ?? null, null);
    } else if (body.imagenUrl !== undefined) { changes.push('imagen = ?', 'imagen_hash = ?'); values.push(null, null); }
    if (body.fechaEvento !== undefined) { changes.push("fecha_evento = ?"); values.push(body.fechaEvento ? new Date(body.fechaEvento) : null); }
    if (body.venceEn !== undefined) { changes.push("vence_en = ?"); values.push(body.venceEn ? new Date(body.venceEn) : null); }
    if (body.sectorId && body.sectorId !== String(rows[0].sector_id) && !body.ubicacion) throw new AppError(400, 'EVENT_LOCATION_REQUIRED', 'Para cambiar el lugar de la actividad elige un punto explícito.');
    if (body.ubicacion) {
      changes.push('ubicacion_id = ?', 'ubicacion_publica = ?');
      values.push(await resolveLocation(connection, req.userId, body.sectorId ?? String(rows[0].sector_id), body.ubicacion), 1);
    }
    const notified = await notifyEventChange(connection, id, rows[0] as EventSnapshot, body);
    if (!changes.length) return;
    if (!notified) { changes.push('revision_evento = ?'); values.push(Number(rows[0].revision_evento || 0) + 1); }
    await connection.execute(`UPDATE avisos SET ${changes.join(", ")} WHERE aviso_id = ?`, [...values, id] as never[]);
  });
  res.json({ data: await one(`${select}${joins} WHERE a.aviso_id = ?`, [req.userId, id]) });
}));

router.put('/avisos/:id/asistencia', requireAuth, asyncHandler(async (req, res) => {
  const id = idSchema.parse(req.params.id);
  const { asistire } = z.object({ asistire: z.boolean() }).strict().parse(req.body);
  await transaction(async connection => {
    const [rows] = await connection.execute<RowDataPacket[]>(`SELECT a.autor_id, a.estado, a.fecha_evento AS fechaEvento, a.vence_en AS venceEn
      FROM avisos a JOIN usuarios u ON u.usuario_id = a.autor_id WHERE a.aviso_id = ? AND u.estado_cuenta = 'activo' FOR UPDATE`, [id]);
    const item = rows[0];
    if (!item) throw new AppError(404, 'NOT_FOUND', 'No encontramos esta actividad.');
    if (String(item.autor_id) === req.userId) throw new AppError(400, 'SELF_ATTENDANCE', 'Como organizador puedes consultar las confirmaciones de tus vecinos.');
    if (asistire && (item.estado !== 'publicado' || noticeExpired({ fechaEvento: item.fechaEvento, venceEn: item.venceEn }))) throw new AppError(409, 'EVENT_NOT_AVAILABLE', 'La actividad ya no acepta confirmaciones.');
    if (asistire) await connection.execute(`INSERT INTO asistencias_avisos (aviso_id, usuario_id, confirmada) VALUES (?, ?, 1)
      ON DUPLICATE KEY UPDATE confirmada = 1`, [id, req.userId]);
    else await connection.execute('UPDATE asistencias_avisos SET confirmada = 0 WHERE aviso_id = ? AND usuario_id = ?', [id, req.userId]);
  });
  res.json({ data: { asistire } });
}));

router.post('/avisos/:id/cambios', requireAuth, asyncHandler(async (req, res) => {
  const id = idSchema.parse(req.params.id);
  const body = z.discriminatedUnion('accion', [
    z.object({ accion: z.literal('postergar'), fechaEvento: z.string().datetime({ offset: true }), motivo: z.string().trim().min(3).max(500), revisionEvento: z.number().int().min(0) }).strict(),
    z.object({ accion: z.literal('cancelar'), motivo: z.string().trim().min(3).max(500), revisionEvento: z.number().int().min(0) }).strict(),
  ]).parse(req.body);
  await transaction(async connection => {
    const [rows] = await connection.execute<RowDataPacket[]>('SELECT autor_id, titulo, estado, fecha_evento, vence_en, revision_evento FROM avisos WHERE aviso_id = ? FOR UPDATE', [id]);
    const item = rows[0] as EventSnapshot | undefined;
    if (!item) throw new AppError(404, 'NOT_FOUND', 'No encontramos esta actividad.');
    if (String(item.autor_id) !== req.userId) throw new AppError(403, 'FORBIDDEN', 'Solo el organizador puede cambiar esta actividad.');
    if (body.accion === 'cancelar' && item.estado === 'cancelado') return;
    if (body.accion === 'postergar' && item.estado === 'publicado' && item.fecha_evento?.getTime() === Date.parse(body.fechaEvento)) return;
    if (Number(item.revision_evento) !== body.revisionEvento) throw new AppError(409, 'EVENT_CHANGED', 'La actividad cambió. Actualiza la lista antes de modificarla.');
    if (item.estado !== 'publicado') throw new AppError(409, 'EVENT_NOT_AVAILABLE', 'Esta actividad ya fue retirada.');
    if (body.accion === 'postergar') {
      validateNoticeDates(body, true);
      if (item.fecha_evento && Date.parse(body.fechaEvento) <= item.fecha_evento.getTime()) throw new AppError(400, 'INVALID_POSTPONEMENT', 'Elige una fecha posterior a la actividad original.');
      await notifyEventChange(connection, id, item, { fechaEvento: body.fechaEvento, venceEn: null }, body.motivo);
      await connection.execute("UPDATE avisos SET fecha_evento = ?, vence_en = NULL WHERE aviso_id = ?", [new Date(body.fechaEvento), id]);
    } else {
      await notifyEventChange(connection, id, item, { estado: 'cancelado' }, body.motivo);
      await connection.execute("UPDATE avisos SET estado = 'cancelado' WHERE aviso_id = ?", [id]);
    }
  });
  res.json({ data: await one(`${select}${joins} WHERE a.aviso_id = ?`, [req.userId, id]) });
}));

router.delete('/avisos/:id', requireAuth, asyncHandler(async (req, res) => {
  const id = idSchema.parse(req.params.id);
  const body = z.object({ confirmar: z.literal(true), revisionEvento: z.number().int().min(0) }).strict().parse(req.body);
  await transaction(async connection => {
    const [rows] = await connection.execute<RowDataPacket[]>('SELECT autor_id, estado, revision_evento, ubicacion_id, ubicacion_publica FROM avisos WHERE aviso_id = ? FOR UPDATE', [id]);
    const item = rows[0];
    if (!item) return; // A retry after a successful deletion is harmless.
    if (String(item.autor_id) !== req.userId) throw new AppError(403, 'FORBIDDEN', 'Solo el organizador puede eliminar esta actividad.');
    if (item.estado !== 'cancelado') throw new AppError(409, 'EVENT_NOT_CANCELLED', 'Cancela la actividad antes de eliminarla permanentemente.');
    if (Number(item.revision_evento) !== body.revisionEvento) throw new AppError(409, 'EVENT_CHANGED', 'La actividad cambió. Actualiza la lista antes de eliminarla.');
    // Attendance and the flyer are deleted; notification text survives via SET NULL.
    await connection.execute('DELETE FROM avisos WHERE aviso_id = ?', [id]);
    if (Number(item.ubicacion_publica) === 1) {
      await connection.execute(`DELETE l FROM ubicaciones l WHERE l.ubicacion_id = ?
        AND NOT EXISTS (SELECT 1 FROM usuarios u WHERE u.ubicacion_id = l.ubicacion_id)
        AND NOT EXISTS (SELECT 1 FROM publicaciones p WHERE p.ubicacion_id = l.ubicacion_id)
        AND NOT EXISTS (SELECT 1 FROM solicitudes_ayuda s WHERE s.ubicacion_id = l.ubicacion_id)
        AND NOT EXISTS (SELECT 1 FROM avisos a WHERE a.ubicacion_id = l.ubicacion_id)
        AND NOT EXISTS (SELECT 1 FROM recursos_comunitarios r WHERE r.ubicacion_id = l.ubicacion_id)`, [item.ubicacion_id]);
    }
  });
  res.json({ data: { eliminado: true } });
}));

export default router;
