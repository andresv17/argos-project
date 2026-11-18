import { describe, expect, it } from 'vitest';
import { DeleteHouseholdPhotoUseCase, GetHouseholdPhotoUseCase, PutHouseholdPhotoUseCase } from '../../src/application/use-cases/scene-photo-use-cases.ts';
import { GetSceneUseCase, RequestSceneGenerationUseCase, loadLiveInputs, type SceneTarget } from '../../src/application/use-cases/scene-use-cases.ts';
import type { ApplicationDeps } from '../../src/application/use-cases/use-case-support.ts';
import { DomainError } from '../../src/generated/index.ts';
import { DomainError as DomainErrorV31 } from '../../src/generated/v31/index.ts';
import { FakeSceneImageGenerator } from '../../src/infrastructure/adapters/fake-scene-image-generator.adapter.ts';
import { ANDRES, ARGOS, HOUSEHOLD, LUCIA, MARIA, canonicalState, createHarness } from '../fixtures/application-harness.ts';
import { ControlledStorage } from '../fixtures/media-harness.ts';
import { sceneFixture, withScene, type SceneFixtureOptions } from '../fixtures/scene-services-fixtures.ts';

/**
 * T857 (006, Fase 5): foto del hogar (`put/delete/getHouseholdPhoto`). Misma validación que REQ-ARC-001 (tipo por contenido, tope de bytes, SVG y PDF
 * rechazados), solo propietario y ADMIN, cuota de 1 GiB del propietario, borrado idempotente con cola transaccional, la escena pasa a `outdated` por derivación y
 * una mascota en varios hogares tiene escenas y cuotas independientes. REQ-ESC6-001, REQ-ESC6-018, REQ-ESC6-020, REQ-ESC6-027; INV-ESC6-009; EDGE-ESC6-011,
 * EDGE-ESC6-013; SC-ESC6-004, SC-ESC6-019, SC-ESC6-028, SC-ESC6-052, SC-ESC6-064.
 */
const HOUSE: SceneTarget = { kind: 'HOUSEHOLD', householdId: HOUSEHOLD.id };
const NOW = '2026-11-05T12:00:00.000Z';
const key = (n: number): string => `b0000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const OTHER_HOUSE = 'dddddddd-dddd-4ddd-8ddd-dddddddddd02';

async function png(): Promise<Uint8Array> {
  const r = await new FakeSceneImageGenerator().generate({ prompt: 'foto', references: [], signal: new AbortController().signal });
  if (!r.ok) throw new Error('sin imagen');
  return r.image.bytes;
}
const codeOf = async (promise: Promise<unknown>): Promise<string> => {
  try {
    await promise;
    return 'OK';
  } catch (error) {
    if (error instanceof DomainError || error instanceof DomainErrorV31) return error.code;
    throw error;
  }
};

function setup(options: SceneFixtureOptions = {}, mutate: (state: ReturnType<typeof canonicalState>) => void = () => undefined) {
  const state = canonicalState();
  mutate(state);
  const h = createHarness(state);
  const fixture = sceneFixture(options);
  const storage = new ControlledStorage(() => new Date(NOW));
  const deps: ApplicationDeps = { ...withScene(h.deps, fixture), media: { storage, limits: { maxBytes: 10_485_760, maxBytesPerOwner: 1_073_741_824, maxConcurrentUploads: 4, signedUrlTtlSeconds: 300 } } };
  return { h, fixture, storage, deps, put: new PutHouseholdPhotoUseCase(deps), del: new DeleteHouseholdPhotoUseCase(deps), get: new GetSceneUseCase(deps), url: new GetHouseholdPhotoUseCase(deps) };
}
type T = ReturnType<typeof setup>;
const snap = (t: T) => t.h.uow.snapshot();
const asAdmin = (state: ReturnType<typeof canonicalState>): void => {
  state.memberships = state.memberships.map((m) => (m.userId === MARIA && m.householdId === HOUSEHOLD.id ? { ...m, role: 'ADMIN' as const } : m));
};
const photoKeys = (t: T): Promise<string[]> => t.storage.keys('households/');

describe('putHouseholdPhoto (T857)', () => {
  it('[REQ-ESC6-001][SC-ESC6-052][INV-ESC6-009] sube la foto: clave UUID sin el nombre del usuario, tipo por contenido, fila household_photos con el autor, INTENT retirado y vista {tag, mime, sizeBytes, createdAt}', async () => {
    const t = setup();
    const bytes = await png();
    const view = await t.put.execute(ANDRES, HOUSEHOLD.id, bytes);
    const stored = snap(t).householdPhotos?.[0];
    expect(view).toMatchObject({ mime: 'image/png', sizeBytes: bytes.length, createdAt: NOW });
    expect(stored).toMatchObject({ householdId: HOUSEHOLD.id, objectId: view.tag, mime: 'image/png', sizeBytes: bytes.length, uploadedByUserId: ANDRES, createdAt: NOW });
    expect(await photoKeys(t)).toEqual([`households/${HOUSEHOLD.id}/photo/${view.tag}`]);
    expect(snap(t).mediaQueue).toEqual([]);
    expect(JSON.stringify(snap(t).householdPhotos).includes('mi casa')).toBe(false);
  });

  it('[REQ-ESC6-001][SC-ESC6-019] SVG, PDF corrupto o vacío (ERR-MEDIA-TYPE-NOT-ALLOWED) y 11 MiB (ERR-MEDIA-TOO-LARGE) se rechazan antes de almacenar: 0 objetos, 0 filas, 0 llamadas', async () => {
    const t = setup();
    const svg = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
    const pdf = new TextEncoder().encode('%PDF-1.4 corrupto');
    const big = new Uint8Array(11 * 1024 * 1024);
    big.set((await png()).subarray(0, 8));
    expect([await codeOf(t.put.execute(ANDRES, HOUSEHOLD.id, svg)), await codeOf(t.put.execute(ANDRES, HOUSEHOLD.id, pdf)), await codeOf(t.put.execute(ANDRES, HOUSEHOLD.id, new Uint8Array(0))), await codeOf(t.put.execute(ANDRES, HOUSEHOLD.id, big))]).toEqual([
      'ERR-MEDIA-TYPE-NOT-ALLOWED', 'ERR-MEDIA-TYPE-NOT-ALLOWED', 'ERR-MEDIA-TYPE-NOT-ALLOWED', 'ERR-MEDIA-TOO-LARGE',
    ]);
    expect([await photoKeys(t), snap(t).householdPhotos ?? [], snap(t).mediaQueue, t.fixture.generator.calls.length]).toEqual([[], [], [], 0]);
  });

  it('[REQ-ESC6-027][EDGE-ESC6-028] una imagen que supera los megapíxeles o el lado máximo se rechaza antes de almacenar', async () => {
    const t = setup({ images: { withinLimits: () => false } });
    expect(await codeOf(t.put.execute(ANDRES, HOUSEHOLD.id, await png()))).toBe('ERR-MEDIA-TYPE-NOT-ALLOWED');
    expect(await photoKeys(t)).toEqual([]);
  });

  it('[REQ-ESC6-020] el propietario y un ADMIN suben; un READER recibe ERR-ACC-FORBIDDEN y un tercero ERR-HOUSE-NOT-FOUND, sin objetos ni filas', async () => {
    const t = setup({}, asAdmin);
    expect(await codeOf(t.put.execute(MARIA, HOUSEHOLD.id, await png()))).toBe('OK');
    const readers = setup();
    expect(await codeOf(readers.put.execute(MARIA, HOUSEHOLD.id, await png()))).toBe('ERR-ACC-FORBIDDEN');
    expect(await codeOf(readers.put.execute(LUCIA, HOUSEHOLD.id, await png()))).toBe('ERR-HOUSE-NOT-FOUND');
    expect([await photoKeys(readers), readers.h.uow.snapshot().householdPhotos ?? []]).toEqual([[], []]);
  });

  it('[REQ-ESC6-001][EDGE-ESC6-012] reemplazar conserva una sola foto: la anterior se encola para borrar y se purga, y la nueva queda vigente', async () => {
    const t = setup();
    const first = await t.put.execute(ANDRES, HOUSEHOLD.id, await png());
    const second = await t.put.execute(ANDRES, HOUSEHOLD.id, await png());
    expect(second.tag).not.toBe(first.tag);
    expect(snap(t).householdPhotos).toHaveLength(1);
    expect(await photoKeys(t)).toEqual([`households/${HOUSEHOLD.id}/photo/${second.tag}`]);
    expect(snap(t).mediaQueue).toEqual([]);
  });

  it('[REQ-ESC6-018] la cuota de 1 GiB del propietario del hogar cuenta la foto: si no cabe, ERR-MEDIA-QUOTA-EXCEEDED y no se almacena nada', async () => {
    const t = setup();
    const bytes = await png();
    const small = { ...t.deps, media: { ...t.deps.media!, limits: { ...t.deps.media!.limits, maxBytesPerOwner: bytes.length - 1 } } };
    expect(await codeOf(new PutHouseholdPhotoUseCase(small).execute(ANDRES, HOUSEHOLD.id, bytes))).toBe('ERR-MEDIA-QUOTA-EXCEEDED');
    expect(await photoKeys(t)).toEqual([]);
    const ok = { ...t.deps, media: { ...t.deps.media!, limits: { ...t.deps.media!.limits, maxBytesPerOwner: bytes.length } } };
    expect(await codeOf(new PutHouseholdPhotoUseCase(ok).execute(ANDRES, HOUSEHOLD.id, bytes))).toBe('OK');
    expect(await codeOf(new PutHouseholdPhotoUseCase(ok).execute(ANDRES, HOUSEHOLD.id, bytes))).toBe('OK');
  });

  it('[SC-ESC6-004][REQ-ESC6-004] subir la foto a una escena ready la deja outdated con 1 cambio pendiente y, al actualizar, el modo es FROM_SCRATCH con la foto del hogar', async () => {
    const t = setup({}, (s) => { s.assignments = []; });
    await t.h.uow.runInTransaction(async (r) => {
      const live = await loadLiveInputs(t.deps, r, { householdId: HOUSEHOLD.id, ownerUserId: null, role: 'OWNER' });
      await r.scenes.insert({ id: 'c1000000-0000-4000-8000-000000000001', householdId: HOUSEHOLD.id, ownerUserId: null, runState: null, currentAttemptId: null, leaseExpiresAt: null, image: null, imageDegraded: false, consumedGenerations: 0, quotaWindow: '2026-11', createdAt: NOW, updatedAt: NOW });
      await r.scenes.publishImage({ sceneId: 'c1000000-0000-4000-8000-000000000001', attemptId: 'c4000000-0000-4000-8000-000000000009', image: { id: 'c2000000-0000-4000-8000-000000000001', mime: 'image/png', sizeBytes: 9, fingerprint: live.fingerprint, inputsSnapshot: JSON.stringify(live.snapshot), createdAt: NOW }, degraded: false, consumedGenerations: 1, quotaWindow: '2026-11', ownerUserIds: [ANDRES], now: NOW });
    });
    expect((await t.get.execute(ANDRES, HOUSE)).status).toBe('ready');
    await t.put.execute(ANDRES, HOUSEHOLD.id, await png());
    expect(await t.get.execute(ANDRES, HOUSE)).toMatchObject({ status: 'outdated', pending: 1 });
    await new RequestSceneGenerationUseCase(t.deps).execute(ANDRES, HOUSE, { action: 'UPDATE' }, key(1));
    expect(snap(t).sceneAttempts?.[0]).toMatchObject({ mode: 'FROM_SCRATCH' });
  });
});

describe('deleteHouseholdPhoto y getHouseholdPhoto (T857)', () => {
  it('[REQ-ESC6-029][SC-ESC6-028] borra la fila, encola y purga el objeto; repetir es idempotente (sin error ni escrituras) y la escena queda outdated', async () => {
    const t = setup({}, (s) => { s.assignments = []; });
    const view = await t.put.execute(ANDRES, HOUSEHOLD.id, await png());
    await t.del.execute(ANDRES, HOUSEHOLD.id);
    expect([snap(t).householdPhotos ?? [], await photoKeys(t), snap(t).mediaQueue]).toEqual([[], [], []]);
    const after = JSON.stringify(snap(t));
    await t.del.execute(ANDRES, HOUSEHOLD.id);
    expect(JSON.stringify(snap(t))).toBe(after);
    expect(view.tag).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it('[REQ-ESC6-020][H-TRI-006-15] el propietario borra la foto que subió un ADMIN; un READER no borra y un tercero recibe 404', async () => {
    const t = setup({}, asAdmin);
    await t.put.execute(MARIA, HOUSEHOLD.id, await png());
    expect(await codeOf(t.del.execute(LUCIA, HOUSEHOLD.id))).toBe('ERR-HOUSE-NOT-FOUND');
    await t.del.execute(ANDRES, HOUSEHOLD.id);
    expect(snap(t).householdPhotos ?? []).toEqual([]);
    const readers = setup();
    expect(await codeOf(readers.del.execute(MARIA, HOUSEHOLD.id))).toBe('ERR-ACC-FORBIDDEN');
  });

  it('[REQ-ESC6-019][INV-ESC6-007] los miembros leen la foto por URL firmada con la clave del registro; sin foto o sin acceso es 404', async () => {
    const t = setup();
    expect(await codeOf(t.url.execute(ANDRES, HOUSEHOLD.id))).toBe('ERR-HOUSE-NOT-FOUND');
    const view = await t.put.execute(ANDRES, HOUSEHOLD.id, await png());
    expect((await t.url.execute(MARIA, HOUSEHOLD.id)).url).toContain(`households/${HOUSEHOLD.id}/photo/${view.tag}`);
    expect(await codeOf(t.url.execute(LUCIA, HOUSEHOLD.id))).toBe('ERR-HOUSE-NOT-FOUND');
  });
});

describe('escena por hogar (T857)', () => {
  it('[SC-ESC6-064][EDGE-ESC6-011] una mascota asignada a dos hogares aparece en dos escenas con cuotas independientes; el tope del álbum de 005 no se relaja', async () => {
    const t = setup({}, (s) => {
      s.households = [...s.households, { ...HOUSEHOLD, id: OTHER_HOUSE }];
      s.memberships = [...s.memberships, { ...s.memberships.find((m) => m.userId === ANDRES && m.householdId === HOUSEHOLD.id)!, membershipId: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeee02', householdId: OTHER_HOUSE }];
      s.assignments = [...s.assignments, { petId: ARGOS.id, householdId: OTHER_HOUSE, assignedByUserId: ANDRES, assignedAt: NOW }];
    });
    const a = await t.get.execute(ANDRES, HOUSE);
    const b = await t.get.execute(ANDRES, { kind: 'HOUSEHOLD', householdId: OTHER_HOUSE });
    expect(a.sceneId).not.toBe(b.sceneId);
    expect(snap(t).scenes).toHaveLength(2);
    expect(b.pets.total).toBe(1);
    expect([a.quota.remaining, b.quota.remaining]).toEqual([10, 10]);
  });
});
