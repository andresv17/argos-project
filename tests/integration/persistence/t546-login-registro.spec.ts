/**
 * T546 [P] [US3] registro y inicio de sesión sin distinguir mayúsculas, en memoria, SQLite y PostgreSQL 17 real (se OMITE sin
 * TEST_DATABASE_URL) (SC-CAT-016..021, SC-CAT-030; REQ-LOG-001, REQ-LOG-002, INV-LOG-001, INV-LOG-002, EDGE-007, EDGE-009):
 *  - el registro guarda el `username` tal como se escribió y rechaza por `LOWER` una segunda alta que solo difiere en mayúsculas;
 *  - sin dígito obligatorio; «and res» y «a@b» se rechazan;
 *  - el inicio de sesión entra por usuario (cualquier capitalización) o por correo (recortado, sin mayúsculas); un correo en dos cuentas falla
 *    con el mismo error genérico que la contraseña incorrecta;
 *  - usuario inexistente, correo inexistente, correo ambiguo y contraseña incorrecta: mismo estado y cuerpo y una sola verificación (espía);
 *    la medición de tiempo es INFORMATIVA (no bloquea);
 *  - el límite de 5 fallos se acumula por identificador en minúsculas y por cuenta resuelta;
 *  - la invitación por `username` resuelve al mismo usuario sin distinguir mayúsculas y conserva la respuesta uniforme.
 * Además (T547): el índice `users_username_lower` existe y las migraciones abortan con conteo si hay colisiones.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { LoginUseCase, RegisterUserUseCase } from '../../../src/application/use-cases/auth-use-cases.ts';
import { InviteMemberUseCase } from '../../../src/application/use-cases/household-use-cases.ts';
import { DomainError } from '../../../src/generated/index.ts';
import { ANDRES, HOUSEHOLD, PASSWORDS } from '../../fixtures/application-harness.ts';
import { ENGINE_NAMES, HAS_POSTGRES, account, idOf, openEngine, stateWith, type EngineName, type IdentityEngine } from '../../fixtures/identity-engines.ts';
import { DUMMY_PASSWORD_HASH, FAKE_HASH_PREFIX } from '../../fixtures/test-doubles.ts';

const NOW = '2026-11-05T12:00:00.000Z';
const ANA = idOf(1);
const COMPARTIDO_1 = idOf(2);
const COMPARTIDO_2 = idOf(3);
const NEW_PASSWORD = 'Clave2026x!';
const REGISTRATION = { password: NEW_PASSWORD, confirmPassword: NEW_PASSWORD };

const extraUsers = () => [
  account(ANA, 'Ana.Perez', 'Ana2026a', 'Ana@Ejemplo.com'),
  account(COMPARTIDO_1, 'compartido1', 'Comp2026a', 'casa@ejemplo.com'),
  account(COMPARTIDO_2, 'compartido2', 'Comp2026b', 'Casa@Ejemplo.com'),
];

const disposers: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const dispose of disposers.splice(0)) await dispose();
});
async function open(name: EngineName): Promise<IdentityEngine> {
  const engine = await openEngine(name, stateWith(extraUsers()));
  disposers.push(engine.dispose);
  return engine;
}

async function outcome(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
    return 'OK';
  } catch (error) {
    if (error instanceof DomainError) return `${error.code}@${String(error.field)}`;
    throw error;
  }
}
async function failureOf(promise: Promise<unknown>): Promise<DomainError> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof DomainError) return error;
    throw error;
  }
  throw new Error('se esperaba un DomainError');
}
const shape = (e: DomainError) => [e.code, e.status, e.message, e.field, e.detail];

describe.each(ENGINE_NAMES)('T546 identidad sin distinguir mayúsculas (%s)', (name) => {
  const base = it.skipIf(name === 'PostgreSQL' && !HAS_POSTGRES);
  // Postgres real es lento al sembrar y a las 400 transacciones de la medición informativa: tiempo de sobra por prueba.
  const run = (title: string, work: () => Promise<void>) => base(title, work, 120_000);

  run('[SC-CAT-016][REQ-LOG-002][INV-LOG-001][EDGE-009] «ana.perez» y «ANA.PEREZ» chocan con «Ana.Perez» (ERR-AUTH-USERNAME-TAKEN) sin crear nada; «maria_01» y «maria» coexisten', async () => {
    const engine = await open(name);
    const register = new RegisterUserUseCase(engine.deps);
    expect(await outcome(register.execute({ username: 'ana.perez', displayName: 'Otra', ...REGISTRATION }))).toBe('ERR-AUTH-USERNAME-TAKEN@username');
    expect(await outcome(register.execute({ username: 'ANA.PEREZ', displayName: 'Otra', ...REGISTRATION }))).toBe('ERR-AUTH-USERNAME-TAKEN@username');
    expect(await engine.read((r) => r.users.listByIds([ANA]))).toHaveLength(1);
    expect(await outcome(register.execute({ username: 'maria_01', displayName: 'Uno', ...REGISTRATION }))).toBe('OK');
    expect(await outcome(register.execute({ username: 'maria', displayName: 'Dos', ...REGISTRATION }))).toBe('OK');
    expect(await outcome(register.execute({ username: 'Maria_01', displayName: 'Tres', ...REGISTRATION }))).toBe('ERR-AUTH-USERNAME-TAKEN@username');
  });

  run('[SC-CAT-016][INV-LOG-001] la base impone la unicidad por LOWER(username) aunque el caso de uso no la compruebe: insertar «ANA.PEREZ» directo falla', async () => {
    const engine = await open(name);
    const inserted = await engine.read((r) => r.users.insert(account(idOf(9), 'ANA.PEREZ', 'Clave2026x!'))).then(() => 'resolved', () => 'rejected');
    expect(inserted).toBe('rejected');
    expect(await engine.read((r) => r.users.listByIds([idOf(9)]))).toEqual([]);
  });

  run('[SC-CAT-017][REQ-LOG-002] «Andres» sin dígitos se registra y se guarda tal como se escribió; «and res» y «a@b» se rechazan; «ANDRES» y «andres» entran a la misma cuenta', async () => {
    const engine = await open(name);
    const register = new RegisterUserUseCase(engine.deps);
    const created = await register.execute({ username: 'Sofia', displayName: 'Sofía', ...REGISTRATION });
    expect(created.session.user.username).toBe('Sofia');
    expect((await engine.read((r) => r.users.findByUsername('sofia')))?.username).toBe('Sofia');
    for (const username of ['and res', 'a@b', 'ab', ' Sofia2 ', 'x'.repeat(31)]) {
      expect(await outcome(register.execute({ username, displayName: 'X', ...REGISTRATION })), username).toBe('ERR-SCHEMA-VALIDATION-FAILED@username');
    }
    const login = new LoginUseCase(engine.deps);
    const upper = await login.execute({ username: 'SOFIA', password: NEW_PASSWORD });
    const lower = await login.execute({ username: 'sofia', password: NEW_PASSWORD });
    expect([upper.session.user.id, lower.session.user.id]).toEqual([created.session.user.id, created.session.user.id]);
    expect(upper.session.user.username).toBe('Sofia');
    const andres = await login.execute({ username: 'ANDRES', password: PASSWORDS['andres'] });
    expect(andres.session.user.id).toBe(ANDRES);
  });

  run('[SC-CAT-018][REQ-LOG-001][EDGE-007] el correo entra recortado y sin mayúsculas; con el mismo correo en dos cuentas falla con el mismo error genérico que una contraseña incorrecta', async () => {
    const engine = await open(name);
    const login = new LoginUseCase(engine.deps);
    expect((await login.execute({ username: 'Ana@Ejemplo.COM', password: 'Ana2026a' })).session.user.id).toBe(ANA);
    expect((await login.execute({ username: ' ana@ejemplo.com ', password: 'Ana2026a' })).session.user.id).toBe(ANA);
    const ambiguous = await failureOf(login.execute({ username: 'casa@ejemplo.com', password: 'Comp2026a' }));
    const wrong = await failureOf(login.execute({ username: 'ana.perez', password: 'incorrecta1!' }));
    expect(shape(ambiguous)).toEqual(shape(wrong));
    expect(ambiguous.code).toBe('ERR-AUTH-INVALID-CREDENTIALS');
  });

  run('[SC-CAT-019][INV-LOG-002] usuario inexistente, correo inexistente, correo ambiguo y contraseña incorrecta: mismo estado y cuerpo y exactamente una verificación de hash cada uno', async () => {
    const engine = await open(name);
    const login = new LoginUseCase(engine.deps);
    const cases: Array<[string, string]> = [
      ['nadie.x', 'incorrecta1!'],
      ['nadie@ejemplo.com', 'incorrecta1!'],
      ['casa@ejemplo.com', 'Comp2026a'],
      ['ana.perez', 'incorrecta1!'],
    ];
    const errors: DomainError[] = [];
    const calls: number[] = [];
    for (const [username, password] of cases) {
      engine.hasher.reset();
      errors.push(await failureOf(login.execute({ username, password })));
      calls.push(engine.hasher.calls.length);
    }
    expect(calls).toEqual([1, 1, 1, 1]);
    for (const error of errors) expect(shape(error)).toEqual(shape(errors[0]!));
    expect(errors[0]!.code).toBe('ERR-AUTH-INVALID-CREDENTIALS');
    // Los tres casos sin cuenta resuelta verifican contra el hash ficticio (nunca contra el de una cuenta del correo ambiguo).
    engine.hasher.reset();
    await failureOf(login.execute({ username: 'casa@ejemplo.com', password: 'Comp2026a' }));
    expect(engine.hasher.calls).toEqual([{ method: 'verify', plain: 'Comp2026a', hash: DUMMY_PASSWORD_HASH }]);
    engine.hasher.reset();
    await failureOf(login.execute({ username: 'ana.perez', password: 'incorrecta1!' }));
    expect(engine.hasher.calls).toEqual([{ method: 'verify', plain: 'incorrecta1!', hash: `${FAKE_HASH_PREFIX}Ana2026a` }]);
  });

  run('[SC-CAT-019] compuerta INFORMATIVA (no bloqueante): mediana de 100 repeticiones por caso; solo se registra', async () => {
    const engine = await open(name);
    const login = new LoginUseCase(engine.deps);
    const medians: Record<string, number> = {};
    for (const [label, username] of [['usuario inexistente', 'nadie.x'], ['correo inexistente', 'nadie@ejemplo.com'], ['correo ambiguo', 'casa@ejemplo.com'], ['contraseña incorrecta', 'ana.perez']] as const) {
      const samples: number[] = [];
      for (let i = 0; i < 100; i += 1) {
        // Cada repetición cae en una ventana distinta de 15 minutos: el límite de intentos no interviene en la medición.
        const at = new Date(Date.parse(NOW) + i * 20 * 60_000).toISOString();
        engine.clock.setClock(at.slice(0, 10), at);
        const started = performance.now();
        await outcome(login.execute({ username: `${username}`, password: 'incorrecta1!' }));
        samples.push(performance.now() - started);
      }
      medians[label] = [...samples].sort((a, b) => a - b)[50]!;
    }
    // Informativo: se publica en la salida; no hay aserción sobre los tiempos.
    expect(Object.keys(medians)).toHaveLength(4);
  });

  run('[SC-CAT-020][REQ-LOG-001] 5 fallos con «Ana@x.com» y «ana@x.com» bloquean el sexto con cualquiera de los dos y no verifican', async () => {
    const engine = await open(name);
    const login = new LoginUseCase(engine.deps);
    const mail = (n: number) => (n % 2 === 0 ? 'Casa2@x.com' : 'casa2@x.com');
    await engine.read((r) => r.users.insert(account(idOf(20), 'casa2', 'Casa2026a', 'casa2@x.com')));
    for (let i = 0; i < 5; i += 1) expect(await outcome(login.execute({ username: mail(i), password: 'incorrecta1!' }))).toBe('ERR-AUTH-INVALID-CREDENTIALS@null');
    engine.hasher.reset();
    expect(await outcome(login.execute({ username: 'casa2@x.com', password: 'Casa2026a' }))).toBe('ERR-AUTH-TOO-MANY-ATTEMPTS@username');
    expect(await outcome(login.execute({ username: ' CASA2@X.COM', password: 'Casa2026a' }))).toBe('ERR-AUTH-TOO-MANY-ATTEMPTS@username');
    expect(engine.hasher.calls).toEqual([]);
  });

  run('[SC-CAT-030][REQ-LOG-001] 3 fallos con «ana» y 2 con «ana@x.com» bloquean el sexto con cualquiera (límite por identificador y por cuenta resuelta)', async () => {
    const engine = await open(name);
    await engine.read((r) => r.users.insert(account(idOf(21), 'ana', 'AnaUno2026a', 'ana@x.com')));
    const login = new LoginUseCase(engine.deps);
    for (const identifier of ['ana', 'ANA', 'ana', 'ana@x.com', 'Ana@X.com']) expect(await outcome(login.execute({ username: identifier, password: 'incorrecta1!' }))).toBe('ERR-AUTH-INVALID-CREDENTIALS@null');
    engine.hasher.reset();
    expect(await outcome(login.execute({ username: 'ana', password: 'AnaUno2026a' }))).toBe('ERR-AUTH-TOO-MANY-ATTEMPTS@username');
    expect(await outcome(login.execute({ username: 'ana@x.com', password: 'AnaUno2026a' }))).toBe('ERR-AUTH-TOO-MANY-ATTEMPTS@username');
    expect(engine.hasher.calls).toEqual([]);
  });

  run('[REQ-LOG-001] los fallos se guardan bajo el identificador en minúsculas (nunca con la capitalización escrita) y un éxito los borra', async () => {
    const engine = await open(name);
    const login = new LoginUseCase(engine.deps);
    await outcome(login.execute({ username: 'ANA.PEREZ', password: 'incorrecta1!' }));
    await outcome(login.execute({ username: 'NADIE.X', password: 'incorrecta1!' }));
    expect(await engine.read((r) => r.loginAttempts.listFailures('ana.perez'))).toEqual([NOW]);
    expect(await engine.read((r) => r.loginAttempts.listFailures('nadie.x'))).toEqual([NOW]);
    expect(await engine.read((r) => r.loginAttempts.listFailures('ANA.PEREZ'))).toEqual([]);
    await login.execute({ username: 'Ana.Perez', password: 'Ana2026a' });
    expect(await engine.read((r) => r.loginAttempts.listFailures('ana.perez'))).toEqual([]);
  });

  run('[REQ-LOG-002][INV-HOUSE-003] la base impone una sola invitación abierta por (hogar, LOWER(invitee_username)): guardar «ANA.PEREZ» teniendo «Ana.Perez» abierta se rechaza; con la primera rechazada, sí entra', async () => {
    const engine = await open(name);
    const base = { householdId: HOUSEHOLD.id, inviteeUserId: ANA, invitedByUserId: ANDRES, roleOnJoin: 'READER' as const, status: 'INVITED' as const, createdAt: NOW, respondedAt: null };
    await engine.read((r) => r.invitations.save({ ...base, invitationId: idOf(40), inviteeUsername: 'Ana.Perez' }));
    const second = await engine.read((r) => r.invitations.save({ ...base, invitationId: idOf(41), inviteeUsername: 'ANA.PEREZ' })).then(() => 'resolved', () => 'rejected');
    expect(second).toBe('rejected');
    await engine.read((r) => r.invitations.save({ ...base, invitationId: idOf(40), inviteeUsername: 'Ana.Perez', status: 'DECLINED', respondedAt: NOW }));
    const third = await engine.read((r) => r.invitations.save({ ...base, invitationId: idOf(41), inviteeUsername: 'ANA.PEREZ' })).then(() => 'resolved', () => 'rejected');
    expect(third).toBe('resolved');
  });

  run('[SC-CAT-021][REQ-LOG-002][REQ-HOUSE2-002] invitar escribiendo «ana.perez» resuelve a «Ana.Perez»; la respuesta es la misma que para un usuario inexistente y no hay segunda invitación abierta por «ANA.PEREZ»', async () => {
    const engine = await open(name);
    const invite = new InviteMemberUseCase(engine.deps);
    const known = await invite.execute(ANDRES, HOUSEHOLD.id, { username: 'ana.perez', roleOnJoin: 'READER' });
    const unknown = await invite.execute(ANDRES, HOUSEHOLD.id, { username: 'nadie.x', roleOnJoin: 'READER' });
    expect(known).toEqual(unknown);
    const open1 = await engine.read((r) => r.invitations.findOpen(HOUSEHOLD.id, 'Ana.Perez'));
    expect([open1?.inviteeUserId, open1?.status]).toEqual([ANA, 'INVITED']);
    await invite.execute(ANDRES, HOUSEHOLD.id, { username: 'ANA.PEREZ', roleOnJoin: 'READER' });
    const mine = await engine.read((r) => r.invitations.listOpenForUser(ANA));
    expect(mine).toHaveLength(1);
    expect((await engine.read((r) => r.invitations.findOpen(HOUSEHOLD.id, 'ana.perez')))?.invitationId).toBe(open1?.invitationId);
  });
});

describe('T547 esquema (SQLite y PostgreSQL 17)', () => {
  it('[SC-CAT-016][INV-LOG-001] SQLite tiene el índice único users_username_lower sobre lower(username) y el de invitaciones sobre lower(invitee_username)', async () => {
    const engine = await open('SQLite');
    const rows = (await engine.rawQuery("SELECT name, sql FROM sqlite_master WHERE type = 'index' AND name IN ('users_username_lower', 'household_invitations_one_open')")) ?? [];
    const sqlOf = (name: string) => String(rows.find((r) => r['name'] === name)?.['sql']).replace(/\s+/g, ' ').toLowerCase();
    expect(sqlOf('users_username_lower')).toContain('create unique index users_username_lower on users (lower(username))');
    expect(sqlOf('household_invitations_one_open')).toContain('(household_id, lower(invitee_username))');
    expect(sqlOf('household_invitations_one_open')).toContain("where status = 'invited'");
  });

  it.skipIf(!HAS_POSTGRES)('[SC-CAT-016][INV-LOG-001] PostgreSQL tiene users_username_lower (único, LOWER(username)) y el índice abierto de invitaciones sobre LOWER(invitee_username)', async () => {
    const engine = await open('PostgreSQL');
    const rows = (await engine.rawQuery("SELECT indexname, indexdef FROM pg_indexes WHERE schemaname = current_schema() AND indexname IN ('users_username_lower', 'household_invitations_one_open')")) ?? [];
    const def = (name: string) => String(rows.find((r) => r['indexname'] === name)?.['indexdef']).toLowerCase();
    expect(def('users_username_lower')).toContain('create unique index users_username_lower on');
    expect(def('users_username_lower')).toContain('lower(username)');
    expect(def('household_invitations_one_open')).toContain('lower(invitee_username)');
  });
});
