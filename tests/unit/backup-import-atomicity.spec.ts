import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type { BackupEnvelopeV2 } from '../../src/generated/index.ts';
import { ImportBackupUseCase } from '../../src/application/use-cases/backup-use-cases.ts';
import { ANDRES, LUNA, canonicalState, createHarness, envelope } from '../fixtures/application-harness.ts';
import { failure, v2 } from '../fixtures/backup-harness.ts';

type Module = keyof BackupEnvelopeV2['records'];
const MODULES = Object.keys(envelope.records) as Module[];

/** Corrupciones que siempre invalidan el sobre, con el código que deben producir. */
const CORRUPTIONS: ReadonlyArray<{ readonly code: string; readonly apply: (e: BackupEnvelopeV2, module: Module, i: number) => void }> = [
  { code: 'ERR-BACKUP-SCHEMA-INVALID', apply: (e, m, i) => Object.assign(e.records[m][i % e.records[m].length]!, { extra: 1 }) },
  { code: 'ERR-BACKUP-SCHEMA-INVALID', apply: (e, m, i) => Object.assign(e.records[m][i % e.records[m].length]!, { createdAt: '2026-01-01T10:00:00Z' }) },
  { code: 'ERR-BACKUP-SCHEMA-INVALID', apply: (e, _m, i) => (e.pets[i % e.pets.length]!.name = '') },
  { code: 'ERR-BACKUP-REFERENTIAL-INTEGRITY', apply: (e, m, i) => (e.records[m][i % e.records[m].length]!.petId = LUNA.id) },
  { code: 'ERR-BACKUP-REFERENTIAL-INTEGRITY', apply: (e, m, i) => e.records[m].push(structuredClone(e.records[m][i % e.records[m].length]!) as never) },
  { code: 'ERR-BACKUP-REFERENTIAL-INTEGRITY', apply: (e) => e.pets.push({ ...LUNA, ownerUserId: ANDRES }) },
  { code: 'ERR-PET-FUTURE-BIRTHDATE', apply: (e, _m, i) => (e.pets[i % e.pets.length]!.birthDate = '2027-01-01') },
];

describe('TASK-109: atomicidad de la importación (propiedad, seed 20261105)', () => {
  it('[INV-BACKUP-001][STATE-BACKUP-001] cualquier corrupción de un sobre válido termina en ROLLED_BACK con su código y deja los datos idénticos byte a byte', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 0, max: CORRUPTIONS.length - 1 }),
        fc.constantFrom(...MODULES),
        fc.nat({ max: 20 }),
        fc.boolean(),
        async (which, module, index, commitFails) => {
          const harness = createHarness(canonicalState(), commitFails ? { beforeCommit: () => { throw new Error('commit'); } } : {});
          const before = JSON.stringify(harness.uow.snapshot());
          const corruption = CORRUPTIONS[which]!;
          const error = await failure(new ImportBackupUseCase(harness.deps).execute(ANDRES, JSON.stringify(v2((e) => corruption.apply(e, module, index)))));
          expect([error.code, error.finalState, JSON.stringify(harness.uow.snapshot()) === before]).toEqual([corruption.code, 'ROLLED_BACK', true]);
        },
      ),
      { seed: 20261105, numRuns: 200 },
    );
  });
});
