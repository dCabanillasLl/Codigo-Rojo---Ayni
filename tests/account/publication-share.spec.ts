import { expect, test } from '@playwright/test';

for (const mobile of [false, true]) {
  test(`contacto SMS y opciones de compartir ${mobile ? 'móvil' : 'escritorio'}`, async ({ page }) => {
    if (mobile) await page.setViewportSize({ width: 390, height: 844 });
    await page.route('https://**/*', route => route.abort());
    await page.route('**/api/publicaciones/11', async route => {
      const response = await route.fetch();
      const data = await response.json();
      data.data.telefonoContacto = '+51 999 888 777';
      data.data.titulo = 'Mudanza en el sector El Boquerón, distrito de Huanchaco, Trujillo, La Libertad';
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
    await expect(dialog.getByRole('button', { name: 'Copiar enlace' })).toHaveCount(0);
    await expect(dialog.getByRole('link', { name: 'Compartir por WhatsApp' })).not.toHaveAttribute('href', /localhost|127\.0\.0\.1/);
    await dialog.getByRole('button', { name: 'Otras aplicaciones' }).click();
    expect(await page.evaluate(() => (window as any).__shared.url)).toBeUndefined();
    expect(await page.evaluate(() => (window as any).__shared.text)).toContain('Contacto: +51999888777');
    const close = await dialog.getByRole('button', { name: 'Cerrar', exact: true }).boundingBox();
    expect(close!.width).toBe(close!.height);
    expect(close!.width).toBeGreaterThanOrEqual(44);
    // The heading and body share one scroll container, even with a long title.
    await dialog.evaluate(el => { el.scrollTop = 0; });
    const headingTop = (await dialog.locator('.modal-header').boundingBox())!.y;
    await dialog.evaluate(el => { el.scrollTop = 160; });
    expect((await dialog.locator('.modal-header').boundingBox())!.y).toBeLessThan(headingTop);
    expect(await dialog.locator('.modal-content').evaluate(el => el.scrollTop)).toBe(0);
    await dialog.evaluate(el => { el.scrollTop = 0; });
    expect(await dialog.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
    await dialog.screenshot({ path: test.info().outputPath('compartir.png') });
    await toggle.click();
    await expect(dialog.getByRole('region', { name: 'Opciones para compartir' })).toHaveCount(0);
  });
}
