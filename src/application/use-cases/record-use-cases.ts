/**
 * Casos de uso de alta de los 6 módulos de registros. Orden de comprobación: acceso de escritura
 * (INV-PET-003 e INV-ACC-001/002: mascota inexistente o no legible, ERR-PET-NOT-FOUND; legible sin ser dueño,
 * ERR-ACC-FORBIDDEN), luego esquema y dominio con validateRecordInput. El id y createdAt
 * salen de los puertos solo si la entrada es válida; los opcionales ausentes se guardan como null.
 * Las respuestas siguen el OpenAPI: WeightEntryView, VaccinationEntryView y DewormingEntryView para peso, vacuna y
 * desparasitación; el registro tal cual para los demás.
 *
 * @implements REQ-REC-001, REQ-REC-002, REQ-REC-003, REQ-REC-004, REQ-REC-005, REQ-REC-006, INV-PET-003, INV-ACC-002, ERR-PET-NOT-FOUND, ERR-ACC-FORBIDDEN, INV-ARCH-001, INV-ARCH-002
 */

import type { BodyMeasurementRecord, CustomParameterRecord, MedicalVisitRecord } from '../../generated/index.ts';
import {
  evaluateDewormingAlerts,
  evaluateVaccinationAlerts,
  type DewormingEntryView,
  type VaccinationEntryView,
} from '../../domain/alerts/sanitary-alert-evaluator.ts';
import type { PetRecordCollections } from '../../domain/pet/pet-invariants.ts';
import {
  computeWeightEvolutionSeries,
  validateRecordInput,
  type RecordModule,
  type RecordOf,
  type WeightEntryView,
} from '../../domain/records/record-invariants.ts';
import { requireWritablePet, type ApplicationDeps } from './use-case-support.ts';

/** Opcionales que el registro persistido exige como null cuando la entrada no los trae. */
const NULLABLE_DEFAULTS: Readonly<Record<RecordModule, Readonly<Record<string, null>>>> = {
  weights: { notes: null },
  bodyMeasurements: { notes: null },
  vaccinations: { batchOrClinic: null, notes: null },
  dewormings: { notes: null },
  medicalVisits: { observations: null },
  customParameters: { notes: null },
};

/**
 * Alta genérica de un registro: acceso de escritura, validación, construcción y persistencia en una transacción.
 * @implements INV-PET-003, INV-ACC-002
 */
abstract class AddRecordUseCase<M extends RecordModule, View> {
  constructor(
    private readonly deps: ApplicationDeps,
    private readonly module: M,
  ) {}

  protected abstract present(record: RecordOf<M>, existing: PetRecordCollections, today: string): View;

  async execute(userId: string, petId: string, input: unknown): Promise<View> {
    const today = this.deps.clock.todayIsoDate();
    return this.deps.uow.runInTransaction(async (repositories) => {
      const { pet } = await requireWritablePet(repositories, userId, petId);
      const valid = validateRecordInput(this.module, input, pet.birthDate, today);
      const record = {
        ...NULLABLE_DEFAULTS[this.module],
        ...valid,
        id: this.deps.ids.nextId(),
        petId,
        createdAt: this.deps.clock.nowIsoTimestamp(),
      } as unknown as RecordOf<M>;
      const existing = await repositories.records.listForPet(petId);
      await repositories.records.add(this.module, record);
      return this.present(record, existing, today);
    });
  }
}

/** @implements REQ-REC-001 */
export class AddWeightRecordUseCase extends AddRecordUseCase<'weights', WeightEntryView> {
  constructor(deps: ApplicationDeps) {
    super(deps, 'weights');
  }

  protected present(record: RecordOf<'weights'>, existing: PetRecordCollections): WeightEntryView {
    return computeWeightEvolutionSeries([...existing.weights, record]).find((entry) => entry.record.id === record.id)!;
  }
}

/** @implements REQ-REC-002 */
export class AddBodyMeasurementUseCase extends AddRecordUseCase<'bodyMeasurements', BodyMeasurementRecord> {
  constructor(deps: ApplicationDeps) {
    super(deps, 'bodyMeasurements');
  }

  protected present(record: BodyMeasurementRecord): BodyMeasurementRecord {
    return record;
  }
}

/** @implements REQ-REC-003 */
export class AddVaccinationUseCase extends AddRecordUseCase<'vaccinations', VaccinationEntryView> {
  constructor(deps: ApplicationDeps) {
    super(deps, 'vaccinations');
  }

  protected present(record: RecordOf<'vaccinations'>, existing: PetRecordCollections, today: string): VaccinationEntryView {
    return evaluateVaccinationAlerts([...existing.vaccinations, record], today).find((entry) => entry.record.id === record.id)!;
  }
}

/** @implements REQ-REC-004 */
export class AddDewormingUseCase extends AddRecordUseCase<'dewormings', DewormingEntryView> {
  constructor(deps: ApplicationDeps) {
    super(deps, 'dewormings');
  }

  protected present(record: RecordOf<'dewormings'>, existing: PetRecordCollections, today: string): DewormingEntryView {
    return evaluateDewormingAlerts([...existing.dewormings, record], today).find((entry) => entry.record.id === record.id)!;
  }
}

/** @implements REQ-REC-005 */
export class AddMedicalVisitUseCase extends AddRecordUseCase<'medicalVisits', MedicalVisitRecord> {
  constructor(deps: ApplicationDeps) {
    super(deps, 'medicalVisits');
  }

  protected present(record: MedicalVisitRecord): MedicalVisitRecord {
    return record;
  }
}

/** @implements REQ-REC-006 */
export class AddCustomParameterUseCase extends AddRecordUseCase<'customParameters', CustomParameterRecord> {
  constructor(deps: ApplicationDeps) {
    super(deps, 'customParameters');
  }

  protected present(record: CustomParameterRecord): CustomParameterRecord {
    return record;
  }
}
