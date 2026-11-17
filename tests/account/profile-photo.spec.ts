import { expect, test, type Page } from '@playwright/test';

// Valid synthetic PNGs; requests stay in the isolated browser fixture.
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aH1sAAAAASUVORK5CYII=', 'base64');
const photoUrl = (version: number) => `/api/auth/me/foto?v=${String(version).repeat(64)}`;

async function profile(page: Page, initialVersion = 0) {
  await page.context().addCookies([{ name: 'test-account', value: '1', url: 'http://127.0.0.1:8731' }]);
  let version = initialVersion;
  const saved: Record<string, unknown>[] = [];
  await page.route('**/api/auth/me', async route => {
    if (route.request().method() === 'PATCH') {
      const body = route.request().postDataJSON(); saved.push(body);
      expect(route.request().headers()['x-ayni-user']).toBe('1');
      if ('foto' in body) version = body.foto === null ? 0 : version + 1;
    }
    await route.fulfill({ json: { data: { id: '1', nombres: 'Alba', apellidos: 'Prueba', correo: null,
      correoVerificado: false, notificacionesCorreo: false, telefono: null, telefonoPublico: false, sectorId: '1',
      fotoUrl: version ? photoUrl(version) : null } } });
  });
  await page.route('**/api/auth/me/foto?*', route => route.fulfill({ contentType: 'image/png', body: png }));
  await page.goto('/#perfil');
  await expect(page.getByRole('heading', { name: 'Alba Prueba', exact: true })).toBeVisible();
  return saved;
}

test('elegir, guardar, reemplazar y quitar una foto actualiza el avatar y persiste al recargar', async ({ page }) => {
  const saved = await profile(page);
  const input = page.getByLabel('Foto de perfil (opcional)');
  const preview = page.getByRole('img', { name: 'Vista previa de tu foto de perfil', exact: true });
  const avatar = page.getByRole('button', { name: 'Perfil de Alba', exact: true });
  await input.setInputFiles({ name: 'mi-foto.png', mimeType: 'image/png', buffer: png });
  await expect(preview).toHaveAttribute('src', /^data:image\/png;base64,/);
  await expect(page.getByText('Tienes una foto nueva pendiente de guardar.')).toBeVisible();
  expect(saved).toHaveLength(0);
  await expect(avatar.getByRole('img')).toHaveCount(0);
  await page.getByRole('button', { name: 'Guardar perfil', exact: true }).click();
  await expect(avatar.getByRole('img')).toHaveAttribute('src', photoUrl(1));
  expect(saved[0].foto).toBe(`data:image/png;base64,${png.toString('base64')}`);
  await page.reload();
  await expect(preview).toHaveAttribute('src', photoUrl(1));
  await expect(avatar.getByRole('img')).toHaveAttribute('src', photoUrl(1));
  await page.getByRole('button', { name: 'Guardar perfil', exact: true }).click();
  await expect.poll(() => saved.length).toBe(2);
  expect(saved[1]).not.toHaveProperty('foto');
  await input.setInputFiles({ name: 'otra-foto.png', mimeType: 'image/png', buffer: png });
  await page.getByRole('button', { name: 'Guardar perfil', exact: true }).click();
  await expect(avatar.getByRole('img')).toHaveAttribute('src', photoUrl(2));
  await page.getByRole('button', { name: 'Quitar foto', exact: true }).click();
  await expect(preview).toHaveCount(0);
  await expect(avatar.getByRole('img')).toHaveAttribute('src', photoUrl(2));
  await page.getByRole('button', { name: 'Guardar perfil', exact: true }).click();
  await expect(avatar.getByRole('img')).toHaveCount(0);
  expect(saved.at(-1)!.foto).toBeNull();
  await page.reload();
  await expect(page.locator('.profile-photo-picker .user-avatar')).toHaveText('AP');
});

test('el perfil móvil permite descartar cambios y rechaza archivos que no cumplen los límites', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const saved = await profile(page, 1);
  const input = page.getByLabel('Foto de perfil (opcional)');
  const preview = page.getByRole('img', { name: 'Vista previa de tu foto de perfil', exact: true });
  await input.setInputFiles({ name: 'documento.txt', mimeType: 'text/plain', buffer: Buffer.from('archivo de prueba') });
  await expect(page.getByText('Elige una foto JPG, PNG o WebP.', { exact: true })).toBeVisible();
  await expect(preview).toHaveAttribute('src', photoUrl(1));
  await input.setInputFiles({ name: 'grande.png', mimeType: 'image/png', buffer: Buffer.alloc(5 * 1024 * 1024 + 1) });
  await expect(page.getByText('La foto debe pesar como máximo 5 MB.', { exact: true })).toBeVisible();
  await input.setInputFiles({ name: 'mi-foto.png', mimeType: 'image/png', buffer: png });
  await expect(preview).toHaveAttribute('src', /^data:/);
  await page.getByRole('button', { name: 'Descartar cambio de foto', exact: true }).click();
  await expect(preview).toHaveAttribute('src', photoUrl(1));
  // The same local file can be selected again after discarding it.
  await input.setInputFiles({ name: 'mi-foto.png', mimeType: 'image/png', buffer: png });
  await expect(preview).toHaveAttribute('src', /^data:/);
  await page.getByRole('button', { name: 'Descartar cambio de foto', exact: true }).click();
  await page.getByRole('button', { name: 'Quitar foto', exact: true }).click();
  await page.getByRole('button', { name: 'Descartar cambio de foto', exact: true }).click();
  await expect(preview).toHaveAttribute('src', photoUrl(1));
  expect(saved).toHaveLength(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.locator('.profile-photo-picker').screenshot({ path: test.info().outputPath('foto-perfil-movil.png') });
});

test('si falla el guardado conserva la vista previa y permite reintentar', async ({ page }) => {
  const saved = await profile(page);
  let fail = true;
  await page.route('**/api/auth/me', async route => {
    if (route.request().method() !== 'PATCH' || !fail) { await route.fallback(); return; }
    fail = false;
    await route.fulfill({ status: 503, json: { error: { code: 'TEST_UNAVAILABLE', message: 'No se pudo guardar la foto de prueba.' } } });
  });
  await page.getByLabel('Foto de perfil (opcional)').setInputFiles({ name: 'mi-foto.png', mimeType: 'image/png', buffer: png });
  await page.getByRole('button', { name: 'Guardar perfil', exact: true }).click();
  await expect(page.getByText('No se pudo guardar la foto de prueba.', { exact: true })).toBeVisible();
  await expect(page.getByRole('img', { name: 'Vista previa de tu foto de perfil', exact: true })).toHaveAttribute('src', /^data:/);
  expect(saved).toHaveLength(0);
  await page.getByRole('button', { name: 'Guardar perfil', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Perfil de Alba', exact: true }).getByRole('img')).toHaveAttribute('src', photoUrl(1));
});
