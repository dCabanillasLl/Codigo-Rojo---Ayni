import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';

const enabled = process.env.RUN_MYSQL_TESTS === '1';
test('MySQL real: colaboraciones, reputación, idempotencia y reservas concurrentes', { skip: !enabled }, async (t) => {
  assert.ok(/^ayni_test_[a-zA-Z0-9_]+$/.test(process.env.DB_NAME ?? ''), 'Usar exclusivamente una base ayni_test_* preparada para pruebas.');
  assert.ok(['127.0.0.1', 'localhost', '::1'].includes(process.env.DB_HOST ?? ''), 'Esta prueba solo admite MySQL local.');
  const db = await import('../src/db/index.js');
  const community = await import('../src/services/community.js');
  const resources = await import('../src/services/resources.js');
  const { insert } = await import('../src/services/community-data.js');
  const prefix = `test-${randomUUID()}`;
  try {
    const fixtures = await db.transaction(async (connection) => {
      const sectorId = await insert(connection, `INSERT INTO sectores_vecinales (nombre,distrito,ciudad,codigo_pais)
        VALUES (?, 'Distrito de prueba', 'Pruebas', 'PE')`, [prefix]);
      const categoryId = await insert(connection, 'INSERT INTO categorias_ayuda (nombre) VALUES (?)', [prefix]);
      const locationId = await insert(connection,
        'INSERT INTO ubicaciones (sector_id,latitud,longitud) VALUES (?, -12.073, -77.063)', [sectorId]);
      const users: string[] = [];
      for (let i = 0; i < 4; i++) {
        users.push(await insert(connection, `INSERT INTO usuarios (nombres,apellidos,correo,hash_contrasena,ubicacion_id)
          VALUES (?, 'Integración', ?, ?, ?)`, [`Vecino ${i}`, `${prefix}-${i}@example.invalid`, '!cuenta-de-prueba-sin-login', locationId]));
      }
      return { sectorId, categoryId, users };
    });
    const [owner, first, second, resourceOwner] = fixtures.users as [string, string, string, string];
    const requestBody = { clientRequestId: randomUUID(), categoriaId: fixtures.categoryId,
      sectorId: fixtures.sectorId, titulo: 'Necesito linternas para mi familia',
      descripcion: 'Solicitud de integración automatizada en base de pruebas.', urgencia: 'urgente' as const };
    let requestId = '', firstOfferId = '', secondOfferId = '';

    await t.test('dos reintentos simultáneos crean una sola necesidad', async () => {
      const attempts = await Promise.all([community.createRequest(owner, requestBody), community.createRequest(owner, requestBody)]);
      requestId = attempts[0].request.id;
      assert.equal(attempts[1].request.id, requestId);
      assert.equal(attempts.filter((item) => item.replayed).length, 1);
      assert.equal(Number((await db.one<{ total: number | string }>('SELECT COUNT(*) AS total FROM solicitudes_ayuda WHERE solicitante_id = ? AND client_request_id = ?', [owner, requestBody.clientRequestId]))?.total), 1);
      await assert.rejects(() => community.createRequest(owner, { ...requestBody, titulo: 'Contenido distinto' }), { code: 'IDEMPOTENCY_CONFLICT' });
    });
    await t.test('listados geográficos y privados no exponen domicilio ni otros UUID', async () => {
      const near = await community.listRequests({ sectorId: fixtures.sectorId, latitud: -12.073, longitud: -77.063, radio: 1000 });
      assert.equal(near.length, 1);
      assert.equal(near[0].distanciaMetros, 0);
      assert.equal(near[0].clientRequestId, null);
      assert.equal('latitud' in near[0], false);
      const far = await community.listRequests({ sectorId: fixtures.sectorId, latitud: -12.1, longitud: -77.1, radio: 1000 });
      assert.equal(far.length, 0);
      await assert.rejects(() => community.listRequests({ radio: 1000, mios: '1' }), { code: 'AUTH_REQUIRED' });
    });
    await t.test('dos vecinos aportan y solo el solicitante acepta', async () => {
      await assert.rejects(() => community.createOffer(owner, requestId, { mensaje: 'Intento de autoayuda' }), { code: 'SELF_OFFER' });
      firstOfferId = (await community.createOffer(first, requestId, { mensaje: 'Puedo entregar dos linternas' })).offer.id;
      secondOfferId = (await community.createOffer(second, requestId, { mensaje: 'Puedo ayudar con el transporte' })).offer.id;
      await assert.rejects(() => community.updateOffer(first, firstOfferId, { accion: 'aceptar' }), { code: 'FORBIDDEN' });
      await Promise.all([community.updateOffer(owner, firstOfferId, { accion: 'aceptar' }), community.updateOffer(owner, secondOfferId, { accion: 'aceptar' })]);
      assert.equal((await community.getRequest(requestId, owner)).estado, 'en_curso');
      assert.equal((await community.listOffers(owner, requestId)).length, 2);
      assert.equal((await community.listOffers(first, requestId)).length, 1);
      assert.equal((await community.listOffers(resourceOwner, requestId)).length, 0);
      assert.equal((await community.listRequests({ radio: 1000, participando: '1' }, first))[0].id, requestId);
    });
    await t.test('entregar no cierra el pedido ni otorga reputación', async () => {
      await assert.rejects(() => community.saveReview(owner, firstOfferId, { calificacion: 5 }), { code: 'UNCONFIRMED_COLLABORATION' });
      await assert.rejects(() => community.updateOffer(owner, firstOfferId, { accion: 'confirmar' }), { code: 'INVALID_TRANSITION' });
      await community.updateOffer(first, firstOfferId, { accion: 'entregar' });
      assert.equal((await community.getRequest(requestId)).estado, 'en_curso');
      assert.equal((await community.getReputation(first)).colaboracionesConfirmadas, 0);
      await assert.rejects(() => community.closeRequest(owner, requestId, { accion: 'completar' }), { code: 'UNCONFIRMED_CONTRIBUTIONS' });
      await assert.rejects(() => community.updateOffer(first, firstOfferId, { accion: 'confirmar' }), { code: 'FORBIDDEN' });
      const confirmed = await community.updateOffer(owner, firstOfferId, { accion: 'confirmar' });
      const repeated = await community.updateOffer(owner, firstOfferId, { accion: 'confirmar' });
      assert.equal(confirmed.estado, 'completada');
      assert.deepEqual(repeated.confirmadaEn, confirmed.confirmadaEn);
      assert.equal((await community.getRequest(requestId)).estado, 'en_curso');
    });
    await t.test('una reseña verificable por colaboración, editable y sin autorreseña', async () => {
      await assert.rejects(() => community.saveReview(first, firstOfferId, { calificacion: 5 }), { code: 'FORBIDDEN' });
      const initial = await community.saveReview(owner, firstOfferId, { calificacion: 5, comentario: 'Ayuda recibida y confirmada' });
      const edited = await community.saveReview(owner, firstOfferId, { calificacion: 3, comentario: 'Reseña editada' });
      assert.equal(edited?.id, initial?.id);
      let reputation = await community.getReputation(first);
      assert.equal(reputation.colaboracionesConfirmadas, 1);
      assert.equal(reputation.resenas.length, 1);
      assert.equal(reputation.vistosBuenos, 0);
      await community.saveReview(owner, firstOfferId, { calificacion: 4 });
      reputation = await community.getReputation(first);
      assert.equal(reputation.vistosBuenos, 1);
    });
    await t.test('solo el solicitante cierra tras resolver cada colaboración aceptada', async () => {
      await assert.rejects(() => community.closeRequest(first, requestId, { accion: 'completar' }), { code: 'FORBIDDEN' });
      await community.updateOffer(second, secondOfferId, { accion: 'retirar' });
      assert.equal((await community.getRequest(requestId)).estado, 'en_curso');
      assert.equal((await community.closeRequest(owner, requestId, { accion: 'completar' })).estado, 'completada');
      assert.equal((await community.closeRequest(owner, requestId, { accion: 'completar' })).estado, 'completada');
      assert.equal((await community.listRequests({ radio: 1000, participando: '1' }, first))[0].estado, 'completada');
    });
    await t.test('si todos los aportes activos se retiran el pedido vuelve a abierto', async () => {
      const another = (await community.createRequest(owner, { ...requestBody, clientRequestId: randomUUID() })).request;
      const offer = (await community.createOffer(first, another.id, { mensaje: 'Aporto una linterna disponible' })).offer;
      await community.updateOffer(owner, offer.id, { accion: 'aceptar' });
      await community.updateOffer(first, offer.id, { accion: 'retirar' });
      assert.equal((await community.getRequest(another.id)).estado, 'abierta');
      await community.closeRequest(owner, another.id, { accion: 'cancelar', motivo: 'Ya conseguimos otra solución.' });
      assert.equal((await community.getRequest(another.id)).motivoCancelacion, 'Ya conseguimos otra solución.');
    });
    await t.test('reservas simultáneas no consumen las mismas unidades y reintentar es seguro', async () => {
      const resource = await resources.createResource(resourceOwner, { titulo: 'Linternas de donación', unidad: 'unidades', cantidadTotal: 10, sectorId: fixtures.sectorId });
      const bodyA = { cantidad: 7, clientRequestId: randomUUID() };
      const a = (await resources.createReservation(first, resource.id, bodyA)).reservation;
      const b = (await resources.createReservation(second, resource.id, { cantidad: 7, clientRequestId: randomUUID() })).reservation;
      const replay = await resources.createReservation(first, resource.id, bodyA);
      assert.equal(replay.reservation.id, a.id); assert.equal(replay.replayed, true);
      await assert.rejects(() => resources.createReservation(first, resource.id, { ...bodyA, cantidad: 8 }), { code: 'IDEMPOTENCY_CONFLICT' });
      await assert.rejects(() => resources.updateReservation(first, a.id, { accion: 'confirmar' }), { code: 'FORBIDDEN' });
      const attempts = await Promise.allSettled([resources.updateReservation(resourceOwner, a.id, { accion: 'confirmar' }), resources.updateReservation(resourceOwner, b.id, { accion: 'confirmar' })]);
      assert.equal(attempts.filter((result) => result.status === 'fulfilled').length, 1);
      assert.equal(attempts.filter((result) => result.status === 'rejected' && result.reason.code === 'INSUFFICIENT_STOCK').length, 1);
      const winner = attempts[0].status === 'fulfilled' ? a : b;
      const loser = winner.id === a.id ? b : a;
      await resources.updateReservation(resourceOwner, winner.id, { accion: 'confirmar' });
      assert.equal((await resources.getResource(resource.id)).disponible, 3);
      await resources.updateReservation(winner.solicitanteId, winner.id, { accion: 'cancelar' });
      assert.equal((await resources.getResource(resource.id)).disponible, 10);
      await resources.updateReservation(resourceOwner, loser.id, { accion: 'confirmar' });
      await resources.updateReservation(resourceOwner, loser.id, { accion: 'entregar' });
      await resources.updateReservation(resourceOwner, loser.id, { accion: 'entregar' });
      const final = await resources.getResource(resource.id);
      assert.equal(final.disponible, 3); assert.equal(final.reservada, 0); assert.equal(final.entregada, 7);
      await assert.rejects(() => resources.updateReservation(loser.solicitanteId, loser.id, { accion: 'cancelar' }), { code: 'INVALID_TRANSITION' });
      assert.equal((await resources.listReservations(resourceOwner, resource.id)).length, 2);
      assert.equal((await resources.listReservations(first, resource.id)).length, 1);
      assert.equal((await resources.listReservations(owner, resource.id)).length, 0);
    });
  } finally {
    await db.pool.end();
  }
});
