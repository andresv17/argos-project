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

import type { BodyMeasurementRecord, MedicalVisitRecord } from '../../generated/index.ts';
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
  revisionOf,
  moduleOfCollection,
  withSymptomFields,
  validateRecordInput,
  type CustomParameterWithSymptom,
  type RecordModule,
  type RecordOf,
  type WeightEntryView,
} from '../../domain/records/record-invariants.ts';
import type { RbacAction } from '../../domain/access/rbac.ts';
import { assertRecordNotSuperseded } from '../../domain/records/superseded-guard.ts';
import { stateHash } from '../../domain/audit/state-hash.ts';
import { DomainError } from '../../generated/index.ts';
// ERR-REC-CONFLICT es de la 3.1.0 (feature 004): el catálogo 002 no lo trae; la capa HTTP reconoce ambas clases (problem-details.ts).
import { DomainError as DomainErrorV31 } from '../../generated/v31/index.ts';
import { RECORD_ENTITY_TYPE, recordAudit } from './audit-support.ts';
import { lockPet, requirePetAction, type ApplicationDeps } from './use-case-support.ts';

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
  customParameters: { notes: null, symptomType: null, severity: null },
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
      await lockPet(repositories, petId); // REQ-BOR-005: candado de mascota antes de cualquier otra lectura
      const { pet } = await requirePetAction(repositories, userId, petId, WRITE_ACTION[this.module]);
      const valid = validateRecordInput(this.module, input, pet.birthDate, today, pet.species);
      const record = {
        ...NULLABLE_DEFAULTS[this.module],
        ...valid,
        id: this.deps.ids.nextId(),
        petId,
        createdAt: this.deps.clock.nowIsoTimestamp(),
        revision: 0, // D-16 A: todo registro nace con revisión 0
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

/**
 * Parámetro adicional y síntoma (REQ-SIN-001): la coherencia categoría/tipo la valida el contrato 3.1.0 en el dominio. El caso de uso
 * nunca interpreta `title` ni `description` (REQ-SIN-003).
 * @implements REQ-REC-006, REQ-SIN-001, REQ-SIN-002, REQ-SIN-003, INV-SIN-001
 */
export class AddCustomParameterUseCase extends AddRecordUseCase<'customParameters', CustomParameterWithSymptom> {
  constructor(deps: ApplicationDeps) {
    super(deps, 'customParameters');
  }

  protected present(record: RecordOf<'customParameters'>): CustomParameterWithSymptom {
    return withSymptomFields(record);
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
 * Edición parcial de un registro de cualquiera de los 6 módulos con control de revisión (D-16 A). Orden: candado de mascota, acceso
 * (404 antes que 403) con la acción WRITE_* del módulo, `If-Match` presente (si no, ERR-SCHEMA-VALIDATION-FAILED, campo If-Match),
 * existencia del registro en la mascota (ERR-PET-NOT-FOUND), comparación de la revisión BAJO EL CANDADO (distinta, 409 ERR-REC-CONFLICT
 * sin cambios ni auditoría), esquema y dominio, y por último la guarda de inmutabilidad (409), antes y después de aplicar la edición
 * (INV-REG-002). Sin cambios efectivos no hay escritura, ni fila de auditoría, ni incremento de `revision` (REQ-BOR-003); con ellos,
 * `revision` aumenta en 1. Solo vacunas y desparasitaciones pueden estar SUPERSEDED.
 * @param ifMatch revisión leída por el cliente (cabecera `If-Match`); `null` si la petición no la trajo.
 * @implements REQ-BOR-003, REQ-BOR-005, INV-REG-002, INV-REG-003, REQ-REC2-003, REQ-RBAC-001, SC-015, ERR-REC-CONFLICT, ERR-REC-SUPERSEDED-IMMUTABLE, ERR-ACC-FORBIDDEN
 */
export class UpdateRecordUseCase {
  constructor(private readonly deps: ApplicationDeps) {}

  async execute(userId: string, petId: string, collection: string, recordId: string, input: unknown, ifMatch: number | null): Promise<RecordOf<RecordModule>> {
    const module = moduleOrNotFound(collection);
    const today = this.deps.clock.todayIsoDate();
    return this.deps.uow.runInTransaction(async (repositories) => {
      await lockPet(repositories, petId); // REQ-BOR-005: candado de mascota antes de cualquier otra lectura
      const { pet } = await requirePetAction(repositories, userId, petId, WRITE_ACTION[module]);
      if (ifMatch === null) throw new DomainError('ERR-SCHEMA-VALIDATION-FAILED', 'Falta la cabecera If-Match con la revisión del registro.', 'If-Match');
      const existing = await repositories.records.listForPet(petId);
      const current = (existing[module] as ReadonlyArray<{ id: string }>).find((r) => r.id === recordId) as RecordOf<RecordModule> | undefined;
      if (current === undefined) throw new DomainError('ERR-PET-NOT-FOUND', undefined, 'recordId');
      // D-16 A: la comparación va dentro de la transacción con el candado de mascota; una revisión distinta no cambia ni audita nada.
      if (revisionOf(current) !== ifMatch) throw new DomainErrorV31('ERR-REC-CONFLICT');
      const applied = applyRecordUpdate(module, current, input, pet.birthDate, today, pet.species);
      const updated = { ...applied, revision: revisionOf(current) + 1 } as RecordOf<RecordModule>;
      assertRecordNotSuperseded(supersededStatus(module, existing, recordId, today));
      // INV-REG-002: la edición que dejaría al propio registro SUPERSEDED (p. ej. una fecha anterior a otra de la misma clave) se rechaza.
      assertRecordNotSuperseded(supersededStatus(module, withReplaced(existing, module, updated), recordId, today));
      // REQ-BOR-003: sin cambios efectivos del estado canónico (sin contar la revisión) no se escribe, no se audita y no se incrementa `revision`.
      if (stateHash(current) === stateHash(applied)) return current;
      await repositories.records.replace(module, updated);
      await recordAudit(this.deps, repositories, { executorUserId: userId, mutationType: 'UPDATE', entityType: RECORD_ENTITY_TYPE[module], entityId: recordId, previous: current, next: updated });
      return updated;
    });
  }
}

/** Las colecciones de la mascota con el registro editado en lugar del vigente (para evaluar el estado resultante). */
function withReplaced(existing: PetRecordCollections, module: RecordModule, updated: RecordOf<RecordModule>): PetRecordCollections {
  const list = existing[module] as ReadonlyArray<{ id: string }>;
  return { ...existing, [module]: list.map((r) => (r.id === (updated as { id: string }).id ? updated : r)) } as unknown as PetRecordCollections;
}

/** Estado de alerta del registro; los módulos sin semáforo nunca están reemplazados. */
function supersededStatus(module: RecordModule, existing: PetRecordCollections, recordId: string, today: string): string {
  if (module === 'vaccinations') return evaluateVaccinationAlerts(existing.vaccinations, today).find((e) => e.record.id === recordId)?.alert?.status ?? 'ACTIVE';
  if (module === 'dewormings') return evaluateDewormingAlerts(existing.dewormings, today).find((e) => e.record.id === recordId)?.alert?.status ?? 'ACTIVE';
  return 'ACTIVE';
}

/**
 * Borra FÍSICAMENTE un registro de la mascota (D-11 A: sin borrado lógico), con la fila DELETE en la misma transacción. Un registro
 * SUPERSEDED no se borra (409). Si era el posterior de su clave, el anterior vuelve a ser vigente.
 * @implements REQ-BOR-001, REQ-BOR-002, REQ-BOR-005, INV-REG-001, INV-REG-002, REQ-REC2-003, REQ-RBAC-001, ERR-ACC-FORBIDDEN
 */
export class DeleteRecordUseCase {
  constructor(private readonly deps: ApplicationDeps) {}

  async execute(userId: string, petId: string, collection: string, recordId: string): Promise<void> {
    const module = moduleOrNotFound(collection);
    await this.deps.uow.runInTransaction(async (repositories) => {
      await lockPet(repositories, petId); // REQ-BOR-005: candado de mascota antes de cualquier otra lectura
      await requirePetAction(repositories, userId, petId, DELETE_ACTION[module]);
      const existing = await repositories.records.listForPet(petId);
      const current = (existing[module] as ReadonlyArray<{ id: string }>).find((r) => r.id === recordId);
      if (current === undefined) throw new DomainError('ERR-PET-NOT-FOUND', undefined, 'recordId');
      // D-11 A, E-01: un registro SUPERSEDED no se borra (409); el borrado es físico y comprueba las filas afectadas.
      assertRecordNotSuperseded(supersededStatus(module, existing, recordId, this.deps.clock.todayIsoDate()));
      if (!(await repositories.records.remove(module, petId, recordId))) throw new DomainError('ERR-PET-NOT-FOUND', undefined, 'recordId');
      await recordAudit(this.deps, repositories, { executorUserId: userId, mutationType: 'DELETE', entityType: RECORD_ENTITY_TYPE[module], entityId: recordId, previous: current, next: null });
    });
  }
}
