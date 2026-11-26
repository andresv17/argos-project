/**
 * `ClinicalSummary` (feature 005, ADR-005-04): read-model puro, determinista y de esquema cerrado (`clinical-summary.schema.json`, versión 1.0.0).
 * - Se construye por ALLOW-LIST, campo a campo (nunca copiando objetos y quitando campos): un campo nuevo del dominio no se filtra (INV-005-004).
 * - Sin álbum (`PHOTO`), avatar, correo, `username`, ids de usuario u hogar, claves de objeto, nombres de archivo ni licencias de terceros.
 * - Listas por clave total (fecha DESC, id interno DESC; el id no se emite); mascotas por (nombre ASC, id ASC). Mismos datos y mismo `generatedAt` dan el
 *   mismo JSON byte a byte aunque las filas lleguen en otro orden (REQ-SUM-002).
 * - Fechas de calendario sin conversión (`YYYY-MM-DD`); UTC solo en `generatedAt`; la edad se calcula con la fecha UTC de `generatedAt` (PN-10, EDGE-005-29).
 * - Sin interpretación automática: `automaticInterpretation = 'NONE'`, `dataProvenance = 'CAREGIVER_REPORTED_NOT_VERIFIED'` (REQ-SUM-007, REQ-SUM-008).
 * - Microchip solo con `includeMicrochip` (AUSENTE, no null, sin la casilla); archivos solo con `includeClinicalFiles`.
 *
 * - Entrada para IA en Fase 5 (REQ-SUM-006): este contrato (versión `CLINICAL_SUMMARY_VERSION`, esquema cerrado y sin datos de contacto) es la única entrada prevista
 *   para reportes de IA; en 005 no se integra ningún proveedor ni se añade dependencia (`package.json` no cambia, SC-005-033) y cualquier envío a terceros es Nivel 2 con `/rama`.
 *
 * @implements REQ-FAL7-008, REQ-FAL7-007, REQ-SUM-001, REQ-SUM-002, REQ-SUM-003, REQ-SUM-006, REQ-SUM-007, REQ-SUM-008, INV-005-004, SC-005-027, SC-005-028, SC-005-029, SC-005-030, SC-005-033, SC-005-043, SC-005-044
 */
import type { ClinicalPetSummary, ClinicalSummary } from '../../generated/v33/index.ts';
import type { PetProfile, PetRecordCollections } from '../pet/pet-invariants.ts';
import { withSymptomFields } from '../records/record-invariants.ts';
import { computedAgeOf } from '../pet/pet-invariants.ts';

export const CLINICAL_SUMMARY_VERSION = '1.0.0';

/** Archivo clínico (`kind FILE`) tal como lo entrega el repositorio: solo metadatos, nunca el nombre original ni la clave. */
export interface SummaryClinicalFileInput {
  readonly id: string;
  readonly mime: ClinicalPetSummary['clinicalFiles'][number]['mime'];
  readonly sizeBytes: number;
  readonly createdAt: string;
}

export interface SummaryPetInput {
  readonly pet: PetProfile;
  readonly records: PetRecordCollections;
  readonly files: readonly SummaryClinicalFileInput[];
}

export interface SummaryOptions {
  readonly includeMicrochip: boolean;
  readonly includeClinicalFiles: boolean;
  /** Disclosure opt-in del creador del enlace para `deceasedAt` (007, REQ-FAL7-008, C1); ausente equivale a `false` (desmarcado por defecto). */
  readonly includeDeceasedAt?: boolean;
}

type ScopeName = ClinicalSummary['scope'];

/** Comparación por unidades de código (determinista, sin configuración regional). */
const compare = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/** Orden de `summary.pets` (nombre, id): lo comparte `SharedSummaryView.petIds` para que ambos listados coincidan posición a posición (ENM-005-3.5.0). */
export const orderPetsForSummary = <T extends { readonly name: string; readonly id: string }>(pets: readonly T[]): T[] => [...pets].sort((a, b) => compare(a.name, b.name) || compare(a.id, b.id));

/** (fecha DESC, id DESC). */
function sortedByDateDesc<T extends { readonly id: string }>(rows: readonly T[], dateOf: (row: T) => string): T[] {
  return [...rows].sort((a, b) => compare(dateOf(b), dateOf(a)) || compare(b.id, a.id));
}

const note = (value: string | null | undefined): string | null => value ?? null;

function ageForSummary(pet: SummaryPetInput['pet'], today: string, options: SummaryOptions): { years: number; months: number; totalDays?: number } {
  const { years, months, totalDays } = computedAgeOf(pet, today);
  if (pet.lifeStatus === 'DECEASED' && options.includeDeceasedAt !== true) return { years, months };
  return { years, months, totalDays };
}

function buildPet(input: SummaryPetInput, generatedAt: string, options: SummaryOptions): ClinicalPetSummary {
  const { pet, records } = input;
  const today = generatedAt.slice(0, 10);
  const parameters = records.customParameters.map(withSymptomFields);
  return {
    profile: {
      name: pet.name,
      species: pet.species,
      speciesOther: pet.speciesOther ?? null,
      breed: pet.breed,
      sex: pet.sex,
      neutered: pet.neutered ?? null,
      birthDate: pet.birthDate,
      birthDateIsEstimate: pet.birthDateIsEstimate ?? false,
      lifeStatus: pet.lifeStatus ?? 'ALIVE',
      // REQ-FAL7-008: la fecha solo viaja con el opt-in y solo para una fallecida; AUSENTE (no null) en el resto.
      ...(options.includeDeceasedAt === true && pet.lifeStatus === 'DECEASED' && typeof pet.deceasedAt === 'string' ? { deceasedAt: pet.deceasedAt } : {}),
      // REQ-FAL7-007: una fallecida cuenta hasta deceasedAt. EDGE-007-027 (Opcion A): sin el opt-in `totalDays` se OMITE (con birthDate revelaria la fecha exacta); years y months se mantienen.
      age: ageForSummary(pet, today, options),
      ...(options.includeMicrochip && typeof pet.microchipId === 'string' ? { microchipId: pet.microchipId } : {}),
    },
    weights: sortedByDateDesc(records.weights, (r) => r.recordedAt).map((r) => ({ recordedAt: r.recordedAt, weightKg: r.weightKg, notes: note(r.notes) })),
    bodyMeasurements: sortedByDateDesc(records.bodyMeasurements, (r) => r.recordedAt).map((r) => ({
      recordedAt: r.recordedAt,
      neckCm: r.neckCm,
      chestCm: r.chestCm,
      backLengthCm: r.backLengthCm,
      waistCm: r.waistCm,
      notes: note(r.notes),
    })),
    vaccinations: sortedByDateDesc(records.vaccinations, (r) => r.appliedAt).map((r) => ({
      vaccineName: r.vaccineName,
      appliedAt: r.appliedAt,
      nextBoosterAt: r.nextBoosterAt ?? null,
      batchOrClinic: r.batchOrClinic ?? null,
      veterinarianName: (r as { veterinarianName?: string | null }).veterinarianName ?? null,
      notes: note(r.notes),
    })),
    dewormings: sortedByDateDesc(records.dewormings, (r) => r.appliedAt).map((r) => ({
      productBrand: r.productBrand,
      dewormingType: r.dewormingType,
      appliedAt: r.appliedAt,
      nextSuggestedDoseAt: r.nextSuggestedDoseAt ?? null,
      batchOrClinic: (r as { batchOrClinic?: string | null }).batchOrClinic ?? null,
      veterinarianName: (r as { veterinarianName?: string | null }).veterinarianName ?? null,
      notes: note(r.notes),
    })),
    medicalVisits: sortedByDateDesc(records.medicalVisits, (r) => r.visitDate).map((r) => ({
      visitDate: r.visitDate,
      reason: r.reason,
      diagnosis: r.diagnosis,
      treatment: r.treatment,
      clinicOrVet: r.clinicOrVet,
      observations: note(r.observations),
    })),
    symptoms: sortedByDateDesc(
      parameters.filter((r) => (r.category as string) === 'SYMPTOM'),
      (r) => r.recordedAt,
    ).map((r) => ({ recordedAt: r.recordedAt, symptomType: r.symptomType, severity: r.severity, title: r.title, description: r.description, notes: note(r.notes) })),
    otherParameters: sortedByDateDesc(
      parameters.filter((r) => (r.category as string) !== 'SYMPTOM'),
      (r) => r.recordedAt,
    ).map((r) => ({ recordedAt: r.recordedAt, category: r.category, title: r.title, description: r.description, notes: note(r.notes) })),
    clinicalFiles: options.includeClinicalFiles
      ? sortedByDateDesc(input.files, (f) => f.createdAt).map((f) => ({ id: f.id, mime: f.mime, sizeBytes: f.sizeBytes, createdAt: f.createdAt }))
      : [],
  };
}

/**
 * Construye el resumen de las mascotas del alcance. `generatedAt` es el único instante (el `ClockPort.now()` de la petición); la función no lee el reloj.
 * @implements REQ-SUM-001, REQ-SUM-002, REQ-SUM-003, INV-005-004
 */
export function buildClinicalSummary(scope: ScopeName, pets: readonly SummaryPetInput[], generatedAt: string, options: SummaryOptions): ClinicalSummary {
  const ordered = [...pets].sort((a, b) => compare(a.pet.name, b.pet.name) || compare(a.pet.id, b.pet.id));
  return {
    summaryVersion: CLINICAL_SUMMARY_VERSION,
    generatedAt,
    scope,
    dataProvenance: 'CAREGIVER_REPORTED_NOT_VERIFIED',
    automaticInterpretation: 'NONE',
    disclosure: {
      microchipIncluded: options.includeMicrochip,
      clinicalFilesIncluded: options.includeClinicalFiles,
      // 007, T1026: la señal solo viaja con el opt-in (ausente equivale a false en el contrato).
      ...(options.includeDeceasedAt === true ? { deceasedAtIncluded: true } : {}),
    },
    pets: ordered.map((input) => buildPet(input, generatedAt, options)) as ClinicalSummary['pets'],
  };
}
