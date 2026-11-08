import { api, apiEnvelope, type ApiOptions } from './api';
import type { PublicationInteraction, PublicationRecommendation, RecommendationPage, RecommendationSummary } from '../types';

export type RecommendationFilter = 'todas' | 'verificadas' | 'no_verificadas' | 'pendientes';
export type RecommendationOrder = 'recientes' | 'antiguas';

export function getRecommendationPage(publicationId: string, options: ApiOptions & {
  filtro: RecommendationFilter; pagina: number; porPagina?: number; orden?: RecommendationOrder;
}): Promise<RecommendationPage> {
  const params = new URLSearchParams({
    filtro: options.filtro,
    pagina: String(options.pagina),
    porPagina: String(options.porPagina ?? 5),
    orden: options.orden ?? 'recientes',
  });
  return apiEnvelope<PublicationRecommendation[]>(`/publicaciones/${encodeURIComponent(publicationId)}/resenas?${params}`, options)
    .then((result) => ({ data: result.data, paginacion: result.paginacion as RecommendationPage['paginacion'] }));
}

export function getRecommendationSummary(publicationId: string, options: ApiOptions = {}) {
  return api<RecommendationSummary>(`/publicaciones/${encodeURIComponent(publicationId)}/resenas/resumen`, options);
}

export function getMyPublicationInteractions(publicationId: string, options: ApiOptions & { expectedUserId: string }) {
  const params = new URLSearchParams({ publicacionId: publicationId });
  return api<PublicationInteraction[]>(`/interacciones?${params}`, options);
}

export function submitPublicationRecommendation(publicationId: string, input: {
  calificacion: number; comentario?: string; interaccionId?: string;
}, options: ApiOptions & { expectedUserId: string }) {
  return api<PublicationRecommendation>(`/publicaciones/${encodeURIComponent(publicationId)}/resenas`, {
    ...options, method: 'POST', body: input,
  });
}
