import { Router } from "express";
import { z } from "zod";
import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { one, query, transaction } from "../db/index.js";
import { AppError, asyncHandler } from "../lib/http.js";
import { geoFilter, resolveLocation } from "../lib/location.js";
import { idSchema, listSchema } from "../lib/validation.js";
import { requireAuth } from "../middlewares/auth.js";
import { publicationJson } from '../middlewares/json.js';
import { photoSchema, preparePhoto } from '../lib/photos.js';
import { noticeDateSql, noticeExpired, validateNoticeDates } from '../lib/notices.js';

const router = Router();
const select = `SELECT CAST(a.aviso_id AS CHAR) AS id, CAST(a.autor_id AS CHAR) AS autorId,
  u.nombres AS autor, CAST(a.categoria_aviso_id AS CHAR) AS categoriaId, c.nombre AS categoria,
  a.titulo, a.contenido, CASE WHEN a.estado = 'publicado' AND NOT (${noticeDateSql}) THEN 'vencido' ELSE a.estado END AS estado,
  CAST(l.sector_id AS CHAR) AS sectorId, s.nombre AS sectorNombre,
  CASE WHEN a.imagen_hash IS NULL THEN a.imagen_url ELSE CONCAT('/api/avisos/', CAST(a.aviso_id AS CHAR), '/imagen?v=', a.imagen_hash) END AS imagenUrl,
  a.fecha_evento AS fechaEvento, a.vence_en AS venceEn, a.creado_en AS creadoEn`;
const joins = ` FROM avisos a JOIN usuarios u ON u.usuario_id = a.autor_id
  JOIN ubicaciones l ON l.ubicacion_id = a.ubicacion_id JOIN sectores_vecinales s ON s.sector_id = l.sector_id
  JOIN categorias_avisos c ON c.categoria_aviso_id = a.categoria_aviso_id`;
const fields = z.object({
  categoriaId: idSchema,
  titulo: z.string().trim().min(3).max(180),
  contenido: z.string().trim().min(3).max(8000),
  sectorId: idSchema,
  foto: photoSchema,
  imagenUrl: z.string().trim().url().max(2048).refine((value) => {
    try { return new URL(value).protocol === "https:"; } catch { return false; }
  }, "La imagen debe usar una URL HTTPS").nullable().optional(),
  fechaEvento: z.string().datetime({ offset: true }).nullable().optional(),
  venceEn: z.string().datetime({ offset: true }).nullable().optional(),
  estado: z.enum(["borrador", "publicado", "cancelado", "vencido"]).optional(),
}).strict();

router.get("/avisos", asyncHandler(async (req, res) => {
  const filters = listSchema.parse(req.query);
  if (filters.mios === "1" && !req.userId) throw new AppError(401, "UNAUTHENTICATED", "Inicia sesión para ver tus avisos.");
  const geo = geoFilter(filters);
  const conditions = ["u.estado_cuenta = 'activo'", ...geo.conditions];
  const params: unknown[] = [...geo.params];
  if (filters.mios === "1") { conditions.push("a.autor_id = ?"); params.push(req.userId); }
  else { conditions.push("a.estado = 'publicado'", noticeDateSql); }
  if (filters.q) { conditions.push("(a.titulo LIKE ? OR a.contenido LIKE ?)"); params.push(`%${filters.q}%`, `%${filters.q}%`); }
  if (filters.sectorId) { conditions.push("l.sector_id = ?"); params.push(filters.sectorId); }
  if (filters.categoriaId) { conditions.push("a.categoria_aviso_id = ?"); params.push(filters.categoriaId); }
  res.setHeader('Cache-Control', 'no-store');
  res.json({ data: await query(`${select}, ${geo.select}${joins} WHERE ${conditions.join(" AND ")} ORDER BY a.creado_en DESC LIMIT 100`, [...geo.selectParams, ...params]) });
}));

router.get("/avisos/:id", asyncHandler(async (req, res) => {
  const item = await one<{ autorId: string; estado: string; fechaEvento: Date | null; venceEn: Date | null }>(`${select}${joins} WHERE a.aviso_id = ? AND u.estado_cuenta = 'activo'`, [idSchema.parse(req.params.id)]);
  if (!item || (item.autorId !== req.userId && (item.estado !== "publicado" || noticeExpired(item)))) {
    throw new AppError(404, "NOT_FOUND", "No encontramos este aviso vigente.");
  }
  res.setHeader('Cache-Control', 'no-store');
  res.json({ data: item });
}));

router.get('/avisos/:id/imagen', asyncHandler(async (req, res) => {
  const id = idSchema.parse(req.params.id);
  const { v } = z.object({ v: z.string().regex(/^[a-f0-9]{64}$/).optional() }).strict().parse(req.query);
  const item = await one<{ imagen: Buffer | null; imagen_hash: string | null; autorId: string; estado: string; fechaEvento: Date | null; venceEn: Date | null }>(
    `SELECT a.imagen, a.imagen_hash, CAST(a.autor_id AS CHAR) AS autorId, a.estado, a.fecha_evento AS fechaEvento, a.vence_en AS venceEn
     FROM avisos a JOIN usuarios u ON u.usuario_id = a.autor_id WHERE a.aviso_id = ? AND u.estado_cuenta = 'activo'`, [id]);
  if (!item?.imagen || !item.imagen_hash || (v && v !== item.imagen_hash) || (item.autorId !== req.userId && (item.estado !== 'publicado' || noticeExpired(item)))) throw new AppError(404, 'PHOTO_NOT_FOUND', 'Este flyer no está disponible.');
  res.set({ 'Content-Type': 'image/jpeg', 'Cache-Control': 'private, max-age=0, must-revalidate', 'Cross-Origin-Resource-Policy': 'cross-origin', ETag: `"${item.imagen_hash}"` });
  res.send(item.imagen);
}));

router.post("/avisos", requireAuth, publicationJson, asyncHandler(async (req, res) => {
  const body = fields.parse(req.body);
  validateNoticeDates(body, true);
  if (body.foto && body.imagenUrl) throw new AppError(400, 'AMBIGUOUS_PHOTO', 'Elige un archivo o un enlace de flyer, solo uno.');
  const photo = await preparePhoto(body.foto);
  const id = await transaction(async (connection) => {
    const locationId = await resolveLocation(connection, req.userId, body.sectorId);
    const [result] = await connection.execute<ResultSetHeader>(
      "INSERT INTO avisos (autor_id, categoria_aviso_id, ubicacion_id, titulo, contenido, estado, fecha_evento, vence_en, imagen_url, imagen, imagen_hash) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      [req.userId, body.categoriaId, locationId, body.titulo, body.contenido, body.estado ?? "publicado", new Date(body.fechaEvento!), body.venceEn ? new Date(body.venceEn) : null, body.imagenUrl ?? null, photo?.buffer ?? null, photo?.hash ?? null],
    );
    return String(result.insertId);
  });
  res.status(201).json({ data: await one(`${select}${joins} WHERE a.aviso_id = ?`, [id]) });
}));

router.patch("/avisos/:id", requireAuth, publicationJson, asyncHandler(async (req, res) => {
  const id = idSchema.parse(req.params.id);
  const body = fields.partial().refine((value) => Object.keys(value).length > 0, "Indica qué deseas modificar").parse(req.body);
  validateNoticeDates(body);
  if (body.foto !== undefined && body.imagenUrl !== undefined) throw new AppError(400, 'AMBIGUOUS_PHOTO', 'Modifica el archivo o el enlace de flyer, solo uno.');
  await transaction(async (connection) => {
    const [rows] = await connection.execute<RowDataPacket[]>("SELECT autor_id, fecha_evento, vence_en FROM avisos WHERE aviso_id = ? FOR UPDATE", [id]);
    if (!rows.length) throw new AppError(404, "NOT_FOUND", "No encontramos este aviso.");
    if (String(rows[0].autor_id) !== req.userId) throw new AppError(403, "FORBIDDEN", "Solo puedes modificar tus avisos.");
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
    if (body.sectorId) { changes.push("ubicacion_id = ?"); values.push(await resolveLocation(connection, req.userId, body.sectorId)); }
    await connection.execute(`UPDATE avisos SET ${changes.join(", ")} WHERE aviso_id = ?`, [...values, id] as never[]);
  });
  res.json({ data: await one(`${select}${joins} WHERE a.aviso_id = ?`, [id]) });
}));

export default router;
