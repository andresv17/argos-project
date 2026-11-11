import { describe, expect, it } from 'vitest';
import { validateBackupEnvelopeV2Legacy, type BackupEnvelopeV1Legacy } from '../../src/generated/index.ts';
import { migrateLegacyEnvelope, normalizeToCanonicalUtc } from '../../src/domain/backup/backup-migration.ts';
import { ANDRES, fixtures } from '../fixtures/application-harness.ts';

const legacy: BackupEnvelopeV1Legacy = fixtures.validLegacyBackupEnvelopeV1;

describe('migración v1 → v2 (src/domain/backup/backup-migration.ts)', () => {
  it.each([
    ['2026-01-01T10:00:00.000Z', '2026-01-01T10:00:00.000Z'],
    ['2026-01-01T10:00:00Z', '2026-01-01T10:00:00.000Z'],
    ['2026-01-01t10:00:00z', '2026-01-01T10:00:00.000Z'],
    ['2026-01-01 10:00:00Z', '2026-01-01T10:00:00.000Z'],
    ['2026-01-01T10:00:00.5Z', '2026-01-01T10:00:00.500Z'],
    ['2026-01-01T10:00:00.12Z', '2026-01-01T10:00:00.120Z'],
    ['2026-01-01T10:00:00.123456Z', '2026-01-01T10:00:00.123Z'],
    ['2026-01-01T05:00:00-05:00', '2026-01-01T10:00:00.000Z'],
    ['2026-01-01T05:00:00-0500', '2026-01-01T10:00:00.000Z'],
    ['2026-01-01T05:00:00-05', '2026-01-01T10:00:00.000Z'],
    ['2026-01-01T15:30:00+05:30', '2026-01-01T10:00:00.000Z'],
    ['2026-01-01T15:30:00+0530', '2026-01-01T10:00:00.000Z'],
    ['2026-01-01T10:00:00+14:00', '2025-12-31T20:00:00.000Z'],
    ['2026-12-31T23:30:00-01:00', '2027-01-01T00:30:00.000Z'],
    ['2024-02-29T23:59:59.999-00:01', '2024-03-01T00:00:59.999Z'],
    ['2026-12-31T23:59:60Z', '2027-01-01T00:00:00.000Z'],
  ])('[STATE-BACKUP-001][INV-SORT-001] normaliza %s a UTC canónico %s', (input, expected) => {
    expect(normalizeToCanonicalUtc(input)).toBe(expected);
  });

  it.each(['2026-02-30T10:00:00Z', '2026-01-01T10:00:00', '2026-01-01T10:00:00.Z', 'x2026-01-01T10:00:00Z', '2026-01-01T10:00:00Zx', 'no-es-fecha', ''])(
    '[STATE-BACKUP-001] un valor sin forma RFC 3339 válida (%j) se devuelve sin cambios para que la revalidación v2 lo rechace',
    (input) => {
      expect(normalizeToCanonicalUtc(input)).toBe(input);
    },
  );

  it('[STATE-BACKUP-001][REQ-BACKUP-002] EDGE-023: el sobre v1 canónico pasa a v2 con ownerUserId y exportedByUserId del usuario y updatedAt = createdAt', () => {
    const before = structuredClone(legacy);
    const migrated = migrateLegacyEnvelope(legacy, ANDRES);
    expect(migrated).toEqual({
      schemaVersion: '2.0.0',
      exportedAt: '2026-11-05T12:00:00.000Z',
      exportedByUserId: ANDRES,
      pets: legacy.pets.map((pet) => ({ ...pet, ownerUserId: ANDRES, updatedAt: pet.createdAt })),
      records: legacy.records,
    });
    expect(validateBackupEnvelopeV2Legacy(migrated)).toBe(true);
    expect(legacy).toEqual(before);
  });

  it('[STATE-BACKUP-001][INV-SORT-001] normaliza exportedAt y el createdAt de mascotas y de los 6 módulos; updatedAt toma el createdAt ya normalizado', () => {
    const shifted = structuredClone(legacy);
    shifted.exportedAt = '2026-11-05T07:00:00-05:00';
    shifted.pets[0]!.createdAt = '2026-01-01T05:00:00-05:00';
    const modules = Object.keys(shifted.records) as Array<keyof BackupEnvelopeV1Legacy['records']>;
    for (const module of modules) (shifted.records[module][0] as { createdAt: string }).createdAt = '2026-01-02 08:00:00.7+01:00';
    const migrated = migrateLegacyEnvelope(shifted, ANDRES);
    expect(migrated.exportedAt).toBe('2026-11-05T12:00:00.000Z');
    expect([migrated.pets[0]!.createdAt, migrated.pets[0]!.updatedAt]).toEqual(['2026-01-01T10:00:00.000Z', '2026-01-01T10:00:00.000Z']);
    expect(modules.map((module) => migrated.records[module][0]!.createdAt)).toEqual(modules.map(() => '2026-01-02T07:00:00.700Z'));
    expect(validateBackupEnvelopeV2Legacy(migrated)).toBe(true);
  });
});
