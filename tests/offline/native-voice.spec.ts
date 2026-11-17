import { test, expect, type Page } from '@playwright/test';

test.beforeEach(async ({ page, context }) => {
  await context.addCookies([{ name: 'test-account', value: '1', url: 'http://127.0.0.1:8731' }]);
  await page.addInitScript(() => {
    const w = window as any;
    w.CapacitorCustomPlatform = { name: 'android' };
    w.voiceCalls = [];
    // Exercise the real Capacitor bridge routing without relying on Web Speech.
    w.SpeechRecognition = w.webkitSpeechRecognition = undefined;
    w.Capacitor = {
      PluginHeaders: [{ name: 'AyniVoice', methods: ['recognize', 'speak', 'stopSpeaking'].map(name => ({ name, rtype: 'promise' })) }],
      nativePromise(plugin: string, method: string, options: any) {
        w.voiceCalls.push({ plugin, method, options });
        if (method === 'recognize') return new Promise((resolve, reject) => { w.resolveVoice = resolve; w.rejectVoice = reject; });
        if (method === 'speak' && w.failSpeech) return Promise.reject(new Error('No voice engine'));
        return Promise.resolve();
      },
    };
  });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Hola, Alba Prueba.' })).toBeVisible();
});

async function openRequest(page: Page) {
  await page.getByRole('button', { name: 'Necesito ayuda', exact: true }).click();
  return page.getByRole('dialog');
}

test('APK dictation preserves text and cancellation; reading uses native speech', async ({ page }) => {
  const dialog = await openRequest(page);
  const field = dialog.getByRole('textbox', { name: /^Tu pedido/ });
  await field.fill('Hola.');
  await dialog.getByRole('button', { name: 'Dictar mi pedido' }).click();
  await expect(dialog.getByRole('button', { name: 'Terminar dictado' })).toBeVisible();
  await page.evaluate(() => (window as any).resolveVoice({ text: 'Necesito una escalera.' }));
  await expect(field).toHaveValue('Hola. Necesito una escalera.');
  await dialog.getByRole('button', { name: 'Dictar mi pedido' }).click();
  await expect(dialog.getByRole('button', { name: 'Terminar dictado' })).toBeVisible();
  await page.evaluate(() => (window as any).resolveVoice({ cancelled: true }));
  await expect(dialog.getByRole('button', { name: 'Dictar mi pedido' })).toBeVisible();
  await expect(field).toHaveValue('Hola. Necesito una escalera.');
  await dialog.getByRole('button', { name: 'Escuchar', exact: true }).click();
  await expect.poll(() => page.evaluate(() => (window as any).voiceCalls.filter((c: any) => c.method === 'speak'))).toEqual([
    { plugin: 'AyniVoice', method: 'speak', options: { text: 'Hola. Necesito una escalera.' } },
  ]);
});

test('APK reports voice errors next to controls and discards late recognition after close', async ({ page }) => {
  const dialog = await openRequest(page);
  await dialog.getByRole('button', { name: 'Dictar mi pedido' }).click();
  await expect(dialog.getByRole('button', { name: 'Terminar dictado' })).toBeVisible();
  await page.evaluate(() => (window as any).rejectVoice(new Error('Revisa los permisos del micrófono.')));
  await expect(dialog.getByRole('alert')).toContainText('Revisa los permisos del micrófono.');
  const field = dialog.getByRole('textbox', { name: /^Tu pedido/ });
  await field.fill('Necesito ayuda.');
  await page.evaluate(() => { (window as any).failSpeech = true; });
  await dialog.getByRole('button', { name: 'Escuchar', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('No pudimos leer el texto.');
  await dialog.getByRole('button', { name: 'Dictar mi pedido' }).click();
  await expect(dialog.getByRole('button', { name: 'Terminar dictado' })).toBeVisible();
  await dialog.getByRole('button', { name: 'Cerrar', exact: true }).click();
  await page.evaluate(() => (window as any).resolveVoice({ text: 'Resultado tardío' }));
  await openRequest(page);
  await expect(dialog.getByRole('textbox', { name: /^Tu pedido/ })).toHaveValue('');
});
