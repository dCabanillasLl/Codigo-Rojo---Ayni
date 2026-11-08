import type { PoolConnection } from 'mysql2/promise';

export type EventSnapshot = { autor_id: string | number; titulo: string; estado: string; fecha_evento: Date | null; vence_en: Date | null; revision_evento: number };
type Change = { titulo?: string; estado?: string; fechaEvento?: string | null; venceEn?: string | null };
const stamp = (value: Date | string | null | undefined) => value == null ? null : new Date(value).getTime();
const dateLabel = (value: Date | string | null) => value ? `${new Intl.DateTimeFormat('es-PE', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Lima' }).format(new Date(value))} (hora de Lima)` : 'sin fecha';

// Called while holding the notice lock, inside the same transaction as its update.
export async function notifyEventChange(connection: PoolConnection, id: string, before: EventSnapshot, change: Change, reason?: string) {
  const date = change.fechaEvento === undefined ? before.fecha_evento : change.fechaEvento;
  const expiry = change.venceEn === undefined ? before.vence_en : change.venceEn;
  const state = change.estado ?? before.estado;
  const changed = stamp(date) !== stamp(before.fecha_evento) || stamp(expiry) !== stamp(before.vence_en) || state !== before.estado;
  if (!changed || (state !== 'publicado' && before.estado !== 'publicado')) return false;
  const revision = Number(before.revision_evento || 0) + 1;
  const explanation = reason || (state === 'publicado' ? 'El organizador actualizó la fecha de la actividad.' : 'El organizador retiró la actividad.');
  const description = state === 'publicado' ? `Nueva fecha: ${dateLabel(date)}. Antes: ${dateLabel(before.fecha_evento)}.${expiry ? ` Disponible hasta ${dateLabel(expiry)}.` : ''}` : 'La actividad fue cancelada o retirada.';
  const text = `${change.titulo ?? before.titulo}: ${description} Motivo: ${explanation}`;
  const previousDate = stamp(before.fecha_evento), nextDate = stamp(date);
  const postponed = previousDate != null && nextDate != null && nextDate > previousDate;
  const changeType = state !== 'publicado' ? (state === 'cancelado' ? 'cancelado' : 'retirado') : postponed ? 'postergado' : 'reprogramado';
  await connection.execute('UPDATE avisos SET revision_evento = ?, motivo_cambio = ?, ultimo_cambio_evento = ? WHERE aviso_id = ?', [revision, explanation, changeType, id]);
  await connection.execute(`INSERT INTO notificaciones_avisos (notificacion_id, usuario_id, aviso_id, revision_evento, texto)
    SELECT UUID(), aa.usuario_id, aa.aviso_id, ?, ? FROM asistencias_avisos aa
    JOIN usuarios u ON u.usuario_id = aa.usuario_id
    WHERE aa.aviso_id = ? AND aa.confirmada = 1 AND aa.usuario_id <> ? AND u.estado_cuenta = 'activo'`, [revision, text, id, before.autor_id]);
  return true;
}
