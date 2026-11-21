import { describe, expect, it } from 'vitest';
import type { SceneRecord } from '../../src/application/ports/scene-repositories.port.ts';
import { GetSceneImageUseCase, sceneDownloadFilenameOf, type SceneTarget } from '../../src/application/use-cases/scene-use-cases.ts';
import { DomainError } from '../../src/generated/index.ts';
import { DomainError as DomainErrorV34 } from '../../src/generated/v34/index.ts';
import { ANDRES, HOUSEHOLD, LUCIA, canonicalState, createHarness } from '../fixtures/application-harness.ts';
import { ControlledStorage } from '../fixtures/media-harness.ts';
import { sceneFixture, withScene } from '../fixtures/scene-services-fixtures.ts';

/**
 * T1168 (008, mitad servidor, `[GH:#54]`): `GetSceneImageUseCase` con `download` (contrato 006 3.5.0). Nombre fijo `argos-hogar-AAAA-MM-DD.png` con la fecha de la imagen en
 * `APP_TIMEZONE`, URL firmada `attachment`, cuerpo solo cuando el almacenamiento no firma, 404 sin escribir y `v` solo de caché.
 * REQ-UX8-002, REQ-ESC6-019, INV-ESC6-007, INV-ESC6-019; SC-008-035, SC-008-036, SC-008-037, SC-ESC6-081.
 */
const HOUSE: SceneTarget = { kind: 'HOUSEHOLD', householdId: HOUSEHOLD.id };
const NOW = '2026-11-05T12:00:00.000Z';
const SCENE = 'c1000000-0000-4000-8000-000000000001';
const IMAGE = 'c2000000-0000-4000-8000-000000000001';
const KEY = `scenes/${SCENE}/images/${IMAGE}`;
// 03:30 UTC del 6 = 22:30 del 5 en America/Bogota (UTC-5): el nombre lleva el día LOCAL, no el de UTC.
const CREATED_LATE = '2026-11-06T03:30:00.000Z';

async function codeOf(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
    return 'OK';
  } catch (error) {
    if (error instanceof DomainError || error instanceof DomainErrorV34) return error.code;
    throw error;
  }
}

const sceneRow = (over: Partial<SceneRecord> = {}): SceneRecord => ({
  id: SCENE, householdId: HOUSEHOLD.id, ownerUserId: null, runState: null, currentAttemptId: null, leaseExpiresAt: null, image: null, imageDegraded: false,
  consumedGenerations: 0, quotaWindow: '2026-11', createdAt: NOW, updatedAt: NOW, ...over,
});
const imageAt = (createdAt: string, mime: 'image/png' | 'image/webp' = 'image/png') => ({ id: IMAGE, mime, sizeBytes: 3, fingerprint: 'a'.repeat(64), inputsSnapshot: '{"v":1}', createdAt });

async function setup(createdAt: string | null = NOW, mime: 'image/png' | 'image/webp' = 'image/png') {
  const h = createHarness(canonicalState());
  const storage = new ControlledStorage(() => new Date(NOW));
  const deps = { ...withScene(h.deps, sceneFixture({})), media: { storage, limits: { maxBytes: 10_485_760, maxBytesPerOwner: 1_073_741_824, maxConcurrentUploads: 4, signedUrlTtlSeconds: 300 } } };
  if (createdAt !== null) {
    await h.uow.runInTransaction(async (r) => { await r.scenes.insert(sceneRow({ image: imageAt(createdAt, mime) })); });
    await storage.put(KEY, new Uint8Array([1, 2, 3]), mime);
  }
  storage.operations.length = 0;
  return { storage, image: new GetSceneImageUseCase(deps) };
}

describe('sceneDownloadFilenameOf (T1168)', () => {
  it('[REQ-UX8-002][SC-008-036] usa el día de la imagen en la zona de la aplicación, no el de UTC, y no contiene PII', () => {
    expect([
      sceneDownloadFilenameOf(CREATED_LATE, 'America/Bogota'),
      sceneDownloadFilenameOf(CREATED_LATE, 'UTC'),
      sceneDownloadFilenameOf('2026-12-31T23:59:59.999Z', 'America/Bogota'),
    ]).toEqual(['argos-hogar-2026-11-05.png', 'argos-hogar-2026-11-06.png', 'argos-hogar-2026-12-31.png']);
  });

  it('[REQ-UX8-002] un instante ilegible no inventa nombre', () => {
    expect(sceneDownloadFilenameOf('no-es-fecha', 'America/Bogota')).toBeNull();
  });
});

describe('GetSceneImageUseCase con download (T1168)', () => {
  it('[REQ-UX8-002][SC-008-036][SC-008-037] pide la URL con disposition attachment, el nombre fijo con la fecha local de la imagen y el tipo del registro; sin cuerpo si el almacenamiento firma', async () => {
    const { storage, image } = await setup(CREATED_LATE);
    const result = await image.execute(ANDRES, HOUSE, undefined, { download: true });
    expect(storage.readUrlRequests).toEqual([{ key: KEY, contentType: 'image/png', filename: 'argos-hogar-2026-11-05.png', ttlSeconds: 300, disposition: 'attachment' }]);
    expect([result.downloadFilename, result.bytes, result.mime, result.url.startsWith('https://')]).toEqual(['argos-hogar-2026-11-05.png', null, 'image/png', true]);
    expect(storage.operations).toEqual([`createReadUrl:${KEY}`]);
  });

  it('[REQ-UX8-002][SC-008-035] sin download (o con download: false) la solicitud es la de siempre: nombre neutro escena.png y sin disposición', async () => {
    const { storage, image } = await setup(CREATED_LATE);
    const plain = await image.execute(ANDRES, HOUSE, undefined);
    const off = await image.execute(ANDRES, HOUSE, undefined, { download: false });
    expect(storage.readUrlRequests).toEqual([
      { key: KEY, contentType: 'image/png', filename: 'escena.png', ttlSeconds: 300 },
      { key: KEY, contentType: 'image/png', filename: 'escena.png', ttlSeconds: 300 },
    ]);
    expect([plain.downloadFilename, plain.bytes, off.downloadFilename, off.bytes]).toEqual([null, null, null, null]);
    expect(storage.operations).toEqual([`createReadUrl:${KEY}`, `createReadUrl:${KEY}`]);
  });

  it('[REQ-UX8-002][SC-008-037] con un almacenamiento sin URL firmada entrega además los bytes de la imagen vigente (para el 200 attachment)', async () => {
    const { storage, image } = await setup(NOW);
    storage.unsigned = true;
    const result = await image.execute(ANDRES, HOUSE, undefined, { download: true });
    expect([result.url.startsWith('/__dev/media/'), Array.from(result.bytes ?? []), result.downloadFilename]).toEqual([true, [1, 2, 3], 'argos-hogar-2026-11-05.png']);
    expect(storage.operations).toEqual([`createReadUrl:${KEY}`, `get:${KEY}`]);
  });

  it('[REQ-UX8-002][SC-008-035] sin download y sin firma NO se leen los bytes (se conserva la 302)', async () => {
    const { storage, image } = await setup(NOW);
    storage.unsigned = true;
    const result = await image.execute(ANDRES, HOUSE, undefined);
    expect([result.bytes, storage.operations]).toEqual([null, [`createReadUrl:${KEY}`]]);
  });

  it('[INV-ESC6-019][REQ-UX8-002] v ajeno o antiguo con download sigue sirviendo la imagen vigente: la clave sale del registro', async () => {
    const { storage, image } = await setup(NOW);
    await image.execute(ANDRES, HOUSE, 'c2000000-0000-4000-8000-0000000000ff', { download: true });
    await image.execute(ANDRES, HOUSE, undefined, { download: true });
    expect(storage.readUrlRequests.map((r) => r.key)).toEqual([KEY, KEY]);
  });

  it('[INV-ESC6-007][REQ-UX8-002] sin acceso o sin imagen vigente es 404 con download, sin firmar ni leer nada', async () => {
    const withImage = await setup(NOW);
    const without = await setup(null);
    expect([
      await codeOf(withImage.image.execute(LUCIA, HOUSE, undefined, { download: true })),
      await codeOf(without.image.execute(ANDRES, HOUSE, undefined, { download: true })),
    ]).toEqual(['ERR-HOUSE-NOT-FOUND', 'ERR-HOUSE-NOT-FOUND']);
    expect([withImage.storage.operations, without.storage.operations]).toEqual([[], []]);
  });

  it('[REQ-UX8-002] si el objeto desapareció del almacenamiento sin firma, el 200 no se inventa: 404 sin revelar la clave', async () => {
    const { storage, image } = await setup(NOW);
    storage.unsigned = true;
    await storage.inner.delete(KEY);
    expect(await codeOf(image.execute(ANDRES, HOUSE, undefined, { download: true }))).toBe('ERR-HOUSE-NOT-FOUND');
  });
});
