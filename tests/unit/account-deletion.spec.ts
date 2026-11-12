import { describe, expect, it } from 'vitest';
import { DomainError } from '../../src/generated/index.ts';
import type { AuditLogPort } from '../../src/application/ports/audit-log.port.ts';
import type { RepositorySet } from '../../src/application/ports/repositories.port.ts';
import type { UnitOfWorkPort } from '../../src/application/ports/unit-of-work.port.ts';
import { DeleteAccountUseCase } from '../../src/application/use-cases/account-use-cases.ts';
import { CONFIRMATION_PHRASE, isConfirmationTokenShape, planHouseholdsForDeletion, planPetAssignmentsForDeletion } from '../../src/domain/account/account-deletion-guards.ts';
import { InMemoryUnitOfWork, type MemoryState } from '../../src/infrastructure/persistence/memory/in-memory-unit-of-work.ts';
import { createHarness, type Harness } from '../fixtures/application-harness.ts';
import {
  ANA,
  ANA_PETS,
  BRUNO,
  DIEGO,
  ELENA,
  ELENA_PET,
  HOUSEHOLD_ANA,
  HOUSEHOLD_ELENA,
  IDENTITY_MEMBERSHIPS,
  IDENTITY_PASSWORDS,
  REFERENCE_NOW,
  REFERENCE_TODAY,
  identityState,
} from '../fixtures/identity-fixtures.ts';
import { FAKE_HASH_PREFIX } from '../fixtures/test-doubles.ts';

/** T211 (unidad): STATE-ACCOUNT-DELETE-001 con repositorios en memoria. Fase A sin escrituras (salvo el contador de fallos), fase B atómica. */
const MINUTE = 60_000;
const ELENA_PASSWORD = IDENTITY_PASSWORDS['elena.solo']!;
const input = (overrides: Record<string, unknown> = {}) => ({ confirmationPhrase: CONFIRMATION_PHRASE, password: ELENA_PASSWORD, ...overrides });

function setup(state: MemoryState = identityState(), makeUow?: (inner: InMemoryUnitOfWork) => UnitOfWorkPort) {
  const harness: Harness = createHarness(state);
  harness.clock.setClock(REFERENCE_TODAY, REFERENCE_NOW);
  const uow = makeUow === undefined ? harness.uow : makeUow(harness.uow);
  const auditCalls: string[] = [];
  const audit: AuditLogPort = {
    pseudonymOf: (userId) => {
      auditCalls.push(`pseudonymOf:${userId}`);
      return 'f'.repeat(64);
    },
    recordAccountDeletion: async (_repositories, pseudonym) => {
      auditCalls.push(`recordAccountDeletion:${pseudonym}`);
    },
  };
  const deps = { ...harness.deps, uow, audit };
  const useCase = new DeleteAccountUseCase(deps);
  const session = async (userId: string, token: string) => {
    await deps.uow.runInTransaction(async (r) => r.sessions.save(token, { userId, createdAt: REFERENCE_NOW, lastActivityAt: REFERENCE_NOW, revokedAt: null }));
    return token;
  };
  const issueToken = async (userId: string) => (await deps.uow.runInTransaction((r) => deps.backupTokens.issue(r, userId, deps.clock.nowIsoTimestamp()))).token;
  const tokenUsable = async (userId: string, token: string) => deps.uow.runInTransaction((r) => deps.backupTokens.consume(r, userId, token, deps.clock.nowIsoTimestamp()));
  return { ...harness, uow: harness.uow, deps, useCase, auditCalls, session, issueToken, tokenUsable };
}

async function outcome(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
    return 'OK';
  } catch (error) {
    if (error instanceof DomainError) return error.code;
    throw error;
  }
}

describe('guardas de la eliminación de cuenta (src/domain/account/account-deletion-guards.ts)', () => {
  it('[REQ-ACC-002] la frase de confirmación es literal y el token tiene la forma de ConfirmationToken (43 caracteres base64url)', () => {
    expect(CONFIRMATION_PHRASE).toBe('ELIMINAR MI CUENTA');
    const valid = 'A'.repeat(43);
    expect([valid, `${'a1_-'.repeat(10)}abc`].map(isConfirmationTokenShape)).toEqual([true, true]);
    for (const bad of ['A'.repeat(42), 'A'.repeat(44), `${'A'.repeat(42)}+`, `${'A'.repeat(42)}=`, ' '.repeat(43), '', undefined, null, 12, { token: valid }]) {
      expect(isConfirmationTokenShape(bad), String(bad)).toBe(false);
    }
  });

  it('[REQ-ACC-002][STATE-ACCOUNT-DELETE-001] un hogar con otro miembro ACTIVE bloquea al propietario; con solo él ACTIVE se elimina en cascada (N-5)', () => {
    const plan = (userId: string) => planHouseholdsForDeletion(userId, IDENTITY_MEMBERSHIPS);
    expect(plan(ANA)).toEqual({ blockingHouseholdIds: [HOUSEHOLD_ANA.id], cascadeHouseholdIds: [] });
    expect(plan(ELENA)).toEqual({ blockingHouseholdIds: [], cascadeHouseholdIds: [HOUSEHOLD_ELENA.id] });
    expect(plan(BRUNO)).toEqual({ blockingHouseholdIds: [], cascadeHouseholdIds: [] });
    expect(plan(DIEGO)).toEqual({ blockingHouseholdIds: [], cascadeHouseholdIds: [] });
  });

  it('[REQ-ACC-002] solo cuentan los miembros ACTIVE: una invitación, una baja voluntaria o una expulsión no bloquean', () => {
    const others = (status: 'INVITED' | 'LEFT' | 'REMOVED' | 'DECLINED' | 'CANCELLED') => IDENTITY_MEMBERSHIPS.map((m) => (m.userId === BRUNO ? { ...m, status } : m));
    for (const status of ['INVITED', 'LEFT', 'REMOVED', 'DECLINED', 'CANCELLED'] as const) {
      expect(planHouseholdsForDeletion(ANA, others(status)), status).toEqual({ blockingHouseholdIds: [], cascadeHouseholdIds: [HOUSEHOLD_ANA.id] });
    }
  });
  it('[REQ-ACC-002][ERR-ACCOUNT-OWNS-SHARED-PETS] planPetAssignmentsForDeletion: bloquea solo la asignación de una mascota propia a un hogar con otro ACTIVE; separa las ajenas en hogares en cascada', () => {
    const own = { petId: 'p1', householdId: 'h1' };
    const soleOwn = { petId: 'p1', householdId: 'h2' };
    const foreign = { petId: 'p9', householdId: 'h2' };
    const active = (householdId: string, userId: string) => ({ ...IDENTITY_MEMBERSHIPS[0]!, householdId, userId, status: 'ACTIVE' as const });
    const memberships = [active('h1', 'u'), active('h1', 'o'), active('h2', 'u')];
    expect(planPetAssignmentsForDeletion('u', ['p1'], [own, soleOwn, foreign], memberships, ['h2'])).toEqual({ blockingAssignments: [own], foreignAssignmentsInCascade: [foreign] });
  });

});

describe('fase A de la eliminación de cuenta: sin escrituras (STATE-ACCOUNT-DELETE-001, A1 a A3)', () => {
  it('[REQ-ACC-002][STATE-ACCOUNT-DELETE-001] la frase ausente, en minúsculas, recortada o con espacios es ERR-SCHEMA-VALIDATION-FAILED, sin verificar la contraseña ni escribir', async () => {
    const t = setup();
    const token = await t.issueToken(ELENA);
    const before = t.uow.snapshot();
    for (const confirmationPhrase of [undefined, 'eliminar mi cuenta', ' ELIMINAR MI CUENTA', 'ELIMINAR MI CUENTA ', 'ELIMINAR  MI CUENTA', 42]) {
      expect(await outcome(t.useCase.execute(ELENA, 'ses', input({ confirmationPhrase, backupConfirmationToken: token }))), String(confirmationPhrase)).toBe('ERR-SCHEMA-VALIDATION-FAILED');
    }
    expect(await outcome(t.useCase.execute(ELENA, 'ses', { password: ELENA_PASSWORD, backupConfirmationToken: token }))).toBe('ERR-SCHEMA-VALIDATION-FAILED');
    expect(await outcome(t.useCase.execute(ELENA, 'ses', input({ extra: true, backupConfirmationToken: token })))).toBe('ERR-SCHEMA-VALIDATION-FAILED');
    expect([t.hasher.calls, t.uow.snapshot(), t.auditCalls]).toEqual([[], before, []]);
  });

  it('[REQ-ACC-002][STATE-ACCOUNT-DELETE-001][ERR-AUTH-INVALID-CREDENTIALS] contraseña incorrecta: el único cambio es el contador de fallos; el token no se consume y no hay auditoría', async () => {
    const t = setup();
    await t.session(ELENA, 'ses');
    const token = await t.issueToken(ELENA);
    const before = t.uow.snapshot();
    expect(await outcome(t.useCase.execute(ELENA, 'ses', input({ password: 'incorrecta', backupConfirmationToken: token })))).toBe('ERR-AUTH-INVALID-CREDENTIALS');
    expect(t.uow.snapshot()).toEqual({ ...before, loginFailures: { 'elena.solo': [REFERENCE_NOW] } });
    expect([await t.tokenUsable(ELENA, token), t.auditCalls]).toEqual([true, []]);
  });

  it('[REQ-ACC-002][INV-AUTH-005][ERR-AUTH-TOO-MANY-ATTEMPTS] los fallos cuentan para el limitador: con 5 en la ventana responde 429 sin verificar la contraseña', async () => {
    const state = identityState();
    state.loginFailures['elena.solo'] = ['11:50:00', '11:52:00', '11:55:00', '11:58:00', '11:59:00'].map((t) => `2026-11-11T${t}.000Z`);
    const t = setup(state);
    await t.session(ELENA, 'ses');
    const token = await t.issueToken(ELENA);
    expect(await outcome(t.useCase.execute(ELENA, 'ses', input({ backupConfirmationToken: token })))).toBe('ERR-AUTH-TOO-MANY-ATTEMPTS');
    expect([t.hasher.calls, t.uow.snapshot().loginFailures['elena.solo']]).toEqual([[], state.loginFailures['elena.solo']]);
  });

  it('[REQ-ACC-002][STATE-ACCOUNT-DELETE-001][ERR-ACCOUNT-CONFIRMATION-MISMATCH] token ausente o mal formado con la contraseña correcta: MISMATCH (no ERR-SCHEMA-VALIDATION-FAILED), sin consumir nada ni escribir', async () => {
    const t = setup();
    await t.session(ELENA, 'ses');
    const token = await t.issueToken(ELENA);
    const before = t.uow.snapshot();
    for (const backupConfirmationToken of [undefined, null, 'corto', 'A'.repeat(44), 12, `${token}!`]) {
      expect(await outcome(t.useCase.execute(ELENA, 'ses', input({ backupConfirmationToken }))), String(backupConfirmationToken)).toBe('ERR-ACCOUNT-CONFIRMATION-MISMATCH');
    }
    expect([t.uow.snapshot(), await t.tokenUsable(ELENA, token), t.auditCalls]).toEqual([before, true, []]);
  });

  it('[REQ-ACC-002][STATE-ACCOUNT-DELETE-001] el orden de errores respeta la máquina: la contraseña incorrecta se informa antes que un token ausente', async () => {
    const t = setup();
    await t.session(ELENA, 'ses');
    expect(await outcome(t.useCase.execute(ELENA, 'ses', input({ password: 'incorrecta' })))).toBe('ERR-AUTH-INVALID-CREDENTIALS');
  });
});

describe('fase B de la eliminación de cuenta: una transacción atómica (STATE-ACCOUNT-DELETE-001, B1 a B11)', () => {
  it('[REQ-ACC-002][STATE-ACCOUNT-DELETE-001][SC-014] elimina cuenta, sesiones, mascotas con sus registros, membresías, invitaciones, hogar de un solo ACTIVE, token y fallos; no toca a nadie más', async () => {
    const t = setup();
    await t.session(ELENA, 'ses-1');
    await t.session(ELENA, 'ses-2');
    await t.session(ANA, 'ses-ana');
    const token = await t.issueToken(ELENA);
    const anaBefore = { pets: t.uow.snapshot().pets.filter((p) => p.ownerUserId === ANA), households: [HOUSEHOLD_ANA] };
    expect(await t.useCase.execute(ELENA, 'ses-1', input({ backupConfirmationToken: token }))).toBe(204);
    const after = t.uow.snapshot();
    expect(after.users.map((u) => u.id).sort()).not.toContain(ELENA);
    expect(Object.keys(after.sessions).sort()).toEqual(['ses-ana']);
    expect(after.pets.map((p) => p.id).sort()).toEqual(anaBefore.pets.map((p) => p.id).sort());
    expect(after.pets.some((p) => p.id === ELENA_PET.id)).toBe(false);
    expect((after.records.weights as Array<{ petId: string }>).some((w) => w.petId === ELENA_PET.id)).toBe(false);
    expect(after.households).toEqual(anaBefore.households);
    expect(after.memberships.some((m) => m.householdId === HOUSEHOLD_ELENA.id || m.userId === ELENA)).toBe(false);
    expect(after.memberships.filter((m) => m.householdId === HOUSEHOLD_ANA.id)).toHaveLength(2);
    expect(after.loginFailures['elena.solo']).toBeUndefined();
    expect(JSON.stringify(after)).not.toContain(ELENA);
    expect(JSON.stringify(after)).not.toContain('elena.solo');
    expect(await t.tokenUsable(ELENA, token)).toBe(false);
    expect(t.auditCalls).toEqual([`pseudonymOf:${ELENA}`, `recordAccountDeletion:${'f'.repeat(64)}`]);
  });

  it('[REQ-ACC-002][STATE-ACCOUNT-DELETE-001] el token es de un solo uso: tras eliminar la cuenta, el mismo token ya no sirve ni siquiera a otra persona', async () => {
    const t = setup();
    await t.session(ELENA, 'ses');
    const token = await t.issueToken(ELENA);
    await t.useCase.execute(ELENA, 'ses', input({ backupConfirmationToken: token }));
    await t.session(DIEGO, 'ses-diego');
    expect(await outcome(t.useCase.execute(DIEGO, 'ses-diego', input({ password: IDENTITY_PASSWORDS['diego.lector'], backupConfirmationToken: token })))).toBe('ERR-ACCOUNT-CONFIRMATION-MISMATCH');
  });

  it('[REQ-ACC-002][ERR-ACCOUNT-CONFIRMATION-MISMATCH] un token ajeno, caducado (10 min exactos) o reemplazado por uno nuevo responde MISMATCH y no cambia nada', async () => {
    const t = setup();
    await t.session(ELENA, 'ses');
    const alien = await t.issueToken(DIEGO);
    const stale = await t.issueToken(ELENA);
    const fresh = await t.issueToken(ELENA);
    const before = t.uow.snapshot();
    expect(await outcome(t.useCase.execute(ELENA, 'ses', input({ backupConfirmationToken: alien })))).toBe('ERR-ACCOUNT-CONFIRMATION-MISMATCH');
    expect(await outcome(t.useCase.execute(ELENA, 'ses', input({ backupConfirmationToken: stale })))).toBe('ERR-ACCOUNT-CONFIRMATION-MISMATCH');
    expect(t.uow.snapshot()).toEqual(before);
    t.clock.setClock(REFERENCE_TODAY, new Date(Date.parse(REFERENCE_NOW) + 10 * MINUTE).toISOString());
    expect(await outcome(t.useCase.execute(ELENA, 'ses', input({ backupConfirmationToken: fresh })))).toBe('ERR-ACCOUNT-CONFIRMATION-MISMATCH');
    t.clock.setClock(REFERENCE_TODAY, new Date(Date.parse(REFERENCE_NOW) + 10 * MINUTE - 1).toISOString());
    expect(await t.useCase.execute(ELENA, 'ses', input({ backupConfirmationToken: fresh }))).toBe(204);
    expect(t.auditCalls.filter((c) => c.startsWith('recordAccountDeletion'))).toHaveLength(1);
  });

  it('[REQ-ACC-002][STATE-ACCOUNT-DELETE-001][ERR-ACCOUNT-OWNS-SHARED-HOUSEHOLD] el propietario de un hogar con otro miembro ACTIVE no puede eliminar la cuenta y el rollback deja el token vigente', async () => {
    const t = setup();
    await t.session(ANA, 'ses-ana');
    const token = await t.issueToken(ANA);
    const before = t.uow.snapshot();
    const ana = { confirmationPhrase: CONFIRMATION_PHRASE, password: IDENTITY_PASSWORDS['ana.duena'], backupConfirmationToken: token };
    expect(await outcome(t.useCase.execute(ANA, 'ses-ana', ana))).toBe('ERR-ACCOUNT-OWNS-SHARED-HOUSEHOLD');
    expect([t.uow.snapshot(), await t.tokenUsable(ANA, token), t.auditCalls.filter((c) => c.startsWith('recordAccountDeletion'))]).toEqual([before, true, []]);
  });

  it('[REQ-ACC-002][STATE-ACCOUNT-DELETE-001] cuando el hogar queda con la propietaria como único miembro ACTIVE, la misma solicitud ya procede y elimina el hogar en cascada', async () => {
    const t = setup();
    await t.session(ANA, 'ses-ana');
    const token = await t.issueToken(ANA);
    const request = { confirmationPhrase: CONFIRMATION_PHRASE, password: IDENTITY_PASSWORDS['ana.duena'], backupConfirmationToken: token };
    expect(await outcome(t.useCase.execute(ANA, 'ses-ana', request))).toBe('ERR-ACCOUNT-OWNS-SHARED-HOUSEHOLD');
    await t.uow.runInTransaction(async (r) => {
      const bruno = (await r.households.listMemberships(HOUSEHOLD_ANA.id)).find((m) => m.userId === BRUNO)!;
      await r.households.saveMembership({ ...bruno, status: 'LEFT' });
    });
    expect(await t.useCase.execute(ANA, 'ses-ana', request)).toBe(204);
    const after = t.uow.snapshot();
    expect([after.households.map((h) => h.id), after.memberships.some((m) => m.householdId === HOUSEHOLD_ANA.id), after.pets.some((p) => p.ownerUserId === ANA)]).toEqual([[HOUSEHOLD_ELENA.id], false, false]);
  });

  it('[REQ-ACC-002][STATE-ACCOUNT-DELETE-001] un miembro que no es propietario elimina su cuenta sin afectar el hogar ni las mascotas de los demás', async () => {
    const t = setup();
    await t.session(BRUNO, 'ses-bruno');
    const token = await t.issueToken(BRUNO);
    expect(await t.useCase.execute(BRUNO, 'ses-bruno', { confirmationPhrase: CONFIRMATION_PHRASE, password: IDENTITY_PASSWORDS['bruno.admin'], backupConfirmationToken: token })).toBe(204);
    const after = t.uow.snapshot();
    expect([after.memberships.filter((m) => m.householdId === HOUSEHOLD_ANA.id).map((m) => m.userId), after.pets.filter((p) => p.ownerUserId === ANA).length]).toEqual([[ANA], ANA_PETS.length]);
  });

  describe('T249: bloqueo por mascotas asignadas a un hogar con otros miembros ACTIVE y relectura dentro de la transacción (B4, B5)', () => {
    const BRUNO_PET = { ...ELENA_PET, id: 'b0000000-0000-4000-8000-00000000000a', ownerUserId: BRUNO, name: 'Rocco' };
    const assignment = (petId: string, householdId: string, assignedByUserId: string) => ({ petId, householdId, assignedByUserId, assignedAt: '2026-03-03T10:00:00.000Z' });
    const brunoRequest = (token: string) => ({ confirmationPhrase: CONFIRMATION_PHRASE, password: IDENTITY_PASSWORDS['bruno.admin'], backupConfirmationToken: token });
    /** Estado base: Bruno es Propietario Legal de Rocco, asignada al hogar de Ana (con Ana ACTIVE). */
    function brunoState(householdId: string = HOUSEHOLD_ANA.id): MemoryState {
      const state = identityState();
      state.pets.push(structuredClone(BRUNO_PET));
      state.assignments.push(assignment(BRUNO_PET.id, householdId, BRUNO));
      return state;
    }

    it('[REQ-ACC-002][STATE-ACCOUNT-DELETE-001][SC-014][ERR-ACCOUNT-OWNS-SHARED-PETS] el Propietario Legal de una mascota asignada a un hogar con otro miembro ACTIVE no elimina la cuenta; el rollback deja todo idéntico y el token vigente', async () => {
      const t = setup(brunoState());
      await t.session(BRUNO, 'ses-bruno');
      const token = await t.issueToken(BRUNO);
      const before = t.uow.snapshot();
      expect(await outcome(t.useCase.execute(BRUNO, 'ses-bruno', brunoRequest(token)))).toBe('ERR-ACCOUNT-OWNS-SHARED-PETS');
      expect([t.uow.snapshot(), await t.tokenUsable(BRUNO, token), t.auditCalls.filter((c) => c.startsWith('recordAccountDeletion'))]).toEqual([before, true, []]);
    });

    it('[REQ-ACC-002][ERR-ACCOUNT-OWNS-SHARED-PETS] una asignación a un hogar ajeno (el usuario no es miembro) con otro miembro ACTIVE también bloquea', async () => {
      const t = setup(brunoState(HOUSEHOLD_ELENA.id));
      await t.session(BRUNO, 'ses-bruno');
      const token = await t.issueToken(BRUNO);
      expect(await outcome(t.useCase.execute(BRUNO, 'ses-bruno', brunoRequest(token)))).toBe('ERR-ACCOUNT-OWNS-SHARED-PETS');
    });

    it('[REQ-ACC-002][STATE-ACCOUNT-DELETE-001] la propietaria con otro miembro ACTIVE recibe primero el error de hogar (orden de errores de la máquina: B4 antes que B5)', async () => {
      const state = identityState();
      state.assignments.push(assignment(ANA_PETS[0]!.id, HOUSEHOLD_ANA.id, ANA));
      const t = setup(state);
      await t.session(ANA, 'ses-ana');
      const token = await t.issueToken(ANA);
      const request = { confirmationPhrase: CONFIRMATION_PHRASE, password: IDENTITY_PASSWORDS['ana.duena'], backupConfirmationToken: token };
      expect(await outcome(t.useCase.execute(ANA, 'ses-ana', request))).toBe('ERR-ACCOUNT-OWNS-SHARED-HOUSEHOLD');
    });

    it('[REQ-ACC-002][STATE-ACCOUNT-DELETE-001] una asignación a un hogar donde el usuario es el único ACTIVE no bloquea: el hogar y sus asignaciones se eliminan con la cuenta', async () => {
      const state = identityState();
      state.assignments.push(assignment(ELENA_PET.id, HOUSEHOLD_ELENA.id, ELENA));
      const t = setup(state);
      await t.session(ELENA, 'ses');
      const token = await t.issueToken(ELENA);
      expect(await t.useCase.execute(ELENA, 'ses', input({ backupConfirmationToken: token }))).toBe(204);
      const after = t.uow.snapshot();
      expect([after.assignments, after.households.map((h) => h.id), after.pets.some((p) => p.id === ELENA_PET.id)]).toEqual([[], [HOUSEHOLD_ANA.id], false]);
    });

    it('[REQ-ACC-002][STATE-ACCOUNT-DELETE-001] si los demás miembros ya no están ACTIVE (LEFT), la asignación no bloquea y se borra con la mascota', async () => {
      const state = brunoState();
      state.memberships = state.memberships.map((m) => (m.userId === ANA ? { ...m, status: 'LEFT' as const } : m));
      const t = setup(state);
      await t.session(BRUNO, 'ses-bruno');
      const token = await t.issueToken(BRUNO);
      expect(await t.useCase.execute(BRUNO, 'ses-bruno', brunoRequest(token))).toBe(204);
      const after = t.uow.snapshot();
      expect([after.assignments, after.pets.some((p) => p.id === BRUNO_PET.id), after.users.some((u) => u.id === BRUNO)]).toEqual([[], false, false]);
    });

    it('[STATE-ACCOUNT-DELETE-001][ERR-INTERNAL-UNEXPECTED] B6: si un hogar en cascada contiene una asignación de una mascota de otra persona, aborta sin borrar datos ajenos', async () => {
      const state = identityState();
      state.assignments.push(assignment(ANA_PETS[0]!.id, HOUSEHOLD_ELENA.id, ANA));
      const t = setup(state);
      await t.session(ELENA, 'ses');
      const token = await t.issueToken(ELENA);
      const before = t.uow.snapshot();
      expect(await outcome(t.useCase.execute(ELENA, 'ses', input({ backupConfirmationToken: token })))).toBe('ERR-INTERNAL-UNEXPECTED');
      expect([t.uow.snapshot(), await t.tokenUsable(ELENA, token)]).toEqual([before, true]);
    });

    it('[REQ-ACC-002][STATE-ACCOUNT-DELETE-001][ERR-ACCOUNT-OWNS-SHARED-PETS] relectura en la transacción: si entre la fase A y la B otra persona pasa a ACTIVE en el hogar de la asignación, B5 la detecta y revierte', async () => {
      const state = brunoState();
      state.memberships = state.memberships.map((m) => (m.userId === ANA ? { ...m, status: 'LEFT' as const } : m));
      let racing: RacingUnitOfWork | undefined;
      const t = setup(state, (inner) => (racing = joinBetweenPhases(inner, HOUSEHOLD_ANA.id, ANA)));
      await t.session(BRUNO, 'ses-bruno');
      const token = await t.issueToken(BRUNO);
      racing!.arm();
      const before = t.uow.snapshot();
      expect(await outcome(t.useCase.execute(BRUNO, 'ses-bruno', brunoRequest(token)))).toBe('ERR-ACCOUNT-OWNS-SHARED-PETS');
      const after = t.uow.snapshot();
      expect([after.pets, after.assignments, after.users, await t.tokenUsable(BRUNO, token)]).toEqual([before.pets, before.assignments, before.users, true]);
    });

    it('[REQ-ACC-002][STATE-ACCOUNT-DELETE-001][ERR-ACCOUNT-OWNS-SHARED-HOUSEHOLD] relectura en la transacción: si entre la fase A y la B una persona pasa a ACTIVE en el hogar de la propietaria, B4 la detecta y revierte', async () => {
      let racing: RacingUnitOfWork | undefined;
      const t = setup(identityState(), (inner) => (racing = joinBetweenPhases(inner, HOUSEHOLD_ELENA.id, DIEGO)));
      await t.session(ELENA, 'ses');
      const token = await t.issueToken(ELENA);
      racing!.arm();
      expect(await outcome(t.useCase.execute(ELENA, 'ses', input({ backupConfirmationToken: token })))).toBe('ERR-ACCOUNT-OWNS-SHARED-HOUSEHOLD');
      const after = t.uow.snapshot();
      expect([after.users.some((u) => u.id === ELENA), after.pets.some((p) => p.id === ELENA_PET.id), await t.tokenUsable(ELENA, token)]).toEqual([true, true, true]);
    });
  });

  it('[REQ-ACC-002][STATE-ACCOUNT-DELETE-001][ERR-INTERNAL-UNEXPECTED] una falla a mitad de la fase B revierte todo: estado idéntico, token vigente, sin fila de auditoría ni seudonimización parcial', async () => {
    for (const failAt of ['pets', 'memberships', 'households', 'users'] as const) {
      const t = setup(identityState(), (inner) => failingUow(inner, failAt));
      await t.session(ELENA, 'ses');
      const token = await t.issueToken(ELENA);
      const before = t.uow.snapshot();
      await expect(t.useCase.execute(ELENA, 'ses', input({ backupConfirmationToken: token })), failAt).rejects.toThrow(`fallo inyectado en ${failAt}`);
      expect([t.uow.snapshot(), await t.tokenUsable(ELENA, token)]).toEqual([before, true]);
    }
  });

  it('[REQ-ACC-002][STATE-ACCOUNT-DELETE-001] si la sesión o la cuenta desaparecen entre la fase A y la B (petición simultánea) se aborta con ERR-AUTH-UNAUTHENTICATED sin cambios', async () => {
    const t = setup();
    const token = await t.issueToken(ELENA);
    const before = t.uow.snapshot();
    expect(await outcome(t.useCase.execute(ELENA, 'sesion-inexistente', input({ backupConfirmationToken: token })))).toBe('ERR-AUTH-UNAUTHENTICATED');
    expect(t.uow.snapshot()).toEqual(before);
  });

  it('[REQ-ACC-002][INV-AUTH-003] la contraseña se verifica con el hash almacenado y nunca se guarda ni se devuelve', async () => {
    const t = setup();
    await t.session(ELENA, 'ses');
    const token = await t.issueToken(ELENA);
    await t.useCase.execute(ELENA, 'ses', input({ backupConfirmationToken: token }));
    expect(t.hasher.calls).toEqual([{ method: 'verify', plain: ELENA_PASSWORD, hash: `${FAKE_HASH_PREFIX}${ELENA_PASSWORD}` }]);
    expect(JSON.stringify(t.uow.snapshot())).not.toContain(ELENA_PASSWORD);
  });
});

/** UnitOfWork que falla al borrar en el repositorio indicado (simula un error de almacenamiento a mitad de la transacción). */
function failingUow(inner: InMemoryUnitOfWork, failAt: 'pets' | 'memberships' | 'households' | 'users'): UnitOfWorkPort {
  const guard = (target: object, method: string) =>
    new Proxy(target, {
      get(object, property, receiver) {
        const value = Reflect.get(object, property, receiver) as unknown;
        if (property !== method || typeof value !== 'function') return value;
        return async () => {
          throw new Error(`fallo inyectado en ${failAt}.${method}`);
        };
      },
    });
  const methodOf = { pets: 'delete', memberships: 'deleteMembershipsOfUser', households: 'deleteWithMemberships', users: 'delete' } as const;
  return {
    runInTransaction: <T>(work: (repositories: RepositorySet) => Promise<T>) =>
      inner.runInTransaction((repositories) => {
        const repoKey = failAt === 'memberships' ? 'households' : failAt;
        const wrapped = { ...repositories, [repoKey]: guard(repositories[repoKey], methodOf[failAt]) } as RepositorySet;
        return work(wrapped);
      }),
  };
}

interface RacingUnitOfWork extends UnitOfWorkPort {
  /** A partir de aquí, la segunda transacción (fase B) se precede de la alta simultánea. */
  arm(): void;
}

/**
 * UnitOfWork que, justo antes de la segunda transacción posterior a `arm()` (la fase B de DeleteAccountUseCase tras
 * la verificación de la fase A), deja ACTIVE a `userId` en `householdId` en una transacción propia: simula la petición simultánea.
 */
function joinBetweenPhases(inner: InMemoryUnitOfWork, householdId: string, userId: string): RacingUnitOfWork {
  let armed = false;
  let calls = 0;
  return {
    arm: () => {
      armed = true;
    },
    runInTransaction: async <T>(work: (repositories: RepositorySet) => Promise<T>) => {
      if (armed) {
        calls += 1;
        if (calls === 2) {
          await inner.runInTransaction(async (r) => {
            const rows = await r.households.listMemberships(householdId);
            const existing = rows.find((m) => m.userId === userId);
            await r.households.saveMembership(
              existing === undefined
                ? { membershipId: 'd0000000-0000-4000-8000-0000000000ff', householdId, userId, role: 'MEMBER', status: 'ACTIVE', invitedByUserId: null, invitedAt: null, joinedAt: REFERENCE_NOW, firstJoinedAt: REFERENCE_NOW, updatedAt: REFERENCE_NOW }
                : { ...existing, status: 'ACTIVE' },
            );
          });
        }
      }
      return inner.runInTransaction(work);
    },
  };
}
