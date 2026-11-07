import { createHash } from 'node:crypto';

/** Git on Windows can change LF to CRLF without changing any SQL instruction. */
export function migrationChecksums(sql) {
  const normalized = sql.replace(/\r\n/g, '\n');
  const hash = value => createHash('sha256').update(value).digest('hex');
  return {
    sql: normalized,
    checksum: hash(normalized),
    compatible: new Set([hash(sql), hash(normalized), hash(normalized.replace(/\n/g, '\r\n'))]),
  };
}
