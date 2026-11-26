/**
 * T1554 [US8, Bloque I, #78] foto de perfil de usuario sobre los motores (Memoria, SQLite y PostgreSQL 17 real, este último se OMITE sin TEST_DATABASE_URL), PRUEBAS ROJAS
 * (D11-13 = C: solo subida propia con recorte, fallback a iniciales; SIN descarga de `picture` de Google). Casos de uso que escribe T1556 en
 * `src/application/use-cases/user-avatar-use-cases.ts`: `PutUserAvatarUseCase(deps).execute(userId, bytes)`, `GetUserAvatarUseCase(deps).execute(userId, v)`,
 * `GetUserAvatarMetaUseCase(deps).execute(userId)` y `DeleteUserAvatarUseCase(deps).execute(userId)`; clave `userAvatarObjectKey` en `src/domain/media`; constantes
 * `USER_AVATAR_*` en `app-config.ts`; `GetUserAvatarUseCase` devuelve `{bytes, contentType, cacheable}` donde `cacheable` es «`v` igual a la vigente» (cacheable 300 s, decisión 1A). Cubre subir, reemplazar, quitar, versión monótona, privacidad por cuenta, 413/415/422, saneado por lista blanca sin EXIF/XMP/ICC/comentarios (2A), cola de borrado y conciliación del prefijo `users/`.
 *
 * @implements REQ-PRF11-001, REQ-PRF11-002, INV-PRF11-001, SC-011-057, SC-011-058, SC-011-059, SC-011-060, SC-011-061, SC-011-062, EDGE-011-007
 */
import { afterEach, describe, expect, it } from 'vitest';
import type { RepositorySet } from '../../../src/application/ports/repositories.port.ts';
import { runMediaQueueMaintenance } from '../../../src/application/use-cases/maintenance-use-cases.ts';
import { DeleteUserAvatarUseCase, GetUserAvatarMetaUseCase, GetUserAvatarUseCase, PutUserAvatarUseCase } from '../../../src/application/use-cases/user-avatar-use-cases.ts';
import type { ApplicationDeps } from '../../../src/application/use-cases/use-case-support.ts';
import { userAvatarObjectKey } from '../../../src/domain/media/media-keys.ts';
import {
  USER_AVATAR_MAX_BYTES,
  USER_AVATAR_MAX_SIDE,
  USER_AVATAR_MIN_SIDE,
  USER_AVATAR_PUT_MAX_PER_WINDOW,
  USER_AVATAR_PUT_WINDOW_MINUTES,
} from '../../../src/infrastructure/config/app-config.ts';
import { FixedClockAdapter } from '../../../src/infrastructure/adapters/fixed-clock.adapter.ts';
import { ANDRES, MARIA } from '../../fixtures/application-harness.ts';
import { createPostgresConcurrentEngine, TEST_DATABASE_URL } from '../../fixtures/concurrent-engines.ts';
import { ControlledStorage, DEFAULT_LIMITS, createMediaEngines, type MediaEngine } from '../../fixtures/media-harness.ts';
import { hasMark, jpegOf, jpegTwoSof, metadataLeft, paddedJpeg, pngOf, webpCanvasFrame, webpOf } from '../../fixtures/user-avatar-011.ts';

const KEY_RE = (userId: string): RegExp => new RegExp(`^users/${userId}/avatar/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$`);
const SECRET_OBJECT_ID = '99999999-9999-4999-8999-999999999901';

interface Surface {
  readonly deps: ApplicationDeps;
  readonly storage: ControlledStorage;
  readonly clock: FixedClockAdapter;
  readonly run: <T>(work: (r: RepositorySet) => Promise<T>) => Promise<T>;
}

const codeOf = async (promise: Promise<unknown>): Promise<string> => {
  try {
    await promise;
    return 'OK';
  } catch (error) {
    return (error as { code?: string }).code ?? `RAW:${String(error)}`;
  }
};
const put = (s: Surface, userId: string, bytes: Uint8Array) => new PutUserAvatarUseCase(s.deps).execute(userId, bytes);
const get = (s: Surface, userId: string, v?: string) => new GetUserAvatarUseCase(s.deps).execute(userId, v);
const meta = (s: Surface, userId: string) => new GetUserAvatarMetaUseCase(s.deps).execute(userId);
const remove = (s: Surface, userId: string) => new DeleteUserAvatarUseCase(s.deps).execute(userId);
const queue = (s: Surface) => s.run((r) => r.mediaQueue.listPending(100));
const advance = (s: Surface, minutes: number): void => {
  const next = new Date(Date.parse(s.clock.nowIsoTimestamp()) + minutes * 60_000).toISOString();
  s.clock.setClock(next.slice(0, 10), next);
};

async function uploadsAndVersions(s: Surface): Promise<void> {
  // SC-011-058 / EDGE-011-007: sin foto -> meta null y 404 de catálogo (la interfaz cae a iniciales).
  expect(await meta(s, ANDRES)).toEqual({ avatarVersion: null });
  expect(await codeOf(get(s, ANDRES))).toBe('ERR-PRF11-AVATAR-NOT-FOUND');

  // SC-011-057 / SC-011-062: sube, recibe la versión, se guarda SOLO la versión saneada bajo users/<uuid>/avatar/<uuid>.
  expect(await put(s, ANDRES, jpegOf(512, 512))).toEqual({ avatarVersion: 1 });
  const first = await s.storage.keys('users/');
  expect(first).toHaveLength(1);
  expect(first[0]).toMatch(KEY_RE(ANDRES));
  const stored = (await s.storage.inner.get(first[0]!))!;
  expect(stored.contentType).toBe('image/jpeg');
  expect([...stored.bytes.slice(0, 2)]).toEqual([0xff, 0xd8]);
  expect(hasMark(stored.bytes)).toBe(false);
  expect(metadataLeft(stored.bytes)).toEqual([]);
  expect(await meta(s, ANDRES)).toEqual({ avatarVersion: 1 });
  expect(Object.keys(await meta(s, ANDRES))).toEqual(['avatarVersion']);

  // GET: con la versión vigente es inmutable; sin v o con otra, no. Devuelve la imagen saneada.
  const current = await get(s, ANDRES, '1');
  expect(current.cacheable).toBe(true);
  expect(hasMark(current.bytes)).toBe(false);
  expect(current.contentType).toBe('image/jpeg');
  expect((await get(s, ANDRES)).cacheable).toBe(false);
  expect((await get(s, ANDRES, '2')).cacheable).toBe(false);
  // Trinity H-5: el Content-Type del GET sale de la firma de los bytes saneados, nunca del tipo almacenado.
  await s.storage.inner.put(first[0]!, stored.bytes, 'text/html');
  expect((await get(s, ANDRES, '1')).contentType).toBe('image/jpeg');
  await s.storage.inner.put(first[0]!, stored.bytes, 'image/jpeg');
  expect(await codeOf(get(s, ANDRES, 'abc'))).toBe('ERR-SCHEMA-VALIDATION-FAILED');

  // REQ-PRF11-002 / INV-PRF11-001 (SC-011-059): otra cuenta no ve nada; no existe lectura por id de usuario ajeno.
  expect(await meta(s, MARIA)).toEqual({ avatarVersion: null });
  expect(await codeOf(get(s, MARIA))).toBe('ERR-PRF11-AVATAR-NOT-FOUND');

  // SC-011-057: reemplazar -> versión 2, otro objeto, la clave anterior se purga (sin huérfano ni residuo en la cola).
  expect(await put(s, ANDRES, pngOf(256, 256))).toEqual({ avatarVersion: 2 });
  const second = await s.storage.keys('users/');
  expect(second).toHaveLength(1);
  expect(second[0]).not.toBe(first[0]);
  expect((await s.storage.inner.get(second[0]!))!.contentType).toBe('image/png');
  expect(hasMark((await s.storage.inner.get(second[0]!))!.bytes)).toBe(false);
  expect(metadataLeft((await s.storage.inner.get(second[0]!))!.bytes)).toEqual([]);
  expect((await queue(s)).map((q) => q.objectKey)).not.toContain(first[0]);

  // WebP también se acepta (SC-011-061: PNG, WebP y JPEG por firma) y sale sin metadatos.
  expect(await put(s, ANDRES, webpOf(128, 128))).toEqual({ avatarVersion: 3 });
  const third = (await s.storage.keys('users/'))[0]!;
  expect((await s.storage.inner.get(third))!.contentType).toBe('image/webp');
  expect(hasMark((await s.storage.inner.get(third))!.bytes)).toBe(false);
  expect(metadataLeft((await s.storage.inner.get(third))!.bytes)).toEqual([]);

  // Quitar: idempotente, borra el objeto, la versión NO se reinicia y la subida posterior continúa la serie.
  await remove(s, ANDRES);
  expect(await meta(s, ANDRES)).toEqual({ avatarVersion: null });
  expect(await s.storage.keys('users/')).toEqual([]);
  expect(await codeOf(get(s, ANDRES))).toBe('ERR-PRF11-AVATAR-NOT-FOUND');
  expect(await codeOf(remove(s, ANDRES))).toBe('OK');
  expect(await codeOf(remove(s, MARIA))).toBe('OK');
  expect(await put(s, ANDRES, jpegOf(512, 512))).toEqual({ avatarVersion: 4 });
  // Objeto ausente en el almacén con fila vigente: 404 de catálogo (la interfaz cae a iniciales sin error).
  await s.storage.inner.delete((await s.storage.keys('users/'))[0]!);
  expect(await codeOf(get(s, ANDRES, '4'))).toBe('ERR-PRF11-AVATAR-NOT-FOUND');
  await remove(s, ANDRES);
}

async function rejections(s: Surface): Promise<void> {
  await put(s, ANDRES, jpegOf(512, 512));
  const before = await s.storage.keys('users/');
  const queueBefore = (await queue(s)).length;
  const cases: Array<[string, Uint8Array, string]> = [
    // SC-011-061: tamaño máximo antes de decodificar (413) y tipo por firma, no por extensión (415).
    ['413 por tamaño', paddedJpeg(512, 512, USER_AVATAR_MAX_BYTES + 1), 'ERR-MEDIA-TOO-LARGE'],
    ['415 texto plano', Uint8Array.from(Buffer.from('esto no es una imagen')), 'ERR-MEDIA-TYPE-NOT-ALLOWED'],
    ['415 SVG con script', Uint8Array.from(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>')), 'ERR-MEDIA-TYPE-NOT-ALLOWED'],
    ['415 PDF', Uint8Array.from([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34, ...new Array(64).fill(0x20)]), 'ERR-MEDIA-TYPE-NOT-ALLOWED'],
    ['415 vacío', new Uint8Array(0), 'ERR-MEDIA-TYPE-NOT-ALLOWED'],
    // 422 de catálogo: no cuadrada, lado fuera de 64..1024, corrupta.
    ['422 no cuadrada', jpegOf(512, 256), 'ERR-PRF11-AVATAR-INVALID-IMAGE'],
    ['422 lado 63', pngOf(63, 63), 'ERR-PRF11-AVATAR-INVALID-IMAGE'],
    ['422 lado 1025', pngOf(1025, 1025), 'ERR-PRF11-AVATAR-INVALID-IMAGE'],
    ['422 WebP lado 2048', webpOf(2048, 2048), 'ERR-PRF11-AVATAR-INVALID-IMAGE'],
    // Trinity H-3: todas las cabeceras declaradas (dos SOF de un JPEG; canvas VP8X y marco VP8L de un WebP).
    ['422 JPEG con segundo SOF fuera de rango', jpegTwoSof(512, 2048), 'ERR-PRF11-AVATAR-INVALID-IMAGE'],
    ['422 JPEG con segundo SOF no cuadrado respecto del primero fuera de 64', jpegTwoSof(512, 32), 'ERR-PRF11-AVATAR-INVALID-IMAGE'],
    ['422 WebP canvas válido y marco interno 2048', webpCanvasFrame(512, 2048), 'ERR-PRF11-AVATAR-INVALID-IMAGE'],
    ['422 PNG corrupto (solo firma)', Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), 'ERR-PRF11-AVATAR-INVALID-IMAGE'],
  ];
  for (const [name, bytes, code] of cases) {
    expect(await codeOf(put(s, ANDRES, bytes)), name).toBe(code);
    // No guarda nada, no encola objeto y la versión no cambia.
    expect(await s.storage.keys('users/'), name).toEqual(before);
    expect((await queue(s)).length, name).toBe(queueBefore);
    expect(await meta(s, ANDRES), name).toEqual({ avatarVersion: 1 });
  }
  // Los límites se aceptan: 64 y 1024 (SC-011-061).
  expect(USER_AVATAR_MIN_SIDE).toBe(64);
  expect(USER_AVATAR_MAX_SIDE).toBe(1024);
  expect(await codeOf(put(s, ANDRES, pngOf(64, 64)))).toBe('OK');
  expect(await codeOf(put(s, ANDRES, pngOf(1024, 1024)))).toBe('OK');
  // El almacén caído -> 502 de medios y la versión no cambia.
  const version = (await meta(s, ANDRES)).avatarVersion;
  s.storage.failing.add('put');
  expect(await codeOf(put(s, ANDRES, jpegOf(512, 512)))).toBe('ERR-MEDIA-STORAGE-UNAVAILABLE');
  s.storage.failing.delete('put');
  expect((await meta(s, ANDRES)).avatarVersion).toBe(version);
}

async function constantsAndReconciliation(s: Surface): Promise<void> {
  // Constantes de app-config (INV-ARCH-006). El límite de 10 subidas por hora se consume en `onRequest` (Trinity H-6) y se prueba por HTTP en
  // `t1554-avatar-usuario-011.api.spec.ts`; aquí el caso de uso no cuenta intentos.
  expect([USER_AVATAR_MAX_BYTES, USER_AVATAR_PUT_MAX_PER_WINDOW, USER_AVATAR_PUT_WINDOW_MINUTES]).toEqual([524_288, 10, 60]);
  await put(s, ANDRES, jpegOf(128, 128));
  await put(s, MARIA, jpegOf(128, 128));

  // Conciliación del prefijo users/ (INV-PRF11-001, ENM-004-MINOR): objeto huérfano antiguo a la cola con DELETE; los referenciados quedan intactos.
  const orphan = userAvatarObjectKey(ANDRES, SECRET_OBJECT_ID);
  await s.storage.inner.put(orphan, jpegOf(128, 128), 'image/jpeg');
  const live = (await s.storage.keys('users/')).filter((k) => k !== orphan);
  expect(live).toHaveLength(2);
  advance(s, 25 * 60);
  const result = await runMediaQueueMaintenance(s.deps);
  expect(result.reconciled).toBeGreaterThanOrEqual(1);
  const keysAfter = await s.storage.keys('users/');
  expect(keysAfter).not.toContain(orphan);
  for (const key of live) expect(keysAfter).toContain(key);
  expect(typeof (await meta(s, ANDRES)).avatarVersion).toBe('number');
  expect(typeof (await meta(s, MARIA)).avatarVersion).toBe('number');
  // Clave fuera del patrón estricto de users/ (otra carpeta, id no UUID v4): nunca se toca.
  const stray = `users/${ANDRES}/otra/${SECRET_OBJECT_ID}`;
  await s.storage.inner.put(stray, jpegOf(128, 128), 'image/jpeg').catch(() => undefined);
  advance(s, 25 * 60);
  await runMediaQueueMaintenance(s.deps);
  expect(await s.storage.keys('users/')).toEqual(expect.not.arrayContaining([orphan]));
}

const open: MediaEngine[] = [];
afterEach(() => open.splice(0).forEach((e) => e.close()));
const surfaceOf = (e: MediaEngine): Surface => ({ deps: e.deps, storage: e.storage, clock: e.clock, run: e.run });

describe('T1554 foto de perfil de usuario sobre Memoria y SQLite', () => {
  it('[REQ-PRF11-001][REQ-PRF11-002][SC-011-057][SC-011-058][SC-011-059][SC-011-062][EDGE-011-007] subir, reemplazar, quitar, versión monótona y aislamiento por cuenta en cada motor', async () => {
    for (const engine of await createMediaEngines(null, {})) {
      open.push(engine);
      await uploadsAndVersions(surfaceOf(engine));
    }
  });

  it('[REQ-PRF11-001][SC-011-061] 413, 415 y 422 sin guardar nada ni encolar; 502 sin cambiar la versión; límites 64 y 1024 aceptados', async () => {
    for (const engine of await createMediaEngines(null, {})) {
      open.push(engine);
      await rejections(surfaceOf(engine));
    }
  });

  it('[REQ-PRF11-001][INV-PRF11-001] constantes USER_AVATAR_* y conciliación del prefijo users/', async () => {
    for (const engine of await createMediaEngines(null, {})) {
      open.push(engine);
      await constantsAndReconciliation(surfaceOf(engine));
    }
  });
});

describe.skipIf(!TEST_DATABASE_URL)('T1554 foto de perfil de usuario sobre PostgreSQL 17 real (SE OMITE: falta TEST_DATABASE_URL)', () => {
  it('[REQ-PRF11-001][REQ-PRF11-002][INV-PRF11-001][SC-011-057..062] mismos escenarios', async () => {
    for (const scenario of [uploadsAndVersions, rejections, constantsAndReconciliation]) {
      const engine = await createPostgresConcurrentEngine();
      try {
        const clock = new FixedClockAdapter();
        const storage = new ControlledStorage(() => new Date(clock.nowIsoTimestamp()));
        const base = engine.depsA();
        const deps: ApplicationDeps = { ...base, clock, media: { storage, limits: DEFAULT_LIMITS } };
        await scenario({ deps, storage, clock, run: (work) => deps.uow.runInTransaction(work) });
      } finally {
        await engine.dispose();
      }
    }
  });
});
