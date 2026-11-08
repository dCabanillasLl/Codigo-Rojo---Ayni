import { Router } from "express";
import { z } from "zod";
import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { one, query, transaction } from "../db/index.js";
import { AppError, asyncHandler } from "../lib/http.js";
import { geoFilter, publicMapColumns, resolveLocation } from "../lib/location.js";
import { idSchema, listSchema, locationSchema } from "../lib/validation.js";
import { requireAuth } from "../middlewares/auth.js";
import { publicationJson } from "../middlewares/json.js";
import { photoSchema, preparePhoto } from "../lib/photos.js";

const router = Router();
const baseSelect = `SELECT CAST(p.publicacion_id AS CHAR) AS id, CAST(p.propietario_id AS CHAR) AS propietarioId,
  u.nombres AS propietario, CASE WHEN u.telefono_publico = 1 THEN u.telefono ELSE NULL END AS telefonoContacto,
  CAST(p.categoria_id AS CHAR) AS categoriaId, c.nombre AS categoria,
  p.tipo, p.titulo, p.descripcion, p.modalidad_precio AS modalidadPrecio, p.precio, p.moneda, p.estado,
  CASE WHEN p.imagen_hash IS NULL THEN NULL ELSE CONCAT('/api/publicaciones/', CAST(p.publicacion_id AS CHAR), '/imagen?v=', p.imagen_hash) END AS imagenUrl,
  CAST(l.sector_id AS CHAR) AS sectorId, s.nombre AS sectorNombre, ${publicMapColumns},
  (SELECT ROUND(AVG(r.calificacion), 1) FROM resenas r WHERE r.publicacion_id = p.publicacion_id) AS promedioResenas,
  (SELECT COUNT(*) FROM resenas r WHERE r.publicacion_id = p.publicacion_id) AS totalResenas`;
const joins = ` FROM publicaciones p JOIN usuarios u ON u.usuario_id = p.propietario_id
  JOIN ubicaciones l ON l.ubicacion_id = p.ubicacion_id JOIN sectores_vecinales s ON s.sector_id = l.sector_id
  JOIN categorias_publicacion c ON c.categoria_id = p.categoria_id`;
export const publicationFields = z.object({
  categoriaId: idSchema,
  tipo: z.enum(["producto", "servicio"]),
  titulo: z.string().trim().min(3).max(160),
  descripcion: z.string().trim().max(5000).nullable().optional(),
  modalidadPrecio: z.enum(["gratis", "fijo", "desde", "cotizar"]),
  precio: z.number().finite().min(0).max(99999999.99).nullable().optional(),
  sectorId: idSchema,
  ubicacion: locationSchema.optional(),
  foto: photoSchema,
  estado: z.enum(["borrador", "publicada", "pausada", "archivada"]).optional(),
}).strict();

function validatePrice(modality: string, price: number | null | undefined) {
  if (["fijo", "desde"].includes(modality) && price == null) throw new AppError(400, "PRICE_REQUIRED", "Indica el precio de la publicación.");
  if (["gratis", "cotizar"].includes(modality) && price != null) throw new AppError(400, "INVALID_PRICE", "Las opciones gratis y cotizar no llevan un precio fijo.");
  if (price != null && Math.abs(price * 100 - Math.round(price * 100)) > 0.000001) throw new AppError(400, "INVALID_PRICE", "El precio admite como máximo dos decimales.");
}

router.get("/publicaciones", asyncHandler(async (req, res) => {
  const filters = listSchema.parse(req.query);
  if (filters.mios === "1" && !req.userId) throw new AppError(401, "UNAUTHENTICATED", "Inicia sesión para ver tus publicaciones.");
  const geo = geoFilter(filters);
  const conditions = ["u.estado_cuenta = 'activo'", ...geo.conditions];
  const params: unknown[] = [...geo.params];
  if (filters.mios === "1") { conditions.push("p.propietario_id = ?"); params.push(req.userId); }
  else conditions.push("p.estado = 'publicada'");
  if (filters.q) { conditions.push("(p.titulo LIKE ? OR p.descripcion LIKE ? OR u.nombres LIKE ?)"); params.push(...Array(3).fill(`%${filters.q}%`)); }
  if (filters.sectorId) { conditions.push("l.sector_id = ?"); params.push(filters.sectorId); }
  if (filters.categoriaId) { conditions.push("p.categoria_id = ?"); params.push(filters.categoriaId); }
  if (filters.tipo) { conditions.push("p.tipo = ?"); params.push(filters.tipo); }
  res.json({ data: await query(`${baseSelect}, ${geo.select}${joins} WHERE ${conditions.join(" AND ")} ORDER BY distanciaMetros IS NULL, distanciaMetros, p.creado_en DESC LIMIT 100`, [...geo.selectParams, ...params]) });
}));

router.get("/publicaciones/:id", asyncHandler(async (req, res) => {
  const item = await one<{ propietarioId: string; estado: string }>(`${baseSelect}, NULL AS distanciaMetros${joins} WHERE p.publicacion_id = ? AND u.estado_cuenta = 'activo'`, [idSchema.parse(req.params.id)]);
  if (!item || (item.estado !== "publicada" && item.propietarioId !== req.userId)) throw new AppError(404, "NOT_FOUND", "No encontramos esta publicación.");
  res.json({ data: item });
}));

router.get("/publicaciones/:id/imagen", asyncHandler(async (req, res) => {
  const id = idSchema.parse(req.params.id);
  const { v } = z.object({ v: z.string().regex(/^[a-f0-9]{64}$/).optional() }).strict().parse(req.query);
  const item = await one<{ imagen: Buffer | null; imagen_hash: string | null; propietarioId: string; estado: string }>(
    `SELECT p.imagen, p.imagen_hash, CAST(p.propietario_id AS CHAR) AS propietarioId, p.estado FROM publicaciones p JOIN usuarios u ON u.usuario_id = p.propietario_id
     WHERE p.publicacion_id = ? AND u.estado_cuenta = 'activo' AND (p.estado = 'publicada' OR p.propietario_id = ?)`, [id, req.userId ?? null]);
  if (!item?.imagen || !item.imagen_hash || (item.estado !== 'publicada' && item.propietarioId !== req.userId) || (v && v !== item.imagen_hash)) throw new AppError(404, 'PHOTO_NOT_FOUND', 'Esta foto no está disponible.');
  res.set({ 'Content-Type': 'image/jpeg', 'Cache-Control': 'private, max-age=0, must-revalidate', 'Cross-Origin-Resource-Policy': 'cross-origin', ETag: `"${item.imagen_hash}"` });
  res.send(item.imagen);
}));

router.post("/publicaciones", requireAuth, publicationJson, asyncHandler(async (req, res) => {
  const body = publicationFields.parse(req.body);
  validatePrice(body.modalidadPrecio, body.precio);
  const photo = await preparePhoto(body.foto);
  const id = await transaction(async (connection) => {
    const locationId = await resolveLocation(connection, req.userId, body.sectorId, body.ubicacion);
    const [result] = await connection.execute<ResultSetHeader>(
      "INSERT INTO publicaciones (propietario_id, ubicacion_id, categoria_id, tipo, titulo, descripcion, modalidad_precio, precio, estado, imagen, imagen_hash) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      [req.userId, locationId, body.categoriaId, body.tipo, body.titulo, body.descripcion ?? null, body.modalidadPrecio, body.precio ?? null, body.estado ?? "publicada", photo?.buffer ?? null, photo?.hash ?? null],
    );
    return String(result.insertId);
  });
  res.status(201).json({ data: await one(`${baseSelect}, NULL AS distanciaMetros${joins} WHERE p.publicacion_id = ?`, [id]) });
}));

router.patch("/publicaciones/:id", requireAuth, publicationJson, asyncHandler(async (req, res) => {
  const id = idSchema.parse(req.params.id);
  const body = publicationFields.partial().refine((value) => Object.keys(value).length > 0, "Indica qué deseas modificar").parse(req.body);
  await transaction(async (connection) => {
    const [rows] = await connection.execute<RowDataPacket[]>("SELECT p.propietario_id, p.modalidad_precio, p.precio, CAST(l.sector_id AS CHAR) AS sector_id FROM publicaciones p JOIN ubicaciones l ON l.ubicacion_id = p.ubicacion_id WHERE p.publicacion_id = ? FOR UPDATE", [id]);
    const existing = rows[0];
    if (!existing) throw new AppError(404, "NOT_FOUND", "No encontramos esta publicación.");
    if (String(existing.propietario_id) !== req.userId) throw new AppError(403, "FORBIDDEN", "Solo puedes modificar tus publicaciones.");
    validatePrice(body.modalidadPrecio ?? existing.modalidad_precio, body.precio !== undefined ? body.precio : existing.precio);
    const photo = await preparePhoto(body.foto);
    const map = { categoriaId: "categoria_id", tipo: "tipo", titulo: "titulo", descripcion: "descripcion", modalidadPrecio: "modalidad_precio", precio: "precio", estado: "estado" } as const;
    const fields: string[] = [], params: unknown[] = [];
    for (const key of Object.keys(map) as (keyof typeof map)[]) if (body[key] !== undefined) { fields.push(`${map[key]} = ?`); params.push(body[key]); }
    if (photo !== undefined) { fields.push('imagen = ?', 'imagen_hash = ?'); params.push(photo?.buffer ?? null, photo?.hash ?? null); }
    if (body.ubicacion || (body.sectorId && body.sectorId !== existing.sector_id)) { fields.push("ubicacion_id = ?"); params.push(await resolveLocation(connection, req.userId, body.sectorId ?? existing.sector_id, body.ubicacion)); }
    if (!fields.length) return;
    await connection.execute(`UPDATE publicaciones SET ${fields.join(", ")} WHERE publicacion_id = ?`, [...params, id] as never[]);
  });
  res.json({ data: await one(`${baseSelect}, NULL AS distanciaMetros${joins} WHERE p.publicacion_id = ?`, [id]) });
}));

export default router;
