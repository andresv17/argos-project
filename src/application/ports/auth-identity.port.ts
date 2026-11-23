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
/** LOGIN y LINK (008); DELETE (009, T1219): reautenticación reciente con Google para eliminar una cuenta sin contraseña (REQ-DEL9-001, INV-DEL9-001). */
export type OAuthFlowIntent = 'LOGIN' | 'LINK' | 'DELETE';

export interface OAuthFlowStateRecord {
  /** SHA-256 (hex) del identificador opaco de la cookie `argos_oauth`; el identificador en claro nunca se guarda. */
  readonly tokenHash: string;
  readonly phase: OAuthFlowPhase;
  readonly intent: OAuthFlowIntent;
  readonly state: string | null;
  readonly nonce: string | null;
  readonly codeVerifier: string | null;
  /** Usuario de la sesión que inicia la vinculación o la reautenticación de borrado (intenciones LINK y DELETE). */
  readonly userId: string | null;
  /** SHA-256 hex (64) del token de la sesión que inició la vinculación, igual a `sessions.token_hash` (LINK y DELETE, obligatorio ahí; `null` en LOGIN). REQ-VIN8-004, H-A21-2. */
  readonly originSessionHash: string | null;
  /** USERNAME: `sub` que espera la elección de usuario. DELETE (009): `sub` verificado por Google tras el retorno = MARCA de la prueba de titularidad (`null` mientras no se acredita). */
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
  /**
   * Prueba de titularidad para eliminar la cuenta (009, REQ-DEL9-001, INV-DEL9-001), SOLO lectura: la fila DELETE del usuario y de ESA sesión de origen, ya consumida por el
   * retorno de Google, con la marca `pendingSubject` y vigente (`expiresAt > now`); `null` si no hay (ausente, sin marca, vencida, de otro usuario o de otra sesión).
   */
  findDeletionProof(userId: string, originSessionHash: string, nowIsoTimestamp: string): Promise<OAuthFlowStateRecord | null>;
  /** Marca la fila DELETE ya consumida con el `sub` verificado (`pendingSubject`); `false` si no es DELETE, no se consumió o ya estaba marcada. Un solo uso de la marca. */
  markDeletionProof(tokenHash: string, verifiedSubject: string): Promise<boolean>;
  /** Consume la prueba eliminando la fila (compare-and-set: exactamente 1 fila marcada y vigente); `false` si no hay, venció o ya se usó. Se revierte con la transacción. */
  consumeDeletionProof(tokenHash: string, nowIsoTimestamp: string): Promise<boolean>;
}
