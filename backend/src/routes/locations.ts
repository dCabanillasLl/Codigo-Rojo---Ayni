import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { asyncHandler } from '../lib/http.js';
import { searchAddresses } from '../services/geocoding.js';

const router = Router();
const limiter = rateLimit({ windowMs: 60_000, limit: 15, standardHeaders: 'draft-7', legacyHeaders: false,
  message: { error: { code: 'GEOCODING_RATE_LIMITED', message: 'Has buscado varias direcciones. Espera un minuto para continuar.' } } });
router.get('/ubicaciones/buscar', limiter, asyncHandler(async (req, res) => {
  const { q } = z.object({ q: z.string().trim().min(3).max(200) }).strict().parse(req.query);
  res.setHeader('Cache-Control', 'no-store');
  res.json({ data: await searchAddresses(q) });
}));
export default router;
