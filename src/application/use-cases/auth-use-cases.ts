/**
 * Casos de uso de autenticación: registro, login, logout, sesión actual y autenticación de peticiones.
 * - Precedencia: normalización del username (regla 3), esquema (regla 4) y dominio (regla 5).
 * - INV-AUTH-006: si el username no existe, LoginUseCase verifica la contraseña contra el hash ficticio, de modo
 *   que PasswordHasherPort.verify se invoca exactamente una vez en ambas ramas. Un intento bloqueado no verifica
 *   ni se registra (INV-AUTH-005, EDGE-029).
 * - Los fallos de login se confirman antes de devolver el error, para que el rollback no los borre.
 *
 * @implements REQ-AUTH-001, REQ-AUTH-002, REQ-AUTH-003, REQ-AUTH-004, INV-AUTH-006, INV-ARCH-001, INV-ARCH-002, INV-ARCH-005
 */

import { DomainError, validateLoginInput, type LoginInput, type SessionView } from '../../generated/index.ts';
import {
  assertAuthenticated,
  assertNotLockedOut,
  assertUsernameAvailable,
  evaluateLoginAttempt,
  invalidCredentialsError,
  logout,
  normalizeUsername,
  openSession,
  parseRegisterUserInput,
  type SessionRecord,
} from '../../domain/auth/auth-policies.ts';
import type { RepositorySet, UserAccount } from '../ports/repositories.port.ts';
import { assertMatchesSchema, toPublicProfile, type ApplicationDeps } from './use-case-support.ts';

export interface AuthenticatedSession {
  /** Valor de la cookie argos_session; la capa HTTP lo envía con Set-Cookie. */
  readonly sessionToken: string;
  readonly session: SessionView;
}

/** Reglas del esquema de LoginInput (sin x-sdd-error: todo fallo de esquema es ERR-SCHEMA-VALIDATION-FAILED). */
function parseLoginInput(input: unknown): LoginInput {
  const username = (input as { username?: unknown } | null)?.username;
  const candidate = typeof username === 'string' ? { ...(input as object), username: normalizeUsername(username) } : input;
  return assertMatchesSchema<LoginInput>('LoginInput', validateLoginInput, candidate);
}

async function startSession(deps: ApplicationDeps, repositories: RepositorySet, account: UserAccount, now: string): Promise<AuthenticatedSession> {
  const sessionToken = deps.tokens.nextSessionToken();
  const session = openSession(account.id, now);
  await repositories.sessions.save(sessionToken, session);
  return { sessionToken, session: { user: toPublicProfile(account), expiresAt: session.expiresAt } };
}

async function currentSession(repositories: RepositorySet, sessionToken: string | null): Promise<SessionRecord | null> {
  return sessionToken === null ? null : repositories.sessions.findByToken(sessionToken);
}

/** @implements REQ-AUTH-001, INV-ARCH-002 */
export class RegisterUserUseCase {
  constructor(private readonly deps: ApplicationDeps) {}

  async execute(input: unknown): Promise<AuthenticatedSession> {
    const valid = parseRegisterUserInput(input);
    const now = this.deps.clock.nowIsoTimestamp();
    return this.deps.uow.runInTransaction(async (repositories) => {
      const existing = await repositories.users.findByUsername(valid.username);
      if (existing !== null) assertUsernameAvailable(valid.username, [existing.username]);
      const account: UserAccount = {
        id: this.deps.ids.nextId(),
        username: valid.username,
        displayName: valid.displayName,
        createdAt: now,
        passwordHash: await this.deps.hasher.hash(valid.password),
      };
      await repositories.users.insert(account);
      return startSession(this.deps, repositories, account, now);
    });
  }
}

/** @implements REQ-AUTH-002, INV-AUTH-006 */
export class LoginUseCase {
  constructor(private readonly deps: ApplicationDeps) {}

  async execute(input: unknown): Promise<AuthenticatedSession> {
    const credentials = parseLoginInput(input);
    const now = this.deps.clock.nowIsoTimestamp();
    const result = await this.deps.uow.runInTransaction(async (repositories) => {
      const failures = await repositories.loginAttempts.listFailures(credentials.username);
      assertNotLockedOut(failures, now);
      const account = await repositories.users.findByUsername(credentials.username);
      const matches = await this.deps.hasher.verify(credentials.password, account?.passwordHash ?? this.deps.dummyPasswordHash);
      const outcome = evaluateLoginAttempt(failures, now, () => account !== null && matches);
      await repositories.loginAttempts.replaceFailures(credentials.username, outcome.failures);
      return outcome.error === null ? startSession(this.deps, repositories, account!, now) : null;
    });
    if (result === null) throw invalidCredentialsError();
    return result;
  }
}

/** @implements REQ-AUTH-003 */
export class LogoutUseCase {
  constructor(private readonly deps: ApplicationDeps) {}

  /** Idempotente: siempre 204 (D-04); solo revoca una sesión AUTHENTICATED. */
  async execute(sessionToken: string | null): Promise<204> {
    const now = this.deps.clock.nowIsoTimestamp();
    return this.deps.uow.runInTransaction(async (repositories) => {
      const session = await currentSession(repositories, sessionToken);
      const result = logout(session, now);
      if (result.session !== session) {
        await repositories.sessions.save(sessionToken!, result.session!);
      }
      return result.response;
    });
  }
}

/** @implements REQ-AUTH-004 */
export class AuthenticateRequestUseCase {
  constructor(private readonly deps: ApplicationDeps) {}

  /** userId de la sesión vigente; sin sesión, revocada o expirada, ERR-AUTH-UNAUTHENTICATED. */
  async execute(sessionToken: string | null): Promise<string> {
    const now = this.deps.clock.nowIsoTimestamp();
    return this.deps.uow.runInTransaction(async (repositories) => assertAuthenticated(await currentSession(repositories, sessionToken), now).userId);
  }
}

/** @implements REQ-AUTH-004 */
export class GetCurrentSessionUseCase {
  constructor(private readonly deps: ApplicationDeps) {}

  async execute(sessionToken: string | null): Promise<SessionView> {
    const now = this.deps.clock.nowIsoTimestamp();
    return this.deps.uow.runInTransaction(async (repositories) => {
      const session = assertAuthenticated(await currentSession(repositories, sessionToken), now);
      const account = await repositories.users.findById(session.userId);
      if (account === null) throw new DomainError('ERR-AUTH-UNAUTHENTICATED');
      return { user: toPublicProfile(account), expiresAt: session.expiresAt };
    });
  }
}
