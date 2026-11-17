/**
 * Accesibilidad (REQ-UI-004,): `@axe-core/playwright` con WCAG 2.1 A/AA en todas las
 * pantallas y en sus estados con contenido (formularios con errores, diálogos, los 6 módulos de la ficha con las
 * cuatro insignias del semáforo, hogar con miembros e invitaciones, contexto de hogar), a 320, 1024 y 1280 px.
 * Cero violaciones `critical`/`serious` y sin desbordamiento horizontal. Los datos se crean por la API real.
 */
import { writeFileSync } from 'node:fs';
import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { accessibilityFindings, accessibilityFindingsAt, apiCall, apiPost, createPetViaApi, isoDateFromToday, registerViaApi, VIEWPORT_WIDTHS_V21 } from '../visual/e2e-support.ts';

const HOUSE = 'Casa Accesible';

test.describe.configure({ mode: 'serial' });

let anonymous: BrowserContext;
let ownerContext: BrowserContext;
let memberContext: BrowserContext;
let owner: Page;
let member: Page;

test.beforeAll(async ({ browser }) => {
  anonymous = await browser.newContext();
  ownerContext = await browser.newContext();
  memberContext = await browser.newContext();
  owner = await ownerContext.newPage();
  member = await memberContext.newPage();
  await registerViaApi(ownerContext.request, 'axe.duena', 'Dueña Axe', 'AxeClave2026!');
  await registerViaApi(memberContext.request, 'axe.miembro', 'Miembro Axe', 'AxeClave2027!');
  const petId = await createPetViaApi(ownerContext.request, 'Argos', 'CANINE');
  await createPetViaApi(ownerContext.request, 'Nyx', 'FELINE', '2021-07-07');
  await createPetViaApi(memberContext.request, 'Luna', 'FELINE');
  const record = (module: string, body: unknown) => apiPost(ownerContext.request, `/pets/${petId}/records/${module}`, body);
  await record('weights', { recordedAt: '2026-01-10', weightKg: 32.85, notes: 'Control anual' });
  await record('weights', { recordedAt: '2026-02-10', weightKg: 32.4, notes: null });
  await record('measurements', { recordedAt: '2026-02-10', neckCm: 47, chestCm: 79, backLengthCm: 66, waistCm: 59 });
  await record('vaccinations', { vaccineName: 'Rabia', appliedAt: isoDateFromToday(-400), nextBoosterAt: isoDateFromToday(-30) });
  await record('vaccinations', { vaccineName: 'Rabia', appliedAt: isoDateFromToday(-20), nextBoosterAt: isoDateFromToday(-2) });
  await record('vaccinations', { vaccineName: 'Moquillo', appliedAt: isoDateFromToday(-100), nextBoosterAt: isoDateFromToday(10) });
  await record('vaccinations', { vaccineName: 'Parvovirus', appliedAt: isoDateFromToday(-10), nextBoosterAt: isoDateFromToday(200) });
  await record('dewormings', { productBrand: 'Drontal', dewormingType: 'INTERNAL', appliedAt: isoDateFromToday(-60), nextSuggestedDoseAt: isoDateFromToday(5) });
  await record('visits', { visitDate: '2026-02-10', reason: 'Control', diagnosis: 'Sano', treatment: 'Ninguno', clinicOrVet: 'VetCentral' });
  await record('custom-parameters', { recordedAt: '2026-02-10', category: 'DIET_CHANGE', title: 'Pienso nuevo', description: 'Cambio gradual en 7 días.' });
  const household = await apiPost<{ household: { id: string } }>(ownerContext.request, '/households', { name: HOUSE });
  expect((await apiCall(ownerContext.request, 'PUT', `/pets/${petId}/assignments/${household.household.id}`)).status).toBe(200);
  await apiPost(ownerContext.request, `/households/${household.household.id}/invitations`, { username: 'axe.miembro', roleOnJoin: 'READER' }, 202);
});

test.afterAll(async () => {
  await Promise.all([anonymous.close(), ownerContext.close(), memberContext.close()]);
});

test.describe('axe-core a 320, 1024 y 1280 px (tests/e2e/accessibility)', () => {
  test('[REQ-UI-004][REQ-UI-005] login, vacío y con el error genérico de credenciales', async () => {
    const page = await anonymous.newPage();
    await page.goto('/login');
    const empty = await accessibilityFindings(page, 'login');
    await page.getByLabel('Usuario').fill('axe.duena');
    await page.getByLabel('Contraseña').fill('Equivocada2026');
    await page.getByRole('button', { name: 'Entrar' }).click();
    await expect(page.getByText('Usuario o contraseña incorrectos.')).toBeVisible();
    expect([...empty, ...(await accessibilityFindings(page, 'login-error'))]).toEqual([]);
  });

  test('[REQ-UI-004][REQ-UI-005] registro, vacío y con errores de validación en cliente', async () => {
    const page = await anonymous.newPage();
    await page.goto('/register');
    const empty = await accessibilityFindings(page, 'registro');
    await page.getByLabel('Contraseña (10 a 128, con mayúscula, número y símbolo)').fill('corta');
    await page.getByLabel('Confirmar contraseña').fill('corta');
    await page.getByRole('button', { name: 'Registrarme' }).click();
    await expect(page.getByText('La contraseña debe tener entre 10 y 128 caracteres')).toBeVisible();
    expect([...empty, ...(await accessibilityFindings(page, 'registro-errores'))]).toEqual([]);
  });

  test('[REQ-UI-004][REQ-UI-001][REQ-UI-002][REQ-UI-003] mis mascotas y la ficha en sus 6 módulos, con las cuatro insignias del semáforo', async () => {
    await owner.goto('/');
    await owner.getByRole('option', { name: /Argos/ }).click();
    await expect(owner.getByRole('heading', { name: 'Argos', level: 2 })).toBeVisible();
    const findings: string[] = [];
    for (const tab of ['Peso', 'Medidas', 'Vacunas', 'Desparasitación', 'Consultas', 'Parámetros']) {
      await owner.getByRole('tab', { name: tab }).click();
      await expect(owner.getByRole('tab', { name: tab })).toHaveAttribute('aria-selected', 'true');
      if (tab === 'Vacunas') {
        for (const status of ['OVERDUE', 'DUE_SOON', 'UP_TO_DATE']) await expect(owner.locator(`[data-alert-status="${status}"]`)).toHaveCount(1);
      }
      findings.push(...(await accessibilityFindings(owner, `ficha-${tab}`)));
    }
    expect(findings).toEqual([]);
  });

  test('[REQ-UI-004][REQ-UI-001] formulario de nueva mascota con errores, edición y diálogo de eliminación', async () => {
    const findings: string[] = [];
    await owner.getByRole('button', { name: 'Nueva mascota' }).click();
    await owner.getByRole('button', { name: 'Guardar' }).first().click();
    findings.push(...(await accessibilityFindings(owner, 'nueva-mascota-errores')));
    await owner.goto('/');
    await owner.getByRole('option', { name: /Argos/ }).click();
    await owner.getByRole('button', { name: 'Editar', exact: true }).click();
    findings.push(...(await accessibilityFindings(owner, 'editar-mascota')));
    await owner.goto('/');
    await owner.getByRole('option', { name: /Argos/ }).click();
    await owner.getByRole('button', { name: 'Eliminar', exact: true }).click();
    await expect(owner.getByRole('button', { name: 'Eliminar definitivamente' })).toBeDisabled();
    findings.push(...(await accessibilityFindings(owner, 'dialogo-eliminar')));
    expect(findings).toEqual([]);
  });

  test('[REQ-UI-004][REQ-UI-006] hogares del OWNER con un miembro INVITED, y la pantalla del invitado con el contador de pendientes', async () => {
    await owner.goto('/households');
    await expect(owner.getByRole('heading', { name: new RegExp(HOUSE), level: 3 })).toBeVisible();
    const ownerFindings = await accessibilityFindings(owner, 'hogares-owner');
    await member.goto('/households');
    await expect(member.locator('[data-pending-invitations]')).toHaveAttribute('data-pending-invitations', '1');
    await expect(member.getByRole('heading', { name: /Invitaciones/, level: 2 })).toBeVisible();
    expect([...ownerFindings, ...(await accessibilityFindings(member, 'hogares-invitado'))]).toEqual([]);
  });

  test('[REQ-UI-004][REQ-UI-007] contexto de hogar: tarjetas con dueño y color, ficha ajena de solo lectura y hogares del MEMBER', async () => {
    await member.getByRole('button', { name: 'Aceptar' }).click();
    await expect(member.getByRole('heading', { name: new RegExp(HOUSE), level: 3 })).toBeVisible();
    const findings = await accessibilityFindings(member, 'hogares-member');
    await member.getByRole('link', { name: 'Mascotas' }).click();
    await member.getByRole('tab', { name: HOUSE }).click();
    await member.getByRole('option', { name: /Argos/ }).click();
    await expect(member.getByRole('heading', { name: 'Argos', level: 2 })).toBeVisible();
    await expect(member.getByRole('button', { name: 'Editar', exact: true })).toHaveCount(0);
    findings.push(...(await accessibilityFindings(member, 'hogar-contexto')));
    await member.getByRole('tab', { name: 'Vacunas' }).click();
    findings.push(...(await accessibilityFindings(member, 'hogar-ficha-vacunas')));
    expect(findings).toEqual([]);
  });

  test('[REQ-UI-004] respaldo, en reposo y tras un archivo inválido', async ({}, testInfo) => {
    await owner.goto('/backup');
    const findings = await accessibilityFindings(owner, 'respaldo');
    const broken = testInfo.outputPath('roto.json');
    writeFileSync(broken, '{ roto');
    await owner.locator('input[type="file"]').setInputFiles(broken);
    await owner.getByRole('button', { name: 'Importar respaldo' }).click();
    await expect(owner.getByText(/No se modificó ningún dato/)).toBeVisible();
    findings.push(...(await accessibilityFindings(owner, 'respaldo-error')));
    expect(findings).toEqual([]);
  });
});

/**
 * T285 (Rebanada 6, REQ-UI2-008, REQ-UI2-004, SC-005): los cuatro anchos de la v2.1 (320, 768, 1024 y 1280 px) en todas las
 * pantallas, `/cuenta` incluida, y sin desbordamiento horizontal a 320 px. El archivo es serial: la prueba de `/cuenta` (roja hasta T290) va la última para
 * no ocultar el resultado de las demás.
 */
test.describe('axe-core a 320, 768, 1024 y 1280 px (Rebanada 6, T285)', () => {
  const screens: ReadonlyArray<readonly [string, string]> = [
    ['/', 'mascotas'],
    ['/households', 'hogares'],
    ['/backup', 'respaldo'],
  ];

  for (const [path, name] of screens) {
    test(`[REQ-UI2-008][SC-005] ${name} (${path}) sin violaciones critical ni serious a 320, 768, 1024 y 1280 px`, async () => {
      await owner.goto(path);
      await expect(owner.getByRole('main')).toBeVisible();
      expect(await accessibilityFindingsAt(owner, `${name}-v21`, VIEWPORT_WIDTHS_V21)).toEqual([]);
    });
  }

  test('[REQ-UI2-008][REQ-UI2-004][SC-005] la ficha de la mascota a los cuatro anchos', async () => {
    await owner.goto('/');
    await owner.getByRole('option', { name: /Argos/ }).click();
    await expect(owner.getByRole('heading', { name: 'Argos', level: 2 })).toBeVisible();
    expect(await accessibilityFindingsAt(owner, 'ficha-v21', VIEWPORT_WIDTHS_V21)).toEqual([]);
  });

  test('[REQ-UI2-008][REQ-UI-005] login y registro a los cuatro anchos', async () => {
    const page = await anonymous.newPage();
    const findings: string[] = [];
    for (const path of ['/login', '/register']) {
      await page.goto(path);
      await expect(page.getByRole('main')).toBeVisible();
      findings.push(...(await accessibilityFindingsAt(page, `${path}-v21`, VIEWPORT_WIDTHS_V21)));
    }
    expect(findings).toEqual([]);
  });

  test('[REQ-UI2-008][SC-005] sin desbordamiento horizontal a 320 px en mascotas, hogares y respaldo (el de /cuenta lo cubre su propia prueba, que va al final)', async () => {
    await owner.setViewportSize({ width: 320, height: 900 });
    const overflow: string[] = [];
    for (const path of ['/', '/households', '/backup']) {
      await owner.goto(path);
      expect(new URL(owner.url()).pathname, `la ruta ${path} debe existir`).toBe(path);
      const { scrollWidth, innerWidth } = await owner.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, innerWidth: window.innerWidth }));
      if (scrollWidth > innerWidth + 1) overflow.push(`${path}: scrollWidth ${scrollWidth} > ${innerWidth}`);
    }
    await owner.setViewportSize({ width: 1280, height: 900 });
    expect(overflow).toEqual([]);
  });

  test('[REQ-UI2-004][REQ-UI2-008][SC-005] /cuenta existe, muestra la zona de peligro y no tiene violaciones critical ni serious a los cuatro anchos', async () => {
    await owner.goto('/cuenta');
    await expect(owner).toHaveURL(/\/cuenta$/);
    await expect(owner.getByRole('heading', { name: 'Zona de peligro' })).toBeVisible();
    expect(await accessibilityFindingsAt(owner, 'cuenta-v21', VIEWPORT_WIDTHS_V21)).toEqual([]);
  });
});
