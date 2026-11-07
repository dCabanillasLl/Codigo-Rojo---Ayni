import { useId, useMemo } from 'react';
import { useApp } from './AppContext';
import CommunityMap, { type MapPin } from './components/CommunityMap';
import { distance } from './components/UI';
import { googleMapsUrl, mapPoint } from './lib/location';
import { listingSymbol, mapSymbols, type MapKind } from './lib/map-symbols';
import type { MapLocation, Publication } from './types';

type Listing = MapLocation & { id: string; titulo: string; sectorNombre: string; distanciaMetros: number | null; categoria?: string; tipo?: 'producto' | 'servicio'; urgencia?: string; mapKind?: MapKind };
export function ListingsMap({ items, selectedId, onSelect, onOpen, title, kind = 'service', filterRadius = true }: {
  items: Listing[]; selectedId?: string; onSelect: (id: string) => void; onOpen: (id: string) => void; title: string; kind?: 'help' | 'service'; filterRadius?: boolean;
}) {
  const { area, online } = useApp();
  const titleId = useId();
  const pins = useMemo<MapPin[]>(() => items.flatMap((item, index) => {
    const point = mapPoint(item);
    const pinKind = item.mapKind || (kind === 'help' ? 'help' : item.tipo === 'producto' ? 'product' : 'service');
    return point ? [{ id: item.id, point, title: item.titulo, label: String(index + 1), kind: pinKind, symbol: listingSymbol(item, pinKind), category: item.categoria }] : [];
  }), [items, kind]);
  const selected = items.find(item => item.id === selectedId);
  const point = selected ? mapPoint(selected) : null;
  const center = area.coordinates || pins[0]?.point;
  return <section className="services-map-panel" aria-labelledby={titleId}>
    <div id={kind === 'service' ? 'services-map-title' : undefined} className="services-map-heading"><div><p className="eyebrow">EXPLORA TU COMUNIDAD</p><h2 id={titleId} className="font-display">{title}</h2></div><span className="map-count">{pins.length} {pins.length === 1 ? 'punto' : 'puntos'} a la vista</span></div>
    <div className="map-overview"><p>Todos los puntos se muestran juntos. Toca un icono para conocer la publicación.</p><ul className="map-kind-legend" aria-label="Tipos de publicaciones en el mapa">{(['product','service','help'] as const).map(value => <li key={value}><span className={`legend-kind ${value}`}>{value === 'product' ? 'P' : value === 'service' ? 'S' : 'A'}</span>{value === 'product' ? 'Productos' : value === 'service' ? 'Servicios' : 'Ayuda'}<b>{pins.filter(pin => pin.kind === value).length}</b></li>)}</ul></div>
    <CommunityMap center={center} reference={area.coordinates} pins={pins} selectedId={selectedId} onSelect={onSelect} radius={filterRadius && area.coordinates ? area.radius : undefined} online={online} label={title}/>
    {pins.length > 0 && <ul className="map-symbol-legend" aria-label="Significado de los iconos">{[...new Set(pins.map(pin => pin.symbol!))].map(symbol => <li key={symbol}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" dangerouslySetInnerHTML={{ __html: mapSymbols[symbol].paths }}/>{mapSymbols[symbol].label}</li>)}</ul>}
    {selected && <div className="map-service-details"><div className="map-service-copy"><h3>{selected.titulo}</h3><p>{selected.categoria} · {selected.sectorNombre} · {distance(selected.distanciaMetros, 'Distancia no disponible')}</p><span>{point ? 'Zona aproximada · la dirección exacta es privada' : 'Esta publicación aún no tiene un punto en el mapa'}</span></div><div className="action-row"><button type="button" className="map-directions" onClick={() => onOpen(selected.id)}>Ver {selected.mapKind === 'help' || kind === 'help' ? 'pedido' : 'detalles'}</button>{point && <a className="text-action" href={googleMapsUrl(point)} target="_blank" rel="noopener noreferrer">Abrir zona en Google Maps</a>}</div></div>}
    <p className="map-demo-note">{!filterRadius ? 'Ves todas tus publicaciones, sin límite de distancia. ' : area.coordinates ? `El círculo delimita tu búsqueda de ${area.radius / 1000} km. ` : 'Elige tu ubicación para filtrar por distancia. '}{pins.length < items.length ? `${items.length - pins.length} publicaciones todavía no tienen coordenadas. ` : ''}Si varios puntos coinciden, sus iconos se separan y una línea indica su zona de origen. Los puntos son aproximados.</p>
  </section>;
}

export default function ServicesMap({ services, selectedId, onSelect, filterRadius = true }: { services: Publication[]; selectedId?: string; onSelect: (id: string) => void; filterRadius?: boolean }) {
  const { area, online } = useApp();
  const titleId = useId();
  const pins = useMemo<MapPin[]>(() => services.flatMap(item => {
    const point = mapPoint(item);
    if (!point) return [];
    const kind = item.tipo === 'producto' ? 'product' : 'service';
    return [{ id: item.id, point, title: item.titulo, label: item.titulo, kind, symbol: listingSymbol(item, kind), category: item.categoria }];
  }), [services]);
  return <section id="services-map-title" className="services-map-panel" aria-labelledby={titleId}>
    <div className="services-map-heading"><div><p className="eyebrow">EXPLORA TU COMUNIDAD</p><h2 id={titleId} className="font-display">Productos y servicios en el mapa</h2></div><span className="map-count">{pins.length} {pins.length === 1 ? 'punto' : 'puntos'} a la vista</span></div>
    <div className="nearby-map-surface">
    <CommunityMap center={area.coordinates || pins[0]?.point} reference={area.coordinates} pins={pins} selectedId={selectedId} onSelect={onSelect} radius={filterRadius && area.coordinates ? area.radius : undefined} online={online} label="Mapa de productos y servicios cerca de ti" zoomPosition="bottomright"/>
    <div className="nearby-map-legend" aria-label="Leyenda de productos y servicios"><span><i className="legend-kind product">P</i>Productos <b>{pins.filter(pin => pin.kind === 'product').length}</b></span><span><i className="legend-kind service">S</i>Servicios <b>{pins.filter(pin => pin.kind === 'service').length}</b></span><small>Zonas aproximadas{pins.length < services.length ? ` · ${services.length - pins.length} sin ubicación` : ''}</small></div>
    </div>
  </section>;
}
