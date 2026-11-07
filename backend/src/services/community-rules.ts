import { createHash } from 'node:crypto';
import { AppError } from '../lib/http.js';

export type RequestState = 'abierta' | 'en_curso' | 'completada' | 'cancelada' | 'vencida';
export type OfferState = 'pendiente' | 'aceptada' | 'rechazada' | 'retirada' | 'completada';
export type OfferAction = 'aceptar' | 'rechazar' | 'retirar' | 'entregar' | 'confirmar';
export type ReservationState = 'pendiente' | 'reservada' | 'entregada' | 'cancelada';
export type ReservationAction = 'confirmar' | 'entregar' | 'cancelar';

export function contentHash(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

export function requireSameContent(original: string, incoming: string): void {
  if (original !== incoming) {
    throw new AppError(409, 'IDEMPOTENCY_CONFLICT', 'Este identificador ya corresponde a otro contenido. Crea un pedido nuevo para cambiarlo.');
  }
}

export function assertRequestActive(state: RequestState): void {
  if (state !== 'abierta' && state !== 'en_curso') {
    throw new AppError(409, 'REQUEST_CLOSED', 'Esta necesidad ya no acepta colaboraciones.');
  }
}

export function assertCanCloseRequest(acceptedCount: number): void {
  if (acceptedCount > 0) {
    throw new AppError(409, 'UNCONFIRMED_CONTRIBUTIONS', 'Revisa las colaboraciones aceptadas: confirma lo recibido o cancela los aportes pendientes antes de cerrar el pedido.');
  }
}

export function transitionOffer(input: {
  action: OfferAction;
  state: OfferState;
  requester: boolean;
  volunteer: boolean;
  requestState: RequestState;
  delivered: boolean;
}): { state: OfferState; markDelivered: boolean; markConfirmed: boolean } {
  const { action, state, requester, volunteer, requestState, delivered } = input;
  const isOwnerAction = action === 'aceptar' || action === 'rechazar' || action === 'confirmar';
  if ((isOwnerAction && !requester) || (!isOwnerAction && !volunteer)) {
    throw new AppError(403, 'FORBIDDEN', 'No puedes realizar esta acción sobre la colaboración.');
  }
  const unchanged = { state, markDelivered: false, markConfirmed: false };
  if (action === 'aceptar' && (state === 'aceptada' || state === 'completada')) return unchanged;
  if (action === 'rechazar' && state === 'rechazada') return unchanged;
  if (action === 'retirar' && state === 'retirada') return unchanged;
  if (action === 'entregar' && (state === 'completada' || (state === 'aceptada' && delivered))) return unchanged;
  if (action === 'confirmar' && state === 'completada') return unchanged;
  assertRequestActive(requestState);

  if (action === 'aceptar' && state === 'pendiente') {
    return { state: 'aceptada', markDelivered: false, markConfirmed: false };
  }
  if ((action === 'rechazar' || action === 'retirar') && (state === 'pendiente' || state === 'aceptada')) {
    return { state: action === 'rechazar' ? 'rechazada' : 'retirada', markDelivered: false, markConfirmed: false };
  }
  if (action === 'entregar' && state === 'aceptada') {
    return { state, markDelivered: true, markConfirmed: false };
  }
  if (action === 'confirmar' && state === 'aceptada' && delivered) {
    return { state: 'completada', markDelivered: false, markConfirmed: true };
  }
  throw new AppError(409, 'INVALID_TRANSITION', action === 'confirmar' && !delivered
    ? 'El colaborador debe indicar primero que entregó su aporte.'
    : 'Esta colaboración ya cambió de estado. Actualiza el pedido.');
}

export function remainingResource(total: number, reserved: number, delivered: number): number {
  const remaining = total - reserved - delivered;
  if (![total, reserved, delivered].every(Number.isSafeInteger) || Math.min(total, reserved, delivered) < 0 || remaining < 0) {
    throw new AppError(409, 'INVALID_INVENTORY', 'Las cantidades del recurso requieren revisión.');
  }
  return remaining;
}

export function transitionReservation(input: {
  action: ReservationAction;
  state: ReservationState;
  owner: boolean;
  requester: boolean;
  quantity: number;
  available: number;
}): ReservationState {
  const { action, state, owner, requester, quantity, available } = input;
  if ((action === 'cancelar' && !owner && !requester) || (action !== 'cancelar' && !owner)) {
    throw new AppError(403, 'FORBIDDEN', 'No puedes modificar esta reserva.');
  }
  if (action === 'confirmar' && (state === 'reservada' || state === 'entregada')) return state;
  if (action === 'entregar' && state === 'entregada') return state;
  if (action === 'cancelar' && state === 'cancelada') return state;
  if (action === 'confirmar' && state === 'pendiente') {
    if (quantity > available) throw new AppError(409, 'INSUFFICIENT_STOCK', 'Ya no hay suficientes unidades disponibles para esta reserva.');
    return 'reservada';
  }
  if (action === 'entregar' && state === 'reservada') return 'entregada';
  if (action === 'cancelar' && (state === 'pendiente' || state === 'reservada')) return 'cancelada';
  throw new AppError(409, 'INVALID_TRANSITION', 'Esta reserva ya cambió de estado. Actualiza el recurso.');
}
