import type { PublicationInteractionState, RecommendationVerificationState } from "../models/recommendations.js";

export interface RecommendationEvidence {
  interactionId: string | null;
  interactionState?: PublicationInteractionState | null;
  participantsMatch: boolean;
  providerMatchesPublication: boolean;
  authorIsOwner: boolean;
  requesterConfirmed: boolean;
  providerFulfilled: boolean;
  authorIdentityVerified: boolean;
  authorZoneVerified: boolean;
}

/** Returns a current evidence state; callers reject relationship mismatches before invoking it. */
export function deriveRecommendationVerificationState(evidence: RecommendationEvidence): RecommendationVerificationState {
  if (!evidence.interactionId) return "NO_VERIFICADA";
  if (!evidence.participantsMatch || !evidence.providerMatchesPublication || evidence.authorIsOwner ||
      evidence.interactionState === "RECHAZADA" || evidence.interactionState === "CANCELADA") return "NO_VERIFICADA";
  if (evidence.interactionState !== "CONFIRMADA" || !evidence.requesterConfirmed || !evidence.providerFulfilled ||
      !evidence.authorIdentityVerified || !evidence.authorZoneVerified) return "PENDIENTE";
  return "VERIFICADA";
}
