import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import express from 'express';
import request from 'supertest';
import type { PoolConnection } from 'mysql2/promise';
import notices from '../src/routes/notices.js';
import notifications from '../src/routes/notifications.js';
import { config } from '../src/config.js';
import { pool } from '../src/db/index.js';
import { errorHandler } from '../src/middlewares/errors.js';
import { notifyEventChange, type EventSnapshot } from '../src/services/notice-attendance.js';

after(async () => { await pool.end(); });
const date = new Date('2099-01-10T20:00:00Z');
const base = (): EventSnapshot => ({ autor_id: '1', titulo: 'Jornada vecinal', estado: 'publicado', fecha_evento: date, vence_en: null, revision_evento: 0 });
function app() {
  const value = express(); value.use(express.json());
  value.use((req, _res, next) => { req.userId = req.get('X-Test-User') || ''; next(); });
  value.use('/api', notices, notifications); value.use(errorHandler); return value;
}

test('confirmar y retirar asistencia es idempotente; solo se aceptan confirmaciones en actividades vigentes', async context => {
  config.dbConfigured = true;
  const event = base(); const attendees = new Set<string>(); let locks = 0;
  const connection = {
    beginTransaction: async () => undefined, commit: async () => undefined, rollback: async () => undefined, release: () => undefined,
    execute: async (sql: string, params: unknown[]) => {
      if (sql.startsWith('SELECT a.autor_id')) { assert.match(sql, /FOR UPDATE$/); locks++; return [[{ autor_id: event.autor_id, estado: event.estado, fechaEvento: event.fecha_evento, venceEn: event.vence_en }]]; }
      if (sql.startsWith('INSERT INTO asistencias_avisos')) { assert.match(sql, /ON DUPLICATE KEY UPDATE confirmada = 1/); attendees.add(String(params[1])); return [{ affectedRows: 1 }]; }
      if (sql.startsWith('UPDATE asistencias_avisos')) { attendees.delete(String(params[1])); return [{ affectedRows: 1 }]; }
      throw new Error('SQL inesperado');
    },
  };
  context.mock.method(pool, 'getConnection', async () => connection);
  const api = app();
  await request(api).put('/api/avisos/42/asistencia').send({ asistire: true }).expect(401);
  await request(api).put('/api/avisos/42/asistencia').set('X-Test-User', '1').send({ asistire: true }).expect(400);
  await request(api).put('/api/avisos/42/asistencia').set('X-Test-User', '2').send({ asistire: true, usuarioId: '3' }).expect(400);
  for (let i = 0; i < 2; i++) await request(api).put('/api/avisos/42/asistencia').set('X-Test-User', '2').send({ asistire: true }).expect(200);
  assert.equal(attendees.size, 1);
  event.estado = 'cancelado';
  await request(api).put('/api/avisos/42/asistencia').set('X-Test-User', '3').send({ asistire: true }).expect(409);
  for (let i = 0; i < 2; i++) await request(api).put('/api/avisos/42/asistencia').set('X-Test-User', '2').send({ asistire: false }).expect(200);
  assert.equal(attendees.size, 0);
  event.estado = 'publicado'; event.fecha_evento = new Date('2000-01-01T00:00:00Z');
  await request(api).put('/api/avisos/42/asistencia').set('X-Test-User', '2').send({ asistire: true }).expect(409);
  assert.ok(locks >= 7);
});

test('postergar y cancelar notifican una vez a los asistentes actuales, solo por decisión del organizador', async context => {
  config.dbConfigured = true;
  const event = base(); const recipients: { user: string; revision: number; text: string }[] = [];
  const attendees = new Set(['2', '3']); let rolls = 0, failFanout = false;
  let snapshot = { ...event };
  const connection = {
    beginTransaction: async () => { snapshot = { ...event }; }, commit: async () => undefined, rollback: async () => { rolls++; Object.assign(event, snapshot); }, release: () => undefined,
    execute: async (sql: string, params: unknown[]) => {
      if (sql.startsWith('SELECT autor_id')) return [[{ ...event }]];
      if (sql.startsWith('UPDATE avisos SET revision_evento')) { assert.equal(params[2], event.revision_evento === 0 ? 'postergado' : 'cancelado'); event.revision_evento = Number(params[0]); return [{ affectedRows: 1 }]; }
      if (sql.startsWith('INSERT INTO notificaciones_avisos')) {
        if (failFanout) throw new Error('Fallo simulado de persistencia');
        assert.match(sql, /aa\.confirmada = 1/); assert.match(sql, /aa\.usuario_id <> \?/); assert.match(sql, /u\.estado_cuenta = 'activo'/);
        for (const user of attendees) recipients.push({ user, revision: Number(params[0]), text: String(params[1]) });
        return [{ affectedRows: attendees.size }];
      }
      if (sql.startsWith('UPDATE avisos SET fecha_evento')) { event.fecha_evento = params[0] as Date; event.vence_en = null; return [{ affectedRows: 1 }]; }
      if (sql.startsWith("UPDATE avisos SET estado = 'cancelado'")) { event.estado = 'cancelado'; return [{ affectedRows: 1 }]; }
      throw new Error(`SQL inesperado: ${sql.slice(0, 40)}`);
    },
  };
  context.mock.method(pool, 'getConnection', async () => connection);
  context.mock.method(pool, 'execute', async () => [[{ id: '42', autorId: '1', fechaEvento: event.fecha_evento, estado: event.estado, revisionEvento: event.revision_evento }]]);
  const api = app();
  const later = { accion: 'postergar', fechaEvento: '2099-01-12T20:00:00Z', motivo: 'Necesitamos más participación', revisionEvento: 0 };
  await request(api).post('/api/avisos/42/cambios').send(later).expect(401);
  await request(api).post('/api/avisos/42/cambios').set('X-Test-User', '2').send(later).expect(403);
  await request(api).post('/api/avisos/42/cambios').set('X-Test-User', '1').send({ ...later, fechaEvento: '2099-01-09T20:00:00Z' }).expect(400);
  await request(api).post('/api/avisos/42/cambios').set('X-Test-User', '1').send({ ...later, fechaEvento: '2000-01-01T00:00:00Z' }).expect(400);
  assert.equal(recipients.length, 0);
  failFanout = true;
  await request(api).post('/api/avisos/42/cambios').set('X-Test-User', '1').send(later).expect(500);
  assert.equal(event.revision_evento, 0); assert.equal(event.fecha_evento?.getTime(), date.getTime());
  assert.equal(recipients.length, 0);
  failFanout = false;
  for (let i = 0; i < 2; i++) await request(api).post('/api/avisos/42/cambios').set('X-Test-User', '1').send(later).expect(200);
  assert.equal(recipients.length, 2); assert.equal(event.revision_evento, 1);
  assert.match(recipients[0].text, /2099/); assert.match(recipients[0].text, /Necesitamos más participación/);
  attendees.delete('3');
  const cancel = { accion: 'cancelar', motivo: 'No se llegó a la participación necesaria', revisionEvento: 1 };
  await request(api).post('/api/avisos/42/cambios').set('X-Test-User', '1').send({ ...cancel, revisionEvento: 0 }).expect(409);
  for (let i = 0; i < 2; i++) await request(api).post('/api/avisos/42/cambios').set('X-Test-User', '1').send(cancel).expect(200);
  assert.equal(recipients.length, 3); assert.equal(recipients[2].user, '2'); assert.equal(recipients[2].revision, 2);
  assert.equal(event.estado, 'cancelado'); assert.ok(rolls >= 4);
});

test('las ediciones de fechas también notifican y un error al guardar notificaciones aborta la operación', async () => {
  const statements: string[] = [];
  const connection = { execute: async (sql: string) => { statements.push(sql); if (sql.startsWith('INSERT INTO')) throw new Error('Fallo simulado'); return [{ affectedRows: 1 }]; } } as unknown as PoolConnection;
  assert.equal(await notifyEventChange(connection, '42', base(), { titulo: 'Solo cambia el título' }), false);
  assert.equal(statements.length, 0);
  await assert.rejects(notifyEventChange(connection, '42', base(), { fechaEvento: '2099-01-12T20:00:00Z' }), /Fallo simulado/);
  assert.equal(statements.length, 2);
});

test('las notificaciones y sus lecturas pertenecen únicamente al usuario autenticado', async context => {
  config.dbConfigured = true;
  const id = '123e4567-e89b-42d3-a456-426614174000';
  const seen: unknown[][] = [];
  context.mock.method(pool, 'execute', async (sql: string, params: unknown[]) => {
    seen.push(params);
    if (sql.startsWith('SELECT notificacion_id')) {
      assert.match(sql, /WHERE usuario_id = \?/);
      return [params[0] === '2' ? [{ id, text: 'Actividad cancelada', createdAt: new Date(), read: 0, avisoId: '42' }] : []];
    }
    assert.match(sql, /WHERE usuario_id = \? AND notificacion_id IN/);
    return [{ affectedRows: params[0] === '2' ? 1 : 0 }];
  });
  const api = app();
  await request(api).get('/api/notificaciones').expect(401);
  await request(api).get('/api/notificaciones').set({ 'X-Test-User': '2', 'X-AYNI-User': '3' }).expect(409);
  const received = await request(api).get('/api/notificaciones').set('X-Test-User', '2').expect('Cache-Control', 'no-store').expect(200);
  assert.equal(received.body.data.length, 1); assert.equal(received.body.data[0].read, false);
  assert.equal((await request(api).get('/api/notificaciones').set('X-Test-User', '3').expect(200)).body.data.length, 0);
  await request(api).post('/api/notificaciones/leidas').set('X-Test-User', '3').send({ ids: [id] }).expect(200);
  assert.deepEqual(seen.at(-1), ['3', id]);
  await request(api).post('/api/notificaciones/leidas').set('X-Test-User', '2').send({ ids: [id], usuarioId: '3' }).expect(400);
});
