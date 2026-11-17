import { useId, useState } from 'react';
import type { Category } from '../types';
import Icon from './Icon';
import { localize, localizePublicationCategory, useLanguage } from '../lib/language';

type Props = {
  query: string; onQuery: (value: string) => void;
  category: string; onCategory: (value: string) => void; categories: Category[]; categoriesLoading: boolean;
  kind: string; onKind: (value: string) => void; mine: boolean; onMine: (value: boolean) => void;
  radius: number; hasLocation: boolean; onRadius: (value: number) => void; onLocation: () => void;
  onClear: () => void; loading: boolean; resultCount: number | null;
};

export default function NearbyFilters({ query, onQuery, category, onCategory, categories, categoriesLoading, kind, onKind, mine, onMine, radius, hasLocation, onRadius, onLocation, onClear, loading, resultCount }: Props) {
  const { language } = useLanguage();
  const [expanded, setExpanded] = useState(false);
  const panelId = useId();
  const activeCategory = categories.find(item => item.id === category);
  const customRadius = hasLocation && !mine && radius !== 1000;
  const activeCount = Number(Boolean(query.trim())) + Number(Boolean(category)) + Number(Boolean(kind)) + Number(mine) + Number(customRadius);
  const kindOptions = [{ value: '', label: localize(language,'Todo','All','Llapallan'), icon: 'sliders' }, { value: 'producto', label: localize(language,'Productos','Products','Rantikuna'), icon: 'store' }, { value: 'servicio', label: localize(language,'Servicios','Services','Yanapakuykuna'), icon: 'hands' }] as const;

  return <div className="nearby-filter-shell">
    <div className="nearby-filter-search">
      <Icon name="search" size={20}/>
      <input data-tour="tour-search" aria-label={localize(language,'Buscar productos o servicios','Search products or services','Rantikuna utaq yanapakuykunata maskay')} value={query} onChange={event => onQuery(event.target.value)} placeholder={localize(language,'¿Qué estás buscando en tu barrio?','What are you looking for in your neighborhood?','¿Imatam llaqtaykipi maskachkanki?')}/>
      {query && <button type="button" aria-label={localize(language,'Borrar búsqueda','Clear search','Maskasqata pichay')} onClick={() => onQuery('')}><Icon name="close" size={17}/></button>}
    </div>
    <div className="nearby-filter-toolbar">
      <div className="nearby-filter-types" role="group" aria-label={localize(language,'Tipo de publicación','Listing type','Willaypa rikchaynin')}>{kindOptions.map(option => <button key={option.value} type="button" className={`nearby-filter-type nearby-filter-type-${option.value || 'all'}`} aria-pressed={kind === option.value} onClick={() => onKind(option.value)}><Icon name={option.icon} size={17}/><span>{option.label}</span></button>)}</div>
      <button type="button" className="nearby-filter-toggle" aria-expanded={expanded} aria-controls={panelId} aria-label={`${localize(language,expanded ? 'Ocultar' : 'Mostrar',expanded ? 'Hide' : 'Show',expanded ? 'Pakay' : 'Rikuchiy')} ${localize(language,'filtros','filters','akllaykuna')}${activeCount ? `, ${activeCount}` : ''}`} onClick={() => setExpanded(value => !value)}><Icon name="sliders" size={17}/><span className="nearby-filter-toggle-label">{localize(language,'Filtros','Filters','Akllaykuna')}</span>{activeCount > 0 && <b>{activeCount}</b>}</button>
    </div>
    {expanded && <div id={panelId} className="nearby-filter-panel">
      <div className="nearby-filter-panel-heading"><div><h3>{localize(language,'Encuentra lo que necesitas','Find what you need','Necesitasqaykita tariy')}</h3><p>{localize(language,'Los cambios se aplican al mapa y a las tarjetas.','Changes apply to the map and listings.','Tikraykunaqa mapapi, tarjetas nisqapipas rikukun.')}</p></div>{activeCount > 0 && <button type="button" className="nearby-filter-clear" onClick={onClear}>{localize(language,'Limpiar filtros','Clear filters','Akllaykunata pichay')}</button>}</div>
      <fieldset className="nearby-filter-group"><legend>{localize(language,'Categoría','Category','Mit’a')}</legend><div className="nearby-filter-chips"><button type="button" aria-pressed={!category} onClick={() => onCategory('')}>{localize(language,'Todas las categorías','All categories','Llapan mit’akuna')}</button>{categories.map(item => <button key={item.id} type="button" aria-pressed={category === item.id} onClick={() => onCategory(item.id)}>{localizePublicationCategory(language,item.nombre)}</button>)}</div>{categoriesLoading && !categories.length && <p className="form-hint">{localize(language,'Cargando categorías…','Loading categories…','Mit’akuna ñam apamuchkan…')}</p>}</fieldset>
      <div className="nearby-filter-bottom">
        <fieldset className="nearby-filter-group"><legend><Icon name="pin" size={15}/>{localize(language,'Distancia','Distance','Karuy kay')}</legend><div className="nearby-filter-chips">{[1000, 1500, 2000].map(value => <button key={value} type="button" aria-pressed={!mine && hasLocation && radius === value} disabled={mine} onClick={() => { onRadius(value); if (!hasLocation) onLocation(); }}>{value / 1000} km</button>)}</div><p className="nearby-filter-note">{mine ? localize(language,'Tus publicaciones se muestran sin límite de distancia.','Your listings are shown without a distance limit.','Qampa willaykikunaqa mana karu kaywanmi rikuchikun.') : hasLocation ? localize(language,'Alrededor del punto que elegiste.','Around the point you chose.','Akllasqayki kaypa muyuriqninpi.') : localize(language,'Configura tu ubicación para buscar por distancia.','Set your location to search by distance.','Karuy kaywan maskanapaq kayniykita churay.')}</p>{!mine && <button type="button" className="nearby-filter-location" onClick={onLocation}>{hasLocation ? localize(language,'Cambiar punto de búsqueda','Change search point','Maskana kayta tikray') : localize(language,'Elegir mi ubicación','Choose my location','Kayniyta akllay')}<Icon name="arrow" size={14}/></button>}</fieldset>
        <fieldset className="nearby-filter-group"><legend>{localize(language,'¿De quién?','Whose listings?','¿Pipaq willayninkunam?')}</legend><div className="nearby-filter-chips"><button type="button" aria-pressed={!mine} onClick={() => onMine(false)}><Icon name="hands" size={15}/>{localize(language,'Todos los vecinos','All neighbors','Llapan llaqtamasikuna')}</button><button type="button" aria-pressed={mine} onClick={() => onMine(true)}><Icon name="user" size={15}/>{localize(language,'Mis publicaciones','My listings','Ñuqap willayniykuna')}</button></div></fieldset>
      </div>
    </div>}
    {(activeCount > 0 || (hasLocation && !mine)) && <div className="nearby-filter-active" role="group" aria-label={localize(language,'Filtros activos','Active filters','Rurachkan akllaykuna')}>
      {query.trim() && <button type="button" title={query.trim()} aria-label={`${localize(language,'Quitar búsqueda','Remove search','Maskasqata qichuy')}: ${query.trim()}`} onClick={() => onQuery('')}><span>“{query.trim()}”</span><Icon name="close" size={13}/></button>}
      {kind && <button type="button" aria-label={localize(language,'Quitar filtro de tipo','Remove type filter','Rikchay akllayta qichuy')} onClick={() => onKind('')}><span>{kind === 'producto' ? kindOptions[1].label : kindOptions[2].label}</span><Icon name="close" size={13}/></button>}
      {category && <button type="button" aria-label={localize(language,'Quitar filtro de categoría','Remove category filter','Mit’a akllayta qichuy')} onClick={() => onCategory('')}><span>{activeCategory ? localizePublicationCategory(language,activeCategory.nombre) : localize(language,'Categoría seleccionada','Selected category','Akllasqa mit’a')}</span><Icon name="close" size={13}/></button>}
      {mine && <button type="button" aria-label={localize(language,'Quitar filtro de mis publicaciones','Remove my listings filter','Ñuqap willayniykunapaq akllayta qichuy')} onClick={() => onMine(false)}><span>{localize(language,'Mis publicaciones','My listings','Ñuqap willayniykuna')}</span><Icon name="close" size={13}/></button>}
      {!mine && hasLocation && <div className="nearby-radius-options" role="group" aria-label={localize(language,'Distancia de búsqueda','Search distance','Maskana karu kay')}><Icon name="pin" size={15}/>{[1000, 1500, 2000].map(value => <button key={value} type="button" aria-pressed={radius === value} onClick={() => onRadius(value)}>{value / 1000} km</button>)}</div>}
      {activeCount > 0 && <button type="button" className="nearby-filter-reset" onClick={onClear}>{localize(language,'Limpiar todo','Clear all','Llapan pichay')}</button>}
    </div>}
    <div className="nearby-filter-results" role="status" aria-live="polite"><span>{loading ? localize(language,'Buscando publicaciones…','Searching listings…','Willaykunata maskachkan…') : resultCount == null ? localize(language,'Explora productos y servicios de tus vecinos.','Explore your neighbors’ products and services.','Llaqtamasiykikuna rantichkasqankuta, yanapaykunatapas qhaway.') : `${resultCount} ${resultCount === 1 ? localize(language,'publicación en esta vista','listing in this view','kaypi willay') : localize(language,'publicaciones en esta vista','listings in this view','kaypi willaykuna')}`}</span><small>{mine ? localize(language,'Tus publicaciones','Your listings','Qampa willaykikuna') : hasLocation ? `${localize(language,'Radio de','Radius','Muyuriq')} ${radius / 1000} km` : localize(language,'Sin filtro de distancia','No distance filter','Mana karu kay akllayniyuq')}</small></div>
  </div>;
}
