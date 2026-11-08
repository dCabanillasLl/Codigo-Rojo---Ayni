import { useState, type FormEvent } from 'react';
import { useApp } from '../AppContext';
import { api, errorMessage, refreshData } from '../lib/api';
import { areaQuery, useDebounced, useRemote } from '../lib/hooks';
import { Empty, ErrorBox, Field, Modal, RemoteState, distance, shareItem, statusLabel } from '../components/UI';
import Icon from '../components/Icon';
import ServicesMap from '../ServicesMap';
import LocationPicker from '../components/LocationPicker';
import CommunityMap from '../components/CommunityMap';
import { googleMapsUrl, locationInput, mapPoint } from '../lib/location';
import type { LocationDraft, Publication, Reputation } from '../types';
import { neighborRank } from '../lib/ranks';
import { listingSymbol } from '../lib/map-symbols';
import PhotoPicker from '../components/PhotoPicker';
import PublicationImage from '../components/PublicationImage';
import NearbyFilters from '../components/NearbyFilters';
import PublicationReviews from '../components/PublicationReviews';

function price(item: Publication) { return item.modalidadPrecio === 'gratis' ? 'Gratis' : item.modalidadPrecio === 'cotizar' ? 'Consultar precio' : `${item.modalidadPrecio === 'desde' ? 'Desde ' : ''}${new Intl.NumberFormat('es-PE',{style:'currency',currency:item.moneda || 'PEN'}).format(Number(item.precio))}`; }

export default function Nearby({ onLocation, onAsk, detailId }: { onLocation: () => void; onAsk: () => void; detailId?: string }) {
  const { user, area, setArea, catalogs, requireUser } = useApp();
  const [query,setQuery] = useState(''); const debouncedQuery = useDebounced(query);
  const [category,setCategory] = useState(''); const [kind,setKind] = useState(''); const [mine,setMine] = useState(false);
  const [creating,setCreating] = useState(false); const [editing,setEditing] = useState<Publication | null>(null);
  const [selected,setSelected] = useState('');
  const params = mine ? new URLSearchParams({mios:'1'}) : areaQuery(area);
  if(debouncedQuery) params.set('q',debouncedQuery); if(category) params.set('categoriaId',category);if(kind) params.set('tipo',kind);
  const publications = useRemote<Publication[]>(`/publicaciones?${params}`,user?.id || 'public');
  return <>
    <section className="nearby-hero mb-8 grid items-center gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,24rem)]"><div><p className="eyebrow">TU BARRIO, MÁS CERCA</p><h1 className="font-display mt-3 max-w-[680px] text-[42px] font-bold leading-[1.04] tracking-[-0.045em] text-[#173f32]">Hola, <span className="text-[#e36543]">{user?.nombres || 'vecino'}.</span></h1><p className="mt-4 max-w-xl text-[17px] leading-7 text-[#627069]">Descubre quién puede ayudarte, compra local y conecta con las personas que hacen especial tu barrio.</p><div className="action-row mt-5"><button data-tour="tour-ask" className="record-button" onClick={onAsk}><Icon name="hands"/>Necesito ayuda</button><button data-tour="tour-offer" className="outline-btn" onClick={() => { if(requireUser()) setCreating(true); }}><Icon name="plus"/>Ofrecer producto o servicio</button></div></div><button data-tour="tour-location" className="location-card nearby-location text-left" onClick={onLocation}><span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-[#e5eee8] text-[#2d6a4e]"><Icon name="pin"/></span><span className="min-w-0 flex-1"><span className="block text-xs font-bold uppercase tracking-[.12em] text-[#79847f]">Tu zona</span><span className="mt-1 block truncate font-semibold">{area.coordinates ? 'Cerca de tu ubicación' : 'Elige tu ubicación'}</span></span><Icon name="chevron"/></button></section>
    <section><div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end"><div><p className="eyebrow">ECONOMÍA LOCAL</p><h2 className="font-display mt-2 text-[30px] font-bold tracking-[-.035em] text-[#173f32]">Cerca de ti</h2><p className="mt-1 text-sm text-[#6c7872]">Productos y servicios compartidos por tus vecinos.</p></div></div>
      <NearbyFilters query={query} onQuery={setQuery} category={category} onCategory={setCategory} categories={catalogs.data?.publicaciones || []} categoriesLoading={catalogs.loading} kind={kind} onKind={setKind} mine={mine} onMine={value => { if (!value || requireUser()) setMine(value); }} radius={area.radius} hasLocation={Boolean(area.coordinates)} onRadius={radius => setArea({ ...area, radius })} onLocation={onLocation} loading={publications.loading} resultCount={publications.data?.length ?? null} onClear={() => { setQuery(''); setCategory(''); setKind(''); setMine(false); setSelected(''); if (area.radius !== 1000) setArea({ ...area, radius: 1000 }); }}/>
      <RemoteState {...publications}/>
      <div className="mt-5"><ServicesMap services={publications.data || []} selectedId={detailId || selected} onSelect={id => { window.location.hash = `cerca/${id}`; }} filterRadius={!mine}/></div>
      {!publications.loading && publications.data?.length === 0 && <Empty title="Todavía no hay publicaciones aquí" text="Prueba otra búsqueda o comparte el primer producto o servicio de tu zona."/>}
      <div className="mt-5 grid gap-4 md:grid-cols-3">{publications.data?.map((item,index) => <article key={item.id} className="listing-card"><div className={`listing-art ${['gold','rose','green'][index%3]}`}><PublicationImage src={item.imagenUrl} alt={item.titulo} className="listing-photo" fallback={<Icon name={item.tipo === 'producto' ? 'store' : 'hands'} size={38}/>}/><span className="absolute right-3 top-3 rounded-full bg-white/90 px-2.5 py-1 text-[11px] font-bold text-[#2f473d]">{distance(item.distanciaMetros, 'Distancia no disponible')}</span></div><div className="p-5"><div className="flex items-center justify-between gap-3"><span className="text-[10px] font-extrabold tracking-[.12em] text-[#799083]">{item.tipo === 'producto' ? 'PRODUCTO LOCAL' : 'SERVICIO'}</span><b className="text-sm">{price(item)}</b></div><h3 className="mt-2 text-[17px] font-bold leading-snug text-[#263a31]">{item.titulo}</h3><p className="mt-1 text-sm text-[#717d77]">{item.propietario}</p><p className="card-description">{item.descripcion}</p><p className="mt-3 text-xs text-[#65726b]">{Number(item.totalResenas) > 0 ? `${Number(item.promedioResenas).toFixed(1)}/5 · ${item.totalResenas} recomendaciones sin verificar` : 'Aún sin recomendaciones'}</p>{item.estado !== 'publicada' && <span className="state-badge mt-2">{statusLabel(item.estado)}</span>}<button className="offer-button" onClick={() => { window.location.hash = `cerca/${item.id}`; }}>Ver detalles<Icon name="arrow" size={16}/></button><button className="view-on-map" onClick={() => { setSelected(item.id);window.setTimeout(() => document.getElementById('services-map-title')?.scrollIntoView({behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth',block:'start'}),100); }}>Ver en el mapa<Icon name="pin" size={16}/></button>{item.propietarioId === user?.id && <button className="text-action mt-3" onClick={() => setEditing(item)}>Editar mi publicación</button>}</div></article>)}</div>
    </section>
    {(creating || editing) && <PublicationForm initial={editing} onClose={() => {setCreating(false);setEditing(null);}}/>}
    {detailId && <PublicationDetail id={detailId} onClose={() => {window.location.hash='cerca';}} onEdit={item => { window.location.hash = 'cerca'; setEditing(item); }}/>}
  </>;
}
function PublicationForm({ initial, onClose }: { initial: Publication | null; onClose: () => void }) {
  const { area, postingSectorId, catalogs, online, notify } = useApp();
  const [mode, setMode] = useState(initial?.modalidadPrecio || 'cotizar');
  const sectorId = initial?.sectorId || postingSectorId;
  const [location, setLocation] = useState<LocationDraft>({ coordinates: initial ? null : area.coordinates, address: '' });
  const [photo, setPhoto] = useState<string | null | undefined>(undefined);
  const [readingPhoto, setReadingPhoto] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const data = new FormData(event.currentTarget); setBusy(true); setError('');
    try {
      await api('/publicaciones' + (initial ? '/' + initial.id : ''), {
        method: initial ? 'PATCH' : 'POST', timeoutMs: typeof photo === 'string' ? 60000 : 15000, body: {
          titulo: data.get('titulo'), descripcion: data.get('descripcion'), categoriaId: data.get('categoriaId'), tipo: data.get('tipo'),
          sectorId, ubicacion: locationInput(location), modalidadPrecio: mode, foto: photo,
          precio: ['fijo', 'desde'].includes(mode) ? Number(data.get('precio')) : null, estado: data.get('estado') || 'publicada',
        },
      });
      refreshData(); notify(initial ? 'Publicación actualizada' : 'Tu publicación ya está disponible'); onClose();
    } catch (cause) { setError(errorMessage(cause)); } finally { setBusy(false); }
  }
  return <Modal title={initial ? 'Editar publicación' : 'Comparte lo que ofreces'} onClose={onClose} wide>
    <form className="form-stack" onSubmit={submit}>
      <Field label="¿Qué ofreces?"><input name="titulo" required minLength={3} maxLength={160} defaultValue={initial?.titulo} placeholder="Por ejemplo: arreglo bicicletas"/></Field>
      <Field label="Cuéntanos más"><textarea name="descripcion" rows={3} maxLength={4000} defaultValue={initial?.descripcion || ''}/></Field>
      <PhotoPicker value={photo} currentUrl={initial?.imagenUrl} onChange={setPhoto} onBusyChange={setReadingPhoto} disabled={busy}/>
      <div className="form-columns">
        <Field label="Tipo"><select name="tipo" defaultValue={initial?.tipo || 'servicio'}><option value="servicio">Servicio</option><option value="producto">Producto</option></select></Field>
        <Field label="Categoría"><select name="categoriaId" required defaultValue={initial?.categoriaId || ''}><option value="" disabled>Elige una categoría</option>{catalogs.data?.publicaciones.map(item => <option key={item.id} value={item.id}>{item.nombre}</option>)}</select></Field>
      </div>
      <div className="form-columns">
        <Field label="Precio"><select value={mode} onChange={event => setMode(event.target.value as Publication['modalidadPrecio'])}><option value="cotizar">Consultar precio</option><option value="gratis">Gratis</option><option value="fijo">Precio fijo</option><option value="desde">Desde un precio</option></select></Field>
        {['fijo', 'desde'].includes(mode) && <Field label="Monto en soles"><input name="precio" type="number" min={0} max={99999999} step="0.01" required defaultValue={initial?.precio || ''}/></Field>}
      </div>
      <details className="post-location" open><summary><Icon name="pin" size={18}/>¿Dónde ofreces este producto o servicio?</summary><p className="form-hint">{initial ? 'Conservamos el punto actual si no eliges uno nuevo.' : 'Elige un punto para aparecer en el mapa. Si lo omites, se usará la ubicación de tu perfil si existe.'} Tu dirección exacta es privada y tu perfil no cambia.</p><LocationPicker value={location} onChange={setLocation} online={online} disabled={busy} initialCenter={initial ? mapPoint(initial) : null}/></details>
      {initial && <Field label="Visibilidad"><select name="estado" defaultValue={initial.estado}><option value="publicada">Publicada</option><option value="pausada">Pausada</option><option value="archivada">Archivada</option><option value="borrador">Borrador</option></select></Field>}
      <RemoteState {...catalogs}/><ErrorBox message={error}/>
      <button className="record-button justify-center" disabled={busy || readingPhoto || !online || !sectorId || !catalogs.data?.publicaciones.length}>{busy ? 'Guardando…' : readingPhoto ? 'Preparando foto…' : initial ? 'Guardar cambios' : 'Publicar'}</button>
    </form>
  </Modal>;
}
function PublicationDetail({id,onClose,onEdit}:{id:string;onClose:()=>void;onEdit:(item:Publication)=>void}) {
  const {user,notify,online} = useApp();const publication=useRemote<Publication>(`/publicaciones/${id}`,user?.id||'public');const reputation=useRemote<Reputation>(publication.data?`/usuarios/${publication.data.propietarioId}/reputacion`:null);const [error,setError]=useState('');const item=publication.data; const point=item ? mapPoint(item) : null;
  const contactPhone = item?.propietarioId !== user?.id ? item?.telefonoContacto?.replace(/\D/g, '') : null;
  const shareText = item ? `${item.titulo}\n${item.descripcion || ''}\n${price(item)}\n${window.location.origin}${window.location.pathname}#cerca/${id}` : '';
  return <Modal title={item?.titulo || 'Publicación'} onClose={onClose} wide><RemoteState {...publication} />{item && <><span className="category">{item.categoria}</span>{item.imagenUrl && <div className="publication-detail-photo"><PublicationImage src={item.imagenUrl} alt={item.titulo} fallback={<Icon name={item.tipo === 'producto' ? 'store' : 'hands'} size={44} />} /></div>}<p className="detail-description">{item.descripcion || 'El vecino todavía no agregó una descripción.'}</p><p className="text-xl font-bold">{price(item)}</p><p className="mt-3 text-sm">Ofrece: {item.propietario}</p>{item.propietarioId === user?.id && <button type="button" className="outline-btn mt-3" onClick={() => onEdit(item)}>Editar mi publicación</button>}<div className="publication-share-actions" role="group" aria-label="Compartir publicación">{contactPhone && <a className="whatsapp-btn" href={`https://wa.me/${contactPhone}?text=${encodeURIComponent(`Hola, vi tu publicación en AYNI: ${item.titulo}`)}`} target="_blank" rel="noopener noreferrer"><Icon name="whatsapp" size={20} /><span>Contactar por WhatsApp</span></a>}<a className="outline-btn" href={`https://wa.me/?text=${encodeURIComponent(shareText)}`} target="_blank" rel="noopener noreferrer"><Icon name="share" size={18} /><span>Compartir por WhatsApp</span></a><button type="button" className="outline-btn" onClick={() => void shareItem(item.titulo, `${item.descripcion || ''}\n${price(item)}`, `#cerca/${id}`).then(message => { if (message) notify(message); }).catch(error => { if (error?.name !== 'AbortError') setError(errorMessage(error)); })}><Icon name="share" size={18} /><span>Más opciones</span></button></div>{!contactPhone && <p className="form-hint">Este vecino no habilitó un teléfono público. Puedes compartir la publicación, pero no contactar su WhatsApp desde AYNI.</p>}<ErrorBox message={error} />{point && <div className="detail-map"><h3 className="section-subtitle font-display">Ubicación aproximada</h3><CommunityMap center={point} pins={[{ id, point, title: item.titulo, label: '1', kind: item.tipo === 'producto' ? 'product' : 'service', symbol: listingSymbol(item, item.tipo === 'producto' ? 'product' : 'service'), category: item.categoria }]} selectedId={id} online={online} compact label="Zona del producto o servicio" /><p className="form-hint">El marcador indica una zona aproximada. Acuerda el punto de encuentro con el vecino.</p><a className="text-action" href={googleMapsUrl(point)} target="_blank" rel="noopener noreferrer">Abrir zona en Google Maps</a></div>}<h3 className="section-subtitle font-display">Confianza de este vecino</h3><RemoteState {...reputation} />{reputation.data && <div className="neighbor-reputation-card"><div className="neighbor-reputation-score"><Icon name="star" size={22} /><b>{reputation.data.promedio ?? '—'}<small>/5</small></b><span>{reputation.data.resenas.length} {reputation.data.resenas.length === 1 ? 'reseña' : 'reseñas'}</span></div><div className="neighbor-reputation-copy"><b>{reputation.data.vistosBuenos} vistos buenos</b><p>{reputation.data.colaboracionesConfirmadas} aportes confirmados · Rango {neighborRank(reputation.data.colaboracionesConfirmadas).name}</p></div></div>}<p className="form-hint mt-3">La reputación del vecino incluye las colaboraciones confirmadas del muro de ayuda. Las siguientes opiniones corresponden a este producto o servicio.</p><PublicationReviews publicationId={item.id} ownerId={item.propietarioId}/></>}</Modal>;
}
