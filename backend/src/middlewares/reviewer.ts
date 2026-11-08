import type { RequestHandler } from "express";
import { config } from "../config.js";
import { AppError } from "../lib/http.js";
import { requireAuth } from "./auth.js";

/** Review privileges come only from server configuration, never request data. */
export const requireVerificationReviewer: RequestHandler = (req, res, next) => {
  requireAuth(req, res, (error?: unknown) => {
    if (error) { next(error); return; }
    if (!config.verificationReviewerUserIds.includes(req.userId)) {
      next(new AppError(403, "REVIEWER_REQUIRED", "Esta operación requiere un revisor vecinal autorizado."));
      return;
    }
    next();
  });
};
