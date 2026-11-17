import { useRef, useState, type FormEvent } from 'react';
import { useApp } from '../AppContext';
import { api, errorMessage, refreshData } from '../lib/api';
import { areaQuery, useRemote } from '../lib/hooks';
import { Empty, ErrorBox, Field, Modal, RemoteState, distance, formatDate, statusLabel } from '../components/UI';
import Icon from '../components/Icon';
import type { Reservation, Resource } from '../types';
import { localize, useLanguage } from '../lib/language';

export default function Resources() {
  const { language } = useLanguage();
  const { area, requireUser, user } = useApp();
  const [mine, setMine] = useState(false);
  const [creating, setCreating] = useState(false);
  const [selected, setSelected] = useState<Resource | null>(null);
  const params = mine ? new URLSearchParams({ mios: '1' }) : areaQuery(area);
  const resources = useRemote<Resource[]>(`/recursos?${params}`, user?.id || 'public');
  return <div className="resources-section">
    <div className="resource-intro"><div><p className="eyebrow">{localize(language,'RECURSOS DE LA COMUNIDAD','COMMUNITY RESOURCES','LLAQTANCHIKPA IMAYNINKUNA')}</p><h2 className="font-display">{localize(language,'Lo que tenemos, lo compartimos','What we have, we share','Imayniyuq kasqanchikta rakinakusunchis')}</h2><p>{localize(language,'Publica donaciones y coordina su entrega con tus vecinos.','Offer donations and arrange delivery with your neighbors.','Haywakuykunata willay, llaqtamasiykikunawan chaskiyta rimanakuy.')}</p></div><button className="record-button" onClick={() => { if (requireUser()) setCreating(true); }}><Icon name="package"/>{localize(language,'Ofrecer un recurso','Offer a resource','Huk imayta quy')}</button></div>
    <div className="resource-controls"><p className="community-note"><Icon name="hands" size={18}/><span>{localize(language,'Apoyo organizado por vecinos. AYNI no sustituye a los servicios de emergencia.','Neighbor-organized support. AYNI does not replace emergency services.','Llaqtamasikuna hu\u00f1uspa yanapanku. AYNIqa manam utqay yanapakuykunata rantinchu.')}</span></p><label className="resource-own-toggle"><input type="checkbox" checked={mine} onChange={event => { if (!event.target.checked || requireUser()) setMine(event.target.checked); }}/><span>{mine ? localize(language,'Mostrando mis recursos','Showing my resources','Imayniykunata rikuchichkan') : localize(language,'Ver mis recursos','View my resources','Imayniykunata qhaway')}</span></label></div>
    <RemoteState {...resources}/>
    {!resources.loading && resources.data?.length === 0 && <Empty title={localize(language,'Un recurso puede hacer la diferencia','A resource can make a difference','Huk imayqa tikrayta atin')} text={localize(language,'Comparte lo que tengas disponible para donar a tus vecinos.','Share what you have available to donate to your neighbors.','Haywanapaq kachkaq imayniykita llaqtamasiykikunawan rakiy.')}/>}
    <div className="mt-5 grid gap-4 md:grid-cols-2 lg:grid-cols-3">{resources.data?.map(resource => <article className="request-card" key={resource.id}><span className="category"><Icon name="package" size={16}/>{localize(language,'RECURSO VECINAL','NEIGHBORHOOD RESOURCE','LLAQTAMASIPA IMAYNIN')}</span><h3 className="font-display mt-4 text-xl font-bold">{resource.titulo}</h3><p className="mt-2 text-sm text-[#65726b]">{resource.propietario} {'\u00b7'} {distance(resource.distanciaMetros, localize(language,'Distancia no disponible','Distance unavailable','Mana kayniyuq'))}</p><div className="resource-counts"><div><b>{resource.disponible}</b><span>{localize(language,'disponibles','available','kachkan')}</span></div><div><b>{resource.reservada}</b><span>{localize(language,'reservadas','reserved','waqaychasqa')}</span></div><div><b>{resource.entregada}</b><span>{localize(language,'entregadas','delivered','haywasqa')}</span></div></div><p className="text-xs text-[#65726b]">{localize(language,'Unidad:','Unit:','Tupuna:')} {resource.unidad} {'\u00b7'} {localize(language,'Actualizado','Updated','Musuqyachisqa')} {formatDate(resource.actualizadoEn)}</p><button className="offer-button" onClick={() => { if (requireUser()) setSelected(resource); }}>{resource.propietarioId === user?.id ? localize(language,'Coordinar entregas','Arrange deliveries','Haywayta rimanakuy') : localize(language,'Solicitar y ver mis reservas','Request and view my reservations','Ma\u00f1ay hinaspa waqaychasqayta qhaway')}<Icon name="arrow" size={17}/></button></article>)}</div>
    {creating && <ResourceForm onClose={() => setCreating(false)}/>}
    {selected && <ResourceDetail initial={selected} onClose={() => setSelected(null)}/>}
  </div>;
}
function ResourceForm({ onClose }: { onClose: () => void }) {
  const { postingSectorId, online, notify } = useApp();
  const [busy,setBusy] = useState(false); const [error,setError] = useState('');
  async function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); const data = new FormData(event.currentTarget); setBusy(true); setError(''); try { await api('/recursos',{ method:'POST',body:{ titulo:data.get('titulo'),unidad:data.get('unidad'),cantidadTotal:Number(data.get('cantidadTotal')),sectorId:postingSectorId } }); refreshData(); notify('Tu recurso ya está disponible para solicitar'); onClose(); } catch(error) { setError(errorMessage(error)); } finally { setBusy(false); } }
  return <Modal title="Ofrece un recurso" onClose={onClose}><div className="resource-form-note"><span><Icon name="package" size={20}/></span><p>Indica qué puedes compartir. Tú confirmarás cada reserva antes de separar las unidades.</p></div><form className="form-stack resource-form" onSubmit={submit}><Field label="¿Qué puedes donar?"><input name="titulo" required minLength={3} maxLength={160} placeholder="Ej. Botellas de agua" autoFocus/></Field><div className="form-columns"><Field label="Cantidad disponible"><input name="cantidadTotal" type="number" min={1} max={1000000} step={1} required placeholder="Ej. 12"/></Field><Field label="¿Cómo se cuenta?"><input name="unidad" required maxLength={40} placeholder="Botellas, unidades…"/></Field></div><ErrorBox message={error}/><button className="record-button resource-submit justify-center" disabled={busy || !online || !postingSectorId}>{busy ? 'Publicando…' : 'Publicar recurso'}</button></form></Modal>;
}
function ResourceDetail({ initial, onClose }: { initial: Resource; onClose: () => void }) {
  const { user, online, notify } = useApp();
  const resources = useRemote<Resource[]>(`/recursos?${initial.propietarioId === user?.id ? 'mios=1' : ''}`,user?.id || 'public');
  const item = resources.data?.find(resource => resource.id === initial.id) || initial;
  const reservations = useRemote<Reservation[]>(`/recursos/${item.id}/reservas`,user?.id || 'public');
  const [busy,setBusy] = useState(false); const [error,setError] = useState('');
  const key = useRef(crypto.randomUUID()); const pendingBody = useRef<{ cantidad: number; clientRequestId: string } | null>(null);
  const owner = item.propietarioId === user?.id;
  async function act(id: string, accion: string) { setBusy(true);setError('');try { await api(`/reservas/${id}`,{method:'PATCH',body:{accion}}); refreshData();notify(accion === 'confirmar' ? 'Reserva confirmada' : accion === 'entregar' ? 'Entrega registrada' : 'Reserva cancelada'); } catch(error) {setError(errorMessage(error));} finally {setBusy(false);} }
  async function reserve(event:FormEvent<HTMLFormElement>) { event.preventDefault(); const data = new FormData(event.currentTarget); setBusy(true);setError('');
    const quantity = Number(data.get('cantidad'));
    if (pendingBody.current && pendingBody.current.cantidad !== quantity) {setError('Hay una solicitud sin confirmar. Reintenta primero la cantidad original para evitar duplicados.');setBusy(false);return;}
    const body = pendingBody.current || {cantidad:quantity,clientRequestId:key.current}; pendingBody.current=body;
    try { await api(`/recursos/${item.id}/reservas`,{method:'POST',body,expectedUserId:user?.id}); pendingBody.current=null;key.current=crypto.randomUUID();refreshData();notify('Solicitud enviada. El dueño debe confirmar tu reserva.'); } catch(error) {setError(errorMessage(error));} finally {setBusy(false);} }
  return <Modal title={item.titulo} onClose={onClose} wide><p className="form-intro">{item.propietario}</p><div className="resource-counts"><div><b>{item.disponible}</b><span>disponibles</span></div><div><b>{item.reservada}</b><span>reservadas</span></div><div><b>{item.entregada}</b><span>entregadas</span></div></div><p className="text-sm">Unidad: {item.unidad}. Total ofrecido: {item.cantidadTotal}.</p><ErrorBox message={error}/>
    {!owner && <form className="form-stack mt-5" onSubmit={reserve}><Field label="¿Cuántas unidades necesitas?"><input name="cantidad" type="number" required min={1} max={Math.max(item.cantidadTotal,1)} step={1} defaultValue={1}/></Field><button className="record-button justify-center" disabled={busy || !online || Number(item.disponible) === 0}>{busy ? 'Enviando…' : 'Solicitar reserva'}</button><p className="form-hint">Las unidades se separan cuando el dueño confirma tu solicitud.</p></form>}
    <h3 className="section-subtitle font-display">{owner ? 'Solicitudes de tus vecinos' : 'Mis reservas'}</h3><RemoteState {...reservations}/>{reservations.data?.length === 0 && <p className="form-intro">Todavía no hay reservas.</p>}{reservations.data?.map(reservation => <article className="contribution-card" key={reservation.id}><div className="action-row justify-between"><b>{reservation.solicitante}</b><span className="state-badge">{statusLabel(reservation.estado)}</span></div><p className="mt-3">{reservation.cantidad} {item.unidad}</p><div className="action-row mt-3">{owner && reservation.estado === 'pendiente' && <button className="small-primary" disabled={busy || !online} onClick={() => void act(reservation.id,'confirmar')}>Confirmar reserva</button>}{owner && reservation.estado === 'reservada' && <button className="small-primary" disabled={busy || !online} onClick={() => void act(reservation.id,'entregar')}>Registrar entrega</button>}{['pendiente','reservada'].includes(reservation.estado) && <button className="outline-btn" disabled={busy || !online} onClick={() => void act(reservation.id,'cancelar')}>Cancelar reserva</button>}</div></article>)}
  </Modal>;
}
