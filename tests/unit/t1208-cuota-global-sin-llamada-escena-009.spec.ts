import { describe, expect, it } from 'vitest';
import type { SceneGlobalQuotaPort } from '../../src/application/ports/scene-global-quota.port.ts';
import type { UnitOfWorkPort } from '../../src/application/ports/unit-of-work.port.ts';
import { RunSceneGenerationUseCase } from '../../src/application/use-cases/scene-run-use-case.ts';
import { RequestSceneGenerationUseCase, type SceneTarget } from '../../src/application/use-cases/scene-use-cases.ts';
import type { ApplicationDeps } from '../../src/application/use-cases/use-case-support.ts';
import { SCENE_GLOBAL_QUOTA_USED_PREFIX } from '../../src/domain/scene/provider-parameters.ts';
import { SqlSceneGlobalQuota } from '../../src/infrastructure/persistence/scene-global-quota.ts';
import { IN_MEMORY_DATABASE, openSqliteDatabase } from '../../src/infrastructure/persistence/sqlite/sqlite-database.ts';
import { ANDRES, HOUSEHOLD, canonicalState, createHarness } from '../fixtures/application-harness.ts';
import { ControlledStorage } from '../fixtures/media-harness.ts';
import { sceneFixture } from '../fixtures/scene-services-fixtures.ts';

/**
 * T1208 y T1280 (009, Fase 1, bloque A, `#60`): cuota global mensual solo con llamada vigente (ADR-009-01, orden verificar vigencia -> `tryConsume` -> reverificar y
 * marcar -> `refund`) y sobreconteo conservador aceptado ante una caída física (`P5-01` = B). REQ-LIM9-003, INV-LIM9-002; EDGE-009-028, EDGE-009-042; SC-009-038, SC-009-039.
 */
const HOUSE: SceneTarget = { kind: 'HOUSEHOLD', householdId: HOUSEHOLD.id };
const NOW = '2026-11-05T12:00:00.000Z';
const WINDOW = '2026-11';
const KEY = 'b0000000-0000-4000-8000-000000000001';
const signal = (): AbortSignal => new AbortController().signal;

/** Cuota en memoria con ganchos: lleva la cuenta de `tryConsume` y `refund`. */
class CountingQuota implements SceneGlobalQuotaPort {
  used = 0;
  consumeCalls = 0;
  refundCalls = 0;
  grant = true;
  afterConsume: (() => Promise<void>) | null = null;
  async tryConsume(_window?: string): Promise<boolean> {
    this.consumeCalls += 1;
    if (!this.grant) return false;
    this.used += 1;
    if (this.afterConsume !== null) await this.afterConsume();
    return true;
  }
  /** Lectura sin consumo (REQ-ESC6-039): este doble nunca está agotado. */
  async isExhausted(): Promise<boolean> {
    return false;
  }
  async refund(): Promise<void> {
    this.refundCalls += 1;
    if (this.used > 0) this.used -= 1;
  }
}

/** `UnitOfWork` que simula una caída física del proceso: la siguiente transacción tras el gancho lanza y no escribe nada. */
class CrashingUow implements UnitOfWorkPort {
  crash = false;
  constructor(private readonly inner: UnitOfWorkPort) {}
  runInTransaction<T>(work: Parameters<UnitOfWorkPort['runInTransaction']>[0] extends infer W ? (W extends (r: infer R) => infer P ? (r: R) => P : never) : never): Promise<T> {
    if (this.crash) {
      this.crash = false;
      return Promise.reject(new Error('CAIDA-FISICA'));
    }
    return this.inner.runInTransaction(work as never) as Promise<T>;
  }
}

function setup(quota: SceneGlobalQuotaPort, images: Parameters<typeof sceneFixture>[0] = {}) {
  const h = createHarness(canonicalState());
  const fixture = sceneFixture({ globalQuota: quota, ...images });
  const storage = new ControlledStorage(() => new Date(NOW));
  const crashing = new CrashingUow(h.uow);
  const deps: ApplicationDeps = {
    ...h.deps,
    uow: crashing,
    scene: fixture.services,
    media: { storage, limits: { maxBytes: 10_485_760, maxBytesPerOwner: 1_073_741_824, maxConcurrentUploads: 4, signedUrlTtlSeconds: 300 } },
  };
  return { h, fixture, crashing, deps, request: new RequestSceneGenerationUseCase(deps), run: new RunSceneGenerationUseCase(deps) };
}
type T = ReturnType<typeof setup>;
const snap = (t: T) => t.h.uow.snapshot();
async function requested(t: T) {
  await t.request.execute(ANDRES, HOUSE, { action: 'UPDATE' }, KEY);
  const attempt = snap(t).sceneAttempts?.[0];
  return { sceneId: attempt?.sceneId ?? '', attemptId: attempt?.id ?? '' };
}
const cancelScene = (t: T, sceneId: string) => t.h.uow.runInTransaction((r) => r.scenes.cancelInFlight(sceneId, NOW));

describe('cuota global solo con llamada vigente (T1208, ADR-009-01)', () => {
  it('[SC-009-038][INV-LIM9-002][EDGE-009-028] un intento cancelado antes de la llamada NO consume: se verifica la vigencia antes de tryConsume, de modo que el contador queda igual y no hay llamada ni marca', async () => {
    const quota = new CountingQuota();
    let tc: T | undefined;
    let armed = false;
    const realFit = sceneFixture().services.images.fit;
    tc = setup(quota, {
      images: {
        fit: (sizes) => {
          if (armed && tc !== undefined) {
            armed = false;
            void cancelScene(tc, snap(tc).sceneAttempts?.[0]?.sceneId ?? '');
          }
          return realFit(sizes);
        },
      },
    });
    const jc = await requested(tc);
    armed = true;
    const result = await tc.run.execute(jc, signal());
    expect(result).toBe('CANCELLED');
    expect([quota.consumeCalls, quota.used, quota.refundCalls]).toEqual([0, 0, 0]);
    expect(tc.fixture.generator.calls).toHaveLength(0);
    expect(snap(tc).sceneAttempts?.[0]).toMatchObject({ outcome: 'CANCELLED', providerCallStartedAt: null });
  });

  it('[SC-009-039][REQ-LIM9-003] cuota agotada: el intento falla sin llamada y sin marca, y no cuenta para los límites de 24 h', async () => {
    const quota = new CountingQuota();
    quota.grant = false;
    const t = setup(quota);
    const j = await requested(t);
    expect(await t.run.execute(j, signal())).toBe('FAILED');
    expect(t.fixture.generator.calls).toHaveLength(0);
    expect(snap(t).sceneAttempts?.[0]).toMatchObject({ outcome: 'FAILED', providerCallStartedAt: null });
    const counts = await t.h.uow.runInTransaction(async (r) => [(await r.scenes.countFailedAttemptsByScene(j.sceneId, '2026-11-04T00:00:00.000Z')).count, await r.scenes.countAttemptsByActor(ANDRES, '2026-11-04T00:00:00.000Z')]);
    expect(counts).toEqual([0, 0]);
    expect(quota.refundCalls).toBe(0);
  });

  it('[INV-LIM9-002][EDGE-009-028] carrera entre el consumo y la marca: si el intento se cancela tras tryConsume, la unidad se devuelve con refund y no hay llamada ni marca (contador sin cambio neto)', async () => {
    const quota = new CountingQuota();
    const t = setup(quota);
    const j = await requested(t);
    quota.afterConsume = async () => void (await cancelScene(t, j.sceneId));
    expect(await t.run.execute(j, signal())).toBe('CANCELLED');
    expect([quota.consumeCalls, quota.used, quota.refundCalls]).toEqual([1, 0, 1]);
    expect(t.fixture.generator.calls).toHaveLength(0);
    expect(snap(t).sceneAttempts?.[0]).toMatchObject({ outcome: 'CANCELLED', providerCallStartedAt: null });
  });

  it('[REQ-LIM9-003][REQ-LIM9-006][SC-009-037] camino con llamada: tryConsume una vez, marca antes de llamar al generador y unidad descontada (sin refund)', async () => {
    const quota = new CountingQuota();
    const t = setup(quota);
    const j = await requested(t);
    expect(await t.run.execute(j, signal())).toBe('PUBLISHED');
    expect([quota.consumeCalls, quota.used, quota.refundCalls]).toEqual([1, 1, 0]);
    expect(snap(t).sceneAttempts?.[0]?.providerCallStartedAt).toBe(NOW);
    expect(t.fixture.generator.calls).toHaveLength(1);
  });
});

describe('sobreconteo conservador ante caída física (T1280, EDGE-009-042, P5-01 = B)', () => {
  type Maker = { name: string; make: () => { quota: SceneGlobalQuotaPort; used: () => number; crashAfterConsume: (t: T) => void } };
  const sqliteMaker = (): ReturnType<Maker['make']> => {
    const db = openSqliteDatabase(IN_MEMORY_DATABASE);
    const quota = SqlSceneGlobalQuota.forSqlite(db, { readMax: async () => 5, now: () => NOW });
    const used = (): number => Number((db.prepare('SELECT value FROM platform_parameters WHERE key = ?').get(`${SCENE_GLOBAL_QUOTA_USED_PREFIX}${WINDOW}`) as { value: string } | undefined)?.value ?? '0');
    const wrapped: SceneGlobalQuotaPort = { tryConsume: (w) => quota.tryConsume(w).then((ok) => (hook.fn(), ok)), refund: (w) => quota.refund(w), isExhausted: async () => false };
    return { quota: wrapped, used, crashAfterConsume: (t) => (hook.fn = () => void (t.crashing.crash = true)) };
  };
  const pgMaker = (): ReturnType<Maker['make']> => {
    let value = 0;
    const client = {
      query: async (text: string) => {
        if (text.startsWith('UPDATE') && text.includes('< $3')) {
          value += 1;
          return { rows: [], rowCount: 1 };
        }
        if (text.startsWith('UPDATE') && text.includes('> 0')) value = Math.max(0, value - 1);
        return { rows: [], rowCount: 0 };
      },
    };
    const quota = SqlSceneGlobalQuota.forPostgres(client, { readMax: async () => 5, now: () => NOW });
    const wrapped: SceneGlobalQuotaPort = { tryConsume: (w) => quota.tryConsume(w).then((ok) => (hook.fn(), ok)), refund: (w) => quota.refund(w), isExhausted: async () => false };
    return { quota: wrapped, used: () => value, crashAfterConsume: (t) => (hook.fn = () => void (t.crashing.crash = true)) };
  };
  const memoryMaker = (): ReturnType<Maker['make']> => {
    const q = new CountingQuota();
    const wrapped: SceneGlobalQuotaPort = { tryConsume: () => q.tryConsume().then((ok) => (hook.fn(), ok)), refund: () => q.refund(), isExhausted: async () => false };
    return { quota: wrapped, used: () => q.used, crashAfterConsume: (t) => (hook.fn = () => void (t.crashing.crash = true)) };
  };
  const hook = { fn: (): void => undefined };

  it.each([
    ['Memoria', memoryMaker],
    ['SQLite', sqliteMaker],
    ['PostgreSQL (doble)', pgMaker],
  ] as const)('[EDGE-009-042][SC-009-038] %s: una caída entre tryConsume y la marca deja A LO SUMO una unidad sobrecontada, sin llamada al proveedor y sin devolución automática', async (_name, make) => {
    hook.fn = () => undefined;
    const { quota, used, crashAfterConsume } = make();
    const t = setup(quota);
    const j = await requested(t);
    crashAfterConsume(t);
    await expect(t.run.execute(j, signal())).rejects.toThrow('CAIDA-FISICA');
    expect(used()).toBe(1);
    expect(t.fixture.generator.calls).toHaveLength(0);
    expect(snap(t).sceneAttempts?.[0]?.providerCallStartedAt ?? null).toBeNull();
  });

  it('[EDGE-009-042] no existe reconciliación: el puerto de cuota solo expone tryConsume, refund y la lectura sin consumo isExhausted (REQ-ESC6-039), y tryConsume y la marca NO comparten transacción (el contador queda descontado tras la caída: sobreconteo, no gasto sin descontar)', () => {
    const methods = Object.getOwnPropertyNames(SqlSceneGlobalQuota.prototype).filter((m) => m !== 'constructor');
    expect(methods.sort()).toEqual(['isExhausted', 'refund', 'tryConsume']);
  });
});
