import assert from 'node:assert/strict';
import { after, test, type TestContext } from 'node:test';
import express from 'express';
import request from 'supertest';
import notices from '../src/routes/notices.js';
import { config } from '../src/config.js';
import { pool } from '../src/db/index.js';
import { protectMutations } from '../src/middlewares/security.js';
import { errorHandler } from '../src/middlewares/errors.js';

after(async () => { await pool.end(); });
const origin = 'http://localhost:8444';
const headers = { Origin: origin, 'X-AYNI-Client': 'web', 'X-Test-User': '1' };
const body = { confirmar: true, revisionEvento: 2 };

function fixture(context: TestContext) {
  // These SQL fixtures never delete a real event, profile or database record.
  config.dbConfigured = true;
  const state = { exists: true, estado: 'cancelado', publicVenue: 1, sharedVenue: false, locationRemoved: false, flyer: true, attendance: true, notification: { avisoId: '42' as string | null, text: 'Actividad cancelada', read: false }, failCleanup: false };
  const calls: string[] = [];
  let snapshot = structuredClone(state);
  const connection = {
    beginTransaction: async () => { snapshot = structuredClone(state); },
    commit: async () => undefined, rollback: async () => { Object.assign(state, snapshot); }, release: () => undefined,
    execute: async (sql: string, values: unknown[]) => {
      calls.push(sql);
      assert.doesNotMatch(sql, /DELETE FROM usuarios|UPDATE usuarios|DELETE FROM notificaciones/);
      if (sql.startsWith('SELECT autor_id')) {
        assert.match(sql, /FOR UPDATE$/);
        return [state.exists ? [{ autor_id: '1', estado: state.estado, revision_evento: 2, ubicacion_id: '10', ubicacion_publica: state.publicVenue }] : []];
      }
      if (sql.startsWith('DELETE FROM avisos')) {
        assert.deepEqual(values, ['42']);
        state.exists = false; state.flyer = false; state.attendance = false; state.notification.avisoId = null;
        return [{ affectedRows: 1 }];
      }
      if (sql.startsWith('DELETE l FROM ubicaciones')) {
        for (const table of ['usuarios', 'publicaciones', 'solicitudes_ayuda', 'avisos', 'recursos_comunitarios']) assert.ok(sql.includes(`SELECT 1 FROM ${table}`));
        if (state.failCleanup) throw new Error('Fallo de limpieza simulado');
        state.locationRemoved = !state.sharedVenue;
        return [{ affectedRows: state.sharedVenue ? 0 : 1 }];
      }
      throw new Error('SQL inesperado en fixture');
    },
  };
  context.mock.method(pool, 'getConnection', async () => connection);
  context.mock.method(pool, 'execute', async () => [[]]);
  const app = express(); app.use(protectMutations([origin])); app.use(express.json());
  app.use((req, _res, next) => { req.userId = req.get('X-Test-User') || ''; next(); });
  app.use('/api', notices); app.use(errorHandler);
  return { app, state, calls };
}

test('eliminar exige autor, cancelación, confirmación y revisión; borra datos del evento sin perder la notificación pendiente', async context => {
  const { app, state, calls } = fixture(context);
  await request(app).delete('/api/avisos/42').set({ Origin: origin, 'X-AYNI-Client': 'web' }).send(body).expect(401);
  await request(app).delete('/api/avisos/42').set(headers).set('Origin', 'https://otro.example').send(body).expect(403);
  await request(app).delete('/api/avisos/42').set(headers).send({ revisionEvento: 2 }).expect(400);
  await request(app).delete('/api/avisos/42').set(headers).send({ ...body, confirmar: false }).expect(400);
  await request(app).delete('/api/avisos/42').set({ ...headers, 'X-Test-User': '2' }).send(body).expect(403);
  await request(app).delete('/api/avisos/42').set({ ...headers, 'X-AYNI-User': '2' }).send(body).expect(409);
  state.estado = 'publicado';
  assert.equal((await request(app).delete('/api/avisos/42').set(headers).send(body).expect(409)).body.error.code, 'EVENT_NOT_CANCELLED');
  state.estado = 'cancelado';
  await request(app).delete('/api/avisos/42').set(headers).send({ ...body, revisionEvento: 1 }).expect(409);
  assert.ok(!calls.some(sql => sql.startsWith('DELETE')));
  const saved = await request(app).delete('/api/avisos/42').set(headers).send(body).expect(200);
  assert.equal(saved.body.data.eliminado, true);
  assert.equal(state.exists, false); assert.equal(state.flyer, false); assert.equal(state.attendance, false);
  assert.equal(state.locationRemoved, true);
  assert.deepEqual(state.notification, { avisoId: null, text: 'Actividad cancelada', read: false });
  await request(app).get('/api/avisos/42').expect(404);
  await request(app).get('/api/avisos/42/imagen').expect(404);
  await request(app).delete('/api/avisos/42').set(headers).send(body).expect(200);
  assert.equal(calls.filter(sql => sql.startsWith('DELETE FROM avisos')).length, 1);
});

test('el borrado conserva ubicaciones privadas o compartidas y se revierte si la limpieza falla', async context => {
  const { app, state, calls } = fixture(context);
  state.publicVenue = 0;
  await request(app).delete('/api/avisos/42').set(headers).send(body).expect(200);
  assert.equal(state.locationRemoved, false);
  assert.ok(!calls.some(sql => sql.startsWith('DELETE l')));
  state.exists = true; state.publicVenue = 1; state.sharedVenue = true;
  await request(app).delete('/api/avisos/42').set(headers).send(body).expect(200);
  assert.equal(state.locationRemoved, false);
  state.exists = true; state.sharedVenue = false; state.failCleanup = true;
  state.flyer = true; state.attendance = true; state.notification.avisoId = '42';
  await request(app).delete('/api/avisos/42').set(headers).send(body).expect(500);
  assert.equal(state.exists, true); assert.equal(state.flyer, true); assert.equal(state.attendance, true);
  assert.equal(state.notification.avisoId, '42');
});
