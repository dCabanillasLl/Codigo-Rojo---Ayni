import { useEffect, useState, type FormEvent } from 'react';
import { useApp } from '../AppContext';
import { api, errorMessage, refreshData } from '../lib/api';
import { areaQuery, useRemote } from '../lib/hooks';
import { Empty, ErrorBox, Field, Modal, PageHeading, RemoteState, distance, formatDate, initials, shareItem, speak, statusLabel } from '../components/UI';
import Icon from '../components/Icon';
import type { HelpRequest, Offer } from '../types';
import Resources from './Resources';
import { ListingsMap } from '../ServicesMap';
import CommunityMap from '../components/CommunityMap';
import { googleMapsUrl, mapPoint } from '../lib/location';
import { listingSymbol } from '../lib/map-symbols';

export default function Help({ onAsk, onLocation, detailId }: { onAsk: () => void; onLocation: () => void; detailId?: string }) {
  const { user, area, setArea, requireUser, notify, pending, syncing, sync } = useApp();
  const [tab, setTab] = useState('todos');
  const [showMap, setShowMap] = useState(true);
  const [selected, setSelected] = useState('');
  const params = tab === 'mios' || tab === 'aportes' ? new URLSearchParams() : areaQuery(area);
  if (tab === 'mios') params.set('mios','1');
  if (tab === 'aportes') params.set('participando','1');
  const requests = useRemote<HelpRequest[]>(tab === 'recursos' ? null : `/solicitudes?${params}`, user?.id || 'public');
  function selectTab(value: string) { if ((value === 'mios' || value === 'aportes') && !requireUser()) return; setTab(value); }
  return <section>
    <PageHeading eyebrow="NOS APOYAMOS" title="Ayuda vecinal" text="Pequeñas acciones que hacen un barrio más fuerte."><button className="record-button" onClick={onAsk}><Icon name="plus"/>Pedir ayuda</button></PageHeading>
    <div className="section-tabs" aria-label="Filtrar ayuda">{[['todos','En mi barrio'],['mios','Mis pedidos'],['aportes','Mis aportes'],['recursos','Recursos compartidos']].map(([value,label]) => <button key={value} aria-pressed={tab === value} className={tab === value ? 'active' : ''} onClick={() => selectTab(value)}>{label}</button>)}</div>
    {pending.length > 0 && <div className="pending-panel"><div className="action-row justify-between"><h2 className="font-bold">Pendientes de envío ({pending.length})</h2><button className="text-action" disabled={syncing} onClick={() => void sync()}>{syncing ? 'Enviando…' : 'Reintentar envío'}</button></div>{pending.map(item => <div key={item.id} className="pending-item"><b>{item.body.titulo}</b><p>Aún no tenemos confirmación del servidor.</p>{item.error && <p className="text-sm">{item.error}</p>}{item.blocked && <p className="text-sm">Este pedido necesita revisión; no se volverá a enviar automáticamente.</p>}</div>)}</div>}
    {tab === 'recursos' ? <Resources/> : <>
      {tab === 'todos' && <div className="help-map-controls"><button type="button" className="outline-btn" onClick={onLocation}><Icon name="pin" size={17}/>{area.coordinates ? 'Cambiar punto de búsqueda' : 'Elegir mi ubicación'}</button><div className="action-row">{[1000,1500,2000].map(radius => <button type="button" className={`radius-btn ${area.radius === radius ? 'active' : ''}`} aria-pressed={area.radius === radius} key={radius} onClick={() => area.coordinates ? setArea({ ...area, radius }) : onLocation()}>{radius / 1000} km</button>)}<button type="button" className="outline-btn" aria-pressed={showMap} onClick={() => setShowMap(!showMap)}>{showMap ? 'Ocultar mapa' : 'Ver mapa'}</button></div></div>}
      <RemoteState {...requests}/>
      {showMap && <ListingsMap items={requests.data || []} selectedId={selected} onSelect={setSelected} onOpen={id => { window.location.hash = `ayuda/${id}`; }} title="Ayuda cerca de ti" kind="help" filterRadius={tab === 'todos'}/>}
      {!requests.loading && requests.data?.length === 0 && <Empty title={tab === 'mios' ? 'Aquí aparecerán tus pedidos' : tab === 'aportes' ? 'Tu próxima ayuda empieza aquí' : 'Tu barrio empieza contigo'} text={tab === 'aportes' ? 'Cuando te ofrezcas en un pedido, podrás seguirlo desde esta sección.' : 'Publica una necesidad o vuelve a consultar más tarde.'}/>}
      <div className="mt-5 grid gap-4 lg:grid-cols-3">{requests.data?.map(request => <article className="request-card" key={request.id}>
        <div className="flex items-center justify-between gap-2"><span className={`category ${request.urgencia === 'urgente' ? 'urgent' : ''}`}>{request.urgencia === 'urgente' && <Icon name="alert" size={14}/>} {request.categoria}</span><button className="listen-btn" aria-label={`Escuchar pedido de ${request.solicitante}`} onClick={() => { if (!speak(`${request.solicitante} necesita: ${request.descripcion}`)) notify('La lectura en voz alta no está disponible.'); }}><Icon name="headphones" size={16}/>Escuchar</button></div>
        <div className="mt-5 flex items-center gap-3"><div className="small-avatar">{initials(request.solicitante)}</div><div><p className="font-bold">{request.solicitante}</p><p className="text-xs text-[#78847e]">{request.sectorNombre}</p></div></div>
        <h2 className="mt-5 text-lg font-bold leading-snug">{request.titulo}</h2><p className="card-description">{request.descripcion}</p>
        <p className="mt-3 flex items-center gap-2 text-sm text-[#748078]"><Icon name="pin" size={16}/>{distance(request.distanciaMetros, request.sectorNombre)}</p>
        <p className="mt-2 flex items-center gap-2 text-xs text-[#748078]"><Icon name="clock" size={14}/>{formatDate(request.creadoEn)}</p>
        <span className={`state-badge mt-3 state-${request.estado}`}>{statusLabel(request.estado)}</span>
        <button className="offer-button" onClick={() => { window.location.hash = `ayuda/${request.id}`; }}>{request.solicitanteId === user?.id ? 'Ver mi pedido' : 'Ver pedido y colaborar'}<Icon name="arrow" size={17}/></button>
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
  async function offer(event: FormEvent<HTMLFormElement>) { event.preventDefault(); const data = new FormData(event.currentTarget); await mutate(`/solicitudes/${id}/ofertas`, { mensaje: data.get('mensaje') }, 'Tu propuesta se envió al vecino', 'POST'); }
  async function cancel(event: FormEvent<HTMLFormElement>) { event.preventDefault(); const data = new FormData(event.currentTarget); if (await mutate(`/solicitudes/${id}`, { accion: 'cancelar', motivo: data.get('motivo') }, 'Pedido cancelado')) setCancelling(false); }
  return <Modal title={item?.titulo || 'Pedido de ayuda'} onClose={onClose} wide>
    <RemoteState {...request}/>
    {item && <>
      <div className="action-row justify-between"><span className={`state-badge state-${item.estado}`}>{statusLabel(item.estado)}</span><span className="text-sm text-[#65726b]">{item.sectorNombre}</span></div>
      <p className="detail-description">{item.descripcion}</p><p className="text-sm text-[#65726b]">Publicado por {item.solicitante} · {formatDate(item.creadoEn)}</p>
      {point && <div className="detail-map"><h3 className="section-subtitle font-display">Zona donde se necesita ayuda</h3><CommunityMap center={point} pins={[{ id, point, title: item.titulo, label: '1', kind: 'help', symbol: listingSymbol(item, 'help'), category: item.categoria }]} selectedId={id} online={online} compact label="Ubicación aproximada del pedido"/><p className="form-hint">El marcador muestra una zona aproximada. Coordina el lugar de entrega con el vecino.</p><a className="text-action" href={googleMapsUrl(point)} target="_blank" rel="noopener noreferrer">Abrir zona en Google Maps</a></div>}
      <div className="action-row mt-4"><button className="outline-btn" onClick={() => { if (!speak(item.descripcion)) notify('La lectura en voz alta no está disponible.'); }}><Icon name="headphones" size={16}/>Escuchar</button><button className="outline-btn" onClick={() => { void shareItem(item.titulo,item.descripcion,`#ayuda/${id}`).then(message => { if (message) notify(message); }).catch(error => { if (error?.name !== 'AbortError') setError(errorMessage(error)); }); }}><Icon name="share" size={16}/>Compartir</button></div>
      <ErrorBox message={error}/>
      {owner && open && <div className="owner-actions"><h3 className="font-bold">Tú decides cuándo está resuelto</h3><p>Confirma cada aporte recibido antes de completar tu pedido.</p><div className="action-row"><button className="offer-button" disabled={busy || !online} onClick={() => void mutate(`/solicitudes/${id}`, { accion: 'completar' }, 'Tu necesidad quedó resuelta. Gracias por confirmarlo.')}><Icon name="check" size={18}/>Mi necesidad está resuelta</button><button className="text-action danger-text" disabled={busy || !online} onClick={() => setCancelling(!cancelling)}>Cancelar pedido</button></div>
        {cancelling && <form className="form-stack mt-4" onSubmit={cancel}><Field label="¿Por qué cancelas el pedido?"><textarea name="motivo" required minLength={3} maxLength={500} rows={2}/></Field><button className="outline-btn danger-text" disabled={busy}>Confirmar cancelación</button></form>}
      </div>}
      <h3 className="font-display section-subtitle">{owner ? 'Aportes de tus vecinos' : 'Tu colaboración'}</h3>
      {user ? <RemoteState {...offers}/> : <button className="offer-button" onClick={requireUser}>Inicia sesión para ofrecer ayuda</button>}
      {offers.data?.map(contribution => <article className="contribution-card" key={contribution.id}>
        <div className="action-row justify-between"><b>{contribution.voluntario}</b><span className="state-badge">{contribution.estado === 'completada' ? 'Aporte confirmado' : contribution.entregaPendiente ? 'Recepción pendiente' : statusLabel(contribution.estado)}</span></div>
        <p className="mt-3 whitespace-pre-wrap">{contribution.mensaje}</p>
        <div className="action-row mt-3">
          {owner && open && contribution.estado === 'pendiente' && <><button className="small-primary" disabled={busy || !online} onClick={() => void mutate(`/ofertas/${contribution.id}`,{ accion:'aceptar' },'Colaboración aceptada')}>Aceptar aporte</button><button className="outline-btn" disabled={busy || !online} onClick={() => void mutate(`/ofertas/${contribution.id}`,{ accion:'rechazar' },'Propuesta rechazada')}>Rechazar</button></>}
          {owner && contribution.estado === 'aceptada' && contribution.entregaPendiente && <button className="small-primary" disabled={busy || !online} onClick={() => void mutate(`/ofertas/${contribution.id}`,{ accion:'confirmar' },'Recepción confirmada. Ya puedes dejar tu recomendación.')}>Confirmar que lo recibí</button>}
          {owner && open && contribution.estado === 'aceptada' && !contribution.entregaPendiente && <button className="outline-btn" disabled={busy || !online} onClick={() => void mutate(`/ofertas/${contribution.id}`,{ accion:'rechazar' },'Colaboración cancelada')}>Cancelar colaboración</button>}
          {contribution.voluntarioId === user?.id && contribution.estado === 'aceptada' && !contribution.entregaPendiente && <button className="small-primary" disabled={busy || !online} onClick={() => void mutate(`/ofertas/${contribution.id}`,{ accion:'entregar' },'El vecino ya puede confirmar que recibió tu aporte')}>Ya entregué mi aporte</button>}
          {contribution.voluntarioId === user?.id && ['pendiente','aceptada'].includes(contribution.estado) && !contribution.entregaPendiente && <button className="outline-btn" disabled={busy || !online} onClick={() => void mutate(`/ofertas/${contribution.id}`,{ accion:'retirar' },'Retiraste tu colaboración')}>Retirar mi aporte</button>}
          {owner && contribution.estado === 'completada' && <button className="outline-btn" onClick={() => setReviewing(reviewing === contribution.id ? null : contribution.id)}><Icon name="star" size={16}/>{contribution.resena ? 'Editar mi recomendación' : 'Valorar esta ayuda'}</button>}
        </div>
        {contribution.resena && <p className="review-note"><Icon name="star" size={15}/>{contribution.resena.calificacion}/5 · {contribution.resena.comentario || 'Ayuda valorada'}</p>}
        {reviewing === contribution.id && <form className="form-stack mt-4" onSubmit={async event => { event.preventDefault(); const data = new FormData(event.currentTarget); if (await mutate(`/ofertas/${contribution.id}/resena`, { calificacion: Number(data.get('calificacion')), comentario: String(data.get('comentario') || '') }, 'Tu valoración quedó guardada', 'PUT')) setReviewing(null); }}>
          <Field label="¿Cómo fue la ayuda?"><select name="calificacion" defaultValue={contribution.resena?.calificacion || 5}>{[5,4,3,2,1].map(rating => <option key={rating} value={rating}>{rating} de 5{rating >= 4 ? ' · Visto Bueno Vecinal' : ''}</option>)}</select></Field><Field label="Cuéntale a tu barrio (opcional)"><textarea name="comentario" maxLength={1200} rows={3} defaultValue={contribution.resena?.comentario || ''}/></Field><button className="small-primary" disabled={busy || !online}>Guardar valoración</button>
        </form>}
      </article>)}
      {user && !owner && open && !offers.loading && !offers.error && !ownOffer && <form className="form-stack mt-4" onSubmit={offer}><Field label="¿Qué puedes aportar?" hint="Describe qué ofreces y cuándo estarás disponible. Evita publicar tu dirección exacta."><textarea name="mensaje" required minLength={3} maxLength={1200} placeholder="Puedo prestarte una escalera mañana por la tarde." rows={3}/></Field><button className="record-button justify-center" disabled={busy || !online}>Ofrecer mi ayuda<Icon name="hands"/></button></form>}
      {owner && offers.data?.length === 0 && <p className="form-intro">Todavía no hay propuestas. Puedes compartir tu pedido con el barrio.</p>}
      {!online && <p className="offline-banner">Puedes consultar lo guardado. Para aceptar o confirmar aportes, recupera la conexión.</p>}
    </>}
  </Modal>;
}
