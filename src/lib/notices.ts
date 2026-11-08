import type { Notice } from '../types';

export function noticeCategory(name: string): { key: string; icon: 'calendar' | 'hands' | 'megaphone' } {
  const normalized = name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLocaleLowerCase('es');
  if (normalized === 'actividades') return { key: 'activities', icon: 'calendar' };
  if (normalized === 'campanas') return { key: 'campaigns', icon: 'hands' };
  if (normalized === 'aviso vecinal') return { key: 'neighborhood', icon: 'megaphone' };
  return { key: 'other', icon: 'megaphone' };
}

type NoticeStatus = { key: string; label: string; icon: 'check' | 'clock' | 'close' | 'calendar' };
export function noticeStatus(item: Pick<Notice, 'estado' | 'fechaEvento' | 'venceEn' | 'revisionEvento' | 'ultimoCambioEvento'>, now = Date.now()): NoticeStatus {
  if (item.estado === 'cancelado') return { key: 'cancelled', label: 'CANCELADO', icon: 'close' };
  if (item.estado === 'borrador') return { key: 'draft', label: 'BORRADOR', icon: 'calendar' };
  if (item.estado === 'vencido' || (item.estado === 'publicado' && !noticeVisible(item, now))) return { key: 'expired', label: 'VENCIDO', icon: 'clock' };
  if (item.estado === 'postergado' || item.ultimoCambioEvento === 'postergado') return { key: 'postponed', label: 'POSTERGADO', icon: 'calendar' };
  if (item.ultimoCambioEvento === 'reprogramado') return { key: 'rescheduled', label: 'REPROGRAMADO', icon: 'calendar' };
  if (item.estado === 'publicado') return Number(item.revisionEvento) > 0 ? { key: 'updated', label: 'ACTUALIZADO', icon: 'calendar' } : { key: 'active', label: 'VIGENTE', icon: 'check' };
  return { key: 'expired', label: 'NO DISPONIBLE', icon: 'close' };
}

export function noticeVisible(item: Pick<Notice, 'estado' | 'fechaEvento' | 'venceEn'>, now = Date.now()): boolean {
  return item.estado === 'publicado' && [item.fechaEvento, item.venceEn].every(value => !value || new Date(value).getTime() > now);
}
export function localDateTimeInput(now = new Date()): string {
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}
