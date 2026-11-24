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

/** Método de registro de una solicitud (feature 009, T1247): `GOOGLE` si la cuenta no tiene contraseña propia (centinela), `PASSWORD` si la tiene. */
export type RegistrationMethod = 'PASSWORD' | 'GOOGLE';

/** Solicitud `PENDING` tal como la ve el portal: nunca el correo, el `sub` ni el hash (NFR-009-004). */
export interface PendingRegistrationRecord {
  readonly registrationId: string;
  readonly username: string;
  /** `users.data.createdAt`: base de la purga de 30 días (REQ-APR9-007). */
  readonly requestedAt: string;
  readonly method: RegistrationMethod;
}

/** Posición de keyset de la lista: la última fila entregada (orden `requestedAt` ascendente y `registrationId` para desempatar). */
export interface PendingRegistrationPosition {
  readonly requestedAt: string;
  readonly registrationId: string;
}

/**
 * Decisión de aprobación de cuentas (feature 009, T1247, REQ-APR9-003, STATE-ACCT9-001). Opera sobre `users` pero vive en el grupo de administración para no ampliar
 * `UserRepositoryPort` (cuyo `update` NUNCA modifica `account_status`). `createdAfter` es el corte de 30 días (EDGE-009-039): una `PENDING` creada en o antes de ese instante ya no se lista
 * ni se decide.
 */
export interface RegistrationDecisionRepositoryPort {
  /** Cuántas cuentas siguen `PENDING` dentro de la ventana de 30 días. */
  countPending(createdAfter: string): Promise<number>;
  /** Hasta `limit` solicitudes `PENDING` de la ventana, por `requestedAt` ascendente y `registrationId`, a continuación de `after` (o desde el principio si es `null`). */
  listPending(createdAfter: string, limit: number, after: PendingRegistrationPosition | null): Promise<PendingRegistrationRecord[]>;
  /**
   * Compare-and-set ATÓMICO: un único `UPDATE … WHERE id = ? AND account_status = 'PENDING' AND creada dentro de la ventana` que fija el estado destino, `decided_at` y `decided_by`.
   * `true` solo si ESTA llamada cambió la fila (una fila afectada); `false` si ya no estaba `PENDING`, no existe, o superó la ventana. Sin lectura previa que decida.
   */
  decide(registrationId: string, to: 'ACTIVE' | 'REJECTED', decidedBy: string, decidedAt: string, createdAfter: string): Promise<boolean>;
}

/** Fila de `platform_parameters` tal como la ve la edicion de `/admin`: solo texto y marca de tiempo (nunca `updated_by_user_id`). */
export interface ParameterRowRecord {
  readonly value: string;
  readonly updatedAt: string;
}

/**
 * Edicion de parametros de plataforma desde `/admin` (feature 009, Fase 5a, T1264, REQ-CFG9-001, REQ-CFG9-007). Escribe en `platform_parameters` SIN tocar `updated_by_user_id` (queda `NULL`):
 * el autor vive solo en `admin_audit_entries` (MER-09). Opera por clave del catalogo cerrado; no crea claves nuevas (la fila ausente de una clave del catalogo se inserta).
 */
export interface AdminParameterRepositoryPort {
  /** Fila actual o `null` si no existe (sin interpretar). */
  find(key: string): Promise<ParameterRowRecord | null>;
  /**
   * Compare-and-set ATOMICO. `expected = null`: inserta solo si la fila sigue ausente. `expected` presente: un unico `UPDATE ... WHERE key = ? AND value = ? AND updated_at = ?`.
   * `true` solo si ESTA llamada escribio (una fila afectada); `false` si otra escritura gano. Fija `value` y `updated_at`; `updated_by_user_id` queda `NULL`.
   */
  compareAndSet(key: string, description: string, next: ParameterRowRecord, expected: ParameterRowRecord | null): Promise<boolean>;
  /** Id de administrador de la ULTIMA entrada de `admin_audit_entries` con esa accion y `object_ref = key`; `null` si nunca se edito desde `/admin`. */
  lastEditor(action: string, key: string): Promise<string | null>;
  /**
   * Reinicio de cuota de las cuentas del administrador (T1268, REQ-CFG9-006, opcion A de Neo): identifica las cuentas de usuario por el `sub` de Google vinculado (`auth_identities`) o por un correo
   * VERIFICADO igual (sin distinguir mayusculas) a uno de `emails`, y pone a cero SOLO `home_scenes.consumed_generations` con `owner_user_id` de esas cuentas y su `scene_quota_carry`. Los hogares
   * compartidos (`owner_user_id` nulo) y `scene.global_quota_used.*` NO se tocan. Cada fila se pone a cero con compare-and-set sobre el valor leido: si otra escritura lo cambio, devuelve `null`
   * (el caso de uso revierte la transaccion entera, sin cambios parciales). Devuelve cuantas cuentas coincidieron (puede ser 0), nunca sus ids.
   */
  resetAdminAccountsSceneQuota(subjects: readonly string[], emails: readonly string[]): Promise<{ readonly accountsReset: number } | null>;
}
