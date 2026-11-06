/**
 * Application Use Cases for Deterministic JSON Backup Export and Atomic Import with Rollback.
 * Strictly implements STATE-BACKUP-001 and INV-BACKUP-001 without direct clock/random calls [INV-ARCH-001, INV-ARCH-002].
 *
 * @implements REQ-BACKUP-001, REQ-BACKUP-002, INV-BACKUP-001, INV-PET-001, INV-PET-003, INV-REC-002, INV-REC-003, INV-REC-004, INV-REC-005, INV-REC-006, STATE-BACKUP-001, ERR-BACKUP-MALFORMED-JSON, ERR-BACKUP-VERSION-UNSUPPORTED, ERR-BACKUP-SCHEMA-INVALID, ERR-BACKUP-REFERENTIAL-INTEGRITY, ERR-BACKUP-ATOMIC-ROLLBACK, INV-ARCH-001, INV-ARCH-004
 */

import {
  DomainError,
  validateBackupEnvelopeSchema,
  type BackupEnvelope,
  type BackupTransactionState,
  type ImportBackupResult,
  type PetProfile,
} from '../../generated/index.ts';
import { validatePetCollectionInvariants } from '../../domain/pet/pet-invariants.ts';
import {
  validateBodyMeasurementRecordDomain,
  validateCustomParameterRecordDomain,
  validateDewormingRecordDomain,
  validateMedicalVisitRecordDomain,
  validateVaccinationRecordDomain,
  validateWeightRecordDomain,
} from '../../domain/records/record-invariants.ts';
import { sortHistoricalRecords } from '../../domain/sorting/deterministic-sorter.ts';
import type { ClockPort } from '../ports/clock.port.ts';
import type { StorageRepositoryPort } from '../ports/storage-repository.port.ts';

/**
 * Serializes the complete repository state into a validated BackupEnvelope v1.0.0 JSON string.
 *
 * @implements REQ-BACKUP-001, INV-BACKUP-001, INV-ARCH-001
 */
export class ExportBackupUseCase {
  private readonly repository: StorageRepositoryPort;
  private readonly clock: ClockPort;

  constructor(repository: StorageRepositoryPort, clock: ClockPort) {
    this.repository = repository;
    this.clock = clock;
  }

  public execute(): { readonly envelope: BackupEnvelope; readonly jsonString: string } {
    const snapshot = this.repository.createSnapshot();

    const candidate: BackupEnvelope = {
      schemaVersion: '1.0.0',
      exportedAt: this.clock.nowIsoTimestamp(),
      pets: snapshot.pets,
      records: {
        weights: sortHistoricalRecords(snapshot.records.weights),
        bodyMeasurements: sortHistoricalRecords(snapshot.records.bodyMeasurements),
        vaccinations: sortHistoricalRecords(snapshot.records.vaccinations),
        dewormings: sortHistoricalRecords(snapshot.records.dewormings),
        medicalVisits: sortHistoricalRecords(snapshot.records.medicalVisits),
        customParameters: sortHistoricalRecords(snapshot.records.customParameters),
      },
    };

    const validated = validateBackupEnvelopeSchema(candidate);
    return {
      envelope: validated,
      jsonString: JSON.stringify(validated, null, 2),
    };
  }
}

/**
 * Atomically imports a raw JSON string following STATE-BACKUP-001:
 * IDLE -> PARSING_JSON -> VALIDATING_VERSION_AND_SCHEMA -> CHECKING_DOMAIN_INVARIANTS -> COMMITTING_SNAPSHOT -> COMPLETED | ROLLED_BACK.
 * Any failure restores the previous snapshot byte-for-byte.
 *
 * @implements REQ-BACKUP-002, INV-BACKUP-001, STATE-BACKUP-001, ERR-BACKUP-MALFORMED-JSON, ERR-BACKUP-VERSION-UNSUPPORTED, ERR-BACKUP-SCHEMA-INVALID, ERR-BACKUP-REFERENTIAL-INTEGRITY, ERR-BACKUP-ATOMIC-ROLLBACK, INV-ARCH-001
 */
export class ImportBackupUseCase {
  private readonly repository: StorageRepositoryPort;
  private readonly clock: ClockPort;
  private currentState: BackupTransactionState = 'IDLE';
  private transitionHistory: BackupTransactionState[] = ['IDLE'];

  constructor(repository: StorageRepositoryPort, clock: ClockPort) {
    this.repository = repository;
    this.clock = clock;
  }

  public getState(): BackupTransactionState {
    return this.currentState;
  }

  public getTransitionHistory(): readonly BackupTransactionState[] {
    return [...this.transitionHistory];
  }

  private transitionTo(nextState: BackupTransactionState): void {
    this.currentState = nextState;
    this.transitionHistory.push(nextState);
  }

  public execute(rawJsonPayload: string): ImportBackupResult {
    this.currentState = 'IDLE';
    this.transitionHistory = ['IDLE'];
    const previousSnapshot = this.repository.createSnapshot();

    try {
      // Step 1: PARSING_JSON
      this.transitionTo('PARSING_JSON');
      let parsed: unknown;
      try {
        parsed = JSON.parse(rawJsonPayload);
      } catch {
        throw new DomainError(
          'ERR-BACKUP-MALFORMED-JSON',
          'El archivo importado no es un documento JSON sintácticamente válido.'
        );
      }

      // Step 2: VALIDATING_VERSION_AND_SCHEMA
      this.transitionTo('VALIDATING_VERSION_AND_SCHEMA');
      const envelope = validateBackupEnvelopeSchema(parsed);

      // Step 3: CHECKING_DOMAIN_INVARIANTS
      this.transitionTo('CHECKING_DOMAIN_INVARIANTS');
      this.assertReferentialIntegrityAndDomainInvariants(envelope);

      // Step 4: COMMITTING_SNAPSHOT
      this.transitionTo('COMMITTING_SNAPSHOT');
      this.repository.replaceWithSnapshot({
        pets: envelope.pets,
        records: envelope.records,
      });

      this.transitionTo('COMPLETED');
      const totalRecords =
        envelope.records.weights.length +
        envelope.records.bodyMeasurements.length +
        envelope.records.vaccinations.length +
        envelope.records.dewormings.length +
        envelope.records.medicalVisits.length +
        envelope.records.customParameters.length;

      return {
        finalState: 'COMPLETED',
        importedPetsCount: envelope.pets.length,
        importedRecordsCount: totalRecords,
      };
    } catch (err) {
      // Atomic Rollback to previousSnapshot [STATE-BACKUP-001, INV-BACKUP-001]
      this.repository.replaceWithSnapshot(previousSnapshot);
      this.transitionTo('ROLLED_BACK');
      throw err;
    }
  }

  private assertReferentialIntegrityAndDomainInvariants(envelope: BackupEnvelope): void {
    const today = this.clock.todayIsoDate();
    const seenPetIds = new Set<string>();
    const petsById = new Map<string, PetProfile>();

    for (const pet of envelope.pets) {
      if (seenPetIds.has(pet.id)) {
        throw new DomainError(
          'ERR-BACKUP-REFERENTIAL-INTEGRITY',
          `ID de mascota duplicado en el archivo de respaldo: ${pet.id}.`,
          'pets'
        );
      }
      seenPetIds.add(pet.id);
      petsById.set(pet.id, pet);
    }

    // Validate pet quota (<= 4 total, <= 2 DOG, <= 2 CAT) and non-future birthDate
    validatePetCollectionInvariants(envelope.pets, today);

    const seenRecordIds = new Set<string>();
    const registerRecordId = (recordId: string, petId: string, collectionName: string): PetProfile => {
      if (seenRecordIds.has(recordId) || seenPetIds.has(recordId)) {
        throw new DomainError(
          'ERR-BACKUP-REFERENTIAL-INTEGRITY',
          `ID de registro duplicado (${recordId}) en ${collectionName}.`,
          collectionName
        );
      }
      seenRecordIds.add(recordId);

      const ownerPet = petsById.get(petId);
      if (!ownerPet) {
        throw new DomainError(
          'ERR-BACKUP-REFERENTIAL-INTEGRITY',
          `Registro huérfano (${recordId}) en ${collectionName}: petId ${petId} no existe en pets[].`,
          collectionName
        );
      }
      return ownerPet;
    };

    for (const w of envelope.records.weights) {
      const pet = registerRecordId(w.id, w.petId, 'weights');
      validateWeightRecordDomain(w, pet.birthDate, today);
    }

    for (const m of envelope.records.bodyMeasurements) {
      const pet = registerRecordId(m.id, m.petId, 'bodyMeasurements');
      validateBodyMeasurementRecordDomain(m, pet.birthDate, today);
    }

    for (const v of envelope.records.vaccinations) {
      const pet = registerRecordId(v.id, v.petId, 'vaccinations');
      validateVaccinationRecordDomain(v, pet.birthDate, today);
    }

    for (const d of envelope.records.dewormings) {
      const pet = registerRecordId(d.id, d.petId, 'dewormings');
      validateDewormingRecordDomain(d, pet.birthDate, today);
    }

    for (const mv of envelope.records.medicalVisits) {
      const pet = registerRecordId(mv.id, mv.petId, 'medicalVisits');
      validateMedicalVisitRecordDomain(mv, pet.birthDate, today);
    }

    for (const c of envelope.records.customParameters) {
      const pet = registerRecordId(c.id, c.petId, 'customParameters');
      validateCustomParameterRecordDomain(c, pet.birthDate, today);
    }
  }
}
