import assert from "node:assert/strict";
import test from "node:test";
import request from "supertest";
import jwt from "jsonwebtoken";
import { createHmac, randomUUID } from "node:crypto";
import { config } from "../src/config.js";

const enabled = process.env.AYNI_TEST_DB === "true";
test("MySQL/API: identidad y pertenencia a zona con revisión administrativa", { skip: !enabled }, async (t) => {
  assert.match(process.env.DB_NAME || "", /^ayni_test_/, "Usar exclusivamente una base de prueba ayni_test_*.");
  assert.ok(["localhost", "127.0.0.1", "::1"].includes(process.env.DB_HOST || ""), "Pruebas limitadas a MySQL local.");
  assert.ok(config.jwtSecret && config.dniHashSecret, "Las pruebas requieren secretos exclusivos de test.");
  const { default: app } = await import("../src/app.js");
  const { pool, query } = await import("../src/db/index.js");
  const { assertInteractionEligibleForVerifiedRecommendation } = await import("../src/services/verification.js");
  const origin = (process.env.FRONTEND_ORIGIN || "http://localhost:8444").split(",")[0];
  const headers = { Origin: origin, "X-AYNI-Client": "web" };
  const reviewer = request.agent(app), requester = request.agent(app), owner = request.agent(app), stranger = request.agent(app);
  const tag = randomUUID().slice(0, 10);
  const password = `Ayni-${randomUUID()}!`;
  const reviewerIds = config.verificationReviewerUserIds;
  const originalReviewerCount = reviewerIds.length;
  let requesterId = "", ownerId = "", reviewerId = "", requesterZoneId = "", requesterHomeZoneId = "", requesterSector = "", ownerZoneId = "";

  const register = async (agent: typeof reviewer, label: string) => {
    const dni = String(BigInt(`0x${randomUUID().replaceAll("-", "").slice(0, 12)}`) % 100_000_000n).padStart(8, "0");
    const dniHash = createHmac("sha256", config.dniHashSecret).update(dni).digest("hex");
    const dniProof = jwt.sign({ dniHash, nombres: "Vecino", apellidos: label }, config.jwtSecret,
      { algorithm: "HS256", issuer: "ayni-api", audience: "ayni-dni-prefill", expiresIn: "5m" });
    const sectors = await request(app).get("/api/sectores").expect(200);
    const result = await agent.post("/api/auth/register").set(headers).send({
      dni, consentimientoDni: true, dniProof, nombres: "Vecino", apellidos: label,
      correo: `${label.toLowerCase()}-${tag}@example.test`, contrasena: password,
      direccion: "Referencia sintética", sectorId: sectors.body.data[0].id,
    }).expect(201);
    return { id: result.body.data.id as string, sectorId: sectors.body.data[0].id as string };
  };
  const adminHeaders = { ...headers };
  const approveIdentity = (id: string) => reviewer.patch(`/api/admin/verifications/identity/${id}`).set(adminHeaders)
    .send({ accion: "aprobar", metodo: "REVISION_PRESENCIAL" }).expect(200);
  const approveZone = (id: string, expiresAt?: string) => reviewer.patch(`/api/admin/verifications/zones/${id}`).set(adminHeaders)
    .send({ accion: "aprobar", metodo: "REFERENCIA_VECINAL", ...(expiresAt ? { venceEn: expiresAt } : {}) }).expect(200);

  try {
    await t.test("autenticación y estado privado sin exponer DNI ni ubicación", async () => {
      await request(app).get("/api/identity/me").expect(401);
      await request(app).get("/api/identity/zones").expect(401);
      const reviewerAccount = await register(reviewer, `Revisor${tag}`);
      reviewerId = reviewerAccount.id;
      reviewerIds.push(reviewerId);
      const requesterAccount = await register(requester, `Solicitante${tag}`);
      requesterId = requesterAccount.id;
      requesterSector = requesterAccount.sectorId;
      const requesterHome = await query<{ id: string }>(`SELECT CAST(pertenencia_id AS CHAR) AS id FROM pertenencias_zona
        WHERE usuario_id=? AND sector_id=?`, [requesterId, requesterSector]);
      requesterHomeZoneId = requesterHome[0].id;
      const ownerAccount = await register(owner, `Propietario${tag}`);
      ownerId = ownerAccount.id;
      assert.equal(ownerAccount.sectorId, requesterSector);

      const identity = await requester.get("/api/identity/me").expect(200);
      assert.equal(identity.body.data.estado, "PENDIENTE");
      assert.equal(identity.body.data.metodo, "APIPERU_PREFILL_NO_ACREDITA_TITULARIDAD");
      assert.equal(identity.body.data.verificadaEn, null);
      assert.doesNotMatch(JSON.stringify(identity.body), /dni_hash|\bdni\b|direccion|latitud|longitud/i);
      const zones = await requester.get("/api/identity/zones").expect(200);
      assert.equal(zones.body.data[0].estado, "PENDIENTE");
      assert.equal(Number(zones.body.data[0].vigente), 0);
      assert.doesNotMatch(JSON.stringify(zones.body), /direccion|latitud|longitud/i);
      const identityRequest = await requester.post("/api/identity/verification-request").set(headers).send({}).expect(200);
      assert.deepEqual(identityRequest.body.data, { estado: "PENDIENTE", solicitada: true });
    });

    await t.test("solicitudes de zona son válidas, idempotentes y visibles solo como datos aproximados", async () => {
      const [sector] = await query<{ sector_id: string }>("SELECT CAST(sector_id AS CHAR) AS sector_id FROM sectores_vecinales WHERE sector_id <> ? LIMIT 1", [requesterSector]);
      assert.ok(sector, "La base de pruebas debe tener más de un sector.");
      const [inserted] = await pool.execute(`INSERT INTO pertenencias_zona (usuario_id,sector_id,metodo,estado)
        VALUES (?, ?, 'DECLARADA_EN_PERFIL', 'PENDIENTE')`, [requesterId, sector.sector_id]);
      requesterZoneId = String((inserted as { insertId: number | bigint }).insertId);
      await requester.post("/api/identity/zones").set(headers).send({ sectorId: "1 OR 1=1" }).expect(400);
      const results = await Promise.all([
        requester.post("/api/identity/zones").set(headers).send({ sectorId: sector.sector_id }),
        requester.post("/api/identity/zones").set(headers).send({ sectorId: sector.sector_id }),
      ]);
      for (const response of results) assert.equal(response.status, 202);
      assert.equal(results.filter(response => response.body.data.solicitada).length, 1);
      assert.equal(results[0].body.data.id, results[1].body.data.id);
      const queue = await reviewer.get("/api/admin/verifications?tipo=zona").expect(200);
      assert.ok(queue.body.data.some((item: { id: string }) => item.id === requesterZoneId));
      assert.doesNotMatch(JSON.stringify(queue.body), /direccion|latitud|longitud|dni_hash/i);
      await owner.patch(`/api/admin/verifications/zones/${requesterZoneId}`).set(headers)
        .send({ accion: "aprobar", metodo: "OTRO" }).expect(403);
    });

    await t.test("la revisión exige administrador configurado y prohíbe autorrevisión", async () => {
      reviewerIds.push(requesterId);
      await requester.patch(`/api/admin/verifications/identity/${requesterId}`).set(headers)
        .send({ accion: "aprobar", metodo: "REVISION_PRESENCIAL" }).expect(403);
      reviewerIds.pop();
      await reviewer.get("/api/admin/verifications?tipo=identidad").expect(200);
      await owner.get("/api/admin/verifications?tipo=identidad").expect(403);
      await reviewer.patch(`/api/admin/verifications/identity/${reviewerId}`).set(headers)
        .send({ accion: "aprobar", metodo: "REVISION_PRESENCIAL" }).expect(403);
      await reviewer.patch(`/api/admin/verifications/identity/${requesterId}`).set(headers)
        .send({ accion: "aprobar", metodo: "REVISION_PRESENCIAL" }).expect(200);
      await approveZone(requesterZoneId, new Date(Date.now() + 86_400_000).toISOString());
      const zone = await requester.get("/api/identity/zones").expect(200);
      assert.equal(zone.body.data.find((item: { id: string }) => item.id === requesterZoneId).estado, "VERIFICADA");
      assert.equal(Number(zone.body.data.find((item: { id: string }) => item.id === requesterZoneId).vigente), 1);
      await query(`UPDATE pertenencias_zona SET verificada_en=DATE_SUB(UTC_TIMESTAMP(3), INTERVAL 2 DAY),
        vence_en=DATE_SUB(UTC_TIMESTAMP(3), INTERVAL 1 DAY) WHERE pertenencia_id=?`, [requesterZoneId]);
      const expired = await requester.get("/api/identity/zones").expect(200);
      assert.equal(Number(expired.body.data.find((item: { id: string }) => item.id === requesterZoneId).vigente), 0);
      await requester.post("/api/identity/zones").set(headers).send({ sectorId: (await query<{ id: string }>(
        "SELECT CAST(sector_id AS CHAR) AS id FROM pertenencias_zona WHERE pertenencia_id=?", [requesterZoneId]))[0].id }).expect(202);
    });

    await t.test("rechazo, re-solicitud, revocación y auditoría quedan registrados", async () => {
      const ownerZone = await query<{ id: string }>(`SELECT CAST(pertenencia_id AS CHAR) AS id FROM pertenencias_zona
        WHERE usuario_id=? AND sector_id=?`, [ownerId, requesterSector]);
      ownerZoneId = ownerZone[0].id;
      await reviewer.patch(`/api/admin/verifications/zones/${ownerZoneId}`).set(headers)
        .send({ accion: "rechazar", metodo: "REFERENCIA_VECINAL", motivo: "La referencia vecinal no pudo confirmarse." }).expect(200);
      const retry = await owner.post("/api/identity/zones").set(headers).send({ sectorId: requesterSector }).expect(202);
      assert.equal(retry.body.data.estado, "PENDIENTE");
      await approveZone(ownerZoneId);
      await reviewer.patch(`/api/admin/verifications/zones/${ownerZoneId}`).set(headers)
        .send({ accion: "revocar", metodo: "OTRO", motivo: "La revisión posterior encontró información inconsistente." }).expect(200);
      await reviewer.patch(`/api/admin/verifications/identity/${ownerId}`).set(headers)
        .send({ accion: "rechazar", metodo: "REVISION_PRESENCIAL", motivo: "No fue posible confirmar la identidad." }).expect(200);
      const resubmitted = await owner.post("/api/identity/verification-request").set(headers).send({}).expect(200);
      assert.equal(resubmitted.body.data.solicitada, true);
      const audit = await query<{ total: number }>(`SELECT COUNT(*) AS total FROM auditoria_verificaciones
        WHERE usuario_afectado_id IN (?, ?) AND actor_id=?`, [ownerId, requesterId, reviewerId]);
      assert.ok(Number(audit[0].total) >= 6);
      const revoked = await owner.get("/api/identity/zones").expect(200);
      assert.equal(revoked.body.data.find((item: { id: string }) => item.id === ownerZoneId).estado, "REVOCADA");
    });

    await t.test("una identidad o zona revocada no pasa el guard para futuras recomendaciones verificadas", async () => {
      const connection = await pool.getConnection();
      try {
        await reviewer.patch(`/api/admin/verifications/identity/${ownerId}`).set(headers)
          .send({ accion: "aprobar", metodo: "VALIDACION_INSTITUCIONAL" }).expect(200);
        await owner.post("/api/identity/zones").set(headers).send({ sectorId: requesterSector }).expect(202);
        await approveZone(ownerZoneId);
        await approveZone(requesterHomeZoneId);
        await assertInteractionEligibleForVerifiedRecommendation(connection, requesterId, ownerId, requesterSector);
        await reviewer.patch(`/api/admin/verifications/identity/${requesterId}`).set(headers)
          .send({ accion: "revocar", metodo: "OTRO", motivo: "Se revocó la acreditación tras una nueva revisión." }).expect(200);
        await assertInteractionEligibleForVerifiedRecommendation(connection, requesterId, ownerId, requesterSector)
          .then(() => assert.fail("Una identidad revocada no debe habilitar recomendaciones."), error => assert.equal(error.code, "IDENTITY_NOT_VERIFIED"));
        await requester.post("/api/identity/verification-request").set(headers).send({}).expect(200);
        await approveIdentity(requesterId);
        await reviewer.patch(`/api/admin/verifications/zones/${requesterHomeZoneId}`).set(headers)
          .send({ accion: "revocar", metodo: "OTRO", motivo: "El vecino pidió retirar esta pertenencia." }).expect(200);
        await assertInteractionEligibleForVerifiedRecommendation(connection, requesterId, ownerId, requesterSector)
          .then(() => assert.fail("Una pertenencia revocada no debe habilitar recomendaciones."), error => assert.equal(error.code, "ZONE_NOT_VERIFIED"));
      } finally { connection.release(); }
    });

    await t.test("el motivo administrativo no admite DNI en texto libre", async () => {
      await reviewer.patch(`/api/admin/verifications/identity/${requesterId}`).set(headers)
        .send({ accion: "rechazar", metodo: "OTRO", motivo: "DNI 12345678 verificado" }).expect(400);
    });
  } finally {
    reviewerIds.length = originalReviewerCount;
    await pool.end();
  }
});
