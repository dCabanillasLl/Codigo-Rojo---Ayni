import { Router } from "express";
import { asyncHandler } from "../lib/http.js";
import { idSchema } from "../lib/validation.js";
import { requireAuth } from "../middlewares/auth.js";
import {
  createPublicationRecommendation, getPublicationRecommendationSummary,
  listPublicationRecommendations, recommendationInputSchema, recommendationListSchema,
} from "../services/recommendations.js";

const router = Router();

router.post("/publicaciones/:id/resenas", requireAuth, asyncHandler(async (req, res) => {
  const publicationId = idSchema.parse(req.params.id);
  const body = recommendationInputSchema.parse(req.body);
  res.status(201).json({ data: await createPublicationRecommendation(req.userId, publicationId, body) });
}));

router.get("/publicaciones/:id/resenas/resumen", asyncHandler(async (req, res) => {
  res.json({ data: await getPublicationRecommendationSummary(idSchema.parse(req.params.id), req.userId) });
}));

router.get("/publicaciones/:id/resenas", asyncHandler(async (req, res) => {
  const options = recommendationListSchema.parse(req.query);
  res.json(await listPublicationRecommendations(idSchema.parse(req.params.id), req.userId, options));
}));

export default router;
