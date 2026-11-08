import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createHmac, randomInt, randomUUID } from 'node:crypto';
import jwt from 'jsonwebtoken';

const enabled = process.env.AYNI_TEST_DB === 'true';
test('API real: cuentas, privacidad, publicaciones, avisos y permisos', { skip: !enabled }, async (t) => {
  assert.match(process.env.DB_NAME || '', /^ayni_test_/, 'Usar exclusivamente una base de prueba ayni_test_*.');
  assert.ok(['localhost', '127.0.0.1', '::1'].includes(process.env.DB_HOST || ''), 'Pruebas limitadas a MySQL local.');
  // Synthetic prefill proofs, generated only after the disposable/local database guards.
  // No DNI provider or real identity is consulted by these integration tests.
  process.env.DNI_HASH_SECRET ||= 'ayni-integration-only-dni-secret-not-for-production';
  const { default: app } = await import('../src/app.js');
  const { config } = await import('../src/config.js');
  const { pool, query } = await import('../src/db/index.js');
  const owner = request.agent(app), other = request.agent(app);
  const origin = (process.env.FRONTEND_ORIGIN || 'http://localhost:8443').split(',')[0];
  const headers = { Origin: origin, 'X-AYNI-Client': 'web' };
  const tag = randomUUID().slice(0, 8);
  const password = `Ayni-${randomUUID()}!`;
  function identity(nombres: string, apellidos: string) {
    const dni = String(randomInt(100000)).padStart(8, '0');
    const dniHash = createHmac('sha256', config.dniHashSecret).update(dni).digest('hex');
    const dniProof = jwt.sign({ dniHash, nombres, apellidos }, config.jwtSecret,
      { algorithm: 'HS256', issuer: 'ayni-api', audience: 'ayni-dni-prefill', expiresIn: '5m' });
    return { dni, nombres, apellidos, dniProof, consentimientoDni: true };
  }
  let userId: string, publicationId: string, noticeId: string;
  try {
    const sectors = await request(app).get('/api/sectores').expect(200);
    const catalogs = await request(app).get('/api/catalogos').expect(200);
    const sectorId = sectors.body.data[0].id;
    await t.test('Registro, cookie HttpOnly y contraseña protegida', async () => {
      const ownerBody = { ...identity('Prueba', `Propietaria ${tag}`), correo: `owner-${tag}@example.test`, contrasena: password,
        sectorId, direccion: 'Dirección privada de integración', latitud: -12.073, longitud: -77.063 };
      const invalidPhone = await owner.post('/api/auth/register').set(headers).send({ ...ownerBody, telefono: '887654321' }).expect(400);
      assert.equal(invalidPhone.body.error.code, 'VALIDATION_ERROR');
      const registered = await owner.post('/api/auth/register').set(headers).send({ ...ownerBody, telefono: '987654321' }).expect(201);
      userId = registered.body.data.id;
      assert.equal(typeof userId, 'string');
      const cookies = registered.headers['set-cookie'] as unknown as string[];
      assert.ok(cookies.some(cookie => /HttpOnly/i.test(cookie)));
      assert.equal(registered.body.data.hash_contrasena, undefined);
      assert.equal(Number(registered.body.data.latitud), -12.073);
      assert.equal(registered.body.data.telefono, '+51987654321');
      const stored = await query<{ hash_contrasena: string }>('SELECT hash_contrasena FROM usuarios WHERE usuario_id = ?', [userId]);
      assert.notEqual(stored[0].hash_contrasena, password);
      assert.match(stored[0].hash_contrasena, /^\$2[aby]\$/);
      await other.post('/api/auth/register').set(headers).send({ ...identity('Prueba', `Vecino ${tag}`), correo: `other-${tag}@example.test`, contrasena: password,
        sectorId, direccion: 'Referencia privada del otro vecino' }).expect(201);
    });
    await t.test('Sesión, origen, identidad esperada y autorización', async () => {
      const me = await owner.get('/api/auth/me').expect(200);
      assert.equal(me.body.data.id, userId);
      await owner.patch('/api/auth/me').set(headers).send({ telefono: '812345678' }).expect(400);
      const updated = await owner.patch('/api/auth/me').set(headers).send({ telefono: '912345678' }).expect(200);
      assert.equal(updated.body.data.telefono, '+51912345678');
      await request(app).get('/api/auth/me').expect(401);
      await owner.patch('/api/auth/me').set({ Origin: 'https://example.invalid', 'X-AYNI-Client': 'web' }).send({ nombres: 'No' }).expect(403);
      await owner.patch('/api/auth/me').set({ ...headers, 'X-AYNI-User': '999999999' }).send({ nombres: 'No' }).expect(409);
      await owner.post('/api/auth/logout').set(headers).send({}).expect(200);
      await owner.get('/api/auth/me').expect(401);
      await owner.post('/api/auth/login').set(headers).send({ correo: `owner-${tag}@example.test`, contrasena: password }).expect(200);
    });
    await t.test('Publicar conserva el texto, el precio y el propietario', async () => {
      const result = await owner.post('/api/publicaciones').set(headers).send({ categoriaId: catalogs.body.data.publicaciones[0].id, tipo: 'servicio', titulo: `Costura ${tag}`, descripcion: 'Arreglo de prendas por encargo.', modalidadPrecio: 'fijo', precio: 12.50, sectorId }).expect(201);
      publicationId = result.body.data.id;
      assert.equal(result.body.data.propietarioId, userId);
      assert.equal(Number(result.body.data.precio), 12.50);
      assert.equal(result.body.data.titulo, `Costura ${tag}`);
      assert.equal(result.body.data.direccion, undefined);
      assert.equal(result.body.data.latitud, undefined);
      await other.patch(`/api/publicaciones/${publicationId}`).set(headers).send({ titulo: 'Cambio ajeno' }).expect(403);
    });
    await t.test('Cercanía real, radio inválido y búsqueda sin inyección', async () => {
      const nearby = await request(app).get('/api/publicaciones').query({ q: tag, latitud: -12.073, longitud: -77.063, radio: 1000 }).expect(200);
      assert.ok(nearby.body.data.some((item: { id: string }) => item.id === publicationId));
      const far = await request(app).get('/api/publicaciones').query({ q: tag, latitud: -12.5, longitud: -77.5, radio: 1000 }).expect(200);
      assert.equal(far.body.data.length, 0);
      await request(app).get('/api/publicaciones').query({ radio: 999 }).expect(400);
      const injected = await request(app).get('/api/publicaciones').query({ q: "' OR 1=1 --" }).expect(200);
      assert.equal(injected.body.data.length, 0);
    });
    await t.test('Pausar oculta la publicación al público y preserva acceso propio', async () => {
      await owner.patch(`/api/publicaciones/${publicationId}`).set(headers).send({ estado: 'pausada' }).expect(200);
      const publicList = await request(app).get('/api/publicaciones').query({ q: tag }).expect(200);
      assert.ok(!publicList.body.data.some((item: { id: string }) => item.id === publicationId));
      const mine = await owner.get('/api/publicaciones').query({ mios: '1' }).expect(200);
      assert.ok(mine.body.data.some((item: { id: string }) => item.id === publicationId));
    });
    await t.test('Recorrido completo: pedido, oferta de otro vecino, aceptación y finalización', async () => {
      const requestBody = {
        clientRequestId: randomUUID(), categoriaId: catalogs.body.data.ayuda[0].id, sectorId,
        titulo: `Necesito apoyo ${tag}`, descripcion: 'Pedido de prueba del recorrido comunitario completo.', urgencia: 'normal',
      };
      const created = await owner.post('/api/solicitudes').set(headers).send(requestBody).expect(201);
      const requestId = created.body.data.id;
      assert.equal(created.body.data.estado, 'abierta');
      const visible = await other.get('/api/solicitudes').query({ sectorId }).expect(200);
      assert.ok(visible.body.data.some((item: { id: string }) => item.id === requestId));

      const proposed = await other.post(`/api/solicitudes/${requestId}/ofertas`).set(headers).send({ mensaje: 'Puedo ayudar con este pedido.' }).expect(201);
      const offerId = proposed.body.data.id;
      await owner.patch(`/api/ofertas/${offerId}`).set(headers).send({ accion: 'aceptar' }).expect(200);
      assert.equal((await owner.get(`/api/solicitudes/${requestId}`).expect(200)).body.data.estado, 'en_curso');

      await other.patch(`/api/ofertas/${offerId}`).set(headers).send({ accion: 'entregar' }).expect(200);
      await owner.patch(`/api/ofertas/${offerId}`).set(headers).send({ accion: 'confirmar' }).expect(200);
      const completed = await owner.patch(`/api/solicitudes/${requestId}`).set(headers).send({ accion: 'completar' }).expect(200);
      assert.equal(completed.body.data.estado, 'completada');
      assert.equal((await other.get(`/api/solicitudes/${requestId}`).expect(200)).body.data.estado, 'completada');
    });
    await t.test('Avisos reales, permiso por autor y cancelación', async () => {
      const created = await owner.post('/api/avisos').set(headers).send({ categoriaId: catalogs.body.data.avisos[0].id, titulo: `Campaña ${tag}`, contenido: 'Intercambio vecinal de libros.', sectorId,
        fechaEvento: new Date(Date.now() + 86400000).toISOString(), ubicacion: { direccion: 'Lugar público de la actividad', latitud: -12.074, longitud: -77.064 } }).expect(201);
      noticeId = created.body.data.id;
      const detail = await request(app).get(`/api/avisos/${noticeId}`).expect(200);
      assert.equal(detail.body.data.contenido, 'Intercambio vecinal de libros.');
      await other.patch(`/api/avisos/${noticeId}`).set(headers).send({ estado: 'cancelado' }).expect(403);
      await owner.patch(`/api/avisos/${noticeId}`).set(headers).send({ estado: 'cancelado' }).expect(200);
      const list = await request(app).get('/api/avisos').query({ q: tag }).expect(200);
      assert.ok(!list.body.data.some((item: { id: string }) => item.id === noticeId));
    });
  } finally {
    // Keep fixture records in the explicitly named test database; never delete shared data.
    await pool.end();
  }
});
