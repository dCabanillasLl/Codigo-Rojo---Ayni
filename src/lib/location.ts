import type { Coordinates, LocationDraft, LocationInput, MapLocation } from '../types';

export const COMMUNITY_CENTER: Coordinates = { latitude: -12.074, longitude: -77.063 };
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
