/**
 * Casos de uso de alta de los 6 módulos de registros. Orden de comprobación: acceso por la matriz
 * (INV-PET-003, INV-ACC2-001/002: mascota inexistente o no visible, ERR-PET-NOT-FOUND; visible sin la acción del módulo,
 * ERR-ACC-FORBIDDEN), luego esquema y dominio con validateRecordInput. El id y createdAt
 * salen de los puertos solo si la entrada es válida; los opcionales ausentes se guardan como null.
 * Las respuestas siguen el OpenAPI: WeightEntryView, VaccinationEntryView y DewormingEntryView para peso, vacuna y
 * desparasitación; el registro tal cual para los demás.
 *
 * Edición y borrado de vacunas (REQ-REC2-003): un registro SUPERSEDED es inmutable con cualquier rol; borrar el posterior
 * devuelve el anterior a vigente (SUPERSEDED se calcula, no se almacena).
 *
 * @implements REQ-REC2-003, REQ-REC-001, REQ-REC-002, REQ-REC-003, REQ-REC-004, REQ-REC-005, REQ-REC-006, INV-PET-003, INV-ACC-002, ERR-PET-NOT-FOUND, ERR-ACC-FORBIDDEN, INV-ARCH-001, INV-ARCH-002
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
  applyRecordUpdate,
  computeWeightEvolutionSeries,
  moduleOfCollection,
  validateRecordInput,
  type RecordModule,
  type RecordOf,
  type WeightEntryView,
} from '../../domain/records/record-invariants.ts';
import type { RbacAction } from '../../domain/access/rbac.ts';
import { assertRecordNotSuperseded } from '../../domain/records/superseded-guard.ts';
import { DomainError } from '../../generated/index.ts';
import { RECORD_ENTITY_TYPE, recordAudit } from './audit-support.ts';
import { requirePetAction, type ApplicationDeps } from './use-case-support.ts';

/** Acción de la matriz que autoriza el alta de cada módulo (REQ-RBAC-001, REQ-REC-002/005/006). */
const WRITE_ACTION: Readonly<Record<RecordModule, RbacAction>> = {
  weights: 'WRITE_WEIGHTS_AND_MEASUREMENTS',
  bodyMeasurements: 'WRITE_WEIGHTS_AND_MEASUREMENTS',
  vaccinations: 'WRITE_HEALTH_EVENTS',
  dewormings: 'WRITE_HEALTH_EVENTS',
  medicalVisits: 'WRITE_APPOINTMENTS_AND_PARAMETERS',
  customParameters: 'WRITE_APPOINTMENTS_AND_PARAMETERS',
};

/** Opcionales que el registro persistido exige como null cuando la entrada no los trae. */
const NULLABLE_DEFAULTS: Readonly<Record<RecordModule, Readonly<Record<string, string | null>>>> = {
  weights: { notes: null },
  bodyMeasurements: { notes: null },
  vaccinations: { category: 'VACCINE', nextBoosterAt: null, batchOrClinic: null, veterinarianName: null, veterinarianLicense: null, notes: null },
  dewormings: { category: 'DEWORMING', nextSuggestedDoseAt: null, batchOrClinic: null, veterinarianName: null, veterinarianLicense: null, notes: null },
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
      const { pet } = await requirePetAction(repositories, userId, petId, WRITE_ACTION[this.module]);
      const valid = validateRecordInput(this.module, input, pet.birthDate, today, pet.species);
      const record = {
        ...NULLABLE_DEFAULTS[this.module],
        ...valid,
        id: this.deps.ids.nextId(),
        petId,
        createdAt: this.deps.clock.nowIsoTimestamp(),
      } as unknown as RecordOf<M>;
      const existing = await repositories.records.listForPet(petId);
      await repositories.records.add(this.module, record);
      await recordAudit(this.deps, repositories, { executorUserId: userId, mutationType: 'CREATE', entityType: RECORD_ENTITY_TYPE[this.module], entityId: record.id, previous: null, next: record });
      return this.present(record, existing, today);
    });
  }
}

/** @implements REQ-REC2-001, INV-REC2-002, ERR-REC-WEIGHT-OUT-OF-RANGE */
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

/** Acción de la matriz que autoriza borrar cada módulo (REQ-RBAC-001): eventos de salud vs. el resto. */
const DELETE_ACTION: Readonly<Record<RecordModule, RbacAction>> = {
  weights: 'DELETE_OTHER_RECORDS',
  bodyMeasurements: 'DELETE_OTHER_RECORDS',
  vaccinations: 'DELETE_HEALTH_EVENTS',
  dewormings: 'DELETE_HEALTH_EVENTS',
  medicalVisits: 'DELETE_OTHER_RECORDS',
  customParameters: 'DELETE_OTHER_RECORDS',
};

/** La colección de la ruta debe existir en el contrato (RecordCollection); si no, la ruta no existe: 404. */
function moduleOrNotFound(collection: string): RecordModule {
  const module = moduleOfCollection(collection);
  if (module === undefined) throw new DomainError('ERR-PET-NOT-FOUND', undefined, 'collection');
  return module;
}

/**
 * Edición parcial de un registro de cualquiera de los 6 módulos. Orden: acceso (404 antes que 403) con la acción
 * WRITE_* del módulo, existencia del registro en la mascota (ERR-PET-NOT-FOUND), esquema y dominio, y por último la
 * guarda de inmutabilidad (409). Solo vacunas y desparasitaciones pueden estar SUPERSEDED.
 * @implements REQ-REC2-003, REQ-RBAC-001, SC-015, ERR-REC-SUPERSEDED-IMMUTABLE, ERR-ACC-FORBIDDEN
 */
export class UpdateRecordUseCase {
  constructor(private readonly deps: ApplicationDeps) {}

  async execute(userId: string, petId: string, collection: string, recordId: string, input: unknown): Promise<RecordOf<RecordModule>> {
    const module = moduleOrNotFound(collection);
    const today = this.deps.clock.todayIsoDate();
    return this.deps.uow.runInTransaction(async (repositories) => {
      const { pet } = await requirePetAction(repositories, userId, petId, WRITE_ACTION[module]);
      const existing = await repositories.records.listForPet(petId);
      const current = (existing[module] as ReadonlyArray<{ id: string }>).find((r) => r.id === recordId) as RecordOf<RecordModule> | undefined;
      if (current === undefined) throw new DomainError('ERR-PET-NOT-FOUND', undefined, 'recordId');
      const updated = applyRecordUpdate(module, current, input, pet.birthDate, today, pet.species);
      assertRecordNotSuperseded(supersededStatus(module, existing, recordId, today));
      await repositories.records.replace(module, updated);
      await recordAudit(this.deps, repositories, { executorUserId: userId, mutationType: 'UPDATE', entityType: RECORD_ENTITY_TYPE[module], entityId: recordId, previous: current, next: updated });
      return updated;
    });
  }
}

/** Estado de alerta del registro; los módulos sin semáforo nunca están reemplazados. */
function supersededStatus(module: RecordModule, existing: PetRecordCollections, recordId: string, today: string): string {
  if (module === 'vaccinations') return evaluateVaccinationAlerts(existing.vaccinations, today).find((e) => e.record.id === recordId)?.alert?.status ?? 'ACTIVE';
  if (module === 'dewormings') return evaluateDewormingAlerts(existing.dewormings, today).find((e) => e.record.id === recordId)?.alert?.status ?? 'ACTIVE';
  return 'ACTIVE';
}

/**
 * Borra un registro de la mascota. Si era el posterior de su clave, el anterior vuelve a ser vigente.
 * @implements REQ-REC2-003, REQ-RBAC-001, ERR-ACC-FORBIDDEN
 */
export class DeleteRecordUseCase {
  constructor(private readonly deps: ApplicationDeps) {}

  async execute(userId: string, petId: string, collection: string, recordId: string): Promise<void> {
    const module = moduleOrNotFound(collection);
    await this.deps.uow.runInTransaction(async (repositories) => {
      await requirePetAction(repositories, userId, petId, DELETE_ACTION[module]);
      const current = ((await repositories.records.listForPet(petId))[module] as ReadonlyArray<{ id: string }>).find((r) => r.id === recordId);
      if (current === undefined || !(await repositories.records.remove(module, petId, recordId))) throw new DomainError('ERR-PET-NOT-FOUND', undefined, 'recordId');
      await recordAudit(this.deps, repositories, { executorUserId: userId, mutationType: 'DELETE', entityType: RECORD_ENTITY_TYPE[module], entityId: recordId, previous: current, next: null });
    });
  }
}
