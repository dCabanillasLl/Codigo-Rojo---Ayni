import { AppError } from "../lib/http.js";

export type PublicationInteractionState = "PENDIENTE" | "ACEPTADA" | "EN_CURSO" | "CONFIRMADA" | "RECHAZADA" | "CANCELADA";
export type PublicationInteractionRole = "SOLICITANTE" | "PROPIETARIO";
export type PublicationInteractionAction = "aceptar" | "rechazar" | "iniciar" | "cumplir" | "confirmar" | "cancelar";

export interface InteractionSnapshot {
  estado: PublicationInteractionState;
  rol: PublicationInteractionRole;
  solicitanteConfirmo: boolean;
  propietarioConfirmo: boolean;
}

export interface InteractionDecision {
  estado: PublicationInteractionState;
  marcarCumplimiento: boolean;
  confirmarRecepcion: boolean;
  sinCambios: boolean;
}

export function decidePublicationInteractionAction(
  { estado, rol, solicitanteConfirmo, propietarioConfirmo }: InteractionSnapshot,
  accion: PublicationInteractionAction,
): InteractionDecision {
  const unchanged = (): InteractionDecision => ({ estado, marcarCumplimiento: false, confirmarRecepcion: false, sinCambios: true });
  const ownerOnly: PublicationInteractionAction[] = ["aceptar", "rechazar", "iniciar", "cumplir"];
  if (ownerOnly.includes(accion) && rol !== "PROPIETARIO") {
    throw new AppError(403, "FORBIDDEN", "Solo el proveedor puede realizar esta acción.");
  }
  if (accion === "confirmar" && rol !== "SOLICITANTE") {
    throw new AppError(403, "FORBIDDEN", "Solo quien solicitó la interacción puede confirmar que recibió el producto o servicio.");
  }
  if (accion === "cancelar" && rol !== "SOLICITANTE" && rol !== "PROPIETARIO") {
    throw new AppError(403, "FORBIDDEN", "No puedes cancelar esta interacción.");
  }

  if ((accion === "aceptar" && estado === "ACEPTADA") || (accion === "rechazar" && estado === "RECHAZADA") ||
      (accion === "iniciar" && estado === "EN_CURSO") || (accion === "cumplir" && estado === "EN_CURSO" && propietarioConfirmo) ||
      (accion === "confirmar" && estado === "CONFIRMADA") || (accion === "cancelar" && estado === "CANCELADA")) return unchanged();

  if (accion === "aceptar" && estado === "PENDIENTE") return { estado: "ACEPTADA", marcarCumplimiento: false, confirmarRecepcion: false, sinCambios: false };
  if (accion === "rechazar" && estado === "PENDIENTE") return { estado: "RECHAZADA", marcarCumplimiento: false, confirmarRecepcion: false, sinCambios: false };
  if (accion === "iniciar" && estado === "ACEPTADA") return { estado: "EN_CURSO", marcarCumplimiento: false, confirmarRecepcion: false, sinCambios: false };
  if (accion === "cumplir" && estado === "EN_CURSO") return { estado: "EN_CURSO", marcarCumplimiento: true, confirmarRecepcion: false, sinCambios: false };
  if (accion === "confirmar" && estado === "EN_CURSO" && propietarioConfirmo && !solicitanteConfirmo) {
    return { estado: "CONFIRMADA", marcarCumplimiento: false, confirmarRecepcion: true, sinCambios: false };
  }
  if (accion === "cancelar" && ["PENDIENTE", "ACEPTADA", "EN_CURSO"].includes(estado)) {
    return { estado: "CANCELADA", marcarCumplimiento: false, confirmarRecepcion: false, sinCambios: false };
  }
  if (accion === "confirmar" && estado === "EN_CURSO" && !propietarioConfirmo) {
    throw new AppError(409, "FULFILLMENT_REQUIRED", "El proveedor debe marcar primero que cumplió el acuerdo.");
  }
  throw new AppError(409, "INVALID_TRANSITION", "Esta interacción ya cambió de estado o esa acción no está permitida ahora.");
}
