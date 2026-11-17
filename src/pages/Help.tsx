import { useEffect, useState, type FormEvent } from 'react';
import { useApp } from '../AppContext';
import { api, errorMessage, refreshData } from '../lib/api';
import { areaQuery, useDebounced, useRemote } from '../lib/hooks';
import { Empty, ErrorBox, Field, Modal, PageHeading, RemoteState, distance, formatDate, initials, shareItem, speak, statusLabel } from '../components/UI';
import Icon from '../components/Icon';
import type { HelpRequest, Offer } from '../types';
import Resources from './Resources';
import { ListingsMap } from '../ServicesMap';
import CommunityMap from '../components/CommunityMap';
import { googleMapsUrl, mapPoint } from '../lib/location';
import { listingSymbol, mapSymbols } from '../lib/map-symbols';
import { visibleHelpCategories } from '../lib/help-categories';
import { blockedRequestReason, displayRequestTitle } from '../lib/request-policy';
import { localize, localizePublicationCategory, useLanguage, type Language } from '../lib/language';

function helpStatus(state: string, language: Language) {
  const labels: Record<string, [string, string]> = {
    abierta: ['Open', 'Kichasqa'], en_curso: ['In progress', 'Ruraypi'], completada: ['Completed', 'Tukusqa'],
    cancelada: ['Cancelled', 'Sayachisqa'], vencida: ['Expired', 'Pachas tukusqa'], pendiente: ['Pending', 'Suyasqa'],
    aceptada: ['Accepted', 'Chaskisqa'], rechazada: ['Declined', 'Mana chaskisqa'],
  };
  return language === 'es' ? statusLabel(state) : labels[state]?.[language === 'en' ? 0 : 1] || statusLabel(state);
}

export default function Help({ onAsk, onLocation, detailId, initialTab }: { onAsk: () => void; onLocation: () => void; detailId?: string; initialTab?: 'mios' }) {
  const { language } = useLanguage();
  const { user, area, setArea, catalogs, requireUser, notify, pending, syncing, sync, online } = useApp();
  const [tab, setTab] = useState(initialTab || 'todos');
  const [showMap, setShowMap] = useState(true);
  const [selected, setSelected] = useState('');
  const [search, setSearch] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const debouncedSearch = useDebounced(search.trim(), 300);
  const params = tab === 'mios' || tab === 'aportes' ? new URLSearchParams() : areaQuery(area);
  if (tab === 'mios') params.set('mios','1');
  if (tab === 'aportes') params.set('participando','1');
  if (debouncedSearch) params.set('q', debouncedSearch);
  if (categoryId) params.set('categoriaId', categoryId);
  const requests = useRemote<HelpRequest[]>(tab === 'recursos' ? null : `/solicitudes?${params}`, user?.id || 'public');
  const visibleRequests = requests.data?.filter(request => tab !== 'todos' || request.solicitanteId !== user?.id);
  const helpCategories = visibleHelpCategories(catalogs.data?.ayuda);
  const hasFilters = Boolean(search || categoryId);
  function clearFilters() { setSearch(''); setCategoryId(''); }
  function selectTab(value: string) { if ((value === 'mios' || value === 'aportes') && !requireUser()) return; setTab(value); }
  return <section className="help-page">
    <PageHeading eyebrow={localize(language,'NOS APOYAMOS','WE SUPPORT ONE ANOTHER','YANAPANAKUSUNCHIS')} title={localize(language,'Ayuda vecinal','Neighbor help','Llaqtamasikunapa yanapaynin')} text={localize(language,'Peque\u00f1as acciones que hacen un barrio m\u00e1s fuerte.','Small actions make a stronger neighborhood.','Huch\u2019uy yanapakuykunam llaqtanchikta kallpachanku.')}><button className="record-button" onClick={onAsk}><Icon name="plus"/>{localize(language,'Pedir ayuda','Ask for help','Yanapayta ma\u00f1ay')}</button></PageHeading>
    <div className="section-tabs" aria-label={localize(language,'Filtrar ayuda','Filter help','Yanapayta akllay')}>{[['todos',localize(language,'En mi barrio','In my neighborhood','Llaqtaypi')],['mios',localize(language,'Mis pedidos','My requests','Ma\u00f1akuyniykuna')],['aportes',localize(language,'Mis aportes','My contributions','Yanapakuyniykuna')],['recursos',localize(language,'Recursos compartidos','Shared resources','Rakisqa imakuna')]].map(([value,label]) => <button data-tour={value === 'todos' ? 'tour-help' : undefined} key={value} aria-pressed={tab === value} className={tab === value ? 'active' : ''} onClick={() => selectTab(value)}>{label}</button>)}</div>
    {pending.length > 0 && <div className="pending-panel"><div className="action-row justify-between"><h2 className="font-bold">{localize(language,'Pendientes de env\u00edo','Waiting to send','Apachinapaq suyasqa')} ({pending.length})</h2><button className="text-action" disabled={syncing || !online} onClick={() => void sync()}>{syncing ? localize(language,'Enviando\u2026','Sending\u2026','Apachichkan\u2026') : localize(language,'Reintentar env\u00edo','Retry sending','Kutin apachiy')}</button></div>{pending.map(item => <div key={item.id} className="pending-item"><b>{displayRequestTitle(item.body.titulo, item.body.descripcion)}</b>{item.body.titulo.startsWith('Emergencia:') && <strong className="pending-emergency-label">{localize(language,'PEDIDO DE EMERGENCIA \u00b7 PENDIENTE DE ENV\u00cdO','EMERGENCY REQUEST \u00b7 WAITING TO SEND','UTQAY MA\u00d1AKUY \u00b7 APACHINAPAQ SUYASQA')}</strong>}<p>{localize(language,'A\u00fan no tenemos confirmaci\u00f3n del servidor; la comunidad todav\u00eda no lo ha recibido.','The server has not confirmed it yet; the community has not received it.','Servidorqa manaraq takyachirqachu; llaqtamasikunaqa manaraq chaskirqankuchu.')}</p>{item.error && <p className="text-sm">{item.error}</p>}{item.blocked && <p className="text-sm">{localize(language,'Este pedido necesita revisi\u00f3n; no se volver\u00e1 a enviar autom\u00e1ticamente.','This request needs review; it will not be sent again automatically.','Kay ma\u00f1akuyqa qhawasqa kanan; manam kikillanmanta kutichispa apachisqachu kanqa.')}</p>}</div>)}</div>}
    {tab === 'recursos' ? <Resources/> : <>
      {tab === 'todos' && <div className="help-map-controls"><div className="help-map-top-row"><button type="button" className="outline-btn" onClick={onLocation}><Icon name="pin" size={17}/>{area.coordinates ? localize(language,'Cambiar punto de b\u00fasqueda','Change search point','Maskana kayta tikray') : localize(language,'Elegir mi ubicaci\u00f3n','Choose my location','Kayniyta akllay')}</button><button type="button" className="outline-btn" aria-pressed={showMap} onClick={() => setShowMap(!showMap)}>{showMap ? localize(language,'Ocultar mapa','Hide map','Mapata pakay') : localize(language,'Ver mapa','Show map','Mapata qhaway')}</button></div><div className="action-row help-radius-row">{[1000,1500,2000].map(radius => <button type="button" className={`radius-btn ${area.radius === radius ? 'active' : ''}`} aria-pressed={area.radius === radius} key={radius} onClick={() => area.coordinates ? setArea({ ...area, radius }) : onLocation()}>{radius / 1000} km</button>)}</div></div>}
      <div className="help-filters" aria-label={localize(language,'Filtrar pedidos de ayuda','Filter help requests','Yanapay ma\u00f1akuykunata akllay')}><label className="help-filter-search"><span>{localize(language,'Buscar','Search','Maskay')}</span><input value={search} onChange={event => setSearch(event.target.value)} placeholder={localize(language,'Ej. necesito una escalera','E.g. I need a ladder','Hinalla: huk escalera necesitani')} aria-label={localize(language,'Buscar por palabra','Search by word','Simiwan maskay')}/></label><label><span>{localize(language,'Categor\u00eda','Category','Mit\u2019a')}</span><select value={categoryId} onChange={event => setCategoryId(event.target.value)}><option value="">{localize(language,'Todas las categor\u00edas','All categories','Llapan mit\u2019akuna')}</option>{helpCategories.map(category => <option key={category.id} value={category.id}>{localizePublicationCategory(language,category.nombre)}</option>)}</select></label>{hasFilters && <button type="button" className="help-filter-clear" onClick={clearFilters}>{localize(language,'Limpiar filtros','Clear filters','Akllaykunata pichay')}</button>}</div>
      <RemoteState {...requests}/>
      {showMap && <ListingsMap items={visibleRequests || []} selectedId={selected} onSelect={setSelected} onOpen={id => { window.location.hash = `ayuda/${id}`; }} title={localize(language,'Ayuda cerca de ti','Help near you','Qayllaykipi yanapay')} kind="help" filterRadius={tab === 'todos'}/> }
      {!requests.loading && visibleRequests?.length === 0 && <Empty title={hasFilters ? localize(language,'No encontramos pedidos con esos filtros','No requests match those filters','Kay akllaykunawanqa manam ma\u00f1akuykunata tarirqaykuchu') : tab === 'mios' ? localize(language,'Aqu\u00ed aparecer\u00e1n tus pedidos','Your requests will appear here','Ma\u00f1akuyniykikuna kaypi rikurinqa') : tab === 'aportes' ? localize(language,'Tu pr\u00f3xima ayuda empieza aqu\u00ed','Your next contribution starts here','Hamuq yanapakuyniyki kaypim qallarin') : localize(language,'Tu barrio empieza contigo','Your neighborhood starts with you','Llaqtaykiqa qanwanmi qallarin')} text={hasFilters ? localize(language,'Prueba otra palabra o categor\u00eda. Tambi\u00e9n puedes limpiar los filtros.','Try another word or category. You can also clear the filters.','Huk simi utaq mit\u2019awan maskay. Akllaykunatapas pichayta atinki.') : tab === 'todos' ? localize(language,'Aqu\u00ed ver\u00e1s pedidos de otros vecinos. Tus publicaciones est\u00e1n en Mis pedidos.','Requests from other neighbors will appear here. Your listings are under My requests.','Huk llaqtamasikunaq ma\u00f1akuyninkunatam kaypi qhawanki. Qampa ma\u00f1akuyniykikunaqa Ma\u00f1akuyniykuna ukupi kachkan.') : tab === 'aportes' ? localize(language,'Cuando te ofrezcas en un pedido, podr\u00e1s seguirlo desde esta secci\u00f3n.','When you offer help on a request, you can follow it here.','Ma\u00f1akuypi yanapayta quptikiqa, kaypi qatipayta atinki.') : localize(language,'Publica una necesidad o vuelve a consultar m\u00e1s tarde.','Post a need or check again later.','Huk necesitaykita willay utaq qhipaman kutimuy.')} />}
      {!requests.loading && visibleRequests && visibleRequests.length > 0 && hasFilters && <p className="help-filter-count">{visibleRequests.length} {visibleRequests.length === 1 ? localize(language,'pedido coincide','request matches','ma\u00f1akuy tinkun') : localize(language,'pedidos coinciden','requests match','ma\u00f1akuykuna tinkunku')} {localize(language,'con tus filtros','your filters','akllayniykiwan')}</p>}
      <div className="mt-5 grid gap-4 lg:grid-cols-3">{visibleRequests?.map(request => <article className="request-card" key={request.id}>
        <div className="flex items-center justify-between gap-2"><div className="request-card-tags"><span className={`request-category-badge symbol-${listingSymbol({ categoria: request.categoria, titulo: request.titulo, urgencia: 'normal' }, 'help')}`}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" dangerouslySetInnerHTML={{ __html: mapSymbols[listingSymbol({ categoria: request.categoria, titulo: request.titulo, urgencia: 'normal' }, 'help')].paths }}/>{localizePublicationCategory(language,request.categoria)}</span>{request.urgencia === 'urgente' && <span className="request-urgent-badge"><Icon name="alert" size={13}/>{localize(language,'Urgente','Urgent','Utqay')}</span>}</div><button className="listen-btn" aria-label={`${localize(language,'Escuchar pedido de','Listen to request from','Ma\u00f1akuyta uyaray')} ${request.solicitante}`} onClick={() => { if (!speak(`${request.solicitante} necesita: ${request.descripcion}`)) notify('La lectura en voz alta no está disponible.'); }}><Icon name="headphones" size={16}/>Escuchar</button></div>
        <div className="mt-5 flex items-center gap-3"><div className="small-avatar">{initials(request.solicitante)}</div><div><p className="font-bold">{request.solicitante}</p></div></div>
        <h2 className="mt-5 text-lg font-bold leading-snug">{displayRequestTitle(request.titulo, request.descripcion)}</h2><p className="card-description">{request.descripcion}</p>
        <p className="mt-3 flex items-center gap-2 text-sm text-[#748078]"><Icon name="pin" size={16}/>{distance(request.distanciaMetros, localize(language,'Distancia no disponible','Distance unavailable','Mana kayniyuq'))}</p>
        <p className="mt-2 flex items-center gap-2 text-xs text-[#748078]"><Icon name="clock" size={14}/>{formatDate(request.creadoEn)}</p>
        {request.venceEn && <p className="mt-2 flex items-center gap-2 text-xs font-semibold text-[#9b5b39]"><Icon name="clock" size={14}/>{request.estado === 'vencida' ? 'Venció' : 'Recibimos propuestas hasta'} {formatDate(request.venceEn)}</p>}
        {(() => {
          const cardState = tab === 'aportes' ? request.miAporteEstado || request.estado : request.estado;
          const isConfirmedContribution = tab === 'aportes' && request.miAporteEstado === 'completada';
          const cardLabel = isConfirmedContribution ? localize(language,'Aporte confirmado','Contribution confirmed','Yanapakuy takyachisqa') : helpStatus(cardState, language);
          const actionLabel = request.solicitanteId === user?.id ? localize(language,'Ver mi pedido','View my request','Ma\u00f1akuyniyta qhaway')
            : tab === 'aportes' ? isConfirmedContribution ? localize(language,'Ver aporte y rese\u00f1a','View contribution and review','Yanapakuyniyta, allin rimaytapas qhaway') : localize(language,'Ver mi colaboraci\u00f3n','View my contribution','Yanapakuyniyta qhaway')
              : localize(language,'Ver pedido y colaborar','View request and help','Ma\u00f1akuyta qhaway hinaspa yanapay');
          return <><span className={`state-badge mt-3 state-${cardState}`}>{cardLabel}</span>
            <button className="offer-button" onClick={() => { window.location.hash = `ayuda/${request.id}`; }}>{actionLabel}<Icon name="arrow" size={17}/></button></>;
        })()}
      </article>)}</div>
    </>}
    {detailId && <RequestDetail id={detailId} onClose={() => { window.location.hash = 'ayuda'; }}/>} 
  </section>;
}

function RequestDetail({ id, onClose }: { id: string; onClose: () => void }) {
  const { user, requireUser, online, notify } = useApp();
  const request = useRemote<HelpRequest>(`/solicitudes/${id}`, user?.id || 'public');
  const offers = useRemote<Offer[]>(user ? `/solicitudes/${id}/ofertas` : null, user?.id || 'public');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [cancelling, setCancelling] = useState(false);
  const [reviewing, setReviewing] = useState<string | null>(null);
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewComment, setReviewComment] = useState('');
  const [offerMessage, setOfferMessage] = useState('');
  const reviewPolicy = blockedRequestReason(reviewComment);
  const offerPolicy = blockedRequestReason(offerMessage);
  const item = request.data;
  const point = item ? mapPoint(item) : null;
  const owner = item?.solicitanteId === user?.id;
  const ownOffer = offers.data?.find(offer => offer.voluntarioId === user?.id);
  const open = item && ['abierta','en_curso'].includes(item.estado);
  useEffect(() => { if (!online) return; const timer = window.setInterval(() => { request.reload(); offers.reload(); }, 20000); return () => window.clearInterval(timer); }, [online, request.reload, offers.reload]);
  async function mutate(path: string, body: unknown, message: string, method = 'PATCH') {
    setBusy(true); setError('');
    try { await api(path, { method, body }); refreshData(); notify(message); return true; }
    catch (error) { setError(errorMessage(error)); return false; }
    finally { setBusy(false); }
  }
  async function offer(event: FormEvent<HTMLFormElement>) { event.preventDefault(); if (offerPolicy) { setError(offerPolicy); return; } const sentMessage = offerMessage; if (await mutate(`/solicitudes/${id}/ofertas`, { mensaje: sentMessage }, 'Tu propuesta se envió al vecino', 'POST')) setOfferMessage(''); }
  async function cancel(event: FormEvent<HTMLFormElement>) { event.preventDefault(); const data = new FormData(event.currentTarget); if (await mutate(`/solicitudes/${id}`, { accion: 'cancelar', motivo: data.get('motivo') }, 'Pedido cancelado')) setCancelling(false); }
  return <Modal title={item ? displayRequestTitle(item.titulo, item.descripcion) : 'Pedido de ayuda'} onClose={onClose} wide>
    <RemoteState {...request}/>
    {item && <div className="request-detail">
      <div className="request-summary-card">
        <div className="request-summary-tags"><span className={`state-badge state-${item.estado}`}>{statusLabel(item.estado)}</span><span className="category">{item.categoria}</span>{item.urgencia === 'urgente' && <span className="category urgent"><Icon name="alert" size={14}/>Apoyo urgente</span>}</div>
        <p className="request-summary-description">{item.descripcion}</p>
        <div className="request-summary-meta"><span className="small-avatar">{initials(item.solicitante)}</span><span><b>{item.solicitante}</b><small>Publicado el {formatDate(item.creadoEn)}</small></span>{item.venceEn && <span className="request-expiry"><Icon name="clock" size={15}/>{item.estado === 'vencida' ? 'Venció' : 'Recibe propuestas hasta'} {formatDate(item.venceEn)}</span>}</div>
      </div>
      {point && <div className="detail-map request-detail-map"><div><p className="eyebrow">PUNTO DE ENCUENTRO</p><h3 className="font-display">Zona aproximada</h3></div><CommunityMap center={point} pins={[{ id, point, title: item.titulo, label: '1', kind: 'help', symbol: listingSymbol(item, 'help'), category: item.categoria }]} selectedId={id} online={online} compact label="Ubicación aproximada del pedido"/><p className="request-map-caption">El marcador señala una zona aproximada. Acuerden un lugar de encuentro seguro por el chat o en persona.</p><a className="request-map-link" href={googleMapsUrl(point)} target="_blank" rel="noopener noreferrer"><Icon name="pin" size={16}/>Abrir zona en Google Maps</a></div>}
      <div className="request-detail-actions"><button className="outline-btn" onClick={() => { if (!speak(item.descripcion)) notify('La lectura en voz alta no está disponible.'); }}><Icon name="headphones" size={17}/>Escuchar pedido</button><button className="outline-btn" onClick={() => { void shareItem(item.titulo,item.descripcion,`#ayuda/${id}`).then(message => { if (message) notify(message); }).catch(error => { if (error?.name !== 'AbortError') setError(errorMessage(error)); }); }}><Icon name="share" size={17}/>Compartir</button></div>
      <ErrorBox message={error}/>
      {owner && open && <div className="owner-actions request-owner-actions"><div className="request-owner-copy"><span><Icon name="check" size={18}/></span><div><h3>Tú decides cuándo está resuelto</h3><p>Confirma los aportes recibidos antes de completar el pedido.</p></div></div><div className="request-owner-buttons"><button className="offer-button" disabled={busy || !online} onClick={() => void mutate(`/solicitudes/${id}`, { accion: 'completar' }, 'Tu necesidad quedó resuelta. Gracias por confirmarlo.')}><Icon name="check" size={18}/>Mi necesidad está resuelta</button><button className="text-action danger-text" disabled={busy || !online} onClick={() => setCancelling(!cancelling)}>Cancelar pedido</button></div>
        {cancelling && <form className="form-stack mt-4" onSubmit={cancel}><Field label="¿Por qué cancelas el pedido?"><textarea name="motivo" required minLength={3} maxLength={500} rows={2}/></Field><button className="outline-btn danger-text" disabled={busy}>Confirmar cancelación</button></form>}
      </div>}
      <div className="request-offers-heading"><div><p className="eyebrow">AYUDA VECINAL</p><h3 className="font-display">{owner ? 'Aportes de tus vecinos' : 'Tu colaboración'}</h3></div>{owner && offers.data && <span>{offers.data.length} {offers.data.length === 1 ? 'propuesta' : 'propuestas'}</span>}</div>
      {user ? <RemoteState {...offers}/> : <button className="offer-button" onClick={requireUser}>Inicia sesión para ofrecer ayuda</button>}
      {offers.data?.map(contribution => <article className="contribution-card request-offer-card" key={contribution.id}>
        <div className="action-row justify-between"><b>{contribution.voluntario}</b><span className="state-badge">{contribution.estado === 'completada' ? 'Aporte confirmado' : contribution.entregaPendiente ? 'Recepción pendiente' : statusLabel(contribution.estado)}</span></div>
        <p className="mt-3 whitespace-pre-wrap">{contribution.mensaje}</p>
        <div className="action-row mt-3">
          {owner && open && contribution.estado === 'pendiente' && <><button className="small-primary" disabled={busy || !online} onClick={() => void mutate(`/ofertas/${contribution.id}`,{ accion:'aceptar' },'Colaboración aceptada')}>Aceptar aporte</button><button className="outline-btn" disabled={busy || !online} onClick={() => void mutate(`/ofertas/${contribution.id}`,{ accion:'rechazar' },'Propuesta rechazada')}>Rechazar</button></>}
          {owner && contribution.estado === 'aceptada' && contribution.entregaPendiente && <button className="small-primary" disabled={busy || !online} onClick={async () => { if (await mutate(`/ofertas/${contribution.id}`,{ accion:'confirmar' },'Recepción confirmada. Puedes valorar a tu vecino.')) { setReviewing(contribution.id); setReviewRating(contribution.resena?.calificacion || 5); setReviewComment(contribution.resena?.comentario || ''); } }}>Confirmar que lo recibí</button>}
          {owner && open && contribution.estado === 'aceptada' && !contribution.entregaPendiente && <button className="outline-btn" disabled={busy || !online} onClick={() => void mutate(`/ofertas/${contribution.id}`,{ accion:'rechazar' },'Colaboración cancelada')}>Cancelar colaboración</button>}
          {contribution.voluntarioId === user?.id && contribution.estado === 'aceptada' && !contribution.entregaPendiente && <button className="small-primary" disabled={busy || !online} onClick={() => void mutate(`/ofertas/${contribution.id}`,{ accion:'entregar' },'El vecino ya puede confirmar que recibió tu aporte')}>Ya entregué mi aporte</button>}
          {contribution.voluntarioId === user?.id && ['pendiente','aceptada'].includes(contribution.estado) && !contribution.entregaPendiente && <button className="outline-btn" disabled={busy || !online} onClick={() => void mutate(`/ofertas/${contribution.id}`,{ accion:'retirar' },'Retiraste tu colaboración')}>Retirar mi aporte</button>}
          {contribution.estado === 'completada' && (owner || contribution.voluntarioId === user?.id) && <button className="outline-btn" onClick={() => { const ownReview = owner ? contribution.resena : contribution.resenaColaborador; setReviewRating(ownReview?.calificacion || 5); setReviewComment(ownReview?.comentario || ''); setReviewing(reviewing === contribution.id ? null : contribution.id); }}><Icon name="star" size={16}/>{(owner ? contribution.resena : contribution.resenaColaborador) ? 'Editar mi valoración' : owner ? 'Valorar al vecino que me ayudó' : 'Valorar a quien pidió ayuda'}</button>}
        </div>
        {contribution.resena && <p className="review-note"><Icon name="star" size={15}/>{owner ? 'Tu valoración al colaborador' : 'Valoración que recibiste'} · {contribution.resena.calificacion}/5{contribution.resena.comentario ? ` · ${contribution.resena.comentario}` : ''}</p>}
        {contribution.resenaColaborador && <p className="review-note"><Icon name="star" size={15}/>{owner ? 'Valoración que recibiste' : 'Tu valoración al solicitante'} · {contribution.resenaColaborador.calificacion}/5{contribution.resenaColaborador.comentario ? ` · ${contribution.resenaColaborador.comentario}` : ''}</p>}
        {reviewing === contribution.id && <form className="form-stack mt-4 request-review-form" onSubmit={async event => { event.preventDefault(); if (reviewPolicy) { setError(reviewPolicy); return; } if (await mutate(`/ofertas/${contribution.id}/resena`, { calificacion: reviewRating, comentario: reviewComment }, 'Tu valoración quedó guardada', 'PUT')) setReviewing(null); }}>
          <div className="request-review-heading"><Icon name="star" size={19}/><div><b>{owner ? 'Cuéntale al barrio cómo te ayudó' : 'Cuéntale al barrio cómo cuidó tu aporte'}</b><p>Tu opinión ayuda a otros vecinos a decidir con confianza.</p></div></div>
          <Field label="Califica esta colaboración" hint={`${reviewRating} de 5 · La calificación influye en el promedio: 1–2 lo bajan; 4–5 cuentan como Visto Bueno Vecinal.`}><div className="review-stars" role="group" aria-label="Califica la colaboración de 1 a 5 estrellas">{[1,2,3,4,5].map(rating => <button key={rating} type="button" aria-pressed={reviewRating >= rating} aria-label={`${rating} de 5 estrellas`} onClick={() => setReviewRating(rating)}><Icon name="star" size={25} /></button>)}</div></Field><Field label="Deja un comentario (opcional)" hint={owner ? 'Puedes contar si el vecino fue amable, puntual o si algo salió mal. Mantén un lenguaje respetuoso.' : 'Por ejemplo: devolvió la escalera en buen estado y a tiempo, o explica si hubo un problema. Mantén un lenguaje respetuoso.'}><textarea name="comentario" maxLength={1200} rows={3} value={reviewComment} onChange={event => setReviewComment(event.target.value)}/></Field><ErrorBox message={reviewPolicy || ''}/><button className="small-primary" disabled={busy || !online || Boolean(reviewPolicy)}>Guardar valoración</button>
        </form>}
      </article>)}
      {user && !owner && open && !offers.loading && !offers.error && !ownOffer && <form className="form-stack request-offer-form" onSubmit={offer}><Field label="¿Qué puedes aportar?" hint="Cuéntale al vecino cómo puedes ayudar y cuándo. No compartas tu dirección exacta. Usa un lenguaje respetuoso."><textarea name="mensaje" required minLength={3} maxLength={1200} value={offerMessage} onChange={event => setOfferMessage(event.target.value)} placeholder="Puedo prestarte una escalera mañana por la tarde." rows={3}/></Field><ErrorBox message={offerPolicy || ''}/><button className="record-button justify-center" disabled={busy || !online || Boolean(offerPolicy)}>Ofrecer mi ayuda<Icon name="hands"/></button></form>}
      {owner && offers.data?.length === 0 && <p className="form-intro">Todavía no hay propuestas. Puedes compartir tu pedido con el barrio.</p>}
      {!online && <p className="offline-banner">Puedes consultar lo guardado. Para aceptar o confirmar aportes, recupera la conexión.</p>}
    </div>}
  </Modal>;
}
