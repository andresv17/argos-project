/**
 * T1433 (Feature 010, compuerta de cobertura de ramas): comportamiento de «Acerca de» que el umbral global de 95 % exigía y la batería T1428 no ejercía:
 * If-Match fuera del rango seguro (412), alt de foto sobre el tope (422), pérdida del compare-and-set DENTRO de la transacción (412 sin huérfanos), foto cuyo contenedor
 * no se puede reescribir (422), fallo del descarte tras un `put`, y la foto pública cuando el almacenamiento cae, el objeto falta o ya no es una imagen (404 / 502).
 * Más ramas del sanitizador: destino entre `<...>`, título opcional del enlace y entrada que sigue cambiando tras el tope de pasadas. Motor en memoria (la lógica es del caso de uso).
 *
 * @implements REQ-ACE10-001, REQ-ACE10-002, REQ-ACE10-003, REQ-ACE10-004, INV-ACE10-001, EDGE-010-006, EDGE-010-007, EDGE-010-011
 */
import { afterEach, describe, expect, it } from 'vitest';
import type { RepositorySet } from '../../../src/application/ports/repositories.port.ts';
import { GetPublicAboutPhotoUseCase, PutAboutPhotoUseCase, UpdateAboutTextUseCase } from '../../../src/application/use-cases/about-use-cases.ts';
import type { ApplicationDeps } from '../../../src/application/use-cases/use-case-support.ts';
import { ABOUT_PHOTO_ALT_MAX_CHARS, sanitizeAboutMarkdown } from '../../../src/domain/about/about-markdown.ts';
import { jpegWithExif, pngWithMetadata } from '../../fixtures/about-fixtures.ts';
import { openEngine, stateWith, type IdentityEngine } from '../../fixtures/identity-engines.ts';
import { ControlledStorage, DEFAULT_LIMITS } from '../../fixtures/media-harness.ts';

const NOW = '2026-11-05T12:00:00.000Z';
const ADMIN_ID = 'ad000000-0000-4000-8000-000000000001';

const disposers: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const dispose of disposers.splice(0)) await dispose();
});

interface Boot {
  readonly engine: IdentityEngine;
  readonly storage: ControlledStorage;
  readonly deps: ApplicationDeps;
}
async function boot(): Promise<Boot> {
  const engine = await openEngine('memoria', stateWith([]));
  disposers.push(engine.dispose);
  engine.clock.setClock(NOW.slice(0, 10), NOW);
  const storage = new ControlledStorage(() => new Date(engine.clock.nowIsoTimestamp()));
  return { engine, storage, deps: { ...engine.deps, media: { storage, limits: DEFAULT_LIMITS } } };
}

/** Copia de `deps` cuyo repositorio de «Acerca de» pierde SIEMPRE la carrera del compare-and-set; las transacciones desde la `failFrom`-ésima (1 = la primera) lanzan. */
function losingCas(deps: ApplicationDeps, failFrom: number = Number.POSITIVE_INFINITY): ApplicationDeps {
  let calls = 0;
  const uow: ApplicationDeps['uow'] = {
    runInTransaction: <T>(work: (repositories: RepositorySet) => Promise<T>): Promise<T> => {
      calls += 1;
      if (calls >= failFrom) return Promise.reject(new Error('transaccion caida'));
      return deps.uow.runInTransaction((r) => work({ ...r, aboutContent: { get: () => r.aboutContent.get(), replace: () => Promise.resolve(null) } }));
    },
  };
  return { ...deps, uow };
}

const failureOf = async (work: () => Promise<unknown>): Promise<{ readonly code?: string; readonly message?: string }> => {
  try {
    await work();
  } catch (error) {
    return error as { code?: string };
  }
  throw new Error('se esperaba un fallo y la operacion termino bien');
};

describe('T1433 Acerca de: ramas de error del caso de uso', () => {
  it('[EDGE-010-011] un If-Match numerico fuera del rango seguro nunca coincide: 412 y no escribe', async () => {
    const { deps, engine } = await boot();
    const update = new UpdateAboutTextUseCase(deps);
    const error = await failureOf(() => update.execute({ adminId: ADMIN_ID, ifMatch: '"99999999999999999999999"', body: { bodyMarkdown: 'x', photoAlt: '' } }));
    expect(error.code).toBe('ERR-ACE10-PRECONDITION-FAILED');
    expect(await engine.read((r) => r.aboutContent.get())).toBeNull();
  });

  it('[EDGE-010-011] photoAlt por encima del tope es 422 de esquema sobre photoAlt y no escribe', async () => {
    const { deps, engine } = await boot();
    const update = new UpdateAboutTextUseCase(deps);
    const error = await failureOf(() => update.execute({ adminId: ADMIN_ID, ifMatch: '"0"', body: { bodyMarkdown: 'x', photoAlt: 'a'.repeat(ABOUT_PHOTO_ALT_MAX_CHARS + 1) } }));
    expect(error.code).toBe('ERR-SCHEMA-VALIDATION-FAILED');
    expect(await engine.read((r) => r.aboutContent.get())).toBeNull();
    const ok = await update.execute({ adminId: ADMIN_ID, ifMatch: '"0"', body: { bodyMarkdown: 'x', photoAlt: 'a'.repeat(ABOUT_PHOTO_ALT_MAX_CHARS) } });
    expect(ok.version).toBe(1);
  });

  it('[REQ-ACE10-003] perder el compare-and-set dentro de la transaccion del texto es 412 y no deja auditoria', async () => {
    const { deps, engine } = await boot();
    const error = await failureOf(() => new UpdateAboutTextUseCase(losingCas(deps)).execute({ adminId: ADMIN_ID, ifMatch: '"0"', body: { bodyMarkdown: 'x', photoAlt: '' } }));
    expect(error.code).toBe('ERR-ACE10-PRECONDITION-FAILED');
    expect(await engine.read((r) => r.adminAudit.listByAdmin(ADMIN_ID))).toEqual([]);
  });

  it('[EDGE-010-006] perder el compare-and-set tras subir la foto es 412 y el objeto subido se limpia (sin huerfanos)', async () => {
    const { deps, engine, storage } = await boot();
    const error = await failureOf(() => new PutAboutPhotoUseCase(losingCas(deps)).execute({ adminId: ADMIN_ID, ifMatch: '"0"', bytes: jpegWithExif() }));
    expect(error.code).toBe('ERR-ACE10-PRECONDITION-FAILED');
    expect(storage.operations.filter((o) => o.startsWith('put:'))).toHaveLength(1);
    expect(await storage.keys('about/')).toEqual([]);
    expect(await engine.read((r) => r.aboutContent.get())).toBeNull();
  });

  it('[EDGE-010-006] si ademas falla la transaccion de descarte el error original se conserva y la clave queda en el almacenamiento para el mantenimiento', async () => {
    const { deps, storage } = await boot();
    const error = await failureOf(() => new PutAboutPhotoUseCase(losingCas(deps, 3)).execute({ adminId: ADMIN_ID, ifMatch: '"0"', bytes: jpegWithExif() }));
    expect(error.code).toBe('ERR-ACE10-PRECONDITION-FAILED');
    expect(await storage.keys('about/')).toHaveLength(1);
  });

  it('[INV-ACE10-001] un PNG con firma y dimensiones validas pero un trozo corrupto no se puede reescribir: 422 y no toca el almacenamiento', async () => {
    const { deps, storage } = await boot();
    const png = pngWithMetadata();
    const corrupt = Uint8Array.from(png);
    corrupt[corrupt.length - 20] = corrupt[corrupt.length - 20]! ^ 0xff; // dato de IDAT: el CRC deja de coincidir
    const error = await failureOf(() => new PutAboutPhotoUseCase(deps).execute({ adminId: ADMIN_ID, ifMatch: '"0"', bytes: corrupt }));
    expect(error.code).toBe('ERR-ACE10-PHOTO-INVALID');
    expect(storage.operations).toEqual([]);
  });
});

describe('T1433 Acerca de: foto publica ante fallos del almacenamiento', () => {
  async function withPhoto(): Promise<Boot & { readonly key: string }> {
    const b = await boot();
    await new PutAboutPhotoUseCase(b.deps).execute({ adminId: ADMIN_ID, ifMatch: '"0"', bytes: jpegWithExif() });
    const key = (await b.engine.read((r) => r.aboutContent.get()))!.photoObjectKey!;
    return { ...b, key };
  }

  it('[REQ-ACE10-001] con la foto vigente se sirven sus bytes y su tipo', async () => {
    const { deps } = await withPhoto();
    const photo = await new GetPublicAboutPhotoUseCase(deps).execute();
    expect(photo.mime).toBe('image/jpeg');
    expect(photo.bytes.length).toBeGreaterThan(0);
  });

  it('[REQ-ACE10-001] almacenamiento caido al leer la foto: error de almacenamiento (no un 500 generico)', async () => {
    const { deps, storage } = await withPhoto();
    storage.failing.add('get');
    const error = await failureOf(() => new GetPublicAboutPhotoUseCase(deps).execute());
    expect(error.code).toBe('ERR-MEDIA-STORAGE-UNAVAILABLE');
  });

  it('[REQ-ACE10-001] fila con foto pero objeto ausente en el almacenamiento: 404', async () => {
    const { deps, storage, key } = await withPhoto();
    await storage.inner.delete(key);
    const error = await failureOf(() => new GetPublicAboutPhotoUseCase(deps).execute());
    expect(error.code).toBe('ERR-MEDIA-NOT-FOUND');
  });

  it('[INV-ACE10-001][EDGE-010-007] objeto vigente que ya no es JPEG, PNG ni WebP: 404 (nunca se sirve)', async () => {
    const { deps, storage, key } = await withPhoto();
    await storage.inner.put(key, new TextEncoder().encode('<html><script>alert(1)</script></html>'), 'image/jpeg');
    const error = await failureOf(() => new GetPublicAboutPhotoUseCase(deps).execute());
    expect(error.code).toBe('ERR-MEDIA-NOT-FOUND');
  });
});

describe('T1433 sanitizador de Acerca de: ramas de destino y de tope de pasadas', () => {
  it('[EDGE-010-007] destino entre <...> que no es etiqueta se descarta y deja solo el texto; sin cierre en la misma linea queda inerte', () => {
    expect(sanitizeAboutMarkdown('[a](<1>) y')).toBe('a y');
    expect(sanitizeAboutMarkdown('[a](<1\n>) y')).toBe('[a] <1\n>) y');
  });

  it('[EDGE-010-007] un enlace seguro con titulo conserva el destino y descarta el titulo', () => {
    expect(sanitizeAboutMarkdown('[a](/x "titulo") y')).toBe('[a](/x) y');
    expect(sanitizeAboutMarkdown("[a](https://example.com 'otro') y")).toBe('[a](https://example.com) y');
  });

  it('[EDGE-010-007] una entrada que sigue cambiando tras el tope de pasadas termina sin ningun < ni > y es idempotente', () => {
    const adversarial = `${'<'.repeat(30)}a${'a>'.repeat(30)} z`;
    const out = sanitizeAboutMarkdown(adversarial);
    expect(out).not.toMatch(/[<>]/);
    expect(out.endsWith(' z')).toBe(true);
    expect(sanitizeAboutMarkdown(out)).toBe(out);
  });
});
