import { expect, test } from '@playwright/test';

test('correo opcional y cambio de contraseña desde el perfil', async ({ page, context }) => {
  await context.addCookies([{ name: 'test-account', value: '1', url: 'http://127.0.0.1:8731' }]);
  await page.route('**/api/auth/me', route => route.fulfill({ json: { data: { id: '1', nombres: 'Alba', apellidos: 'Prueba', correo: null, correoVerificado: false, sectorId: '1' } } }));
  let submissions = 0;
  await page.route('**/api/auth/password', async route => {
    submissions++;
    expect(route.request().headers()['x-ayni-user']).toBe('1');
    expect(route.request().postDataJSON()).toEqual({ actual: 'Anterior-123', nueva: 'Nueva-clave-456', confirmacion: 'Nueva-clave-456' });
    await route.fulfill({ json: { data: { cambiado: true } } });
  });
  await page.goto('/#perfil');
  await expect(page.getByText('Es opcional: puedes seguir usando AYNI con tu DNI.', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: 'Ahora no', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Ahora no', exact: true })).toHaveCount(0);
  await page.screenshot({ path: test.info().outputPath('perfil-seguridad.png'), fullPage: true });
  await page.getByRole('button', { name: 'Cambiar contraseña', exact: true }).click();
  await page.getByLabel('Contraseña actual', { exact: true }).fill('Anterior-123');
  await page.getByLabel(/^Nueva contraseña/).fill('Nueva-clave-456');
  await page.getByLabel('Confirmar nueva contraseña', { exact: true }).fill('No-coincide-123');
  await page.getByRole('button', { name: 'Guardar nueva contraseña' }).click();
  await expect(page.getByText('Las contraseñas nuevas no coinciden.', { exact: true })).toBeVisible();
  expect(submissions).toBe(0);
  await page.getByLabel('Confirmar nueva contraseña', { exact: true }).fill('Nueva-clave-456');
  await page.getByRole('button', { name: 'Guardar nueva contraseña' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  expect(submissions).toBe(1);
});


for (const mobile of [false, true]) {
  test(`recuperacion por correo, reenvio y codigo invalido ${mobile ? 'movil' : 'escritorio'}`, async ({ page }) => {
    if (mobile) await page.setViewportSize({ width: 390, height: 844 });
    let sends = 0;
    let resets = 0;
    await page.route('**/api/auth/password/recovery', async route => {
      expect(route.request().postDataJSON()).toEqual({ correo: 'prueba@example.com' });
      sends++;
      await route.fulfill({ json: { data: { mensaje: 'Si ese correo está confirmado, recibirás un código.' } } });
    });
    await page.route('**/api/auth/password/reset', async route => {
      resets++;
      const body = route.request().postDataJSON();
      expect(body.correo).toBe('prueba@example.com');
      if (body.codigo === '111111') await route.fulfill({ status: 400, json: { error: { code: 'RECOVERY_CODE_INVALID', message: 'El código no es válido o venció.' } } });
      else await route.fulfill({ json: { data: { cambiado: true } } });
    });
    await page.clock.install();
    await page.goto('/');
    await page.getByRole('button', { name: 'Iniciar sesión', exact: true }).click();
    await page.getByRole('button', { name: 'Olvidé mi contraseña' }).click();
    await page.getByLabel('Correo de recuperación').fill('prueba@example.com');
    await page.getByRole('button', { name: 'Enviar código', exact: true }).click();
    await expect(page.getByRole('button', { name: /Reenviar código en/ })).toBeDisabled();
    await page.clock.runFor(61000);
    await page.getByRole('button', { name: 'Reenviar código', exact: true }).click();
    expect(sends).toBe(2);
    await page.getByLabel(/^Código de recuperación/).fill('111111');
    await page.getByLabel('Nueva contraseña', { exact: true }).fill('Nueva-clave-456');
    await page.getByLabel('Confirmar nueva contraseña', { exact: true }).fill('Nueva-clave-456');
    await page.getByRole('button', { name: 'Guardar nueva contraseña' }).click();
    await expect(page.getByText('El código no es válido o venció.', { exact: true })).toBeVisible();
    await page.getByLabel(/^Código de recuperación/).fill('123456');
    await page.screenshot({ path: test.info().outputPath('recuperacion.png'), fullPage: true });
    expect(await page.getByRole('dialog').evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
    await page.getByRole('button', { name: 'Guardar nueva contraseña' }).click();
    await expect(page.getByText('Contraseña actualizada. Inicia sesión con tu nueva contraseña.', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Entrar', exact: true })).toBeVisible();
    expect(resets).toBe(2);
  });
}
