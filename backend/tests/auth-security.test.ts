import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import request from "supertest";
import { registerSchema, listSchema, phoneSchema } from "../src/lib/validation.js";
import { geoFilter } from "../src/lib/location.js";
import { protectMutations, verifyExpectedUser } from "../src/middlewares/security.js";
import { errorHandler } from "../src/middlewares/errors.js";

const origin = "http://localhost:8443";
test('el celular peruano se normaliza con +51 y exige nueve dígitos empezando con 9', () => {
  for (const value of ['987654321', '+51987654321', '51987654321', ' 987654321 ']) {
    assert.equal(phoneSchema.parse(value), '+51987654321');
  }
  for (const value of ['', '+51', '98765432', '9876543210', '887654321', '+54987654321', '+5151987654321', '987abc321']) {
    assert.equal(phoneSchema.safeParse(value).success, false, value);
  }
  assert.equal(phoneSchema.nullable().optional().parse(null), null);
  assert.equal(phoneSchema.nullable().optional().parse(undefined), undefined);
});
test('las lecturas de caché privada verifican la cuenta activa antes de devolver datos', async () => {
  const app = express();
  app.use((req, _res, next) => { req.userId = req.get('X-Test-User') || ''; next(); });
  app.use(verifyExpectedUser);
  app.get('/private', (_req, res) => res.json({ data: 'dato de prueba' }));
  app.use(errorHandler);
  await request(app).get('/private').set({ 'X-Test-User': '1', 'X-AYNI-User': '1' }).expect(200);
  const mismatch = await request(app).get('/private').set({ 'X-Test-User': '2', 'X-AYNI-User': '1' }).expect(409);
  assert.equal(mismatch.body.error.code, 'SESSION_CHANGED');
  await request(app).get('/private').set('X-AYNI-User', '1').expect(409);
});
const app = express();
app.use(protectMutations([origin]));
app.use(express.json());
app.post("/action", (_req, res) => { res.json({ data: true }); });
app.use(errorHandler);

test("mutaciones rechazan origen ajeno aunque incluya el encabezado del cliente", async () => {
  const response = await request(app).post("/action").set("Origin", "https://untrusted.example").set("X-AYNI-Client", "web").send({});
  assert.equal(response.status, 403);
  assert.equal(response.body.error.code, "INVALID_ORIGIN");
});
test("mutaciones requieren encabezado propio y contenido JSON", async () => {
  assert.equal((await request(app).post("/action").set("Origin", origin).send({})).status, 403);
  assert.equal((await request(app).post("/action").set("Origin", origin).set("X-AYNI-Client", "web").type("form").send("x=1")).status, 415);
  assert.equal((await request(app).post("/action").set("Origin", origin).set("X-AYNI-Client", "web").send({})).status, 200);
});
test("registro no acepta contraseñas truncadas por bcrypt ni coordenadas incompletas", () => {
  const base = { nombres: "Milagros", apellidos: "Vecina", correo: "MILA@example.com", contrasena: "contraseña-segura", sectorId: "1", direccion: "Referencia de prueba", dni: "00000000", consentimientoDni: true, dniProof: "prueba-sintetica-no-es-un-token-real" };
  assert.equal(registerSchema.parse(base).correo, "mila@example.com");
  assert.equal(registerSchema.safeParse({ ...base, contrasena: "ñ".repeat(40) }).success, false);
  assert.equal(registerSchema.safeParse({ ...base, latitud: -12 }).success, false);
  assert.equal(registerSchema.safeParse({ ...base, sectorId: "1 OR 1=1" }).success, false);
});
test("filtros de cercanía exigen coordenadas conjuntas y radio entre 1 y 2 km", () => {
  assert.equal(listSchema.safeParse({ latitud: "-12" }).success, false);
  assert.equal(listSchema.safeParse({ radio: "3000" }).success, false);
  const geo = geoFilter(listSchema.parse({ latitud: "-12.07", longitud: "-77.06", radio: "1500" }));
  assert.ok(geo.conditions.some((condition) => condition.includes("l.latitud BETWEEN")));
  assert.ok(geo.conditions.some((condition) => condition.includes("ASIN")));
  assert.ok(geo.select.includes("/ 50"));
});
test("error de base de datos no expone SQL ni datos privados", async () => {
  const app = express();
  app.get("/error", (_req, _res, next) => { next({ code: "ER_DUP_ENTRY", sql: "private", sqlMessage: "private@example.com" }); });
  app.use(errorHandler);
  const result = await request(app).get("/error");
  assert.equal(result.status, 409);
  assert.ok(!JSON.stringify(result.body).includes("private"));
});
