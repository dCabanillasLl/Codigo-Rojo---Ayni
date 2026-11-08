import { Capacitor } from '@capacitor/core';
import type { Notice } from '../types';
import { apiAssetUrl } from './api';
import { googleMapsUrl, mapPoint } from './location';
import { noticeStatus, noticeVisible } from './notices';

export type PreparedNoticeFlyer = { file: File; nativeUri?: string };
const maxFlyerBytes = 5 * 1024 * 1024;

export function supportsDirectWhatsAppFlyer(): boolean {
  return Capacitor.getPlatform() === 'android' && Capacitor.isPluginAvailable('WhatsAppShare') && Capacitor.isPluginAvailable('Filesystem');
}

export function noticePublicUrl(id: string): string | null {
  const configured = import.meta.env.VITE_PUBLIC_APP_URL?.trim();
  if (!configured && Capacitor.isNativePlatform()) return null;
  try {
    const url = new URL(configured || window.location.href);
    const local = /^(localhost|127\.|0\.0\.0\.0|\[::1\]|192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/i.test(url.hostname);
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || local) return null;
    url.search = '';
    url.hash = `avisos/${encodeURIComponent(id)}`;
    return url.href;
  } catch { return null; }
}

export function noticeShareMessage(item: Notice): string {
  const point = mapPoint({ mapaLatitud: item.latitudActividad, mapaLongitud: item.longitudActividad });
  const place = item.direccionActividad?.trim() || (point ? 'el lugar indicado en el mapa' : 'lugar por confirmar');
  const date = item.fechaEvento ? new Date(item.fechaEvento) : null;
  const formatted = date && !Number.isNaN(date.getTime()) ? new Intl.DateTimeFormat('es-PE', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'America/Lima',
  }).format(date) : null;
  const link = noticePublicUrl(item.id);
  return [
    `Mira este AVISO: "${item.titulo}", publicado en AYNI.`,
    '',
    formatted ? `📅 ${noticeVisible(item) ? 'Se realizará el' : 'Fecha de la actividad:'} ${formatted} (hora de Lima).` : '📅 Fecha por confirmar.',
    `📍 En ${place}.`,
    ...(noticeStatus(item).key !== 'active' ? [`Estado: ${noticeStatus(item).label}.`] : []),
    ...(point ? ['', `Ver ubicación: ${googleMapsUrl(point)}`] : []),
    ...(link ? ['', `Ver el aviso${noticeVisible(item) ? ' y confirmar asistencia' : ''} en AYNI: ${link}`] : []),
  ].join('\n');
}

export function supportsNoticeFlyerSharing(): boolean {
  if (Capacitor.isNativePlatform()) return (Capacitor.isPluginAvailable('Share') || supportsDirectWhatsAppFlyer()) && Capacitor.isPluginAvailable('Filesystem');
  return typeof navigator.share === 'function' && typeof navigator.canShare === 'function';
}

function imageFormat(bytes: Uint8Array): { type: string; extension: string } | null {
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return { type: 'image/jpeg', extension: 'jpg' };
  if ([137, 80, 78, 71, 13, 10, 26, 10].every((value, index) => bytes[index] === value)) return { type: 'image/png', extension: 'png' };
  if (String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' && String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP') return { type: 'image/webp', extension: 'webp' };
  return null;
}

async function imageBlob(response: Response): Promise<Blob> {
  if (Number(response.headers.get('content-length')) > maxFlyerBytes) throw new Error('El flyer supera los 5 MB permitidos para compartir.');
  if (!response.body) {
    const blob = await response.blob();
    if (blob.size > maxFlyerBytes) throw new Error('El flyer supera los 5 MB permitidos para compartir.');
    return blob;
  }
  const reader = response.body.getReader();
  const chunks: BlobPart[] = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxFlyerBytes) { await reader.cancel(); throw new Error('El flyer supera los 5 MB permitidos para compartir.'); }
      chunks.push(value);
    }
    return new Blob(chunks);
  } finally { reader.releaseLock(); }
}

export async function prepareNoticeFlyer(item: Notice, userId?: string, signal?: AbortSignal): Promise<PreparedNoticeFlyer> {
  if (!item.imagenUrl) throw new Error('Este aviso no tiene flyer.');
  const source = new URL(apiAssetUrl(item.imagenUrl), window.location.href);
  if (!['https:', 'http:'].includes(source.protocol)) throw new Error('No pudimos abrir el flyer de esta actividad.');
  const internal = item.imagenUrl.startsWith('/api/');
  const response = await fetch(source.href, {
    credentials: internal ? 'include' : 'omit', cache: 'no-store', referrerPolicy: 'no-referrer', signal,
    headers: internal && userId ? { 'X-AYNI-User': userId } : {},
  });
  if (!response.ok) throw new Error('No pudimos cargar el flyer. Puedes reintentar o compartir solo el mensaje.');
  const blob = await imageBlob(response);
  const format = imageFormat(new Uint8Array(await blob.slice(0, 12).arrayBuffer()));
  if (!format) throw new Error('El flyer debe ser una imagen JPG, PNG o WebP. Puedes compartir solo el mensaje.');
  const safeId = item.id.replace(/[^a-zA-Z0-9_-]/g, '') || 'actividad';
  const file = new File([blob], `ayni-aviso-${safeId}.${format.extension}`, { type: format.type });
  if (signal?.aborted) throw new DOMException('Preparación cancelada', 'AbortError');
  if (Capacitor.isNativePlatform()) {
    const { prepareNativeNoticeFile } = await import('./notice-share-native');
    return { file, nativeUri: await prepareNativeNoticeFile(file) };
  }
  return { file };
}

export function canShareNoticeFlyer(flyer: PreparedNoticeFlyer): boolean {
  if (Capacitor.isNativePlatform()) return Boolean(flyer.nativeUri) && supportsNoticeFlyerSharing();
  try { return typeof navigator.share === 'function' && typeof navigator.canShare === 'function' && navigator.canShare({ files: [flyer.file] }); } catch { return false; }
}

export function shareCancelled(error: unknown): boolean {
  return error instanceof Error && (error.name === 'AbortError' || /^(share cancel[le]+d|user cancel[le]+d)/i.test(error.message));
}

export function openNoticeWhatsApp(text: string): void {
  window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener,noreferrer');
}

export async function shareNoticeTogether(text: string, flyer: PreparedNoticeFlyer): Promise<void> {
  if (!supportsDirectWhatsAppFlyer() || !flyer.nativeUri) throw new Error('Compartir mensaje y flyer directamente requiere la app Android actualizada.');
  const { shareNativeNoticeTogether } = await import('./notice-share-native');
  await shareNativeNoticeTogether(text, flyer.nativeUri);
}

export async function shareNoticeFlyer(title: string, flyer: PreparedNoticeFlyer): Promise<void> {
  if (Capacitor.isNativePlatform() && Capacitor.isPluginAvailable('Share')) {
    if (!flyer.nativeUri) throw new Error('No pudimos preparar la imagen para compartir.');
    const { Share } = await import('@capacitor/share');
    await Share.share({ title, files: [flyer.nativeUri], dialogTitle: 'Compartir flyer de AYNI' });
    return;
  }
  // The file is prepared before this click; no fetch consumes the user activation.
  if (!canShareNoticeFlyer(flyer)) throw new Error('Este dispositivo no permite compartir el flyer como imagen.');
  await navigator.share({ title, files: [flyer.file] });
}
