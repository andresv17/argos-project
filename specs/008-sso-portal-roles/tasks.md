# Tasks: SSO con Google, vinculación, biografía, autocompletado de colaboradores, permisos y UX de escena (Feature 008)

**Input**: `specs/008-sso-portal-roles/` (`spec.md`, `plan.md`, `contracts/README.md`); `claude/inbox-feature-008.md`; `claude/decisiones-neo-008-2026-11-20.md`.
**Estado**: `DRAFT` (borrador del Architect, reconciliado el 2026-11-20 con la resolución de Nivel 2 de Neo). Las decisiones `D8-01..D8-14` están resueltas o diferidas (`spec.md`); no queda ninguna decisión de Nivel 2 abierta en 008. El techo de los agentes es `REVIEW`; solo Neo marca `COMPLETED` y fija `APPROVED`/`LOCKED`. **Ninguna tarea está `[x]`.**
**Numeración**: `T1101..T1200` (007 usó hasta `T1077`; no se reutiliza ningún ID). `T1101..T1176` son el borrador original; `T1177..T1200` se añadieron en la reconciliación previa a `/mouse`. **No se renumera nada**: las tareas diferidas conservan su ID en «Diferido a 009» al final de este archivo. Conteo vigente en 008: **64 tareas** con casilla (`[ ]`); **36 tareas** diferidas a 009 (sin casilla).
**Sincronización GitHub Projects**: cada bloque `##` lleva su etiqueta `[GH:#N]` y cada tarea de bloque la repite (el script `gh-project-sync.mjs sync --tasks` la lee del encabezado o de la tarea). Cobertura en 008: `#16` Bloque A, `#17` Bloque B, `#53` Bloque F, `#54` Bloque G, `#55` Bloque H, `#21` Bloque I, `#24` Bloque J, `#25` Bloque K. Los Bloques C (`#18`), D (`#19`) y E (`#20`) están en «Diferido a 009» **sin casilla**, de modo que el script no cuenta esas tareas como abiertas de 008. Los bloques F, G, H, I, J y K son el **lote independiente** (sin dependencia de A y B). Gobernanza y cierre son transversales y no llevan etiqueta.

## Format: `[ID] [P?] [N2|GOV|HUM|ARCH] [GH:#N] Descripción — REQ/SC; Dep: tareas`
- **[P]**: paralelizable. **[N2]**: requiere autorización de Neo (contrato, migración, dependencia, constitución). **[GOV]**: gobernanza o compuerta. **[HUM]**: paso humano de Neo. **[ARCH]**: tarea de `/architect` (contrato o documento normativo; el `/keymaker` no la ejecuta).

## Reglas transversales
- **TDD (constitución IV)**: pruebas rojas antes de implementar; cada tarea de implementación depende de su tarea de pruebas.
- **Dependencias**: ninguna nueva; `jose` 6.2.17 ya instalada y su alcance ampliado a `google-oidc-verify.ts` por la Enmienda constitucional 3.8.0 (`D8-05` = A); `package.json` intacto. Ninguna tarea ejecuta `git push`, `terraform apply` ni despliega.
- **Sin llamadas reales** a Google en CI: Google simulado.
- **Contratos**: ya redactados y compilados por `/architect` en las líneas 002 (3.3.0), 004 (3.4.0) y 006 (3.5.0), commit `86fad83`, con `src/generated/` regenerado; las tareas `[ARCH]` de contratos quedan en `REVIEW` hasta el contraste de `/oracle` (el techo de los agentes). Rojos esperados hasta `/keymaker`: `verify-traceability.sh --feature 002` por los dos códigos de error nuevos, y las pruebas que fijan versiones o conformidad OpenAPI (`contracts-004-*`, `canonical-fixtures*`, `generated-contracts`, `openapi-conformance`).
- **Caso B** (contrato vs implementación): vuelve a `/architect` (`MAX_HOPS = 2`).
- **Nombre del rol de plataforma** (009): `PLATFORM_ADMIN`; nunca se reutiliza el `ADMIN` de hogar.

---

## Fase 1: Decisiones de Neo y compuertas previas (sin código)

- [ ] T1101 [HUM] **Resuelta por Neo (Logos, iter 75)**: `D8-01` = 008 es `#16` (solo Google), `#17`, `#21`, `#24`, `#25`, `#53`, `#54`, `#55`; `#18`, `#19`, `#20` y `T1200` pasan a la 009. Asentada en `claude/decisiones-neo-008-2026-11-20.md`; falta solo la firma de cierre de Neo — REQ-ADM8-001; SC-008-042
- [ ] T1104 [HUM] **Resuelta por Neo**: `D8-04` = C (correo real y registro con correo verificado a 009; solo Google SSO en 008), sin servicio externo ni credencial de correo en 008; falta solo la firma de cierre de Neo — REQ-SSO8-001; SC-008-001
- [ ] T1105 [HUM] **Resuelta por Neo**: `D8-05` = A (`jose` 6.2.17 en `google-oidc-verify.ts`, Enmienda 3.8.0), cookie `argos_oauth` `SameSite=Lax` 900 s aprobada, `D8-14` aprobada; `D8-06` (scope `openid email`) sin pronunciamiento explícito, se mantiene A; falta solo la firma de cierre de Neo — REQ-SSO8-001, REQ-SSO8-004, REQ-VIN8-003; SC-008-001
- [ ] T1106 [HUM] **Resuelta por Neo**: `D8-09` aprobada («Generaciones restantes este mes: R. Se renuevan el [fecha].» y «Mi hogar»); `D8-08` (rango del tope) viaja con `#20` a 009; falta solo la firma de cierre de Neo — REQ-UX8-001, REQ-UX8-003; SC-008-032, SC-008-039
- [ ] T1107 [GOV] `/lock`: EDGE-008-001..022 emitidos y EDGE-008-023..040 (acta `.specify/memory/audits/lock-008-spec.md`) incorporados a `spec.md`; las que implicaban política quedan resueltas por Neo (`D8-14`, `M8-03`) o diferidas a 009 (`D8-02`, `D8-03`); foco en *pre-hijacking*, cookie `Strict` en el *callback* y descarga con redirección firmada — EDGE-008-001..040; SC-008-042. Dep: T1105
- [ ] T1108 [GOV] `/mifune` (poda de capas; acta `.specify/memory/audits/mifune-008-kiss.md`: `M8-01`, `M8-02`, `M8-03` aplicadas) y `/merovingian` (grafo de impacto `merovingian-008-impacto.md`: constitución Principio VI y Stack de autenticación, línea 002 de contratos, `D6-19`/`SC-ESC6-110/111` de 006, `AuditEntityType`) — NFR-008-001; SC-008-042. Dep: T1101
- [ ] T1109 [GOV] `/mouse`: compuerta estructural única (1:1 spec-tareas, 0 etiquetas huérfanas, contratos completos); **R3 tras esta reconciliación** (alcance reducido a 008 = 64 tareas; Bloques C, D, E en «Diferido a 009») — todos los REQ de 008; SC-008-001..006, SC-008-009..014, SC-008-032..062. Dep: T1107, T1108

**Checkpoint**: tras `T1109` (R3) el lote de UX (F, G, H) y los Bloques I, J y K pueden empezar; A y B no esperan decisiones de Neo (solo `T1124`, credenciales por `/link`).

---

## Bloque A — [GH:#16] Single Sign-On con Google (P0; solo Google, el registro con correo pasa a 009)

**Goal**: acceso con Google (OIDC + PKCE), primer acceso con elección de `username`, estado del flujo en servidor con cookie `argos_oauth` (`Lax`, 900 s).
**Independent Test**: `SC-008-001..006`, `SC-008-061`, `SC-008-062`.

- [ ] T1110 [ARCH] [N2] [GH:#16] `/architect`: contratos HTTP en las líneas 002 (openapi 3.3.0, identity 3.1.0, error-catalog 3.2.0) y 004 (3.4.0, 3.2.0, 3.2.0): `startGoogleLogin`, `completeGoogleLogin`, `chooseGoogleUsername`, `startGoogleLink`, `GoogleChooseUsernameInput`, `GoogleLinkStartInput`, `GoogleAuthorizationView`, `AuthMethods` y los códigos `ERR-AUTH-GOOGLE-FAILED` y `ERR-AUTH-GOOGLE-LINK-CONFLICT` (`additionalProperties: false`); **redactados y compilados en `86fad83` (REVIEW, pendiente de `/oracle`)**; sin rutas de registro con correo ni de verificación (009) — REQ-SSO8-001, REQ-SSO8-003..005, REQ-VIN8-002; SC-008-001..006. Dep: T1105, T1109
- [ ] T1111 [ARCH] [N2] [GH:#16] `/architect`: Enmienda constitucional MINOR 3.7.0 -> 3.8.0 (Stack de autenticación: cookie `argos_oauth` `SameSite=Lax` `Max-Age` 900 s con solo un identificador opaco y *callback* `200`; `jose` 6.2.17 extendida a `google-oidc-verify.ts`; sin servicio de correo): **aplicada en `c8e59e7` (borrador, sin `APPROVED` ni `LOCKED`)**; el *callback* se sirve con CSP de página sin script en línea (H-8-03) — REQ-SSO8-001, REQ-SSO8-004, NFR-008-001, ADR-008-03; SC-008-005. Dep: T1105
- [ ] T1112 [GH:#16] Pruebas rojas de las funciones puras del identificador opaco de un solo uso del estado del flujo (generar 32 bytes `base64url`, SHA-256, vencimiento a 900 s, un solo uso por compare-and-set, comparación a tiempo constante) — REQ-SSO8-004; SC-008-005. Dep: T1109
- [ ] T1113 [GH:#16] Implementar `src/domain/auth/one-time-token.ts` (puro, sin `Date` ni `crypto` directo: el reloj y la entropía entran por puertos, Principio II) — REQ-SSO8-004; SC-008-005. Dep: T1112
- [ ] T1114 [GH:#16] Pruebas rojas de verificación del `id_token` con llaves y Google simulados: `iss`, `aud`, `exp`, `nonce`, `email_verified`, `sub`, `state` reutilizado y PKCE — REQ-SSO8-001, EDGE-008-001, EDGE-008-002, ADR-008-01; SC-008-001, SC-008-004. Dep: T1110, T1111
- [ ] T1115 [GH:#16] Implementar el verificador y el cliente del *token endpoint* en `src/infrastructure/http/` con `jose` 6.2.17 en `google-oidc-verify.ts` (`D8-05` = A, Enmienda 3.8.0; el archivo lleva `@implements`; no se importa desde `domain/` ni `application/`) — REQ-SSO8-001; SC-008-001. Dep: T1114, T1111
- [ ] T1116 [N2] [GH:#16] Migración: `auth_identities`, `users.email_verified_at`, estado intermedio del flujo (identificador opaco, `state`, `nonce`, verificador PKCE, `expires_at`, intención `LOGIN`/`LINK` y `user_id` de la sesión que inicia la vinculación) y el mecanismo para «liberar» el correo de la cuenta sin verificar (`D8-14`); SQLite y Postgres con prueba de paridad primero y filas previas (toda cuenta antigua con correo conserva `email_verified_at = NULL`, `EDGE-008-036`); el borrado de cuenta elimina `auth_identities` y estados del usuario también en SQLite (H-8-04) — REQ-SSO8-001, REQ-SSO8-003, REQ-VIN8-003, EDGE-008-023, EDGE-008-036; SC-008-001, SC-008-003, SC-008-012. Dep: T1110
- [ ] T1117 [GH:#16] Repositorios SQLite/Postgres y mapeadores; correo, `sub` y tokens fuera de logs y de `detail`/`instance` RFC 9457 (regresión) — REQ-SSO8-001, NFR-008-004; SC-008-001. Dep: T1116
- [ ] T1120 [GH:#16] Pruebas rojas de casos de uso: iniciar y completar Google, primer acceso con elección de `username`, cancelación, fallo uniforme, límite de tasa de `/auth/google/*` y cuenta nacida sin contraseña — REQ-SSO8-001, REQ-SSO8-003, REQ-SSO8-004, REQ-SSO8-005, EDGE-008-007, EDGE-008-027, EDGE-008-030; SC-008-001..006, SC-008-061, SC-008-062. Dep: T1113, T1115, T1117
- [ ] T1121 [GH:#16] Implementar casos de uso y rutas (cookie `argos_oauth` de vida corta; *callback* `200` que establece la sesión `Strict` y navega a `/`) — REQ-SSO8-001, REQ-SSO8-003..005, ADR-008-03; SC-008-001..006, SC-008-061, SC-008-062; la vinculación usa `origin_session_hash` (`startGoogleLink(userId, sessionToken, input)`, ADR-008-03) y el *callback* LINK no emite `Set-Cookie`; EDGE-008-050; SC-008-063. Dep: T1120
- [ ] T1122 [GH:#16] UI: pantalla de acceso con «Continuar con Google» y elección de `username`; **aviso informativo en el perfil cuando `authMethods.hasPassword` es `false` en lugar de pedir una contraseña inexistente para eliminar la cuenta (`DEUDA-008-GOOGLE-ACCOUNT-DELETE`, `REQ-ACC-002`)**; revisión `/sati` (320/1024/1280 px, WCAG 2.1 AA) — REQ-SSO8-003, REQ-ACC-002, NFR-008-002; SC-008-002. Dep: T1121
- [ ] T1123 [GH:#16] E2E Playwright (Chromium, Firefox, WebKit) con Google simulado: flujo feliz, cancelación, `state` reutilizado y sesión tras el *callback* con cookie `Strict` — REQ-SSO8-004, EDGE-008-006; SC-008-001..006 (SC-008-006 cookie `Strict` en el *callback*). Dep: T1122
- [ ] T1124 [N2] [GH:#16] `/link`: credenciales de OAuth de Google en Secret Manager y variables de Terraform (sin `terraform apply`, sin credenciales de correo); URI de redirección fija por entorno — REQ-SSO8-007; SC-008-001. Dep: T1105

---

## Bloque B — [GH:#17] Vinculación segura de Google a una cuenta existente (P0; desde la sesión activa, sin correo)

**Goal**: nunca mostrar «este correo ya existe»; vincular Google solo desde la sesión activa con la contraseña actual (`M8-02`); la cuenta sin correo verificado no reclama el correo (`D8-14`).
**Independent Test**: `SC-008-009..014`.

- [ ] T1125 [GH:#17] Pruebas rojas de fallo uniforme: Google con correo de cuenta existente, cuenta con correo sin verificar, dos cuentas con el mismo correo sin verificar y correo titular verificado de otra cuenta producen la regla de `D8-14` o `ERR-AUTH-GOOGLE-FAILED` con el mismo estado, cuerpo y coste — REQ-VIN8-001, INV-VIN8-001; SC-008-009, SC-008-012. Dep: T1121
- [ ] T1126 [GH:#17] Pruebas rojas de vinculación: `startGoogleLink` con contraseña actual correcta e incorrecta (`ERR-AUTH-INVALID-CREDENTIALS`, contador de intentos), sin sesión, cuenta sin contraseña, `sub` ya vinculado a otra cuenta y cuenta con Google ya vinculado (`ERR-AUTH-GOOGLE-LINK-CONFLICT`), *pre-hijacking* (cuenta sin verificar no reclama el correo y Google verificado lo libera), y prueba negativa de que un `sub` nuevo con el correo de una cuenta existente no crea filas de `auth_identities` en ella — REQ-VIN8-002, REQ-VIN8-003, INV-VIN8-001, INV-VIN8-002, INV-VIN8-003, INV-VIN8-005, EDGE-008-003, EDGE-008-004, EDGE-008-023, ADR-008-02; SC-008-010..012, SC-008-014.; **Opción A (sesión de origen)**: origen revocada, vencida (inactividad y tope) o de otro usuario => `400` uniforme sin vincular; con origen vigente: vincula, conserva la de origen, sin `Set-Cookie` ni token; `CHECK` de `origin_session_hash` en `LINK`; títulos con [REQ-VIN8-004] [INV-VIN8-005] — EDGE-008-050; SC-008-063. Dep: T1121
- [ ] T1128 [GH:#17] Implementar los casos de uso `startGoogleLink` y la rama de vinculación del *callback* (intención `LINK` guardada en servidor; sin autovinculación silenciosa) y la regla de titularidad de correo de `D8-14` — REQ-VIN8-001..003, INV-VIN8-001..003, INV-VIN8-005; SC-008-009..012, SC-008-014. Dep: T1125, T1126
- [ ] T1129 [GH:#17] Al vincular: revocar las demás sesiones de la cuenta, auditar como `USER` / `UPDATE` con detalle opaco sin correo ni `sub` (sin `AuditEntityType` nuevo, H-8-06) — REQ-VIN8-004; SC-008-013. Dep: T1128
- [ ] T1131 [GH:#17] UI: «Vincular Google» en el perfil con campo de contraseña actual, estado «Google vinculado» (desde `AuthMethods`) y mensaje neutro sin error crudo; revisión `/sati` — REQ-VIN8-001, REQ-VIN8-002, NFR-008-002; SC-008-009, SC-008-010. Dep: T1128
- [ ] T1132 [GH:#17] E2E: cuenta con usuario y contraseña inicia sesión, pulsa «Vincular Google», escribe la contraseña actual y queda vinculada; con contraseña incorrecta nada cambia — REQ-VIN8-002; SC-008-010, SC-008-011. Dep: T1131
- [ ] T1133 [GOV] [GH:#17] `/trinity`: *pre-hijacking*, CSRF del *callback* y de `startGoogleLink`, enumeración y tiempos uniformes; pruebas de seguridad en `tests/security/` — REQ-VIN8-001..004, INV-VIN8-001; SC-008-009..013. Dep: T1129
- [ ] T1134 [GOV] [GH:#17] `/rama`: ausencia de correo, `sub` y tokens en logs, auditoría y errores (incluida la query `code`/`state` del *callback*); retención y limpieza del estado de flujo vencido; borrado de cuenta limpia `auth_identities` — NFR-008-004, REQ-VIN8-004; SC-008-013. Dep: T1129

---

## Bloque F — [GH:#53] Indicar el tiempo de renovación de las generaciones de escena (UX independiente)

**Goal**: junto a las generaciones restantes, decir que son mensuales por hogar y cuándo se renuevan; la cuota agotada también muestra la fecha (H-OR-F-2).
**Independent Test**: `SC-008-032..034`. Sin dependencia de A y B.

- [ ] T1163 [GH:#53] Pruebas rojas de `scenePendingMessage`/texto de cuota: «Generaciones restantes este mes: R. Se renuevan el [fecha de `quota.resetsAt` en `APP_TIMEZONE`].», sin fecha del reloj del navegador, `pending = 0` y cuota agotada con la fecha de renovación también en el motivo del botón (H-OR-F-2, resuelto en `fb750b6`) — REQ-UX8-001, EDGE-008-019; SC-008-032, SC-008-033. Dep: T1109
- [ ] T1164 [GH:#53] Implementar el texto en `scene-view.ts` y su uso en `SceneBlock.tsx` (conteo numérico en `aria-label` conservado de 007) — REQ-UX8-001, ADR-008-08; SC-008-032..034. Dep: T1163
- [ ] T1165 [GH:#53] Actualizar pruebas y E2E del bloque Hogar que esperan «Generaciones restantes: R» literal y revisión `/sati` en 320/1024/1280 px — REQ-UX8-001, NFR-008-002; SC-008-034. Dep: T1164

---

## Bloque G — [GH:#54] Botón de descarga de la escena generada (UX independiente)

**Goal**: botón «Descargar imagen» en el bloque Hogar que guarda `argos-hogar-AAAA-MM-DD.png`.
**Independent Test**: `SC-008-035..038`. Sin dependencia de A y B; `EDGE-008-020` confirmado y resuelto por contrato.

- [ ] T1166 [GH:#54] Pruebas rojas de la lógica de nombre de archivo (sin PII) y de visibilidad (solo con imagen vigente) y verificación en Chromium, Firefox y WebKit de si `download` funciona con la redirección `302` firmada — REQ-UX8-002, EDGE-008-020, EDGE-008-021; SC-008-035, SC-008-036. Dep: T1109
- [ ] T1167 [ARCH] [GH:#54] `/architect`: parámetro de descarga de la ruta de imagen de 006 (`download=1`, MINOR 3.5.0 de `home-scene.openapi.yaml`: URL firmada V4 con `response-content-disposition` `attachment` y `filename` fijo `argos-hogar-AAAA-MM-DD.png`, sin nombres de mascota ni de hogar; con driver sin URL firmada, `200` con `Content-Disposition: attachment`); **redactado y compilado en `86fad83` (REVIEW, pendiente de `/oracle`)**, ya no es condicional: `T1166` confirmó en Chromium que `download` falla con la redirección (Caso B del Keymaker) — REQ-UX8-002, EDGE-008-020; SC-008-037. Dep: T1166
- [ ] T1168 [GH:#54] Implementar el botón en `SceneBlock.tsx` (teclado, `aria-label`, objetivo táctil de 44 px) que pide la imagen con `download=1` y el soporte de `download=1` en las dos rutas de imagen de escena (URL firmada con `Content-Disposition: attachment`; `200` con cuerpo si el driver no firma) — REQ-UX8-002, EDGE-008-021, ADR-008-09; SC-008-035..037. Dep: T1166, T1167
- [ ] T1169 [GH:#54] E2E Playwright multi-navegador de la descarga y revisión `/sati` — REQ-UX8-002, NFR-008-002; SC-008-038. Dep: T1168

---

## Bloque H — [GH:#55] Identificador de la escena generada en la página de Mascotas (UX independiente)

**Goal**: `figcaption` visible «Mi hogar» bajo la imagen del hogar en Mascotas.
**Independent Test**: `SC-008-039..041`. Sin dependencia de A..E; enmienda `D6-19`.

- [ ] T1170 [GH:#55] Pruebas rojas de `HomeSceneImageView`: rótulo «Mi hogar» visible solo cuando se pinta la imagen (no con 0 hogares, `imageTag = null` ni error de lectura) y sin duplicar el `alt` — REQ-UX8-003, EDGE-008-022; SC-008-039, SC-008-040. Dep: T1109
- [ ] T1171 [GH:#55] Actualizar las pruebas de 006 que exigen «sin textos» (`SC-ESC6-110/111`) y las E2E que lo comprueban (inventario por `grep` en `tests/`) — REQ-UX8-003; SC-008-041. Dep: T1170
- [ ] T1172 [GH:#55] Implementar el `figcaption` en `HomeSceneImage.tsx` y revisión `/sati` (320/1024/1280 px) — REQ-UX8-003, NFR-008-002, ADR-008-10; SC-008-039..041. Dep: T1170, T1171

---

## Bloque I — [GH:#21] Biografía / descripción de la mascota (P2; `D8-12` = A, solo perfil)

**Goal**: campo `biography` en el perfil de la mascota; **no** entra en el prompt de escena (`D8-12` = A, decidida por Neo).
**Independent Test**: `SC-008-043..047`. Sin dependencia de A y B.

- [ ] T1177 [HUM] [GH:#21] **Resuelta por Neo**: `D8-12` = A (biografía solo en el perfil y en persistencia/respaldo; no entra en payload ni prompt; `INV-ESC6-010/017` intactas), 280 caracteres como propuesta y la edita quien edita los datos básicos; asentada en `claude/decisiones-neo-008-2026-11-20.md`; falta solo la firma de cierre de Neo — REQ-BIO8-001, REQ-BIO8-003; SC-008-043, SC-008-045. Dep: T1109
- [ ] T1178 [ARCH] [N2] [GH:#21] `/architect`: contratos del campo `biography` (`Biography`, `PetProfile.biography` y `UpdatePetInput.biography` en `pet.schema.json` 3.2.0 de 002 y 004; `BackupPetProfileV33` y `BackupEnvelopeV33` en `backup-envelope.schema.json` 3.3.0; `exportBackup` responde `BackupEnvelopeV33`; sin cambiar `ScenePayload` de 006); **redactados y compilados en `86fad83` (REVIEW, pendiente de `/oracle`)**; el respaldo no recrea vínculos de Google ni estados de aprobación — REQ-BIO8-001, REQ-BIO8-004; SC-008-043, SC-008-047. Dep: T1177
- [ ] T1179 [GH:#21] Pruebas rojas: validación (0..280, recorte, caracteres de control, vacío = `null`), permiso de edición (propietario y `ADMIN` sí; Cuidador y Lector no), y respaldo 3.3.0 con el campo y respaldos anteriores sin él (`null`), sin vínculos de Google en el respaldo — REQ-BIO8-001, REQ-BIO8-004, EDGE-008-041, EDGE-008-043; SC-008-043, SC-008-044, SC-008-047. Dep: T1178
- [ ] T1180 [N2] [GH:#21] Migración `pets.biography` anulable con paridad SQLite/Postgres y filas previas en `NULL`; ajuste del respaldo — REQ-BIO8-004; SC-008-047. Dep: T1179
- [ ] T1181 [GH:#21] Implementar dominio, caso de uso `updatePetBiography`, repositorios y ruta; sin escribir la biografía en logs, `detail`/`instance` ni auditoría (solo huella) — REQ-BIO8-001, REQ-BIO8-002, EDGE-008-042; SC-008-043, SC-008-046. Dep: T1180
- [ ] T1182 [GH:#21] Prueba de regresión de no fuga: con y sin biografía el payload de escena, `buildImagePrompt` y la huella (`REQ-ESC6-004`) son idénticos (`pets[].biography` = `null`); el resumen compartido con el veterinario no la contiene — REQ-BIO8-002, REQ-BIO8-003, INV-ESC6-010, INV-ESC6-017, EDGE-008-042, ADR-008-11; SC-008-045, SC-008-046. Dep: T1181
- [ ] T1183 [GH:#21] UI: campo en la ficha y la edición de la mascota con contador de caracteres, texto plano en la lectura y sin campo para Cuidador y Lector; revisión `/sati` (320/1024/1280 px, WCAG 2.1 AA) — REQ-BIO8-001, REQ-BIO8-002, NFR-008-002; SC-008-043, SC-008-044. Dep: T1181
- [ ] T1184 [GH:#21] E2E Playwright: propietario guarda y ve la biografía, un Lector la ve sin poder editarla, y la escena no cambia por ella — REQ-BIO8-001..003; SC-008-043..046. Dep: T1183, T1182
- [ ] T1185 [GOV] [GH:#21] `/rama` y `/trinity`: texto libre con posible PII (XSS al mostrarla, logs, respaldo, resumen veterinario) y, solo si `D8-12` = B, dictamen previo sobre el envío al proveedor de IA — REQ-BIO8-002, REQ-BIO8-003, NFR-008-004; SC-008-045, SC-008-046. Dep: T1184

---

## Bloque J — [GH:#24] Autocompletado de búsqueda de colaboradores (P2; `D8-10` = A, solo `username`)

**Goal**: sugerencias mientras se escribe al invitar a un hogar, con defensas contra la enumeración de usuarios.
**Independent Test**: `SC-008-048..055`. Sin dependencia de A y B.

- [ ] T1186 [HUM] [GH:#24] **Resuelta por Neo**: `D8-10` = A (solo prefijo de `username` >= 3 caracteres; `REQ-HOUSE2-001` intacta) y `D8-11` = «No se encontraron usuarios disponibles para invitar.»; asentada en `claude/decisiones-neo-008-2026-11-20.md`; falta solo la firma de cierre de Neo — REQ-INV8-001, REQ-INV8-005; SC-008-053, SC-008-054. Dep: T1109
- [ ] T1187 [ARCH] [N2] [GH:#24] `/architect`: contrato de la ruta de búsqueda (`GET /households/{householdId}/invitees?q=`, `searchInvitees`; autenticada, acción `MANAGE_HOUSEHOLD_MEMBERS`, `InviteeSearchPrefix` mínimo 3 caracteres, `InviteeSearchResult` cerrado con hasta 5 `username`, `ERR-RATE-LIMITED`) en 002 (3.3.0) y 004 (3.4.0); **redactado y compilado en `86fad83` (REVIEW, pendiente de `/oracle`)**; sin enmienda de `REQ-HOUSE2-001` — REQ-INV8-001, REQ-INV8-003, INV-INV8-001; SC-008-048..052. Dep: T1186
- [ ] T1188 [GH:#24] Pruebas rojas: menos de 3 caracteres sin consulta (`422`), prefijo sin distinguir mayúsculas, máximo 5, exclusiones (invitador, miembros, ya invitados), forma, estado y tiempo uniformes con y sin resultados, límite de tasa por usuario e IP efectiva, y consulta fuera de logs y de auditoría — REQ-INV8-001, REQ-INV8-003, REQ-INV8-004, INV-INV8-001, EDGE-008-044, EDGE-008-046; SC-008-048..052. Dep: T1187
- [ ] T1190 [GH:#24] Implementar el caso de uso `searchInvitees`, el límite de tasa y la ruta (el mismo trabajo y coste para todos los casos, `INV-INV8-001`) — REQ-INV8-001, REQ-INV8-003, REQ-INV8-004, INV-INV8-001, ADR-008-12; SC-008-048..053. Dep: T1188
- [ ] T1191 [GH:#24] UI: combobox accesible (rol `combobox` y `listbox`, teclado, anuncio de resultados, espera de 300 ms, descarte de respuestas obsoletas), mensaje fijo «No se encontraron usuarios disponibles para invitar.» (`D8-11`); revisión `/sati` (320/1024/1280 px, WCAG 2.1 AA) — REQ-INV8-005, NFR-008-002, EDGE-008-047; SC-008-054. Dep: T1190
- [ ] T1192 [GH:#24] E2E Playwright (Chromium, Firefox, WebKit): escribir 2 y 3 caracteres, elegir una sugerencia con teclado, sin coincidencias y límite de tasa — REQ-INV8-001, REQ-INV8-005; SC-008-049, SC-008-054, SC-008-055. Dep: T1191
- [ ] T1193 [GOV] [GH:#24] `/trinity`, `/sentinels` y `/rama`: enumeración de usuarios, tiempos uniformes, fuerza bruta de la ruta, y ausencia de la consulta y de los resultados en registros — REQ-INV8-003, INV-INV8-001, NFR-008-004, EDGE-008-044; SC-008-050..052. Dep: T1192

---

## Bloque K — [GH:#25] Permisos Cuidador vs Lector y aviso de hogar para el enlace veterinario (P1; textos aprobados, `D8-13`)

**Goal**: comunicar en la interfaz qué puede hacer cada rol y que varias mascotas en un mismo enlace requieren un hogar; sin cambiar reglas.
**Independent Test**: `SC-008-056..060`. Sin dependencia de A y B.

- [ ] T1194 [HUM] [GH:#25] **Resuelta por Neo**: `D8-13` aprobada (frases de Cuidador y Lector y aviso de hogar tal como están en `REQ-ROL8-001/002`); falta solo la firma de cierre de Neo — REQ-ROL8-001, REQ-ROL8-002; SC-008-056, SC-008-057. Dep: T1109
- [ ] T1195 [ARCH] [GH:#25] `/architect`: catálogo cerrado de textos de ayuda por rol derivado de la matriz `REQ-RBAC-001` y texto del aviso de hogar (según `REQ-VET-001/002`), con la lista de acciones de `can()` que cada frase menciona; sin contrato nuevo ni cambio de reglas — REQ-ROL8-001, REQ-ROL8-002, REQ-ROL8-003; SC-008-056, SC-008-057. Dep: T1194
- [ ] T1196 [GH:#25] Pruebas rojas: la frase de cada rol coincide con lo que `can(rol, acción)` permite y niega (falla si la matriz cambia), el aviso aparece solo para quien puede crear enlaces y no aparece para Cuidador ni Lector, y el aviso no promete mascotas ajenas — REQ-ROL8-001..003, EDGE-008-048, EDGE-008-049, ADR-008-13; SC-008-056..058. Dep: T1195
- [ ] T1197 [GH:#25] Implementar la ayuda de rol en el selector de invitación y en la lista de miembros, y el aviso en el diálogo de crear enlace; revisión `/sati` (320/1024/1280 px, WCAG 2.1 AA, texto asociado con `aria-describedby`) — REQ-ROL8-001, REQ-ROL8-002, NFR-008-002; SC-008-056..059. Dep: T1196
- [ ] T1198 [GH:#25] E2E Playwright con tres contextos (propietario, Cuidador, Lector): la ayuda de rol, el aviso visible solo al propietario y el aviso ausente para Cuidador y Lector — REQ-ROL8-001, REQ-ROL8-002; SC-008-058..060. Dep: T1197
- [ ] T1199 [GOV] [GH:#25] `/oracle`: contraste en disco de las frases con `REQ-RBAC-001` y `REQ-VET-001/002`, y ausencia de cambios en `can()` y en el contrato de 005 — REQ-ROL8-003; SC-008-057, SC-008-059. Dep: T1198

---

## Fase final: Cierre transversal

- [ ] T1173 [GOV] `/oracle` y `/seraph`: auditoría en disco de los Bloques A, B, F, G, H, I, J y K (diff, pruebas, E2E multi-navegador, accesibilidad) — NFR-008-002; SC-008-001..006, SC-008-009..014, SC-008-032..062. Dep: T1123, T1132, T1165, T1169, T1172, T1185, T1193, T1199
- [ ] T1174 Compuerta final: `bash scripts/verify-traceability.sh --feature 008`, `bash scripts/verify-oracles.sh`, `npx tsc --noEmit`, `npm run test:gate`; `package.json` según `NFR-008-001` — NFR-008-001; SC-008-042. Dep: T1173
- [ ] T1175 [HUM] Neo: firmas de cierre (`APPROVED`/`LOCKED`, `COMPLETED`, push y merge); ningún agente las ejecuta — SC-008-042. Dep: T1174
- [ ] T1176 [GOV] `/morpheus`: `node scripts/gh-project-sync.mjs sync --tasks specs/008-sso-portal-roles/tasks.md` al abrir y al cerrar cada bloque — SC-008-042. Dep: T1109

---

## Diferido a 009

> Resolución de Neo del 2026-11-20 (`D8-01`): estas tareas **salen de 008 y pasan a la Feature 009** sin cambiar de ID y sin borrarse. Se listan **sin casilla** (`- Txxxx`) para que no cuenten como tareas abiertas de 008 en `gh-project-sync.mjs`; la 009 las recupera con su casilla. Mantienen sus etiquetas `[GH:#N]`. Los requisitos, edge cases y decisiones que arrastran están en «Diferido a 009» de `spec.md`.

### Decisiones y correo real (de los Bloques A y B)
- T1102 [HUM] Neo decide `D8-02` (política de aprobación y sub-decisiones: plazo, reintento tras rechazo, caducidad, destinatarios del aviso) — REQ-APR8-002, REQ-APR8-003, REQ-APR8-004; SC-008-015..019
- T1103 [HUM] Neo decide `D8-03` y `D8-07` (identidad del administrador de plataforma, MFA, primer administrador, sesión) — REQ-ADM8-002, REQ-ADM8-003; SC-008-020..026
- T1118 [GH:#16] Pruebas rojas de `EmailSenderPort` y del adaptador `fake` (plantillas cerradas, sin PII de mascotas, destinatario) y de la configuración `ARGOS_EMAIL_DRIVER` (no arranca en producción con `fake`) — REQ-SSO8-006; SC-008-007. Dep: T1104, T1109
- T1119 [GH:#16] Implementar `EmailSenderPort` (`application/`), adaptador `fake` y adaptador real según `D8-04` (`infrastructure/`), y lectura solo desde `app-config.ts` — REQ-SSO8-006, ADR-008-04; SC-008-007. Dep: T1118
- T1127 [N2] [GH:#17] Migración de `identity_link_requests` (intento pendiente guardado en servidor: `sub`, `email_verified`, vencimiento 30 min) con paridad SQLite/Postgres — REQ-VIN8-002, INV-VIN8-002; SC-008-010. Dep: T1116
- DEUDA-008-GOOGLE-LINK-2STEP [GH:#17] Vinculación de Google en dos pasos (alternativa C del dictamen `architect-008-A2-link-sesion.md`): fase `CONFIRM` en el estado del flujo, operación `POST /auth/google/link/confirm` (MINOR de 004), pantalla de la SPA y pruebas; hereda `origin_session_hash` de la Opción A. **Diferida a 009, sin casilla.** Riesgo residual aceptado por Neo en 008: quien robe `argos_oauth` y tenga su propia cuenta de Google puede vincular su `sub` a la cuenta de la víctima mientras la sesión de origen siga activa (la Opción A no prueba posesión de la sesión porque `Strict` impide la cookie en el *callback*); mitigado por uso único, 900 s, `HttpOnly` y exigir sesión más contraseña actual para emitir el estado — REQ-VIN8-002, INV-VIN8-005, EDGE-008-050; SC-008-063. Dep: T1121
- DEUDA-008-GOOGLE-ACCOUNT-DELETE [GH:#17] Eliminar la cuenta nacida con Google (sin contraseña): **cierre obligatorio en 009 vía `T1130`** antes de abrir la 009 a usuarios reales. En 008 (alcance de `T1122`, UI del perfil): si `authMethods.hasPassword` es `false`, mostrar un aviso informativo en lugar de pedir una contraseña inexistente; hasta el cierre la supresión se atiende por soporte manual conforme a la Ley 1581 de 2012 — REQ-ACC-002, REQ-VIN8-005; SC-008-014. Dep: T1130
- T1130 [GH:#17] Desvincular y último método: pruebas rojas e implementación (`INV-VIN8-003`), definir contraseña desde el perfil con sesión reciente — REQ-VIN8-005, INV-VIN8-003; SC-008-014. Dep: T1128

### Bloque C — [GH:#18] Mecanismo de aprobación de registro de nuevos usuarios (diferido; `D8-02`)

- T1135 [ARCH] [N2] [GH:#18] `/architect`: `STATE-ACCT8-001` (`contracts/state-machines/`), esquema de cuenta con `accountStatus`, rutas de aprobación y errores nuevos; compilar tras la decisión — REQ-APR8-001, REQ-APR8-004, STATE-ACCT8-001; SC-008-015..019. Dep: T1102, T1109, T1200
- T1136 [GH:#18] Pruebas rojas de la máquina cerrada (transiciones válidas e inválidas) y de la migración (cuentas existentes `ACTIVE`, correos heredados sin verificar) — REQ-APR8-001, REQ-APR8-005, STATE-ACCT8-001, EDGE-008-009; SC-008-015, SC-008-019. Dep: T1135
- T1137 [N2] [GH:#18] Migración `users.account_status` con paridad SQLite/Postgres y filas previas — REQ-APR8-005; SC-008-019. Dep: T1136
- T1138 [GH:#18] Implementar la máquina en `src/domain/` y el caso de uso de registro con el estado inicial que dicte la política `D8-02` — REQ-APR8-001, REQ-APR8-002, STATE-ACCT8-001, ADR-008-05; SC-008-015, SC-008-016. Dep: T1137, T1102, T1200
- T1139 [GH:#18] Sesión de cuentas `PENDING`/`REJECTED`: acceso solo a su pantalla de estado; UI «Tu solicitud está en revisión»; revisión `/sati` — REQ-APR8-001, REQ-APR8-002, NFR-008-002; SC-008-016. Dep: T1138
- T1140 [GH:#18] Aviso al administrador por correo agrupado (máx. 1 por hora) y aviso de resultado al usuario — REQ-APR8-003, REQ-APR8-004; SC-008-017. Dep: T1138, T1119
- T1141 [GH:#18] Decisión atómica `PENDING → ACTIVE | REJECTED` (compare-and-set), auditada, con revocación de sesiones al rechazar y prueba con dos administradores a la vez — REQ-APR8-004, EDGE-008-010, EDGE-008-011; SC-008-018. Dep: T1138
- T1142 [GH:#18] E2E del ciclo completo con correo `fake`: solicitud, aviso, aprobación y acceso; solicitud, rechazo y sesión revocada — REQ-APR8-001..004; SC-008-015..018. Dep: T1141, T1139
- T1143 [GOV] [GH:#18] `/rama` y `/trinity`: datos de solicitantes (retención de `REJECTED`, minimización) y evasión del estado `PENDING` por rutas existentes — REQ-APR8-001, NFR-008-004; SC-008-016. Dep: T1142
- T1200 [ARCH] [N2] [GH:#18] `/architect`: enmienda de `STATE-AUTH-SESSION-001` (`auth-session.machine.json` de 004 v3.1.0 y 002: guardas de `REGISTER_SUCCESS` y `LOGIN_SUCCESS`) **si** `D8-02` deja las cuentas nuevas `PENDING` (`A`, `C` o `D`); no decide la política: redacta la enmienda para la opción que fije Neo y la deja sin efecto si es `E`. Incluye el inventario de pruebas afectadas por el registro sin sesión útil (≈18 archivos con `auth/register`, p. ej. `tests/integration/api/auth.api.spec.ts`, `tests/e2e/visual/e2e-support.ts`, `openapi-conformance.spec.ts`) para planificar la migración del arnés antes de `T1138` (`merovingian-008-impacto.md`, H-8-02) — REQ-APR8-001, REQ-APR8-002, STATE-ACCT8-001, STATE-AUTH-SESSION-001; SC-008-015, SC-008-016. Dep: T1102, T1109

### Bloque D — [GH:#19] Portal aislado de administración /admin (diferido; `D8-03`, `D8-07`)

- T1144 [ARCH] [N2] [GH:#19] `/architect`: contrato OpenAPI de `/api/admin/*` (aprobación, parámetros, sesión de administración) con `x-sdd-rbac-action` solo de plataforma y errores nuevos — REQ-ADM8-001..006, INV-ADM8-001; SC-008-020..026. Dep: T1103, T1109
- T1145 [GH:#19] Pruebas rojas de aislamiento: `/api/admin/*` y toda ruta del portal distinta de su pantalla de acceso devuelven el mismo `404` que una ruta inexistente a quien no tiene sesión de administrador (cuerpo, cabeceras, secuencia de puertos); `GET /admin` sirve la pantalla de acceso a anónimos — REQ-ADM8-001, EDGE-008-012, EDGE-008-035; SC-008-020. Dep: T1144
- T1146 [GH:#19] Pruebas rojas de sesión separada (`argos_admin_session` no abre la API de usuarios ni al revés; expiración propia) y del último administrador — REQ-ADM8-002, REQ-ADM8-006, EDGE-008-014; SC-008-021, SC-008-024. Dep: T1144
- T1147 [N2] [GH:#19] Migración del modelo de identidad de administración según `D8-03` (rol/tabla de plataforma) con paridad SQLite/Postgres — REQ-ADM8-003, INV-ADM8-001; SC-008-022. Dep: T1146
- T1148 [HUM] [N2] [GH:#19] Alta del primer administrador de plataforma por el mecanismo de `D8-03` (variable de entorno o Secret Manager; sin interfaz); `/link` prepara la variable, sin `terraform apply` — REQ-ADM8-003, EDGE-008-013; SC-008-022. Dep: T1147
- T1149 [GH:#19] Implementar el filtro `/admin` (404 uniforme), la autenticación de administración y la sesión separada — REQ-ADM8-001, REQ-ADM8-002, ADR-008-06; SC-008-020, SC-008-021. Dep: T1145, T1147
- T1150 [GH:#19] Auditoría de acciones de administración, límite de intentos por IP efectiva y guarda del último administrador — REQ-ADM8-005, REQ-ADM8-006, EDGE-008-014, EDGE-008-015; SC-008-023, SC-008-024. Dep: T1149
- T1151 [GH:#19] Defensa CSRF de las mutaciones de `/admin` (origen verificado, cookie `Strict` distinta) con pruebas — REQ-ADM8-005, EDGE-008-015; SC-008-025. Dep: T1149
- T1152 [GH:#19] UI del portal: contenedor `/admin` con bundle propio y lista de pendientes paginada (25) con aprobar/rechazar; ningún enlace desde la aplicación de usuarios; revisión `/sati` — REQ-ADM8-001, REQ-ADM8-004, NFR-008-002, NFR-008-003; SC-008-020, SC-008-026. Dep: T1149, T1141
- T1153 [GH:#19] Prueba de regresión de la UX de usuarios: el registro y los menús no cambian y nunca ofrecen «Administrador» (inventario por `grep` de «Administrador» en `src/presentation/`) — REQ-ADM8-001, NFR-008-003; SC-008-020. Dep: T1152
- T1154 [GH:#19] E2E: usuario normal no ve rastro de `/admin`; administrador entra por `/admin` y las dos sesiones no se cruzan — REQ-ADM8-001, REQ-ADM8-002; SC-008-020, SC-008-021. Dep: T1153
- T1155 [GOV] [GH:#19] `/trinity` y `/sentinels` (IDOR, enumeración de rutas, sesión caducada, CSRF, fuerza bruta) sobre `/admin` — REQ-ADM8-001..006; SC-008-020..026. Dep: T1154

### Bloque E — [GH:#20] UI Admin para modificar el límite de fotos por mascota (diferido; `D8-08`)

- T1156 [ARCH] [GH:#20] `/architect`: contrato de lectura y edición de parámetros (`GET`/`PUT` bajo `/api/admin/parameters`, `If-Match`, `412` reutilizando el código existente de versión o el que fije `T1144`) y catálogo de código con rango de `D8-08` — REQ-PRM8-001..003; SC-008-027..031. Dep: T1144, T1106
- T1157 [GH:#20] Pruebas rojas: rango (`0`, negativo, decimal, texto, fuera de rango), autoría (`updated_by_user_id`, `updated_at`), concurrencia `412` y caída al defecto de un valor inválido en BD — REQ-PRM8-002, REQ-PRM8-003, EDGE-008-016, EDGE-008-018; SC-008-028, SC-008-030. Dep: T1156
- T1158 [GH:#20] Implementar el caso de uso de escritura del puerto de parámetros (la lectura con caché de 005 no cambia) y las rutas de `/admin` — REQ-PRM8-001..004, ADR-008-07; SC-008-027..031. Dep: T1157, T1150
- T1159 [GH:#20] Prueba de efecto: con tope 12 la undécima y la duodécima foto se aceptan; al bajar por debajo del conteo se conservan las fotos y solo se bloquean subidas nuevas — REQ-PRM8-004, EDGE-008-017; SC-008-029, SC-008-031. Dep: T1158
- T1160 [GH:#20] UI del editor en `/admin` con valor vigente, defecto, rango, autoría y aviso «Puede tardar hasta 1 minuto en aplicarse»; revisión `/sati` — REQ-PRM8-001, REQ-PRM8-004, NFR-008-002; SC-008-027. Dep: T1158, T1152
- T1161 [GH:#20] E2E: el administrador cambia 10 a 12, sube fotos y verifica el tope en la aplicación de usuarios — REQ-PRM8-001..004; SC-008-027..031. Dep: T1160
- T1162 [GOV] [GH:#20] `/oracle`: contraste en disco de rango, autoría y ausencia de claves nuevas creadas desde la interfaz — REQ-PRM8-001, REQ-PRM8-003; SC-008-027, SC-008-028. Dep: T1161

### Descartada por decisión de Neo (no pasa a 009)

- T1189 [N2] [GH:#24] Migración condicional: índice sobre el correo normalizado para la coincidencia exacta; solo si `D8-10` = B; con paridad SQLite/Postgres; si `D8-10` = A queda sin ejecutar — REQ-INV8-002; SC-008-053. Dep: T1188

### IDs de requisitos y edge cases que acompañan al diferido

`REQ-SSO8-002`, `REQ-SSO8-006`, `REQ-VIN8-005`, `INV-VIN8-004`, `REQ-APR8-001..005`, `STATE-ACCT8-001`, `REQ-ADM8-001..006`, `INV-ADM8-001`, `REQ-PRM8-001..004`; `REQ-INV8-002` y `EDGE-008-045` (descartados por `D8-10` = A); `EDGE-008-005`, `EDGE-008-008`, `EDGE-008-009..018`, `EDGE-008-024..026`, `EDGE-008-029`, `EDGE-008-032..035`, `EDGE-008-038`, `EDGE-008-040`; `SC-008-007`, `SC-008-008`, `SC-008-015..031`.

### Registro
- 2026-11-20 `/architect`: reconciliación con la resolución de Nivel 2 de Neo. 64 tareas vigentes con casilla en 008 y 36 diferidas a 009 (sin casilla); 0 `[x]`. Las tareas `[ARCH]` de contratos (`T1110`, `T1111`, `T1167`, `T1178`, `T1187`) quedan redactadas en `REVIEW` (commits `c8e59e7` y `86fad83`) sin `[x]`; `T1195` sigue pendiente de `/architect`. `T1109` (`/mouse`) debe re-ejecutarse (R3).
