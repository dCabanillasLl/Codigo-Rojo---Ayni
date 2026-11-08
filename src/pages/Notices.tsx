import { useEffect, useState, type FormEvent } from 'react';
import { useApp } from '../AppContext';
import { api, errorMessage, refreshData } from '../lib/api';
import { areaQuery, useRemote } from '../lib/hooks';
import { Empty, ErrorBox, Field, Modal, PageHeading, RemoteState, distance, formatDate } from '../components/UI';
import Icon from '../components/Icon';
import type { Notice } from '../types';
import PhotoPicker from '../components/PhotoPicker';
import { apiAssetUrl } from '../lib/api';
import { localDateTimeInput, noticeCategory, noticeStatus, noticeVisible } from '../lib/notices';

export default function Notices({ view }: { view?: string }) {
  const { user, area, requireUser, online } = useApp();
  const [creating, setCreating] = useState(false);
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
  const visible = notices.data?.filter(item => tab !== 'cerca' || noticeVisible(item, Math.max(now, Date.now())));
  return <section data-tour="tour-notices">
    <PageHeading eyebrow="LO QUE PASA CERCA" title="Avisos del barrio" text="Actividades, campañas y avisos compartidos por vecinos.">
      <button className="record-button" onClick={() => requireUser() && setCreating(true)}><Icon name="plus"/>Crear aviso</button>
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
      {item.motivoCambio && <p className="form-hint mt-2"><b>Último cambio:</b> {item.motivoCambio}</p>}
      <p className="mt-1 text-xs text-[#87918b]">Publicado {formatDate(item.creadoEn)}</p>
      <AttendanceActions item={item}/>
    </article>)}</div>
    {creating && <NoticeForm close={() => setCreating(false)}/>}
  </section>;
}

function NoticeCategoryBadge({ name }: { name: string }) {
  const category = noticeCategory(name);
  return <span className={`notice-category notice-category-${category.key}`} aria-label={`Categoría: ${name}`}><Icon name={category.icon} size={15}/>{name}</span>;
}

function NoticeStatusBadge({ item }: { item: Notice }) {
  const status = noticeStatus(item);
  return <span className={`notice-status notice-status-${status.key}`} aria-label={`Estado de la actividad: ${status.label}`}><Icon name={status.icon} size={14}/>{status.label}</span>;
}

function AttendanceActions({ item }: { item: Notice }) {
  const { user, requireUser, online, notify } = useApp();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [managing, setManaging] = useState(false);
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
    {owner && <p className="form-hint">Revisa las confirmaciones para decidir si mantienes, postergas o cancelas la actividad.</p>}
    <div className="notice-card-actions">
      {owner ? ['publicado', 'vencido'].includes(item.estado) && <button type="button" className="outline-btn" disabled={!online} onClick={() => setManaging(true)}><span>Postergar o cancelar</span></button> : (confirmed || noticeVisible(item)) && <button type="button" className={confirmed ? 'outline-btn attendance-toggle' : 'record-button attendance-toggle'} aria-pressed={confirmed} disabled={busy || !online} onClick={() => void confirm()}><Icon name="check" size={17}/><span>{busy ? 'Guardando…' : confirmed ? 'Asistiré · Quitar confirmación' : 'Asistiré'}</span></button>}
      <a className="whatsapp-btn" href={`https://wa.me/?text=${encodeURIComponent(`${item.titulo}\n${window.location.origin}/#avisos`)}`} target="_blank" rel="noopener noreferrer"><Icon name="whatsapp" size={20}/><span>Compartir por WhatsApp</span></a>
    </div>
    <ErrorBox message={error}/>
    {managing && <EventChangeDialog item={item} onClose={() => setManaging(false)}/>}
  </div>;
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

function NoticeForm({close}:{close:()=>void}) {
  const { postingSectorId, catalogs, online, notify } = useApp();
  const [error,setError]=useState(''); const [busy,setBusy]=useState(false);
  const [photo, setPhoto] = useState<string | null>(null);
  const [readingPhoto, setReadingPhoto] = useState(false);
  const [categoryId, setCategoryId] = useState('');
  const selectedCategory = catalogs.data?.avisos.find(category => category.id === categoryId);
  async function submit(event:FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (readingPhoto || busy) return;
    const form=new FormData(event.currentTarget); setBusy(true); setError('');
    try {
      const date = new Date(String(form.get('fechaEvento')));
      if (!Number.isFinite(date.getTime()) || date.getTime() <= Date.now()) throw new Error('Elige una fecha y hora futuras para la actividad.');
      await api('/avisos',{method:'POST',body:{titulo:String(form.get('titulo')),contenido:String(form.get('contenido')),categoriaId:String(form.get('categoriaId')),sectorId:postingSectorId, foto: photo, fechaEvento:date.toISOString()}});
      refreshData(); notify('Tu aviso ya está publicado'); close();
    } catch (cause) { setError(errorMessage(cause)); } finally { setBusy(false); }
  }
  return <Modal title="Comparte un aviso" onClose={close}><form className="form-stack" onSubmit={submit}>
    <Field label="Título"><input name="titulo" required minLength={3} maxLength={180} placeholder="Ej. Jornada de limpieza vecinal"/></Field>
    <Field label="¿Qué deben saber tus vecinos?"><textarea name="contenido" required minLength={3} maxLength={8000} rows={5}/></Field>
    <PhotoPicker label="Imagen del flyer" value={photo} onChange={setPhoto} onBusyChange={setReadingPhoto} disabled={busy}/>
    <Field label="Categoría"><select name="categoriaId" required value={categoryId} onChange={event => setCategoryId(event.target.value)} disabled={busy}><option value="" disabled>Elige una opción</option>{catalogs.data?.avisos.map(c=><option key={c.id} value={c.id}>{c.nombre}</option>)}</select></Field>
    <div className="notice-category-preview" aria-live="polite">{selectedCategory && <><span className="form-hint">Tu aviso tendrá esta etiqueta:</span><NoticeCategoryBadge name={selectedCategory.nombre}/></>}</div>
    <Field label="Fecha y hora de la actividad" hint="Hora local de tu dispositivo. Al llegar este momento, el aviso dejará de aparecer automáticamente."><input name="fechaEvento" type="datetime-local" required min={localDateTimeInput()} disabled={busy}/></Field>
    <RemoteState {...catalogs}/><ErrorBox message={error}/><button className="record-button justify-center" disabled={busy||readingPhoto||!online||!catalogs.data?.avisos.length||!postingSectorId}>{busy?'Publicando…':readingPhoto?'Preparando flyer…':'Publicar aviso'}</button>
  </form></Modal>;
}
