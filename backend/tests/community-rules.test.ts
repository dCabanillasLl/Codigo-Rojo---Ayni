import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assertCanCloseRequest, contentHash, remainingResource, requireSameContent,
  transitionOffer, transitionReservation,
} from '../src/services/community-rules.js';
import { geoClause, listSchema } from '../src/services/community-data.js';

test('un colaborador no puede aceptar su propio aporte ni confirmar su recepción', () => {
  for (const action of ['aceptar', 'confirmar'] as const) {
    assert.throws(() => transitionOffer({ action, state: 'aceptada', requester: false,
      volunteer: true, requestState: 'en_curso', delivered: true }), { code: 'FORBIDDEN' });
  }
});
test('la entrega mantiene el aporte aceptado y exige confirmación del solicitante', () => {
  const delivered = transitionOffer({ action: 'entregar', state: 'aceptada', requester: false,
    volunteer: true, requestState: 'en_curso', delivered: false });
  assert.equal(delivered.state, 'aceptada');
  assert.equal(delivered.markDelivered, true);
  assert.equal(delivered.markConfirmed, false);
  assert.throws(() => transitionOffer({ action: 'confirmar', state: 'aceptada', requester: true,
    volunteer: false, requestState: 'en_curso', delivered: false }), { code: 'INVALID_TRANSITION' });
});
test('un pedido con entregas pendientes no puede cerrarse', () => {
  assert.throws(() => assertCanCloseRequest(2), { code: 'UNCONFIRMED_CONTRIBUTIONS' });
  assert.doesNotThrow(() => assertCanCloseRequest(0));
});
test('reintentar la confirmación conserva la colaboración y no reescribe la fecha', () => {
  assert.deepEqual(transitionOffer({ action: 'confirmar', state: 'completada', requester: true,
    volunteer: false, requestState: 'completada', delivered: true }),
  { state: 'completada', markDelivered: false, markConfirmed: false });
});
test('una colaboración confirmada conserva su historial y no puede retirarse', () => {
  assert.throws(() => transitionOffer({ action: 'retirar', state: 'completada', requester: false,
    volunteer: true, requestState: 'en_curso', delivered: true }), { code: 'INVALID_TRANSITION' });
});
test('el mismo UUID exige exactamente el mismo contenido normalizado', () => {
  const original = contentHash({ titulo: 'Necesito una escalera', urgencia: 'normal' });
  assert.doesNotThrow(() => requireSameContent(original, contentHash({ titulo: 'Necesito una escalera', urgencia: 'normal' })));
  assert.throws(() => requireSameContent(original, contentHash({ titulo: 'Necesito una escalera', urgencia: 'urgente' })),
    { code: 'IDEMPOTENCY_CONFLICT' });
});
test('la entrega pasa de reservado a entregado sin descontar dos veces', () => {
  const before = remainingResource(10, 3, 2);
  const after = remainingResource(10, 1, 4);
  assert.equal(before, 5);
  assert.equal(after, 5);
  assert.equal(transitionReservation({ action: 'entregar', state: 'entregada', owner: true,
    requester: false, quantity: 2, available: after }), 'entregada');
});
test('el dueño confirma la reserva y las existencias nunca quedan negativas', () => {
  assert.throws(() => transitionReservation({ action: 'confirmar', state: 'pendiente', owner: false,
    requester: true, quantity: 2, available: 5 }), { code: 'FORBIDDEN' });
  assert.throws(() => transitionReservation({ action: 'confirmar', state: 'pendiente', owner: true,
    requester: false, quantity: 6, available: 5 }), { code: 'INSUFFICIENT_STOCK' });
  assert.throws(() => remainingResource(10, 6, 5), { code: 'INVALID_INVENTORY' });
});
test('cancelar libera reservas, pero una entrega consumada no se convierte en existencias', () => {
  assert.equal(transitionReservation({ action: 'cancelar', state: 'reservada', owner: false,
    requester: true, quantity: 3, available: 2 }), 'cancelada');
  assert.throws(() => transitionReservation({ action: 'cancelar', state: 'entregada', owner: false,
    requester: true, quantity: 3, available: 2 }), { code: 'INVALID_TRANSITION' });
});
test('geolocalización exige coordenadas completas y radio de 1 a 2 km', () => {
  assert.equal(listSchema.safeParse({ latitud: '-12.07' }).success, false);
  assert.equal(listSchema.safeParse({ radio: '500' }).success, false);
  assert.equal(listSchema.safeParse({ radio: '2500' }).success, false);
  assert.equal(listSchema.safeParse({ mios: '1', participando: '1' }).success, false);
  const geo = geoClause(listSchema.parse({ latitud: '0', longitud: '179.999', radio: '2000' }));
  assert.match(geo.where.join(' '), /OR/);
  assert.equal(geo.havingParams[0], 2000);
});
