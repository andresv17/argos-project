/**
 * T286 (Rebanada 6): recorridos de usuario de la v2.1 en el navegador real. Frente rojo: describen lo que T287 a T293 deben
 * construir. Cada recorrido es independiente (modo no serial) y usa su propio usuario, para que un rojo no oculte los demás.
 *
 * @implements REQ-UI2-005, REQ-UI2-007, REQ-UI2-001, REQ-UI-002, SC-007, SC-005
 */
import { writeFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { apiCall, createPetViaApi, registerViaApi } from './e2e-support.ts';

test.describe.configure({ mode: 'default' });

let counter = 0;
const nextUser = (prefix: string): { username: string; displayName: string; password: string } => {
  counter += 1;
  return { username: `${prefix}${Date.now().toString(36)}${counter}`, displayName: `Usuario ${prefix} ${counter}`, password: 'Recorrido2026!' };
};

/** Registra un usuario nuevo en el contexto de la prueba y abre la app autenticada. */
async function signedInPage(page: Page, prefix: string): Promise<{ username: string; displayName: string }> {
  const user = nextUser(prefix);
  await registerViaApi(page.context().request, user.username, user.displayName, user.password);
  return user;
}

async function createHousehold(page: Page, name: string): Promise<void> {
  await page.goto('/households');
  await page.getByLabel('Nombre del nuevo hogar').fill(name);
  await page.getByRole('button', { name: 'Crear hogar' }).click();
}

test.describe('Recorridos de la Rebanada 6 (T286)', () => {
  test('[REQ-UI2-005] al crear un hogar se ve el mensaje de éxito con el nombre del hogar', async ({ page }) => {
    await signedInPage(page, 'hogar');
    await createHousehold(page, 'Casa Éxito');
    await expect(page.getByRole('status').filter({ hasText: /Casa Éxito/ })).toContainText(/(creado|creaste)/i);
  });

  test('[REQ-UI2-005] al crear un hogar aparece su tarjeta con el rol de quien lo creó (Administrador) sin recargar la página', async ({ page }) => {
    await signedInPage(page, 'rol');
    await page.goto('/households');
    await page.evaluate(() => {
      (window as unknown as { __sinRecarga: boolean }).__sinRecarga = true;
    });
    await page.getByLabel('Nombre del nuevo hogar').fill('Casa Rol');
    await page.getByRole('button', { name: 'Crear hogar' }).click();
    const card = page.getByRole('heading', { name: 'Casa Rol', level: 3 }).locator('xpath=ancestor::*[self::article or self::section or self::li][1]');
    await expect(card).toContainText('Administrador');
    expect(await page.evaluate(() => (window as unknown as { __sinRecarga?: boolean }).__sinRecarga)).toBe(true);
  });

  test('[REQ-UI2-005][REQ-UI-001] tras crear el hogar el selector de contexto de Mascotas lo ofrece al navegar dentro de la app, sin recarga', async ({ page }) => {
    await signedInPage(page, 'selector');
    await createHousehold(page, 'Casa Selector');
    await page.evaluate(() => {
      (window as unknown as { __sinRecarga: boolean }).__sinRecarga = true;
    });
    await page.getByRole('link', { name: 'Mascotas' }).first().click();
    await expect(page.getByRole('tab', { name: 'Casa Selector' })).toBeVisible();
    expect(await page.evaluate(() => (window as unknown as { __sinRecarga?: boolean }).__sinRecarga)).toBe(true);
  });

  test('[SC-007][REQ-UI2-002] con 30 mascotas el riel se recorre solo con el teclado (flechas, Inicio, Fin, Enter), sin recargar y sin desbordamiento a 320, 768 y 1280 px', async ({ page }) => {
    await signedInPage(page, 'muchas');
    for (let i = 1; i <= 30; i += 1) await createPetViaApi(page.context().request, `Mascota ${String(i).padStart(2, '0')}`, i % 2 === 0 ? 'CANINE' : 'FELINE');
    await page.goto('/');
    await page.evaluate(() => {
      (window as unknown as { __sinRecarga: boolean }).__sinRecarga = true;
    });
    const options = page.getByRole('listbox', { name: 'Mascotas' }).getByRole('option');
    await expect(options).toHaveCount(30);
    await options.first().focus();
    for (let i = 0; i < 29; i += 1) await page.keyboard.press('ArrowDown');
    await expect(options.last()).toHaveAttribute('aria-selected', 'true');
    await page.keyboard.press('Home');
    await expect(options.first()).toHaveAttribute('aria-selected', 'true');
    await page.keyboard.press('End');
    await expect(options.last()).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByRole('heading', { name: 'Mascota 30', level: 2 })).toBeVisible();
    expect(await page.evaluate(() => (window as unknown as { __sinRecarga?: boolean }).__sinRecarga)).toBe(true);
    // Opción A (decisión de Neo, blueprint v2.1 §4.8): el selector es un riel flex con scroll y roles listbox/option; no se exige
    // grilla de 1, 2 ni 3 columnas. Se verifica la navegación por teclado (las cuatro flechas, Home, End, Enter) y la selección por clic.
    await page.keyboard.press('ArrowUp');
    await expect(options.nth(28)).toHaveAttribute('aria-selected', 'true');
    await page.keyboard.press('ArrowLeft');
    await expect(options.nth(27)).toHaveAttribute('aria-selected', 'true');
    await page.keyboard.press('ArrowRight');
    await expect(options.nth(28)).toHaveAttribute('aria-selected', 'true');
    await page.keyboard.press('Home');
    await page.keyboard.press('Enter');
    await expect(options.first()).toHaveAttribute('aria-selected', 'true');
    await options.nth(4).click();
    await expect(options.nth(4)).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByRole('heading', { name: 'Mascota 05', level: 2 })).toBeVisible();
    expect(await page.evaluate(() => (window as unknown as { __sinRecarga?: boolean }).__sinRecarga)).toBe(true);
    for (const width of [320, 768, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), `sin desbordamiento horizontal a ${width} px`).toBe(true);
      await expect(page.getByRole('button', { name: 'Nueva mascota' })).toHaveCount(1);
    }
  });

  test('[REQ-UI2-001][REQ-UI-005] la sesión avisa antes de expirar por inactividad, sin sondeo a la API en segundo plano', async ({ page }) => {
    await page.clock.install();
    await signedInPage(page, 'expira');
    await page.goto('/');
    await expect(page.getByRole('navigation', { name: 'Principal' })).toBeVisible();
    const notice = page.getByRole('alertdialog').or(page.getByRole('alert')).or(page.getByRole('status')).filter({ hasText: /sesi[oó]n.*(expira|caduca|vence)/i });
    await page.clock.fastForward('10:00');
    await expect(notice).toHaveCount(0);
    const requests: string[] = [];
    page.on('request', (r) => {
      if (r.url().includes('/api/')) requests.push(`${r.method()} ${new URL(r.url()).pathname}`);
    });
    await page.clock.fastForward('19:30');
    await expect(notice).toBeVisible();
    expect(requests).toEqual([]);
  });

  test('[REQ-AUTH-003][REQ-UI2-001] recargar con page.reload() mantiene la sesión: /api/auth/me sigue siendo 200 con el mismo usuario, la cookie sigue siendo la misma y la pantalla protegida sigue visible', async ({ page, context }) => {
    const user = await signedInPage(page, 'recarga');
    await page.goto('/households');
    await expect(page.getByLabel('Nombre del nuevo hogar')).toBeVisible();
    const before = (await context.cookies()).find((c) => c.name === 'argos_session');
    expect(before?.httpOnly).toBe(true);

    await page.reload();

    await expect(page).toHaveURL(/\/households$/);
    await expect(page.getByLabel('Nombre del nuevo hogar')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Cerrar sesión' })).toBeVisible();
    const me = await apiCall<{ user: { username: string } }>(context.request, 'GET', '/auth/me');
    expect([me.status, me.code, me.body.user.username]).toEqual([200, null, user.username]);
    const after = (await context.cookies()).find((c) => c.name === 'argos_session');
    expect(after?.value).toBe(before!.value);
  });

  test('[REQ-UI2-007] el Centro de Respaldos importa con una barra de fases (Validando, Previsualizando, Aplicando, Terminada) y sin porcentaje', async ({ page }, testInfo) => {
    await signedInPage(page, 'respaldo');
    await createPetViaApi(page.context().request, 'Argos', 'CANINE');
    const exported = await page.context().request.post('/api/backup/export', { headers: { 'X-Argos-Request': '1' } });
    expect(exported.status()).toBe(200);
    const file = testInfo.outputPath('respaldo.json');
    writeFileSync(file, await exported.body());
    await page.goto('/backup');
    const phases = page.getByRole('list', { name: /fases/i });
    await expect(phases).toBeVisible();
    await expect(phases.getByRole('listitem')).toHaveText(['Validando', 'Previsualizando', 'Aplicando', 'Terminada']);
    await page.locator('input[type="file"]').setInputFiles(file);
    await expect(phases.locator('[aria-current="step"]')).toHaveText('Previsualizando');
    await page.getByRole('button', { name: 'Importar respaldo' }).click();
    await expect(phases.locator('[aria-current="step"]')).toHaveText('Terminada');
    await expect(page.locator('[role="progressbar"]')).toHaveCount(0);
    await expect(page.getByRole('main')).not.toContainText(/\d+\s*%/);
  });

  test('[REQ-UI2-007] un archivo inválido deja la barra de fases en «Revertida» y no modifica los datos', async ({ page }, testInfo) => {
    await signedInPage(page, 'revierte');
    await createPetViaApi(page.context().request, 'Intacta', 'FELINE');
    const broken = testInfo.outputPath('roto.json');
    writeFileSync(broken, '{ roto');
    await page.goto('/backup');
    await page.locator('input[type="file"]').setInputFiles(broken);
    await page.getByRole('button', { name: 'Importar respaldo' }).click();
    await expect(page.getByRole('list', { name: /fases/i }).locator('[aria-current="step"]')).toHaveText('Revertida');
    const pets = await apiCall<Array<{ profile: { name: string } }>>(page.context().request, 'GET', '/pets');
    expect(pets.body.map((p) => p.profile.name)).toEqual(['Intacta']);
  });
});
