/**
 * Respaldo por usuario sobre UnitOfWorkPort (REQ-BACKUP-001, REQ-BACKUP-002), sin HTTP ni SQLite.
 * - Exportación: solo las mascotas del usuario autenticado y sus 6 colecciones, en un sobre 2.0.0 validado contra
 *   backup-envelope.schema.json. Nunca incluye usuarios, hogares, sesiones ni credenciales (INV-AUTH-003).
 * - Importación: recorre STATE-BACKUP-001 tal como lo define contracts/state-machines/backup-import.machine.json. El
 *   código de error y el finalState de cada salida a ROLLED_BACK salen de la máquina generada, no de este archivo.
 *   Ninguna escritura ocurre antes de COMMITTING_SNAPSHOT y el commit es una única transacción, así que ante
 *   cualquier fallo los datos del usuario quedan idénticos (INV-BACKUP-001). El error original nunca se enmascara.
 * Fechas solo de ClockPort (INV-ARCH-001); persistencia solo por UnitOfWorkPort (INV-ARCH-005).
 *
 * @implements REQ-BACKUP-001, REQ-BACKUP-002, INV-BACKUP-001, STATE-BACKUP-001, ERR-BACKUP-MALFORMED-JSON, ERR-BACKUP-PAYLOAD-TOO-LARGE, ERR-BACKUP-VERSION-UNSUPPORTED, ERR-BACKUP-SCHEMA-INVALID, ERR-BACKUP-REFERENTIAL-INTEGRITY, ERR-BACKUP-ATOMIC-ROLLBACK, INV-ARCH-001, INV-ARCH-004, INV-ARCH-005
 */

import {
  DomainError,
  STATE_BACKUP_001,
  validateBackupEnvelopeV1Legacy,
  validateBackupEnvelopeV2,
  type BackupEnvelopeV2,
  type components,
  type ErrorCode,
  type PetProfile,
  type RollbackFinalState,
  type StateBackup001Event,
  type StateBackup001State,
} from '../../generated/index.ts';
import { migrateLegacyEnvelope } from '../../domain/backup/backup-migration.ts';
import { RECORD_MODULES, validateRecord, type RecordModule } from '../../domain/records/record-invariants.ts';
import { validateBirthDateNotFuture } from '../../domain/shared/date-utils.ts';
import { sortHistoricalRecords, sortPetsForListing } from '../../domain/sorting/deterministic-sorter.ts';
import type { RepositorySet } from '../ports/repositories.port.ts';
import type { ApplicationDeps } from './use-case-support.ts';

export type ImportBackupResult = components['schemas']['ImportBackupResult'];
type SourceSchemaVersion = ImportBackupResult['sourceSchemaVersion'];
type BackupDeps = Pick<ApplicationDeps, 'uow' | 'clock'>;

const MODULES = Object.keys(RECORD_MODULES) as RecordModule[];
const SUPPORTED_VERSIONS: readonly unknown[] = ['1.0.0', '2.0.0'] satisfies readonly SourceSchemaVersion[];

/** Límite de CHECKING_PAYLOAD_SIZE, leído de la guarda de la máquina (`bytes <= 10485760`). */
export const MAX_IMPORT_BYTES = Number(/bytes <= (\d+)/.exec(STATE_BACKUP_001.states.CHECKING_PAYLOAD_SIZE.guard)![1]);

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

const recordsOf = (envelope: BackupEnvelopeV2) =>
  MODULES.flatMap((module) => (envelope.records[module] as Array<{ id: string; petId: string }>).map((record) => ({ module, record })));

/**
 * REQ-BACKUP-001: sobre 2.0.0 con las mascotas del usuario (orden de REQ-PET-005) y sus registros (INV-SORT-001).
 * @implements REQ-BACKUP-001, INV-AUTH-003, INV-ARCH-001, INV-ARCH-005
 */
export class ExportBackupUseCase {
  constructor(private readonly deps: BackupDeps) {}

  async execute(userId: string): Promise<{ readonly envelope: BackupEnvelopeV2; readonly json: string; readonly fileName: string }> {
    const { pets, records } = await this.deps.uow.runInTransaction(async (repositories) => {
      const owned = await repositories.pets.listByOwners([userId]);
      const collected = Object.fromEntries(MODULES.map((module) => [module, [] as unknown[]])) as Record<RecordModule, unknown[]>;
      for (const pet of owned) {
        const own = await repositories.records.listForPet(pet.id);
        for (const module of MODULES) collected[module].push(...own[module]);
      }
      return { pets: owned, records: collected };
    });
    const envelope = {
      schemaVersion: '2.0.0',
      exportedAt: this.deps.clock.nowIsoTimestamp(),
      exportedByUserId: userId,
      pets: sortPetsForListing(pets),
      records: Object.fromEntries(MODULES.map((module) => [module, sortHistoricalRecords(records[module] as never)])),
    };
    if (!validateBackupEnvelopeV2(envelope)) {
      throw new DomainError('ERR-INTERNAL-UNEXPECTED', 'Los datos guardados del usuario no forman un respaldo 2.0.0 válido.');
    }
    return { envelope, json: JSON.stringify(envelope, null, 2), fileName: `argos-backup-${this.deps.clock.todayIsoDate()}.json` };
  }
}

/**
 * REQ-BACKUP-002: importación atómica que reemplaza solo los datos del usuario autenticado (STATE-BACKUP-001).
 * Orden dentro de CHECKING_DOMAIN_INVARIANTS: primero lo que no necesita almacenamiento (IDs duplicados y huérfanos,
 * luego invariantes de mascotas y de registros); después, ya dentro de la transacción del commit, los IDs que
 * pertenecen a otro usuario. Así, un error detectable sin almacenamiento nunca depende de él (EDGE-021).
 * Rechazos de la transacción (convención de UnitOfWorkPort):
 * - antes del commit, durante la lectura de IDs ajenos: STORAGE_READ_FAILED (nada se escribió; spec 2.2.2);
 * - durante el commit: DomainError ERR-INTERNAL-UNEXPECTED con finalState UNKNOWN es ROLLBACK_FAILED; cualquier
 *   otro rechazo es STORAGE_ERROR.
 *
 * @implements REQ-BACKUP-002, INV-BACKUP-001, STATE-BACKUP-001, ERR-BACKUP-MALFORMED-JSON, ERR-BACKUP-PAYLOAD-TOO-LARGE, ERR-BACKUP-VERSION-UNSUPPORTED, ERR-BACKUP-SCHEMA-INVALID, ERR-BACKUP-REFERENTIAL-INTEGRITY, ERR-BACKUP-ATOMIC-ROLLBACK, INV-ARCH-001, INV-ARCH-005
 */
export class ImportBackupUseCase {
  constructor(private readonly deps: BackupDeps) {}

  async execute(userId: string, payload: string | Uint8Array, observer?: BackupImportObserver): Promise<ImportBackupResult> {
    const run = new ImportRun(observer);
    run.fire('START_IMPORT');
    const bytes = typeof payload === 'string' ? new TextEncoder().encode(payload).byteLength : payload.byteLength;
    if (bytes > MAX_IMPORT_BYTES) {
      throw run.fail('SIZE_EXCEEDED', `El archivo ocupa ${bytes} bytes; el máximo es ${MAX_IMPORT_BYTES} (10 MB).`);
    }
    run.fire('SIZE_OK');

    let parsed: unknown;
    try {
      parsed = JSON.parse(typeof payload === 'string' ? payload : new TextDecoder('utf-8', { fatal: true }).decode(payload));
    } catch {
      throw run.fail('PARSE_FAILURE');
    }
    run.fire('PARSE_SUCCESS');

    const { envelope, sourceSchemaVersion } = this.validateVersionAndSchema(run, parsed, userId);
    const owned: BackupEnvelopeV2 = { ...envelope, pets: envelope.pets.map((pet) => ({ ...pet, ownerUserId: userId })) };
    this.checkInvariantsWithoutStorage(run, owned);
    await this.commit(run, userId, owned);
    run.fire('COMMIT_SUCCESS');
    return {
      finalState: 'COMPLETED',
      sourceSchemaVersion,
      importedPetsCount: owned.pets.length,
      importedRecordsCount: recordsOf(owned).length,
    };
  }

  /** VALIDATING_VERSION_AND_SCHEMA y, para 1.0.0, MIGRATING_LEGACY_ENVELOPE. */
  private validateVersionAndSchema(
    run: ImportRun,
    parsed: unknown,
    userId: string,
  ): { readonly envelope: BackupEnvelopeV2; readonly sourceSchemaVersion: SourceSchemaVersion } {
    if (!isPlainObject(parsed)) throw run.fail('SCHEMA_INVALID', 'La raíz del respaldo debe ser un objeto JSON.');
    if (!Object.hasOwn(parsed, 'schemaVersion')) throw run.fail('SCHEMA_INVALID', 'Falta schemaVersion.', 'schemaVersion');
    const version = parsed['schemaVersion'];
    if (!SUPPORTED_VERSIONS.includes(version)) {
      throw run.fail('VERSION_MISMATCH', `schemaVersion ${JSON.stringify(version)} no es 1.0.0 ni 2.0.0.`, 'schemaVersion');
    }
    if (version === '2.0.0') {
      if (!validateBackupEnvelopeV2(parsed)) throw schemaFailure(run, 'SCHEMA_INVALID', validateBackupEnvelopeV2);
      run.fire('SCHEMA_V2_VALID');
      return { envelope: parsed, sourceSchemaVersion: '2.0.0' };
    }
    if (!validateBackupEnvelopeV1Legacy(parsed)) throw schemaFailure(run, 'SCHEMA_INVALID', validateBackupEnvelopeV1Legacy);
    run.fire('LEGACY_V1_VALID');
    const migrated = migrateLegacyEnvelope(parsed, userId);
    if (!validateBackupEnvelopeV2(migrated)) throw schemaFailure(run, 'MIGRATION_SCHEMA_INVALID', validateBackupEnvelopeV2);
    run.fire('MIGRATION_SUCCESS');
    return { envelope: migrated, sourceSchemaVersion: '1.0.0' };
  }

  /** CHECKING_DOMAIN_INVARIANTS sin almacenamiento: IDs duplicados (en todo el sobre) y huérfanos; INV-PET-002; INV-REC-*. */
  private checkInvariantsWithoutStorage(run: ImportRun, envelope: BackupEnvelopeV2): void {
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
      for (const { module, record } of recordsOf(envelope)) validateRecord(module, record, petsById.get(record.petId)!.birthDate, today);
    } catch (error) {
      // Las reglas de dominio solo lanzan DomainError.
      throw run.propagate(error as DomainError);
    }
  }

  /** IDs ajenos y COMMITTING_SNAPSHOT en una sola transacción: borra los datos del usuario e inserta los del sobre. */
  private async commit(run: ImportRun, userId: string, envelope: BackupEnvelopeV2): Promise<void> {
    try {
      await this.deps.uow.runInTransaction(async (repositories) => {
        await this.assertNoForeignIds(run, repositories, userId, envelope);
        run.fire('INVARIANTS_VALID');
        for (const pet of await repositories.pets.listByOwners([userId])) {
          await repositories.records.deleteForPet(pet.id);
          await repositories.pets.delete(pet.id);
        }
        for (const pet of envelope.pets) await repositories.pets.save(pet);
        for (const { module, record } of recordsOf(envelope)) await repositories.records.add(module, record as never);
      });
    } catch (error) {
      // ID ajeno: run.fail ya llevó la máquina a ROLLED_BACK con ERR-BACKUP-REFERENTIAL-INTEGRITY.
      if (run.state === 'ROLLED_BACK') throw error;
      if (run.state === 'CHECKING_DOMAIN_INVARIANTS') {
        throw run.fail('STORAGE_READ_FAILED', 'Fallo del almacenamiento al comprobar los IDs del respaldo.');
      }
      const rollbackFailed = error instanceof DomainError && error.code === 'ERR-INTERNAL-UNEXPECTED' && error.finalState === 'UNKNOWN';
      throw rollbackFailed ? run.fail('ROLLBACK_FAILED', error.detail) : run.fail('STORAGE_ERROR');
    }
  }

  /** INV-BACKUP-001: ningún ID del sobre puede pertenecer ya a una mascota o un registro de otro usuario. */
  private async assertNoForeignIds(run: ImportRun, repositories: RepositorySet, userId: string, envelope: BackupEnvelopeV2): Promise<void> {
    const ownedByOther = async (petId: string) => (await repositories.pets.findById(petId))?.ownerUserId !== userId;
    for (const pet of envelope.pets) {
      if ((await repositories.pets.findById(pet.id)) !== null && (await ownedByOther(pet.id))) {
        throw run.fail('ORPHAN_DUPLICATE_OR_FOREIGN_ID', `El ID ${pet.id} (pets) pertenece a otro usuario.`, 'pets');
      }
    }
    for (const { module, record } of recordsOf(envelope)) {
      const storedPetId = await repositories.records.findPetIdOfRecord(record.id);
      if (storedPetId !== null && (await ownedByOther(storedPetId))) {
        throw run.fail('ORPHAN_DUPLICATE_OR_FOREIGN_ID', `El ID ${record.id} (${module}) pertenece a otro usuario.`, module);
      }
    }
  }
}
