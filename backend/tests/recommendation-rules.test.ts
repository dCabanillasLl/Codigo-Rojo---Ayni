import assert from "node:assert/strict";
import test from "node:test";
import { deriveRecommendationVerificationState as derive } from "../src/services/recommendation-rules.js";

const confirmed = {
  interactionId: "45", interactionState: "CONFIRMADA" as const, participantsMatch: true,
  providerMatchesPublication: true, authorIsOwner: false, requesterConfirmed: true,
  providerFulfilled: true, authorIdentityVerified: true, authorZoneVerified: true,
};

test("estado Visto Bueno Vecinal", async (t) => {
  await t.test("una experiencia bilateral y autor elegible produce sello verificado", () => {
    assert.equal(derive(confirmed), "VERIFICADA");
  });
  await t.test("una opinión sin evidencia queda no verificada", () => {
    assert.equal(derive({ ...confirmed, interactionId: null }), "NO_VERIFICADA");
  });
  await t.test("experiencia aún activa queda pendiente", () => {
    assert.equal(derive({ ...confirmed, interactionState: "EN_CURSO" }), "PENDIENTE");
  });
  await t.test("identidad pendiente o revocada no conserva sello", () => {
    assert.equal(derive({ ...confirmed, authorIdentityVerified: false }), "PENDIENTE");
  });
  await t.test("zona ajena o vencida no conserva sello", () => {
    assert.equal(derive({ ...confirmed, authorZoneVerified: false }), "PENDIENTE");
  });
  await t.test("proveedor distinto o autorreseña no recibe sello", () => {
    assert.equal(derive({ ...confirmed, providerMatchesPublication: false }), "NO_VERIFICADA");
    assert.equal(derive({ ...confirmed, authorIsOwner: true }), "NO_VERIFICADA");
  });
  await t.test("una interacción cancelada deja de respaldar la reseña", () => {
    assert.equal(derive({ ...confirmed, interactionState: "CANCELADA" }), "NO_VERIFICADA");
  });
});
