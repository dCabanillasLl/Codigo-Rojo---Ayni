import { useEffect, useState, type FormEvent } from 'react';
import { useApp } from '../AppContext';
import { api, ApiError, errorMessage, refreshData } from '../lib/api';
import { areaQuery, useRemote } from '../lib/hooks';
import { Empty, ErrorBox, Field, Modal, PageHeading, RemoteState } from '../components/UI';
import Icon from '../components/Icon';
import type { LocationDraft, Notice } from '../types';
import PhotoPicker from '../components/PhotoPicker';
import { apiAssetUrl } from '../lib/api';
import { localDateTimeInput, noticeAttendanceConfirmed, noticeCategory, noticeEditPayload, noticeStatus, noticeVenueChanged, noticeVisible } from '../lib/notices';
import AddressAutocomplete from '../components/AddressAutocomplete';
import ActivityLocationDialog from '../components/ActivityLocationDialog';
import CommunityMap from '../components/CommunityMap';
import { googleMapsUrl, locationInput, mapPoint } from '../lib/location';
import { forgetNoticeCache } from '../lib/storage';
import NoticeShareDialog from '../components/NoticeShareDialog';
import { localize, useLanguage, type Language } from '../lib/language';

type NoticeDraft = { title: string; content: string; categoryHint?: string; dateTime?: string; locationQuery?: string };

function noticeCategoryLabel(language: Language, category: string) {
  const labels: Record<string, [string, string]> = {
    actividades: ['Activities', 'Ruraykuna'], campanas: ['Campaigns', 'Hu\u00f1unakuypi ruraykuna'],
    'aviso vecinal': ['Neighborhood notice', 'Llaqtamasipa willakuynin'],
  };
  const key = category.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLocaleLowerCase('es');
  const translated = labels[key];
  return language === 'qu' ? translated?.[1] || category : language === 'en' ? translated?.[0] || category : category;
}
function noticeStatusLabel(language: Language, item: Notice) {
  const status = noticeStatus(item);
  const labels: Record<string, [string, string]> = {
    cancelled: ['CANCELLED', 'SAYACHISQA'], draft: ['DRAFT', 'QILLQASQA'], expired: ['EXPIRED', 'PACHAS TUKUSQA'],
    postponed: ['POSTPONED', 'QHIPAMAN SAQISQA'], rescheduled: ['RESCHEDULED', 'MUSUQ PACHA CHURASQA'],
    updated: ['UPDATED', 'MUSUQYACHISQA'], active: ['UPCOMING', 'HAMUQ'],
  };
  return language === 'es' ? status.label : labels[status.key]?.[language === 'en' ? 0 : 1] || status.label;
}
function noticeDate(language: Language, value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : new Intl.DateTimeFormat(language === 'qu' ? 'qu-PE' : language === 'en' ? 'en-US' : 'es-PE', { dateStyle: 'short', timeStyle: 'short' }).format(date);
}
function noticeDistance(language: Language, value: number | null | undefined) {
  if (value == null) return localize(language,'Distancia no disponible','Distance unavailable','Mana karu kaynin willasqachu');
  const approximate = localize(language,'Aprox.','Approx.','Asuyllamanta');
  return Number(value) < 1000 ? `${approximate} ${Math.round(Number(value) / 50) * 50} m` : `${approximate} ${(Number(value) / 1000).toFixed(1)} km`;
}

export default function Notices({ view, noticeDraft, onNoticeDraftClose }: { view?: string; noticeDraft?: NoticeDraft; onNoticeDraftClose?: () => void }) {
  const { language } = useLanguage();
  const { user, area, requireUser, online, sessionLoading } = useApp();
  const [creating, setCreating] = useState(false);
  useEffect(() => { if (noticeDraft) setCreating(true); }, [noticeDraft]);
  const [deletedIds, setDeletedIds] = useState<Set<string>>(() => new Set());
  const detailId = view && /^[1-9]\d{0,19}$/.test(view) ? view : null;
  const tab = view === 'mios' || view === 'asistencias' ? view : 'cerca';
  const params = tab === 'mios' ? new URLSearchParams({ mios: '1' }) : tab === 'asistencias' ? new URLSearchParams({ asistire: '1' }) : areaQuery(area);
  const listing = useRemote<Notice[]>(detailId ? null : `/avisos?${params}`, user?.id || 'public');
  const detail = useRemote<Notice>(detailId && !sessionLoading ? `/avisos/${detailId}` : null, user?.id || 'public');
  const notices = detailId ? { ...detail, data: detail.data ? [detail.data] : null } : listing;
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
  const visible = notices.data?.filter(item => !deletedIds.has(item.id) && (detailId || tab !== 'cerca' || noticeVisible(item, Math.max(now, Date.now()))));
  return <section className="notices-page" data-tour="tour-notices">
    {detailId && <button type="button" className="text-action notice-back-link" onClick={() => { window.location.hash = 'avisos'; }}>{localize(language,'\u2190 Ver todos los avisos','\u2190 View all notices','\u2190 Llapan willaykunata qhaway')}</button>}
    <PageHeading eyebrow={localize(language,'LO QUE PASA CERCA','WHAT IS HAPPENING NEARBY','QAYLLAYKIPI KACHKACHKAN')} title={localize(language,'Avisos del barrio','Neighborhood notices','Llaqtaykip willakuyninkuna')} text={localize(language,'Actividades, campa\u00f1as y avisos compartidos por vecinos.','Activities, campaigns, and notices shared by neighbors.','Llaqtamasikuna rakisqanku ruraykuna, hu\u00f1unakuypi ruraykuna, willakuykunapas.')}>
      <button data-tour="tour-notices" className="record-button" onClick={() => requireUser() && setCreating(true)}><Icon name="plus"/>{localize(language,'Crear aviso','Create notice','Willakuyta ruway')}</button>
    </PageHeading>
    <p className="form-hint mt-3">{localize(language,'Los avisos son informaci\u00f3n compartida por vecinos; no representan comunicados oficiales.','Notices are shared by neighbors and are not official announcements.','Willakuykunaqa llaqtamasikuna rakisqankum; manam kamachiqpa willakuyninkunachu.')}</p>
    <div className="notice-view-switch" role="group" aria-label={localize(language,'Ver avisos','Browse notices','Willakuykunata qhaway')}><button type="button" className="notice-view-button notice-view-nearby" aria-pressed={tab === 'cerca'} onClick={() => { window.location.hash = 'avisos'; }}><Icon name="pin" size={18}/><span>{localize(language,'Actividades cercanas','Nearby activities','Qayllaykipi ruraykuna')}</span></button><button type="button" className="notice-view-button notice-view-attending" aria-pressed={tab === 'asistencias'} onClick={() => { if (requireUser()) window.location.hash = 'avisos/asistencias'; }}><Icon name="check" size={18}/><span>{localize(language,'Mis asistencias','My attendance','Asistenciaykuna')}</span></button><button type="button" className="notice-view-button notice-view-owned" aria-pressed={tab === 'mios'} onClick={() => { if (requireUser()) window.location.hash = 'avisos/mios'; }}><Icon name="calendar" size={18}/><span>{localize(language,'Mis actividades','My activities','Rurayniykuna')}</span></button></div>
    <RemoteState {...notices}/>
    {!notices.loading && !notices.error && visible?.length === 0 && <Empty title={tab === 'asistencias' ? localize(language,'A\u00fan no confirmaste asistencia','You have not confirmed attendance yet','Manaraq asistenciaykita takyachirqankichu') : tab === 'mios' ? localize(language,'A\u00fan no publicaste actividades','You have not posted activities yet','Manaraq rurayniykikunata willarqankichu') : localize(language,'A\u00fan no hay avisos en tu zona','There are no notices in your area yet','Kayniykipi manaraq willakuykuna kanchu')} text={tab === 'asistencias' ? localize(language,'Pulsa Confirmar asistencia en una actividad para seguir sus cambios.','Confirm attendance at an activity to follow its updates.','Huk ruraypi Asistenciayta takyachiy \u00f1it\u2019iy, tikraykunata qatipanaykipaq.') : localize(language,'Comparte una actividad o campa\u00f1a de tu barrio.','Share an activity or campaign in your neighborhood.','Llaqtaykipi huk rurayta utaq hu\u00f1unakuypi rurayta willay.')}/>}
    <div className="notice-grid">{visible?.map(item => <article key={item.id} className="notice-card" aria-labelledby={`notice-title-${item.id}`}>
      <div className="notice-card-labels"><NoticeCategoryBadge name={item.categoria}/><NoticeStatusBadge item={item}/></div>
      <h2 id={`notice-title-${item.id}`} className="notice-title font-display">{item.titulo}</h2>
      <p className="notice-description">{item.contenido}</p>
      {item.imagenUrl && <a className="notice-flyer" href={apiAssetUrl(item.imagenUrl)} target="_blank" rel="noopener noreferrer" aria-label={localize(language,`Ver flyer completo: ${item.titulo}`,`View full flyer: ${item.titulo}`,`${item.titulo} flyer-ninta qhaway`)}><div className="notice-flyer-frame"><img src={apiAssetUrl(item.imagenUrl)} alt={localize(language,`Flyer: ${item.titulo}`,`Flyer: ${item.titulo}`,`${item.titulo} flyer-nin`)} loading="lazy" referrerPolicy="no-referrer"/></div><span className="notice-flyer-link">{localize(language,'Ver flyer completo','View full flyer','Flyer-ta qhaway')}<Icon name="chevron" size={16}/></span></a>}
      <div className="notice-details">
        {item.fechaEvento && <div className="notice-detail-row"><Icon name="calendar" size={18}/><p>{noticeDate(language,item.fechaEvento)}</p></div>}
        <ActivityVenue item={item}/>
        <div className="notice-detail-row"><Icon name="user" size={18}/><p>{localize(language,'Autor:','By:','Qillqaq:')} {item.autor}<span className="notice-distance">{noticeDistance(language,item.distanciaMetros)}</span></p></div>
        <div className="notice-detail-row notice-published"><Icon name="clock" size={18}/><p>{localize(language,'Publicado','Posted','Willarisqa')} {noticeDate(language,item.creadoEn)}</p></div>
      </div>
      {item.motivoCambio && <p className="notice-change-note"><b>{localize(language,'\u00daltimo cambio:','Last update:','Qhipa tikray:')}</b> {item.motivoCambio}</p>}
      <AttendanceActions item={item} onDeleted={id => setDeletedIds(current => new Set(current).add(id))}/>
    </article>)}</div>
    {creating && <NoticeForm draft={noticeDraft} close={() => { setCreating(false); onNoticeDraftClose?.(); }}/>} 
  </section>;
}

function ActivityVenue({ item }: { item: Notice }) {
  const { language } = useLanguage();
  const { online } = useApp();
  const [open, setOpen] = useState(false);
  const point = mapPoint({ mapaLatitud: item.latitudActividad, mapaLongitud: item.longitudActividad });
  if (!point) return <p className="form-hint mt-2">{localize(language,'Ubicación de la actividad no indicada.','Activity location not provided.','Ruraypa kaynin mana willasqachu.')}</p>;
  return <div className="activity-venue">
    <p><Icon name="pin" size={16}/><span>{item.direccionActividad || localize(language,'Lugar de encuentro seleccionado en el mapa','Meeting point selected on the map','Mapapi akllasqa tinkuna')}</span></p>
    <button type="button" className="text-action" onClick={() => setOpen(true)}>{localize(language,'Ver ubicación','View location','Kayta qhaway')}</button>
    {open && <Modal title={`${localize(language,'Lugar de la actividad:','Activity location:','Ruraypa kaynin:')} ${item.titulo}`} onClose={() => setOpen(false)} wide><p className="form-intro">{item.direccionActividad || localize(language,'Punto de encuentro indicado por el organizador.','Meeting point provided by the organizer.','Kamachiqpa willasqan tinkuna.')}</p><CommunityMap center={point} picked={point} online={online} compact fitAll={false} label={localize(language,'Ubicación de la actividad','Activity location','Ruraypa kaynin')}/><a className="outline-btn mt-4" href={googleMapsUrl(point)} target="_blank" rel="noopener noreferrer"><Icon name="pin" size={17}/>{localize(language,'Abrir en Google Maps','Open in Google Maps','Google Maps nisqapi kichay')}</a></Modal>}
  </div>;
}

function NoticeCategoryBadge({ name }: { name: string }) {
  const { language } = useLanguage();
  const category = noticeCategory(name);
  return <span className={`notice-category notice-category-${category.key}`} aria-label={`${localize(language,'Categoría:','Category:','Mit’a:')} ${noticeCategoryLabel(language,name)}`}><Icon name={category.icon} size={15}/>{noticeCategoryLabel(language,name)}</span>;
}

function NoticeStatusBadge({ item }: { item: Notice }) {
  const { language } = useLanguage();
  const status = noticeStatus(item);
  return <span className={`notice-status notice-status-${status.key}`} aria-label={`${localize(language,'Estado de la actividad:','Activity status:','Ruraypa imayna kasqan:')} ${noticeStatusLabel(language,item)}`}><Icon name={status.icon} size={14}/>{noticeStatusLabel(language,item)}</span>;
}

function AttendanceActions({ item, onDeleted }: { item: Notice; onDeleted: (id: string) => void }) {
  const { language } = useLanguage();
  const { user, requireUser, online, notify } = useApp();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [managing, setManaging] = useState(false);
  const [editing, setEditing] = useState<Notice | null>(null);
  const [deleting, setDeleting] = useState<Notice | null>(null);
  const [sharing, setSharing] = useState(false);
  const owner = item.autorId === user?.id;
  const confirmed = Boolean(user) && noticeAttendanceConfirmed(item.miAsistencia);
  async function confirm() {
    if (!requireUser() || !user || busy) return;
    setBusy(true); setError('');
    try {
      await api(`/avisos/${item.id}/asistencia`, { method: 'PUT', body: { asistire: !confirmed }, expectedUserId: user.id });
      refreshData(); notify(confirmed ? localize(language,'Retiraste tu confirmaci\u00f3n de asistencia.','You withdrew your attendance confirmation.','Asistenciaykita saqirqanki.') : localize(language,'Asistencia confirmada. Recibir\u00e1s los cambios de esta actividad en tu campana.','Attendance confirmed. You will receive this activity updates in your notifications.','Asistenciayki takyachisqam. Kay ruraypa tikraykunam willayniykipi chayamunqa.'));
    } catch (cause) { setError(errorMessage(cause)); } finally { setBusy(false); }
  }
  return <div className="notice-attendance">
    <p className="notice-attendance-count" aria-live="polite" aria-atomic="true">{Number(item.totalAsistentes || 0)} {Number(item.totalAsistentes) === 1 ? localize(language,'persona confirm\u00f3 asistencia','person confirmed attendance','runa asistencianta takyachirqan') : localize(language,'personas confirmaron asistencia','people confirmed attendance','runakuna asistenciankuta takyachirqanku')}</p>
    {owner && <p className="form-hint">{item.estado === 'cancelado' ? localize(language,'Esta actividad est\u00e1 cancelada. Puedes eliminarla permanentemente.','This activity is cancelled. You can permanently delete it.','Kay rurayqa sayachisqam. Wi\u00f1aypaq chinkachiyta atinki.') : localize(language,'Revisa las confirmaciones para decidir si mantienes, postergas o cancelas la actividad.','Review confirmations to decide whether to keep, postpone, or cancel the activity.','Takyachiykunata qhaway, rurayta waqaychanaykipaq, qhipaman saqinaykipaq utaq sayachinaykipaq.')}</p>}
    {owner && item.estado !== 'cancelado' && <button type="button" className="text-action notice-edit-action" disabled={!online} onClick={() => setEditing(item)}><Icon name="calendar" size={16}/>{localize(language,'Editar actividad o ubicaci\u00f3n','Edit activity or location','Rurayta utaq kayta tikray')}</button>}
    <div className="notice-card-actions">
      {owner ? ['publicado', 'vencido'].includes(item.estado) && <button type="button" className="outline-btn" disabled={!online} onClick={() => setManaging(true)}><span>{localize(language,'Postergar o cancelar','Postpone or cancel','Qhipaman saqiy utaq sayachiy')}</span></button> : (confirmed || noticeVisible(item)) && <button type="button" className="attendance-toggle" aria-pressed={confirmed} disabled={busy || !online} onClick={() => void confirm()}><span className="attendance-check"><Icon name="check" size={19}/></span><span>{busy ? localize(language,'Guardando\u2026','Saving\u2026','Waqaychachkan\u2026') : confirmed ? localize(language,'Quitar confirmaci\u00f3n','Withdraw confirmation','Takyachisqata saqiy') : localize(language,'Confirmar asistencia','Confirm attendance','Asistenciayta takyachiy')}</span></button>}
      {item.estado !== 'cancelado' && <button type="button" className="whatsapp-btn" onClick={() => setSharing(true)}><Icon name="whatsapp" size={20}/><span>{localize(language,'Compartir por WhatsApp','Share on WhatsApp','WhatsApp nisqapi rakiy')}</span></button>}
      {owner && item.estado === 'cancelado' && <button type="button" className="notice-delete-button" disabled={!online} onClick={() => setDeleting(item)}><Icon name="close" size={17}/><span>{localize(language,'Eliminar permanentemente','Delete permanently','Wi\u00f1aypaq chinkachiy')}</span></button>}
    </div>
    <ErrorBox message={error}/>
    {managing && <EventChangeDialog item={item} onClose={() => setManaging(false)}/>}
    {editing && item.estado !== 'cancelado' && <NoticeForm initial={editing} close={() => setEditing(null)}/>}
    {deleting && <DeleteActivityDialog item={deleting} onClose={() => setDeleting(null)} onDeleted={() => onDeleted(deleting.id)}/>}
    {sharing && item.estado !== 'cancelado' && <NoticeShareDialog item={item} onClose={() => setSharing(false)}/>}
  </div>;
}

function DeleteActivityDialog({ item, onClose, onDeleted }: { item: Notice; onClose: () => void; onDeleted: () => void }) {
  const { language } = useLanguage();
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
      notify(localize(language,'La actividad se eliminó permanentemente.','The activity was permanently deleted.','Rurayqa wiñaypaq chinkachisqam.')); onDeleted(); refreshData();
    } catch (cause) { setError(errorMessage(cause)); } finally { setBusy(false); }
  }
  return <Modal title={localize(language,'Eliminar actividad permanentemente','Permanently delete activity','Rurayta wiñaypaq chinkachiy')} onClose={() => { if (!busy) onClose(); }}><form className="form-stack" onSubmit={remove}>
    <p className="form-intro">{localize(language,'Eliminarás','You will delete','Chinkachinki')} <b>{item.titulo}</b>{localize(language,', su flyer y sus confirmaciones de asistencia. Esta acción no se puede deshacer.',', its flyer, and attendance confirmations. This action cannot be undone.',' nisqap flyer-ninta, asistenciata takyachisqakunatapas. Kaytaqa manam kutichiyta atikunchu.')}</p>
    <p className="form-hint">{localize(language,'Los asistentes conservarán las notificaciones de cancelación que ya se generaron, aunque todavía no se hayan conectado.','Attendees will keep cancellation notifications that were already created, even if they have not connected yet.','Asistenciata takyachiqkunaqa ña paqarisqa sayachiy willaykunata waqaychankum, manaraq yaykuspa kachkaptinkupas.')}</p>
    <label className="check-field"><input type="checkbox" checked={confirmed} disabled={busy} onChange={event => setConfirmed(event.target.checked)}/>{localize(language,'Entiendo que la eliminación es permanente.','I understand this deletion is permanent.','Kay chinkachiy wiñaypaq kasqanta hamutani.')}</label>
    <ErrorBox message={error}/><div className="event-change-actions"><button type="button" className="outline-btn" disabled={busy} onClick={onClose}>{localize(language,'Volver','Back','Kutiy')}</button><button type="submit" className="record-button event-change-submit is-cancellation" disabled={busy || !online || !confirmed}>{busy ? localize(language,'Eliminando…','Deleting…','Chinkachichkan…') : localize(language,'Eliminar permanentemente','Delete permanently','Wiñaypaq chinkachiy')}</button></div>
  </form></Modal>;
}

function EventChangeDialog({ item, onClose }: { item: Notice; onClose: () => void }) {
  const { language } = useLanguage();
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
      if (date && (!Number.isFinite(date.getTime()) || date.getTime() <= Date.now() || (item.fechaEvento && date.getTime() <= Date.parse(item.fechaEvento)))) throw new Error(localize(language,'La nueva fecha debe ser futura y posterior a la actividad original.','The new date must be in the future and after the original activity date.','Musuq pachaqa hamuq pacha kanan, ñawpaq ruraypa pachanmantapas qhipa kanan.'));
      await api(`/avisos/${item.id}/cambios`, { method: 'POST', body: { accion: action, motivo: String(form.get('motivo')).trim(), revisionEvento: Number(item.revisionEvento), ...(date ? { fechaEvento: date.toISOString() } : {}) }, expectedUserId: user.id });
      refreshData(); notify(localize(language,'Actividad actualizada. El cambio quedó en las notificaciones de las personas confirmadas.','Activity updated. The change was added to confirmed attendees’ notifications.','Ruray musuqyachisqam. Tikrayqa asistenciata takyachiqkunap willayninkunaman yapasqam.')); onClose();
    } catch (cause) { setError(errorMessage(cause)); refreshData(); } finally { setBusy(false); }
  }
  return <Modal title={localize(language,'Cambiar actividad','Change activity','Rurayta tikray')} onClose={() => { if (!busy) onClose(); }}><form className="form-stack" onSubmit={submit}>
    <p className="form-intro"><b>{item.titulo}</b> {localize(language,'tiene','has','kayyuqmi')} {Number(item.totalAsistentes || 0)} {localize(language,'confirmaciones. Puedes cambiar la actividad según la participación.','attendances. You can change the activity based on participation.','takyachiykunayuq. Ruraytaqa runakuna yaykusqanman hina tikrayta atinki.')}</p>
    <Field label={localize(language,'¿Qué deseas hacer?','What would you like to do?','¿Imatam rurayta munanki?')}><select value={action} disabled={busy} onChange={event => setAction(event.target.value as typeof action)}><option value="postergar">{localize(language,'Postergar para una nueva fecha','Postpone to a new date','Musuq pachaman qhipachiy')}</option><option value="cancelar">{localize(language,'Cancelar la actividad','Cancel the activity','Rurayta sayachiy')}</option></select></Field>
    {action === 'postergar' && <Field label={localize(language,'Nueva fecha y hora','New date and time','Musuq pacha, hora')} hint={localize(language,'Debe ser posterior a la fecha original. Se conserva la lista de confirmaciones; cada asistente puede retirarla.','It must be after the original date. Attendance confirmations are kept; each attendee can withdraw theirs.','Ñawpaq pachamanta qhipa kanan. Takyachiykuna waqaychasqam; sapa asistenteqa saqiyta atin.') }><input type="datetime-local" name="fechaEvento" required min={localDateTimeInput(new Date(Math.max(Date.now(), item.fechaEvento ? Date.parse(item.fechaEvento) : 0) + 60_000))} disabled={busy}/></Field>}
    <Field label={localize(language,'Motivo del cambio','Reason for the change','Tikraypa imayna kasqan')}><textarea name="motivo" required minLength={3} maxLength={500} rows={3} disabled={busy} placeholder={localize(language,'Por ejemplo: necesitamos más participantes para realizar la actividad.','For example: we need more participants to hold the activity.','Hinalla: aswan runakunam kay rurayta ruranapaq munayku.')}/></Field>
    <p className="form-hint">{localize(language,'Quienes confirmaron asistencia recibirán una notificación dentro de AYNI. Si están desconectados, la verán cuando vuelvan a entrar.','Those who confirmed attendance will receive an AYNI notification. If offline, they will see it when they return.','Asistenciata takyachiqkunaqa AYNI ukhupi willayta chaskinqaku. Mana yaykuspa kachkaptinkuqa kutimuspa rikunkaku.')}{action === 'cancelar' && localize(language,' La actividad dejará de aparecer en el listado público.',' The activity will disappear from the public list.',' Rurayqa llaqta qhaway listamanta chinkapunqa.')}</p>
    <ErrorBox message={error}/><div className="event-change-actions"><button type="button" className="outline-btn" disabled={busy} onClick={onClose}>{localize(language,'Volver','Back','Kutiy')}</button><button type="submit" className={`record-button event-change-submit ${action === 'cancelar' ? 'is-cancellation' : ''}`} disabled={busy || !online}>{busy ? localize(language,'Guardando…','Saving…','Waqaychachkan…') : action === 'cancelar' ? localize(language,'Cancelar actividad y notificar','Cancel activity and notify','Rurayta sayachiy, willaypas') : localize(language,'Postergar y notificar','Postpone and notify','Qhipachiy, willaypas')}</button></div>
  </form></Modal>;
}

function NoticeForm({close, initial, draft}:{close:()=>void; initial?: Notice; draft?: NoticeDraft}) {
  const { language } = useLanguage();
  const { user, postingSectorId, catalogs, area, online, notify } = useApp();
  const [error,setError]=useState(''); const [busy,setBusy]=useState(false);
  const [photo, setPhoto] = useState<string | null | undefined>(undefined);
  const [readingPhoto, setReadingPhoto] = useState(false);
  const [categoryId, setCategoryId] = useState(initial?.categoriaId || '');
  const [location, setLocation] = useState<LocationDraft>(() => ({ coordinates: initial ? mapPoint({ mapaLatitud: initial.latitudActividad, mapaLongitud: initial.longitudActividad }) : null, address: initial?.direccionActividad || draft?.locationQuery || '' }));
  const [locationOpen, setLocationOpen] = useState(false);
  const [conflict, setConflict] = useState(false);
  const selectedCategory = catalogs.data?.avisos.find(category => category.id === categoryId);
  useEffect(() => {
    if (initial?.categoriaId || categoryId || !draft?.categoryHint) return;
    const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es');
    const match = catalogs.data?.avisos.find(category => normalize(category.nombre) === normalize(draft.categoryHint!));
    if (match) setCategoryId(match.id);
  }, [initial?.categoriaId, categoryId, draft?.categoryHint, catalogs.data?.avisos]);
  const initialDate = initial?.fechaEvento ? localDateTimeInput(new Date(initial.fechaEvento)) : '';
  const needsPoint = !initial || noticeVenueChanged(initial, location);
  async function submit(event:FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (readingPhoto || busy || locationOpen || conflict || !user) return;
    const form=new FormData(event.currentTarget); setBusy(true); setError('');
    try {
      const dateText = String(form.get('fechaEvento') || '');
      const date = new Date(dateText);
      if ((!initial || dateText !== initialDate) && (!Number.isFinite(date.getTime()) || date.getTime() <= Date.now())) throw new Error(localize(language,'Elige una fecha y hora futuras para la actividad.','Choose a future date and time for the activity.','Ruraypaq hamuq pacha, horatam akllay.'));
      if (needsPoint && !location.coordinates) throw new Error(localize(language,'Selecciona una dirección sugerida o elige el lugar de la actividad en el mapa.','Select a suggested address or choose the activity location on the map.','Yuyaychasqa wasiyta akllay utaq mapapi ruraypa kayninta akllay.'));
      if (initial) {
        const changes = noticeEditPayload(initial, { titulo: String(form.get('titulo')), contenido: String(form.get('contenido')), categoriaId: categoryId, fechaEvento: dateText, location, foto: photo });
        if (!Object.keys(changes).length) { notify(localize(language,'No hay cambios para guardar.','There are no changes to save.','Manam waqaychanapaq tikraykuna kanchu.')); close(); return; }
        await api(`/avisos/${initial.id}`, { method: 'PATCH', body: { ...changes, revisionEvento: Number(initial.revisionEvento) }, expectedUserId: user.id });
      } else await api('/avisos',{method:'POST',body:{titulo:String(form.get('titulo')),contenido:String(form.get('contenido')),categoriaId:String(form.get('categoriaId')),sectorId:postingSectorId, foto: photo, fechaEvento:date.toISOString(), ubicacion: locationInput(location)}, expectedUserId: user.id});
      refreshData(); notify(initial ? localize(language,'Actividad actualizada. Si cambiaste la fecha o el lugar, se notificó a los asistentes confirmados.','Activity updated. Confirmed attendees were notified if you changed the date or location.','Ruray musuqyachisqam. Pacha utaq kayta tikraptiykiqa asistenciata takyachiqkunaman willasqanku.') : localize(language,'Tu aviso ya está publicado','Your notice is now published','Willakuyniyki willarisqañam')); close();
    } catch (cause) { setError(errorMessage(cause)); if (cause instanceof ApiError && cause.code === 'EVENT_CHANGED') { setConflict(true); refreshData(); } } finally { setBusy(false); }
  }
  return <><Modal title={initial ? localize(language,'Editar actividad','Edit activity','Rurayta tikray') : localize(language,'Comparte un aviso','Share a notice','Willakuyta rakiy')} onClose={() => { if (!busy) close(); }}><form className="form-stack" onSubmit={submit}>
    {initial && <p className="form-intro">{localize(language,'Corrige los datos, cambia el flyer o elige otro lugar. Los cambios de fecha o ubicaci\u00f3n se notificar\u00e1n a los asistentes confirmados.','Edit the details, replace the flyer, or choose another place. Confirmed attendees will be notified about date or location changes.','Willaykunata allichay, flyer nisqata tikray utaq huk kayta akllay. Pacha utaq kayta tikraptiykiqa asistenciata takyachiqkunaman willasqa kanqa.')}</p>}
    <Field label={localize(language,'T\u00edtulo','Title','Suti')}><input name="titulo" required minLength={3} maxLength={180} defaultValue={initial?.titulo ?? draft?.title} disabled={busy} placeholder={localize(language,'Ej. Jornada de limpieza vecinal','E.g. Neighborhood cleanup day','Hinalla: llaqtapi pichay punchaw')}/></Field>
    <Field label={localize(language,'\u00bfQu\u00e9 deben saber tus vecinos?','What should your neighbors know?','\u00bfImatam llaqtamasiykikuna yachananku?')}><textarea name="contenido" required minLength={3} maxLength={8000} rows={5} defaultValue={initial?.contenido ?? draft?.content} disabled={busy}/></Field>
    <PhotoPicker label={localize(language,'Imagen del flyer','Flyer image','Flyer siq\u2019i')} value={photo} currentUrl={initial?.imagenUrl} onChange={setPhoto} onBusyChange={setReadingPhoto} disabled={busy}/>
    <Field label={localize(language,'Categor\u00eda','Category','Mit\u2019a')}><select name="categoriaId" required value={categoryId} onChange={event => setCategoryId(event.target.value)} disabled={busy}><option value="" disabled>{localize(language,'Elige una opci\u00f3n','Choose an option','Hukta akllay')}</option>{catalogs.data?.avisos.map(c=><option key={c.id} value={c.id}>{noticeCategoryLabel(language,c.nombre)}</option>)}</select></Field>
    <div className="notice-category-preview" aria-live="polite">{selectedCategory && <><span className="form-hint">{localize(language,'Tu aviso tendr\u00e1 esta etiqueta:','Your notice will have this label:','Willakuyniyki kay sutiyuqmi kanqa:')}</span><NoticeCategoryBadge name={selectedCategory.nombre}/></>}</div>
    <Field label={localize(language,'Fecha y hora de la actividad','Activity date and time','Ruraypa pacha, punchawnin')} hint={initial ? localize(language,'Puedes conservar la fecha actual. Si la cambias, debe ser futura y se avisar\u00e1 a los asistentes. Una actividad vencida sigue vencida si no cambias su fecha.','You can keep the current date. If you change it, it must be in the future and attendees will be notified. An expired activity stays expired unless you change its date.','Kunan pachatam waqaychayta atinki. Tikraptiykiqa hamuq pacha kanan, asistenciata takyachiqkunatapas willasqayku. Pachas tukusqa rurayqa pachas tukusqam qipan, pachanta mana tikraptiykiqa.') : localize(language,'Hora local de tu dispositivo. Al llegar este momento, el aviso dejar\u00e1 de aparecer autom\u00e1ticamente.','Your device local time local time. The notice will disappear automatically when this time passes.','Dispositivoykip pacha. Chay pacha chayamuptinqa, willakuyqa kikillanmanta pakakunqa.')}><input name="fechaEvento" type="datetime-local" required={!initial || Boolean(initialDate)} defaultValue={initialDate || draft?.dateTime || ''} min={initial ? undefined : localDateTimeInput()} disabled={busy}/></Field>
    <div className="registration-location"><AddressAutocomplete label={localize(language,'Lugar de la actividad','Activity location','Ruraypa kaynin')} name="direccionActividad" value={location.address} onChange={address => setLocation({ address, coordinates: null })} onSelect={place => setLocation({ address: place.nombre, coordinates: { latitude: place.latitud, longitude: place.longitud } })} bias={location.coordinates || area.coordinates} online={online} disabled={busy} showSearchButton={false} autoSearch={Boolean(draft?.locationQuery)}/><div className="registration-location-actions"><button type="button" className="outline-btn" disabled={busy || !online} onClick={() => setLocationOpen(true)}><Icon name="pin" size={17}/>{location.coordinates ? localize(language,'Cambiar lugar en el mapa','Change map location','Mapapi kayta tikray') : localize(language,'Elegir lugar en el mapa','Choose a map location','Mapapi kayta akllay')}</button>{location.coordinates && <span className="registration-location-selected" role="status"><Icon name="check" size={15}/>{localize(language,'Lugar seleccionado','Location selected','Kay akllasqam')}</span>}</div><p className="form-hint">{localize(language,'Selecciona una sugerencia o un punto en el mapa. La direcci\u00f3n y el punto elegidos ser\u00e1n visibles como lugar de la actividad; tu perfil no cambia.','Select a suggestion or a point on the map. The chosen address and point will be shown as the activity location; your profile will not change.','Huk yuyaychasqata utaq mapapi kayta akllay. Akllasqa wasiyki, kaypas ruraypa kaynin hina rikuchikunqa; perfilniykiqa manam tikrakunchu.')}</p></div>
    <RemoteState {...catalogs}/><ErrorBox message={error}/><div className="event-change-actions"><button type="button" className="outline-btn" disabled={busy} onClick={close}>{localize(language,'Volver','Back','Kutiy')}</button><button className="record-button event-change-submit" disabled={busy||readingPhoto||locationOpen||conflict||(needsPoint&&!location.coordinates)||!online||!categoryId||!postingSectorId}>{busy?localize(language,'Guardando\u2026','Saving\u2026','Waqaychachkan\u2026'):readingPhoto?localize(language,'Preparando flyer\u2026','Preparing flyer\u2026','Flyer nisqata wakichichkan?'):initial?localize(language,'Guardar cambios','Save changes','Tikraykunata waqaychay'):localize(language,'Publicar aviso','Publish notice','Willakuyta willay')}</button></div>
  </form></Modal>{locationOpen && <ActivityLocationDialog value={location} initialCenter={area.coordinates} online={online} onClose={() => setLocationOpen(false)} onConfirm={value => { setLocation(value); setLocationOpen(false); setError(''); }}/>}</>;
}
