import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { validateBackupEnvelopeV2Legacy, validateBackupEnvelopeV3, type BackupEnvelopeV2Legacy } from '../../src/generated/index.ts';
import { computeFileDigest, fileDigestMatches, isSha256Hex } from '../../src/domain/backup/file-digest.ts';
import { MAX_JSON_DEPTH, findHardeningViolation } from '../../src/domain/backup/import-hardening.ts';
import { migrateEnvelopeV2ToV3 } from '../../src/domain/backup/backup-migration.ts';
import { fixtures } from '../fixtures/application-harness.ts';

/**
 * T276 (REQ-BACKUP2-002, INV-BACKUP-001, ERR-BACKUP-SCHEMA-INVALID, ERR-BACKUP-VERSION-UNSUPPORTED): fileDigest,
 * endurecimiento del texto JSON y migración 2.0.0 → 3.0.0 de la capa de dominio.
 *
 * @implements REQ-BACKUP2-002, INV-BACKUP-001, ERR-BACKUP-SCHEMA-INVALID, ERR-BACKUP-VERSION-UNSUPPORTED
 */
const legacyV2: BackupEnvelopeV2Legacy = fixtures.validBackupEnvelopeV2;

describe('fileDigest (REQ-BACKUP2-002)', () => {
  it('[REQ-BACKUP2-002] es el SHA-256 hexadecimal minúscula de los bytes, también con bytes que no son UTF-8 válido', () => {
    const samples = [new Uint8Array(), new TextEncoder().encode('{"a":"ñ"}'), new Uint8Array([0x7b, 0xff, 0x7d]), new Uint8Array(1000).fill(97)];
    expect(samples.map(computeFileDigest)).toEqual(samples.map((b) => createHash('sha256').update(b).digest('hex')));
  });

  it.each([
    ['a'.repeat(64), true],
    ['A'.repeat(64), false],
    ['a'.repeat(63), false],
    ['a'.repeat(65), false],
    ['z'.repeat(64), false],
    ['', false],
    [null, false],
    [42, false],
  ])('[REQ-BACKUP2-002] isSha256Hex(%j) = %s', (value, expected) => {
    expect(isSha256Hex(value)).toBe(expected);
  });

  it('[REQ-BACKUP2-002] la confirmación coincide solo si es idéntica al digest en minúscula', () => {
    const digest = computeFileDigest(new TextEncoder().encode('x'));
    expect([fileDigestMatches(digest, digest), fileDigestMatches(digest.toUpperCase(), digest), fileDigestMatches(undefined, digest), fileDigestMatches('b'.repeat(64), digest)]).toEqual([true, false, false, false]);
  });
});

describe('endurecimiento del JSON (P-14, REQ-BACKUP2-002, INV-BACKUP-001)', () => {
  it('[INV-BACKUP-001] el sobre real y los textos inocuos no tienen violación', () => {
    expect([findHardeningViolation(JSON.stringify(legacyV2)), findHardeningViolation('{"a":{"b":[1,2,{"c":"__proto__"}]}}'), findHardeningViolation('[]'), findHardeningViolation('{"a":1}{"a":2}'.slice(0, 7))]).toEqual([null, null, null, null]);
  });

  it.each([
    ['__proto__ en la raíz', '{"__proto__":{"x":1}}', 'FORBIDDEN_KEY'],
    ['constructor anidado', '{"a":[{"constructor":{"prototype":{}}}]}', 'FORBIDDEN_KEY'],
    ['prototype', '{"a":{"prototype":1}}', 'FORBIDDEN_KEY'],
    ['__proto__ con secuencias \\u', '{"\\u005f\\u005fproto__":1}', 'FORBIDDEN_KEY'],
    ['clave duplicada en la raíz', '{"a":1,"a":2}', 'DUPLICATE_KEY'],
    ['clave duplicada en un objeto anidado en un arreglo', '{"p":[{"n":1,"n":2}]}', 'DUPLICATE_KEY'],
    ['duplicada con escape equivalente', '{"a":1,"\\u0061":2}', 'DUPLICATE_KEY'],
  ])('[INV-BACKUP-001][ERR-BACKUP-SCHEMA-INVALID] %s se rechaza', (_name, text, kind) => {
    expect(findHardeningViolation(text)?.kind).toBe(kind);
  });

  it('[INV-BACKUP-001] la misma clave en objetos distintos o como valor de cadena no es duplicada ni prohibida', () => {
    expect(findHardeningViolation('{"a":[{"k":1},{"k":2}],"b":{"k":3},"c":"\\"__proto__\\":"}')).toBeNull();
  });

  it('[INV-BACKUP-001] la profundidad máxima se acepta y un nivel más se rechaza; 100 000 niveles no desbordan la pila', () => {
    const nested = (depth: number) => '['.repeat(depth) + ']'.repeat(depth);
    expect([findHardeningViolation(nested(MAX_JSON_DEPTH)), findHardeningViolation(nested(MAX_JSON_DEPTH + 1))?.kind, findHardeningViolation(nested(100_000))?.kind]).toEqual([null, 'MAX_DEPTH', 'MAX_DEPTH']);
  });
});

describe('migración 2.0.0 → 3.0.0 (STATE-BACKUP-001, REQ-BACKUP2-002)', () => {
  it('[REQ-BACKUP2-002][STATE-BACKUP-001] el sobre 2.0.0 canónico migra a un candidato que cumple la validación final 3.0.0', () => {
    expect(validateBackupEnvelopeV2Legacy(legacyV2)).toBe(true);
    const candidate = migrateEnvelopeV2ToV3(legacyV2);
    expect([validateBackupEnvelopeV3(candidate), 'exportedByUserId' in candidate, candidate.pets.some((p) => 'ownerUserId' in p)]).toEqual([true, false, false]);
  });

  it('[REQ-BACKUP2-002] DOG → CANINE y CAT → FELINE; campos nuevos neutros; category derivada; no muta la entrada', () => {
    const before = JSON.stringify(legacyV2);
    const candidate = migrateEnvelopeV2ToV3(legacyV2);
    const species = [...new Set(candidate.pets.map((p) => p['species']))].sort();
    const pet = candidate.pets[0]!;
    const vaccine = candidate.records['vaccinations']![0]!;
    const deworming = candidate.records['dewormings']![0]!;
    expect([
      species,
      [pet['speciesOther'], pet['birthDateIsEstimate'], pet['neutered'], pet['microchipId']],
      [vaccine['category'], vaccine['veterinarianName'], vaccine['veterinarianLicense']],
      [deworming['category'], deworming['batchOrClinic'], deworming['veterinarianName'], deworming['veterinarianLicense']],
      JSON.stringify(legacyV2) === before,
    ]).toEqual([['CANINE', 'FELINE'], [null, false, null, null], ['VACCINE', null, null], ['DEWORMING', null, null, null], true]);
  });
});
