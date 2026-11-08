import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { Coordinates } from '../types';
import { COMMUNITY_CENTER } from '../lib/location';
import { spreadMapPoints } from '../lib/map-layout';
import { kindLabels, markerHtml, mapSymbols, type MapKind, type MapSymbol } from '../lib/map-symbols';

export type MapPin = { id: string; point: Coordinates; title: string; label: string; kind?: MapKind; symbol?: MapSymbol; category?: string };
type Props = {
  center?: Coordinates | null; reference?: Coordinates | null; pins?: MapPin[]; selectedId?: string;
  onSelect?: (id: string) => void; onPick?: (point: Coordinates) => void; onPickStart?: () => void;
  picked?: Coordinates | null; radius?: number; accuracy?: number | null;
  online: boolean; label: string; compact?: boolean; fitAll?: boolean; zoomPosition?: L.ControlPosition;
};

export default function CommunityMap({ center, reference, pins = [], selectedId, onSelect, onPick, onPickStart, picked, radius, accuracy, online, label, compact, fitAll = true, zoomPosition = 'topleft' }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const tiles = useRef<L.TileLayer | null>(null);
  const layers = useRef<L.LayerGroup | null>(null);
  const callbacks = useRef({ onPick, onSelect, onPickStart }); callbacks.current = { onPick, onSelect, onPickStart };
  const initialCenter = useRef(center || picked || COMMUNITY_CENTER);
  const fitView = useRef<() => void>(() => undefined);
  const geometryKey = pins.map(pin => `${pin.id}:${pin.point.latitude},${pin.point.longitude}`).sort().join('|');
  const sharedPoints = new Map<string, number>();
  pins.forEach(pin => { const key = `${pin.point.latitude},${pin.point.longitude}`; sharedPoints.set(key, (sharedPoints.get(key) || 0) + 1); });
  const sharedCount = Math.max(0, ...sharedPoints.values());
  const [tileError, setTileError] = useState(false);
  const editable = Boolean(onPick);

  fitView.current = () => {
    const instance = map.current; if (!instance) return;
    if (!instance.getSize().x || !instance.getSize().y) return;
    const origin = picked || reference;
    if (!fitAll) {
      const point = picked || center || COMMUNITY_CENTER;
      instance.panTo([point.latitude, point.longitude], { animate: false }); return;
    }
    const bounds = L.latLngBounds(pins.map(pin => [pin.point.latitude, pin.point.longitude] as L.LatLngTuple));
    if (origin) {
      bounds.extend([origin.latitude, origin.longitude]);
      if (radius) bounds.extend(L.latLng(origin.latitude, origin.longitude).toBounds(radius * 2));
    }
    if (!bounds.isValid()) { const point = center || COMMUNITY_CENTER; instance.setView([point.latitude, point.longitude], 14); return; }
    const layout = spreadMapPoints(pins.map(pin => ({ id: pin.id, ...instance.latLngToContainerPoint([pin.point.latitude, pin.point.longitude]) })));
    const extraX = Math.max(0, ...layout.map(point => Math.abs(point.x - point.anchorX)));
    const extraY = Math.max(0, ...layout.map(point => Math.abs(point.y - point.anchorY)));
    const size = instance.getSize();
    instance.fitBounds(bounds, { padding: [Math.min(size.x / 3, 48 + extraX), Math.min(size.y / 3, 60 + extraY)], maxZoom: 16, animate: false });
  };

  useEffect(() => {
    if (!host.current || !online) return;
    const start = initialCenter.current;
    const instance = L.map(host.current, {
      scrollWheelZoom: false, keyboard: true, zoomControl: true,
      touchZoom: true, dragging: true, bounceAtZoomLimits: false,
    })
      .setView([start.latitude, start.longitude], compact ? 15 : 14);
    map.current = instance;
    instance.zoomControl.setPosition(zoomPosition);
    tiles.current = L.tileLayer(import.meta.env.VITE_MAP_TILE_URL || 'https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: import.meta.env.VITE_MAP_ATTRIBUTION || '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(instance);
    tiles.current.on('tileerror', () => setTileError(true));
    layers.current = L.layerGroup().addTo(instance);
    instance.on('click', (event: L.LeafletMouseEvent) => callbacks.current.onPick?.({ latitude: event.latlng.lat, longitude: event.latlng.lng }));
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Enter' && event.target === host.current && callbacks.current.onPick) {
        event.preventDefault(); const point = instance.getCenter();
        callbacks.current.onPick({ latitude: point.lat, longitude: point.lng });
      }
    };
    const container = host.current;
    container.addEventListener('keydown', keydown);
    const observer = new ResizeObserver(() => { instance.invalidateSize({ pan: false }); fitView.current(); });
    observer.observe(container);
    return () => { observer.disconnect(); container.removeEventListener('keydown', keydown); instance.remove(); map.current = null; layers.current = null; tiles.current = null; };
  }, [online, compact, zoomPosition]);

  // Keep the editable marker outside the layers redrawn when the map pans.
  // Leaflet can then auto-pan during a drag without replacing the active pin.
  useEffect(() => {
    const instance = map.current;
    if (!instance || !editable) return;
    const point = picked || center || COMMUNITY_CENTER;
    const icon = L.divIcon({
      className: 'location-drag-pin',
      html: '<svg viewBox="0 0 40 52" aria-hidden="true"><path d="M20 50C17 45 2 30 2 20a18 18 0 1 1 36 0c0 10-15 25-18 30Z" fill="currentColor" stroke="#fffef9" stroke-width="3"/><circle cx="20" cy="20" r="6" fill="#fffef9"/></svg>',
      iconSize: [40, 52], iconAnchor: [20, 50], tooltipAnchor: [0, -44],
    });
    const marker = L.marker([point.latitude, point.longitude], {
      icon, draggable: true, autoPan: true, keyboard: true, bubblingMouseEvents: false,
      title: 'Arrastra el pin para elegir tu ubicación', alt: 'Ubicación ajustable: arrastra el pin o elige un punto con el teclado', zIndexOffset: 1000,
    }).bindTooltip(picked ? 'Arrastra para ajustar la ubicación' : 'Arrastra para elegir la ubicación').addTo(instance);
    marker.on('dragstart', () => { callbacks.current.onPickStart?.(); marker.closeTooltip(); marker.getElement()?.classList.add('is-dragging'); });
    marker.on('dragend', () => {
      marker.getElement()?.classList.remove('is-dragging');
      const position = marker.getLatLng();
      callbacks.current.onPick?.({ latitude: position.lat, longitude: position.lng });
    });
    return () => { marker.remove(); };
  }, [online, compact, zoomPosition, editable, picked?.latitude, picked?.longitude, center?.latitude, center?.longitude]);

  useEffect(() => {
    if (!map.current || !layers.current) return;
    const instance = map.current, group = layers.current;
    function draw() {
    group.clearLayers();
    const origin = picked || reference;
    if (origin) {
      const latlng: L.LatLngExpression = [origin.latitude, origin.longitude];
      if (radius) L.circle(latlng, { radius, color: '#39765d', fillOpacity: 0.06, weight: 1.5, dashArray: '6 7', interactive: false }).addTo(group);
      if (picked && accuracy) L.circle(latlng, { radius: accuracy, color: '#367fc0', fillOpacity: 0.08, weight: 1, interactive: false }).addTo(group);
      if (!editable) L.circleMarker(latlng, { radius: 8, color: '#fff', weight: 3, fillColor: '#2879c7', fillOpacity: 1 })
        .bindTooltip(picked ? 'Punto elegido' : 'Tu punto de búsqueda').addTo(group);
    }
    const layout = spreadMapPoints(pins.map(pin => ({ id: pin.id, ...instance.latLngToContainerPoint([pin.point.latitude, pin.point.longitude]) })));
    const pinById = new Map(pins.map(pin => [pin.id, pin]));
    layout.forEach(position => {
      const pin = pinById.get(position.id)!;
      let displayPoint = instance.containerPointToLatLng([position.x, position.y]);
      let displaced = position.displaced;
      const anchorPoint = L.latLng(pin.point.latitude, pin.point.longitude);
      // Keep spread-out pins inside the same radius fence as their real map point.
      if (radius && origin && L.latLng(origin.latitude, origin.longitude).distanceTo(displayPoint) > radius) {
        displayPoint = anchorPoint;
        displaced = false;
      }
      const selected = pin.id === selectedId;
      const kind = pin.kind || 'service', symbol = pin.symbol || kind;
      if (displaced) {
        L.polyline([[pin.point.latitude, pin.point.longitude], displayPoint], { color: '#687c70', weight: 1.5, opacity: 0.65, dashArray: '3 4', interactive: false }).addTo(group);
        L.circleMarker([pin.point.latitude, pin.point.longitude], { radius: 3, color: '#fff', fillColor: '#687c70', fillOpacity: 1, weight: 1, interactive: false }).addTo(group);
      }
      const icon = L.divIcon({ className: `community-pin ${kind}-pin symbol-${symbol} ${symbol === 'urgent' ? 'urgent-pin' : ''} ${selected ? 'is-selected' : ''}`, html: markerHtml(kind, symbol), iconSize: [40, 46], iconAnchor: [20, 43] });
      const name = `${kindLabels[kind]} · ${pin.category || mapSymbols[symbol].label}: ${pin.title}`;
      const marker = L.marker(displayPoint, { icon, title: name, alt: name, keyboard: true, riseOnHover: true, zIndexOffset: selected ? 500 : 0 });
      const text = document.createElement('span'); text.textContent = name;
      marker.bindTooltip(text).on('click', (event: L.LeafletMouseEvent) => { L.DomEvent.stopPropagation(event); callbacks.current.onSelect?.(pin.id); }).addTo(group);
      if (selected) L.circle([pin.point.latitude, pin.point.longitude], { radius: 150, color: kind === 'help' ? '#bd6946' : '#39765d', fillOpacity: 0.1, weight: 1, interactive: false }).addTo(group);
    });
    }
    draw();
    instance.on('zoomend moveend', draw);
    return () => { instance.off('zoomend moveend', draw); };
  }, [online, reference, picked, pins, selectedId, radius, accuracy, editable]);

  useEffect(() => {
    fitView.current();
  }, [online, geometryKey, center?.latitude, center?.longitude, reference?.latitude, reference?.longitude, picked?.latitude, picked?.longitude, radius, fitAll]);

  if (!online) return <p className="map-offline" role="status">El mapa necesita internet. Tus publicaciones y pedidos guardados siguen disponibles.</p>;
  return <div className={`community-map-wrap ${compact ? 'compact-map' : ''}`}>
    <div ref={host} className="community-map" style={fitAll && sharedCount > 25 ? { minHeight: Math.ceil(Math.sqrt(sharedCount)) * 50 + 100 } : undefined} role="region" aria-label={label} tabIndex={0}/>
    {!fitAll && <button type="button" className="map-recenter" onClick={() => fitView.current()}>Centrar punto</button>}
    {tileError && <div className="map-tile-error" role="status">No se pudieron cargar algunas calles. <button type="button" onClick={() => { setTileError(false); tiles.current?.redraw(); }}>Reintentar mapa</button></div>}
  </div>;
}
