import mysql, { type PoolConnection, type PoolOptions } from "mysql2/promise";
import { config } from "../config.js";
import { AppError } from "../lib/http.js";

export const pool = mysql.createPool({
  ...config.db,
  waitForConnections: true,
  connectionLimit: 8,
  queueLimit: 50,
  connectTimeout: 10000,
  timezone: "Z",
  supportBigNumbers: true,
  bigNumberStrings: true,
  decimalNumbers: true,
  multipleStatements: false,
} as PoolOptions);

export function ensureDatabase() {
  if (!config.dbConfigured) throw new AppError(503, "DATABASE_NOT_CONFIGURED", "La base de datos todavía no está configurada.");
}

export async function query<T>(sql: string, params: unknown[] = []): Promise<T[]> {
  ensureDatabase();
  const [rows] = await pool.execute(sql, params as never[]);
  return rows as unknown as T[];
}

export async function one<T>(sql: string, params: unknown[] = []): Promise<T | undefined> {
  return (await query<T>(sql, params))[0];
}

export async function transaction<T>(operation: (connection: PoolConnection) => Promise<T>): Promise<T> {
  ensureDatabase();
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const result = await operation(connection);
    await connection.commit();
    return result;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}
