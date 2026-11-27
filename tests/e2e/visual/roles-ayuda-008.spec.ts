/**
 * E2E de la ayuda de rol y del aviso de hogar del enlace veterinario (Feature 008, `[GH:#25]`, T1198) con tres contextos de navegador reales: la propietaria (Ana), un Cuidador (Beto) y
 * un Lector (Dario) de un mismo hogar. Afirma, contra la UI real y no contra el catálogo: (1) la ayuda de rol aprobada en D8-13 aparece en el selector «Rol al unirse» y en la lista
 * de miembros, asociada por aria-describedby, y el Administrador no tiene frase; (2) el aviso de hogar de «Compartir con mi veterinario» lo ve la propietaria; (3) Cuidador y Lector no
 * ven el aviso, ni el panel de enlaces, en ninguna parte de la ficha. Chromium siempre; Firefox y WebKit con `E2E_FIREFOX=1` / `E2E_WEBKIT=1` (`playwright.config.ts`).
 *
 * @implements REQ-ROL8-001, REQ-ROL8-002, REQ-RBAC-001, REQ-VET-001, EDGE-008-048, EDGE-008-049, SC-008-056, SC-008-057, SC-008-058, SC-008-059, SC-008-060, NFR-008-002
 */
import { randomUUID } from 'node:crypto';
import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { apiCall, apiPost, createPetViaApi, registerViaApi } from './e2e-support.ts';

const HOUSE = 'Casa Roles';
const PASSWORD = 'RolClave2026!';
const CAREGIVER_HELP = 'Puede registrar pesos, medidas, eventos sanitarios y subir archivos y fotos. No puede editar el perfil de la mascota, invitar personas ni crear enlaces para el veterinario.';
const READER_HELP = 'Solo puede consultar. No puede registrar ni editar nada.';
const LINK_NOTICE = 'Para compartir más de una mascota en un mismo enlace, agrúpalas en un hogar. Un enlace de hogar incluye solo las mascotas asignadas a ese hogar que sean tuyas.';

async function openLuna(page: Page): Promise<void> {
  await page.goto('/');
  await page.getByRole('tab', { name: HOUSE }).click();
  await page.getByRole('option', { name: /Luna/ }).click();
  await expect(page.getByRole('heading', { name: 'Luna', level: 2 })).toBeVisible();
}

/** REQ-PET11-001: el panel «Compartir con mi veterinario» vive en la pestaña «Compartir» (solo OWNER/ADMIN); «Historial / Archivos» ya no lo trae. Se abre siempre «Historial / Archivos» para que la ausencia no sea trivial. */
async function openHistoryTab(page: Page): Promise<void> {
  const tab = page.getByRole('tab', { name: 'Historial / Archivos' });
  await expect(tab).toBeVisible();
  await tab.click();
  await expect(tab).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('#clinical-files-title')).toBeVisible(); // el resto de la pestaña sí se renderizó (REQ-PET11-002: el álbum ya no está aquí)
  await expect(page.getByRole('link', { name: 'Ver el álbum de fotos' })).toHaveCount(0);
}

test.describe.serial('ayuda de rol y aviso de enlaces (Feature 008, #25)', () => {
  let owner: BrowserContext;
  let caregiver: BrowserContext;
  let reader: BrowserContext;
  let ownerPage: Page;
  let caregiverPage: Page;
  let readerPage: Page;
  let petId = '';
  let householdId = '';

  test.beforeAll(async ({ browser }) => {
    const tag = randomUUID().slice(0, 6);
    [owner, caregiver, reader] = await Promise.all([browser.newContext(), browser.newContext(), browser.newContext()]);
    [ownerPage, caregiverPage, readerPage] = await Promise.all([owner.newPage(), caregiver.newPage(), reader.newPage()]);
    await registerViaApi(owner.request, `rol.ana.${tag}`, 'Ana', PASSWORD);
    await registerViaApi(caregiver.request, `rol.beto.${tag}`, 'Beto', PASSWORD);
    await registerViaApi(reader.request, `rol.dario.${tag}`, 'Dario', PASSWORD);
    const created = await apiPost<{ household: { id: string } }>(owner.request, '/households', { name: HOUSE });
    householdId = created.household.id;
    petId = await createPetViaApi(owner.request, 'Luna', 'CANINE');
    expect((await apiCall(owner.request, 'PUT', `/pets/${petId}/assignments/${householdId}`)).status).toBe(200);
    expect((await apiCall(owner.request, 'POST', `/households/${householdId}/invitations`, { username: `rol.beto.${tag}`, roleOnJoin: 'CAREGIVER' })).status).toBe(202);
    expect((await apiCall(owner.request, 'POST', `/households/${householdId}/invitations`, { username: `rol.dario.${tag}`, roleOnJoin: 'READER' })).status).toBe(202);
    for (const page of [caregiverPage, readerPage]) {
      await page.goto('/households');
      await page.getByRole('button', { name: 'Aceptar' }).click();
      await expect(page.getByRole('heading', { name: new RegExp(HOUSE), level: 3 })).toBeVisible();
    }
  });

  test.afterAll(async () => {
    await Promise.all([owner.close(), caregiver.close(), reader.close()]);
  });

  test('[REQ-ROL8-001][SC-008-056][SC-008-058] la propietaria ve la frase aprobada del rol al invitar y en la lista de miembros, asociada al selector; el Administrador no tiene frase', async () => {
    await ownerPage.goto('/households');
    const section = ownerPage.locator('section', { has: ownerPage.getByRole('heading', { name: new RegExp(HOUSE), level: 3 }) }).first();

    // Selector «Rol al unirse»: la frase cambia con el rol elegido y describe al selector.
    const select = section.getByLabel('Rol al unirse');
    await expect(select).toBeVisible();
    await select.selectOption('CAREGIVER');
    await expect(section.locator('[data-role-help="CAREGIVER"]').first()).toHaveText(CAREGIVER_HELP);
    await expect(select).toHaveAccessibleDescription(new RegExp(CAREGIVER_HELP.slice(0, 40)));
    await select.selectOption('READER');
    await expect(section.locator('[data-role-help="READER"]').first()).toHaveText(READER_HELP);
    await expect(select).toHaveAccessibleDescription(new RegExp(READER_HELP));
    await select.selectOption('ADMIN');
    await expect(section.locator('[data-role-help="ADMIN"]')).toHaveCount(0);

    // Lista de miembros: cada rol con su frase; el selector de rol del miembro la tiene por aria-describedby.
    const beto = section.locator('[data-role-help="CAREGIVER"]', { hasText: CAREGIVER_HELP });
    const dario = section.locator('[data-role-help="READER"]', { hasText: READER_HELP });
    await expect(beto).toHaveCount(1);
    await expect(dario).toHaveCount(1);
    await expect(section.getByLabel('Rol de Beto')).toHaveAccessibleDescription(CAREGIVER_HELP);
    await expect(section.getByLabel('Rol de Dario')).toHaveAccessibleDescription(READER_HELP);
    // Ana (Administradora y propietaria) no tiene frase aprobada.
    await expect(section.locator('[data-role-help="ADMIN"]')).toHaveCount(0);
  });

  test('[REQ-ROL8-002][SC-008-057] la propietaria ve el aviso de hogar en «Compartir con mi veterinario», ligado al grupo de alcance', async () => {
    await openLuna(ownerPage);
    await openHistoryTab(ownerPage);
    await expect(ownerPage.getByRole('region', { name: 'Compartir con mi veterinario' })).toHaveCount(0); // REQ-PET11-001: no está en Historial
    await ownerPage.getByRole('tab', { name: 'Compartir', exact: true }).click();
    const panel = ownerPage.getByRole('region', { name: 'Compartir con mi veterinario' });
    await expect(panel).toBeVisible();
    const hint = panel.locator('[data-share-household-hint]');
    await expect(hint).toHaveText(LINK_NOTICE);
    await expect(panel.getByRole('group', { name: '¿Qué quieres compartir?' })).toHaveAccessibleDescription(LINK_NOTICE);
  });

  test('[REQ-ROL8-002][REQ-RBAC-001][EDGE-008-049][SC-008-059][SC-008-060] Cuidador y Lector tienen su rol real y NO ven el aviso ni el panel de enlaces; sí ven su propia ayuda de rol', async () => {
    const cases: ReadonlyArray<{ readonly name: string; readonly page: Page; readonly ctx: BrowserContext; readonly role: string; readonly help: string }> = [
      { name: 'Cuidador', page: caregiverPage, ctx: caregiver, role: 'CAREGIVER', help: CAREGIVER_HELP },
      { name: 'Lector', page: readerPage, ctx: reader, role: 'READER', help: READER_HELP },
    ];
    for (const c of cases) {
      const dashboard = await apiCall<{ myRole: string }>(c.ctx.request, 'GET', `/pets/${petId}/dashboard`);
      expect(dashboard.body.myRole, `${c.name}: rol real en la API`).toBe(c.role);

      await openLuna(c.page);
      await openHistoryTab(c.page);
      await expect(c.page.getByRole('tab', { name: 'Compartir', exact: true }), `${c.name}: pestaña Compartir`).toHaveCount(0);
      await expect(c.page.getByRole('region', { name: 'Compartir con mi veterinario' }), `${c.name}: panel de enlaces`).toHaveCount(0);
      await expect(c.page.getByText('Compartir con mi veterinario'), `${c.name}: título del panel`).toHaveCount(0);
      await expect(c.page.locator('[data-share-household-hint]'), `${c.name}: aviso de hogar (marcador)`).toHaveCount(0);
      await expect(c.page.getByText('agrúpalas en un hogar'), `${c.name}: aviso de hogar (texto)`).toHaveCount(0);
      await expect(c.page.getByText(LINK_NOTICE), `${c.name}: aviso de hogar (frase completa)`).toHaveCount(0);

      // Su propia ayuda de rol sí aparece en la pantalla de hogares.
      await c.page.goto('/households');
      await expect(c.page.locator(`[data-role-help="${c.role}"]`, { hasText: c.help })).toHaveCount(1);
      await expect(c.page.getByText('agrúpalas en un hogar')).toHaveCount(0);
    }
  });
});
