import { Router } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { AppError, asyncHandler } from "../lib/http.js";
import { idSchema } from "../lib/validation.js";
import { requireVerificationReviewer } from "../middlewares/reviewer.js";
import { listPendingReviews, reviewIdentity, reviewZoneMembership, type ReviewAction, type ReviewMethod } from "../services/verification.js";

const router = Router();
const reviewerLimiter = rateLimit({ windowMs: 60 * 1000, limit: 60, standardHeaders: "draft-7", legacyHeaders: false });
const reviewBody = z.object({
  accion: z.enum(["aprobar", "rechazar", "revocar"]),
  metodo: z.enum(["REVISION_PRESENCIAL", "REFERENCIA_VECINAL", "VALIDACION_INSTITUCIONAL", "OTRO"]),
  motivo: z.string().trim().min(8).max(500).optional(),
  venceEn: z.string().datetime({ offset: true }).optional(),
}).strict().superRefine((body, context) => {
  if (body.accion !== "aprobar" && !body.motivo) {
    context.addIssue({ code: "custom", path: ["motivo"], message: "Indica el motivo del rechazo o la revocación." });
  }
  if (body.motivo && /\b\d{8}\b/.test(body.motivo)) {
    context.addIssue({ code: "custom", path: ["motivo"], message: "No incluyas DNI u otros datos sensibles en el motivo." });
  }
  if (body.venceEn && body.accion !== "aprobar") {
    context.addIssue({ code: "custom", path: ["venceEn"], message: "El vencimiento solo se usa al aprobar una zona." });
  }
});

router.use(requireVerificationReviewer, reviewerLimiter);

router.get("/admin/verifications", asyncHandler(async (req, res) => {
  const { tipo } = z.object({ tipo: z.enum(["identidad", "zona"]) }).strict().parse(req.query);
  res.json({ data: await listPendingReviews(tipo) });
}));

router.patch("/admin/verifications/identity/:userId", asyncHandler(async (req, res) => {
  const { userId } = z.object({ userId: idSchema }).strict().parse(req.params);
  const body = reviewBody.parse(req.body);
  res.json({ data: await reviewIdentity(userId, req.userId, body.accion as ReviewAction,
    body.metodo as ReviewMethod, body.motivo ?? null) });
}));

router.patch("/admin/verifications/zones/:id", asyncHandler(async (req, res) => {
  const { id } = z.object({ id: idSchema }).strict().parse(req.params);
  const body = reviewBody.parse(req.body);
  const expiresAt = body.venceEn ? new Date(body.venceEn) : null;
  if (body.accion === "aprobar" && body.venceEn && expiresAt!.getTime() <= Date.now()) {
    throw new AppError(400, "INVALID_EXPIRATION", "El vencimiento debe ser una fecha futura.");
  }
  res.json({ data: await reviewZoneMembership(id, req.userId, body.accion as ReviewAction,
    body.metodo as ReviewMethod, body.motivo ?? null, expiresAt) });
}));

export default router;
