import { test, expect, type Page } from '@playwright/test';

test.beforeEach(async ({ page, context }) => {
  await context.addCookies([{ name: 'test-account', value: '1', url: 'http://127.0.0.1:8731' }]);
  await page.setViewportSize({ width: 360, height: 740 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Abrir guía AYNI', exact: true }).click();
});

async function expectControlsInside(page: Page, top: number, bottom: number) {
  for (const selector of ['.guide-panel', '.guide-header', '#guide-question', '.guide-send', '.guide-privacy-note']) {
    const box = await page.locator(selector).boundingBox();
    expect(box, selector).not.toBeNull();
    expect(box!.y, selector).toBeGreaterThanOrEqual(top - 1);
    expect(box!.y + box!.height, selector).toBeLessThanOrEqual(bottom + 1);
    expect(box!.x, selector).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width, selector).toBeLessThanOrEqual(360);
  }
  const messages = await page.locator('.guide-messages').boundingBox();
  const header = await page.locator('.guide-header').boundingBox();
  const chips = await page.locator('.guide-quick-actions').boundingBox();
  expect(messages!.height).toBeGreaterThan(40);
  expect(messages!.y).toBeGreaterThanOrEqual(header!.y + header!.height - 1);
  expect(messages!.y + messages!.height).toBeLessThanOrEqual(chips!.y + 1);
}

test('phone chat fits resized WebView and restores navigation after closing', async ({ page }) => {
  await expectControlsInside(page, 0, 740);
  await page.locator('#guide-question').fill('Hola');
  await page.setViewportSize({ width: 360, height: 400 });
  await expect.poll(() => page.locator('.guide-panel').evaluate(el => el.getBoundingClientRect().height)).toBe(400);
  await expectControlsInside(page, 0, 400);
  await expect(page.locator('.mobile-nav')).toBeHidden();
  await expect(page.locator('.guide-launcher')).toBeHidden();
  await page.getByRole('button', { name: 'Enviar pregunta', exact: true }).click();
  await expect(page.locator('.guide-message.you')).toContainText('Hola');
  await page.screenshot({ path: 'test-results/guide-keyboard.png' });
  await page.setViewportSize({ width: 360, height: 740 });
  await expectControlsInside(page, 0, 740);
  await page.getByRole('button', { name: 'Cerrar guía', exact: true }).click();
  await expect(page.locator('.mobile-nav')).toBeVisible();
  await expect(page.locator('body')).not.toHaveClass(/guide-is-open/);
});

test('chat follows visual viewport height and pan while layout viewport stays tall', async ({ page }) => {
  await page.locator('#guide-question').fill('Necesito ayuda');
  await page.evaluate(() => {
    const viewport = window.visualViewport!;
    Object.defineProperty(viewport, 'height', { configurable: true, value: 380 });
    Object.defineProperty(viewport, 'offsetTop', { configurable: true, value: 30 });
    viewport.dispatchEvent(new Event('resize'));
    viewport.dispatchEvent(new Event('scroll'));
  });
  await expectControlsInside(page, 30, 410);
});

test('desktop guide remains a floating panel', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await expect(page.locator('.guide-launcher')).toBeVisible();
  const panel = await page.locator('.guide-panel').boundingBox();
  expect(panel!.width).toBeLessThan(500);
  expect(panel!.y).toBeGreaterThan(0);
  expect(panel!.y + panel!.height).toBeLessThan(900);
});

test('mobile guide reveals the destination when a conversation action is chosen', async ({ page }) => {
  await page.locator('.guide-quick-actions').getByRole('button', { name: 'Buscar cerca', exact: true }).click();
  await page.getByRole('button', { name: 'Ir a Cerca de mí', exact: true }).click();
  await expect(page.locator('.guide-panel')).toBeHidden();
  await expect(page.locator('.mobile-nav')).toBeVisible();
});
