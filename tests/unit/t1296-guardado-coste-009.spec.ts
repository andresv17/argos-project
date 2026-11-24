import { describe, expect, it } from 'vitest';
import { UpdateAdminParameterUseCase, parameterEtag } from '../../src/application/use-cases/admin-parameter-use-cases.ts';
import type { ApplicationDeps } from '../../src/application/use-cases/use-case-support.ts';
import { DEFAULT_PROMPT_BLOCKS, PROMPT_BLOCK_NAMES } from '../../src/domain/scene/prompt-blocks.ts';
import { ADMIN_PARAMETER_CATALOG } from '../../src/domain/platform/admin-parameter-catalog.ts';
import { SystemClockAdapter } from '../../src/infrastructure/adapters/system-clock.adapter.ts';
import type { MemoryState } from '../../src/infrastructure/persistence/memory/in-memory-unit-of-work.ts';
import { canonicalState, createHarness } from '../fixtures/application-harness.ts';

/**
 * T1296 (i) (009, 5b): la regla de coste (EDGE-009-036) en el guardado de /admin de scene.provider_model, scene.provider_location y scene.global_quota_max.
 * REQ-CFG9-004, REQ-CFG9-007, REQ-CFG9-008, NFR-009-003, EDGE-009-036; SC-009-022, SC-009-051. Costes de la tabla aprobada (Anexo A): 45_000 y 75_000 (us-central1).
 * Gasto del mes por intento (quota_window YYYY-MM de la zona America/Bogota, no UTC); usadas = scene.global_quota_used.<ventana>.
 */
const FLASH = 'gemini-2.5-flash-image';
const FLASH31 = 'gemini-3.1-flash-image'; // D9-27: el par valido es 3.1 + global
const LOC31 = 'global';
const LOC = 'us-central1';
const ADMIN = 'ad000000-0000-4000-8000-000000000001';
const WRITTEN = '2026-11-01T00:00:00.000Z';
const BOGOTA_NOV_30_22H = new Date('2026-12-01T03:00:00.000Z'); // 22:00 del 30-nov en Bogotá, 03:00 del 1-dic en UTC
const BOGOTA_DEC_1_00H = new Date('2026-12-01T05:00:00.000Z'); // 00:00 del 1-dic en Bogotá

let seq = 0;
const attempt = (window: string, model: string | null, location: string | null, started: string | null = '2026-11-10T12:00:00.000Z') => ({
  id: `a2000000-0000-4000-8000-${String(++seq).padStart(12, '0')}`, sceneId: 's', actorUserId: 'u', action: 'UPDATE', mode: 'FROM_SCRATCH', fingerprint: 'f', inputsSnapshot: '{}',
  resultObjectId: `r${seq}`, phase: 'PENDING', claimedAt: null, providerCallStartedAt: started, providerModel: model, providerLocation: location, quotaWindow: window, quotaMax: 5,
  outcome: null, errorCode: null, degraded: false, idempotencyKeyHash: null, idempotencyExpiresAt: null, startedAt: WRITTEN, finishedAt: null,
});
const many = (n: number, window: string, model: string | null, location: string | null) => Array.from({ length: n }, () => attempt(window, model, location));

interface Seed { rows?: Record<string, string>; attempts?: ReturnType<typeof attempt>[]; now?: Date }
const setup = (seed: Seed = {}) => {
  const state: MemoryState = canonicalState();
  state.sceneAttempts = (seed.attempts ?? []) as never;
  state.platformParameters = Object.fromEntries(Object.entries(seed.rows ?? {}).map(([k, v]) => [k, { value: v, description: 'fixture', updatedAt: WRITTEN }]));
  const h = createHarness(state);
  const instant = seed.now ?? new Date('2026-11-23T12:00:00.000Z');
  const deps: ApplicationDeps = { ...h.deps, clock: new SystemClockAdapter('America/Bogota', () => instant) };
  const rowOf = async (key: string) => h.uow.runInTransaction((r) => r.adminParameters.find(key));
  const put = async (key: string, value: string) => {
    const etag = parameterEtag(key, await rowOf(key));
    return new UpdateAdminParameterUseCase(deps).execute({ adminId: ADMIN, key, ifMatch: etag, body: { value } });
  };
  const audits = () => (h.uow.snapshot().adminAudit ?? []);
  return { put, rowOf, audits, h };
};
const codeOf = async (p: Promise<unknown>): Promise<string> => {
  try {
    await p;
    return 'OK';
  } catch (e) {
    return (e as { code?: string }).code ?? 'UNKNOWN';
  }
};

describe('T1296 (i) catalogo: las claves de 5b son escribibles (D9-29: sin scene.provider_location)', () => {
  it('[REQ-CFG9-008] scene.provider_model, scene.global_quota_max y scene.prompt.blocks pasan a writable=true', () => {
    for (const key of ['scene.provider_model', 'scene.global_quota_max', 'scene.prompt.blocks'] as const) expect(ADMIN_PARAMETER_CATALOG[key].writable, key).toBe(true);
    expect(Object.keys(ADMIN_PARAMETER_CATALOG)).not.toContain('scene.provider_location');
  });
});

describe('T1296 (i) [EDGE-009-036] el guardado rechaza combinaciones que superan 5_000_000 micro-USD, sin escribir', () => {
  it('global_quota_max: 66 con el par de 75_000 cabe (4_950_000); 67 supera el tope: 422 ERR-ADMIN-SCENE-COST-CAP-EXCEEDED sin escribir ni auditar', async () => {
    const t = setup({ rows: { 'scene.provider_model': FLASH31, 'scene.provider_location': LOC31 } });
    expect((await t.put('scene.global_quota_max', '66')).value).toBe('66');
    const before = await t.rowOf('scene.global_quota_max');
    expect(await codeOf(t.put('scene.global_quota_max', '67'))).toBe('ERR-ADMIN-SCENE-COST-CAP-EXCEEDED');
    expect(await t.rowOf('scene.global_quota_max')).toEqual(before);
    expect(t.audits().filter((a) => a.action === 'ADMIN_PARAMETER_UPDATE')).toHaveLength(1);
  });

  it('cambio de modelo con gasto previo: 20 imagenes con el de 45_000 + 80 restantes con el de 75_000 supera el tope; con max 20 cabe', async () => {
    const rows = { 'scene.provider_model': FLASH, 'scene.global_quota_max': '100', 'scene.global_quota_used.2026-11': '20' };
    const t = setup({ rows, attempts: many(20, '2026-11', FLASH, LOC) });
    expect(await codeOf(t.put('scene.provider_model', FLASH31))).toBe('ERR-ADMIN-SCENE-COST-CAP-EXCEEDED');
    expect((await t.rowOf('scene.provider_model'))?.value).toBe(FLASH);
    const ok = setup({ rows: { ...rows, 'scene.global_quota_max': '20' }, attempts: many(20, '2026-11', FLASH, LOC) });
    expect((await ok.put('scene.provider_model', FLASH31)).value).toBe(FLASH31);
  });

  it('la decision no filtra cifras ni el gasto acumulado en el error', async () => {
    const t = setup({ rows: { 'scene.provider_model': FLASH31, 'scene.provider_location': LOC31 } });
    let message = '';
    try { await t.put('scene.global_quota_max', '111'); } catch (e) { message = JSON.stringify({ m: (e as Error).message, d: (e as { detail?: unknown }).detail }); }
    expect(message).not.toMatch(/\d{5,}/);
  });

  it('filas de intentos sin par (previas a T1298) se valoran con el coste maximo y pueden bloquear el guardado', async () => {
    const t = setup({ rows: { 'scene.provider_model': FLASH, 'scene.global_quota_used.2026-11': '60' }, attempts: many(60, '2026-11', null, null) }); // 60 x 75_000 = 4_500_000
    expect(await codeOf(t.put('scene.global_quota_max', '111'))).toBe('ERR-ADMIN-SCENE-COST-CAP-EXCEEDED'); // + 51 x 45_000
    expect((await t.put('scene.global_quota_max', '71')).value).toBe('71'); // + 11 x 45_000 = 4_995_000
  });

  it('el reinicio de cuota no reduce el gasto: usadas = 0 con 66 intentos de 75_000 y max 67 supera el tope', async () => {
    const t = setup({ rows: { 'scene.provider_model': FLASH31, 'scene.provider_location': LOC31 }, attempts: many(66, '2026-11', FLASH31, LOC31) });
    expect(await codeOf(t.put('scene.global_quota_max', '67'))).toBe('ERR-ADMIN-SCENE-COST-CAP-EXCEEDED');
  });
});

describe('T1296 (i) pares no verificados y regiones fuera de lista: 422 ERR-SCHEMA-VALIDATION-FAILED sin escribir', () => {
  it.each([
    ['scene.provider_model', 'gemini-3-pro-image'], // en la lista de 3 modelos, pero sin celda verificada en us-central1
    ['scene.provider_model', 'gemini-9-ficticio'],
    ['scene.provider_model', 'gemini-3.1-flash-image-preview'], // retirado (404 en Vertex global)
    ['scene.provider_location', 'us-central1'], // D9-29: la clave sale del catalogo
    ['scene.provider_location', 'evil.example'],
  ])('%s = %j', async (key, value) => {
    const t = setup();
    const before = await t.rowOf(key);
    expect(await codeOf(t.put(key, value))).toBe('ERR-SCHEMA-VALIDATION-FAILED');
    expect(await t.rowOf(key)).toEqual(before);
    expect(t.audits()).toEqual([]);
  });

  it.each(['0', '112', '1000', '-1', 'abc', ' 5 ', '5.5'])('global_quota_max = %j fuera del techo derivado 111 o del formato: 422 de esquema sin escribir', async (value) => {
    const t = setup();
    expect(await codeOf(t.put('scene.global_quota_max', value))).toBe('ERR-SCHEMA-VALIDATION-FAILED');
    expect(await t.rowOf('scene.global_quota_max')).toBeNull();
  });
});

describe('T1296 (i) auditoria: la misma accion de edicion de parametro, sin valor ni cifras', () => {
  it('guardar global_quota_max y el modelo deja ADMIN_PARAMETER_UPDATE con la clave y sin el valor', async () => {
    const t = setup();
    await t.put('scene.global_quota_max', '40');
    await t.put('scene.provider_model', FLASH31);
    const entries = t.audits().filter((a) => a.action === 'ADMIN_PARAMETER_UPDATE');
    expect(entries.map((e) => e.objectRef)).toEqual(['scene.global_quota_max', 'scene.provider_model']); // D9-29: una clave, una auditoria (la region se deriva)
    expect(JSON.stringify(entries)).not.toMatch(/"40"|gemini-3\.1|75000|5000000/);
    expect(t.audits().some((a) => a.action !== 'ADMIN_PARAMETER_UPDATE' && a.action !== 'ADMIN_SESSION_START')).toBe(false);
  });
});

describe('T1296 (i) [EDGE-009-036] el mes de la regla es el calendario de America/Bogota (quota_window), no el de UTC', () => {
  const attempts = (): ReturnType<typeof attempt>[] => [...many(10, '2026-11', FLASH31, LOC31), ...many(60, '2026-12', FLASH31, LOC31)]; // nov: 750_000; dic: 4_500_000
  const rows = { 'scene.provider_model': FLASH31, 'scene.provider_location': LOC31 };

  it('el 30-nov 22:00 en Bogota (1-dic 03:00 UTC) rige la ventana 2026-11: 750_000 + 56 x 75_000 = 4_950_000 cabe', async () => {
    const t = setup({ rows, attempts: attempts(), now: BOGOTA_NOV_30_22H });
    expect((await t.put('scene.global_quota_max', '56')).value).toBe('56');
  });

  it('el 1-dic 00:00 en Bogota rige la ventana 2026-12: 4_500_000 + 56 x 75_000 supera el tope', async () => {
    const t = setup({ rows, attempts: attempts(), now: BOGOTA_DEC_1_00H });
    expect(await codeOf(t.put('scene.global_quota_max', '56'))).toBe('ERR-ADMIN-SCENE-COST-CAP-EXCEEDED');
  });

  it('las usadas son las de la ventana de Bogota: scene.global_quota_used.2026-11 descuenta en el 30-nov 22:00 (usadas 10: 750_000 + 46 x 75_000 cabe; max 56 con usadas 0 no)', async () => {
    const used = setup({ rows: { ...rows, 'scene.global_quota_used.2026-11': '10', 'scene.global_quota_used.2026-12': '60' }, attempts: attempts(), now: BOGOTA_NOV_30_22H });
    expect((await used.put('scene.global_quota_max', '56')).value).toBe('56');
    const none = setup({ rows, attempts: attempts(), now: BOGOTA_NOV_30_22H });
    expect(await codeOf(none.put('scene.global_quota_max', '60'))).toBe('ERR-ADMIN-SCENE-COST-CAP-EXCEEDED'); // 750_000 + 60 x 75_000 = 5_250_000
  });
});

describe('T1296 OBS-1 scene.prompt.blocks: guardado de bloques validado con validatePromptBlocks (A-2, maxBlockLength 1000)', () => {
  const KEY = 'scene.prompt.blocks';
  const withBlock = (text: string): string => JSON.stringify({ ...DEFAULT_PROMPT_BLOCKS, [PROMPT_BLOCK_NAMES[0]]: text });

  it('bloques correctos se escriben, rigen como valor y la auditoria no lleva el texto', async () => {
    const t = setup();
    const value = withBlock('Texto editado por el administrador, sin marcadores.');
    expect((await t.put(KEY, value)).value).toBe(value);
    expect((await t.rowOf(KEY))?.value).toBe(value);
    const entries = t.audits().filter((a) => a.action === 'ADMIN_PARAMETER_UPDATE');
    expect(entries.map((e) => e.objectRef)).toEqual([KEY]);
    expect(JSON.stringify(entries)).not.toContain('administrador');
  });

  it('el JSON de los bloques vigentes (defecto) tambien se acepta', async () => {
    expect((await setup().put(KEY, JSON.stringify(DEFAULT_PROMPT_BLOCKS))).value).toBe(JSON.stringify(DEFAULT_PROMPT_BLOCKS));
  });

  it.each([
    ['marcador desconocido {petName}', withBlock('Hola {petName}')],
    ['bloque vacio', withBlock('')],
    ['bloque mayor a 1000 caracteres', withBlock('x'.repeat(1001))],
    ['JSON invalido', '{no es json'],
    ['objeto vacio', '{}'],
  ])('%s: 422 ERR-SCHEMA-VALIDATION-FAILED sin escribir ni auditar', async (_name, value) => {
    const t = setup();
    expect(await codeOf(t.put(KEY, value))).toBe('ERR-SCHEMA-VALIDATION-FAILED');
    expect(await t.rowOf(KEY)).toBeNull();
    expect(t.audits()).toEqual([]);
  });
});
