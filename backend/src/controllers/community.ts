import type { Request, Response } from 'express';
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

const endpoint = (action: (req: Request, res: Response) => Promise<void>) => asyncHandler(action);
export const listHelpRequests = endpoint(async (req, res) => { res.json({ data: await listRequests(listSchema.parse(req.query), req.userId) }); });
export const postHelpRequest = endpoint(async (req, res) => {
  const result = await createRequest(req.userId!, createRequestSchema.parse(req.body));
  res.status(result.replayed ? 200 : 201).json({ data: result.request });
});
export const readHelpRequest = endpoint(async (req, res) => { res.json({ data: await getRequest(idSchema.parse(req.params.id), req.userId) }); });
export const patchHelpRequest = endpoint(async (req, res) => {
  res.json({ data: await closeRequest(req.userId!, idSchema.parse(req.params.id), closeRequestSchema.parse(req.body)) });
});
export const readOffers = endpoint(async (req, res) => { res.json({ data: await listOffers(req.userId!, idSchema.parse(req.params.id)) }); });
export const postOffer = endpoint(async (req, res) => {
  const result = await createOffer(req.userId!, idSchema.parse(req.params.id), offerSchema.parse(req.body));
  res.status(result.replayed ? 200 : 201).json({ data: result.offer });
});
export const patchOffer = endpoint(async (req, res) => {
  res.json({ data: await updateOffer(req.userId!, idSchema.parse(req.params.id), offerActionSchema.parse(req.body)) });
});
export const putOfferReview = endpoint(async (req, res) => {
  res.json({ data: await saveReview(req.userId!, idSchema.parse(req.params.id), reviewSchema.parse(req.body)) });
});
export const readReputation = endpoint(async (req, res) => { res.json({ data: await getReputation(idSchema.parse(req.params.id), req.userId) }); });
export const readResources = endpoint(async (req, res) => { res.json({ data: await listResources(listSchema.parse(req.query), req.userId) }); });
export const postResource = endpoint(async (req, res) => { res.status(201).json({ data: await createResource(req.userId!, resourceSchema.parse(req.body)) }); });
export const readResource = endpoint(async (req, res) => { res.json({ data: await getResource(idSchema.parse(req.params.id)) }); });
export const readReservations = endpoint(async (req, res) => { res.json({ data: await listReservations(req.userId!, idSchema.parse(req.params.id)) }); });
export const postReservation = endpoint(async (req, res) => {
  const result = await createReservation(req.userId!, idSchema.parse(req.params.id), reservationSchema.parse(req.body));
  res.status(result.replayed ? 200 : 201).json({ data: result.reservation });
});
export const patchReservation = endpoint(async (req, res) => {
  res.json({ data: await updateReservation(req.userId!, idSchema.parse(req.params.id), reservationActionSchema.parse(req.body)) });
});
