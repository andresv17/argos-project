/**
 * T1049 (007, Bloque D, [GH:#14]) E2E de la primera medida en Peso, Medidas, Vacunas y Desparasitaciones (Opción B): sin registros el formulario aparece abierto con «Guardar» y sin
 * «Registrar …»; el flujo completo se escribe sin Tab (la fecha con auto-avance); tras guardar reaparece «Registrar …» plegado; Consultas y Parámetros no cambian. Sin permiso de
 * escritura no hay formulario ni botón (SC-007-020: cubierto por T1046; aquí el Lector lo comprueba contra la API real). REQ-REG7-001, REQ-REG7-002, EDGE-007-007; SC-007-017..020.
 */
import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { createPetViaApi, registerViaApi, typeDate } from './e2e-support.ts';

test.describe.configure({ mode: 'serial' });

interface Case {
  readonly tab: string;
  readonly summary: string;
  readonly dateId: string;
  readonly fill: (page: Page) => Promise<void>;
  readonly shown: RegExp;
}

const CASES: readonly Case[] = [
  { tab: 'Peso', summary: 'Registrar peso', dateId: '#weights-recordedAt', fill: async (p) => p.locator('#weights-weightKg').fill('12.5'), shown: /12\.50 kg/ },
  {
    tab: 'Medidas',
    summary: 'Registrar medidas',
    dateId: '#measurements-recordedAt',
    fill: async (p) => {
      for (const [field, cm] of [['neckCm', '30'], ['chestCm', '50'], ['backLengthCm', '40'], ['waistCm', '45']] as const) await p.locator(`#measurements-${field}`).fill(cm);
    },
    shown: /30\.00 cm/,
  },
  { tab: 'Vacunas', summary: 'Registrar vacuna', dateId: '#vaccinations-appliedAt', fill: async (p) => p.locator('#vaccinations-vaccineName').fill('Rabia'), shown: /Rabia/ },
  {
    tab: 'Desparasitación',
    summary: 'Registrar desparasitación',
    dateId: '#dewormings-appliedAt',
    fill: async (p) => {
      await p.locator('#dewormings-productBrand').fill('Drontal');
      await typeDate(p, p.locator('#dewormings-nextSuggestedDoseAt'), '2026-04-01');
    },
    shown: /Drontal/,
  },
];

test.describe('primer registro sin «Registrar» (007, T1049)', () => {
  let context: BrowserContext;
  let page: Page;

  test.beforeAll(async ({ browser }, info) => {
    context = await browser.newContext({ locale: 'es-CO', timezoneId: 'America/Bogota' });
    await registerViaApi(context.request, `primer7.${info.project.name}`, 'Dueña Primer', 'PrimerClave2026!');
    await createPetViaApi(context.request, 'Argos', 'CANINE');
    page = await context.newPage();
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Argos', level: 2 })).toBeVisible();
  });
  test.afterAll(async () => {
    await context.close();
  });

  for (const c of CASES) {
    test(`[SC-007-017][SC-007-018] ${c.tab}: sin registros hay formulario con «Guardar» y sin «${c.summary}»; la primera medida se guarda sin Tab y luego reaparece «${c.summary}» plegado`, async () => {
      await page.getByRole('tab', { name: c.tab, exact: true }).click();
      const panel = page.locator('[id^="module-panel-"]');
      await expect(panel.getByRole('button', { name: 'Guardar' })).toBeVisible();
      await expect(panel.locator('summary')).toHaveCount(0);
      await expect(panel.locator('details')).toHaveCount(0);
      await typeDate(page, page.locator(c.dateId), '2026-01-10');
      await c.fill(page);
      await panel.getByRole('button', { name: 'Guardar' }).click();
      await expect(panel.locator('td, li').filter({ hasText: c.shown }).first()).toBeVisible();
      await expect(panel.locator('summary', { hasText: c.summary })).toBeVisible();
      expect(await panel.locator('details').evaluate((el) => (el as HTMLDetailsElement).open)).toBe(false);
    });
  }

  test('[REQ-REG7-001] Consultas y Parámetros sin registros conservan el <details> abierto con su «Registrar …»', async () => {
    for (const [tab, summary] of [['Consultas', 'Registrar consulta'], ['Parámetros', 'Registrar parámetro']] as const) {
      await page.getByRole('tab', { name: tab, exact: true }).click();
      const panel = page.locator('[id^="module-panel-"]');
      await expect(panel.locator('summary', { hasText: summary })).toBeVisible();
      expect(await panel.locator('details').first().evaluate((el) => (el as HTMLDetailsElement).open)).toBe(true);
    }
  });
});
