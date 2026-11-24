import { describe, expect, it } from 'vitest';
import * as providerParameters from '../../src/domain/scene/provider-parameters.ts';
import { ADMIN_PARAMETER_CATALOG } from '../../src/domain/platform/admin-parameter-catalog.ts';

/**
 * T1292 (Feature 009, Fase 5b, #20): PRUEBAS ROJAS de la regla de coste EDGE-009-036 (D9-21 = A corregida, D9-22 = A). Sin implementar produccion.
 * REQ-CFG9-004, REQ-CFG9-008, NFR-009-003, EDGE-009-021, EDGE-009-036; SC-009-022, SC-009-023, SC-009-051.
 *
 * Contrato de modulo que estas pruebas FIJAN para T1296 (nombres = propuesta de /keymaker, PURO, sin E/S, sin Number de coma flotante en el calculo):
 *  - `src/domain/scene/scene-cost.ts` exporta:
 *      `SCENE_MONTHLY_CAP_MICRO_USD` (= 5_000_000), `SCENE_COST_TABLE_MICRO_USD` (modelo -> region -> micro-USD enteros, Anexo A APROBADO de la Enmienda 009-B 3.10.0),
 *      `sceneUnitCost(table, model, location): number | null`, `sceneCostCeiling(table): number | null` (= floor(5_000_000 / costeMin); `null` con tabla vacia),
 *      `sceneAccumulatedSpend(attempts, table): number | null` (`null` = fail-closed con tabla vacia),
 *      `evaluateSceneSpendRule({ table, attempts, used, model, location, max }): SpendDecision`.
 *  - `attempts[i]` = `{ providerModel: string|null, providerLocation: string|null, providerCallStartedAt: string|null }` (columnas de T1298); solo cuentan los de
 *    `providerCallStartedAt` no nulo; un par nulo o ausente de la tabla se valora con el coste MAXIMO de la tabla (cota conservadora).
 *  - `SpendDecision` = `{ ok: true, remainingImages, accumulatedMicroUsd, projectedMicroUsd } | { ok: false, reason: 'PAIR_NOT_SELECTABLE' | 'SPEND_EXCEEDED' | 'TABLE_EMPTY', ... }`.
 *  - `SCENE_GLOBAL_QUOTA_MAX_CEILING = 1000` desaparece de `provider-parameters.ts`; el techo del catalogo y `parseSceneGlobalQuotaMax` derivan de la tabla real (111).
 * Los costes de los casos con tabla propia son de CONFIGURACION DE PRUEBA, no tarifas. Los de la tabla real son los del Anexo A aprobado (45_000 y 75_000 en us-central1).
 */
const MODULE = '../../src/domain/scene/scene-cost.ts';
type Table = Readonly<Record<string, Readonly<Record<string, number>>>>;
interface Attempt { readonly providerModel: string | null; readonly providerLocation: string | null; readonly providerCallStartedAt: string | null; readonly [extra: string]: unknown }
interface Decision { readonly ok: boolean; readonly reason?: string; readonly remainingImages?: number; readonly accumulatedMicroUsd?: number; readonly projectedMicroUsd?: number }
interface CostModule {
  readonly SCENE_MONTHLY_CAP_MICRO_USD: number;
  readonly SCENE_COST_TABLE_MICRO_USD: Table;
  readonly sceneUnitCost: (table: Table, model: string, location: string) => number | null;
  readonly sceneCostCeiling: (table: Table) => number | null;
  readonly sceneAccumulatedSpend: (attempts: readonly Attempt[], table: Table) => number | null;
  readonly evaluateSceneSpendRule: (input: { table: Table; attempts: readonly Attempt[]; used: number; model: string; location: string; max: number }) => Decision;
}
const load = async (): Promise<CostModule> => (await import(/* @vite-ignore */ MODULE)) as CostModule;

const FLASH = 'gemini-2.5-flash-image';
const FLASH31 = 'gemini-3.1-flash-image-preview'; // D9-27: el par valido es preview + global
const LOC31 = 'global';
const PRO = 'gemini-3-pro-image';
const LOC = 'us-central1';
const STARTED = '2026-11-10T12:00:00.000Z';
const attempt = (model: string | null, location: string | null, started: string | null = STARTED, extra: Record<string, unknown> = {}): Attempt => ({ providerModel: model, providerLocation: location, providerCallStartedAt: started, ...extra });
const many = (n: number, model: string | null, location: string | null): Attempt[] => Array.from({ length: n }, () => attempt(model, location));

// Tabla de PRUEBA (no tarifas): caro 240_000, barato 40_000. 20 intentos caros = 4_800_000 (el 4,80 USD del acta de /merovingian).
const TEST_TABLE: Table = { 'm-caro': { [LOC]: 240_000, 'us-east4': 300_000 }, 'm-barato': { [LOC]: 40_000 } };

describe('T1292 [EDGE-009-036] tabla aprobada del Anexo A y techo derivado', () => {
  it('el tope es 5_000_000 micro-USD y la tabla real trae exactamente los dos pares verificados de us-central1 (45_000 y 75_000)', async () => {
    const m = await load();
    expect(m.SCENE_MONTHLY_CAP_MICRO_USD).toBe(5_000_000);
    expect(m.sceneUnitCost(m.SCENE_COST_TABLE_MICRO_USD, FLASH, LOC)).toBe(45_000);
    expect(m.sceneUnitCost(m.SCENE_COST_TABLE_MICRO_USD, FLASH31, LOC31)).toBe(75_000); // D9-27
    for (const [model, byRegion] of Object.entries(m.SCENE_COST_TABLE_MICRO_USD)) for (const cost of Object.values(byRegion)) {
      expect(Number.isInteger(cost), `${model}: micro-USD entero`).toBe(true);
      expect(cost).toBeGreaterThan(0);
    }
  });

  it('pares sin celda verificada NO son seleccionables: pro en us-central1, global en cualquier modelo, region o modelo desconocidos', async () => {
    const m = await load();
    const t = m.SCENE_COST_TABLE_MICRO_USD;
    expect(m.sceneUnitCost(t, PRO, LOC)).toBeNull();
    expect(m.sceneUnitCost(t, PRO, 'global')).toBeNull();
    expect(m.sceneUnitCost(t, FLASH, 'global')).toBeNull();
    expect(m.sceneUnitCost(t, FLASH31, LOC)).toBeNull(); // D9-27: preview + us-central1 es invalido
    expect(m.sceneUnitCost(t, FLASH, 'us-east4')).toBeNull();
    expect(m.sceneUnitCost(t, 'gemini-9-ficticio', LOC)).toBeNull();
    expect(m.sceneUnitCost(t, FLASH, 'us-central1/../x')).toBeNull();
  });

  it('el techo deriva de la tabla: floor(5_000_000 / 45_000) = 111 con la real; floor(5_000_000 / 40_000) = 125 con la de prueba; nunca 1000', async () => {
    const m = await load();
    expect(m.sceneCostCeiling(m.SCENE_COST_TABLE_MICRO_USD)).toBe(111);
    expect(m.sceneCostCeiling(TEST_TABLE)).toBe(125);
    expect(m.sceneCostCeiling({ x: { [LOC]: 5_000_000 } })).toBe(1);
  });

  it('SCENE_GLOBAL_QUOTA_MAX_CEILING = 1000 se elimina; parseSceneGlobalQuotaMax y el catalogo usan el techo derivado (111 cabe, 112 no)', () => {
    expect('SCENE_GLOBAL_QUOTA_MAX_CEILING' in providerParameters, 'la constante 1000 debe retirarse (T1296)').toBe(false);
    expect(providerParameters.parseSceneGlobalQuotaMax('111')).toBe(111);
    expect(providerParameters.parseSceneGlobalQuotaMax('112')).toBeNull();
    expect(providerParameters.parseSceneGlobalQuotaMax('1000')).toBeNull();
    const c = ADMIN_PARAMETER_CATALOG['scene.global_quota_max'].constraints;
    expect(c.min).toBe(1);
    expect(c.max).toBe(111);
  });
});

describe('T1292 [EDGE-009-036][SC-009-051] gasto acumulado por intento (provider_model x provider_location)', () => {
  it('suma el coste del par registrado en cada intento con llamada; los cerrados antes del proveedor (started null) no cuentan', async () => {
    const m = await load();
    const rows = [...many(2, 'm-caro', LOC), ...many(3, 'm-barato', LOC), attempt('m-caro', LOC, null), attempt('m-caro', 'us-east4')];
    expect(m.sceneAccumulatedSpend(rows, TEST_TABLE)).toBe(2 * 240_000 + 3 * 40_000 + 300_000);
  });

  it('filas sin modelo/region (previas a T1298) o con un par ya fuera de la tabla se valoran con el coste MAXIMO de la tabla (300_000 en la de prueba)', async () => {
    const m = await load();
    expect(m.sceneAccumulatedSpend([attempt(null, null), attempt('m-caro', null), attempt(null, LOC), attempt('m-retirado', LOC)], TEST_TABLE)).toBe(4 * 300_000);
    expect(m.sceneAccumulatedSpend([attempt(null, null)], m.SCENE_COST_TABLE_MICRO_USD)).toBe(75_000);
  });

  it('un intento FALLIDO con llamada ejecutada cuenta completo (el estado/resultado no reduce el coste)', async () => {
    const m = await load();
    const failed = attempt(FLASH, LOC, STARTED, { status: 'FAILED', errorCode: 'ERR-SCENE-GENERATION-FAILED' });
    const timedOut = attempt(FLASH31, LOC31, STARTED, { status: 'TIMEOUT' });
    expect(m.sceneAccumulatedSpend([failed, timedOut], m.SCENE_COST_TABLE_MICRO_USD)).toBe(45_000 + 75_000);
  });

  it('el reinicio de cuota de una cuenta NO reduce el gasto: depende solo de los intentos, no de consumed_generations', async () => {
    const m = await load();
    const before = [...many(20, 'm-caro', LOC)].map((a) => ({ ...a, consumedGenerations: 20 }));
    const afterReset = before.map((a) => ({ ...a, consumedGenerations: 0 }));
    expect(m.sceneAccumulatedSpend(afterReset, TEST_TABLE)).toBe(4_800_000);
    expect(m.sceneAccumulatedSpend(afterReset, TEST_TABLE)).toBe(m.sceneAccumulatedSpend(before, TEST_TABLE));
    const d = m.evaluateSceneSpendRule({ table: TEST_TABLE, attempts: afterReset, used: 20, model: 'm-barato', location: LOC, max: 125 });
    expect(d.ok).toBe(false);
  });
});

describe('T1292 [EDGE-009-036][SC-009-051] formula gastoAcumuladoMes + max(0, max - usadas) x T <= 5_000_000', () => {
  it('CONTRAEJEMPLO del acta de /merovingian: 4,80 USD gastados con el modelo caro (20 imagenes) y paso al barato con 125 se RECHAZA (4_800_000 + 105 x 40_000)', async () => {
    const m = await load();
    const d = m.evaluateSceneSpendRule({ table: TEST_TABLE, attempts: many(20, 'm-caro', LOC), used: 20, model: 'm-barato', location: LOC, max: 125 });
    expect(d.ok).toBe(false);
    expect(d.reason).toBe('SPEND_EXCEEDED');
    expect(JSON.stringify(d)).not.toMatch(/m-barato|m-caro/); // sin valores en la decision
  });

  it('el mismo gasto con un max que SI cabe se acepta y informa cuantas imagenes aun caben (resultado previo al guardado)', async () => {
    const m = await load();
    // 4_800_000 + (25 - 20) x 40_000 = 5_000_000 <= tope (justo en el borde)
    const ok = m.evaluateSceneSpendRule({ table: TEST_TABLE, attempts: many(20, 'm-caro', LOC), used: 20, model: 'm-barato', location: LOC, max: 25 });
    expect(ok).toMatchObject({ ok: true, accumulatedMicroUsd: 4_800_000, projectedMicroUsd: 5_000_000, remainingImages: 5 });
    const over = m.evaluateSceneSpendRule({ table: TEST_TABLE, attempts: many(20, 'm-caro', LOC), used: 20, model: 'm-barato', location: LOC, max: 26 });
    expect(over.ok).toBe(false);
  });

  it('max <= usadas no suma nada (max(0, max - usadas)): con gasto bajo el tope se acepta aunque la tabla del par nuevo sea cara', async () => {
    const m = await load();
    expect(m.evaluateSceneSpendRule({ table: TEST_TABLE, attempts: many(10, 'm-barato', LOC), used: 10, model: 'm-caro', location: LOC, max: 10 }).ok).toBe(true);
    expect(m.evaluateSceneSpendRule({ table: TEST_TABLE, attempts: many(10, 'm-barato', LOC), used: 10, model: 'm-caro', location: LOC, max: 3 }).ok).toBe(true);
  });

  it('con la tabla real: 111 imagenes con el barato caben (4_995_000), 112 no; con el de 75_000 caben 66 (4_950_000) y 67 no', async () => {
    const m = await load();
    const t = m.SCENE_COST_TABLE_MICRO_USD;
    const run = (model: string, max: number): Decision => m.evaluateSceneSpendRule({ table: t, attempts: [], used: 0, model, location: model === FLASH31 ? LOC31 : LOC, max });
    expect(run(FLASH, 111)).toMatchObject({ ok: true, projectedMicroUsd: 4_995_000 });
    expect(run(FLASH, 112).ok).toBe(false);
    expect(run(FLASH31, 66)).toMatchObject({ ok: true, projectedMicroUsd: 4_950_000 });
    expect(run(FLASH31, 67).ok).toBe(false);
  });

  it('el gasto del mes ya hecho con filas sin modelo (coste maximo) puede bloquear un guardado que con el par real cabria', async () => {
    const m = await load();
    const t = m.SCENE_COST_TABLE_MICRO_USD;
    const unknown = many(60, null, null); // 60 x 75_000 = 4_500_000
    const d = m.evaluateSceneSpendRule({ table: t, attempts: unknown, used: 60, model: FLASH, location: LOC, max: 111 });
    expect(d.ok).toBe(false); // 4_500_000 + 51 x 45_000 = 6_795_000
    expect(m.evaluateSceneSpendRule({ table: t, attempts: unknown, used: 60, model: FLASH, location: LOC, max: 71 }).ok).toBe(true); // 4_500_000 + 11 x 45_000 = 4_995_000
  });
});

describe('T1292 [EDGE-009-036] pares no seleccionables y fail-closed', () => {
  it.each([
    [PRO, LOC], [PRO, 'global'], [FLASH, 'global'], [FLASH31, LOC], [FLASH, 'us-east4'], ['gemini-9-ficticio', LOC],
  ])('el par (%s, %s) se rechaza con PAIR_NOT_SELECTABLE aunque el gasto sea 0', async (model, location) => {
    const m = await load();
    const d = m.evaluateSceneSpendRule({ table: m.SCENE_COST_TABLE_MICRO_USD, attempts: [], used: 0, model, location, max: 1 });
    expect(d).toMatchObject({ ok: false, reason: 'PAIR_NOT_SELECTABLE' });
  });

  it('tabla VACIA: ni gasto ni techo existen; modelo, region y scene.global_quota_max NO se pueden editar (no cae a 1000 ni a otro valor)', async () => {
    const m = await load();
    expect(m.sceneCostCeiling({})).toBeNull();
    expect(m.sceneAccumulatedSpend([], {})).toBeNull();
    for (const [model, location, max] of [[FLASH, LOC, 1], [FLASH31, LOC31, 5], [PRO, 'global', 1000]] as const) {
      expect(m.evaluateSceneSpendRule({ table: {}, attempts: [], used: 0, model, location, max })).toMatchObject({ ok: false, reason: 'TABLE_EMPTY' });
    }
  });

  it('un cambio solo de scene.global_quota_max con el par vigente tambien pasa por la regla (60 gastados a 75_000: max 66 cabe, 67 no)', async () => {
    const m = await load();
    const rows = many(60, FLASH31, LOC31); // 4_500_000
    const run = (max: number): Decision => m.evaluateSceneSpendRule({ table: m.SCENE_COST_TABLE_MICRO_USD, attempts: rows, used: 60, model: FLASH31, location: LOC31, max });
    expect(run(66)).toMatchObject({ ok: true, projectedMicroUsd: 4_950_000 }); // 4_500_000 + 6 x 75_000
    expect(run(67)).toMatchObject({ ok: false, reason: 'SPEND_EXCEEDED' }); // 5_025_000
  });
});
