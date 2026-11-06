/**
 * Pure domain invariants for the 6 historical clinical & biometric modules:
 * 1. Weight Control (REQ-REC-001, INV-REC-002)
 * 2. Body Measurements (REQ-REC-002, INV-REC-003)
 * 3. Vaccinations (REQ-REC-003, INV-REC-004)
 * 4. Dewormings (REQ-REC-004, INV-REC-005)
 * 5. Medical Visits (REQ-REC-005, INV-REC-001, INV-REC-006)
 * 6. Custom Parameters (REQ-REC-006, INV-REC-001, INV-REC-006)
 *
 * @implements REQ-REC-001, REQ-REC-002, REQ-REC-003, REQ-REC-004, REQ-REC-005, REQ-REC-006, INV-REC-001, INV-REC-002, INV-REC-003, INV-REC-004, INV-REC-005, INV-REC-006, ERR-REC-WEIGHT-OUT-OF-RANGE, ERR-REC-MEASUREMENT-OUT-OF-RANGE, ERR-REC-INVALID-BOOSTER-DATE, ERR-REC-INVALID-NEXT-DOSE-DATE, ERR-SCHEMA-VALIDATION-FAILED, INV-ARCH-001, INV-ARCH-004
 */

import {
  DomainError,
  hasMaxTwoDecimals,
  isValidIsoCalendarDate,
  validateBodyMeasurementRecordSchema,
  validateCustomParameterRecordSchema,
  validateDewormingRecordSchema,
  validateMedicalVisitRecordSchema,
  validateVaccinationRecordSchema,
  validateWeightRecordSchema,
  type BodyMeasurementRecord,
  type CustomParameterRecord,
  type DewormingRecord,
  type MedicalVisitRecord,
  type VaccinationRecord,
  type WeightEntryView,
  type WeightRecord,
} from '../../generated/index.ts';
import { validateEventDateWindow } from '../shared/date-utils.ts';
import { sortHistoricalRecords } from '../sorting/deterministic-sorter.ts';

export const MIN_WEIGHT_KG = 0.05;
export const MAX_WEIGHT_KG = 150.0;
export const MIN_MEASUREMENT_CM = 1.0;
export const MAX_MEASUREMENT_CM = 250.0;

/**
 * Validates that a mandatory text field is non-empty after trimming and does not contain
 * leading/trailing whitespace or exceed maxLength.
 *
 * @implements INV-REC-006, ERR-SCHEMA-VALIDATION-FAILED
 */
export function validateNonEmptyTrimmedField(
  value: string,
  fieldName: string,
  maxLength: number
): string {
  const trimmed = value.trim();
  if (trimmed.length < 1 || trimmed.length > maxLength || value !== trimmed) {
    throw new DomainError(
      'ERR-SCHEMA-VALIDATION-FAILED',
      `El campo obligatorio '${fieldName}' no puede estar vacío ni exceder ${maxLength} caracteres.`,
      fieldName
    );
  }
  return trimmed;
}

/**
 * Validates biometric weight value: 0.05 <= weightKg <= 150.00 and max 2 decimal places.
 *
 * @implements REQ-REC-001, INV-REC-002, ERR-REC-WEIGHT-OUT-OF-RANGE
 */
export function validateWeightKgInvariant(weightKg: number): void {
  if (
    typeof weightKg !== 'number' ||
    !Number.isFinite(weightKg) ||
    weightKg < MIN_WEIGHT_KG ||
    weightKg > MAX_WEIGHT_KG ||
    !hasMaxTwoDecimals(weightKg)
  ) {
    throw new DomainError(
      'ERR-REC-WEIGHT-OUT-OF-RANGE',
      `El peso (${String(weightKg)} kg) debe situarse entre ${MIN_WEIGHT_KG} kg y ${MAX_WEIGHT_KG} kg con máximo 2 decimales.`,
      'weightKg'
    );
  }
}

/**
 * Validates biometric body measurement dimensions: each of neckCm, chestCm, backLengthCm, waistCm
 * must satisfy 1.00 <= value <= 250.00 cm with max 2 decimal places.
 *
 * @implements REQ-REC-002, INV-REC-003, ERR-REC-MEASUREMENT-OUT-OF-RANGE
 */
export function validateBodyMeasurementsInvariants(dimensions: {
  readonly neckCm: number;
  readonly chestCm: number;
  readonly backLengthCm: number;
  readonly waistCm: number;
}): void {
  const fields: Array<keyof typeof dimensions> = [
    'neckCm',
    'chestCm',
    'backLengthCm',
    'waistCm',
  ];

  for (const field of fields) {
    const val = dimensions[field];
    if (
      typeof val !== 'number' ||
      !Number.isFinite(val) ||
      val < MIN_MEASUREMENT_CM ||
      val > MAX_MEASUREMENT_CM ||
      !hasMaxTwoDecimals(val)
    ) {
      throw new DomainError(
        'ERR-REC-MEASUREMENT-OUT-OF-RANGE',
        `La medida corporal ${field} (${String(val)} cm) debe situarse entre ${MIN_MEASUREMENT_CM} cm y ${MAX_MEASUREMENT_CM} cm con máximo 2 decimales.`,
        field
      );
    }
  }
}

/**
 * Validates that nextBoosterAt is strictly greater than appliedAt (YYYY-MM-DD lexicographical comparison).
 *
 * @implements REQ-REC-003, INV-REC-004, ERR-REC-INVALID-BOOSTER-DATE
 */
export function validateVaccinationBoosterDate(appliedAt: string, nextBoosterAt: string): void {
  if (!isValidIsoCalendarDate(appliedAt) || !isValidIsoCalendarDate(nextBoosterAt)) {
    throw new DomainError(
      'ERR-SCHEMA-VALIDATION-FAILED',
      'Las fechas appliedAt y nextBoosterAt deben tener formato ISO-8601 YYYY-MM-DD válido.',
      'nextBoosterAt'
    );
  }
  if (nextBoosterAt <= appliedAt) {
    throw new DomainError(
      'ERR-REC-INVALID-BOOSTER-DATE',
      `La fecha de próximo refuerzo (${nextBoosterAt}) debe ser estrictamente posterior a la fecha de aplicación (${appliedAt}).`,
      'nextBoosterAt'
    );
  }
}

/**
 * Validates that nextSuggestedDoseAt is strictly greater than appliedAt (YYYY-MM-DD comparison).
 *
 * @implements REQ-REC-004, INV-REC-005, ERR-REC-INVALID-NEXT-DOSE-DATE
 */
export function validateDewormingNextDoseDate(
  appliedAt: string,
  nextSuggestedDoseAt: string
): void {
  if (!isValidIsoCalendarDate(appliedAt) || !isValidIsoCalendarDate(nextSuggestedDoseAt)) {
    throw new DomainError(
      'ERR-SCHEMA-VALIDATION-FAILED',
      'Las fechas appliedAt y nextSuggestedDoseAt deben tener formato ISO-8601 YYYY-MM-DD válido.',
      'nextSuggestedDoseAt'
    );
  }
  if (nextSuggestedDoseAt <= appliedAt) {
    throw new DomainError(
      'ERR-REC-INVALID-NEXT-DOSE-DATE',
      `La fecha de próxima dosis sugerida (${nextSuggestedDoseAt}) debe ser estrictamente posterior a la fecha de aplicación (${appliedAt}).`,
      'nextSuggestedDoseAt'
    );
  }
}

/**
 * Validates a complete WeightRecord against domain invariants and schema contract.
 *
 * @implements REQ-REC-001, INV-REC-001, INV-REC-002
 */
export function validateWeightRecordDomain(
  record: WeightRecord,
  petBirthDate: string,
  currentDate: string
): WeightRecord {
  validateEventDateWindow(record.recordedAt, petBirthDate, currentDate, 'recordedAt');
  validateWeightKgInvariant(record.weightKg);
  return validateWeightRecordSchema(record);
}

/**
 * Validates a complete BodyMeasurementRecord against domain invariants and schema contract.
 *
 * @implements REQ-REC-002, INV-REC-001, INV-REC-003
 */
export function validateBodyMeasurementRecordDomain(
  record: BodyMeasurementRecord,
  petBirthDate: string,
  currentDate: string
): BodyMeasurementRecord {
  validateEventDateWindow(record.recordedAt, petBirthDate, currentDate, 'recordedAt');
  validateBodyMeasurementsInvariants({
    neckCm: record.neckCm,
    chestCm: record.chestCm,
    backLengthCm: record.backLengthCm,
    waistCm: record.waistCm,
  });
  return validateBodyMeasurementRecordSchema(record);
}

/**
 * Validates a complete VaccinationRecord against domain invariants and schema contract.
 *
 * @implements REQ-REC-003, INV-REC-001, INV-REC-004, INV-REC-006
 */
export function validateVaccinationRecordDomain(
  record: VaccinationRecord,
  petBirthDate: string,
  currentDate: string
): VaccinationRecord {
  validateNonEmptyTrimmedField(record.vaccineName, 'vaccineName', 100);
  validateEventDateWindow(record.appliedAt, petBirthDate, currentDate, 'appliedAt');
  validateVaccinationBoosterDate(record.appliedAt, record.nextBoosterAt);
  return validateVaccinationRecordSchema(record);
}

/**
 * Validates a complete DewormingRecord against domain invariants and schema contract.
 *
 * @implements REQ-REC-004, INV-REC-001, INV-REC-005, INV-REC-006
 */
export function validateDewormingRecordDomain(
  record: DewormingRecord,
  petBirthDate: string,
  currentDate: string
): DewormingRecord {
  validateNonEmptyTrimmedField(record.productBrand, 'productBrand', 100);
  validateEventDateWindow(record.appliedAt, petBirthDate, currentDate, 'appliedAt');
  validateDewormingNextDoseDate(record.appliedAt, record.nextSuggestedDoseAt);
  return validateDewormingRecordSchema(record);
}

/**
 * Validates a complete MedicalVisitRecord against domain invariants and schema contract.
 *
 * @implements REQ-REC-005, INV-REC-001, INV-REC-006
 */
export function validateMedicalVisitRecordDomain(
  record: MedicalVisitRecord,
  petBirthDate: string,
  currentDate: string
): MedicalVisitRecord {
  validateEventDateWindow(record.visitDate, petBirthDate, currentDate, 'visitDate');
  validateNonEmptyTrimmedField(record.reason, 'reason', 200);
  validateNonEmptyTrimmedField(record.diagnosis, 'diagnosis', 500);
  validateNonEmptyTrimmedField(record.treatment, 'treatment', 500);
  validateNonEmptyTrimmedField(record.clinicOrVet, 'clinicOrVet', 120);
  return validateMedicalVisitRecordSchema(record);
}

/**
 * Validates a complete CustomParameterRecord against domain invariants and schema contract.
 *
 * @implements REQ-REC-006, INV-REC-001, INV-REC-006
 */
export function validateCustomParameterRecordDomain(
  record: CustomParameterRecord,
  petBirthDate: string,
  currentDate: string
): CustomParameterRecord {
  validateEventDateWindow(record.recordedAt, petBirthDate, currentDate, 'recordedAt');
  validateNonEmptyTrimmedField(record.title, 'title', 120);
  validateNonEmptyTrimmedField(record.description, 'description', 1000);
  return validateCustomParameterRecordSchema(record);
}

/**
 * Computes the deterministic weight evolution series sorted by INV-SORT-001 (newest first),
 * where each record's deltaKg is the exact 2-decimal difference relative to the immediately
 * preceding chronological measurement (or null for the earliest measurement).
 *
 * @implements REQ-REC-001, INV-REC-002, INV-SORT-001
 */
export function computeWeightEvolutionSeries(records: readonly WeightRecord[]): WeightEntryView[] {
  const sortedDesc = sortHistoricalRecords(records);

  return sortedDesc.map((current, index) => {
    const previousChronological = sortedDesc[index + 1];
    if (!previousChronological) {
      return {
        ...current,
        deltaKg: null,
      };
    }
    const rawDelta = current.weightKg - previousChronological.weightKg;
    const roundedDelta = Math.round(rawDelta * 100) / 100;
    return {
      ...current,
      deltaKg: Object.is(roundedDelta, -0) ? 0 : roundedDelta,
    };
  });
}
