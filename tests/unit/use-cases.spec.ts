import { describe, expect, it } from 'vitest';
import { DomainError } from '../../src/generated/index.ts';
import {
  AuthenticateRequestUseCase,
  GetCurrentSessionUseCase,
  LoginUseCase,
  LogoutUseCase,
  RegisterUserUseCase,
} from '../../src/application/use-cases/auth-use-cases.ts';
import {
  DeletePetUseCase,
  GetPetDashboardUseCase,
  ListMyPetsUseCase,
  RegisterPetUseCase,
  UpdatePetUseCase,
} from '../../src/application/use-cases/pet-use-cases.ts';
import {
  AddBodyMeasurementUseCase,
  AddCustomParameterUseCase,
  AddDewormingUseCase,
  AddMedicalVisitUseCase,
  AddVaccinationUseCase,
  AddWeightRecordUseCase,
} from '../../src/application/use-cases/record-use-cases.ts';
import type { ApplicationDeps } from '../../src/application/use-cases/use-case-support.ts';
import {
  ANDRES,
  ARGOS,
  CARLOS,
  LUCIA,
  MARIA,
  PASSWORDS,
  USERS,
  canonicalState,
  createHarness,
  envelope,
  fixtures,
  generatedId,
} from '../fixtures/application-harness.ts';
import { DUMMY_PASSWORD_HASH, FAKE_HASH_PREFIX } from '../fixtures/test-doubles.ts';

const NOW = '2026-11-05T12:00:00.000Z';
const IDLE_AT = '2026-11-05T12:30:00.000Z';
const ABSOLUTE_AT = '2026-11-06T12:00:00.000Z';
const MISSING_PET = '11111111-1111-4111-8111-111111111999';
const edge = (prefix: string) => fixtures.invalidEdgeCases.find((c: { caseId: string }) => c.caseId.startsWith(prefix));
const publicUser = (id: string) => USERS.find((u) => u.id === id)!;
const selfProfile = (id: string) => ({ ...publicUser(id), email: null, preferredLanguage: 'es', timezone: 'America/Bogota' });

async function outcome(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
    return 'OK';
  } catch (error) {
    if (error instanceof DomainError) return `${error.code}@${String(error.field)}`;
    throw error;
  }
}

async function failure(promise: Promise<unknown>): Promise<DomainError> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof DomainError) return error;
    throw error;
  }
  throw new Error('se esperaba un DomainError');
}

describe('autenticación (src/application/use-cases/auth-use-cases.ts)', () => {
  it('[REQ-AUTH2-001][INV-ARCH-002] registra con el username exacto, guarda solo el hash y abre una sesión con lastActivityAt y tope de 24 h', async () => {
    const { deps, uow, hasher } = createHarness();
    const result = await new RegisterUserUseCase(deps).execute({ username: 'sofia.m', displayName: 'Sofía', password: 'Clave2026x!', confirmPassword: 'Clave2026x!' });
    const sofia = { id: generatedId(1), username: 'sofia.m', displayName: 'Sofía', createdAt: NOW };
    expect(result).toEqual({
      sessionToken: 'token-0001',
      session: { user: { ...sofia, email: null, preferredLanguage: 'es', timezone: 'America/Bogota' }, createdAt: NOW, lastActivityAt: NOW, idleExpiresAt: IDLE_AT, absoluteExpiresAt: ABSOLUTE_AT },
    });
    const state = uow.snapshot();
    expect(state.users.find((u) => u.id === sofia.id)).toEqual({ ...sofia, email: null, preferredLanguage: 'es', timezone: 'America/Bogota', passwordHash: `${FAKE_HASH_PREFIX}Clave2026x!` });
    expect(state.sessions['token-0001']).toEqual({ userId: sofia.id, createdAt: NOW, lastActivityAt: NOW, revokedAt: null });
    expect(hasher.calls).toEqual([{ method: 'hash', plain: 'Clave2026x!', hash: null }]);
  });

  it('[REQ-AUTH2-001][ERR-AUTH-USERNAME-TAKEN] "andres" ya existe y no se guarda nada; "ANDRES" (EDGE-010) ya no se normaliza: es un error de esquema', async () => {
    const { deps, uow } = createHarness();
    const register = new RegisterUserUseCase(deps);
    const password = { password: 'Clave2026x!', confirmPassword: 'Clave2026x!' };
    expect(await outcome(register.execute({ username: 'andres', displayName: 'Otro', ...password }))).toBe('ERR-AUTH-USERNAME-TAKEN@username');
    expect(await outcome(register.execute({ username: edge('EDGE-010-').payload.username, displayName: 'Otro', ...password }))).toBe('ERR-SCHEMA-VALIDATION-FAILED@username');
    expect(uow.snapshot()).toEqual(canonicalState());
  });

  it('[REQ-AUTH2-001] contraseña débil da ERR-AUTH-WEAK-PASSWORD; contraseña ausente o confirmación distinta, ERR-SCHEMA-VALIDATION-FAILED', async () => {
    const { deps, uow, hasher } = createHarness();
    const register = new RegisterUserUseCase(deps);
    expect(await outcome(register.execute({ username: 'nuevo', displayName: 'Nuevo', password: 'sindigitos', confirmPassword: 'sindigitos' }))).toBe('ERR-AUTH-WEAK-PASSWORD@password');
    expect(await outcome(register.execute({ username: 'nuevo', displayName: 'Nuevo' }))).toBe('ERR-SCHEMA-VALIDATION-FAILED@password');
    expect(await outcome(register.execute({ username: 'nuevo', displayName: 'Nuevo', password: 'Clave2026x!', confirmPassword: 'Clave2026y!' }))).toBe('ERR-SCHEMA-VALIDATION-FAILED@confirmPassword');
    expect([uow.snapshot(), hasher.calls]).toEqual([canonicalState(), []]);
  });

  it('[REQ-AUTH2-002] login correcto con el username exacto: abre sesión con lastActivityAt y vacía los fallos previos; "ANDRES" no entra', async () => {
    const state = canonicalState();
    state.loginFailures['andres'] = ['2026-11-05T11:58:00.000Z', '2026-11-05T11:59:00.000Z'];
    const { deps, uow } = createHarness(state);
    const login = new LoginUseCase(deps);
    expect(await outcome(login.execute({ username: 'ANDRES', password: PASSWORDS['andres'] }))).toBe('ERR-AUTH-INVALID-CREDENTIALS@null');
    const result = await login.execute({ username: 'andres', password: PASSWORDS['andres'] });
    expect(result).toEqual({
      sessionToken: 'token-0001',
      session: { user: selfProfile(ANDRES), createdAt: NOW, lastActivityAt: NOW, idleExpiresAt: IDLE_AT, absoluteExpiresAt: ABSOLUTE_AT },
    });
    expect([uow.snapshot().loginFailures['andres'], uow.snapshot().sessions['token-0001']]).toEqual([[], { userId: ANDRES, createdAt: NOW, lastActivityAt: NOW, revokedAt: null }]);
  });

  it('[INV-AUTH-006][REQ-AUTH2-002] EDGE-012/EDGE-032: usuario inexistente y contraseña errónea dan el mismo error y una sola llamada a verify, la primera contra el hash ficticio', async () => {
    const { deps, hasher, uow } = createHarness();
    const login = new LoginUseCase(deps);
    const unknown = await failure(login.execute({ username: 'nadie.x', password: 'wrong-1234' }));
    const unknownCalls = [...hasher.calls];
    hasher.reset();
    const wrong = await failure(login.execute({ username: 'andres', password: 'wrong-1234' }));
    expect([unknown.code, unknown.status, unknown.message, unknown.field]).toEqual([wrong.code, wrong.status, wrong.message, wrong.field]);
    expect(unknown.code).toBe(edge('EDGE-012-').expectedError);
    expect(unknownCalls).toEqual([{ method: 'verify', plain: 'wrong-1234', hash: DUMMY_PASSWORD_HASH }]);
    expect(hasher.calls).toEqual([{ method: 'verify', plain: 'wrong-1234', hash: `${FAKE_HASH_PREFIX}${PASSWORDS['andres']}` }]);
    expect([uow.snapshot().loginFailures['nadie.x'], uow.snapshot().loginFailures['andres'], uow.snapshot().sessions]).toEqual([[NOW], [NOW], {}]);
  });

  it('[REQ-AUTH2-002][INV-AUTH-006] EDGE-028: 4 fallos, éxito y 4 fallos más; ninguno se bloquea y los fallos quedan confirmados', async () => {
    const { deps, clock, uow } = createHarness();
    const login = new LoginUseCase(deps);
    const results: string[] = [];
    for (const step of edge('EDGE-028-').timeline as Array<{ at: string; username: string; password: string; expectedError?: string }>) {
      clock.setClock('2026-11-05', step.at);
      results.push(await outcome(login.execute({ username: step.username, password: step.password })));
    }
    expect(results).toEqual(['ERR-AUTH-INVALID-CREDENTIALS@null', 'ERR-AUTH-INVALID-CREDENTIALS@null', 'ERR-AUTH-INVALID-CREDENTIALS@null', 'ERR-AUTH-INVALID-CREDENTIALS@null', 'OK', ...Array(4).fill('ERR-AUTH-INVALID-CREDENTIALS@null')]);
    expect(uow.snapshot().loginFailures['maria.v']).toEqual(['2026-11-05T12:00:05.000Z', '2026-11-05T12:00:06.000Z', '2026-11-05T12:00:07.000Z', '2026-11-05T12:00:08.000Z']);
  });

  it('[REQ-AUTH2-002] EDGE-013/EDGE-029: con 5 fallos en 15 minutos el 6.º intento se bloquea aunque la contraseña sea correcta, sin verificar ni registrarse', async () => {
    const state = canonicalState();
    const failures = ['11:46:00', '11:50:00', '11:55:00', '11:58:00', '11:59:59'].map((t) => `2026-11-05T${t}.000Z`);
    state.loginFailures['andres'] = failures;
    const { deps, hasher, uow } = createHarness(state);
    expect(await outcome(new LoginUseCase(deps).execute({ username: 'andres', password: PASSWORDS['andres'] }))).toBe(`${edge('EDGE-013-').expectedError}@username`);
    expect([hasher.calls, uow.snapshot().loginFailures['andres'], uow.snapshot().sessions]).toEqual([[], failures, {}]);
  });

  it('[REQ-AUTH2-002] una entrada de login sin contraseña, con propiedades extra o con tipos erróneos es ERR-SCHEMA-VALIDATION-FAILED y no verifica', async () => {
    const { deps, hasher } = createHarness();
    const login = new LoginUseCase(deps);
    expect(await outcome(login.execute({ username: 'andres' }))).toBe('ERR-SCHEMA-VALIDATION-FAILED@password');
    expect(await outcome(login.execute({ username: 'andres', password: 'x', otp: '1' }))).toBe('ERR-SCHEMA-VALIDATION-FAILED@otp');
    expect(await outcome(login.execute(null))).toBe('ERR-SCHEMA-VALIDATION-FAILED@null');
    expect(await outcome(login.execute({ username: 5, password: 'x' }))).toBe('ERR-SCHEMA-VALIDATION-FAILED@username');
    expect([(await failure(login.execute({ username: 'andres' }))).message, (await failure(login.execute(null))).message]).toEqual([
      "[ERR-SCHEMA-VALIDATION-FAILED] LoginInput: password must have required property 'password'.",
      '[ERR-SCHEMA-VALIDATION-FAILED] LoginInput: (raíz) must be object.',
    ]);
    expect(hasher.calls).toEqual([]);
  });

  it('[INV-AUTH-006][REQ-AUTH2-002] el hash ficticio nunca autentica: un username inexistente con la contraseña que coincide con él sigue siendo ERR-AUTH-INVALID-CREDENTIALS', async () => {
    const { deps, hasher, uow } = createHarness();
    const dummyPlain = DUMMY_PASSWORD_HASH.slice(FAKE_HASH_PREFIX.length);
    expect(await outcome(new LoginUseCase(deps).execute({ username: 'nadie.x', password: dummyPlain }))).toBe('ERR-AUTH-INVALID-CREDENTIALS@null');
    expect([hasher.calls, uow.snapshot().sessions]).toEqual([[{ method: 'verify', plain: dummyPlain, hash: DUMMY_PASSWORD_HASH }], {}]);
  });

  it('[REQ-AUTH-003] LOGOUT revoca la sesión vigente y responde 204; repetirlo, sin token, con token desconocido, expirado o inactivo no cambia nada (D-04)', async () => {
    const state = canonicalState();
    state.sessions = {
      vigente: { userId: ANDRES, createdAt: NOW, lastActivityAt: NOW, revokedAt: null },
      expirada: { userId: MARIA, createdAt: '2026-11-03T12:00:00.000Z', lastActivityAt: '2026-11-05T11:59:00.000Z', revokedAt: null },
      inactiva: { userId: MARIA, createdAt: '2026-11-05T10:00:00.000Z', lastActivityAt: '2026-11-05T10:00:00.000Z', revokedAt: null },
    };
    const { deps, uow } = createHarness(state);
    const logout = new LogoutUseCase(deps);
    expect(await logout.execute('vigente')).toBe(204);
    const afterFirst = uow.snapshot().sessions;
    expect(afterFirst['vigente']).toEqual({ userId: ANDRES, createdAt: NOW, lastActivityAt: NOW, revokedAt: NOW });
    expect([await logout.execute('vigente'), await logout.execute(null), await logout.execute('desconocido'), await logout.execute('expirada'), await logout.execute('inactiva')]).toEqual([204, 204, 204, 204, 204]);
    expect(uow.snapshot().sessions).toEqual(afterFirst);
  });

  it('[REQ-AUTH-004][INV-AUTH2-002][INV-ARCH-001] la sesión vale 30 min deslizantes y 24 h absolutas medidos con ClockPort y solo la petición válida renueva; sin token, revocada o vencida es ERR-AUTH-UNAUTHENTICATED', async () => {
    const state = canonicalState();
    state.sessions = {
      t1: { userId: ANDRES, createdAt: NOW, lastActivityAt: NOW, revokedAt: null },
      revocada: { userId: ANDRES, createdAt: NOW, lastActivityAt: NOW, revokedAt: NOW },
    };
    const { deps, clock, uow } = createHarness(state);
    const authenticate = new AuthenticateRequestUseCase(deps);
    const current = new GetCurrentSessionUseCase(deps);
    expect(await authenticate.execute('t1')).toBe(ANDRES);
    clock.setClock('2026-11-05', '2026-11-05T12:29:59.999Z');
    expect(await authenticate.execute('t1')).toBe(ANDRES);
    expect(uow.snapshot().sessions['t1']!.lastActivityAt).toBe('2026-11-05T12:29:59.999Z');
    clock.setClock('2026-11-05', '2026-11-05T12:59:59.000Z');
    expect(await current.execute('t1')).toEqual({ user: selfProfile(ANDRES), createdAt: NOW, lastActivityAt: '2026-11-05T12:29:59.999Z', idleExpiresAt: '2026-11-05T12:59:59.999Z', absoluteExpiresAt: ABSOLUTE_AT });
    clock.setClock('2026-11-05', '2026-11-05T13:00:00.000Z');
    expect(await Promise.all([authenticate.execute('t1'), current.execute('t1'), authenticate.execute(null), current.execute('revocada'), authenticate.execute('desconocido')].map(outcome))).toEqual(
      Array(5).fill('ERR-AUTH-UNAUTHENTICATED@null'),
    );
    expect(uow.snapshot().sessions['t1']!.lastActivityAt).toBe('2026-11-05T12:29:59.999Z');
  });

  it('[REQ-AUTH-004] una sesión cuyo usuario ya no existe no devuelve sesión actual', async () => {
    const state = canonicalState();
    state.sessions = { huerfana: { userId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa99', createdAt: NOW, lastActivityAt: NOW, revokedAt: null } };
    const { deps } = createHarness(state);
    expect(await outcome(new GetCurrentSessionUseCase(deps).execute('huerfana'))).toBe('ERR-AUTH-UNAUTHENTICATED@null');
  });
});

describe('mascotas (src/application/use-cases/pet-use-cases.ts)', () => {
  const ROCKY = { name: 'Rocky', species: 'CANINE', breed: 'Mestizo', birthDate: '2024-06-01', sex: 'MALE' };

  it('[REQ-PET-001][INV-ARCH-001][INV-ARCH-002] registra una 6.ª mascota sin cupo (EDGE-001) con id, dueño y fechas de los puertos', async () => {
    const { deps, uow } = createHarness();
    const pet = await new RegisterPetUseCase(deps).execute(ANDRES, ROCKY);
    expect(pet).toEqual({ ...ROCKY, id: generatedId(1), ownerUserId: ANDRES, speciesOther: null, birthDateIsEstimate: false, neutered: null, microchipId: null, avatarUrl: null, createdAt: NOW, updatedAt: NOW });
    expect(uow.snapshot().pets.filter((p) => p.ownerUserId === ANDRES).length).toBe(6);
  });

  it('[REQ-PET-001] una entrada inválida o una fecha futura no guarda nada', async () => {
    const { deps, uow } = createHarness();
    const register = new RegisterPetUseCase(deps);
    expect(await outcome(register.execute(ANDRES, { ...ROCKY, birthDate: '2026-11-06' }))).toBe('ERR-PET-FUTURE-BIRTHDATE@birthDate');
    expect(await outcome(register.execute(ANDRES, { ...ROCKY, ownerUserId: MARIA }))).toBe('ERR-SCHEMA-VALIDATION-FAILED@ownerUserId');
    expect(uow.snapshot()).toEqual(canonicalState());
  });

  it('[REQ-PET-001][INV-ACC-002][ERR-ACC-FORBIDDEN][ERR-PET-NOT-FOUND] solo el dueño edita: María (hogar ACTIVE) recibe 403; Carlos, Lucía y una mascota inexistente, 404', async () => {
    const { deps, uow } = createHarness();
    const update = new UpdatePetUseCase(deps);
    expect(await update.execute(ANDRES, ARGOS.id, { name: 'Argos Magno' })).toEqual({ ...ARGOS, name: 'Argos Magno', updatedAt: NOW });
    expect(uow.snapshot().pets.find((p) => p.id === ARGOS.id)!.name).toBe('Argos Magno');
    expect(
      await Promise.all([
        outcome(update.execute(MARIA, ARGOS.id, { name: 'X' })),
        outcome(update.execute(CARLOS, ARGOS.id, { name: 'X' })),
        outcome(update.execute(LUCIA, ARGOS.id, { name: 'X' })),
        outcome(update.execute(ANDRES, MISSING_PET, { name: 'X' })),
        outcome(update.execute(MARIA, ARGOS.id, { name: '' })),
      ]),
    ).toEqual(['ERR-ACC-FORBIDDEN@petId', 'ERR-PET-NOT-FOUND@petId', 'ERR-PET-NOT-FOUND@petId', 'ERR-PET-NOT-FOUND@petId', 'ERR-ACC-FORBIDDEN@petId']);
  });

  it('[REQ-PET-001] UpdatePet aplica INV-PET-006 con los registros de la mascota: el primero de Argos es del 2025-11-12', async () => {
    const { deps } = createHarness();
    const update = new UpdatePetUseCase(deps);
    expect(await outcome(update.execute(ANDRES, ARGOS.id, { birthDate: '2025-11-13' }))).toBe('ERR-PET-BIRTHDATE-AFTER-RECORDS@birthDate');
    expect((await update.execute(ANDRES, ARGOS.id, { birthDate: '2025-11-12' })).birthDate).toBe('2025-11-12');
    expect(await outcome(update.execute(ANDRES, ARGOS.id, { ownerUserId: MARIA }))).toBe('ERR-SCHEMA-VALIDATION-FAILED@ownerUserId');
  });

  it('[REQ-PET-004][ERR-ACC-FORBIDDEN][ERR-PET-NOT-FOUND] solo el dueño borra la mascota con sus 6 colecciones; los registros de otras mascotas quedan', async () => {
    const { deps, uow } = createHarness();
    const remove = new DeletePetUseCase(deps);
    expect([await outcome(remove.execute(MARIA, ARGOS.id)), await outcome(remove.execute(CARLOS, ARGOS.id))]).toEqual(['ERR-ACC-FORBIDDEN@petId', 'ERR-PET-NOT-FOUND@petId']);
    expect(await remove.execute(ANDRES, ARGOS.id)).toBe(204);
    const state = uow.snapshot();
    const left = Object.values(state.records).flat() as Array<{ petId: string }>;
    const expected = Object.values(envelope.records).flat().filter((r) => (r as { petId: string }).petId !== ARGOS.id);
    expect([state.pets.some((p) => p.id === ARGOS.id), left.some((r) => r.petId === ARGOS.id), left.length]).toEqual([false, false, expected.length]);
  });

  it('[REQ-PET-004][INV-ARCH-005] si la confirmación falla, la mascota y sus registros siguen intactos y se propaga el error', async () => {
    const commitFailure = new Error('fallo simulado en commit');
    const { deps, uow } = createHarness(canonicalState(), {
      beforeCommit: () => {
        throw commitFailure;
      },
    });
    let caught: unknown = null;
    try {
      await new DeletePetUseCase(deps).execute(ANDRES, ARGOS.id);
    } catch (error) {
      caught = error;
    }
    expect([caught, uow.snapshot()]).toEqual([commitFailure, canonicalState()]);
  });

  it('[REQ-PET-005][REQ-PET-002] Mis mascotas: propias y visibles por asignación, por nombre, con owner sin color (EDGE-030), edad, alertas y último peso', async () => {
    const { deps } = createHarness();
    const cards = await new ListMyPetsUseCase(deps).execute(ANDRES);
    const expectedOwner = edge('EDGE-030-').expectedOwner;
    const mariaOwner = { userId: MARIA, displayName: 'María', colorToken: null };
    expect(cards.map((c) => [c.profile.name, c.owner, c.myRole, c.permissions.editPetBasics])).toEqual([
      ['Argos', expectedOwner, 'OWNER', true],
      ['Kira', expectedOwner, 'OWNER', true],
      ['Luna', mariaOwner, 'ADMIN', true],
      ['Milo', expectedOwner, 'OWNER', true],
      ['Nyx', expectedOwner, 'OWNER', true],
      ['Toby', expectedOwner, 'OWNER', true],
    ]);
    const argos = cards[0]!;
    expect([argos.computedAge, argos.alertsSummary, argos.latestWeightKg]).toEqual([
      { years: 4, months: 5, totalDays: 1640 },
      { overdueCount: 0, dueSoonCount: 1, upToDateCount: 0, totalActiveAlerts: 1 },
      32.85,
    ]);
    expect(cards.map((c) => [c.alertsSummary.totalActiveAlerts, c.latestWeightKg])).toEqual([[1, 32.85], [0, null], [0, null], [0, null], [1, null], [0, null]]);
    expect((await new ListMyPetsUseCase(deps).execute(MARIA)).map((c) => [c.profile.name, c.myRole, c.permissions.editPetBasics])).toEqual([
      ['Argos', 'READER', false],
      ['Kira', 'READER', false],
      ['Luna', 'OWNER', true],
      ['Milo', 'READER', false],
      ['Nyx', 'READER', false],
      ['Toby', 'READER', false],
    ]);
  });

  it('[REQ-PET-005] el filtro q ignora mayúsculas y tildes y species filtra por especie', async () => {
    const state = canonicalState();
    state.pets.push({ ...ARGOS, id: '11111111-1111-4111-8111-111111111106', name: 'Ñandú' });
    const { deps } = createHarness(state);
    const list = new ListMyPetsUseCase(deps);
    const names = async (q: { q?: string; species?: 'CANINE' | 'FELINE' }) => (await list.execute(ANDRES, q as never)).map((c) => c.profile.name);
    expect([await names({ q: 'ARG' }), await names({ q: 'nandu' }), await names({ species: 'FELINE' }), await names({ q: 'i', species: 'CANINE' })]).toEqual([
      ['Argos'],
      ['Ñandú'],
      ['Luna', 'Milo', 'Nyx'],
      ['Kira'],
    ]);
  });

  it('[REQ-PET-003][INV-ACC-001][ERR-PET-NOT-FOUND] ficha: el dueño y María (hogar ACTIVE) la leen; Carlos (INVITED), Lucía y una mascota inexistente reciben 404', async () => {
    const { deps } = createHarness();
    const dashboard = new GetPetDashboardUseCase(deps);
    const mine = await dashboard.execute(ANDRES, ARGOS.id);
    expect([mine.permissions.editPetBasics, (await dashboard.execute(MARIA, ARGOS.id)).permissions.editPetBasics, mine.owner]).toEqual([true, false, { userId: ANDRES, displayName: 'Andrés', colorToken: null }]);
    expect(
      await Promise.all([outcome(dashboard.execute(CARLOS, ARGOS.id)), outcome(dashboard.execute(LUCIA, ARGOS.id)), outcome(dashboard.execute(ANDRES, MISSING_PET))]),
    ).toEqual(Array(3).fill(`${edge('EDGE-008-').expectedError}@petId`));
  });

  it('[REQ-PET-003][REQ-PET-002] la ficha trae los 6 módulos de la mascota en orden INV-SORT-001, con deltas y alertas, y nada de otras mascotas', async () => {
    const { deps } = createHarness();
    const view = await new GetPetDashboardUseCase(deps).execute(ANDRES, ARGOS.id);
    const r = envelope.records;
    expect(view.weights).toEqual([
      { record: r.weights[1], deltaKg: 0.45 },
      { record: r.weights[0], deltaKg: null },
    ]);
    expect(view.vaccinations.map((v) => [v.record.id, v.alert!.status, v.alert!.daysRemaining])).toEqual([[r.vaccinations[0]!.id, 'DUE_SOON', 7]]);
    expect([view.bodyMeasurements, view.dewormings, view.medicalVisits, view.customParameters]).toEqual([r.bodyMeasurements, [], [], r.customParameters]);
    expect([view.profile, view.computedAge, view.alertsSummary.totalActiveAlerts]).toEqual([ARGOS, { years: 4, months: 5, totalDays: 1640 }, 1]);
  });
});

describe('especies, microchip y peso por especie en los casos de uso (REQ-PET2-001, INV-PET2-001, INV-REC2-002)', () => {
  const RABBIT = { name: 'Nube', species: 'RABBIT', breed: 'Cabeza de león', birthDate: '2024-01-10', sex: 'MALE' };
  const CHIP = '981020000000001';

  it('[INV-PET2-001][REQ-PET2-001] registra una mascota OTHER con speciesOther y neutered y la edita a otra especie limpiando speciesOther', async () => {
    const { deps } = createHarness();
    const pet = await new RegisterPetUseCase(deps).execute(ANDRES, { ...RABBIT, species: 'OTHER', speciesOther: 'Erizo africano', neutered: false });
    expect([pet.species, pet.speciesOther, pet.neutered]).toEqual(['OTHER', 'Erizo africano', false]);
    const back = await new UpdatePetUseCase(deps).execute(ANDRES, pet.id, { species: 'FERRET', speciesOther: null });
    expect([back.species, back.speciesOther]).toEqual(['FERRET', null]);
    expect(await outcome(new UpdatePetUseCase(deps).execute(ANDRES, pet.id, { species: 'OTHER', speciesOther: null }))).toBe('ERR-SCHEMA-VALIDATION-FAILED@speciesOther');
  });

  it('[REQ-PET2-001][ERR-PET-MICROCHIP-DUPLICATE] el microchip repetido del mismo propietario se rechaza sin guardar nada; otra cuenta puede usarlo; editar la misma mascota no choca', async () => {
    const { deps, uow } = createHarness();
    const register = new RegisterPetUseCase(deps);
    const first = await register.execute(ANDRES, { ...RABBIT, microchipId: CHIP });
    const before = uow.snapshot();
    expect(await outcome(register.execute(ANDRES, { ...RABBIT, name: 'Otra', microchipId: CHIP }))).toBe('ERR-PET-MICROCHIP-DUPLICATE@microchipId');
    expect(uow.snapshot()).toEqual(before);
    expect(await outcome(new UpdatePetUseCase(deps).execute(ANDRES, ARGOS.id, { microchipId: CHIP }))).toBe('ERR-PET-MICROCHIP-DUPLICATE@microchipId');
    expect(await outcome(new UpdatePetUseCase(deps).execute(ANDRES, first.id, { microchipId: CHIP, name: 'Nube II' }))).toBe('OK');
    expect(await outcome(register.execute(MARIA, { ...RABBIT, microchipId: CHIP }))).toBe('OK');
    expect(await outcome(register.execute(ANDRES, { ...RABBIT, name: 'Sin chip' }))).toBe('OK');
    expect(await outcome(register.execute(ANDRES, { ...RABBIT, name: 'Sin chip 2' }))).toBe('OK');
  });

  it('[REQ-PET2-001][INV-PET-006] estimatedAge usa ClockPort: el servidor convierte años y meses a birthDate y marca la estimación', async () => {
    const { deps } = createHarness();
    const { birthDate: _b, ...noBirth } = RABBIT;
    const pet = await new RegisterPetUseCase(deps).execute(ANDRES, { ...noBirth, estimatedAge: { years: 1, months: 6 } });
    expect([pet.birthDate, pet.birthDateIsEstimate]).toEqual(['2025-05-05', true]);
  });

  it('[REQ-PET2-002] el listado filtra por grupo (CANINE, FELINE, OTHERS, ALL) y por alertas activas, además de q', async () => {
    const state = canonicalState();
    state.pets.push({ ...ARGOS, id: '11111111-1111-4111-8111-111111111106', name: 'Nube', species: 'RABBIT' }, { ...ARGOS, id: '11111111-1111-4111-8111-111111111107', name: 'Piolín', species: 'BIRD' });
    const { deps } = createHarness(state);
    const list = new ListMyPetsUseCase(deps);
    const names = async (q: object) => (await list.execute(ANDRES, q as never)).map((c) => c.profile.name);
    expect([await names({ filter: 'OTHERS' }), await names({ filter: 'FELINE' }), await names({ filter: 'CANINE' }), (await names({ filter: 'ALL' })).length, await names({ filter: 'OTHERS', q: 'pio' })]).toEqual([
      ['Nube', 'Piolín'],
      ['Luna', 'Milo', 'Nyx'],
      ['Argos', 'Kira', 'Toby'],
      8,
      ['Piolín'],
    ]);
    expect(await names({ filter: 'WITH_ALERTS' })).toEqual(['Argos', 'Nyx']);
  });

  it('[INV-REC2-002][SC-013][ERR-REC-WEIGHT-OUT-OF-RANGE] el peso se valida con la tabla de la especie de la mascota: CANINE no admite 0.028 y RABBIT sí', async () => {
    const state = canonicalState();
    const rabbit = { ...ARGOS, id: '11111111-1111-4111-8111-111111111106', name: 'Nube', species: 'RABBIT' } as typeof ARGOS;
    state.pets.push(rabbit);
    const { deps, uow } = createHarness(state);
    const add = new AddWeightRecordUseCase(deps);
    expect(await outcome(add.execute(ANDRES, ARGOS.id, { recordedAt: '2026-11-05', weightKg: 0.028 }))).toBe('ERR-REC-WEIGHT-OUT-OF-RANGE@weightKg');
    const weightsBefore = uow.snapshot().records.weights.length;
    const first = await add.execute(ANDRES, rabbit.id, { recordedAt: '2026-11-04', weightKg: 0.028 });
    const second = await add.execute(ANDRES, rabbit.id, { recordedAt: '2026-11-05', weightKg: 1.275 });
    expect([first.deltaKg, second.deltaKg, uow.snapshot().records.weights.length - weightsBefore]).toEqual([null, 1.247, 2]);
    expect(await outcome(add.execute(ANDRES, rabbit.id, { recordedAt: '2026-11-05', weightKg: 0.0005 }))).toBe('ERR-REC-WEIGHT-OUT-OF-RANGE@weightKg');
  });
});

describe('registros de los 6 módulos (src/application/use-cases/record-use-cases.ts)', () => {
  const INPUTS = {
    weights: { recordedAt: '2026-11-05', weightKg: 33.1 },
    bodyMeasurements: { recordedAt: '2026-11-05', neckCm: 47, chestCm: 79.5, backLengthCm: 65, waistCm: 58 },
    vaccinations: { vaccineName: 'Rabia', appliedAt: '2026-11-05', nextBoosterAt: '2027-11-05' },
    dewormings: { productBrand: 'Drontal', dewormingType: 'INTERNAL', appliedAt: '2026-11-05', nextSuggestedDoseAt: '2026-11-10' },
    medicalVisits: { visitDate: '2026-11-05', reason: 'Control', diagnosis: 'Sano', treatment: 'Ninguno', clinicOrVet: 'VetCare' },
    customParameters: { recordedAt: '2026-11-05', category: 'ALLERGY', title: 'Alergia al pollo', description: 'Picor tras comer pollo.' },
  } as const;
  const useCases = (deps: ApplicationDeps) =>
    ({
      weights: new AddWeightRecordUseCase(deps),
      bodyMeasurements: new AddBodyMeasurementUseCase(deps),
      vaccinations: new AddVaccinationUseCase(deps),
      dewormings: new AddDewormingUseCase(deps),
      medicalVisits: new AddMedicalVisitUseCase(deps),
      customParameters: new AddCustomParameterUseCase(deps),
    }) as const;
  const MODULES = Object.keys(INPUTS) as Array<keyof typeof INPUTS>;
  const stored = (module: keyof typeof INPUTS, extra: Record<string, unknown>) => ({ ...INPUTS[module], ...extra, id: generatedId(1), petId: ARGOS.id, createdAt: NOW });

  it('[REQ-REC2-001] peso: guarda el registro y responde WeightEntryView con delta respecto a la medición anterior (32.85 → 33.10)', async () => {
    const { deps, uow } = createHarness();
    const entry = await new AddWeightRecordUseCase(deps).execute(ANDRES, ARGOS.id, INPUTS.weights);
    expect(entry).toEqual({ record: stored('weights', { notes: null }), deltaKg: 0.25 });
    expect(uow.snapshot().records.weights.at(-1)).toEqual(stored('weights', { notes: null }));
  });

  it('[REQ-REC-002][REQ-REC-005][REQ-REC-006] medidas, citas y parámetros: responden y guardan el registro con los opcionales en null', async () => {
    const results: unknown[] = [];
    for (const module of ['bodyMeasurements', 'medicalVisits', 'customParameters'] as const) {
      const { deps, uow } = createHarness();
      const view = await useCases(deps)[module].execute(ANDRES, ARGOS.id, INPUTS[module]);
      results.push([view, uow.snapshot().records[module].at(-1)]);
    }
    const expected = [
      stored('bodyMeasurements', { notes: null }),
      stored('medicalVisits', { observations: null }),
      stored('customParameters', { notes: null }),
    ];
    expect(results).toEqual(expected.map((record) => [record, record]));
  });

  it('[REQ-REC-003][REQ-REC-004] vacuna y desparasitación responden con su alerta de STATE-ALERT-001 al día de ClockPort', async () => {
    const { deps } = createHarness();
    const cases = useCases(deps);
    const vaccine = await cases.vaccinations.execute(ANDRES, ARGOS.id, { ...INPUTS.vaccinations, batchOrClinic: 'Lote 7', notes: 'Sin reacción' });
    const deworming = await cases.dewormings.execute(ANDRES, ARGOS.id, INPUTS.dewormings);
    expect([vaccine.record, vaccine.alert!.status, vaccine.alert!.daysRemaining]).toEqual([
      { ...INPUTS.vaccinations, batchOrClinic: 'Lote 7', notes: 'Sin reacción', id: generatedId(1), petId: ARGOS.id, createdAt: NOW },
      'UP_TO_DATE',
      365,
    ]);
    expect([deworming.record, deworming.alert!.status, deworming.alert!.daysRemaining]).toEqual([
      { ...INPUTS.dewormings, notes: null, id: generatedId(2), petId: ARGOS.id, createdAt: NOW },
      'DUE_SOON',
      5,
    ]);
  });

  it('[REQ-REC-001][REQ-REC-003][REQ-REC-004] un alta con fecha anterior a los registros existentes devuelve la vista de ese registro, no la del más reciente', async () => {
    const { deps, uow } = createHarness();
    const cases = useCases(deps);
    const KIRA = '11111111-1111-4111-8111-111111111102';
    const weight = await cases.weights.execute(ANDRES, ARGOS.id, { recordedAt: '2026-10-15', weightKg: 32.5 });
    const vaccine = await cases.vaccinations.execute(ANDRES, ARGOS.id, { vaccineName: 'Rabia', appliedAt: '2025-01-01', nextBoosterAt: '2026-01-01' });
    const deworming = await cases.dewormings.execute(ANDRES, KIRA, { productBrand: 'Drontal', dewormingType: 'INTERNAL', appliedAt: '2026-10-01', nextSuggestedDoseAt: '2026-10-31' });
    expect([weight.record.id, weight.deltaKg, 'deltaPercent' in weight]).toEqual([generatedId(1), 0.1, false]);
    expect([vaccine.record, vaccine.alert!.status]).toEqual([
      { vaccineName: 'Rabia', appliedAt: '2025-01-01', nextBoosterAt: '2026-01-01', batchOrClinic: null, notes: null, id: generatedId(2), petId: ARGOS.id, createdAt: NOW },
      'OVERDUE',
    ]);
    expect([deworming.record.id, deworming.alert!.status]).toEqual([generatedId(3), 'OVERDUE']);
    expect(uow.snapshot().records.vaccinations.at(-1)).toEqual(vaccine.record);
  });

  it('[INV-PET-003][ERR-PET-NOT-FOUND] en los 6 módulos, una mascota inexistente da ERR-PET-NOT-FOUND, no guarda nada y no consume ids', async () => {
    const { deps, uow } = createHarness();
    const cases = useCases(deps);
    const results = [];
    for (const module of MODULES) results.push(await outcome(cases[module].execute(ANDRES, MISSING_PET, INPUTS[module])));
    expect(results).toEqual(Array(6).fill('ERR-PET-NOT-FOUND@petId'));
    expect([uow.snapshot(), deps.ids.nextId()]).toEqual([canonicalState(), generatedId(1)]);
  });

  it('[INV-ACC-002][ERR-ACC-FORBIDDEN][INV-ACC-001] EDGE-009: María (miembro ACTIVE) no escribe en Argos en ningún módulo; Carlos (INVITED) recibe 404', async () => {
    const { deps, uow } = createHarness();
    const cases = useCases(deps);
    const results = [];
    for (const module of MODULES) {
      results.push([await outcome(cases[module].execute(MARIA, ARGOS.id, INPUTS[module])), await outcome(cases[module].execute(CARLOS, ARGOS.id, INPUTS[module]))]);
    }
    expect(results).toEqual(Array(6).fill([`${edge('EDGE-009-').expectedError}@petId`, 'ERR-PET-NOT-FOUND@petId']));
    expect(uow.snapshot()).toEqual(canonicalState());
  });

  it('[REQ-REC-001][INV-PET-003] el acceso se comprueba antes que la entrada: cuerpo inválido sobre mascota ajena da 403 y sobre inexistente 404', async () => {
    const { deps } = createHarness();
    const add = new AddWeightRecordUseCase(deps);
    expect([await outcome(add.execute(MARIA, ARGOS.id, {})), await outcome(add.execute(ANDRES, MISSING_PET, {})), await outcome(add.execute(ANDRES, ARGOS.id, {}))]).toEqual([
      'ERR-ACC-FORBIDDEN@petId',
      'ERR-PET-NOT-FOUND@petId',
      'ERR-SCHEMA-VALIDATION-FAILED@recordedAt',
    ]);
  });

  it('[REQ-REC-001][REQ-REC-003] las reglas de dominio y de frontera se aplican en el alta: DEUDA-VAL-001, ventana temporal y refuerzo', async () => {
    const { deps, uow } = createHarness();
    const cases = useCases(deps);
    expect([
      await outcome(cases.weights.execute(ANDRES, ARGOS.id, { ...INPUTS.weights, weightKg: 32.85001 })),
      await outcome(cases.weights.execute(ANDRES, ARGOS.id, { ...INPUTS.weights, recordedAt: '2022-05-09' })),
      await outcome(cases.weights.execute(ANDRES, ARGOS.id, { ...INPUTS.weights, recordedAt: '2026-11-06' })),
      await outcome(cases.vaccinations.execute(ANDRES, ARGOS.id, { ...INPUTS.vaccinations, nextBoosterAt: '2026-11-05' })),
    ]).toEqual([
      'ERR-REC-WEIGHT-OUT-OF-RANGE@weightKg',
      'ERR-REC-DATE-BEFORE-BIRTH@recordedAt',
      'ERR-REC-FUTURE-EVENT-DATE@recordedAt',
      'ERR-REC-INVALID-BOOSTER-DATE@nextBoosterAt',
    ]);
    expect(uow.snapshot()).toEqual(canonicalState());
  });

  it('[INV-ARCH-001][INV-ARCH-002] la fecha de hoy, createdAt y el id salen solo de ClockPort e IdGeneratorPort', async () => {
    const { deps, clock } = createHarness();
    clock.setClock('2026-12-01', '2026-12-01T15:30:00.000Z');
    const add = new AddCustomParameterUseCase(deps);
    expect(await outcome(add.execute(ANDRES, ARGOS.id, { ...INPUTS.customParameters, recordedAt: '2026-12-02' }))).toBe('ERR-REC-FUTURE-EVENT-DATE@recordedAt');
    const record = await add.execute(ANDRES, ARGOS.id, { ...INPUTS.customParameters, recordedAt: '2026-12-01' });
    expect([record.id, record.createdAt, record.recordedAt]).toEqual([generatedId(1), '2026-12-01T15:30:00.000Z', '2026-12-01']);
  });
});
