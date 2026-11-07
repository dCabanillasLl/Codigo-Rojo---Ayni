import { Router } from "express";
import { z } from "zod";
import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { one, query, transaction } from "../db/index.js";
import { AppError, asyncHandler } from "../lib/http.js";
import { geoFilter, resolveLocation } from "../lib/location.js";
import { idSchema, listSchema } from "../lib/validation.js";
import { requireAuth } from "../middlewares/auth.js";

const router = Router();
const select = `SELECT CAST(a.aviso_id AS CHAR) AS id, CAST(a.autor_id AS CHAR) AS autorId,
  u.nombres AS autor, CAST(a.categoria_aviso_id AS CHAR) AS categoriaId, c.nombre AS categoria,
  a.titulo, a.contenido, a.estado, CAST(l.sector_id AS CHAR) AS sectorId, s.nombre AS sectorNombre,
  a.fecha_evento AS fechaEvento, a.vence_en AS venceEn, a.creado_en AS creadoEn`;
const joins = ` FROM avisos a JOIN usuarios u ON u.usuario_id = a.autor_id
  JOIN ubicaciones l ON l.ubicacion_id = a.ubicacion_id JOIN sectores_vecinales s ON s.sector_id = l.sector_id
  JOIN categorias_avisos c ON c.categoria_aviso_id = a.categoria_aviso_id`;
const fields = z.object({
  categoriaId: idSchema,
  titulo: z.string().trim().min(3).max(180),
  contenido: z.string().trim().min(3).max(8000),
  sectorId: idSchema,
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
  else { conditions.push("a.estado = 'publicado'", "(a.vence_en IS NULL OR a.vence_en > UTC_TIMESTAMP())"); }
  if (filters.q) { conditions.push("(a.titulo LIKE ? OR a.contenido LIKE ?)"); params.push(`%${filters.q}%`, `%${filters.q}%`); }
  if (filters.sectorId) { conditions.push("l.sector_id = ?"); params.push(filters.sectorId); }
  if (filters.categoriaId) { conditions.push("a.categoria_aviso_id = ?"); params.push(filters.categoriaId); }
  res.json({ data: await query(`${select}, ${geo.select}${joins} WHERE ${conditions.join(" AND ")} ORDER BY a.creado_en DESC LIMIT 100`, [...geo.selectParams, ...params]) });
}));

router.get("/avisos/:id", asyncHandler(async (req, res) => {
  const item = await one<{ autorId: string; estado: string; venceEn: Date | null }>(`${select}${joins} WHERE a.aviso_id = ? AND u.estado_cuenta = 'activo'`, [idSchema.parse(req.params.id)]);
  if (!item || (item.autorId !== req.userId && (item.estado !== "publicado" || (item.venceEn && item.venceEn.getTime() <= Date.now())))) {
    throw new AppError(404, "NOT_FOUND", "No encontramos este aviso vigente.");
  }
  res.json({ data: item });
}));

router.post("/avisos", requireAuth, asyncHandler(async (req, res) => {
  const body = fields.parse(req.body);
  if (body.venceEn && Date.parse(body.venceEn) <= Date.now()) throw new AppError(400, "INVALID_EXPIRY", "La fecha de vencimiento debe ser futura.");
  const id = await transaction(async (connection) => {
    const locationId = await resolveLocation(connection, req.userId, body.sectorId);
    const [result] = await connection.execute<ResultSetHeader>(
      "INSERT INTO avisos (autor_id, categoria_aviso_id, ubicacion_id, titulo, contenido, estado, fecha_evento, vence_en) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      [req.userId, body.categoriaId, locationId, body.titulo, body.contenido, body.estado ?? "publicado", body.fechaEvento ? new Date(body.fechaEvento) : null, body.venceEn ? new Date(body.venceEn) : null],
    );
    return String(result.insertId);
  });
  res.status(201).json({ data: await one(`${select}${joins} WHERE a.aviso_id = ?`, [id]) });
}));

router.patch("/avisos/:id", requireAuth, asyncHandler(async (req, res) => {
  const id = idSchema.parse(req.params.id);
  const body = fields.partial().refine((value) => Object.keys(value).length > 0, "Indica qué deseas modificar").parse(req.body);
  await transaction(async (connection) => {
    const [rows] = await connection.execute<RowDataPacket[]>("SELECT autor_id FROM avisos WHERE aviso_id = ? FOR UPDATE", [id]);
    if (!rows.length) throw new AppError(404, "NOT_FOUND", "No encontramos este aviso.");
    if (String(rows[0].autor_id) !== req.userId) throw new AppError(403, "FORBIDDEN", "Solo puedes modificar tus avisos.");
    const map = { categoriaId: "categoria_aviso_id", titulo: "titulo", contenido: "contenido", estado: "estado" } as const;
    const changes: string[] = [], values: unknown[] = [];
    for (const key of Object.keys(map) as (keyof typeof map)[]) if (body[key] !== undefined) { changes.push(`${map[key]} = ?`); values.push(body[key]); }
    if (body.fechaEvento !== undefined) { changes.push("fecha_evento = ?"); values.push(body.fechaEvento ? new Date(body.fechaEvento) : null); }
    if (body.venceEn !== undefined) { changes.push("vence_en = ?"); values.push(body.venceEn ? new Date(body.venceEn) : null); }
    if (body.sectorId) { changes.push("ubicacion_id = ?"); values.push(await resolveLocation(connection, req.userId, body.sectorId)); }
    await connection.execute(`UPDATE avisos SET ${changes.join(", ")} WHERE aviso_id = ?`, [...values, id] as never[]);
  });
  res.json({ data: await one(`${select}${joins} WHERE a.aviso_id = ?`, [id]) });
}));

export default router;
