import { describe, expect, it } from 'vitest';
import { ListAdminParametersUseCase } from '../../src/application/use-cases/admin-parameter-use-cases.ts';
import type { ApplicationDeps } from '../../src/application/use-cases/use-case-support.ts';
import { SCENE_COST_TABLE_MICRO_USD, sceneImagesFit } from '../../src/domain/scene/scene-cost.ts';
import { SystemClockAdapter } from '../../src/infrastructure/adapters/system-clock.adapter.ts';
import { canonicalState, createHarness } from '../fixtures/application-harness.ts';

/**
 * T1307 (009, 5b; contrato admin 1.5.0): `sceneImagesFit` = imagenes que aun caben por par seleccionable = floor(max(0, 5_000_000 - gasto) / coste del par), solo pares de la tabla
 * aprobada, en el orden de la tabla; falla cerrado = lista vacia. EDGE-009-036, REQ-CFG9-004; SC-009-051.
 */
const FLASH = 'gemini-2.5-flash-image';
const FLASH31 = 'gemini-3.1-flash-image-preview'; // D9-27: el par valido es preview + global
const LOC31 = 'global';
const LOC = 'us-central1';
const started = '2026-11-10T12:00:00.000Z';
let seq = 0;
const attempt = (window: string, model: string | null, location: string | null, at: string | null = started) => ({
  id: `a2000000-0000-4000-8000-${String(++seq).padStart(12, '0')}`, sceneId: 's', actorUserId: 'u', action: 'UPDATE', mode: 'FROM_SCRATCH', fingerprint: 'f', inputsSnapshot: '{}', resultObjectId: `r${seq}`,
  phase: 'PENDING', claimedAt: null, providerCallStartedAt: at, providerModel: model, providerLocation: location, quotaWindow: window, quotaMax: 5, outcome: null, errorCode: null,
  degraded: false, idempotencyKeyHash: null, idempotencyExpiresAt: null, startedAt: started, finishedAt: null,
});
const many = (n: number, window: string, model: string | null, location: string | null) => Array.from({ length: n }, () => attempt(window, model, location));
const asAttempts = (rows: ReturnType<typeof attempt>[]) => rows;

describe('T1307 sceneImagesFit (funcion pura)', () => {
  it('sin gasto: 111 con el de 45_000 y 66 con el de 75_000, en el orden de la tabla', () => {
    expect(sceneImagesFit(SCENE_COST_TABLE_MICRO_USD, [])).toEqual([
      { model: FLASH, location: LOC, imagesFit: 111 },
      { model: FLASH31, location: LOC31, imagesFit: 66 },
    ]);
  });

  it('descuenta el gasto por intento: 20 con el de 45_000 (900_000) deja 91 y 54; intentos sin par cuestan el maximo; sin llamada no cuentan', () => {
    const fit = sceneImagesFit(SCENE_COST_TABLE_MICRO_USD, asAttempts([...many(20, '2026-11', FLASH, LOC), attempt('2026-11', FLASH, LOC, null)]));
    expect(fit.map((f) => f.imagesFit)).toEqual([Math.floor(4_100_000 / 45_000), Math.floor(4_100_000 / 75_000)]);
    const unknown = sceneImagesFit(SCENE_COST_TABLE_MICRO_USD, asAttempts(many(10, '2026-11', null, null)));
    expect(unknown.map((f) => f.imagesFit)).toEqual([Math.floor(4_250_000 / 45_000), Math.floor(4_250_000 / 75_000)]);
  });

  it('gasto igual o mayor que el tope: 0 imagenes (no es par no seleccionable); tabla vacia: lista vacia (falla cerrado)', () => {
    expect(sceneImagesFit(SCENE_COST_TABLE_MICRO_USD, asAttempts(many(70, '2026-11', FLASH31, LOC31))).map((f) => f.imagesFit)).toEqual([0, 0]);
    expect(sceneImagesFit({}, [])).toEqual([]);
  });

  it('el resultado solo lleva modelo, region y numero de imagenes (sin costes ni gasto)', () => {
    for (const f of sceneImagesFit(SCENE_COST_TABLE_MICRO_USD, [])) expect(Object.keys(f).sort()).toEqual(['imagesFit', 'location', 'model']);
  });
});

describe('T1307 GET /api/admin/parameters: el caso de uso devuelve sceneImagesFit con el mes de America/Bogota', () => {
  const build = (attempts: ReturnType<typeof attempt>[], now: Date) => {
    const state = canonicalState();
    state.sceneAttempts = attempts as never;
    const h = createHarness(state);
    const deps: ApplicationDeps = { ...h.deps, clock: new SystemClockAdapter('America/Bogota', () => now) };
    return new ListAdminParametersUseCase(deps);
  };

  it('devuelve items (6) y sceneImagesFit', async () => {
    const out = await build([], new Date('2026-11-23T12:00:00.000Z')).execute();
    expect(out.items).toHaveLength(6);
    expect(out.sceneImagesFit).toEqual([
      { model: FLASH, location: LOC, imagesFit: 111 },
      { model: FLASH31, location: LOC31, imagesFit: 66 },
    ]);
  });

  it('usa la ventana de Bogota: el 30-nov 22:00 (1-dic 03:00 UTC) cuenta noviembre; el 1-dic 00:00 Bogota cuenta diciembre', async () => {
    const rows = [...many(10, '2026-11', FLASH31, LOC31), ...many(60, '2026-12', FLASH31, LOC31)]; // nov 750_000; dic 4_500_000
    const nov = await build(rows, new Date('2026-12-01T03:00:00.000Z')).execute();
    expect(nov.sceneImagesFit.map((f) => f.imagesFit)).toEqual([Math.floor(4_250_000 / 45_000), Math.floor(4_250_000 / 75_000)]);
    const dec = await build(rows, new Date('2026-12-01T05:00:00.000Z')).execute();
    expect(dec.sceneImagesFit.map((f) => f.imagesFit)).toEqual([Math.floor(500_000 / 45_000), Math.floor(500_000 / 75_000)]);
  });
});
