import { Router } from 'express';
import { z } from 'zod';
import { query } from '../db/index.js';
import { asyncHandler } from '../lib/http.js';
import { requireAuth } from '../middlewares/auth.js';

const router = Router();
router.get('/notificaciones', requireAuth, asyncHandler(async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const items = await query<{ id: string; text: string; createdAt: Date; read: number; avisoId: string | null; solicitudId: string | null; ofertaId: string | null; tipo: string }>(`SELECT notificacion_id AS id, texto AS text, creado_en AS createdAt,
    (leida_en IS NOT NULL) AS \`read\`, CAST(aviso_id AS CHAR) AS avisoId, NULL AS solicitudId, NULL AS ofertaId, 'aviso' AS tipo
    FROM notificaciones_avisos WHERE usuario_id = ?
    UNION ALL
    SELECT notificacion_id AS id, texto AS text, creado_en AS createdAt,
    (leida_en IS NOT NULL) AS \`read\`, NULL AS avisoId, CAST(solicitud_id AS CHAR) AS solicitudId, CAST(oferta_id AS CHAR) AS ofertaId, tipo
    FROM notificaciones_interacciones WHERE usuario_id = ?
    ORDER BY createdAt DESC, id DESC LIMIT 100`, [req.userId, req.userId]);
  res.json({ data: items.map(item => ({ ...item, ownerId: req.userId, read: Boolean(item.read) })) });
}));
router.post('/notificaciones/leidas', requireAuth, asyncHandler(async (req, res) => {
  const { ids } = z.object({ ids: z.array(z.string().uuid()).max(100) }).strict().parse(req.body);
  if (ids.length) {
    const placeholders = ids.map(() => '?').join(',');
    await query(`UPDATE notificaciones_avisos SET leida_en = COALESCE(leida_en, UTC_TIMESTAMP()) WHERE usuario_id = ? AND notificacion_id IN (${placeholders})`, [req.userId, ...ids]);
    await query(`UPDATE notificaciones_interacciones SET leida_en = COALESCE(leida_en, UTC_TIMESTAMP()) WHERE usuario_id = ? AND notificacion_id IN (${placeholders})`, [req.userId, ...ids]);
  }
  res.json({ data: { actualizado: true } });
}));
export default router;
