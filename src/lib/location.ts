import type { Area, Coordinates, LocationDraft, LocationInput, MapLocation, Sector } from '../types';

export const COMMUNITY_CENTER: Coordinates = { latitude: -12.074, longitude: -77.063 };
export function areaQuery(area: Area) {
  const params = new URLSearchParams();
  if (area.coordinates) { params.set('latitud', String(area.coordinates.latitude)); params.set('longitud', String(area.coordinates.longitude)); params.set('radio', String(area.radius)); }
  return params;
}
export function postingSector(profileSectorId: string | null | undefined, sectors: Sector[] | null): string {
  // Legacy associations are required by the database, but never filter map searches.
  return profileSectorId || sectors?.find(sector => sector.nombre === 'Pueblo Libre' && sector.distrito === 'Pueblo Libre')?.id || sectors?.[0]?.id || '';
}
export function mapPoint(value: MapLocation): Coordinates | null {
  if (value.mapaLatitud == null || value.mapaLongitud == null) return null;
  const latitude = Number(value.mapaLatitud), longitude = Number(value.mapaLongitud);
  return Number.isFinite(latitude) && Number.isFinite(longitude) && Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180 ? { latitude, longitude } : null;
}
export function locationInput(value: LocationDraft): LocationInput | undefined {
  return value.coordinates ? { latitud: value.coordinates.latitude, longitud: value.coordinates.longitude, ...(value.address.trim() ? { direccion: value.address.trim() } : {}) } : undefined;
}
export function googleMapsUrl(point: Coordinates) {
  return `https://www.google.com/maps/search/?api=1&query=${point.latitude},${point.longitude}`;
}
