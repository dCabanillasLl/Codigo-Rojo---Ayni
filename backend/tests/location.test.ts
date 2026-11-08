import assert from 'node:assert/strict';
import test from 'node:test';
import type { PoolConnection } from 'mysql2/promise';
import { locationSchema } from '../src/lib/validation.js';
import { resolveLocation } from '../src/lib/location.js';
import { contentHash, requireSameContent } from '../src/services/community-rules.js';
import { searchAddresses } from '../src/services/geocoding.js';
import { areaQuery, postingSector } from '../../src/lib/location.js';

test('buscar por ubicación incluye puntos de cualquier sector y sin ubicación no aplica filtros geográficos', () => {
  const legacyArea = { sectorId: '4', coordinates: { latitude: -12.074, longitude: -77.063 }, radius: 1500 };
  const params = areaQuery(legacyArea);
  assert.deepEqual(Object.fromEntries(params), { latitud: '-12.074', longitud: '-77.063', radio: '1500' });
  assert.equal(areaQuery({ ...legacyArea, coordinates: null }).toString(), '');
});

test('publicar sin selector conserva la asociación del perfil o usa la zona base configurada', () => {
  const sectors = [{ id: '4', nombre: 'Sector 4', distrito: 'Pueblo Libre', ciudad: 'Lima' }, { id: '9', nombre: 'Pueblo Libre', distrito: 'Pueblo Libre', ciudad: 'Lima' }];
  assert.equal(postingSector('2', null), '2');
  assert.equal(postingSector(null, sectors), '9');
  assert.equal(postingSector(null, [...sectors].reverse()), '9');
  assert.equal(postingSector(null, null), '');
});

test('el punto de una publicación exige ambas coordenadas válidas y rechaza campos ajenos', () => {
  assert.equal(locationSchema.safeParse({ latitud: -12.074 }).success, false);
  for (const point of [{ latitud: 91, longitud: 0 }, { latitud: 0, longitud: -181 }, { latitud: NaN, longitud: 0 }, { latitud: 0, longitud: Infinity }]) {
    assert.equal(locationSchema.safeParse(point).success, false);
  }
  assert.equal(locationSchema.safeParse({ latitud: -12.074, longitud: -77.063, usuarioId: '2' }).success, false);
  assert.deepEqual(locationSchema.parse({ latitud: 0, longitud: 0, direccion: '  Parque  ' }), { latitud: 0, longitud: 0, direccion: 'Parque' });
});

test('un punto explícito crea una ubicación independiente sin alterar la del perfil', async () => {
  const calls: { sql: string; values: unknown[] }[] = [];
  const connection = { execute: async (sql: string, values: unknown[]) => {
    calls.push({ sql, values });
    return sql.startsWith('SELECT') ? [[{ sector_id: '2' }]] : [{ insertId: 70 }];
  } } as unknown as PoolConnection;
  const result = await resolveLocation(connection, '5', '2', { latitud: -12.074321, longitud: -77.063219, direccion: 'Referencia privada' });
  assert.equal(result, '70');
  assert.equal(calls.length, 2);
  assert.ok(calls[1].sql.startsWith('INSERT INTO ubicaciones'));
  assert.deepEqual(calls[1].values, ['2', 'Referencia privada', -12.074321, -77.063219]);
  assert.ok(calls.every(call => !/UPDATE|DELETE/.test(call.sql)));
});

test('no se guarda un punto bajo una comunidad inexistente', async () => {
  let calls = 0;
  const connection = { execute: async () => { calls++; return [[]]; } } as unknown as PoolConnection;
  await assert.rejects(resolveLocation(connection, '5', '99', { latitud: 0, longitud: 0 }), { code: 'INVALID_SECTOR' });
  assert.equal(calls, 1);
});

test('sin punto explícito se conserva la ubicación del perfil solo si es de la comunidad elegida', async () => {
  const connection = { execute: async (sql: string) => sql.includes('FROM sectores_vecinales') ? [[{ sector_id: '2' }]] : [[{ ubicacion_id: '60' }]] } as unknown as PoolConnection;
  assert.equal(await resolveLocation(connection, '5', '2'), '60');
});

test('el mismo pedido offline no puede reintentarse en un punto diferente con el mismo UUID', () => {
  const original = { descripcion: 'Necesito ayuda', ubicacion: { latitud: -12.074, longitud: -77.063 } };
  const saved = contentHash(original);
  assert.doesNotThrow(() => requireSameContent(saved, contentHash(JSON.parse(JSON.stringify(original)))));
  assert.throws(() => requireSameContent(saved, contentHash({ ...original, ubicacion: { latitud: -12.08, longitud: -77.06 } })), { code: 'IDEMPOTENCY_CONFLICT' });
});

test('búsqueda de direcciones reutiliza caché, limita consultas y maneja la caída del proveedor', async context => {
  let calls = 0;
  const fetchMock = context.mock.method(globalThis, 'fetch', async (url: URL | string) => {
    calls++;
    const parsed = new URL(url);
    assert.equal(parsed.hostname, 'nominatim.openstreetmap.org');
    assert.equal(parsed.searchParams.get('countrycodes'), 'pe');
    return new Response(JSON.stringify([{ place_id: 12, display_name: 'Parque de prueba', lat: '-12.074', lon: '-77.063' }, { place_id: 13, display_name: 'Punto inválido', lat: '999', lon: '0' }]));
  });
  const first = await searchAddresses('Parque de prueba');
  assert.deepEqual(first, [{ id: '12', nombre: 'Parque de prueba', latitud: -12.074, longitud: -77.063 }]);
  assert.deepEqual(await searchAddresses('PARQUE DE PRUEBA'), first);
  assert.equal(calls, 1);
  await assert.rejects(searchAddresses('Otro parque'), { code: 'GEOCODING_BUSY' });
  await new Promise(resolve => setTimeout(resolve, 1150));
  fetchMock.mock.mockImplementation(async () => { throw new Error('proveedor no disponible'); });
  await assert.rejects(searchAddresses('Otro parque'), { code: 'GEOCODING_UNAVAILABLE' });
});
