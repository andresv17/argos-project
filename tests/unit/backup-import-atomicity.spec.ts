import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type { BackupEnvelopeV3 } from '../../src/generated/index.ts';
import { ImportBackupUseCase } from '../../src/application/use-cases/backup-use-cases.ts';
import { ANDRES, LUNA, canonicalState, createHarness, envelope } from '../fixtures/application-harness.ts';

/** Luna como la lleva un archivo 3.0.0: sin ownerUserId. */
const { ownerUserId: _lunaOwner, ...LUNA_IN_FILE } = LUNA;
import { digestOf, failure, v3 } from '../fixtures/backup-harness.ts';

type Module = keyof BackupEnvelopeV3['records'];
const MODULES = Object.keys(envelope.records) as Module[];

/** Corrupciones que siempre invalidan el sobre, con el código que deben producir. */
const CORRUPTIONS: ReadonlyArray<{ readonly code: string; readonly apply: (e: BackupEnvelopeV3, module: Module, i: number) => void }> = [
  { code: 'ERR-BACKUP-SCHEMA-INVALID', apply: (e, m, i) => Object.assign(e.records[m][i % e.records[m].length]!, { extra: 1 }) },
  { code: 'ERR-BACKUP-SCHEMA-INVALID', apply: (e, m, i) => Object.assign(e.records[m][i % e.records[m].length]!, { createdAt: '2026-01-01T10:00:00Z' }) },
  { code: 'ERR-BACKUP-SCHEMA-INVALID', apply: (e, _m, i) => (e.pets[i % e.pets.length]!.name = '') },
  { code: 'ERR-BACKUP-REFERENTIAL-INTEGRITY', apply: (e, m, i) => (e.records[m][i % e.records[m].length]!.petId = LUNA.id) },
  { code: 'ERR-BACKUP-REFERENTIAL-INTEGRITY', apply: (e, m, i) => e.records[m].push(structuredClone(e.records[m][i % e.records[m].length]!) as never) },
  { code: 'ERR-BACKUP-REFERENTIAL-INTEGRITY', apply: (e) => e.pets.push(LUNA_IN_FILE as never) },
  { code: 'ERR-PET-FUTURE-BIRTHDATE', apply: (e, _m, i) => (e.pets[i % e.pets.length]!.birthDate = '2027-01-01') },
];

describe('atomicidad de la importación (propiedad, seed 20261105)', () => {
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
          const payload = JSON.stringify(v3((e) => corruption.apply(e, module, index)));
          const error = await failure(new ImportBackupUseCase(harness.deps).execute(ANDRES, payload, digestOf(payload)));
          expect([error.code, error.finalState, JSON.stringify(harness.uow.snapshot()) === before]).toEqual([corruption.code, 'ROLLED_BACK', true]);
        },
      ),
      { seed: 20261105, numRuns: 200 },
    );
  });
});
