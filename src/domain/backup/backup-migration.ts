/**
 * Transformación pura del sobre de respaldo v1.0.0 al v2.0.0 (, estado MIGRATING_LEGACY_ENVELOPE de
 * STATE-BACKUP-001, contracts/state-machines/backup-import.machine.json):
 * - ownerUserId de cada mascota y exportedByUserId = usuario autenticado;
 * - updatedAt = createdAt;
 * - exportedAt y todos los createdAt se normalizan a UTC canónico YYYY-MM-DDTHH:mm:ss.sssZ (INV-SORT-001).
 * Ningún otro campo cambia. El resultado es un candidato: la capa de aplicación lo revalida como v2 y, si no cumple,
 * el evento es MIGRATION_SCHEMA_INVALID (p. ej. un nombre con espacios extremos o un UUID que no es v4 en minúsculas,
 * que el formato v1 admitía).
 * Sin reloj ni entropía: solo aritmética de calendario (INV-ARCH-001, INV-ARCH-002).
 *
 * @implements STATE-BACKUP-001, REQ-BACKUP-002, INV-SORT-001, INV-ARCH-001, INV-ARCH-004
 */

import type { BackupEnvelopeV1Legacy, BackupEnvelopeV2Legacy, LegacyPetProfileV2 } from '../../generated/index.ts';
import { fromEpochMillis, MS_PER_DAY, MS_PER_MINUTE } from '../auth/utc-timestamp.ts';
import { isIsoCalendarDate, toEpochDays } from '../shared/date-utils.ts';

/**
 * Formas de date-time que admite el validador v1 (ajv-formats): separador T, t o espacio; fracción de cualquier
 * longitud; zona Z, z, ±HH:MM, ±HHMM o ±HH.
 */
const RFC3339_DATE_TIME = /^(\d{4}-\d{2}-\d{2})[Tt ](\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?(?:[Zz]|([+-])(\d{2})(?::?(\d{2}))?)$/;

/**
 * Normaliza un date-time RFC 3339 a UTC canónico con milisegundos.
 * - La fracción se trunca a milisegundos (`.123456` → `.123`) y se completa con ceros (`.5` → `.500`).
 * - El desfase se resta: `2026-01-01T05:00:00-05:00` → `2026-01-01T10:00:00.000Z`.
 * - El segundo intercalar que admite el formato (`23:59:60` en UTC) se cuenta como un segundo más:
 *   `2026-12-31T23:59:60Z` → `2027-01-01T00:00:00.000Z`.
 * Un valor que no tiene esa forma se devuelve sin cambios, para que la revalidación v2 lo rechace.
 *
 * @implements STATE-BACKUP-001, INV-SORT-001
 */
export function normalizeToCanonicalUtc(value: string): string {
  const match = RFC3339_DATE_TIME.exec(value);
  const calendarDate = match?.[1];
  if (match === null || calendarDate === undefined || !isIsoCalendarDate(calendarDate)) return value;
  const [, date, hours, minutes, seconds, fraction, sign, offsetHours, offsetMinutes] = match as unknown as [
    string,
    string,
    string,
    string,
    string,
    string | undefined,
    string | undefined,
    string | undefined,
    string | undefined,
  ];
  const millis = Number((fraction ?? '').slice(0, 3).padEnd(3, '0'));
  const localMillis = toEpochDays(date) * MS_PER_DAY + ((Number(hours) * 60 + Number(minutes)) * 60 + Number(seconds)) * 1000 + millis;
  const offsetMillis =
    sign === undefined ? 0 : (sign === '-' ? -1 : 1) * (Number(offsetHours) * 60 + Number(offsetMinutes ?? 0)) * MS_PER_MINUTE;
  return fromEpochMillis(localMillis - offsetMillis);
}

type LegacyRecords = BackupEnvelopeV1Legacy['records'];
type V2Records = BackupEnvelopeV2Legacy['records'];

function migrateRecords<K extends keyof LegacyRecords>(records: LegacyRecords[K]): V2Records[K] {
  return records.map((record) => ({ ...record, createdAt: normalizeToCanonicalUtc(record.createdAt) })) as V2Records[K];
}

/**
 * Sobre v1 → candidato v2 para el usuario autenticado. No muta la entrada.
 *
 * T233 PENDIENTE: la migración 1.0.0 a 3.0.0 (DOG a CANINE, campos nuevos) sustituye a este paso; el resultado sigue en la forma 2.0.0 heredada.
 *
 * @implements STATE-BACKUP-001, REQ-BACKUP-002, INV-SORT-001
 */
export function migrateLegacyEnvelope(legacy: BackupEnvelopeV1Legacy, userId: string): BackupEnvelopeV2Legacy {
  const pets = legacy.pets.map((pet): LegacyPetProfileV2 => {
    const createdAt = normalizeToCanonicalUtc(pet.createdAt);
    return { ...pet, ownerUserId: userId, createdAt, updatedAt: createdAt };
  });
  return {
    schemaVersion: '2.0.0',
    exportedAt: normalizeToCanonicalUtc(legacy.exportedAt),
    exportedByUserId: userId,
    pets,
    records: {
      weights: migrateRecords<'weights'>(legacy.records.weights),
      bodyMeasurements: migrateRecords<'bodyMeasurements'>(legacy.records.bodyMeasurements),
      vaccinations: migrateRecords<'vaccinations'>(legacy.records.vaccinations),
      dewormings: migrateRecords<'dewormings'>(legacy.records.dewormings),
      medicalVisits: migrateRecords<'medicalVisits'>(legacy.records.medicalVisits),
      customParameters: migrateRecords<'customParameters'>(legacy.records.customParameters),
    },
  };
}
