import assert from "node:assert/strict";
import { createHmac, randomUUID } from "node:crypto";
import test from "node:test";
import jwt from "jsonwebtoken";
import request from "supertest";
import { config } from "../src/config.js";

const enabled = process.env.AYNI_TEST_DB === "true" && process.env.RUN_MYSQL_TESTS === "1";

test("MySQL/API extremo a extremo: registro, acreditación, experiencia, recomendación y revocación", { skip: !enabled }, async () => {
  assert.match(process.env.DB_NAME || "", /^ayni_test_[a-zA-Z0-9_]+$/, "Usar exclusivamente una base local ayni_test_*.");
  assert.ok(["127.0.0.1", "localhost", "::1"].includes(process.env.DB_HOST || ""), "El flujo completo solo admite MySQL local.");
  assert.ok(config.jwtSecret && config.dniHashSecret, "Se requieren secretos exclusivos del entorno de pruebas.");

  const { default: app } = await import("../src/app.js");
  const { pool, query } = await import("../src/db/index.js");
  const tag = randomUUID().slice(0, 12);
  const password = `Ayni-${randomUUID()}!`;
  const headers = { Origin: (process.env.FRONTEND_ORIGIN || "http://localhost:8444").split(",")[0], "X-AYNI-Client": "web" };
  const reviewer = request.agent(app), owner = request.agent(app), requester = request.agent(app);
  const reviewerIds = config.verificationReviewerUserIds;
  const initialReviewerCount = reviewerIds.length;
  const createdUsers: string[] = [];
  let publicationId = "";

  async function register(agent: typeof reviewer, name: string) {
    const dni = String(BigInt(`0x${randomUUID().replaceAll("-", "").slice(0, 12)}`) % 100_000_000n).padStart(8, "0");
    const dniHash = createHmac("sha256", config.dniHashSecret!).update(dni).digest("hex");
    const dniProof = jwt.sign({ dniHash, nombres: "Vecino", apellidos: name }, config.jwtSecret!,
      { algorithm: "HS256", issuer: "ayni-api", audience: "ayni-dni-prefill", expiresIn: "5m" });
    const catalogs = await request(app).get("/api/catalogos").expect(200);
    const sectorId = String(catalogs.body.data.publicaciones[0]?.sectorId ||
      (await request(app).get("/api/sectores").expect(200)).body.data[0].id);
    const response = await agent.post("/api/auth/register").set(headers).send({
      dni, consentimientoDni: true, dniProof, nombres: "Dato ignorado", apellidos: "Dato ignorado",
      correo: `${tag}-${name.toLowerCase()}@example.test`, contrasena: password,
      direccion: "Referencia sintética de prueba", sectorId,
    }).expect(201);
    const id = String(response.body.data.id);
    createdUsers.push(id);
    return { id, sectorId };
  }

  try {
    const reviewerAccount = await register(reviewer, `Revisor${tag}`);
    reviewerIds.push(reviewerAccount.id);
    const ownerAccount = await register(owner, `Propietario${tag}`);
    const requesterAccount = await register(requester, `Solicitante${tag}`);
    assert.equal(ownerAccount.sectorId, requesterAccount.sectorId);

    await requester.post("/api/identity/verification-request").set(headers).send({}).expect(200);
    await requester.post("/api/identity/zones").set(headers).send({ sectorId: requesterAccount.sectorId }).expect(202);
    const pendingZones = await requester.get("/api/identity/zones").expect(200);
    const zoneRequest = pendingZones.body.data.find((item: { sectorId: string; estado: string }) =>
      item.sectorId === requesterAccount.sectorId && item.estado === "PENDIENTE");
    assert.ok(zoneRequest, "El registro debe dejar la pertenencia declarada pendiente de revisión.");

    await reviewer.patch(`/api/admin/verifications/identity/${requesterAccount.id}`).set(headers)
      .send({ accion: "aprobar", metodo: "REVISION_PRESENCIAL" }).expect(200);
    await reviewer.patch(`/api/admin/verifications/zones/${zoneRequest.id}`).set(headers)
      .send({ accion: "aprobar", metodo: "REFERENCIA_VECINAL" }).expect(200);

    const catalogs = await request(app).get("/api/catalogos").expect(200);
    const publication = await owner.post("/api/publicaciones").set(headers).send({
      categoriaId: catalogs.body.data.publicaciones[0].id, tipo: "producto",
      titulo: `Herramienta de demostración ${tag}`, descripcion: "Préstamo de una escalera para uso vecinal.",
      modalidadPrecio: "gratis", sectorId: ownerAccount.sectorId,
    }).expect(201);
    publicationId = String(publication.body.data.id);

    const interactionResponse = await requester.post(`/api/publicaciones/${publicationId}/interacciones`)
      .set(headers).send({ tipo: "CONSULTA" }).expect(201);
    const interactionId = String(interactionResponse.body.data.id);
    await owner.patch(`/api/interacciones/${interactionId}`).set(headers).send({ accion: "aceptar" }).expect(200);
    await owner.patch(`/api/interacciones/${interactionId}`).set(headers).send({ accion: "iniciar" }).expect(200);
    const fulfilled = await owner.patch(`/api/interacciones/${interactionId}`).set(headers)
      .send({ accion: "cumplir" }).expect(200);
    assert.equal(fulfilled.body.data.recepcionConfirmada, false);
    const confirmed = await requester.patch(`/api/interacciones/${interactionId}`).set(headers)
      .send({ accion: "confirmar" }).expect(200);
    assert.equal(confirmed.body.data.estado, "CONFIRMADA");
    assert.equal(confirmed.body.data.recepcionConfirmada, true);

    const recommendation = await requester.post(`/api/publicaciones/${publicationId}/resenas`).set(headers).send({
      calificacion: 5, comentario: "La escalera llegó en buen estado y se devolvió a tiempo.", interaccionId: interactionId,
    }).expect(201);
    assert.equal(recommendation.body.data.estadoVerificacion, "VERIFICADA");
    assert.equal(Number(recommendation.body.data.vistoBuenoVerificado), 1);
    const verifiedSummary = await requester.get(`/api/publicaciones/${publicationId}/resenas/resumen`).expect(200);
    assert.equal(verifiedSummary.body.data.verificadas, 1);
    assert.equal(verifiedSummary.body.data.miOpinion, true);

    await reviewer.patch(`/api/admin/verifications/identity/${requesterAccount.id}`).set(headers).send({
      accion: "revocar", metodo: "OTRO", motivo: "Revocación sintética para validar la pérdida del sello.",
    }).expect(200);
    const verifiedAfterRevocation = await request(app).get(`/api/publicaciones/${publicationId}/resenas`)
      .query({ filtro: "verificadas" }).expect(200);
    assert.equal(verifiedAfterRevocation.body.data.length, 0);
    const allAfterRevocation = await request(app).get(`/api/publicaciones/${publicationId}/resenas`).expect(200);
    assert.equal(allAfterRevocation.body.data[0].estadoVerificacion, "PENDIENTE");
    const summaryAfterRevocation = await request(app).get(`/api/publicaciones/${publicationId}/resenas/resumen`).expect(200);
    assert.equal(summaryAfterRevocation.body.data.verificadas, 0);
    assert.equal(summaryAfterRevocation.body.data.pendientes, 1);
  } finally {
    reviewerIds.splice(initialReviewerCount);
    if (publicationId) {
      await query("DELETE FROM resenas WHERE publicacion_id=?", [publicationId]);
      await query("DELETE FROM interacciones_publicacion WHERE publicacion_id=?", [publicationId]);
      await query("DELETE FROM publicaciones WHERE publicacion_id=?", [publicationId]);
    }
    if (createdUsers.length) {
      const placeholders = createdUsers.map(() => "?").join(",");
      await query(`DELETE FROM auditoria_verificaciones WHERE usuario_afectado_id IN (${placeholders}) OR actor_id IN (${placeholders})`, [...createdUsers, ...createdUsers]);
      await query(`DELETE FROM pertenencias_zona WHERE usuario_id IN (${placeholders})`, createdUsers);
      await query(`DELETE FROM verificaciones_identidad WHERE usuario_id IN (${placeholders})`, createdUsers);
      const locations = await query<{ ubicacionId: string }>(`SELECT CAST(ubicacion_id AS CHAR) AS ubicacionId FROM usuarios WHERE usuario_id IN (${placeholders})`, createdUsers);
      await query(`DELETE FROM usuarios WHERE usuario_id IN (${placeholders})`, createdUsers);
      if (locations.length) {
        const locationIds = locations.map(item => item.ubicacionId);
        await query(`DELETE FROM ubicaciones WHERE ubicacion_id IN (${locationIds.map(() => "?").join(",")})`, locationIds);
      }
    }
    await pool.end();
  }
});
