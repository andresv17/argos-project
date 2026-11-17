/**
 * Respaldo por usuario sobre UnitOfWorkPort (REQ-BACKUP2-001, REQ-BACKUP2-002), sin HTTP ni SQLite.
 * - Exportación (T278): solo las mascotas del usuario autenticado y sus 6 colecciones, en un sobre 3.0.0 validado contra
 *   backup-envelope.schema.json, sin ningún campo de propiedad (ni `ownerUserId` ni `exportedByUserId`). Consume cupo de
 *   ERR-RATE-LIMITED y emite, en la misma transacción, el token de confirmación efímero (REQ-ACC-002), que el resultado
 *   entrega como cabecera de respuesta `x-argos-confirmation-token` (nunca dentro del archivo). Nunca incluye usuarios,
 *   hogares, sesiones ni credenciales (INV-AUTH-003). Los 4 roles pueden exportar (REQ-RBAC-001, EXPORT_IMPORT_BACKUP).
 * - Previsualización (modo PREVIEW) e importación (modo IMPORT): recorren STATE-BACKUP-001 tal como lo define contracts/state-machines/backup-import.machine.json. Aceptan 3.0.0, 2.0.0 y 1.0.0 (las dos
 *   antiguas se migran a 3.0.0 y pasan por la misma validación final). El
 *   código de error y el finalState de cada salida a ROLLED_BACK salen de la máquina generada, no de este archivo.
 *   Ninguna escritura ocurre antes de COMMITTING_SNAPSHOT y el commit es una única transacción, así que ante
 *   cualquier fallo los datos del usuario quedan idénticos (INV-BACKUP-001). El error original nunca se enmascara.
 *   La importación definitiva exige la confirmación `X-Argos-Import-Confirm` = `fileDigest` de los bytes (SHA-256) y
 *   escribe en la misma transacción 1 fila de auditoría IMPORT; tras el commit pide el checkpoint del WAL.
 * Fechas solo de ClockPort (INV-ARCH-001); persistencia solo por UnitOfWorkPort (INV-ARCH-005).
 *
 * @implements REQ-BACKUP-001, REQ-BACKUP-002, REQ-BACKUP2-001, REQ-BACKUP2-002, REQ-AUD-001, REQ-RBAC-001, REQ-ACC-002, ERR-RATE-LIMITED, INV-BACKUP-001, STATE-BACKUP-001, ERR-BACKUP-MALFORMED-JSON, ERR-BACKUP-PAYLOAD-TOO-LARGE, ERR-BACKUP-VERSION-UNSUPPORTED, ERR-BACKUP-SCHEMA-INVALID, ERR-BACKUP-REFERENTIAL-INTEGRITY, ERR-BACKUP-ATOMIC-ROLLBACK, INV-ARCH-001, INV-ARCH-004, INV-ARCH-005
 */

import {
  DomainError,
  STATE_BACKUP_001,
  validateBackupEnvelopeV1Legacy,
  validateBackupEnvelopeV2Legacy,
  validateBackupEnvelopeV3,
  type BackupEnvelopeV1Legacy,
  type BackupEnvelopeV2Legacy,
  type BackupEnvelopeV3,
  type components,
  type ErrorCode,
  type PetProfile,
  type RollbackFinalState,
  type StateBackup001Event,
  type StateBackup001State,
} from '../../generated/index.ts';
import { migrateEnvelopeV2ToV3, migrateLegacyEnvelope } from '../../domain/backup/backup-migration.ts';
import { computeFileDigest, fileDigestMatches } from '../../domain/backup/file-digest.ts';
import { findHardeningViolation } from '../../domain/backup/import-hardening.ts';
import { RECORD_MODULES, validateRecord, type RecordModule } from '../../domain/records/record-invariants.ts';
import { validateBirthDateNotFuture } from '../../domain/shared/date-utils.ts';
import { sortHistoricalRecords, sortPetsForListing } from '../../domain/sorting/deterministic-sorter.ts';
import type { RepositorySet } from '../ports/repositories.port.ts';
import { recordAudit } from './audit-support.ts';
import type { ApplicationDeps } from './use-case-support.ts';

export type ImportBackupResult = components['schemas']['ImportBackupResult'];
export type ImportPreviewResult = components['schemas']['ImportPreviewResult'];
type SourceSchemaVersion = ImportBackupResult['sourceSchemaVersion'];
type BackupDeps = ApplicationDeps;

const MODULES = Object.keys(RECORD_MODULES) as RecordModule[];
const SUPPORTED_VERSIONS: readonly unknown[] = ['1.0.0', '2.0.0', '3.0.0'] satisfies readonly SourceSchemaVersion[];

/** Límite de CHECKING_PAYLOAD_SIZE, leído de la guarda de la máquina (`bytesRead <= 10485760`). */
export const MAX_IMPORT_BYTES = Number(/bytesRead <= (\d+)/.exec(STATE_BACKUP_001.states.CHECKING_PAYLOAD_SIZE.guard)![1]);

/** Nombre de la cabecera de respuesta que lleva el token de confirmación de la exportación (REQ-ACC-002, OpenAPI). */
export const CONFIRMATION_TOKEN_HEADER = 'x-argos-confirmation-token';

interface ErrorTransition {
  readonly target: StateBackup001State;
  readonly error: string;
  readonly finalState?: RollbackFinalState;
}
type TransitionDefinition = StateBackup001State | ErrorTransition;

/**
 * Destino y, si es una salida de error, código y finalState de la transición `event` desde `state`, según la máquina
 * generada. Un evento que la máquina no define en ese estado es un defecto de programación y lanza.
 * @implements STATE-BACKUP-001
 */
export function backupImportTransition(state: StateBackup001State, event: StateBackup001Event): TransitionDefinition {
  const on = (STATE_BACKUP_001.states[state] as { readonly on?: Readonly<Record<string, TransitionDefinition>> }).on ?? {};
  const definition = on[event];
  if (definition === undefined) throw new Error(`STATE-BACKUP-001: el evento ${event} no está definido en ${state}`);
  return definition;
}

export interface BackupImportStep {
  readonly from: StateBackup001State;
  readonly event: StateBackup001Event;
  readonly to: StateBackup001State;
}
export type BackupImportObserver = (step: BackupImportStep) => void;

/** Una ejecución de STATE-BACKUP-001: estado actual y aviso de cada transición al observador. */
class ImportRun {
  state: StateBackup001State = STATE_BACKUP_001.initial;

  constructor(private readonly observer: BackupImportObserver | undefined) {}

  fire(event: StateBackup001Event): TransitionDefinition {
    const definition = backupImportTransition(this.state, event);
    const to = typeof definition === 'string' ? definition : definition.target;
    this.observer?.({ from: this.state, event, to });
    this.state = to;
    return definition;
  }

  /** Salida de error con el código y el finalState de la máquina (ROLLED_BACK salvo que la máquina diga otro). */
  fail(event: StateBackup001Event, detail?: string, field: string | null = null): DomainError {
    const { error, finalState } = this.fire(event) as ErrorTransition;
    return new DomainError(error as ErrorCode, detail, field, finalState ?? 'ROLLED_BACK');
  }

  /** DOMAIN_INVARIANT_VIOLATED (PROPAGATE_SPECIFIC): el código del dominio se conserva y se añade finalState. */
  propagate(error: DomainError): DomainError {
    this.fire('DOMAIN_INVARIANT_VIOLATED');
    return new DomainError(error.code, error.detail, error.field, 'ROLLED_BACK');
  }
}

interface AjvError {
  readonly instancePath: string;
  readonly message?: string;
  readonly params: Readonly<Record<string, unknown>>;
}
interface EnvelopeValidator {
  (data: unknown): boolean;
  errors?: readonly AjvError[] | null;
}

/**
 * Primer fallo de esquema como detalle y campo (puntero JSON). Ajv siempre llena `errors` cuando falla, y el puntero
 * nunca está vacío porque la raíz ya se comprobó como objeto: todo fallo cae en una propiedad.
 */
function schemaFailure(run: ImportRun, event: StateBackup001Event, validator: unknown): DomainError {
  const error = (validator as EnvelopeValidator).errors![0]!;
  const property = error.params['missingProperty'] ?? error.params['additionalProperty'];
  const pointer = typeof property === 'string' ? `${error.instancePath}/${property}` : error.instancePath;
  return run.fail(event, `${pointer}: ${String(error.message)}.`, pointer);
}

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** Sobre 3.0.0 con las mascotas ya asignadas al usuario que importa (ownerUserId = usuario autenticado). */
type OwnedEnvelope = Omit<BackupEnvelopeV3, 'pets'> & { readonly pets: PetProfile[] };

const recordsOf = (envelope: BackupEnvelopeV3) =>
  MODULES.flatMap((module) => (envelope.records[module] as Array<{ id: string; petId: string }>).map((record) => ({ module, record })));

/** Resultado de la exportación: el archivo y las cabeceras de la respuesta (el token nunca va dentro del archivo). */
export interface ExportBackupResult {
  readonly envelope: BackupEnvelopeV3;
  readonly json: string;
  readonly fileName: string;
  /** Cabeceras de respuesta: `x-argos-confirmation-token` (43 caracteres base64url; en base solo queda su SHA-256). */
  readonly headers: { readonly [CONFIRMATION_TOKEN_HEADER]: string };
}

/**
 * REQ-BACKUP2-001: sobre 3.0.0 con las mascotas propias del usuario (orden de REQ-PET-005) y sus registros
 * (INV-SORT-001), sin campos de propiedad. En una sola transacción consume cupo de exportación (ERR-RATE-LIMITED:
 * un rechazo no emite token ni cambia nada) y emite el token de confirmación, que reemplaza al anterior (REQ-ACC-002).
 * No recibe rol: la matriz concede EXPORT_IMPORT_BACKUP a los 4 roles y la exportación es siempre de lo propio.
 * @implements REQ-BACKUP2-001, REQ-RBAC-001, REQ-ACC-002, ERR-RATE-LIMITED, INV-AUTH-003, INV-ARCH-001, INV-ARCH-005
 */
export class ExportBackupUseCase {
  constructor(private readonly deps: BackupDeps) {}

  async execute(userId: string): Promise<ExportBackupResult> {
    const { pets, records, issued, exportedAt } = await this.deps.uow.runInTransaction(async (repositories) => {
      const now = this.deps.clock.nowIsoTimestamp();
      if (!(await this.deps.rateLimiter.tryConsume(repositories, 'EXPORT', userId, now))) throw new DomainError('ERR-RATE-LIMITED');
      const owned = await repositories.pets.listByOwners([userId]);
      const collected = Object.fromEntries(MODULES.map((module) => [module, [] as unknown[]])) as Record<RecordModule, unknown[]>;
      for (const pet of owned) {
        const own = await repositories.records.listForPet(pet.id);
        for (const module of MODULES) collected[module].push(...own[module]);
      }
      const envelope = {
        schemaVersion: '3.0.0',
        exportedAt: now,
        pets: sortPetsForListing(owned).map(({ ownerUserId: _ownerUserId, ...pet }) => pet),
        records: Object.fromEntries(MODULES.map((module) => [module, sortHistoricalRecords(collected[module] as never)])),
      };
      // Un sobre inválido se descubre antes de emitir el token: el rechazo deshace también el consumo de cupo.
      if (!validateBackupEnvelopeV3(envelope)) {
        throw new DomainError('ERR-INTERNAL-UNEXPECTED', 'Los datos guardados del usuario no forman un respaldo 3.0.0 válido.');
      }
      const token = await this.deps.backupTokens.issue(repositories, userId, now);
      return { pets: envelope.pets, records: envelope.records, issued: token, exportedAt: now };
    });
    const envelope = { schemaVersion: '3.0.0', exportedAt, pets, records } as unknown as BackupEnvelopeV3;
    return {
      envelope,
      json: JSON.stringify(envelope, null, 2),
      fileName: `argos-backup-${this.deps.clock.todayIsoDate()}.json`,
      headers: { [CONFIRMATION_TOKEN_HEADER]: issued.token },
    };
  }
}

/** Resultado común de las etapas sin almacenamiento de la previsualización y de la importación. */
interface PreparedImport {
  readonly bytes: Uint8Array;
  readonly sourceSchemaVersion: SourceSchemaVersion;
  readonly owned: OwnedEnvelope;
}

/**
 * Etapas de STATE-BACKUP-001 que no necesitan almacenamiento y son idénticas en modo PREVIEW e IMPORT: tamaño en
 * bytes, JSON, endurecimiento, versión y esquema (con migración de 1.0.0 y 2.0.0 a 3.0.0 y la MISMA validación
 * final), y las invariantes de dominio. Nada de lo que trae el archivo es autoridad de propiedad: ownerUserId = usuario.
 * @implements STATE-BACKUP-001, REQ-BACKUP2-002, INV-BACKUP-001, ERR-BACKUP-MALFORMED-JSON, ERR-BACKUP-PAYLOAD-TOO-LARGE, ERR-BACKUP-VERSION-UNSUPPORTED, ERR-BACKUP-SCHEMA-INVALID, ERR-BACKUP-REFERENTIAL-INTEGRITY
 */
class BackupImportPipeline {
  constructor(private readonly deps: BackupDeps) {}

  prepare(run: ImportRun, userId: string, payload: string | Uint8Array, startEvent: 'START_IMPORT' | 'START_PREVIEW'): PreparedImport {
    run.fire(startEvent);
    const bytes = typeof payload === 'string' ? new TextEncoder().encode(payload) : payload;
    if (bytes.byteLength > MAX_IMPORT_BYTES) {
      throw run.fail('SIZE_EXCEEDED', `El archivo ocupa ${bytes.byteLength} bytes; el máximo es ${MAX_IMPORT_BYTES} (10 MB).`);
    }
    run.fire('SIZE_OK');

    let text: string;
    let parsed: unknown;
    try {
      text = typeof payload === 'string' ? payload : new TextDecoder('utf-8', { fatal: true }).decode(payload);
      parsed = JSON.parse(text);
    } catch {
      throw run.fail('PARSE_FAILURE');
    }
    run.fire('PARSE_SUCCESS');

    const { envelope, sourceSchemaVersion } = this.validateVersionAndSchema(run, userId, parsed, text);
    const owned: OwnedEnvelope = { ...envelope, pets: envelope.pets.map((pet) => ({ ...pet, ownerUserId: userId })) };
    this.checkInvariantsWithoutStorage(run, owned);
    return { bytes, sourceSchemaVersion, owned };
  }

  /** VALIDATING_VERSION_AND_SCHEMA y, para 1.0.0 y 2.0.0, MIGRATING_LEGACY_ENVELOPE. */
  private validateVersionAndSchema(
    run: ImportRun,
    userId: string,
    parsed: unknown,
    text: string,
  ): { readonly envelope: BackupEnvelopeV3; readonly sourceSchemaVersion: SourceSchemaVersion } {
    if (!isPlainObject(parsed)) throw run.fail('SCHEMA_INVALID', 'La raíz del respaldo debe ser un objeto JSON.');
    const violation = findHardeningViolation(text);
    if (violation !== null) throw run.fail('PARSE_HARDENING_REJECTED', violation.detail);
    if (!Object.hasOwn(parsed, 'schemaVersion')) throw run.fail('SCHEMA_INVALID', 'Falta schemaVersion.', 'schemaVersion');
    const version = parsed['schemaVersion'];
    if (!SUPPORTED_VERSIONS.includes(version)) {
      throw run.fail('VERSION_MISMATCH', `schemaVersion ${JSON.stringify(version)} no es 1.0.0, 2.0.0 ni 3.0.0.`, 'schemaVersion');
    }
    if (version === '3.0.0') {
      if (!validateBackupEnvelopeV3(parsed)) throw schemaFailure(run, 'SCHEMA_INVALID', validateBackupEnvelopeV3);
      run.fire('SCHEMA_V3_VALID');
      return { envelope: parsed, sourceSchemaVersion: '3.0.0' };
    }
    let legacyV2: BackupEnvelopeV2Legacy;
    if (version === '2.0.0') {
      if (!validateBackupEnvelopeV2Legacy(parsed)) throw schemaFailure(run, 'SCHEMA_INVALID', validateBackupEnvelopeV2Legacy);
      run.fire('LEGACY_V2_VALID');
      legacyV2 = parsed;
    } else {
      if (!validateBackupEnvelopeV1Legacy(parsed)) throw schemaFailure(run, 'SCHEMA_INVALID', validateBackupEnvelopeV1Legacy);
      run.fire('LEGACY_V1_VALID');
      legacyV2 = migrateLegacyEnvelope(parsed as BackupEnvelopeV1Legacy, userId);
    }
    const candidate = migrateEnvelopeV2ToV3(legacyV2);
    if (!validateBackupEnvelopeV3(candidate)) throw schemaFailure(run, 'MIGRATION_SCHEMA_INVALID', validateBackupEnvelopeV3);
    run.fire('MIGRATION_SUCCESS');
    return { envelope: candidate, sourceSchemaVersion: version as SourceSchemaVersion };
  }

  /** CHECKING_DOMAIN_INVARIANTS sin almacenamiento: IDs duplicados (en todo el sobre) y huérfanos; INV-PET-*; INV-REC-*. */
  private checkInvariantsWithoutStorage(run: ImportRun, envelope: OwnedEnvelope): void {
    const seen = new Set<string>();
    const petsById = new Map<string, PetProfile>();
    for (const pet of envelope.pets) {
      if (seen.has(pet.id)) throw run.fail('ORPHAN_DUPLICATE_OR_FOREIGN_ID', `ID duplicado en el respaldo: ${pet.id} (pets).`, 'pets');
      seen.add(pet.id);
      petsById.set(pet.id, pet);
    }
    for (const { module, record } of recordsOf(envelope)) {
      if (seen.has(record.id)) {
        throw run.fail('ORPHAN_DUPLICATE_OR_FOREIGN_ID', `ID duplicado en el respaldo: ${record.id} (${module}).`, module);
      }
      seen.add(record.id);
      if (!petsById.has(record.petId)) {
        throw run.fail('ORPHAN_DUPLICATE_OR_FOREIGN_ID', `Registro huérfano ${record.id} (${module}): la mascota ${record.petId} no está en pets.`, module);
      }
    }
    const today = this.deps.clock.todayIsoDate();
    try {
      for (const pet of envelope.pets) validateBirthDateNotFuture(pet.birthDate, today);
      for (const { module, record } of recordsOf(envelope)) {
        const pet = petsById.get(record.petId)!;
        validateRecord(module, record, pet.birthDate, today, pet.species);
      }
      // Microchip único por propietario dentro del archivo (el dueño de todas es el usuario autenticado).
      const chips = new Set<string>();
      for (const pet of envelope.pets) {
        if (pet.microchipId === null) continue;
        if (chips.has(pet.microchipId)) throw new DomainError('ERR-PET-MICROCHIP-DUPLICATE', undefined, 'microchipId');
        chips.add(pet.microchipId);
      }
    } catch (error) {
      // Las reglas de dominio solo lanzan DomainError.
      throw run.propagate(error as DomainError);
    }
  }

  /** INV-BACKUP-001: ningún ID del sobre puede pertenecer ya a una mascota o un registro de otro usuario. */
  async assertNoForeignIds(run: ImportRun, repositories: RepositorySet, userId: string, envelope: OwnedEnvelope): Promise<void> {
    const ownedByOther = async (petId: string) => (await repositories.pets.findById(petId))?.ownerUserId !== userId;
    for (const pet of envelope.pets) {
      if ((await repositories.pets.findById(pet.id)) !== null && (await ownedByOther(pet.id))) {
        throw run.fail('ORPHAN_DUPLICATE_OR_FOREIGN_ID', 'El archivo contiene un identificador que no se puede importar.', 'pets');
      }
    }
    for (const { module, record } of recordsOf(envelope)) {
      const storedPetId = await repositories.records.findPetIdOfRecord(record.id);
      if (storedPetId !== null && (await ownedByOther(storedPetId))) {
        throw run.fail('ORPHAN_DUPLICATE_OR_FOREIGN_ID', 'El archivo contiene un identificador que no se puede importar.', module);
      }
    }
  }
}

/**
 * REQ-BACKUP2-002, modo PREVIEW de STATE-BACKUP-001: mismas etapas que la importación, sin escribir nada (ni datos, ni
 * auditoría). Devuelve conteos, colisiones medidas solo contra mascotas propias, el aviso de mascotas compartidas que
 * perderán su asignación y el `fileDigest` de los bytes leídos. Los errores de tamaño, JSON, endurecimiento, versión,
 * esquema, migración e invariantes de dominio son idénticos a los de la importación; los IDs de otro usuario se
 * comprueban solo al escribir (STATE-BACKUP-001, CHECKING_DOMAIN_INVARIANTS), de modo que la previsualización no
 * funciona como oráculo de existencia de datos ajenos.
 * @implements REQ-BACKUP2-002, STATE-BACKUP-001, INV-BACKUP-001, ERR-BACKUP-SCHEMA-INVALID
 */
export class PreviewBackupImportUseCase {
  private readonly pipeline: BackupImportPipeline;
  constructor(private readonly deps: BackupDeps) {
    this.pipeline = new BackupImportPipeline(deps);
  }

  async execute(userId: string, payload: string | Uint8Array, observer?: BackupImportObserver): Promise<ImportPreviewResult> {
    const run = new ImportRun(observer);
    const { bytes, sourceSchemaVersion, owned } = this.pipeline.prepare(run, userId, payload, 'START_PREVIEW');
    const fileIds = new Set(owned.pets.map((pet) => pet.id));
    let shared: { petsCount: number; householdsCount: number; petsReplacedCount: number; sameIdPetsCount: number };
    try {
      shared = await this.deps.uow.runInTransaction(async (repositories) => {
        // Solo lectura de lo propio: la previsualización no comprueba IDs ajenos (eso es del commit, I-5), así que no
        // revela si un identificador del archivo existe en otra cuenta (colisiones solo contra datos propios).
        const current = await repositories.pets.listByOwners([userId]);
        const households = new Set<string>();
        let petsCount = 0;
        for (const pet of current) {
          const assignments = await repositories.assignments.listByPet(pet.id);
          if (assignments.length > 0) petsCount += 1;
          for (const assignment of assignments) households.add(assignment.householdId);
        }
        return {
          petsCount,
          householdsCount: households.size,
          petsReplacedCount: current.length,
          sameIdPetsCount: current.filter((pet) => fileIds.has(pet.id)).length,
        };
      });
    } catch (error) {
      if (run.state === 'ROLLED_BACK') throw error;
      throw run.fail('STORAGE_READ_FAILED', 'Fallo del almacenamiento al comprobar los IDs del respaldo.');
    }
    run.fire('PREVIEW_VALID');
    return {
      sourceSchemaVersion,
      fileDigest: computeFileDigest(bytes),
      counts: {
        pets: owned.pets.length,
        weights: owned.records.weights.length,
        bodyMeasurements: owned.records.bodyMeasurements.length,
        vaccinations: owned.records.vaccinations.length,
        dewormings: owned.records.dewormings.length,
        medicalVisits: owned.records.medicalVisits.length,
        customParameters: owned.records.customParameters.length,
      },
      collisions: { petsReplacedCount: shared.petsReplacedCount, sameIdPetsCount: shared.sameIdPetsCount },
      affectedSharedPets: { petsCount: shared.petsCount, householdsCount: shared.householdsCount },
    };
  }
}

/**
 * REQ-BACKUP2-002: importación atómica que reemplaza solo los datos del usuario autenticado (STATE-BACKUP-001, modo IMPORT).
 * Orden dentro de CHECKING_DOMAIN_INVARIANTS: primero lo que no necesita almacenamiento (IDs duplicados y huérfanos,
 * luego invariantes de mascotas y de registros); después la confirmación `X-Argos-Import-Confirm` contra el
 * `fileDigest` de los bytes (ERR-SCHEMA-VALIDATION-FAILED, ROLLED_BACK); y, ya dentro de la transacción del commit,
 * los IDs que pertenecen a otro usuario. Así, un error detectable sin almacenamiento nunca depende de él (EDGE-021).
 * El commit borra las mascotas propias con sus 6 colecciones y asignaciones, inserta las del sobre sin asignaciones y
 * escribe 1 fila de auditoría IMPORT (`USER`, entityId = userId) con hashes de las mascotas propias antes y después
 * (SC-004: cualquier fallo de escritura deja todo idéntico). Tras el commit se pide el checkpoint del WAL.
 * Rechazos de la transacción (convención de UnitOfWorkPort):
 * - antes del commit, durante la lectura de IDs ajenos: STORAGE_READ_FAILED (nada se escribió; spec 2.2.2);
 * - durante el commit: DomainError ERR-INTERNAL-UNEXPECTED con finalState UNKNOWN es ROLLBACK_FAILED; cualquier
 *   otro rechazo es STORAGE_ERROR.
 *
 * @implements REQ-BACKUP-002, REQ-BACKUP2-002, REQ-AUD-001, INV-BACKUP-001, STATE-BACKUP-001, SC-004, ERR-BACKUP-MALFORMED-JSON, ERR-BACKUP-PAYLOAD-TOO-LARGE, ERR-BACKUP-VERSION-UNSUPPORTED, ERR-BACKUP-SCHEMA-INVALID, ERR-BACKUP-REFERENTIAL-INTEGRITY, ERR-BACKUP-ATOMIC-ROLLBACK, INV-ARCH-001, INV-ARCH-005
 */
export class ImportBackupUseCase {
  private readonly pipeline: BackupImportPipeline;
  constructor(private readonly deps: BackupDeps) {
    this.pipeline = new BackupImportPipeline(deps);
  }

  /** @param confirmDigest valor de `X-Argos-Import-Confirm` tal cual llegó (null si falta). */
  async execute(userId: string, payload: string | Uint8Array, confirmDigest: string | null, observer?: BackupImportObserver): Promise<ImportBackupResult> {
    const run = new ImportRun(observer);
    const { bytes, sourceSchemaVersion, owned } = this.pipeline.prepare(run, userId, payload, 'START_IMPORT');
    await this.commit(run, userId, owned, confirmDigest, computeFileDigest(bytes));
    run.fire('COMMIT_SUCCESS');
    // ADR-002-13: checkpoint del WAL con truncado fuera de la transacción; nunca revierte ni lanza.
    await this.deps.uow.checkpointAfterCommit?.();
    return {
      finalState: 'COMPLETED',
      sourceSchemaVersion,
      importedPetsCount: owned.pets.length,
      importedRecordsCount: recordsOf(owned).length,
    };
  }

  /** IDs ajenos y COMMITTING_SNAPSHOT en una sola transacción: borra los datos del usuario, inserta los del sobre y audita. */
  private async commit(run: ImportRun, userId: string, envelope: OwnedEnvelope, confirmDigest: string | null, fileDigest: string): Promise<void> {
    const mismatch = new DomainError(
      'ERR-SCHEMA-VALIDATION-FAILED',
      'La confirmación no corresponde al archivo previsualizado.',
      'X-Argos-Import-Confirm',
      'ROLLED_BACK',
    );
    try {
      await this.deps.uow.runInTransaction(async (repositories) => {
        await this.pipeline.assertNoForeignIds(run, repositories, userId, envelope);
        // INVARIANTS_VALID (guard): la confirmación debe ser el fileDigest de los bytes leídos (errorIfDigestMismatch).
        if (!fileDigestMatches(confirmDigest, fileDigest)) throw mismatch;
        run.fire('INVARIANTS_VALID');
        const current = await repositories.pets.listByOwners([userId]);
        const previous = await ownedSnapshot(repositories, current);
        for (const pet of current) {
          await repositories.records.deleteForPet(pet.id);
          await repositories.assignments.deleteForPet(pet.id);
          await repositories.pets.delete(pet.id);
        }
        for (const pet of envelope.pets) await repositories.pets.save(pet);
        for (const { module, record } of recordsOf(envelope)) await repositories.records.add(module, record as never);
        await recordAudit(this.deps, repositories, {
          executorUserId: userId,
          mutationType: 'IMPORT',
          entityType: 'USER',
          entityId: userId,
          previous,
          next: await ownedSnapshot(repositories, envelope.pets),
        });
      });
    } catch (error) {
      // ID ajeno: run.fail ya llevó la máquina a ROLLED_BACK con ERR-BACKUP-REFERENTIAL-INTEGRITY.
      if (run.state === 'ROLLED_BACK' || error === mismatch) throw error;
      if (run.state === 'CHECKING_DOMAIN_INVARIANTS') {
        throw run.fail('STORAGE_READ_FAILED', 'Fallo del almacenamiento al comprobar los IDs del respaldo.');
      }
      const rollbackFailed = error instanceof DomainError && error.code === 'ERR-INTERNAL-UNEXPECTED' && error.finalState === 'UNKNOWN';
      throw rollbackFailed ? run.fail('ROLLBACK_FAILED', error.detail) : run.fail('STORAGE_ERROR');
    }
  }
}

/**
 * Mascotas propias con sus 6 colecciones, por id ASC (importScope de AuditCanonicalViewRules): la entrada de los hashes
 * de la fila IMPORT. Las colecciones se leen del repositorio de la transacción en curso.
 */
async function ownedSnapshot(repositories: RepositorySet, pets: readonly PetProfile[]): Promise<unknown[]> {
  const sorted = [...pets].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const snapshot: unknown[] = [];
  for (const pet of sorted) {
    const records = await repositories.records.listForPet(pet.id);
    snapshot.push({
      ...pet,
      records: Object.fromEntries(
        MODULES.map((module) => [module, [...(records[module] as Array<{ id: string }>)].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))]),
      ),
    });
  }
  return snapshot;
}
