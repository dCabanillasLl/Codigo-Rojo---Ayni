import { test, expect, type BrowserContext, type Page } from '@playwright/test';

const base = 'http://127.0.0.1:8731';
async function account(context: BrowserContext, id: string) {
  await context.addCookies([{ name: 'test-account', value: id, url: base }]);
}
async function prepare(page: Page) {
  await account(page.context(), '1');
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Hola, Alba.' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Escalera de prueba offline' })).toBeVisible();
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => undefined));
  await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
  // Wait for asynchronous catalogs and persistent SQLite initialization too.
  await page.waitForFunction(() => indexedDB.databases().then(dbs => dbs.some(db => db.name === 'ayni-sqlite-file')));
}
async function pendingRequest(page: Page, text: string) {
  await page.getByRole('button', { name: 'Necesito ayuda', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('textbox', { name: 'Tu pedido', exact: true }).fill(text);
  await expect(dialog.getByLabel('Tipo de ayuda')).toContainText('Favores');
  await dialog.getByLabel('Tipo de ayuda').selectOption('1');
  await dialog.getByRole('button', { name: 'Guardar para enviar después' }).click();
  await expect(page.getByRole('heading', { name: 'Pendientes de envío (1)' })).toBeVisible();
}

test.beforeEach(async ({ request }) => { await request.get('/__test/reset'); });

test('la aplicación recarga sin red y conserva las publicaciones ya consultadas', async ({ page, context }) => {
  await prepare(page);
  await context.setOffline(true);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: 'Escalera de prueba offline' })).toBeVisible();
  await expect(page.getByText('Ves información guardada', { exact: false }).first()).toBeVisible();
});

test('un pedido persiste tras recargar sin red y se sincroniza una sola vez al reconectar', async ({ page, context, request }) => {
  await prepare(page);
  await context.setOffline(true);
  await pendingRequest(page, 'Necesito una escalera de prueba para mañana');
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: 'Pendientes de envío (1)' })).toBeVisible();
  expect((await (await request.get('/__test/state')).json()).records).toHaveLength(0);
  await context.setOffline(false);
  await expect.poll(async () => (await (await request.get('/__test/state')).json()).records.length).toBe(1);
  await expect(page.getByRole('heading', { name: 'Pendientes de envío (1)' })).not.toBeVisible();
  expect((await (await request.get('/__test/state')).json()).attempts).toHaveLength(1);
});

test('los pendientes no se envían desde otra cuenta y se recuperan al volver a la cuenta original', async ({ page, context, request }) => {
  await prepare(page); await context.setOffline(true);
  await pendingRequest(page, 'Necesito ayuda para mover una mesa de prueba');
  await account(context, '2'); await context.setOffline(false);
  await expect(page.getByRole('button', { name: 'Perfil de Berta' })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('button', { name: 'Perfil de Berta' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Pendientes de envío (1)' })).not.toBeVisible();
  expect((await (await request.get('/__test/state')).json()).attempts).toHaveLength(0);
  await account(context, '1'); await page.reload();
  await expect.poll(async () => (await (await request.get('/__test/state')).json()).records.length).toBe(1);
  const state = await (await request.get('/__test/state')).json();
  expect(state.records[0].solicitanteId).toBe('1');
  expect(state.attempts.every((item: { account: string }) => item.account === '1')).toBe(true);
});

test('una sesión vencida detiene el envío pero no borra el pedido pendiente', async ({ page, context, request }) => {
  await prepare(page); await context.setOffline(true);
  await pendingRequest(page, 'Necesito una herramienta de prueba para reparar una silla');
  await account(context, 'expired'); await context.setOffline(false);
  await expect(page.getByRole('button', { name: 'Iniciar sesión' })).toBeVisible();
  expect((await (await request.get('/__test/state')).json()).attempts).toHaveLength(0);
  await account(context, '1'); await page.reload();
  await expect.poll(async () => (await (await request.get('/__test/state')).json()).records.length).toBe(1);
  expect((await (await request.get('/__test/state')).json()).records[0].solicitanteId).toBe('1');
});

test('perder la respuesta del servidor y reintentar no duplica el pedido', async ({ page, context, request }) => {
  await prepare(page); await request.get('/__test/reset?drop');
  await context.setOffline(true);
  await pendingRequest(page, 'Necesito un taladro de prueba para instalar una repisa');
  await context.setOffline(false);
  await expect.poll(async () => (await (await request.get('/__test/state')).json()).records.length).toBe(1);
  await expect.poll(async () => {
    const state = await (await request.get('/__test/state')).json();
    if (state.attempts.length >= 2) return true; // Reconnection may already have retried it.
    await page.getByRole('button', { name: 'Reintentar envío', exact: true }).click({ timeout: 300 }).catch(() => undefined);
    return false;
  }).toBe(true);
  await expect(page.getByRole('heading', { name: 'Pendientes de envío (1)' })).not.toBeVisible();
  const state = await (await request.get('/__test/state')).json();
  expect(state.records).toHaveLength(1);
  expect(state.attempts.length).toBeGreaterThanOrEqual(2);
  expect(new Set(state.attempts.map((item: { clientRequestId: string }) => item.clientRequestId)).size).toBe(1);
});

test('el service worker guarda la aplicación y SQLite, sin almacenar respuestas de API ni imágenes privadas', async ({ page }) => {
  await prepare(page);
  const urls = await page.evaluate(async () => {
    const urls: string[] = [];
    for (const name of await caches.keys()) for (const request of await (await caches.open(name)).keys()) urls.push(request.url);
    return urls;
  });
  expect(urls.some(url => new URL(url).pathname.endsWith('.wasm'))).toBe(true);
  expect(urls.some(url => new URL(url).pathname.endsWith('.js'))).toBe(true);
  expect(urls.every(url => !new URL(url).pathname.includes('/api/'))).toBe(true);
  expect(urls.every(url => new URL(url).origin === base)).toBe(true);
});

test('una búsqueda no consultada antes informa que no tiene caché y no muestra resultados de otra búsqueda', async ({ page, context }) => {
  await prepare(page); await context.setOffline(true);
  await page.getByRole('textbox', { name: 'Buscar productos o servicios' }).fill('búsqueda sin caché');
  await expect(page.getByText('Todavía no hay información guardada para esta vista.', { exact: false })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Escalera de prueba offline' })).not.toBeVisible();
});

test('el aviso sin conexión se muestra también en celular y la recarga conserva la vista', async ({ page, context }) => {
  await page.setViewportSize({ width: 390, height: 844 }); await prepare(page);
  await context.setOffline(true); await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.getByText('Estás sin conexión.', { exact: false }).first()).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Escalera de prueba offline' })).toBeVisible();
});

test('si la API falla aunque el dispositivo indique conexión, se recupera la caché', async ({ page, context }) => {
  await prepare(page);
  await context.route('**/api/**', route => route.abort('failed'));
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Escalera de prueba offline' })).toBeVisible();
  await expect(page.getByText('Ves información guardada', { exact: false }).first()).toBeVisible();
});

test('si el almacenamiento falla no se anuncia que el pedido está guardado', async ({ page, context, request }) => {
  await prepare(page); await context.setOffline(true);
  await page.getByRole('button', { name: 'Necesito ayuda', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('textbox', { name: 'Tu pedido', exact: true }).fill('Necesito una herramienta de prueba');
  await dialog.getByLabel('Tipo de ayuda').selectOption('1');
  await page.evaluate(() => {
    const original = IDBDatabase.prototype.transaction;
    IDBDatabase.prototype.transaction = function (...args: Parameters<typeof original>) {
      if (this.name === 'ayni-sqlite-file' && args[1] === 'readwrite') throw new DOMException('No hay espacio para guardar el pedido de prueba', 'QuotaExceededError');
      return original.apply(this, args);
    };
  });
  await dialog.getByRole('button', { name: 'Guardar para enviar después' }).click();
  await expect(dialog.getByRole('alert')).toContainText('No hay espacio');
  await expect(dialog).toBeVisible();
  expect((await (await request.get('/__test/state')).json()).records).toHaveLength(0);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.evaluate(() => { window.location.hash = 'ayuda'; });
  await expect(page.getByRole('heading', { name: 'Ayuda vecinal' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Pendientes de envío (1)' })).not.toBeVisible();
});
