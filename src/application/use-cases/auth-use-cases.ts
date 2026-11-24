/**
 * Casos de uso de autenticación: registro, login, logout, sesión actual y autenticación de peticiones.
 * - Precedencia: esquema (regla 4) y dominio (regla 5). El username se guarda tal como se escribió y es único por LOWER (REQ-LOG-002,
 *   INV-LOG-001); con espacios se rechaza en el registro. El login acepta usuario o correo (REQ-LOG-001): el identificador se recorta y se
 *   pasa a minúsculas con `normalizeLoginIdentifier`; un correo resuelve solo si hay EXACTAMENTE una cuenta (EDGE-007).
 * - INV-AUTH2-002: autenticar una petición válida renueva `lastActivityAt`; una rechazada no escribe nada. Excepción: `renew: false` (SC-ALM-036).
 * - INV-AUTH-006 / INV-LOG-002: si el usuario no existe, o el correo no tiene cuenta o tiene varias, LoginUseCase verifica la contraseña
 *   contra el hash ficticio, de modo que PasswordHasherPort.verify se invoca exactamente una vez en todas las ramas y el error es el
 *   mismo ERR-AUTH-INVALID-CREDENTIALS. Un intento bloqueado no verifica ni se registra (INV-AUTH-005, EDGE-029).
 * - Límite de intentos (REQ-LOG-001, SC-CAT-020, SC-CAT-030, INV-LOG-002): los fallos se cuentan SOLO bajo el identificador normalizado (minúsculas):
 *   el usuario y el correo de una misma cuenta tienen contadores independientes y un éxito borra únicamente la clave con la que se entró. Un
 *   correo existente, inexistente o ambiguo se comporta igual (H-T591-2). `verifyCurrentPassword` conserva la clave del username.
 * - Los fallos de login se confirman antes de devolver el error, para que el rollback no los borre.
 * - 009 (T1246, REQ-APR9-001, REQ-APR9-002, EDGE-009-005, EDGE-009-038): el registro crea la cuenta `PENDING` y NO abre sesión (devuelve `{ accountStatus }`); el login con credenciales
 *   válidas de una cuenta `PENDING` o `REJECTED` devuelve el estado sin sesión (con credenciales inválidas rige el mismo fallo uniforme); la guarda de sesión exige `ACTIVE`.
 *
 * @implements STATE-ACCT9-001, REQ-APR9-001, REQ-APR9-002, ERR-ACCOUNT-PENDING, ERR-ACCOUNT-REJECTED, EDGE-009-005, REQ-AUTH2-001, REQ-AUTH2-002, REQ-LOG-001, REQ-LOG-002, INV-LOG-002, REQ-AUTH-003, REQ-AUTH-004, INV-AUTH2-002, INV-AUTH-006, INV-ARCH-001, INV-ARCH-002, INV-ARCH-005
 */

import { DomainError, type SessionView } from '../../generated/index.ts';
import { DomainError as DomainErrorV35 } from '../../generated/v35/index.ts';
import { INITIAL_ACCOUNT_STATUS, isAccountActive, type AccountStatus } from '../../domain/account/account-status.ts';
// 3.1.0 (feature 004): LoginInput acepta usuario o correo hasta 254 caracteres (REQ-LOG-001); el top-level generado sigue en 3.0.0.
import { validateLoginInput, type LoginInput } from '../../generated/v31/index.ts';
import {
  assertNotLockedOut,
  assertUsernameAvailable,
  invalidCredentialsError,
  isEmailIdentifier,
  normalizeLoginIdentifier,
  parseRegisterUserInput,
} from '../../domain/auth/auth-policies.ts';
import { authMethodsOf, hasPassword, type AuthMethods } from '../../domain/auth/password-sentinel.ts';
import { assertAuthenticated, logout, openSession, renewSession, sessionExpiries, type SessionRecord } from '../../domain/auth/session-policy.ts';
import type { RepositorySet, UserAccount } from '../ports/repositories.port.ts';
import { recordAudit } from './audit-support.ts';
import { mapUsernameViolation } from './username-violation.ts';
import { assertMatchesSchema, toSelfProfile, type ApplicationDeps } from './use-case-support.ts';

/**
 * `AccountStatusView` (002 3.4.0 / 004 3.5.0, DRAFT): el cuerpo cerrado que devuelven el registro, el login de una cuenta no `ACTIVE` y la elección de usuario de Google. Sin cookie, sin
 * perfil y sin correo (REQ-APR9-002).
 */
export interface AccountStatusResult {
  readonly accountStatus: AccountStatus;
}

/** Cierto si el resultado es el estado de una cuenta no `ACTIVE` (no hay sesión que emitir). */
export const isAccountStatusResult = (result: AuthenticatedSession | AccountStatusResult): result is AccountStatusResult => !('sessionToken' in result);

/** Error de la guarda de sesión para una cuenta no `ACTIVE` (defensa en profundidad; no revela motivo ni fecha). */
export function inactiveAccountError(status: AccountStatus): Error {
  return new DomainErrorV35(status === 'REJECTED' ? 'ERR-ACCOUNT-REJECTED' : 'ERR-ACCOUNT-PENDING');
}

export interface AuthenticatedSession {
  /** Valor de la cookie argos_session; la capa HTTP lo envía con Set-Cookie. */
  readonly sessionToken: string;
  readonly session: SessionView;
}

/**
 * Reglas del esquema de LoginInput (sin x-sdd-error: todo fallo de esquema es ERR-SCHEMA-VALIDATION-FAILED). El campo `username` conserva
 * su nombre por compatibilidad y trae un usuario o un correo; el recorte y la minúsculas los aplica `normalizeLoginIdentifier` después.
 */
function parseLoginInput(input: unknown): LoginInput {
  return assertMatchesSchema<LoginInput>('LoginInput', validateLoginInput, input);
}

/**
 * SessionView 3.0.0: perfil propio, actividad y vencimientos derivados (INV-AUTH2-002). Con `authMethods` (008, contrato de identidad 3.2.0: campo opcional de
 * `UserSelfProfile`) añade los dos booleanos de métodos de acceso; sin él la forma es la de siempre.
 */
export function toSessionView(account: UserAccount, session: SessionRecord, authMethods?: AuthMethods): SessionView {
  const user = authMethods === undefined ? toSelfProfile(account) : { ...toSelfProfile(account), authMethods };
  return { user, createdAt: session.createdAt, lastActivityAt: session.lastActivityAt, ...sessionExpiries(session) };
}

/**
 * Resolutor del identificador de inicio de sesión (REQ-LOG-001, INV-LOG-002): `identifier` ya viene de `normalizeLoginIdentifier`. Con `@`
 * se busca por correo y solo resuelve si hay EXACTAMENTE una cuenta (cero o varias: null, EDGE-007); sin `@` se busca por username sin
 * distinguir mayúsculas. Nunca lanza por «no existe»: el llamador verifica contra el hash ficticio y responde el error genérico.
 */
export async function resolveLoginAccount(repositories: RepositorySet, identifier: string): Promise<UserAccount | null> {
  if (!isEmailIdentifier(identifier)) return repositories.users.findByUsername(identifier);
  const matches = await repositories.users.listByEmail(identifier);
  return matches.length === 1 ? matches[0]! : null;
}

export async function startSession(deps: ApplicationDeps, repositories: RepositorySet, account: UserAccount, now: string, authMethods?: AuthMethods): Promise<AuthenticatedSession> {
  const sessionToken = deps.tokens.nextSessionToken();
  const session = openSession(account.id, now);
  await repositories.sessions.save(sessionToken, session);
  return { sessionToken, session: toSessionView(account, session, authMethods) };
}

async function currentSession(repositories: RepositorySet, sessionToken: string | null): Promise<SessionRecord | null> {
  return sessionToken === null ? null : repositories.sessions.findByToken(sessionToken);
}

/** @implements REQ-AUTH2-001, INV-ARCH-002 */
export class RegisterUserUseCase {
  constructor(private readonly deps: ApplicationDeps) {}

  async execute(input: unknown): Promise<AccountStatusResult> {
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
        accountStatus: INITIAL_ACCOUNT_STATUS,
      };
      // Carrera entre dos altas del mismo username (INV-LOG-001): la base es la última defensa y su violación es ERR-AUTH-USERNAME-TAKEN, no un 500.
      await mapUsernameViolation(() => repositories.users.insert(account));
      await recordAudit(this.deps, repositories, { executorUserId: account.id, mutationType: 'CREATE', entityType: 'USER', entityId: account.id, previous: null, next: account });
      return { accountStatus: INITIAL_ACCOUNT_STATUS };
    });
  }
}

/** @implements REQ-AUTH2-002, REQ-LOG-001, INV-AUTH-006, INV-LOG-002 */
export class LoginUseCase {
  constructor(private readonly deps: ApplicationDeps) {}

  async execute(input: unknown): Promise<AuthenticatedSession | AccountStatusResult> {
    const credentials = parseLoginInput(input);
    const identifier = normalizeLoginIdentifier(credentials.username);
    const now = this.deps.clock.nowIsoTimestamp();
    const result = await this.deps.uow.runInTransaction(async (repositories) => {
      const account = await resolveLoginAccount(repositories, identifier);
      const failures = await repositories.loginAttempts.listFailures(identifier);
      assertNotLockedOut(failures, now);
      const matches = await this.deps.hasher.verify(credentials.password, account?.passwordHash ?? this.deps.dummyPasswordHash);
      // ADR-008-14: una cuenta sin contraseña (centinela) nunca entra por contraseña, aunque un hasher distinto del scrypt respondiera `true`.
      if (account !== null && matches && hasPassword(account.passwordHash)) {
        await repositories.loginAttempts.replaceFailures(identifier, []);
        // EDGE-009-005: credenciales válidas de una cuenta PENDING o REJECTED = estado en el cuerpo, sin sesión ni cookie (el fallo con credenciales inválidas sigue siendo el uniforme).
        if (!isAccountActive(account.accountStatus)) return { accountStatus: account.accountStatus! };
        return startSession(this.deps, repositories, account, now);
      }
      await repositories.loginAttempts.replaceFailures(identifier, [...failures, now]);
      return null;
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
   * por inactividad o por tope: ERR-AUTH-UNAUTHENTICATED sin escribir nada. Con `renew: false` (renovación pasiva del visor,
   * SC-ALM-036) valida con las mismas reglas y el mismo error pero NO guarda `lastActivityAt`; por omisión renueva (fail-safe).
   */
  async execute(sessionToken: string | null, options: { readonly renew?: boolean } = {}): Promise<string> {
    const now = this.deps.clock.nowIsoTimestamp();
    return this.deps.uow.runInTransaction(async (repositories) => {
      const passive = options.renew === false;
      const current = await currentSession(repositories, sessionToken);
      const renewed = passive ? assertAuthenticated(current, now) : renewSession(current, now);
      // 009 (REQ-APR9-001, EDGE-009-038): la guarda exige `ACTIVE`. Una sesión viva de una cuenta que dejó de serlo responde 403 y no escribe nada (el error revierte la transacción).
      const status = await repositories.sessions.findOwnerAccountStatus(renewed.userId);
      if (status === null) throw new DomainError('ERR-AUTH-UNAUTHENTICATED');
      if (!isAccountActive(status)) throw inactiveAccountError(status);
      if (!passive) await repositories.sessions.save(sessionToken!, renewed);
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
      const identities = await repositories.authIdentities.listByUser(account.id);
      return toSessionView(account, session, authMethodsOf(account.passwordHash, identities.length));
    });
  }
}
