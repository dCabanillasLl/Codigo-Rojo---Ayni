/** Estados persistidos por 015_visto_bueno_verificado.sql. */
export type IdentityVerificationState = 'PENDIENTE' | 'VERIFICADA' | 'RECHAZADA' | 'REVOCADA';
export type ZoneMembershipState = IdentityVerificationState;
export type PublicationInteractionType = 'CONSULTA' | 'COMPRA' | 'CONTRATACION' | 'OTRO';
export type PublicationInteractionState = 'PENDIENTE' | 'ACEPTADA' | 'EN_CURSO' | 'CONFIRMADA' | 'RECHAZADA' | 'CANCELADA';
export type RecommendationVerificationState = 'NO_VERIFICADA' | 'PENDIENTE' | 'VERIFICADA';
export type Rating = 1 | 2 | 3 | 4 | 5;

export interface IdentityVerification {
  id: string;
  userId: string;
  state: IdentityVerificationState;
  method: string;
  reviewerId?: string | null;
  verifiedAt: Date | null;
  revokedAt: Date | null;
}

export interface ZoneMembership {
  id: string;
  userId: string;
  sectorId: string;
  method: string;
  reviewerId?: string | null;
  state: ZoneMembershipState;
  verifiedAt: Date | null;
  expiresAt: Date | null;
  revokedAt: Date | null;
}

export interface PublicationInteraction {
  id: string;
  publicationId: string;
  requesterId: string;
  ownerId: string;
  type: PublicationInteractionType;
  state: PublicationInteractionState;
  requesterConfirmedAt: Date | null;
  ownerConfirmedAt: Date | null;
  confirmedAt: Date | null;
}

export interface PublicationRecommendation {
  id: string;
  publicationId: string;
  authorId: string;
  interactionId: string | null;
  rating: Rating;
  comment: string | null;
  verificationState: RecommendationVerificationState;
  createdAt: Date;
  updatedAt: Date;
  verifiedAt: Date | null;
}
