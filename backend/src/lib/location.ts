import type { PoolConnection, ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { AppError } from "./http.js";
import type { ListFilters } from "./validation.js";

/** Reuses the user's own location only if it belongs to the requested sector. */
export async function resolveLocation(connection: PoolConnection, userId: string, sectorId: string): Promise<string> {
  const [sectors] = await connection.execute<RowDataPacket[]>("SELECT sector_id FROM sectores_vecinales WHERE sector_id = ?", [sectorId]);
  if (!sectors.length) throw new AppError(400, "INVALID_SECTOR", "Elige un sector existente.");
  const [locations] = await connection.execute<RowDataPacket[]>(
    "SELECT l.ubicacion_id FROM usuarios u JOIN ubicaciones l ON l.ubicacion_id = u.ubicacion_id WHERE u.usuario_id = ? AND l.sector_id = ?",
    [userId, sectorId],
  );
  if (locations.length) return String(locations[0].ubicacion_id);
  const [inserted] = await connection.execute<ResultSetHeader>("INSERT INTO ubicaciones (sector_id, etiqueta) VALUES (?, 'Sector elegido')", [sectorId]);
  return String(inserted.insertId);
}

/** SQL fragment uses only the fixed location alias l, never a client-supplied column. */
export function geoFilter(filters: ListFilters) {
  if (filters.latitud === undefined || filters.longitud === undefined) {
    return { select: "NULL AS distanciaMetros", selectParams: [] as number[], conditions: [] as string[], params: [] as number[] };
  }
  const latDelta = filters.radio / 111_195;
  const cos = Math.abs(Math.cos(filters.latitud * Math.PI / 180));
  const lonDelta = cos < 0.00001 ? 180 : Math.min(180, filters.radio / (111_195 * cos));
  const expression = "(6371000 * 2 * ASIN(SQRT(LEAST(1, POW(SIN(RADIANS(l.latitud - ?) / 2), 2) + COS(RADIANS(?)) * COS(RADIANS(l.latitud)) * POW(SIN(RADIANS(l.longitud - ?) / 2), 2)))))";
  const distanceParams = [filters.latitud, filters.latitud, filters.longitud];
  const conditions = ["l.latitud IS NOT NULL", "l.latitud BETWEEN ? AND ?"];
  const params = [Math.max(-90, filters.latitud - latDelta), Math.min(90, filters.latitud + latDelta)];
  const low = filters.longitud - lonDelta;
  const high = filters.longitud + lonDelta;
  if (lonDelta < 180) {
    if (low < -180) { conditions.push("(l.longitud >= ? OR l.longitud <= ?)"); params.push(low + 360, high); }
    else if (high > 180) { conditions.push("(l.longitud >= ? OR l.longitud <= ?)"); params.push(low, high - 360); }
    else { conditions.push("l.longitud BETWEEN ? AND ?"); params.push(low, high); }
  }
  conditions.push(`${expression} <= ?`);
  params.push(...distanceParams, filters.radio);
  return { select: `ROUND(${expression} / 50) * 50 AS distanciaMetros`, selectParams: distanceParams, conditions, params };
}
