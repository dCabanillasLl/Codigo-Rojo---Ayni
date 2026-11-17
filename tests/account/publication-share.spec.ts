import { expect, test } from '@playwright/test';

for (const mobile of [false, true]) {
  test(`contacto SMS y opciones de compartir ${mobile ? 'móvil' : 'escritorio'}`, async ({ page }) => {
    if (mobile) await page.setViewportSize({ width: 390, height: 844 });
    await page.route('https://**/*', route => route.abort());
    await page.route('**/api/publicaciones/11', async route => {
      const response = await route.fetch();
      const data = await response.json();
      data.data.telefonoContacto = '+51 999 888 777';
      await route.fulfill({ json: data });
    });
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async (text: string) => { (window as any).__copied = text; } } });
      Object.defineProperty(navigator, 'share', { configurable: true, value: async (data: ShareData) => { (window as any).__shared = data; } });
    });
    await page.goto('/#cerca/11');
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByRole('link', { name: 'Contactar por WhatsApp' })).toHaveAttribute('href', /wa.me\/51999888777/);
    await expect(dialog.getByRole('link', { name: 'Enviar SMS' })).toHaveAttribute('href', /^sms:\+51999888777\?body=Hola/);
    const toggle = dialog.getByRole('button', { name: 'Compartir publicación', exact: true });
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await dialog.getByRole('button', { name: 'Copiar enlace' }).click();
    await expect(dialog.getByRole('status')).toContainText('Enlace copiado');
    expect(await page.evaluate(() => (window as any).__copied)).toMatch(/#cerca\/11$/);
    await dialog.getByRole('button', { name: 'Otras aplicaciones' }).click();
    expect(await page.evaluate(() => (window as any).__shared.url)).toMatch(/#cerca\/11$/);
    expect(await dialog.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
    await dialog.screenshot({ path: test.info().outputPath('compartir.png') });
    await toggle.click();
    await expect(dialog.getByRole('region', { name: 'Opciones para compartir' })).toHaveCount(0);
  });
}
