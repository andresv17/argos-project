/**
 * Suite de CARACTERIZACIÓN, no un ciclo rojo-verde: nació verde porque T1181..T1183 ya estaban implementados cuando se escribió; fija el comportamiento vigente (REQ-BIO8-001..003).
 * La UI vigente tiene un único botón de generación («Regenerar imagen del hogar», gobernado por `canRegenerate`) y ningún botón «Actualizar»; por eso el caso 3 afirma
 * `canUpdate=false`/`NO_CHANGES` por la API (contrato `GET /households/{id}/scene`), no por la UI.
 *
 * E2E de la biografía de la mascota (Feature 008, `[GH:#21]`, T1184) con navegadores reales: (1) la propietaria la escribe en «Editar», guarda y la ve en la ficha como texto plano (nunca
 * como HTML) también tras recargar; (2) un Lector del hogar la ve en la ficha sin botón «Editar» y la API le niega editarla; (3) guardarla no cambia la escena del hogar: misma imagen, estado
 * «ready» y cero cambios pendientes, y la API sigue sin permitir actualizar, `canUpdate=false`/`NO_CHANGES` (la biografía no entra en el payload ni en la huella, `D8-12` = A). La API es la real de los E2E (driver de escena
 * simulado). Chromium siempre; Firefox y WebKit con `E2E_FIREFOX=1` / `E2E_WEBKIT=1` (`playwright.config.ts`).
 *
 * @implements REQ-BIO8-001, REQ-BIO8-002, REQ-BIO8-003, REQ-RBAC-001, NFR-008-002, EDGE-008-042, SC-008-043, SC-008-044, SC-008-045, SC-008-046
 */
import { randomUUID } from 'node:crypto';
import { expect, test, type APIRequestContext, type BrowserContext, type Page } from '@playwright/test';
import { apiCall, apiPost, createPetViaApi, registerViaApi } from './e2e-support.ts';

const CSRF = { 'X-Argos-Request': '1' } as const;
const HOUSE = 'Casa Biografía';
const BIOGRAPHY = 'Adora <b>el queso</b> & duerme en la ventana';

interface SceneBody {
  readonly imageTag: string | null;
  readonly status: string;
  readonly pending: number;
  readonly quota: { readonly remaining: number };
  readonly actions: { readonly canUpdate: boolean; readonly blockedReason: string | null };
}

async function readScene(request: APIRequestContext, householdId: string): Promise<SceneBody> {
  return (await apiCall<SceneBody>(request, 'GET', `/households/${householdId}/scene`)).body;
}

async function waitForImage(request: APIRequestContext, householdId: string): Promise<SceneBody> {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const scene = await readScene(request, householdId);
    if (scene.status !== 'generating' && scene.imageTag !== null) return scene;
    await new Promise((resolveWait) => setTimeout(resolveWait, 200));
  }
  throw new Error('La escena no terminó de generarse');
}

/** Abre la ficha de Luna dentro del hogar, como lo haría la persona en su navegador. */
async function openLuna(page: Page): Promise<void> {
  await page.goto('/');
  await page.getByRole('tab', { name: HOUSE }).click();
  await page.getByRole('option', { name: /Luna/ }).click();
  await expect(page.getByRole('heading', { name: 'Luna', level: 2 })).toBeVisible();
}

test.describe.serial('biografía de la mascota (Feature 008)', () => {
  let owner: BrowserContext;
  let reader: BrowserContext;
  let ownerPage: Page;
  let readerPage: Page;
  let householdId = '';
  let petId = '';
  let sceneBefore: SceneBody;

  test.beforeAll(async ({ browser }) => {
    const tag = randomUUID().slice(0, 6);
    [owner, reader] = await Promise.all([browser.newContext(), browser.newContext()]);
    [ownerPage, readerPage] = await Promise.all([owner.newPage(), reader.newPage()]);
    await registerViaApi(owner.request, `bio.ana.${tag}`, 'Ana', 'BioClave2026!');
    await registerViaApi(reader.request, `bio.dario.${tag}`, 'Dario', 'BioClave2026!');
    const created = await apiPost<{ household: { id: string } }>(owner.request, '/households', { name: HOUSE });
    householdId = created.household.id;
    petId = await createPetViaApi(owner.request, 'Luna', 'CANINE');
    expect((await apiCall(owner.request, 'PUT', `/pets/${petId}/assignments/${householdId}`)).status).toBe(200);
    expect((await apiCall(owner.request, 'POST', `/households/${householdId}/invitations`, { username: `bio.dario.${tag}`, roleOnJoin: 'READER' })).status).toBe(202);
    await readerPage.goto('/households');
    await readerPage.getByRole('button', { name: 'Aceptar' }).click();
    await expect(readerPage.getByRole('heading', { name: new RegExp(HOUSE), level: 3 })).toBeVisible();
    // Escena con imagen vigente ANTES de tocar la biografía: es la referencia contra la que se compara (REQ-BIO8-003).
    const notice = await apiCall<{ noticeVersion: string; providerId: string; scopes: string[] }>(owner.request, 'GET', '/scene-consent/notice');
    const consent = await owner.request.post('/api/scene-consent', { headers: CSRF, data: { noticeVersion: notice.body.noticeVersion, providerId: notice.body.providerId, scopes: notice.body.scopes } });
    expect(consent.status(), await consent.text()).toBe(204);
    const generate = await owner.request.post(`/api/households/${householdId}/scene/generate`, { headers: { ...CSRF, 'Idempotency-Key': randomUUID() }, data: { action: 'UPDATE' } });
    expect(generate.status(), await generate.text()).toBe(202);
    sceneBefore = await waitForImage(owner.request, householdId);
  });

  test.afterAll(async () => {
    await Promise.all([owner.close(), reader.close()]);
  });

  test('[REQ-BIO8-001][REQ-BIO8-002][SC-008-043][EDGE-008-042] la propietaria escribe la biografía en «Editar», guarda y la ve en la ficha como texto plano, también tras recargar', async () => {
    await openLuna(ownerPage);
    await expect(ownerPage.locator('[data-pet-biography]')).toHaveCount(0); // sin biografía no se pinta nada
    await ownerPage.getByRole('button', { name: 'Editar', exact: true }).click();
    const field = ownerPage.getByLabel('Biografía (opcional)');
    await expect(field).toBeVisible();
    await expect(ownerPage.getByText('0 de 280 caracteres.')).toBeVisible();
    await field.fill(BIOGRAPHY);
    await expect(ownerPage.getByText(`${[...BIOGRAPHY].length} de 280 caracteres.`)).toBeVisible();
    await ownerPage.getByRole('button', { name: 'Guardar' }).first().click();

    const bio = ownerPage.locator('[data-pet-biography]');
    await expect(bio).toHaveText(BIOGRAPHY); // el marcado se ve literal: es texto, no HTML
    await expect(bio.locator('b')).toHaveCount(0);
    await ownerPage.reload();
    await openLuna(ownerPage);
    await expect(ownerPage.locator('[data-pet-biography]')).toHaveText(BIOGRAPHY);
    const stored = await apiCall<{ profile: { biography: string | null } }>(owner.request, 'GET', `/pets/${petId}/dashboard`);
    expect(stored.body.profile.biography).toBe(BIOGRAPHY);
  });

  test('[REQ-BIO8-001][REQ-BIO8-002][REQ-RBAC-001][SC-008-043][SC-008-044] un Lector la ve en la ficha sin botón «Editar» ni campo, y la API le niega editarla', async () => {
    await openLuna(readerPage);
    await expect(readerPage.locator('[data-pet-biography]')).toHaveText(BIOGRAPHY);
    await expect(readerPage.locator('[data-pet-biography] b')).toHaveCount(0);
    await expect(readerPage.getByRole('button', { name: 'Editar', exact: true })).toHaveCount(0);
    await expect(readerPage.getByLabel('Biografía (opcional)')).toHaveCount(0);

    const dashboard = await apiCall<{ profile: { biography: string | null } }>(reader.request, 'GET', `/pets/${petId}/dashboard`);
    expect(dashboard.body.profile.biography).toBe(BIOGRAPHY);
    const denied = await apiCall(reader.request, 'PATCH', `/pets/${petId}`, { biography: 'intento del lector' });
    expect([denied.status, denied.code]).toEqual([403, 'ERR-ACC-FORBIDDEN']);
    const unchanged = await apiCall<{ profile: { biography: string | null } }>(owner.request, 'GET', `/pets/${petId}/dashboard`);
    expect(unchanged.body.profile.biography).toBe(BIOGRAPHY);
  });

  test('[REQ-BIO8-003][SC-008-045][SC-008-046] guardar la biografía no cambia la escena: misma imagen, estado «ready», cero cambios pendientes y `canUpdate=false` (NO_CHANGES) en la API', async () => {
    expect(sceneBefore).toMatchObject({ status: 'ready', pending: 0 });
    for (const request of [owner.request, reader.request]) {
      const after = await readScene(request, householdId);
      expect(after.imageTag).toBe(sceneBefore.imageTag);
      expect(after.status).toBe('ready');
      expect(after.pending).toBe(0);
      expect(after.quota.remaining).toBe(sceneBefore.quota.remaining);
    }
    const owned = await readScene(owner.request, householdId);
    expect(owned.actions.canUpdate).toBe(false);
    expect(owned.actions.blockedReason).toBe('NO_CHANGES');

    // Control de que la prueba detecta cambios: sumar otra mascota al hogar (dato que sí entra en la escena) deja cambios pendientes.
    const second = await createPetViaApi(owner.request, 'Nube', 'FELINE');
    expect((await apiCall(owner.request, 'PUT', `/pets/${second}/assignments/${householdId}`)).status).toBe(200);
    expect((await readScene(owner.request, householdId)).pending).toBeGreaterThan(0);
  });
});
