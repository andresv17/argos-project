# Acta /trinity — T1222 (parte AppSec): borrado de cuenta con reautenticación con Google (009, deuda #17, D9-17 = A)

- Fecha: 2026-11-23 · Rama `009-aprobacion-admin-correo` · Rol: `/trinity` (solo lectura sobre `src/` y `tests/`; no se corrigió código).
- Alcance: REQ-DEL9-001, INV-DEL9-001, SC-009-044, SC-009-045, ADR-009-04, EDGE-009-031/032/049.
- Archivos auditados: `src/application/use-cases/account-google-deletion-use-cases.ts`, `src/application/use-cases/google-auth-use-cases.ts` (`proveOwnership`), `src/application/use-cases/account-use-cases.ts` (`eraseAccountInTransaction`), `src/domain/auth/reauthentication-policy.ts`, `src/infrastructure/http/routes/google-auth.routes.ts`, `src/infrastructure/http/google-oidc-verify.ts`, `src/infrastructure/http/google-rate-limit.ts`, `src/infrastructure/http/plugins/csrf-guard.ts`, repositorios SQLite/PG (`findDeletionProof`, `markDeletionProof`, `consumeDeletionProof`, `countReferences`), migraciones SQLite `0018_oauth_flow_delete_intent.sql` y PG `0014_oauth_flow_delete_intent.sql`.

## Veredicto: PASS CON CAMBIOS

No hay hallazgos ALTO. El modelo de amenaza central (sesión robada no puede borrar la cuenta) se sostiene. Hay 1 MEDIO (riesgo de disponibilidad en producción, no de seguridad) y 6 BAJO. Los cambios exigidos antes de producción son TRI-01 (verificación con Google real) y TRI-02 (límite propio de la ruta de borrado); el resto son endurecimientos recomendados.

## Pruebas existentes ejecutadas

`npx vitest run tests/integration/api/t1218-eliminacion-google-009.api.spec.ts tests/unit/t1130-reautenticacion-reciente-009.spec.ts`: 2 archivos, **30 pruebas, 30 verdes** (23 de t1218 + 7 de t1130). Cubren: CSRF 403 y sin sesión 401 en ambas rutas, 403 uniforme (ausente, vencida, otra sesión, cuenta con contraseña, sin sub ni correo), `auth_time` ausente o viejo y `sub` ajeno rechazados con 400, retorno reutilizado, vencimiento a 900 s, ligadura a sesión, un solo uso, prueba de otra cuenta, esquema cerrado, 409 con rollback y prueba aún vigente, cascada sin filas residuales (SC-009-044).

## Verificación por área

### 1. Reautenticación robada o reutilizada — SÓLIDO
- Un solo uso y atómico: `consumeDeletionProof` es un `DELETE ... WHERE token_hash=? AND intent='DELETE' AND consumed_at IS NOT NULL AND pending_subject IS NOT NULL AND expires_at > ?` con exactamente 1 fila (`sqlite-repositories.ts:1135-1137`, `postgres-auth-repositories.ts:115-117`); se invoca en la fase B dentro de la transacción (`account-google-deletion-use-cases.ts:138`). Dos peticiones simultáneas: la segunda ve 0 filas y recibe el 403 uniforme.
- Vencimiento: `expires_at` = inicio del flujo + 900 s (`ONE_TIME_TOKEN_TTL_SECONDS`, `one-time-token.ts:18`); la prueba no se prolonga al registrarse (la marca no toca `expires_at`). El `auth_time` además debe estar dentro de 900 s al volver (`reauthentication-policy.ts:18-24`), con tope de adelanto de reloj de 60 s.
- Ligadura: `findDeletionProof(userId, originSessionHash, now)` filtra por usuario y por `origin_session_hash` (`sqlite-repositories.ts:1131-1133`); el CHECK de la migración exige `user_id` y `origin_session_hash` no nulos para DELETE (`0018...sql:29-31`), y `proveOwnership` exige sesión de origen viva y de la misma cuenta, cuenta aún sin contraseña y `sub` igual al vinculado (`google-auth-use-cases.ts:209-221`). Sin marca no hay prueba: un retorno fallido o a medias no acredita nada.
- Fail-closed de `auth_time`: ausente o no finito -> `false` (`reauthentication-policy.ts:19`); el verificador solo propaga un número finito (`google-oidc-verify.ts:181-182`).
- Retorno reutilizado: el estado `AUTHORIZATION` se consume por compare-and-set antes de verificar nada (`google-auth-use-cases.ts:182-185`); `state` en tiempo constante; `nonce` y PKCE S256 verificados.
- 409: el rechazo por hogares lanza dentro de la transacción de B, que revierte incluido el consumo de la prueba (`account-google-deletion-use-cases.ts:136,151-155`); la prueba sigue vigente hasta su vencimiento. Aceptable: quien tiene la prueba ya demostró titularidad, y reintentar no borra nada.
- Doble verificación: A2 (sin escrituras) y B3 (dentro de la transacción) vuelven a evaluar la prueba, sin ventana TOCTOU explotable.

### 2. CSRF y límites
- CSRF: el gancho global `onRequest` exige `X-Argos-Request: 1` en todo POST (`csrf-guard.ts:25`) y corre antes de `requireSession`; las dos rutas nuevas no están en las exenciones (`csrf-guard.ts:17`). Sesión `SameSite=Strict`. Probado (t1218 líneas 99 y 276).
- Inicio: `limiter.consume('link', request.userId)` (`google-auth.routes.ts:111`), 5 por 15 min por usuario (`google-auth-config.ts:17`), antes de leer el cuerpo. El bucket `link` se comparte con la vinculación, pero esa vía exige cuenta CON contraseña y esta cuenta SIN contraseña: poblaciones disjuntas, sin interferencia real.
- Ruta de borrado: sin límite propio (`google-auth.routes.ts:119`). Evaluación en TRI-02.

### 3. Tiempos uniformes y enumeración
- 403 uniforme: ausente, vencida, de otra sesión, con contraseña y `sub` ajeno devuelven el mismo `ERR-ACCOUNT-DELETE-REAUTH-REQUIRED` (`account-google-deletion-use-cases.ts:30,165-173`); probado (t1218 línea 247).
- 400 uniforme: todo fallo del callback es `googleFailed()`; el verificador usa mensaje fijo y `reason` cerrado, sin cuerpo de Google (`google-oidc-verify.ts:30-42`).
- Enumeración: el `userId` sale de la sesión, no de la entrada; la ruta solo informa sobre la propia cuenta del solicitante. No existe vector de enumeración entre cuentas. Los tiempos no son constantes (1 a 3 lecturas según la rama), pero no hay un tercero a quien revelar nada (TRI-07, informativo).

### 4. Sub, correo, token y hogares en logs, auditoría y errores
- Sin `console.*` ni llamadas a logger en los cinco archivos auditados. El único log de errores (`problem-details.ts:63`) solo corre para errores NO previstos (no `DomainError*`); el 409 y el 403 no se registran. El logger de Fastify redacta `cookie` y `set-cookie` (`cloud-logging.ts:161`); el cuerpo de la petición no se registra.
- Auditoría: `ACCOUNT_DELETE` guarda HMAC del `userId` y hashes de estado de la vista canónica que excluye `email`, `displayName`, `microchipId` (`canonical-view.ts:11`, `account-use-cases.ts:211`). El `sub` nunca entra a la auditoría.
- Errores: el `sub` solo viaja como parámetro enlazado (`sqlite-repositories.ts` bloque `authIdentityRepository`); `GoogleOidcError` no incluye datos del token.
- Cookie `argos_oauth`: contiene solo un identificador opaco; la base guarda el hash.

### 5. Borrado completo (Ley 1581 de 2012) — SÓLIDO en datos de aplicación
- `eraseAccountInTransaction` (`account-use-cases.ts:179-240`): mascotas y registros, medios encolados, invitaciones, membresías, hogares en cascada, `sessions.deleteByUser`, `confirmationTokens.deleteForUser` (respaldos), `rateLimits`, `shareAudit.clearActor`, `loginAttempts`, escena (`sceneHooks.onAccountDeleting`), `users.delete`.
- `auth_identities` y `oauth_flow_states` (incluida la marca con el `sub`) caen por `ON DELETE CASCADE` (`0018...sql:20`; SQLite `0017`) y la poscondición `countReferences` los cuenta explícitamente y revierte si queda alguno (`sqlite-repositories.ts:249-261`; PG `postgres-repositories.ts:103`). No queda `sub` ni correo en filas de la cuenta; la fila `users` (con `email`) se elimina.
- Auditoría propia: `pseudonymizeUser` reemplaza `executor_user_id` y `entity_id` por el HMAC (`sqlite-repositories.ts:1050-1057`); quedan solo seudónimos y hashes, sin correo.
- Migraciones 0018/0014: paridad de CHECK confirmada; la marca `pending_subject` solo se admite con intención DELETE y `pending_email` sigue nulo; copia de filas sin pérdida; no hay otra tabla que referencie `oauth_flow_states`.

## Hallazgos

### MEDIO

**TRI-01 — Dependencia de `auth_time` en el `id_token` de Google real (riesgo de disponibilidad, no de seguridad).** `isRecentAuthentication` es fail-closed sin `auth_time` (`reauthentication-policy.ts:19`) y el verificador solo lo devuelve si viene como número (`google-oidc-verify.ts:181-182`). Si el endpoint de Google no emite `auth_time` en el `id_token` de este cliente (la documentación de Google no lo lista de forma explícita entre los claims garantizados; no lo pude verificar contra Google real desde aquí), TODO borrado devolvería 400 en producción y la deuda #17 quedaría inoperante. Las pruebas usan un Google simulado que sí lo emite. Acción: smoke test con las credenciales reales de Google (tarea de `/link`) ANTES de desplegar y, si no llega, decidir con Neo una alternativa (p. ej. exigir que `iat` del `id_token` sea reciente y posterior al inicio del flujo, dado que `prompt=login` fuerza credenciales). No es un defecto de seguridad: falla cerrado.

### BAJO

**TRI-02 — La ruta `POST /api/account/deletion/google` no tiene límite de tasa propio** (`google-auth.routes.ts:119-123`). Dictamen: **no es explotable para borrar** (la prueba es estado del servidor, no un secreto adivinable, y exige haber pasado Google), pero deja dos huecos menores: (a) con una prueba vigente y el token de respaldo opcional, un `ERR-ACCOUNT-CONFIRMATION-MISMATCH` revierte y devuelve la prueba, así que el titular (o quien tenga sesión y prueba) puede probar tokens sin tope durante 900 s; (b) cada intento hace 3 a 4 lecturas. **Propuesta (no implementada):** nuevo bucket `deleteAccount` en `GOOGLE_AUTH_LIMITS` (`google-auth-config.ts`), por usuario, p. ej. 5 intentos por 15 min, `limiter.consume('deleteAccount', request.userId)` al inicio del manejador, antes de leer el cuerpo; reutiliza `GoogleRateLimiter` y el `ERR-RATE-LIMITED` uniforme, sin cambiar contrato (el 429 ya existe en el catálogo). Requiere confirmar con `/architect` si el 429 debe declararse en la operación de `admin.openapi.yaml`.

**TRI-03 — `auth_time` no se compara con el inicio del flujo.** La política acepta cualquier `auth_time` de los últimos 900 s, no uno posterior a `flow.createdAt`. Si Google ignorara `prompt=login` y reusara una autenticación de hasta 15 min antes del inicio, se aceptaría. Endurecimiento de defensa en profundidad (la guía OIDC recomienda comprobarlo): exigir `authTime >= flow.createdAt - 60 s` en `proveOwnership`. Se combina con la decisión de TRI-01.

**TRI-04 — Detalle del 409 con nombres de hogares** (`account-google-deletion-use-cases.ts:47`). **Dictamen: riesgo aceptable (se acepta la decisión Sati/Oracle O3)**, con las siguientes razones y condiciones. Razones: (i) el 409 solo es alcanzable con la prueba válida (A2 corre antes de B; una sesión robada sin prueba recibe 403 y no ve ningún nombre); (ii) los hogares listados son los que la persona posee o a los que pertenece con mascotas suyas asignadas, y ya los ve en su propia cuenta; (iii) ni el nombre ni la lista llegan a logs ni a auditoría (verificado en el área 4); (iv) la interfaz decide el mensaje por `code` y renderiza texto sin HTML (`account-deletion-google.ts:84,121`). Condiciones recomendadas (no bloqueantes): el nombre es texto libre y puede venir de otro miembro cuando el hogar no es del usuario, así que (a) no interpretar HTML en la UI (hoy es texto), (b) acotar la longitud de cada nombre en el `detail` (la lista ya se limita a 100 hogares, `MAX_LISTED_HOUSEHOLDS`), y (c) fijar `Cache-Control: no-store` en respuestas ProblemDetails de esta ruta. Alternativa más estricta si Neo lo prefiere: dejar el `detail` genérico y entregar nombres solo en la extensión `households[]`, que ya existe.

**TRI-05 — El `sub` en claro de pruebas vencidas no usadas permanece hasta una purga.** `pending_subject` guarda el `sub` en `oauth_flow_states`; las filas vencidas solo se purgan cuando alguien inicia una autorización (`beginAuthorization` -> `purgeExpired`, `google-auth-use-cases.ts:94`). El dato no es nuevo (el mismo `sub` está en `auth_identities`) y se borra por cascada al eliminar la cuenta, pero conviene que el mantenimiento programado también purgue `oauth_flow_states` vencidos. Mejora menor de minimización (Ley 1581, principio de finalidad).

**TRI-06 — Respaldos de infraestructura y retención (fuera del alcance del código).** El borrado cubre las tablas de la aplicación, pero las copias de la base (Cloud SQL, instantáneas y WAL) conservan los datos hasta su expiración. Acción de documentación para `/rama` y `/link`: fijar y publicar la ventana de retención de respaldos y la política de no restauración selectiva (Ley 1581 de 2012, art. 8 y supresión).

**TRI-07 — Límite de tasa en memoria por instancia.** `GoogleRateLimiter` guarda eventos en un `Map` del proceso (`google-rate-limit.ts:19`); con varias instancias el tope efectivo se multiplica. Heredado de 008, no introducido aquí; relevante si se implementa TRI-02. También los tiempos no son constantes, sin vector de enumeración (informativo).

## Resumen de cierre

| Severidad | IDs |
|---|---|
| ALTO | ninguno |
| MEDIO | TRI-01 |
| BAJO | TRI-02, TRI-03, TRI-04 (aceptado), TRI-05, TRI-06, TRI-07 |

Dictamen sobre el `detail` del 409: **aceptable** (condiciones en TRI-04). Dictamen sobre el rate limit de la ruta de borrado: **no explotable, pero añadir un límite por usuario es barato y recomendable** (TRI-02), para cerrar el sondeo de tokens de respaldo y reducir lecturas.

No se modificó código, no se marcó `[x]`. T1222 queda a la espera de la parte `/rama` y de la decisión de Neo/`/architect` sobre TRI-01 y TRI-02.
