# Modelo de datos: Plataforma ARGOS v2.1 (Feature 002)

**Rama**: `002-plataforma-v21` | **Spec**: [spec.md](./spec.md) (APPROVED) | **Plan**: [plan.md](./plan.md) | **Contratos**: [contracts/](./contracts/README.md)

Este documento fija entidades, campos, tipos, claves y restricciones del almacenamiento. El contrato JSON Schema es la fuente de verdad de las **formas de entrada y salida**; este documento es la fuente de verdad de las **tablas**. Ante una diferencia entre la prosa y un contrato, prevalece el contrato (Principio I). Los nombres de tabla y columna son del plan: el adaptador SQLite los materializa y la capa de dominio nunca los ve (`INV-ARCH-004`, `INV-ARCH-005`).

Convenciones: identificadores `TEXT` con UUID v4 generado por `IdGeneratorPort` (122 bits aleatorios, no enumerables; verificado por Neo); marcas de tiempo `TEXT` en UTC canónico con milisegundos (`2026-11-10T18:00:00.000Z`); fechas civiles `TEXT` `YYYY-MM-DD`; booleanos `INTEGER` 0 o 1; `PRAGMA foreign_keys = ON` y `PRAGMA secure_delete = ON` al abrir la base (R4).

## 1. Diagrama de relaciones

```text
users 1──* sessions
users 1──0..1 backup_confirmation_tokens
users 1──* rate_limit_events
users 1──* pets (owner_user_id)            pets 1──* {weight_records, body_measurements,
                                                    vaccination_records, deworming_records,
                                                    medical_visits, custom_parameters}
users 1──* household_members *──1 households        households.owner_user_id -> users
households 1──* household_invitations               (invitee_user_id nulo = invitación inerte)
pets *──* households   vía pet_assignments
audit_log  (SIN clave foránea a ninguna tabla)
schema_migrations
```

## 2. Entidades

### 2.1 `users` (Usuario) — `REQ-AUTH2-001`, `REQ-ACC-001`, `REQ-AUTH-004`

| Columna | Tipo | Restricciones | Origen |
|---|---|---|---|
| `id` | TEXT | PK, UUID v4 | `INV-AUTH-001` |
| `username` | TEXT | NOT NULL, UNIQUE, `length 3..30`, `^[a-z0-9._-]+$` (CHECK de longitud; el patrón lo valida el contrato). Sin normalización: las mayúsculas se rechazan | `REQ-AUTH2-001`, `INV-AUTH-001` |
| `display_name` | TEXT | NOT NULL, 1..60, sin espacios extremos | `REQ-AUTH2-001` |
| `email` | TEXT | NULL, formato correo, ≤ 254, **no único**, no verificado, nunca en logs | `REQ-AUTH2-001`, `INV-AUTH-006` |
| `password_hash` | TEXT | NOT NULL. `scrypt` con sal propia (constitución). Nunca sale del servidor | `INV-AUTH-003` |
| `preferred_language` | TEXT | NOT NULL, `CHECK IN ('es','en','pt')`, DEFAULT `'es'` | `REQ-ACC-001` |
| `timezone` | TEXT | NOT NULL, IANA válida. Valor inicial: `APP_TIMEZONE`. Solo formatea horas de pantalla | `REQ-ACC-001`, `REQ-TIME-001` |
| `created_at` | TEXT | NOT NULL | `REQ-AUTH-004` |

La contraseña de 8 caracteres de una cuenta de la 001 sigue siendo válida para iniciar sesión (el login no aplica la política); el `password_hash` no cambia en la migración (`SC-010`).

### 2.2 `sessions` (Sesión) — `INV-AUTH2-002`, `STATE-AUTH-SESSION-001` v3.0.0

| Columna | Tipo | Restricciones |
|---|---|---|
| `id` | TEXT | PK, UUID v4 |
| `user_id` | TEXT | NOT NULL, FK `users(id)` ON DELETE CASCADE, índice |
| `token_hash` | TEXT | NOT NULL, UNIQUE. `SHA-256(token)` en hexadecimal; **el token nunca se guarda** (`INV-AUTH-003`) |
| `created_at` | TEXT | NOT NULL. Inicio del tope absoluto de 24 h |
| `last_activity_at` | TEXT | NOT NULL. Se renueva solo en peticiones autenticadas **válidas** |
| `revoked_at` | TEXT | NULL = vigente. Se escribe al cerrar sesión, al cambiar la contraseña (las demás sesiones) |

`EXPIRED` y `EXPIRED_IDLE` **no se persisten**: se derivan en cada petición con `ClockPort` (válida si `revoked_at IS NULL`, `ahora < created_at + 24 h` y `ahora < last_activity_at + 30 min`). No se guardan IP ni user-agent. Se purgan las filas expiradas o revocadas con más de 7 días (P-03).

### 2.3 `login_attempts` (de la 001, se reutiliza) — `INV-AUTH-005`

Ventana deslizante de 15 min por `username`. Desde la 002 también reciben los fallos de **contraseña actual** al cambiar la contraseña y al eliminar la cuenta (T3). Se borra la entrada del `username` en un login exitoso. Los intentos bloqueados no se registran.

### 2.4 `backup_confirmation_tokens` (Token de respaldo) — `REQ-ACC-002` (5), `REQ-BACKUP2-001`

| Columna | Tipo | Restricciones |
|---|---|---|
| `user_id` | TEXT | PK, FK `users(id)` ON DELETE CASCADE. Una fila por usuario: el token nuevo reemplaza al anterior |
| `token_hash` | TEXT | NOT NULL, UNIQUE. `SHA-256` del token de 32 bytes base64url. Nunca el valor |
| `created_at` | TEXT | NOT NULL |
| `expires_at` | TEXT | NOT NULL = `created_at + 10 min` |
| `used_at` | TEXT | NULL = sin usar |

El consumo es `UPDATE ... SET used_at = :ahora WHERE token_hash = :h AND user_id = :sesion AND used_at IS NULL AND expires_at > :ahora` con exactamente 1 fila afectada, **dentro de la transacción de eliminación**. El token prueba que se pidió el respaldo, no que se guardó (T5, riesgo residual aceptado). No va en el archivo, ni en auditoría, ni en logs.

### 2.5 `rate_limit_events` (Límite de frecuencia) — T3, R3

| Columna | Tipo | Restricciones |
|---|---|---|
| `id` | TEXT | PK |
| `scope` | TEXT | `CHECK IN ('EXPORT','INVITE')` |
| `subject_user_id` | TEXT | NOT NULL, FK `users(id)` ON DELETE CASCADE |
| `occurred_at` | TEXT | NOT NULL |

Ventana deslizante contada con `ClockPort`. Contiene `userId` en claro, por lo que se borra al eliminar la cuenta (paso B9 de `STATE-ACCOUNT-DELETE-001`). Los valores de ventana y tope viven en configuración (`ADR-002-12`).

### 2.6 `pets` (Mascota) — `REQ-PET2-001`, `INV-PET2-001`, `INV-OWN2-001`

| Columna | Tipo | Restricciones |
|---|---|---|
| `id` | TEXT | PK, UUID v4 |
| `owner_user_id` | TEXT | NOT NULL, FK `users(id)` ON DELETE **RESTRICT** (la eliminación de cuenta borra las mascotas explícitamente antes que al usuario; una omisión falla en voz alta). Solo cambia con `REQ-OWN-001` |
| `name` | TEXT | NOT NULL, 1..50, sin espacios extremos |
| `species` | TEXT | NOT NULL, `CHECK IN ('CANINE','FELINE','RABBIT','FERRET','BIRD','REPTILE','SMALL_MAMMAL','OTHER')` |
| `species_other` | TEXT | NULL, 1..60. `CHECK ((species = 'OTHER') = (species_other IS NOT NULL))` |
| `breed` | TEXT | NOT NULL, 1..60 |
| `birth_date` | TEXT | NOT NULL, `<=` hoy (`APP_TIMEZONE`) y `<=` registro más antiguo (`INV-PET-002`, `INV-PET-006`) |
| `birth_date_is_estimate` | INTEGER | NOT NULL, DEFAULT 0 |
| `sex` | TEXT | NOT NULL, `CHECK IN ('MALE','FEMALE')` |
| `neutered` | INTEGER | NULL (0, 1 o desconocido) |
| `microchip_id` | TEXT | NULL, `^\d{15}$`. **UNIQUE parcial** `(owner_user_id, microchip_id) WHERE microchip_id IS NOT NULL`: único por propietario, no global |
| `avatar_url` | TEXT | NULL, ≤ 2048, `http(s)://` o `data:image/(png\|jpeg\|webp);base64,` |
| `created_at`, `updated_at` | TEXT | NOT NULL |

Migración `REQ-MIG-001`: `DOG` pasa a `CANINE` y `CAT` a `FELINE`; `birth_date_is_estimate = 0`, `neutered` y `microchip_id` nulos. La edad se calcula siempre con `birth_date` y `ClockPort` (`REQ-PET-002`); no se almacena ni se muestran años humanos equivalentes.

### 2.7 Registros clínicos (6 colecciones) — `REQ-REC2-001..003`, `REQ-REC-002/005/006`

Todas: `id` TEXT PK; `pet_id` TEXT NOT NULL FK `pets(id)` ON DELETE CASCADE; `created_at` TEXT NOT NULL; texto libre según el contrato.

| Tabla | Campos propios |
|---|---|
| `weight_records` | `recorded_at` (fecha), **`weight_grams` INTEGER NOT NULL** (peso en gramos enteros; `CHECK BETWEEN 1 AND 150000`), `notes`. Salida `weightKg = weight_grams / 1000` (3 decimales). `deltaKg` se calcula con enteros y sin redondeo (`ADR-002-09`) |
| `body_measurements` | `recorded_at`, `neck_cm`, `chest_cm`, `back_length_cm`, `waist_cm` (centésimas enteras, 1.00 a 250.00; sin cambios, `INV-REC-003`), `notes` |
| `vaccination_records` | `vaccine_name` (1..100), `applied_at`, **`next_booster_at` NULL**, `batch_or_clinic` (≤ 120), `veterinarian_name` (≤ 120), `veterinarian_license` (≤ 60, sin patrón: dato de un tercero), `notes` |
| `deworming_records` | `product_brand` (1..100), `deworming_type` (`INTERNAL`/`EXTERNAL`), `applied_at`, **`next_suggested_dose_at` NULL**, `batch_or_clinic`, `veterinarian_name`, `veterinarian_license`, `notes` |
| `medical_visits` | `visit_date`, `reason`, `diagnosis`, `treatment`, `clinic_or_vet`, `observations` (sin cambios, `REQ-REC-005`; es la entidad `APPOINTMENT_RECORD` de auditoría) |
| `custom_parameters` | `recorded_at`, `category`, `title`, `description`, `notes` (sin cambios, `REQ-REC-006`) |

Restricciones: `CHECK (next_booster_at IS NULL OR next_booster_at > applied_at)` (`INV-REC-004`) y `CHECK (next_suggested_dose_at IS NULL OR next_suggested_dose_at > applied_at)` (`INV-REC-005`). «Requiere próxima dosis» **no es una columna**: es `next_* IS NOT NULL`. Los textos obligatorios no son vacíos ni de solo espacios (`INV-REC-006`). Ninguna fecha de evento es futura ni anterior al nacimiento (`INV-REC-001`).

**No existe `supersedes_id`.** `SUPERSEDED` se calcula (`STATE-ALERT-001`): hay un registro posterior de la misma mascota con el mismo `vaccine_name` (`trim().toLowerCase()`) o el mismo `deworming_type`, en el orden de `INV-SORT-001`. Un registro con próxima fecha nula y sin registro posterior de la misma clave no entra al semáforo (`alert: null`), pero **sí** puede reemplazar a uno anterior; y si tiene uno posterior queda `SUPERSEDED` (inmutable, en el acordeón de reemplazados), no `null`. **A validar por Maggie** (F4-M4; no es decisión de Neo).

Rango de peso por especie (`INV-REC2-002`, tabla de Maggie, `SC-013`):

| Especie | Mín. kg | Máx. kg | Decimales | Estado |
|---|---|---|---|---|
| `CANINE`, `FELINE` | 0.05 | 150.00 | 2 | Validado por la spec |
| `RABBIT`, `FERRET`, `BIRD`, `REPTILE`, `SMALL_MAMMAL`, `OTHER` | 0.001 | 150.000 | 3 | Mín. y decimales decididos (7B); **máx. provisional, a validar por veterinario** (M1) |

Sin alertas automáticas de peso ideal, sobrepeso ni edad geriátrica para ninguna especie. La cota es de plausibilidad de captura, no un límite clínico.

### 2.8 `households` (Hogar) — `REQ-HOUSE-001`, `INV-HOUSE2-001`

| Columna | Tipo | Restricciones |
|---|---|---|
| `id` | TEXT | PK |
| `name` | TEXT | NOT NULL, 1..60 |
| `owner_user_id` | TEXT | NOT NULL, FK `users(id)` ON DELETE RESTRICT. Solo cambia con `TRANSFER_OWNERSHIP` (duplica `household_members.is_household_owner` para lectura directa; ambos se escriben en la misma transacción) |
| `created_at` | TEXT | NOT NULL |

### 2.9 `household_members` (Membresía) — `STATE-HOUSE-MEMBERSHIP-001` v3.0.0

| Columna | Tipo | Restricciones |
|---|---|---|
| `id` | TEXT | PK (`membershipId`) |
| `household_id` | TEXT | NOT NULL, FK `households(id)` ON DELETE CASCADE |
| `user_id` | TEXT | NOT NULL, FK `users(id)` ON DELETE CASCADE |
| `role` | TEXT | NOT NULL, `CHECK IN ('ADMIN','CAREGIVER','READER')` |
| `is_household_owner` | INTEGER | NOT NULL, DEFAULT 0. `CHECK (is_household_owner = 0 OR role = 'ADMIN')` |
| `status` | TEXT | NOT NULL, `CHECK IN ('ACTIVE','LEFT','REMOVED')` |
| `joined_at`, `first_joined_at`, `updated_at` | TEXT | NOT NULL. `first_joined_at` se hereda del par (hogar, usuario) en reinvitaciones |

Índices únicos parciales: `(household_id, user_id) WHERE status = 'ACTIVE'` (`INV-HOUSE-003`) y `(household_id) WHERE is_household_owner = 1 AND status = 'ACTIVE'` (exactamente un propietario `ACTIVE`, `INV-HOUSE2-001`). Migración: `OWNER` pasa a `ADMIN` con `is_household_owner = 1`; `MEMBER` a `READER` (`REQ-MIG-001`). Las filas terminales (`LEFT`, `REMOVED`) se retienen 90 días y se purgan (R5). El `CHECK` de `status` **no admite** `INVITED`, `DECLINED` ni `CANCELLED`: esos estados, que la 001 guardaba como filas de `household_members`, se convierten a `household_invitations` antes de reconstruir esta tabla (ver §2.10, «Conversión de la 001»).

### 2.10 `household_invitations` (Invitación) — `REQ-HOUSE2-001`, R3

| Columna | Tipo | Restricciones |
|---|---|---|
| `id` | TEXT | PK |
| `household_id` | TEXT | NOT NULL, FK `households(id)` ON DELETE CASCADE |
| `invitee_username` | TEXT | NOT NULL (mismo formato que `username`) |
| `invitee_user_id` | TEXT | NULL, FK `users(id)` ON DELETE CASCADE. **Nulo = invitación inerte** (el `username` no existía); nunca se vincula después y nadie puede aceptarla |
| `invited_by_user_id` | TEXT | NOT NULL, FK `users(id)` ON DELETE CASCADE (al eliminar a quien invita desaparecen sus invitaciones emitidas, R-04) |
| `role_on_join` | TEXT | NOT NULL, `CHECK IN ('ADMIN','CAREGIVER','READER')` |
| `status` | TEXT | NOT NULL, `CHECK IN ('INVITED','DECLINED','CANCELLED','ACCEPTED')` |
| `created_at` | TEXT | NOT NULL |
| `responded_at` | TEXT | NULL |

Índice único parcial `(household_id, invitee_username) WHERE status = 'INVITED'`. Las terminales se retienen 90 días (R5).

**Conversión de la 001 (`REQ-MIG-001`, ADR-002-10).** La 001 guardaba `INVITED`, `DECLINED` y `CANCELLED` como filas de `household_members` (con `invitedByUserId`, `invitedAt` y `updatedAt`). La migración, antes de reconstruir `household_members` con el `CHECK` de la 002, hace en la misma transacción y por cada fila con `status IN ('INVITED','DECLINED','CANCELLED')`:

| Campo de `household_invitations` | Valor tomado de la fila de la 001 |
|---|---|
| `id` | el `membershipId` de la 001 (conserva la identidad; no choca con otros `id` de la tabla nueva) |
| `household_id` | `householdId` |
| `invitee_user_id` | `userId` (el usuario existe: no es invitación inerte) |
| `invitee_username` | `users.username` de ese `userId` |
| `invited_by_user_id` | `invitedByUserId`. La 001 sí lo guarda (campo obligatorio de `HouseholdMember`); si una fila lo trajera nulo, la migración deja el campo nulo y se relaja el `NOT NULL` solo para ese caso no esperado (`ON DELETE CASCADE` no aplica a nulos; la fila se purga con los 90 días de las terminales o con el hogar) |
| `role_on_join` | `READER` (la 001 solo tenía `MEMBER`, que la migración fija en `READER`) |
| `status` | el mismo (`INVITED`, `DECLINED` o `CANCELLED`); `INVITED` queda como invitación pendiente |
| `created_at` | `invitedAt` |
| `responded_at` | `NULL` para `INVITED`; `updatedAt` para `DECLINED` y `CANCELLED` (estado terminal; entran en la purga de 90 días contados desde `responded_at`) |

Después se eliminan esas filas de `household_members`. Solo `ACTIVE`, `LEFT` y `REMOVED` pasan a la tabla nueva de membresías. La migración no genera filas de auditoría por esta conversión (solo la fila `MIGRATION`) y es repetible: una segunda ejecución no encuentra filas con esos estados. Una invitación `INVITED` migrada es aceptable por su destinatario con normalidad; una 001 con dos `INVITED` del mismo usuario y hogar no puede existir (`INV-HOUSE-003`), por lo que el índice único parcial no choca. La respuesta al invitar es siempre idéntica; el estado inerte solo es observable en la base.

### 2.11 `pet_assignments` (Asignación mascota-hogar) — `REQ-HOUSE2-003`

| Columna | Tipo | Restricciones |
|---|---|---|
| `pet_id` | TEXT | FK `pets(id)` ON DELETE CASCADE |
| `household_id` | TEXT | FK `households(id)` ON DELETE CASCADE |
| `assigned_by_user_id` | TEXT | NOT NULL, **sin clave foránea**. El Propietario Legal vigente que respondió por la asignación: en la **transferencia de propiedad** (`REQ-OWN-001`) se **reasigna al nuevo Propietario Legal** en la misma transacción para las asignaciones que sobreviven a la poda (no genera fila de auditoría propia); en la **eliminación de cuenta** (fase B8) se **seudonimiza** (HMAC) en cualquier fila que aún lo conserve. Justificación: el campo nunca apunta a una cuenta sin relación con la mascota y la poscondición «cero `userId` en claro» (B10) se cumple siempre |
| `assigned_at` | TEXT | NOT NULL |
| | | PK `(pet_id, household_id)` |

Invariante de aplicación (`REQ-OWN-001`, `REQ-HOUSE2-002`): el Propietario Legal de la mascota es miembro `ACTIVE` del hogar. No se puede expresar solo con una restricción de tabla, por lo que lo mantienen los casos de uso (asignar, salir, expulsar, transferir) y lo vigila la aserción B6 de la eliminación de cuenta.

### 2.12 `audit_log` (Entrada de auditoría) — `REQ-AUD-001`, `INV-AUD-001`

| Columna | Tipo | Restricciones |
|---|---|---|
| `id` | TEXT | PK |
| `timestamp` | TEXT | NOT NULL, UTC |
| `executor_user_id` | TEXT | NOT NULL. UUID de usuario, `SYSTEM`, o HMAC-SHA256 hex (usuario eliminado). **Sin clave foránea** |
| `mutation_type` | TEXT | `CHECK IN` los 10 valores cerrados de la spec |
| `entity_type` | TEXT | `CHECK IN` los 13 valores cerrados de la spec |
| `entity_id` | TEXT | NOT NULL. Id propio de la entidad; HMAC para `ACCOUNT_DELETE`, filas `USER` del eliminado y `PET_ASSIGNMENT` (`ASSIGN`/`UNASSIGN`); `MIG-<versión>` en `MIGRATION` |
| `previous_state_hash`, `new_state_hash` | TEXT | NULL. SHA-256 hex sin clave del JSON canónico de la **vista pública canónica** |

Reglas (R1, T2, R2): sin FK ni `ON DELETE` hacia ninguna tabla; puerto `AuditLogPort` con solo `append(entry)` y `pseudonymizeUser(userId, hmac)`; sin endpoint de lectura para usuarios; escritura en la **misma transacción** que la mutación (una mutación fallida o revertida no deja fila); retención de **24 meses** desde `timestamp`, con purga de mantenimiento que registra solo un conteo y no genera fila; la **vista pública canónica excluye `email`, `displayName` y `microchipId`** a cualquier profundidad, lo que no altera las filas ya escritas. Índices: `timestamp` (purga), `executor_user_id` y `entity_id` (seudonimización). Nunca contiene contraseña, hash de contraseña, token ni cookie.

`entityId` de `PET_ASSIGNMENT` (F4-M3): la asignación tiene clave compuesta `(pet_id, household_id)` y `AuditEntityId` solo acepta UUID, HMAC o `MIG-…`. Para `ASSIGN` y `UNASSIGN` el `entityId` es `HMAC-SHA256(ARGOS_AUDIT_HMAC_SECRET, "<petId>:<householdId>")` en hexadecimal minúscula (UUID en minúsculas, separador `:`), con la misma clave de auditoría y el mismo puerto (que recibe la clave por parámetro). Así el par no se expone en claro y el esquema lo exige con un `allOf` sobre `entityType = PET_ASSIGNMENT`. Es determinista: asignar, desasignar y reasignar el mismo par comparten `entityId`.

HMAC: `HMAC-SHA256(ARGOS_AUDIT_HMAC_SECRET, userId)` en hexadecimal, detrás del puerto `hmacUserId(userId, key)` que recibe la **clave por parámetro** (T1). No existe la columna `auditKeyVersion` en F4; rotar el secreto impide correlacionar hashes anteriores y se documenta en el runbook.

Filas por mutación (`REQ-AUD-001`): una por operación del usuario sobre la entidad raíz; las entidades en cascada no generan fila, salvo una `UNASSIGN` por cada asignación podada. Transferencia: 1 `OWNERSHIP_TRANSFER` + N `UNASSIGN` (la reasignación de `assigned_by_user_id` de las asignaciones que sobreviven no genera fila). Eliminación de cuenta: 1 `ACCOUNT_DELETE`. Importación: 1 `IMPORT` (la conversión de un respaldo antiguo no genera fila propia). Migración de base de datos: 1 `MIGRATION` por ejecución (`executor_user_id = 'SYSTEM'`, hashes nulos). Las sesiones y los tokens de confirmación no se auditan.

### 2.13 `schema_migrations` — `REQ-MIG-001`

`id` TEXT PK (identificador de la versión de migración, p. ej. `002-platform-v21`), `applied_at` TEXT NOT NULL. Garantiza que la migración sea repetible sin duplicar.

### 2.14 Sobre de respaldo (`BackupEnvelopeV3`) — no persistido

Archivo del usuario, fuera del control del sistema una vez descargado. `schemaVersion: "3.0.0"`, `exportedAt`, `pets[]` (solo mascotas propias, **sin `ownerUserId`**) y `records` con las 6 colecciones. **No contiene** `userId`, `exportedByUserId`, hogares, asignaciones, roles, sesiones, tokens ni credenciales (R6, `REQ-BACKUP2-001`). Las versiones `2.0.0` y `1.0.0` solo se leen, se migran y pasan por la misma validación final (T7). Contiene datos de terceros (veterinario y colegiado): la interfaz avisa que su custodia pasa a ser del usuario (R-05).

## 3. Restricciones `INV-*` y dónde se hacen cumplir

| Invariante | Mecanismo |
|---|---|
| `INV-AUTH-001` | UNIQUE en `users.username`; sin normalización |
| `INV-AUTH-003` | Hashes de token (`SHA-256`) y contraseña (`scrypt`); validadores de salida sin campos secretos; escáner de logs en la batería de seguridad |
| `INV-AUTH-005`, `INV-AUTH-006` | `login_attempts` (incluye fallos de contraseña actual); error y tiempo uniformes |
| `INV-AUTH-007` | Plugin HTTP: `X-Argos-Request: 1` en toda petición que modifica estado, incluida la exportación |
| `INV-AUTH2-001` | Contrato `Password` (10..128 puntos de código, `\p{Lu}`, `[0-9]`, 32 símbolos ASCII) en registro y cambio; no en login |
| `INV-AUTH2-002` | Columnas `created_at`, `last_activity_at`, `revoked_at`; vigencia derivada con `ClockPort` |
| `INV-PET2-001` | `CHECK` de especie y de `species_other`; contrato con `if/then/else` |
| `INV-PET-002`, `INV-PET-006` | Dominio con `ClockPort`; coherencia con el registro más antiguo |
| `INV-PET-003`, `INV-PET-005` | Ficha aislada por mascota; borrado atómico en cascada |
| `INV-OWN2-001` | `owner_user_id` NOT NULL; escritura solo en `REQ-OWN-001` y en el alta |
| `INV-ACC2-001` | Consulta de lectura: dueño **o** miembro `ACTIVE` de un hogar con asignación; si no, `ERR-PET-NOT-FOUND` |
| `INV-ACC2-002` | `can(rol efectivo, acción)` en el caso de uso, antes de cualquier escritura |
| `INV-HOUSE2-001` | Índice único parcial del propietario `ACTIVE` y `CHECK` de rol `ADMIN`; `TRANSFER_OWNERSHIP` atómico |
| `INV-HOUSE-003`, `INV-HOUSE-004`, `INV-HOUSE-005` | Índices únicos parciales; solo `ACTIVE` otorga visibilidad; color por posición |
| `INV-REC-001`, `INV-REC-003` | Dominio con `ClockPort` y rangos de medidas |
| `INV-REC-004`, `INV-REC-005` | `CHECK` de tabla (solo cuando existe la fecha opcional) y contrato |
| `INV-REC-006` | Contrato `NonEmptyTrimmedString` |
| `INV-REC2-002` | `weight_grams` entero, envolvente del contrato y tabla por especie en el dominio |
| `INV-SORT-001` | `DeterministicSorter` del dominio, sobre marcas UTC canónicas |
| `INV-BACKUP-001` | Una transacción, fila `IMPORT` en la misma transacción, criterio de fallo inyectado (`SC-004`) |
| `INV-AUD-001` | Esquema de `audit_log` sin columnas de secretos; vista canónica; prueba de búsqueda de secretos |
| `INV-ARCH-001`, `INV-ARCH-002` | `ClockPort` e `IdGeneratorPort`/`SecureTokenPort`; ningún `Date`, `Math.random` ni `crypto` en `domain/` ni `application/` |
| `INV-ARCH-005`, `INV-ARCH-006` | Puertos asíncronos con `runInTransaction`; `process.env` solo en `src/infrastructure/config/` |

## 4. Vista de visibilidad (referencia para la capa de lectura)

Una mascota `P` es visible para `U` si `P.owner_user_id = U.id` **o** existe `pet_assignments(P, H)` y `household_members(H, U)` con `status = 'ACTIVE'`. El rol efectivo es `OWNER` si `U` es el Propietario Legal; si no, el mayor `role` entre esos hogares (`ADMIN` > `CAREGIVER` > `READER`). Un `INVITED`, `LEFT` o `REMOVED` no otorga visibilidad.
