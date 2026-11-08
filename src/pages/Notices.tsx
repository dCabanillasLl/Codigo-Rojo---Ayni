import { useEffect, useState, type FormEvent } from 'react';
import { useApp } from '../AppContext';
import { api, ApiError, errorMessage, refreshData } from '../lib/api';
import { areaQuery, useRemote } from '../lib/hooks';
import { Empty, ErrorBox, Field, Modal, PageHeading, RemoteState, distance, formatDate } from '../components/UI';
import Icon from '../components/Icon';
import type { LocationDraft, Notice } from '../types';
import PhotoPicker from '../components/PhotoPicker';
import { apiAssetUrl } from '../lib/api';
import { localDateTimeInput, noticeCategory, noticeEditPayload, noticeStatus, noticeVenueChanged, noticeVisible } from '../lib/notices';
import AddressAutocomplete from '../components/AddressAutocomplete';
import ActivityLocationDialog from '../components/ActivityLocationDialog';
import CommunityMap from '../components/CommunityMap';
import { googleMapsUrl, locationInput, mapPoint } from '../lib/location';
import { forgetNoticeCache } from '../lib/storage';

export default function Notices({ view }: { view?: string }) {
  const { user, area, requireUser, online } = useApp();
  const [creating, setCreating] = useState(false);
  const [deletedIds, setDeletedIds] = useState<Set<string>>(() => new Set());
  const tab = view === 'mios' || view === 'asistencias' ? view : 'cerca';
  const params = tab === 'mios' ? new URLSearchParams({ mios: '1' }) : tab === 'asistencias' ? new URLSearchParams({ asistire: '1' }) : areaQuery(area);
  const notices = useRemote<Notice[]>(`/avisos?${params}`, user?.id || 'public');
  useEffect(() => {
    if (!online) return;
    const refresh = () => { if (document.visibilityState === 'visible') notices.reload(); };
    const timer = window.setInterval(refresh, 20_000);
    window.addEventListener('focus', refresh); document.addEventListener('visibilitychange', refresh);
    return () => { window.clearInterval(timer); window.removeEventListener('focus', refresh); document.removeEventListener('visibilitychange', refresh); };
  }, [online, notices.reload]);
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const update = () => setNow(Date.now());
    const deadlines = (notices.data || []).flatMap(item => [item.fechaEvento, item.venceEn]).filter((value): value is string => Boolean(value)).map(value => new Date(value).getTime()).filter(value => value > Date.now());
    const timer = window.setTimeout(update, Math.max(1, Math.min(60_000, ...deadlines.map(value => value - Date.now() + 1))));
    window.addEventListener('focus', update);
    document.addEventListener('visibilitychange', update);
    return () => { window.clearTimeout(timer); window.removeEventListener('focus', update); document.removeEventListener('visibilitychange', update); };
  }, [notices.data, now]);
  const visible = notices.data?.filter(item => !deletedIds.has(item.id) && (tab !== 'cerca' || noticeVisible(item, Math.max(now, Date.now()))));
  return <section data-tour="tour-notices">
    <PageHeading eyebrow="LO QUE PASA CERCA" title="Avisos del barrio" text="Actividades, campañas y avisos compartidos por vecinos.">
      <button data-tour="tour-notices" className="record-button" onClick={() => requireUser() && setCreating(true)}><Icon name="plus"/>Crear aviso</button>
    </PageHeading>
    <p className="form-hint mt-3">Los avisos son información compartida por vecinos; no representan comunicados oficiales.</p>
    <div className="notice-view-switch" role="group" aria-label="Ver avisos"><button type="button" className="notice-view-button notice-view-nearby" aria-pressed={tab === 'cerca'} onClick={() => { window.location.hash = 'avisos'; }}><Icon name="pin" size={18}/><span>Actividades cercanas</span></button><button type="button" className="notice-view-button notice-view-attending" aria-pressed={tab === 'asistencias'} onClick={() => { if (requireUser()) window.location.hash = 'avisos/asistencias'; }}><Icon name="check" size={18}/><span>Mis asistencias</span></button><button type="button" className="notice-view-button notice-view-owned" aria-pressed={tab === 'mios'} onClick={() => { if (requireUser()) window.location.hash = 'avisos/mios'; }}><Icon name="calendar" size={18}/><span>Mis actividades</span></button></div>
    <RemoteState {...notices}/>
    {!notices.loading && !notices.error && visible?.length === 0 && <Empty title={tab === 'asistencias' ? 'Aún no confirmaste asistencia' : tab === 'mios' ? 'Aún no publicaste actividades' : 'Aún no hay avisos en tu zona'} text={tab === 'asistencias' ? 'Marca Asistiré en una actividad para seguir sus cambios.' : 'Comparte una actividad o campaña de tu barrio.'}/>}
    <div className="mt-5 grid gap-4 md:grid-cols-2 lg:grid-cols-3">{visible?.map(item => <article key={item.id} className="request-card">
      <div className="notice-card-labels"><NoticeCategoryBadge name={item.categoria}/><NoticeStatusBadge item={item}/></div><h2 className="mt-3 text-xl font-bold">{item.titulo}</h2>
      <p className="card-description whitespace-pre-wrap">{item.contenido}</p>
      {item.imagenUrl && <a href={apiAssetUrl(item.imagenUrl)} target="_blank" rel="noopener noreferrer" aria-label={`Ver flyer completo: ${item.titulo}`}><img className="mt-4 max-h-96 w-full rounded-2xl object-contain" src={apiAssetUrl(item.imagenUrl)} alt={`Flyer: ${item.titulo}`} loading="lazy" referrerPolicy="no-referrer"/><span className="text-action text-sm">Ver flyer completo</span></a>}
      <p className="mt-4 text-sm text-[#68766f]">{distance(item.distanciaMetros, 'Distancia no disponible')} · {item.autor}</p>
      {item.fechaEvento && <p className="mt-1 text-sm text-[#68766f]">{formatDate(item.fechaEvento)}</p>}
      <ActivityVenue item={item}/>
      {item.motivoCambio && <p className="form-hint mt-2"><b>Último cambio:</b> {item.motivoCambio}</p>}
      <p className="mt-1 text-xs text-[#87918b]">Publicado {formatDate(item.creadoEn)}</p>
      <AttendanceActions item={item} onDeleted={id => setDeletedIds(current => new Set(current).add(id))}/>
    </article>)}</div>
    {creating && <NoticeForm close={() => setCreating(false)}/>}
  </section>;
}

function ActivityVenue({ item }: { item: Notice }) {
  const { online } = useApp();
  const [open, setOpen] = useState(false);
  const point = mapPoint({ mapaLatitud: item.latitudActividad, mapaLongitud: item.longitudActividad });
  if (!point) return <p className="form-hint mt-2">Ubicación de la actividad no indicada.</p>;
  return <div className="activity-venue">
    <p><Icon name="pin" size={16}/><span>{item.direccionActividad || 'Lugar de encuentro seleccionado en el mapa'}</span></p>
    <button type="button" className="text-action" onClick={() => setOpen(true)}>Ver ubicación</button>
    {open && <Modal title={`Lugar de la actividad: ${item.titulo}`} onClose={() => setOpen(false)} wide><p className="form-intro">{item.direccionActividad || 'Punto de encuentro indicado por el organizador.'}</p><CommunityMap center={point} picked={point} online={online} compact fitAll={false} label="Ubicación de la actividad"/><a className="outline-btn mt-4" href={googleMapsUrl(point)} target="_blank" rel="noopener noreferrer"><Icon name="pin" size={17}/>Abrir en Google Maps</a></Modal>}
  </div>;
}

function NoticeCategoryBadge({ name }: { name: string }) {
  const category = noticeCategory(name);
  return <span className={`notice-category notice-category-${category.key}`} aria-label={`Categoría: ${name}`}><Icon name={category.icon} size={15}/>{name}</span>;
}

function NoticeStatusBadge({ item }: { item: Notice }) {
  const status = noticeStatus(item);
  return <span className={`notice-status notice-status-${status.key}`} aria-label={`Estado de la actividad: ${status.label}`}><Icon name={status.icon} size={14}/>{status.label}</span>;
}

function AttendanceActions({ item, onDeleted }: { item: Notice; onDeleted: (id: string) => void }) {
  const { user, requireUser, online, notify } = useApp();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [managing, setManaging] = useState(false);
  const [editing, setEditing] = useState<Notice | null>(null);
  const [deleting, setDeleting] = useState<Notice | null>(null);
  const owner = item.autorId === user?.id;
  const confirmed = Boolean(item.miAsistencia);
  async function confirm() {
    if (!requireUser() || !user || busy) return;
    setBusy(true); setError('');
    try {
      await api(`/avisos/${item.id}/asistencia`, { method: 'PUT', body: { asistire: !confirmed }, expectedUserId: user.id });
      refreshData(); notify(confirmed ? 'Retiraste tu confirmación de asistencia.' : 'Asistencia confirmada. Recibirás los cambios de esta actividad en tu campana.');
    } catch (cause) { setError(errorMessage(cause)); } finally { setBusy(false); }
  }
  return <div className="mt-4">
    <p className="text-sm font-bold text-[#28593f]">{Number(item.totalAsistentes || 0)} {Number(item.totalAsistentes) === 1 ? 'persona confirmó asistencia' : 'personas confirmaron asistencia'}</p>
    {owner && <p className="form-hint">{item.estado === 'cancelado' ? 'Esta actividad está cancelada. Puedes eliminarla permanentemente.' : 'Revisa las confirmaciones para decidir si mantienes, postergas o cancelas la actividad.'}</p>}
    {owner && item.estado !== 'cancelado' && <button type="button" className="text-action notice-edit-action" disabled={!online} onClick={() => setEditing(item)}><Icon name="calendar" size={16}/>Editar actividad o ubicación</button>}
    <div className="notice-card-actions">
      {owner ? ['publicado', 'vencido'].includes(item.estado) && <button type="button" className="outline-btn" disabled={!online} onClick={() => setManaging(true)}><span>Postergar o cancelar</span></button> : (confirmed || noticeVisible(item)) && <button type="button" className={confirmed ? 'outline-btn attendance-toggle' : 'record-button attendance-toggle'} aria-pressed={confirmed} disabled={busy || !online} onClick={() => void confirm()}><Icon name="check" size={17}/><span>{busy ? 'Guardando…' : confirmed ? 'Asistiré · Quitar confirmación' : 'Asistiré'}</span></button>}
      {item.estado !== 'cancelado' && <a className="whatsapp-btn" href={`https://wa.me/?text=${encodeURIComponent(`${item.titulo}\n${window.location.origin}/#avisos`)}`} target="_blank" rel="noopener noreferrer"><Icon name="whatsapp" size={20}/><span>Compartir por WhatsApp</span></a>}
      {owner && item.estado === 'cancelado' && <button type="button" className="notice-delete-button" disabled={!online} onClick={() => setDeleting(item)}><Icon name="close" size={17}/><span>Eliminar permanentemente</span></button>}
    </div>
    <ErrorBox message={error}/>
    {managing && <EventChangeDialog item={item} onClose={() => setManaging(false)}/>}
    {editing && item.estado !== 'cancelado' && <NoticeForm initial={editing} close={() => setEditing(null)}/>}
    {deleting && <DeleteActivityDialog item={deleting} onClose={() => setDeleting(null)} onDeleted={() => onDeleted(deleting.id)}/>}
  </div>;
}

function DeleteActivityDialog({ item, onClose, onDeleted }: { item: Notice; onClose: () => void; onDeleted: () => void }) {
  const { user, online, notify } = useApp();
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function remove(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!confirmed || busy || !user) return;
    setBusy(true); setError('');
    try {
      await api(`/avisos/${item.id}`, { method: 'DELETE', body: { confirmar: true, revisionEvento: Number(item.revisionEvento) }, expectedUserId: user.id });
      await forgetNoticeCache(user.id, item.id).catch(() => undefined);
      notify('La actividad se eliminó permanentemente.'); onDeleted(); refreshData();
    } catch (cause) { setError(errorMessage(cause)); } finally { setBusy(false); }
  }
  return <Modal title="Eliminar actividad permanentemente" onClose={() => { if (!busy) onClose(); }}><form className="form-stack" onSubmit={remove}>
    <p className="form-intro">Eliminarás <b>{item.titulo}</b>, su flyer y sus confirmaciones de asistencia. Esta acción no se puede deshacer.</p>
    <p className="form-hint">Los asistentes conservarán las notificaciones de cancelación que ya se generaron, aunque todavía no se hayan conectado.</p>
    <label className="check-field"><input type="checkbox" checked={confirmed} disabled={busy} onChange={event => setConfirmed(event.target.checked)}/>Entiendo que la eliminación es permanente.</label>
    <ErrorBox message={error}/><div className="event-change-actions"><button type="button" className="outline-btn" disabled={busy} onClick={onClose}>Volver</button><button type="submit" className="record-button event-change-submit is-cancellation" disabled={busy || !online || !confirmed}>{busy ? 'Eliminando…' : 'Eliminar permanentemente'}</button></div>
  </form></Modal>;
}

function EventChangeDialog({ item, onClose }: { item: Notice; onClose: () => void }) {
  const { user, online, notify } = useApp();
  const [action, setAction] = useState<'postergar' | 'cancelar'>('postergar');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (busy || !user) return;
    const form = new FormData(event.currentTarget);
    setBusy(true); setError('');
    try {
      const date = action === 'postergar' ? new Date(String(form.get('fechaEvento'))) : null;
      if (date && (!Number.isFinite(date.getTime()) || date.getTime() <= Date.now() || (item.fechaEvento && date.getTime() <= Date.parse(item.fechaEvento)))) throw new Error('La nueva fecha debe ser futura y posterior a la actividad original.');
      await api(`/avisos/${item.id}/cambios`, { method: 'POST', body: { accion: action, motivo: String(form.get('motivo')).trim(), revisionEvento: Number(item.revisionEvento), ...(date ? { fechaEvento: date.toISOString() } : {}) }, expectedUserId: user.id });
      refreshData(); notify('Actividad actualizada. El cambio quedó en las notificaciones de las personas confirmadas.'); onClose();
    } catch (cause) { setError(errorMessage(cause)); refreshData(); } finally { setBusy(false); }
  }
  return <Modal title="Cambiar actividad" onClose={() => { if (!busy) onClose(); }}><form className="form-stack" onSubmit={submit}>
    <p className="form-intro"><b>{item.titulo}</b> tiene {Number(item.totalAsistentes || 0)} confirmaciones. Puedes cambiar la actividad según la participación.</p>
    <Field label="¿Qué deseas hacer?"><select value={action} disabled={busy} onChange={event => setAction(event.target.value as typeof action)}><option value="postergar">Postergar para una nueva fecha</option><option value="cancelar">Cancelar la actividad</option></select></Field>
    {action === 'postergar' && <Field label="Nueva fecha y hora" hint="Debe ser posterior a la fecha original. Se conserva la lista de confirmaciones; cada asistente puede retirarla."><input type="datetime-local" name="fechaEvento" required min={localDateTimeInput(new Date(Math.max(Date.now(), item.fechaEvento ? Date.parse(item.fechaEvento) : 0) + 60_000))} disabled={busy}/></Field>}
    <Field label="Motivo del cambio"><textarea name="motivo" required minLength={3} maxLength={500} rows={3} disabled={busy} placeholder="Por ejemplo: necesitamos más participantes para realizar la actividad."/></Field>
    <p className="form-hint">Quienes confirmaron asistencia recibirán una notificación dentro de AYNI. Si están desconectados, la verán cuando vuelvan a entrar.{action === 'cancelar' && ' La actividad dejará de aparecer en el listado público.'}</p>
    <ErrorBox message={error}/><div className="event-change-actions"><button type="button" className="outline-btn" disabled={busy} onClick={onClose}>Volver</button><button type="submit" className={`record-button event-change-submit ${action === 'cancelar' ? 'is-cancellation' : ''}`} disabled={busy || !online}>{busy ? 'Guardando…' : action === 'cancelar' ? 'Cancelar actividad y notificar' : 'Postergar y notificar'}</button></div>
  </form></Modal>;
}

function NoticeForm({close, initial}:{close:()=>void; initial?: Notice}) {
  const { user, postingSectorId, catalogs, area, online, notify } = useApp();
  const [error,setError]=useState(''); const [busy,setBusy]=useState(false);
  const [photo, setPhoto] = useState<string | null | undefined>(undefined);
  const [readingPhoto, setReadingPhoto] = useState(false);
  const [categoryId, setCategoryId] = useState(initial?.categoriaId || '');
  const [location, setLocation] = useState<LocationDraft>(() => ({ coordinates: initial ? mapPoint({ mapaLatitud: initial.latitudActividad, mapaLongitud: initial.longitudActividad }) : null, address: initial?.direccionActividad || '' }));
  const [locationOpen, setLocationOpen] = useState(false);
  const [conflict, setConflict] = useState(false);
  const selectedCategory = catalogs.data?.avisos.find(category => category.id === categoryId);
  const initialDate = initial?.fechaEvento ? localDateTimeInput(new Date(initial.fechaEvento)) : '';
  const needsPoint = !initial || noticeVenueChanged(initial, location);
  async function submit(event:FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (readingPhoto || busy || locationOpen || conflict || !user) return;
    const form=new FormData(event.currentTarget); setBusy(true); setError('');
    try {
      const dateText = String(form.get('fechaEvento') || '');
      const date = new Date(dateText);
      if ((!initial || dateText !== initialDate) && (!Number.isFinite(date.getTime()) || date.getTime() <= Date.now())) throw new Error('Elige una fecha y hora futuras para la actividad.');
      if (needsPoint && !location.coordinates) throw new Error('Selecciona una dirección sugerida o elige el lugar de la actividad en el mapa.');
      if (initial) {
        const changes = noticeEditPayload(initial, { titulo: String(form.get('titulo')), contenido: String(form.get('contenido')), categoriaId: categoryId, fechaEvento: dateText, location, foto: photo });
        if (!Object.keys(changes).length) { notify('No hay cambios para guardar.'); close(); return; }
        await api(`/avisos/${initial.id}`, { method: 'PATCH', body: { ...changes, revisionEvento: Number(initial.revisionEvento) }, expectedUserId: user.id });
      } else await api('/avisos',{method:'POST',body:{titulo:String(form.get('titulo')),contenido:String(form.get('contenido')),categoriaId:String(form.get('categoriaId')),sectorId:postingSectorId, foto: photo, fechaEvento:date.toISOString(), ubicacion: locationInput(location)}, expectedUserId: user.id});
      refreshData(); notify(initial ? 'Actividad actualizada. Si cambiaste la fecha o el lugar, se notificó a los asistentes confirmados.' : 'Tu aviso ya está publicado'); close();
    } catch (cause) { setError(errorMessage(cause)); if (cause instanceof ApiError && cause.code === 'EVENT_CHANGED') { setConflict(true); refreshData(); } } finally { setBusy(false); }
  }
  return <><Modal title={initial ? 'Editar actividad' : 'Comparte un aviso'} onClose={() => { if (!busy) close(); }}><form className="form-stack" onSubmit={submit}>
    {initial && <p className="form-intro">Corrige los datos, cambia el flyer o elige otro lugar. Los cambios de fecha o ubicación se notificarán a los asistentes confirmados.</p>}
    <Field label="Título"><input name="titulo" required minLength={3} maxLength={180} defaultValue={initial?.titulo} disabled={busy} placeholder="Ej. Jornada de limpieza vecinal"/></Field>
    <Field label="¿Qué deben saber tus vecinos?"><textarea name="contenido" required minLength={3} maxLength={8000} rows={5} defaultValue={initial?.contenido} disabled={busy}/></Field>
    <PhotoPicker label="Imagen del flyer" value={photo} currentUrl={initial?.imagenUrl} onChange={setPhoto} onBusyChange={setReadingPhoto} disabled={busy}/>
    <Field label="Categoría"><select name="categoriaId" required value={categoryId} onChange={event => setCategoryId(event.target.value)} disabled={busy}><option value="" disabled>Elige una opción</option>{catalogs.data?.avisos.map(c=><option key={c.id} value={c.id}>{c.nombre}</option>)}</select></Field>
    <div className="notice-category-preview" aria-live="polite">{selectedCategory && <><span className="form-hint">Tu aviso tendrá esta etiqueta:</span><NoticeCategoryBadge name={selectedCategory.nombre}/></>}</div>
    <Field label="Fecha y hora de la actividad" hint={initial ? 'Puedes conservar la fecha actual. Si la cambias, debe ser futura y se avisará a los asistentes. Una actividad vencida sigue vencida si no cambias su fecha.' : 'Hora local de tu dispositivo. Al llegar este momento, el aviso dejará de aparecer automáticamente.'}><input name="fechaEvento" type="datetime-local" required={!initial || Boolean(initialDate)} defaultValue={initialDate} min={initial ? undefined : localDateTimeInput()} disabled={busy}/></Field>
    <div className="registration-location"><AddressAutocomplete label="Lugar de la actividad" name="direccionActividad" value={location.address} onChange={address => setLocation({ address, coordinates: null })} onSelect={place => setLocation({ address: place.nombre, coordinates: { latitude: place.latitud, longitude: place.longitud } })} bias={location.coordinates || area.coordinates} online={online} disabled={busy} showSearchButton={false}/><div className="registration-location-actions"><button type="button" className="outline-btn" disabled={busy || !online} onClick={() => setLocationOpen(true)}><Icon name="pin" size={17}/>{location.coordinates ? 'Cambiar lugar en el mapa' : 'Elegir lugar en el mapa'}</button>{location.coordinates && <span className="registration-location-selected" role="status"><Icon name="check" size={15}/>Lugar seleccionado</span>}</div><p className="form-hint">Selecciona una sugerencia o un punto en el mapa. La dirección y el punto elegidos serán visibles como lugar de la actividad; tu perfil no cambia.</p></div>
    <RemoteState {...catalogs}/><ErrorBox message={error}/><div className="event-change-actions"><button type="button" className="outline-btn" disabled={busy} onClick={close}>Volver</button><button className="record-button event-change-submit" disabled={busy||readingPhoto||locationOpen||conflict||(needsPoint&&!location.coordinates)||!online||!categoryId||!postingSectorId}>{busy?'Guardando…':readingPhoto?'Preparando flyer…':initial?'Guardar cambios':'Publicar aviso'}</button></div>
  </form></Modal>{locationOpen && <ActivityLocationDialog value={location} initialCenter={area.coordinates} online={online} onClose={() => setLocationOpen(false)} onConfirm={value => { setLocation(value); setLocationOpen(false); setError(''); }}/>}</>;
}
