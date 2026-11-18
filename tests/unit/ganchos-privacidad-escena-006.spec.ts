/**
 * T815 (N2-06 (d), 006): pruebas rojas de los ganchos de privacidad de la escena, UNA SUITE POR CASO DE USO de las features cerradas 002, 004 y 005
 * (`pet-`, `avatar-`, `assignment-`, `household-`, `account-`, `ownership-` y `backup-use-cases`), contra el puerto de ganchos (`ScenePrivacyHooksPort`, T827).
 * Cada suite fija: (1) el gancho se llama con el evento opaco correcto y la hora del reloj inyectado; (2) se llama en la MISMA transacción que la causa
 * (si el gancho lanza, la causa se revierte completa); (3) no se llama cuando la causa no cambia nada o se rechaza; (4) sin puerto conectado el caso de uso
 * funciona como hoy (verde ya). La implementación va en T862..T868 (Fase 5); estas pruebas quedan en rojo hasta T868.
 * REQ-ESC6-022, REQ-ESC6-029, REQ-ESC6-030, REQ-ESC6-032; EDGE-ESC6-005, EDGE-ESC6-020, EDGE-ESC6-021, EDGE-ESC6-022, EDGE-ESC6-030, EDGE-ESC6-033;
 * SC-ESC6-044, SC-ESC6-045, SC-ESC6-047, SC-ESC6-048, SC-ESC6-058, SC-ESC6-073, SC-ESC6-076, SC-ESC6-088.
 */
import { describe, expect, it } from 'vitest';
import { DomainError } from '../../src/generated/index.ts';
import { DomainError as DomainErrorV31 } from '../../src/generated/v31/index.ts';
import { DeleteAccountUseCase } from '../../src/application/use-cases/account-use-cases.ts';
import { UnassignPetFromHouseholdUseCase } from '../../src/application/use-cases/assignment-use-cases.ts';
import { DeleteAvatarUseCase } from '../../src/application/use-cases/avatar-use-cases.ts';
import { ExportBackupUseCase, ImportBackupUseCase } from '../../src/application/use-cases/backup-use-cases.ts';
import { CreateHouseholdUseCase, DeleteHouseholdUseCase, LeaveHouseholdUseCase, RemoveMemberUseCase } from '../../src/application/use-cases/household-use-cases.ts';
import { TransferPetOwnershipUseCase } from '../../src/application/use-cases/ownership-use-cases.ts';
import { DeletePetUseCase } from '../../src/application/use-cases/pet-use-cases.ts';
import { CONFIRMATION_PHRASE } from '../../src/domain/account/account-deletion-guards.ts';
import { ANDRES, ARGOS, HOUSEHOLD, LUCIA, MARIA, canonicalState, createHarness, generatedId } from '../fixtures/application-harness.ts';
import { digestOf, v3, validBackupState } from '../fixtures/backup-harness.ts';
import { ELENA, ELENA_PET, HOUSEHOLD_ELENA, IDENTITY_PASSWORDS, REFERENCE_NOW, REFERENCE_TODAY, identityState } from '../fixtures/identity-fixtures.ts';
import { SceneHookFailure, createSceneHooksSpy, type SceneHooksSpyOptions } from '../fixtures/scene-privacy-hooks-spy.ts';

const NOW = '2026-11-05T12:00:00.000Z';
const AVATAR_OBJECT = 'f0000000-0000-4000-8000-0000000a0a01';
const rejects = async (promise: Promise<unknown>): Promise<unknown> => promise.then(() => null, (error: unknown) => error);
/** Código de error de dominio de la promesa rechazada (`OK` si se cumple). */
const codeOf = async (promise: Promise<unknown>): Promise<string> => {
  try {
    await promise;
    return 'OK';
  } catch (error) {
    if (error instanceof DomainError || error instanceof DomainErrorV31) return error.code;
    throw error;
  }
};

describe('T815 pet-use-cases: baja de mascota (REQ-ESC6-029, REQ-ESC6-030; EDGE-ESC6-005, EDGE-ESC6-021; SC-ESC6-044, SC-ESC6-045)', () => {
  it('[SC-ESC6-044] DeletePetUseCase llama a onPetRemoved con la mascota y la causa PET_DELETED, una sola vez, con la hora del reloj', async () => {
    const h = createHarness();
    const spy = createSceneHooksSpy();
    expect(await new DeletePetUseCase(spy.attach(h.deps)).execute(ANDRES, ARGOS.id)).toBe(204);
    expect(spy.calls).toEqual([{ hook: 'onPetRemoved', event: { petId: ARGOS.id, cause: 'PET_DELETED', now: NOW } }]);
  });

  it('[EDGE-ESC6-021] el gancho corre en la misma transacción: si lanza, la mascota sigue y no hay fila de auditoría de borrado', async () => {
    const h = createHarness();
    const spy = createSceneHooksSpy({ failOn: 'onPetRemoved' });
    const error = await rejects(new DeletePetUseCase(spy.attach(h.deps)).execute(ANDRES, ARGOS.id));
    expect(error).toBeInstanceOf(SceneHookFailure);
    expect(h.uow.snapshot().pets.some((p) => p.id === ARGOS.id)).toBe(true);
    expect(h.uow.snapshot().auditLog.filter((r) => r.mutationType === 'DELETE' && r.entityId === ARGOS.id)).toEqual([]);
  });

  it('[SC-ESC6-045] una baja rechazada (rol sin DELETE_PET o mascota ajena) no llama al gancho', async () => {
    const h = createHarness();
    const spy = createSceneHooksSpy();
    expect(await codeOf(new DeletePetUseCase(spy.attach(h.deps)).execute(LUCIA, ARGOS.id))).toBe('ERR-PET-NOT-FOUND');
    expect(spy.calls).toEqual([]);
  });

  it('[REQ-ESC6-017] sin puerto conectado la baja funciona como en 002 (compatibilidad hacia atrás)', async () => {
    const h = createHarness();
    expect(await new DeletePetUseCase(h.deps).execute(ANDRES, ARGOS.id)).toBe(204);
    expect(h.uow.snapshot().pets.some((p) => p.id === ARGOS.id)).toBe(false);
  });
});

describe('T815 avatar-use-cases: borrado del avatar (REQ-ESC6-029; EDGE-ESC6-005; SC-ESC6-044, SC-ESC6-047)', () => {
  const withAvatar = async () => {
    const h = createHarness();
    await h.uow.runInTransaction((r) => r.pets.replaceAvatar(ARGOS.id, AVATAR_OBJECT).then(() => undefined));
    return h;
  };

  it('[SC-ESC6-044] DeleteAvatarUseCase llama a onPetRemoved con la causa AVATAR_DELETED cuando había avatar', async () => {
    const h = await withAvatar();
    const spy = createSceneHooksSpy();
    await new DeleteAvatarUseCase(spy.attach(h.deps)).execute(ANDRES, ARGOS.id);
    expect(spy.calls).toEqual([{ hook: 'onPetRemoved', event: { petId: ARGOS.id, cause: 'AVATAR_DELETED', now: NOW } }]);
  });

  it('[EDGE-ESC6-005] sin avatar el borrado es idempotente y no llama al gancho', async () => {
    const h = createHarness();
    const spy = createSceneHooksSpy();
    await new DeleteAvatarUseCase(spy.attach(h.deps)).execute(ANDRES, ARGOS.id);
    expect(spy.calls).toEqual([]);
  });

  it('[EDGE-ESC6-021] si el gancho lanza, el avatar sigue vigente y la cola de borrado no recibe la clave', async () => {
    const h = await withAvatar();
    const spy = createSceneHooksSpy({ failOn: 'onPetRemoved' });
    expect(await rejects(new DeleteAvatarUseCase(spy.attach(h.deps)).execute(ANDRES, ARGOS.id))).toBeInstanceOf(SceneHookFailure);
    expect([(await h.uow.runInTransaction((r) => r.pets.findAvatar(ARGOS.id)))?.objectId, h.uow.snapshot().mediaQueue]).toEqual([AVATAR_OBJECT, []]);
  });
});

describe('T815 assignment-use-cases: desasignación (REQ-ESC6-030; EDGE-ESC6-020; SC-ESC6-047)', () => {
  it('[SC-ESC6-047] UnassignPetFromHouseholdUseCase llama a onPetUnassigned con la mascota y el hogar', async () => {
    const h = createHarness();
    const spy = createSceneHooksSpy();
    await new UnassignPetFromHouseholdUseCase(spy.attach(h.deps)).execute(ANDRES, ARGOS.id, HOUSEHOLD.id);
    expect(spy.calls).toEqual([{ hook: 'onPetUnassigned', event: { petId: ARGOS.id, householdId: HOUSEHOLD.id, now: NOW } }]);
  });

  it('[EDGE-ESC6-020] desasignar una asignación que no existe es idempotente y no llama al gancho', async () => {
    const h = createHarness();
    const spy = createSceneHooksSpy();
    const useCase = new UnassignPetFromHouseholdUseCase(spy.attach(h.deps));
    await useCase.execute(ANDRES, ARGOS.id, HOUSEHOLD.id);
    spy.calls.length = 0;
    await useCase.execute(ANDRES, ARGOS.id, HOUSEHOLD.id);
    expect(spy.calls).toEqual([]);
  });

  it('[EDGE-ESC6-020] si el gancho lanza, la asignación sigue en pie', async () => {
    const h = createHarness();
    const spy = createSceneHooksSpy({ failOn: 'onPetUnassigned' });
    expect(await rejects(new UnassignPetFromHouseholdUseCase(spy.attach(h.deps)).execute(ANDRES, ARGOS.id, HOUSEHOLD.id))).toBeInstanceOf(SceneHookFailure);
    expect(h.uow.snapshot().assignments.filter((a) => a.petId === ARGOS.id && a.householdId === HOUSEHOLD.id)).toHaveLength(1);
  });
});

describe('T815 household-use-cases: crear, salir o ser expulsado, eliminar (REQ-ESC6-030, REQ-ESC6-029, REQ-ESC6-032; EDGE-ESC6-020, EDGE-ESC6-022, EDGE-ESC6-030, EDGE-ESC6-033; SC-ESC6-047, SC-ESC6-058, SC-ESC6-073, SC-ESC6-076)', () => {
  it('[SC-ESC6-058][EDGE-ESC6-030] CreateHouseholdUseCase llama a onHouseholdCreated con el hogar nuevo y su propietario, con el hogar ya insertado, sin llamar a nada más', async () => {
    const h = createHarness();
    const spy = createSceneHooksSpy({ probe: async (_hook, r) => (await r.households.findById(generatedId(1))) !== null });
    await new CreateHouseholdUseCase(spy.attach(h.deps)).execute(LUCIA, { name: 'Casa nueva' });
    expect(spy.calls).toEqual([{ hook: 'onHouseholdCreated', event: { householdId: generatedId(1), ownerUserId: LUCIA, now: NOW } }]);
    expect(spy.observed).toEqual([true]);
  });

  it('[SC-ESC6-076] si el gancho de creación lanza, el hogar no queda creado (migración D6-09 atómica con la causa)', async () => {
    const h = createHarness();
    const spy = createSceneHooksSpy({ failOn: 'onHouseholdCreated' });
    expect(await rejects(new CreateHouseholdUseCase(spy.attach(h.deps)).execute(LUCIA, { name: 'Casa nueva' }))).toBeInstanceOf(SceneHookFailure);
    expect(h.uow.snapshot().households.map((x) => x.id)).toEqual([HOUSEHOLD.id]);
  });

  it('[SC-ESC6-047] RemoveMemberUseCase llama a onMemberRemoved con la causa REMOVED y LeaveHouseholdUseCase con LEFT', async () => {
    const removed = createHarness();
    const removedSpy = createSceneHooksSpy();
    await new RemoveMemberUseCase(removedSpy.attach(removed.deps)).execute(ANDRES, HOUSEHOLD.id, MARIA);
    expect(removedSpy.calls).toEqual([{ hook: 'onMemberRemoved', event: { householdId: HOUSEHOLD.id, userId: MARIA, cause: 'REMOVED', now: NOW } }]);
    const left = createHarness();
    const leftSpy = createSceneHooksSpy();
    await new LeaveHouseholdUseCase(leftSpy.attach(left.deps)).execute(MARIA, HOUSEHOLD.id);
    expect(leftSpy.calls).toEqual([{ hook: 'onMemberRemoved', event: { householdId: HOUSEHOLD.id, userId: MARIA, cause: 'LEFT', now: NOW } }]);
  });

  it('[EDGE-ESC6-020] si el gancho de salida o expulsión lanza, la membresía sigue ACTIVE', async () => {
    const h = createHarness();
    const spy = createSceneHooksSpy({ failOn: 'onMemberRemoved' });
    expect(await rejects(new RemoveMemberUseCase(spy.attach(h.deps)).execute(ANDRES, HOUSEHOLD.id, MARIA))).toBeInstanceOf(SceneHookFailure);
    expect(h.uow.snapshot().memberships.filter((m) => m.householdId === HOUSEHOLD.id && m.userId === MARIA).map((m) => m.status)).toEqual(['ACTIVE']);
  });

  it('[SC-ESC6-048][EDGE-ESC6-022] DeleteHouseholdUseCase llama a onHouseholdDeleting ANTES del DELETE (el hogar y sus membresías existen en ese instante)', async () => {
    const h = createHarness();
    const spy = createSceneHooksSpy({
      probe: async (_hook, r) => [(await r.households.findById(HOUSEHOLD.id)) !== null, (await r.households.listMemberships(HOUSEHOLD.id)).length > 0],
    });
    await new DeleteHouseholdUseCase(spy.attach(h.deps)).execute(ANDRES, HOUSEHOLD.id);
    expect(spy.calls).toEqual([{ hook: 'onHouseholdDeleting', event: { householdId: HOUSEHOLD.id, now: NOW } }]);
    expect(spy.observed).toEqual([[true, true]]);
    expect(h.uow.snapshot().households.some((x) => x.id === HOUSEHOLD.id)).toBe(false);
  });

  it('[SC-ESC6-073][EDGE-ESC6-033] si el gancho de eliminación lanza, el hogar y sus membresías siguen en pie y no se audita el borrado', async () => {
    const h = createHarness();
    const spy = createSceneHooksSpy({ failOn: 'onHouseholdDeleting' });
    expect(await rejects(new DeleteHouseholdUseCase(spy.attach(h.deps)).execute(ANDRES, HOUSEHOLD.id))).toBeInstanceOf(SceneHookFailure);
    expect(h.uow.snapshot().households.some((x) => x.id === HOUSEHOLD.id)).toBe(true);
    expect(h.uow.snapshot().auditLog.filter((r) => r.mutationType === 'DELETE' && r.entityType === 'HOUSEHOLD')).toEqual([]);
  });

  it('[SC-ESC6-047] un propietario ajeno no puede eliminar el hogar y el gancho no se llama', async () => {
    const h = createHarness();
    const spy = createSceneHooksSpy();
    expect(await codeOf(new DeleteHouseholdUseCase(spy.attach(h.deps)).execute(MARIA, HOUSEHOLD.id))).toBe('ERR-ACC-FORBIDDEN');
    expect(spy.calls).toEqual([]);
  });
});

describe('T815 account-use-cases: eliminación de cuenta con membresías (REQ-ESC6-029, REQ-ESC6-032; EDGE-ESC6-022, EDGE-ESC6-033; SC-ESC6-044, SC-ESC6-048, SC-ESC6-076)', () => {
  async function setup(options: SceneHooksSpyOptions = {}) {
    const h = createHarness(identityState());
    h.clock.setClock(REFERENCE_TODAY, REFERENCE_NOW);
    const spy = createSceneHooksSpy(options);
    const deps = spy.attach(h.deps);
    await deps.uow.runInTransaction(async (r) => r.sessions.save('ses', { userId: ELENA, createdAt: REFERENCE_NOW, lastActivityAt: REFERENCE_NOW, revokedAt: null }));
    const token = (await deps.uow.runInTransaction((r) => deps.backupTokens.issue(r, ELENA, deps.clock.nowIsoTimestamp()))).token;
    const input = { confirmationPhrase: CONFIRMATION_PHRASE, password: IDENTITY_PASSWORDS['elena.solo']!, backupConfirmationToken: token };
    return { h, spy, deps, run: () => new DeleteAccountUseCase(deps).execute(ELENA, 'ses', input) };
  }

  it('[SC-ESC6-048][EDGE-ESC6-022] DeleteAccountUseCase llama a onAccountDeleting con el seudónimo HMAC y los hogares en cascada, con la cuenta aún existente', async () => {
    const t = await setup({ probe: async (_hook, r) => (await r.users.findById(ELENA)) !== null });
    expect(await t.run()).toBe(204);
    const pseudonym = t.deps.auditPseudonym.hmacUserId(ELENA, t.deps.auditHmacSecret);
    expect(t.spy.calls).toEqual([{ hook: 'onAccountDeleting', event: { userId: ELENA, pseudonym, householdIds: [HOUSEHOLD_ELENA.id], now: REFERENCE_NOW } }]);
    expect(t.spy.observed).toEqual([true]);
    expect(JSON.stringify(t.spy.calls)).not.toContain(ELENA_PET.name);
  });

  it('[SC-ESC6-076][EDGE-ESC6-033] si el gancho lanza, la cuenta, el hogar y la mascota siguen y el token de confirmación sigue usable', async () => {
    const t = await setup({ failOn: 'onAccountDeleting' });
    expect(await rejects(t.run())).toBeInstanceOf(SceneHookFailure);
    const after = t.h.uow.snapshot();
    expect([after.users.some((u) => u.id === ELENA), after.households.some((x) => x.id === HOUSEHOLD_ELENA.id), after.pets.some((p) => p.id === ELENA_PET.id)]).toEqual([true, true, true]);
    expect(after.auditLog.filter((r) => r.mutationType === 'ACCOUNT_DELETE')).toEqual([]);
  });

  it('[SC-ESC6-044] una eliminación rechazada (contraseña incorrecta) no llama al gancho', async () => {
    const t = await setup();
    const bad = { confirmationPhrase: CONFIRMATION_PHRASE, password: 'incorrecta', backupConfirmationToken: 'A'.repeat(43) };
    expect(await codeOf(new DeleteAccountUseCase(t.deps).execute(ELENA, 'ses', bad))).toBe('ERR-AUTH-INVALID-CREDENTIALS');
    expect(t.spy.calls).toEqual([]);
  });
});

describe('T815 ownership-use-cases: transferencia de propiedad de la mascota (REQ-ESC6-024, REQ-ESC6-025, REQ-ESC6-030; SC-ESC6-088)', () => {
  it('[SC-ESC6-088] TransferPetOwnershipUseCase llama a onPetOwnershipTransferred con el propietario anterior y el nuevo', async () => {
    const h = createHarness();
    const spy = createSceneHooksSpy();
    await new TransferPetOwnershipUseCase(spy.attach(h.deps)).execute(ANDRES, ARGOS.id, { targetUserId: MARIA });
    expect(spy.calls).toEqual([{ hook: 'onPetOwnershipTransferred', event: { petId: ARGOS.id, previousOwnerUserId: ANDRES, newOwnerUserId: MARIA, now: NOW } }]);
  });

  it('[SC-ESC6-088] si el gancho lanza, la mascota conserva su propietario y las asignaciones no se podan', async () => {
    const h = createHarness();
    const spy = createSceneHooksSpy({ failOn: 'onPetOwnershipTransferred' });
    const before = JSON.stringify(h.uow.snapshot());
    expect(await rejects(new TransferPetOwnershipUseCase(spy.attach(h.deps)).execute(ANDRES, ARGOS.id, { targetUserId: MARIA }))).toBeInstanceOf(SceneHookFailure);
    expect(JSON.stringify(h.uow.snapshot())).toBe(before);
  });

  it('[REQ-ESC6-030] una transferencia rechazada (destino inválido) no llama al gancho', async () => {
    const h = createHarness();
    const spy = createSceneHooksSpy();
    expect(await codeOf(new TransferPetOwnershipUseCase(spy.attach(h.deps)).execute(ANDRES, ARGOS.id, { targetUserId: ANDRES }))).toBe('ERR-OWN-TRANSFER-INVALID-TARGET');
    expect(spy.calls).toEqual([]);
  });
});

describe('T815 backup-use-cases: importación y exportación de respaldo (REQ-ESC6-022; SC-ESC6-051, SC-ESC6-088)', () => {
  const payload = JSON.stringify(v3());

  it('[SC-ESC6-088] ImportBackupUseCase llama a onBackupImported con el propietario y las mascotas reemplazadas (ordenadas por id) dentro de la transacción de importación', async () => {
    const h = createHarness(validBackupState());
    const replaced = h.uow.snapshot().pets.filter((p) => p.ownerUserId === ANDRES).map((p) => p.id).sort();
    const spy = createSceneHooksSpy();
    await new ImportBackupUseCase(spy.attach(h.deps)).execute(ANDRES, payload, digestOf(payload));
    expect(spy.calls).toEqual([{ hook: 'onBackupImported', event: { ownerUserId: ANDRES, replacedPetIds: replaced, now: NOW } }]);
  });

  it('[SC-ESC6-088] si el gancho lanza, la importación se revierte completa (estado idéntico)', async () => {
    const h = createHarness(validBackupState());
    const before = JSON.stringify(h.uow.snapshot());
    const spy = createSceneHooksSpy({ failOn: 'onBackupImported' });
    expect(await rejects(new ImportBackupUseCase(spy.attach(h.deps)).execute(ANDRES, payload, digestOf(payload)))).toBeInstanceOf(SceneHookFailure);
    expect(JSON.stringify(h.uow.snapshot())).toBe(before);
  });

  it('[SC-ESC6-051] una importación rechazada por confirmación incorrecta no llama al gancho y la exportación nunca llama a ninguno (el respaldo no incluye escenas)', async () => {
    const h = createHarness(validBackupState());
    const spy = createSceneHooksSpy();
    expect(await codeOf(new ImportBackupUseCase(spy.attach(h.deps)).execute(ANDRES, payload, 'f'.repeat(64)))).toBe('ERR-SCHEMA-VALIDATION-FAILED');
    await new ExportBackupUseCase(spy.attach(h.deps)).execute(ANDRES);
    expect(spy.calls).toEqual([]);
  });
});

describe('T815 el estado canónico de partida', () => {
  it('[SC-ESC6-044] el hogar canónico tiene a Andrés de propietario y a María como miembro activo', () => {
    const state = canonicalState();
    expect([state.households[0]?.ownerUserId, state.memberships.filter((m) => m.householdId === HOUSEHOLD.id && m.status === 'ACTIVE').map((m) => m.userId).includes(MARIA)]).toEqual([ANDRES, true]);
  });
});
