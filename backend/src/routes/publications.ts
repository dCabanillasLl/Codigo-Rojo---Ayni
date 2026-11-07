import { Router } from "express";
import { z } from "zod";
import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { one, query, transaction } from "../db/index.js";
import { AppError, asyncHandler } from "../lib/http.js";
import { geoFilter, resolveLocation } from "../lib/location.js";
import { idSchema, listSchema } from "../lib/validation.js";
import { requireAuth } from "../middlewares/auth.js";

const router = Router();
const baseSelect = `SELECT CAST(p.publicacion_id AS CHAR) AS id, CAST(p.propietario_id AS CHAR) AS propietarioId,
  u.nombres AS propietario, CASE WHEN u.telefono_publico = 1 THEN u.telefono ELSE NULL END AS telefonoContacto,
  CAST(p.categoria_id AS CHAR) AS categoriaId, c.nombre AS categoria,
  p.tipo, p.titulo, p.descripcion, p.modalidad_precio AS modalidadPrecio, p.precio, p.moneda, p.estado,
  CAST(l.sector_id AS CHAR) AS sectorId, s.nombre AS sectorNombre,
  (SELECT ROUND(AVG(r.calificacion), 1) FROM resenas r WHERE r.publicacion_id = p.publicacion_id) AS promedioResenas,
  (SELECT COUNT(*) FROM resenas r WHERE r.publicacion_id = p.publicacion_id) AS totalResenas`;
const joins = ` FROM publicaciones p JOIN usuarios u ON u.usuario_id = p.propietario_id
  JOIN ubicaciones l ON l.ubicacion_id = p.ubicacion_id JOIN sectores_vecinales s ON s.sector_id = l.sector_id
  JOIN categorias_publicacion c ON c.categoria_id = p.categoria_id`;
const publicationFields = z.object({
  categoriaId: idSchema,
  tipo: z.enum(["producto", "servicio"]),
  titulo: z.string().trim().min(3).max(160),
  descripcion: z.string().trim().max(5000).nullable().optional(),
  modalidadPrecio: z.enum(["gratis", "fijo", "desde", "cotizar"]),
  precio: z.number().finite().min(0).max(99999999.99).nullable().optional(),
  sectorId: idSchema,
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

router.get("/publicaciones/:id/resenas", asyncHandler(async (req, res) => {
  const id = idSchema.parse(req.params.id);
  const publication = await one<{ propietarioId: string; estado: string }>("SELECT CAST(propietario_id AS CHAR) AS propietarioId, estado FROM publicaciones WHERE publicacion_id = ?", [id]);
  if (!publication || (publication.estado !== "publicada" && publication.propietarioId !== req.userId)) throw new AppError(404, "NOT_FOUND", "No encontramos esta publicación.");
  res.json({ data: await query(`SELECT CAST(r.resena_id AS CHAR) AS id, u.nombres AS autor, r.calificacion, r.comentario, r.creado_en AS creadoEn, FALSE AS verificada
    FROM resenas r JOIN usuarios u ON u.usuario_id = r.usuario_id WHERE r.publicacion_id = ? ORDER BY r.creado_en DESC LIMIT 100`, [id]) });
}));

router.get("/publicaciones/:id", asyncHandler(async (req, res) => {
  const item = await one<{ propietarioId: string; estado: string }>(`${baseSelect}, NULL AS distanciaMetros${joins} WHERE p.publicacion_id = ? AND u.estado_cuenta = 'activo'`, [idSchema.parse(req.params.id)]);
  if (!item || (item.estado !== "publicada" && item.propietarioId !== req.userId)) throw new AppError(404, "NOT_FOUND", "No encontramos esta publicación.");
  res.json({ data: item });
}));

router.post("/publicaciones", requireAuth, asyncHandler(async (req, res) => {
  const body = publicationFields.parse(req.body);
  validatePrice(body.modalidadPrecio, body.precio);
  const id = await transaction(async (connection) => {
    const locationId = await resolveLocation(connection, req.userId, body.sectorId);
    const [result] = await connection.execute<ResultSetHeader>(
      "INSERT INTO publicaciones (propietario_id, ubicacion_id, categoria_id, tipo, titulo, descripcion, modalidad_precio, precio, estado) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
      [req.userId, locationId, body.categoriaId, body.tipo, body.titulo, body.descripcion ?? null, body.modalidadPrecio, body.precio ?? null, body.estado ?? "publicada"],
    );
    return String(result.insertId);
  });
  res.status(201).json({ data: await one(`${baseSelect}, NULL AS distanciaMetros${joins} WHERE p.publicacion_id = ?`, [id]) });
}));

router.patch("/publicaciones/:id", requireAuth, asyncHandler(async (req, res) => {
  const id = idSchema.parse(req.params.id);
  const body = publicationFields.partial().refine((value) => Object.keys(value).length > 0, "Indica qué deseas modificar").parse(req.body);
  await transaction(async (connection) => {
    const [rows] = await connection.execute<RowDataPacket[]>("SELECT propietario_id, modalidad_precio, precio FROM publicaciones WHERE publicacion_id = ? FOR UPDATE", [id]);
    const existing = rows[0];
    if (!existing) throw new AppError(404, "NOT_FOUND", "No encontramos esta publicación.");
    if (String(existing.propietario_id) !== req.userId) throw new AppError(403, "FORBIDDEN", "Solo puedes modificar tus publicaciones.");
    validatePrice(body.modalidadPrecio ?? existing.modalidad_precio, body.precio !== undefined ? body.precio : existing.precio);
    const map = { categoriaId: "categoria_id", tipo: "tipo", titulo: "titulo", descripcion: "descripcion", modalidadPrecio: "modalidad_precio", precio: "precio", estado: "estado" } as const;
    const fields: string[] = [], params: unknown[] = [];
    for (const key of Object.keys(map) as (keyof typeof map)[]) if (body[key] !== undefined) { fields.push(`${map[key]} = ?`); params.push(body[key]); }
    if (body.sectorId) { fields.push("ubicacion_id = ?"); params.push(await resolveLocation(connection, req.userId, body.sectorId)); }
    await connection.execute(`UPDATE publicaciones SET ${fields.join(", ")} WHERE publicacion_id = ?`, [...params, id] as never[]);
  });
  res.json({ data: await one(`${baseSelect}, NULL AS distanciaMetros${joins} WHERE p.publicacion_id = ?`, [id]) });
}));

export default router;
