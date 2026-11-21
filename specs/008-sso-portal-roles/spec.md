# Feature Specification: SSO con Google, registro con correo, vinculación de cuentas, aprobación de registro, portal /admin y UX de escena (Feature 008)

**Feature Branch**: `008-sso-portal-roles` (creada por `/architect` por instrucción de Morpheus; sin push)
**Created**: 2026-11-20
**Status**: `DRAFT` (borrador del Architect; el techo de los agentes es `REVIEW`). Hay **decisiones de Nivel 2 pendientes de Neo** (ver «Decisiones pendientes de Neo»); ninguna se ha decidido en este documento.
**Input**: `claude/inbox-feature-008.md` (GitHub Project #5; 8 ítems: `[GH:#16]`, `[GH:#17]`, `[GH:#18]`, `[GH:#19]`, `[GH:#20]`, `[GH:#53]`, `[GH:#54]`, `[GH:#55]`), tratado como el prompt funcional de Neo. Lectura de `specs/004-*` (decisiones diferidas 4 «correo» y 5 «SSO»), `specs/005-*` (`REQ-PRM-001..003`), `specs/006-*` (escena, cuota) y `specs/007-*` (formato de referencia).

## Verificación de premisas (lectura del estado real en disco, 2026-11-20)

| Premisa del inbox | Hallazgo en disco | Consecuencia |
| --- | --- | --- |
| «Registro con correo» (`#16`) | El correo existe en la cuenta pero **no es único ni verificado** (`REQ-LOG-001` de 004: «El correo sigue sin ser único ni verificado y no se usa para invitar»; `EDGE-007` de 004: un mismo correo puede estar en dos cuentas antiguas). No existe ningún envío de correo en el repositorio. | La verificación de correo exige un puerto de envío nuevo (`EmailSenderPort`) y un proveedor externo: **Nivel 2** (Principio VI: solo servicios gratuitos y autorizados). Las cuentas antiguas **no pueden tratarse como correo verificado** (riesgo de *pre-hijacking*, ver `EDGE-008-003`). |
| «SSO con Google» (`#16`) | La constitución (3.4.0) autoriza `jose` 6.2.17 **solo** en `src/infrastructure/http/oidc-verify.ts` (verificación del token OIDC de Cloud Scheduler); cualquier otro uso requiere Nivel 2. No hay cliente OAuth de Google ni flujo de redirección. | Verificar el `id_token` de Google con `jose` fuera de ese archivo o con otra librería es **decisión de Nivel 2** (`D8-05`). |
| Cookie de sesión | `argos_session` es `HttpOnly`, `SameSite=Strict`, `Path=/` (constitución, Stack). Una cookie `Strict` **no viaja** en la navegación que vuelve desde Google, ni en la redirección encadenada que sigue a esa navegación. | El *callback* de Google no puede apoyarse en la sesión ni redirigir con `302` a una página que la necesite; ver `ADR-008-03` y `EDGE-008-006`. |
| «Administrador» (`#19`) | `ADMIN` ya existe como **rol de hogar** (`REQ-RBAC-001` de 002). | El rol de plataforma se llama `PLATFORM_ADMIN` y es un concepto distinto; nunca se reutiliza `ADMIN` (`INV-ADM8-001`). |
| Parámetros (`#20`) | `platform_parameters` existe desde `T710` (005) con `album.max_photos_per_pet = 10`, `updated_at` y `updated_by_user_id` **anulable sin FK** (`REQ-PRM-003`: «no se crea el rol, ni ruta, ni UI en esta feature»). El rango válido y el defecto viven **en el código** (`REQ-PRM-002`), con caché de TTL <= 60 s (`D5-07`). | `#20` depende de que exista el rol `PLATFORM_ADMIN` (`#19`); la escritura debe respetar rango del catálogo del código y la caché. |
| Escena (`#53`, `#54`, `#55`) | Cuota **mensual por hogar** (`REQ-ESC6-011`), reinicio el día 1 a las 00:00 en `APP_TIMEZONE`; la vista ya trae `quota.resetsAt` (`scene-api.ts`). El texto vigente es `scenePendingMessage` + «Generaciones restantes: R» (007, `D7-01`). `HomeSceneImage` (Mascotas) es **solo visualización, sin textos** (`D6-19`, `SC-ESC6-110/111`) y la ruta de imagen es una redirección `302` a URL firmada. | `#53` no requiere dato nuevo. `#55` enmienda `D6-19` (se permite un rótulo). `#54` tiene un riesgo técnico de descarga entre orígenes (`EDGE-008-020`). |

## Alcance y no alcance

**Dentro**: `[GH:#16]` inicio de sesión y registro con Google; registro con correo y verificación; `[GH:#17]` vinculación segura de proveedores; `[GH:#18]` aprobación de registro (estructura; **política pendiente de Neo**); `[GH:#19]` portal `/admin` aislado (**modelo de identidad pendiente de Neo**); `[GH:#20]` UI admin del tope de fotos por mascota; `[GH:#53]` aviso de renovación de generaciones; `[GH:#54]` botón de descarga de la escena; `[GH:#55]` rótulo de la escena en Mascotas.
**Fuera**: otros proveedores (Apple, Microsoft, GitHub); MFA (salvo lo que decida `D8-03`); recuperación de contraseña por correo (no está en el inbox; se anota como `DEUDA-008-RECUPERACION`); gestión de usuarios por admin más allá de aprobar/rechazar; cambios al algoritmo de escena, cuotas o huella de 006; infraestructura (`terraform apply`, despliegue) y `git push`.

## División de la feature (`D8-01`, pendiente de Neo)

El inbox pide valorar dos especificaciones. Las tareas están organizadas en bloques **independientes por ítem** para que cualquier opción se aplique sin reescribir: la opción B/C se ejecuta moviendo los Bloques C, D y E a una `009-...` sin cambiar IDs (los IDs `REQ-*8-*` se renombrarían solo si Neo elige B).

## User Scenarios & Testing

### User Story 1 — Entrar con Google o registrarme con mi correo `[GH:#16]` (P0)
**Independent Test**: `SC-008-001..008`.
1. **Given** la pantalla de acceso, **When** pulso «Continuar con Google» y autorizo, **Then** vuelvo a ARGOS con sesión iniciada; si es mi primera vez elijo mi usuario antes de continuar.
2. **Given** el registro, **When** escribo correo, usuario y contraseña, **Then** recibo un correo con un enlace; hasta abrirlo la cuenta existe pero el correo figura «sin verificar».
3. **Given** que cancelo en Google, **Then** vuelvo a la pantalla de acceso con un mensaje neutro y sin cuenta creada.

### User Story 2 — Mi correo ya existe bajo otro método `[GH:#17]` (P0)
**Independent Test**: `SC-008-009..014`.
1. **Given** una cuenta con correo y contraseña, **When** entro con Google con ese mismo correo, **Then** no veo «este correo ya existe»: veo «Te enviamos un correo para confirmar que eres tú» y, al abrir el enlace, ambos métodos quedan en la misma cuenta.
2. **Given** que no abro el enlace, **Then** no se vincula nada y la cuenta existente no cambia.

### User Story 3 — Pido acceso y un administrador me aprueba `[GH:#18]` (P0, **política pendiente**)
**Independent Test**: `SC-008-015..019` (se concretan al decidir `D8-02`).
1. **Given** el registro, **Then** la cuenta nace en estado `PENDING` y la persona ve «Tu solicitud está en revisión».
2. **Given** un `PLATFORM_ADMIN`, **When** abre la lista de pendientes, **Then** aprueba o rechaza cada solicitud y la persona recibe el resultado.

### User Story 4 — Portal `/admin` separado `[GH:#19]` (P1, **identidad pendiente**)
**Independent Test**: `SC-008-020..026`.
1. **Given** un usuario normal, **Then** nunca ve ni se le ofrece «Administrador» en el registro ni en el menú; `/admin` responde igual que cualquier ruta inexistente.
2. **Given** un `PLATFORM_ADMIN`, **When** entra por `/admin` con su acceso independiente, **Then** ve el portal; su sesión de `/admin` no abre la aplicación de usuarios ni al revés.

### User Story 5 — Cambiar el tope de fotos por mascota desde `/admin` `[GH:#20]` (P2)
**Independent Test**: `SC-008-027..031`.
1. **Given** el portal `/admin`, **When** cambio el tope de 10 a 12 y guardo, **Then** el valor queda auditado y las nuevas subidas respetan 12 (con la ventana de caché de 60 s ya aceptada en 005).

### User Story 6 — Mejoras de la escena del hogar `[GH:#53]` `[GH:#54]` `[GH:#55]` (sin prioridad)
**Independent Test**: `SC-008-032..041`.
1. **#53**: junto a «Generaciones restantes: R» veo cuándo se renuevan (mensual, por hogar).
2. **#54**: un botón «Descargar imagen» guarda la escena como archivo.
3. **#55**: en Mascotas la imagen del hogar lleva el rótulo «Mi hogar».

### Edge Cases
- **EDGE-008-001** (`#16`): `email_verified = false` en el `id_token` de Google, `iss`/`aud`/`exp`/`nonce` inválidos, `state` desconocido o reutilizado, código ya canjeado: se rechaza con un mensaje genérico y sin crear ni modificar cuentas; el motivo no se escribe en logs con PII.
- **EDGE-008-002** (`#16`): el correo de Google cambia entre inicios de sesión: la identidad se ancla en `sub` (identificador estable de Google), **nunca** en el correo.
- **EDGE-008-003** (`#17`, severidad ALTA): *pre-hijacking*: un atacante registra con correo y contraseña **el correo de la víctima** (sin verificar) antes de que la víctima entre con Google. Regla: una cuenta con correo **no verificado** no se vincula con un `sub` de Google por coincidencia de correo; la vinculación exige confirmar el control del correo en el momento (`REQ-VIN8-002`) y toda sesión previa de la cuenta se revoca al vincular (`REQ-VIN8-004`).
- **EDGE-008-004** (`#17`): el correo coincide con **dos** cuentas antiguas (el correo no es único, `EDGE-007` de 004): no se vincula; respuesta genérica idéntica a «correo sin cuenta» (`INV-VIN8-001`).
- **EDGE-008-005** (`#16`): el enlace de verificación o de vinculación se abre dos veces, vencido, o desde otro navegador: de un solo uso; el segundo uso y el vencido responden lo mismo («enlace inválido o vencido») y no revelan si el correo existe.
- **EDGE-008-006** (`#16`): el *callback* llega desde Google con una cookie `SameSite=Strict` ausente: el estado del flujo (`state`, `nonce`, verificador PKCE) viaja en una cookie propia de vida corta; la sesión definitiva se establece en una respuesta `200` (no en un `302`), ver `ADR-008-03`.
- **EDGE-008-007** (`#16`): el usuario cierra la pestaña tras Google y antes de elegir `username`: el estado intermedio expira (15 min) sin dejar cuenta a medio crear.
- **EDGE-008-008** (`#16`/`#18`): envío de correos con proveedor caído: el registro no se pierde, la verificación queda reenviable y el límite de reenvíos (3 por hora por cuenta, 10 por IP efectiva y hora) evita usar ARGOS como emisor de correo masivo (*mail bombing*).
- **EDGE-008-009** (`#18`): cuentas existentes al activar el mecanismo: no pasan a `PENDING`; la migración las deja `ACTIVE` (`REQ-APR8-005`).
- **EDGE-008-010** (`#18`): solicitud rechazada que intenta registrarse de nuevo, o aprobada y rechazada por dos admins a la vez: la decisión es atómica y la primera gana; la segunda recibe el estado vigente (compare-and-set, patrón de `REQ-ESC6-012`).
- **EDGE-008-011** (`#18`): usuario `PENDING` con sesión abierta antes de ser rechazado: su sesión se revoca al rechazar.
- **EDGE-008-012** (`#19`): enumeración de `/admin`: para quien no es `PLATFORM_ADMIN`, `/admin` y `/api/admin/*` responden el mismo `404` que una ruta inexistente (no `401`/`403`).
- **EDGE-008-013** (`#19`): primer administrador (arranque): no existe ningún `PLATFORM_ADMIN` y no puede crearse desde la interfaz; el mecanismo exacto es `D8-03` (pendiente).
- **EDGE-008-014** (`#19`): un `PLATFORM_ADMIN` eliminado, o el último administrador que intenta degradarse: se rechaza dejar la plataforma sin administrador.
- **EDGE-008-015** (`#19`/`#20`): CSRF sobre las acciones de `/admin` (cookie de otra sesión): las mutaciones exigen la misma defensa que el resto de la API (`SameSite=Strict` y cabecera de origen verificada) y cookie distinta de la de usuarios.
- **EDGE-008-016** (`#20`): valor `0`, negativo, decimal, no numérico, fuera de rango o con espacios: se rechaza con `ERR-SCHEMA-VALIDATION-FAILED`, sin escribir; un valor ya fuera de rango en BD sigue cayendo al defecto del código (`EDGE-005-03`).
- **EDGE-008-017** (`#20`): bajar el tope por debajo del conteo existente: se conservan las fotos y solo se bloquean subidas nuevas (`REQ-ALB5-003`); la UI lo informa antes de guardar.
- **EDGE-008-018** (`#20`): dos admins editan a la vez: control optimista (`If-Match` sobre `updated_at`), el segundo recibe `412` con mensaje fijo.
- **EDGE-008-019** (`#53`): la fecha de renovación se calcula del `quota.resetsAt` del servidor (no del reloj del navegador) y se formatea en `APP_TIMEZONE`; el texto no promete «de por vida» ni «diario».
- **EDGE-008-020** (`#54`, riesgo técnico): el atributo `download` se ignora si la imagen llega por una redirección `302` a una URL firmada de otro origen. Si la comprobación en navegador (T1166) lo confirma, hace falta un parámetro de descarga en la ruta de imagen (cambio MINOR de contrato de 006): **Caso B hacia `/architect`**, no improvisación de `/keymaker`.
- **EDGE-008-021** (`#54`): nombre del archivo descargado: sin nombre de mascota ni de hogar (PII); fijo `argos-hogar-AAAA-MM-DD.png` con la fecha de generación, sin caracteres de control.
- **EDGE-008-022** (`#55`): el rótulo no se pinta cuando la imagen no se pinta (0 hogares, `imageTag = null`, error de lectura), y `alt` y rótulo no se duplican para lectores de pantalla.

## Requirements

### Bloque A — SSO con Google y registro con correo `[GH:#16]`
- **REQ-SSO8-001** (Inicio de sesión con Google): flujo OIDC *authorization code* con PKCE (`S256`), `state` y `nonce` de un solo uso. El servidor canjea el código, valida `iss` (`https://accounts.google.com`), `aud` (el *client id* de ARGOS), `exp`, `nonce` y exige `email_verified = true`. La identidad de Google se ancla en `sub` (tabla `auth_identities`: `provider`, `provider_subject`, `user_id`, `created_at`; unicidad `(provider, provider_subject)`). Solo recibe el *scope* `openid email` (sin perfil, sin contactos; minimización). *Trazas*: INV-AUTH-006, EDGE-008-001, EDGE-008-002.
- **REQ-SSO8-002** (Registro con correo y verificación): `POST` de registro con correo, `username` (`REQ-LOG-002`) y contraseña (`INV-AUTH2-001`). El correo queda `email_verified_at = NULL` hasta usar el enlace. El token de verificación es de 32 bytes aleatorios en `base64url`, se guarda **solo como SHA-256**, vence a las 24 h y es de un solo uso. Mientras no esté verificado la cuenta puede iniciar sesión por `username` (sin bloquear al usuario), pero el correo **no** cuenta para vinculación ni para invitaciones (`EDGE-008-003`). *Trazas*: REQ-LOG-001, REQ-LOG-002.
- **REQ-SSO8-003** (Primer acceso con Google): si el `sub` no existe y el correo de Google no coincide con ninguna cuenta, se muestra una pantalla «Elige tu usuario» (reglas de `REQ-LOG-002`); la cuenta nace sin contraseña, con `email_verified_at` = momento del acceso (Google lo verificó) y sin posibilidad de iniciar sesión por contraseña hasta que la persona defina una (`REQ-VIN8-005`). El estado intermedio expira a los 15 min (`EDGE-008-007`).
- **REQ-SSO8-004** (Estado del flujo y cookie de sesión): `state`, `nonce` y verificador PKCE viajan en una cookie `argos_oauth` (`HttpOnly`, `SameSite=Lax`, `Path=/api/auth/google`, `Max-Age` 600 s, `Secure` en Cloud), de un solo uso. La cookie de sesión `argos_session` conserva `SameSite=Strict`; se establece en una respuesta `200` del *callback* con una página mínima que navega a `/` (no en un `302` cross-site). *Trazas*: INV-AUTH-006, EDGE-008-006. (`ADR-008-03`)
- **REQ-SSO8-005** (Respuestas uniformes y límite de tasa): los fallos del flujo (código inválido, `state` reutilizado, `email_verified` falso, cuenta ambigua) devuelven el mismo mensaje y el mismo estado; el registro y el reenvío de verificación respetan el límite de `EDGE-008-008` con contadores por identificador normalizado (patrón de `REQ-LOG-001`: sin cruce entre claves) y sin escribir el correo en logs. *Trazas*: INV-LOG-002.
- **REQ-SSO8-006** (Puerto de correo): `application/` define `EmailSenderPort` (entrada: destinatario, plantilla cerrada y variables; salida: aceptado o error tipado). El adaptador real vive solo en `infrastructure/` y se activa por `ARGOS_EMAIL_DRIVER` ∈ {`real`, `fake`}; `fake` determinista para CI y E2E; en producción la aplicación no arranca con `fake` ni sin credencial. Toda configuración se lee solo en `src/infrastructure/config/app-config.ts` (`INV-ARCH-006`). Plantillas cerradas (verificación, vinculación, resultado de aprobación, aviso al administrador): texto plano, sin datos de mascotas ni de hogares. *Depende de `D8-04`.* *Trazas*: INV-ARCH-006.
- **REQ-SSO8-007** (Credenciales de Google): el *client id* y el *client secret* viven en Secret Manager (y en `.env` local, ignorado por git); la URI de redirección autorizada es fija por entorno (sin `Host` de la petición). Alta de credenciales en Terraform y consola de Google: tarea de `/link`, sin `terraform apply` por agentes.

### Bloque B — Vinculación segura `[GH:#17]`
- **REQ-VIN8-001** (Sin error crudo): cuando el correo de un intento (Google o registro) ya pertenece a una cuenta con otro método, la respuesta es la misma que la de un correo sin cuenta en el registro («Si el correo puede usarse, te enviamos un mensaje»); nunca «este correo ya existe». *Trazas*: INV-LOG-002.
- **REQ-VIN8-002** (Vinculación por prueba de control del correo): la vinculación de un `sub` de Google a una cuenta **existente** solo ocurre tras abrir un enlace de un solo uso enviado **al correo de la cuenta existente** (token 32 bytes, SHA-256 en BD, vence a 30 min). El enlace lleva el intento pendiente (`sub`, `email_verified` de Google) guardado en servidor, no en el enlace. Al abrirlo, la persona confirma con su sesión o su contraseña actual si la cuenta tiene contraseña (`INV-VIN8-002`). Sin autovinculación silenciosa en ningún caso. *Trazas*: EDGE-008-003, EDGE-008-005.
- **REQ-VIN8-003** (Cuentas ambiguas o sin correo verificado): con dos o más cuentas con ese correo no se vincula (`EDGE-008-004`); con una cuenta cuyo correo no está verificado, la vinculación exige primero verificar ese correo con el enlace de `REQ-SSO8-002`. *Trazas*: EDGE-008-003, EDGE-008-004.
- **REQ-VIN8-004** (Efectos de la vinculación): al vincular se revocan todas las sesiones de la cuenta, se audita el evento (`AuditEntityType` nuevo o existente; sin correo ni `sub` en el detalle) y se avisa por correo a la dirección de la cuenta («Se vinculó Google a tu cuenta»). *Trazas*: REQ-AUD-001.
- **REQ-VIN8-005** (Desvincular y último método): una cuenta debe conservar al menos un método de acceso; desvincular el último se rechaza. Una cuenta nacida con Google puede definir contraseña desde su perfil (requiere sesión reciente). *Trazas*: INV-VIN8-003.
- **INV-VIN8-001** (Respuesta uniforme): «correo existe», «correo sin cuenta», «correo ambiguo» y «correo sin verificar» producen el mismo estado, cuerpo y tiempo (una operación de coste equivalente cada uno).
- **INV-VIN8-002** (Una identidad, una cuenta): `(provider, provider_subject)` es único; un `sub` ya vinculado a otra cuenta no puede vincularse a una segunda.
- **INV-VIN8-003** (Al menos un método): toda cuenta tiene contraseña o al menos una identidad externa.

### Bloque C — Aprobación de registro `[GH:#18]` (**política pendiente: `D8-02`**)
La **estructura** es independiente de la política y se especifica ya; la **regla de aprobación** se fija al decidir `D8-02`.
- **REQ-APR8-001** (Estado de la cuenta): `users.account_status` ∈ {`ACTIVE`, `PENDING`, `REJECTED`} (cerrado). Una cuenta `PENDING` o `REJECTED` no obtiene sesión útil: no accede a mascotas, hogares ni escena; solo ve su pantalla de estado. *Trazas*: STATE-ACCT8-001.
- **REQ-APR8-002** (Solicitud y estado): el registro (correo o Google) crea la cuenta en el estado que dicte la política `D8-02`; en el estado `PENDING` se muestra «Tu solicitud está en revisión» con aviso del plazo que decida Neo. *Depende de `D8-02`.*
- **REQ-APR8-003** (Notificación al administrador): cada solicitud nueva genera un aviso por correo al administrador (`EmailSenderPort`), con un resumen sin datos personales más allá del `username`; el aviso se agrupa (máximo 1 correo por hora con N solicitudes) para no inundar. *Depende de `D8-02` y `D8-04`.*
- **REQ-APR8-004** (Decisión atómica y resultado): aprobar o rechazar es una transición atómica `PENDING → ACTIVE | REJECTED` con compare-and-set (`EDGE-008-010`), auditada con el id del administrador, y notifica el resultado al usuario por correo; un rechazo revoca sesiones (`EDGE-008-011`). Los destinos y reintentos tras un rechazo dependen de `D8-02`. *Trazas*: REQ-AUD-001.
- **REQ-APR8-005** (Migración): las cuentas existentes quedan `ACTIVE` (`EDGE-008-009`). Prueba de paridad SQLite/Postgres con filas previas.
- **STATE-ACCT8-001** (Máquina cerrada, DRAFT): `PENDING → ACTIVE`, `PENDING → REJECTED`; `REJECTED → PENDING` solo si `D8-02` lo permite; `ACTIVE` es terminal para esta máquina (suspensión queda fuera). Se redacta en `contracts/state-machines/` tras `D8-02`.

### Bloque D — Portal `/admin` `[GH:#19]` (**identidad pendiente: `D8-03`**)
- **REQ-ADM8-001** (Aislamiento de rutas y de UI): `/admin` y `/api/admin/*` son un portal separado: bundle y rutas propias, sin enlaces desde la aplicación de usuarios y sin cambios en el registro ni en los menús de usuarios (cero preguntas de «¿Administrador?»). Para quien no es `PLATFORM_ADMIN` responden el mismo `404` que una ruta inexistente (`EDGE-008-012`). *Trazas*: INV-ADM8-001.
- **REQ-ADM8-002** (Sesión independiente): la sesión de `/admin` usa una cookie distinta (`argos_admin_session`, `HttpOnly`, `SameSite=Strict`, `Path=/admin` y `/api/admin`), expiración propia más corta que la de usuarios (propuesta: 30 min absolutos, 10 min de inactividad; a confirmar por Neo) y no es válida en la API de usuarios ni al revés. *Depende de `D8-03`.*
- **REQ-ADM8-003** (Modelo de identidad del administrador): ver `D8-03`; con independencia de la opción, `PLATFORM_ADMIN` **no** es un rol de hogar, **no** se concede desde ninguna pantalla de usuario y su alta inicial no pasa por la interfaz (`EDGE-008-013`). *Depende de `D8-03`.*
- **REQ-ADM8-004** (Lista de pendientes): vista paginada (25 por página) de cuentas `PENDING` con `username`, fecha de solicitud y método (correo/Google); acciones aprobar y rechazar con confirmación. Solo existe si se adopta la política de aprobación (`D8-02` ≠ opción sin aprobación).
- **REQ-ADM8-005** (Auditoría de administración): toda acción de `/admin` queda auditada (quién, qué, cuándo) sin datos de usuario innecesarios; los intentos de acceso fallidos a `/admin` se cuentan por IP efectiva (`trustProxy` de 1 salto) con el límite de tasa de `REQ-VET-007` como patrón.
- **REQ-ADM8-006** (Último administrador): no se puede eliminar ni degradar al último `PLATFORM_ADMIN` (`EDGE-008-014`).
- **INV-ADM8-001** (Roles distintos): el rol `PLATFORM_ADMIN` no existe en `RBAC` de hogares (`REQ-RBAC-001` intacto); ninguna función de `can(rol, acción)` de 002 lo reconoce.

### Bloque E — Tope de fotos por mascota desde `/admin` `[GH:#20]`
- **REQ-PRM8-001** (Lectura y edición): el portal lista los parámetros del catálogo de código (hoy solo `album.max_photos_per_pet`) con valor vigente, defecto, rango, fecha y autor de la última edición, y permite editarlos; no permite crear claves nuevas (`REQ-PRM-002`: el catálogo es el del código). *Trazas*: REQ-PRM-001, REQ-PRM-002.
- **REQ-PRM8-002** (Validación): entero con rango del catálogo del código (propuesta: 1..50; a confirmar, `D8-08`); rechazo con `ERR-SCHEMA-VALIDATION-FAILED` y sin escritura (`EDGE-008-016`). *Trazas*: REQ-PRM-002.
- **REQ-PRM8-003** (Escritura con autoría y concurrencia): la escritura actualiza `value`, `updated_at` y `updated_by_user_id` (`REQ-PRM-003`) en una transacción, con `If-Match` y `412` ante edición concurrente (`EDGE-008-018`), y deja entrada de auditoría. *Trazas*: REQ-PRM-003.
- **REQ-PRM8-004** (Efecto y caché): el nuevo tope rige para subidas nuevas; la caché de <= 60 s por instancia se mantiene (`D5-07`/`PN-04`) y la UI lo informa («Puede tardar hasta 1 minuto en aplicarse»). Bajar por debajo del conteo existente conserva las fotos (`REQ-ALB5-003`, `EDGE-008-017`). *Trazas*: REQ-ALB5-002, REQ-ALB5-003.

### Bloque UX — Escena del hogar (tres ítems independientes entre sí y de los demás bloques)
- **REQ-UX8-001** (`[GH:#53]` Renovación de generaciones): junto a «Generaciones restantes: R» se muestra la regla y la fecha de reinicio tomada de `quota.resetsAt`: «Generaciones restantes este mes: R. Se renuevan el 1 de diciembre.» (fecha formateada en `APP_TIMEZONE`; la cuota es mensual por hogar, `REQ-ESC6-011`). No cambia el contrato (`quota.resetsAt` ya existe). Texto **propuesto por el Architect**, pendiente de confirmación de Neo como observación no bloqueante (`D8-09`). *Trazas*: REQ-ESC6-011, REQ-ESC7-002, EDGE-008-019.
- **REQ-UX8-002** (`[GH:#54]` Descarga de la escena): botón «Descargar imagen» en el bloque Hogar (donde ya existe la gestión; no en Mascotas, `D6-19`), visible solo si hay imagen vigente, accesible por teclado y con nombre `argos-hogar-AAAA-MM-DD.png` (`EDGE-008-021`). Si el atributo `download` no funciona con la redirección firmada (`EDGE-008-020`), se abre Caso B hacia `/architect`. *Trazas*: REQ-ESC6-019, NFR-ESC6-003.
- **REQ-UX8-003** (`[GH:#55]` Rótulo de la escena en Mascotas): `HomeSceneImage` muestra un `figcaption` visible «Mi hogar» bajo la imagen (texto del inbox: «Mi hogar o escena de hogar»; se adopta la primera forma; confirmación de Neo en `D8-09`). Enmienda `D6-19` (el componente era «sin textos»): `SC-ESC6-110/111` de 006 se actualizan. *Trazas*: REQ-ESC6-019, REQ-ESC6-032, EDGE-008-022.

## Decisiones pendientes de Neo (Nivel 2) — NO decididas por el Architect

> Encabezado de escalamiento: **TO: Neo (Andrés Vallejo — Level 2)**. Ninguna bloquea todo: lo que no depende de ellas (Bloque A salvo correo, Bloque B salvo correo, UX `#53`..`#55`) puede avanzar; cada tarea bloqueada lleva la marca `[HUM]` o la dependencia explícita.

| ID | Ítem | Decisión que falta | Opciones (sin recomendación vinculante) | Qué desbloquea |
| --- | --- | --- | --- | --- |
| **D8-01** | `#19` (valorar dos specs) | ¿Una sola feature 008 o dividir? | **A**: una sola feature 008 con todos los bloques. **B**: 008 = SSO + vinculación + UX (`#16`, `#17`, `#53..#55`) y 009 = aprobación + `/admin` + tope de fotos (`#18`, `#19`, `#20`). **C**: como B pero la UX (`#53..#55`) se entrega primero como lote independiente rápido. El Architect solo anota: B/C aíslan el riesgo de seguridad de `/admin` del SSO; A evita dos ciclos de gobernanza. | Estructura de ramas y de `tasks.md` |
| **D8-02** | `#18` (política de aprobación) | ¿Qué regla decide quién entra? | **A**: toda cuenta nueva (correo o Google) nace `PENDING` y requiere aprobación manual. **B**: manual solo para registro con correo; Google verificado entra `ACTIVE`. **C**: lista de correos/dominios permitidos entra `ACTIVE`; el resto `PENDING`. **D**: cupo de usuarios: `ACTIVE` hasta N cuentas, `PENDING` después (N como parámetro de `platform_parameters`). **E**: sin aprobación (solo se conserva el registro abierto). Sub-decisiones: plazo comunicado al solicitante; si un rechazado puede volver a solicitar y cuándo; si los `PENDING` caducan (propuesta a confirmar: 30 días); a qué correo(s) se avisa. | `REQ-APR8-002..004`, `STATE-ACCT8-001`, Bloque C y `REQ-ADM8-004` |
| **D8-03** | `#19` (identidad del administrador) | ¿Cómo se autentica y cómo nace el primer administrador? | **A**: rol de plataforma `PLATFORM_ADMIN` sobre la misma tabla `users`, login en `/admin` con usuario y contraseña + sesión propia. **B**: tabla separada `platform_admins` con credenciales propias (no comparten identidad con usuarios). **C**: administradores por lista de correos de Google en configuración (sin contraseña propia; depende de Bloque A). Sub-decisiones: ¿MFA obligatoria (nuevo método = posible dependencia, Nivel 2)?; alta del primer administrador por *seed* con variable de entorno/Secret Manager, por script de `/link` o por otro medio; duración de sesión. | `REQ-ADM8-002..003`, Bloque D |
| **D8-04** | `#16` (proveedor de correo) | ¿Qué servicio envía los correos? (servicio externo y posible credencial: Principio VI; solo gratuito) | **A**: API HTTP de un proveedor transaccional con plan gratuito, llamada por `fetch` nativo (0 dependencias npm). **B**: SMTP de una cuenta de Google/Workspace de Neo (límites diarios; requiere credencial de aplicación). **C**: aplazar el correo real: verificación y avisos quedan detrás de `EmailSenderPort` con el adaptador `fake` y se entrega solo Google (el registro con correo queda «sin verificar» sin enlace). Sub-decisión: remitente y dominio (SPF/DKIM) para no caer en spam. | `REQ-SSO8-002`, `REQ-SSO8-006`, `REQ-VIN8-002`, `REQ-APR8-003` |
| **D8-05** | `#16` (verificación del `id_token`) | ¿Con qué se verifican las firmas de Google? | **A**: `jose` 6.2.17 (ya autorizada) con enmienda de la constitución para ampliar su uso a un segundo archivo (`google-oidc-verify.ts`). **B**: 0 dependencias, verificación RS256 con `node:crypto` y JWKS por `fetch` (más código propio a probar). **C**: canjear el código en el *back-channel* (Google ya garantiza integridad por TLS en la respuesta del *token endpoint*) y validar solo las *claims* sin firma. | `REQ-SSO8-001` y enmienda a constitución (Principio VI) |
| **D8-06** | `#16`/`#17` (ámbito de Google) | Confirmar que solo se pide `openid email` y que el nombre de Google no se importa. | **A**: solo `openid email` (propuesta del Architect, minimización). **B**: añadir `profile` (nombre/foto). | `REQ-SSO8-001` |
| **D8-07** | `#19`/`#18` (rol del administrador de plataforma en el SSO) | ¿Puede un `PLATFORM_ADMIN` ser también usuario normal con la misma cuenta? | **A**: sí, dos accesos con credenciales/sesiones distintas. **B**: no, cuenta de administración separada. | `REQ-ADM8-002/003` |
| **D8-08** | `#20` (rango del tope) | Rango válido de `album.max_photos_per_pet`. | **A**: 1..50 (propuesta). **B**: otro rango fijado por Neo. | `REQ-PRM8-002` |
| **D8-09** | `#53`/`#55` (textos) | Confirmar textos: «Generaciones restantes este mes: R. Se renuevan el [fecha].» y «Mi hogar». (observación no bloqueante) | **A**: aceptar. **B**: variante de Neo («Escena de hogar»). | `REQ-UX8-001/003` |

Hasta que Neo decida, `/keymaker` no implementa el Bloque C ni el Bloque D, ni el envío real de correo; sí puede implementar `EmailSenderPort` + adaptador `fake`, las pruebas del flujo OIDC con un Google simulado y los tres ítems de UX.

## Requisitos no funcionales
- **NFR-008-001**: dependencias nuevas = las que autorice Neo en `D8-04`/`D8-05`; sin autorización, `package.json` intacto (`jose` 6.2.17 sigue acotada a `oidc-verify.ts`).
- **NFR-008-002**: WCAG 2.1 AA en 320, 1024 y 1280 px para pantallas nuevas y tocadas (`/sati`), incluida la pantalla de acceso con Google y el portal `/admin`.
- **NFR-008-003**: cero «AI Slop»: ninguna UI sin respaldo real; ninguna opción de la pantalla de registro ofrece elegir «Administrador».
- **NFR-008-004** (privacidad): el correo, el `sub` de Google, los tokens y los códigos no se escriben en logs, `detail`/`instance` RFC 9457 ni auditoría; `/rama` valida.

## Success Criteria (resumen por bloque; el detalle de cada escenario `Given/When/Then` se redacta al cerrar las decisiones)
- **SC-008-001..008** (A): Google feliz, primer acceso con elección de `username`, cancelación, `email_verified` falso, `state` reutilizado, cookie `Strict` ausente en el *callback*, registro con correo y enlace de un solo uso, límite de reenvíos.
- **SC-008-009..014** (B): correo existente sin error crudo, vinculación con enlace, no vincular sin abrir el enlace, *pre-hijacking* (`EDGE-008-003`) falla, correo ambiguo, desvincular el último método rechazado.
- **SC-008-015..019** (C): condicionados a `D8-02` (nace `PENDING`, aprobar, rechazar, atomicidad, migración deja `ACTIVE`).
- **SC-008-020..026** (D): `/admin` indistinguible de 404 para no administradores, sesiones separadas, primer administrador, último administrador, CSRF, auditoría.
- **SC-008-027..031** (E): editar tope, rango, concurrencia `412`, conservar fotos al bajar, caché informada.
- **SC-008-032..034** (`#53`), **SC-008-035..038** (`#54`), **SC-008-039..041** (`#55`).
- **SC-008-042** (transversal): `tsc --noEmit` 0 errores, `verify-traceability.sh` y `verify-oracles.sh` en 0 faltantes, `npm run test:gate` en verde, `package.json` según `NFR-008-001`.

## Trazabilidad requisito → tareas (resumen; `tasks.md` es la fuente)
| Bloque | Requisitos | Tareas |
| --- | --- | --- |
| Gobernanza | todos | T1101..T1109 |
| A `[GH:#16]` | REQ-SSO8-001..007 | T1110..T1124 |
| B `[GH:#17]` | REQ-VIN8-001..005, INV-VIN8-001..003 | T1125..T1134 |
| C `[GH:#18]` | REQ-APR8-001..005, STATE-ACCT8-001 | T1135..T1143 |
| D `[GH:#19]` | REQ-ADM8-001..006, INV-ADM8-001 | T1144..T1155 |
| E `[GH:#20]` | REQ-PRM8-001..004 | T1156..T1162 |
| F `[GH:#53]` | REQ-UX8-001 | T1163..T1165 |
| G `[GH:#54]` | REQ-UX8-002 | T1166..T1169 |
| H `[GH:#55]` | REQ-UX8-003 | T1170..T1172 |
| Cierre | NFR-008-001..004 | T1173..T1176 |

## Registro
- 2026-11-20 `/architect`: borrador inicial (`DRAFT`). `D8-01..D8-09` abiertas para Neo. Sin tocar `src/`, `tests/`, `src/generated/` ni contratos ejecutables.
