import { AppError } from '../lib/http.js';

export type AddressResult = { id: string; nombre: string; latitud: number; longitud: number };
const cache = new Map<string, { expires: number; results: AddressResult[] }>();
let availableAt = 0;

/** Explicit searches only. One upstream request per second across this API process. */
export async function searchAddresses(query: string): Promise<AddressResult[]> {
  const key = query.toLocaleLowerCase('es');
  const saved = cache.get(key);
  if (saved && saved.expires > Date.now()) return saved.results;
  if (Date.now() < availableAt) throw new AppError(429, 'GEOCODING_BUSY', 'Espera un momento y vuelve a buscar la dirección.');
  availableAt = Date.now() + 1100;
  const endpoint = new URL(process.env.GEOCODING_URL || 'https://nominatim.openstreetmap.org/search');
  endpoint.search = new URLSearchParams({ q: query, format: 'jsonv2', limit: '5', countrycodes: 'pe', 'accept-language': 'es' }).toString();
  try {
    const response = await fetch(endpoint, {
      headers: { Accept: 'application/json', 'User-Agent': 'AYNI/1.0 (community map; explicit address search)' },
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) throw new Error('UPSTREAM_UNAVAILABLE');
    const payload: unknown = await response.json();
    if (!Array.isArray(payload)) throw new Error('INVALID_RESPONSE');
    const results = payload.flatMap((item): AddressResult[] => {
      const latitud = Number(item.lat), longitud = Number(item.lon);
      if (!Number.isFinite(latitud) || !Number.isFinite(longitud) || Math.abs(latitud) > 90 || Math.abs(longitud) > 180 || typeof item.display_name !== 'string') return [];
      return [{ id: String(item.place_id), nombre: item.display_name, latitud, longitud }];
    }).slice(0, 5);
    if (cache.size >= 100) cache.delete(cache.keys().next().value!);
    cache.set(key, { expires: Date.now() + 20 * 60_000, results });
    return results;
  } catch {
    throw new AppError(503, 'GEOCODING_UNAVAILABLE', 'No pudimos buscar la dirección. Puedes elegir el punto en el mapa o usar tu GPS.');
  }
}
