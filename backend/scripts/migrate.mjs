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
  '015_visto_bueno_verificado.sql',
  '016_revision_identidad_zona.sql',
  '017_ciclo_interacciones_publicacion.sql',
  '018_estado_recomendaciones.sql',
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

// Migration 015 can be resumed after MySQL's implicit DDL commits. Keep this
// idempotent repair path limited to that migration and only to missing schema objects.
async function completeVerifiedRecommendationMigration() {
  const hasTable = async (name) => {
    const [rows] = await connection.execute(`SELECT 1 FROM information_schema.TABLES
      WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=? AND TABLE_TYPE='BASE TABLE'`, [name]);
    return rows.length > 0;
  };
  const hasColumn = async (table, name) => {
    const [rows] = await connection.execute(`SELECT 1 FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=? AND COLUMN_NAME=?`, [table, name]);
    return rows.length > 0;
  };
  const hasIndex = async (table, name) => {
    const [rows] = await connection.execute(`SELECT 1 FROM information_schema.STATISTICS
      WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=? AND INDEX_NAME=?`, [table, name]);
    return rows.length > 0;
  };
  const hasConstraint = async (table, name, type) => {
    const [rows] = await connection.execute(`SELECT 1 FROM information_schema.TABLE_CONSTRAINTS
      WHERE CONSTRAINT_SCHEMA=DATABASE() AND TABLE_NAME=? AND CONSTRAINT_NAME=? AND CONSTRAINT_TYPE=?`, [table, name, type]);
    return rows.length > 0;
  };
  const hasTrigger = async (name) => {
    const [rows] = await connection.execute(`SELECT 1 FROM information_schema.TRIGGERS
      WHERE TRIGGER_SCHEMA=DATABASE() AND TRIGGER_NAME=?`, [name]);
    return rows.length > 0;
  };

  if (!await hasTable('verificaciones_identidad')) {
    await connection.query(`CREATE TABLE verificaciones_identidad (
      verificacion_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      usuario_id BIGINT UNSIGNED NOT NULL,
      estado ENUM('PENDIENTE','VERIFICADA','RECHAZADA','REVOCADA') NOT NULL DEFAULT 'PENDIENTE',
      metodo VARCHAR(80) NOT NULL,
      verificada_en DATETIME(3) NULL,
      revocada_en DATETIME(3) NULL,
      creado_en TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      actualizado_en TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
      PRIMARY KEY (verificacion_id), UNIQUE KEY uq_verificacion_identidad_usuario (usuario_id),
      KEY ix_verificacion_identidad_estado_fecha (estado, verificada_en),
      CONSTRAINT fk_verificacion_identidad_usuario FOREIGN KEY (usuario_id)
        REFERENCES usuarios (usuario_id) ON UPDATE CASCADE ON DELETE CASCADE,
      CONSTRAINT chk_verificacion_identidad_fechas CHECK (
        (estado='VERIFICADA' AND verificada_en IS NOT NULL AND revocada_en IS NULL) OR
        (estado='REVOCADA' AND verificada_en IS NOT NULL AND revocada_en IS NOT NULL AND revocada_en >= verificada_en) OR
        (estado IN ('PENDIENTE','RECHAZADA') AND verificada_en IS NULL AND revocada_en IS NULL)
      )
    ) ENGINE=InnoDB`);
  }
  const [identityColumns] = await connection.execute(`SELECT COUNT(*) AS total FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='verificaciones_identidad'
      AND COLUMN_NAME IN ('verificacion_id','usuario_id','estado','metodo','verificada_en','revocada_en')`);
  if (Number(identityColumns[0].total) !== 6) throw new Error('015: verificaciones_identidad existe con una estructura distinta; revisar sin modificarla.');
  await connection.query(`INSERT INTO verificaciones_identidad (usuario_id,estado,metodo)
    SELECT u.usuario_id,'PENDIENTE','SIN_HISTORIAL_DE_VALIDACION' FROM usuarios u
    WHERE NOT EXISTS (SELECT 1 FROM verificaciones_identidad v WHERE v.usuario_id=u.usuario_id)`);

  if (!await hasTable('pertenencias_zona')) {
    await connection.query(`CREATE TABLE pertenencias_zona (
      pertenencia_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      usuario_id BIGINT UNSIGNED NOT NULL, sector_id BIGINT UNSIGNED NOT NULL,
      metodo VARCHAR(80) NOT NULL DEFAULT 'DECLARADA_EN_PERFIL',
      estado ENUM('PENDIENTE','VERIFICADA','RECHAZADA','REVOCADA') NOT NULL DEFAULT 'PENDIENTE',
      solicitada_en DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), verificada_en DATETIME(3) NULL,
      vence_en DATETIME(3) NULL, revocada_en DATETIME(3) NULL,
      actualizado_en TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
      PRIMARY KEY (pertenencia_id), UNIQUE KEY uq_pertenencia_usuario_sector (usuario_id,sector_id),
      KEY ix_pertenencia_usuario_estado (usuario_id,estado,vence_en), KEY ix_pertenencia_sector_estado (sector_id,estado),
      CONSTRAINT fk_pertenencia_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios (usuario_id) ON UPDATE CASCADE ON DELETE CASCADE,
      CONSTRAINT fk_pertenencia_sector FOREIGN KEY (sector_id) REFERENCES sectores_vecinales (sector_id) ON UPDATE CASCADE ON DELETE RESTRICT,
      CONSTRAINT chk_pertenencia_fechas CHECK (
        (estado='PENDIENTE' AND verificada_en IS NULL AND revocada_en IS NULL) OR
        (estado='VERIFICADA' AND verificada_en IS NOT NULL AND revocada_en IS NULL AND (vence_en IS NULL OR vence_en > verificada_en)) OR
        (estado='RECHAZADA' AND revocada_en IS NULL) OR
        (estado='REVOCADA' AND verificada_en IS NOT NULL AND revocada_en IS NOT NULL AND revocada_en >= verificada_en)
      )
    ) ENGINE=InnoDB`);
  }
  const [membershipColumns] = await connection.execute(`SELECT COUNT(*) AS total FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='pertenencias_zona'
      AND COLUMN_NAME IN ('pertenencia_id','usuario_id','sector_id','metodo','estado','verificada_en','vence_en','revocada_en')`);
  if (Number(membershipColumns[0].total) !== 8) throw new Error('015: pertenencias_zona existe con una estructura distinta; revisar sin modificarla.');
  await connection.query(`INSERT INTO pertenencias_zona (usuario_id,sector_id,metodo,estado)
    SELECT u.usuario_id,l.sector_id,'DECLARADA_EN_PERFIL','PENDIENTE' FROM usuarios u
    JOIN ubicaciones l ON l.ubicacion_id=u.ubicacion_id
    WHERE NOT EXISTS (SELECT 1 FROM pertenencias_zona p WHERE p.usuario_id=u.usuario_id AND p.sector_id=l.sector_id)`);

  if (!await hasIndex('publicaciones','uq_publicacion_propietario')) {
    await connection.query('ALTER TABLE publicaciones ADD UNIQUE KEY uq_publicacion_propietario (publicacion_id,propietario_id)');
  }
  if (!await hasTable('interacciones_publicacion')) {
    await connection.query(`CREATE TABLE interacciones_publicacion (
      interaccion_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      publicacion_id BIGINT UNSIGNED NOT NULL, solicitante_id BIGINT UNSIGNED NOT NULL, propietario_id BIGINT UNSIGNED NOT NULL,
      tipo ENUM('CONSULTA','COMPRA','CONTRATACION','OTRO') NOT NULL,
      estado ENUM('PENDIENTE','CONFIRMADA','RECHAZADA','CANCELADA') NOT NULL DEFAULT 'PENDIENTE',
      solicitante_confirmo_en DATETIME(3) NULL, propietario_confirmo_en DATETIME(3) NULL, confirmada_en DATETIME(3) NULL,
      creado_en TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      actualizado_en TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
      PRIMARY KEY (interaccion_id), UNIQUE KEY uq_interaccion_autor_publicacion (interaccion_id,publicacion_id,solicitante_id),
      KEY ix_interaccion_publicacion_estado (publicacion_id,estado,creado_en),
      KEY ix_interaccion_solicitante_estado (solicitante_id,estado,creado_en),
      KEY ix_interaccion_propietario_estado (propietario_id,estado,creado_en),
      CONSTRAINT fk_interaccion_publicacion_propietario FOREIGN KEY (publicacion_id,propietario_id)
        REFERENCES publicaciones (publicacion_id,propietario_id) ON UPDATE RESTRICT ON DELETE RESTRICT,
      CONSTRAINT fk_interaccion_solicitante FOREIGN KEY (solicitante_id)
        REFERENCES usuarios (usuario_id) ON UPDATE CASCADE ON DELETE RESTRICT,
      CONSTRAINT chk_interaccion_confirmacion CHECK (
        (estado='CONFIRMADA' AND solicitante_confirmo_en IS NOT NULL AND propietario_confirmo_en IS NOT NULL AND confirmada_en IS NOT NULL) OR
        (estado<>'CONFIRMADA' AND confirmada_en IS NULL AND (solicitante_confirmo_en IS NULL OR propietario_confirmo_en IS NULL))
      )
    ) ENGINE=InnoDB`);
  }
  const [interactionColumns] = await connection.execute(`SELECT COUNT(*) AS total FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='interacciones_publicacion'
      AND COLUMN_NAME IN ('interaccion_id','publicacion_id','solicitante_id','propietario_id','tipo','estado','solicitante_confirmo_en','propietario_confirmo_en','confirmada_en')`);
  if (Number(interactionColumns[0].total) !== 9) throw new Error('015: interacciones_publicacion existe con una estructura distinta; revisar sin modificarla.');

  if (!await hasColumn('resenas','interaccion_id')) await connection.query('ALTER TABLE resenas ADD COLUMN interaccion_id BIGINT UNSIGNED NULL AFTER usuario_id');
  if (!await hasColumn('resenas','estado_verificacion')) await connection.query("ALTER TABLE resenas ADD COLUMN estado_verificacion ENUM('NO_VERIFICADA','VERIFICADA') NOT NULL DEFAULT 'NO_VERIFICADA' AFTER comentario");
  if (!await hasColumn('resenas','verificada_en')) await connection.query('ALTER TABLE resenas ADD COLUMN verificada_en DATETIME(3) NULL AFTER estado_verificacion');
  if (!await hasIndex('resenas','uq_resena_interaccion')) await connection.query('ALTER TABLE resenas ADD UNIQUE KEY uq_resena_interaccion (interaccion_id)');
  if (!await hasIndex('resenas','ix_resena_publicacion_verificacion_fecha')) await connection.query('ALTER TABLE resenas ADD KEY ix_resena_publicacion_verificacion_fecha (publicacion_id,estado_verificacion,creado_en)');
  if (!await hasIndex('resenas','ix_resena_interaccion_estado')) await connection.query('ALTER TABLE resenas ADD KEY ix_resena_interaccion_estado (interaccion_id,estado_verificacion)');
  if (!await hasConstraint('resenas','fk_resena_interaccion_autor_publicacion','FOREIGN KEY')) {
    await connection.query(`ALTER TABLE resenas ADD CONSTRAINT fk_resena_interaccion_autor_publicacion
      FOREIGN KEY (interaccion_id,publicacion_id,usuario_id)
      REFERENCES interacciones_publicacion (interaccion_id,publicacion_id,solicitante_id) ON UPDATE RESTRICT ON DELETE RESTRICT`);
  }

  const triggerSql = {
    bi_interacciones_publicacion_no_autorreferencia: `CREATE TRIGGER bi_interacciones_publicacion_no_autorreferencia BEFORE INSERT ON interacciones_publicacion FOR EACH ROW BEGIN
      IF NEW.solicitante_id=NEW.propietario_id THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Una persona no puede iniciar una interacción con su propia publicación.'; END IF; END`,
    bu_interacciones_publicacion_no_autorreferencia: `CREATE TRIGGER bu_interacciones_publicacion_no_autorreferencia BEFORE UPDATE ON interacciones_publicacion FOR EACH ROW BEGIN
      IF NEW.solicitante_id=NEW.propietario_id THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Una persona no puede ser solicitante y propietaria de la misma interacción.'; END IF; END`,
    bi_resenas_integridad_publicacion: `CREATE TRIGGER bi_resenas_integridad_publicacion BEFORE INSERT ON resenas FOR EACH ROW BEGIN
      DECLARE v_propietario_id BIGINT UNSIGNED DEFAULT NULL; DECLARE v_interaccion_valida INT DEFAULT 0; DECLARE v_interaccion_confirmada INT DEFAULT 0;
      SELECT propietario_id INTO v_propietario_id FROM publicaciones WHERE publicacion_id=NEW.publicacion_id;
      IF v_propietario_id IS NOT NULL AND v_propietario_id=NEW.usuario_id THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='El propietario no puede reseñar su propia publicación.'; END IF;
      IF NEW.interaccion_id IS NULL THEN SET NEW.estado_verificacion='NO_VERIFICADA'; SET NEW.verificada_en=NULL;
      ELSE
        SELECT COUNT(*) INTO v_interaccion_valida FROM interacciones_publicacion WHERE interaccion_id=NEW.interaccion_id AND publicacion_id=NEW.publicacion_id AND solicitante_id=NEW.usuario_id;
        IF v_interaccion_valida=0 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='La interacción no corresponde al autor y a la publicación.'; END IF;
        SELECT COUNT(*) INTO v_interaccion_confirmada FROM interacciones_publicacion WHERE interaccion_id=NEW.interaccion_id AND estado='CONFIRMADA' AND solicitante_confirmo_en IS NOT NULL AND propietario_confirmo_en IS NOT NULL AND confirmada_en IS NOT NULL;
        IF v_interaccion_confirmada=0 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Solo una interacción confirmada puede verificar la reseña.'; END IF;
        SET NEW.estado_verificacion='VERIFICADA'; SET NEW.verificada_en=UTC_TIMESTAMP(3);
      END IF; END`,
    bu_resenas_integridad_publicacion: `CREATE TRIGGER bu_resenas_integridad_publicacion BEFORE UPDATE ON resenas FOR EACH ROW BEGIN
      DECLARE v_propietario_id BIGINT UNSIGNED DEFAULT NULL; DECLARE v_interaccion_valida INT DEFAULT 0; DECLARE v_interaccion_confirmada INT DEFAULT 0;
      SELECT propietario_id INTO v_propietario_id FROM publicaciones WHERE publicacion_id=NEW.publicacion_id;
      IF v_propietario_id IS NOT NULL AND v_propietario_id=NEW.usuario_id THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='El propietario no puede reseñar su propia publicación.'; END IF;
      IF NEW.interaccion_id IS NULL THEN SET NEW.estado_verificacion='NO_VERIFICADA'; SET NEW.verificada_en=NULL;
      ELSE
        SELECT COUNT(*) INTO v_interaccion_valida FROM interacciones_publicacion WHERE interaccion_id=NEW.interaccion_id AND publicacion_id=NEW.publicacion_id AND solicitante_id=NEW.usuario_id;
        IF v_interaccion_valida=0 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='La interacción no corresponde al autor y a la publicación.'; END IF;
        SELECT COUNT(*) INTO v_interaccion_confirmada FROM interacciones_publicacion WHERE interaccion_id=NEW.interaccion_id AND estado='CONFIRMADA' AND solicitante_confirmo_en IS NOT NULL AND propietario_confirmo_en IS NOT NULL AND confirmada_en IS NOT NULL;
        IF v_interaccion_confirmada=0 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Solo una interacción confirmada puede verificar la reseña.'; END IF;
        SET NEW.estado_verificacion='VERIFICADA'; SET NEW.verificada_en=COALESCE(OLD.verificada_en,UTC_TIMESTAMP(3));
      END IF; END`,
    bu_interacciones_publicacion_resenada: `CREATE TRIGGER bu_interacciones_publicacion_resenada BEFORE UPDATE ON interacciones_publicacion FOR EACH ROW BEGIN
      DECLARE v_resenas INT DEFAULT 0;
      IF OLD.estado='CONFIRMADA' AND NEW.estado<>'CONFIRMADA' THEN
        SELECT COUNT(*) INTO v_resenas FROM resenas WHERE interaccion_id=OLD.interaccion_id AND estado_verificacion='VERIFICADA';
        IF v_resenas>0 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Una interacción que verifica reseñas no puede dejar de estar confirmada.'; END IF;
      END IF; END`,
  };
  for (const [name, sql] of Object.entries(triggerSql)) if (!await hasTrigger(name)) await connection.query(sql);
}

async function completePublicationInteractionLifecycleMigration() {
  const [columns] = await connection.execute(`SELECT COLUMN_TYPE FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='interacciones_publicacion' AND COLUMN_NAME='estado'`);
  if (!columns.length) throw new Error('017: no existe interacciones_publicacion.estado; revisar el esquema antes de continuar.');
  const statuses = [...String(columns[0].COLUMN_TYPE).matchAll(/'([^']+)'/g)].map((match) => match[1]);
  const expected = ['PENDIENTE','ACEPTADA','EN_CURSO','CONFIRMADA','RECHAZADA','CANCELADA'];
  const old = ['PENDIENTE','CONFIRMADA','RECHAZADA','CANCELADA'];
  if (expected.every((status) => statuses.includes(status)) && statuses.length === expected.length) return;
  if (statuses.length !== old.length || !old.every((status) => statuses.includes(status))) {
    throw new Error('017: el ENUM interacciones_publicacion.estado tiene una definición inesperada; revisar antes de continuar.');
  }
  await connection.query(`ALTER TABLE interacciones_publicacion
    MODIFY COLUMN estado ENUM('PENDIENTE','ACEPTADA','EN_CURSO','CONFIRMADA','RECHAZADA','CANCELADA') NOT NULL DEFAULT 'PENDIENTE'`);
}

const interrupted015Checksums = new Set(['757538574ea8ec07c467a57f11ed803d9bd9040d69eb3b154bb8253eb85166b3']);
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
    if (source.name === '014_resenas_reciprocas.sql' && (!existing.length || existing[0].estado === 'iniciada')) {
      if (existing.length && !source.compatibleHashes.has(existing[0].checksum)) {
        throw new Error(`${source.name}: el archivo cambió después de iniciarse; revisar antes de continuar.`);
      }
      if (!existing.length) {
        await connection.execute("INSERT INTO ayni_schema_migrations(version,checksum,estado) VALUES (?,?,'iniciada')", [source.name, source.hash]);
      }
      await completeReciprocalReviewMigration();
      await connection.execute("UPDATE ayni_schema_migrations SET checksum=?, estado='completada', aplicado_en=CURRENT_TIMESTAMP WHERE version=?", [source.hash, source.name]);
      console.log(`${existing.length ? 'Recuperada y completada' : 'Aplicada de forma segura'}: ${source.name}`);
      continue;
    }
    if (source.name === '015_visto_bueno_verificado.sql' && existing.length && existing[0].estado === 'iniciada') {
      if (!source.compatibleHashes.has(existing[0].checksum) && !interrupted015Checksums.has(existing[0].checksum)) {
        throw new Error(`${source.name}: ejecución parcial con un archivo distinto; revisar el esquema antes de continuar.`);
      }
      await completeVerifiedRecommendationMigration();
      await connection.execute("UPDATE ayni_schema_migrations SET checksum=?, estado='completada', aplicado_en=CURRENT_TIMESTAMP WHERE version=?", [source.hash, source.name]);
      console.log(`Recuperada y completada de forma segura: ${source.name}`);
      continue;
    }
    if (source.name === '017_ciclo_interacciones_publicacion.sql' && existing.length && existing[0].estado === 'iniciada') {
      if (!source.compatibleHashes.has(existing[0].checksum)) {
        throw new Error(`${source.name}: ejecución parcial con un archivo distinto; revisar el esquema antes de continuar.`);
      }
      await completePublicationInteractionLifecycleMigration();
      await connection.execute("UPDATE ayni_schema_migrations SET checksum=?, estado='completada', aplicado_en=CURRENT_TIMESTAMP WHERE version=?", [source.hash, source.name]);
      console.log(`Recuperada y completada de forma segura: ${source.name}`);
      continue;
    }
    if (source.name === '018_estado_recomendaciones.sql' && existing.length && existing[0].estado === 'iniciada') {
      if (!source.compatibleHashes.has(existing[0].checksum)) {
        throw new Error(`${source.name}: ejecución parcial con un archivo distinto; revisar el esquema antes de continuar.`);
      }
      // 018 can be retried after partial DDL: it reapplies the enum and replaces triggers.
      await connection.query(source.sql);
      await connection.execute("UPDATE ayni_schema_migrations SET checksum=?, estado='completada', aplicado_en=CURRENT_TIMESTAMP WHERE version=?", [source.hash, source.name]);
      console.log(`Recuperada y completada de forma segura: ${source.name}`);
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
      if (source.name === '017_ciclo_interacciones_publicacion.sql') await completePublicationInteractionLifecycleMigration();
      else await connection.query(source.sql);
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
