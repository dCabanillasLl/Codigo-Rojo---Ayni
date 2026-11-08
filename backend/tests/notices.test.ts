import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { after, test } from 'node:test';
import express from 'express';
import request from 'supertest';
import sharp from 'sharp';
import { config } from '../src/config.js';
import { pool } from '../src/db/index.js';
import notices from '../src/routes/notices.js';
import { defaultJson } from '../src/middlewares/json.js';
import { protectMutations } from '../src/middlewares/security.js';
import { errorHandler } from '../src/middlewares/errors.js';
import { noticeExpired, validateNoticeDates } from '../src/lib/notices.js';
import { noticeStatus, noticeVisible, localDateTimeInput } from '../../src/lib/notices.js';

after(async () => { await pool.end(); });
const origin = 'http://localhost:8444';
const headers = { Origin: origin, 'X-AYNI-Client': 'web', 'X-Test-User': '1' };

test('las etiquetas distinguen postergaciones y priorizan cancelación o vencimiento sobre cambios anteriores', () => {
  const now = Date.parse('2030-01-01T00:00:00Z');
  const item = { estado: 'publicado', fechaEvento: '2030-02-01T00:00:00Z', venceEn: null, revisionEvento: 0, ultimoCambioEvento: null as string | null };
  assert.equal(noticeStatus(item, now).label, 'VIGENTE');
  const postponed = { ...item, revisionEvento: 1, ultimoCambioEvento: 'postergado' };
  assert.equal(noticeStatus(postponed, now).label, 'POSTERGADO');
  assert.equal(noticeStatus({ ...postponed, estado: 'cancelado' }, now).label, 'CANCELADO');
  assert.equal(noticeStatus(postponed, Date.parse(item.fechaEvento)).label, 'VENCIDO');
  assert.equal(noticeStatus({ ...postponed, venceEn: '2029-12-31T23:00:00Z' }, now).label, 'VENCIDO');
  assert.equal(noticeStatus({ ...postponed, ultimoCambioEvento: 'reprogramado' }, now).label, 'REPROGRAMADO');
  assert.equal(noticeStatus({ ...postponed, ultimoCambioEvento: null }, now).label, 'ACTUALIZADO');
  assert.equal(noticeStatus({ ...item, estado: 'borrador' }, now).label, 'BORRADOR');
});

test('los avisos vencen exactamente en la fecha de actividad o en un vencimiento anterior, también en caché', () => {
  const date = '2030-01-10T15:30:00-05:00';
  const deadline = Date.parse(date);
  const item = { estado: 'publicado', fechaEvento: date, venceEn: null };
  assert.equal(noticeExpired(item, deadline - 1), false);
  assert.equal(noticeVisible(item, deadline - 1), true);
  assert.equal(noticeExpired(item, deadline), true);
  assert.equal(noticeVisible(item, deadline), false);
  assert.equal(noticeVisible(item, deadline + 1000), false);
  const earlier = { ...item, venceEn: new Date(deadline - 1000).toISOString() };
  assert.equal(noticeExpired(earlier, deadline - 500), true);
  assert.equal(noticeVisible(earlier, deadline - 500), false);
  assert.equal(noticeVisible({ ...item, estado: 'cancelado' }, deadline - 1), false);
  // Legacy notices without dates remain visible; do not invent a deadline for them.
  assert.equal(noticeVisible({ ...item, fechaEvento: null }), true);
});

test('crear avisos exige fecha futura y el input conserva la hora local del dispositivo', () => {
  assert.throws(() => validateNoticeDates({}, true), { code: 'EVENT_DATE_REQUIRED' });
  assert.throws(() => validateNoticeDates({ fechaEvento: '2000-01-01T00:00:00Z' }, true), { code: 'INVALID_EXPIRY' });
  assert.throws(() => validateNoticeDates({ fechaEvento: '2099-01-01T00:00:00Z', venceEn: '2000-01-01T00:00:00Z' }, true), { code: 'INVALID_EXPIRY' });
  const date = new Date(2030, 0, 10, 15, 30);
  assert.equal(localDateTimeInput(date), '2030-01-10T15:30');
});

test('subir, reemplazar y quitar un flyer respeta permisos, fechas y acceso tras el vencimiento', async context => {
  // Isolated SQL fixtures: no real account, flyer or notice is written to Aiven.
  config.dbConfigured = true;
  let now = Date.parse('2030-01-01T12:00:00Z');
  context.mock.method(Date, 'now', () => now);
  const state = { imagen: null as Buffer | null, imagen_hash: null as string | null, imagenUrl: null as string | null, estado: 'publicado', fechaEvento: new Date(now + 60_000), venceEn: null as Date | null };
  const result = () => ({ id: '42', autorId: '1', ...state, estado: state.estado === 'publicado' && noticeExpired(state) ? 'vencido' : state.estado, imagenUrl: state.imagen_hash ? `/api/avisos/42/imagen?v=${state.imagen_hash}` : state.imagenUrl });
  const connection = {
    beginTransaction: async () => undefined, commit: async () => undefined, rollback: async () => undefined, release: () => undefined,
    execute: async (sql: string, values: unknown[]) => {
      if (sql.startsWith('SELECT sector_id')) return [[{ sector_id: '1' }]];
      if (sql.startsWith('SELECT l.ubicacion_id')) return [[{ ubicacion_id: '2' }]];
      if (sql.startsWith('INSERT INTO avisos')) {
        state.estado = String(values[5]); state.fechaEvento = values[6] as Date;
        state.venceEn = values[7] as Date | null; state.imagenUrl = values[8] as string | null;
        state.imagen = values[9] as Buffer | null; state.imagen_hash = values[10] as string | null;
        return [{ insertId: 42 }];
      }
      if (sql.startsWith('SELECT autor_id')) return [[{ autor_id: 1, fecha_evento: state.fechaEvento, vence_en: state.venceEn }]];
      if (sql.startsWith('UPDATE avisos SET')) {
        const fields = sql.slice('UPDATE avisos SET '.length, sql.indexOf(' WHERE')).split(', ').map(field => field.split(' = ')[0]);
        fields.forEach((field, index) => {
          if (field === 'imagen') state.imagen = values[index] as Buffer | null;
          if (field === 'imagen_hash') state.imagen_hash = values[index] as string | null;
          if (field === 'imagen_url') state.imagenUrl = values[index] as string | null;
        });
        return [{ affectedRows: 1 }];
      }
      throw new Error('SQL inesperado en fixture');
    },
  };
  context.mock.method(pool, 'getConnection', async () => connection);
  context.mock.method(pool, 'execute', async (sql: string) => {
    if (sql.startsWith('SELECT a.imagen,')) return [[{ ...state, autorId: '1' }]];
    if (sql.includes('ORDER BY')) {
      assert.match(sql, /a\.fecha_evento > UTC_TIMESTAMP\(\)/);
      assert.match(sql, /a\.vence_en > UTC_TIMESTAMP\(\)/);
      return [[...(noticeExpired(state) ? [] : [result()])]];
    }
    return [[result()]];
  });
  const app = express();
  app.use(protectMutations([origin])); app.use(defaultJson);
  app.use((req, _res, next) => { req.userId = req.get('X-Test-User'); next(); });
  app.use('/api', notices); app.use(errorHandler);
  const body = { titulo: 'Actividad de prueba', contenido: 'Flyer de prueba', categoriaId: '1', sectorId: '1', fechaEvento: state.fechaEvento.toISOString() };
  const input = await sharp(randomBytes(240 * 240 * 3), { raw: { width: 240, height: 240, channels: 3 } }).png().toBuffer();
  const foto = `data:image/png;base64,${input.toString('base64')}`;
  assert.ok(foto.length > 64 * 1024);
  await request(app).post('/api/avisos').set({ Origin: origin, 'X-AYNI-Client': 'web' }).send({ ...body, foto }).expect(401);
  await request(app).post('/api/avisos').set(headers).send({ ...body, fechaEvento: undefined }).expect(400);
  await request(app).post('/api/avisos').set(headers).send({ ...body, fechaEvento: '2000-01-01T00:00:00Z' }).expect(400);
  await request(app).post('/api/avisos').set(headers).send({ ...body, foto: 'data:image/png;base64,AAAA' }).expect(400);
  const created = await request(app).post('/api/avisos').set(headers).send({ ...body, foto }).expect(201);
  assert.match(created.body.data.imagenUrl, /^\/api\/avisos\/42\/imagen\?v=[a-f0-9]{64}$/);
  assert.equal((await sharp(state.imagen!).metadata()).format, 'jpeg');
  const originalHash = state.imagen_hash;
  await request(app).get('/api/avisos/42/imagen').expect('Content-Type', /image\/jpeg/).expect(200);
  await request(app).patch('/api/avisos/42').set({ ...headers, 'X-Test-User': '2' }).send({ foto: null }).expect(403);
  assert.equal(state.imagen_hash, originalHash);
  await request(app).patch('/api/avisos/42').set(headers).send({ contenido: 'Solo cambia el texto' }).expect(200);
  assert.equal(state.imagen_hash, originalHash);
  const replacement = await sharp({ create: { width: 10, height: 20, channels: 3, background: '#125533' } }).png().toBuffer();
  await request(app).patch('/api/avisos/42').set(headers).send({ foto: `data:image/png;base64,${replacement.toString('base64')}` }).expect(200);
  assert.notEqual(state.imagen_hash, originalHash);
  await request(app).get(`/api/avisos/42/imagen?v=${originalHash}`).expect(404);
  await request(app).patch('/api/avisos/42').set(headers).send({ foto: null }).expect(200);
  await request(app).get('/api/avisos/42/imagen').expect(404);
  await request(app).patch('/api/avisos/42').set(headers).send({ foto }).expect(200);
  await request(app).patch('/api/avisos/42').set(headers).send({ fechaEvento: null }).expect(400);
  assert.equal((await request(app).get('/api/avisos').expect('Cache-Control', 'no-store').expect(200)).body.data.length, 1);
  now = state.fechaEvento.getTime();
  assert.equal((await request(app).get('/api/avisos').expect(200)).body.data.length, 0);
  await request(app).get('/api/avisos/42').expect(404);
  await request(app).get('/api/avisos/42/imagen').expect(404);
  assert.equal((await request(app).get('/api/avisos/42').set('X-Test-User', '1').expect(200)).body.data.estado, 'vencido');
  await request(app).get('/api/avisos/42/imagen').set('X-Test-User', '1').expect(200);
});
