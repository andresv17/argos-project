import { describe, expect, it } from 'vitest';
import { DomainError } from '../../src/generated/index.ts';
import { AddWeightRecordUseCase, UpdateRecordUseCase } from '../../src/application/use-cases/record-use-cases.ts';
import { GetPetDashboardUseCase, ListMyPetsUseCase, RegisterPetUseCase, UpdatePetUseCase } from '../../src/application/use-cases/pet-use-cases.ts';
import type { RepositorySet } from '../../src/application/ports/repositories.port.ts';
import type { UnitOfWorkPort } from '../../src/application/ports/unit-of-work.port.ts';
import { ANDRES, ARGOS, MARIA, CARLOS, createHarness } from '../fixtures/application-harness.ts';

const ROCKY = { name: 'Rocky', species: 'CANINE', breed: 'Mestizo', birthDate: '2024-06-01', sex: 'MALE' };

async function failure(promise: Promise<unknown>): Promise<DomainError> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof DomainError) return error;
    throw error;
  }
  throw new Error('Se esperaba un DomainError');
}

async function registered(h = createHarness(), extra: Record<string, unknown> = {}) {
  const pet = await new RegisterPetUseCase(h.deps).execute(ANDRES, { ...ROCKY, ...extra });
  return { h, pet };
}

describe('REQ-FAL7-001 / REQ-FAL7-002: alta y edición con estado de vida', () => {
  it('el alta devuelve lifeStatus ALIVE, deceasedAt nulo y version 1; el alta con Fallecido y fecha válida los guarda', async () => {
    const { pet } = await registered();
    expect([pet.lifeStatus, pet.deceasedAt, pet.version]).toEqual(['ALIVE', null, 1]);
    const dead = (await registered(createHarness(), { lifeStatus: 'DECEASED', deceasedAt: '2026-01-15' })).pet;
    expect([dead.lifeStatus, dead.deceasedAt, dead.version]).toEqual(['DECEASED', '2026-01-15', 1]);
  });

  it('SC-007-009: la violación del invariante en la edición usa ERR-SCHEMA-VALIDATION-FAILED en deceasedAt y no cambia nada ni audita', async () => {
    const { h, pet } = await registered();
    const before = JSON.stringify(h.uow.snapshot());
    const error = await failure(new UpdatePetUseCase(h.deps).execute(ANDRES, pet.id, { lifeStatus: 'DECEASED', deceasedAt: '2999-01-01' }, 1));
    expect([error.code, error.status, error.field]).toEqual(['ERR-SCHEMA-VALIDATION-FAILED', 422, 'deceasedAt']);
    expect(JSON.stringify(h.uow.snapshot())).toBe(before);
  });

  it('REQ-FAL7-008 / REQ-FAL7-010 / SC-007-031: un miembro sin permiso de edición (rol de hogar) recibe 403 y quien no ve la mascota, 404; ninguno cambia lifeStatus', async () => {
    const h = createHarness();
    const update = new UpdatePetUseCase(h.deps);
    const body = { lifeStatus: 'DECEASED', deceasedAt: '2026-01-15' };
    const member = await failure(update.execute(MARIA, ARGOS.id, body, 1));
    const stranger = await failure(update.execute(CARLOS, ARGOS.id, body, 1));
    expect([member.code, stranger.code]).toEqual(['ERR-ACC-FORBIDDEN', 'ERR-PET-NOT-FOUND']);
    expect([member.detail, stranger.detail].join(' ')).not.toMatch(/DECEASED|lifeStatus|deceasedAt|2026-01-15/);
    expect(h.uow.snapshot().pets.find((p) => p.id === ARGOS.id)!.lifeStatus ?? 'ALIVE').toBe('ALIVE');
  });
});

describe('EDGE-007-009 / ERR-PET-VERSION-CONFLICT: control optimista de la ficha (SC-007-034)', () => {
  it('ERR-PET-VERSION-CONFLICT: dos PATCH secuenciales, el segundo con la versión anterior, responde 412 con el detalle fijo y deja el estado y la auditoría intactos', async () => {
    const { h, pet } = await registered();
    const update = new UpdatePetUseCase(h.deps);
    const first = await update.execute(ANDRES, pet.id, { lifeStatus: 'DECEASED', deceasedAt: '2026-01-15' }, 1);
    expect([first.version, first.lifeStatus]).toEqual([2, 'DECEASED']);
    const before = JSON.stringify(h.uow.snapshot());
    const stale = await failure(update.execute(ANDRES, pet.id, { lifeStatus: 'ALIVE' }, 1));
    expect([stale.code, stale.status, stale.detail]).toEqual(['ERR-PET-VERSION-CONFLICT', 412, 'Esta ficha cambió, recarga.']);
    expect(JSON.stringify(h.uow.snapshot())).toBe(before);
    const current = await update.execute(ANDRES, pet.id, { name: 'Rocco' }, 2);
    expect([current.version, current.lifeStatus, current.deceasedAt]).toEqual([3, 'DECEASED', '2026-01-15']);
  });

  it('sin If-Match el caso de uso rechaza con ERR-SCHEMA-VALIDATION-FAILED en el campo If-Match, pero primero resuelve el acceso (404/403 antes que la cabecera)', async () => {
    const { h, pet } = await registered();
    const update = new UpdatePetUseCase(h.deps);
    const missing = await failure(update.execute(ANDRES, pet.id, { name: 'X' }, null));
    expect([missing.code, missing.field]).toEqual(['ERR-SCHEMA-VALIDATION-FAILED', 'If-Match']);
    expect((await failure(update.execute(CARLOS, pet.id, { name: 'X' }, null))).code).toBe('ERR-PET-NOT-FOUND');
  });

  it('REQ-FAL7-011 / EDGE-007-010: updatePet toma el candado de la mascota como PRIMERA operación (antes de leer la mascota y los registros)', async () => {
    const { h, pet } = await registered();
    const calls: string[] = [];
    const spying: UnitOfWorkPort = {
      ...h.uow,
      runInTransaction: <T>(work: (r: RepositorySet) => Promise<T>) =>
        h.uow.runInTransaction((r) =>
          work({
            ...r,
            pets: new Proxy(r.pets, {
              get: (target, key) => {
                if (key === 'findById' || key === 'findByIdForUpdate') calls.push(String(key));
                return Reflect.get(target, key) as unknown;
              },
            }),
            records: new Proxy(r.records, {
              get: (target, key) => {
                if (key === 'listForPet') calls.push('records.listForPet');
                return Reflect.get(target, key) as unknown;
              },
            }),
          }),
        ),
    } as UnitOfWorkPort;
    await new UpdatePetUseCase({ ...h.deps, uow: spying }).execute(ANDRES, pet.id, { name: 'Rocco' }, 1);
    expect(calls.slice(0, 3)).toEqual(['findByIdForUpdate', 'findById', 'records.listForPet']);
  });
});

describe('REQ-FAL7-004 / REQ-FAL7-007 / EDGE-007-019: alertas y edad de una mascota fallecida (SC-007-012, SC-007-013)', () => {
  it('REQ-FAL7-004 / REQ-FAL7-007: ARGOS con vacuna por vencer (1 alerta activa) fallecida: la ficha y la tarjeta no cuentan alertas, el historial sigue visible y la edad llega hasta deceasedAt', async () => {
    const h = createHarness();
    const before = await new GetPetDashboardUseCase(h.deps).execute(ANDRES, ARGOS.id);
    expect(before.alertsSummary.totalActiveAlerts).toBe(1);
    await new UpdatePetUseCase(h.deps).execute(ANDRES, ARGOS.id, { lifeStatus: 'DECEASED', deceasedAt: '2026-11-05' }, 1);
    const view = await new GetPetDashboardUseCase(h.deps).execute(ANDRES, ARGOS.id);
    expect(view.alertsSummary).toEqual({ overdueCount: 0, dueSoonCount: 0, upToDateCount: 0, totalActiveAlerts: 0 });
    expect(view.vaccinations.map((v) => v.alert)).toEqual([null]);
    expect(view.vaccinations).toHaveLength(before.vaccinations.length);
    expect([view.computedAge, view.profile.lifeStatus, view.profile.deceasedAt]).toEqual([{ years: 4, months: 5, totalDays: 1640 }, 'DECEASED', '2026-11-05']);
    const cards = await new ListMyPetsUseCase(h.deps).execute(ANDRES);
    const card = cards.find((c) => c.profile.id === ARGOS.id)!;
    expect([card.globalAlertStatus, card.alertsSummary.totalActiveAlerts]).toEqual([null, 0]);
    expect((await new ListMyPetsUseCase(h.deps).execute(ANDRES, { filter: 'WITH_ALERTS' })).some((c) => c.profile.id === ARGOS.id)).toBe(false);
  });

  it('REQ-FAL7-007: la edad de una fallecida se calcula entre el nacimiento y deceasedAt, no a hoy', async () => {
    const { h, pet } = await registered(createHarness(), { lifeStatus: 'DECEASED', deceasedAt: '2025-06-01' });
    const view = await new GetPetDashboardUseCase(h.deps).execute(ANDRES, pet.id);
    expect(view.computedAge).toMatchObject({ years: 1, months: 0 });
  });
});

describe('REQ-FAL7-005: registros posteriores a la fecha de fallecimiento (SC-007-014, EDGE-007-012, EDGE-007-013)', () => {
  it('REQ-FAL7-005: rechaza el alta con fecha posterior a deceasedAt y acepta una anterior o igual; el rechazo no guarda nada', async () => {
    const { h, pet } = await registered(createHarness(), { lifeStatus: 'DECEASED', deceasedAt: '2026-01-15' });
    const add = new AddWeightRecordUseCase(h.deps);
    const before = JSON.stringify(h.uow.snapshot());
    const late = await failure(add.execute(ANDRES, pet.id, { recordedAt: '2026-01-16', weightKg: 10 }));
    expect([late.code, late.field]).toEqual(['ERR-SCHEMA-VALIDATION-FAILED', 'recordedAt']);
    expect(JSON.stringify(h.uow.snapshot())).toBe(before);
    expect((await add.execute(ANDRES, pet.id, { recordedAt: '2026-01-15', weightKg: 10 })).record.recordedAt).toBe('2026-01-15');
  });

  it('REQ-FAL7-005: marcar el fallecimiento con un registro posterior se rechaza listando el registro en conflicto; con la fecha del último registro se acepta', async () => {
    const { h, pet } = await registered();
    const weight = await new AddWeightRecordUseCase(h.deps).execute(ANDRES, pet.id, { recordedAt: '2026-03-01', weightKg: 10 });
    const update = new UpdatePetUseCase(h.deps);
    const rejected = await failure(update.execute(ANDRES, pet.id, { lifeStatus: 'DECEASED', deceasedAt: '2026-02-01' }, 1));
    expect([rejected.code, rejected.field, rejected.detail.includes(weight.record.id)]).toEqual(['ERR-SCHEMA-VALIDATION-FAILED', 'deceasedAt', true]);
    expect((await update.execute(ANDRES, pet.id, { lifeStatus: 'DECEASED', deceasedAt: '2026-03-01' }, 1)).lifeStatus).toBe('DECEASED');
  });

  it('EDGE-007-005 / EDGE-007-013: un registro ya posterior (datos previos) conserva su fecha, sus notas se editan y cambiarla a otra fecha posterior se rechaza', async () => {
    const { h, pet } = await registered(createHarness(), { lifeStatus: 'DECEASED', deceasedAt: '2026-01-15' });
    const legacy = { id: '33333333-3333-4333-8333-333333333301', petId: pet.id, recordedAt: '2026-03-01', weightKg: 10, notes: null, createdAt: '2026-11-05T12:00:00.000Z', revision: 0 };
    await h.uow.runInTransaction((r) => r.records.add('weights', legacy as never));
    const update = new UpdateRecordUseCase(h.deps);
    const edited = (await update.execute(ANDRES, pet.id, 'weights', legacy.id, { collection: 'weights', notes: 'corregido' }, 0)) as { notes: string; recordedAt: string };
    expect([edited.notes, edited.recordedAt]).toEqual(['corregido', '2026-03-01']);
    const moved = await failure(update.execute(ANDRES, pet.id, 'weights', legacy.id, { collection: 'weights', recordedAt: '2026-04-01' }, 1));
    expect([moved.code, moved.field]).toEqual(['ERR-SCHEMA-VALIDATION-FAILED', 'recordedAt']);
    const earlier = (await update.execute(ANDRES, pet.id, 'weights', legacy.id, { collection: 'weights', recordedAt: '2026-01-10' }, 1)) as { recordedAt: string };
    expect(earlier.recordedAt).toBe('2026-01-10');
  });
});

describe('REQ-AUD-001 / EDGE-007-016: la transición Fallecido -> Vivo queda auditada con el estado anterior (SC-007-035)', () => {
  it('cada cambio de estado de vida escribe una fila UPDATE/PET con hashes distintos y el hash previo de Vivo -> Fallecido es el nuevo del alta', async () => {
    const { h, pet } = await registered();
    const update = new UpdatePetUseCase(h.deps);
    await update.execute(ANDRES, pet.id, { lifeStatus: 'DECEASED', deceasedAt: '2026-01-15' }, 1);
    await update.execute(ANDRES, pet.id, { lifeStatus: 'ALIVE' }, 2);
    const rows = h.uow.snapshot().auditLog.filter((a) => a.entityType === 'PET' && a.entityId === pet.id);
    expect(rows.map((r) => r.mutationType)).toEqual(['CREATE', 'UPDATE', 'UPDATE']);
    expect(rows[1]!.previousStateHash).toBe(rows[0]!.newStateHash);
    expect(rows[2]!.previousStateHash).toBe(rows[1]!.newStateHash);
    // Cada transición cambia el hash (el reloj es fijo: Vivo -> Fallecido -> Vivo vuelve al mismo estado público del alta, sin `version`).
    expect([rows[1]!.newStateHash === rows[0]!.newStateHash, rows[2]!.newStateHash === rows[1]!.newStateHash, rows[2]!.newStateHash === rows[0]!.newStateHash]).toEqual([false, false, true]);
    const back = await new GetPetDashboardUseCase(h.deps).execute(ANDRES, pet.id);
    expect([back.profile.lifeStatus, back.profile.deceasedAt, back.profile.version]).toEqual(['ALIVE', null, 3]);
  });
});
