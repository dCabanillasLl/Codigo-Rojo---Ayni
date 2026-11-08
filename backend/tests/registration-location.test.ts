import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { createHmac } from 'node:crypto';
import express from 'express';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { config } from '../src/config.js';
import { pool } from '../src/db/index.js';
import auth from '../src/routes/auth.js';
import { protectMutations } from '../src/middlewares/security.js';
import { errorHandler } from '../src/middlewares/errors.js';

after(async () => { await pool.end(); });

test('el registro conserva la referencia y el punto elegido, acepta referencia sola y rechaza coordenadas incompletas', async context => {
  // All database operations are isolated fixtures. No real account or DNI lookup is created.
  config.dbConfigured = true;
  config.jwtSecret = 'clave-ficticia-para-pruebas-de-registro';
  config.dniHashSecret = 'huella-ficticia-para-pruebas-de-registro';
  const saved: { direccion: string; latitud: number | null; longitud: number | null }[] = [];
  const connection = {
    beginTransaction: async () => undefined, commit: async () => undefined, rollback: async () => undefined, release: () => undefined,
    execute: async (sql: string, values: unknown[]) => {
      if (sql.startsWith('SELECT sector_id')) return [[{ sector_id: 1 }]];
      if (sql.startsWith('INSERT INTO ubicaciones')) {
        saved.push({ direccion: values[1] as string, latitud: values[2] as number | null, longitud: values[3] as number | null });
        return [{ insertId: 10 }];
      }
      if (sql.startsWith('INSERT INTO usuarios')) return [{ insertId: 42 }];
      throw new Error('Consulta inesperada en la prueba de registro');
    },
  };
  context.mock.method(pool, 'getConnection', async () => connection);
  context.mock.method(pool, 'execute', async () => [[{ id: '42', nombres: 'Vecina', apellidos: 'De prueba', sectorId: '1', sectorNombre: 'Pueblo Libre', ...saved.at(-1) }]]);
  const origin = 'http://localhost:8444';
  const app = express();
  app.use(protectMutations([origin]), express.json());
  app.use('/api', auth); app.use(errorHandler);
  const dni = '00000000';
  const dniHash = createHmac('sha256', config.dniHashSecret).update(dni).digest('hex');
  const dniProof = jwt.sign({ dniHash, nombres: 'Vecina', apellidos: 'De prueba' }, config.jwtSecret,
    { algorithm: 'HS256', issuer: 'ayni-api', audience: 'ayni-dni-prefill', expiresIn: '5m' });
  const base = { nombres: 'Vecina', apellidos: 'De prueba', contrasena: 'Clave-ficticia-de-prueba', dni, consentimientoDni: true, dniProof };
  const headers = { Origin: origin, 'X-AYNI-Client': 'web' };
  for (const location of [
    { direccion: 'Entrada del parque', latitud: -12.074321, longitud: -77.063219 },
    { direccion: 'Referencia escrita sin GPS' },
    { direccion: 'Punto con coordenadas cero', latitud: 0, longitud: 0 },
  ]) {
    const response = await request(app).post('/api/auth/register').set(headers).send({ ...base, ...location }).expect(201);
    const expected = { direccion: location.direccion, latitud: location.latitud ?? null, longitud: location.longitud ?? null };
    assert.deepEqual(saved.at(-1), expected);
    assert.equal(response.body.data.direccion, expected.direccion);
    assert.equal(response.body.data.latitud, expected.latitud);
    assert.equal(response.body.data.longitud, expected.longitud);
    assert.equal(response.body.data.sectorId, '1');
    assert.ok(response.headers['set-cookie']);
  }
  await request(app).post('/api/auth/register').set(headers).send({ ...base, direccion: 'Referencia de prueba', latitud: -12.07 }).expect(400);
  await request(app).post('/api/auth/register').set(headers).send({ ...base, direccion: ' ' }).expect(400);
  assert.equal(saved.length, 3, 'Un registro inválido no debe crear ubicaciones');
});
