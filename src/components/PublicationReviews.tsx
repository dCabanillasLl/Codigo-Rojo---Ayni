import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useApp } from '../AppContext';
import Icon from './Icon';
import { ErrorBox, Field, RemoteState, formatDate } from './UI';
import { ApiError, errorMessage, refreshData } from '../lib/api';
import { useRemote } from '../lib/hooks';
import {
  getMyPublicationInteractions, getRecommendationPage, getRecommendationSummary,
  submitPublicationRecommendation, type RecommendationFilter,
} from '../lib/recommendations';
import type { PublicationInteraction, PublicationRecommendation, RecommendationPage, RecommendationSummary } from '../types';

const FILTERS: { id: RecommendationFilter; label: string }[] = [
  { id: 'todas', label: 'Todas' }, { id: 'verificadas', label: 'Verificadas' },
  { id: 'no_verificadas', label: 'Sin verificar' }, { id: 'pendientes', label: 'Pendientes' },
];

function interactionLabel(item: PublicationInteraction) {
  const type = ({ CONSULTA: 'Consulta', COMPRA: 'Compra', CONTRATACION: 'Servicio', OTRO: 'Otra experiencia' } as const)[item.tipo];
  const state = ({ PENDIENTE: 'Propuesta pendiente', ACEPTADA: 'Aceptada', EN_CURSO: 'En curso', CONFIRMADA: 'Confirmada', RECHAZADA: 'Rechazada', CANCELADA: 'Cancelada' } as const)[item.estado];
  return `${type} · ${state}${item.resenaCreada ? ' · Ya tiene una opinión' : ''}`;
}

export function VerifiedBadge({ state }: { state: PublicationRecommendation['estadoVerificacion'] }) {
  const config = {
    VERIFICADA: { className: 'recommendation-badge recommendation-badge-verified', icon: 'shield' as const, text: 'Visto Bueno Vecinal Verificado' },
    PENDIENTE: { className: 'recommendation-badge recommendation-badge-pending', icon: 'clock' as const, text: 'Verificación pendiente' },
    NO_VERIFICADA: { className: 'recommendation-badge recommendation-badge-neutral', icon: 'info' as const, text: 'Opinión no verificada' },
  }[state];
  return <span className={config.className}><Icon name={config.icon} size={15}/>{config.text}</span>;
}

export function ReviewSummary({ summary }: { summary: RecommendationSummary }) {
  return <div className="recommendation-summary" aria-label="Resumen de recomendaciones">
    <div><b>{summary.total}</b><span>opiniones</span></div>
    <div><b>{summary.verificadas}</b><span>vistos buenos</span></div>
    <div><b>{summary.promedioVerificado == null ? '—' : `${summary.promedioVerificado}/5`}</b><span>promedio verificado</span></div>
    <div><b>{summary.noVerificadas}</b><span>sin verificar</span></div>
  </div>;
}

function ReviewFilters({ value, onChange }: { value: RecommendationFilter; onChange: (value: RecommendationFilter) => void }) {
  return <div className="recommendation-filters" role="group" aria-label="Filtrar recomendaciones">
    {FILTERS.map(filter => <button key={filter.id} type="button" aria-pressed={value === filter.id}
      className={value === filter.id ? 'recommendation-filter is-active' : 'recommendation-filter'} onClick={() => onChange(filter.id)}>{filter.label}</button>)}
  </div>;
}

function ReviewList({ items }: { items: PublicationRecommendation[] }) {
  if (!items.length) return <div className="recommendation-empty"><Icon name="star" size={25}/><b>Aún no hay opiniones con este filtro</b><span>Las recomendaciones aparecerán aquí cuando un vecino las comparta.</span></div>;
  return <div className="recommendation-list">{items.map(item => <article className="recommendation-card" key={item.id}>
    <div className="recommendation-card-top"><div className="recommendation-author"><span aria-hidden="true">{(item.autor || 'V').trim().slice(0, 1).toUpperCase()}</span><b>{item.autor || 'Vecino'}</b></div><time dateTime={item.creadoEn || undefined}>{formatDate(item.creadoEn)}</time></div>
    <div className="recommendation-rating" aria-label={`${item.calificacion} de 5 estrellas`}>{[1, 2, 3, 4, 5].map(star => <Icon key={star} name="star" size={17} className={star <= item.calificacion ? 'is-filled' : ''}/>)}</div>
    {item.comentario && <p className="recommendation-comment">{item.comentario}</p>}
    <VerifiedBadge state={item.estadoVerificacion}/>
    {item.estadoVerificacion !== 'VERIFICADA' && <small className="recommendation-explanation">{item.estadoVerificacion === 'PENDIENTE'
      ? 'La experiencia todavía no reúne todos los requisitos de confirmación, identidad y zona.'
      : 'No se vinculó una experiencia confirmada en AYNI. Esta opinión no tiene sello verificado.'}</small>}
  </article>)}</div>;
}

function ReviewForm({ publicationId, interactions, loadingInteractions, interactionsError, onSubmit, busy, error, disabled }: {
  publicationId: string; interactions: PublicationInteraction[]; loadingInteractions: boolean; interactionsError: string;
  onSubmit: (rating: number, comment: string, interactionId?: string) => Promise<boolean>;
  busy: boolean; error: string; disabled: boolean;
}) {
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState('');
  const [interactionId, setInteractionId] = useState('');
  const relevant = useMemo(() => interactions.filter(item => item.publicacionId === publicationId && item.miRol === 'SOLICITANTE'
    && ['PENDIENTE', 'ACEPTADA', 'EN_CURSO', 'CONFIRMADA'].includes(item.estado)), [interactions, publicationId]);
  const selectedInteraction = relevant.find(item => item.id === interactionId);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (selectedInteraction?.resenaCreada) return;
    if (await onSubmit(rating, comment.trim(), interactionId || undefined)) {
      setRating(5); setComment(''); setInteractionId('');
    }
  }

  return <form className="recommendation-form" onSubmit={event => void handleSubmit(event)} aria-label="Escribir una recomendación">
    <div className="recommendation-form-heading"><span><Icon name="star" size={19}/></span><div><b>Comparte tu experiencia</b><p>Ayuda a otros vecinos a elegir con confianza.</p></div></div>
    <Field label="Tu calificación"><div className="review-stars" role="group" aria-label="Califica de 1 a 5 estrellas">{[1, 2, 3, 4, 5].map(star => <button key={star} type="button" aria-label={`${star} de 5 estrellas`} aria-pressed={rating === star} onClick={() => setRating(star)}><Icon name="star" size={24}/></button>)}</div></Field>
    <Field label="Comentario (opcional)" hint={`${comment.length}/1200 · AYNI no admite contenido ofensivo, sexual o comercial no permitido.`}>
      <textarea value={comment} onChange={event => setComment(event.target.value)} maxLength={1200} rows={3} placeholder="¿Cómo fue tu experiencia con este producto o servicio?" aria-label="Comentario de la recomendación"/>
    </Field>
    <Field label="Vincular una experiencia (opcional)" hint="Una experiencia confirmada no garantiza el sello: también se revisan la identidad y la zona.">
      <select value={interactionId} onChange={event => setInteractionId(event.target.value)} disabled={loadingInteractions || busy} aria-label="Selecciona una experiencia existente">
        <option value="">Publicar sin vincular una experiencia</option>
        {relevant.map(item => <option key={item.id} value={item.id} disabled={item.resenaCreada}>{interactionLabel(item)}</option>)}
      </select>
    </Field>
    {loadingInteractions && <p className="form-hint" role="status">Buscando tus experiencias para esta publicación…</p>}
    {interactionsError && <p className="form-hint" role="status">No pudimos cargar las experiencias. Puedes intentar de nuevo o publicar sin vincular una.</p>}
    {selectedInteraction && <p className="recommendation-experience-note" role="status">{selectedInteraction.estado === 'CONFIRMADA'
      ? 'Esta experiencia está confirmada por ambas partes. AYNI revisará también identidad y zona antes de mostrar el sello.'
      : 'Esta experiencia aún está pendiente; tu opinión aparecerá como verificación pendiente hasta completar el proceso.'}</p>}
    {!loadingInteractions && !interactionsError && relevant.length === 0 && <p className="form-hint">No encontramos experiencias tuyas para esta publicación. Puedes dejar una opinión sin vincularla.</p>}
    <ErrorBox message={error}/>
    <button type="submit" className="record-button recommendation-submit" disabled={busy || disabled || Boolean(selectedInteraction?.resenaCreada)}>{busy ? 'Publicando…' : <><Icon name="send" size={17}/>Publicar opinión</>}</button>
    <small className="recommendation-privacy">Tu comentario se mostrará como texto. No compartas datos personales ni información privada.</small>
  </form>;
}

export default function PublicationReviews({ publicationId, ownerId }: { publicationId: string; ownerId: string }) {
  const { user, online, requireUser, notify, setUser, setAuthOpen } = useApp();
  const [filter, setFilter] = useState<RecommendationFilter>('todas');
  const [page, setPage] = useState(1);
  const [pageData, setPageData] = useState<RecommendationPage | null>(null);
  const [pageLoading, setPageLoading] = useState(true);
  const [pageError, setPageError] = useState('');
  const [reload, setReload] = useState(0);
  const [submitError, setSubmitError] = useState('');
  const [busy, setBusy] = useState(false);
  const summary = useRemote<RecommendationSummary>(`/publicaciones/${publicationId}/resenas/resumen`, user?.id || 'public');
  const isOwner = user?.id === ownerId;
  const interactionsPath = user && !isOwner ? `/interacciones?publicacionId=${encodeURIComponent(publicationId)}` : null;
  const interactions = useRemote<PublicationInteraction[]>(interactionsPath, user?.id || 'public');
  const ownedInteractionList = interactions.data || [];

  useEffect(() => { setPage(1); setFilter('todas'); setPageData(null); }, [publicationId]);
  useEffect(() => {
    const controller = new AbortController(); let active = true;
    setPageLoading(true); setPageError('');
    if (!online) { setPageError('Conéctate a internet para consultar las recomendaciones actualizadas.'); setPageLoading(false); return () => { active = false; controller.abort(); }; }
    getRecommendationPage(publicationId, { filtro: filter, pagina: page, porPagina: 5, orden: 'recientes', signal: controller.signal, expectedUserId: user?.id })
      .then(value => { if (active) setPageData(value); })
      .catch(cause => { if (active) { setPageData(null); setPageError(errorMessage(cause)); } })
      .finally(() => { if (active) setPageLoading(false); });
    return () => { active = false; controller.abort(); };
  }, [publicationId, filter, page, user?.id, online, reload]);

  async function publish(rating: number, comment: string, interactionId?: string): Promise<boolean> {
    if (!user) { requireUser(); return false; }
    if (isOwner || busy) return false;
    setBusy(true); setSubmitError('');
    try {
      const result = await submitPublicationRecommendation(publicationId, {
        calificacion: rating,
        ...(comment ? { comentario: comment } : {}),
        ...(interactionId ? { interaccionId: interactionId } : {}),
      }, { expectedUserId: user!.id });
      notify(result.estadoVerificacion === 'VERIFICADA' ? 'Tu Visto Bueno Vecinal quedó verificado.'
        : result.estadoVerificacion === 'PENDIENTE' ? 'Tu opinión se publicó y quedó pendiente de verificación.' : 'Tu opinión se publicó sin sello de verificación.');
      setFilter('todas'); setPage(1); setReload(value => value + 1);
      summary.reload(); interactions.reload(); refreshData();
      return true;
    } catch (cause) {
      setSubmitError(errorMessage(cause));
      if (cause instanceof ApiError && cause.status === 401) { setUser(null); setAuthOpen(true); }
      return false;
    } finally { setBusy(false); }
  }

  const ownsReview = Boolean(summary.data?.miOpinion);
  return <section className="publication-reviews" aria-labelledby="publication-reviews-title">
    <header className="publication-reviews-header"><div><p className="eyebrow">CONFIANZA VECINAL</p><h3 id="publication-reviews-title" className="section-subtitle font-display">Recomendaciones de esta publicación</h3><p>Opiniones de vecinos con su nivel de verificación visible.</p></div><span className="recommendation-total">{summary.data?.total ?? 0} {summary.data?.total === 1 ? 'opinión' : 'opiniones'}</span></header>
    {summary.data && <ReviewSummary summary={summary.data}/>}
    <RemoteState {...summary}/>
    <ReviewFilters value={filter} onChange={value => { setFilter(value); setPage(1); }}/>
    {pageLoading && <p className="loading-message" role="status">Cargando recomendaciones…</p>}
    {pageError && !pageLoading && <div className="error-box" role="alert"><span>{pageError}</span><button className="text-action" type="button" onClick={() => setReload(value => value + 1)}>Reintentar</button></div>}
    {!pageLoading && !pageError && <ReviewList items={pageData?.data || []}/>}
    {pageData && pageData.paginacion.totalPaginas > 1 && <nav className="recommendation-pagination" aria-label="Paginación de recomendaciones">
      <button type="button" className="outline-btn" disabled={page <= 1 || pageLoading} onClick={() => setPage(value => Math.max(1, value - 1))}>Anterior</button>
      <span aria-live="polite">Página {pageData.paginacion.pagina} de {pageData.paginacion.totalPaginas}</span>
      <button type="button" className="outline-btn" disabled={page >= pageData.paginacion.totalPaginas || pageLoading} onClick={() => setPage(value => value + 1)}>Siguiente</button>
    </nav>}
    {isOwner ? <p className="recommendation-owner-note" role="status">Como dueño de esta publicación, no puedes recomendarla.</p>
      : ownsReview ? <p className="recommendation-owner-note" role="status">Ya compartiste una opinión sobre esta publicación. Gracias por ayudar a otros vecinos.</p>
      : user ? <ReviewForm publicationId={publicationId} interactions={ownedInteractionList} loadingInteractions={interactions.loading}
        interactionsError={interactions.error} onSubmit={publish} busy={busy} error={submitError} disabled={!online}/>
      : <div className="recommendation-login"><b>¿Ya tuviste una experiencia con esta publicación?</b><p>Inicia sesión para compartir una opinión.</p><button className="outline-btn" type="button" onClick={() => requireUser()}><Icon name="user" size={16}/>Iniciar sesión</button></div>}
  </section>;
}
