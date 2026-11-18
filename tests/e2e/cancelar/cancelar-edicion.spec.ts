/**
 * T744 [US3] E2E de «Cancelar» en la edición de los 6 módulos clínicos contra la API real y la SPA (REQ-CAN-001, REQ-CAN-002; SC-005-012, SC-005-013, SC-005-014; D5-09, EDGE-005-08):
 *  - en cada módulo, tras editar un campo, «Cancelar» cierra el formulario SIN petición de escritura (ninguna petición distinta de GET a `/api`) y sin diálogo de confirmación;
 *  - el registro conserva `revision` y valores (la ficha de la API es idéntica antes y después) y `audit_log` no gana filas;
 *  - reabrir la edición muestra los valores guardados, no los descartados;
 *  - con un guardado en vuelo «Cancelar» está deshabilitado y el guardado manda; el teclado (Tab, Enter) alcanza y activa «Cancelar».
 */
import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import Database from 'better-sqlite3';
import { apiCall, createPetViaApi, isoDateFromToday, registerViaApi } from '../visual/e2e-support.ts';

interface Case {
  readonly tab: string;
  readonly collection: string;
  readonly dashboardKey: string;
  readonly body: Record<string, unknown>;
  /** Campo opcional de texto que el usuario edita y luego cancela. */
  readonly field: string;
}

const DAY = isoDateFromToday(-10);
const CASES: readonly Case[] = [
  { tab: 'Peso', collection: 'weights', dashboardKey: 'weights', body: { recordedAt: DAY, weightKg: 12.5, notes: 'nota guardada' }, field: 'notes' },
  { tab: 'Medidas', collection: 'measurements', dashboardKey: 'bodyMeasurements', body: { recordedAt: DAY, neckCm: 30, chestCm: 50, backLengthCm: 40, waistCm: 45, notes: 'nota guardada' }, field: 'notes' },
  { tab: 'Vacunas', collection: 'vaccinations', dashboardKey: 'vaccinations', body: { vaccineName: 'Rabia', appliedAt: DAY, notes: 'nota guardada' }, field: 'notes' },
  { tab: 'Desparasitación', collection: 'dewormings', dashboardKey: 'dewormings', body: { productBrand: 'Drontal', dewormingType: 'INTERNAL', appliedAt: DAY, nextSuggestedDoseAt: isoDateFromToday(80), notes: 'nota guardada' }, field: 'notes' },
  { tab: 'Consultas', collection: 'visits', dashboardKey: 'medicalVisits', body: { visitDate: DAY, reason: 'Control', diagnosis: 'Sano', treatment: 'Ninguno', clinicOrVet: 'VetCentral', observations: 'nota guardada' }, field: 'observations' },
  { tab: 'Parámetros', collection: 'custom-parameters', dashboardKey: 'customParameters', body: { recordedAt: DAY, category: 'ALLERGY', title: 'Polen', description: 'Estornudos', notes: 'nota guardada' }, field: 'notes' },
];
const MODULE_ID: Readonly<Record<string, string>> = { weights: 'weights', measurements: 'measurements', vaccinations: 'vaccinations', dewormings: 'dewormings', visits: 'visits', 'custom-parameters': 'customParameters' };

test.describe.configure({ mode: 'serial' });

test.describe('«Cancelar» en la edición clínica (T744)', () => {
  let context: BrowserContext;
  let page: Page;
  let petId = '';

  const auditRows = (): number => {
    const db = new Database(process.env['ARGOS_E2E_DATABASE']!, { readonly: true });
    try {
      return (db.prepare('SELECT COUNT(*) AS n FROM audit_log').get() as { n: number }).n;
    } finally {
      db.close();
    }
  };
  const dashboard = async (): Promise<unknown> => (await apiCall(context.request, 'GET', `/pets/${petId}/dashboard`)).body;
  const editForm = () => page.locator('form').filter({ has: page.getByRole('heading', { name: /^Editar (peso|medidas|vacuna|desparasitación|consulta|parámetro)/ }) });

  test.beforeAll(async ({ browser }, info) => {
    context = await browser.newContext({ locale: 'es-CO', timezoneId: 'America/Bogota' });
    await registerViaApi(context.request, `cancelar.${info.project.name}`, 'Dueña Cancelar', 'CancelarClave2026!');
    petId = await createPetViaApi(context.request, 'Nube', 'CANINE');
    for (const c of CASES) {
      const created = await apiCall(context.request, 'POST', `/pets/${petId}/records/${c.collection}`, c.body);
      expect(created.status, JSON.stringify(created.body)).toBe(201);
    }
    page = await context.newPage();
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Nube', level: 2 })).toBeVisible();
  });
  test.afterAll(async () => {
    await context.close();
  });

  for (const c of CASES) {
    test(`[SC-005-012][SC-005-013][REQ-CAN-001][REQ-CAN-002] ${c.tab}: Cancelar con cambios cierra sin petición de escritura, sin confirmación, con revision y auditoría intactas y valores guardados al reabrir`, async () => {
      const writes: string[] = [];
      const dialogs: string[] = [];
      page.on('request', (r) => {
        if (r.url().includes('/api/') && r.method() !== 'GET') writes.push(`${r.method()} ${r.url()}`);
      });
      page.on('dialog', (d) => {
        dialogs.push(d.message());
        void d.dismiss();
      });
      await page.getByRole('tab', { name: c.tab }).click();
      const before = JSON.stringify(await dashboard());
      const auditBefore = auditRows();

      await page.getByRole('button', { name: /^Editar (peso|medidas|vacuna|desparasitación|consulta|parámetro)/ }).click();
      await expect(editForm()).toHaveCount(1);
      const input = editForm().locator(`#${MODULE_ID[c.collection]}-${c.field}`);
      await expect(input).toHaveValue('nota guardada');
      await input.fill('cambio sin guardar');
      await editForm().getByRole('button', { name: 'Cancelar' }).click();

      await expect(editForm()).toHaveCount(0);
      expect(writes).toEqual([]);
      expect(dialogs).toEqual([]);
      expect(JSON.stringify(await dashboard())).toBe(before);
      expect(auditRows()).toBe(auditBefore);

      await page.getByRole('button', { name: /^Editar (peso|medidas|vacuna|desparasitación|consulta|parámetro)/ }).click();
      await expect(editForm().locator(`#${MODULE_ID[c.collection]}-${c.field}`)).toHaveValue('nota guardada');
      await editForm().getByRole('button', { name: 'Cancelar' }).click();
      await expect(editForm()).toHaveCount(0);
      page.removeAllListeners('request');
      page.removeAllListeners('dialog');
    });
  }

  test('[REQ-CAN-001] el teclado alcanza «Cancelar» (Tab desde «Guardar») y lo activa con Enter', async () => {
    await page.getByRole('tab', { name: 'Peso' }).click();
    await page.getByRole('button', { name: /^Editar peso/ }).click();
    await editForm().getByRole('button', { name: 'Guardar' }).focus();
    await page.keyboard.press('Tab');
    await expect(editForm().getByRole('button', { name: 'Cancelar' })).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(editForm()).toHaveCount(0);
  });

  test('[SC-005-014][REQ-CAN-002][EDGE-005-08] con el guardado en vuelo «Cancelar» está deshabilitado y el guardado manda (la revision pasa de 0 a 1)', async () => {
    await page.getByRole('tab', { name: 'Peso' }).click();
    await page.route('**/api/pets/*/records/weights/*', async (route) => {
      if (route.request().method() === 'GET') return route.continue();
      await new Promise((resolve) => setTimeout(resolve, 1500));
      return route.continue();
    });
    await page.getByRole('button', { name: /^Editar peso/ }).click();
    await editForm().locator('#weights-notes').fill('guardado en vuelo');
    await editForm().getByRole('button', { name: 'Guardar' }).click();
    await expect(editForm().getByRole('button', { name: 'Cancelar' })).toBeDisabled();
    await expect(editForm().getByRole('button', { name: 'Guardar' })).toBeDisabled();
    await expect(editForm()).toHaveCount(0);
    await page.unroute('**/api/pets/*/records/weights/*');
    const weights = ((await dashboard()) as { weights: Array<{ record: { notes: string; revision: number } }> }).weights;
    expect([weights[0]?.record.notes, weights[0]?.record.revision]).toEqual(['guardado en vuelo', 1]);
  });
});
