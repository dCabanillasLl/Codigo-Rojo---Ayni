import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import express from 'express';
import request from 'supertest';
import locations from '../src/routes/locations.js';
import { errorHandler } from '../src/middlewares/errors.js';

const previousProvider = process.env.PLACES_API_URL;
process.env.PLACES_API_URL = 'https://places.example.test/';
after(() => { if (previousProvider === undefined) delete process.env.PLACES_API_URL; else process.env.PLACES_API_URL = previousProvider; });
const app = express(); app.use('/api', locations); app.use(errorHandler);
const feature = (properties: Record<string, unknown>, coordinates: unknown[] = [-77.063, -12.074]) => ({ type: 'Feature', geometry: { type: 'Point', coordinates }, properties });

test('las sugerencias validan el texto y las coordenadas antes de consultar un proveedor', async context => {
  let calls = 0;
  context.mock.method(globalThis, 'fetch', async () => { calls++; throw new Error('No debe consultar'); });
  for (const query of [{ q: 'ab' }, { q: 'Calle válida', latitud: '-12' }, { q: 'Calle válida', latitud: '91', longitud: '-77' }]) {
    await request(app).get('/api/ubicaciones/sugerencias').query(query).expect(400);
  }
  await request(app).get('/api/ubicaciones/reversa').query({ latitud: -12 }).expect(400);
  await request(app).get('/api/ubicaciones/reversa').query({ latitud: -12, longitud: 181 }).expect(400);
  assert.equal(calls, 0);
});

test('sugerencias de calles usan Photon, filtran resultados inválidos y comparten caché sin repetir llamadas', async context => {
  let calls = 0;
  context.mock.method(globalThis, 'fetch', async (url: string | URL) => {
    calls++;
    const parsed = new URL(url);
    assert.equal(parsed.hostname, 'places.example.test');
    assert.equal(parsed.pathname, '/api/');
    assert.equal(parsed.searchParams.get('countrycode'), 'PE');
    assert.equal(parsed.searchParams.get('lat'), '-12.074');
    return new Response(JSON.stringify({ features: [
      feature({ osm_type: 'W', osm_id: 12, name: 'Avenida Bolívar', street: 'Avenida Bolívar', housenumber: '42', city: 'Lima', state: 'Lima', country: 'Perú', countrycode: 'PE' }),
      feature({ osm_id: 13, name: 'Otra calle', countrycode: 'US' }),
      feature({ osm_id: 14, name: 'Punto inválido', countrycode: 'PE' }, [999, -12]),
      feature({ osm_id: 15, name: 'Punto inválido', countrycode: 'PE' }, [null, -12]),
    ] }));
  });
  const query = { q: 'Avenida Bolívar prueba', latitud: -12.074, longitud: -77.063 };
  const [first, second] = await Promise.all([
    request(app).get('/api/ubicaciones/sugerencias').query(query).expect(200),
    request(app).get('/api/ubicaciones/sugerencias').query(query).expect(200),
  ]);
  assert.equal(calls, 1);
  assert.deepEqual(first.body.data, [{ id: 'W:12', nombre: 'Avenida Bolívar 42, Lima, Perú', latitud: -12.074, longitud: -77.063 }]);
  assert.deepEqual(first.body.data, second.body.data);
  const cached = await request(app).get('/api/ubicaciones/sugerencias').query(query).expect(200);
  assert.equal(calls, 1);
  assert.deepEqual(cached.body, first.body);
});

test('un punto del mapa devuelve una dirección editable sin reemplazar las coordenadas del usuario', async context => {
  let calls = 0;
  context.mock.method(globalThis, 'fetch', async (url: string | URL) => {
    calls++;
    const parsed = new URL(url);
    assert.equal(parsed.pathname, '/reverse');
    assert.equal(parsed.searchParams.get('lat'), '-12.07');
    assert.equal(parsed.searchParams.get('lon'), '-77.06');
    return new Response(JSON.stringify({ features: [feature({ osm_type: 'N', osm_id: 20, name: 'Negocio cercano', street: 'Calle de prueba', housenumber: '123', district: 'Pueblo Libre', city: 'Lima', country: 'Perú' }, [-77.061, -12.071])] }));
  });
  const response = await request(app).get('/api/ubicaciones/reversa').query({ latitud: -12.07, longitud: -77.06 }).expect(200);
  assert.deepEqual(response.body.data, { direccion: 'Calle de prueba 123, Pueblo Libre, Lima, Perú' });
  assert.match(response.headers['cache-control'], /no-store/);
  await request(app).get('/api/ubicaciones/reversa').query({ latitud: -12.07, longitud: -77.06 }).expect(200);
  assert.equal(calls, 1);
});

test('sin dirección cercana se puede conservar el punto y escribir una referencia manual', async context => {
  context.mock.method(globalThis, 'fetch', async () => new Response(JSON.stringify({ features: [] })));
  const response = await request(app).get('/api/ubicaciones/reversa').query({ latitud: -12.08, longitud: -77.08 }).expect(200);
  assert.deepEqual(response.body.data, { direccion: null });
});

test('la caída del proveedor produce un error controlado y no inventa direcciones', async context => {
  context.mock.method(globalThis, 'fetch', async () => { throw new Error('Datos internos privados'); });
  const response = await request(app).get('/api/ubicaciones/reversa').query({ latitud: -12.09, longitud: -77.09 }).expect(503);
  assert.equal(response.body.error.code, 'PLACE_LOOKUP_UNAVAILABLE');
  assert.ok(!JSON.stringify(response.body).includes('Datos internos privados'));
});
