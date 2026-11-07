import { Router } from 'express';
import { requireAuth } from '../middlewares/auth.js';
import { asyncHandler } from '../lib/http.js';
import { idSchema, listSchema } from '../services/community-data.js';
import {
  closeRequest, closeRequestSchema, createOffer, createRequest, createRequestSchema,
  getReputation, getRequest, listOffers, listRequests, offerActionSchema, offerSchema,
  reviewSchema, saveReview, updateOffer,
} from '../services/community.js';
import {
  createReservation, createResource, getResource, listReservations, listResources,
  reservationActionSchema, reservationSchema, resourceSchema, updateReservation,
} from '../services/resources.js';

const router = Router();
router.get('/solicitudes', asyncHandler(async (req, res) => {
  res.json({ data: await listRequests(listSchema.parse(req.query), req.userId) });
}));
router.post('/solicitudes', requireAuth, asyncHandler(async (req, res) => {
  const result = await createRequest(req.userId!, createRequestSchema.parse(req.body));
  res.status(result.replayed ? 200 : 201).json({ data: result.request });
}));
router.get('/solicitudes/:id', asyncHandler(async (req, res) => {
  res.json({ data: await getRequest(idSchema.parse(req.params.id), req.userId) });
}));
router.patch('/solicitudes/:id', requireAuth, asyncHandler(async (req, res) => {
  res.json({ data: await closeRequest(req.userId!, idSchema.parse(req.params.id), closeRequestSchema.parse(req.body)) });
}));
router.get('/solicitudes/:id/ofertas', requireAuth, asyncHandler(async (req, res) => {
  res.json({ data: await listOffers(req.userId!, idSchema.parse(req.params.id)) });
}));
router.post('/solicitudes/:id/ofertas', requireAuth, asyncHandler(async (req, res) => {
  const result = await createOffer(req.userId!, idSchema.parse(req.params.id), offerSchema.parse(req.body));
  res.status(result.replayed ? 200 : 201).json({ data: result.offer });
}));
router.patch('/ofertas/:id', requireAuth, asyncHandler(async (req, res) => {
  res.json({ data: await updateOffer(req.userId!, idSchema.parse(req.params.id), offerActionSchema.parse(req.body)) });
}));
router.put('/ofertas/:id/resena', requireAuth, asyncHandler(async (req, res) => {
  res.json({ data: await saveReview(req.userId!, idSchema.parse(req.params.id), reviewSchema.parse(req.body)) });
}));
router.get('/usuarios/:id/reputacion', asyncHandler(async (req, res) => {
  res.json({ data: await getReputation(idSchema.parse(req.params.id)) });
}));

router.get('/recursos', asyncHandler(async (req, res) => {
  res.json({ data: await listResources(listSchema.parse(req.query), req.userId) });
}));
router.post('/recursos', requireAuth, asyncHandler(async (req, res) => {
  res.status(201).json({ data: await createResource(req.userId!, resourceSchema.parse(req.body)) });
}));
router.get('/recursos/:id', asyncHandler(async (req, res) => {
  res.json({ data: await getResource(idSchema.parse(req.params.id)) });
}));
router.get('/recursos/:id/reservas', requireAuth, asyncHandler(async (req, res) => {
  res.json({ data: await listReservations(req.userId!, idSchema.parse(req.params.id)) });
}));
router.post('/recursos/:id/reservas', requireAuth, asyncHandler(async (req, res) => {
  const result = await createReservation(req.userId!, idSchema.parse(req.params.id), reservationSchema.parse(req.body));
  res.status(result.replayed ? 200 : 201).json({ data: result.reservation });
}));
router.patch('/reservas/:id', requireAuth, asyncHandler(async (req, res) => {
  res.json({ data: await updateReservation(req.userId!, idSchema.parse(req.params.id), reservationActionSchema.parse(req.body)) });
}));
export default router;
