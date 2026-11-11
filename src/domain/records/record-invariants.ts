/**
 * Invariantes puras de los 6 módulos de registros clínicos y biométricos (v2).
 * - REQ-REC-001 Peso, REQ-REC-002 Medidas, REQ-REC-003 Vacunación, REQ-REC-004 Desparasitación,
 *   REQ-REC-005 Citas y controles, REQ-REC-006 Parámetros adicionales.
 * - Precedencia: primero el esquema generado; un fallo sobre el valor de un campo con
 *   x-sdd-error devuelve su código (weightKg → ERR-REC-WEIGHT-OUT-OF-RANGE; medidas → ERR-REC-MEASUREMENT-OUT-OF-RANGE);
 *   un campo ausente, una propiedad no autorizada o cualquier otro fallo, ERR-SCHEMA-VALIDATION-FAILED (incluye
 *   INV-REC-006 vía NonEmptyTrimmedString). Después el dominio: máx. 2 decimales exactos (INV-REC-002/003),
 *   ventana temporal (INV-REC-001, en date-utils) y fecha siguiente estrictamente posterior (INV-REC-004/005).
 * - deltaKg y deltaPercent se calculan sobre centésimas enteras, sin Math.round sobre flotantes (EDGE-034, EDGE-035).
 *
 * @implements REQ-REC-001, REQ-REC-002, REQ-REC-003, REQ-REC-004, REQ-REC-005, REQ-REC-006, INV-REC-002, INV-REC-003, INV-REC-004, INV-REC-005, INV-REC-006, ERR-REC-DATE-BEFORE-BIRTH, ERR-REC-FUTURE-EVENT-DATE, ERR-REC-WEIGHT-OUT-OF-RANGE, ERR-REC-MEASUREMENT-OUT-OF-RANGE, ERR-REC-INVALID-BOOSTER-DATE, ERR-REC-INVALID-NEXT-DOSE-DATE, INV-ARCH-001, INV-ARCH-004
 */

import {
  DomainError,
  resolveFieldErrorCode,
  validateBodyMeasurementRecord,
  validateCreateBodyMeasurementInput,
  validateCreateCustomParameterInput,
  validateCreateDewormingInput,
  validateCreateMedicalVisitInput,
  validateCreateVaccinationInput,
  validateCreateWeightInput,
  validateCustomParameterRecord,
  validateDewormingRecord,
  validateMedicalVisitRecord,
  validateVaccinationRecord,
  validateWeightRecord,
  type BackupEnvelopeV3,
  type BodyMeasurementRecord,
  type components,
  type CreateBodyMeasurementInput,
  type CreateCustomParameterInput,
  type CreateDewormingInput,
  type CreateMedicalVisitInput,
  type CreateVaccinationInput,
  type CreateWeightInput,
  type CustomParameterRecord,
  type DewormingRecord,
  type ErrorCode,
  type MedicalVisitRecord,
  type VaccinationRecord,
  type WeightRecord,
} from '../../generated/index.ts';
import { validateEventDateWindow } from '../shared/date-utils.ts';
import { sortHistoricalRecords } from '../sorting/deterministic-sorter.ts';

export type WeightEntryView = components['schemas']['WeightEntryView'];
type RecordCollections = BackupEnvelopeV3['records'];
/** Las 6 colecciones del sobre v3: weights, bodyMeasurements, vaccinations, dewormings, medicalVisits, customParameters. */
export type RecordModule = keyof RecordCollections;
export type RecordOf<M extends RecordModule> = RecordCollections[M][number];

export interface RecordInputs {
  weights: CreateWeightInput;
  bodyMeasurements: CreateBodyMeasurementInput;
  vaccinations: CreateVaccinationInput;
  dewormings: CreateDewormingInput;
  medicalVisits: CreateMedicalVisitInput;
  customParameters: CreateCustomParameterInput;
}

interface ValidatorWithErrors {
  (data: unknown): boolean;
  errors?: ReadonlyArray<{ instancePath: string; message?: string; params: Record<string, unknown> }> | null;
}

interface SchemaRef {
  readonly name: string;
  readonly validate: ValidatorWithErrors;
}

export interface RecordModuleRules {
  readonly record: SchemaRef;
  readonly input: SchemaRef;
  /** Fecha del evento sujeta a INV-REC-001. */
  readonly eventDateField: string;
  /** Campos numéricos con máx. 2 decimales y el código de su invariante (INV-REC-002/003). */
  readonly decimalFields: readonly string[];
  readonly decimalError: ErrorCode | null;
  /** Fecha que debe ser estrictamente posterior a eventDateField y su código (INV-REC-004/005). */
  readonly nextDate: { readonly field: string; readonly error: ErrorCode } | null;
}

const ref = (name: string, validate: unknown): SchemaRef => ({ name, validate: validate as ValidatorWithErrors });
const MEASUREMENT_FIELDS = ['neckCm', 'chestCm', 'backLengthCm', 'waistCm'] as const;

/** Reglas por módulo, leídas de medical-records.schema.json y de la spec. */
export const RECORD_MODULES: Readonly<Record<RecordModule, RecordModuleRules>> = {
  weights: {
    record: ref('WeightRecord', validateWeightRecord),
    input: ref('CreateWeightInput', validateCreateWeightInput),
    eventDateField: 'recordedAt',
    decimalFields: ['weightKg'],
    decimalError: 'ERR-REC-WEIGHT-OUT-OF-RANGE',
    nextDate: null,
  },
  bodyMeasurements: {
    record: ref('BodyMeasurementRecord', validateBodyMeasurementRecord),
    input: ref('CreateBodyMeasurementInput', validateCreateBodyMeasurementInput),
    eventDateField: 'recordedAt',
    decimalFields: MEASUREMENT_FIELDS,
    decimalError: 'ERR-REC-MEASUREMENT-OUT-OF-RANGE',
    nextDate: null,
  },
  vaccinations: {
    record: ref('VaccinationRecord', validateVaccinationRecord),
    input: ref('CreateVaccinationInput', validateCreateVaccinationInput),
    eventDateField: 'appliedAt',
    decimalFields: [],
    decimalError: null,
    nextDate: { field: 'nextBoosterAt', error: 'ERR-REC-INVALID-BOOSTER-DATE' },
  },
  dewormings: {
    record: ref('DewormingRecord', validateDewormingRecord),
    input: ref('CreateDewormingInput', validateCreateDewormingInput),
    eventDateField: 'appliedAt',
    decimalFields: [],
    decimalError: null,
    nextDate: { field: 'nextSuggestedDoseAt', error: 'ERR-REC-INVALID-NEXT-DOSE-DATE' },
  },
  medicalVisits: {
    record: ref('MedicalVisitRecord', validateMedicalVisitRecord),
    input: ref('CreateMedicalVisitInput', validateCreateMedicalVisitInput),
    eventDateField: 'visitDate',
    decimalFields: [],
    decimalError: null,
    nextDate: null,
  },
  customParameters: {
    record: ref('CustomParameterRecord', validateCustomParameterRecord),
    input: ref('CreateCustomParameterInput', validateCreateCustomParameterInput),
    eventDateField: 'recordedAt',
    decimalFields: [],
    decimalError: null,
    nextDate: null,
  },
};

/**
 * Regla 4 de la: el código anotado solo se aplica a fallos sobre el valor del campo anotado.
 * Ajv siempre llena `errors` cuando la validación falla.
 * @implements INV-REC-002, INV-REC-003, INV-REC-006, ERR-REC-WEIGHT-OUT-OF-RANGE, ERR-REC-MEASUREMENT-OUT-OF-RANGE
 */
function assertSchema(schema: SchemaRef, value: unknown): void {
  if (schema.validate(value)) return;
  const error = schema.validate.errors![0]!;
  const named = error.params['missingProperty'] ?? error.params['additionalProperty'];
  if (typeof named === 'string') {
    throw new DomainError('ERR-SCHEMA-VALIDATION-FAILED', `${schema.name}: ${named} ${String(error.message)}.`, named);
  }
  const field = error.instancePath.split('/')[1] ?? null;
  const annotated = resolveFieldErrorCode(schema.name, error.instancePath);
  if (annotated !== undefined) {
    throw new DomainError(annotated, undefined, field);
  }
  throw new DomainError('ERR-SCHEMA-VALIDATION-FAILED', `${schema.name}: ${field ?? '(raíz)'} ${String(error.message)}.`, field);
}

/**
 * Convierte un número con máx. 2 decimales a centésimas enteras a partir de su representación decimal
 * (toFixed), sin multiplicar flotantes ni usar Math.round (EDGE-034).
 * @implements REQ-REC-001, INV-REC-002
 */
export function toHundredths(value: number): number {
  return Number(value.toFixed(2).replace('.', ''));
}

/**
 * Máx. 2 decimales exactos: el valor coincide con su redondeo a centésimas. El esquema generado usa
 * multipleOfPrecision 2, que tolera restos menores de 0.01 centésimas (p. ej. 32.85001), así que el dominio lo cierra.
 * @implements INV-REC-002, INV-REC-003
 */
export function hasAtMostTwoDecimals(value: number): boolean {
  return Number(value.toFixed(2)) === value;
}

/**
 * Reglas de dominio de un registro o entrada ya válidos según su esquema.
 * @implements INV-REC-002, INV-REC-003, INV-REC-004, INV-REC-005, ERR-REC-DATE-BEFORE-BIRTH, ERR-REC-FUTURE-EVENT-DATE, ERR-REC-INVALID-BOOSTER-DATE, ERR-REC-INVALID-NEXT-DOSE-DATE
 */
function assertDomainRules(rules: RecordModuleRules, value: Record<string, unknown>, petBirthDate: string, currentDate: string): void {
  for (const field of rules.decimalFields) {
    if (!hasAtMostTwoDecimals(value[field] as number)) {
      throw new DomainError(rules.decimalError!, `${field} admite como máximo 2 decimales.`, field);
    }
  }
  const eventDate = value[rules.eventDateField] as string;
  validateEventDateWindow(eventDate, petBirthDate, currentDate, rules.eventDateField);
  if (rules.nextDate !== null) {
    const { field, error } = rules.nextDate;
    const nextDate = value[field] as string;
    if (nextDate <= eventDate) {
      throw new DomainError(error, `${field} (${nextDate}) debe ser estrictamente posterior a ${rules.eventDateField} (${eventDate}).`, field);
    }
  }
}

/**
 * Valida la entrada de alta de un módulo (petId llega por la ruta; id y createdAt los asigna el servidor).
 * @implements REQ-REC-001, REQ-REC-002, REQ-REC-003, REQ-REC-004, REQ-REC-005, REQ-REC-006
 */
export function validateRecordInput<M extends RecordModule>(
  module: M,
  input: unknown,
  petBirthDate: string,
  currentDate: string,
): RecordInputs[M] {
  const rules = RECORD_MODULES[module];
  assertSchema(rules.input, input);
  assertDomainRules(rules, input as Record<string, unknown>, petBirthDate, currentDate);
  return input as RecordInputs[M];
}

/**
 * Valida un registro completo de un módulo (alta ya construida, o importación de respaldo).
 * @implements REQ-REC-001, REQ-REC-002, REQ-REC-003, REQ-REC-004, REQ-REC-005, REQ-REC-006
 */
export function validateRecord<M extends RecordModule>(
  module: M,
  record: unknown,
  petBirthDate: string,
  currentDate: string,
): RecordOf<M> {
  const rules = RECORD_MODULES[module];
  assertSchema(rules.record, record);
  assertDomainRules(rules, record as Record<string, unknown>, petBirthDate, currentDate);
  return record as RecordOf<M>;
}

/** @implements REQ-REC-001, INV-REC-002 */
export function validateWeightRecordDomain(record: WeightRecord, petBirthDate: string, currentDate: string): WeightRecord {
  return validateRecord('weights', record, petBirthDate, currentDate);
}

/** @implements REQ-REC-002, INV-REC-003 */
export function validateBodyMeasurementRecordDomain(
  record: BodyMeasurementRecord,
  petBirthDate: string,
  currentDate: string,
): BodyMeasurementRecord {
  return validateRecord('bodyMeasurements', record, petBirthDate, currentDate);
}

/** @implements REQ-REC-003, INV-REC-004 */
export function validateVaccinationRecordDomain(
  record: VaccinationRecord,
  petBirthDate: string,
  currentDate: string,
): VaccinationRecord {
  return validateRecord('vaccinations', record, petBirthDate, currentDate);
}

/** @implements REQ-REC-004, INV-REC-005 */
export function validateDewormingRecordDomain(record: DewormingRecord, petBirthDate: string, currentDate: string): DewormingRecord {
  return validateRecord('dewormings', record, petBirthDate, currentDate);
}

/** @implements REQ-REC-005, INV-REC-006 */
export function validateMedicalVisitRecordDomain(
  record: MedicalVisitRecord,
  petBirthDate: string,
  currentDate: string,
): MedicalVisitRecord {
  return validateRecord('medicalVisits', record, petBirthDate, currentDate);
}

/** @implements REQ-REC-006, INV-REC-006 */
export function validateCustomParameterRecordDomain(
  record: CustomParameterRecord,
  petBirthDate: string,
  currentDate: string,
): CustomParameterRecord {
  return validateRecord('customParameters', record, petBirthDate, currentDate);
}

/**
 * INV-REC-006 para textos obligatorios fuera de los esquemas de registros (lo usa la capa de aplicación v1 hasta):
 * trim().length >= 1, sin espacios extremos y como máximo maxLength caracteres.
 * @implements INV-REC-006
 */
export function validateNonEmptyTrimmedField(value: string, fieldName: string, maxLength: number): string {
  if (value.length < 1 || value.length > maxLength || value !== value.trim()) {
    throw new DomainError(
      'ERR-SCHEMA-VALIDATION-FAILED',
      `El campo obligatorio '${fieldName}' no puede estar vacío, tener espacios extremos ni exceder ${maxLength} caracteres.`,
      fieldName,
    );
  }
  return value;
}

/**
 * Variación porcentual en centésimas de punto, redondeada half-away-from-zero sobre enteros (EDGE-035):
 * |Δ| · 10000 / anterior, con el resto comparado contra la mitad del divisor; el signo se aplica al final.
 * Con anterior <= 15000 y |Δ| >= 1, el resultado redondeado nunca es 0 salvo Δ = 0, donde Math.sign da +0.
 * @implements REQ-REC-001
 */
export function deltaPercentFromHundredths(previous: number, current: number): number {
  const delta = current - previous;
  const scaled = Math.abs(delta) * 10000;
  const quotient = Math.floor(scaled / previous);
  const rounded = 2 * (scaled - quotient * previous) >= previous ? quotient + 1 : quotient;
  return (Math.sign(delta) * rounded) / 100;
}

/**
 * REQ-REC-001: serie de evolución en el orden de INV-SORT-001 (más reciente primero). Cada entrada compara con la
 * medición inmediata anterior en ese orden; la primera medición cronológica lleva deltaKg y deltaPercent null.
 * @implements REQ-REC-001, INV-REC-002
 */
// T226 PENDIENTE: la 002 retira deltaPercent del contrato y calcula deltaKg en la unidad entera de la especie; se conserva el cálculo 001.
export function computeWeightEvolutionSeries(records: readonly WeightRecord[]): Array<WeightEntryView & { deltaPercent: number | null }> {
  const sorted = sortHistoricalRecords(records);
  return sorted.map((record, index) => {
    const previous = sorted[index + 1];
    if (previous === undefined) {
      return { record, deltaKg: null, deltaPercent: null };
    }
    const previousHundredths = toHundredths(previous.weightKg);
    const currentHundredths = toHundredths(record.weightKg);
    return {
      record,
      deltaKg: (currentHundredths - previousHundredths) / 100,
      deltaPercent: deltaPercentFromHundredths(previousHundredths, currentHundredths),
    };
  });
}
