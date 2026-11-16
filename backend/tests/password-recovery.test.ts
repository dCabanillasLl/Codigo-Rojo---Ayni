import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import { config } from '../src/config.js';
import { pool } from '../src/db/index.js';
import { passwordRecoveryRouter } from '../src/routes/password-recovery.js';
import { errorHandler } from '../src/middlewares/errors.js';

test('recuperacion: correo confirmado, reenvio, caducidad, intentos y uso unico', async t => {
  const original = { secret: config.jwtSecret, email: config.emailConfigured, db: config.dbConfigured };
  config.jwtSecret = 'synthetic-recovery-secret-at-least-32-characters'; config.emailConfigured = true; config.dbConfigured = true;
  t.after(() => { config.jwtSecret = original.secret; config.emailConfigured = original.email; config.dbConfigured = original.db; });
  let hash = await bcrypt.hash('Original-123', 4);
  let saved: any = null;
  let eligible = true;
  let failDelivery = false;
  let sends = 0;
  let code = '';
  let commits = 0;
  const execute = async (sql: string, args: any[]) => {
    if (sql.includes('FROM usuarios')) return [eligible ? [{ id: '1', hash }] : [], []];
    if (sql.includes('SELECT usuario_id FROM recuperaciones')) return [saved?.recent ? [{ usuario_id: '1' }] : [], []];
    if (sql.startsWith('INSERT INTO recuperaciones')) { saved = { codigo_hash: args[2], credencial_hash: args[3], intentos: 0, recent: true, expired: false }; return [{ affectedRows: 1 }, []]; }
    if (sql.startsWith('SELECT codigo_hash')) return [saved && !saved.expired ? [saved] : [], []];
    if (sql.includes('SET intentos')) { saved.intentos++; return [{ affectedRows: 1 }, []]; }
    if (sql.startsWith('UPDATE usuarios')) { hash = args[0]; return [{ affectedRows: 1 }, []]; }
    if (sql.startsWith('DELETE FROM recuperaciones')) { saved = null; return [{ affectedRows: 1 }, []]; }
    throw new Error('Unexpected test query');
  };
  t.mock.method(pool, 'getConnection', async () => ({ execute, beginTransaction: async () => {}, commit: async () => { commits++; }, rollback: async () => {}, release: () => {} }));
  t.mock.method(pool, 'execute', execute);
  const sender = async (_to: string, _subject: string, text: string) => { sends++; code = text.match(/\b[0-9]{6}\b/)![0]; return { sent: !failDelivery }; };
  const app = () => { const result = express(); result.use(express.json(), passwordRecoveryRouter(sender), errorHandler); return result; };
  let server = app();
  const send = () => request(server).post('/auth/password/recovery').send({ correo: 'prueba@example.com' });
  const reset = (codigo = code) => request(server).post('/auth/password/reset').send({ correo: 'prueba@example.com', codigo, nueva: 'Nueva-clave-456', confirmacion: 'Nueva-clave-456' });
  const first = await send().expect(200);
  assert.equal(sends, 1); assert.notEqual(saved.codigo_hash, code);
  await send().expect(200); assert.equal(sends, 1); // account cooldown
  eligible = false;
  assert.deepEqual((await send().expect(200)).body, first.body);
  await reset().expect(400); assert.equal(sends, 1);
  eligible = true;
  saved.expired = true; await reset().expect(400); saved.expired = false;
  const wrong = code === '111111' ? '222222' : '111111';
  for (let i = 0; i < 5; i++) await reset(wrong).expect(400);
  assert.equal(saved.intentos, 5); assert.ok(commits >= 5);
  await reset().expect(400);
  saved.recent = false;
  const oldHash = saved.codigo_hash;
  await send().expect(200); assert.equal(saved.intentos, 0); assert.notEqual(saved.codigo_hash, oldHash);
  await reset().expect(200);
  assert.ok(await bcrypt.compare('Nueva-clave-456', hash));
  assert.equal(await bcrypt.compare('Original-123', hash), false);
  assert.equal(saved, null); await reset().expect(400);
  // A password changed through the profile invalidates a previously issued code.
  server = app(); await send().expect(200);
  hash = await bcrypt.hash('Changed-elsewhere-123', 4);
  await reset().expect(400);
  saved.recent = false; failDelivery = true;
  assert.deepEqual((await send().expect(200)).body, first.body); assert.equal(saved, null);
});
