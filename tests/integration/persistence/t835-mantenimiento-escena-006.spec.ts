/**
 * T835 (006, Fase 4): regla nueva del mantenimiento diario (`N2-11`, SC-ESC6-095): purga de intentos terminales de mas de 30 dias, hashes de clave de
 * mas de 24 h y arrastres de ventanas anteriores; conciliacion de `scenes/` y `households/` en la rutina existente (REQ-GCS-006; 15 min para los dos
 * prefijos nuevos y 24 h para `pets/`). REQ-ESC6-012, REQ-ESC6-029; INV-ESC6-016; EDGE-ESC6-016, EDGE-ESC6-021; SC-ESC6-095, SC-ESC6-044.
 * Memoria y SQLite (motores de la 004 con almacenamiento controlable).
 */
import { afterEach, describe, expect, it } from 'vitest';
import type { SceneAttemptRecord, SceneRecord } from '../../../src/application/ports/scene-repositories.port.ts';
import { purgeSceneData, runMaintenance, runMediaQueueMaintenance } from '../../../src/application/use-cases/maintenance-use-cases.ts';
import { HOUSEHOLD } from '../../fixtures/application-harness.ts';
import { ANDRES, MARIA, PDF, createMediaEngines, type MediaEngine } from '../../fixtures/media-harness.ts';

const open: MediaEngine[] = [];
afterEach(() => open.splice(0).forEach((e) => e.close()));
async function eachEngine(run: (engine: MediaEngine) => Promise<void>): Promise<void> {
  for (const engine of await createMediaEngines(null)) {
    open.push(engine);
    await run(engine);
  }
}

const NOW = '2026-11-18T12:00:00.000Z';
const DAY = 86_400_000;
const MINUTE = 60_000;
const at = (ms: number): string => new Date(Date.parse(NOW) + ms).toISOString();
const SCENE_ID = 'a1000000-0000-4000-8000-000000000001';
const OWNER_SCENE_ID = 'a1000000-0000-4000-8000-000000000002';
const attemptId = (n: number): string => `a2000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const objectId = (n: number): string => `a3000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

const scene = (over: Partial<SceneRecord> = {}): SceneRecord => ({
  id: SCENE_ID,
  householdId: HOUSEHOLD.id,
  ownerUserId: null,
  runState: null,
  currentAttemptId: null,
  leaseExpiresAt: null,
  image: null,
  imageDegraded: false,
  consumedGenerations: 0,
  quotaWindow: '2026-11',
  createdAt: NOW,
  updatedAt: NOW,
  ...over,
});
const attempt = (n: number, over: Partial<SceneAttemptRecord> = {}): SceneAttemptRecord => ({
  id: attemptId(n),
  sceneId: SCENE_ID,
  actorUserId: ANDRES,
  action: 'UPDATE',
  mode: 'FROM_SCRATCH',
  fingerprint: 'f'.repeat(64),
  inputsSnapshot: '{"v":1}',
  resultObjectId: objectId(n),
  phase: 'DONE',
  claimedAt: null,
  providerCallStartedAt: null,
  quotaWindow: '2026-11',
  quotaMax: 10,
  outcome: 'SUCCEEDED',
  errorCode: null,
  degraded: false,
  idempotencyKeyHash: null,
  idempotencyExpiresAt: null,
  startedAt: at(-40 * DAY),
  finishedAt: at(-40 * DAY),
  ...over,
});
const setClock = (e: MediaEngine): void => e.clock.setClock(NOW.slice(0, 10), NOW);
const SCENE_IMAGE = { id: objectId(50), mime: 'image/png', sizeBytes: 10, fingerprint: 'a'.repeat(64), inputsSnapshot: '{"v":1}', createdAt: NOW } as const;

/** Siembra T1 sucesivos: cada intento entra con `now` posterior al arrendamiento (600 s) del anterior. */
async function seedAttempts(e: MediaEngine, attempts: readonly SceneAttemptRecord[]): Promise<void> {
  let n = 0;
  for (const a of attempts) {
    const now = at(-60 * DAY + n * 3_600_000);
    n += 1;
    const begun = await e.run((r) => r.scenes.beginGeneration({ sceneId: a.sceneId, attempt: a, now, leaseExpiresAt: at(-60 * DAY + (n - 1) * 3_600_000 + 600_000) }));
    expect(begun, `T1 de ${a.id}`).toBe(true);
  }
}

describe('T835 purga diaria de la escena (N2-11, SC-ESC6-095, REQ-ESC6-012)', () => {
  it('[SC-ESC6-095] purga los intentos terminales con mas de 30 dias, conserva los recientes, los no terminales y el intento vigente de la escena', async () => {
    await eachEngine(async (e) => {
      setClock(e);
      await e.run((r) => r.scenes.insert(scene()));
      await seedAttempts(e, [
        attempt(1, { finishedAt: at(-31 * DAY) }), // terminal viejo: se purga
        attempt(2, { finishedAt: at(-29 * DAY) }), // terminal reciente: se conserva
        attempt(3, { outcome: null, phase: 'RUNNING', finishedAt: null, startedAt: at(-40 * DAY) }), // sin terminar: se conserva
        attempt(4, { outcome: 'FAILED', finishedAt: at(-45 * DAY) }), // terminal viejo pero es current_attempt_id: se conserva
      ]);
      expect(await purgeSceneData(e.deps)).toEqual({ attemptsPurged: 1, hashesCleared: 0, carryPurged: 0 });
      const left = await e.run(async (r) => [1, 2, 3, 4].map((n) => r.scenes.findAttemptById(attemptId(n))));
      expect((await Promise.all(left)).map((a) => a?.id.slice(-1) ?? null)).toEqual([null, '2', '3', '4']);
    });
  });

  it('[SC-ESC6-095][EDGE-ESC6-016] los hashes de clave con idempotency_expires_at vencido quedan NULL (la fila se conserva) y los vigentes no se tocan', async () => {
    await eachEngine(async (e) => {
      setClock(e);
      await e.run(async (r) => {
        await r.scenes.insert(scene());
        await r.scenes.insert(scene({ id: OWNER_SCENE_ID, householdId: null, ownerUserId: MARIA }));
      });
      await seedAttempts(e, [attempt(1, { idempotencyKeyHash: 'a'.repeat(64), idempotencyExpiresAt: at(-1000), startedAt: at(-1 * DAY), finishedAt: at(-1 * DAY) })]);
      await seedAttempts(e, [attempt(2, { sceneId: OWNER_SCENE_ID, idempotencyKeyHash: 'b'.repeat(64), idempotencyExpiresAt: at(3_600_000), startedAt: at(-1000), finishedAt: at(-1000) })]);
      expect(await purgeSceneData(e.deps)).toEqual({ attemptsPurged: 0, hashesCleared: 1, carryPurged: 0 });
      const rows = await e.run(async (r) => [await r.scenes.findAttemptById(attemptId(1)), await r.scenes.findAttemptById(attemptId(2))]);
      expect(rows.map((a) => [a?.id.slice(-1), a?.idempotencyKeyHash?.slice(0, 1) ?? null])).toEqual([['1', null], ['2', 'b']]);
      expect(await purgeSceneData(e.deps)).toEqual({ attemptsPurged: 0, hashesCleared: 0, carryPurged: 0 }); // idempotente
    });
  });

  it('[SC-ESC6-095][EDGE-ESC6-033] purga los arrastres de ventanas anteriores a la actual (APP_TIMEZONE) y conserva el de la ventana vigente', async () => {
    await eachEngine(async (e) => {
      e.clock.setClock('2026-11-01', '2026-11-01T05:30:00.000Z'); // el 1-nov en Bogota: la ventana es 2026-11 aunque en UTC sea el mismo dia
      await e.run(async (r) => {
        await r.scenes.upsertQuotaCarry(ANDRES, '2026-10', 4);
        await r.scenes.upsertQuotaCarry(ANDRES, '2026-11', 2);
        await r.scenes.upsertQuotaCarry(MARIA, '2026-09', 1);
      });
      expect(await purgeSceneData(e.deps)).toEqual({ attemptsPurged: 0, hashesCleared: 0, carryPurged: 2 });
      expect(await e.run(async (r) => [await r.scenes.findQuotaCarry(ANDRES, '2026-10'), await r.scenes.findQuotaCarry(ANDRES, '2026-11'), await r.scenes.findQuotaCarry(MARIA, '2026-09')])).toEqual([null, 2, null]);
    });
  });

  it('[SC-ESC6-095] runMaintenance incluye la purga de la escena en la rutina existente (no hay una segunda rutina) y un fallo no lanza', async () => {
    await eachEngine(async (e) => {
      setClock(e);
      await e.run(async (r) => {
        await r.scenes.insert(scene());
      });
      await seedAttempts(e, [attempt(1, { finishedAt: at(-31 * DAY) }), attempt(2, { finishedAt: at(-1 * DAY), outcome: 'FAILED' })]);
      await runMaintenance(e.deps);
      expect((await e.run((r) => r.scenes.findAttemptById(attemptId(1)))) === null).toBe(true);
      const broken = { ...e.deps, uow: { ...e.deps.uow, runInTransaction: () => Promise.reject(new Error('base caida')) } } as typeof e.deps;
      expect(await purgeSceneData(broken)).toEqual({ attemptsPurged: 0, hashesCleared: 0, carryPurged: 0 });
    });
  });
});

describe('T835 conciliacion de scenes/ y households/ en la rutina existente (REQ-GCS-006, REQ-ESC6-029, EDGE-ESC6-021, SC-ESC6-044)', () => {
  const sceneKey = (n: number) => `scenes/${SCENE_ID}/images/${objectId(n)}`;
  const photoKey = (n: number) => `households/${HOUSEHOLD.id}/photo/${objectId(n)}`;
  const put = (e: MediaEngine, key: string) => e.storage.inner.put(key, PDF(), 'image/png');
  const advance = (e: MediaEngine, ms: number): void => {
    const next = new Date(Date.parse(e.clock.nowIsoTimestamp()) + ms).toISOString();
    e.clock.setClock(next.slice(0, 10), next);
  };

  it('[EDGE-ESC6-021] un objeto de scenes/ o households/ sin referencia con mas de 15 min se encola con DELETE y se borra; con menos de 15 min no se toca', async () => {
    await eachEngine(async (e) => {
      setClock(e);
      await put(e, sceneKey(1));
      await put(e, photoKey(2));
      advance(e, 15 * MINUTE + 1000);
      await put(e, sceneKey(3)); // recien subido
      await put(e, photoKey(4));
      const result = await runMediaQueueMaintenance(e.deps);
      expect([result.reconciled, result.deleted]).toEqual([2, 2]);
      expect([...(await e.storage.keys('scenes/')), ...(await e.storage.keys('households/'))].sort()).toEqual([sceneKey(3), photoKey(4)].sort());
    });
  });

  it('[REQ-ESC6-029] el objeto referenciado por la imagen vigente de la escena, por la foto del hogar o por una fila de la cola nunca se encola', async () => {
    await eachEngine(async (e) => {
      setClock(e);
      await e.run((r) => r.scenes.insert(scene({ image: { ...SCENE_IMAGE, id: objectId(1) } })));
      e.seedHouseholdPhoto({ householdId: HOUSEHOLD.id, objectId: objectId(2), sizeBytes: 5, uploadedByUserId: ANDRES });
      await put(e, sceneKey(1));
      await put(e, photoKey(2));
      await put(e, sceneKey(3));
      await e.run((r) => r.mediaQueue.enqueue(sceneKey(3), 'INTENT', e.clock.nowIsoTimestamp()));
      await put(e, sceneKey(4)); // sin referencia
      advance(e, 20 * MINUTE);
      const result = await runMediaQueueMaintenance(e.deps);
      expect(result.reconciled).toBe(1);
      expect([...(await e.storage.keys('scenes/')), ...(await e.storage.keys('households/'))].sort()).toEqual([sceneKey(1), sceneKey(3), photoKey(2)].sort());
    });
  });

  it('[REQ-GCS-006] pets/ conserva su ventana de 24 h aunque scenes/ y households/ concilien a los 15 min', async () => {
    await eachEngine(async (e) => {
      setClock(e);
      const petKey = `pets/${HOUSEHOLD.id}/files/${objectId(9)}`;
      await put(e, petKey);
      await put(e, sceneKey(5));
      advance(e, 20 * MINUTE);
      expect((await runMediaQueueMaintenance(e.deps)).reconciled).toBe(1);
      expect(await e.storage.keys('pets/')).toEqual([petKey]);
    });
  });
});
