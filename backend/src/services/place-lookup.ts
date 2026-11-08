import { AppError } from '../lib/http.js';
import type { AddressResult } from './geocoding.js';

type Point = { latitud: number; longitud: number };
const cache = new Map<string, { expires: number; data: AddressResult[] }>();
const pending = new Map<string, Promise<AddressResult[]>>();
let queue: Promise<void> = Promise.resolve();
let availableAt = 0;

function parsePlaces(payload: unknown, reverse: boolean): AddressResult[] {
  if (!payload || typeof payload !== 'object' || !('features' in payload) || !Array.isArray(payload.features)) throw new Error('INVALID_RESPONSE');
  const results: AddressResult[] = [];
  for (const feature of payload.features) {
    const properties = feature?.properties;
    const coordinates = feature?.geometry?.coordinates;
    if (!properties || feature?.geometry?.type !== 'Point' || !Array.isArray(coordinates)) continue;
    const [longitud, latitud] = coordinates;
    if (typeof latitud !== 'number' || typeof longitud !== 'number' || !Number.isFinite(latitud) || !Number.isFinite(longitud) || Math.abs(latitud) > 90 || Math.abs(longitud) > 180) continue;
    if (!reverse && String(properties.countrycode || '').toUpperCase() !== 'PE') continue;
    const text = (key: string) => typeof properties[key] === 'string' ? properties[key].trim() : '';
    const street = [text('street'), text('housenumber')].filter(Boolean).join(' ');
    const name = text('name');
    const first = reverse ? street || name : name && name !== text('street') ? name : street || name;
    const parts = [first, reverse || first === street ? '' : street, text('district'), text('city'), text('county'), text('state'), text('country')].filter(Boolean);
    const seen = new Set<string>();
    const nombre = parts.filter(part => { const key = part.toLocaleLowerCase('es'); if (seen.has(key)) return false; seen.add(key); return true; }).join(', ').slice(0, 255);
    if (!nombre || (!first && !street)) continue;
    const id = `${properties.osm_type || 'place'}:${properties.osm_id || `${latitud},${longitud}`}`;
    if (!results.some(result => result.id === id)) results.push({ id, nombre, latitud, longitud });
  }
  return results.slice(0, 5);
}

async function lookup(key: string, endpoint: URL, reverse: boolean): Promise<AddressResult[]> {
  const saved = cache.get(key);
  if (saved && saved.expires > Date.now()) return saved.data;
  const existing = pending.get(key); if (existing) return existing;
  if (pending.size >= 4) throw new AppError(429, 'PLACE_LOOKUP_BUSY', 'Espera un momento y vuelve a buscar la dirección.');
  const enteredAt = Date.now();
  const task = queue.then(async () => {
    if (Date.now() - enteredAt > 3000) throw new AppError(429, 'PLACE_LOOKUP_BUSY', 'La búsqueda está ocupada. Inténtalo en un momento.');
    const delay = Math.max(0, availableAt - Date.now());
    if (delay) await new Promise(resolve => setTimeout(resolve, delay));
    availableAt = Date.now() + 1000;
    try {
      const response = await fetch(endpoint, { headers: { Accept: 'application/json', 'User-Agent': 'AYNI/1.0 (community address suggestions)' }, signal: AbortSignal.timeout(8000) });
      if (!response.ok) throw new Error('UPSTREAM_UNAVAILABLE');
      const data = parsePlaces(await response.json(), reverse);
      if (cache.size >= 200) cache.delete(cache.keys().next().value!);
      cache.set(key, { expires: Date.now() + 10 * 60_000, data });
      return data;
    } catch {
      throw new AppError(503, 'PLACE_LOOKUP_UNAVAILABLE', 'No pudimos consultar la dirección. Puedes escribir una referencia manualmente.');
    }
  });
  pending.set(key, task);
  queue = task.then(() => undefined, () => undefined);
  try { return await task; } finally { pending.delete(key); }
}

function endpoint(path: string): URL {
  const base = process.env.PLACES_API_URL || 'https://photon.komoot.io/';
  return new URL(path, base.endsWith('/') ? base : `${base}/`);
}
export async function suggestAddresses(q: string, bias?: Point): Promise<AddressResult[]> {
  const url = endpoint('api/');
  url.search = new URLSearchParams({ q, limit: '5', countrycode: 'PE', ...(bias ? { lat: String(bias.latitud), lon: String(bias.longitud) } : {}) }).toString();
  return lookup(`search:${q.trim().toLocaleLowerCase('es')}:${bias?.latitud ?? ''},${bias?.longitud ?? ''}`, url, false);
}
export async function reverseAddress(point: Point): Promise<string | null> {
  const url = endpoint('reverse');
  url.search = new URLSearchParams({ lat: String(point.latitud), lon: String(point.longitud), limit: '1', radius: '0.5' }).toString();
  const results = await lookup(`reverse:${point.latitud},${point.longitud}`, url, true);
  return results[0]?.nombre ?? null;
}
