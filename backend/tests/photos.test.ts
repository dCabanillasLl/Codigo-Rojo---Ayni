import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import express from 'express';
import request from 'supertest';
import sharp from 'sharp';
import { preparePhoto, photoSchema, MAX_PHOTO_BYTES } from '../src/lib/photos.js';
import { defaultJson, publicationJson } from '../src/middlewares/json.js';
import { protectMutations } from '../src/middlewares/security.js';
import { requireAuth } from '../src/middlewares/auth.js';
import { errorHandler } from '../src/middlewares/errors.js';
import publications, { publicationFields } from '../src/routes/publications.js';
import { config } from '../src/config.js';
import { pool } from '../src/db/index.js';
// The migration runner is native JS and normalizes only line endings.
// @ts-expect-error JavaScript helper has no declaration file.
import { migrationChecksums } from '../scripts/migration-checksums.mjs';

const origin = 'http://localhost:8444';
const headers = { Origin: origin, 'X-AYNI-Client': 'web', 'X-Test-User': '1' };
const body = { categoriaId: '1', tipo: 'producto', titulo: 'Producto de prueba', modalidadPrecio: 'gratis', sectorId: '1' };
const dataUri = (buffer: Buffer, mime = 'image/png') => `data:${mime};base64,${buffer.toString('base64')}`;
after(async () => { await pool.end(); });

test('la foto es opcional; omitirla conserva la imagen y null indica quitarla', async () => {
  assert.equal(photoSchema.parse(undefined), undefined);
  assert.equal(photoSchema.parse(null), null);
  assert.equal(await preparePhoto(undefined), undefined);
  assert.equal(await preparePhoto(null), null);
  assert.equal(publicationFields.safeParse(body).success, true);
  assert.equal(publicationFields.safeParse({ ...body, tipo: 'servicio', foto: null }).success, true);
});

test('JPG, PNG y WebP se convierten en JPEG válido con una huella estable', async () => {
  for (const format of ['jpeg', 'png', 'webp'] as const) {
    const input = await sharp({ create: { width: 24, height: 18, channels: 4, background: '#efb35d' } }).toFormat(format).toBuffer();
    const result = (await preparePhoto(dataUri(input, `image/${format}`)))!;
    const metadata = await sharp(result.buffer).metadata();
    assert.equal(metadata.format, 'jpeg');
    assert.equal(metadata.width, 24);
    assert.equal(metadata.height, 18);
    assert.match(result.hash, /^[a-f0-9]{64}$/);
    assert.deepEqual(await preparePhoto(dataUri(input, `image/${format}`)), result);
  }
});

test('se reduce el tamaño, se corrige la orientación y se eliminan los metadatos privados', async () => {
  const big = await sharp({ create: { width: 2400, height: 1200, channels: 4, background: '#ffffff00' } }).png().toBuffer();
  const resized = (await preparePhoto(dataUri(big)))!;
  const metadata = await sharp(resized.buffer).metadata();
  assert.equal(metadata.width, 1600);
  assert.equal(metadata.height, 800);
  assert.ok(resized.buffer.length <= 2 * 1024 * 1024);
  const oriented = await sharp({ create: { width: 30, height: 10, channels: 3, background: '#39765d' } })
    .jpeg().withMetadata({ orientation: 6, exif: { IFD0: { Copyright: 'Metadatos privados de prueba' } } }).toBuffer();
  assert.ok((await sharp(oriented).metadata()).exif);
  const stripped = (await preparePhoto(dataUri(oriented, 'image/jpeg')))!;
  const output = await sharp(stripped.buffer).metadata();
  assert.equal(output.width, 10);
  assert.equal(output.height, 30);
  assert.equal(output.exif, undefined);
  assert.equal(output.icc, undefined);
  assert.equal(output.orientation, undefined);
});

test('se rechazan URLs, SVG, archivos renombrados, base64 corrupto y fotos mayores a 5 MB', async () => {
  for (const value of ['https://example.test/foto.jpg', 'data:image/svg+xml;base64,PHN2Zz4=', 'data:image/png;base64,%%%%', dataUri(Buffer.from('<svg/>')), dataUri(Buffer.from('no es una foto'), 'image/jpeg')]) {
    await assert.rejects(preparePhoto(value), { code: 'INVALID_PHOTO' });
  }
  const png = await sharp({ create: { width: 8, height: 8, channels: 3, background: '#ffffff' } }).png().toBuffer();
  await assert.rejects(preparePhoto(dataUri(png, 'image/jpeg')), { code: 'INVALID_PHOTO' });
  await assert.rejects(preparePhoto(dataUri(Buffer.alloc(MAX_PHOTO_BYTES + 1))), { code: 'PHOTO_TOO_LARGE' });
});

test('el JSON grande se limita a las rutas de publicaciones después de autenticar', async () => {
  const app = express();
  app.use(protectMutations([origin]));
  app.use(defaultJson);
  app.use((req, _res, next) => { if (req.get('X-Test-User') === '1') req.userId = '1'; next(); });
  app.post('/api/publicaciones', requireAuth, publicationJson, (req, res) => res.json({ length: req.body.text.length }));
  app.post('/api/otra', (req, res) => res.json(req.body));
  app.use(errorHandler);
  const payload = { text: 'x'.repeat(70_000) };
  await request(app).post('/api/publicaciones').set({ Origin: origin, 'X-AYNI-Client': 'web' }).send(payload).expect(401);
  const accepted = await request(app).post('/api/publicaciones').set(headers).send(payload).expect(200);
  assert.equal(accepted.body.length, 70_000);
  await request(app).post('/api/otra').set(headers).send(payload).expect(413);
  await request(app).post('/api/publicaciones').set(headers).set('Origin', 'https://otra.example').send(payload).expect(403);
  await request(app).post('/api/publicaciones').set(headers).type('form').send('foto=x').expect(415);
});

test('publicar, conservar, reemplazar y quitar una foto respeta al propietario y la visibilidad', async context => {
  // Isolated SQL fixture: no connection or writes to Aiven or any real user record.
  config.dbConfigured = true;
  const state: { imagen: Buffer | null; hash: string | null; titulo: string; estado: string } = { imagen: null, hash: null, titulo: '', estado: 'publicada' };
  const result = () => ({ id: '42', propietarioId: '1', titulo: state.titulo, estado: state.estado, imagenUrl: state.hash ? `/api/publicaciones/42/imagen?v=${state.hash}` : null });
  const connection = {
    beginTransaction: async () => undefined, commit: async () => undefined, rollback: async () => undefined, release: () => undefined,
    execute: async (sql: string, values: unknown[]) => {
      if (sql.startsWith('SELECT sector_id')) return [[{ sector_id: '1' }]];
      if (sql.startsWith('SELECT l.ubicacion_id')) return [[{ ubicacion_id: '2' }]];
      if (sql.startsWith('INSERT INTO publicaciones')) {
        state.titulo = String(values[4]); state.imagen = values[9] as Buffer | null; state.hash = values[10] as string | null;
        return [{ insertId: 42 }];
      }
      if (sql.startsWith('SELECT p.propietario_id')) return [[{ propietario_id: 1, modalidad_precio: 'gratis', precio: null, sector_id: '1' }]];
      if (sql.startsWith('UPDATE publicaciones SET')) {
        const fields = sql.slice('UPDATE publicaciones SET '.length, sql.indexOf(' WHERE')).split(', ').map(field => field.split(' = ')[0]);
        fields.forEach((field, index) => {
          if (field === 'imagen') state.imagen = values[index] as Buffer | null;
          if (field === 'imagen_hash') state.hash = values[index] as string | null;
          if (field === 'titulo') state.titulo = String(values[index]);
        });
        return [{ affectedRows: 1 }];
      }
      throw new Error('SQL inesperado en la prueba');
    },
  };
  context.mock.method(pool, 'getConnection', async () => connection);
  context.mock.method(pool, 'execute', async (sql: string) => sql.startsWith('SELECT p.imagen, p.imagen_hash')
    ? [[{ imagen: state.imagen, imagen_hash: state.hash, propietarioId: '1', estado: state.estado }]] : [[result()]]);
  const app = express();
  app.use(protectMutations([origin]), defaultJson);
  app.use((req, _res, next) => { const user = req.get('X-Test-User'); if (user) req.userId = user; next(); });
  app.use('/api', publications); app.use(errorHandler);
  const noPhoto = await request(app).post('/api/publicaciones').set(headers).send(body).expect(201);
  assert.equal(noPhoto.body.data.imagenUrl, null);
  await request(app).get('/api/publicaciones/42/imagen').expect(404);
  const input = await sharp({ create: { width: 12, height: 12, channels: 3, background: '#ffdd00' } }).png().toBuffer();
  const created = await request(app).post('/api/publicaciones').set(headers).send({ ...body, foto: dataUri(input) }).expect(201);
  const url = created.body.data.imagenUrl;
  assert.match(url, /^\/api\/publicaciones\/42\/imagen\?v=[a-f0-9]{64}$/);
  assert.ok(Buffer.isBuffer(state.imagen));
  const image = await request(app).get(url).expect(200).expect('Content-Type', /image\/jpeg/);
  assert.deepEqual(image.body, state.imagen);
  assert.match(image.headers['cache-control'], /private/);
  await request(app).get(url).set('If-None-Match', image.headers.etag).expect(304);
  const firstHash = state.hash;
  await request(app).patch('/api/publicaciones/42').set(headers).send({ titulo: 'Texto actualizado' }).expect(200);
  assert.equal(state.hash, firstHash, 'Editar texto no borra la foto');
  await request(app).patch('/api/publicaciones/42').set({ ...headers, 'X-Test-User': '2' }).send({ foto: null }).expect(403);
  assert.equal(state.hash, firstHash);
  state.estado = 'pausada';
  await request(app).get(url).expect(404);
  await request(app).get(url).set('X-Test-User', '2').expect(404);
  await request(app).get(url).set('X-Test-User', '1').expect(200);
  state.estado = 'publicada';
  const replacement = await sharp({ create: { width: 12, height: 12, channels: 3, background: '#3355dd' } }).webp().toBuffer();
  await request(app).patch('/api/publicaciones/42').set(headers).send({ foto: dataUri(replacement, 'image/webp') }).expect(200);
  assert.notEqual(state.hash, firstHash);
  await request(app).get(url).expect(404);
  const removed = await request(app).patch('/api/publicaciones/42').set(headers).send({ foto: null }).expect(200);
  assert.equal(removed.body.data.imagenUrl, null);
  assert.equal(state.imagen, null);
  assert.equal(state.hash, null);
  await request(app).get('/api/publicaciones/42/imagen').expect(404);
});

test('las migraciones aceptan LF y CRLF, pero rechazan cualquier cambio de SQL', () => {
  const lf = migrationChecksums('ALTER TABLE publicaciones\n  ADD COLUMN foto BLOB NULL;\n');
  const windows = migrationChecksums('ALTER TABLE publicaciones\r\n  ADD COLUMN foto BLOB NULL;\r\n');
  assert.equal(lf.checksum, windows.checksum);
  assert.deepEqual(lf.compatible, windows.compatible);
  const changed = migrationChecksums('ALTER TABLE publicaciones\n  ADD COLUMN otra BLOB NULL;\n');
  assert.ok(!lf.compatible.has(changed.checksum));
});
