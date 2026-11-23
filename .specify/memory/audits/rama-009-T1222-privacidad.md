# Acta Rama — T1222 (parte /rama): privacidad del borrado de cuenta con reautenticación Google (D9-17 = A) y de la supresión anticipada (Ley 1581 de 2012)

- Fecha: 2026-11-23 · Rama `009-aprobacion-admin-correo` · Rol: `/rama` (solo lectura sobre `src/` y `tests/`; sin commit, sin push, sin `[x]`, sin corregir código).
- Trazabilidad: REQ-DEL9-001, INV-DEL9-001, REQ-APR9-008, EDGE-009-031, EDGE-009-033, EDGE-009-037, EDGE-009-049, NFR-009-004, ADR-009-04, ADR-009-06, ADR-009-08, ADR-009-09, T1239 (retención de `/admin`), T1248 (purga), T1290 (supresión manual).
- Acta de Trinity de referencia: `.specify/memory/audits/trinity-009-T1222-reautenticacion.md` (TRI-05 y TRI-06 se dictaminan aquí; TRI-04 se dictamina aquí desde la privacidad).
- Nota de alcance: la BD de producción de la feature 003 es **Postgres en Neon** (PITR de 6 h, REQ-PG-011); no hay recurso `google_sql_database_instance` en `terraform/` y Cloud SQL figura como «ruta futura» en `specs/003-cloud-gcp/spec.md`. El dictamen de respaldos se hace sobre Neon y los dumps de GCS.

## Veredicto: PASS CON CAMBIOS

- La cascada de borrado de datos de la aplicación es completa (sin `sub`, correo ni `displayName` residuales en filas, índices ni auditoría). El modelo de prueba (un solo uso, ligada a la sesión, 900 s) es coherente con INV-DEL9-001.
- Hay **un ALTO** que bloquea el despliegue de `/admin` (no de este borrado): el callback de administración no queda cubierto por la exclusión de logs (RAMA-01).
- Hay **MEDIO** que bloquean el despliegue en producción del borrado con Google: la exclusión de logs del callback 008/009 sigue pendiente de `apply` de Neo (RAMA-02) y la purga de `oauth_flow_states` no tiene plazo garantizado en Postgres (RAMA-03).
- Los puntos de la supresión manual (RAMA-04, RAMA-05) son de diseño y procedimiento, con condiciones antes de T1290.

## Verificado sin hallazgo

1. **Cascada del borrado (`eraseAccountInTransaction`, `account-use-cases.ts:179-240`)**: mascotas y registros, medios encolados, invitaciones (`invited_by_user_id` o `invitee_user_id`), membresías, hogares en cascada, `sessions.deleteByUser`, `confirmationTokens.deleteForUser`, `rateLimits.deleteForUser`, `shareAudit.clearActor`, `loginAttempts.deleteFailures(username)`, escena (`onAccountDeleting`, seudonimiza columnas sin FK), `users.delete`. Poscondición B10: `countReferences(userId) === 0`.
2. **Filas con `sub` o correo**: `auth_identities` (`0017`, `0013`) y `oauth_flow_states` (`0018` SQLite y `0014` PG, `user_id ... ON DELETE CASCADE`) caen por cascada. `users.email` (`0002`/`0001_baseline`) se borra con la fila. Las únicas filas con `sub` sin `user_id` son las de LOGIN en fase USERNAME (`pending_subject` + `pending_email`), que no pertenecen a una cuenta y caen por TTL (RAMA-03).
3. **Índices**: `users_email_verified_unique` (`lower(email)`) y `auth_identities` (PK `provider, provider_subject`) se eliminan con sus filas. No hay índice sobre `pending_subject` ni `pending_email`. En SQLite `PRAGMA secure_delete = ON` (`sqlite-database.ts:107`), así que los bytes borrados no quedan en páginas libres.
4. **Auditoría**: `audit_log` guarda solo `executor_user_id`, `entity_id` y huellas `previous/new_state_hash` (`audit-support.ts:50-60`); no guarda cuerpos. `pseudonymizeUser` (`sqlite-repositories.ts:1049-1057`) sustituye el `userId` por el HMAC en `executor_user_id` y `entity_id`. El estado previo se calcula sobre la vista canónica que excluye `email`, `displayName`, `microchipId` y secretos (`canonical-view.ts`).
5. **Logs de la aplicación**: `serializeRequest` registra `routeOptions.url` (plantilla de ruta, sin query string) (`cloud-logging.ts:120-122`); `cookie` y `set-cookie` redactados; `scrubValue` oculta `SENSITIVE_FIELDS`. Sin `console.*` en los archivos de borrado.
6. **Migraciones**: `0018` (SQLite) y `0014` (PG) tienen paridad de CHECK; `pending_subject` solo en `intent = 'DELETE'`; `pending_email` sigue `NULL` en AUTHORIZATION. La reconstrucción copia filas sin pérdida.

## Retención propuesta por dato

Los plazos son propuestas de `/rama` para que `/architect` las incorpore a la spec. Los que dependen de la aplicación se verifican en el código; los de plataforma se verifican en Neon/GCP.

| Dato | Ubicación | Retención propuesta | Mecanismo / estado |
|---|---|---|---|
| Correo, `displayName`, hash de contraseña | `users` | Vida de la cuenta; al borrar, inmediato | Cascada actual (OK) |
| `sub` vinculado | `auth_identities` | Vida de la cuenta; al borrar, inmediato | Cascada actual (OK) |
| `pending_subject` (sub de prueba de borrado) | `oauth_flow_states` | **Hasta 900 s desde la expiración** (y se elimina al consumir la prueba) | SQLite: diario (cron `0 6 * * *`, `terraform/scheduler.tf`), hasta ~24 h. PG: **sin plazo** (RAMA-03) |
| `pending_email` y `sub` de flujo LOGIN en USERNAME | `oauth_flow_states` | 900 s desde la expiración | Igual que la fila anterior (RAMA-03) |
| `state`, `nonce`, `code_verifier` | `oauth_flow_states` | 900 s | Igual (RAMA-03) |
| Sesiones | `sessions` | 7 días tras revocación o caducidad (existente) | `maintenance-use-cases.ts`, sin cambio |
| Cuenta `PENDING` | `users` | 30 días desde la creación; purga automática | **T1248 sin implementar** (`[ ]`); no verificable hoy (RAMA-04) |
| Cuenta `REJECTED` | `users` | 30 días desde la decisión (bloqueo de reintento incluido) | **T1248 sin implementar** (RAMA-04) |
| Solicitud de supresión manual | Canal de contacto (fuera de ARGOS) + registro de `/admin` | Resultado (opaco: id seudonimizado, fecha, resultado) 24 meses; el correo de la solicitud **no se copia** a ARGOS | Pendiente de T1290 (RAMA-04) |
| `audit_log` (`ACCOUNT_DELETE`, seudónimos y huellas) | `audit_log` | 24 meses (existente, purga de mantenimiento) | Existente (OK). La clave HMAC debe conservarse mientras existan filas (REQ-PG-016) |
| `admin_audit_entries` | `admin_audit_entries` (T1232) | 24 meses, igual que `audit_log`; sin correo; el objeto de cuenta **seudonimizado** (RAMA-05) | Pendiente de T1232 y T1239 |
| `admin_sessions` (hash SHA-256) | `admin_sessions` | 7 días tras la caducidad (30 min absolutos / 10 min inactividad) | Propuesta de T1239 |
| `admin_oauth_flow_states` | `admin_oauth_flow_states` | 900 s desde la expiración, purga en cada callback y en el mantenimiento | Propuesta de T1239; mismo patrón que RAMA-03 |
| `admin_identities` (`sub` anclado y correo de la lista) | `admin_identities` | Mientras el correo esté en `ARGOS_ADMIN_EMAILS`; al retirarlo, 30 días y purga del `sub` | Propuesta de T1239 |
| Invitaciones `INVITED` con `invitee_username` sin `invitee_user_id` | `household_invitations` | 30 días desde la creación, o al borrar la cuenta de ese nombre | Sin implementar (RAMA-06) |
| Nombre de hogar (dato personal, ver dictamen) | `households` | Vida del hogar; en borrado de propietario se elimina en cascada | Existente |
| Cookie `argos_oauth` / `argos_admin_oauth` | Navegador | Caduca con el flujo (900 s) | Diseño actual |
| Dumps de Postgres | Bucket `exports/dumps/` | **14 días** (ciclo de vida, `terraform/buckets.tf`) | Existente (REQ-IAC-008, REQ-PG-011) |
| PITR de Neon | Neon | **6 h** | Existente (REQ-PG-011); no gestionable por la app |
| Logs de solicitud de Cloud Run (IP, método, ruta) | Cloud Logging `_Default` | Por defecto de Cloud Logging (30 días; **a verificar por Neo**, no está en `terraform/`) | Sin configuración en `terraform/`; sin query string con el `logging.tf` aplicado (RAMA-02) |
| Logs de la aplicación | Cloud Logging | Igual que el anterior, sin `sub`, correo, tokens ni query | Verificado en código |

## Dictámenes por punto

### 1. Borrado completo (REQ-DEL9-001, INV-DEL9-001)
Completo para datos de aplicación. Se confirma el hallazgo de Trinity de que no hay residuos en filas ni auditoría. Lo que queda fuera de la aplicación (respaldos de Neon y dumps de 14 días) se trata en el punto 3. El riesgo de borrado físico queda acotado a esa ventana, igual que en REQ-PG-011 (ya ratificado por Neo, D-22).

### 2. TRI-05 — `sub` de pruebas vencidas no usadas
**Dictamen: aceptable solo con la corrección de RAMA-03.** Tal como está, el `sub` de una prueba vencida persiste hasta el siguiente mantenimiento diario en SQLite (hasta ~24 h) y sin plazo en Postgres, porque la purga PG no está en `STEPS` de `postgres-maintenance.ts` y solo corre al iniciar una autorización (`google-auth-use-cases.ts:93`).
**Plazo propuesto:** 900 s desde la expiración de la prueba, con purga en cada callback y en cada inicio de autorización, y el mantenimiento diario como respaldo. La alternativa «al primer uso» no aplica: una prueba no usada no tiene uso posterior.

### 3. TRI-06 — Respaldos de infraestructura
**Dictamen: aceptable con una política escrita y publicada (RAMA-07).** La ventana de datos borrados en respaldos es: PITR de Neon 6 h y dumps de 14 días. Así se cumple el principio de supresión con un plazo finito y documentado, y la restauración no resucita cuentas gracias a REQ-PG-016 (re-borrado por HMAC). Dos observaciones: (a) el HMAC del `userId` en `audit_log` es un seudónimo (la clave lo hace reversible para quien la tiene), por lo que sigue siendo dato personal y debe tratarse con la misma retención de 24 meses; (b) no hay Cloud SQL en el proyecto (ver nota de alcance).

### 4. Supresión sin sesión, 30 días (EDGE-009-033 / EDGE-009-037 / REQ-APR9-008)
**Dictamen: coherente con la atención manual aprobada por Neo (D9-18), con dos correcciones (RAMA-04 y RAMA-05).**
- La cuenta `PENDING` o `REJECTED` no tiene sesión (ADR-009-09), así que **la «reautenticación con Google del titular» de REQ-APR9-008 no es ejecutable por el titular**: el flujo de borrado exige `requireSession`. La verificación debe hacerla el administrador con el correo de la solicitud, enviado desde el correo registrado en la cuenta, y dejar constancia opaca (id, fecha, resultado) sin copiar el correo.
- **Plazo (propuesta):** respuesta y ejecución en **5 días hábiles** (objetivo interno). Referencia legal: Ley 1581 de 2012, art. 15, plazo de 15 días hábiles para reclamos, prorrogable por 8 días hábiles con aviso (**verificar con asesoría jurídica**; no se ha consultado la fuente oficial desde aquí).
- El riesgo de suprimir con un correo que no sea el del titular es bajo (solo afecta una cuenta sin acceso al portal) y está acotado por la purga de 30 días.

### 5. Riesgo del 409 con nombres de hogares (TRI-04): ¿el nombre del hogar es dato personal?
**Dictamen propio de privacidad: sí, es dato personal, aunque de baja sensibilidad.** El nombre es texto libre elegido por la persona propietaria y puede contener el nombre de alguien (un miembro, una mascota o el propio titular). Bajo el art. 3 literal c) de la Ley 1581 (dato personal: información vinculada o asociable a una persona natural), es asociable al propietario. **Se acepta la exposición en el 409** porque: (i) solo la recibe quien ya tiene la prueba de titularidad (A2 corre antes que B); (ii) el propietario ya ve esos hogares en su cuenta; (iii) la lista no contiene nombres de otros miembros, solo cuentas (`activeMembers`) y mascotas propias (`sharedPets`), lo que evita revelar a terceros; (iv) no entra en logs ni en auditoría (verificado en `account-google-deletion-use-cases.ts:47,150-155` y en el punto 4 de la sección «verificado»).
**Condiciones (PASS CON CAMBIOS del 409):** (a) `Cache-Control: no-store` en la respuesta 409 de la ruta de borrado; (b) acotar la longitud de cada nombre en `households[]` y en el `detail` (Trinity TRI-04b); (c) la UI sigue sin interpretar HTML (ya es texto, `account-deletion-google.ts:84,121`); (d) no registrar el `detail` en analítica de cliente ni en errores del navegador. Si Neo prefiere lo más restrictivo: dejar el `detail` genérico y entregar nombres solo en `households[]`.

## Hallazgos (RAMA-NN)

| ID | Severidad | Hallazgo | Evidencia | Acción recomendada | Bloquea |
|---|---|---|---|---|---|
| **RAMA-01** | **ALTO** | El callback de administración (`/api/admin/auth/google/callback`, ADR-009-06, T1227) no coincide con el filtro de exclusión de logs, que solo cubre `/api/auth/google/callback`. La URL lleva `code` y `state`, que quedarían en `_Default` de Cloud Logging. | `terraform/logging.tf:30-35` (filtro `httpRequest.requestUrl:"/api/auth/google/callback"`); `spec` ADR-009-06 y T1227 | Ampliar el filtro para cubrir `/auth/google/callback` (ambos prefijos), en la tarea de `/link` de T1227 antes del primer despliegue de `/admin`. Verificar con `terraform plan`. | Despliegue de `/admin` |
| **RAMA-02** | MEDIO | La exclusión del callback 008/009 está escrita, pero **pendiente de `terraform plan/apply` de Neo** (Nivel 2). Hasta entonces el retorno de la reautenticación de borrado registra `code` y `state` en el registro de plataforma. Contradice NFR-008-004 y NFR-009-004. Mitigado por PKCE y por un solo uso. | `terraform/logging.tf:28-36` (comentario «Pendiente de aplicación por Neo»); `terraform/README.md:225` | Neo aplica la exclusión tras revisar el plan (`TO: Neo (Andrés Vallejo — Level 2)`). | Producción del borrado con Google |
| **RAMA-03** | MEDIO | Las filas vencidas de `oauth_flow_states` (incluido `pending_subject`, y `pending_email` en USERNAME) no tienen plazo garantizado. SQLite: purga diaria (cron `0 6 * * *`), hasta ~24 h. PG: `purgeExpiredInBatches` no incluye `oauth_flow_states`, y el `purgeExpired` de `beginAuthorization` solo corre al iniciar una autorización. | `sqlite-unit-of-work.ts:88`; `postgres-maintenance.ts:35-55` (sin paso oauth); `postgres-auth-repositories.ts:100-103`; `google-auth-use-cases.ts:93`; `terraform/scheduler.tf:11` | Añadir paso de purga de `oauth_flow_states` a `STEPS` de PG (`expires_at <= now`). Purgar en cada callback y en cada `beginAuthorization`. Plazo objetivo: 900 s. Es la condición de TRI-05. | Producción del borrado con Google (PG) |
| **RAMA-04** | MEDIO | (a) La purga de `PENDING` y `REJECTED` (T1248) y la supresión manual (T1290) están sin implementar; el plazo de 30 días no es verificable hoy. (b) La «reautenticación con Google del titular» de REQ-APR9-008 no es ejecutable para una cuenta sin sesión, y el texto de la spec no define la verificación alternativa ni el plazo. | `tasks.md` T1248 `[ ]`, T1290 `[ ]`; `spec.md` REQ-APR9-008; ADR-009-09 | (a) Verificar con prueba roja de T1248 que la purga cubre ambos estados. (b) `/architect` precisa la verificación: correo de la solicitud desde el correo registrado; plazo de 5 días hábiles (interno) y referencia legal de 15 días hábiles. | T1290 y T1248 |
| **RAMA-05** | MEDIO | `admin_audit_entries` (ADR-009-08) registra el «objeto», que en una supresión es el `userId` de la cuenta borrada. La cascada `pseudonymizeUser` solo actualiza `audit_log`, así que el identificador en claro quedaría en la tabla de administración. | `sqlite-repositories.ts:1049-1057` (solo `audit_log`); ADR-009-08 | Guardar el objeto como HMAC (mismo secreto y formato que `audit_log`) desde el inicio, o incluir la tabla en la transacción de la supresión. | T1232 y T1241 |
| **RAMA-06** | BAJO | `household_invitations.invitee_username` guarda el nombre de usuario en claro. `deleteForUser` borra por `invited_by_user_id` e `invitee_user_id`; una invitación `INVITED` sin `invitee_user_id` que apunte al nombre de la cuenta borrada no se elimina. | `sqlite-repositories.ts:995`; `0002_account_identity.sql:50-51` | Purgar invitaciones `INVITED` sin `invitee_user_id` a 30 días, o al borrar una cuenta con ese nombre. Verificar con prueba. | No bloquea |
| **RAMA-07** | BAJO | La política de respaldos (Neon PITR 6 h, dumps 14 d, logs de plataforma por defecto) no está publicada ni en la spec de 009 ni en `terraform/`. La ventana de 30 días de logs de plataforma no es verificable desde el repo. | `specs/003-cloud-gcp/spec.md` (R-14, REQ-PG-011); `terraform/` sin `retention` de logs | Publicar la tabla de retención de este acta en el runbook (`quickstart.md §4.1`). Neo confirma la retención de logs de `_Default` en GCP. | No bloquea |
| **RAMA-08** | BAJO | Nombre de hogar como dato personal: aceptado con condiciones (ver punto 5). | `account-google-deletion-use-cases.ts:47`; `MAX_LISTED_HOUSEHOLDS = 100` | Aplicar condiciones (a) a (d) del punto 5. | No bloquea |

## Verificaciones no ejecutadas (límites del dictamen)

- No se ejecutó la suite de pruebas (la pasó Trinity: 30 verdes en `t1218` y `t1130`).
- No se revisó el texto de Google sobre `auth_time` (TRI-01, de Trinity).
- No se consultó la fuente oficial de la Ley 1581 ni el Decreto 1377 de 2013 desde aquí; los plazos legales se citan de memoria y deben confirmarse con asesoría jurídica.
- La retención de logs de `_Default` (30 días) es el valor por defecto de GCP; no hay configuración en `terraform/` que lo fije.

## Resumen para el siguiente paso

Veredicto: **PASS CON CAMBIOS**. Condiciones antes de producción del borrado con Google: RAMA-02 (aplicación de la exclusión por Neo) y RAMA-03 (purga PG de `oauth_flow_states`). Condición antes del despliegue de `/admin`: RAMA-01. Condiciones antes de T1290: RAMA-04 y RAMA-05. Los BAJO se incorporan a T1239 y al runbook.
