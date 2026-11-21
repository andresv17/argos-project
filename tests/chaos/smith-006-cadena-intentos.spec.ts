import { describe, expect, it } from 'vitest';
import type { RepositorySet } from '../../src/application/ports/repositories.port.ts';
import type { SceneGenerationRequest, SceneGenerationResult, SceneImageGeneratorPort } from '../../src/application/ports/scene-image-generator.port.ts';
import type { UnitOfWorkPort } from '../../src/application/ports/unit-of-work.port.ts';
import { CreateHouseholdUseCase } from '../../src/application/use-cases/household-use-cases.ts';
import { RevokeSceneConsentUseCase } from '../../src/application/use-cases/scene-consent-use-cases.ts';
import { SceneLifecycleHooks } from '../../src/application/use-cases/scene-lifecycle-hooks.ts';
import { RunSceneGenerationUseCase } from '../../src/application/use-cases/scene-run-use-case.ts';
import { GetSceneUseCase, RequestSceneGenerationUseCase, classifyEnqueueError, type SceneTarget } from '../../src/application/use-cases/scene-use-cases.ts';
import type { ApplicationDeps } from '../../src/application/use-cases/use-case-support.ts';
import { FakeSceneImageGenerator } from '../../src/infrastructure/adapters/fake-scene-image-generator.adapter.ts';
import { ANDRES, ARGOS, HOUSEHOLD, LUCIA, canonicalState, createHarness } from '../fixtures/application-harness.ts';
import { ControlledStorage } from '../fixtures/media-harness.ts';
import { sceneFixture, withScene } from '../fixtures/scene-services-fixtures.ts';

/**
 * /smith (Red Team, 2026-11-18): asedio de la cadena de intentos de la escena 006 (T1, claim, T2, arrendamiento, reintentos, cancelación, purga).
 * Fuera de `vite.config.ts#include` a propósito: NO forma parte de `test:gate`. Cada prueba afirma lo que exige el spec; una prueba en ROJO es una brecha
 * demostrada (ver `.specify/memory/audits/smith-006-cadena-intentos.md`). Ejecutar con una config que incluya `tests/chaos/**`.
 */
const HOUSE: SceneTarget = { kind: 'HOUSEHOLD', householdId: HOUSEHOLD.id };
const NOW = '2026-11-05T12:00:00.000Z';
const at = (seconds: number): string => new Date(Date.parse(NOW) + seconds * 1000).toISOString();
const key = (n: number): string => `b0000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const never = (): AbortSignal => new AbortController().signal;

/** Generador con gancho «mientras el proveedor trabaja». */
class HookedGenerator implements SceneImageGeneratorPort {
  during: (() => Promise<void>) | null = null;
  constructor(readonly inner: FakeSceneImageGenerator) {}
  async generate(request: SceneGenerationRequest): Promise<SceneGenerationResult> {
    const hook = this.during;
    this.during = null;
    if (hook !== null) await hook();
    return this.inner.generate(request);
  }
}

/** UoW que delega en la de memoria e inyecta una caída del proceso (excepción dentro de la transacción => rollback). */
class CrashingUow implements UnitOfWorkPort {
  /** Lanza tras ejecutar `publishImage` (publicó en el borrador, no confirma). */
  crashAfterPublish = false;
  /** Lanza en el siguiente `lockScene` (proceso muerto antes de abrir T2). */
  crashOnNextLock = false;
  constructor(private readonly inner: UnitOfWorkPort) {}
  runInTransaction<T>(work: (r: RepositorySet) => Promise<T>): Promise<T> {
    return this.inner.runInTransaction((r) => {
      const scenes = new Proxy(r.scenes, {
        get: (target, prop, receiver) => {
          const value = Reflect.get(target, prop, receiver) as unknown;
          if (prop === 'publishImage' && typeof value === 'function') {
            return async (...args: unknown[]) => {
              const out = await (value as (...a: unknown[]) => Promise<unknown>).apply(target, args);
              if (this.crashAfterPublish) { this.crashAfterPublish = false; throw new Error('SIGKILL tras publishImage'); }
              return out;
            };
          }
          if (prop === 'lockScene' && typeof value === 'function') {
            return async (...args: unknown[]) => {
              if (this.crashOnNextLock) { this.crashOnNextLock = false; throw new Error('SIGKILL antes de T2'); }
              return (value as (...a: unknown[]) => Promise<unknown>).apply(target, args);
            };
          }
          return value;
        },
      });
      return work({ ...r, scenes } as RepositorySet);
    });
  }
}

function setup() {
  const h = createHarness(canonicalState());
  const fixture = sceneFixture();
  const storage = new ControlledStorage(() => new Date(h.clock.nowIsoTimestamp()));
  const hooked = new HookedGenerator(fixture.generator);
  const uow = new CrashingUow(h.uow);
  const base = withScene(h.deps, fixture);
  const deps: ApplicationDeps = {
    ...base,
    uow,
    sceneHooks: new SceneLifecycleHooks(),
    scene: { ...base.scene!, generator: hooked },
    media: { storage, limits: { maxBytes: 10_485_760, maxBytesPerOwner: 1_073_741_824, maxConcurrentUploads: 4, signedUrlTtlSeconds: 300 } },
  };
  return { h, fixture, storage, hooked, uow, deps, request: new RequestSceneGenerationUseCase(deps), run: new RunSceneGenerationUseCase(deps), get: new GetSceneUseCase(deps) };
}
type T = ReturnType<typeof setup>;
const snap = (t: T) => t.h.uow.snapshot();
const sceneOf = (t: T) => snap(t).scenes?.find((s) => s.householdId === HOUSEHOLD.id);
const attempts = (t: T) => snap(t).sceneAttempts ?? [];
const queue = (t: T): string[] => snap(t).mediaQueue.map((e) => `${e.reason}:${e.objectKey}`);
const setNow = (t: T, seconds: number): void => t.h.clock.setClock(at(seconds).slice(0, 10), at(seconds));

async function requestJob(t: T, n: number, action: 'UPDATE' | 'REGENERATE' = 'UPDATE') {
  const res = await t.request.execute(ANDRES, HOUSE, { action }, key(n));
  const last = attempts(t).at(-1)!;
  return { res, job: { sceneId: last.sceneId, attemptId: last.id }, resultObjectId: last.resultObjectId };
}

/** Publica una primera imagen (cuota 1) y deja la escena outdated con el reloj en `seconds` (fuera del enfriamiento). */
async function withPreviousImage(t: T, seconds = 120) {
  const first = await requestJob(t, 1);
  expect(await t.run.execute(first.job, never())).toBe('PUBLISHED');
  await t.h.uow.runInTransaction(async (r) => {
    const pet = (await r.pets.findById(ARGOS.id))!;
    await r.pets.save({ ...pet, breed: 'Otra raza', breedCode: null });
  });
  setNow(t, seconds);
  return first.resultObjectId;
}

describe('Escenario 1: simulador lento que supera T_GEN (EDGE-ESC6-003/024, SC-ESC6-018)', () => {
  it('un proveedor que IGNORA la señal y responde OK tras T_GEN y tras el arrendamiento: FAILED/TIMEOUT, sin cuota, imagen anterior intacta, sin objeto', async () => {
    const t = setup();
    const previous = await withPreviousImage(t);
    const { job } = await requestJob(t, 2);
    const controller = new AbortController();
    t.hooked.during = async () => { setNow(t, 120 + 400); controller.abort(); };
    expect(await t.run.execute(job, controller.signal)).toBe('FAILED');
    expect(attempts(t).at(-1)).toMatchObject({ outcome: 'FAILED', errorCode: 'ERR-SCENE-GENERATION-TIMEOUT' });
    expect(sceneOf(t)).toMatchObject({ consumedGenerations: 1, image: { id: previous } });
    expect(await t.storage.keys('scenes/')).toEqual([`scenes/${job.sceneId}/images/${previous}`]);
    expect(await t.run.execute(job, never())).toBe('NOOP'); // publicación tardía de una reentrega
    expect(sceneOf(t)?.image?.id).toBe(previous);
  });

  it('el arrendamiento vence DURANTE el put (entre la compuerta y T2): T2 no publica, FAILED/LEASE-EXPIRED, objeto purgado y cuota intacta', async () => {
    const t = setup();
    const previous = await withPreviousImage(t);
    const { job, resultObjectId } = await requestJob(t, 2);
    t.storage.beforePut = async () => { t.storage.beforePut = null; setNow(t, 120 + 151); };
    expect(await t.run.execute(job, never())).toBe('FAILED');
    expect(attempts(t).at(-1)).toMatchObject({ outcome: 'FAILED', errorCode: 'ERR-SCENE-LEASE-EXPIRED' });
    expect(sceneOf(t)).toMatchObject({ consumedGenerations: 1, image: { id: previous }, runState: 'failed' });
    expect(await t.storage.keys('scenes/')).not.toContain(`scenes/${job.sceneId}/images/${resultObjectId}`);
  });
});

describe('Escenario 2: caída del worker a mitad de T2 (INV-ESC6-004, REQ-ESC6-034)', () => {
  it('SIGKILL tras publishImage y antes del COMMIT: rollback, cuota sin tocar, la reentrega es NOOP (sin segunda llamada) y el arrendamiento cierra FAILED', async () => {
    const t = setup();
    const previous = await withPreviousImage(t);
    const { job, resultObjectId } = await requestJob(t, 2);
    t.uow.crashAfterPublish = true;
    await expect(t.run.execute(job, never())).rejects.toThrow('SIGKILL tras publishImage');
    expect(sceneOf(t)).toMatchObject({ consumedGenerations: 1, image: { id: previous }, runState: 'generating' });
    expect(attempts(t).at(-1)).toMatchObject({ phase: 'RUNNING', outcome: null });
    expect(await t.run.execute(job, never())).toBe('NOOP');
    expect(t.fixture.generator.calls).toHaveLength(2); // 1 de la imagen previa + 1 del intento caído; ninguna más
    setNow(t, 120 + 151);
    const view = await t.get.execute(ANDRES, HOUSE);
    expect(view).toMatchObject({ status: 'failed', lastError: 'ERR-SCENE-LEASE-EXPIRED', quota: { remaining: 9 } });
    expect(sceneOf(t)?.consumedGenerations).toBe(1);
    // el objeto huérfano conserva su fila en la cola (INTENT -> DELETE) para la conciliación
    expect(queue(t).some((q) => q.endsWith(resultObjectId))).toBe(true);
  });

  it('caída tras el COMMIT de T2 al purgar la imagen anterior: cuota +1 exacta, la anterior queda encolada DELETE y la reentrega no cobra de nuevo', async () => {
    const t = setup();
    const previous = await withPreviousImage(t);
    const { job } = await requestJob(t, 2);
    t.storage.failing.add('delete');
    expect(await t.run.execute(job, never())).toBe('PUBLISHED');
    t.storage.failing.delete('delete');
    expect(sceneOf(t)?.consumedGenerations).toBe(2);
    expect(queue(t)).toContain(`DELETE:scenes/${job.sceneId}/images/${previous}`);
    expect(await t.run.execute(job, never())).toBe('NOOP');
    expect(sceneOf(t)?.consumedGenerations).toBe(2);
  });
});

describe('Escenario 3: dos entregas concurrentes del mismo attemptId (EDGE-ESC6-024/027)', () => {
  it('una sola llamada al generador, una sola publicación y cuota +1', async () => {
    const t = setup();
    const { job } = await requestJob(t, 1);
    const outcomes = await Promise.all([t.run.execute(job, never()), t.run.execute(job, never()), t.run.execute(job, never())]);
    expect(outcomes.sort()).toEqual(['NOOP', 'NOOP', 'PUBLISHED']);
    expect(t.fixture.generator.calls).toHaveLength(1);
    expect(sceneOf(t)?.consumedGenerations).toBe(1);
  });
});

describe('Escenario 4: arrendamiento vencido y entrega tardía (EDGE-ESC6-003/006/026)', () => {
  it('A vence mientras el proveedor trabaja, B toma la escena y publica; A llega tarde a T2 (vía put) y NO sobreescribe ni cobra', async () => {
    const t = setup();
    const a = await requestJob(t, 1);
    let bImage = '';
    t.storage.beforePut = async (objectKey) => {
      if (!objectKey.endsWith(a.resultObjectId)) return;
      t.storage.beforePut = null;
      setNow(t, 400);
      await t.get.execute(ANDRES, HOUSE); // materializa el vencimiento de A
      const b = await requestJob(t, 2, 'REGENERATE');
      expect(b.res.accepted).toBe(true);
      expect(await t.run.execute(b.job, never())).toBe('PUBLISHED');
      bImage = b.resultObjectId;
    };
    expect(await t.run.execute(a.job, never())).toBe('CANCELLED');
    expect(sceneOf(t)).toMatchObject({ consumedGenerations: 1, image: { id: bImage } });
    expect(await t.storage.keys('scenes/')).toEqual([`scenes/${a.job.sceneId}/images/${bImage}`]);
    expect(attempts(t).find((x) => x.id === a.job.attemptId)).toMatchObject({ outcome: 'FAILED', errorCode: 'ERR-SCENE-LEASE-EXPIRED' });
  });
});

describe('Escenario 5: revocación del consentimiento a mitad de generación (EDGE-ESC6-021, REQ-ESC6-025)', () => {
  it('revocar mientras se sube el objeto: T2 no publica, cuota 0 y el objeto se purga', async () => {
    const t = setup();
    const { job } = await requestJob(t, 1);
    t.storage.beforePut = async () => { t.storage.beforePut = null; await new RevokeSceneConsentUseCase(t.deps).execute(ANDRES); };
    expect(await t.run.execute(job, never())).toBe('CANCELLED');
    expect(sceneOf(t)).toMatchObject({ image: null, consumedGenerations: 0 });
    expect(await t.storage.keys('scenes/')).toEqual([]);
  });

  it('BRECHA-SMITH-02: revocar mientras se sube el objeto y el worker MUERE antes de T2: el objeto huérfano debe conservar una fila en media_deletion_queue', async () => {
    const t = setup();
    const { job, resultObjectId } = await requestJob(t, 1);
    t.storage.beforePut = async () => {
      t.storage.beforePut = null;
      await new RevokeSceneConsentUseCase(t.deps).execute(ANDRES); // su purgeObjects borra la fila de la cola (no había objeto aún)
      t.uow.crashOnNextLock = true; // el put termina; T2 nunca abre
    };
    await expect(t.run.execute(job, never())).rejects.toThrow('SIGKILL antes de T2');
    const objectKey = `scenes/${job.sceneId}/images/${resultObjectId}`;
    expect(await t.storage.keys('scenes/')).toEqual([objectKey]); // huérfano derivado de datos de quien revocó
    expect(queue(t).some((q) => q.endsWith(objectKey))).toBe(true); // ESPERADO por REQ-ESC6-029/EDGE-ESC6-021; ROJO = solo lo recoge la conciliación diaria
  });
});

describe('Escenario 6: encolado ambiguo y reintento del cliente (EDGE-ESC6-032)', () => {
  it('encolado ambiguo + reintento con la misma clave o con clave nueva: un solo intento, cuota 0', async () => {
    const t = setup();
    t.fixture.dispatcher.ambiguous = true;
    const first = await t.request.execute(ANDRES, HOUSE, { action: 'UPDATE' }, key(1));
    t.fixture.dispatcher.ambiguous = false;
    const same = await t.request.execute(ANDRES, HOUSE, { action: 'UPDATE' }, key(1));
    const fresh = await t.request.execute(ANDRES, HOUSE, { action: 'UPDATE' }, key(2));
    expect([first.accepted, same.accepted, fresh.accepted]).toEqual([true, false, false]);
    expect(attempts(t)).toHaveLength(1);
    expect(sceneOf(t)?.consumedGenerations).toBe(0);
  });

  it('BRECHA-SMITH-03: un error gRPC NUMÉRICO ambiguo (14 UNAVAILABLE, 4 DEADLINE_EXCEEDED, 8 RESOURCE_EXHAUSTED) debe clasificarse AMBIGUOUS, no REJECTED', () => {
    const kinds = [14, 4, 8].map((code) => classifyEnqueueError(Object.assign(new Error('x'), { code })));
    expect(kinds).toEqual(['AMBIGUOUS', 'AMBIGUOUS', 'AMBIGUOUS']);
  });
});

describe('Escenario 7: frontera mensual y arrastre de cuota (EDGE-ESC6-031, EDGE-ESC6-033)', () => {
  it('EDGE-ESC6-031: T1 el 30-nov 23:59:50 (Bogotá) y T2 el 1-dic: imputa a noviembre y diciembre arranca entero', async () => {
    const t = setup();
    t.h.clock.setClock('2026-11-30', '2026-12-01T04:59:50.000Z');
    const { job } = await requestJob(t, 1);
    t.h.clock.setClock('2026-12-01', '2026-12-01T05:00:25.000Z');
    expect(await t.run.execute(job, never())).toBe('PUBLISHED');
    expect(sceneOf(t)).toMatchObject({ consumedGenerations: 1, quotaWindow: '2026-11' });
    expect((await t.get.execute(ANDRES, HOUSE)).quota).toMatchObject({ remaining: 10, window: '2026-12' });
  });

  it('BRECHA-SMITH-01: un hogar nuevo SIN escena de propietario que migrar debe nacer con el arrastre de la ventana vigente (data-model §2.8)', async () => {
    const t = setup();
    await t.h.uow.runInTransaction(async (r) => { await r.scenes.upsertQuotaCarry(LUCIA, '2026-11', 10); });
    await new CreateHouseholdUseCase(t.deps).execute(LUCIA, { name: 'Casa recreada' });
    const created = snap(t).households.find((x) => x.ownerUserId === LUCIA && x.name === 'Casa recreada');
    const view = await t.get.execute(LUCIA, { kind: 'HOUSEHOLD', householdId: created!.id });
    expect(view.quota.remaining).toBe(0); // ROJO = cuota reiniciada a 10 tras borrar y recrear el hogar
  });
});
