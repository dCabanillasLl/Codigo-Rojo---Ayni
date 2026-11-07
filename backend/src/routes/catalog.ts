import { Router } from "express";
import { query } from "../db/index.js";
import { asyncHandler } from "../lib/http.js";

const router = Router();
router.get("/sectores", asyncHandler(async (_req, res) => {
  res.json({ data: await query("SELECT CAST(sector_id AS CHAR) AS id, nombre, distrito, ciudad FROM sectores_vecinales ORDER BY distrito, nombre LIMIT 200") });
}));
router.get("/catalogos", asyncHandler(async (_req, res) => {
  const [publicaciones, ayuda, avisos] = await Promise.all([
    query("SELECT CAST(categoria_id AS CHAR) AS id, nombre FROM categorias_publicacion ORDER BY nombre"),
    query("SELECT CAST(categoria_ayuda_id AS CHAR) AS id, nombre FROM categorias_ayuda ORDER BY nombre"),
    query("SELECT CAST(categoria_aviso_id AS CHAR) AS id, nombre FROM categorias_avisos ORDER BY nombre"),
  ]);
  res.json({ data: { publicaciones, ayuda, avisos } });
}));
export default router;
