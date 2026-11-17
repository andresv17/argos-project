/**
 * Casos de uso de autenticación: registro, login, logout, sesión actual y autenticación de peticiones.
 * - Precedencia: esquema (regla 4) y dominio (regla 5). El username ya no se normaliza (H-F5-08): con mayúsculas o
 *   espacios se rechaza en el registro y en el login no coincide con ninguna cuenta.
 * - INV-AUTH2-002: autenticar una petición válida renueva `lastActivityAt`; una rechazada no escribe nada.
 * - INV-AUTH-006: si el username no existe, LoginUseCase verifica la contraseña contra el hash ficticio, de modo
 *   que PasswordHasherPort.verify se invoca exactamente una vez en ambas ramas. Un intento bloqueado no verifica
 *   ni se registra (INV-AUTH-005, EDGE-029).
 * - Los fallos de login se confirman antes de devolver el error, para que el rollback no los borre.
 *
 * @implements REQ-AUTH2-001, REQ-AUTH2-002, REQ-AUTH-003, REQ-AUTH-004, INV-AUTH2-002, INV-AUTH-006, INV-ARCH-001, INV-ARCH-002, INV-ARCH-005
 */

import { DomainError, validateLoginInput, type LoginInput, type SessionView } from '../../generated/index.ts';
import {
  assertNotLockedOut,
  assertUsernameAvailable,
  evaluateLoginAttempt,
  invalidCredentialsError,
  parseRegisterUserInput,
} from '../../domain/auth/auth-policies.ts';
import { assertAuthenticated, logout, openSession, renewSession, sessionExpiries, type SessionRecord } from '../../domain/auth/session-policy.ts';
import type { RepositorySet, UserAccount } from '../ports/repositories.port.ts';
import { recordAudit } from './audit-support.ts';
import { assertMatchesSchema, toSelfProfile, type ApplicationDeps } from './use-case-support.ts';

export interface AuthenticatedSession {
  /** Valor de la cookie argos_session; la capa HTTP lo envía con Set-Cookie. */
  readonly sessionToken: string;
  readonly session: SessionView;
}

/**
 * Reglas del esquema de LoginInput (sin x-sdd-error: todo fallo de esquema es ERR-SCHEMA-VALIDATION-FAILED). El
 * username se compara de forma exacta (REQ-AUTH2-002), sin recortar ni pasar a minúsculas.
 */
function parseLoginInput(input: unknown): LoginInput {
  return assertMatchesSchema<LoginInput>('LoginInput', validateLoginInput, input);
}

/** SessionView 3.0.0: perfil propio, actividad y vencimientos derivados (INV-AUTH2-002). */
function toSessionView(account: UserAccount, session: SessionRecord): SessionView {
  return { user: toSelfProfile(account), createdAt: session.createdAt, lastActivityAt: session.lastActivityAt, ...sessionExpiries(session) };
}

async function startSession(deps: ApplicationDeps, repositories: RepositorySet, account: UserAccount, now: string): Promise<AuthenticatedSession> {
  const sessionToken = deps.tokens.nextSessionToken();
  const session = openSession(account.id, now);
  await repositories.sessions.save(sessionToken, session);
  return { sessionToken, session: toSessionView(account, session) };
}

async function currentSession(repositories: RepositorySet, sessionToken: string | null): Promise<SessionRecord | null> {
  return sessionToken === null ? null : repositories.sessions.findByToken(sessionToken);
}

/** @implements REQ-AUTH2-001, INV-ARCH-002 */
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
        email: valid.email ?? null,
        preferredLanguage: 'es',
        timezone: this.deps.clock.timeZone,
        passwordHash: await this.deps.hasher.hash(valid.password),
      };
      await repositories.users.insert(account);
      await recordAudit(this.deps, repositories, { executorUserId: account.id, mutationType: 'CREATE', entityType: 'USER', entityId: account.id, previous: null, next: account });
      return startSession(this.deps, repositories, account, now);
    });
  }
}

/** @implements REQ-AUTH2-002, INV-AUTH-006 */
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

/** @implements REQ-AUTH-004, INV-AUTH2-002 */
export class AuthenticateRequestUseCase {
  constructor(private readonly deps: ApplicationDeps) {}

  /**
   * userId de la sesión vigente, que además renueva `lastActivityAt` (evento REQUEST). Sin sesión, revocada o vencida
   * por inactividad o por tope: ERR-AUTH-UNAUTHENTICATED sin escribir nada.
   */
  async execute(sessionToken: string | null): Promise<string> {
    const now = this.deps.clock.nowIsoTimestamp();
    return this.deps.uow.runInTransaction(async (repositories) => {
      const renewed = renewSession(await currentSession(repositories, sessionToken), now);
      await repositories.sessions.save(sessionToken!, renewed);
      return renewed.userId;
    });
  }
}

/** @implements REQ-AUTH-004, INV-AUTH2-002 */
export class GetCurrentSessionUseCase {
  constructor(private readonly deps: ApplicationDeps) {}

  /** Sesión vigente tal como está persistida (la renovación ya la hizo `AuthenticateRequestUseCase`). */
  async execute(sessionToken: string | null): Promise<SessionView> {
    const now = this.deps.clock.nowIsoTimestamp();
    return this.deps.uow.runInTransaction(async (repositories) => {
      const session = assertAuthenticated(await currentSession(repositories, sessionToken), now);
      const account = await repositories.users.findById(session.userId);
      if (account === null) throw new DomainError('ERR-AUTH-UNAUTHENTICATED');
      return toSessionView(account, session);
    });
  }
}
