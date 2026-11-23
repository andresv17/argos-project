/**
 * Casos de uso del acceso con Google (Feature 008, `#16`; REQ-SSO8-001, REQ-SSO8-003, REQ-SSO8-004, REQ-SSO8-005, REQ-VIN8-002, ADR-008-03, ADR-008-14).
 * - Estado del flujo en servidor (`oauth_flow_states`), identificado por el SHA-256 del identificador opaco de la cookie `argos_oauth`; un solo uso por compare-and-set
 *   (`oauthFlows.consume`). Al iniciar un flujo se purgan los estados vencidos (H-A1-4). El correo, el `sub` y los tokens no salen de aquí hacia logs ni errores.
 * - Todo fallo del retorno (cancelación, `state` ajeno o reutilizado, estado vencido, canje o `id_token` inválidos, correo titular de una cuenta verificada) es el MISMO
 *   `ERR-AUTH-GOOGLE-FAILED`; el canje en Google se hace FUERA de la transacción (no se mantiene una conexión abierta durante la red).
 * - El alta es insertar-o-recuperar sobre `(provider, provider_subject)` (EDGE-008-030): la cuenta nace con correo verificado y la contraseña centinela (ADR-008-14).
 * - No hay autovinculación por correo (INV-VIN8-005): una identidad se añade a una cuenta existente solo desde su sesión activa con la contraseña actual.
 *
 * @implements REQ-SSO8-001, REQ-SSO8-003, REQ-SSO8-004, REQ-SSO8-005, REQ-VIN8-002, REQ-VIN8-004, EDGE-008-001, EDGE-008-002, EDGE-008-027, EDGE-008-030, INV-VIN8-001, INV-VIN8-002, INV-VIN8-003, INV-VIN8-005, INV-AUTH-006, INV-ARCH-001, INV-ARCH-002, INV-ARCH-005
 */

import {
  constantTimeEqual,
  generateOneTimeToken,
  hashOneTimeToken,
  isWellFormedOneTimeToken,
  issueOneTimeToken,
  type IssuedOneTimeToken,
} from '../../domain/auth/one-time-token.ts';
import { assertUsernameAvailable, invalidCredentialsError } from '../../domain/auth/auth-policies.ts';
import { hashSessionToken, sessionStateAt } from '../../domain/auth/session-policy.ts';
import { NO_PASSWORD_SENTINEL, authMethodsOf, hasPassword } from '../../domain/auth/password-sentinel.ts';
import { DomainError } from '../../generated/index.ts';
import {
  validateGoogleChooseUsernameInput,
  validateGoogleLinkStartInput,
  type GoogleChooseUsernameInput,
  type GoogleLinkStartInput,
} from '../../generated/v31/index.ts';
import type { OAuthFlowStateRecord } from '../ports/auth-identity.port.ts';
import type { RepositorySet, UserAccount } from '../ports/repositories.port.ts';
import { verifyCurrentPassword } from './account-use-cases.ts';
import { recordAudit } from './audit-support.ts';
import { startSession, type AuthenticatedSession } from './auth-use-cases.ts';
import { googleFailed, googleLinkConflict } from './google-errors.ts';
import { mapUsernameViolation } from './username-violation.ts';
import { assertMatchesSchema, type ApplicationDeps, type GoogleServices } from './use-case-support.ts';

/** Inicio de un flujo: la URL a la que navega la SPA y el identificador opaco que la capa HTTP entrega en la cookie `argos_oauth` (nunca se guarda en claro). */
export interface GoogleAuthorizationStart {
  readonly authorizationUrl: string;
  readonly oauthToken: string;
}

/** Resultado del retorno de Google: sesión abierta, vinculación hecha (SIN sesión nueva: se conserva la de origen, REQ-VIN8-004) o paso «Elige tu usuario» con un identificador nuevo para `argos_oauth`. */
export type GoogleCallbackResult =
  | ({ readonly kind: 'SESSION' } & AuthenticatedSession)
  | { readonly kind: 'LINKED' }
  | { readonly kind: 'CHOOSE_USERNAME'; readonly oauthToken: string };

export interface GoogleCallbackInput {
  /** Valor de la cookie `argos_oauth`; `null` si no llegó. */
  readonly oauthToken: string | null;
  readonly code?: string | undefined;
  readonly state?: string | undefined;
  /** Cualquier valor de `error` que Google envíe (p. ej. `access_denied`): se trata como fallo uniforme y no se refleja. */
  readonly error?: string | undefined;
}

/**
 * Sin la configuración de Google (`deps.google` ausente) las operaciones fallan cerrado. `startGoogleLogin` y `startGoogleLink` no declaran el 400 en el contrato: ahí es
 * un fallo de configuración del servidor (`ERR-INTERNAL-UNEXPECTED`, 500); el callback y la elección de usuario responden el 400 uniforme.
 */
function requireGoogle(deps: ApplicationDeps, onMissing: () => Error = googleFailed): GoogleServices {
  if (deps.google === undefined) throw onMissing();
  return deps.google;
}

const serverMisconfigured = (): Error => new DomainError('ERR-INTERNAL-UNEXPECTED');

/** Correo en minúsculas y sin espacios (la unicidad del titular verificado es por `lower(email)`). */
const normalizeEmail = (email: string): string => email.trim().toLowerCase();

/** Hash del identificador de la cookie si tiene la forma exacta (43 caracteres base64url); `null` si falta o está mal formado. */
const hashOfCookie = (oauthToken: string | null): string | null => (oauthToken !== null && isWellFormedOneTimeToken(oauthToken) ? hashOneTimeToken(oauthToken) : null);

/** Estado AUTHORIZATION nuevo (intención LOGIN o LINK) y URL de Google. Purga antes los estados vencidos (H-A1-4). */
async function beginAuthorization(
  google: GoogleServices,
  repositories: RepositorySet,
  now: string,
  intent: 'LOGIN' | 'LINK',
  userId: string | null,
  originSessionHash: string | null,
): Promise<GoogleAuthorizationStart> {
  await repositories.oauthFlows.purgeExpired(now);
  const issued = issueOneTimeToken(google.entropy, now);
  const state = generateOneTimeToken(google.entropy);
  const nonce = generateOneTimeToken(google.entropy);
  const codeVerifier = generateOneTimeToken(google.entropy);
  await repositories.oauthFlows.insert({
    tokenHash: issued.tokenHash,
    phase: 'AUTHORIZATION',
    intent,
    state,
    nonce,
    codeVerifier,
    userId,
    originSessionHash,
    pendingSubject: null,
    pendingEmail: null,
    createdAt: now,
    expiresAt: issued.expiresAt,
    consumedAt: null,
  });
  return { oauthToken: issued.token, authorizationUrl: google.oidc.authorizationUrl({ state, nonce, codeVerifier }) };
}

async function insertUsernameStep(repositories: RepositorySet, issued: IssuedOneTimeToken, now: string, sub: string, email: string): Promise<void> {
  await repositories.oauthFlows.insert({
    tokenHash: issued.tokenHash,
    phase: 'USERNAME',
    intent: 'LOGIN',
    state: null,
    nonce: null,
    codeVerifier: null,
    userId: null,
    originSessionHash: null,
    pendingSubject: sub,
    pendingEmail: email,
    createdAt: now,
    expiresAt: issued.expiresAt,
    consumedAt: null,
  });
}

/** Métodos de acceso de una cuenta ya cargada (lee sus identidades dentro de la transacción en curso). */
async function authMethodsFor(repositories: RepositorySet, account: UserAccount) {
  return authMethodsOf(account.passwordHash, (await repositories.authIdentities.listByUser(account.id)).length);
}

/** @implements REQ-SSO8-001, REQ-SSO8-004, ADR-008-03 */
export class StartGoogleLoginUseCase {
  constructor(private readonly deps: ApplicationDeps) {}

  async execute(): Promise<GoogleAuthorizationStart> {
    const google = requireGoogle(this.deps, serverMisconfigured);
    const now = this.deps.clock.nowIsoTimestamp();
    return this.deps.uow.runInTransaction((repositories) => beginAuthorization(google, repositories, now, 'LOGIN', null, null));
  }
}

/** @implements REQ-VIN8-002, REQ-VIN8-004, INV-VIN8-003, INV-VIN8-005, ADR-008-14 */
export class StartGoogleLinkUseCase {
  constructor(private readonly deps: ApplicationDeps) {}

  /**
   * Vincula Google a la cuenta de la sesión activa. Orden: esquema; cuenta sin contraseña (centinela) => 409 sin tocar el contador; contraseña actual con el contador de
   * intentos de REQ-LOG-001 (`ERR-AUTH-INVALID-CREDENTIALS`, el fallo se confirma antes de responder); cuenta que ya tiene Google => 409. El estado guarda el hash de la sesión
   * de origen (`sessionToken`, el mismo SHA-256 de `sessions.token_hash`; nunca el token): el retorno de Google no trae la cookie `Strict` y así sabe cuál conservar (H-A21-2).
   */
  async execute(userId: string, sessionToken: string, input: unknown): Promise<GoogleAuthorizationStart> {
    const valid = assertMatchesSchema<GoogleLinkStartInput>('GoogleLinkStartInput', validateGoogleLinkStartInput, input);
    const google = requireGoogle(this.deps, serverMisconfigured);
    const now = this.deps.clock.nowIsoTimestamp();
    const started = await this.deps.uow.runInTransaction(async (repositories) => {
      const account = await repositories.users.findById(userId);
      if (account === null) throw new DomainError('ERR-AUTH-UNAUTHENTICATED');
      if (!hasPassword(account.passwordHash)) throw googleLinkConflict();
      if (!(await verifyCurrentPassword(this.deps, repositories, account, valid.currentPassword, now))) return null;
      if ((await repositories.authIdentities.listByUser(userId)).length > 0) throw googleLinkConflict();
      return beginAuthorization(google, repositories, now, 'LINK', userId, hashSessionToken(sessionToken));
    });
    if (started === null) throw invalidCredentialsError();
    return started;
  }
}

/** @implements REQ-SSO8-001, REQ-SSO8-003, REQ-SSO8-004, REQ-SSO8-005, REQ-VIN8-002, EDGE-008-001, EDGE-008-002, INV-VIN8-001, INV-VIN8-002, INV-VIN8-005 */
export class CompleteGoogleLoginUseCase {
  constructor(private readonly deps: ApplicationDeps) {}

  async execute(input: GoogleCallbackInput): Promise<GoogleCallbackResult> {
    const google = requireGoogle(this.deps);
    const now = this.deps.clock.nowIsoTimestamp();
    const tokenHash = hashOfCookie(input.oauthToken);
    // Compare-and-set: el estado se consume SIEMPRE que la cookie sea válida, aunque el retorno venga con error o con un `state` ajeno (un `state` reutilizado pierde aquí).
    const flow = tokenHash === null ? null : await this.deps.uow.runInTransaction((repositories) => repositories.oauthFlows.consume(tokenHash, now, 'AUTHORIZATION'));
    if (flow === null || flow.state === null || flow.nonce === null || flow.codeVerifier === null) throw googleFailed();
    if (input.error !== undefined || input.code === undefined || input.code === '' || input.state === undefined || input.state === '' || !constantTimeEqual(flow.state, input.state)) throw googleFailed();

    let identity: { readonly sub: string; readonly email: string };
    try {
      identity = await google.oidc.complete({ code: input.code, codeVerifier: flow.codeVerifier, nonce: flow.nonce });
    } catch {
      throw googleFailed();
    }
    if (typeof identity.sub !== 'string' || identity.sub === '' || typeof identity.email !== 'string' || identity.email.trim() === '') throw googleFailed();
    const email = normalizeEmail(identity.email);

    return this.deps.uow.runInTransaction((repositories) =>
      flow.intent === 'LINK' ? this.link(repositories, flow, identity.sub, now) : this.login(google, repositories, identity.sub, email, now),
    );
  }

  private async login(google: GoogleServices, repositories: RepositorySet, sub: string, email: string, now: string): Promise<GoogleCallbackResult> {
    const identity = await repositories.authIdentities.findBySubject('GOOGLE', sub);
    if (identity !== null) {
      const account = await repositories.users.findById(identity.userId);
      if (account === null) throw googleFailed();
      return { kind: 'SESSION', ...(await startSession(this.deps, repositories, account, now, await authMethodsFor(repositories, account))) };
    }
    // REQ-SSO8-005 / EDGE-008-003: el correo de una cuenta con correo VERIFICADO no se reclama ni se vincula; solo una cuenta sin verificar lo libera (al elegir usuario).
    if ((await repositories.users.findVerifiedByEmail(email)) !== null) throw googleFailed();
    const issued = issueOneTimeToken(google.entropy, now);
    await insertUsernameStep(repositories, issued, now, sub, email);
    return { kind: 'CHOOSE_USERNAME', oauthToken: issued.token };
  }

  private async link(repositories: RepositorySet, flow: OAuthFlowStateRecord, sub: string, now: string): Promise<GoogleCallbackResult> {
    const userId = flow.userId;
    if (userId === null) throw googleFailed();
    const originHash = flow.originSessionHash;
    if (originHash === null) throw googleFailed();
    // REQ-VIN8-004, H-A21-2: la vinculación solo se completa si la sesión que la inició sigue viva (existe, no está revocada, es de la misma cuenta y no venció por inactividad ni por
    // el tope de 24 h). Se consulta SIN renovarla: el retorno de Google no trae la cookie `Strict`, así que esta comprobación es lo que ata el flujo a la sesión de origen.
    const origin = await repositories.sessions.findByTokenHash(originHash);
    if (origin === null || origin.userId !== userId || sessionStateAt(origin, now) !== 'AUTHENTICATED') throw googleFailed();
    const account = await repositories.users.findById(userId);
    if (account === null || !hasPassword(account.passwordHash)) throw googleFailed();
    if ((await repositories.authIdentities.listByUser(userId)).length > 0) throw googleFailed();
    // El correo de Google no tiene que coincidir con el de la cuenta; un `sub` que ya pertenece a otra cuenta (o a esta) no se vincula.
    if (!(await repositories.authIdentities.insertIfAbsent({ provider: 'GOOGLE', providerSubject: sub, userId, createdAt: now }))) throw googleFailed();
    // REQ-VIN8-004: se conserva la sesión de origen (la actual) y se revocan las demás; no se emite sesión nueva ni Set-Cookie.
    await repositories.sessions.revokeOthersByTokenHash(userId, originHash, now);
    // La auditoría no lleva correo ni `sub` (la vista canónica de USER excluye el hash y los datos de Google no entran).
    await recordAudit(this.deps, repositories, { executorUserId: userId, mutationType: 'UPDATE', entityType: 'USER', entityId: userId, previous: account, next: account });
    return { kind: 'LINKED' };
  }
}

/** Señal interna: otra transacción ganó el insertar-o-recuperar de la identidad; se revierte y se recupera la cuenta ganadora. */
class SubjectAlreadyClaimed extends Error {}

/** @implements REQ-SSO8-003, REQ-LOG-002, EDGE-008-027, EDGE-008-030, ADR-008-14, INV-AUTH-001 */
export class ChooseGoogleUsernameUseCase {
  constructor(private readonly deps: ApplicationDeps) {}

  async execute(oauthToken: string | null, input: unknown): Promise<AuthenticatedSession> {
    // Regla 4: el esquema (cuerpo cerrado: ni correo, ni rol, ni estado de cuenta) se valida antes de tocar el estado del flujo.
    const valid = assertMatchesSchema<GoogleChooseUsernameInput>('GoogleChooseUsernameInput', validateGoogleChooseUsernameInput, input);
    requireGoogle(this.deps);
    const now = this.deps.clock.nowIsoTimestamp();
    const tokenHash = hashOfCookie(oauthToken);
    if (tokenHash === null) throw googleFailed();
    try {
      return await this.deps.uow.runInTransaction((repositories) => this.createAccount(repositories, tokenHash, valid.username, now));
    } catch (error) {
      if (!(error instanceof SubjectAlreadyClaimed)) throw error;
    }
    // Carrera perdida: la transacción se revirtió entera (también el consumo del estado); se consume de nuevo y se recupera la cuenta ganadora, nunca un 500.
    return this.deps.uow.runInTransaction(async (repositories) => {
      const flow = await repositories.oauthFlows.consume(tokenHash, now, 'USERNAME');
      const identity = flow?.pendingSubject == null ? null : await repositories.authIdentities.findBySubject('GOOGLE', flow.pendingSubject);
      const account = identity === null ? null : await repositories.users.findById(identity.userId);
      if (account === null) throw googleFailed();
      return startSession(this.deps, repositories, account, now, await authMethodsFor(repositories, account));
    });
  }

  private async createAccount(repositories: RepositorySet, tokenHash: string, username: string, now: string): Promise<AuthenticatedSession> {
    const flow = await repositories.oauthFlows.consume(tokenHash, now, 'USERNAME');
    if (flow === null || flow.pendingSubject === null || flow.pendingEmail === null) throw googleFailed();
    const sub = flow.pendingSubject;
    const email = flow.pendingEmail;
    // Insertar-o-recuperar: si el `sub` ya tiene cuenta (otra pestaña terminó antes) se inicia sesión en ESA cuenta y no se crea otra.
    const existing = await repositories.authIdentities.findBySubject('GOOGLE', sub);
    if (existing !== null) {
      const account = await repositories.users.findById(existing.userId);
      if (account === null) throw googleFailed();
      return startSession(this.deps, repositories, account, now, await authMethodsFor(repositories, account));
    }
    const sameUsername = await repositories.users.findByUsername(username);
    if (sameUsername !== null) assertUsernameAvailable(username, [sameUsername.username]);
    // D8-14: el correo verificado por Google libera el de una cuenta antigua SIN verificar (conserva usuario y contraseña); si otro titular verificado apareció, se rechaza.
    await repositories.users.releaseUnverifiedEmail(email);
    if ((await repositories.users.findVerifiedByEmail(email)) !== null) throw googleFailed();
    const account: UserAccount = {
      id: this.deps.ids.nextId(),
      username,
      displayName: username,
      createdAt: now,
      email,
      emailVerifiedAt: now,
      preferredLanguage: 'es',
      timezone: this.deps.clock.timeZone,
      passwordHash: NO_PASSWORD_SENTINEL,
    };
    await mapUsernameViolation(() => repositories.users.insert(account));
    if (!(await repositories.authIdentities.insertIfAbsent({ provider: 'GOOGLE', providerSubject: sub, userId: account.id, createdAt: now }))) throw new SubjectAlreadyClaimed();
    await recordAudit(this.deps, repositories, { executorUserId: account.id, mutationType: 'CREATE', entityType: 'USER', entityId: account.id, previous: null, next: account });
    return startSession(this.deps, repositories, account, now, authMethodsOf(account.passwordHash, 1));
  }
}
