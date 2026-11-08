import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../lib/http.js";
import { idSchema } from "../lib/validation.js";
import { requireAuth } from "../middlewares/auth.js";
import { createPublicationInteraction, getPublicationInteraction, listMyPublicationInteractions, publicationInteractionTypes, updatePublicationInteraction } from "../services/publication-interactions.js";

const router = Router();
const createSchema = z.object({ tipo: z.enum(publicationInteractionTypes) }).strict();
const actionSchema = z.object({ accion: z.enum(["aceptar", "rechazar", "iniciar", "cumplir", "confirmar", "cancelar"]) }).strict();

router.get("/interacciones", requireAuth, asyncHandler(async (req, res) => {
  const query = z.object({ publicacionId: idSchema.optional() }).strict().parse(req.query);
  res.json({ data: await listMyPublicationInteractions(req.userId, query.publicacionId) });
}));

router.post("/publicaciones/:id/interacciones", requireAuth, asyncHandler(async (req, res) => {
  const publicationId = idSchema.parse(req.params.id);
  const body = createSchema.parse(req.body);
  const result = await createPublicationInteraction(req.userId, publicationId, body.tipo);
  res.status(result.reused ? 200 : 201).json(result);
}));

router.get("/interacciones/:id", requireAuth, asyncHandler(async (req, res) => {
  res.json({ data: await getPublicationInteraction(idSchema.parse(req.params.id), req.userId) });
}));

router.patch("/interacciones/:id", requireAuth, asyncHandler(async (req, res) => {
  const body = actionSchema.parse(req.body);
  res.json({ data: await updatePublicationInteraction(req.userId, idSchema.parse(req.params.id), body.accion) });
}));

export default router;
