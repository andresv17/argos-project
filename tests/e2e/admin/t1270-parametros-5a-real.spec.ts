import { randomUUID } from 'node:crypto';
import { expect, test, type APIRequestContext, type BrowserContext, type Page } from '@playwright/test';
import { openSqliteDatabase } from '../../../src/infrastructure/persistence/sqlite/sqlite-database.ts';
import { apiCall, apiPost, createPetViaApi, registerViaApi } from '../visual/e2e-support.ts';
import { ADMIN_EMAIL, ADMIN_SIM_WEB_URL, startAdminGoogleSim, type AdminGoogleSim } from './admin-google-sim-support.ts';

/**
 * T1270 (Feature 009, `[GH:#20]`, subfase 5a): E2E de extremo a extremo del editor de parámetros con la API REAL (el servidor de producción compuesto en `createProductionApp`, con base
 * SQLite nueva, el portal `/admin` real y la SPA de usuarios real). Lo ÚNICO simulado es Google del administrador (ninguna red ni credencial; el mismo arnés que T1237/T1251). Las
 * cuentas de usuario se SIEMBRAN `ACTIVE` por repositorio (`registerViaApi`) para no gastar el límite de 5 altas por IP efectiva de la instancia (EDGE-009-040); la vinculación de la
 * cuenta administradora con el `sub` de Google del administrador se siembra por SQL (`auth_identities`, como lo haría el flujo 008 de vincular). El generador de escenas es el simulado
 * del servidor de pruebas (sin Vertex). Todo lo demás —portal, parámetros, caché de <= 60 s, subidas de fotos, solicitud de escena, cuota y reinicio— es real.
 *
 * Recorridos: (1) tope de fotos 10 -> 12 verificado en la aplicación de usuarios (undécima y duodécima aceptadas, decimotercera rechazada, y la interfaz muestra «de 12»); (2) valores
 * inválidos sin escritura; (3) bajar el tope conserva las fotos y bloquea solo subidas nuevas, con aviso previo; (4) edición concurrente = 412; (5) deshabilitar/habilitar escenas;
 * (6) reinicio de cuota que solo toca cuentas administradoras.
 *
 * @implements REQ-CFG9-001, REQ-CFG9-002, REQ-CFG9-003, REQ-CFG9-006; SC-009-017..021, SC-009-026
 */

const ADMIN_SUB = 'google-sub-admin-t1270';
const PASSWORD = 'Clave-Segura-2026!';
const CSRF = { 'X-Argos-Request': '1' } as const;
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(56)]);
const ALBUM_KEY = 'album.max_photos_per_pet';
const SCENE_KEY = 'scene.enabled';
/** Margen sobre la caché de 60 s (REQ-PRM-002) para que un valor guardado llegue a la aplicación de usuarios. */
const PROPAGATION_MS = 75_000;

test.use({ baseURL: ADMIN_SIM_WEB_URL });
test.describe.configure({ mode: 'serial', timeout: 240_000 }); // la propagación de un parámetro tarda hasta 60 s (caché por instancia)

let sim: AdminGoogleSim;
let adminContext: BrowserContext;
let adminPage: Page;

interface Person {
  readonly context: BrowserContext;
  readonly page: Page;
  readonly request: APIRequestContext;
  readonly petId: string;
}
const people: Record<'photos' | 'adminAccount' | 'foreign' | 'shared', Person | undefined> = { photos: undefined, adminAccount: undefined, foreign: undefined, shared: undefined };
const person = (name: keyof typeof people): Person => people[name]!;

async function newPerson(browser: import('@playwright/test').Browser, username: string): Promise<Person> {
  const context = await browser.newContext({ baseURL: ADMIN_SIM_WEB_URL, acceptDownloads: true });
  await registerViaApi(context.request, username, 'Persona E2E', PASSWORD, sim.databasePath);
  const petId = await createPetViaApi(context.request, 'Luna', 'CANINE');
  return { context, page: await context.newPage(), request: context.request, petId };
}

/** Vincula la cuenta con el `sub` de Google del administrador (REQ-CFG9-006: «la suya, vinculada»): la misma fila que escribe el flujo de vincular de 008. */
function linkToAdminGoogle(username: string): void {
  const db = openSqliteDatabase(sim.databasePath);
  try {
    const user = db.prepare<[string], { id: string }>('SELECT id FROM users WHERE username = ?').get(username)!;
    db.prepare('INSERT INTO auth_identities (provider, provider_subject, user_id, created_at) VALUES (?, ?, ?, ?)').run('GOOGLE', ADMIN_SUB, user.id, new Date().toISOString());
  } finally {
    db.close();
  }
}

test.beforeAll(async ({ browser }) => {
  test.setTimeout(180_000);
  sim = await startAdminGoogleSim();
  const tag = randomUUID().slice(0, 6);
  people.photos = await newPerson(browser, `t1270.fotos.${tag}`);
  people.adminAccount = await newPerson(browser, `t1270.admin.${tag}`);
  people.foreign = await newPerson(browser, `t1270.ajena.${tag}`);
  people.shared = await newPerson(browser, `t1270.hogar.${tag}`);
  linkToAdminGoogle(`t1270.admin.${tag}`);

  adminContext = await browser.newContext({ baseURL: ADMIN_SIM_WEB_URL });
  adminPage = await adminContext.newPage();
  sim.next = { kind: 'login', sub: ADMIN_SUB, email: ADMIN_EMAIL };
  await adminPage.goto('/admin');
  await adminPage.getByRole('link', { name: 'Entrar con Google' }).click();
  await expect(adminPage.getByRole('heading', { level: 1, name: 'Administración' })).toBeVisible({ timeout: 15_000 });
});
test.afterAll(async () => {
  for (const p of Object.values(people)) await p?.context.close();
  await adminContext?.close();
  await sim?.stop();
});

// ---------------------------------------------------------------------------------------------------------------------------------------------------------------- admin (UI real)

async function openPanel(): Promise<void> {
  await adminPage.goto('/admin');
  await expect(adminPage.getByRole('heading', { level: 2, name: 'Parámetros de la plataforma' })).toBeVisible();
  await expect(adminPage.getByLabel('Máximo de fotos por mascota')).toBeVisible();
}
async function saveCap(value: string): Promise<void> {
  await adminPage.getByLabel('Máximo de fotos por mascota').fill(value);
  await adminPage.getByRole('button', { name: 'Guardar tope de fotos' }).click();
  await expect(adminPage.getByRole('status').filter({ hasText: 'Tope de fotos guardado.' })).toHaveCount(1);
  await expect(adminPage.getByTestId(`param-${ALBUM_KEY}`)).toContainText(`Valor vigente: ${value}`);
}
/** Lee el valor y el etag VIGENTES de un parámetro por la API real del portal (con la cookie del administrador). */
async function adminParam(key: string): Promise<{ value: string; etag: string }> {
  const list = await adminContext.request.get('/api/admin/parameters');
  expect(list.status()).toBe(200);
  const item = ((await list.json()) as { items: Array<{ key: string; value: string; etag: string }> }).items.find((p) => p.key === key)!;
  return { value: item.value, etag: item.etag };
}

// ---------------------------------------------------------------------------------------------------------------------------------------------------------- usuarios (API y SPA reales)

async function upload(p: Person, name: string): Promise<number> {
  const response = await p.request.post(`/api/pets/${p.petId}/media?kind=PHOTO`, { headers: { ...CSRF, 'Content-Type': 'application/octet-stream', 'X-Argos-Filename': encodeURIComponent(name) }, data: PNG });
  return response.status();
}
const limits = async (p: Person) => (await apiCall<{ photoCount: number; maxPhotosPerPet: number }>(p.request, 'GET', `/pets/${p.petId}/album/limits`)).body;
/** Espera (sondeo) a que la aplicación de usuarios vea el tope indicado: la caché de parámetros es de <= 60 s por instancia. */
async function waitForCap(p: Person, cap: number): Promise<void> {
  await expect.poll(async () => (await limits(p)).maxPhotosPerPet, { timeout: PROPAGATION_MS, intervals: [1_000] }).toBe(cap);
}

interface SceneBody {
  readonly status: string;
  readonly imageTag: string | null;
  readonly disabled?: boolean;
  readonly quota: { readonly remaining: number };
}
const ownerScene = async (p: Person) => (await apiCall<SceneBody>(p.request, 'GET', '/me/scene')).body;

async function consent(request: APIRequestContext): Promise<void> {
  const notice = await apiCall<{ noticeVersion: string; providerId: string; scopes: string[] }>(request, 'GET', '/scene-consent/notice');
  const response = await request.post('/api/scene-consent', { headers: CSRF, data: { noticeVersion: notice.body.noticeVersion, providerId: notice.body.providerId, scopes: notice.body.scopes } });
  expect(response.status(), await response.text()).toBe(204);
}
async function generateWithKey(request: APIRequestContext, base: string): Promise<{ status: number; code: string | null; body: SceneBody }> {
  const response = await request.post(`/api${base}/scene/generate`, { headers: { ...CSRF, 'Idempotency-Key': randomUUID() }, data: { action: 'REGENERATE' } });
  const text = await response.text();
  const body = (text === '' ? null : JSON.parse(text)) as SceneBody & { code?: string };
  return { status: response.status(), code: body?.code ?? null, body };
}
async function settled(request: APIRequestContext, base: string): Promise<SceneBody> {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const scene = (await apiCall<SceneBody>(request, 'GET', `${base}/scene`)).body;
    if (scene.status !== 'generating' && scene.imageTag !== null) return scene;
    await new Promise((resolveWait) => setTimeout(resolveWait, 250));
  }
  throw new Error('La escena no terminó de generarse');
}
/** Consiente y genera la primera imagen (consume una generación). `base` = `/me` o `/households/<id>`. */
async function firstImage(request: APIRequestContext, base: string): Promise<SceneBody> {
  await consent(request);
  const result = await generateWithKey(request, base);
  expect(result.status, JSON.stringify(result.body)).toBe(202);
  return settled(request, base);
}

// ===================================================================================================================================================================== 1 · tope de fotos

test('[REQ-CFG9-001][REQ-CFG9-002][SC-009-017] el administrador sube el tope de 10 a 12 y la aplicación de usuarios acepta la undécima y la duodécima foto y rechaza la decimotercera', async () => {
  const p = person('photos');
  for (let n = 1; n <= 10; n += 1) expect(await upload(p, `f${n}.png`), `foto ${n}`).toBe(201);
  expect(await limits(p)).toEqual({ photoCount: 10, maxPhotosPerPet: 10 });
  expect(await upload(p, 'once-antes.png')).toBe(409); // con el tope en 10 la undécima se rechaza

  await openPanel();
  const card = adminPage.getByTestId(`param-${ALBUM_KEY}`);
  await expect(card).toContainText('Valor vigente: 10');
  await expect(adminPage.getByText('Puede tardar hasta 1 minuto en aplicarse').first()).toBeVisible();
  await saveCap('12');
  await expect(card).toContainText('Editado por: Tú');
  expect((await adminParam(ALBUM_KEY)).value).toBe('12');

  await waitForCap(p, 12); // propagación <= 60 s, sin reiniciar nada
  expect(await upload(p, 'once.png')).toBe(201);
  expect(await upload(p, 'doce.png')).toBe(201);
  expect(await upload(p, 'trece.png')).toBe(409);
  expect(await limits(p)).toEqual({ photoCount: 12, maxPhotosPerPet: 12 });

  await p.page.goto(`/mascotas/${p.petId}/album`);
  await expect(p.page.locator('#album-count')).toHaveText('12 de 12 fotos');
  await expect(p.page.getByText('Álbum lleno', { exact: true })).toBeVisible();
  await expect(p.page.locator('#album-file')).toHaveCount(0);
});

// ===================================================================================================================================================================== 2 · rango

test('[EDGE-009-014][SC-009-018] 0, -1, abc, " 12 ", 12.5 y 51 se rechazan con ERR-SCHEMA-VALIDATION-FAILED y no escriben (UI y API)', async () => {
  const before = await adminParam(ALBUM_KEY);
  expect(before.value).toBe('12');
  await openPanel();
  const input = adminPage.getByLabel('Máximo de fotos por mascota');
  for (const bad of ['0', '-1', 'abc', '12.5', '51']) {
    await input.fill(bad);
    await adminPage.getByRole('button', { name: 'Guardar tope de fotos' }).click();
    await expect(adminPage.getByRole('alert'), bad).toContainText('1 y 50');
    expect((await adminParam(ALBUM_KEY)).value, `sin escritura con ${bad}`).toBe('12');
  }
  // La API real, sin pasar por la validación de la interfaz (incluido el valor con espacios): 422 y valor intacto.
  for (const bad of ['0', '-1', 'abc', ' 12 ', '12.5', '51']) {
    const { etag } = await adminParam(ALBUM_KEY);
    const response = await adminContext.request.put(`/api/admin/parameters/${ALBUM_KEY}`, { headers: { ...CSRF, 'If-Match': etag, 'Content-Type': 'application/json' }, data: { value: bad } });
    expect(response.status(), `PUT ${JSON.stringify(bad)}`).toBe(422);
    expect(((await response.json()) as { code: string }).code).toBe('ERR-SCHEMA-VALIDATION-FAILED');
    expect((await adminParam(ALBUM_KEY)).value).toBe('12');
  }
});

// ===================================================================================================================================================================== 3 · bajar el tope

test('[EDGE-009-015][SC-009-019] la interfaz avisa antes de guardar; bajar el tope bajo el conteo conserva las 12 fotos y bloquea solo las subidas nuevas', async () => {
  const p = person('photos');
  await openPanel();
  await expect(adminPage.getByTestId(`param-${ALBUM_KEY}`)).toContainText('las fotos ya subidas se conservan'); // aviso visible ANTES de guardar
  await saveCap('11');
  await waitForCap(p, 11);
  expect(await limits(p)).toEqual({ photoCount: 12, maxPhotosPerPet: 11 }); // las 12 se conservan
  expect(await upload(p, 'nueva.png')).toBe(409); // solo se bloquea lo nuevo
  const list = await apiCall<unknown[]>(p.request, 'GET', `/pets/${p.petId}/media?kind=PHOTO`);
  if (list.status === 200 && Array.isArray(list.body)) expect(list.body.length).toBe(12);
  await p.page.goto(`/mascotas/${p.petId}/album`);
  await expect(p.page.locator('#album-count')).toContainText('12 de 11'); // el conteo real se sigue mostrando junto al tope vigente
  await saveCap('12'); // se deja en 12 para el resto
});

// ===================================================================================================================================================================== 4 · concurrencia

test('[EDGE-009-016][SC-009-020] edición concurrente: el segundo guardado recibe 412 y la interfaz muestra el valor vigente', async () => {
  await openPanel();
  await expect(adminPage.getByLabel('Máximo de fotos por mascota')).toHaveValue('12'); // etag cargado en esta pantalla
  const { etag } = await adminParam(ALBUM_KEY);
  const other = await adminContext.request.put(`/api/admin/parameters/${ALBUM_KEY}`, { headers: { ...CSRF, 'If-Match': etag, 'Content-Type': 'application/json' }, data: { value: '20' } }); // «otra pestaña»
  expect(other.status()).toBe(200);

  await adminPage.getByLabel('Máximo de fotos por mascota').fill('13');
  await adminPage.getByRole('button', { name: 'Guardar tope de fotos' }).click();
  await expect(adminPage.getByRole('alert')).toContainText('Otra persona cambió este valor');
  await expect(adminPage.getByLabel('Máximo de fotos por mascota')).toHaveValue('20');
  expect((await adminParam(ALBUM_KEY)).value).toBe('20'); // el segundo guardado no escribió
  // PUT sin If-Match: 422 por contrato (If-Match ausente = validación de esquema): nunca hay escritura a ciegas.
  const noPrecondition = await adminContext.request.put(`/api/admin/parameters/${ALBUM_KEY}`, { headers: { ...CSRF, 'Content-Type': 'application/json' }, data: { value: '13' } });
  expect(noPrecondition.status()).toBe(422);
  expect((await adminParam(ALBUM_KEY)).value).toBe('20');
  await saveCap('12'); // devuelve el tope a 12 con el etag vigente
});

// ===================================================================================================================================================================== 5 · escenas

test('[REQ-CFG9-003][SC-009-021] deshabilitar escenas: caja gris, imagen vigente visible, solicitud 409 ERR-SCENE-DISABLED sin consumir cuota; habilitar reanuda', async () => {
  test.setTimeout(240_000);
  const b = person('foreign');
  const image = await firstImage(b.request, '/me');
  const remainingBefore = image.quota.remaining;
  const imageTag = image.imageTag;
  expect(typeof imageTag).toBe('string');

  // Con la función habilitada la interfaz de usuarios NO muestra la caja gris.
  await b.page.goto('/households');
  await expect(b.page.getByText('Función deshabilitada')).toHaveCount(0);

  await openPanel();
  const card = adminPage.getByTestId(`param-${SCENE_KEY}`);
  await card.getByRole('button', { name: 'Deshabilitar escenas' }).click();
  await adminPage.getByRole('button', { name: 'Confirmar deshabilitar' }).click();
  await expect(card.getByText('Escenas deshabilitadas', { exact: true })).toHaveCount(1);
  expect((await adminParam(SCENE_KEY)).value).toBe('false');

  // Propagación <= 60 s: la vista de la escena marca `disabled`.
  await expect.poll(async () => (await ownerScene(b)).disabled === true, { timeout: PROPAGATION_MS, intervals: [1_000] }).toBe(true);
  const view = await ownerScene(b);
  expect(view.imageTag, 'la imagen ya generada sigue vigente').toBe(imageTag);
  expect(view.quota.remaining).toBe(remainingBefore);

  // La solicitud se rechaza sin iniciar intento ni consumir cuota.
  const rejected = await generateWithKey(b.request, '/me');
  expect(rejected.status).toBe(409);
  expect(rejected.code).toBe('ERR-SCENE-DISABLED');
  expect((await ownerScene(b)).quota.remaining).toBe(remainingBefore);
  expect((await ownerScene(b)).status).not.toBe('generating');

  // Interfaz de usuarios: caja gris, imagen visible y botón deshabilitado.
  await b.page.goto('/households');
  const block = b.page.getByRole('region', { name: 'Escena del hogar' });
  await expect(block.getByText('Función deshabilitada')).toBeVisible();
  await expect(block.getByRole('img').first()).toBeVisible();
  for (const button of await block.getByRole('button', { name: /imagen del hogar|Reintentar/ }).all()) await expect(button).toBeDisabled();

  // Habilitar reanuda (con un cambio pendiente para que haya algo que generar).
  await openPanel();
  await card.getByRole('button', { name: 'Habilitar escenas' }).click();
  await adminPage.getByRole('button', { name: 'Confirmar habilitar' }).click();
  await expect(card.getByText('Escenas habilitadas', { exact: true })).toHaveCount(1);
  expect((await adminParam(SCENE_KEY)).value).toBe('true');
  await expect.poll(async () => (await ownerScene(b)).disabled !== true, { timeout: PROPAGATION_MS, intervals: [1_000] }).toBe(true);
  await createPetViaApi(b.request, 'Nube', 'FELINE');
  await b.page.goto('/households');
  await expect(b.page.getByText('Función deshabilitada')).toHaveCount(0);
  let resumed = await generateWithKey(b.request, '/me');
  for (let attempt = 0; attempt < 40 && resumed.status !== 202; attempt += 1) {
    expect(resumed.code, JSON.stringify(resumed.body)).not.toBe('ERR-SCENE-DISABLED');
    await new Promise((resolveWait) => setTimeout(resolveWait, 1_000)); // enfriamiento entre generaciones (REQ-ESC6)
    resumed = await generateWithKey(b.request, '/me');
  }
  expect(resumed.status, JSON.stringify(resumed.body)).toBe(202);
  await settled(b.request, '/me');
  expect((await ownerScene(b)).quota.remaining).toBe(remainingBefore - 1);
});

// ===================================================================================================================================================================== 6 · reinicio de cuota

test('[REQ-CFG9-006][SC-009-026] el reinicio deja a cero la cuota de la cuenta administradora y no toca cuentas ajenas ni escenas de hogares compartidos', async () => {
  test.setTimeout(240_000);
  const a = person('adminAccount');
  const b = person('foreign');
  const c = person('shared');

  const imageA = await firstImage(a.request, '/me'); // consume 1 en la cuenta administradora
  const household = await apiPost<{ household: { id: string } }>(c.request, '/households', { name: 'Casa Compartida' });
  const base = `/households/${household.household.id}`;
  expect((await apiCall(c.request, 'PUT', `/pets/${c.petId}/assignments/${household.household.id}`)).status).toBe(200);
  const imageC = await firstImage(c.request, base); // escena de hogar: owner_user_id NULL
  const maxRemaining = imageA.quota.remaining + 1;
  expect(imageA.quota.remaining).toBeLessThan(maxRemaining);
  await firstImage(b.request, '/me'); // precondición propia: la cuenta ajena consume 1 (no depende del orden de pruebas)
  const remainingB = (await ownerScene(b)).quota.remaining; // cuenta ajena con cuota consumida
  expect(remainingB).toBeLessThan(maxRemaining);
  const remainingC = imageC.quota.remaining;

  await openPanel();
  await adminPage.getByRole('button', { name: 'Reiniciar cuota de escenas' }).click();
  const group = adminPage.getByRole('group', { name: '¿Reiniciar la cuota de escenas?' });
  await expect(group).toBeFocused();
  await group.getByRole('button', { name: 'Cancelar' }).click();
  expect((await ownerScene(a)).quota.remaining, 'cancelar no reinicia').toBe(imageA.quota.remaining);
  await adminPage.getByRole('button', { name: 'Reiniciar cuota de escenas' }).click();
  await adminPage.getByRole('button', { name: 'Confirmar reinicio' }).click();
  await expect(adminPage.getByRole('status').filter({ hasText: 'Cuota de escenas reiniciada.' })).toHaveCount(1);

  expect((await ownerScene(a)).quota.remaining, 'la cuenta administradora vuelve a su cuota completa').toBe(maxRemaining);
  expect((await ownerScene(b)).quota.remaining, 'cuenta ajena intacta').toBe(remainingB);
  expect((await apiCall<SceneBody>(c.request, 'GET', `${base}/scene`)).body.quota.remaining, 'escena de hogar compartido intacta').toBe(remainingC);

  // Idempotente: un segundo reinicio no falla (EDGE-009-022) y no cambia a nadie.
  await adminPage.getByRole('button', { name: 'Reiniciar cuota de escenas' }).click();
  await adminPage.getByRole('button', { name: 'Confirmar reinicio' }).click();
  await expect(adminPage.getByRole('status').filter({ hasText: /Cuota de escenas reiniciada\.|No había cuentas/ })).toHaveCount(1);
  expect((await ownerScene(b)).quota.remaining).toBe(remainingB);
});
