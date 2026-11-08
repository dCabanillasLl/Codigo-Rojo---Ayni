import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import jwt from "jsonwebtoken";
import request from "supertest";
import { config } from "../src/config.js";

const enabled = process.env.RUN_MYSQL_TESTS === "1";

test("MySQL/API: recomendaciones, evidencia vigente y Visto Bueno Vecinal", { skip: !enabled }, async (t) => {
  assert.ok(/^ayni_test_[a-zA-Z0-9_]+$/.test(process.env.DB_NAME ?? ""), "Usar solo una base local ayni_test_*.");
  assert.ok(["127.0.0.1", "localhost", "::1"].includes(process.env.DB_HOST ?? ""), "Esta prueba solo admite MySQL local.");
  assert.ok(config.jwtSecret, "Se requiere el secreto JWT exclusivo para pruebas.");
  const { default: app } = await import("../src/app.js");
  const { pool, query, transaction } = await import("../src/db/index.js");
  const { insert } = await import("../src/services/community-data.js");
  const tag = randomUUID().slice(0, 10);
  const headers = { Origin: "http://localhost:8443", "X-AYNI-Client": "web" };
  const now = new Date();

  const fixtures = await transaction(async (connection) => {
    const sectorId = await insert(connection, `INSERT INTO sectores_vecinales (nombre,distrito,ciudad,codigo_pais)
      VALUES (?, 'Distrito de pruebas', 'Pruebas', 'PE')`, [`Reseñas ${tag}`]);
    const otherSectorId = await insert(connection, `INSERT INTO sectores_vecinales (nombre,distrito,ciudad,codigo_pais)
      VALUES (?, 'Otro distrito', 'Pruebas', 'PE')`, [`Otra zona ${tag}`]);
    const locationId = await insert(connection, "INSERT INTO ubicaciones (sector_id,latitud,longitud) VALUES (?, -12.073, -77.063)", [sectorId]);
    const otherLocationId = await insert(connection, "INSERT INTO ubicaciones (sector_id,latitud,longitud) VALUES (?, -12.08, -77.06)", [otherSectorId]);
    const categoryId = await insert(connection, "INSERT INTO categorias_publicacion (nombre) VALUES (?)", [`Servicios ${tag}`]);
    const users: Record<string, string> = {};
    const addUser = async (role: string, identity: "VERIFICADA" | "PENDIENTE" | "REVOCADA" = "VERIFICADA",
      zone: "VERIFICADA" | "PENDIENTE" = "VERIFICADA", zoneSector = sectorId, expiry: Date | null = null, oldVerifiedAt?: Date) => {
      const userLocation = zoneSector === sectorId ? locationId : otherLocationId;
      const userId = await insert(connection, `INSERT INTO usuarios (nombres,apellidos,correo,telefono,hash_contrasena,ubicacion_id)
        VALUES (?, 'Vecino Prueba', ?, NULL, 'hash-sintetico-no-login', ?)`, [role, `${tag}-${role}@example.test`, userLocation]);
      const verifiedAt = oldVerifiedAt ?? now;
      const revokedAt = identity === "REVOCADA" ? new Date(verifiedAt.getTime() + 1000) : null;
      await connection.execute(`INSERT INTO verificaciones_identidad (usuario_id,estado,metodo,verificada_en,revocada_en)
        VALUES (?, ?, 'REVISION_PRESENCIAL', ?, ?)`, [userId, identity, identity === "PENDIENTE" ? null : verifiedAt, revokedAt]);
      await connection.execute(`INSERT INTO pertenencias_zona (usuario_id,sector_id,metodo,estado,verificada_en,vence_en,revocada_en)
        VALUES (?, ?, 'REFERENCIA_VECINAL', ?, ?, ?, NULL)`, [userId, zoneSector, zone,
        zone === "VERIFICADA" ? verifiedAt : null, zone === "VERIFICADA" ? expiry : null]);
      return userId;
    };
    const owner = await addUser("owner");
    const valid = await addUser("valid");
    const validSecond = await addUser("validSecond");
    const pendingIdentity = await addUser("pendingIdentity", "PENDIENTE");
    const revokedIdentity = await addUser("revokedIdentity", "REVOCADA");
    const anotherZone = await addUser("anotherZone", "VERIFICADA", "VERIFICADA", otherSectorId);
    const expiredZone = await addUser("expiredZone", "VERIFICADA", "VERIFICADA", sectorId,
      new Date(now.getTime() - 24 * 60 * 60 * 1000), new Date(now.getTime() - 48 * 60 * 60 * 1000));
    const activeExperience = await addUser("activeExperience");
    const noEvidence = await addUser("noEvidence");
    const historicalUser = await addUser("historicalUser");
    const mismatch = await addUser("mismatch");
    const concurrent = await addUser("concurrent");
    const pub = async (title: string) => insert(connection, `INSERT INTO publicaciones
      (propietario_id,ubicacion_id,categoria_id,tipo,titulo,descripcion,modalidad_precio,estado)
      VALUES (?, ?, ?, 'servicio', ?, 'Servicio sintético de integración.', 'gratis', 'publicada')`,
    [owner, locationId, categoryId, `${title} ${tag}`]);
    const publicationId = await pub("Servicio principal");
    const otherPublicationId = await pub("Otro servicio");
    const historicalReviewId = await insert(connection, `INSERT INTO resenas
      (publicacion_id, usuario_id, calificacion, comentario)
      VALUES (?, ?, 4, 'Opinión histórica sin interacción vinculada.')`, [publicationId, historicalUser]);
    await connection.execute("UPDATE resenas SET creado_en=UTC_TIMESTAMP(3)-INTERVAL 2 YEAR WHERE resena_id=?", [historicalReviewId]);
    const interaction = async (requesterId: string, listingId: string, status: "PENDIENTE" | "CONFIRMADA") => insert(connection,
      `INSERT INTO interacciones_publicacion (publicacion_id,solicitante_id,propietario_id,tipo,estado,
        solicitante_confirmo_en,propietario_confirmo_en,confirmada_en)
       VALUES (?, ?, ?, 'CONTRATACION', ?, ?, ?, ?)`,
      [listingId, requesterId, owner, status, status === "CONFIRMADA" ? now : null,
        status === "CONFIRMADA" ? now : null, status === "CONFIRMADA" ? now : null]);
    return {
      owner, valid, validSecond, pendingIdentity, revokedIdentity, anotherZone, expiredZone,
      activeExperience, noEvidence, historicalUser, mismatch, concurrent, historicalReviewId,
      publicationId, otherPublicationId,
      validInteraction: await interaction(valid, publicationId, "CONFIRMADA"),
      validSecondInteraction: await interaction(validSecond, publicationId, "CONFIRMADA"),
      pendingIdentityInteraction: await interaction(pendingIdentity, publicationId, "CONFIRMADA"),
      revokedIdentityInteraction: await interaction(revokedIdentity, publicationId, "CONFIRMADA"),
      anotherZoneInteraction: await interaction(anotherZone, publicationId, "CONFIRMADA"),
      expiredZoneInteraction: await interaction(expiredZone, publicationId, "CONFIRMADA"),
      activeInteraction: await interaction(activeExperience, publicationId, "PENDIENTE"),
      differentPublicationInteraction: await interaction(validSecond, otherPublicationId, "CONFIRMADA"),
      otherNeighborInteraction: await interaction(mismatch, publicationId, "CONFIRMADA"),
    };
  });

  const tokenFor = (userId: string) => jwt.sign({}, config.jwtSecret!, {
    subject: userId, issuer: "ayni-api", audience: "ayni-web", expiresIn: "1h", algorithm: "HS256",
  });
  const postReview = (userId: string, body: Record<string, unknown>) => request(app)
    .post(`/api/publicaciones/${fixtures.publicationId}/resenas`)
    .set({ ...headers, Cookie: `ayni_session=${tokenFor(userId)}` }).send(body);
  const getReviews = (userId: string | undefined, queryParams: Record<string, unknown> = {}) => {
    let req = request(app).get(`/api/publicaciones/${fixtures.publicationId}/resenas`).query(queryParams);
    if (userId) req = req.set("Cookie", `ayni_session=${tokenFor(userId)}`);
    return req;
  };

  try {
    let verifiedReviewId = "";
    let secondVerifiedReviewId = "";
    await t.test("autor autenticado, interacción confirmada e identidad/zona vigentes reciben sello", async () => {
      await request(app).post(`/api/publicaciones/${fixtures.publicationId}/resenas`).set(headers).send({ calificacion: 5 }).expect(401);
      const result = await postReview(fixtures.valid, { calificacion: 5, comentario: "Servicio amable y puntual.", interaccionId: fixtures.validInteraction }).expect(201);
      verifiedReviewId = result.body.data.id;
      assert.equal(result.body.data.publicacionId, fixtures.publicationId);
      assert.equal(result.body.data.estadoVerificacion, "VERIFICADA");
      assert.equal(Number(result.body.data.vistoBuenoVerificado), 1);
      assert.equal(result.body.data.autor, "valid V.");
      assert.doesNotMatch(JSON.stringify(result.body), /correo|telefono|dni|direccion|latitud|longitud|ubicacion|interaccionId/i);
      const ownInteractions = await request(app).get(`/api/interacciones?publicacionId=${fixtures.publicationId}`)
        .set({ ...headers, Cookie: `ayni_session=${tokenFor(fixtures.valid)}` }).expect(200);
      assert.ok(ownInteractions.body.data.some((item: { id: string; resenaCreada: boolean }) =>
        item.id === fixtures.validInteraction && item.resenaCreada === true));
      const second = await postReview(fixtures.validSecond, { calificacion: 3, interaccionId: fixtures.validSecondInteraction }).expect(201);
      secondVerifiedReviewId = second.body.data.id;
      assert.equal(second.body.data.estadoVerificacion, "VERIFICADA");
    });

    await t.test("identidad pendiente o revocada, otra zona y zona vencida dejan la recomendación pendiente", async () => {
      for (const [userId, interactionId] of [
        [fixtures.pendingIdentity, fixtures.pendingIdentityInteraction],
        [fixtures.revokedIdentity, fixtures.revokedIdentityInteraction],
        [fixtures.anotherZone, fixtures.anotherZoneInteraction],
        [fixtures.expiredZone, fixtures.expiredZoneInteraction],
      ]) {
        const result = await postReview(userId, { calificacion: 4, interaccionId: interactionId }).expect(201);
        assert.equal(result.body.data.estadoVerificacion, "PENDIENTE");
        assert.equal(Number(result.body.data.vistoBuenoVerificado), 0);
      }
    });

    await t.test("evidencia aún no confirmada queda pendiente; sin interacción queda no verificada", async () => {
      const pending = await postReview(fixtures.activeExperience, { calificacion: 3, interaccionId: fixtures.activeInteraction }).expect(201);
      assert.equal(pending.body.data.estadoVerificacion, "PENDIENTE");
      const noEvidence = await postReview(fixtures.noEvidence, { calificacion: 2, comentario: "Una opinión sin experiencia registrada." }).expect(201);
      assert.equal(noEvidence.body.data.estadoVerificacion, "NO_VERIFICADA");
      assert.equal(Number(noEvidence.body.data.vistoBuenoVerificado), 0);
    });

    await t.test("el servidor rechaza autorreseñas, interacciones cruzadas, canceladas y campos de verificación del cliente", async () => {
      await postReview(fixtures.owner, { calificacion: 5 }).expect(409);
      await postReview(fixtures.validSecond, { calificacion: 5, interaccionId: fixtures.differentPublicationInteraction }).expect(409);
      await postReview(fixtures.valid, { calificacion: 5, interaccionId: fixtures.otherNeighborInteraction }).expect(409);
      await postReview(fixtures.validSecond, { calificacion: 5, interaccionId: fixtures.validSecondInteraction, verificada: true }).expect(400);
      await postReview(fixtures.validSecond, { calificacion: 0 }).expect(400);
      await postReview(fixtures.validSecond, { calificacion: 5, comentario: "Necesito alcohol." }).expect(400);
    });

    await t.test("no se puede duplicar una opinión ni respaldar otra con la misma interacción", async () => {
      await postReview(fixtures.valid, { calificacion: 4, interaccionId: fixtures.validInteraction }).expect(409);
    });

    await t.test("dos solicitudes concurrentes crean como máximo una opinión", async () => {
      const responses = await Promise.all([
        postReview(fixtures.concurrent, { calificacion: 4 }),
        postReview(fixtures.concurrent, { calificacion: 4 }),
      ]);
      assert.deepEqual(responses.map((response) => response.status).sort(), [201, 409]);
    });

    await t.test("las reseñas históricas permanecen no verificadas y la revocación posterior quita el sello", async () => {
      await query(`UPDATE interacciones_publicacion SET estado='CANCELADA', solicitante_confirmo_en=NULL,
        propietario_confirmo_en=NULL, confirmada_en=NULL WHERE interaccion_id=?`, [fixtures.validSecondInteraction]);
      await query("UPDATE verificaciones_identidad SET estado='REVOCADA', revocada_en=UTC_TIMESTAMP(3) WHERE usuario_id=?", [fixtures.valid]);
      const filtered = await getReviews(fixtures.valid, { filtro: "todas" }).expect(200);
      const changed = filtered.body.data.find((item: { id: string }) => item.id === verifiedReviewId);
      assert.equal(changed.estadoVerificacion, "PENDIENTE");
      assert.equal(Number(changed.vistoBuenoVerificado), 0);
      const invalidated = filtered.body.data.find((item: { id: string }) => item.id === secondVerifiedReviewId);
      assert.equal(invalidated.estadoVerificacion, "NO_VERIFICADA");
      assert.equal(Number(invalidated.vistoBuenoVerificado), 0);
      const historicalReview = filtered.body.data.find((item: { id: string }) => item.id === fixtures.historicalReviewId);
      assert.equal(historicalReview.estadoVerificacion, "NO_VERIFICADA");
    });

    await t.test("filtros, orden, paginación y resumen separan las opiniones verificadas", async () => {
      const all = await getReviews(fixtures.owner, { filtro: "todas", pagina: 1, porPagina: 2, orden: "recientes" }).expect(200);
      assert.equal(all.body.data.length, 2);
      assert.equal(all.body.paginacion.porPagina, 2);
      assert.ok(all.body.paginacion.total > 2);
      const verified = await getReviews(fixtures.owner, { filtro: "verificadas" }).expect(200);
      assert.equal(verified.body.data.length, 0, "La reseña verificada perdió el sello tras revocación.");
      const pending = await getReviews(fixtures.owner, { filtro: "pendientes" }).expect(200);
      assert.ok(pending.body.data.length >= 1);
      const noVerified = await getReviews(fixtures.owner, { filtro: "no_verificadas" }).expect(200);
      assert.ok(noVerified.body.data.some((item: { estadoVerificacion: string }) => item.estadoVerificacion === "NO_VERIFICADA"));
      const summary = await request(app).get(`/api/publicaciones/${fixtures.publicationId}/resenas/resumen`).expect(200);
      assert.ok(summary.body.data.total > 2);
      assert.equal(summary.body.data.verificadas, 0);
      assert.ok(summary.body.data.pendientes >= 1);
      assert.ok(summary.body.data.noVerificadas >= 1);
      assert.equal(summary.body.data.promedioVerificado, null);
      assert.ok(summary.body.data.promedioGeneral > 0);
      assert.doesNotMatch(JSON.stringify(all.body), /correo|telefono|dni|direccion|latitud|longitud|hash_contrasena/i);
    });

    await t.test("un tercero no accede a reseñas de publicación no pública", async () => {
      await query("UPDATE publicaciones SET estado='pausada' WHERE publicacion_id=?", [fixtures.publicationId]);
      await request(app).get(`/api/publicaciones/${fixtures.publicationId}/resenas`).expect(404);
      await request(app).get(`/api/publicaciones/${fixtures.publicationId}/resenas/resumen`)
        .set("Cookie", `ayni_session=${tokenFor(fixtures.owner)}`).expect(200);
    });
  } finally {
    await pool.end();
  }
});
