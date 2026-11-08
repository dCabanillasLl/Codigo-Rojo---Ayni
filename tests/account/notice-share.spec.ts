import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

const flyer = readFileSync(new URL('../../public/favicon.png', import.meta.url));
async function noticeFixture(page: Page, options: { image?: boolean; imageError?: boolean; native?: boolean; supported?: boolean; cancel?: boolean; direct?: boolean; directError?: boolean } = {}) {
  await page.context().addCookies([{ name: 'test-account', value: '1', url: 'http://127.0.0.1:8731' }]);
  await page.addInitScript(({ native, supported, cancel, direct, directError }) => {
    const state = window as any;
    state.__shareCalls = []; state.__opened = []; state.__nativeCalls = [];
    window.open = ((url: string) => { state.__opened.push(url); return null; }) as typeof window.open;
    if (native) {
      state.androidBridge = {};
      state.Capacitor = {
        PluginHeaders: [
          { name: 'Share', methods: [{ name: 'share', rtype: 'promise' }] },
          { name: 'Filesystem', methods: ['readdir', 'writeFile', 'deleteFile'].map(name => ({ name, rtype: 'promise' })) },
          ...(direct ? [{ name: 'WhatsAppShare', methods: [{ name: 'share', rtype: 'promise' }] }] : []),
        ],
        nativePromise: async (plugin: string, method: string, data: any) => {
          state.__nativeCalls.push({ plugin, method, data });
          if (plugin === 'WhatsAppShare') {
            if (directError) throw new Error('No encontramos WhatsApp instalado. Puedes compartir solo el mensaje desmarcando el flyer.');
            return { opened: true };
          }
          if (method === 'readdir') return { files: [] };
          if (method === 'writeFile') return { uri: `file:///cache/${data.path}` };
          if (method === 'share') return { activityType: 'com.whatsapp' };
          return {};
        },
      };
      return;
    }
    if (supported) {
      Object.defineProperty(navigator, 'canShare', { configurable: true, value: ({ files }: ShareData) => Boolean(files?.length) });
      Object.defineProperty(navigator, 'share', { configurable: true, value: async (data: ShareData) => {
        const activation = navigator.userActivation.isActive;
        const files = await Promise.all((data.files || []).map(async file => ({ name: file.name, type: file.type, size: file.size, header: Array.from(new Uint8Array(await file.slice(0, 8).arrayBuffer())) })));
        state.__shareCalls.push({ text: data.text, title: data.title, files, activation });
        if (cancel) throw new DOMException('User cancelled', 'AbortError');
      } });
    } else {
      Object.defineProperty(navigator, 'share', { configurable: true, value: undefined });
      Object.defineProperty(navigator, 'canShare', { configurable: true, value: undefined });
    }
  }, { native: Boolean(options.native), supported: options.supported !== false, cancel: Boolean(options.cancel), direct: Boolean(options.direct), directError: Boolean(options.directError) });
  const item = { id: '42', autorId: '2', autor: 'Vecina de prueba', categoriaId: '1', categoria: 'Actividades', titulo: 'Jornada vecinal',
    contenido: 'Actividad ficticia para probar el mensaje.', estado: 'publicado', revisionEvento: 0, fechaEvento: '2099-01-10T20:00:00Z',
    creadoEn: '2026-11-08T14:00:00Z', venceEn: null, miAsistencia: '0', totalAsistentes: '0',
    direccionActividad: 'Avenida de prueba 123, Pueblo Libre', latitudActividad: -12.073, longitudActividad: -77.063,
    imagenUrl: options.image === false ? null : '/api/avisos/42/imagen?v=prueba' };
  await page.route('https://**/*', route => route.abort());
  await page.route('**/api/avisos**', async route => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/imagen')) {
      if (options.imageError) await route.fulfill({ status: 404, body: '' });
      else await route.fulfill({ contentType: 'image/png', body: flyer });
    } else await route.fulfill({ json: { data: path === '/api/avisos/42' ? item : [item] } });
  });
  await page.goto('/#avisos');
  await page.getByRole('article', { name: item.titulo, exact: true }).getByRole('button', { name: 'Compartir por WhatsApp', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Compartir aviso', exact: true });
  await expect(dialog).toBeVisible();
  return dialog;
}

test('el mensaje incluye los datos reales, se puede personalizar y abre WhatsApp sin flyer', async ({ page }) => {
  const dialog = await noticeFixture(page, { image: false });
  const message = dialog.getByRole('textbox', { name: 'Mensaje para compartir', exact: true });
  await expect(message).toHaveValue(/Mira este AVISO: "Jornada vecinal", publicado en AYNI/);
  await expect(message).toHaveValue(/2099.*hora de Lima/);
  await expect(message).toHaveValue(/Avenida de prueba 123, Pueblo Libre/);
  await expect(message).toHaveValue(/https:\/\/www.google.com\/maps\/search/);
  expect(await message.inputValue()).not.toContain('localhost');
  await message.fill('Vecinos, nos vemos en esta actividad & compartimos el aviso.');
  await dialog.getByRole('button', { name: 'Compartir por WhatsApp', exact: true }).click();
  const opened = await page.evaluate(() => (window as any).__opened);
  expect(new URL(opened[0]).searchParams.get('text')).toBe('Vecinos, nos vemos en esta actividad & compartimos el aviso.');
  expect(await page.evaluate(() => (window as any).__shareCalls)).toEqual([]);
});

test('el botón del flyer comparte solo la imagen y conserva la activación del clic en móvil', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const dialog = await noticeFixture(page);
  await expect(dialog.getByText('Flyer listo para compartir', { exact: true })).toBeVisible();
  expect(await dialog.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
  await dialog.screenshot({ path: test.info().outputPath('compartir-flyer-movil.png'), style: '.mobile-nav, .guide-launcher, .toast { visibility: hidden !important; }' });
  await dialog.getByRole('button', { name: 'Compartir solo el flyer', exact: true }).click();
  await expect.poll(async () => page.evaluate(() => (window as any).__shareCalls.length)).toBe(1);
  const [shared] = await page.evaluate(() => (window as any).__shareCalls);
  expect(shared.text).toBeUndefined();
  expect(shared.files).toHaveLength(1);
  expect(shared.files[0]).toMatchObject({ name: 'ayni-aviso-42.png', type: 'image/png', size: flyer.byteLength, header: [137, 80, 78, 71, 13, 10, 26, 10] });
  expect(shared.activation).toBe(true);
  expect(await page.evaluate(() => (window as any).__opened)).toEqual([]);
});

test('cancelar el menú de compartir no abre WhatsApp ni afirma que se envió', async ({ page }) => {
  const dialog = await noticeFixture(page, { cancel: true });
  await expect(dialog.getByText('Flyer listo para compartir', { exact: true })).toBeVisible();
  await dialog.getByRole('button', { name: 'Compartir solo el flyer', exact: true }).click();
  await expect(dialog.getByRole('button', { name: 'Compartir solo el flyer', exact: true })).toBeEnabled();
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('alert')).toHaveCount(0);
  expect(await page.evaluate(() => (window as any).__opened)).toEqual([]);
});

test('un flyer no disponible permite abrir WhatsApp directamente con el mensaje', async ({ page }) => {
  const dialog = await noticeFixture(page, { imageError: true });
  await expect(dialog.getByRole('alert')).toContainText('No pudimos cargar el flyer');
  await expect(dialog.getByRole('button', { name: 'Compartir solo el flyer', exact: true })).toBeDisabled();
  await expect(dialog.getByRole('button', { name: 'Compartir por WhatsApp', exact: true })).toBeEnabled();
  await dialog.getByRole('button', { name: 'Compartir por WhatsApp', exact: true }).click();
  expect(await page.evaluate(() => (window as any).__opened.length)).toBe(1);
});

test('sin soporte de archivos ofrece el mensaje y acceso al flyer', async ({ page }) => {
  const dialog = await noticeFixture(page, { supported: false });
  await expect(dialog.getByRole('checkbox')).toHaveCount(0);
  await expect(dialog.getByRole('link', { name: 'Abrir flyer', exact: true })).toBeVisible();
  await dialog.getByRole('button', { name: 'Compartir por WhatsApp', exact: true }).click();
  expect(await page.evaluate(() => (window as any).__opened.length)).toBe(1);
});

test('Android comparte el flyer por separado y abre el mensaje exclusivamente en WhatsApp', async ({ page }) => {
  const dialog = await noticeFixture(page, { native: true });
  await expect(dialog.getByText('Flyer listo para compartir', { exact: true })).toBeVisible();
  await dialog.getByRole('button', { name: 'Compartir solo el flyer', exact: true }).click();
  await expect.poll(async () => page.evaluate(() => (window as any).__nativeCalls.some((call: any) => call.method === 'share'))).toBe(true);
  const calls = await page.evaluate(() => (window as any).__nativeCalls);
  const write = calls.find((call: any) => call.method === 'writeFile');
  const share = calls.find((call: any) => call.method === 'share');
  expect(write.data.directory).toBe('CACHE');
  expect(write.data.path).toMatch(/^ayni-share\/flyer-\d+-ayni-aviso-42.png$/);
  expect(Buffer.from(write.data.data, 'base64')).toEqual(flyer);
  expect(share.data.files).toEqual([`file:///cache/${write.data.path}`]);
  expect(share.data.text).toBeUndefined();
  await dialog.getByRole('button', { name: 'Compartir por WhatsApp', exact: true }).click();
  const [opened] = await page.evaluate(() => (window as any).__opened);
  expect(new URL(opened).host).toBe('wa.me');
  expect(new URL(opened).searchParams.get('text')).toContain('Mira este AVISO: "Jornada vecinal"');
  expect(await page.evaluate(() => (window as any).__nativeCalls.filter((call: any) => call.method === 'share').length)).toBe(1);
});

test('el mensaje va directamente a WhatsApp aunque haya flyer y soporte de compartir archivos', async ({ page }) => {
  const dialog = await noticeFixture(page);
  await dialog.getByRole('button', { name: 'Compartir por WhatsApp', exact: true }).click();
  const [opened] = await page.evaluate(() => (window as any).__opened);
  expect(new URL(opened).host).toBe('wa.me');
  expect(new URL(opened).searchParams.get('text')).toContain('Jornada vecinal');
  expect(await page.evaluate(() => (window as any).__shareCalls)).toEqual([]);
});

test('el enlace de un aviso abre su ficha y permite regresar al listado', async ({ page }) => {
  const dialog = await noticeFixture(page, { image: false });
  await dialog.getByRole('button', { name: 'Volver', exact: true }).click();
  await page.goto('/#avisos/42');
  await expect(page.getByRole('article', { name: 'Jornada vecinal', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '← Ver todos los avisos', exact: true }).click();
  await expect(page).toHaveURL(/#avisos$/);
});

test('Android abre WhatsApp directamente con el mensaje personalizado y el flyer en una sola acción', async ({ page }) => {
  const dialog = await noticeFixture(page, { native: true, direct: true });
  const attach = dialog.getByRole('checkbox', { name: 'Adjuntar flyer al mensaje de WhatsApp' });
  await expect(attach).toBeChecked();
  await expect(dialog.getByText('Flyer listo para compartir', { exact: true })).toBeVisible();
  await dialog.getByRole('textbox', { name: 'Mensaje para compartir', exact: true }).fill('Mira este aviso, nos reunimos en el parque.');
  await dialog.getByRole('button', { name: 'Compartir por WhatsApp', exact: true }).click();
  await expect.poll(async () => page.evaluate(() => (window as any).__nativeCalls.some((call: any) => call.plugin === 'WhatsAppShare'))).toBe(true);
  const calls = await page.evaluate(() => (window as any).__nativeCalls);
  const write = calls.find((call: any) => call.method === 'writeFile');
  const share = calls.find((call: any) => call.plugin === 'WhatsAppShare');
  expect(share.data).toEqual({ text: 'Mira este aviso, nos reunimos en el parque.', fileUri: `file:///cache/${write.data.path}` });
  expect(calls.some((call: any) => call.plugin === 'Share')).toBe(false);
  expect(await page.evaluate(() => (window as any).__opened)).toEqual([]);
  await expect(dialog).not.toBeVisible();
});

test('Android permite desmarcar el flyer y conserva la apertura directa del mensaje a WhatsApp', async ({ page }) => {
  const dialog = await noticeFixture(page, { native: true, direct: true });
  await dialog.getByRole('checkbox', { name: 'Adjuntar flyer al mensaje de WhatsApp' }).uncheck();
  await dialog.getByRole('button', { name: 'Compartir por WhatsApp', exact: true }).click();
  expect(await page.evaluate(() => (window as any).__nativeCalls.some((call: any) => call.plugin === 'WhatsAppShare' || call.plugin === 'Share'))).toBe(false);
  const [opened] = await page.evaluate(() => (window as any).__opened);
  expect(new URL(opened).host).toBe('wa.me');
});

test('si WhatsApp no está instalado, no abre otras apps ni descarta el flyer silenciosamente', async ({ page }) => {
  const dialog = await noticeFixture(page, { native: true, direct: true, directError: true });
  await expect(dialog.getByText('Flyer listo para compartir', { exact: true })).toBeVisible();
  await dialog.getByRole('button', { name: 'Compartir por WhatsApp', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('No encontramos WhatsApp instalado');
  await expect(dialog.getByRole('checkbox', { name: 'Adjuntar flyer al mensaje de WhatsApp' })).toBeChecked();
  expect(await page.evaluate(() => (window as any).__opened)).toEqual([]);
});
