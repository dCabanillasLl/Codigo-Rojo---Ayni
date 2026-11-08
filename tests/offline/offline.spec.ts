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
async function openPublicationDetail(page: Page) {
  await prepare(page);
  await page.getByRole('button', { name: 'Ver detalles', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('heading', { name: 'Recomendaciones de esta publicación' })).toBeVisible();
  return dialog;
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

test('el detalle presenta estados verificados, pendientes y sin verificar sin interpretar HTML del comentario', async ({ page }) => {
  const dialog = await openPublicationDetail(page);
  await expect(dialog.getByText('Visto Bueno Vecinal Verificado').first()).toBeVisible();
  await expect(dialog.getByText('Verificación pendiente').first()).toBeVisible();
  await expect(dialog.getByText('Opinión no verificada').first()).toBeVisible();
  await expect(dialog.locator('.recommendation-comment img')).toHaveCount(0);
  await expect(dialog.locator('.recommendation-comment').first()).toContainText('<img src=x onerror=alert(1)>');
});

test('los filtros y la paginación muestran resultados del filtro seleccionado', async ({ page }) => {
  const dialog = await openPublicationDetail(page);
  await expect(dialog.getByText('Página 1 de 2')).toBeVisible();
  const filters = dialog.getByRole('group', { name: 'Filtrar recomendaciones' });
  await filters.getByRole('button', { name: 'Verificadas' }).click();
  await expect(dialog.getByText('Página 1 de 1')).not.toBeVisible();
  await expect(dialog.locator('.recommendation-card')).toHaveCount(2);
  await expect(dialog.getByText('Visto Bueno Vecinal Verificado').first()).toBeVisible();
  await filters.getByRole('button', { name: 'Pendientes' }).click();
  await expect(dialog.locator('.recommendation-card')).toHaveCount(2);
  await expect(dialog.getByText('Verificación pendiente').first()).toBeVisible();
  await filters.getByRole('button', { name: 'Todas' }).click();
  await dialog.getByRole('button', { name: 'Siguiente' }).click();
  await expect(dialog.getByText('Página 2 de 2')).toBeVisible();
});

test('el formulario permite vincular solo experiencias propias no usadas y refresca tras publicar', async ({ page }) => {
  const dialog = await openPublicationDetail(page);
  const experience = dialog.getByRole('combobox', { name: 'Selecciona una experiencia existente' });
  await expect(experience.locator('option[value="93"]')).toBeDisabled();
  await expect(experience).toContainText('Confirmada');
  await expect(experience).toContainText('En curso');
  await experience.selectOption('91');
  await expect(dialog.getByText('Esta experiencia está confirmada por ambas partes.', { exact: false })).toBeVisible();
  await dialog.getByRole('textbox', { name: 'Comentario de la recomendación' }).fill('<img src=x onerror=alert(1)> Comentario de prueba');
  const postRequest = page.waitForRequest(request => request.method() === 'POST' && request.url().includes('/api/publicaciones/11/resenas'));
  await dialog.getByRole('button', { name: 'Publicar opinión' }).click();
  const request = await postRequest;
  const body = request.postDataJSON();
  expect(body.interaccionId).toBe('91');
  expect(body.calificacion).toBe(5);
  expect(body).not.toHaveProperty('verificada');
  await expect(dialog.getByText('Ya compartiste una opinión sobre esta publicación.', { exact: false })).toBeVisible();
  await expect(dialog.getByText('7 opiniones', { exact: true })).toBeVisible();
  await expect(dialog.locator('.recommendation-comment img')).toHaveCount(0);
});

test('muestra un error de red de recomendaciones y permite reintentar', async ({ page, request }) => {
  await request.get('/__test/reset?failReviewReads=1');
  const dialog = await openPublicationDetail(page);
  const section = dialog.locator('.publication-reviews');
  await expect(section.locator('.error-box').first()).toContainText('Servicio de prueba no disponible');
  await expect(section.locator('.recommendation-card')).toHaveCount(0);
  await request.get('/__test/recover');
  await section.getByRole('button', { name: 'Reintentar' }).last().click();
  await expect(section.locator('.recommendation-card')).toHaveCount(5);
  const summaryRetry = section.getByRole('button', { name: 'Reintentar' });
  if (await summaryRetry.count()) await summaryRetry.first().click();
});

test('si la sesión vence al publicar, se solicita iniciar sesión y no se confirma la opinión', async ({ page, request }) => {
  await request.get('/__test/reset?expireReviewSubmit=1');
  const detail = await openPublicationDetail(page);
  await detail.getByRole('combobox', { name: 'Selecciona una experiencia existente' }).selectOption('91');
  await detail.getByRole('button', { name: 'Publicar opinión' }).click();
  await expect(page.getByRole('heading', { name: 'Qué bueno verte' })).toBeVisible();
  await expect(detail.getByRole('button', { name: 'Publicar opinión' })).toHaveCount(0);
  await expect(detail.getByRole('button', { name: 'Iniciar sesión' })).toBeVisible();
  const state = await (await request.get('/__test/state')).json();
  expect(state.records).toHaveLength(0);
});

test('al revocarse una acreditación se quita el sello y se actualiza el resumen', async ({ page, request }) => {
  let detail = await openPublicationDetail(page);
  let section = detail.locator('.publication-reviews');
  const verifiedReview = section.locator('.recommendation-card').filter({ hasText: 'Servicio cumplido.' });
  await expect(verifiedReview.locator('.recommendation-badge-verified')).toBeVisible();
  await expect(section.locator('.recommendation-summary div').nth(1).locator('b')).toHaveText('2');

  await request.post('/__test/revoke');
  await page.reload({ waitUntil: 'domcontentloaded' });
  detail = await openPublicationDetail(page);
  section = detail.locator('.publication-reviews');
  const revokedReview = section.locator('.recommendation-card').filter({ hasText: 'Servicio cumplido.' });
  await expect(revokedReview.locator('.recommendation-badge-pending')).toHaveText('Verificación pendiente');
  await expect(revokedReview.locator('.recommendation-badge-verified')).toHaveCount(0);
  await expect(section.locator('.recommendation-summary div').nth(1).locator('b')).toHaveText('1');
});

test('la sección de recomendaciones cabe en una pantalla móvil y mantiene controles accesibles', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const dialog = await openPublicationDetail(page);
  const section = dialog.locator('.publication-reviews');
  const dimensions = await section.evaluate(element => ({ client: element.clientWidth, scroll: element.scrollWidth }));
  expect(dimensions.scroll).toBeLessThanOrEqual(dimensions.client + 1);
  await expect(dialog.getByRole('group', { name: 'Califica de 1 a 5 estrellas' })).toBeVisible();
  await expect(dialog.getByRole('combobox', { name: 'Selecciona una experiencia existente' })).toBeVisible();
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
