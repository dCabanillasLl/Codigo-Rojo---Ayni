import type { PoolConnection, ResultSetHeader } from 'mysql2/promise';
import { z } from 'zod';
import { AppError } from '../lib/http.js';

export const idSchema = z.string().regex(/^[1-9]\d{0,19}$/, 'Identificador inválido');
export const uuidSchema = z.string().uuid().transform((id) => id.toLowerCase());
export const listSchema = z.object({
  q: z.string().trim().max(160).optional(),
  sectorId: idSchema.optional(),
  categoriaId: idSchema.optional(),
  urgencia: z.enum(['normal', 'urgente']).optional(),
  mios: z.enum(['0', '1']).optional(),
  participando: z.enum(['0', '1']).optional(),
  latitud: z.coerce.number().min(-90).max(90).optional(),
  longitud: z.coerce.number().min(-180).max(180).optional(),
  radio: z.coerce.number().min(1000).max(2000).default(1000),
}).refine((data) => (data.latitud === undefined) === (data.longitud === undefined), {
  message: 'Comparte ambas coordenadas o selecciona un sector.', path: ['latitud'],
}).refine((data) => !(data.mios === '1' && data.participando === '1'), {
  message: 'Elige tus pedidos o tus aportes, no ambos filtros a la vez.', path: ['participando'],
});
export type ListOptions = z.infer<typeof listSchema>;

export async function rows<T>(connection: PoolConnection, sql: string, params: unknown[] = []): Promise<T[]> {
  const [result] = await connection.execute(sql, params as never[]);
  return result as unknown as T[];
}
export async function row<T>(connection: PoolConnection, sql: string, params: unknown[] = []): Promise<T | undefined> {
  return (await rows<T>(connection, sql, params))[0];
}
export async function insert(connection: PoolConnection, sql: string, params: unknown[]): Promise<string> {
  const [result] = await connection.execute<ResultSetHeader>(sql, params as never[]);
  // mysql2 insertId can lose precision beyond MAX_SAFE_INTEGER. LAST_INSERT_ID is returned as CHAR.
  if (!result.insertId) throw new AppError(500, 'INSERT_FAILED', 'No se pudo guardar el registro.');
  const id = await row<{ id: string }>(connection, 'SELECT CAST(LAST_INSERT_ID() AS CHAR) AS id');
  return id!.id;
}

export async function createLocation(connection: PoolConnection, userId: string, sectorId: string): Promise<string> {
  const sector = await row(connection, 'SELECT sector_id FROM sectores_vecinales WHERE sector_id = ?', [sectorId]);
  if (!sector) throw new AppError(400, 'UNKNOWN_SECTOR', 'Selecciona un sector disponible.');
  // Reuse the chosen sector, never publish or return the private address/coordinates.
  const existing = await row<{ ubicacion_id: string }>(connection,
    'SELECT CAST(l.ubicacion_id AS CHAR) AS ubicacion_id FROM usuarios u JOIN ubicaciones l ON l.ubicacion_id = u.ubicacion_id WHERE u.usuario_id = ? AND l.sector_id = ?',
    [userId, sectorId]);
  if (existing) return existing.ubicacion_id;
  return insert(connection, 'INSERT INTO ubicaciones (sector_id, etiqueta) VALUES (?, ?)', [sectorId, 'Zona del pedido']);
}

export function publicName(alias: string): string {
  // alias is internal, never supplied by the client.
  return `CONCAT(${alias}.nombres, ' ', LEFT(${alias}.apellidos, 1), '.')`;
}

export function geoClause(options: ListOptions, locationAlias = 'l'): {
  select: string; selectParams: unknown[]; where: string[]; whereParams: unknown[]; having: string; havingParams: unknown[];
} {
  const { latitud, longitud, radio } = options;
  if (latitud === undefined || longitud === undefined) {
    return { select: 'NULL AS distanciaMetros', selectParams: [], where: [], whereParams: [], having: '', havingParams: [] };
  }
  const latitudeDelta = radio / 111000;
  const longitudeDelta = Math.min(180, radio / (111000 * Math.max(Math.cos(latitud * Math.PI / 180), 0.00001)));
  const where = [`${locationAlias}.latitud BETWEEN ? AND ?`];
  const whereParams: unknown[] = [Math.max(-90, latitud - latitudeDelta), Math.min(90, latitud + latitudeDelta)];
  if (longitudeDelta < 180) {
    const low = longitud - longitudeDelta;
    const high = longitud + longitudeDelta;
    if (low < -180) {
      where.push(`(${locationAlias}.longitud >= ? OR ${locationAlias}.longitud <= ?)`);
      whereParams.push(low + 360, high);
    } else if (high > 180) {
      where.push(`(${locationAlias}.longitud >= ? OR ${locationAlias}.longitud <= ?)`);
      whereParams.push(low, high - 360);
    } else {
      where.push(`${locationAlias}.longitud BETWEEN ? AND ?`);
      whereParams.push(low, high);
    }
  }
  return {
    select: `6371000 * 2 * ASIN(SQRT(LEAST(1, GREATEST(0, POWER(SIN(RADIANS(${locationAlias}.latitud - ?) / 2), 2) + COS(RADIANS(?)) * COS(RADIANS(${locationAlias}.latitud)) * POWER(SIN(RADIANS(${locationAlias}.longitud - ?) / 2), 2))))) AS distanciaMetros`,
    selectParams: [latitud, latitud, longitud], where, whereParams,
    having: 'HAVING distanciaMetros <= ?', havingParams: [radio],
  };
}

export function approximateDistance<T extends { distanciaMetros?: number | string | null }>(value: T): T {
  return { ...value, distanciaMetros: value.distanciaMetros == null ? null : Math.round(Number(value.distanciaMetros) / 50) * 50 };
}
