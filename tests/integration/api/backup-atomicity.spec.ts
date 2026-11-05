import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { DomainError, type BackupEnvelope } from '../../../src/generated/index.ts';
import {
  ExportBackupUseCase,
  ImportBackupUseCase,
} from '../../../src/application/use-cases/backup-use-cases.ts';
import { FixedClockAdapter } from '../../../src/infrastructure/adapters/deterministic-adapters.ts';
import {
  InMemoryTransactionalRepository,
  LocalStorageTransactionalRepository,
} from '../../../src/infrastructure/storage/transactional-repository.ts';

const canonicalFixturesRaw = JSON.parse(
  readFileSync(resolve(process.cwd(), 'contracts/examples/canonical-fixtures.json'), 'utf8')
);
const validEnvelope: BackupEnvelope = canonicalFixturesRaw.validBackupEnvelope;
const FIXED_TODAY = '2026-11-05';
const FIXED_NOW = '2026-11-05T12:00:00.000Z';
const PROPERTY_SEED = 20261105;

describe('Integration & Atomicity: JSON Backup Export & Import with Rollback [REQ-BACKUP-001, REQ-BACKUP-002, INV-BACKUP-001, STATE-BACKUP-001]', () => {
  it('[REQ-BACKUP-001][REQ-BACKUP-002][STATE-BACKUP-001] importa y re-exporta el sobre canónico completo transitando hasta COMPLETED', () => {
    const repo = new InMemoryTransactionalRepository();
    const clock = new FixedClockAdapter(FIXED_TODAY, FIXED_NOW);
    const importer = new ImportBackupUseCase(repo, clock);
    const exporter = new ExportBackupUseCase(repo, clock);

    const importResult = importer.execute(JSON.stringify(validEnvelope));
    expect(importResult).toEqual({
      finalState: 'COMPLETED',
      importedPetsCount: 4,
      importedRecordsCount: 8,
    });
    expect(importer.getTransitionHistory()).toEqual([
      'IDLE',
      'PARSING_JSON',
      'VALIDATING_VERSION_AND_SCHEMA',
      'CHECKING_DOMAIN_INVARIANTS',
      'COMMITTING_SNAPSHOT',
      'COMPLETED',
    ]);

    const exported = exporter.execute();
    expect(exported.envelope.schemaVersion).toBe('1.0.0');
    expect(exported.envelope.pets).toHaveLength(4);
    expect(exported.envelope.records.weights).toHaveLength(2);
  });

  it('[REQ-BACKUP-002][INV-BACKUP-001][STATE-BACKUP-001][ERR-BACKUP-MALFORMED-JSON] aborta ante JSON malformado y preserva el snapshot previo byte por byte', () => {
    const repo = new InMemoryTransactionalRepository();
    const clock = new FixedClockAdapter(FIXED_TODAY, FIXED_NOW);
    const importer = new ImportBackupUseCase(repo, clock);

    // Poblar estado inicial válido
    importer.execute(JSON.stringify(validEnvelope));
    const snapshotBefore = JSON.stringify(repo.createSnapshot());

    let caughtError: DomainError | null = null;
    try {
      importer.execute('{ malformed json payload ');
    } catch (err) {
      if (err instanceof DomainError) caughtError = err;
    }

    expect(caughtError?.code).toBe('ERR-BACKUP-MALFORMED-JSON');
    expect(caughtError?.status).toBe(400);
    expect(importer.getState()).toBe('ROLLED_BACK');
    expect(JSON.stringify(repo.createSnapshot())).toBe(snapshotBefore);
  });

  it('[REQ-BACKUP-002][INV-BACKUP-001][STATE-BACKUP-001][ERR-BACKUP-VERSION-UNSUPPORTED] rechaza schemaVersion != 1.0.0 y ejecuta rollback atómico', () => {
    const repo = new InMemoryTransactionalRepository();
    const clock = new FixedClockAdapter(FIXED_TODAY, FIXED_NOW);
    const importer = new ImportBackupUseCase(repo, clock);

    importer.execute(JSON.stringify(validEnvelope));
    const snapshotBefore = JSON.stringify(repo.createSnapshot());

    const wrongVersionPayload = {
      ...validEnvelope,
      schemaVersion: '2.0.0',
    };

    let caughtError: DomainError | null = null;
    try {
      importer.execute(JSON.stringify(wrongVersionPayload));
    } catch (err) {
      if (err instanceof DomainError) caughtError = err;
    }

    expect(caughtError?.code).toBe('ERR-BACKUP-VERSION-UNSUPPORTED');
    expect(caughtError?.status).toBe(422);
    expect(importer.getState()).toBe('ROLLED_BACK');
    expect(JSON.stringify(repo.createSnapshot())).toBe(snapshotBefore);
  });

  it('[REQ-BACKUP-002][INV-BACKUP-001][STATE-BACKUP-001][ERR-BACKUP-SCHEMA-INVALID] rechaza estructura de esquema inválida y conserva el estado previo', () => {
    const repo = new InMemoryTransactionalRepository();
    const clock = new FixedClockAdapter(FIXED_TODAY, FIXED_NOW);
    const importer = new ImportBackupUseCase(repo, clock);

    importer.execute(JSON.stringify(validEnvelope));
    const snapshotBefore = JSON.stringify(repo.createSnapshot());

    const invalidSchemaPayload = {
      schemaVersion: '1.0.0',
      exportedAt: FIXED_NOW,
      pets: [],
      // falta el objeto records
    };

    let caughtError: DomainError | null = null;
    try {
      importer.execute(JSON.stringify(invalidSchemaPayload));
    } catch (err) {
      if (err instanceof DomainError) caughtError = err;
    }

    expect(caughtError?.code).toBe('ERR-BACKUP-SCHEMA-INVALID');
    expect(caughtError?.status).toBe(422);
    expect(importer.getState()).toBe('ROLLED_BACK');
    expect(JSON.stringify(repo.createSnapshot())).toBe(snapshotBefore);
  });

  it('[REQ-BACKUP-002][INV-BACKUP-001][STATE-BACKUP-001][ERR-BACKUP-REFERENTIAL-INTEGRITY] rechaza registros con petId huérfano o IDs duplicados y preserva el estado previo (EDGE-005)', () => {
    const repo = new InMemoryTransactionalRepository();
    const clock = new FixedClockAdapter(FIXED_TODAY, FIXED_NOW);
    const importer = new ImportBackupUseCase(repo, clock);

    importer.execute(JSON.stringify(validEnvelope));
    const snapshotBefore = JSON.stringify(repo.createSnapshot());

    // EDGE-005: Registro de peso con petId que no existe en pets[]
    const orphanRecordPayload = {
      ...validEnvelope,
      records: {
        ...validEnvelope.records,
        weights: [
          ...validEnvelope.records.weights,
          {
            id: '22222222-2222-4222-8222-222222222299',
            petId: '99999999-9999-4999-8999-999999999999',
            recordedAt: '2026-11-01',
            weightKg: 15.0,
            notes: 'Huérfano',
            createdAt: FIXED_NOW,
          },
        ],
      },
    };

    let orphanError: DomainError | null = null;
    try {
      importer.execute(JSON.stringify(orphanRecordPayload));
    } catch (err) {
      if (err instanceof DomainError) orphanError = err;
    }

    expect(orphanError?.code).toBe('ERR-BACKUP-REFERENTIAL-INTEGRITY');
    expect(orphanError?.status).toBe(409);
    expect(importer.getState()).toBe('ROLLED_BACK');
    expect(JSON.stringify(repo.createSnapshot())).toBe(snapshotBefore);
  });

  it('[INV-BACKUP-001][STATE-BACKUP-001] verifica mediante property-based testing (seed 20261105) que cualquier mutación corrupta revierte al snapshot original', () => {
    const repo = new InMemoryTransactionalRepository();
    const clock = new FixedClockAdapter(FIXED_TODAY, FIXED_NOW);
    const importer = new ImportBackupUseCase(repo, clock);

    importer.execute(JSON.stringify(validEnvelope));
    const canonicalSnapshotJson = JSON.stringify(repo.createSnapshot());

    const corruptionTypeArb = fc.constantFrom(
      'TRUNCATED_JSON',
      'UNSUPPORTED_VERSION',
      'ORPHAN_WEIGHT',
      'DUPLICATE_PET_ID',
      'THREE_DOGS_QUOTA_VIOLATION',
      'BOOSTER_BEFORE_APPLIED'
    );

    fc.assert(
      fc.property(corruptionTypeArb, (corruptionType) => {
        let corruptedPayloadString = '';
        if (corruptionType === 'TRUNCATED_JSON') {
          corruptedPayloadString = '{"schemaVersion": "1.0.0", "pets": [';
        } else if (corruptionType === 'UNSUPPORTED_VERSION') {
          corruptedPayloadString = JSON.stringify({ ...validEnvelope, schemaVersion: '0.9.0' });
        } else if (corruptionType === 'ORPHAN_WEIGHT') {
          corruptedPayloadString = JSON.stringify({
            ...validEnvelope,
             pets: validEnvelope.pets.slice(1), // Elimina Argos dejando sus pesos huérfanos
          });
        } else if (corruptionType === 'DUPLICATE_PET_ID') {
          corruptedPayloadString = JSON.stringify({
            ...validEnvelope,
            pets: [validEnvelope.pets[0], validEnvelope.pets[0]],
          });
        } else if (corruptionType === 'THREE_DOGS_QUOTA_VIOLATION') {
          corruptedPayloadString = JSON.stringify({
            ...validEnvelope,
            pets: [
              validEnvelope.pets[0],
              validEnvelope.pets[1],
              { ...validEnvelope.pets[2], species: 'DOG' },
            ],
          });
        } else {
          corruptedPayloadString = JSON.stringify({
            ...validEnvelope,
            records: {
              ...validEnvelope.records,
              vaccinations: [
                {
                  ...validEnvelope.records.vaccinations[0],
                  appliedAt: '2026-10-10',
                  nextBoosterAt: '2026-10-01',
                },
              ],
            },
          });
        }

        let caught: DomainError | null = null;
        try {
          importer.execute(corruptedPayloadString);
        } catch (err) {
          if (err instanceof DomainError) caught = err;
        }

        expect(caught !== null).toBe(true);
        expect(importer.getState()).toBe('ROLLED_BACK');
        expect(JSON.stringify(repo.createSnapshot())).toBe(canonicalSnapshotJson);
      }),
      { seed: PROPERTY_SEED, numRuns: 50 }
    );
  });

  it('[INV-BACKUP-001][STATE-BACKUP-001] LocalStorageTransactionalRepository restaura el estado en memoria si el backend falla al escribir', () => {
    let failWrites = false;
    const store = new Map<string, string>();
    const mockBackend = {
      getItem(k: string): string | null {
        return store.get(k) ?? null;
      },
      setItem(k: string, v: string): void {
        if (failWrites) {
          throw new Error('QuotaExceededError');
        }
        store.set(k, v);
      },
    };

    const localRepo = new LocalStorageTransactionalRepository(mockBackend);
    localRepo.savePet(validEnvelope.pets[0]!);
    expect(localRepo.listPets()).toHaveLength(1);

    failWrites = true;
    let storageError: DomainError | null = null;
    try {
      localRepo.savePet(validEnvelope.pets[1]!);
    } catch (err) {
      if (err instanceof DomainError) storageError = err;
    }

    expect(storageError?.code).toBe('ERR-BACKUP-ATOMIC-ROLLBACK');
    expect(localRepo.listPets()).toHaveLength(1);
    expect(localRepo.listPets()[0]?.name).toBe('Argos');
  });
});
