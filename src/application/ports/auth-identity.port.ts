/**
 * Puertos del acceso con Google (Feature 008, [GH:#16]): identidades externas y estado del flujo OIDC.
 * - `AuthIdentityRepositoryPort`: la identidad se ancla en `(provider, provider_subject)` (el `sub` de Google), nunca en el correo (EDGE-008-002). `insertIfAbsent` es el
 *   «inserta o recupera» atómico de `chooseGoogleUsername`: un segundo intento no es un 500, devuelve `false` y el llamador recupera la cuenta con `findBySubject`.
 * - `OAuthFlowStateRepositoryPort`: estado del flujo en servidor, identificado por el SHA-256 del identificador opaco de la cookie `argos_oauth` (REQ-SSO8-004). Vence a los
 *   900 s y se consume UNA vez por compare-and-set (`consume`). Ni el correo, ni el `sub`, ni los tokens salen de estos repositorios hacia logs, `detail` o `instance` (NFR-008-004).
 *
 * @implements REQ-SSO8-001, REQ-SSO8-003, REQ-SSO8-004, EDGE-008-002, NFR-008-004, INV-ARCH-004, INV-ARCH-005
 */

export type AuthProvider = 'GOOGLE';

export interface AuthIdentityRecord {
  readonly provider: AuthProvider;
  /** `sub` del proveedor: dato personal, nunca se escribe en logs ni en `detail`/`instance`. */
  readonly providerSubject: string;
  readonly userId: string;
  readonly createdAt: string;
}

export interface AuthIdentityRepositoryPort {
  findBySubject(provider: AuthProvider, providerSubject: string): Promise<AuthIdentityRecord | null>;
  listByUser(userId: string): Promise<AuthIdentityRecord[]>;
  /**
   * Inserta la identidad si `(provider, provider_subject)` no existe (`ON CONFLICT DO NOTHING`): `true` si insertó, `false` si ya existía (la existente no cambia).
   * Falla si el usuario no existe (clave foránea).
   */
  insertIfAbsent(identity: AuthIdentityRecord): Promise<boolean>;
}

/** AUTHORIZATION: `state`, `nonce` y verificador PKCE esperan el retorno de Google. USERNAME: identidad verificada por Google que espera la elección de `username` (solo LOGIN). */
export type OAuthFlowPhase = 'AUTHORIZATION' | 'USERNAME';
export type OAuthFlowIntent = 'LOGIN' | 'LINK';

export interface OAuthFlowStateRecord {
  /** SHA-256 (hex) del identificador opaco de la cookie `argos_oauth`; el identificador en claro nunca se guarda. */
  readonly tokenHash: string;
  readonly phase: OAuthFlowPhase;
  readonly intent: OAuthFlowIntent;
  readonly state: string | null;
  readonly nonce: string | null;
  readonly codeVerifier: string | null;
  /** Usuario de la sesión que inicia la vinculación (solo intención LINK). */
  readonly userId: string | null;
  readonly pendingSubject: string | null;
  readonly pendingEmail: string | null;
  readonly createdAt: string;
  readonly expiresAt: string;
  readonly consumedAt: string | null;
}

export interface OAuthFlowStateRepositoryPort {
  /** Falla si el identificador ya existe o si la forma de la fila es incoherente con su fase e intención. */
  insert(record: OAuthFlowStateRecord): Promise<void>;
  findByTokenHash(tokenHash: string): Promise<OAuthFlowStateRecord | null>;
  /**
   * Compare-and-set de un solo uso: marca `consumedAt = now` donde el hash y la fase coinciden, la fila no se consumió y `expiresAt > now`, y devuelve la fila ya marcada;
   * `null` si no hay coincidencia, ya se usó, venció o es de otra fase (un `state` reutilizado pierde aquí).
   */
  consume(tokenHash: string, nowIsoTimestamp: string, expectedPhase: OAuthFlowPhase): Promise<OAuthFlowStateRecord | null>;
  /** Borra las filas con `expiresAt <= now` y devuelve cuántas. */
  purgeExpired(nowIsoTimestamp: string): Promise<number>;
}
