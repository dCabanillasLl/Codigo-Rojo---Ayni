import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import express from 'express';
import request from 'supertest';
import { config } from '../src/config.js';
import { pool } from '../src/db/index.js';
import notices from '../src/routes/notices.js';
import { errorHandler } from '../src/middlewares/errors.js';
import { localDateTimeInput, noticeEditPayload } from '../../src/lib/notices.js';
import type { Notice } from '../../src/types.js';

after(async () => { await pool.end(); });

test('el formulario de edición conserva fecha, flyer y lugar si solo se cambia el texto', () => {
  const initial = {
    titulo: 'Actividad original', contenido: 'Descripción original', categoriaId: '1',
    fechaEvento: '2020-01-01T12:00:35Z', venceEn: null,
    latitudActividad: -12.074321, longitudActividad: -77.063219, direccionActividad: 'Parque de encuentro',
  } as Notice;
  const draft = {
    titulo: initial.titulo, contenido: initial.contenido, categoriaId: initial.categoriaId,
    fechaEvento: localDateTimeInput(new Date(initial.fechaEvento!)),
    location: { coordinates: { latitude: initial.latitudActividad!, longitude: initial.longitudActividad! }, address: initial.direccionActividad! },
  };
  assert.deepEqual(noticeEditPayload(initial, draft), {});
  assert.deepEqual(noticeEditPayload(initial, { ...draft, contenido: 'Nueva descripción' }), { contenido: 'Nueva descripción' });
  assert.deepEqual(noticeEditPayload(initial, { ...draft, foto: null }), { foto: null });
  assert.deepEqual(noticeEditPayload(initial, { ...draft, foto: 'data:image/png;base64,AAAA' }), { foto: 'data:image/png;base64,AAAA' });
  assert.deepEqual(noticeEditPayload(initial, { ...draft, location: { coordinates: { latitude: 0, longitude: 0 }, address: 'Nuevo lugar' } }), { ubicacion: { latitud: 0, longitud: 0, direccion: 'Nuevo lugar' } });
  const dateInput = '2099-01-01T15:30';
  assert.deepEqual(noticeEditPayload(initial, { ...draft, fechaEvento: dateInput }), { fechaEvento: new Date(dateInput).toISOString(), venceEn: null });
  const legacy = { ...initial, fechaEvento: null, latitudActividad: null, longitudActividad: null, direccionActividad: null };
  assert.deepEqual(noticeEditPayload(legacy, { ...draft, fechaEvento: '', location: { coordinates: null, address: '' } }), {});
});

test('solo el autor edita, las revisiones evitan sobrescrituras y una actividad cancelada queda bloqueada', async context => {
  config.dbConfigured = true;
  const state = { titulo: 'Actividad original', contenido: 'Descripción original', categoria_aviso_id: '1', revision_evento: 3, estado: 'publicado' };
  let notifications = 0;
  const connection = {
    beginTransaction: async () => undefined, commit: async () => undefined, rollback: async () => undefined, release: () => undefined,
    execute: async (sql: string, values: unknown[]) => {
      if (sql.startsWith('SELECT autor_id')) return [[{ autor_id: '1', fecha_evento: new Date('2020-01-01T12:00:35Z'), vence_en: null, ...state }]];
      if (sql.startsWith('INSERT INTO notificaciones_avisos')) { notifications++; return [{ affectedRows: 1 }]; }
      assert.ok(sql.startsWith('UPDATE avisos SET'));
      assert.doesNotMatch(sql, /ubicacion_id|imagen|estado =|fecha_evento/);
      const fields = sql.slice('UPDATE avisos SET '.length, sql.indexOf(' WHERE')).split(', ').map(field => field.split(' = ')[0]);
      fields.forEach((field, index) => {
        if (field === 'contenido') state.contenido = String(values[index]);
        if (field === 'titulo') state.titulo = String(values[index]);
        if (field === 'categoria_aviso_id') state.categoria_aviso_id = String(values[index]);
        if (field === 'revision_evento') state.revision_evento = Number(values[index]);
      });
      return [{ affectedRows: 1 }];
    },
  };
  context.mock.method(pool, 'getConnection', async () => connection);
  context.mock.method(pool, 'execute', async () => [[{ id: '42', autorId: '1', titulo: state.titulo, contenido: state.contenido, categoriaId: state.categoria_aviso_id, revisionEvento: state.revision_evento, estado: state.estado === 'publicado' ? 'vencido' : state.estado }]]);
  const app = express(); app.use(express.json());
  app.use((req, _res, next) => { req.userId = req.get('X-Test-User') || ''; next(); });
  app.use('/api', notices); app.use(errorHandler);
  const body = { titulo: 'Título corregido', contenido: 'Descripción corregida', categoriaId: '2', revisionEvento: 3 };
  await request(app).patch('/api/avisos/42').send(body).expect(401);
  await request(app).patch('/api/avisos/42').set('X-Test-User', '2').send(body).expect(403);
  const stale = await request(app).patch('/api/avisos/42').set('X-Test-User', '1').send({ ...body, revisionEvento: 2 }).expect(409);
  assert.equal(stale.body.error.code, 'EVENT_CHANGED');
  assert.equal(state.titulo, 'Actividad original');
  const saved = await request(app).patch('/api/avisos/42').set('X-Test-User', '1').send(body).expect(200);
  assert.equal(saved.body.data.titulo, body.titulo);
  assert.equal(saved.body.data.categoriaId, '2');
  assert.equal(saved.body.data.revisionEvento, 4);
  assert.equal(saved.body.data.estado, 'vencido');
  assert.equal(notifications, 0);
  await request(app).patch('/api/avisos/42').set('X-Test-User', '1').send(body).expect(409);
  assert.equal(state.revision_evento, 4);
  state.estado = 'cancelado';
  for (const change of [{ titulo: 'No debe cambiar' }, { estado: 'publicado' }, { ubicacion: { latitud: 0, longitud: 0 } }, { foto: null }]) {
    const blocked = await request(app).patch('/api/avisos/42').set('X-Test-User', '1').send({ ...change, revisionEvento: 4 }).expect(409);
    assert.equal(blocked.body.error.code, 'EVENT_CANCELLED');
  }
  assert.equal(state.revision_evento, 4); assert.equal(state.titulo, 'Título corregido');
  assert.equal(notifications, 0);
  await request(app).patch('/api/avisos/42').set('X-Test-User', '1').send({ revisionEvento: 4 }).expect(400);
});
