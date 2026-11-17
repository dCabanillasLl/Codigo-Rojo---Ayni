import { useEffect, useState, type FormEvent } from 'react';
import { useApp } from '../AppContext';
import Icon from './Icon';
import { ErrorBox, Field, RemoteState, formatDate } from './UI';
import { ApiError, errorMessage, refreshData } from '../lib/api';
import { useRemote } from '../lib/hooks';
import {
  getRecommendationPage,
  submitPublicationRecommendation,
} from '../lib/recommendations';
import type { PublicationRecommendation, RecommendationPage, RecommendationSummary } from '../types';
import { localize, useLanguage } from '../lib/language';

export function ReviewSummary({ summary }: { summary: RecommendationSummary }) {
  return <div className="recommendation-summary" aria-label="Resumen de recomendaciones">
    <div><b>{summary.total}</b><span>opiniones</span></div>
    <div><b>{summary.promedioGeneral == null ? '—' : `${summary.promedioGeneral}/5`}</b><span>calificación promedio</span></div>
  </div>;
}

function ReviewList({ items }: { items: PublicationRecommendation[] }) {
  if (!items.length) return <div className="recommendation-empty"><Icon name="star" size={25}/><b>Aún no hay opiniones</b><span>Las recomendaciones aparecerán aquí cuando un vecino las comparta.</span></div>;
  return <div className="recommendation-list">{items.map(item => <article className="recommendation-card" key={item.id}>
    <div className="recommendation-card-top"><div className="recommendation-author"><span aria-hidden="true">{(item.autor || 'V').trim().slice(0, 1).toUpperCase()}</span><b>{item.autor || 'Vecino'}</b></div><time dateTime={item.creadoEn || undefined}>{formatDate(item.creadoEn)}</time></div>
    <div className="recommendation-rating" aria-label={`${item.calificacion} de 5 estrellas`}>{[1, 2, 3, 4, 5].map(star => <Icon key={star} name="star" size={17} className={star <= item.calificacion ? 'is-filled' : ''}/>)}</div>
    {item.comentario && <p className="recommendation-comment">{item.comentario}</p>}
  </article>)}</div>;
}

function ReviewForm({ onSubmit, busy, error, disabled }: {
  onSubmit: (rating: number, comment: string) => Promise<boolean>;
  busy: boolean; error: string; disabled: boolean;
}) {
  const { language } = useLanguage();
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState('');
  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (await onSubmit(rating, comment.trim())) {
      setRating(5); setComment('');
    }
  }

  return <form className="recommendation-form" onSubmit={event => void handleSubmit(event)} aria-label={localize(language,'Escribir una recomendaci\u00f3n','Write a review','Allin rimayta qillqay')}>
    <div className="recommendation-form-heading"><span><Icon name="star" size={19}/></span><div><b>{localize(language,'Comparte tu experiencia','Share your experience','Rurasqaykita willay')}</b><p>{localize(language,'Ayuda a otros vecinos a elegir con confianza.','Help other neighbors choose with confidence.','Llaqtamasiykikunata allin akllanankupaq yanapay.')}</p></div></div>
    <Field label={localize(language,'Tu calificaci\u00f3n','Your rating','Allin rimayniyki')}><div className="review-stars" role="group" aria-label={localize(language,'Califica de 1 a 5 estrellas','Rate from 1 to 5 stars','Hukmanta pichqakama chaskiyta akllay')}>{[1, 2, 3, 4, 5].map(star => <button key={star} type="button" className={star <= rating ? 'is-filled' : ''} aria-label={localize(language,`${star} de 5 estrellas`,`${star} out of 5 stars`,`${star} pichqamanta chaskiykuna`)} aria-pressed={rating === star} onClick={() => setRating(star)}><Icon name="star" size={24}/></button>)}</div></Field>
    <Field label={localize(language,'Comentario (opcional)','Comment (optional)','Rimay (munaspalla)')} hint={`${comment.length}/1200 \u00b7 ${localize(language,'AYNI no admite contenido ofensivo, sexual o comercial no permitido.','AYNI does not allow offensive, sexual, or prohibited commercial content.','AYNI ukhupi millay, sexual nisqa utaq mana saqisqa qhatuq willayqa manam saqisqachu.')}`}>
      <textarea value={comment} onChange={event => setComment(event.target.value)} maxLength={1200} rows={3} placeholder={localize(language,'\u00bfC\u00f3mo fue tu experiencia con este producto o servicio?','How was your experience with this product or service?','\u00bfImaynatan kay rantikuypi utaq yanapakuypi kasharqanki?')} aria-label={localize(language,'Comentario de la recomendaci\u00f3n','Review comment','Allin rimaypa willaynin')}/>
    </Field>
    <ErrorBox message={error}/>
    <button type="submit" className="record-button recommendation-submit" disabled={busy || disabled}>{busy ? 'Publicando…' : <><Icon name="send" size={17}/>Publicar opinión</>}</button>
    <small className="recommendation-privacy">Tu comentario se mostrará como texto. No compartas datos personales ni información privada.</small>
  </form>;
}

export default function PublicationReviews({ publicationId, ownerId }: { publicationId: string; ownerId: string }) {
  const { user, online, requireUser, notify, setUser, setAuthOpen } = useApp();
  const [page, setPage] = useState(1);
  const [pageData, setPageData] = useState<RecommendationPage | null>(null);
  const [pageLoading, setPageLoading] = useState(true);
  const [pageError, setPageError] = useState('');
  const [reload, setReload] = useState(0);
  const [submitError, setSubmitError] = useState('');
  const [busy, setBusy] = useState(false);
  const summary = useRemote<RecommendationSummary>(`/publicaciones/${publicationId}/resenas/resumen`, user?.id || 'public');
  const isOwner = user?.id === ownerId;
  useEffect(() => { setPage(1); setPageData(null); }, [publicationId]);
  useEffect(() => {
    const controller = new AbortController(); let active = true;
    setPageLoading(true); setPageError('');
    if (!online) { setPageError('Conéctate a internet para consultar las recomendaciones actualizadas.'); setPageLoading(false); return () => { active = false; controller.abort(); }; }
    getRecommendationPage(publicationId, { filtro: 'todas', pagina: page, porPagina: 5, orden: 'recientes', signal: controller.signal, expectedUserId: user?.id })
      .then(value => { if (active) setPageData(value); })
      .catch(cause => { if (active) { setPageData(null); setPageError(errorMessage(cause)); } })
      .finally(() => { if (active) setPageLoading(false); });
    return () => { active = false; controller.abort(); };
  }, [publicationId, page, user?.id, online, reload]);

  async function publish(rating: number, comment: string): Promise<boolean> {
    if (!user) { requireUser(); return false; }
    if (isOwner || busy) return false;
    setBusy(true); setSubmitError('');
    try {
      await submitPublicationRecommendation(publicationId, {
        calificacion: rating,
        ...(comment ? { comentario: comment } : {}),
      }, { expectedUserId: user!.id });
      notify('Tu opinión se publicó.');
      setPage(1); setReload(value => value + 1);
      summary.reload(); refreshData();
      return true;
    } catch (cause) {
      setSubmitError(errorMessage(cause));
      if (cause instanceof ApiError && cause.status === 401) { setUser(null); setAuthOpen(true); }
      return false;
    } finally { setBusy(false); }
  }

  const ownsReview = Boolean(summary.data?.miOpinion);
  return <section className="publication-reviews" aria-labelledby="publication-reviews-title">
    <header className="publication-reviews-header"><div><p className="eyebrow">CONFIANZA VECINAL</p><h3 id="publication-reviews-title" className="section-subtitle font-display">Recomendaciones de esta publicación</h3><p>Opiniones de vecinos sobre este producto o servicio.</p></div><span className="recommendation-total">{summary.data?.total ?? 0} {summary.data?.total === 1 ? 'opinión' : 'opiniones'}</span></header>
    {summary.data && <ReviewSummary summary={summary.data}/>}
    <RemoteState {...summary}/>
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
      : user ? <ReviewForm key={publicationId} onSubmit={publish} busy={busy} error={submitError} disabled={!online}/>
      : <div className="recommendation-login"><b>¿Ya tuviste una experiencia con esta publicación?</b><p>Inicia sesión para compartir una opinión.</p><button className="outline-btn" type="button" onClick={() => requireUser()}><Icon name="user" size={16}/>Iniciar sesión</button></div>}
  </section>;
}
