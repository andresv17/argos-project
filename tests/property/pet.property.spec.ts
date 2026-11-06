import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { DomainError, type BackupEnvelopeV2 } from '../../src/generated/index.ts';
import { assertBirthDateNotAfterRecords } from '../../src/domain/pet/pet-invariants.ts';
import { deletePetCascade } from '../../src/domain/pet/pet-deletion.ts';

const PROPERTY_SEED = 20261105;
const DAY_MS = 86_400_000;
const BASE_MS = Date.UTC(2020, 0, 1);
const iso = (day: number) => new Date(BASE_MS + day * DAY_MS).toISOString().slice(0, 10);
const envelope: BackupEnvelopeV2 = JSON.parse(
  readFileSync(resolve(process.cwd(), 'contracts/examples/canonical-fixtures.json'), 'utf8'),
).validBackupEnvelopeV2;
type Collections = BackupEnvelopeV2['records'];

function outcome(action: () => void): string {
  try {
    action();
    return 'OK';
  } catch (error) {
    if (error instanceof DomainError) return error.code;
    throw error;
  }
}

describe('TASK-105: propiedades de mascota', () => {
  it('[INV-PET-006][ERR-PET-BIRTHDATE-AFTER-RECORDS] falla si y solo si birthDate es posterior al registro más antiguo', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 2500 }), fc.array(fc.integer({ min: 0, max: 2500 }), { maxLength: 10 }), (birth, events) => {
        const expected = events.length > 0 && birth > Math.min(...events) ? 'ERR-PET-BIRTHDATE-AFTER-RECORDS' : 'OK';
        expect(outcome(() => assertBirthDateNotAfterRecords(iso(birth), events.map(iso)))).toBe(expected);
      }),
      { seed: PROPERTY_SEED, numRuns: 400 },
    );
  });

  it('[REQ-PET-004][INV-PET-005] tras borrar cualquier mascota no queda ningún registro suyo y el resto no cambia', () => {
    const petIds = envelope.pets.map((p) => p.id);
    fc.assert(
      fc.property(fc.constantFrom(...petIds), fc.subarray(petIds, { minLength: 1 }), (target, kept) => {
        const pets = envelope.pets.filter((p) => kept.includes(p.id) || p.id === target);
        const result = deletePetCascade({ pets, records: envelope.records }, target);
        expect(result.state.pets.map((p) => p.id)).toEqual(pets.filter((p) => p.id !== target).map((p) => p.id));
        let removed = 0;
        for (const name of Object.keys(envelope.records) as Array<keyof Collections>) {
          const before = envelope.records[name] as Array<{ id: string; petId: string }>;
          const after = result.state.records[name] as Array<{ id: string; petId: string }>;
          expect(after.some((r) => r.petId === target)).toBe(false);
          expect(after).toEqual(before.filter((r) => r.petId !== target));
          expect(result.removedRecords[name]).toBe(before.length - after.length);
          removed += result.removedRecords[name];
        }
        const expectedRemoved = Object.values(envelope.records).flat().filter((r) => r.petId === target).length;
        expect(removed).toBe(expectedRemoved);
      }),
      { seed: PROPERTY_SEED, numRuns: 100 },
    );
  });
});
