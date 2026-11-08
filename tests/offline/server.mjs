// Isolated fixtures and static build only. Never proxies to the real API/database.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';

const root = resolve('dist');
const publications = [{ id: '11', propietarioId: '9', propietario: 'Vecina ficticia', categoriaId: '1', categoria: 'Herramientas', tipo: 'producto', titulo: 'Escalera de prueba offline', descripcion: 'Publicación ficticia para verificar caché', modalidadPrecio: 'gratis', precio: null, estado: 'publicada', totalResenas: 0, promedioResenas: null, sectorId: '1', sectorNombre: 'Zona de prueba', distanciaMetros: null, imagenUrl: null, moneda: 'PEN' }];
const catalogs = { publicaciones: [{ id: '1', nombre: 'Herramientas' }], ayuda: [{ id: '1', nombre: 'Favores' }], avisos: [{ id: '1', nombre: 'Actividades' }] };
let requests = new Map(), attempts = [], dropNext = false;
let ownOpinion = false;
let failReviewReads = false, expireReviewSubmit = false;
let recommendations = [
  { id: 'r1', publicacionId: '11', autor: 'Alba P.', calificacion: 5, comentario: '<img src=x onerror=alert(1)> Servicio cumplido.', creadoEn: '2026-11-06T12:00:00.000Z', estadoVerificacion: 'VERIFICADA', vistoBuenoVerificado: true, verificadaEn: '2026-11-06T12:00:00.000Z' },
  { id: 'r2', publicacionId: '11', autor: 'Berta P.', calificacion: 4, comentario: 'La experiencia está en proceso.', creadoEn: '2026-11-05T12:00:00.000Z', estadoVerificacion: 'PENDIENTE', vistoBuenoVerificado: false, verificadaEn: null },
  { id: 'r3', publicacionId: '11', autor: 'Celia P.', calificacion: 3, comentario: 'Opinión compartida sin vincular una experiencia.', creadoEn: '2026-11-04T12:00:00.000Z', estadoVerificacion: 'NO_VERIFICADA', vistoBuenoVerificado: false, verificadaEn: null },
  { id: 'r4', publicacionId: '11', autor: 'Diana P.', calificacion: 4, comentario: 'Otra experiencia del barrio.', creadoEn: '2026-11-03T12:00:00.000Z', estadoVerificacion: 'VERIFICADA', vistoBuenoVerificado: true, verificadaEn: '2026-11-03T12:00:00.000Z' },
  { id: 'r5', publicacionId: '11', autor: 'Elena P.', calificacion: 5, comentario: 'Más de una opinión para probar páginas.', creadoEn: '2026-11-02T12:00:00.000Z', estadoVerificacion: 'PENDIENTE', vistoBuenoVerificado: false, verificadaEn: null },
  { id: 'r6', publicacionId: '11', autor: 'Flora P.', calificacion: 3, comentario: 'Una opinión adicional.', creadoEn: '2026-11-01T12:00:00.000Z', estadoVerificacion: 'NO_VERIFICADA', vistoBuenoVerificado: false, verificadaEn: null },
];
const ownInteractions = [
  { id: '91', publicacionId: '11', publicacion: { titulo: 'Escalera de prueba offline', tipo: 'producto' }, tipo: 'COMPRA', estado: 'CONFIRMADA', miRol: 'SOLICITANTE', otroParticipante: 'Vecina ficticia', creadaEn: '2026-11-01T12:00:00.000Z', actualizadaEn: '2026-11-06T12:00:00.000Z', cumplimientoMarcado: true, recepcionConfirmada: true, confirmadaEn: '2026-11-06T12:00:00.000Z', resenaCreada: false },
  { id: '92', publicacionId: '11', publicacion: { titulo: 'Escalera de prueba offline', tipo: 'producto' }, tipo: 'CONSULTA', estado: 'EN_CURSO', miRol: 'SOLICITANTE', otroParticipante: 'Vecina ficticia', creadaEn: '2026-11-04T12:00:00.000Z', actualizadaEn: '2026-11-06T12:00:00.000Z', cumplimientoMarcado: false, recepcionConfirmada: false, confirmadaEn: null, resenaCreada: false },
  { id: '93', publicacionId: '11', publicacion: { titulo: 'Escalera de prueba offline', tipo: 'producto' }, tipo: 'COMPRA', estado: 'CONFIRMADA', miRol: 'SOLICITANTE', otroParticipante: 'Vecina ficticia', creadaEn: '2026-11-02T12:00:00.000Z', actualizadaEn: '2026-11-05T12:00:00.000Z', cumplimientoMarcado: true, recepcionConfirmada: true, confirmadaEn: '2026-11-05T12:00:00.000Z', resenaCreada: true },
];
const initialRecommendations = recommendations.map(item => ({ ...item }));
const initialOwnInteractions = ownInteractions.map(item => ({ ...item }));
const json = (res, code, body) => { res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(body)); };
const user = id => ({ id, nombres: id === '1' ? 'Alba' : 'Berta', apellidos: 'Prueba', correo: null, telefono: null, telefonoPublico: false, notificacionesCorreo: false, sectorId: '1', sectorNombre: 'Zona de prueba', latitud: null, longitud: null });
createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://127.0.0.1:8731');
    const account = /(?:^|;\s*)test-account=(\w+)/.exec(req.headers.cookie || '')?.[1];
    if (url.pathname === '/__test/state') return json(res, 200, { records: [...requests.values()], attempts });
    if (url.pathname === '/__test/reset') {
      requests = new Map(); attempts = []; dropNext = url.searchParams.has('drop'); ownOpinion = false;
      failReviewReads = url.searchParams.has('failReviewReads'); expireReviewSubmit = url.searchParams.has('expireReviewSubmit');
      recommendations.splice(0, recommendations.length, ...initialRecommendations.map(item => ({ ...item })));
      ownInteractions.splice(0, ownInteractions.length, ...initialOwnInteractions.map(item => ({ ...item })));
      return json(res, 200, {});
    }
    if (url.pathname === '/__test/revoke' && req.method === 'POST') {
      const item = recommendations.find(review => review.id === 'r1');
      if (item) { item.estadoVerificacion = 'PENDIENTE'; item.vistoBuenoVerificado = false; item.verificadaEn = null; }
      return json(res, 200, { data: { revocado: true } });
    }
    if (url.pathname === '/__test/recover') { failReviewReads = false; return json(res, 200, {}); }
    if (url.pathname.startsWith('/api/')) {
      const path = url.pathname.slice(4);
      if (req.headers['x-ayni-user'] && req.headers['x-ayni-user'] !== account) return json(res, 409, { error: { code: 'SESSION_CHANGED', message: 'La cuenta activa cambió.' } });
      if (path === '/auth/me') return json(res, account === '1' || account === '2' ? 200 : 401, account === '1' || account === '2' ? { data: user(account) } : { error: { code: 'UNAUTHENTICATED', message: 'Sesión vencida de prueba' } });
      if (path === '/catalogos') return json(res, 200, { data: catalogs });
      if (path === '/sectores') return json(res, 200, { data: [{ id: '1', nombre: 'Zona de prueba', distrito: 'Prueba', ciudad: 'Prueba' }] });
      if (path === '/publicaciones') return json(res, 200, { data: publications });
      if (path === '/publicaciones/11' && req.method === 'GET') return json(res, 200, { data: publications[0] });
      if (path === '/publicaciones/11/resenas/resumen') {
        if (failReviewReads) return json(res, 503, { error: { code: 'DATABASE_UNAVAILABLE', message: 'Servicio de prueba no disponible.' } });
        const counts = Object.fromEntries(['VERIFICADA', 'PENDIENTE', 'NO_VERIFICADA'].map(state => [state, recommendations.filter(item => item.estadoVerificacion === state).length]));
        const verified = recommendations.filter(item => item.estadoVerificacion === 'VERIFICADA');
        const average = values => values.length ? Math.round(values.reduce((sum, item) => sum + item.calificacion, 0) / values.length * 10) / 10 : null;
        return json(res, 200, { data: { total: recommendations.length, verificadas: counts.VERIFICADA, pendientes: counts.PENDIENTE, noVerificadas: counts.NO_VERIFICADA, promedioVerificado: average(verified), promedioGeneral: average(recommendations), miOpinion: ownOpinion } });
      }
      if (path === '/publicaciones/11/resenas' && req.method === 'GET') {
        if (failReviewReads) return json(res, 503, { error: { code: 'DATABASE_UNAVAILABLE', message: 'Servicio de prueba no disponible.' } });
        const filter = url.searchParams.get('filtro') || 'todas';
        const stateByFilter = { verificadas: 'VERIFICADA', pendientes: 'PENDIENTE', no_verificadas: 'NO_VERIFICADA' };
        const rows = stateByFilter[filter] ? recommendations.filter(item => item.estadoVerificacion === stateByFilter[filter]) : recommendations;
        const perPage = Number(url.searchParams.get('porPagina') || 5), page = Number(url.searchParams.get('pagina') || 1);
        return json(res, 200, { data: rows.slice((page - 1) * perPage, page * perPage), paginacion: { pagina: page, porPagina: perPage, total: rows.length, totalPaginas: Math.ceil(rows.length / perPage) } });
      }
      if (path === '/publicaciones/11/resenas' && req.method === 'POST') {
        if (account !== '1' && account !== '2') return json(res, 401, { error: { code: 'UNAUTHENTICATED', message: 'Sesión vencida de prueba' } });
        if (expireReviewSubmit) { expireReviewSubmit = false; return json(res, 401, { error: { code: 'UNAUTHENTICATED', message: 'Sesión vencida de prueba' } }); }
        if (ownOpinion) return json(res, 409, { error: { code: 'REVIEW_ALREADY_EXISTS', message: 'Ya compartiste una opinión sobre esta publicación.' } });
        const chunks = []; for await (const chunk of req) chunks.push(chunk);
        const body = JSON.parse(Buffer.concat(chunks).toString());
        const interaction = ownInteractions.find(item => item.id === body.interaccionId && !item.resenaCreada);
        if (body.interaccionId && !interaction) return json(res, 409, { error: { code: 'INTERACTION_MISMATCH', message: 'La experiencia no está disponible.' } });
        const state = interaction?.estado === 'CONFIRMADA' ? 'VERIFICADA' : interaction ? 'PENDIENTE' : 'NO_VERIFICADA';
        const created = { id: 'r-new', publicacionId: '11', autor: `${user(account).nombres} P.`, calificacion: body.calificacion, comentario: body.comentario || null, creadoEn: new Date().toISOString(), estadoVerificacion: state, vistoBuenoVerificado: state === 'VERIFICADA', verificadaEn: state === 'VERIFICADA' ? new Date().toISOString() : null };
        ownOpinion = true; if (interaction) interaction.resenaCreada = true; recommendations.unshift(created);
        return json(res, 201, { data: created });
      }
      if (path === '/interacciones') {
        if (!account || !['1', '2'].includes(account)) return json(res, 401, { error: { code: 'UNAUTHENTICATED', message: 'Sesión vencida de prueba' } });
        return json(res, 200, { data: url.searchParams.get('publicacionId') === '11' ? ownInteractions : [] });
      }
      if (path === '/solicitudes' && req.method === 'POST') {
        if (account !== '1' && account !== '2') return json(res, 401, { error: { code: 'UNAUTHENTICATED', message: 'Inicia sesión' } });
        const chunks = []; for await (const chunk of req) chunks.push(chunk);
        const body = JSON.parse(Buffer.concat(chunks).toString());
        attempts.push({ account, clientRequestId: body.clientRequestId });
        const key = `${account}:${body.clientRequestId}`;
        if (!requests.has(key)) requests.set(key, { ...body, id: String(requests.size + 50), solicitanteId: account, solicitante: user(account).nombres, estado: 'abierta', categoria: 'Favores', creadoEn: new Date().toISOString() });
        if (dropNext) { dropNext = false; req.socket.destroy(); return; }
        return json(res, 201, { data: requests.get(key) });
      }
      if (path === '/solicitudes') return json(res, 200, { data: [...requests.values()] });
      if (/^\/usuarios\/\d+\/reputacion$/.test(path)) return json(res, 200, { data: { colaboracionesConfirmadas: 0, vistosBuenos: 0, promedio: null, resenas: [] } });
      return json(res, 200, { data: [] });
    }
    const file = resolve(root, `.${decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname)}`);
    if (file !== root && !file.startsWith(root + sep)) return json(res, 403, {});
    let data; try { data = await readFile(file); } catch { return json(res, 404, {}); }
    const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.wasm': 'application/wasm', '.png': 'image/png' }[extname(file)] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': mime, 'Cache-Control': extname(file) === '.html' || file.endsWith('sw.js') ? 'no-store' : 'public, max-age=31536000, immutable' }); res.end(data);
  } catch { if (!res.headersSent) json(res, 500, { error: { message: 'Error de fixture' } }); }
}).listen(8731, '127.0.0.1');
