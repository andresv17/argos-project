/**
 * E2E de los hallazgos 1, 3 y 4 de Neo: botón "Mostrar contraseña", un solo campo de nombre al crear mascota
 * y cierre de la edición con Cancelar/Guardar sin apilar formularios.
 */
import { expect, test, type Page } from '@playwright/test';
import { VIEWPORT_WIDTHS } from './e2e-support.ts';

const USER = { username: 'forms.e2e', displayName: 'Formas', password: 'Secreto2026a' };
const warnings: string[] = [];

/** Campos de nombre de los formularios de mascota (alta o edición); excluye el filtro de la lista. */
const nameInputs = (page: Page) => page.locator('form[aria-labelledby] input[name="name"]');
const editForms = (page: Page) => page.locator('form[aria-labelledby^="edit-pet-"]');

test.describe.configure({ mode: 'serial' });

test.describe('formularios de autenticación y mascota (tests/e2e/visual)', () => {
  for (const width of VIEWPORT_WIDTHS) {
    test(`[REQ-UI-005][REQ-UI-004] "Mostrar contraseña" alterna la visibilidad en registro e inicio de sesión a ${width} px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 });
      for (const [path, label] of [['/register', '#register-password'], ['/login', '#login-password']] as const) {
        await page.goto(path);
        const input = page.locator(label);
        const toggle = page.getByRole('button', { name: 'Mostrar contraseña' });
        await input.fill('Secreto2026a');
        await expect(input).toHaveAttribute('type', 'password');
        await expect(toggle).toHaveAttribute('aria-pressed', 'false');
        await toggle.click();
        await expect(input).toHaveAttribute('type', 'text');
        await expect(toggle).toHaveAttribute('aria-pressed', 'true');
        await toggle.click();
        await expect(input).toHaveAttribute('type', 'password');
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      }
    });
  }

  test('[REQ-UI-001][REQ-UI-002] crear mascota pide el nombre una sola vez; Editar → Cancelar/Guardar cierra la edición y no apila formularios', async ({ page }) => {
    page.on('console', (m) => {
      if (m.text().includes('same key')) warnings.push(m.text());
    });
    await page.goto('/register');
    await page.getByLabel(/Usuario \(minúsculas/).fill(USER.username);
    await page.getByLabel('Nombre visible').fill(USER.displayName);
    await page.getByLabel('Contraseña (8 a 128, con letra y dígito)').fill(USER.password);
    await page.getByRole('button', { name: 'Registrarme' }).click();
    await expect(page).toHaveURL(/\/$/);

    await page.getByRole('button', { name: 'Nueva mascota' }).click();
    await expect(nameInputs(page)).toHaveCount(1);
    await page.locator('#new-pet-name').fill('Argos');
    await page.getByLabel('Raza').fill('Pastor alemán');
    await page.getByLabel('Fecha de nacimiento').fill('2020-05-01');
    await page.getByRole('button', { name: 'Guardar' }).first().click();
    await expect(page.getByRole('heading', { name: 'Argos', level: 2 })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Nueva mascota' })).toHaveCount(0);

    const editar = page.getByRole('button', { name: 'Editar', exact: true });
    await editar.click();
    await editar.click();
    await expect(editForms(page)).toHaveCount(1);
    await page.getByRole('button', { name: 'Cancelar' }).click();
    await expect(editForms(page)).toHaveCount(0);

    await editar.click();
    await nameInputs(page).fill('Argos II');
    await page.getByRole('button', { name: 'Guardar' }).first().click();
    await expect(editForms(page)).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Argos II', level: 2 })).toBeVisible();

    await editar.click();
    await page.getByRole('button', { name: 'Nueva mascota' }).click();
    await expect(nameInputs(page)).toHaveCount(1);
    expect(warnings).toEqual([]);
  });
});
