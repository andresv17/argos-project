# Tasks: SSO con Google, registro con correo, vinculación, aprobación de registro, portal /admin y UX de escena (Feature 008)

**Input**: `specs/008-sso-portal-roles/` (`spec.md`, `plan.md`, `contracts/README.md`); `claude/inbox-feature-008.md`.
**Estado**: `DRAFT` (borrador del Architect, 2026-11-20). Hay decisiones de Nivel 2 pendientes de Neo (`D8-01..D8-09` en `spec.md`); las tareas bloqueadas por ellas lo declaran en `Dep`. El techo de los agentes es `REVIEW`; solo Neo marca `COMPLETED` y fija `APPROVED`/`LOCKED`. **Ninguna tarea está `[x]`.**
**Numeración**: `T1101..T1176` (007 usó hasta `T1077`; no se reutiliza ningún ID).
**Sincronización GitHub Projects**: cada bloque `##` lleva su etiqueta `[GH:#N]` y cada tarea de bloque la repite (el script `gh-project-sync.mjs sync --tasks` la lee del encabezado o de la tarea). Cobertura: `#16` Bloque A, `#17` Bloque B, `#18` Bloque C, `#19` Bloque D, `#20` Bloque E, `#53` Bloque F, `#54` Bloque G, `#55` Bloque H. Los bloques F, G y H son el **lote de UX independiente** (sin dependencia de A..E). Gobernanza y cierre son transversales y no llevan etiqueta.

## Format: `[ID] [P?] [N2|GOV|HUM|ARCH] [GH:#N] Descripción — REQ/SC; Dep: tareas`
- **[P]**: paralelizable. **[N2]**: requiere autorización de Neo (contrato, migración, dependencia, constitución). **[GOV]**: gobernanza o compuerta. **[HUM]**: paso humano de Neo. **[ARCH]**: tarea de `/architect` (contrato o documento normativo; el `/keymaker` no la ejecuta).

## Reglas transversales
- **TDD (constitución IV)**: pruebas rojas antes de implementar; cada tarea de implementación depende de su tarea de pruebas.
- **Dependencias**: ninguna nueva sin autorización (`D8-04`, `D8-05`); `package.json` intacto hasta entonces. Ninguna tarea ejecuta `git push`, `terraform apply` ni despliega.
- **Sin llamadas reales** a Google ni al proveedor de correo en CI: Google simulado y `EmailSenderPort` `fake`.
- **Contratos**: los contratos ejecutables (`schemas`, `openapi`, `state-machines`, `errors`) los redacta `/architect` en las tareas `[ARCH]` y se compilan con `bash scripts/compile-contracts.sh` **solo después** de la decisión de Neo; esta pasada no genera nada en `src/generated/`.
- **Caso B** (contrato vs implementación): vuelve a `/architect` (`MAX_HOPS = 2`).
- **Nombre del rol**: `PLATFORM_ADMIN`; nunca se reutiliza el `ADMIN` de hogar (`INV-ADM8-001`).

---

## Fase 1: Decisiones de Neo y compuertas previas (sin código)

- [ ] T1101 [HUM] Neo decide `D8-01` (una feature o dividir en 008/009 con lote de UX) y la asienta en `claude/decisiones-neo-008-YYYY-MM-DD.md`; `/architect` reordena `tasks.md` sin renumerar — REQ-ADM8-001; SC-008-042
- [ ] T1102 [HUM] Neo decide `D8-02` (política de aprobación y sub-decisiones: plazo, reintento tras rechazo, caducidad, destinatarios del aviso) — REQ-APR8-002, REQ-APR8-003, REQ-APR8-004; SC-008-015..019
- [ ] T1103 [HUM] Neo decide `D8-03` y `D8-07` (identidad del administrador de plataforma, MFA, primer administrador, sesión) — REQ-ADM8-002, REQ-ADM8-003; SC-008-020..026
- [ ] T1104 [HUM] Neo decide `D8-04` (proveedor de correo, remitente, SPF/DKIM) y, si procede, autoriza el servicio externo (Nivel 2, Principio VI) — REQ-SSO8-002, REQ-SSO8-006; SC-008-007
- [ ] T1105 [HUM] Neo decide `D8-05` (verificación del `id_token`: `jose`, `node:crypto` o *claims* sin firma) y `D8-06` (scope `openid email`) — REQ-SSO8-001; SC-008-001
- [ ] T1106 [HUM] Neo decide `D8-08` (rango del tope de fotos) y `D8-09` (textos de `#53` y `#55`; observación no bloqueante) — REQ-PRM8-002, REQ-UX8-001, REQ-UX8-003; SC-008-028
- [ ] T1107 [GOV] `/lock`: EDGE-008-001..022 emitidos en `.specify/memory/audits/lock-008-edge.md` e incorporados a `spec.md`; foco en *pre-hijacking*, cookie `Strict` en el *callback*, enumeración de `/admin` y descarga con redirección firmada — EDGE-008-001..022; SC-008-042. Dep: T1105
- [ ] T1108 [GOV] `/mifune` (poda de capas) y `/merovingian` (grafo de impacto: constitución Principio VI y Stack de autenticación, línea 002 de contratos, `D6-19`/`SC-ESC6-110/111` de 006, `REQ-PRM-003` de 005, `AuditEntityType`) — NFR-008-001; SC-008-042. Dep: T1101
- [ ] T1109 [GOV] `/mouse`: compuerta estructural única (1:1 spec-tareas, 0 etiquetas huérfanas, contratos completos) por bloque ya decidido — todos los REQ; SC-008-001..042. Dep: T1107, T1108

**Checkpoint**: tras `T1109` el lote de UX (F, G, H) puede empezar sin esperar a Neo; A y B esperan `T1104`/`T1105`; C espera `T1102`; D espera `T1103`; E espera `T1103` y `T1106`.

---

## Bloque A — [GH:#16] Single Sign-On con Google y registro con correo electrónico (P0)

**Goal**: acceso con Google (OIDC + PKCE) y registro con correo con verificación de enlace único; puerto de correo con adaptador `fake`.
**Independent Test**: `SC-008-001..008`. Bloqueado en lo real por `D8-04`/`D8-05`.

- [ ] T1110 [ARCH] [N2] [GH:#16] `/architect`: contratos de la línea 002 (MINOR): rutas `/api/auth/google/start`, `/api/auth/google/callback`, registro, verificación, reenvío y elección de `username`; esquemas de `auth_identities`, estado intermedio y errores nuevos (`additionalProperties: false`); sin compilar hasta la decisión — REQ-SSO8-001..005; SC-008-001..008. Dep: T1104, T1105, T1109
- [ ] T1111 [ARCH] [N2] [GH:#16] `/architect`: enmienda de la constitución (Stack de autenticación: cookie `argos_oauth` `SameSite=Lax`, *callback* `200`; Principio VI: servicio de correo y, según `D8-05`, ampliación del uso de `jose`) para firma de Neo — REQ-SSO8-004, REQ-SSO8-006, NFR-008-001; SC-008-005. Dep: T1104, T1105
- [ ] T1112 [GH:#16] Pruebas rojas de las funciones puras de token de un solo uso (generar 32 bytes `base64url`, SHA-256, vencimiento, un solo uso, comparación a tiempo constante) — REQ-SSO8-002; SC-008-007. Dep: T1109
- [ ] T1113 [GH:#16] Implementar `src/domain/auth/one-time-token.ts` (puro, sin `Date` ni `crypto` directo: el reloj y la entropía entran por puertos, Principio II) — REQ-SSO8-002; SC-008-007. Dep: T1112
- [ ] T1114 [GH:#16] Pruebas rojas de verificación del `id_token` con llaves y Google simulados: `iss`, `aud`, `exp`, `nonce`, `email_verified`, `sub`, `state` reutilizado y PKCE — REQ-SSO8-001, EDGE-008-001, EDGE-008-002; SC-008-001, SC-008-004. Dep: T1110
- [ ] T1115 [GH:#16] Implementar el verificador y el cliente del *token endpoint* en `src/infrastructure/http/` según `D8-05` — REQ-SSO8-001; SC-008-001. Dep: T1114
- [ ] T1116 [N2] [GH:#16] Migración: `auth_identities`, `users.email_verified_at`, tabla de tokens de un solo uso y estado intermedio del flujo; SQLite y Postgres con prueba de paridad primero y filas previas (cuentas antiguas con correo `NULL` verificado) — REQ-SSO8-001..003; SC-008-001, SC-008-003. Dep: T1110
- [ ] T1117 [GH:#16] Repositorios SQLite/Postgres y mapeadores; correo, `sub` y tokens fuera de logs y de `detail`/`instance` RFC 9457 (regresión) — REQ-SSO8-001, NFR-008-004; SC-008-001. Dep: T1116
- [ ] T1118 [GH:#16] Pruebas rojas de `EmailSenderPort` y del adaptador `fake` (plantillas cerradas, sin PII de mascotas, destinatario) y de la configuración `ARGOS_EMAIL_DRIVER` (no arranca en producción con `fake`) — REQ-SSO8-006; SC-008-007. Dep: T1104, T1109
- [ ] T1119 [GH:#16] Implementar `EmailSenderPort` (`application/`), adaptador `fake` y adaptador real según `D8-04` (`infrastructure/`), y lectura solo desde `app-config.ts` — REQ-SSO8-006; SC-008-007. Dep: T1118
- [ ] T1120 [GH:#16] Pruebas rojas de casos de uso: iniciar y completar Google, primer acceso con elección de `username`, registro con correo, verificación, reenvío con límite, respuesta uniforme — REQ-SSO8-001..005 (REQ-SSO8-005 incluida), EDGE-008-005, EDGE-008-007, EDGE-008-008; SC-008-001..008 (SC-008-008 reenvío con límite). Dep: T1113, T1115, T1117, T1119
- [ ] T1121 [GH:#16] Implementar casos de uso y rutas (cookie `argos_oauth` de vida corta; *callback* `200` que establece la sesión `Strict` y navega a `/`) — REQ-SSO8-001..005; SC-008-001..008. Dep: T1120
- [ ] T1122 [GH:#16] UI: pantalla de acceso con «Continuar con Google», registro con correo, estado «sin verificar», elección de `username`; revisión `/sati` (320/1024/1280 px, WCAG 2.1 AA) — REQ-SSO8-002, REQ-SSO8-003, NFR-008-002; SC-008-002. Dep: T1121
- [ ] T1123 [GH:#16] E2E Playwright (Chromium, Firefox, WebKit) con Google simulado y correo `fake`: flujo feliz, cancelación, `state` reutilizado y sesión tras el *callback* con cookie `Strict` — REQ-SSO8-004, EDGE-008-006; SC-008-001..006 (SC-008-006 cookie `Strict` en el *callback*). Dep: T1122
- [ ] T1124 [N2] [GH:#16] `/link`: credenciales de OAuth de Google y del proveedor de correo en Secret Manager y variables de Terraform (sin `terraform apply`); URI de redirección fija por entorno — REQ-SSO8-007; SC-008-001. Dep: T1104, T1105

---

## Bloque B — [GH:#17] Vinculación segura de cuentas cuando el correo ya existe (P0)

**Goal**: nunca mostrar «este correo ya existe»; vincular proveedores solo con prueba de control del correo.
**Independent Test**: `SC-008-009..014`.

- [ ] T1125 [GH:#17] Pruebas rojas de respuesta uniforme (correo existente, sin cuenta, ambiguo y sin verificar: mismo estado, cuerpo, una operación de coste equivalente cada uno) — REQ-VIN8-001, INV-VIN8-001; SC-008-009. Dep: T1121
- [ ] T1126 [GH:#17] Pruebas rojas de vinculación: enlace de un solo uso al correo existente, *pre-hijacking* (cuenta con correo sin verificar), correo en dos cuentas, enlace vencido o reutilizado, confirmación con sesión o contraseña — REQ-VIN8-002, REQ-VIN8-003, EDGE-008-003, EDGE-008-004, EDGE-008-005; SC-008-010..013 (SC-008-012 enlace vencido o reutilizado). Dep: T1121
- [ ] T1127 [N2] [GH:#17] Migración de `identity_link_requests` (intento pendiente guardado en servidor: `sub`, `email_verified`, vencimiento 30 min) con paridad SQLite/Postgres — REQ-VIN8-002, INV-VIN8-002; SC-008-010. Dep: T1116
- [ ] T1128 [GH:#17] Implementar el caso de uso de vinculación y el intento pendiente (sin autovinculación silenciosa) — REQ-VIN8-001..003, INV-VIN8-001, INV-VIN8-002; SC-008-009..013. Dep: T1125, T1126, T1127
- [ ] T1129 [GH:#17] Al vincular: revocar sesiones de la cuenta, auditar sin correo ni `sub`, y avisar por correo a la cuenta — REQ-VIN8-004; SC-008-013. Dep: T1128
- [ ] T1130 [GH:#17] Desvincular y último método: pruebas rojas e implementación (`INV-VIN8-003`), definir contraseña desde el perfil con sesión reciente — REQ-VIN8-005, INV-VIN8-003; SC-008-014. Dep: T1128
- [ ] T1131 [GH:#17] UI: mensaje neutro sin error crudo y pantalla de confirmación de vinculación; revisión `/sati` — REQ-VIN8-001, REQ-VIN8-002, NFR-008-002; SC-008-009, SC-008-010. Dep: T1128
- [ ] T1132 [GH:#17] E2E: cuenta con correo y contraseña entra con Google con el mismo correo, abre el enlace y queda vinculada; sin abrirlo, nada cambia — REQ-VIN8-002; SC-008-010, SC-008-011. Dep: T1131
- [ ] T1133 [GOV] [GH:#17] `/trinity`: *pre-hijacking*, CSRF del *callback*, enumeración y tiempos uniformes; pruebas de seguridad en `tests/security/` — REQ-VIN8-001..004, INV-VIN8-001; SC-008-009..013. Dep: T1129
- [ ] T1134 [GOV] [GH:#17] `/rama`: ausencia de correo, `sub` y tokens en logs, auditoría y errores; retención de tokens y limpieza de vencidos — NFR-008-004, REQ-VIN8-004; SC-008-013. Dep: T1129

---

## Bloque C — [GH:#18] Mecanismo de aprobación de registro de nuevos usuarios (P0, `needs-decision`)

**Goal**: estructura de estado `PENDING/ACTIVE/REJECTED` y decisión atómica del administrador; la **regla de quién queda pendiente** se fija con `D8-02`.
**Independent Test**: `SC-008-015..019`. **Bloqueado hasta T1102.**

- [ ] T1135 [ARCH] [N2] [GH:#18] `/architect`: `STATE-ACCT8-001` (`contracts/state-machines/`), esquema de cuenta con `accountStatus`, rutas de aprobación y errores nuevos; compilar tras la decisión — REQ-APR8-001, REQ-APR8-004, STATE-ACCT8-001; SC-008-015..019. Dep: T1102, T1109
- [ ] T1136 [GH:#18] Pruebas rojas de la máquina cerrada (transiciones válidas e inválidas) y de la migración (cuentas existentes `ACTIVE`) — REQ-APR8-001, REQ-APR8-005, STATE-ACCT8-001, EDGE-008-009; SC-008-015, SC-008-019. Dep: T1135
- [ ] T1137 [N2] [GH:#18] Migración `users.account_status` con paridad SQLite/Postgres y filas previas — REQ-APR8-005; SC-008-019. Dep: T1136
- [ ] T1138 [GH:#18] Implementar la máquina en `src/domain/` y el caso de uso de registro con el estado inicial que dicte la política `D8-02` — REQ-APR8-001, REQ-APR8-002, STATE-ACCT8-001; SC-008-015, SC-008-016. Dep: T1137, T1102
- [ ] T1139 [GH:#18] Sesión de cuentas `PENDING`/`REJECTED`: acceso solo a su pantalla de estado; UI «Tu solicitud está en revisión»; revisión `/sati` — REQ-APR8-001, REQ-APR8-002, NFR-008-002; SC-008-016. Dep: T1138
- [ ] T1140 [GH:#18] Aviso al administrador por correo agrupado (máx. 1 por hora) y aviso de resultado al usuario — REQ-APR8-003, REQ-APR8-004; SC-008-017. Dep: T1138, T1119
- [ ] T1141 [GH:#18] Decisión atómica `PENDING → ACTIVE | REJECTED` (compare-and-set), auditada, con revocación de sesiones al rechazar y prueba con dos administradores a la vez — REQ-APR8-004, EDGE-008-010, EDGE-008-011; SC-008-018. Dep: T1138
- [ ] T1142 [GH:#18] E2E del ciclo completo con correo `fake`: solicitud, aviso, aprobación y acceso; solicitud, rechazo y sesión revocada — REQ-APR8-001..004; SC-008-015..018. Dep: T1141, T1139
- [ ] T1143 [GOV] [GH:#18] `/rama` y `/trinity`: datos de solicitantes (retención de `REJECTED`, minimización) y evasión del estado `PENDING` por rutas existentes — REQ-APR8-001, NFR-008-004; SC-008-016. Dep: T1142

---

## Bloque D — [GH:#19] Portal aislado de administración /admin sin afectar la UX de usuarios (P1, `needs-decision`)

**Goal**: portal `/admin` con identidad y sesión independientes, indistinguible de un `404` para quien no sea administrador.
**Independent Test**: `SC-008-020..026`. **Bloqueado hasta T1103.**

- [ ] T1144 [ARCH] [N2] [GH:#19] `/architect`: contrato OpenAPI de `/api/admin/*` (aprobación, parámetros, sesión de administración) con `x-sdd-rbac-action` solo de plataforma y errores nuevos — REQ-ADM8-001..006, INV-ADM8-001; SC-008-020..026. Dep: T1103, T1109
- [ ] T1145 [GH:#19] Pruebas rojas de aislamiento: `/admin` y `/api/admin/*` devuelven el mismo `404` que una ruta inexistente a no administradores (cuerpo, cabeceras, secuencia de puertos) — REQ-ADM8-001, EDGE-008-012; SC-008-020. Dep: T1144
- [ ] T1146 [GH:#19] Pruebas rojas de sesión separada (`argos_admin_session` no abre la API de usuarios ni al revés; expiración propia) y del último administrador — REQ-ADM8-002, REQ-ADM8-006, EDGE-008-014; SC-008-021, SC-008-024. Dep: T1144
- [ ] T1147 [N2] [GH:#19] Migración del modelo de identidad de administración según `D8-03` (rol/tabla de plataforma) con paridad SQLite/Postgres — REQ-ADM8-003, INV-ADM8-001; SC-008-022. Dep: T1146
- [ ] T1148 [HUM] [N2] [GH:#19] Alta del primer administrador de plataforma por el mecanismo de `D8-03` (variable de entorno o Secret Manager; sin interfaz); `/link` prepara la variable, sin `terraform apply` — REQ-ADM8-003, EDGE-008-013; SC-008-022. Dep: T1147
- [ ] T1149 [GH:#19] Implementar el filtro `/admin` (404 uniforme), la autenticación de administración y la sesión separada — REQ-ADM8-001, REQ-ADM8-002; SC-008-020, SC-008-021. Dep: T1145, T1147
- [ ] T1150 [GH:#19] Auditoría de acciones de administración, límite de intentos por IP efectiva y guarda del último administrador — REQ-ADM8-005, REQ-ADM8-006, EDGE-008-014, EDGE-008-015; SC-008-023, SC-008-024. Dep: T1149
- [ ] T1151 [GH:#19] Defensa CSRF de las mutaciones de `/admin` (origen verificado, cookie `Strict` distinta) con pruebas — REQ-ADM8-005, EDGE-008-015; SC-008-025. Dep: T1149
- [ ] T1152 [GH:#19] UI del portal: contenedor `/admin` con bundle propio y lista de pendientes paginada (25) con aprobar/rechazar; ningún enlace desde la aplicación de usuarios; revisión `/sati` — REQ-ADM8-001, REQ-ADM8-004, NFR-008-002, NFR-008-003; SC-008-020, SC-008-026. Dep: T1149, T1141
- [ ] T1153 [GH:#19] Prueba de regresión de la UX de usuarios: el registro y los menús no cambian y nunca ofrecen «Administrador» (inventario por `grep` de «Administrador» en `src/presentation/`) — REQ-ADM8-001, NFR-008-003; SC-008-020. Dep: T1152
- [ ] T1154 [GH:#19] E2E: usuario normal no ve rastro de `/admin`; administrador entra por `/admin` y las dos sesiones no se cruzan — REQ-ADM8-001, REQ-ADM8-002; SC-008-020, SC-008-021. Dep: T1153
- [ ] T1155 [GOV] [GH:#19] `/trinity` y `/sentinels` (IDOR, enumeración de rutas, sesión caducada, CSRF, fuerza bruta) sobre `/admin` — REQ-ADM8-001..006; SC-008-020..026. Dep: T1154

---

## Bloque E — [GH:#20] UI Admin para modificar el límite de fotos por mascota (P2)

**Goal**: editar `album.max_photos_per_pet` desde `/admin` con rango, autoría, concurrencia y caché explícitas.
**Independent Test**: `SC-008-027..031`. Depende del Bloque D.

- [ ] T1156 [ARCH] [GH:#20] `/architect`: contrato de lectura y edición de parámetros (`GET`/`PUT` bajo `/api/admin/parameters`, `If-Match`, `412` reutilizando el código existente de versión o el que fije `T1144`) y catálogo de código con rango de `D8-08` — REQ-PRM8-001..003; SC-008-027..031. Dep: T1144, T1106
- [ ] T1157 [GH:#20] Pruebas rojas: rango (`0`, negativo, decimal, texto, fuera de rango), autoría (`updated_by_user_id`, `updated_at`), concurrencia `412` y caída al defecto de un valor inválido en BD — REQ-PRM8-002, REQ-PRM8-003, EDGE-008-016, EDGE-008-018; SC-008-028, SC-008-030. Dep: T1156
- [ ] T1158 [GH:#20] Implementar el caso de uso de escritura del puerto de parámetros (la lectura con caché de 005 no cambia) y las rutas de `/admin` — REQ-PRM8-001..004; SC-008-027..031. Dep: T1157, T1150
- [ ] T1159 [GH:#20] Prueba de efecto: con tope 12 la undécima y la duodécima foto se aceptan; al bajar por debajo del conteo se conservan las fotos y solo se bloquean subidas nuevas — REQ-PRM8-004, EDGE-008-017; SC-008-029, SC-008-031. Dep: T1158
- [ ] T1160 [GH:#20] UI del editor en `/admin` con valor vigente, defecto, rango, autoría y aviso «Puede tardar hasta 1 minuto en aplicarse»; revisión `/sati` — REQ-PRM8-001, REQ-PRM8-004, NFR-008-002; SC-008-027. Dep: T1158, T1152
- [ ] T1161 [GH:#20] E2E: el administrador cambia 10 a 12, sube fotos y verifica el tope en la aplicación de usuarios — REQ-PRM8-001..004; SC-008-027..031. Dep: T1160
- [ ] T1162 [GOV] [GH:#20] `/oracle`: contraste en disco de rango, autoría y ausencia de claves nuevas creadas desde la interfaz — REQ-PRM8-001, REQ-PRM8-003; SC-008-027, SC-008-028. Dep: T1161

---

## Bloque F — [GH:#53] Indicar el tiempo de renovación de las generaciones de escena (UX independiente)

**Goal**: junto a las generaciones restantes, decir que son mensuales por hogar y cuándo se renuevan.
**Independent Test**: `SC-008-032..034`. Sin dependencia de A..E.

- [ ] T1163 [GH:#53] Pruebas rojas de `scenePendingMessage`/texto de cuota: «Generaciones restantes este mes: R. Se renuevan el [fecha de `quota.resetsAt` en `APP_TIMEZONE`].», sin fecha del reloj del navegador, `pending = 0` y cuota agotada — REQ-UX8-001, EDGE-008-019; SC-008-032, SC-008-033. Dep: T1109
- [ ] T1164 [GH:#53] Implementar el texto en `scene-view.ts` y su uso en `SceneBlock.tsx` (conteo numérico en `aria-label` conservado de 007) — REQ-UX8-001; SC-008-032..034. Dep: T1163
- [ ] T1165 [GH:#53] Actualizar pruebas y E2E del bloque Hogar que esperan «Generaciones restantes: R» literal y revisión `/sati` en 320/1024/1280 px — REQ-UX8-001, NFR-008-002; SC-008-034. Dep: T1164

---

## Bloque G — [GH:#54] Botón de descarga de la escena generada (UX independiente)

**Goal**: botón «Descargar imagen» en el bloque Hogar que guarda `argos-hogar-AAAA-MM-DD.png`.
**Independent Test**: `SC-008-035..038`. Sin dependencia de A..E; **riesgo `EDGE-008-020`**.

- [ ] T1166 [GH:#54] Pruebas rojas de la lógica de nombre de archivo (sin PII) y de visibilidad (solo con imagen vigente) y verificación en Chromium, Firefox y WebKit de si `download` funciona con la redirección `302` firmada — REQ-UX8-002, EDGE-008-020, EDGE-008-021; SC-008-035, SC-008-036. Dep: T1109
- [ ] T1167 [ARCH] [GH:#54] **Condicional** (`EDGE-008-020`): solo si `T1166` demuestra que `download` falla con la redirección, `/architect` define el parámetro de descarga de la ruta de imagen de 006 (cambio MINOR del contrato con `Content-Disposition` en la URL firmada, sin exponer nombres); si no hay evidencia, queda sin ejecutar — REQ-UX8-002; SC-008-037. Dep: T1166
- [ ] T1168 [GH:#54] Implementar el botón en `SceneBlock.tsx` (teclado, `aria-label`, objetivo táctil de 44 px) y, si procede, el soporte del parámetro de descarga — REQ-UX8-002; SC-008-035..037. Dep: T1166, T1167
- [ ] T1169 [GH:#54] E2E Playwright multi-navegador de la descarga y revisión `/sati` — REQ-UX8-002, NFR-008-002; SC-008-038. Dep: T1168

---

## Bloque H — [GH:#55] Identificador de la escena generada en la página de Mascotas (UX independiente)

**Goal**: `figcaption` visible «Mi hogar» bajo la imagen del hogar en Mascotas.
**Independent Test**: `SC-008-039..041`. Sin dependencia de A..E; enmienda `D6-19`.

- [ ] T1170 [GH:#55] Pruebas rojas de `HomeSceneImageView`: rótulo «Mi hogar» visible solo cuando se pinta la imagen (no con 0 hogares, `imageTag = null` ni error de lectura) y sin duplicar el `alt` — REQ-UX8-003, EDGE-008-022; SC-008-039, SC-008-040. Dep: T1109
- [ ] T1171 [GH:#55] Actualizar las pruebas de 006 que exigen «sin textos» (`SC-ESC6-110/111`) y las E2E que lo comprueban (inventario por `grep` en `tests/`) — REQ-UX8-003; SC-008-041. Dep: T1170
- [ ] T1172 [GH:#55] Implementar el `figcaption` en `HomeSceneImage.tsx` y revisión `/sati` (320/1024/1280 px) — REQ-UX8-003, NFR-008-002; SC-008-039..041. Dep: T1170, T1171

---

## Fase final: Cierre transversal

- [ ] T1173 [GOV] `/oracle` y `/seraph`: auditoría en disco de los Bloques A..H (diff, pruebas, aislamiento de `/admin`, E2E multi-navegador, accesibilidad) — NFR-008-002; SC-008-001..041. Dep: T1123, T1132, T1142, T1154, T1161, T1165, T1169, T1172
- [ ] T1174 Compuerta final: `bash scripts/verify-traceability.sh --feature 008`, `bash scripts/verify-oracles.sh`, `npx tsc --noEmit`, `npm run test:gate`; `package.json` según `NFR-008-001` — NFR-008-001; SC-008-042. Dep: T1173
- [ ] T1175 [HUM] Neo: firmas de cierre (`APPROVED`/`LOCKED`, `COMPLETED`, push y merge); ningún agente las ejecuta — SC-008-042. Dep: T1174
- [ ] T1176 [GOV] `/morpheus`: `node scripts/gh-project-sync.mjs sync --tasks specs/008-sso-portal-roles/tasks.md` al abrir y al cerrar cada bloque — SC-008-042. Dep: T1109
