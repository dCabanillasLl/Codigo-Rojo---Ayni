// Isolated fixtures and static build only. Never proxies to the real API/database.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';

const root = resolve('dist');
const publications = [{ id: '11', propietarioId: '9', propietario: 'Vecina ficticia', categoriaId: '1', categoria: 'Herramientas', tipo: 'producto', titulo: 'Escalera de prueba offline', descripcion: 'Publicación ficticia para verificar caché', modalidadPrecio: 'gratis', precio: null, estado: 'publicada', totalResenas: 0, promedioResenas: null, sectorId: '1', distanciaMetros: null, imagenUrl: null }];
const catalogs = { publicaciones: [{ id: '1', nombre: 'Herramientas' }], ayuda: [{ id: '1', nombre: 'Favores' }], avisos: [{ id: '1', nombre: 'Actividades' }] };
let requests = new Map(), attempts = [], dropNext = false;
const json = (res, code, body) => { res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(body)); };
const user = id => ({ id, nombres: id === '1' ? 'Alba' : 'Berta', apellidos: 'Prueba', correo: null, telefono: null, telefonoPublico: false, notificacionesCorreo: false, sectorId: '1', sectorNombre: 'Zona de prueba', latitud: null, longitud: null });
createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://127.0.0.1:8731');
    const account = /(?:^|;\s*)test-account=(\w+)/.exec(req.headers.cookie || '')?.[1];
    if (url.pathname === '/__test/state') return json(res, 200, { records: [...requests.values()], attempts });
    if (url.pathname === '/__test/reset') { requests = new Map(); attempts = []; dropNext = url.searchParams.has('drop'); return json(res, 200, {}); }
    if (url.pathname.startsWith('/api/')) {
      const path = url.pathname.slice(4);
      if (req.headers['x-ayni-user'] && req.headers['x-ayni-user'] !== account) return json(res, 409, { error: { code: 'SESSION_CHANGED', message: 'La cuenta activa cambió.' } });
      if (path === '/auth/me') return json(res, account === '1' || account === '2' ? 200 : 401, account === '1' || account === '2' ? { data: user(account) } : { error: { code: 'UNAUTHENTICATED', message: 'Sesión vencida de prueba' } });
      if (path === '/catalogos') return json(res, 200, { data: catalogs });
      if (path === '/sectores') return json(res, 200, { data: [{ id: '1', nombre: 'Zona de prueba', distrito: 'Prueba', ciudad: 'Prueba' }] });
      if (path === '/publicaciones') return json(res, 200, { data: publications });
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
