import express, { type RequestHandler } from 'express';

const smallJson = express.json({ limit: '64kb' });
// Only authenticated photo routes receive the larger body parser.
export const publicationJson = express.json({ limit: '8mb' });
export const defaultJson: RequestHandler = (req, res, next) => {
  const publication = req.method === 'POST' && /^\/api\/(?:publicaciones|avisos)\/?$/i.test(req.path)
    || req.method === 'PATCH' && /^\/api\/(?:publicaciones|avisos)\/[1-9]\d{0,19}\/?$/i.test(req.path);
  const profile = req.method === 'PATCH' && /^\/api\/auth\/me\/?$/i.test(req.path);
  if (publication || profile) { next(); return; }
  smallJson(req, res, next);
};
