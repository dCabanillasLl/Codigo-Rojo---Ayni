import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import jwt from "jsonwebtoken";
import request from "supertest";
import { config } from "../src/config.js";

const enabled = process.env.RUN_MYSQL_TESTS === "1";

test("MySQL/API: experiencias verificables vinculadas a publicaciones", { skip: !enabled }, async (t) => {
  assert.ok(/^ayni_test_[a-zA-Z0-9_]+$/.test(process.env.DB_NAME ?? ""), "Usar exclusivamente una base ayni_test_* preparada para pruebas.");
  assert.ok(["127.0.0.1", "localhost", "::1"].includes(process.env.DB_HOST ?? ""), "Esta prueba solo admite MySQL local.");
  assert.ok(config.jwtSecret, "Se requiere un secreto JWT exclusivo del entorno de pruebas.");
  const { default: app } = await import("../src/app.js");
  const { pool, query, transaction } = await import("../src/db/index.js");
  const { insert } = await import("../src/services/community-data.js");
  const tag = randomUUID().slice(0, 12);
  const origin = (process.env.FRONTEND_ORIGIN || "http://localhost:8444").split(",")[0];
  const baseHeaders = { Origin: origin, "X-AYNI-Client": "web" };
  let fixtures: { requesterId: string; providerId: string; strangerId: string; publicationId: string; cancellationPublicationId: string; concurrentPublicationId: string };

  fixtures = await transaction(async (connection) => {
    const sectorId = await insert(connection, `INSERT INTO sectores_vecinales (nombre,distrito,ciudad,codigo_pais)
      VALUES (?, 'Distrito de prueba', 'Pruebas', 'PE')`, [`Interacciones ${tag}`]);
    const locationId = await insert(connection, `INSERT INTO ubicaciones (sector_id,latitud,longitud)
      VALUES (?, -12.073, -77.063)`, [sectorId]);
    const ids: string[] = [];
    for (const role of ["solicitante", "proveedor", "tercero"]) {
      ids.push(await insert(connection, `INSERT INTO usuarios (nombres,apellidos,correo,hash_contrasena,ubicacion_id)
        VALUES (?, 'Prueba', ?, 'hash-sintetico-no-usar-para-login', ?)`, [role, `${tag}-${role}@example.test`, locationId]));
    }
    const categoryId = await insert(connection, "INSERT INTO categorias_publicacion (nombre) VALUES (?)", [`Categoría ${tag}`]);
    const publish = async (title: string) => insert(connection, `INSERT INTO publicaciones
      (propietario_id,ubicacion_id,categoria_id,tipo,titulo,descripcion,modalidad_precio,estado)
      VALUES (?, ?, ?, 'producto', ?, 'Publicación sintética para prueba de integración.', 'gratis', 'publicada')`,
    [ids[1], locationId, categoryId, `${title} ${tag}`]);
    return { requesterId: ids[0], providerId: ids[1], strangerId: ids[2],
      publicationId: await publish("Publicación principal"), cancellationPublicationId: await publish("Publicación cancelable"),
      concurrentPublicationId: await publish("Publicación concurrente") };
  });

  const tokenFor = (userId: string) => jwt.sign({}, config.jwtSecret!, {
    subject: userId, issuer: "ayni-api", audience: "ayni-web", expiresIn: "1h", algorithm: "HS256",
  });
  const send = (userId: string, method: "get" | "post" | "patch", path: string) =>
    request(app)[method](path).set({ ...baseHeaders, Cookie: `ayni_session=${tokenFor(userId)}` });

  try {
    await t.test("autenticación, publicación inexistente y auto-interacción", async () => {
      await request(app).post(`/api/publicaciones/${fixtures.publicationId}/interacciones`).set(baseHeaders).send({ tipo: "COMPRA" }).expect(401);
      const missing = await send(fixtures.requesterId, "post", "/api/publicaciones/999999999999/interacciones").send({ tipo: "CONSULTA" });
      assert.equal(missing.status, 404, JSON.stringify(missing.body));
      await send(fixtures.providerId, "post", `/api/publicaciones/${fixtures.publicationId}/interacciones`).send({ tipo: "COMPRA" }).expect(409);
    });

    let interactionId = "";
    await t.test("creación deriva el proveedor de la publicación y rechaza IDs del cliente", async () => {
      await send(fixtures.requesterId, "post", `/api/publicaciones/${fixtures.publicationId}/interacciones`)
        .send({ tipo: "COMPRA", propietarioId: fixtures.strangerId }).expect(400);
      await send(fixtures.requesterId, "post", `/api/publicaciones/${fixtures.publicationId}/interacciones`)
        .send({ tipo: "NO_VALIDO" }).expect(400);
      const created = await send(fixtures.requesterId, "post", `/api/publicaciones/${fixtures.publicationId}/interacciones`)
        .send({ tipo: "COMPRA" }).expect(201);
      interactionId = created.body.data.id;
      assert.equal(created.body.data.estado, "PENDIENTE");
      assert.equal(created.body.data.miRol, "SOLICITANTE");
      assert.equal(created.body.data.otroParticipante, "proveedor P.");
      assert.doesNotMatch(JSON.stringify(created.body), /correo|telefono|dni|direccion|latitud|longitud|propietarioId|solicitanteId/i);
      const duplicate = await send(fixtures.requesterId, "post", `/api/publicaciones/${fixtures.publicationId}/interacciones`)
        .send({ tipo: "COMPRA" }).expect(200);
      assert.equal(duplicate.body.reused, true);
      assert.equal(duplicate.body.data.id, interactionId);
      await send(fixtures.requesterId, "post", `/api/publicaciones/${fixtures.publicationId}/interacciones`)
        .send({ tipo: "CONSULTA" }).expect(409);
      assert.equal(Number((await query<{ total: number | string }>(`SELECT COUNT(*) AS total FROM interacciones_publicacion
        WHERE publicacion_id=? AND solicitante_id=? AND estado IN ('PENDIENTE','ACEPTADA','EN_CURSO')`,
      [fixtures.publicationId, fixtures.requesterId]))[0].total), 1);
    });

    await t.test("terceros no ven detalle ni pueden actuar; participantes solo transicionan desde su rol", async () => {
      await send(fixtures.strangerId, "get", `/api/interacciones/${interactionId}`).expect(404);
      await send(fixtures.strangerId, "patch", `/api/interacciones/${interactionId}`).send({ accion: "aceptar" }).expect(404);
      await send(fixtures.requesterId, "patch", `/api/interacciones/${interactionId}`).send({ accion: "aceptar" }).expect(403);
      await send(fixtures.providerId, "patch", `/api/interacciones/${interactionId}`).send({ accion: "confirmar" }).expect(403);
      await send(fixtures.requesterId, "patch", `/api/interacciones/${interactionId}`).send({ accion: "confirmar" }).expect(409);
      await send(fixtures.providerId, "patch", `/api/interacciones/${interactionId}`).send({ accion: "aceptar" }).expect(200);
      await send(fixtures.providerId, "patch", `/api/interacciones/${interactionId}`).send({ accion: "aceptar" }).expect(200);
      await send(fixtures.providerId, "patch", `/api/interacciones/${interactionId}`).send({ accion: "rechazar" }).expect(409);
      const mine = await send(fixtures.requesterId, "get", "/api/interacciones").expect(200);
      assert.ok(mine.body.data.some((item: { id: string }) => item.id === interactionId));
      const scopedMine = await send(fixtures.requesterId, "get", `/api/interacciones?publicacionId=${fixtures.publicationId}`).expect(200);
      assert.ok(scopedMine.body.data.some((item: { id: string; publicacionId: string; miRol: string; resenaCreada: boolean }) =>
        item.id === interactionId && item.publicacionId === fixtures.publicationId && item.miRol === "SOLICITANTE" && item.resenaCreada === false), JSON.stringify(scopedMine.body));
      const scopedStranger = await send(fixtures.strangerId, "get", `/api/interacciones?publicacionId=${fixtures.publicationId}`).expect(200);
      assert.equal(scopedStranger.body.data.length, 0, "El listado solo devuelve experiencias de la cuenta autenticada.");
      await send(fixtures.requesterId, "get", `/api/interacciones?publicacionId=${fixtures.publicationId}&otro=valor`).expect(400);
    });

    await t.test("cumplimiento del proveedor y recepción del solicitante confirman bilateralmente", async () => {
      await send(fixtures.requesterId, "patch", `/api/interacciones/${interactionId}`).send({ accion: "iniciar" }).expect(403);
      await send(fixtures.providerId, "patch", `/api/interacciones/${interactionId}`).send({ accion: "cumplir" }).expect(409);
      await send(fixtures.providerId, "patch", `/api/interacciones/${interactionId}`).send({ accion: "iniciar" }).expect(200);
      await send(fixtures.requesterId, "patch", `/api/interacciones/${interactionId}`).send({ accion: "cumplir" }).expect(403);
      const fulfilled = await send(fixtures.providerId, "patch", `/api/interacciones/${interactionId}`).send({ accion: "cumplir" }).expect(200);
      assert.equal(fulfilled.body.data.estado, "EN_CURSO");
      assert.equal(fulfilled.body.data.cumplimientoMarcado, true);
      const fulfilledAt = fulfilled.body.data.cumplimientoMarcadoEn;
      const repeated = await send(fixtures.providerId, "patch", `/api/interacciones/${interactionId}`).send({ accion: "cumplir" }).expect(200);
      assert.equal(repeated.body.data.cumplimientoMarcadoEn, fulfilledAt);
      const confirmed = await send(fixtures.requesterId, "patch", `/api/interacciones/${interactionId}`).send({ accion: "confirmar" }).expect(200);
      assert.equal(confirmed.body.data.estado, "CONFIRMADA");
      assert.equal(confirmed.body.data.recepcionConfirmada, true);
      assert.ok(confirmed.body.data.confirmadaEn);
      const confirmedAt = confirmed.body.data.confirmadaEn;
      assert.equal((await send(fixtures.requesterId, "patch", `/api/interacciones/${interactionId}`)
        .send({ accion: "confirmar" }).expect(200)).body.data.confirmadaEn, confirmedAt);
      await send(fixtures.requesterId, "patch", `/api/interacciones/${interactionId}`).send({ accion: "cancelar" }).expect(409);
      const evidence = await transaction((connection) => import("../src/services/publication-interactions.js").then(({ getConfirmedPublicationInteraction }) =>
        getConfirmedPublicationInteraction(connection, interactionId, fixtures.requesterId, fixtures.publicationId)));
      assert.equal(evidence.id, interactionId);
    });

    await t.test("cancelación, disponibilidad y transiciones terminales se respetan", async () => {
      const created = await send(fixtures.requesterId, "post", `/api/publicaciones/${fixtures.cancellationPublicationId}/interacciones`)
        .send({ tipo: "CONSULTA" }).expect(201);
      const id = created.body.data.id;
      await send(fixtures.strangerId, "patch", `/api/interacciones/${id}`).send({ accion: "cancelar" }).expect(404);
      await send(fixtures.requesterId, "patch", `/api/interacciones/${id}`).send({ accion: "cancelar" }).expect(200);
      await send(fixtures.requesterId, "patch", `/api/interacciones/${id}`).send({ accion: "cancelar" }).expect(200);
      await send(fixtures.providerId, "patch", `/api/interacciones/${id}`).send({ accion: "iniciar" }).expect(409);
      await query("UPDATE publicaciones SET estado='pausada' WHERE publicacion_id=?", [fixtures.cancellationPublicationId]);
      await send(fixtures.requesterId, "post", `/api/publicaciones/${fixtures.cancellationPublicationId}/interacciones`)
        .send({ tipo: "OTRO" }).expect(404);
    });

    await t.test("dos creaciones simultáneas generan una única interacción activa", async () => {
      const responses = await Promise.all([
        send(fixtures.requesterId, "post", `/api/publicaciones/${fixtures.concurrentPublicationId}/interacciones`).send({ tipo: "OTRO" }),
        send(fixtures.requesterId, "post", `/api/publicaciones/${fixtures.concurrentPublicationId}/interacciones`).send({ tipo: "OTRO" }),
      ]);
      assert.deepEqual(responses.map((response) => response.status).sort(), [200, 201]);
      assert.equal(responses[0].body.data.id, responses[1].body.data.id);
      assert.equal(Number((await query<{ total: number | string }>(`SELECT COUNT(*) AS total FROM interacciones_publicacion
        WHERE publicacion_id=? AND solicitante_id=? AND estado IN ('PENDIENTE','ACEPTADA','EN_CURSO')`,
      [fixtures.concurrentPublicationId, fixtures.requesterId]))[0].total), 1);
    });
  } finally {
    await pool.end();
  }
});
