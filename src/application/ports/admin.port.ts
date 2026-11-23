/**
 * Puertos del portal de administración (Feature 009, [GH:#19]; Enmienda 009-A): identidad anclada al `sub` de Google, sesión PROPIA (solo el SHA-256 del identificador), estado del flujo
 * OIDC PROPIO (distinto de `oauth_flow_states` de usuarios) y auditoría PROPIA (sin tocar `AuditEntityType`). Ninguna tabla tiene clave foránea hacia `users`: el administrador puede no
 * tener cuenta de usuario (INV-ADM9-002). El correo, el `sub` y los tokens no salen de estos repositorios hacia logs, `detail` o `instance` (NFR-009-004).
 *
 * @implements REQ-ADM9-002, REQ-ADM9-003, REQ-ADM9-004, REQ-ADM9-006, INV-ADM9-001, INV-ADM9-002, INV-ARCH-004, INV-ARCH-005
 */

export type AdminProvider = 'GOOGLE';

export interface AdminIdentityRecord {
  /** UUID v4 de `IdGeneratorPort`, creado en el primer acceso verificado; nunca derivado del correo ni del `sub`. */
  readonly adminId: string;
  readonly provider: AdminProvider;
  /** `sub` de Google: ancla de la identidad. Dato personal: nunca a logs, auditoría ni respuestas. */
  readonly providerSubject: string;
  /** Correo en minúsculas del acceso que ancló la identidad; solo sirve para revalidar la lista cerrada en cada petición (EDGE-009-047). */
  readonly email: string;
  readonly createdAt: string;
}

export interface AdminIdentityRepositoryPort {
  findById(adminId: string): Promise<AdminIdentityRecord | null>;
  findBySubject(provider: AdminProvider, providerSubject: string): Promise<AdminIdentityRecord | null>;
  findByEmail(email: string): Promise<AdminIdentityRecord | null>;
  /** Inserta si no existe ni el `(provider, sub)` ni el correo (`ON CONFLICT DO NOTHING`): `true` si insertó, `false` si ya existía alguno de los dos (la existente no cambia). */
  insertIfAbsent(identity: AdminIdentityRecord): Promise<boolean>;
}

export interface AdminSessionRecord {
  /** SHA-256 hex (64) del identificador opaco de `argos_admin_session`; el identificador en claro nunca se guarda. */
  readonly tokenHash: string;
  readonly adminId: string;
  readonly createdAt: string;
  readonly lastActivityAt: string;
  readonly revokedAt: string | null;
}

export interface AdminSessionRepositoryPort {
  insert(record: AdminSessionRecord): Promise<void>;
  findByTokenHash(tokenHash: string): Promise<AdminSessionRecord | null>;
  /** Renueva `lastActivityAt` solo si la sesión no está revocada. */
  touch(tokenHash: string, lastActivityAt: string): Promise<void>;
  /** Compare-and-set: marca `revokedAt` si seguía vigente; `false` si no existe o ya estaba revocada. */
  revoke(tokenHash: string, revokedAt: string): Promise<boolean>;
  /** Borra las sesiones creadas en `cutoff` o antes (ya no pueden estar vigentes) y devuelve cuántas. */
  purgeCreatedBefore(cutoff: string): Promise<number>;
}

export interface AdminFlowStateRecord {
  /** SHA-256 hex (64) del identificador opaco de `argos_admin_oauth`. */
  readonly tokenHash: string;
  readonly state: string;
  readonly nonce: string;
  readonly codeVerifier: string;
  readonly createdAt: string;
  readonly expiresAt: string;
  readonly consumedAt: string | null;
}

export interface AdminFlowStateRepositoryPort {
  /** Falla si el identificador ya existe. */
  insert(record: AdminFlowStateRecord): Promise<void>;
  /** Compare-and-set de un solo uso: marca `consumedAt = now` si no se consumió y `expiresAt > now`, y devuelve la fila marcada; `null` si no coincide (un `state` reutilizado pierde aquí). */
  consume(tokenHash: string, nowIsoTimestamp: string): Promise<AdminFlowStateRecord | null>;
  /** Borra las filas con `expiresAt <= now` y devuelve cuántas. */
  purgeExpired(nowIsoTimestamp: string): Promise<number>;
}

export interface AdminAuditRecord {
  readonly id: string;
  /** Identificador opaco del administrador (el de `admin_identities`); no es un `userId`. */
  readonly adminId: string;
  /** Acción cerrada, p. ej. `ADMIN_SESSION_START`; nunca valores de prompt ni datos de usuario. */
  readonly action: string;
  readonly objectRef: string | null;
  readonly occurredAt: string;
}

export interface AdminAuditRepositoryPort {
  insert(record: AdminAuditRecord): Promise<void>;
  /** Entradas del administrador en orden de marca de tiempo (y de id para desempatar). */
  listByAdmin(adminId: string): Promise<AdminAuditRecord[]>;
}
