import type { Notice } from '../types';

export function noticeVisible(item: Pick<Notice, 'estado' | 'fechaEvento' | 'venceEn'>, now = Date.now()): boolean {
  return item.estado === 'publicado' && [item.fechaEvento, item.venceEn].every(value => !value || new Date(value).getTime() > now);
}
export function localDateTimeInput(now = new Date()): string {
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}
