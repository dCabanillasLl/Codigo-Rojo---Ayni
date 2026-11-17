import { test, expect, type Page } from '@playwright/test';

async function result(page: Page, segments: string[]) {
  await page.evaluate(parts => {
    (window as any).voice.onresult?.({ results: parts.map(transcript => ({ 0: { transcript } })) });
  }, segments);
}

test.beforeEach(async ({ page, context }) => {
  await context.addCookies([{ name: 'test-account', value: '1', url: 'http://127.0.0.1:8731' }]);
  await page.addInitScript(() => {
    class Recognition {
      continuous = false; interimResults = false;
      onend: (() => void) | null = null;
      aborted = false;
      constructor() { (window as any).voice = this; }
      start() {}
      stop() { this.onend?.(); }
      abort() { this.aborted = true; this.onend?.(); }
    }
    (window as any).SpeechRecognition = Recognition;
  });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Hola, Alba Prueba.' })).toBeVisible();
});

test('dictation preserves existing text, updates interim speech and retains multiple phrases', async ({ page }) => {
  await page.getByRole('button', { name: 'Necesito ayuda', exact: true }).click();
  const dialog = page.getByRole('dialog');
  const field = dialog.getByRole('textbox', { name: /^Tu pedido/ });
  await field.fill('Hola.');
  await dialog.getByRole('button', { name: 'Dictar mi pedido' }).click();
  expect(await page.evaluate(() => [(window as any).voice.continuous, (window as any).voice.interimResults])).toEqual([true, true]);
  await result(page, ['Necesito']);
  await expect(field).toHaveValue('Hola. Necesito');
  await result(page, ['Necesito una escalera.', 'Para partir una tabla.']);
  await expect(field).toHaveValue('Hola. Necesito una escalera. Para partir una tabla.');
  await expect(dialog.getByRole('button', { name: 'Terminar dictado' })).toBeVisible();
  await dialog.getByRole('button', { name: 'Terminar dictado' }).click();
  await expect(dialog.getByRole('button', { name: 'Dictar mi pedido' })).toBeVisible();
  await dialog.getByRole('button', { name: 'Dictar mi pedido' }).click();
  await result(page, ['Muchas gracias.']);
  await expect(field).toHaveValue('Hola. Necesito una escalera. Para partir una tabla. Muchas gracias.');
  await dialog.getByRole('button', { name: 'Borrar todo el texto del pedido' }).click();
  await result(page, ['Resultado tardío']);
  await expect(field).toHaveValue('');
  expect(await page.evaluate(() => (window as any).voice.aborted)).toBe(true);
});

test('guide stops on close and explains microphone errors without cycling', async ({ page }) => {
  await page.getByRole('button', { name: 'Abrir guía AYNI' }).click();
  const field = page.getByRole('textbox', { name: 'Escribe una pregunta o lo que necesitas' });
  await field.fill('Hola.');
  await page.getByRole('button', { name: 'Dictar pregunta' }).click();
  await result(page, ['Necesito ayuda.']);
  await expect(field).toHaveValue('Hola. Necesito ayuda.');
  await expect(page.getByRole('button', { name: 'Enviar pregunta' })).toBeDisabled();
  await page.getByRole('button', { name: 'Cerrar guía', exact: true }).click();
  expect(await page.evaluate(() => (window as any).voice.aborted)).toBe(true);
  await page.getByRole('button', { name: 'Abrir guía AYNI' }).click();
  await page.getByRole('button', { name: 'Dictar pregunta' }).click();
  await page.evaluate(() => (window as any).voice.onerror({ error: 'network' }));
  await expect(page.getByText('Se perdió la conexión del reconocimiento de voz.', { exact: false })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Dictar pregunta' })).toBeVisible();
  await expect(field).toHaveValue('Hola. Necesito ayuda.');
});
