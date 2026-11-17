import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { DomainError, type BackupEnvelopeV3, type PetProfile } from '../../src/generated/index.ts';
import { assertBirthDateNotAfterRecords, assertMicrochipUniqueForOwner, createPetProfile } from '../../src/domain/pet/pet-invariants.ts';
import { SPECIES, assertSpeciesConsistency } from '../../src/domain/pet/species.ts';
import { estimatedAgeToBirthDate } from '../../src/domain/pet/estimated-age.ts';
import { calculatePetAge } from '../../src/domain/shared/date-utils.ts';
import { upgradePet } from '../fixtures/storage-upgrade.ts';
import { deletePetCascade } from '../../src/domain/pet/pet-deletion.ts';

const PROPERTY_SEED = 20261105;
const DAY_MS = 86_400_000;
const BASE_MS = Date.UTC(2020, 0, 1);
const iso = (day: number) => new Date(BASE_MS + day * DAY_MS).toISOString().slice(0, 10);
const envelope: BackupEnvelopeV3 = JSON.parse(
  readFileSync(resolve(process.cwd(), 'specs/001-pet-health-tracker/contracts/examples/canonical-fixtures.json'), 'utf8'),
).validBackupEnvelopeV2;
type Collections = BackupEnvelopeV3['records'];

function outcome(action: () => void): string {
  try {
    action();
    return 'OK';
  } catch (error) {
    if (error instanceof DomainError) return error.code;
    throw error;
  }
}

describe('propiedades de mascota', () => {
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
        const pets = (envelope.pets as unknown as PetProfile[]).filter((p) => kept.includes(p.id) || p.id === target).map(upgradePet);
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

  it('[INV-PET2-001] species y speciesOther son coherentes si y solo si speciesOther es no nulo exactamente cuando species es OTHER', () => {
    const others = fc.constantFrom<string | null>(null, 'Erizo africano', 'Pez');
    fc.assert(
      fc.property(fc.constantFrom(...SPECIES), others, (species, speciesOther) => {
        const expected = (species === 'OTHER') === (speciesOther !== null) ? 'OK' : 'ERR-SCHEMA-VALIDATION-FAILED';
        expect(outcome(() => assertSpeciesConsistency(species, speciesOther))).toBe(expected);
        const input = { name: 'Nube', species, breed: 'Mestizo', sex: 'FEMALE', birthDate: '2024-01-01', speciesOther };
        const created = outcome(() => createPetProfile({ id: '22222222-2222-4222-8222-222222222201', ownerUserId: envelope.pets[0]!.id, input, today: '2026-11-05', nowIsoTimestamp: '2026-11-05T12:00:00.000Z' }));
        expect(created).toBe(expected);
      }),
      { seed: PROPERTY_SEED, numRuns: 200 },
    );
  });

  it('[REQ-PET-002][REQ-PET2-001] estimatedAge ida y vuelta: la edad real calculada desde el birthDate convertido devuelve los mismos años y meses (reloj inyectado)', () => {
    const today = fc.integer({ min: 0, max: 3000 }).map(iso);
    fc.assert(
      fc.property(today, fc.integer({ min: 0, max: 60 }), fc.integer({ min: 0, max: 11 }), (now, years, months) => {
        const birth = estimatedAgeToBirthDate(now, { years, months });
        expect(birth <= now).toBe(true);
        const age = calculatePetAge(birth, now);
        expect([age.years, age.months]).toEqual([years, months]);
      }),
      { seed: PROPERTY_SEED, numRuns: 500 },
    );
  });

  it('[REQ-PET2-001][ERR-PET-MICROCHIP-DUPLICATE] el microchip repetido falla si y solo si otra mascota del propietario lo tiene', () => {
    const chip = fc.constantFrom<string | null>(null, '981020000000001', '981020000000002');
    fc.assert(
      fc.property(fc.array(chip, { maxLength: 6 }), chip, (existing, candidate) => {
        const owned = existing.map((microchipId, i) => ({ id: `p${i}`, microchipId }));
        const expected = candidate !== null && existing.includes(candidate) ? 'ERR-PET-MICROCHIP-DUPLICATE' : 'OK';
        expect(outcome(() => assertMicrochipUniqueForOwner(owned, candidate, 'nueva'))).toBe(expected);
      }),
      { seed: PROPERTY_SEED, numRuns: 300 },
    );
  });
});
