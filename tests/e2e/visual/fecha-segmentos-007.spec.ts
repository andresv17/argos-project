/**
 * T1035 (007, Bloque A, [GH:#11]) E2E del `DateField` real contra la API real y la SPA: escribir la fecha sin Tab (auto-avance), relleno con cero, `Backspace` en segmento vacío,
 * pegado ISO y `DD/MM/AAAA`, 29 de febrero y mes `13` (valida el esquema, no el campo) y guardado completo. Corre en los proyectos de Playwright activos (Chromium; Firefox, WebKit y
 * móvil con `E2E_FIREFOX=1`, `E2E_WEBKIT=1`, `E2E_MOBILE=1`). REQ-FEC7-001..004, EDGE-007-001, EDGE-007-002, EDGE-007-018; SC-007-001..004.
 */
import { expect, test, type BrowserContext, type Locator, type Page } from '@playwright/test';
import { createPetViaApi, registerViaApi, typeDate } from './e2e-support.ts';

test.describe.configure({ mode: 'serial' });

test.describe('DateField real (007, T1035)', () => {
  let context: BrowserContext;
  let page: Page;
  const field = (): Locator => page.locator('#weights-recordedAt');
  const seg = (name: 'Día' | 'Mes' | 'Año'): Locator => field().getByLabel(name);
  const values = async (): Promise<string[]> => [await seg('Día').inputValue(), await seg('Mes').inputValue(), await seg('Año').inputValue()];
  /** Pega `text` en el segmento: el evento `paste` real con `clipboardData`, que es lo que lee el componente. */
  const paste = async (target: Locator, text: string): Promise<void> => {
    await target.focus();
    await target.evaluate((el, value) => {
      const data = new DataTransfer();
      data.setData('text/plain', value);
      el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }));
    }, text);
  };

  test.beforeAll(async ({ browser }, info) => {
    context = await browser.newContext({ locale: 'es-CO', timezoneId: 'America/Bogota' });
    await registerViaApi(context.request, `fecha7.${info.project.name}`, 'Dueña Fechas', 'FechasClave2026!');
    await createPetViaApi(context.request, 'Argos', 'CANINE');
    page = await context.newPage();
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Argos', level: 2 })).toBeVisible();
  });
  test.afterAll(async () => {
    await context.close();
  });

  test('[SC-007-001][SC-007-004] la fecha se escribe seguida, sin Tab: 19112026 reparte Día, Mes y Año y el foco termina en Año', async () => {
    await seg('Día').click();
    await page.keyboard.type('19112026');
    expect(await values()).toEqual(['19', '11', '2026']);
    await expect(seg('Año')).toBeFocused();
  });

  test('[SC-007-001] tras escribir 15 en Día el foco está en Mes', async () => {
    await seg('Día').fill('');
    await seg('Día').click();
    await page.keyboard.type('15');
    await expect(seg('Mes')).toBeFocused();
  });

  test('[SC-007-002] un 5 en Día pasa a 05 y avanza a Mes; un 1 se queda en Día', async () => {
    await seg('Día').fill('');
    await seg('Mes').fill('');
    await seg('Año').fill('');
    await seg('Día').click();
    await page.keyboard.type('5');
    expect(await seg('Día').inputValue()).toBe('05');
    await expect(seg('Mes')).toBeFocused();
    await seg('Día').fill('');
    await seg('Día').click();
    await page.keyboard.type('1');
    expect(await seg('Día').inputValue()).toBe('1');
    await expect(seg('Día')).toBeFocused();
  });

  test('[SC-007-003] Backspace en Mes vacío lleva el foco a Día y borra un dígito; con el segmento no vacío no mueve el foco', async () => {
    await seg('Día').fill('');
    await seg('Mes').fill('');
    await seg('Año').fill('');
    await seg('Día').click();
    await page.keyboard.type('15');
    await expect(seg('Mes')).toBeFocused();
    await page.keyboard.press('Backspace');
    await expect(seg('Día')).toBeFocused();
    expect(await seg('Día').inputValue()).toBe('1');
    await page.keyboard.press('Backspace');
    expect(await seg('Día').inputValue()).toBe('');
    await expect(seg('Día')).toBeFocused();
    await seg('Día').click();
    await page.keyboard.type('15');
    await page.keyboard.type('1');
    await page.keyboard.press('Backspace');
    expect(await seg('Mes').inputValue()).toBe('');
    await expect(seg('Mes')).toBeFocused();
  });

  test('[EDGE-007-001] pegar 2026-11-19 o 19/11/2026 en cualquier segmento reparte los segmentos', async () => {
    await paste(seg('Mes'), '2026-11-19');
    expect(await values()).toEqual(['19', '11', '2026']);
    await seg('Día').fill('');
    await seg('Mes').fill('');
    await seg('Año').fill('');
    await paste(seg('Año'), '03/02/2026');
    expect(await values()).toEqual(['03', '02', '2026']);
    await paste(seg('Día'), 'hola');
    expect(await values()).toEqual(['03', '02', '2026']);
  });

  test('[EDGE-007-001][SC-007-004] 29 de febrero de un año no bisiesto y mes 13 se escriben sin que el campo los bloquee y el esquema los rechaza al guardar', async () => {
    for (const [iso, label] of [['2025-02-29', '29 de febrero'], ['2026-13-19', 'mes 13']] as const) {
      await typeDate(page, field(), iso);
      await page.locator('#weights-weightKg').fill('12.5');
      await page.locator('#weights-weightKg').press('Enter');
      await expect(page.locator('#weights-recordedAt-error'), label).toBeVisible();
      expect(await values()).toEqual([iso.slice(8), iso.slice(5, 7), iso.slice(0, 4)]);
      await expect(page.locator('table tbody tr')).toHaveCount(0);
    }
  });

  test('[SC-007-004] flujo completo: fecha tecleada sin Tab y peso guardan el registro; el campo de fecha queda vacío para el siguiente', async () => {
    await typeDate(page, field(), '2026-01-10');
    await page.locator('#weights-weightKg').fill('12.5');
    await page.getByRole('button', { name: 'Guardar' }).click();
    await expect(page.getByRole('cell', { name: '12.50 kg' }).first()).toBeVisible();
    await expect(page.locator('#weights-recordedAt-error')).toHaveCount(0);
  });

  test('[REQ-FEC7-004] los segmentos miden al menos 44 px de alto, tienen nombre accesible y el conjunto es un grupo con la leyenda «Fecha»', async () => {
    // Con un registro guardado el formulario vuelve plegado bajo «Registrar peso» (Opción B): se abre para medirlo.
    await page.locator('summary', { hasText: 'Registrar peso' }).click();
    await expect(page.getByRole('group', { name: 'Fecha', exact: true })).toBeVisible();
    for (const name of ['Día', 'Mes', 'Año'] as const) {
      const box = (await seg(name).boundingBox())!;
      expect([name, box.height >= 44]).toEqual([name, true]);
      await expect(seg(name)).toHaveAttribute('inputmode', 'numeric');
    }
    expect(await page.evaluate(() => [window.innerWidth, document.documentElement.scrollWidth].every((w, _i, all) => w === all[0]))).toBe(true);
  });
  test('[REQ-FEC7-004][SC-007-004] a 320 px los tres segmentos caben dentro del grupo, sin desbordar ni provocar scroll horizontal', async () => {
    const original = page.viewportSize();
    await page.setViewportSize({ width: 320, height: 800 });
    const group = field();
    await expect(group).toBeVisible();
    const gbox = (await group.boundingBox())!;
    let previousRight = gbox.x;
    for (const name of ['Día', 'Mes', 'Año'] as const) {
      const box = (await seg(name).boundingBox())!;
      expect([name, box.x >= previousRight - 0.5, box.x + box.width <= gbox.x + gbox.width + 0.5, box.height >= 48]).toEqual([name, true, true, true]);
      previousRight = box.x + box.width;
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    if (original !== null) await page.setViewportSize(original);
  });

  test('[REQ-FEC7-004] un único campo con borde: los segmentos van dentro de un solo contenedor, separados por «/», con el botón «Abrir calendario» a la derecha', async () => {
    const container = field().locator('div').first();
    await expect(container).toHaveCSS('border-top-width', '1px');
    for (const name of ['Día', 'Mes', 'Año'] as const) await expect(seg(name)).toHaveCSS('border-top-width', '0px');
    await expect(container.getByText('/', { exact: true })).toHaveCount(2);
    const button = field().getByRole('button', { name: 'Abrir calendario' });
    await expect(button).toBeVisible();
    const [cbox, bbox, ybox] = [(await container.boundingBox())!, (await button.boundingBox())!, (await seg('Año').boundingBox())!];
    expect([bbox.x >= ybox.x + ybox.width - 0.5, bbox.x + bbox.width <= cbox.x + cbox.width + 0.5, bbox.width >= 44, bbox.height >= 44]).toEqual([true, true, true, true]);
    // El foco de un segmento se ve en el contenedor único (focus-within).
    await seg('Mes').focus();
    await expect(container).toHaveCSS('box-shadow', /rgb/);
  });

  test('[REQ-FEC7-004] el selector de calendario: «Abrir calendario» no rompe la página y elegir una fecha reparte los tres segmentos y la emite al guardar', async () => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    const picker = field().locator('input[type="date"]');
    await expect(picker).toHaveAttribute('aria-hidden', 'true');
    await expect(picker).toHaveAttribute('tabindex', '-1');
    await field().getByRole('button', { name: 'Abrir calendario' }).click(); // showPicker() o respaldo focus/click: nunca lanza
    await page.keyboard.press('Escape');
    await picker.fill('2026-03-14', { force: true }); // el input nativo está oculto (0x0): sin actionability
    expect(await values()).toEqual(['14', '03', '2026']);
    await page.locator('#weights-weightKg').fill('13.2');
    await page.getByRole('button', { name: 'Guardar' }).click();
    await expect(page.getByRole('cell', { name: '13.20 kg' }).first()).toBeVisible();
    expect(errors).toEqual([]);
  });

  for (const width of [320, 1024, 1280]) {
    test(`[REQ-FEC7-004][NFR-007-002] a ${width} px el campo único con su botón de calendario cabe sin scroll horizontal`, async () => {
      const original = page.viewportSize();
      await page.setViewportSize({ width, height: 800 });
      await expect(field()).toBeVisible();
      const gbox = (await field().boundingBox())!;
      const button = (await field().getByRole('button', { name: 'Abrir calendario' }).boundingBox())!;
      expect([button.x >= gbox.x - 0.5, button.x + button.width <= gbox.x + gbox.width + 0.5]).toEqual([true, true]);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      if (original !== null) await page.setViewportSize(original);
    });
  }
});
