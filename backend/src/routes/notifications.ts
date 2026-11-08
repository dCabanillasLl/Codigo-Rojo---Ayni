import { Router } from 'express';
import { z } from 'zod';
import { query } from '../db/index.js';
import { asyncHandler } from '../lib/http.js';
import { requireAuth } from '../middlewares/auth.js';

const router = Router();
router.get('/notificaciones', requireAuth, asyncHandler(async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const items = await query<{ id: string; text: string; createdAt: Date; read: number; avisoId: string | null }>(`SELECT notificacion_id AS id, texto AS text, creado_en AS createdAt,
    (leida_en IS NOT NULL) AS \`read\`, CAST(aviso_id AS CHAR) AS avisoId
    FROM notificaciones_avisos WHERE usuario_id = ? ORDER BY creado_en DESC, notificacion_id DESC LIMIT 100`, [req.userId]);
  res.json({ data: items.map(item => ({ ...item, read: Boolean(item.read) })) });
}));
router.post('/notificaciones/leidas', requireAuth, asyncHandler(async (req, res) => {
  const { ids } = z.object({ ids: z.array(z.string().uuid()).max(100) }).strict().parse(req.body);
  if (ids.length) await query(`UPDATE notificaciones_avisos SET leida_en = COALESCE(leida_en, UTC_TIMESTAMP()) WHERE usuario_id = ? AND notificacion_id IN (${ids.map(() => '?').join(',')})`, [req.userId, ...ids]);
  res.json({ data: { actualizado: true } });
}));
export default router;
