import { useEffect, useState, type FormEvent } from 'react';
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
import { localize, localizePublicationCategory, useLanguage, type Language } from '../lib/language';

function price(item: Publication, language: Language = 'es') { return item.modalidadPrecio === 'gratis' ? localize(language,'Gratis','Free','Mana qullqiyuq') : item.modalidadPrecio === 'cotizar' ? localize(language,'Consultar precio','Ask for price','Chaninta tapuy') : `${item.modalidadPrecio === 'desde' ? localize(language,'Desde ','From ','Qallariq chanin ') : ''}${new Intl.NumberFormat(language === 'en' ? 'en-PE' : 'es-PE',{style:'currency',currency:item.moneda || 'PEN'}).format(Number(item.precio))}`; }
function publicationStatus(state: Publication['estado'], language: Language) {
  const translations: Record<string, [string, string]> = { publicada: ['Published', 'Willachisqa'], pausada: ['Paused', 'Sayachisqa'], archivada: ['Archived', 'Waqaychasqa'], borrador: ['Draft', 'Qillqasqa'] };
  return language === 'es' ? statusLabel(state) : translations[state]?.[language === 'en' ? 0 : 1] || statusLabel(state);
}
type ServiceDraft = { title: string; description: string; categoryHint?: string };

export default function Nearby({ onLocation, onAsk, detailId, serviceDraft, onServiceDraftClose, initialServiceSearch, onServiceSearchApplied }: { onLocation: () => void; onAsk: () => void; detailId?: string; serviceDraft?: ServiceDraft; onServiceDraftClose?: () => void; initialServiceSearch?: string; onServiceSearchApplied?: () => void }) {
  const { language } = useLanguage();
  const { user, area, setArea, catalogs, requireUser } = useApp();
  const [query,setQuery] = useState(''); const debouncedQuery = useDebounced(query);
  const [category,setCategory] = useState(''); const [kind,setKind] = useState(''); const [mine,setMine] = useState(false);
  const [creating,setCreating] = useState(false); const [editing,setEditing] = useState<Publication | null>(null);
  const [selected,setSelected] = useState('');
  useEffect(() => { if (serviceDraft) setCreating(true); }, [serviceDraft]);
  useEffect(() => { if (initialServiceSearch) { setQuery(initialServiceSearch); setKind('servicio'); setMine(false); onServiceSearchApplied?.(); } }, [initialServiceSearch, onServiceSearchApplied]);
  const params = mine ? new URLSearchParams({mios:'1'}) : areaQuery(area);
  if(debouncedQuery) params.set('q',debouncedQuery); if(category) params.set('categoriaId',category);if(kind) params.set('tipo',kind);
  const publications = useRemote<Publication[]>(`/publicaciones?${params}`,user?.id || 'public');
  return <>
    <section className="nearby-hero mb-8 grid items-center gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,24rem)]"><div><p className="eyebrow">{localize(language,'TU BARRIO, MÁS CERCA','YOUR NEIGHBORHOOD, CLOSER','LLAQTAYKI ASUYPI')}</p><h1 className="font-display mt-3 max-w-[680px] text-[42px] font-bold leading-[1.04] tracking-[-0.045em] text-[#173f32]">{localize(language,'Hola,','Hello,','Rimaykullayki,')} <span className="text-[#e36543]">{user ? `${user.nombres.trim().split(/\s+/)[0]} ${user.apellidos.trim().split(/\s+/)[0]}` : localize(language,'vecino','neighbor','llaqtamasiy')}.</span></h1><p className="mt-4 max-w-xl text-[17px] leading-7 text-[#627069]">{localize(language,'Descubre quién puede ayudarte, compra local y conecta con las personas que hacen especial tu barrio.','Find neighbors who can help, shop locally, and connect with the people who make your neighborhood special.','Pim kayniykipi yanapayta atiqkunata tariy, llaqtaykipi rantiy, llaqtaykita sumaq ruraq runakunawan tinkiy.')}</p><div className="action-row mt-5"><button data-tour="tour-ask" className="record-button" onClick={onAsk}><Icon name="hands"/>{localize(language,'Necesito ayuda','I need help','Yanapayta necesitani')}</button><button data-tour="tour-offer" className="outline-btn" onClick={() => { if(requireUser()) setCreating(true); }}><Icon name="plus"/>{localize(language,'Ofrecer producto o servicio','Offer a product or service','Rantikunata utaq yanapayta quy')}</button></div></div><button data-tour="tour-location" className="location-card nearby-location text-left" onClick={onLocation}><span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-[#e5eee8] text-[#2d6a4e]"><Icon name="pin"/></span><span className="min-w-0 flex-1"><span className="block text-xs font-bold uppercase tracking-[.12em] text-[#79847f]">{localize(language,'Tu zona','Your area','Ñuqaykip llaqta')}</span><span className="mt-1 block truncate font-semibold">{area.coordinates ? localize(language,'Cerca de tu ubicación','Near your location','Kayniyki qayllapi') : localize(language,'Elige tu ubicación','Choose your location','Kayniykita akllay')}</span></span><Icon name="chevron"/></button></section>
    <section><div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end"><div><p className="eyebrow">{localize(language,'ECONOMÍA LOCAL','LOCAL ECONOMY','Llaqtaq qullqi puriynin')}</p><h2 className="font-display mt-2 text-[30px] font-bold tracking-[-.035em] text-[#173f32]">{localize(language,'Cerca de ti','Near you','Qayllaykipi')}</h2><p className="mt-1 text-sm text-[#6c7872]">{localize(language,'Productos y servicios compartidos por tus vecinos.','Products and services shared by your neighbors.','Llaqtamasiykikuna rantichkasqankuta, yanapaykunatapas qhaway.')}</p></div></div>
      <NearbyFilters query={query} onQuery={setQuery} category={category} onCategory={setCategory} categories={catalogs.data?.publicaciones || []} categoriesLoading={catalogs.loading} kind={kind} onKind={setKind} mine={mine} onMine={value => { if (!value || requireUser()) setMine(value); }} radius={area.radius} hasLocation={Boolean(area.coordinates)} onRadius={radius => setArea({ ...area, radius })} onLocation={onLocation} loading={publications.loading} resultCount={publications.data?.length ?? null} onClear={() => { setQuery(''); setCategory(''); setKind(''); setMine(false); setSelected(''); if (area.radius !== 1000) setArea({ ...area, radius: 1000 }); }}/>
      <RemoteState {...publications}/>
      <div className="mt-5"><ServicesMap services={publications.data || []} selectedId={detailId || selected} onSelect={id => { window.location.hash = `cerca/${id}`; }} filterRadius={!mine}/></div>
      {!publications.loading && publications.data?.length === 0 && <Empty title={localize(language,'Todavía no hay publicaciones aquí','There are no listings here yet','Kaypiqa manaraq willaykuna kanchu')} text={localize(language,'Prueba otra búsqueda o comparte el primer producto o servicio de tu zona.','Try another search or share the first product or service in your area.','Huk maskayta ruway utaq ñawpaq rantikunaykita utaq yanapakuyniykita willay.')}/>}
      <div className="mt-5 grid gap-4 md:grid-cols-3">{publications.data?.map((item,index) => <article key={item.id} className="listing-card"><div className={`listing-art ${['gold','rose','green'][index%3]}`}><PublicationImage src={item.imagenUrl} alt={item.titulo} className="listing-photo" fallback={<Icon name={item.tipo === 'producto' ? 'store' : 'hands'} size={38}/>}/><span className="absolute right-3 top-3 rounded-full bg-white/90 px-2.5 py-1 text-[11px] font-bold text-[#2f473d]">{distance(item.distanciaMetros, localize(language,'Distancia no disponible','Distance unavailable','Mana kayniyuq'))}</span></div><div className="p-5"><div className="flex items-center justify-between gap-3"><span className="text-[10px] font-extrabold tracking-[.12em] text-[#799083]">{item.tipo === 'producto' ? localize(language,'PRODUCTO LOCAL','LOCAL PRODUCT','LLAQTAQ RANTIKUNAN') : localize(language,'SERVICIO','SERVICE','YANAPAKUY')}</span><b className="text-sm">{price(item, language)}</b></div><h3 className="mt-2 text-[17px] font-bold leading-snug text-[#263a31]">{item.titulo}</h3><p className="mt-1 text-sm text-[#717d77]">{item.propietario}</p><p className="card-description">{item.descripcion}</p><p className="mt-3 text-xs text-[#65726b]">{Number(item.totalResenas) > 0 ? `${Number(item.promedioResenas).toFixed(1)}/5 · ${item.totalResenas} ${localize(language,'recomendaciones sin verificar','unverified recommendations','mana takyachisqa allin rimaykuna')}` : localize(language,'Aún sin recomendaciones','No recommendations yet','Manaraq allin rimaykuna kanchu')}</p>{item.estado !== 'publicada' && <span className="state-badge mt-2">{publicationStatus(item.estado, language)}</span>}<button className="offer-button" onClick={() => { window.location.hash = `cerca/${item.id}`; }}>{localize(language,'Ver detalles','View details','Willayta qhaway')}<Icon name="arrow" size={16}/></button><button className="view-on-map" onClick={() => { setSelected(item.id);window.setTimeout(() => document.getElementById('services-map-title')?.scrollIntoView({behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth',block:'start'}),100); }}>{localize(language,'Ver en el mapa','View on map','Mapapi qhaway')}<Icon name="pin" size={16}/></button>{item.propietarioId === user?.id && <button className="text-action mt-3" onClick={() => setEditing(item)}>{localize(language,'Editar mi publicación','Edit my listing','Willayniyta tikray')}</button>}</div></article>)}</div>
    </section>
    {(creating || editing) && <PublicationForm initial={editing} draft={creating ? serviceDraft : undefined} onClose={() => {setCreating(false);setEditing(null);onServiceDraftClose?.();}}/>}
    {detailId && <PublicationDetail id={detailId} onClose={() => {window.location.hash='cerca';}} onEdit={item => { window.location.hash = 'cerca'; setEditing(item); }}/>}
  </>;
}
function PublicationForm({ initial, draft, onClose }: { initial: Publication | null; draft?: ServiceDraft; onClose: () => void }) {
  const { language } = useLanguage();
  const { area, postingSectorId, catalogs, online, notify } = useApp();
  const [mode, setMode] = useState(initial?.modalidadPrecio || 'cotizar');
  const [categoryId, setCategoryId] = useState(initial?.categoriaId || '');
  const sectorId = initial?.sectorId || postingSectorId;
  const [location, setLocation] = useState<LocationDraft>({ coordinates: initial ? null : area.coordinates, address: '' });
  const [photo, setPhoto] = useState<string | null | undefined>(undefined);
  const [readingPhoto, setReadingPhoto] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    if (initial?.categoriaId || categoryId || !draft?.categoryHint) return;
    const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es');
    const match = catalogs.data?.publicaciones.find(item => normalize(item.nombre) === normalize(draft.categoryHint!));
    if (match) setCategoryId(match.id);
  }, [initial?.categoriaId, categoryId, draft?.categoryHint, catalogs.data?.publicaciones]);
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
      refreshData(); notify(initial ? localize(language,'Publicación actualizada','Listing updated','Willay tikrasqa') : localize(language,'Tu publicación ya está disponible','Your listing is now available','Willayniyki kunanqa rikuchikun')); onClose();
    } catch (cause) { setError(errorMessage(cause)); } finally { setBusy(false); }
  }
  return <Modal title={initial ? localize(language,'Editar publicación','Edit listing','Willayta tikray') : localize(language,'Comparte lo que ofreces','Share what you offer','Imata quyta munasqaykita willay')} onClose={onClose} wide>
    <form className="form-stack" onSubmit={submit}>
      <Field label={localize(language,'¿Qué ofreces?','What are you offering?','¿Imatam quyta munanki?')}><input name="titulo" required minLength={3} maxLength={160} defaultValue={initial?.titulo ?? draft?.title ?? ''} placeholder={localize(language,'Por ejemplo: arreglo de bicicletas','For example: bicycle repair','Hinalla: bicicletata allichay')}/></Field>
      <Field label={localize(language,'Cuéntanos más','Tell us more','Aswan willay')}><textarea name="descripcion" rows={3} maxLength={4000} defaultValue={initial?.descripcion || draft?.description || ''}/></Field>
      <PhotoPicker value={photo} currentUrl={initial?.imagenUrl} onChange={setPhoto} onBusyChange={setReadingPhoto} disabled={busy} label={localize(language,'Foto del producto o servicio','Product or service photo','Rantikuypa utaq yanapakuypa siq’in')}/>
      <div className="form-columns">
        <Field label={localize(language,'Tipo','Type','Rikchay')}><select name="tipo" defaultValue={initial?.tipo || 'servicio'}><option value="servicio">{localize(language,'Servicio','Service','Yanapakuy')}</option><option value="producto">{localize(language,'Producto','Product','Rantikuypa kaqninkuna')}</option></select></Field>
        <Field label={localize(language,'Categoría','Category','Mit’a')}><select name="categoriaId" required value={categoryId} onChange={event => setCategoryId(event.target.value)}><option value="" disabled>{localize(language,'Elige una categoría','Choose a category','Huk mit’ata akllay')}</option>{catalogs.data?.publicaciones.map(item => <option key={item.id} value={item.id}>{item.nombre}</option>)}</select></Field>
      </div>
      <Field label={localize(language,'Precio','Price','Chani')}><select value={mode} onChange={event => setMode(event.target.value as Publication['modalidadPrecio'])}><option value="cotizar">{localize(language,'Consultar precio','Ask for price','Chaninta tapuy')}</option><option value="gratis">{localize(language,'Gratis','Free','Mana qullqiyuq')}</option><option value="fijo">{localize(language,'Precio fijo','Fixed price','Chani takyachisqa')}</option><option value="desde">{localize(language,'Desde un precio','Starting at','Kay chaninmanta qallariy')}</option></select></Field>
      {['fijo', 'desde'].includes(mode) && <Field label={localize(language,'Monto en soles','Amount in soles','Soles qullqi') }><input name="precio" type="number" min={0} max={99999999} step="0.01" required defaultValue={initial?.precio || ''}/></Field>}
      <details className="post-location" open><summary><Icon name="pin" size={18}/>{localize(language,'¿Dónde ofreces este producto o servicio?','Where do you offer this product or service?','¿Maypim kay rantikuyta utaq yanapakuyniykita qunki?')}</summary><p className="form-hint">{initial ? localize(language,'Conservamos el punto actual si no eliges uno nuevo.','We will keep the current point unless you choose a new one.','Musuq kayta mana akllaspaykiqa, kunan kayta waqaychasqayku.') : localize(language,'Elige un punto para aparecer en el mapa. Si lo omites, se usará la ubicación de tu perfil si existe.','Choose a point to appear on the map. If you skip it, your profile location will be used if available.','Mapapi rikurinaykipaq huk kayta akllay. Mana akllaspaykiqa, perfilniykipi kayniyki kaptinqa chayta llamk’achisqayku.')} {localize(language,'Tu dirección exacta es privada y tu perfil no cambia.','Your exact address is private and your profile will not change.','Chiqap wasiyki willayninqa pakasqam, perfilniykipas mana tikrakunchu.')}</p><LocationPicker value={location} onChange={setLocation} online={online} disabled={busy} initialCenter={initial ? mapPoint(initial) : null}/></details>
      {initial && <Field label={localize(language,'Visibilidad','Visibility','Rikuchiy')}><select name="estado" defaultValue={initial.estado}><option value="publicada">{localize(language,'Publicada','Published','Willachisqa')}</option><option value="pausada">{localize(language,'Pausada','Paused','Sayachisqa')}</option><option value="archivada">{localize(language,'Archivada','Archived','Waqaychasqa')}</option><option value="borrador">{localize(language,'Borrador','Draft','Qillqasqa')}</option></select></Field>}
      <RemoteState {...catalogs}/><ErrorBox message={error}/>
      <button className="record-button justify-center" disabled={busy || readingPhoto || !online || !sectorId || !catalogs.data?.publicaciones.length}>{busy ? localize(language,'Guardando…','Saving…','Waqaychachkan…') : readingPhoto ? localize(language,'Preparando foto…','Preparing photo…','Siq’ita wakichichkan…') : initial ? localize(language,'Guardar cambios','Save changes','Tikraykunata waqaychay') : localize(language,'Publicar','Publish','Willachiy')}</button>
    </form>
  </Modal>;
}
function PublicationDetail({id,onClose,onEdit}:{id:string;onClose:()=>void;onEdit:(item:Publication)=>void}) {
  const { language } = useLanguage();
  const {user,notify,online} = useApp();const publication=useRemote<Publication>(`/publicaciones/${id}`,user?.id||'public');const reputation=useRemote<Reputation>(publication.data?`/usuarios/${publication.data.propietarioId}/reputacion`:null);const [error,setError]=useState('');const item=publication.data; const point=item ? mapPoint(item) : null;
  const contactPhone = item?.propietarioId !== user?.id ? item?.telefonoContacto?.replace(/\D/g, '') : null;
  const shareText = item ? `${item.titulo}\n${item.descripcion || ''}\n${price(item, language)}\n${window.location.origin}${window.location.pathname}#cerca/${id}` : '';
  return <Modal title={item?.titulo || localize(language, 'Publicación', 'Listing', 'Willay')} onClose={onClose} wide>
    <RemoteState {...publication} />
    {item && <>
      <span className="category">{localizePublicationCategory(language, item.categoria)}</span>
      {item.imagenUrl && <div className="publication-detail-photo"><PublicationImage src={item.imagenUrl} alt={item.titulo} fallback={<Icon name={item.tipo === 'producto' ? 'store' : 'hands'} size={44} />} /></div>}
      <p className="detail-description">{item.descripcion || localize(language, 'El vecino todavía no agregó una descripción.', 'The neighbor has not added a description yet.', 'Llaqtamasi manaraq willayta yaparqachu.')}</p>
      <p className="text-xl font-bold">{price(item, language)}</p>
      <p className="mt-3 text-sm">{localize(language, 'Ofrece:', 'Offered by:', 'Qoq:')} {item.propietario}</p>
      {item.propietarioId === user?.id && <button type="button" className="outline-btn mt-3" onClick={() => onEdit(item)}>{localize(language, 'Editar mi publicación', 'Edit my listing', 'Willayniyta tikray')}</button>}
      <div className="publication-share-actions" role="group" aria-label={localize(language, 'Acciones de la publicación', 'Listing actions', 'Willaypaq ruwaykuna')}>
        {contactPhone && <a className="whatsapp-btn" href={`https://wa.me/${contactPhone}?text=${encodeURIComponent(`Hola, vi tu publicación en AYNI: ${item.titulo}`)}`} target="_blank" rel="noopener noreferrer"><Icon name="whatsapp" size={20} /><span>{localize(language, 'Contactar por WhatsApp', 'Contact on WhatsApp', 'WhatsApp nisqapi rimay')}</span></a>}
        <a className="outline-btn" href={`https://wa.me/?text=${encodeURIComponent(shareText)}`} target="_blank" rel="noopener noreferrer"><Icon name="share" size={18} /><span>{localize(language, 'Compartir por WhatsApp', 'Share on WhatsApp', 'WhatsApp nisqapi rakiy')}</span></a>
        <button type="button" className="outline-btn" onClick={() => void shareItem(item.titulo, `${item.descripcion || ''}\n${price(item, language)}`, `#cerca/${id}`).then(message => { if (message) notify(message); }).catch(error => { if (error?.name !== 'AbortError') setError(errorMessage(error)); })}><Icon name="share" size={18} /><span>{localize(language, 'Más opciones', 'More options', 'Aswan akllaykuna')}</span></button>
      </div>
      {!contactPhone && <p className="form-hint">{localize(language, 'Este vecino no habilitó un teléfono público. Puedes compartir la publicación, pero no contactar su WhatsApp desde AYNI.', 'This neighbor has not made a phone number public. You can share the listing, but cannot contact them on WhatsApp through AYNI.', 'Kay llaqtamasiqa celularninta manam llapanpaq rikuchirqanchu. Willayta rakiyta atinki, ichaqa AYNI ukhupi WhatsApp nisqapi manam rimayta atinkichu.')}</p>}
      <ErrorBox message={error} />
      {point && <div className="detail-map">
        <h3 className="section-subtitle font-display">{localize(language, 'Ubicación aproximada', 'Approximate location', 'Qaylla kay')}</h3>
        <CommunityMap center={point} pins={[{ id, point, title: item.titulo, label: '1', kind: item.tipo === 'producto' ? 'product' : 'service', symbol: listingSymbol(item, item.tipo === 'producto' ? 'product' : 'service'), category: item.categoria }]} selectedId={id} online={online} compact label={localize(language, 'Zona del producto o servicio', 'Product or service area', 'Rantikuypa utaq yanapakuypa qaylla kaynin')} />
        <p className="form-hint">{localize(language, 'El marcador indica una zona aproximada. Acuerda el punto de encuentro con el vecino.', 'The marker shows an approximate area. Agree on a meeting point with your neighbor.', 'Puntoqa qaylla kayllatam rikuchin. Llaqtamasiwan tinkunapaq kayta rimanakuy.')}</p>
        <a className="text-action" href={googleMapsUrl(point)} target="_blank" rel="noopener noreferrer">{localize(language, 'Abrir zona en Google Maps', 'Open area in Google Maps', 'Google Maps nisqapi kayta kichay')}</a>
      </div>}
      <h3 className="section-subtitle font-display">{localize(language, 'Confianza de este vecino', 'Neighbor trust', 'Llaqtamasiypa allin rimaynin')}</h3>
      <RemoteState {...reputation} />
      {reputation.data && <div className="neighbor-reputation-card"><div className="neighbor-reputation-score"><Icon name="star" size={22} /><b>{reputation.data.promedio ?? '?'}<small>/5</small></b><span>{reputation.data.resenas.length} {localize(language, 'reseñas', 'reviews', 'allin rimaykuna')}</span></div><div className="neighbor-reputation-copy"><b>{reputation.data.vistosBuenos} {localize(language, 'vistos buenos', 'endorsements', 'allin rimaykuna')}</b><p>{reputation.data.colaboracionesConfirmadas} {localize(language, 'aportes confirmados', 'confirmed contributions', 'takyachisqa yanapakuykuna')} {'\u00b7'} {localize(language, 'Rango', 'Rank', 'Rango')} {neighborRank(reputation.data.colaboracionesConfirmadas).name}</p></div></div>}
      <p className="form-hint mt-3">{localize(language, 'La reputación del vecino incluye las colaboraciones confirmadas del muro de ayuda. Las siguientes opiniones corresponden a este producto o servicio.', 'This neighbor's reputation includes confirmed collaborations from the help wall. The reviews below are for this product or service.', 'Llaqtamasiypa allin rimayninqa takyachisqa yanapakuymantam. Kay rantikuymanta utaq yanapakuymanta allin rimaykunatam qipapi qhawanki.')}</p>
      <PublicationReviews publicationId={item.id} ownerId={item.propietarioId}/>
    </>}
  </Modal>;
}
