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
  '010_ubicacion_publica_actividades.sql',
  '010_vencimiento_solicitudes.sql',
  '011_notificaciones_actividades_eliminadas.sql',
  '011_notificaciones_correo.sql',
  '012_verificacion_correo.sql',
  '013_notificaciones_interacciones.sql',
  '014_resenas_reciprocas.sql',
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
async function completeReciprocalReviewMigration() {
  const hasColumn = async (name) => {
    const [rows] = await connection.execute(`SELECT 1 FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'resenas_colaboracion' AND COLUMN_NAME = ?`, [name]);
    return rows.length > 0;
  };
  const hasIndex = async (name) => {
    const [rows] = await connection.execute(`SELECT 1 FROM information_schema.STATISTICS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'resenas_colaboracion' AND INDEX_NAME = ?`, [name]);
    return rows.length > 0;
  };
  const hasForeignKey = async (name) => {
    const [rows] = await connection.execute(`SELECT 1 FROM information_schema.TABLE_CONSTRAINTS
      WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'resenas_colaboracion'
        AND CONSTRAINT_NAME = ? AND CONSTRAINT_TYPE = 'FOREIGN KEY'`, [name]);
    return rows.length > 0;
  };

  if (!await hasColumn('autor_id') || !await hasColumn('evaluado_id')) {
    const addAutor = !await hasColumn('autor_id');
    const addEvaluado = !await hasColumn('evaluado_id');
    await connection.query(`ALTER TABLE resenas_colaboracion
      ${addAutor ? 'ADD COLUMN autor_id BIGINT UNSIGNED NULL AFTER oferta_id' : ''}
      ${addAutor && addEvaluado ? ',' : ''}
      ${addEvaluado ? `ADD COLUMN evaluado_id BIGINT UNSIGNED NULL ${addAutor ? 'AFTER autor_id' : 'AFTER oferta_id'}` : ''}`);
  }
  await connection.query(`UPDATE resenas_colaboracion r
    JOIN ofertas_ayuda o ON o.oferta_id = r.oferta_id
    JOIN solicitudes_ayuda s ON s.solicitud_id = o.solicitud_id
    SET r.autor_id = s.solicitante_id, r.evaluado_id = o.voluntario_id
    WHERE r.autor_id IS NULL OR r.evaluado_id IS NULL`);
  await connection.query(`ALTER TABLE resenas_colaboracion
    MODIFY COLUMN autor_id BIGINT UNSIGNED NOT NULL,
    MODIFY COLUMN evaluado_id BIGINT UNSIGNED NOT NULL`);

  const oldUnique = await hasIndex('uq_resena_colaboracion_oferta');
  const newUnique = await hasIndex('uq_resena_colaboracion_autor');
  const oldOfferForeignKey = await hasForeignKey('fk_resena_colaboracion_oferta');
  // Add the replacement before detaching the FK from its legacy supporting
  // index. MySQL rejects dropping that index while the FK still depends on it.
  if (!newUnique) {
    await connection.query('ALTER TABLE resenas_colaboracion ADD UNIQUE KEY uq_resena_colaboracion_autor (oferta_id, autor_id)');
  }
  if (!await hasIndex('ix_resena_colaboracion_evaluado')) {
    await connection.query('ALTER TABLE resenas_colaboracion ADD KEY ix_resena_colaboracion_evaluado (evaluado_id, creado_en)');
  }
  if (oldUnique && oldOfferForeignKey) {
    await connection.query('ALTER TABLE resenas_colaboracion DROP FOREIGN KEY fk_resena_colaboracion_oferta');
  }
  if (oldUnique) await connection.query('ALTER TABLE resenas_colaboracion DROP INDEX uq_resena_colaboracion_oferta');
  if (!await hasForeignKey('fk_resena_colaboracion_oferta')) {
    await connection.query(`ALTER TABLE resenas_colaboracion ADD CONSTRAINT fk_resena_colaboracion_oferta FOREIGN KEY (oferta_id)
      REFERENCES ofertas_ayuda (oferta_id) ON UPDATE CASCADE ON DELETE RESTRICT`);
  }
  if (!await hasForeignKey('fk_resena_colaboracion_autor')) {
    await connection.query(`ALTER TABLE resenas_colaboracion ADD CONSTRAINT fk_resena_colaboracion_autor
      FOREIGN KEY (autor_id) REFERENCES usuarios (usuario_id) ON UPDATE CASCADE ON DELETE RESTRICT`);
  }
  if (!await hasForeignKey('fk_resena_colaboracion_evaluado')) {
    await connection.query(`ALTER TABLE resenas_colaboracion ADD CONSTRAINT fk_resena_colaboracion_evaluado
      FOREIGN KEY (evaluado_id) REFERENCES usuarios (usuario_id) ON UPDATE CASCADE ON DELETE RESTRICT`);
  }
}
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
    // The correo preference was applied as 008_notificaciones_correo.sql before
    // parallel-branch migrations occupied that prefix. Reconcile a prior/partial
    // run only when the live column exactly matches the intended definition.
    if (source.name === '011_notificaciones_correo.sql') {
      const [columns] = await connection.execute(`SELECT DATA_TYPE, IS_NULLABLE, COLUMN_DEFAULT
        FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'usuarios' AND COLUMN_NAME = 'notificaciones_correo'`);
      if (columns.length) {
        const column = columns[0];
        if (String(column.DATA_TYPE).toLowerCase() !== 'tinyint' || column.IS_NULLABLE !== 'NO' || Number(column.COLUMN_DEFAULT) !== 0) {
          throw new Error(`${source.name}: la columna notificaciones_correo existe con otra definición; revisar antes de continuar.`);
        }
        if (existing.length) {
          await connection.execute("UPDATE ayni_schema_migrations SET checksum=?, estado='completada', aplicado_en=COALESCE(aplicado_en,CURRENT_TIMESTAMP) WHERE version=?", [source.hash, source.name]);
        } else {
          await connection.execute("INSERT INTO ayni_schema_migrations(version,checksum,estado,aplicado_en) VALUES (?,?,'completada',CURRENT_TIMESTAMP)", [source.name, source.hash]);
        }
        console.log(`Ya aplicada (esquema verificado): ${source.name}`);
        continue;
      }
    }
    if (source.name === '014_resenas_reciprocas.sql' && existing.length && existing[0].estado === 'iniciada') {
      await completeReciprocalReviewMigration();
      await connection.execute("UPDATE ayni_schema_migrations SET checksum=?, estado='completada', aplicado_en=CURRENT_TIMESTAMP WHERE version=?", [source.hash, source.name]);
      console.log(`Recuperada y completada: ${source.name}`);
      continue;
    }
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
