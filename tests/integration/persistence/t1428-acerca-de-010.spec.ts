/**
 * T1428 (pruebas rojas, Feature 010, Bloque E, [GH:#33]): sección «Acerca de» (D10-07), con la MISMA batería sobre memoria, SQLite y PostgreSQL 17 real (esta última se OMITE sin
 * TEST_DATABASE_URL). Lectura pública (con y sin datos), escritura con CAS/versión, sanitización del texto, foto (formato, peso, EXIF, sin rutas de almacenamiento), estado mixto
 * foto/texto (EDGE-010-006), tope de `body_markdown` (EDGE-010-011) y auditoría. La capa HTTP vive en `tests/integration/api/t1428-acerca-de-010.api.spec.ts`.
 *
 * Interfaz PROPUESTA por Keymaker (T1429 fija el contrato; T1430 la implementa). Los módulos se importan de forma dinámica para que cada caso falle por separado mientras no existan:
 *  - `RepositorySet.aboutContent` (singleton `id = 1`): `get(): AboutContentRecord | null` (null = sin contenido, versión 0) y
 *    `replace(next, expectedVersion): AboutContentRecord | null` (compare-and-set: inserta si `expectedVersion = 0` y no hay fila; si no, actualiza solo si `version = expectedVersion`;
 *    devuelve el registro con `version + 1` o `null` si perdió la carrera). Registro: `{ bodyMarkdown, photoObjectKey, photoAlt, version, updatedAt, updatedBy }`.
 *  - `src/application/use-cases/about-use-cases.ts` exporta `GetPublicAboutUseCase`, `GetAdminAboutUseCase`, `UpdateAboutTextUseCase` y `PutAboutPhotoUseCase` (constructor con `ApplicationDeps`,
 *    método `execute`). `ifMatch` es la cabecera cruda (`"3"`); el etag de la vista es `"<version>"`; sin fila la versión es 0 y el etag `"0"`.
 *  - Vista pública: exactamente `{ bodyMarkdown, photoAlt, photoUrl, updatedAt }` (sin ruta de almacenamiento, versión ni autor); `photoUrl` es `/api/about/photo?v=<versión>` o `null`.
 *  - Auditoría propia (`admin_audit_entries`): acciones `ABOUT_UPDATE` (texto) y `ABOUT_PHOTO_UPDATE` (foto), `objectRef = 'about'`, sin valores.
 *  - Errores: 412 `ERR-ACE10-PRECONDITION-FAILED`; 422 `ERR-ACE10-PHOTO-INVALID`; 422 `ERR-SCHEMA-VALIDATION-FAILED` (If-Match ausente o mal formado, tope de 20 000 caracteres, cuerpo inválido);
 *    almacenamiento caído `ERR-MEDIA-STORAGE-UNAVAILABLE`. La foto (como en 006) se valida por firma, se reescribe sin metadatos (`stripImageMetadata`) y el PUT incrementa `version`.
 *
 * ROJO esperado hasta T1429 (tabla y contrato) y T1430 (caso de uso y repositorios): hoy no existen ni la tabla, ni el repositorio, ni los casos de uso.
 *
 * @implements REQ-ACE10-001, REQ-ACE10-002, REQ-ACE10-003, REQ-ACE10-004, INV-ACE10-001, EDGE-010-006, EDGE-010-007, EDGE-010-011, SC-010-027, SC-010-028, SC-010-029, SC-010-030, SC-010-031, SC-010-032, SC-010-033, SC-010-034
 */
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { RepositorySet } from '../../../src/application/ports/repositories.port.ts';
import type { ApplicationDeps } from '../../../src/application/use-cases/use-case-support.ts';
import { COMMENT_MARK, FORBIDDEN_MARKS, HOSTILE_MARKDOWN, HOSTILE_PAYLOADS, hasBytes, jpegWithExif, markdownOfLength, pngWithMetadata, webpWithMetadata } from '../../fixtures/about-fixtures.ts';
import { ENGINE_NAMES, HAS_POSTGRES, openEngine, stateWith, type EngineName, type IdentityEngine } from '../../fixtures/identity-engines.ts';
import { ControlledStorage, DEFAULT_LIMITS } from '../../fixtures/media-harness.ts';

const ROOT = join(import.meta.dirname, '..', '..', '..');
const NOW = '2026-11-05T12:00:00.000Z';
const ADMIN_ID = 'ad000000-0000-4000-8000-000000000001';
const OTHER_ADMIN_ID = 'ad000000-0000-4000-8000-000000000002';
const PUBLIC_KEYS = ['bodyMarkdown', 'photoAlt', 'photoUrl', 'updatedAt'];
const PHOTO_URL = /^\/api\/about\/photo(\?v=\d+)?$/;

interface AboutRecord {
  readonly bodyMarkdown: string;
  readonly photoObjectKey: string | null;
  readonly photoAlt: string;
  readonly version: number;
  readonly updatedAt: string;
  readonly updatedBy: string;
}
type AboutNext = Omit<AboutRecord, 'version'>;
interface AboutRepo {
  get(): Promise<AboutRecord | null>;
  replace(next: AboutNext, expectedVersion: number): Promise<AboutRecord | null>;
}
interface AdminView {
  readonly bodyMarkdown: string;
  readonly photoAlt: string;
  readonly version: number;
  readonly etag: string;
  readonly photoUrl?: string | null;
  readonly updatedAt: string | null;
}
type PublicView = Record<string, unknown> & { readonly bodyMarkdown: string; readonly photoUrl: string | null; readonly photoAlt: string; readonly updatedAt: string | null };
interface AboutUseCases {
  readonly getPublic: () => Promise<PublicView>;
  readonly getAdmin: () => Promise<AdminView>;
  readonly updateText: (input: { adminId: string; ifMatch: string | undefined; body: unknown }) => Promise<AdminView>;
  readonly putPhoto: (input: { adminId: string; ifMatch: string | undefined; bytes: Uint8Array }) => Promise<AdminView>;
}

async function loadAbout(deps: ApplicationDeps): Promise<AboutUseCases> {
  const path = join(ROOT, 'src', 'application', 'use-cases', 'about-use-cases.ts');
  const mod = (await import(/* @vite-ignore */ path)) as Record<string, (new (d: ApplicationDeps) => { execute: (input?: never) => Promise<never> }) | undefined>;
  const make = (name: string) => {
    const Ctor = mod[name];
    if (Ctor === undefined) throw new Error(`about-use-cases.ts no exporta ${name}`);
    return new Ctor(deps);
  };
  const [getPublic, getAdmin, updateText, putPhoto] = ['GetPublicAboutUseCase', 'GetAdminAboutUseCase', 'UpdateAboutTextUseCase', 'PutAboutPhotoUseCase'].map(make);
  return {
    getPublic: () => getPublic!.execute() as Promise<PublicView>,
    getAdmin: () => getAdmin!.execute() as Promise<AdminView>,
    updateText: (input) => updateText!.execute(input as never) as Promise<AdminView>,
    putPhoto: (input) => putPhoto!.execute(input as never) as Promise<AdminView>,
  };
}
const repoOf = (r: RepositorySet): AboutRepo => {
  const repo = (r as unknown as { aboutContent?: AboutRepo }).aboutContent;
  if (repo === undefined) throw new Error('RepositorySet.aboutContent no está implementado (T1430)');
  return repo;
};

const disposers: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const dispose of disposers.splice(0)) await dispose();
});

interface Boot {
  readonly engine: IdentityEngine;
  readonly storage: ControlledStorage;
  readonly about: AboutUseCases;
  readonly current: () => Promise<AboutRecord | null>;
  readonly audit: (adminId?: string) => Promise<Array<{ action: string; objectRef: string | null; adminId: string; occurredAt: string }>>;
  /** Claves vivas en el almacenamiento (puts exitosos menos borrados) que ni son la foto vigente ni están en la cola de borrado: huérfanos. */
  readonly orphans: () => Promise<string[]>;
  readonly putCount: () => number;
}
async function boot(name: EngineName, maxBytes: number = DEFAULT_LIMITS.maxBytes): Promise<Boot> {
  const engine = await openEngine(name, stateWith([]));
  disposers.push(engine.dispose);
  engine.clock.setClock(NOW.slice(0, 10), NOW);
  const storage = new ControlledStorage(() => new Date(engine.clock.nowIsoTimestamp()));
  const deps: ApplicationDeps = { ...engine.deps, media: { storage, limits: { ...DEFAULT_LIMITS, maxBytes } } };
  // Carga perezosa: las pruebas del repositorio no dependen de que los casos de uso existan.
  let loaded: Promise<AboutUseCases> | null = null;
  const lazy = (): Promise<AboutUseCases> => (loaded ??= loadAbout(deps));
  const about: AboutUseCases = {
    getPublic: async () => (await lazy()).getPublic(),
    getAdmin: async () => (await lazy()).getAdmin(),
    updateText: async (input) => (await lazy()).updateText(input),
    putPhoto: async (input) => (await lazy()).putPhoto(input),
  };
  const current = () => engine.read((r) => repoOf(r).get());
  return {
    engine,
    storage,
    about,
    current,
    audit: (adminId = ADMIN_ID) => engine.read((r) => r.adminAudit.listByAdmin(adminId)),
    putCount: () => storage.operations.filter((o) => o.startsWith('put:')).length,
    orphans: async () => {
      const putKeys = [...new Set(storage.operations.filter((o) => o.startsWith('put:')).map((o) => o.slice(4)))];
      const live: string[] = [];
      for (const key of putKeys) if ((await storage.inner.get(key)) !== null) live.push(key);
      const row = await current();
      const orphaned: string[] = [];
      for (const key of live) {
        if (row?.photoObjectKey === key) continue;
        const queued = await engine.read((r) => r.mediaQueue.findByKey(key));
        if (queued === null) orphaned.push(key);
      }
      return orphaned;
    },
  };
}

interface Caught {
  readonly code: string;
  readonly status: number;
}
async function outcome(promise: Promise<unknown>): Promise<Caught | 'OK'> {
  try {
    await promise;
    return 'OK';
  } catch (error) {
    const e = error as Partial<Caught>;
    if (typeof e.code !== 'string' || typeof e.status !== 'number') throw error;
    return { code: e.code, status: e.status };
  }
}
const REJECT = {
  stale: { code: 'ERR-ACE10-PRECONDITION-FAILED', status: 412 },
  photo: { code: 'ERR-ACE10-PHOTO-INVALID', status: 422 },
  schema: { code: 'ERR-SCHEMA-VALIDATION-FAILED', status: 422 },
} as const;
const text = (bodyMarkdown: string, photoAlt = 'Foto del equipo') => ({ bodyMarkdown, photoAlt });
const next = (bodyMarkdown: string, photoObjectKey: string | null = null): AboutNext => ({ bodyMarkdown, photoObjectKey, photoAlt: 'alt', updatedAt: NOW, updatedBy: ADMIN_ID });

describe.each(ENGINE_NAMES)('T1428 Acerca de (%s)', (name) => {
  const skip = name === 'PostgreSQL' && !HAS_POSTGRES;

  // ------------------------------------------------------------ repositorio: singleton con CAS
  it.skipIf(skip)('[REQ-ACE10-004] sin fila get() es null; el primer replace con versión esperada 0 crea la versión 1 con autor y fecha; un segundo «primer» replace pierde (singleton)', async () => {
    const { engine, current } = await boot(name);
    expect(await current()).toBeNull();
    const created = await engine.read((r) => repoOf(r).replace(next('uno'), 0));
    expect(created).toEqual({ bodyMarkdown: 'uno', photoObjectKey: null, photoAlt: 'alt', version: 1, updatedAt: NOW, updatedBy: ADMIN_ID });
    expect(await engine.read((r) => repoOf(r).replace(next('intruso'), 0))).toBeNull();
    expect(await current()).toEqual(created);
    const rows = await engine.rawQuery('SELECT COUNT(*) AS n FROM about_content');
    if (rows !== null) expect(Number(rows[0]!['n'])).toBe(1);
  }, 120_000);

  it.skipIf(skip)('[REQ-ACE10-003] CAS: replace con la versión vigente sube 1; con una versión obsoleta devuelve null y no cambia nada', async () => {
    const { engine, current } = await boot(name);
    await engine.read((r) => repoOf(r).replace(next('uno'), 0));
    const second = await engine.read((r) => repoOf(r).replace(next('dos'), 1));
    expect(second?.version).toBe(2);
    expect(await engine.read((r) => repoOf(r).replace(next('obsoleta'), 1))).toBeNull();
    expect(await engine.read((r) => repoOf(r).replace(next('futura'), 7))).toBeNull();
    expect(await current()).toEqual(second);
  }, 120_000);

  // ------------------------------------------------------------ lectura pública
  it.skipIf(skip)('[REQ-ACE10-001][SC-010-027] sin datos: la lectura pública es el estado vacío limpio (texto vacío, sin foto, sin fecha) y la vista de administración es la versión 0', async () => {
    const { about } = await boot(name);
    expect(await about.getPublic()).toEqual({ bodyMarkdown: '', photoUrl: null, photoAlt: '', updatedAt: null });
    expect(await about.getAdmin()).toMatchObject({ bodyMarkdown: '', photoAlt: '', version: 0, etag: '"0"' });
  }, 120_000);

  it.skipIf(skip)('[REQ-ACE10-001][SC-010-028][SC-010-029] con datos: la publicación es inmediata, la vista pública tiene solo las cuatro claves y el etag de administración es "<versión>"', async () => {
    const { about, engine } = await boot(name);
    const view = await about.updateText({ adminId: ADMIN_ID, ifMatch: '"0"', body: text('# Quiénes somos\n\nTexto **público**.', 'Equipo de Tipi') });
    expect(view).toMatchObject({ version: 1, etag: '"1"', bodyMarkdown: '# Quiénes somos\n\nTexto **público**.', photoAlt: 'Equipo de Tipi' });
    const pub = await about.getPublic();
    expect(pub).toEqual({ bodyMarkdown: '# Quiénes somos\n\nTexto **público**.', photoUrl: null, photoAlt: 'Equipo de Tipi', updatedAt: NOW });
    expect(Object.keys(pub).sort()).toEqual(PUBLIC_KEYS);
    expect((await engine.read((r) => repoOf(r).get()))?.updatedBy).toBe(ADMIN_ID);
  }, 120_000);

  // ------------------------------------------------------------ CAS por If-Match
  it.skipIf(skip)('[REQ-ACE10-003] If-Match obsoleto: 412 ERR-ACE10-PRECONDITION-FAILED sin escribir ni auditar; ausente o mal formado: 422 ERR-SCHEMA-VALIDATION-FAILED', async () => {
    const { about, current, audit } = await boot(name);
    await about.updateText({ adminId: ADMIN_ID, ifMatch: '"0"', body: text('uno') });
    const auditBefore = (await audit()).length;
    expect(await outcome(about.updateText({ adminId: ADMIN_ID, ifMatch: '"0"', body: text('obsoleto') }))).toEqual(REJECT.stale);
    expect(await outcome(about.updateText({ adminId: OTHER_ADMIN_ID, ifMatch: '"9"', body: text('futuro') }))).toEqual(REJECT.stale);
    for (const ifMatch of [undefined, '', 'abc', '"-1"', '"1.5"', '*', '"1","2"']) {
      expect(await outcome(about.updateText({ adminId: ADMIN_ID, ifMatch, body: text('sin precondicion válida') })), String(ifMatch)).toEqual(REJECT.schema);
    }
    expect((await current())?.bodyMarkdown).toBe('uno');
    expect((await current())?.version).toBe(1);
    expect((await audit()).length).toBe(auditBefore);
  }, 120_000);

  it.skipIf(skip)('[REQ-ACE10-003] dos administradores con la misma versión: gana uno (versión 2) y el otro recibe 412 sin pisar el texto', async () => {
    const { about, current } = await boot(name);
    await about.updateText({ adminId: ADMIN_ID, ifMatch: '"0"', body: text('base') });
    const results = await Promise.all([
      outcome(about.updateText({ adminId: ADMIN_ID, ifMatch: '"1"', body: text('de uno') })),
      outcome(about.updateText({ adminId: OTHER_ADMIN_ID, ifMatch: '"1"', body: text('de dos') })),
    ]);
    expect(results.filter((r) => r === 'OK')).toHaveLength(1);
    expect(results.filter((r) => r !== 'OK')).toEqual([REJECT.stale]);
    const row = await current();
    expect(row?.version).toBe(2);
    expect(['de uno', 'de dos']).toContain(row?.bodyMarkdown);
  }, 120_000);

  // ------------------------------------------------------------ sanitización del texto
  it.skipIf(skip)('[EDGE-010-007][SC-010-030] el Markdown hostil se sanitiza al guardar: lo almacenado y lo público no tienen HTML, esquemas ejecutables ni imágenes remotas', async () => {
    const { about, current } = await boot(name);
    let version = 0;
    for (const { name: label, source } of HOSTILE_MARKDOWN) {
      await about.updateText({ adminId: ADMIN_ID, ifMatch: `"${version}"`, body: text(source) });
      version += 1;
      const stored = (await current())!.bodyMarkdown;
      const published = (await about.getPublic()).bodyMarkdown;
      for (const out of [stored, published]) {
        expect(out, label).not.toMatch(/<\s*\/?\s*[a-z!?]/i);
        expect(out, label).not.toMatch(/(java|vb)\s*script\s*:/i);
        expect(out, label).not.toContain('![');
        expect(out, label).not.toMatch(/data\s*:\s*(text|image)/i);
        expect(out, label).not.toContain('tracker.example');
      }
    }
  }, 120_000);

  // ------------------------------------------------------------ tope de body_markdown (EDGE-010-011)
  it.skipIf(skip)('[EDGE-010-011][SC-010-031] 20 000 caracteres se aceptan y se publican completos; 20 001 se rechazan con 422 ERR-SCHEMA-VALIDATION-FAILED sin escribir ni auditar', async () => {
    const { about, current, audit } = await boot(name);
    const ok = await about.updateText({ adminId: ADMIN_ID, ifMatch: '"0"', body: text(markdownOfLength(20_000)) });
    expect(ok.version).toBe(1);
    expect((await about.getPublic()).bodyMarkdown).toHaveLength(20_000);
    const auditBefore = (await audit()).length;
    expect(await outcome(about.updateText({ adminId: ADMIN_ID, ifMatch: '"1"', body: text(markdownOfLength(20_001)) }))).toEqual(REJECT.schema);
    expect((await current())?.bodyMarkdown).toHaveLength(20_000);
    expect((await current())?.version).toBe(1);
    expect((await audit()).length).toBe(auditBefore);
  }, 120_000);

  it.skipIf(skip)('[REQ-ACE10-003] cuerpo inválido (sin bodyMarkdown, no cadena, propiedad extra, photoAlt no cadena): 422 ERR-SCHEMA-VALIDATION-FAILED y nada cambia', async () => {
    const { about, current } = await boot(name);
    for (const body of [{}, { bodyMarkdown: 7, photoAlt: '' }, { bodyMarkdown: null, photoAlt: '' }, { ...text('x'), version: 99 }, { bodyMarkdown: 'x', photoAlt: 5 }, 'texto', null]) {
      expect(await outcome(about.updateText({ adminId: ADMIN_ID, ifMatch: '"0"', body })), JSON.stringify(body)).toEqual(REJECT.schema);
    }
    expect(await current()).toBeNull();
  }, 120_000);

  // ------------------------------------------------------------ foto: formato, EXIF, sin rutas
  for (const [label, bytes, mime] of [
    ['JPEG', jpegWithExif(), 'image/jpeg'],
    ['PNG', pngWithMetadata(), 'image/png'],
    ['WebP', webpWithMetadata(), 'image/webp'],
  ] as const) {
    it.skipIf(skip)(`[INV-ACE10-001][SC-010-032][EDGE-010-007] foto ${label} con EXIF/XMP/comentarios: se publica SIN metadatos, con el tipo detectado, versión +1 y sin exponer la ruta de almacenamiento`, async () => {
      const { about, storage, current, engine } = await boot(name);
      for (const mark of FORBIDDEN_MARKS.filter((m) => label !== 'WebP' || m !== COMMENT_MARK)) expect(hasBytes(bytes, mark), `la fixture ${label} debe llevar ${mark}`).toBe(true);
      const view = await about.putPhoto({ adminId: ADMIN_ID, ifMatch: '"0"', bytes });
      expect(view.version).toBe(1);
      const row = (await current())!;
      expect(typeof row.photoObjectKey).toBe('string');
      const stored = await storage.inner.get(row.photoObjectKey!);
      expect(stored?.contentType).toBe(mime);
      for (const mark of FORBIDDEN_MARKS) expect(hasBytes(stored!.bytes, mark), `el objeto publicado conserva ${mark}`).toBe(false);
      const pub = await about.getPublic();
      expect(pub.photoUrl).toMatch(PHOTO_URL);
      expect(Object.keys(pub).sort()).toEqual(PUBLIC_KEYS);
      const dump = JSON.stringify(pub);
      for (const leaked of [row.photoObjectKey!, 'photo_object_key', 'photoObjectKey', 'storage.googleapis', 'gs://', 'updatedBy', ADMIN_ID]) expect(dump, leaked).not.toContain(leaked);
      expect((await engine.read((r) => repoOf(r).get()))?.version).toBe(1);
    }, 120_000);
  }

  it.skipIf(skip)('[REQ-ACE10-002][EDGE-010-007][SC-010-033] cargas que no son foto (SVG, HTML, XML con BOM, PDF, texto, vacío, PNG truncado): 422 ERR-ACE10-PHOTO-INVALID sin tocar el almacenamiento, la fila ni la auditoría', async () => {
    const { about, current, audit, putCount } = await boot(name);
    for (const { name: label, bytes } of HOSTILE_PAYLOADS) {
      expect(await outcome(about.putPhoto({ adminId: ADMIN_ID, ifMatch: '"0"', bytes })), label).toEqual(REJECT.photo);
    }
    expect(putCount()).toBe(0);
    expect(await current()).toBeNull();
    expect(await audit()).toEqual([]);
  }, 120_000);

  it.skipIf(skip)('[REQ-ACE10-002][SC-010-033] peso: una foto de exactamente el tope se acepta y una de un byte más se rechaza con 422 ERR-ACE10-PHOTO-INVALID', async () => {
    const bytes = jpegWithExif();
    const accepting = await boot(name, bytes.length);
    expect((await accepting.about.putPhoto({ adminId: ADMIN_ID, ifMatch: '"0"', bytes })).version).toBe(1);
    const rejecting = await boot(name, bytes.length - 1);
    expect(await outcome(rejecting.about.putPhoto({ adminId: ADMIN_ID, ifMatch: '"0"', bytes }))).toEqual(REJECT.photo);
    expect(rejecting.putCount()).toBe(0);
    expect(await rejecting.current()).toBeNull();
  }, 120_000);

  it.skipIf(skip)('[EDGE-010-006][REQ-ACE10-002] subir y reemplazar la foto SIEMPRE incrementa version; el objeto anterior no queda huérfano y la URL pública cambia con la versión', async () => {
    const { about, orphans, current } = await boot(name);
    const first = await about.putPhoto({ adminId: ADMIN_ID, ifMatch: '"0"', bytes: jpegWithExif() });
    const firstKey = (await current())!.photoObjectKey;
    const second = await about.putPhoto({ adminId: ADMIN_ID, ifMatch: first.etag, bytes: pngWithMetadata() });
    expect([first.version, second.version]).toEqual([1, 2]);
    const row = (await current())!;
    expect(row.photoObjectKey).not.toBe(firstKey);
    expect(await orphans()).toEqual([]);
    expect((await about.getPublic()).photoUrl).toBe('/api/about/photo?v=2');
  }, 120_000);

  it.skipIf(skip)('[EDGE-010-006] la foto no pisa el texto: subirla conserva bodyMarkdown y photoAlt, y el texto posterior conserva la foto', async () => {
    const { about, current } = await boot(name);
    await about.updateText({ adminId: ADMIN_ID, ifMatch: '"0"', body: text('texto', 'alt vigente') });
    await about.putPhoto({ adminId: ADMIN_ID, ifMatch: '"1"', bytes: jpegWithExif() });
    const afterPhoto = (await current())!;
    expect([afterPhoto.bodyMarkdown, afterPhoto.photoAlt, afterPhoto.version]).toEqual(['texto', 'alt vigente', 2]);
    await about.updateText({ adminId: ADMIN_ID, ifMatch: '"2"', body: text('texto nuevo', 'alt nuevo') });
    const afterText = (await current())!;
    expect(afterText.photoObjectKey).toBe(afterPhoto.photoObjectKey);
    expect([afterText.bodyMarkdown, afterText.photoAlt, afterText.version]).toEqual(['texto nuevo', 'alt nuevo', 3]);
  }, 120_000);

  // ------------------------------------------------------------ estado mixto foto/texto (EDGE-010-006)
  it.skipIf(skip)('[EDGE-010-006] red caída durante la subida a GCS: ERR-MEDIA-STORAGE-UNAVAILABLE, el público y la administración siguen igual (sin estado mixto), sin auditoría; reintentar con la misma versión funciona', async () => {
    const { about, storage, current, audit, orphans } = await boot(name);
    await about.updateText({ adminId: ADMIN_ID, ifMatch: '"0"', body: text('solo texto') });
    const publicBefore = await about.getPublic();
    const auditBefore = (await audit()).length;
    storage.down = true;
    expect(await outcome(about.putPhoto({ adminId: ADMIN_ID, ifMatch: '"1"', bytes: jpegWithExif() }))).toMatchObject({ code: 'ERR-MEDIA-STORAGE-UNAVAILABLE' });
    storage.down = false;
    expect(await about.getPublic()).toEqual(publicBefore);
    expect((await current())?.photoObjectKey).toBeNull();
    expect((await current())?.version).toBe(1);
    expect((await audit()).length).toBe(auditBefore);
    expect(await orphans()).toEqual([]);
    const retry = await about.putPhoto({ adminId: ADMIN_ID, ifMatch: '"1"', bytes: jpegWithExif() });
    expect(retry.version).toBe(2);
  }, 120_000);

  it.skipIf(skip)('[EDGE-010-006] carrera foto vs texto: si el texto sube la versión mientras la foto se sube al almacenamiento, la foto recibe 412, el texto gana, el público no ve estado mixto y el objeto subido no queda huérfano', async () => {
    const { about, storage, current, engine, orphans } = await boot(name);
    storage.beforePut = async () => {
      storage.beforePut = null;
      await engine.read((r) => repoOf(r).replace(next('texto ganador'), 0));
    };
    expect(await outcome(about.putPhoto({ adminId: ADMIN_ID, ifMatch: '"0"', bytes: jpegWithExif() }))).toEqual(REJECT.stale);
    const row = (await current())!;
    expect([row.bodyMarkdown, row.photoObjectKey, row.version]).toEqual(['texto ganador', null, 1]);
    expect((await about.getPublic()).photoUrl).toBeNull();
    expect(await orphans()).toEqual([]);
  }, 120_000);

  it.skipIf(skip)('[EDGE-010-006] foto con versión obsoleta frente a un texto ya guardado: 412 ERR-ACE10-PRECONDITION-FAILED, sin objeto huérfano y el texto intacto', async () => {
    const { about, current, orphans, audit } = await boot(name);
    await about.updateText({ adminId: ADMIN_ID, ifMatch: '"0"', body: text('texto vigente') });
    const auditBefore = (await audit()).length;
    expect(await outcome(about.putPhoto({ adminId: ADMIN_ID, ifMatch: '"0"', bytes: jpegWithExif() }))).toEqual(REJECT.stale);
    expect((await current())?.bodyMarkdown).toBe('texto vigente');
    expect((await current())?.photoObjectKey).toBeNull();
    expect(await orphans()).toEqual([]);
    expect((await audit()).length).toBe(auditBefore);
  }, 120_000);

  // ------------------------------------------------------------ auditoría
  it.skipIf(skip)('[SC-010-034][REQ-ACE10-003] cada cambio deja UNA entrada en admin_audit_entries (ABOUT_UPDATE o ABOUT_PHOTO_UPDATE, objeto about, id de administrador, reloj inyectado) sin texto, alt, clave ni bytes', async () => {
    const { about, audit, current } = await boot(name);
    await about.updateText({ adminId: ADMIN_ID, ifMatch: '"0"', body: text('contenido secreto del texto', 'alt secreto') });
    await about.putPhoto({ adminId: OTHER_ADMIN_ID, ifMatch: '"1"', bytes: jpegWithExif() });
    expect(await audit(ADMIN_ID)).toEqual([{ id: expect.stringMatching(/^[0-9a-f-]{36}$/), adminId: ADMIN_ID, action: 'ABOUT_UPDATE', objectRef: 'about', occurredAt: NOW }]);
    expect(await audit(OTHER_ADMIN_ID)).toEqual([{ id: expect.stringMatching(/^[0-9a-f-]{36}$/), adminId: OTHER_ADMIN_ID, action: 'ABOUT_PHOTO_UPDATE', objectRef: 'about', occurredAt: NOW }]);
    const dump = JSON.stringify([...(await audit(ADMIN_ID)), ...(await audit(OTHER_ADMIN_ID))]);
    for (const secret of ['contenido secreto', 'alt secreto', (await current())!.photoObjectKey!]) expect(dump).not.toContain(secret);
  }, 120_000);
});
