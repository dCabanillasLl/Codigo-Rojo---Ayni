import { useId, useMemo } from 'react';
import { useApp } from './AppContext';
import CommunityMap, { type MapPin } from './components/CommunityMap';
import { distance } from './components/UI';
import { googleMapsUrl, mapPoint } from './lib/location';
import { listingSymbol, mapSymbols, type MapKind } from './lib/map-symbols';
import type { MapLocation, Publication } from './types';
import { localize, localizePublicationCategory, useLanguage } from './lib/language';

type Listing = MapLocation & { id: string; titulo: string; distanciaMetros: number | null; categoria?: string; tipo?: 'producto' | 'servicio'; urgencia?: string; mapKind?: MapKind };
function pointDistanceMeters(first: { latitude: number; longitude: number }, second: { latitude: number; longitude: number }) {
  const radians = Math.PI / 180;
  const dLat = (second.latitude - first.latitude) * radians;
  const dLon = (second.longitude - first.longitude) * radians;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(first.latitude * radians) * Math.cos(second.latitude * radians) * Math.sin(dLon / 2) ** 2;
  return 6371000 * 2 * Math.asin(Math.sqrt(Math.min(1, a)));
}
function isVisibleInRadius(item: Listing, point: { latitude: number; longitude: number } | null, center: { latitude: number; longitude: number } | null, radius: number) {
  if (!point || !center || item.distanciaMetros == null || Number(item.distanciaMetros) > radius) return false;
  // The public map point is approximate; apply the fence to the point people actually see.
  return pointDistanceMeters(center, point) <= radius;
}
export function ListingsMap({ items, selectedId, onSelect, onOpen, title, kind = 'service', filterRadius = true }: {
  items: Listing[]; selectedId?: string; onSelect: (id: string) => void; onOpen: (id: string) => void; title: string; kind?: 'help' | 'service'; filterRadius?: boolean;
}) {
  const { area, online } = useApp();
  const { language } = useLanguage();
  const titleId = useId();
  const pins = useMemo<MapPin[]>(() => items.flatMap((item, index) => {
    const point = mapPoint(item);
    if (filterRadius && !isVisibleInRadius(item, point, area.coordinates, area.radius)) return [];
    const pinKind = item.mapKind || (kind === 'help' ? 'help' : item.tipo === 'producto' ? 'product' : 'service');
    return point ? [{ id: item.id, point, title: item.titulo, label: String(index + 1), kind: pinKind, symbol: listingSymbol(item, pinKind), category: item.categoria }] : [];
  }), [items, kind, filterRadius, area.coordinates, area.radius]);
  const selected = items.find(item => item.id === selectedId);
  const point = selected ? mapPoint(selected) : null;
  const center = area.coordinates || pins[0]?.point;
  return <section className="services-map-panel" aria-labelledby={titleId}>
    <div id={kind === 'service' ? 'services-map-title' : undefined} className="services-map-heading"><div><p className="eyebrow">{localize(language,'EXPLORA CERCA DE TI','EXPLORE NEAR YOU','Qayllaykipi maskay')}</p><h2 id={titleId} className="font-display">{title}</h2></div><span className="map-count">{pins.length} {pins.length === 1 ? localize(language,'punto','point','puntu') : localize(language,'puntos','points','puntu')} {localize(language,'a la vista','visible','rikuchkan')}</span></div>
    <div className="map-overview"><p>{filterRadius && !area.coordinates ? localize(language,'Elige tu ubicación para ver solo los puntos dentro de tu rango.','Choose your location to see points within your radius.','Kayniykita akllay, qayllaykipi kaqkunallata rikunaykipaq.') : localize(language,'Toca un icono para conocer el producto, servicio o pedido.','Select an icon to see the product, service, or request.','Huk siq’ita llamk’achiy, rantikunata, yanapayta utaq mañakuyta qhawanaykipaq.')}</p><ul className="map-kind-legend" aria-label={localize(language,'Tipos de publicaciones en el mapa','Listing types on map','Mapapi willaypa rikchayninkuna')}>{(['product','service','help'] as const).map(value => <li key={value}><span className={`legend-kind ${value}`}>{value === 'product' ? 'P' : value === 'service' ? 'S' : 'A'}</span>{value === 'product' ? localize(language,'Productos','Products','Rantikuna') : value === 'service' ? localize(language,'Servicios','Services','Yanapakuykuna') : localize(language,'Ayuda','Help','Yanapay')}<b>{pins.filter(pin => pin.kind === value).length}</b></li>)}</ul></div>
    <CommunityMap center={center} reference={area.coordinates} pins={pins} selectedId={selectedId} onSelect={onSelect} radius={filterRadius && area.coordinates ? area.radius : undefined} online={online} label={title}/>
    {pins.length > 0 && <ul className="map-symbol-legend" aria-label={localize(language, 'Significado de los iconos', 'Icon meanings', 'Siq\u2019ikunapa ima ninan')}>{[...new Set(pins.map(pin => pin.symbol!))].map(symbol => <li key={symbol}><svg className={`symbol-${symbol}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" dangerouslySetInnerHTML={{ __html: mapSymbols[symbol].paths }}/>{localizePublicationCategory(language, mapSymbols[symbol].label)}</li>)}</ul>}
    {selected && <div className="map-service-details"><div className="map-service-copy"><h3>{selected.titulo}</h3><p>{localizePublicationCategory(language, selected.categoria || '')}{'\u00b7'}{distance(selected.distanciaMetros, localize(language, 'Distancia no disponible', 'Distance unavailable', 'Mana kayniyuq'))}</p><span>{point ? localize(language, 'Zona aproximada \u00b7 la direcci\u00f3n exacta es privada', 'Approximate area \u00b7 the exact address is private', 'Qaylla kay \u00b7 chiqap wasiyki pakasqam') : localize(language, 'Esta publicaci\u00f3n a\u00fan no tiene un punto en el mapa', 'This listing does not have a map point yet', 'Kay willayqa manaraq mapapi kayniyuqchu')}</span></div><div className="action-row"><button type="button" className="map-directions" onClick={() => onOpen(selected.id)}>{localize(language, selected.mapKind === 'help' || kind === 'help' ? 'Ver pedido' : 'Ver detalles', selected.mapKind === 'help' || kind === 'help' ? 'View request' : 'View details', selected.mapKind === 'help' || kind === 'help' ? 'Ma\u00f1akuyta qhaway' : 'Willayta qhaway')}</button>{point && <a className="text-action" href={googleMapsUrl(point)} target="_blank" rel="noopener noreferrer">{localize(language, 'Abrir zona en Google Maps', 'Open area in Google Maps', 'Google Maps nisqapi kayta kichay')}</a>}</div></div>}
    <p className="map-demo-note">{!filterRadius ? localize(language, 'Ves todas tus publicaciones, sin l\u00edmite de distancia. ', 'You see all your listings, without a distance limit. ', 'Llapan willayniykitam qhawanki, mana karu kay akllayniyuq. ') : area.coordinates ? localize(language, `Solo se muestran puntos dentro de ${area.radius / 1000} km; el c\u00edrculo marca el l\u00edmite. `, `Only points within ${area.radius / 1000} km are shown; the circle marks the limit. `, `${area.radius / 1000} km ukhupi kaqkunallam rikuchikun; muyuqa tukuy kayta rikuchin. `) : localize(language, 'No se muestran puntos hasta elegir una ubicaci\u00f3n. ', 'No points are shown until you choose a location. ', 'Kayniykita akllanaykikama manam puntokuna rikuchikunchu. ')}{pins.length < items.length && (!filterRadius || area.coordinates) ? localize(language, `${items.length - pins.length} publicaciones est\u00e1n fuera del rango o no tienen coordenadas. `, `${items.length - pins.length} listings are outside the range or have no coordinates. `, `${items.length - pins.length} willaykunaqa karupi kachkan utaq mana coordenadasniyuqchu. `) : ''}{localize(language, 'Los puntos del mapa son aproximados.', 'Map points are approximate.', 'Mapapi kaqkunaqa qaylla kayllam.')}</p>
  </section>;
}

export default function ServicesMap({ services, selectedId, onSelect, filterRadius = true }: { services: Publication[]; selectedId?: string; onSelect: (id: string) => void; filterRadius?: boolean }) {
  const { area, online } = useApp();
  const { language } = useLanguage();
  const titleId = useId();
  const pins = useMemo<MapPin[]>(() => services.flatMap(item => {
    const point = mapPoint(item);
    if (filterRadius && !isVisibleInRadius(item, point, area.coordinates, area.radius)) return [];
    if (!point) return [];
    const kind = item.tipo === 'producto' ? 'product' : 'service';
    return [{ id: item.id, point, title: item.titulo, label: item.titulo, kind, symbol: listingSymbol(item, kind), category: item.categoria }];
  }), [services, filterRadius, area.coordinates, area.radius]);
  return <section id="services-map-title" className="services-map-panel" aria-labelledby={titleId}>
    <div className="services-map-heading"><div><p className="eyebrow">{localize(language,'EXPLORA CERCA DE TI','EXPLORE NEAR YOU','Qayllaykipi maskay')}</p><h2 id={titleId} className="font-display">{localize(language,'Productos y servicios en el mapa','Products and services on the map','Mapapi rantikuna, yanapakuykuna')}</h2></div><span className="map-count">{pins.length} {pins.length === 1 ? localize(language,'punto','point','puntu') : localize(language,'puntos','points','puntu')} {localize(language,'a la vista','visible','rikuchkan')}</span></div>
    <div className="nearby-map-surface">
    <CommunityMap center={area.coordinates || pins[0]?.point} reference={area.coordinates} pins={pins} selectedId={selectedId} onSelect={onSelect} radius={filterRadius && area.coordinates ? area.radius : undefined} online={online} label={localize(language,'Mapa de productos y servicios cerca de ti','Map of products and services near you','Qayllaykipi rantikuna, yanapakuykuna mapa')} zoomPosition="bottomright"/>
    <div className="nearby-map-legend" aria-label={localize(language,'Leyenda de productos y servicios','Product and service legend','Rantikuna, yanapakuykuna \u00f1awpaq rikuchin')}><span><i className="legend-kind product">P</i>{localize(language,'Productos','Products','Rantikuna')} <b>{pins.filter(pin => pin.kind === 'product').length}</b></span><span><i className="legend-kind service">S</i>{localize(language,'Servicios','Services','Yanapakuykuna')} <b>{pins.filter(pin => pin.kind === 'service').length}</b></span><small>{localize(language,'Zonas aproximadas','Approximate areas','Qaylla kaykuna')}{pins.length < services.length ? ` \u00b7 ${services.length - pins.length} ${localize(language,'sin ubicaci\u00f3n','without location','mana kayniyuq')}` : ''}</small></div>
    </div>
  </section>;
}
