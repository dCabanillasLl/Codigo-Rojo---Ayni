import { useState, type FormEvent } from 'react';
import { useApp } from '../AppContext';
import { api, errorMessage, refreshData } from '../lib/api';
import { areaQuery, useRemote } from '../lib/hooks';
import { Empty, ErrorBox, Field, Modal, PageHeading, RemoteState, distance, formatDate } from '../components/UI';
import Icon from '../components/Icon';
import type { Notice } from '../types';

export default function Notices() {
  const { user, area, catalogs, sectors, online, requireUser, notify } = useApp();
  const [creating, setCreating] = useState(false);
  const params = areaQuery(area);
  const notices = useRemote<Notice[]>(`/avisos?${params}`, user?.id || 'public');
  return <section data-tour="tour-notices">
    <PageHeading eyebrow="LO QUE PASA CERCA" title="Avisos del barrio" text="Actividades, campañas y avisos compartidos por vecinos.">
      <button className="record-button" onClick={() => requireUser() && setCreating(true)}><Icon name="plus"/>Crear aviso</button>
    </PageHeading>
    <p className="form-hint mt-3">Los avisos son información compartida por vecinos; no representan comunicados oficiales.</p>
    <RemoteState {...notices}/>
    {!notices.loading && !notices.error && notices.data?.length === 0 && <Empty title="Aún no hay avisos en tu zona" text="Comparte una actividad o campaña de tu barrio."/>}
    <div className="mt-5 grid gap-4 md:grid-cols-2 lg:grid-cols-3">{notices.data?.map(item => <article key={item.id} className="request-card">
      <span className="category">{item.categoria}</span><h2 className="mt-3 text-xl font-bold">{item.titulo}</h2>
      <p className="card-description whitespace-pre-wrap">{item.contenido}</p>
      {item.imagenUrl && <img className="mt-4 max-h-72 w-full rounded-2xl object-cover" src={item.imagenUrl} alt={`Flyer: ${item.titulo}`} loading="lazy" referrerPolicy="no-referrer"/>}
      <p className="mt-4 text-sm text-[#68766f]">{distance(item.distanciaMetros, item.sectorNombre)} · {item.autor}</p>
      {item.fechaEvento && <p className="mt-1 text-sm text-[#68766f]">{formatDate(item.fechaEvento)}</p>}
      <p className="mt-1 text-xs text-[#87918b]">Publicado {formatDate(item.creadoEn)}</p>
      <a className="outline-btn mt-4 inline-flex" href={`https://wa.me/?text=${encodeURIComponent(`${item.titulo} · ${item.sectorNombre}\n${window.location.origin}/#avisos`)}`} target="_blank" rel="noopener noreferrer">Compartir por WhatsApp</a>
    </article>)}</div>
    {creating && <NoticeForm close={() => setCreating(false)}/>}
  </section>;
}

function NoticeForm({close}:{close:()=>void}) {
  const { area, sectors, catalogs, online, notify } = useApp();
  const [error,setError]=useState(''); const [busy,setBusy]=useState(false);
  const [imageUrl,setImageUrl]=useState('');
  async function submit(event:FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form=new FormData(event.currentTarget); setBusy(true); setError('');
    try {
      await api('/avisos',{method:'POST',body:{titulo:String(form.get('titulo')),contenido:String(form.get('contenido')),categoriaId:String(form.get('categoriaId')),sectorId:String(form.get('sectorId')), ...(imageUrl.trim() ? {imagenUrl:imageUrl.trim()} : {}), ...(form.get('fechaEvento') ? {fechaEvento:new Date(String(form.get('fechaEvento'))).toISOString()} : {})}});
      refreshData(); notify('Tu aviso ya está publicado'); close();
    } catch (cause) { setError(errorMessage(cause)); } finally { setBusy(false); }
  }
  return <Modal title="Comparte un aviso" onClose={close}><form className="form-stack" onSubmit={submit}>
    <Field label="Título"><input name="titulo" required minLength={3} maxLength={180} placeholder="Ej. Jornada de limpieza vecinal"/></Field>
    <Field label="¿Qué deben saber tus vecinos?"><textarea name="contenido" required minLength={3} maxLength={8000} rows={5}/></Field>
    <Field label="Imagen del flyer (opcional)" hint="Pega una URL HTTPS pública de la imagen. AYNI guarda la referencia, no sube el archivo."><input type="url" value={imageUrl} onChange={event=>setImageUrl(event.target.value)} placeholder="https://…" maxLength={2048}/></Field>
    {imageUrl.startsWith('https://') && <img className="max-h-56 w-full rounded-2xl object-cover" src={imageUrl} alt="Vista previa del flyer" referrerPolicy="no-referrer"/>}
    <Field label="Categoría"><select name="categoriaId" required defaultValue=""><option value="" disabled>Elige una opción</option>{catalogs.data?.avisos.map(c=><option key={c.id} value={c.id}>{c.nombre}</option>)}</select></Field>
    <Field label="Sector"><select name="sectorId" required defaultValue={area.sectorId}><option value="" disabled>Elige tu sector</option>{sectors.data?.map(s=><option key={s.id} value={s.id}>{s.nombre} · {s.distrito}</option>)}</select></Field>
    <Field label="Fecha de actividad (opcional)"><input name="fechaEvento" type="datetime-local"/></Field>
    <RemoteState {...catalogs}/><RemoteState {...sectors}/><ErrorBox message={error}/><button className="record-button justify-center" disabled={busy||!online||!catalogs.data?.avisos.length||!sectors.data?.length}>{busy?'Publicando…':'Publicar aviso'}</button>
  </form></Modal>;
}
