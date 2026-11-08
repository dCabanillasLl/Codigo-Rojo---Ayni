import { expect, test, type Page } from '@playwright/test';

// Uses the isolated static-build server and synthetic identity responses only.
async function registration(page: Page) {
  await page.route('**/api/identity/dni/lookup', route => route.fulfill({ json: { data: { nombres: 'Alba', apellidos: 'Prueba', proof: 'prueba-sintetica-sin-dni-real' } } }));
  await page.goto('/');
  await page.getByRole('button', { name: 'Iniciar sesión', exact: true }).click();
  await page.getByRole('button', { name: '¿Aún no tienes cuenta? Regístrate', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('textbox', { name: /^DNI Consultar/ }).fill('00000000');
  await dialog.getByRole('checkbox').check();
  await dialog.getByRole('button', { name: 'Consultar', exact: true }).click();
  await expect(dialog.getByLabel('Nombres', { exact: true })).toHaveValue('Alba');
  await dialog.getByLabel('Tu dirección o una referencia').fill('Dirección ficticia de prueba');
  return dialog;
}

test('el ojo muestra y oculta la contraseña sin enviar el formulario', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Iniciar sesión', exact: true }).click();
  const password = page.getByLabel('Contraseña', { exact: true });
  await password.fill('Clave-ficticia-123');
  await expect(password).toHaveAttribute('type', 'password');
  await page.getByRole('button', { name: 'Mostrar contraseña', exact: true }).click();
  await expect(password).toHaveAttribute('type', 'text');
  await expect(password).toHaveValue('Clave-ficticia-123');
  await page.getByRole('button', { name: 'Ocultar contraseña', exact: true }).click();
  await expect(password).toHaveAttribute('type', 'password');
  await page.getByRole('button', { name: '¿Cuenta anterior? Entrar con correo', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Mostrar contraseña', exact: true })).toBeVisible();
});

test('el registro exige confirmación coincidente y permite un celular opcional', async ({ page }) => {
  let submissions = 0;
  let body: Record<string, unknown> = {};
  await page.route('**/api/auth/register', async route => {
    submissions++; body = route.request().postDataJSON();
    await route.fulfill({ status: 400, json: { error: { code: 'TEST_ONLY', message: 'Respuesta ficticia; no se crean cuentas.' } } });
  });
  const dialog = await registration(page);
  const password = dialog.getByLabel('Contraseña', { exact: true });
  const confirmation = dialog.getByLabel('Confirmar contraseña', { exact: true });
  await password.fill('Clave-ficticia-123');
  await dialog.getByRole('button', { name: 'Crear mi cuenta' }).click();
  expect(submissions).toBe(0);
  await confirmation.fill('Otra-clave-ficticia');
  await expect(dialog.getByText('Las contraseñas no coinciden.', { exact: true })).toBeVisible();
  await dialog.getByRole('button', { name: 'Mostrar confirmar contraseña', exact: true }).click();
  await expect(confirmation).toHaveAttribute('type', 'text');
  await dialog.getByRole('button', { name: 'Crear mi cuenta' }).click();
  expect(submissions).toBe(0);
  await confirmation.fill('Clave-ficticia-123');
  // Revalidates confirmation when the original password changes too.
  await password.fill('Clave-ficticia-456');
  expect(await confirmation.evaluate((input: HTMLInputElement) => input.validity.valid)).toBe(false);
  await password.fill('Clave-ficticia-123');
  await dialog.getByRole('button', { name: 'Crear mi cuenta' }).click();
  await expect.poll(() => submissions).toBe(1);
  expect(body).not.toHaveProperty('confirmarContrasena');
  expect(body).not.toHaveProperty('telefono');
});

test('el celular del registro valida nueve dígitos y guarda +51 una sola vez en móvil', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  let submissions = 0;
  let body: Record<string, unknown> = {};
  await page.route('**/api/auth/register', async route => {
    submissions++; body = route.request().postDataJSON();
    await route.fulfill({ status: 400, json: { error: { code: 'TEST_ONLY', message: 'Respuesta ficticia.' } } });
  });
  const dialog = await registration(page);
  await dialog.getByLabel('Contraseña', { exact: true }).fill('Clave-ficticia-123');
  await dialog.getByLabel('Confirmar contraseña', { exact: true }).fill('Clave-ficticia-123');
  const phone = dialog.getByRole('textbox', { name: 'Celular (opcional), Perú +51', exact: true });
  const prefix = dialog.locator('.phone-prefix');
  const prefixBounds = await prefix.boundingBox();
  const inputBounds = await phone.boundingBox();
  expect(prefixBounds).not.toBeNull();
  expect(inputBounds).not.toBeNull();
  expect(prefixBounds!.x + prefixBounds!.width).toBeLessThanOrEqual(inputBounds!.x);
  await phone.focus();
  for (const digit of '012345678') {
    await phone.press(digit);
    await expect(phone).toHaveValue('');
  }
  await expect(dialog.getByText('El celular debe empezar con 9.', { exact: true })).toBeVisible();
  await phone.press('9');
  await expect(phone).toHaveValue('9');
  await expect(dialog.getByText('El celular debe empezar con 9.', { exact: true })).not.toBeVisible();
  await phone.fill('98765432');
  await dialog.getByRole('button', { name: 'Crear mi cuenta' }).click();
  expect(submissions).toBe(0);
  await phone.fill('887654321');
  await expect(phone).toHaveValue('98765432');
  await phone.selectText();
  await phone.evaluate(input => {
    const clipboardData = new DataTransfer(); clipboardData.setData('text', '+51 887 654 321');
    input.dispatchEvent(new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData }));
  });
  await expect(phone).toHaveValue('98765432');
  await dialog.getByRole('button', { name: 'Crear mi cuenta' }).click();
  expect(submissions).toBe(0);
  await phone.selectText();
  await phone.evaluate(input => {
    const clipboardData = new DataTransfer(); clipboardData.setData('text', '9876543210');
    input.dispatchEvent(new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData }));
  });
  await expect(phone).toHaveValue('9876543210');
  await dialog.getByRole('button', { name: 'Crear mi cuenta' }).click();
  expect(submissions).toBe(0);
  await phone.selectText();
  await phone.evaluate(input => {
    const clipboardData = new DataTransfer(); clipboardData.setData('text', '+51 987 654 321');
    input.dispatchEvent(new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData }));
  });
  await expect(phone).toHaveValue('987654321');
  await expect(dialog.locator('.phone-prefix')).toHaveText('+51');
  await phone.locator('../..').screenshot({ path: test.info().outputPath('celular-registro-movil.png') });
  await dialog.getByRole('button', { name: 'Crear mi cuenta' }).click();
  await expect.poll(() => submissions).toBe(1);
  expect(body.telefono).toBe('+51987654321');
  expect(await dialog.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
});

test('el perfil separa el prefijo de un celular guardado y permite actualizarlo o quitarlo', async ({ page, context }) => {
  await context.addCookies([{ name: 'test-account', value: '1', url: 'http://127.0.0.1:8731' }]);
  let phone: string | null = '+51987654321';
  let saved: Record<string, unknown> | undefined;
  await page.route('**/api/auth/me', async route => {
    if (route.request().method() === 'PATCH') { saved = route.request().postDataJSON(); phone = saved!.telefono as string | null; }
    await route.fulfill({ json: { data: { id: '1', nombres: 'Alba', apellidos: 'Prueba', correo: null, telefono: phone, telefonoPublico: false, correoVerificado: false, notificacionesCorreo: false, sectorId: '1' } } });
  });
  await page.goto('/#perfil');
  const input = page.getByRole('textbox', { name: 'Celular para contacto (opcional), Perú +51', exact: true });
  await expect(input).toHaveValue('987654321');
  await input.fill('812345678');
  await expect(input).toHaveValue('987654321');
  const prefixBounds = await page.locator('.phone-prefix').boundingBox();
  const inputBounds = await input.boundingBox();
  expect(prefixBounds!.x + prefixBounds!.width).toBeLessThanOrEqual(inputBounds!.x);
  await input.locator('../..').screenshot({ path: test.info().outputPath('celular-perfil.png') });
  await input.fill('912345678');
  await page.getByRole('button', { name: 'Guardar perfil', exact: true }).click();
  await expect(page.getByText('Perfil actualizado.', { exact: true })).toBeVisible();
  expect(saved?.telefono).toBe('+51912345678');
  await input.fill('');
  await page.getByRole('button', { name: 'Guardar perfil', exact: true }).click();
  await expect.poll(() => saved?.telefono).toBe(null);
});
