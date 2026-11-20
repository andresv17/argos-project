/**
 * Arnés de pruebas de medios (T576, T579, T583, T587): los mismos casos de uso sobre la unidad de trabajo en memoria y sobre SQLite en
 * memoria, con el estado canónico (Andrés propietario de Argos; María miembro del hogar con el rol que se indique; Lucía sin acceso),
 * reloj fijo, ids deterministas y un almacenamiento de objetos de memoria controlable (caída, esperas, observación).
 */
import type { MediaListEntry, MediaObject, MediaReadUrl, MediaReadUrlRequest, MediaStoragePort } from '../../src/application/ports/media-storage.port.ts';
import { MediaStorageUnavailableError } from '../../src/application/ports/media-storage.port.ts';
import type { PlatformParameterPort } from '../../src/application/ports/platform-parameter.port.ts';
import type { MediaLimits } from '../../src/application/use-cases/use-case-support.ts';
import type { ApplicationDeps } from '../../src/application/use-cases/use-case-support.ts';
import { DeterministicIdAdapter } from '../../src/infrastructure/adapters/deterministic-id.adapter.ts';
import { FixedClockAdapter } from '../../src/infrastructure/adapters/fixed-clock.adapter.ts';
import { MemoryMediaStorageAdapter } from '../../src/infrastructure/adapters/memory-media-storage.adapter.ts';
import { DomainError } from '../../src/generated/index.ts';
import { DomainError as DomainErrorV31 } from '../../src/generated/v31/index.ts';
import { InMemoryUnitOfWork } from '../../src/infrastructure/persistence/memory/in-memory-unit-of-work.ts';
import { IN_MEMORY_DATABASE, openSqliteDatabase, type SqliteDatabase } from '../../src/infrastructure/persistence/sqlite/sqlite-database.ts';
import { SqliteUnitOfWork } from '../../src/infrastructure/persistence/sqlite/sqlite-unit-of-work.ts';
import { ANDRES, ARGOS, LUCIA, MARIA, canonicalState, createDeps, GENERATED_IDS } from './application-harness.ts';
import { dumpSqlite, seedSqlite } from './sqlite-harness.ts';
import { SpyPasswordHasher } from './test-doubles.ts';
import { upgradePet, upgradeRecords } from './storage-upgrade.ts';
import type { HouseholdRole } from './record-engines.ts';

export { ANDRES, ARGOS, LUCIA, MARIA };

export const DEFAULT_LIMITS: MediaLimits = { maxBytes: 10_485_760, maxBytesPerOwner: 1_073_741_824, maxConcurrentUploads: 4, signedUrlTtlSeconds: 300 };

/** Bytes con la firma de cada tipo, rellenados hasta `size`. */
export const PDF = (size = 64): Uint8Array => fill(size, [0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34]);
export const JPEG = (size = 64): Uint8Array => fill(size, [0xff, 0xd8, 0xff, 0xe0]);
export const PNG = (size = 64): Uint8Array => fill(size, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
export const WEBP = (size = 64): Uint8Array => fill(size, [0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]);
export const text = (value: string): Uint8Array => new TextEncoder().encode(value);
function fill(size: number, head: readonly number[]): Uint8Array {
  const out = new Uint8Array(Math.max(size, head.length));
  out.set(head);
  return out;
}

/** Código del error de dominio (de la 002 o de la 3.1.0) o `OK`; cualquier otro error se relanza. */
export async function codeOf(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
    return 'OK';
  } catch (error) {
    if (error instanceof DomainError || error instanceof DomainErrorV31) return error.code;
    throw error;
  }
}

/** Error de dominio completo (para comparar el cuerpo de dos rechazos). */
export async function errorOf(promise: Promise<unknown>): Promise<DomainError | DomainErrorV31> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof DomainError || error instanceof DomainErrorV31) return error;
    throw error;
  }
  throw new Error('se esperaba un rechazo');
}

/** Almacenamiento de memoria con caída simulada, esperas antes del `put` y registro de operaciones. */
export class ControlledStorage implements MediaStoragePort {
  readonly inner: MemoryMediaStorageAdapter;
  readonly operations: string[] = [];
  /** Cuando es true, toda operación falla con MediaStorageUnavailableError. */
  down = false;
  /** Falla solo estas operaciones. */
  failing = new Set<string>();
  /** Se ejecuta antes de cada `put` (puede esperar o provocar cambios concurrentes). */
  beforePut: ((key: string) => Promise<void>) | null = null;

  constructor(now: () => Date) {
    this.inner = new MemoryMediaStorageAdapter({ now });
  }

  private check(operation: 'put' | 'get' | 'delete' | 'list' | 'createReadUrl', key: string): void {
    this.operations.push(`${operation}:${key}`);
    if (this.down || this.failing.has(operation)) throw new MediaStorageUnavailableError(operation);
  }

  async put(key: string, bytes: Uint8Array, contentType: string): Promise<void> {
    this.check('put', key);
    if (this.beforePut !== null) await this.beforePut(key);
    return this.inner.put(key, bytes, contentType);
  }
  async get(key: string): Promise<MediaObject | null> {
    this.check('get', key);
    return this.inner.get(key);
  }
  async delete(key: string): Promise<void> {
    this.check('delete', key);
    return this.inner.delete(key);
  }
  async list(prefix: string): Promise<readonly MediaListEntry[]> {
    this.check('list', prefix);
    return this.inner.list(prefix);
  }
  async createReadUrl(request: MediaReadUrlRequest): Promise<MediaReadUrl> {
    this.check('createReadUrl', request.key);
    // El adaptador de memoria devuelve una ruta relativa de desarrollo (`/__dev/media/…`); el contrato exige una URL https (MediaAccess.url). El doble
    // conserva las validaciones del adaptador y entrega una URL con la forma de la de GCS (host virtual del bucket).
    const { expiresAt } = await this.inner.createReadUrl(request);
    return { url: `https://argos-media-test.storage.googleapis.com/${request.key}?X-Goog-Expires=${request.ttlSeconds}`, expiresAt };
  }
  /** Claves vivas del prefijo (sin pasar por la caída simulada). */
  async keys(prefix = 'pets/'): Promise<string[]> {
    return (await this.inner.list(prefix)).map((e) => e.key);
  }
}

export interface MediaEngine {
  readonly name: 'memoria' | 'SQLite';
  readonly deps: ApplicationDeps;
  readonly storage: ControlledStorage;
  readonly clock: FixedClockAdapter;
  /** Filas de `pet_media` de la mascota. */
  mediaRows(petId?: string): Promise<Array<{ id: string; petId: string; kind: string; mime: string; sizeBytes: number; originalName: string }>>;
  queue(): Promise<Array<{ objectKey: string; reason: string; attempts: number }>>;
  audit(entityType: string): Promise<Array<{ mutationType: string; entityId: string; previousStateHash: string | null; newStateHash: string | null }>>;
  avatar(petId?: string): Promise<{ version: number; objectId: string | null } | null>;
  /**
   * T813 (006, N2-06 (c)): siembra la foto de un hogar (`household_photos`, data-model §2.4) sin pasar por un caso de uso (la API de la foto del hogar es de
   * T857). Memoria: `state.householdPhotos` con las claves `householdId, objectId, mime, sizeBytes, uploadedByUserId, createdAt`; SQLite: INSERT directo.
   */
  seedHouseholdPhoto(photo: { householdId: string; objectId: string; sizeBytes: number; uploadedByUserId: string }): void;
  /** Ejecuta trabajo transaccional directo (para forzar cambios concurrentes). */
  run<T>(work: (r: import('../../src/application/ports/repositories.port.ts').RepositorySet) => Promise<T>): Promise<T>;
  close(): void;
}

function stateWithMariaAs(role: HouseholdRole | null) {
  const state = canonicalState();
  if (role !== null) (state.memberships.find((m) => m.userId === MARIA)! as { role: string }).role = role;
  return state;
}

export interface EngineOptions {
  readonly limits?: Partial<MediaLimits>;
  /** Ids que genera el caso de uso, en orden (por defecto los 50 deterministas de la 002 y luego los de reserva). */
  readonly ids?: readonly string[];
  /** Puerto de parámetros de plataforma (feature 005); ausente = valor por defecto del código (10 fotos). */
  readonly platformParameters?: PlatformParameterPort;
}

/** Motores de memoria y SQLite con los casos de uso de medios conectados a un almacenamiento controlable. */
export async function createMediaEngines(role: HouseholdRole | null = null, options: EngineOptions = {}): Promise<MediaEngine[]> {
  const limits: MediaLimits = { ...DEFAULT_LIMITS, ...options.limits };
  const ids = () => new DeterministicIdAdapter(options.ids ?? GENERATED_IDS);
  const engines: MediaEngine[] = [];

  const upgraded = (() => {
    const state = stateWithMariaAs(role);
    return { ...state, pets: state.pets.map(upgradePet), records: upgradeRecords(state.records) } as typeof state;
  })();
  const memoryUow = new InMemoryUnitOfWork(upgraded);
  const memoryClock = new FixedClockAdapter();
  const memoryStorage = new ControlledStorage(() => new Date(memoryClock.nowIsoTimestamp()));
  engines.push(build('memoria', memoryUow, memoryClock, memoryStorage, () => undefined, () => memoryUow.snapshot()));

  const db: SqliteDatabase = openSqliteDatabase(IN_MEMORY_DATABASE);
  const sqliteUow = new SqliteUnitOfWork(db);
  await seedSqlite(sqliteUow, stateWithMariaAs(role));
  db.exec("DELETE FROM audit_log WHERE mutation_type = 'MIGRATION'");
  const sqliteClock = new FixedClockAdapter();
  const sqliteStorage = new ControlledStorage(() => new Date(sqliteClock.nowIsoTimestamp()));
  engines.push(build('SQLite', sqliteUow, sqliteClock, sqliteStorage, () => db.close(), null, db));
  return engines;

  function build(
    name: MediaEngine['name'],
    uow: InMemoryUnitOfWork | SqliteUnitOfWork,
    clock: FixedClockAdapter,
    storage: ControlledStorage,
    close: () => void,
    snapshot: (() => ReturnType<InMemoryUnitOfWork['snapshot']>) | null,
    sqlite?: SqliteDatabase,
  ): MediaEngine {
    const deps: ApplicationDeps = {
      ...createDeps(uow, clock, new SpyPasswordHasher()),
      ids: ids(),
      media: { storage, limits },
      ...(options.platformParameters === undefined ? {} : { platformParameters: options.platformParameters }),
    };
    const run: MediaEngine['run'] = (work) => uow.runInTransaction(work);
    return {
      name,
      seedHouseholdPhoto: (photo) => {
        const createdAt = '2026-11-18T10:00:00.000Z';
        if (sqlite === undefined) {
          const state = (uow as unknown as { state: { householdPhotos?: Array<Record<string, unknown>> } }).state;
          (state.householdPhotos ??= []).push({ ...photo, mime: 'image/png', createdAt });
          return;
        }
        sqlite
          .prepare('INSERT INTO household_photos (household_id, object_id, mime, size_bytes, uploaded_by_user_id, created_at) VALUES (?, ?, ?, ?, ?, ?)')
          .run(photo.householdId, photo.objectId, 'image/png', photo.sizeBytes, photo.uploadedByUserId, createdAt);
      },
      deps,
      storage,
      clock,
      run,
      close,
      mediaRows: async (petId) => {
        const rows: Array<{ id: string; petId: string; kind: string; mime: string; sizeBytes: number; originalName: string }> =
          snapshot !== null
            ? snapshot().media
            : (sqlite!.prepare('SELECT id, pet_id AS petId, kind, mime, size_bytes AS sizeBytes, original_name AS originalName FROM pet_media ORDER BY id').all() as never);
        return rows.filter((m) => petId === undefined || m.petId === petId);
      },
      queue: async () => (snapshot !== null ? snapshot().mediaQueue : (sqlite!.prepare('SELECT object_key AS objectKey, reason, enqueued_at AS enqueuedAt, attempts FROM media_deletion_queue ORDER BY object_key').all() as never)),
      audit: async (entityType) =>
        snapshot !== null
          ? snapshot().auditLog.filter((a) => a.entityType === entityType)
          : (sqlite!.prepare('SELECT mutation_type AS mutationType, entity_id AS entityId, previous_state_hash AS previousStateHash, new_state_hash AS newStateHash FROM audit_log WHERE entity_type = ? ORDER BY timestamp, id').all(entityType) as never),
      avatar: async (petId = ARGOS.id) => uow.runInTransaction((r) => r.pets.findAvatar(petId)),
    };
  }
}

export { dumpSqlite };
