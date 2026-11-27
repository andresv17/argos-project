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
  /** `person_id` opaco de persona física verificada (012, T1648); solo lo asigna SUPER_ADMIN. Ausente o `null` = sin asignar (el control dual falla cerrado). */
  readonly personId?: string | null;
}

export interface AdminIdentityRepositoryPort {
  findById(adminId: string): Promise<AdminIdentityRecord | null>;
  /** `person_id` del administrador o `null` (sin asignar o identidad inexistente). */
  findPersonId(adminId: string): Promise<string | null>;
  findBySubject(provider: AdminProvider, providerSubject: string): Promise<AdminIdentityRecord | null>;
  findByEmail(email: string): Promise<AdminIdentityRecord | null>;
  /** Inserta si no existe ni el `(provider, sub)` ni el correo (`ON CONFLICT DO NOTHING`): `true` si insertó, `false` si ya existía alguno de los dos (la existente no cambia). */
  insertIfAbsent(identity: AdminIdentityRecord): Promise<boolean>;
  /**
   * Retira una identidad que ya no pertenece a ningún delegado vigente (feature 011, EDGE-011-019: correo reciclado tras una baja): libera su correo y su `sub` para un anclaje nuevo y borra sus sesiones
   * (`ON DELETE CASCADE`). La auditoría conserva el `admin_id` (sin clave foránea). `true` si existía.
   */
  deleteById(adminId: string): Promise<boolean>;
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
  /** Borra TODAS las sesiones del administrador (feature 011, REQ-ADM11-004: desactivar revoca de inmediato, en la misma transacción) y devuelve cuántas. */
  deleteByAdminId(adminId: string): Promise<number>;
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
  /** Metadatos opcionales (JSON de texto, <= 4096); ausente (clave omitida al leer) en filas sin motivo y previas a la migración 0038 (SQLite) / 0034 (PostgreSQL). Hoy solo el motivo de decisión del arbitraje de disputas (feature 012). */
  readonly metadata?: string | null;
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
/** Dato minimo de un intento para la regla de coste (T1296 (i)): solo modelo, region y marca de llamada; nunca prompt, inputs ni ids. */
export interface SceneSpendAttemptRecord {
  readonly providerModel: string | null;
  readonly providerLocation: string | null;
  readonly providerCallStartedAt: string | null;
}

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
   * AMPLIADO (fix 009 produccion, D9-28; SC-009-054): tambien pone a cero las escenas de los hogares donde la cuenta es propietaria legal (`households.owner_user_id`), ELIMINA su `scene_quota_carry`
   * `run_state = 'failed'` vuelve a nulo (una escena con intento activo `generating` no se toca). No toca `scene.global_quota_used.*` ni hogares ajenos.
   * REEMPLAZADO (D9-31, T1315): ya NO reescribe `scene_attempts` (ni `outcome` ni `provider_call_started_at`); fija `limits_reset_at = resetAt` en cada escena afectada y en la marca por usuario de cada
   * cuenta (`scene_actor_limit_marks`), de modo que FAILED_LIMIT, los intentos cerrados sin llamada y ACTOR_LIMIT cuentan solo intentos posteriores. El enfriamiento tras SUCCEEDED no se reinicia.
   */
  resetAdminAccountsSceneQuota(subjects: readonly string[], emails: readonly string[], resetAt: string): Promise<{ readonly accountsReset: number } | null>;
  /** Ids de usuario de las cuentas del administrador (mismo criterio que `resetAdminAccountsSceneQuota`); solo uso interno para reiniciar el limite en RAM, nunca sale por HTTP. */
  listAdminAccountUserIds(subjects: readonly string[], emails: readonly string[]): Promise<readonly string[]>;
  /** Intentos de la ventana mensual `quota_window` (YYYY-MM de America/Bogota, fijada al crear el intento) para la regla de coste de `EDGE-009-036`. El filtro es por ventana, no por UTC. */
  listSceneSpendAttempts(window: string): Promise<readonly SceneSpendAttemptRecord[]>;
}

/**
 * Fila de `admin_delegates` (feature 011, migración SQLite 0031 / PostgreSQL 0027). `role` y `status` viajan CRUDOS (texto de la base): el dominio los interpreta con `toDelegate` y un valor
 * desconocido deja sin acceso (falla cerrada, REQ-ADM11-003). Sin clave foránea hacia `users`; el correo nunca sale de estos repositorios hacia logs ni errores (H-9).
 */
export interface AdminDelegateRecord {
  /** UUID v4 de `IdGeneratorPort`; el MISMO id de `admin_identities` y de la auditoría. */
  readonly adminId: string;
  /** Correo normalizado en minúsculas. */
  readonly email: string;
  readonly role: string;
  readonly status: string;
  readonly provider: AdminProvider | null;
  /** `sub` anclado (dato personal: nunca a vistas, logs ni errores); nulo hasta el primer acceso. */
  readonly providerSubject: string | null;
  readonly invitedAt: string | null;
  readonly invitedExpiresAt: string | null;
  readonly anchoredAt: string | null;
  readonly disabledAt: string | null;
  readonly createdByAdminId: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

/**
 * Delegados de `/admin` (feature 011). Todas las escrituras ocurren dentro de la transacción serializada de la unidad de trabajo (`BEGIN IMMEDIATE` en SQLite; candado asesor más
 * `SELECT ... FOR UPDATE` en PostgreSQL, H-2a) y cada una es un compare-and-set: el veredicto es `changes === 1`, sin lectura previa que decida.
 */
export interface AdminDelegateRepositoryPort {
  /**
   * Toma los candados de fila que serializan la guarda del último SUPER_ADMIN y los topes (H-2a): PostgreSQL `SELECT ... FOR UPDATE` sobre las filas `ACTIVE`/`INVITED`; SQLite y memoria no hacen
   * nada (la transacción ya sostiene el candado de escritura). Se llama al principio de toda escritura de delegados y de todo anclaje.
   */
  lockForGuard(): Promise<void>;
  findById(adminId: string): Promise<AdminDelegateRecord | null>;
  /** La fila `ACTIVE` o `INVITED` con ese correo (a lo sumo una por el índice único parcial, ORA-1 b); `null` si solo hay filas `DISABLED` o ninguna. */
  findLiveByEmail(email: string): Promise<AdminDelegateRecord | null>;
  /** A lo sumo `limit` filas por `created_at` ascendente y `admin_id`. */
  list(limit: number): Promise<AdminDelegateRecord[]>;
  countRows(): Promise<number>;
  /** Delegados que ocupan plaza (`ACTIVE` + `INVITED` con `invited_expires_at >= now`), sin contar a `excludeAdminId` si se indica. */
  countOccupied(now: string, excludeAdminId: string | null): Promise<number>;
  /** Delegados `ACTIVE` con rol `SUPER_ADMIN` cuyo correo NO está en `excludeEmails`, sin contar a `excludeAdminId` (puede ser `null`). */
  countActiveSuperAdmins(excludeEmails: readonly string[], excludeAdminId: string | null): Promise<number>;
  /** Inserta; `false` si el índice único parcial por correo vivo (`ACTIVE`/`INVITED`) o el `admin_id` ya existen. */
  insert(record: AdminDelegateRecord): Promise<boolean>;
  /** Reemplaza los campos mutables si la fila sigue igual (mismos `status`, `role`, `updated_at` y `provider_subject` que `expected`); `false` si otra escritura ganó. */
  replace(next: AdminDelegateRecord, expected: AdminDelegateRecord): Promise<boolean>;
  /**
   * Anclaje (INVITED -> ACTIVE) con compare-and-set: `UPDATE ... WHERE admin_id = ? AND status = 'INVITED' AND provider_subject IS NULL AND invited_expires_at >= now`.
   * Fija `provider`, `provider_subject`, `anchored_at`, `updated_at` y borra `invited_expires_at`. `true` solo si ESTA llamada anclo.
   */
  anchor(adminId: string, provider: AdminProvider, providerSubject: string, now: string): Promise<boolean>;
  /**
   * Purga de invitaciones caducadas (DEUDA-011-PURGA-DELEGADOS, D-2): borra las filas `INVITED` con `invited_at` ESTRICTAMENTE anterior a `invitedBefore` (el llamador resta la caducidad de 72 h y los 30 días
   * de retención al reloj) y devuelve cuántas. Nunca toca filas `ACTIVE` ni `DISABLED`. Solo conteo: no devuelve ni registra correos.
   */
  purgeExpiredInvitations(invitedBefore: string): Promise<number>;
  /**
   * Anonimización de bajas (D-1): en las filas `DISABLED` con `disabled_at` ESTRICTAMENTE anterior a `disabledBefore` sustituye el correo por un marcador derivado del `admin_id` (`anon-<admin_id>@anonimizado.invalid`)
   * y borra `provider` y `provider_subject`; conserva `admin_id`, rol, fechas y `created_by_admin_id`. Idempotente (no vuelve a tocar una fila ya anonimizada). Devuelve los `admin_id` anonimizados (opacos) para que
   * el llamador retire sus identidades; nunca devuelve correos ni `sub`.
   */
  anonymizeDisabledBefore(disabledBefore: string): Promise<readonly string[]>;
}
