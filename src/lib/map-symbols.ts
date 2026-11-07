export type MapKind = 'product' | 'service' | 'help';
export const mapSymbols = {
  product: { label: 'Producto', paths: '<path d="m12 3 9 4.5v9L12 21l-9-4.5v-9Z"/><path d="m3 7.5 9 4.5 9-4.5M12 12v9"/>' },
  service: { label: 'Servicio', paths: '<rect x="3" y="7" width="18" height="14" rx="3"/><path d="M8 7V4h8v3M3 12a23 23 0 0 0 18 0M10 13h4"/>' },
  help: { label: 'Ayuda vecinal', paths: '<path d="M4 13h4l3-3a2 2 0 0 1 3 3l-2 2h4l3-3a2 2 0 0 1 3 2l-5 6H9l-5-3M2 11h3v10H2"/><path d="M9 5a3 3 0 0 1 5-2 3 3 0 0 1 5 2c0 3-5 5-5 5s-5-2-5-5Z"/>' },
  food: { label: 'Alimentos', paths: '<path d="M5 3v6a3 3 0 0 0 6 0V3M8 3v18M18 3c-4 3-4 9 0 9h2M20 3v18"/>' },
  repair: { label: 'Reparaciones y herramientas', paths: '<path d="M14 6a6 6 0 0 1 7-3l-4 4 1 3 3 1 3-3a6 6 0 0 1-8 6l-7 7a3 3 0 0 1-4-4l7-7a6 6 0 0 1 2-4Z" transform="translate(-2 0)"/>' },
  home: { label: 'Hogar', paths: '<path d="m3 11 9-8 9 8M5 10v11h14V10M9 21v-7h6v7"/>' },
  learning: { label: 'Clases y aprendizaje', paths: '<path d="M12 5C8 2 4 3 2 4v15c3-2 7-2 10 0 3-2 7-2 10 0V4c-2-1-6-2-10 1Zm0 0v14M5 8h4M15 8h4M5 12h4M15 12h4"/>' },
  donation: { label: 'Donación', paths: '<rect x="3" y="8" width="18" height="4" rx="1"/><path d="M5 12v9h14v-9M12 8v13M12 8H8a3 3 0 1 1 3-3l1 3Zm0 0h4a3 3 0 1 0-3-3l-1 3Z"/>' },
  exchange: { label: 'Préstamo o intercambio', paths: '<path d="M4 7h16l-4-4M20 17H4l4 4M20 7l-4 4M4 17l4-4"/>' },
  urgent: { label: 'Ayuda urgente', paths: '<path d="m12 3 10 18H2L12 3ZM12 9v5M12 17h.01"/>' },
  bicycle: { label: 'Bicicletas', paths: '<circle cx="5" cy="16" r="4"/><circle cx="19" cy="16" r="4"/><path d="m5 16 5-9 5 9H5l6-6M8 7h4M16 4h3l2 7"/>' },
  technology: { label: 'Tecnología', paths: '<rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4M6 7h4M6 11h7"/>' },
  animals: { label: 'Mascotas', paths: '<ellipse cx="5" cy="8" rx="2" ry="3"/><ellipse cx="10" cy="5" rx="2" ry="3"/><ellipse cx="16" cy="5" rx="2" ry="3"/><ellipse cx="21" cy="9" rx="2" ry="3"/><path d="M7 15c3-6 8-6 11 0 4 7-1 7-5 5-4 2-10 2-6-5Z"/>' },
};
export type MapSymbol = keyof typeof mapSymbols;
const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
export function listingSymbol(item: { categoria?: string; titulo?: string; urgencia?: string }, kind: MapKind): MapSymbol {
  if (kind === 'help' && (item.urgencia === 'urgente' || normalize(item.categoria || '').includes('urgente'))) return 'urgent';
  const topic = normalize(`${item.categoria || ''} ${item.titulo || ''}`);
  if (/\b(bicicleta\w*|bici\w*|ciclismo)\b/.test(topic)) return 'bicycle';
  if (/\b(mascota\w*|perro\w*|gato\w*|veterinari\w*)\b/.test(topic)) return 'animals';
  if (/\b(alimento\w*|comida\w*|pan|panes|arroz|cocina\w*|desayuno\w*)\b/.test(topic)) return 'food';
  if (/\b(reparaci\w*|herramienta\w*|gasfiter\w*|escalera\w*|taladro\w*|carpinter\w*|electricista\w*)\b/.test(topic)) return 'repair';
  if (/\b(clase\w*|aprendiz\w*|ensen\w*|profesor\w*|matematica\w*|libro\w*)\b/.test(topic)) return 'learning';
  if (/\b(tecnologia|computador\w*|laptop\w*|celular\w*)\b/.test(topic)) return 'technology';
  if (/\b(hogar|mueble\w*|limpieza)\b/.test(topic)) return 'home';
  if (/\b(donacion\w*|donar|regalo\w*)\b/.test(topic)) return 'donation';
  if (/\b(prestamo\w*|intercambio\w*)\b/.test(topic)) return 'exchange';
  return kind;
}
export const kindLabels: Record<MapKind, string> = { product: 'Producto', service: 'Servicio', help: 'Ayuda' };
export function markerHtml(kind: MapKind, symbol: MapSymbol): string {
  // Only closed, local SVG definitions enter Leaflet's HTML. Titles use textContent.
  return `<span class="map-marker-face"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${mapSymbols[symbol].paths}</svg></span><span class="map-marker-kind" aria-hidden="true">${kind === 'product' ? 'P' : kind === 'service' ? 'S' : 'A'}</span>`;
}
