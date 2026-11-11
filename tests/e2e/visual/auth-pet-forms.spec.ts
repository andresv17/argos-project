/**
 * E2E de los hallazgos 1, 3 y 4 de Neo: botón "Mostrar contraseña", un solo campo de nombre al crear mascota
 * y cierre de la edición con Cancelar/Guardar sin apilar formularios.
 */
import { expect, test, type Page } from '@playwright/test';
import { VIEWPORT_WIDTHS } from './e2e-support.ts';

const SESSION_USER = { username: 'sesion.e2e', displayName: 'Sesión', password: 'Sesion2026clave!' };

const USER = { username: 'forms.e2e', displayName: 'Formas', password: 'Secreto2026a!' };
const warnings: string[] = [];

/** Campos de nombre de los formularios de mascota (alta o edición); excluye el filtro de la lista. */
const nameInputs = (page: Page) => page.locator('form[aria-labelledby] input[name="name"]');
const editForms = (page: Page) => page.locator('form[aria-labelledby^="edit-pet-"]');

test.describe('formularios de autenticación y mascota (tests/e2e/visual)', () => {
  test.describe.configure({ mode: 'serial' });

  for (const width of VIEWPORT_WIDTHS) {
    test(`[REQ-UI-005][REQ-UI-004] "Mostrar contraseña" alterna la visibilidad en registro e inicio de sesión a ${width} px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 });
      for (const [path, label] of [['/register', '#register-password'], ['/login', '#login-password']] as const) {
        await page.goto(path);
        const input = page.locator(label);
        const toggle = page.locator(`button[aria-controls="${label.slice(1)}"]`);
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
    await page.getByLabel('Contraseña (10 a 128, con mayúscula, número y símbolo)').fill(USER.password);
    await page.getByLabel('Confirmar contraseña').fill(USER.password);
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

  test('[REQ-UI-001][REQ-UI-002] la barra de búsqueda y el alta tienen etiquetas distintas y el alta abre vacía tras escribir en el filtro', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('Usuario').fill(USER.username);
    await page.getByLabel('Contraseña').fill(USER.password);
    await page.getByRole('button', { name: 'Entrar' }).click();
    await expect(page).toHaveURL(/\/$/);

    const filtro = page.getByRole('search').getByLabel('Buscar mascota por nombre');
    await expect(filtro).toHaveAttribute('placeholder', 'Escribe un nombre');
    await expect(page.getByRole('search').getByText('Filtrar por especie')).toBeVisible();
    await filtro.fill('Arg');

    await page.getByRole('button', { name: 'Nueva mascota' }).click();
    await expect(page.locator('form[aria-labelledby] input[name="name"]')).toHaveCount(1);
    await expect(page.locator('#new-pet-name')).toHaveValue('');
    await expect(page.getByRole('search').getByLabel('Nombre', { exact: true })).toHaveCount(0);
  });
});

test.describe('sesión de la rebanada 1 (tests/e2e/visual)', () => {
  test.describe.configure({ mode: 'serial' });

  test('[REQ-AUTH-003][REQ-AUTH-004][SC-009] iniciar sesión, recargar y seguir autenticado, cerrar sesión y reusar la cookie devuelve 401', async ({ page, context, request, baseURL }) => {
    await page.goto('/register');
    await page.getByLabel(/Usuario \(minúsculas/).fill(SESSION_USER.username);
    await page.getByLabel('Nombre visible').fill(SESSION_USER.displayName);
    await page.getByLabel('Contraseña (10 a 128, con mayúscula, número y símbolo)').fill(SESSION_USER.password);
    await page.getByLabel('Confirmar contraseña').fill(SESSION_USER.password);
    await page.getByRole('button', { name: 'Registrarme' }).click();
    await expect(page).toHaveURL(/\/$/);
    await page.getByRole('button', { name: 'Cerrar sesión' }).click();
    await expect(page).toHaveURL(/\/login$/);

    await page.getByLabel('Usuario').fill(SESSION_USER.username);
    await page.getByLabel('Contraseña').fill(SESSION_USER.password);
    await page.getByRole('button', { name: 'Entrar' }).click();
    await expect(page).toHaveURL(/\/$/);

    await page.reload();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole('button', { name: 'Cerrar sesión' })).toBeVisible();

    const cookie = (await context.cookies()).find((c) => c.name === 'argos_session');
    expect(cookie?.httpOnly).toBe(true);
    const cookieHeader = `argos_session=${cookie!.value}`;
    const alive = await request.get(`${baseURL}/api/auth/me`, { headers: { cookie: cookieHeader } });
    expect(alive.status()).toBe(200);

    await page.getByRole('button', { name: 'Cerrar sesión' }).click();
    await expect(page).toHaveURL(/\/login$/);
    const reused = await request.get(`${baseURL}/api/auth/me`, { headers: { cookie: cookieHeader } });
    expect(reused.status()).toBe(401);
    expect(((await reused.json()) as { code: string }).code).toBe('ERR-AUTH-UNAUTHENTICATED');
  });

  test('[REQ-AUTH-004][INV-AUTH2-002] tras cargar la sesión la SPA no hace peticiones autenticadas en segundo plano', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('Usuario').fill(SESSION_USER.username);
    await page.getByLabel('Contraseña').fill(SESSION_USER.password);
    await page.getByRole('button', { name: 'Entrar' }).click();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole('button', { name: 'Cerrar sesión' })).toBeVisible();
    await page.waitForLoadState('networkidle');
    const requests: string[] = [];
    page.on('request', (r) => {
      if (r.url().includes('/api/')) requests.push(`${r.method()} ${new URL(r.url()).pathname}`);
    });
    await page.waitForTimeout(3000);
    expect(requests).toEqual([]);
  });
});

