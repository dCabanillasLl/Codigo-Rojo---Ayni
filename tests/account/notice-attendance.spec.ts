import { expect, test, type Page } from '@playwright/test';

async function attendanceFixture(page: Page) {
  await page.context().addCookies([{ name: 'test-account', value: '1', url: 'http://127.0.0.1:8731' }]);
  const fixture = { confirmed: false, failNext: false, writes: [] as boolean[] };
  const item = { id: '42', autorId: '2', autor: 'Vecina de prueba', categoriaId: '1', categoria: 'Actividades',
    titulo: 'Actividad de prueba de asistencia', contenido: 'Evento ficticio sin datos reales.', estado: 'publicado', revisionEvento: 0,
    fechaEvento: '2099-01-10T20:00:00Z', creadoEn: '2026-11-08T14:00:00Z', venceEn: null, imagenUrl: null };
  await page.route('https://**/*', route => route.abort());
  await page.route('**/api/avisos**', async route => {
    if (route.request().method() === 'PUT') {
      const body = route.request().postDataJSON();
      fixture.writes.push(body.asistire);
      if (fixture.failNext) {
        fixture.failNext = false;
        await route.fulfill({ status: 409, json: { error: { code: 'TEST_ONLY', message: 'No se pudo confirmar la asistencia de prueba.' } } });
        return;
      }
      fixture.confirmed = body.asistire;
      await route.fulfill({ json: { data: { asistire: fixture.confirmed } } });
      return;
    }
    // mysql2 returns EXISTS/COUNT as strings with bigNumberStrings enabled.
    await route.fulfill({ json: { data: [{ ...item, miAsistencia: fixture.confirmed ? '1' : '0', totalAsistentes: fixture.confirmed ? '1' : '0' }] } });
  });
  return fixture;
}

test('el cero de MySQL permite confirmar y el botón vuelve a confirmar después de retirarse', async ({ page }) => {
  const fixture = await attendanceFixture(page);
  await page.goto('/#avisos');
  const card = page.getByRole('article', { name: 'Actividad de prueba de asistencia', exact: true });
  const confirm = card.getByRole('button', { name: 'Confirmar asistencia', exact: true });
  const withdraw = card.getByRole('button', { name: 'Quitar confirmación', exact: true });
  await expect(confirm).toHaveAttribute('aria-pressed', 'false');
  await expect(card.getByText('0 personas confirmaron asistencia', { exact: true })).toBeVisible();
  await confirm.click();
  await expect(withdraw).toHaveAttribute('aria-pressed', 'true');
  await expect(card.getByText('1 persona confirmó asistencia', { exact: true })).toBeVisible();
  await page.reload();
  await expect(withdraw).toBeVisible();
  await withdraw.click();
  await expect(confirm).toHaveAttribute('aria-pressed', 'false');
  await expect(card.getByText('0 personas confirmaron asistencia', { exact: true })).toBeVisible();
  await page.reload();
  await expect(confirm).toBeVisible();
  expect(fixture.writes).toEqual([true, false]);
});

test('una confirmación rechazada conserva el botón y el contador hasta que el servidor la acepte', async ({ page }) => {
  const fixture = await attendanceFixture(page);
  fixture.failNext = true;
  await page.goto('/#avisos');
  const card = page.getByRole('article', { name: 'Actividad de prueba de asistencia', exact: true });
  const confirm = card.getByRole('button', { name: 'Confirmar asistencia', exact: true });
  await confirm.click();
  await expect(card.getByRole('alert')).toContainText('No se pudo confirmar');
  await expect(confirm).toHaveAttribute('aria-pressed', 'false');
  await expect(card.getByText('0 personas confirmaron asistencia', { exact: true })).toBeVisible();
  await confirm.click();
  await expect(card.getByRole('button', { name: 'Quitar confirmación', exact: true })).toBeVisible();
  expect(fixture.writes).toEqual([true, true]);
});
