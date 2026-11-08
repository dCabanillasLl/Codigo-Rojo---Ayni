import { useId, useState } from 'react';
import type { Category } from '../types';
import Icon from './Icon';

type Props = {
  query: string; onQuery: (value: string) => void;
  category: string; onCategory: (value: string) => void; categories: Category[]; categoriesLoading: boolean;
  kind: string; onKind: (value: string) => void; mine: boolean; onMine: (value: boolean) => void;
  radius: number; hasLocation: boolean; onRadius: (value: number) => void; onLocation: () => void;
  onClear: () => void; loading: boolean; resultCount: number | null;
};

export default function NearbyFilters({ query, onQuery, category, onCategory, categories, categoriesLoading, kind, onKind, mine, onMine, radius, hasLocation, onRadius, onLocation, onClear, loading, resultCount }: Props) {
  const [expanded, setExpanded] = useState(false);
  const panelId = useId();
  const activeCategory = categories.find(item => item.id === category);
  const customRadius = hasLocation && !mine && radius !== 1000;
  const activeCount = Number(Boolean(query.trim())) + Number(Boolean(category)) + Number(Boolean(kind)) + Number(mine) + Number(customRadius);
  const kindOptions = [{ value: '', label: 'Todo', icon: 'sliders' }, { value: 'producto', label: 'Productos', icon: 'store' }, { value: 'servicio', label: 'Servicios', icon: 'hands' }] as const;

  return <div className="nearby-filter-shell">
    <div className="nearby-filter-search">
      <Icon name="search" size={20}/>
      <input data-tour="tour-search" aria-label="Buscar productos o servicios" value={query} onChange={event => onQuery(event.target.value)} placeholder="¿Qué estás buscando en tu barrio?"/>
      {query && <button type="button" aria-label="Borrar búsqueda" onClick={() => onQuery('')}><Icon name="close" size={17}/></button>}
    </div>
    <div className="nearby-filter-toolbar">
      <div className="nearby-filter-types" role="group" aria-label="Tipo de publicación">{kindOptions.map(option => <button key={option.value} type="button" className={`nearby-filter-type nearby-filter-type-${option.value || 'all'}`} aria-pressed={kind === option.value} onClick={() => onKind(option.value)}><Icon name={option.icon} size={17}/><span>{option.label}</span></button>)}</div>
      <button type="button" className="nearby-filter-toggle" aria-expanded={expanded} aria-controls={panelId} aria-label={`${expanded ? 'Ocultar' : 'Mostrar'} filtros${activeCount ? `, ${activeCount} activos` : ''}`} onClick={() => setExpanded(value => !value)}><Icon name="sliders" size={17}/><span className="nearby-filter-toggle-label">Filtros</span>{activeCount > 0 && <b>{activeCount}</b>}</button>
    </div>
    {expanded && <div id={panelId} className="nearby-filter-panel">
      <div className="nearby-filter-panel-heading"><div><h3>Encuentra lo que necesitas</h3><p>Los cambios se aplican al mapa y a las tarjetas.</p></div>{activeCount > 0 && <button type="button" className="nearby-filter-clear" onClick={onClear}>Limpiar filtros</button>}</div>
      <fieldset className="nearby-filter-group"><legend>Categoría</legend><div className="nearby-filter-chips"><button type="button" aria-pressed={!category} onClick={() => onCategory('')}>Todas las categorías</button>{categories.map(item => <button key={item.id} type="button" aria-pressed={category === item.id} onClick={() => onCategory(item.id)}>{item.nombre}</button>)}</div>{categoriesLoading && !categories.length && <p className="form-hint">Cargando categorías…</p>}</fieldset>
      <div className="nearby-filter-bottom">
        <fieldset className="nearby-filter-group"><legend><Icon name="pin" size={15}/>Distancia</legend><div className="nearby-filter-chips">{[1000, 1500, 2000].map(value => <button key={value} type="button" aria-pressed={!mine && hasLocation && radius === value} disabled={mine} onClick={() => { onRadius(value); if (!hasLocation) onLocation(); }}>{value / 1000} km</button>)}</div><p className="nearby-filter-note">{mine ? 'Tus publicaciones se muestran sin límite de distancia.' : hasLocation ? 'Alrededor del punto que elegiste.' : 'Configura tu ubicación para buscar por distancia.'}</p>{!mine && <button type="button" className="nearby-filter-location" onClick={onLocation}>{hasLocation ? 'Cambiar punto de búsqueda' : 'Elegir mi ubicación'}<Icon name="arrow" size={14}/></button>}</fieldset>
        <fieldset className="nearby-filter-group"><legend>¿De quién?</legend><div className="nearby-filter-chips"><button type="button" aria-pressed={!mine} onClick={() => onMine(false)}><Icon name="hands" size={15}/>Todos los vecinos</button><button type="button" aria-pressed={mine} onClick={() => onMine(true)}><Icon name="user" size={15}/>Mis publicaciones</button></div></fieldset>
      </div>
    </div>}
    {(activeCount > 0 || (hasLocation && !mine)) && <div className="nearby-filter-active" role="group" aria-label="Filtros activos">
      {query.trim() && <button type="button" title={query.trim()} aria-label={`Quitar búsqueda: ${query.trim()}`} onClick={() => onQuery('')}><span>“{query.trim()}”</span><Icon name="close" size={13}/></button>}
      {kind && <button type="button" aria-label="Quitar filtro de tipo" onClick={() => onKind('')}><span>{kind === 'producto' ? 'Productos' : 'Servicios'}</span><Icon name="close" size={13}/></button>}
      {category && <button type="button" aria-label="Quitar filtro de categoría" onClick={() => onCategory('')}><span>{activeCategory?.nombre || 'Categoría seleccionada'}</span><Icon name="close" size={13}/></button>}
      {mine && <button type="button" aria-label="Quitar filtro de mis publicaciones" onClick={() => onMine(false)}><span>Mis publicaciones</span><Icon name="close" size={13}/></button>}
      {!mine && hasLocation && <button type="button" aria-label={customRadius ? 'Restablecer distancia a 1 kilómetro' : 'Cambiar ubicación y distancia'} onClick={() => customRadius ? onRadius(1000) : onLocation()}><Icon name="pin" size={13}/><span>A {radius / 1000} km</span><Icon name={customRadius ? 'close' : 'chevron'} size={13}/></button>}
      {activeCount > 0 && <button type="button" className="nearby-filter-reset" onClick={onClear}>Limpiar todo</button>}
    </div>}
    <div className="nearby-filter-results" role="status" aria-live="polite"><span>{loading ? 'Buscando publicaciones…' : resultCount == null ? 'Explora productos y servicios de tus vecinos.' : `${resultCount} ${resultCount === 1 ? 'publicación en esta vista' : 'publicaciones en esta vista'}`}</span><small>{mine ? 'Tus publicaciones' : hasLocation ? `Radio de ${radius / 1000} km` : 'Sin filtro de distancia'}</small></div>
  </div>;
}
