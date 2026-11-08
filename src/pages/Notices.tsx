import { useEffect, useState, type FormEvent } from 'react';
import { useApp } from '../AppContext';
import { api, errorMessage, refreshData } from '../lib/api';
import { areaQuery, useRemote } from '../lib/hooks';
import { Empty, ErrorBox, Field, Modal, PageHeading, RemoteState, distance, formatDate } from '../components/UI';
import Icon from '../components/Icon';
import type { Notice } from '../types';
import PhotoPicker from '../components/PhotoPicker';
import { apiAssetUrl } from '../lib/api';
import { localDateTimeInput, noticeVisible } from '../lib/notices';

export default function Notices() {
  const { user, area, requireUser } = useApp();
  const [creating, setCreating] = useState(false);
  const params = areaQuery(area);
  const notices = useRemote<Notice[]>(`/avisos?${params}`, user?.id || 'public');
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const update = () => setNow(Date.now());
    const deadlines = (notices.data || []).flatMap(item => [item.fechaEvento, item.venceEn]).filter((value): value is string => Boolean(value)).map(value => new Date(value).getTime()).filter(value => value > Date.now());
    const timer = window.setTimeout(update, Math.max(1, Math.min(60_000, ...deadlines.map(value => value - Date.now() + 1))));
    window.addEventListener('focus', update);
    document.addEventListener('visibilitychange', update);
    return () => { window.clearTimeout(timer); window.removeEventListener('focus', update); document.removeEventListener('visibilitychange', update); };
  }, [notices.data, now]);
  const visible = notices.data?.filter(item => noticeVisible(item, Math.max(now, Date.now())));
  return <section data-tour="tour-notices">
    <PageHeading eyebrow="LO QUE PASA CERCA" title="Avisos del barrio" text="Actividades, campañas y avisos compartidos por vecinos.">
      <button className="record-button" onClick={() => requireUser() && setCreating(true)}><Icon name="plus"/>Crear aviso</button>
    </PageHeading>
    <p className="form-hint mt-3">Los avisos son información compartida por vecinos; no representan comunicados oficiales.</p>
    <RemoteState {...notices}/>
    {!notices.loading && !notices.error && visible?.length === 0 && <Empty title="Aún no hay avisos en tu zona" text="Comparte una actividad o campaña de tu barrio."/>}
    <div className="mt-5 grid gap-4 md:grid-cols-2 lg:grid-cols-3">{visible?.map(item => <article key={item.id} className="request-card">
      <span className="category">{item.categoria}</span><h2 className="mt-3 text-xl font-bold">{item.titulo}</h2>
      <p className="card-description whitespace-pre-wrap">{item.contenido}</p>
      {item.imagenUrl && <a href={apiAssetUrl(item.imagenUrl)} target="_blank" rel="noopener noreferrer" aria-label={`Ver flyer completo: ${item.titulo}`}><img className="mt-4 max-h-96 w-full rounded-2xl object-contain" src={apiAssetUrl(item.imagenUrl)} alt={`Flyer: ${item.titulo}`} loading="lazy" referrerPolicy="no-referrer"/><span className="text-action text-sm">Ver flyer completo</span></a>}
      <p className="mt-4 text-sm text-[#68766f]">{distance(item.distanciaMetros, 'Distancia no disponible')} · {item.autor}</p>
      {item.fechaEvento && <p className="mt-1 text-sm text-[#68766f]">{formatDate(item.fechaEvento)}</p>}
      <p className="mt-1 text-xs text-[#87918b]">Publicado {formatDate(item.creadoEn)}</p>
      <a className="outline-btn mt-4 inline-flex" href={`https://wa.me/?text=${encodeURIComponent(`${item.titulo}\n${window.location.origin}/#avisos`)}`} target="_blank" rel="noopener noreferrer">Compartir por WhatsApp</a>
    </article>)}</div>
    {creating && <NoticeForm close={() => setCreating(false)}/>}
  </section>;
}

function NoticeForm({close}:{close:()=>void}) {
  const { postingSectorId, catalogs, online, notify } = useApp();
  const [error,setError]=useState(''); const [busy,setBusy]=useState(false);
  const [photo, setPhoto] = useState<string | null>(null);
  const [readingPhoto, setReadingPhoto] = useState(false);
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
    <Field label="Categoría"><select name="categoriaId" required defaultValue=""><option value="" disabled>Elige una opción</option>{catalogs.data?.avisos.map(c=><option key={c.id} value={c.id}>{c.nombre}</option>)}</select></Field>
    <Field label="Fecha y hora de la actividad" hint="Hora local de tu dispositivo. Al llegar este momento, el aviso dejará de aparecer automáticamente."><input name="fechaEvento" type="datetime-local" required min={localDateTimeInput()} disabled={busy}/></Field>
    <RemoteState {...catalogs}/><ErrorBox message={error}/><button className="record-button justify-center" disabled={busy||readingPhoto||!online||!catalogs.data?.avisos.length||!postingSectorId}>{busy?'Publicando…':readingPhoto?'Preparando flyer…':'Publicar aviso'}</button>
  </form></Modal>;
}
