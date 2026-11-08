import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import express from 'express';
import request from 'supertest';
import { config } from '../src/config.js';
import { pool } from '../src/db/index.js';
import notices from '../src/routes/notices.js';
import { errorHandler } from '../src/middlewares/errors.js';

after(async () => { await pool.end(); });

test('el aviso guarda un lugar explícito separado del perfil y conserva su privacidad anterior', async context => {
  // SQL fixture only: no actual profile, place or notice is created in the remote DB.
  config.dbConfigured = true;
  let venueId = '10', publicVenue = false, createdLocations = 0;
  let point = { latitud: -12.074321, longitud: -77.063219, direccion: 'Parque de encuentro' };
  const changed: unknown[][] = [];
  const connection = {
    beginTransaction: async () => undefined, commit: async () => undefined, rollback: async () => undefined, release: () => undefined,
    execute: async (sql: string, values: unknown[]) => {
      assert.doesNotMatch(sql, /UPDATE usuarios|UPDATE ubicaciones/);
      if (sql.startsWith('SELECT sector_id')) return [[{ sector_id: '1' }]];
      if (sql.startsWith('SELECT l.ubicacion_id')) throw new Error('No debe heredar el domicilio del perfil');
      if (sql.startsWith('INSERT INTO ubicaciones')) {
        createdLocations++; point = { direccion: values[1] as string, latitud: Number(values[2]), longitud: Number(values[3]) };
        return [{ insertId: 10 + createdLocations }];
      }
      if (sql.startsWith('INSERT INTO avisos')) { assert.match(sql, /ubicacion_publica\) VALUES .*1\)$/); venueId = String(values[2]); publicVenue = true; return [{ insertId: 42 }]; }
      if (sql.startsWith('SELECT autor_id')) return [[{ autor_id: '1', titulo: 'Actividad', estado: 'publicado', sector_id: '1', fecha_evento: new Date('2099-01-10T00:00:00Z'), vence_en: null, revision_evento: 0 }]];
      if (sql.startsWith('UPDATE avisos SET revision_evento')) return [{ affectedRows: 1 }];
      if (sql.startsWith('INSERT INTO notificaciones_avisos')) { changed.push(values); assert.match(String(values[1]), /Nuevo lugar:/); return [{ affectedRows: 1 }]; }
      if (sql.startsWith('UPDATE avisos SET')) { assert.match(sql, /ubicacion_publica = \?/); venueId = String(values[0]); publicVenue = values[1] === 1; return [{ affectedRows: 1 }]; }
      throw new Error(`SQL inesperado: ${sql.slice(0, 40)}`);
    },
  };
  context.mock.method(pool, 'getConnection', async () => connection);
  context.mock.method(pool, 'execute', async (sql: string) => {
    // Queries must guard every exact venue field so a legacy private profile is not exposed.
    for (const column of ['direccion', 'latitud', 'longitud']) assert.ok(sql.includes(`CASE WHEN a.ubicacion_publica = 1 THEN l.${column} ELSE NULL END`));
    const result = { id: '42', autorId: '1', estado: 'publicado', fechaEvento: new Date('2099-01-10T00:00:00Z'), venceEn: null, direccionActividad: publicVenue ? point.direccion : null, latitudActividad: publicVenue ? point.latitud : null, longitudActividad: publicVenue ? point.longitud : null };
    return [[result]];
  });
  const app = express(); app.use(express.json());
  app.use((req, _res, next) => { req.userId = req.get('X-Test-User') || ''; next(); });
  app.use('/api', notices); app.use(errorHandler);
  const body = { titulo: 'Actividad vecinal', contenido: 'Nos encontramos en el parque', categoriaId: '1', sectorId: '1', fechaEvento: '2099-01-10T00:00:00Z', ubicacion: point };
  const missing = await request(app).post('/api/avisos').set('X-Test-User', '1').send({ ...body, ubicacion: undefined }).expect(400);
  assert.equal(missing.body.error.code, 'EVENT_LOCATION_REQUIRED');
  for (const ubicacion of [{ latitud: 91, longitud: 0 }, { latitud: 0 }, { latitud: 0, longitud: 0, usuarioId: '2' }]) await request(app).post('/api/avisos').set('X-Test-User', '1').send({ ...body, ubicacion }).expect(400);
  const saved = await request(app).post('/api/avisos').set('X-Test-User', '1').send(body).expect(201);
  assert.equal(venueId, '11'); assert.equal(createdLocations, 1);
  assert.equal(saved.body.data.direccionActividad, 'Parque de encuentro');
  assert.equal(saved.body.data.latitudActividad, -12.074321);
  await request(app).patch('/api/avisos/42').set('X-Test-User', '1').send({ sectorId: '1' }).expect(200);
  await request(app).patch('/api/avisos/42').set('X-Test-User', '1').send({ sectorId: '2' }).expect(400);
  assert.equal(createdLocations, 1);
  await request(app).patch('/api/avisos/42').set('X-Test-User', '2').send({ ubicacion: { latitud: 0, longitud: 0 } }).expect(403);
  assert.equal(createdLocations, 1);
  const updated = await request(app).patch('/api/avisos/42').set('X-Test-User', '1').send({ ubicacion: { latitud: -12.075, longitud: -77.064, direccion: 'Nuevo parque de encuentro' } }).expect(200);
  assert.equal(createdLocations, 2); assert.equal(changed.length, 1);
  assert.equal(updated.body.data.direccionActividad, 'Nuevo parque de encuentro');
  assert.equal(venueId, '12');
  publicVenue = false; // A legacy notice referencing the author's private location.
  const legacy = await request(app).get('/api/avisos/42').expect(200);
  assert.equal(legacy.body.data.direccionActividad, null);
  assert.equal(legacy.body.data.latitudActividad, null);
  assert.equal(legacy.body.data.longitudActividad, null);
});
