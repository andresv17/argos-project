/**
 * Casos de uso de rutinas de cuidado, pendientes del día y niveles de cuidador (Feature 012, Bloque C, #26; T1655).
 * Solo titulares (propietario principal y co-propietario ACTIVE) definen rutinas y conceden niveles; el CAREGIVER ACTIVE con `VIEW_ONLY` o `BASIC_LOG` vigente lee; ADMIN, MEMBER y READER no (T-C5).
 * La mascota se bloquea (`lockPet`) antes de escribir; el id nuevo sale de `deps.ids` y la hora de `deps.clock` (el dominio no genera entropía ni lee el reloj).
 * SIN limitador de escrituras: los cubos 120/60/30 son de T1656 (R-3).
 *
 * @implements REQ-CAR12-001, REQ-CAR12-002, REQ-CAR12-004, REQ-CAR12-005, REQ-CAR12-006, SC-012-025, SC-012-026, SC-012-027, SC-012-036, SC-012-037, SC-012-040, SC-012-088, ERR-CAR12-ROUTINE-LIMIT, ERR-CAR12-ROUTINE-STALE
 */
import { DomainError } from '../../generated/v38/index.ts';
import { assertExpectedVersion, assertRoutineCapacity, planRoutineUpdate, validateCareRoutine, type CareRoutineRow } from '../../domain/care/care-routine.ts';
import { computeCareOccurrences, bogotaCivilDate, type CareOccurrence } from '../../domain/care/care-occurrences.ts';
import { speciesToDoseGroup } from '../../domain/care/care-species-group.ts';
import { isIsoCalendarDate } from '../../domain/shared/date-utils.ts';
import { requireActiveMembership } from '../../domain/households/household-policies.ts';
import type { CareRoutineRecord, CaregiverAccessRecord, CareLevelValue } from '../ports/care.port.ts';
import type { RepositorySet } from '../ports/repositories.port.ts';
import { forbidden, invalidField, petNotFound, presentAccess, presentEntry, presentRoutine, requireCareContext, usernamesById, careAccessOf, type AfterAuthorization, type CareContext } from './care-support.ts';
import { lockPet, requireReadablePet, type ApplicationDeps } from './use-case-support.ts';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function requireTitular(ctx: CareContext): void {
  if (!ctx.titular) throw forbidden();
}
function requireViewer(ctx: CareContext): void {
  if (!ctx.access.canViewRoutines) throw forbidden();
}
const toRow = (r: CareRoutineRecord): CareRoutineRow => r;

function expectedVersionOf(input: Record<string, unknown>): number {
  const v = input['expectedVersion'];
  if (typeof v !== 'number' || !Number.isInteger(v) || v < 1 || v > 1_000_000) throw invalidField('expectedVersion');
  return v;
}

/** Alta de una rutina (solo titulares). @implements REQ-CAR12-001, SC-012-025, SC-012-037, SC-012-088 */
export class CreateCareRoutineUseCase {
  constructor(private readonly deps: ApplicationDeps) {}

  execute(actorUserId: string, petId: string, input: Record<string, unknown>, afterAuthorization?: AfterAuthorization): Promise<Record<string, unknown>> {
    return this.deps.uow.runInTransaction(async (repositories) => {
      await lockPet(repositories, petId);
      const now = this.deps.clock.nowIsoTimestamp();
      const ctx = await requireCareContext(repositories, actorUserId, petId, now);
      requireTitular(ctx);
      afterAuthorization?.();
      const valid = validateCareRoutine(input, speciesToDoseGroup(ctx.pet.species));
      assertRoutineCapacity({ activeCount: await repositories.careRoutines.countActive(petId), totalRows: (await repositories.careRoutines.listByPet(petId)).length, replacing: false });
      const id = this.deps.ids.nextId();
      const row: CareRoutineRecord = {
        ...valid,
        id,
        seriesId: id,
        petId,
        active: true,
        effectiveFrom: now,
        effectiveTo: null,
        supersedesRoutineId: null,
        version: 1,
        createdByUserId: actorUserId,
        createdAt: now,
        updatedAt: now,
      };
      await repositories.careRoutines.insert(row);
      return presentRoutine(row);
    });
  }
}

/** Edición: dosis, unidad u horarios crean una versión nueva de la serie; el resto edita en el sitio. @implements REQ-CAR12-001, SC-012-025, SC-012-037 */
export class UpdateCareRoutineUseCase {
  constructor(private readonly deps: ApplicationDeps) {}

  execute(actorUserId: string, petId: string, routineId: string, input: Record<string, unknown>, afterAuthorization?: AfterAuthorization): Promise<Record<string, unknown>> {
    return this.deps.uow.runInTransaction(async (repositories) => {
      await lockPet(repositories, petId);
      const now = this.deps.clock.nowIsoTimestamp();
      const ctx = await requireCareContext(repositories, actorUserId, petId, now);
      requireTitular(ctx);
      afterAuthorization?.();
      const current = UUID.test(routineId) ? await repositories.careRoutines.findById(petId, routineId) : null;
      if (current === null) throw petNotFound();
      // D-A (Neo): 403 -> 404 -> 422 -> 409. Primero la forma (expectedVersion y captura fusionada, 422); después STALE y por último el tope de filas (409).
      const expected = expectedVersionOf(input);
      const { expectedVersion: _expected, ...patch } = input;
      const plan = planRoutineUpdate(toRow(current), patch, now, speciesToDoseGroup(ctx.pet.species), this.deps.ids.nextId());
      assertExpectedVersion(current, expected);
      if (plan.versioned) {
        assertRoutineCapacity({ activeCount: await repositories.careRoutines.countActive(petId), totalRows: (await repositories.careRoutines.listByPet(petId)).length, replacing: true });
        const closed: CareRoutineRecord = { ...current, active: false, effectiveTo: now, updatedAt: now };
        const next: CareRoutineRecord = { ...current, ...plan.next, createdByUserId: actorUserId, createdAt: now, updatedAt: now };
        await repositories.careRoutines.update(closed);
        await repositories.careRoutines.insert(next);
        return { routine: presentRoutine(next), versioned: true, supersededRoutineId: current.id };
      }
      const next: CareRoutineRecord = { ...current, ...plan.next, updatedAt: now };
      await repositories.careRoutines.update(next);
      return { routine: presentRoutine(next), versioned: false, supersededRoutineId: null };
    });
  }
}

/** Desactiva una rutina vigente (no borra): `active = false` y `effectiveTo = ahora`. @implements REQ-CAR12-001, REQ-CAR12-007 */
export class DeactivateCareRoutineUseCase {
  constructor(private readonly deps: ApplicationDeps) {}

  execute(actorUserId: string, petId: string, routineId: string, input: Record<string, unknown>, afterAuthorization?: AfterAuthorization): Promise<Record<string, unknown>> {
    return this.deps.uow.runInTransaction(async (repositories) => {
      await lockPet(repositories, petId);
      const now = this.deps.clock.nowIsoTimestamp();
      const ctx = await requireCareContext(repositories, actorUserId, petId, now);
      requireTitular(ctx);
      afterAuthorization?.();
      const current = UUID.test(routineId) ? await repositories.careRoutines.findById(petId, routineId) : null;
      if (current === null) throw petNotFound();
      assertExpectedVersion(current, expectedVersionOf(input));
      const next: CareRoutineRecord = { ...current, active: false, effectiveTo: now, version: current.version + 1, updatedAt: now };
      await repositories.careRoutines.update(next);
      return presentRoutine(next);
    });
  }
}

/** Lista de rutinas: por defecto solo las vigentes; `includeInactive` agrega las versiones sustituidas e inactivas. @implements REQ-CAR12-001, REQ-CAR12-004 */
export class ListCareRoutinesUseCase {
  constructor(private readonly deps: ApplicationDeps) {}

  execute(actorUserId: string, petId: string, query: { includeInactive?: boolean } = {}): Promise<{ items: Array<Record<string, unknown>> }> {
    return this.deps.uow.runInTransaction(async (repositories) => {
      const ctx = await requireCareContext(repositories, actorUserId, petId, this.deps.clock.nowIsoTimestamp());
      requireViewer(ctx);
      const rows = await repositories.careRoutines.listByPet(petId);
      return { items: rows.filter((r) => query.includeInactive === true || r.active).map(presentRoutine) };
    });
  }
}

/** Detalle de una versión de rutina: mismos lectores que la lista; un par {petId}/{routineId} que no se pertenece es el 404 uniforme. @implements REQ-CAR12-001, REQ-CAR12-004 */
export class GetCareRoutineUseCase {
  constructor(private readonly deps: ApplicationDeps) {}

  execute(actorUserId: string, petId: string, routineId: string): Promise<Record<string, unknown>> {
    return this.deps.uow.runInTransaction(async (repositories) => {
      const ctx = await requireCareContext(repositories, actorUserId, petId, this.deps.clock.nowIsoTimestamp());
      requireViewer(ctx);
      const row = UUID.test(routineId) ? await repositories.careRoutines.findById(petId, routineId) : null;
      if (row === null) throw petNotFound();
      return presentRoutine(row);
    });
  }
}

async function todayOf(repositories: RepositorySet, viewerId: string, ctx: CareContext, now: string): Promise<{ date: string; items: CareOccurrence[]; timezone: string; graceMinutes: number }> {
  const date = bogotaCivilDate(now);
  const routines = await repositories.careRoutines.listByPet(ctx.pet.id);
  const entries = (await repositories.careLog.listByPet(ctx.pet.id)).filter((e) => e.occurrenceDate === date);
  const result = computeCareOccurrences({ routines, entries, date, now });
  const names = await usernamesById(repositories, entries.map((e) => e.performedByUserId));
  const viewer = { userId: viewerId, titular: ctx.titular };
  const byId = new Map(entries.map((e) => [e.id, e] as const));
  return {
    date: result.date,
    timezone: result.timezone,
    graceMinutes: result.graceMinutes,
    items: result.items.map(({ seriesId: _series, logEntry, ...rest }) => ({ ...rest, logEntry: logEntry === null ? null : presentEntry(byId.get(logEntry.id)!, viewer, names, false) })) as unknown as CareOccurrence[],
  };
}

/** Pendientes del día (hora de Bogotá) de una mascota. @implements REQ-CAR12-002, REQ-CAR12-005, SC-012-027, SC-012-040 */
export class GetPetCareTodayUseCase {
  constructor(private readonly deps: ApplicationDeps) {}

  execute(actorUserId: string, petId: string): Promise<Record<string, unknown>> {
    return this.deps.uow.runInTransaction(async (repositories) => {
      const now = this.deps.clock.nowIsoTimestamp();
      const ctx = await requireCareContext(repositories, actorUserId, petId, now);
      requireViewer(ctx);
      return todayOf(repositories, actorUserId, ctx, now);
    });
  }
}

/** Pendientes del día del hogar, por mascota con acceso de cuidado; ADMIN, MEMBER y READER reciben 200 con grupos vacíos. @implements REQ-CAR12-005, SC-012-026 */
export class GetHouseholdCareTodayUseCase {
  constructor(private readonly deps: ApplicationDeps) {}

  execute(actorUserId: string, householdId: string): Promise<Record<string, unknown>> {
    return this.deps.uow.runInTransaction(async (repositories) => {
      const now = this.deps.clock.nowIsoTimestamp();
      requireActiveMembership(await repositories.households.listMemberships(householdId), householdId, actorUserId);
      const pets: Array<Record<string, unknown>> = [];
      for (const assignment of await repositories.assignments.listByHousehold(householdId)) {
        const pet = await repositories.pets.findById(assignment.petId);
        if (pet === null) continue;
        const ctx = await careAccessOf(repositories, actorUserId, pet, now);
        if (!ctx.access.canViewRoutines) continue;
        const today = await todayOf(repositories, actorUserId, ctx, now);
        pets.push({ petId: pet.id, petName: pet.name, criticalAllergies: null, items: today.items });
      }
      pets.sort((a, b) => String(a['petName']).localeCompare(String(b['petName'])) || String(a['petId']).localeCompare(String(b['petId'])));
      return { date: bogotaCivilDate(now), timezone: 'America/Bogota', pets };
    });
  }
}

/** Un CAREGIVER ACTIVE de un hogar con la mascota asignada (T-C2): solo a él se concede un nivel. */
async function isValidCaregiverTarget(repositories: RepositorySet, targetUserId: string, ctx: CareContext, now: string): Promise<boolean> {
  const pet = await repositories.pets.findById(ctx.pet.id);
  if (pet === null) return false;
  return (await careAccessOf(repositories, targetUserId, pet, now)).access.caregiver;
}

/** Concede o reemplaza el nivel de un cuidador (solo titulares). Devuelve `{ access, created }` (201 vs 200). @implements REQ-CAR12-004, REQ-CAR12-006, SC-012-036 */
export class SetCaregiverAccessUseCase {
  constructor(private readonly deps: ApplicationDeps) {}

  execute(actorUserId: string, petId: string, targetUserId: string, input: Record<string, unknown>, afterAuthorization?: AfterAuthorization): Promise<{ access: Record<string, unknown>; created: boolean }> {
    return this.deps.uow.runInTransaction(async (repositories) => {
      await lockPet(repositories, petId);
      const now = this.deps.clock.nowIsoTimestamp();
      const ctx = await requireCareContext(repositories, actorUserId, petId, now);
      requireTitular(ctx);
      afterAuthorization?.();
      // T-C4: el 404 del destino precede al 422 y al 409 para que un 409 no confirme que el destino tiene fila.
      if (!UUID.test(targetUserId) || !(await isValidCaregiverTarget(repositories, targetUserId, ctx, now))) throw petNotFound();
      const level = input['level'];
      if (level !== 'VIEW_ONLY' && level !== 'BASIC_LOG') throw invalidField('level');
      const rawUntil = input['careUntil'];
      const careUntil = rawUntil === undefined || rawUntil === null ? null : rawUntil;
      if (careUntil !== null && (typeof careUntil !== 'string' || !isIsoCalendarDate(careUntil) || careUntil < bogotaCivilDate(now))) throw invalidField('careUntil');
      const rawExpected = input['expectedVersion'];
      if (rawExpected !== undefined && (typeof rawExpected !== 'number' || !Number.isInteger(rawExpected) || rawExpected < 1 || rawExpected > 1_000_000)) throw invalidField('expectedVersion');
      const existing = await repositories.caregiverAccess.find(petId, targetUserId);
      if (existing !== null && rawExpected !== existing.version) throw new DomainError('ERR-CAR12-ROUTINE-STALE');
      const row: CaregiverAccessRecord = { petId, userId: targetUserId, level: level as CareLevelValue, careUntil: careUntil as string | null, grantedByUserId: actorUserId, grantedAt: now, version: existing === null ? 1 : existing.version + 1 };
      await repositories.caregiverAccess.upsert(row);
      const names = await usernamesById(repositories, [targetUserId]);
      return { access: presentAccess(row, names.get(targetUserId) ?? '', now), created: existing === null };
    });
  }
}

/** Retira la fila de nivel (idempotente: sin fila no es error); no toca la membresía del hogar. @implements REQ-CAR12-006 */
export class RemoveCaregiverAccessUseCase {
  constructor(private readonly deps: ApplicationDeps) {}

  execute(actorUserId: string, petId: string, targetUserId: string, afterAuthorization?: AfterAuthorization): Promise<{ removed: boolean }> {
    return this.deps.uow.runInTransaction(async (repositories) => {
      await lockPet(repositories, petId);
      const ctx = await requireCareContext(repositories, actorUserId, petId, this.deps.clock.nowIsoTimestamp());
      requireTitular(ctx);
      afterAuthorization?.();
      return { removed: await repositories.caregiverAccess.remove(petId, targetUserId) };
    });
  }
}

/** Niveles concedidos (solo titulares); una fila de quien ya no es CAREGIVER ACTIVE de un hogar con la mascota no se lista (T-C2). @implements REQ-CAR12-004, REQ-CAR12-006 */
export class ListCaregiverAccessUseCase {
  constructor(private readonly deps: ApplicationDeps) {}

  execute(actorUserId: string, petId: string): Promise<{ items: Array<Record<string, unknown>> }> {
    return this.deps.uow.runInTransaction(async (repositories) => {
      const now = this.deps.clock.nowIsoTimestamp();
      const ctx = await requireCareContext(repositories, actorUserId, petId, now);
      requireTitular(ctx);
      const rows = await repositories.caregiverAccess.listByPet(petId);
      const names = await usernamesById(repositories, rows.map((r) => r.userId));
      const items: Array<Record<string, unknown>> = [];
      for (const row of rows) if (await isValidCaregiverTarget(repositories, row.userId, ctx, now)) items.push(presentAccess(row, names.get(row.userId) ?? '', now));
      return { items };
    });
  }
}

/** Permisos efectivos del solicitante (con la mascota visible). @implements REQ-CAR12-004, REQ-CAR12-006, SC-012-030 */
export class GetMyCareAccessUseCase {
  constructor(private readonly deps: ApplicationDeps) {}

  execute(actorUserId: string, petId: string): Promise<Record<string, unknown>> {
    return this.deps.uow.runInTransaction(async (repositories) => {
      await requireReadablePet(repositories, actorUserId, petId);
      const ctx = await requireCareContext(repositories, actorUserId, petId, this.deps.clock.nowIsoTimestamp());
      return { petId, ...ctx.access };
    });
  }
}
