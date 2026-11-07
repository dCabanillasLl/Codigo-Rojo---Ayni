import { useRef, useState, type FormEvent } from 'react';
import { useApp } from '../AppContext';
import { api, errorMessage, refreshData } from '../lib/api';
import { areaQuery, useRemote } from '../lib/hooks';
import { Empty, ErrorBox, Field, Modal, RemoteState, formatDate, statusLabel } from '../components/UI';
import Icon from '../components/Icon';
import type { Reservation, Resource } from '../types';

export default function Resources() {
  const { area, requireUser, user } = useApp();
  const [mine, setMine] = useState(false);
  const [creating, setCreating] = useState(false);
  const [selected, setSelected] = useState<Resource | null>(null);
  const params = mine ? new URLSearchParams({ mios: '1' }) : areaQuery(area);
  const resources = useRemote<Resource[]>(`/recursos?${params}`, user?.id || 'public');
  return <div>
    <div className="resource-intro"><div><h2 className="font-display text-2xl font-bold">Lo que tenemos, lo compartimos</h2><p>Ofrece recursos para donar y coordina su entrega. Los préstamos se publican como pedidos de ayuda.</p></div><button className="record-button" onClick={() => { if (requireUser()) setCreating(true); }}><Icon name="package"/>Ofrecer un recurso</button></div>
    <p className="community-note"><Icon name="hands" size={18}/>Apoyo organizado por vecinos. AYNI no sustituye a los servicios de emergencia.</p>
    <label className="check-field"><input type="checkbox" checked={mine} onChange={event => { if (!event.target.checked || requireUser()) setMine(event.target.checked); }}/>Ver mis recursos</label>
    <RemoteState {...resources}/>
    {!resources.loading && resources.data?.length === 0 && <Empty title="Un recurso puede hacer la diferencia" text="Comparte lo que tengas disponible para donar a tu comunidad."/>}
    <div className="mt-5 grid gap-4 md:grid-cols-2 lg:grid-cols-3">{resources.data?.map(resource => <article className="request-card" key={resource.id}><span className="category"><Icon name="package" size={16}/>RECURSO VECINAL</span><h3 className="font-display mt-4 text-xl font-bold">{resource.titulo}</h3><p className="mt-2 text-sm text-[#65726b]">{resource.propietario} · {resource.sectorNombre}</p><div className="resource-counts"><div><b>{resource.disponible}</b><span>disponibles</span></div><div><b>{resource.reservada}</b><span>reservadas</span></div><div><b>{resource.entregada}</b><span>entregadas</span></div></div><p className="text-xs text-[#65726b]">Unidad: {resource.unidad} · Actualizado {formatDate(resource.actualizadoEn)}</p><button className="offer-button" onClick={() => { if (requireUser()) setSelected(resource); }}>{resource.propietarioId === user?.id ? 'Coordinar entregas' : 'Solicitar y ver mis reservas'}<Icon name="arrow" size={17}/></button></article>)}</div>
    {creating && <ResourceForm onClose={() => setCreating(false)}/>}
    {selected && <ResourceDetail initial={selected} onClose={() => setSelected(null)}/>}
  </div>;
}
function ResourceForm({ onClose }: { onClose: () => void }) {
  const { sectors, area, user, online, notify } = useApp();
  const [busy,setBusy] = useState(false); const [error,setError] = useState('');
  async function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); const data = new FormData(event.currentTarget); setBusy(true); setError(''); try { await api('/recursos',{ method:'POST',body:{ titulo:data.get('titulo'),unidad:data.get('unidad'),cantidadTotal:Number(data.get('cantidadTotal')),sectorId:data.get('sectorId') } }); refreshData(); notify('Tu recurso ya está disponible para solicitar'); onClose(); } catch(error) { setError(errorMessage(error)); } finally { setBusy(false); } }
  return <Modal title="Ofrece un recurso" onClose={onClose}><p className="form-intro">Indica lo que puedes donar. Confirmarás cada reserva antes de separar las unidades.</p><form className="form-stack" onSubmit={submit}><Field label="¿Qué ofreces?"><input name="titulo" required minLength={3} maxLength={160} placeholder="Por ejemplo, botellas de agua"/></Field><div className="form-columns"><Field label="Cantidad total"><input name="cantidadTotal" type="number" min={1} max={1000000} step={1} required/></Field><Field label="Unidad"><input name="unidad" required maxLength={40} placeholder="Botellas, unidades, paquetes…"/></Field></div><Field label="Sector"><select name="sectorId" required defaultValue={area.sectorId || user?.sectorId || ''}><option value="" disabled>Elige un sector</option>{sectors.data?.map(sector => <option key={sector.id} value={sector.id}>{sector.nombre}</option>)}</select></Field><ErrorBox message={error}/><button className="record-button justify-center" disabled={busy || !online}>{busy ? 'Publicando…' : 'Publicar recurso'}</button></form></Modal>;
}
function ResourceDetail({ initial, onClose }: { initial: Resource; onClose: () => void }) {
  const { user, online, notify } = useApp();
  const resources = useRemote<Resource[]>(`/recursos?${initial.propietarioId === user?.id ? 'mios=1' : `sectorId=${initial.sectorId}`}`,user?.id || 'public');
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
  return <Modal title={item.titulo} onClose={onClose} wide><p className="form-intro">{item.propietario} · {item.sectorNombre}</p><div className="resource-counts"><div><b>{item.disponible}</b><span>disponibles</span></div><div><b>{item.reservada}</b><span>reservadas</span></div><div><b>{item.entregada}</b><span>entregadas</span></div></div><p className="text-sm">Unidad: {item.unidad}. Total ofrecido: {item.cantidadTotal}.</p><ErrorBox message={error}/>
    {!owner && <form className="form-stack mt-5" onSubmit={reserve}><Field label="¿Cuántas unidades necesitas?"><input name="cantidad" type="number" required min={1} max={Math.max(item.cantidadTotal,1)} step={1} defaultValue={1}/></Field><button className="record-button justify-center" disabled={busy || !online || Number(item.disponible) === 0}>{busy ? 'Enviando…' : 'Solicitar reserva'}</button><p className="form-hint">Las unidades se separan cuando el dueño confirma tu solicitud.</p></form>}
    <h3 className="section-subtitle font-display">{owner ? 'Solicitudes de tus vecinos' : 'Mis reservas'}</h3><RemoteState {...reservations}/>{reservations.data?.length === 0 && <p className="form-intro">Todavía no hay reservas.</p>}{reservations.data?.map(reservation => <article className="contribution-card" key={reservation.id}><div className="action-row justify-between"><b>{reservation.solicitante}</b><span className="state-badge">{statusLabel(reservation.estado)}</span></div><p className="mt-3">{reservation.cantidad} {item.unidad}</p><div className="action-row mt-3">{owner && reservation.estado === 'pendiente' && <button className="small-primary" disabled={busy || !online} onClick={() => void act(reservation.id,'confirmar')}>Confirmar reserva</button>}{owner && reservation.estado === 'reservada' && <button className="small-primary" disabled={busy || !online} onClick={() => void act(reservation.id,'entregar')}>Registrar entrega</button>}{['pendiente','reservada'].includes(reservation.estado) && <button className="outline-btn" disabled={busy || !online} onClick={() => void act(reservation.id,'cancelar')}>Cancelar reserva</button>}</div></article>)}
  </Modal>;
}
