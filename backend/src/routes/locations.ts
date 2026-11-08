import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { asyncHandler } from '../lib/http.js';
import { searchAddresses } from '../services/geocoding.js';
import { reverseAddress, suggestAddresses } from '../services/place-lookup.js';

const router = Router();
const limiter = rateLimit({ windowMs: 60_000, limit: 15, standardHeaders: 'draft-7', legacyHeaders: false,
  message: { error: { code: 'GEOCODING_RATE_LIMITED', message: 'Has buscado varias direcciones. Espera un minuto para continuar.' } } });
const placesLimiter = rateLimit({ windowMs: 60_000, limit: 60, standardHeaders: 'draft-7', legacyHeaders: false,
  message: { error: { code: 'PLACE_LOOKUP_RATE_LIMITED', message: 'Has consultado varias direcciones. Espera un momento.' } } });
const pointFields = { latitud: z.coerce.number().finite().min(-90).max(90), longitud: z.coerce.number().finite().min(-180).max(180) };
router.get('/ubicaciones/sugerencias', placesLimiter, asyncHandler(async (req, res) => {
  const data = z.object({ q: z.string().trim().min(3).max(200), latitud: pointFields.latitud.optional(), longitud: pointFields.longitud.optional() }).strict()
    .refine(data => (data.latitud === undefined) === (data.longitud === undefined), 'Proporciona ambas coordenadas').parse(req.query);
  res.setHeader('Cache-Control', 'no-store');
  res.json({ data: await suggestAddresses(data.q, data.latitud === undefined ? undefined : { latitud: data.latitud, longitud: data.longitud! }) });
}));
router.get('/ubicaciones/reversa', placesLimiter, asyncHandler(async (req, res) => {
  const point = z.object(pointFields).strict().parse(req.query);
  res.setHeader('Cache-Control', 'no-store');
  res.json({ data: { direccion: await reverseAddress(point) } });
}));
router.get('/ubicaciones/buscar', limiter, asyncHandler(async (req, res) => {
  const { q } = z.object({ q: z.string().trim().min(3).max(200) }).strict().parse(req.query);
  res.setHeader('Cache-Control', 'no-store');
  res.json({ data: await searchAddresses(q) });
}));
export default router;
