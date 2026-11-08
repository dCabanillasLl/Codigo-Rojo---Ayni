import assert from "node:assert/strict";
import test from "node:test";
import { AppError } from "../src/lib/http.js";
import { decidePublicationInteractionAction as decide } from "../src/services/publication-interaction-rules.js";

const state = (estado: "PENDIENTE" | "ACEPTADA" | "EN_CURSO" | "CONFIRMADA" | "RECHAZADA" | "CANCELADA",
  rol: "SOLICITANTE" | "PROPIETARIO" = "PROPIETARIO", propietarioConfirmo = false, solicitanteConfirmo = false) =>
  ({ estado, rol, propietarioConfirmo, solicitanteConfirmo });

test("interacciones de publicación: transiciones, permisos e idempotencia", async (t) => {
  await t.test("proveedor acepta y puede repetir la misma acción", () => {
    assert.equal(decide(state("PENDIENTE"), "aceptar").estado, "ACEPTADA");
    assert.equal(decide(state("ACEPTADA"), "aceptar").sinCambios, true);
  });
  await t.test("proveedor puede rechazar una propuesta pendiente", () => {
    assert.equal(decide(state("PENDIENTE"), "rechazar").estado, "RECHAZADA");
    assert.throws(() => decide(state("ACEPTADA"), "rechazar"), { code: "INVALID_TRANSITION" });
  });
  await t.test("solo el proveedor inicia el acuerdo aceptado", () => {
    assert.equal(decide(state("ACEPTADA"), "iniciar").estado, "EN_CURSO");
    assert.throws(() => decide(state("ACEPTADA", "SOLICITANTE"), "iniciar"), { code: "FORBIDDEN" });
  });
  await t.test("cumplimiento no cierra la experiencia por sí solo", () => {
    const result = decide(state("EN_CURSO"), "cumplir");
    assert.equal(result.estado, "EN_CURSO");
    assert.equal(result.marcarCumplimiento, true);
    assert.throws(() => decide(state("ACEPTADA"), "cumplir"), { code: "INVALID_TRANSITION" });
  });
  await t.test("solicitante confirma solo después del cumplimiento del proveedor", () => {
    assert.equal(decide(state("EN_CURSO", "SOLICITANTE", true), "confirmar").estado, "CONFIRMADA");
    assert.throws(() => decide(state("EN_CURSO", "SOLICITANTE"), "confirmar"), { code: "FULFILLMENT_REQUIRED" });
    assert.throws(() => decide(state("EN_CURSO", "PROPIETARIO", true), "confirmar"), { code: "FORBIDDEN" });
  });
  await t.test("confirmación repetida no cambia la experiencia", () => {
    assert.equal(decide(state("CONFIRMADA", "SOLICITANTE", true, true), "confirmar").sinCambios, true);
  });
  await t.test("cualquiera de los participantes puede cancelar antes de confirmar", () => {
    assert.equal(decide(state("PENDIENTE", "SOLICITANTE"), "cancelar").estado, "CANCELADA");
    assert.equal(decide(state("EN_CURSO", "PROPIETARIO"), "cancelar").estado, "CANCELADA");
    assert.throws(() => decide(state("CONFIRMADA", "SOLICITANTE", true, true), "cancelar"), { code: "INVALID_TRANSITION" });
  });
});
