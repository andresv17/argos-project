import { createHash, randomUUID } from 'node:crypto';
import { expect, test, type APIRequestContext, type BrowserContext, type Page } from '@playwright/test';
import { apiCall, createPetViaApi, registerViaApi } from '../visual/e2e-support.ts';
import { ADMIN_EMAIL, ADMIN_SIM_WEB_URL, startAdminGoogleSim, type AdminGoogleSim } from './admin-google-sim-support.ts';

/**
 * T1306 (Feature 009, `[GH:#20]`, subfase 5b): E2E de extremo a extremo con la API REAL (servidor de produccion de `createProductionApp`, base SQLite nueva, portal `/admin` real).
 * Lo UNICO simulado es Google del administrador (mismo arnes que T1237/T1270) y el generador de imagen del servidor de pruebas (cuya imagen depende del prompt). Cuentas sembradas ACTIVE.
 * Recorridos: (1) modelo 2.5 -> 3.1 -> 2.5; (2) regla de coste: con el modelo de 75_000 el tope 66 cabe y 111 no (422 ERR-ADMIN-SCENE-COST-CAP-EXCEEDED sin escribir), con el de 45_000
 * 111 cabe; pares no verificados 422 de esquema; (3) un bloque del prompt editado rige en la siguiente generacion tras la cache (<= 60 s) y vuelve al restaurarlo.
 * Los recorridos de coste van ANTES de generar: cada intento del generador simulado cuenta con el coste maximo de la tabla.
 *
 * @implements REQ-CFG9-002, REQ-CFG9-004, REQ-CFG9-005, REQ-CFG9-008, NFR-009-003, EDGE-009-036; SC-009-022, SC-009-023, SC-009-024, SC-009-051
 */
const ADMIN_SUB = 'google-sub-admin-t1306';
const PASSWORD = 'Clave-Segura-2026!';
const CSRF = { 'X-Argos-Request': '1' } as const;
const MODEL_KEY = 'scene.provider_model';
const LOCATION_KEY = 'scene.provider_location'; // D9-29: ya NO es una clave del catálogo; solo se usa para comprobar que no existe
const QUOTA_KEY = 'scene.global_quota_max';
const BLOCKS_KEY = 'scene.prompt.blocks';
const FLASH = 'gemini-2.5-flash-image';
const FLASH31 = 'gemini-3.1-flash-image';
const PROPAGATION_MS = 75_000;

test.use({ baseURL: ADMIN_SIM_WEB_URL });
test.describe.configure({ mode: 'serial', timeout: 300_000 });

let sim: AdminGoogleSim;
let adminContext: BrowserContext;
let adminPage: Page;
let userContext: BrowserContext;
let userRequest: APIRequestContext;

test.beforeAll(async ({ browser }) => {
  test.setTimeout(180_000);
  sim = await startAdminGoogleSim();
  userContext = await browser.newContext({ baseURL: ADMIN_SIM_WEB_URL });
  userRequest = userContext.request;
  await registerViaApi(userRequest, `t1306.${randomUUID().slice(0, 6)}`, 'Persona E2E', PASSWORD, sim.databasePath);
  await createPetViaApi(userRequest, 'Luna', 'CANINE');
  adminContext = await browser.newContext({ baseURL: ADMIN_SIM_WEB_URL });
  adminPage = await adminContext.newPage();
  sim.next = { kind: 'login', sub: ADMIN_SUB, email: ADMIN_EMAIL };
  await adminPage.goto('/admin');
  await adminPage.getByRole('link', { name: 'Entrar con Google' }).click();
  await expect(adminPage.getByRole('heading', { level: 1, name: 'Administración' })).toBeVisible({ timeout: 15_000 });
});
test.afterAll(async () => {
  await userContext?.close();
  await adminContext?.close();
  await sim?.stop();
});

interface Item { key: string; value: string; etag: string; writable: boolean }
async function items(): Promise<Item[]> {
  const list = await adminContext.request.get('/api/admin/parameters');
  expect(list.status()).toBe(200);
  return ((await list.json()) as { items: Item[] }).items;
}
const valueOf = async (key: string): Promise<string> => (await items()).find((i) => i.key === key)!.value;
async function put(key: string, value: string): Promise<{ status: number; code: string | null; text: string }> {
  const { etag } = (await items()).find((i) => i.key === key)!;
  const response = await adminContext.request.put(`/api/admin/parameters/${encodeURIComponent(key)}`, { headers: { ...CSRF, 'If-Match': etag, 'Content-Type': 'application/json' }, data: { value } });
  const text = await response.text();
  return { status: response.status(), code: text === '' ? null : ((JSON.parse(text) as { code?: string }).code ?? null), text };
}

test('[REQ-CFG9-008][SC-009-022] las claves de 5b son escribibles: el modelo cambia de 2.5 a 3.1 y vuelve a 2.5', async () => {
  for (const key of [MODEL_KEY, QUOTA_KEY, BLOCKS_KEY]) expect((await items()).find((i) => i.key === key)!.writable, key).toBe(true);
  expect((await items()).find((i) => i.key === LOCATION_KEY)).toBeUndefined();
  expect(await valueOf(MODEL_KEY)).toBe(FLASH);
  expect((await put(MODEL_KEY, FLASH31)).status).toBe(200);
  expect(await valueOf(MODEL_KEY)).toBe(FLASH31);
  expect((await put(MODEL_KEY, FLASH)).status).toBe(200);
  expect(await valueOf(MODEL_KEY)).toBe(FLASH);
});

test('[EDGE-009-036][SC-009-051] con el modelo de 75_000 el tope 66 cabe y 111 no: 422 ERR-ADMIN-SCENE-COST-CAP-EXCEEDED sin escribir y sin cifras', async () => {
  expect((await put(MODEL_KEY, FLASH31)).status).toBe(200);
  const before = await valueOf(QUOTA_KEY);
  const rejected = await put(QUOTA_KEY, '111');
  expect([rejected.status, rejected.code]).toEqual([422, 'ERR-ADMIN-SCENE-COST-CAP-EXCEEDED']);
  expect(rejected.text).not.toMatch(/\d{5,}/);
  expect(await valueOf(QUOTA_KEY)).toBe(before);
  expect((await put(QUOTA_KEY, '67')).code).toBe('ERR-ADMIN-SCENE-COST-CAP-EXCEEDED');
  expect((await put(QUOTA_KEY, '66')).status).toBe(200);
  expect(await valueOf(QUOTA_KEY)).toBe('66');
});

test('[EDGE-009-036] volver al modelo de 45_000 con tope 66 se acepta y el tope 111 cabe (4_995_000); el 112 queda fuera del techo derivado', async () => {
  expect((await put(MODEL_KEY, FLASH)).status).toBe(200);
  expect((await put(QUOTA_KEY, '111')).status).toBe(200);
  expect(await valueOf(QUOTA_KEY)).toBe('111');
  expect((await put(QUOTA_KEY, '112')).code).toBe('ERR-SCHEMA-VALIDATION-FAILED');
  // Con el tope en 111 el modelo caro ya no cabe: 111 x 75_000 supera 5_000_000.
  const blocked = await put(MODEL_KEY, FLASH31);
  expect([blocked.status, blocked.code]).toEqual([422, 'ERR-ADMIN-SCENE-COST-CAP-EXCEEDED']);
  expect(await valueOf(MODEL_KEY)).toBe(FLASH);
  expect((await put(QUOTA_KEY, '20')).status).toBe(200);
});

test('[REQ-CFG9-004][EDGE-009-046] D9-29: modelo fuera de lista y clave de región retirada: 422 ERR-SCHEMA-VALIDATION-FAILED sin escribir', async () => {
  for (const [key, bad] of [[MODEL_KEY, 'gemini-3-pro-image']] as const) {
    const before = await valueOf(key);
    const r = await put(key, bad);
    expect([key, bad, r.status, r.code]).toEqual([key, bad, 422, 'ERR-SCHEMA-VALIDATION-FAILED']);
    expect(await valueOf(key)).toBe(before);
  }
  // La clave de región ya no existe: el PUT se rechaza con 422 (clave desconocida) y no escribe nada.
  const gone = await adminContext.request.put(`/api/admin/parameters/${encodeURIComponent(LOCATION_KEY)}`, { headers: { ...CSRF, 'If-Match': '"etag-inexistente"', 'Content-Type': 'application/json' }, data: { value: 'us-central1' } });
  expect(gone.status()).toBe(422);
});

interface SceneBody { readonly status: string; readonly imageTag: string | null }
const CONSENT = async (): Promise<void> => {
  const notice = await apiCall<{ noticeVersion: string; providerId: string; scopes: string[] }>(userRequest, 'GET', '/scene-consent/notice');
  const r = await userRequest.post('/api/scene-consent', { headers: CSRF, data: { noticeVersion: notice.body.noticeVersion, providerId: notice.body.providerId, scopes: notice.body.scopes } });
  expect(r.status(), await r.text()).toBe(204);
};
async function generateAndSettle(): Promise<string> {
  let status = 0;
  for (let attempt = 0; attempt < 40 && status !== 202; attempt += 1) {
    const response = await userRequest.post('/api/me/scene/generate', { headers: { ...CSRF, 'Idempotency-Key': randomUUID() }, data: { action: 'REGENERATE' } });
    status = response.status();
    if (status !== 202) {
      expect([409, 429], await response.text()).toContain(status); // enfriamiento entre generaciones
      await new Promise((r) => setTimeout(r, 3_000));
    }
  }
  expect(status).toBe(202);
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const scene = (await apiCall<SceneBody>(userRequest, 'GET', '/me/scene')).body;
    if (scene.status !== 'generating' && scene.imageTag !== null) {
      // `imageTag` es solo una etiqueta de cache (distinta en cada generacion): la prueba compara los BYTES de la imagen, que en el generador simulado derivan del prompt.
      const image = await userRequest.get(`/api/me/scene/image?v=${encodeURIComponent(scene.imageTag)}`);
      expect(image.status()).toBe(200);
      return createHash('sha256').update(await image.body()).digest('hex');
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error('La escena no terminó de generarse');
}

test('[REQ-CFG9-005][SC-009-024] un bloque del prompt editado rige en la siguiente generacion tras la cache (<= 60 s) y vuelve al restaurarlo', async () => {
  test.setTimeout(300_000);
  await CONSENT();
  const original = await valueOf(BLOCKS_KEY);
  const imageBefore = await generateAndSettle();

  const blocks = JSON.parse(original) as Record<string, string>;
  const edited = JSON.stringify({ ...blocks, STYLE_BASE_TEXT: `${blocks['STYLE_BASE_TEXT']} Extra editado por el administrador.` });
  expect((await put(BLOCKS_KEY, edited)).status).toBe(200);
  const bad = await put(BLOCKS_KEY, JSON.stringify({ ...blocks, STYLE_BASE_TEXT: 'Hola {petName}' }));
  expect([bad.status, bad.code]).toEqual([422, 'ERR-SCHEMA-VALIDATION-FAILED']);
  expect(await valueOf(BLOCKS_KEY)).toBe(edited);

  // La imagen del generador simulado depende del prompt. Dentro de la cache (<= 60 s) rige aun el prompt anterior; pasada la cache, la etiqueta cambia.
  await adminPage.waitForTimeout(PROPAGATION_MS - 10_000);
  const imageEdited = await generateAndSettle();
  expect(imageEdited).not.toBe(imageBefore);

  // Restaurar el bloque original: tras la cache vuelve el prompt de codigo (misma entrada = mismos bytes que la primera).
  expect((await put(BLOCKS_KEY, original)).status).toBe(200);
  await adminPage.waitForTimeout(PROPAGATION_MS - 10_000);
  const imageRestored = await generateAndSettle();
  expect(imageRestored).not.toBe(imageEdited);
  expect(imageRestored).toBe(imageBefore); // mismo prompt de codigo y misma entrada = mismos bytes que la primera
});
