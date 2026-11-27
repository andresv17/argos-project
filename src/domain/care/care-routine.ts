/**
 * Rutinas de cuidado (Feature 012, Bloque C): validación de dosis y unidades, tope por mascota, versionado y `expectedVersion`. Funciones puras.
 * Cambiar dosis, unidad u horarios inserta una fila nueva (misma serie) y cierra la anterior; el resto edita en el sitio.
 *
 * @implements REQ-CAR12-001, REQ-CAR12-002, SC-012-025, SC-012-026, SC-012-037, SC-012-088, ERR-CAR12-ROUTINE-LIMIT, ERR-CAR12-ROUTINE-STALE, ERR-SCHEMA-VALIDATION-FAILED
 */
import { DomainError } from '../../generated/v38/index.ts';
import { isIsoCalendarDate } from '../shared/date-utils.ts';
import { CARE_DOSE_MAX, MAX_ROUTINES_PER_PET, MAX_ROUTINE_ROWS_PER_PET } from '../platform/feature-012-limits.ts';

export const ROUTINE_KINDS = ['MEDICATION', 'MEAL', 'WALK', 'OTHER'] as const;
export type RoutineKind = (typeof ROUTINE_KINDS)[number];
/** Catálogo estrictamente cerrado (REQ-CAR12-001 / D12-11): `UNIT` e `IU` fueron retiradas (schema 0.1.3). */
export const DOSE_UNITS = ['MG', 'MCG', 'ML', 'TABLET', 'DROP'] as const;
export type DoseUnit = (typeof DOSE_UNITS)[number];

export const SPECIES_GROUPS = ['CANINE_FELINE', 'OTHER_SPECIES'] as const;
export type CareSpeciesGroup = (typeof SPECIES_GROUPS)[number];

/**
 * Umbral por grupo de especie (`DOSE_CONFIRM_THRESHOLDS`, care-routine.schema.json 0.1.2): por encima se exige `confirmHighDose = true` (guarda anti-tecleo).
 * OTHER_SPECIES no tiene guarda numérica (cifras pendientes de veterinario humano, DEUDA-012-VALIDACION-VET-UMBRALES).
 */
export const DOSE_CONFIRM_THRESHOLDS: Readonly<Record<CareSpeciesGroup, Readonly<Partial<Record<DoseUnit, number>>>>> = {
  CANINE_FELINE: { MG: 500, MCG: 500, ML: 20, TABLET: 4, DROP: 10 },
  OTHER_SPECIES: {},
};

export interface ValidatedCareRoutine {
  readonly kind: RoutineKind;
  readonly title: string;
  readonly instructions: string | null;
  readonly doseAmount: number | null;
  readonly doseUnit: DoseUnit | null;
  readonly timesOfDay: readonly string[];
  readonly daysOfWeek: readonly number[];
  readonly startDate: string;
  readonly endDate: string | null;
  readonly ongoing: boolean;
}

export interface CareRoutineRow extends ValidatedCareRoutine {
  readonly id: string;
  readonly seriesId: string;
  readonly petId: string;
  readonly active: boolean;
  readonly effectiveFrom: string;
  readonly effectiveTo: string | null;
  readonly supersedesRoutineId: string | null;
  readonly version: number;
}

const invalid = (field: string, detail?: string): DomainError => new DomainError('ERR-SCHEMA-VALIDATION-FAILED', detail, field);
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const isDate = (v: unknown): v is string => typeof v === 'string' && isIsoCalendarDate(v);
const absent = (v: unknown): boolean => v === undefined || v === null;
const cpLen = (s: string): number => [...s].length;
const decimals3 = (n: number): boolean => Math.abs(n * 1000 - Math.round(n * 1000)) < 1e-6;

function validateDose(amount: unknown, unit: unknown, confirm: boolean, speciesGroup: CareSpeciesGroup): { amount: number; unit: DoseUnit } {
  if (typeof unit !== 'string' || !(DOSE_UNITS as readonly string[]).includes(unit)) throw invalid('doseUnit');
  if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0 || amount > CARE_DOSE_MAX) throw invalid('doseAmount');
  const u = unit as DoseUnit;
  if (u === 'TABLET') {
    if (amount < 0.25 || Math.abs(amount * 4 - Math.round(amount * 4)) > 1e-9) throw invalid('doseAmount');
  } else if (u === 'DROP') {
    if (!Number.isInteger(amount)) throw invalid('doseAmount');
  } else if (!decimals3(amount)) throw invalid('doseAmount');
  const threshold = DOSE_CONFIRM_THRESHOLDS[speciesGroup][u];
  if (threshold !== undefined && amount > threshold && !confirm) throw invalid('confirmHighDose');
  return { amount, unit: u };
}

/** Valida y normaliza una rutina (alta o fusión de edición). `confirmHighDose` solo es guarda de tecleo: no se persiste. */
export function validateCareRoutine(input: Record<string, unknown>, speciesGroup: CareSpeciesGroup): ValidatedCareRoutine {
  const kind = input['kind'];
  if (typeof kind !== 'string' || !(ROUTINE_KINDS as readonly string[]).includes(kind)) throw invalid('kind');
  const title = input['title'];
  if (typeof title !== 'string' || cpLen(title.trim()) < 1 || cpLen(title) > 60) throw invalid('title');
  const instructions = input['instructions'];
  if (!absent(instructions) && (typeof instructions !== 'string' || cpLen(instructions) > 300)) throw invalid('instructions');
  const times = input['timesOfDay'];
  if (!Array.isArray(times) || times.length < 1 || times.length > 6 || !times.every((t) => typeof t === 'string' && TIME.test(t)) || new Set(times).size !== times.length) throw invalid('timesOfDay');
  const days = input['daysOfWeek'];
  if (!Array.isArray(days) || days.length < 1 || days.length > 7 || !days.every((d) => Number.isInteger(d) && d >= 1 && d <= 7) || new Set(days).size !== days.length) throw invalid('daysOfWeek');
  const startDate = input['startDate'];
  if (!isDate(startDate)) throw invalid('startDate');
  const rawEnd = input['endDate'];
  if (!absent(rawEnd) && !isDate(rawEnd)) throw invalid('endDate');
  const endDate = absent(rawEnd) ? null : (rawEnd as string);
  if (endDate !== null && endDate < startDate) throw invalid('endDate');
  const ongoing = input['ongoing'] === true;
  if (!absent(input['ongoing']) && typeof input['ongoing'] !== 'boolean') throw invalid('ongoing');
  if (ongoing && endDate !== null) throw invalid('ongoing');

  let doseAmount: number | null = null;
  let doseUnit: DoseUnit | null = null;
  if (kind === 'MEDICATION') {
    if (endDate === null && !ongoing) throw invalid('endDate');
    const dose = validateDose(input['doseAmount'], input['doseUnit'], input['confirmHighDose'] === true, speciesGroup);
    doseAmount = dose.amount;
    doseUnit = dose.unit;
  } else if (!absent(input['doseAmount']) || !absent(input['doseUnit'])) {
    throw invalid('doseAmount');
  }
  return {
    kind: kind as RoutineKind,
    title,
    instructions: absent(instructions) ? null : (instructions as string),
    doseAmount,
    doseUnit,
    timesOfDay: [...(times as string[])].sort(),
    daysOfWeek: [...(days as number[])].sort((a, b) => a - b),
    startDate,
    endDate,
    ongoing,
  };
}

/** Tope de 20 activas (las versiones sustituidas no cuentan) y 100 filas totales por mascota. */
export function assertRoutineCapacity(input: { activeCount: number; totalRows: number; replacing: boolean }): void {
  if (input.totalRows >= MAX_ROUTINE_ROWS_PER_PET) throw new DomainError('ERR-CAR12-ROUTINE-LIMIT');
  if (!input.replacing && input.activeCount >= MAX_ROUTINES_PER_PET) throw new DomainError('ERR-CAR12-ROUTINE-LIMIT');
}

/** `expectedVersion` distinta, fila sustituida o inactiva: `ERR-CAR12-ROUTINE-STALE`. */
export function assertExpectedVersion(current: Pick<CareRoutineRow, 'version' | 'active' | 'effectiveTo'>, expectedVersion: number): void {
  if (!current.active || current.effectiveTo !== null || current.version !== expectedVersion) throw new DomainError('ERR-CAR12-ROUTINE-STALE');
}

export interface RoutineUpdatePlan {
  readonly versioned: boolean;
  readonly next: CareRoutineRow;
  readonly closed: CareRoutineRow | null;
}

const sameList = (a: readonly unknown[], b: readonly unknown[]): boolean => a.length === b.length && a.every((v, i) => v === b[i]);

/** Plan de edición: versiona si cambian dosis, unidad u horarios; si no, edita en el sitio. Pura (el id nuevo lo inyecta el caso de uso en `newId`; el dominio no genera entropía). */
export function planRoutineUpdate(current: CareRoutineRow, patch: Record<string, unknown>, now: string, speciesGroup: CareSpeciesGroup, newId: string): RoutineUpdatePlan {
  const merged: Record<string, unknown> = { ...current };
  for (const [k, v] of Object.entries(patch)) if (v !== undefined) merged[k] = v;
  if ('endDate' in patch && patch['endDate'] !== undefined && patch['ongoing'] === undefined) merged['ongoing'] = false;
  if (patch['ongoing'] === true && patch['endDate'] === undefined) merged['endDate'] = null;
  const doseChanged = merged['doseAmount'] !== current.doseAmount || merged['doseUnit'] !== current.doseUnit;
  // Una dosis ya aceptada no pide confirmar de nuevo al editar otros campos; una dosis nueva sí.
  merged['confirmHighDose'] = doseChanged ? patch['confirmHighDose'] === true : true;
  const valid = validateCareRoutine(merged, speciesGroup);
  const versioned = doseChanged || !sameList(valid.timesOfDay, current.timesOfDay);
  if (!versioned) {
    return { versioned: false, closed: null, next: { ...current, ...valid, version: current.version + 1 } };
  }
  const closed: CareRoutineRow = { ...current, active: false, effectiveTo: now };
  const next: CareRoutineRow = { ...current, ...valid, id: newId, supersedesRoutineId: current.id, effectiveFrom: now, effectiveTo: null, active: true, version: 1 };
  return { versioned: true, next, closed };
}
