import { afterEach, describe, expect, it } from 'vitest';
import { ADMIN_EMAIL, ADMIN_EMAIL_2, ADMIN_SUB_2, adminKit, adminLogin, observable, type AdminKit } from '../../fixtures/admin-fixtures.ts';
import { ControlledStorage, DEFAULT_LIMITS, PNG } from '../../fixtures/media-harness.ts';
import { ARGOS } from '../../fixtures/application-harness.ts';
import { parameterKit, type ParameterKit } from '../../fixtures/parameters-fixtures.ts';
import { createApi, type Api, type ApiResponse } from './api-harness.ts';

/**
 * T1258 (Feature 009, Fase 5a, #20; PRUEBAS ROJAS hasta T1264): catalogo y escritura de `/api/admin/parameters` (contrato `admin.openapi.yaml` 1.4.0). Rango y formato de
 * `album.max_photos_per_pet` (0, -1, abc, ' 12 ', 12.5, 51), autoria (`updated_at`; `updated_by_user_id` NULL; autor en `admin_audit_entries`, sin el valor), `If-Match` y 412,
 * defecto seguro con fila invalida o ausente, efecto del tope de fotos SIN reinicio (cache <= 60 s) y conservacion de las fotos al bajar el tope. En 5a solo son escribibles
 * `album.max_photos_per_pet` y `scene.enabled` (P5-06 = B); no hay claves nuevas desde la interfaz.
 * @implements REQ-CFG9-001, REQ-CFG9-007, REQ-CFG9-008, INV-CFG9-003, EDGE-009-014, EDGE-009-015, EDGE-009-016, SC-009-017, SC-009-018, SC-009-019, SC-009-020, SC-009-027
 */
let api: Api | null = null;
afterEach(async () => {
  await api?.close();
  api = null;
});

const NOW = '2026-11-23T12:00:00.000Z';
const KEY = 'album.max_photos_per_pet';
const ORDER = ['album.max_photos_per_pet', 'scene.enabled', 'scene.global_quota_max', 'scene.provider_model', 'scene.provider_location', 'scene.prompt.blocks'];
const WRITABLE_5B = ['scene.global_quota_max', 'scene.provider_model', 'scene.provider_location', 'scene.prompt.blocks'];
const ETAG = /^"[A-Za-z0-9_-]{8,64}"$/;

interface View {
  key: string;
  valueType: string;
  value: string;
  default: string;
  source: 'DATABASE' | 'DEFAULT';
  constraints: Record<string, unknown>;
  writable: boolean;
  lastEditedAt: string | null;
  lastEditedBy: string | null;
  etag: string;
}
interface Boot {
  readonly a: Api;
  readonly kit: AdminKit;
  readonly params: ParameterKit;
  readonly cookie: string;
  readonly adminId: string;
}

async function boot(): Promise<Boot> {
  const kit = adminKit([ADMIN_EMAIL, ADMIN_EMAIL_2]);
  const params = parameterKit();
  const a = await createApi(undefined, {
    admin: kit.admin,
    media: { storage: new ControlledStorage(() => new Date(NOW)), limits: DEFAULT_LIMITS },
    platformParameters: params.port,
  });
  api = a;
  params.bind(a);
  a.clock.setClock(NOW.slice(0, 10), NOW);
  const { cookie } = await adminLogin(a);
  const adminId = (a.db.prepare('SELECT admin_id AS id FROM admin_identities').get() as { id: string }).id;
  return { a, kit, params, cookie: cookie!, adminId };
}

const list = (b: Boot, cookie: string | null = b.cookie): Promise<ApiResponse> => b.a.call('GET', '/api/admin/parameters', { cookie, contract: false });
const viewOf = async (b: Boot, key: string): Promise<View> => ((await list(b)).json as { items: View[] }).items.find((i) => i.key === key)!;
const put = (b: Boot, key: string, value: unknown, ifMatch: string | null, options: { cookie?: string | null; csrf?: boolean } = {}): Promise<ApiResponse> =>
  b.a.call('PUT', `/api/admin/parameters/${encodeURIComponent(key)}`, {
    cookie: options.cookie === undefined ? b.cookie : options.cookie,
    csrf: options.csrf ?? true,
    contract: false,
    body: { value },
    ...(ifMatch === null ? {} : { headers: { 'if-match': ifMatch } }),
  });
const putFresh = async (b: Boot, key: string, value: unknown): Promise<ApiResponse> => put(b, key, value, (await viewOf(b, key)).etag);
const row = (a: Api, key: string) => a.db.prepare('SELECT value, updated_at AS updatedAt, updated_by_user_id AS by FROM platform_parameters WHERE key = ?').get(key) as { value: string; updatedAt: string; by: string | null } | undefined;
const setRow = (a: Api, key: string, value: string): void => {
  a.db.prepare("INSERT INTO platform_parameters (key, value, description, updated_at, updated_by_user_id) VALUES (?, ?, 'fixture', '2026-11-01T00:00:00.000Z', NULL) ON CONFLICT (key) DO UPDATE SET value = excluded.value").run(key, value);
};
const auditRows = (a: Api) => a.db.prepare("SELECT admin_id AS adminId, action, object_ref AS objectRef, occurred_at AS occurredAt FROM admin_audit_entries WHERE action <> 'ADMIN_SESSION_START' AND action NOT LIKE 'ADMIN_SESSION%' ORDER BY occurred_at, id").all() as Array<{ adminId: string; action: string; objectRef: string | null; occurredAt: string }>;
const codeOf = (r: ApiResponse): string | undefined => (r.json as { code?: string } | undefined)?.code;
const shapeOf = (r: ApiResponse) => {
  const { headers, text, status } = observable(r);
  const { 'content-length': _length, ...rest } = headers;
  return { status, text: text.replace(/Route \w+:\S+ not found/, 'Route not found'), headers: rest };
};

describe('T1258 [REQ-CFG9-001] [SC-009-017] GET /api/admin/parameters: catalogo cerrado de seis claves', () => {
  it('[REQ-CFG9-001][SC-009-017] devuelve SIEMPRE las seis claves en orden fijo, con valor, defecto, restricciones del codigo, writable y etag; Cache-Control no-store', async () => {
    const b = await boot();
    const r = await list(b);
    expect(r.status).toBe(200);
    expect(r.headers['cache-control']).toBe('no-store');
    const items = (r.json as { items: View[] }).items;
    expect(items.map((i) => i.key)).toEqual(ORDER);
    const album = items[0]!;
    expect(album).toMatchObject({ valueType: 'INTEGER', value: '10', default: '10', source: 'DATABASE', writable: true });
    expect(album.constraints).toEqual({ min: 1, max: 50 });
    expect(items[1]).toMatchObject({ key: 'scene.enabled', valueType: 'BOOLEAN', default: 'true', writable: true });
    expect(items[1]!.constraints).toEqual({ allowed: ['true', 'false'] });
    for (const key of WRITABLE_5B) expect(items.find((i) => i.key === key)!.writable, key).toBe(true); // 5b (T1296): ya escribibles con la regla de coste
    for (const item of items) expect(item.etag, item.key).toMatch(ETAG);
  });

  it('[REQ-CFG9-001][REQ-CFG9-007] cada elemento tiene la forma cerrada de AdminParameterView y nunca expone updated_by_user_id ni un id de cuenta de usuario', async () => {
    const b = await boot();
    const r = await list(b);
    for (const item of (r.json as { items: View[] }).items) {
      expect(Object.keys(item).sort(), item.key).toEqual(['constraints', 'default', 'etag', 'key', 'lastEditedAt', 'lastEditedBy', 'source', 'valueType', 'value', 'writable'].sort());
    }
    expect(r.text).not.toMatch(/updated_by_user_id|updatedByUserId/);
  });

  it('sin sesion de administracion es el 404 uniforme de /api/ (sin codigo ERR-*) y la cookie de usuario tampoco abre', async () => {
    const b = await boot();
    const unknown = shapeOf(await b.a.call('GET', '/api/no-existe-nunca', { contract: false }));
    expect(shapeOf(await list(b, null))).toEqual(unknown);
    expect(shapeOf(await list(b, await b.a.login('andres')))).toEqual(unknown);
  });

  it('[SC-009-017] no hay claves nuevas desde la interfaz: la lista no cambia aunque existan otras filas (p. ej. el contador global)', async () => {
    const b = await boot();
    setRow(b.a, 'scene.global_quota_used.2026-11', '3');
    setRow(b.a, 'scene.mistery', 'x');
    const items = ((await list(b)).json as { items: View[] }).items;
    expect(items.map((i) => i.key)).toEqual(ORDER);
  });
});

describe('T1258 [INV-CFG9-003] [EDGE-009-014] [SC-009-027] defecto seguro con fila ausente o invalida', () => {
  it('fila ausente: valor = defecto, source DEFAULT, lastEditedAt y lastEditedBy null, etag de ausencia valido', async () => {
    const b = await boot();
    b.a.db.prepare('DELETE FROM platform_parameters WHERE key = ?').run(KEY);
    const v = await viewOf(b, KEY);
    expect(v).toMatchObject({ value: '10', default: '10', source: 'DEFAULT', lastEditedAt: null, lastEditedBy: null });
    expect(v.etag).toMatch(ETAG);
  });

  it.each(['0', '-1', 'abc', ' 12 ', '12.5', '51', '', '1e1', '+5'])('fila invalida %j: rige el defecto 10 y source DEFAULT (nunca el valor invalido ni un 500)', async (bad) => {
    const b = await boot();
    setRow(b.a, KEY, bad);
    const r = await list(b);
    expect(r.status).toBe(200);
    expect(await viewOf(b, KEY)).toMatchObject({ value: '10', source: 'DEFAULT' });
    // El valor invalido no viaja como `value` de ninguna vista (comparar con `""` solo seria vacuo: el etag cita comillas y su JSON siempre contiene `\""`).
    expect(r.text).not.toContain(`"value":${JSON.stringify(bad)}`);
  });

  it('scene.enabled con fila ausente o ilegible: defecto true y source DEFAULT', async () => {
    const b = await boot();
    b.a.db.prepare('DELETE FROM platform_parameters WHERE key = ?').run('scene.enabled');
    expect(await viewOf(b, 'scene.enabled')).toMatchObject({ value: 'true', source: 'DEFAULT' });
    setRow(b.a, 'scene.enabled', 'TRUE');
    expect(await viewOf(b, 'scene.enabled')).toMatchObject({ value: 'true', source: 'DEFAULT' });
    setRow(b.a, 'scene.enabled', 'false');
    expect(await viewOf(b, 'scene.enabled')).toMatchObject({ value: 'false', source: 'DATABASE' });
  });

  it('[INV-CFG9-003] con fila invalida el tope REAL de fotos es el defecto 10 (la 11.a foto se rechaza con ERR-MEDIA-ALBUM-LIMIT)', async () => {
    const b = await boot();
    setRow(b.a, KEY, 'abc');
    const cookie = await b.a.login('andres');
    for (let n = 0; n < 10; n += 1) expect((await upload(b, cookie, n)).status).toBe(201);
    const over = await upload(b, cookie, 10);
    expect([over.status, codeOf(over)]).toEqual([409, 'ERR-MEDIA-ALBUM-LIMIT']);
  });
});

describe('T1258 [REQ-CFG9-001] [REQ-CFG9-007] [SC-009-018] PUT: rango y formato, texto canonico EXACTO', () => {
  it.each(['0', '-1', 'abc', ' 12 ', '12.5', '51', '', '1e1', '+5', '012', '5 ', '١٢'])('[REQ-CFG9-007][SC-009-018] album.max_photos_per_pet = %j se rechaza con 422 ERR-SCHEMA-VALIDATION-FAILED, sin escribir ni auditar', async (bad) => {
    const b = await boot();
    const before = row(b.a, KEY);
    const r = await putFresh(b, KEY, bad);
    expect([r.status, codeOf(r)]).toEqual([422, 'ERR-SCHEMA-VALIDATION-FAILED']);
    expect(row(b.a, KEY)).toEqual(before);
    expect(auditRows(b.a)).toEqual([]);
  });

  it.each([12, 12.5, true, null, ['12'], { v: 12 }])('un valor que no es texto (%j) se rechaza con 422 sin escribir', async (bad) => {
    const b = await boot();
    const before = row(b.a, KEY);
    const r = await putFresh(b, KEY, bad);
    expect([r.status, codeOf(r)]).toEqual([422, 'ERR-SCHEMA-VALIDATION-FAILED']);
    expect(row(b.a, KEY)).toEqual(before);
  });

  it('el cuerpo es cerrado: una propiedad extra o sin value se rechaza con 422', async () => {
    const b = await boot();
    const etag = (await viewOf(b, KEY)).etag;
    const extra = await b.a.call('PUT', `/api/admin/parameters/${KEY}`, { cookie: b.cookie, contract: false, body: { value: '12', author: 'x' }, headers: { 'if-match': etag } });
    const empty = await b.a.call('PUT', `/api/admin/parameters/${KEY}`, { cookie: b.cookie, contract: false, body: {}, headers: { 'if-match': etag } });
    expect([extra.status, codeOf(extra), empty.status, codeOf(empty)]).toEqual([422, 'ERR-SCHEMA-VALIDATION-FAILED', 422, 'ERR-SCHEMA-VALIDATION-FAILED']);
    expect(row(b.a, KEY)!.value).toBe('10');
  });

  it.each(['1', '12', '50'])('[REQ-CFG9-001][REQ-CFG9-007] album.max_photos_per_pet = %j (limites y valor intermedio) se acepta y la vista devuelve el valor nuevo', async (good) => {
    const b = await boot();
    const r = await putFresh(b, KEY, good);
    expect(r.status).toBe(200);
    expect(r.headers['cache-control']).toBe('no-store');
    expect(r.headers['etag']).toMatch(ETAG);
    expect(r.json).toMatchObject({ key: KEY, value: good, source: 'DATABASE', writable: true });
    expect(row(b.a, KEY)!.value).toBe(good);
  });

  it.each(['TRUE', 'True', '1', '0', 'yes', ' false', 'false ', 'verdadero'])('scene.enabled = %j se rechaza con 422 (solo true o false en minusculas)', async (bad) => {
    const b = await boot();
    const r = await putFresh(b, 'scene.enabled', bad);
    expect([r.status, codeOf(r)]).toEqual([422, 'ERR-SCHEMA-VALIDATION-FAILED']);
  });

  it('scene.enabled acepta true y false y la lectura refleja el valor', async () => {
    const b = await boot();
    expect((await putFresh(b, 'scene.enabled', 'false')).status).toBe(200);
    expect(await viewOf(b, 'scene.enabled')).toMatchObject({ value: 'false', source: 'DATABASE' });
    expect((await putFresh(b, 'scene.enabled', 'true')).status).toBe(200);
    expect(row(b.a, 'scene.enabled')!.value).toBe('true');
  });
});

describe('T1258 [REQ-CFG9-001] [P5-06 = B] sin claves nuevas y claves de 5b con la regla de coste', () => {
  it.each(['scene.foo', 'album.max_photos', 'scene.global_quota_used.2026-11', 'x', 'ALBUM.MAX_PHOTOS_PER_PET'])('la clave %j esta fuera del catalogo: 422 sin crear la fila', async (key) => {
    const b = await boot();
    const r = await put(b, key, '5', '"abcdefgh"');
    expect([r.status, codeOf(r)]).toEqual([422, 'ERR-SCHEMA-VALIDATION-FAILED']);
    expect(row(b.a, key)?.value).not.toBe('5');
  });

  it('[REQ-CFG9-008] 5b: scene.global_quota_max, scene.provider_model y scene.provider_location son escribibles dentro del tope de gasto y dejan UNA auditoria sin valor', async () => {
    const b = await boot();
    for (const [key, value] of [['scene.global_quota_max', '7'], ['scene.provider_model', 'gemini-3.1-flash-image'], ['scene.provider_location', 'us-central1']] as const) {
      const r = await putFresh(b, key, value);
      expect([key, r.status]).toEqual([key, 200]);
      expect(row(b.a, key)).toEqual({ value, updatedAt: NOW, by: null });
    }
    expect(auditRows(b.a).map((a) => [a.action, a.objectRef])).toEqual([
      ['ADMIN_PARAMETER_UPDATE', 'scene.global_quota_max'],
      ['ADMIN_PARAMETER_UPDATE', 'scene.provider_model'],
      ['ADMIN_PARAMETER_UPDATE', 'scene.provider_location'],
    ]);
    expect(JSON.stringify(auditRows(b.a))).not.toMatch(/gemini-3\.1|75000|5000000/);
  });

  it('[REQ-CFG9-004][EDGE-009-036] la combinacion que supera 5_000_000 micro-USD: 422 ERR-ADMIN-SCENE-COST-CAP-EXCEEDED sin escribir ni auditar (66 cabe con el de 75_000, 67 no)', async () => {
    const b = await boot();
    setRow(b.a, 'scene.provider_model', 'gemini-3.1-flash-image');
    expect((await putFresh(b, 'scene.global_quota_max', '66')).status).toBe(200);
    const before = row(b.a, 'scene.global_quota_max');
    const auditBefore = auditRows(b.a);
    const r = await putFresh(b, 'scene.global_quota_max', '67');
    expect([r.status, codeOf(r)]).toEqual([422, 'ERR-ADMIN-SCENE-COST-CAP-EXCEEDED']);
    expect(row(b.a, 'scene.global_quota_max')).toEqual(before);
    expect(auditRows(b.a)).toEqual(auditBefore);
    expect(r.text).not.toMatch(/\d{5,}/); // sin cifras de coste ni gasto
  });

  it.each([
    ['scene.provider_model', 'gemini-3-pro-image'],
    ['scene.provider_location', 'us-east4'],
    ['scene.provider_location', 'global'],
    ['scene.provider_location', 'us-central1/../x'],
    ['scene.global_quota_max', '112'],
    ['scene.global_quota_max', '1000'],
    ['scene.prompt.blocks', '{}'],
  ])('[REQ-CFG9-008] %s = %j (par sin celda verificada, region fuera de lista, tope fuera del techo 111 o bloques invalidos): 422 ERR-SCHEMA-VALIDATION-FAILED sin escribir', async (key, value) => {
    const b = await boot();
    const before = row(b.a, key);
    const r = await put(b, key, value, (await viewOf(b, key)).etag);
    expect([r.status, codeOf(r)]).toEqual([422, 'ERR-SCHEMA-VALIDATION-FAILED']);
    expect(row(b.a, key)).toEqual(before);
    expect(auditRows(b.a)).toEqual([]);
  });
});

describe('T1258 [REQ-CFG9-007] [SC-009-019] autoria: updated_at, updated_by_user_id NULL y autor solo en admin_audit_entries', () => {
  it('[REQ-CFG9-007][SC-009-019] la escritura fija value y updated_at en una transaccion, deja updated_by_user_id NULL y no guarda el autor en la fila', async () => {
    const b = await boot();
    const r = await putFresh(b, KEY, '12');
    expect(r.status).toBe(200);
    expect(row(b.a, KEY)).toEqual({ value: '12', updatedAt: NOW, by: null });
    const v = r.json as View;
    expect(v).toMatchObject({ value: '12', lastEditedAt: NOW, lastEditedBy: b.adminId });
    expect(Object.keys(v)).not.toContain('updatedByUserId');
  });

  it('[REQ-CFG9-007][REQ-ADM9-004] deja UNA entrada en admin_audit_entries con el id del administrador, la clave, una accion y la marca de tiempo, SIN el valor', async () => {
    const b = await boot();
    await putFresh(b, KEY, '37');
    const entries = auditRows(b.a);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ adminId: b.adminId, occurredAt: NOW });
    expect(entries[0]!.action.length).toBeGreaterThan(0);
    expect(`${entries[0]!.action}|${entries[0]!.objectRef ?? ''}`).toContain(KEY);
    expect(JSON.stringify(entries[0])).not.toContain('37');
    expect(JSON.stringify(entries[0])).not.toMatch(/example\.test|google-sub/);
  });

  it('la lectura devuelve como autor el administrador de la ULTIMA entrada de auditoria, no un userId (dos administradores)', async () => {
    const b = await boot();
    await putFresh(b, KEY, '11');
    b.kit.oidc.identity = { sub: ADMIN_SUB_2, email: ADMIN_EMAIL_2 };
    const second = (await adminLogin(b.a)).cookie!;
    const secondId = (b.a.db.prepare('SELECT admin_id AS id FROM admin_identities WHERE email = ?').get(ADMIN_EMAIL_2) as { id: string }).id;
    b.a.clock.setClock(NOW.slice(0, 10), '2026-11-23T12:05:00.000Z');
    const etag = ((await list(b, second)).json as { items: View[] }).items[0]!.etag;
    expect((await put(b, KEY, '13', etag, { cookie: second })).status).toBe(200);
    const v = await viewOf(b, KEY);
    expect([v.lastEditedBy, v.lastEditedAt, row(b.a, KEY)!.by]).toEqual([secondId, '2026-11-23T12:05:00.000Z', null]);
    expect(secondId).not.toBe(b.adminId);
  });

  it('el etag cambia con cada escritura, tambien si el valor escrito es igual', async () => {
    const b = await boot();
    const first = await putFresh(b, KEY, '12');
    const e1 = (first.json as View).etag;
    b.a.clock.setClock(NOW.slice(0, 10), '2026-11-23T12:01:00.000Z');
    const second = await put(b, KEY, '12', e1);
    expect(second.status).toBe(200);
    expect((second.json as View).etag).not.toBe(e1);
  });

  it('fila ausente: la escritura la INSERTA (no es clave nueva) con updated_by_user_id NULL', async () => {
    const b = await boot();
    b.a.db.prepare('DELETE FROM platform_parameters WHERE key = ?').run(KEY);
    const r = await putFresh(b, KEY, '15');
    expect(r.status).toBe(200);
    expect(row(b.a, KEY)).toEqual({ value: '15', updatedAt: NOW, by: null });
  });
});

describe('T1258 [REQ-CFG9-007] [EDGE-009-016] If-Match y 412', () => {
  it('If-Match ausente o mal formado: 422 ERR-SCHEMA-VALIDATION-FAILED sin escribir', async () => {
    const b = await boot();
    for (const header of [null, 'abc', '""', '*', 'W/"abcdefgh"', '"corto"', '"con espacio 12345"']) {
      const r = await put(b, KEY, '12', header);
      expect([header, r.status, codeOf(r)], String(header)).toEqual([header, 422, 'ERR-SCHEMA-VALIDATION-FAILED']);
    }
    expect(row(b.a, KEY)!.value).toBe('10');
  });

  it('[REQ-CFG9-007][EDGE-009-016] etag distinto del vigente: 412 ERR-ADMIN-PARAMETER-PRECONDITION-FAILED, sin escribir, sin auditar y sin el valor vigente en el detalle', async () => {
    const b = await boot();
    const stale = (await viewOf(b, KEY)).etag;
    expect((await put(b, KEY, '21', stale)).status).toBe(200);
    const before = row(b.a, KEY);
    const entries = auditRows(b.a).length;
    const r = await put(b, KEY, '33', stale);
    expect([r.status, codeOf(r)]).toEqual([412, 'ERR-ADMIN-PARAMETER-PRECONDITION-FAILED']);
    expect(row(b.a, KEY)).toEqual(before);
    expect(auditRows(b.a)).toHaveLength(entries);
    expect(r.text).not.toMatch(/"?21"?\b/);
  });

  it('un etag bien formado pero ajeno (de otra clave) es 412', async () => {
    const b = await boot();
    const other = (await viewOf(b, 'scene.enabled')).etag;
    const r = await put(b, KEY, '12', other);
    expect([r.status, codeOf(r)]).toEqual([412, 'ERR-ADMIN-PARAMETER-PRECONDITION-FAILED']);
  });

  it('orden de errores: el valor invalido (422) gana al If-Match desfasado (412)', async () => {
    const b = await boot();
    const stale = (await viewOf(b, KEY)).etag;
    await put(b, KEY, '21', stale);
    const r = await put(b, KEY, 'abc', stale);
    expect([r.status, codeOf(r)]).toEqual([422, 'ERR-SCHEMA-VALIDATION-FAILED']);
  });

  it('[EDGE-009-016] dos escrituras concurrentes con el MISMO etag: exactamente una gana (200) y la otra recibe 412', async () => {
    const b = await boot();
    const etag = (await viewOf(b, KEY)).etag;
    const [x, y] = await Promise.all([put(b, KEY, '20', etag), put(b, KEY, '30', etag)]);
    expect([x.status, y.status].sort()).toEqual([200, 412]);
    const winner = x.status === 200 ? '20' : '30';
    expect(row(b.a, KEY)!.value).toBe(winner);
    expect(auditRows(b.a)).toHaveLength(1);
  });

  it('CSRF antes de la sesion: sin X-Argos-Request es 403 con o sin sesion; con la cabecera y sin sesion, el 404 uniforme', async () => {
    const b = await boot();
    const etag = (await viewOf(b, KEY)).etag;
    const noSessionNoCsrf = await put(b, KEY, '12', etag, { cookie: null, csrf: false });
    const sessionNoCsrf = await put(b, KEY, '12', etag, { csrf: false });
    expect([noSessionNoCsrf.status, codeOf(noSessionNoCsrf), sessionNoCsrf.status, codeOf(sessionNoCsrf)]).toEqual([403, 'ERR-AUTH-CSRF-REJECTED', 403, 'ERR-AUTH-CSRF-REJECTED']);
    const noSession = await put(b, KEY, '12', etag, { cookie: null });
    expect(shapeOf(noSession)).toEqual(shapeOf(await b.a.call('GET', '/api/no-existe-nunca', { contract: false })));
    expect(codeOf(noSession)).toBeUndefined();
    expect(row(b.a, KEY)!.value).toBe('10');
  });

  it('la cookie de usuario no escribe parametros (404 uniforme) aunque lleve CSRF', async () => {
    const b = await boot();
    const etag = (await viewOf(b, KEY)).etag;
    const r = await put(b, KEY, '12', etag, { cookie: await b.a.login('andres') });
    expect(codeOf(r)).toBeUndefined();
    expect(r.status).toBe(404);
    expect(row(b.a, KEY)!.value).toBe('10');
  });
});

describe('T1258 [REQ-CFG9-002] [SC-009-020] [EDGE-009-015] efecto del tope de fotos SIN reinicio y conservacion de fotos', () => {
  it('[REQ-CFG9-001][REQ-CFG9-002][SC-009-020] subir el tope de 10 a 12 aplica en caliente tras la cache (<= 60 s) sin reiniciar la aplicacion', async () => {
    const b = await boot();
    const cookie = await b.a.login('andres');
    for (let n = 0; n < 10; n += 1) expect((await upload(b, cookie, n)).status).toBe(201);
    expect(codeOf(await upload(b, cookie, 10))).toBe('ERR-MEDIA-ALBUM-LIMIT');
    expect((await putFresh(b, KEY, '12')).status).toBe(200);
    b.params.advanceSeconds(b.a, 61);
    expect((await upload(b, cookie, 10)).status).toBe(201);
    expect((await upload(b, cookie, 11)).status).toBe(201);
    const over = await upload(b, cookie, 12);
    expect([over.status, codeOf(over)]).toEqual([409, 'ERR-MEDIA-ALBUM-LIMIT']);
    const limits = await b.a.call('GET', `/api/pets/${ARGOS.id}/media/limits`, { cookie, contract: false });
    if (limits.status === 200) expect(limits.json).toMatchObject({ photoCount: 12, maxPhotosPerPet: 12 });
  });

  it('bajar el tope por debajo del conteo CONSERVA las fotos y solo bloquea subidas nuevas (EDGE-009-015)', async () => {
    const b = await boot();
    const cookie = await b.a.login('andres');
    expect((await putFresh(b, KEY, '12')).status).toBe(200);
    b.params.advanceSeconds(b.a, 61);
    for (let n = 0; n < 12; n += 1) expect((await upload(b, cookie, n)).status).toBe(201);
    expect((await putFresh(b, KEY, '5')).status).toBe(200);
    b.params.advanceSeconds(b.a, 61);
    const list12 = await b.a.call('GET', `/api/pets/${ARGOS.id}/media?kind=PHOTO&page=1`, { cookie, contract: false });
    expect((list12.json as { total: number }).total).toBe(12);
    const blocked = await upload(b, cookie, 99);
    expect([blocked.status, codeOf(blocked)]).toEqual([409, 'ERR-MEDIA-ALBUM-LIMIT']);
    expect(((await b.a.call('GET', `/api/pets/${ARGOS.id}/media?kind=PHOTO&page=1`, { cookie, contract: false })).json as { total: number }).total).toBe(12);
  });

  it('el cambio NO se aplica antes de que expire la cache: dentro de la ventana de 60 s rige el valor anterior', async () => {
    const b = await boot();
    const cookie = await b.a.login('andres');
    for (let n = 0; n < 10; n += 1) expect((await upload(b, cookie, n)).status).toBe(201);
    expect((await putFresh(b, KEY, '12')).status).toBe(200);
    b.params.advanceSeconds(b.a, 30);
    expect(codeOf(await upload(b, cookie, 10))).toBe('ERR-MEDIA-ALBUM-LIMIT');
  });
});

async function upload(b: Boot, cookie: string, n: number): Promise<ApiResponse> {
  return b.a.call('POST', `/api/pets/${ARGOS.id}/media?kind=PHOTO`, { cookie, raw: PNG(40 + n), headers: { 'x-argos-filename': `f${n}.png`, 'content-type': 'application/octet-stream' }, contract: false });
}
