import 'dotenv/config';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import mysql from 'mysql2/promise';
import { migrationChecksums } from './migration-checksums.mjs';

const args = new Set(process.argv.slice(2));
if ([...args].some((arg) => !['--apply', '--baseline'].includes(arg))) {
  throw new Error('Uso: npm run db:migrate -- [--baseline] [--apply]');
}
const files = [
  ...(args.has('--baseline') ? ['000_baseline.sql'] : []),
  '001_colaboraciones_recursos.sql',
  '002_catalogos.sql',
  '003_flyers_whatsapp.sql',
  '004_dni_hash.sql',
  '005_registro_dni_sin_correo.sql',
  '006_fotos_publicaciones.sql',
  '007_fotos_avisos.sql',
  '008_asistencia_avisos_notificaciones.sql',
  '009_estado_cambio_actividad.sql',
];
const sources = await Promise.all(files.map(async (name) => {
  let sql = await readFile(fileURLToPath(new URL(`../migrations/${name}`, import.meta.url)), 'utf8');
  // The supplied baseline selects "ayni". The runner always uses ONLY DB_NAME.
  if (name === '000_baseline.sql') {
    sql = sql.replace(/^CREATE DATABASE IF NOT EXISTS ayni\s+CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;\s*USE ayni;\s*/m, '');
  }
  if (/^\s*(CREATE\s+DATABASE|USE\s)/im.test(sql)) throw new Error('La migración no puede cambiar la base de destino.');
  const canonical = migrationChecksums(sql);
  return { name, sql: canonical.sql, hash: canonical.checksum, compatibleHashes: canonical.compatible };
}));
if (!args.has('--apply')) {
  console.log('Plan de migración (no se ejecutó SQL):');
  for (const source of sources) console.log(`- ${source.name}`);
  console.log('--baseline solo para una base NUEVA y VACÍA. --apply aplica el plan a DB_NAME.');
  process.exit(0);
}

for (const key of ['DB_HOST', 'DB_USER', 'DB_PASSWORD', 'DB_NAME']) {
  if (!process.env[key]) throw new Error(`Falta ${key}; configura backend/.env.`);
}
const tls = process.env.DB_TLS !== 'false';
if (!tls && !['localhost', '127.0.0.1', '::1'].includes(process.env.DB_HOST)) {
  throw new Error('TLS es obligatorio para servidores remotos.');
}
const ca = process.env.DB_SSL_CA ? await readFile(process.env.DB_SSL_CA, 'utf8') : undefined;
const connection = await mysql.createConnection({
  host: process.env.DB_HOST, port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER, password: process.env.DB_PASSWORD, database: process.env.DB_NAME,
  ssl: tls ? { rejectUnauthorized: true, ...(ca ? { ca } : {}) } : undefined,
  multipleStatements: true,
});
let locked = false;
try {
  const [locks] = await connection.execute("SELECT GET_LOCK(CONCAT(DATABASE(), ':ayni-migrations'), 10) AS acquired");
  if (Number(locks[0].acquired) !== 1) throw new Error('Otra migración está en curso.');
  locked = true;
  await connection.query(`CREATE TABLE IF NOT EXISTS ayni_schema_migrations (
    version VARCHAR(100) NOT NULL PRIMARY KEY,
    checksum CHAR(64) NOT NULL,
    estado ENUM('iniciada','completada') NOT NULL,
    aplicado_en TIMESTAMP NULL
  ) ENGINE=InnoDB`);
  for (const source of sources) {
    const [existing] = await connection.execute('SELECT checksum, estado FROM ayni_schema_migrations WHERE version = ?', [source.name]);
    if (existing.length) {
      if (existing[0].estado !== 'completada') throw new Error(`${source.name}: ejecución parcial anterior. Revisar el esquema antes de continuar.`);
      if (!source.compatibleHashes.has(existing[0].checksum)) throw new Error(`${source.name}: el archivo cambió después de aplicarse.`);
      console.log(`Ya aplicada: ${source.name}`);
      continue;
    }
    if (source.name === '000_baseline.sql') {
      const [tables] = await connection.execute("SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME <> 'ayni_schema_migrations'");
      if (tables.length) throw new Error('--baseline requiere una base vacía; no se modificaron las tablas existentes.');
    }
    await connection.execute("INSERT INTO ayni_schema_migrations(version,checksum,estado) VALUES (?,?,'iniciada')", [source.name, source.hash]);
    try {
      await connection.query(source.sql);
    } catch (error) {
      // SQL errors can contain data; report the migration and numeric code only.
      throw new Error(`${source.name}: falló (${error.code || 'ERROR'}). El DDL puede haberse aplicado parcialmente; revisar antes de reintentar.`);
    }
    await connection.execute("UPDATE ayni_schema_migrations SET estado='completada',aplicado_en=CURRENT_TIMESTAMP WHERE version=?", [source.name]);
    console.log(`Aplicada: ${source.name}`);
  }
} finally {
  if (locked) await connection.execute("SELECT RELEASE_LOCK(CONCAT(DATABASE(), ':ayni-migrations'))");
  await connection.end();
}
