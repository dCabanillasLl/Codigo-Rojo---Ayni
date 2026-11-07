import { Router } from 'express';
import { requireAuth } from '../middlewares/auth.js';
import {
  listHelpRequests, postHelpRequest, readHelpRequest, patchHelpRequest, readOffers, postOffer,
  patchOffer, putOfferReview, readReputation, readResources, postResource, readResource,
  readReservations, postReservation, patchReservation,
} from '../controllers/community.js';

const router = Router();
router.get('/solicitudes', listHelpRequests);
router.post('/solicitudes', requireAuth, postHelpRequest);
router.get('/solicitudes/:id', readHelpRequest);
router.patch('/solicitudes/:id', requireAuth, patchHelpRequest);
router.get('/solicitudes/:id/ofertas', requireAuth, readOffers);
router.post('/solicitudes/:id/ofertas', requireAuth, postOffer);
router.patch('/ofertas/:id', requireAuth, patchOffer);
router.put('/ofertas/:id/resena', requireAuth, putOfferReview);
router.get('/usuarios/:id/reputacion', readReputation);

router.get('/recursos', readResources);
router.post('/recursos', requireAuth, postResource);
router.get('/recursos/:id', readResource);
router.get('/recursos/:id/reservas', requireAuth, readReservations);
router.post('/recursos/:id/reservas', requireAuth, postReservation);
router.patch('/reservas/:id', requireAuth, patchReservation);
export default router;
