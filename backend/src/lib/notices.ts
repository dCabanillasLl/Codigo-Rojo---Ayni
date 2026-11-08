import { AppError } from './http.js';

export function noticeAttendanceConfirmed(value: unknown): boolean {
  return value === true || value === 1 || value === '1';
}

export function normalizeNoticeAttendance<T extends { miAsistencia?: unknown }>(item: T): Omit<T, 'miAsistencia'> & { miAsistencia: boolean } {
  return { ...item, miAsistencia: noticeAttendanceConfirmed(item.miAsistencia) };
}

type EventDates = { fechaEvento?: Date | string | null; venceEn?: Date | string | null };
export function noticeExpired(item: EventDates, now = Date.now()): boolean {
  return [item.fechaEvento, item.venceEn].some(value => value != null && new Date(value).getTime() <= now);
}
export const noticeDateSql = '(a.fecha_evento IS NULL OR a.fecha_evento > UTC_TIMESTAMP()) AND (a.vence_en IS NULL OR a.vence_en > UTC_TIMESTAMP())';
export function validateNoticeDates(item: EventDates, requireEvent = false) {
  if (requireEvent && !item.fechaEvento) throw new AppError(400, 'EVENT_DATE_REQUIRED', 'Indica la fecha y hora de la actividad para retirar el aviso automáticamente.');
  if (noticeExpired(item)) throw new AppError(400, 'INVALID_EXPIRY', 'La fecha de la actividad y su vencimiento deben ser futuros.');
}
