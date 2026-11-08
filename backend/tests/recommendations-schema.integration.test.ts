import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';

const enabled = process.env.RUN_MYSQL_TESTS === '1';

test('MySQL: integridad del Visto Bueno Vecinal verificado', { skip: !enabled }, async (t) => {
  assert.ok(/^ayni_test_[a-zA-Z0-9_]+$/.test(process.env.DB_NAME ?? ''), 'Usar exclusivamente una base ayni_test_* preparada para pruebas.');
  assert.ok(['127.0.0.1', 'localhost', '::1'].includes(process.env.DB_HOST ?? ''), 'Esta prueba solo admite MySQL local.');
  const db = await import('../src/db/index.js');
  const { insert } = await import('../src/services/community-data.js');
  const prefix = `visto-${randomUUID()}`;
  try {
    const fixtures = await db.transaction(async (connection) => {
      const sectorId = await insert(connection,
        'INSERT INTO sectores_vecinales (nombre,distrito,ciudad,codigo_pais) VALUES (?, ?, ?, \'PE\')',
        [prefix, `Distrito ${prefix}`, 'Pruebas']);
      const locationId = await insert(connection,
        'INSERT INTO ubicaciones (sector_id,etiqueta,latitud,longitud) VALUES (?, \'Punto sintético\', -12.073, -77.063)', [sectorId]);
      const users: string[] = [];
      for (const role of ['dueno', 'solicitante', 'tercero']) {
        users.push(await insert(connection,
          'INSERT INTO usuarios (nombres,apellidos,correo,hash_contrasena,ubicacion_id) VALUES (?, \'Integración\', ?, \'hash-sintetico\', ?)',
          [role, `${prefix}-${role}@example.invalid`, locationId]));
      }
      const categoryId = await insert(connection, 'INSERT INTO categorias_publicacion (nombre) VALUES (?)', [prefix]);
      const publications: string[] = [];
      for (const title of ['Servicio de prueba uno', 'Servicio de prueba dos', 'Servicio de prueba tres']) {
        publications.push(await insert(connection,
          `INSERT INTO publicaciones (propietario_id,ubicacion_id,categoria_id,tipo,titulo,descripcion,modalidad_precio,estado)
           VALUES (?, ?, ?, 'servicio', ?, 'Ficha sintética para probar claves foráneas.', 'cotizar', 'publicada')`,
          [users[0], locationId, categoryId, `${title} ${prefix}`]));
      }
      return { sectorId, users, publications };
    });
    const [owner, requester, thirdParty] = fixtures.users;
    const [publicationA, publicationB, publicationC] = fixtures.publications;
    let interactionId = '';

    await t.test('identidad y zona conservan estados pendientes sin PII adicional', async () => {
      const historicalIdentity = await db.one<{ total: number }>(
        "SELECT COUNT(*) AS total FROM verificaciones_identidad WHERE metodo='SIN_HISTORIAL_DE_VALIDACION' AND estado='PENDIENTE'");
      assert.ok(Number(historicalIdentity?.total) > 0);
      const historicalZone = await db.one<{ total: number }>(
        "SELECT COUNT(*) AS total FROM pertenencias_zona WHERE metodo='DECLARADA_EN_PERFIL' AND estado='PENDIENTE'");
      assert.ok(Number(historicalZone?.total) > 0);

      await db.query("INSERT INTO verificaciones_identidad (usuario_id,estado,metodo) VALUES (?, 'PENDIENTE', 'APIPERU')", [requester]);
      await db.query("INSERT INTO pertenencias_zona (usuario_id,sector_id,metodo,estado) VALUES (?, ?, 'DECLARADA_EN_PERFIL', 'PENDIENTE')", [requester, fixtures.sectorId]);
      await assert.rejects(() => db.query(
        "INSERT INTO verificaciones_identidad (usuario_id,estado,metodo) VALUES (?, 'VERIFICADA', 'APIPERU')", [owner]));
      await assert.rejects(() => db.query(
        "INSERT INTO pertenencias_zona (usuario_id,sector_id,metodo,estado,verificada_en) VALUES (?, ?, 'MANUAL', 'VERIFICADA', NULL)", [owner, fixtures.sectorId]));
      await assert.rejects(() => db.query(
        "INSERT INTO pertenencias_zona (usuario_id,sector_id,metodo,estado) VALUES (?, ?, 'MANUAL', 'PENDIENTE')", [requester, fixtures.sectorId]));

      const [columns] = await db.pool.execute<any[]>(
        `SELECT TABLE_NAME,COLUMN_NAME FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME IN ('verificaciones_identidad','pertenencias_zona')`);
      const sensitiveColumns = new Set(['dni', 'documento', 'direccion', 'latitud', 'longitud', 'documento_url']);
      assert.ok(columns.every(column => !sensitiveColumns.has(String(column.COLUMN_NAME).toLowerCase())));
    });

    await t.test('interacción liga a la publicación y a su propietario, sin autorreferencias', async () => {
      await assert.rejects(() => db.query(
        `INSERT INTO interacciones_publicacion (publicacion_id,solicitante_id,propietario_id,tipo)
         VALUES (?, ?, ?, 'CONSULTA')`, [publicationA, owner, owner]));
      await assert.rejects(() => db.query(
        `INSERT INTO interacciones_publicacion (publicacion_id,solicitante_id,propietario_id,tipo)
         VALUES (?, ?, ?, 'CONSULTA')`, [publicationA, requester, thirdParty]));

      interactionId = await db.transaction(connection => insert(connection,
        `INSERT INTO interacciones_publicacion (publicacion_id,solicitante_id,propietario_id,tipo)
         VALUES (?, ?, ?, 'COMPRA')`, [publicationA, requester, owner]));
    });

    await t.test('la reseña opcional queda no verificada; la evidencia incompleta queda pendiente', async () => {
      await db.query('INSERT INTO resenas (publicacion_id,usuario_id,calificacion,comentario) VALUES (?, ?, 5, ?)',
        [publicationB, requester, 'Opinión sin interacción comprobable']);
      const unverified = await db.one<{ estado_verificacion: string; verificada_en: Date | null }>(
        'SELECT estado_verificacion,verificada_en FROM resenas WHERE publicacion_id=? AND usuario_id=?', [publicationB, requester]);
      assert.equal(unverified?.estado_verificacion, 'NO_VERIFICADA');
      assert.equal(unverified?.verificada_en, null);

      await assert.rejects(() => db.query(
        'INSERT INTO resenas (publicacion_id,usuario_id,calificacion) VALUES (?, ?, 5)', [publicationA, owner]));
      await db.query(
        'INSERT INTO resenas (publicacion_id,usuario_id,interaccion_id,calificacion) VALUES (?, ?, ?, 5)', [publicationA, requester, interactionId]);
      const pending = await db.one<{ estado_verificacion: string; verificada_en: Date | null }>(
        'SELECT estado_verificacion,verificada_en FROM resenas WHERE publicacion_id=? AND usuario_id=?', [publicationA, requester]);
      assert.equal(pending?.estado_verificacion, 'PENDIENTE');
      assert.equal(pending?.verificada_en, null);
      await db.query(`UPDATE verificaciones_identidad SET estado='VERIFICADA', metodo='REVISION_DE_PRUEBA',
        verificada_en=UTC_TIMESTAMP(3), revocada_en=NULL WHERE usuario_id=?`, [requester]);
      await db.query(`UPDATE pertenencias_zona SET estado='VERIFICADA', metodo='REVISION_DE_PRUEBA',
        verificada_en=UTC_TIMESTAMP(3), vence_en=NULL, revocada_en=NULL WHERE usuario_id=? AND sector_id=?`, [requester, fixtures.sectorId]);
      await assert.rejects(() => db.query(
        'INSERT INTO resenas (publicacion_id,usuario_id,interaccion_id,calificacion) VALUES (?, ?, ?, 5)', [publicationA, thirdParty, interactionId]));
      await assert.rejects(() => db.query(
        'INSERT INTO resenas (publicacion_id,usuario_id,interaccion_id,calificacion) VALUES (?, ?, ?, 5)', [publicationC, requester, interactionId]));

      await db.query(`UPDATE interacciones_publicacion
        SET estado='CONFIRMADA', solicitante_confirmo_en=UTC_TIMESTAMP(3),
            propietario_confirmo_en=UTC_TIMESTAMP(3), confirmada_en=UTC_TIMESTAMP(3)
        WHERE interaccion_id=?`, [interactionId]);
      await db.query('UPDATE resenas SET comentario=? WHERE publicacion_id=? AND usuario_id=?',
        ['Experiencia confirmada por ambas partes', publicationA, requester]);
      const verified = await db.one<{ estado_verificacion: string; verificada_en: Date | null }>(
        'SELECT estado_verificacion,verificada_en FROM resenas WHERE publicacion_id=? AND usuario_id=?', [publicationA, requester]);
      assert.equal(verified?.estado_verificacion, 'VERIFICADA');
      assert.ok(verified?.verificada_en);

      await assert.rejects(() => db.query(
        'INSERT INTO resenas (publicacion_id,usuario_id,interaccion_id,calificacion) VALUES (?, ?, ?, 4)', [publicationA, requester, interactionId]));
      await db.query("UPDATE interacciones_publicacion SET estado='CANCELADA', solicitante_confirmo_en=NULL, propietario_confirmo_en=NULL, confirmada_en=NULL WHERE interaccion_id=?", [interactionId]);
    });

    await t.test('restricciones compuestas y unicidad de interacción', async () => {
      const [[uniqueInteraction]] = await db.pool.query<any[]>(
        `SELECT NON_UNIQUE FROM information_schema.STATISTICS
         WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='resenas' AND INDEX_NAME='uq_resena_interaccion' LIMIT 1`);
      assert.equal(Number(uniqueInteraction?.NON_UNIQUE), 0);
    });
  } finally {
    await db.pool.end();
  }
});
