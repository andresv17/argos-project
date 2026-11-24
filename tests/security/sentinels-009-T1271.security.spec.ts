import { afterEach, describe, expect, it } from 'vitest';
import { ADMIN_SESSION_ABSOLUTE_MINUTES } from '../../src/domain/auth/admin-session-policy.ts';
import { PROMPT_BLOCK_MAX_LENGTH } from '../../src/domain/platform/admin-parameter-catalog.ts';
import { DEFAULT_PROMPT_BLOCKS, validatePromptBlocks } from '../../src/domain/scene/prompt-blocks.ts';
import { RunSceneGenerationUseCase } from '../../src/application/use-cases/scene-run-use-case.ts';
import { ADMIN_EMAIL, ADMIN_SESSION_COOKIE, OWN_ORIGIN, adminKit, adminLogin, type AdminKit } from '../fixtures/admin-fixtures.ts';
import { HOUSEHOLD, canonicalState } from '../fixtures/application-harness.ts';
import { ControlledStorage, DEFAULT_LIMITS } from '../fixtures/media-harness.ts';
import { parameterKit, type ParameterKit } from '../fixtures/parameters-fixtures.ts';
import { sceneFixture, type SceneFixture } from '../fixtures/scene-services-fixtures.ts';
import { createApi, type Api, type ApiResponse } from '../integration/api/api-harness.ts';

/**
 * T1271 (Feature 009, Fase 5b, #20): enjambre de 9 vectores de /sentinels sobre `PUT/GET /api/admin/parameters(/:key)`, `POST /api/admin/parameters/scene-quota/reset` y
 * `POST /api/households/:id/scene/generate` con `scene.enabled = false`. Un fallo es un HALLAZGO del producto: esta suite NO corrige nada.
 * Las expectativas son invariantes de seguridad (404 uniforme por forma, sin escritura tras rechazo, sin 5xx, sin reflejo) y los valores fijados por la especificación 009 (412, 422, 409, topes 111 y 1000).
 * Las expectativas marcadas OBSERVACION documentan el comportamiento real en disco cuando la especificación no fija el código o el residuo ya está anotado por Trinity.
 * @implements REQ-CFG9-001, REQ-CFG9-002, REQ-CFG9-003, REQ-CFG9-004, REQ-CFG9-005, REQ-CFG9-006, INV-CFG9-001, INV-CFG9-002, INV-CFG9-003, NFR-009-003, NFR-009-004, SC-009-022, SC-009-025
 */

const NOW = '2026-11-23T12:00:00.000Z';
const H = HOUSEHOLD.id;
const ENABLED = 'scene.enabled';
const QUOTA = 'scene.global_quota_max';
const MODEL = 'scene.provider_model';
const LOC = 'scene.provider_location';
const BLOCKS = 'scene.prompt.blocks';
const ALBUM = 'album.max_photos_per_pet';
const KEY = (n: number): string => `b0000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
/** Forma del 404 uniforme del producto (Fastify por defecto): el mensaje repite el método y la ruta pedida, sin datos de la API admin. */
const UNIFORM_404 = /^\{"message":"Route [A-Z]+:[^"]* not found","error":"Not Found","statusCode":404\}$/;

interface View {
  readonly key: string;
  readonly value: string;
  readonly etag: string;
}
interface Boot {
  readonly a: Api;
  readonly kit: AdminKit;
  readonly params: ParameterKit;
  readonly fixture: SceneFixture;
  readonly cookie: string;
  readonly userCookie: string;
}

let api: Api | null = null;
afterEach(async () => {
  await api?.close();
  api = null;
});

async function boot(): Promise<Boot> {
  const kit = adminKit([ADMIN_EMAIL]);
  const params = parameterKit();
  const fixture = sceneFixture({});
  const a = await createApi(canonicalState(), {
    admin: kit.admin,
    scene: fixture.services,
    media: { storage: new ControlledStorage(() => new Date(NOW)), limits: DEFAULT_LIMITS },
    platformParameters: params.port,
  });
  api = a;
  params.bind(a);
  a.clock.setClock(NOW.slice(0, 10), NOW);
  const { cookie } = await adminLogin(a);
  const userCookie = await a.login('andres');
  return { a, kit, params, fixture, cookie: cookie!, userCookie };
}

const listAll = (b: Boot, cookie: string | null = b.cookie): Promise<ApiResponse> => b.a.call('GET', '/api/admin/parameters', { cookie, contract: false });
const viewOf = async (b: Boot, key: string): Promise<View> => ((await listAll(b)).json as { items: View[] }).items.find((i) => i.key === key)!;
/** Instantánea completa de `platform_parameters` (las filas vienen sembradas por la migración de 009). */
const snapshot = (a: Api): string => JSON.stringify(a.db.prepare('SELECT key, value, updated_at AS updatedAt, updated_by_user_id AS by FROM platform_parameters ORDER BY key').all());
const rowValue = (a: Api, key: string): string | undefined => (a.db.prepare('SELECT value FROM platform_parameters WHERE key = ?').get(key) as { value: string } | undefined)?.value;
const auditCount = (a: Api): number => (a.db.prepare('SELECT COUNT(*) AS n FROM admin_audit_entries').get() as { n: number }).n;
const notFound = (r: ApiResponse): boolean => r.status === 404 && UNIFORM_404.test(r.text) && !r.text.includes('"items"') && !r.text.includes('adminId');

interface Opt {
  readonly cookie?: string | null;
  readonly csrf?: boolean;
  readonly headers?: Record<string, string>;
}
const putRaw = (b: Boot, key: string, raw: string, o: Opt = {}): Promise<ApiResponse> =>
  b.a.call('PUT', `/api/admin/parameters/${encodeURIComponent(key)}`, {
    cookie: o.cookie === undefined ? b.cookie : o.cookie,
    csrf: o.csrf ?? true,
    contract: false,
    raw,
    headers: o.headers ?? {},
  });
const putValue = (b: Boot, key: string, value: unknown, ifMatch: string | null, o: Opt = {}): Promise<ApiResponse> =>
  putRaw(b, key, JSON.stringify({ value }), { ...o, headers: { ...(o.headers ?? {}), ...(ifMatch === null ? {} : { 'if-match': ifMatch }) } });
const putFresh = async (b: Boot, key: string, value: unknown): Promise<ApiResponse> => putValue(b, key, value, (await viewOf(b, key)).etag);
const withBlock = (name: keyof typeof DEFAULT_PROMPT_BLOCKS, text: string): string => JSON.stringify({ ...DEFAULT_PROMPT_BLOCKS, [name]: text });
const DUMMY_ETAG = '"abcdefgh01234567"';

// --- Vector I: IDOR / recursos ajenos -----------------------------------------------------------
describe('Sentinel I - IDOR: claves fuera de catálogo y recursos de otro rol', () => {
  it('[I-1] GET /api/admin/parameters/:key no existe: 404 uniforme con y sin sesión', async () => {
    const b = await boot();
    for (const key of [ENABLED, BLOCKS, ALBUM]) {
      expect(notFound(await b.a.call('GET', `/api/admin/parameters/${encodeURIComponent(key)}`, { cookie: b.cookie, contract: false }))).toBe(true);
      expect(notFound(await b.a.call('GET', `/api/admin/parameters/${encodeURIComponent(key)}`, { cookie: null, contract: false }))).toBe(true);
    }
  });

  it('[I-2] PUT con clave fuera de catálogo o variante de caja/ruta: 422 o 404 y ninguna fila modificada', async () => {
    const b = await boot();
    const before = snapshot(b.a);
    const keys = ['__proto__', 'constructor', 'SCENE.ENABLED', 'scene.enabled/../x', 'scene.enabled%2F..', 'scene.enabled ', 'album.max_photos_per_pet;x', 'scene.secret'];
    for (const key of keys) {
      const r = await putValue(b, key, 'true', DUMMY_ETAG);
      expect([404, 422], `clave ${key}`).toContain(r.status);
    }
    expect(snapshot(b.a)).toBe(before);
  });

  it('[I-3] sesión de usuario final (no administrador) sobre las rutas admin: 404 uniforme y sin escritura', async () => {
    const b = await boot();
    const before = snapshot(b.a);
    const get = await b.a.call('GET', '/api/admin/parameters', { cookie: b.userCookie, contract: false });
    const put = await putValue(b, ENABLED, 'false', DUMMY_ETAG, { cookie: b.userCookie });
    const reset = await b.a.call('POST', '/api/admin/parameters/scene-quota/reset', { cookie: b.userCookie, csrf: true, contract: false });
    expect(notFound(get)).toBe(true);
    expect(notFound(put)).toBe(true);
    expect(notFound(reset)).toBe(true);
    expect(snapshot(b.a)).toBe(before);
  });
});

// --- Vector II: multi-tenant y estados inválidos -------------------------------------------------
describe('Sentinel II - multi-tenant y estados inválidos', () => {
  it('[II-1] el reinicio de cuota del administrador NO toca los contadores de un hogar de otro usuario', async () => {
    const b = await boot();
    const gen = await b.a.call('POST', `/api/households/${H}/scene/generate`, { cookie: b.userCookie, body: { action: 'REGENERATE' }, headers: { 'idempotency-key': KEY(1) }, contract: false });
    expect(gen.status).toBe(202);
    await new RunSceneGenerationUseCase(b.a.deps).execute(b.fixture.dispatcher.jobs[b.fixture.dispatcher.jobs.length - 1]!, new AbortController().signal);
    const consumed = (): number => (b.a.db.prepare('SELECT COALESCE(SUM(consumed_generations), 0) AS n FROM home_scenes').get() as { n: number }).n;
    const before = consumed();
    expect(before).toBeGreaterThan(0);
    const reset = await b.a.call('POST', '/api/admin/parameters/scene-quota/reset', { cookie: b.cookie, csrf: true, contract: false });
    expect(reset.status).toBe(200);
    expect(consumed()).toBe(before);
  });

  it('[II-2] sesión de administrador cerrada (DELETE con origen propio) y reutilizada: PUT y reinicio 404 uniforme, sin escritura', async () => {
    const b = await boot();
    const etag = (await viewOf(b, ENABLED)).etag;
    const out = await b.a.call('DELETE', '/api/admin/session', { cookie: b.cookie, csrf: true, contract: false, headers: { origin: OWN_ORIGIN } });
    expect([200, 204]).toContain(out.status);
    const before = snapshot(b.a);
    const audit = auditCount(b.a);
    const put = await putValue(b, ENABLED, 'false', etag);
    const reset = await b.a.call('POST', '/api/admin/parameters/scene-quota/reset', { cookie: b.cookie, csrf: true, contract: false });
    expect(notFound(put)).toBe(true);
    expect(notFound(reset)).toBe(true);
    expect(snapshot(b.a)).toBe(before);
    expect(auditCount(b.a)).toBe(audit);
  });
});

// --- Vector III: acceso anónimo -------------------------------------------------------------------
describe('Sentinel III - acceso anónimo a rutas protegidas', () => {
  it('[III-1] GET, PUT y reinicio sin cookie (con cabecera CSRF): 404 uniforme y ninguna escritura', async () => {
    const b = await boot();
    const before = snapshot(b.a);
    const get = await b.a.call('GET', '/api/admin/parameters', { cookie: null, contract: false });
    const put = await putValue(b, ENABLED, 'false', DUMMY_ETAG, { cookie: null });
    const reset = await b.a.call('POST', '/api/admin/parameters/scene-quota/reset', { cookie: null, csrf: true, contract: false });
    expect(notFound(get)).toBe(true);
    expect(notFound(put)).toBe(true);
    expect(notFound(reset)).toBe(true);
    expect(snapshot(b.a)).toBe(before);
  });
});

// --- Vector IV: sesión expirada, revocada o alterada -------------------------------------------------
describe('Sentinel IV - sesiones expiradas, revocadas o alteradas', () => {
  it('[IV-1] cookie con un carácter alterado: 404 uniforme y sin escritura', async () => {
    const b = await boot();
    const before = snapshot(b.a);
    const token = b.cookie.split('=')[1]!;
    const altered = `${ADMIN_SESSION_COOKIE}=${token.slice(0, -1)}${token.endsWith('A') ? 'B' : 'A'}`;
    const put = await putValue(b, ENABLED, 'false', DUMMY_ETAG, { cookie: altered });
    const get = await b.a.call('GET', '/api/admin/parameters', { cookie: altered, contract: false });
    expect(notFound(put)).toBe(true);
    expect(notFound(get)).toBe(true);
    expect(snapshot(b.a)).toBe(before);
  });

  it(`[IV-2] sesión más allá del máximo absoluto (${ADMIN_SESSION_ABSOLUTE_MINUTES} min + 1): 404 uniforme, sin escritura`, async () => {
    const b = await boot();
    const etag = (await viewOf(b, ALBUM)).etag;
    const before = snapshot(b.a);
    const later = new Date(Date.parse(NOW) + (ADMIN_SESSION_ABSOLUTE_MINUTES + 1) * 60_000).toISOString();
    b.a.clock.setClock(later.slice(0, 10), later);
    const put = await putValue(b, ALBUM, '20', etag);
    expect(notFound(put)).toBe(true);
    expect(snapshot(b.a)).toBe(before);
  });
});

// --- Vector V: CSRF ----------------------------------------------------------------------------------
describe('Sentinel V - CSRF', () => {
  it('[V-1] PUT sin X-Argos-Request con sesión válida: 403 y sin escritura', async () => {
    const b = await boot();
    const etag = (await viewOf(b, ENABLED)).etag;
    const before = snapshot(b.a);
    const forged = await putValue(b, ENABLED, 'false', etag, { csrf: false });
    expect(forged.status).toBe(403);
    expect(snapshot(b.a)).toBe(before);
  });

  it('[V-2] reinicio de cuota sin X-Argos-Request: 403 y sin auditoría', async () => {
    const b = await boot();
    const audit = auditCount(b.a);
    const r = await b.a.call('POST', '/api/admin/parameters/scene-quota/reset', { cookie: b.cookie, csrf: false, contract: false });
    expect(r.status).toBe(403);
    expect(auditCount(b.a)).toBe(audit);
  });

  it('[V-3] SEN-T1271-01: PUT con Origin ajeno (y cabecera propia): 403 ERR-AUTH-CSRF-REJECTED sin escribir ni auditar', async () => {
    const b = await boot();
    const etag = (await viewOf(b, ENABLED)).etag;
    const before = snapshot(b.a);
    const audit = auditCount(b.a);
    for (const origin of ['https://evil.example', 'null', 'http://localhost:9999', 'https://localhost']) {
      const r = await putValue(b, ENABLED, 'false', etag, { headers: { origin } });
      expect([origin, r.status]).toEqual([origin, 403]);
    }
    expect(snapshot(b.a)).toBe(before);
    expect(auditCount(b.a)).toBe(audit);
  });

  it('[V-4] SEN-T1271-01: reinicio de cuota con Origin ajeno: 403 sin auditar', async () => {
    const b = await boot();
    const audit = auditCount(b.a);
    const r = await b.a.call('POST', '/api/admin/parameters/scene-quota/reset', { cookie: b.cookie, csrf: true, contract: false, headers: { origin: 'https://evil.example' } });
    expect(r.status).toBe(403);
    expect(auditCount(b.a)).toBe(audit);
  });

  it('[V-5] CONTROL: Origin propio o ausente no cambia el comportamiento (PUT 200 y reinicio 200)', async () => {
    const b = await boot();
    const own = await putValue(b, ENABLED, 'false', (await viewOf(b, ENABLED)).etag, { headers: { origin: OWN_ORIGIN } });
    expect(own.status).toBe(200);
    const none = await putValue(b, ENABLED, 'true', (await viewOf(b, ENABLED)).etag);
    expect(none.status).toBe(200);
    const reset = await b.a.call('POST', '/api/admin/parameters/scene-quota/reset', { cookie: b.cookie, csrf: true, contract: false, headers: { origin: OWN_ORIGIN } });
    expect(reset.status).toBe(200);
  });
});

// --- Vector VI: enumeración, fuerza bruta, If-Match --------------------------------------------------
describe('Sentinel VI - enumeración y precondición If-Match', () => {
  it('[VI-1] If-Match de otra versión: 412 sin revelar el valor vigente', async () => {
    const b = await boot();
    const current = await viewOf(b, QUOTA);
    const before = snapshot(b.a);
    const r = await putValue(b, QUOTA, '7', '"ffffffff00000000"');
    expect(r.status).toBe(412);
    expect(r.text.includes(`"${current.value}"`)).toBe(false);
    expect(snapshot(b.a)).toBe(before);
  });

  it('[VI-2] 40 intentos seguidos con etag falso: todos 412, sin 5xx y sin escritura', async () => {
    const b = await boot();
    const before = snapshot(b.a);
    const codes = new Set<number>();
    for (let i = 0; i < 40; i++) codes.add((await putValue(b, QUOTA, '7', `"bad${String(i).padStart(5, '0')}"`)).status);
    expect([...codes]).toEqual([412]);
    expect(snapshot(b.a)).toBe(before);
  });

  it('[VI-3] If-Match malformado o ausente (vacío, comodín, débil, sin comillas, largo, con comas): 4xx, nunca 2xx ni 5xx', async () => {
    const b = await boot();
    const before = snapshot(b.a);
    const malformed: Array<string | null> = ['', '*', 'W/"abcdefgh"', 'abcdefgh', `"${'a'.repeat(65)}"`, '"a,b"', '"abc def gh"', '"abc"', null];
    for (const m of malformed) {
      const r = await putValue(b, QUOTA, '7', m);
      expect(r.status, `If-Match=${JSON.stringify(m)}`).toBeGreaterThanOrEqual(400);
      expect(r.status, `If-Match=${JSON.stringify(m)}`).toBeLessThan(500);
    }
    expect(snapshot(b.a)).toBe(before);
  });
});

// --- Vector VII: prototype pollution, esquema, inyección en prompt y pares -----------------------------
describe('Sentinel VII - prototype pollution, esquema e inyección en prompt y pares', () => {
  it('[VII-1] cuerpo con __proto__, constructor y claves extra: 422 y Object.prototype sin contaminar', async () => {
    const b = await boot();
    const etag = (await viewOf(b, QUOTA)).etag;
    const r = await putRaw(b, QUOTA, '{"value":"7","__proto__":{"admin":true},"constructor":{"prototype":{"polluted":"yes"}}}', { headers: { 'if-match': etag } });
    expect(r.status).toBe(422);
    expect(({} as Record<string, unknown>)['polluted']).toBeUndefined();
    expect(({} as Record<string, unknown>)['admin']).toBeUndefined();
  });

  it('[VII-2] cuerpo no cerrado (value anidado, arreglo, cadena, nulo, número, clave extra): 422 sin escritura', async () => {
    const b = await boot();
    const before = snapshot(b.a);
    for (const body of ['{"value":{"value":"7"}}', '[{"value":"7"}]', '"7"', 'null', '{"value":7}', '{"value":"7","extra":1}']) {
      const etag = (await viewOf(b, QUOTA)).etag;
      const r = await putRaw(b, QUOTA, body, { headers: { 'if-match': etag } });
      expect(r.status, body).toBe(422);
    }
    expect(snapshot(b.a)).toBe(before);
  });

  it('[VII-3] JSON malformado o truncado: 4xx, nunca 5xx ni escritura', async () => {
    const b = await boot();
    const before = snapshot(b.a);
    for (const raw of ['{"value":"7"', '{"value":', '{value:7}', '']) {
      const etag = (await viewOf(b, QUOTA)).etag;
      const r = await putRaw(b, QUOTA, raw, { headers: { 'if-match': etag } });
      expect(r.status, raw).toBeGreaterThanOrEqual(400);
      expect(r.status, raw).toBeLessThan(500);
    }
    expect(snapshot(b.a)).toBe(before);
  });

  it('[VII-4] inyección en scene.prompt.blocks: marcadores, imitaciones y bloques mal formados rechazados (422) sin escritura', async () => {
    const b = await boot();
    const before = snapshot(b.a);
    const attacks: Array<[string, string]> = [
      ['marcador {photoRef} en bloque sin foto', withBlock('STYLE_BASE_TEXT', 'Cozy {photoRef} room, pixel art')],
      ['sustitución $& en bloque', withBlock('HOUSEHOLD_GENERIC', 'Room $& pixel art')],
      ['doble llave {{photoRef}}', withBlock('HOUSEHOLD_WITH_PHOTO', 'Inspired by {{photoRef}} layout')],
      ['etiqueta IMG_1 imitada', withBlock('STYLE_CLOSING', 'Match IMG_1 style')],
      ['contador imitado renderedPetsCount', withBlock('STYLE_CLOSING', 'renderedPetsCount: 9')],
      ['cabecera Pet 2 imitada', withBlock('STYLE_CLOSING', 'Pet 2 is a cat')],
      ['NUL en bloque', withBlock('STYLE_CLOSING', 'Match\u0000 style')],
      ['porcentaje %s', withBlock('STYLE_CLOSING', 'Match 100% style')],
      ['bloque de preservación duplicado', withBlock('STYLE_CLOSING', DEFAULT_PROMPT_BLOCKS.PRESERVATION_BLOCK)],
      ['bloque extra no canónico', JSON.stringify({ ...DEFAULT_PROMPT_BLOCKS, EXTRA: 'x' })],
      ['bloque faltante', JSON.stringify({ STYLE_BASE_TEXT: DEFAULT_PROMPT_BLOCKS.STYLE_BASE_TEXT })],
      ['bloque vacío', withBlock('STYLE_CLOSING', '   ')],
      ['bloque de 1001 unidades', withBlock('STYLE_CLOSING', 'a'.repeat(PROMPT_BLOCK_MAX_LENGTH + 1))],
      ['arreglo en lugar de objeto', JSON.stringify([DEFAULT_PROMPT_BLOCKS])],
    ];
    for (const [label, value] of attacks) {
      const r = await putFresh(b, BLOCKS, value);
      expect(r.status, label).toBe(422);
    }
    expect(snapshot(b.a)).toBe(before);
  });

  it('[VII-5] control positivo: un bloque de 1000 unidades exactas se acepta (200) y se lee de vuelta', async () => {
    const b = await boot();
    const r = await putFresh(b, BLOCKS, withBlock('STYLE_CLOSING', 'a'.repeat(PROMPT_BLOCK_MAX_LENGTH)));
    expect(r.status).toBe(200);
    expect(rowValue(b.a, BLOCKS)).toContain('a'.repeat(PROMPT_BLOCK_MAX_LENGTH));
    expect(validatePromptBlocks(withBlock('STYLE_CLOSING', 'a'.repeat(PROMPT_BLOCK_MAX_LENGTH + 1)), PROMPT_BLOCK_MAX_LENGTH).ok).toBe(false);
  });

  it('[VII-6] modelo y región no verificados, global y trampas de ruta: 422 y sin escritura', async () => {
    const b = await boot();
    const before = snapshot(b.a);
    for (const m of ['gemini-3-pro-image', 'gemini-3.1-flash-image', 'gemini-2.5-flash-image/../../x', 'gemini-2.5-flash-image?x=1', 'gemini-2.5-flash-image ', 'GEMINI-2.5-FLASH-IMAGE', 'https://evil.example/x']) {
      expect((await putFresh(b, MODEL, m)).status, m).toBe(422);
    }
    for (const l of ['GLOBAL', 'global/', 'global?x', ' global', 'us-central1/../x', 'us-central1?x', 'us-central1#x', ' us-central1', 'US-CENTRAL1', 'us-central1\n', 'evil.example']) {
      expect((await putFresh(b, LOC, l)).status, JSON.stringify(l)).toBe(422);
    }
    expect(snapshot(b.a)).toBe(before);
  });

  it('[VII-7] JSON anidado profundo: 4xx, sin 5xx y sin escritura', async () => {
    const b = await boot();
    const before = snapshot(b.a);
    const etag = (await viewOf(b, QUOTA)).etag;
    const deep = '['.repeat(5000) + ']'.repeat(5000);
    const r = await putRaw(b, QUOTA, `{"value":${deep}}`, { headers: { 'if-match': etag } });
    expect(r.status).toBeGreaterThanOrEqual(400);
    expect(r.status).toBeLessThan(500);
    expect(snapshot(b.a)).toBe(before);
  });
});

// --- Vector VIII: desbordamiento, topes 112 y 1000, longitud extrema -----------------------------------
describe('Sentinel VIII - desbordamiento de carga y topes', () => {
  it('[VIII-1] valor de 16385 caracteres: 422 y sin escritura', async () => {
    const b = await boot();
    const before = snapshot(b.a);
    expect((await putFresh(b, BLOCKS, 'x'.repeat(16385))).status).toBe(422);
    expect(snapshot(b.a)).toBe(before);
  });

  it('[VIII-2] cuerpo crudo de ~2 MB: 4xx, nunca 5xx ni escritura', async () => {
    const b = await boot();
    const before = snapshot(b.a);
    const etag = (await viewOf(b, BLOCKS)).etag;
    const r = await putRaw(b, BLOCKS, `{"value":"${'a'.repeat(2_000_000)}"}`, { headers: { 'if-match': etag } });
    expect(r.status).toBeGreaterThanOrEqual(400);
    expect(r.status).toBeLessThan(500);
    expect(snapshot(b.a)).toBe(before);
  });

  it('[VIII-3] tope global 112 y 1000 rechazados (422); 0, -1, 1e2, 0x70, 12.0, dígitos árabes y espacios rechazados', async () => {
    const b = await boot();
    const before = snapshot(b.a);
    for (const v of ['112', '1000', '0', '-1', '1e2', '0x70', '12.0', ' 12', '٣', '0112']) {
      expect((await putFresh(b, QUOTA, v)).status, `valor ${v}`).toBe(422);
    }
    expect(snapshot(b.a)).toBe(before);
  });

  it('[VIII-4] techo 111 aceptado (200): 111 x 45_000 = 4_995_000 <= 5_000_000 micro-USD (CONTROL de la regla de coste)', async () => {
    const b = await boot();
    const r = await putFresh(b, QUOTA, '111');
    expect(r.status).toBe(200);
  });

  it('[VIII-5] scene.enabled con valores no canónicos (TRUE, 1, yes, "true ", vacío): 422 y sin escritura', async () => {
    const b = await boot();
    const before = snapshot(b.a);
    for (const v of ['TRUE', '1', 'yes', 'true ', '']) expect((await putFresh(b, ENABLED, v)).status, JSON.stringify(v)).toBe(422);
    expect(snapshot(b.a)).toBe(before);
  });
});

// --- Vector IX: XSS y esquemas peligrosos -----------------------------------------------------------
describe('Sentinel IX - XSS y esquemas peligrosos', () => {
  it('[IX-1] modelo, región con script o javascript: rechazados (422) y no reflejados en la respuesta', async () => {
    const b = await boot();
    for (const p of ['<script>alert(1)</script>', 'javascript:alert(1)', 'data:text/html,<img src=x onerror=alert(1)>']) {
      const m = await putFresh(b, MODEL, p);
      const l = await putFresh(b, LOC, p);
      expect(m.status).toBe(422);
      expect(l.status).toBe(422);
      expect(m.text.includes('<script')).toBe(false);
      expect(l.text.includes('javascript:')).toBe(false);
    }
  });

  it('[IX-2] OBSERVACION (residuo TRI-5B-05): HTML en un bloque se acepta o rechaza, pero la lista siempre responde application/json', async () => {
    const b = await boot();
    const r = await putFresh(b, BLOCKS, withBlock('STYLE_BASE_TEXT', '<img src=x onerror=alert(1)> Create pixel art'));
    expect([200, 422]).toContain(r.status);
    const list = await listAll(b);
    expect(String(list.headers['content-type'])).toContain('application/json');
    expect(String(list.headers['content-type'])).not.toContain('text/html');
  });

  it.each([
    ['U+0085 NEL (Cc)', 'Match \u0085 style'],
    ['U+009F (Cc C1)', 'Match \u009f style'],
    ['U+2028 separador de linea (Zl)', 'Match \u2028 style'],
    ['U+2029 separador de parrafo (Zp)', 'Match \u2029 style'],
    ['U+202E inversion (Cf)', 'Match \u202e evil style'],
    ['U+200B ancho cero (Cf)', 'Match \u200b style'],
    ['U+FEFF BOM (Cf)', 'Match \ufeff style'],
    ['U+0000 NUL (C0)', 'Match \u0000 style'],
    ['U+007F DEL', 'Match \u007f style'],
  ])('[IX-3] SEN-T1271-02: %s en un bloque: 422 ERR-SCHEMA-VALIDATION-FAILED sin escribir', async (_name, text) => {
    const b = await boot();
    const before = snapshot(b.a);
    const r = await putFresh(b, BLOCKS, withBlock('STYLE_CLOSING', text));
    expect([r.status, (r.json as { code?: string }).code]).toEqual([422, 'ERR-SCHEMA-VALIDATION-FAILED']);
    expect(snapshot(b.a)).toBe(before);
  });
});

// --- Escena con scene.enabled = false (T1266, REQ-CFG9-003) -----------------------------------------
describe('Escena con scene.enabled = false (T1266, REQ-CFG9-003)', () => {
  it('[S-1] con false: el propietario recibe 409 ERR-SCENE-DISABLED sin intento, sin cuota, sin trabajo y sin llamada al generador', async () => {
    const b = await boot();
    const etag = (await viewOf(b, ENABLED)).etag;
    expect((await putValue(b, ENABLED, 'false', etag)).status).toBe(200);
    b.params.advanceSeconds(b.a, 61);
    const attempts = (): number => (b.a.db.prepare('SELECT COUNT(*) AS n FROM scene_attempts').get() as { n: number }).n;
    const attemptsBefore = attempts();
    const jobsBefore = b.fixture.dispatcher.jobs.length;
    const callsBefore = b.fixture.generator.calls.length;
    const r = await b.a.call('POST', `/api/households/${H}/scene/generate`, { cookie: b.userCookie, body: { action: 'REGENERATE' }, headers: { 'idempotency-key': KEY(2) }, contract: false });
    expect(r.status).toBe(409);
    expect((r.json as { code?: string }).code).toBe('ERR-SCENE-DISABLED');
    expect(attempts()).toBe(attemptsBefore);
    expect(b.fixture.dispatcher.jobs.length).toBe(jobsBefore);
    expect(b.fixture.generator.calls.length).toBe(callsBefore);
  });

  it('[S-2] OBSERVACION (INV-CFG9-003): fila ilegible ("maybe") rige como habilitado (202); diseño documentado en cached-platform-parameter', async () => {
    const b = await boot();
    b.a.db.prepare("INSERT INTO platform_parameters (key, value, description, updated_at, updated_by_user_id) VALUES ('scene.enabled', 'maybe', 'fixture', '2026-11-01T00:00:00.000Z', NULL) ON CONFLICT (key) DO UPDATE SET value = excluded.value").run();
    b.params.advanceSeconds(b.a, 61);
    const r = await b.a.call('POST', `/api/households/${H}/scene/generate`, { cookie: b.userCookie, body: { action: 'REGENERATE' }, headers: { 'idempotency-key': KEY(3) }, contract: false });
    expect(r.status).toBe(202);
  });

  it('[S-3] household inexistente con escena deshabilitada: no revela el interruptor (no 409); 403 o 404', async () => {
    const b = await boot();
    const etag = (await viewOf(b, ENABLED)).etag;
    await putValue(b, ENABLED, 'false', etag);
    b.params.advanceSeconds(b.a, 61);
    const r = await b.a.call('POST', '/api/households/00000000-0000-4000-8000-000000000999/scene/generate', { cookie: b.userCookie, body: { action: 'REGENERATE' }, headers: { 'idempotency-key': KEY(4) }, contract: false });
    expect([403, 404]).toContain(r.status);
  });
});
