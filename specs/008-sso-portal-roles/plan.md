# Implementation Plan: SSO con Google, registro con correo, vinculación, aprobación, portal /admin y UX de escena (Feature 008)

**Branch**: `008-sso-portal-roles` | **Date**: 2026-11-20 | **Spec**: `specs/008-sso-portal-roles/spec.md`
**Estado**: `DRAFT`. **Input**: `spec.md`, `claude/inbox-feature-008.md` (11 ítems). Decisiones de Nivel 2 `D8-01..D8-14` **pendientes de Neo** (`spec.md`); este plan fija la arquitectura que no depende de ellas y marca como «condicionada» la que sí.

## Summary
Cinco líneas de trabajo: (0) tres mejoras de colaboración y perfil (`#21` biografía, `#24` autocompletado de colaboradores, `#25` claridad de permisos y aviso de hogar), independientes de A..E y entre sí; (1) autenticación externa y correo (`#16`, `#17`), con un puerto de correo y un verificador OIDC; (2) estado de cuenta y aprobación (`#18`); (3) portal `/admin` aislado con edición de parámetros (`#19`, `#20`); (4) tres mejoras de presentación de la escena (`#53`, `#54`, `#55`) sin relación con las demás. Las líneas 0 y 4 son independientes y pueden entregarse primero (salvo las partes que dependen de `D8-10`..`D8-13`).

## Technical Context
**Language/Version**: TypeScript 5 estricto, Node 22.23.4, React (Vite). **Testing**: Vitest + Playwright (`es-CO`), Google simulado y correo `fake` (sin llamadas reales en CI). **Storage**: SQLite y Postgres con paridad. **Constraints**: `package.json` intacto salvo autorización (`D8-04`, `D8-05`); WCAG 2.1 AA; `domain`/`application` sin `fs`/`fetch`/`process.env` ni `Date`/`crypto` directos (Principio II). Contratos sobre la **línea 002** (nueva MINOR), coordinando con 004 y 005; nada en `src/generated/` hasta decidir.

## Constitution Check
- Versión vigente de la constitución: **3.7.0** (Stack: `jose` 6.2.17 autorizada **solo** en `oidc-verify.ts` y para las dos rutas internas de Cloud Scheduler; cualquier otro uso es enmienda MINOR de Nivel 2). IV (TDD): pruebas rojas primero por bloque. VI: servicio de correo y ampliación de `jose` son Nivel 2 (`D8-04`, `D8-05`); cookie `argos_oauth` y *callback* `200` exigen enmienda del Stack de autenticación (`T1111`). `INV-ARCH-006`: toda configuración solo en `app-config.ts`.

## Topología (hexagonal)
| Capa | Pieza | Notas |
| --- | --- | --- |
| `domain/auth` | `one-time-token` (puro), reglas de vinculación, `STATE-ACCT8-001` | sin `Date`/`crypto`; reloj y entropía por puerto |
| `application` | `EmailSenderPort`, casos de uso `startGoogleLogin`, `completeGoogleLogin`, `register`, `verifyEmail`, `linkIdentity`, `decideRegistration`, `updatePlatformParameter`, `updatePetBiography`, `searchInvitees` | `EmailSenderPort` análogo a `SceneImageGeneratorPort` |
| `infrastructure/http` | verificador `id_token` (según `D8-05`), rutas `/api/auth/google/*`, `/api/admin/*`, filtro `/admin` | el `404` uniforme se aplica antes de cualquier ruta |
| `infrastructure/adapters` | cliente de correo real y `fake` | selección por `ARGOS_EMAIL_DRIVER` |
| `infrastructure/persistence` | `auth_identities`, tokens, `identity_link_requests`, `users.account_status`, administración | migraciones SQLite y Postgres con paridad |
| `presentation/web` | pantalla de acceso, vinculación, estado de cuenta, bundle `/admin`, 3 ajustes de escena, campo de biografía, combobox de invitación, ayuda de roles y aviso del enlace veterinario | `/admin` con entrada y bundle propios |

## Decisiones de arquitectura (ADR breves)
| ID | Decisión | Alternativas descartadas | Por qué |
| --- | --- | --- | --- |
| **ADR-008-01** (`#16`) | OIDC *authorization code* con PKCE `S256`, `state` y `nonce` de un solo uso, *scope* `openid email`; identidad anclada en `sub` | Flujo implícito; anclar en el correo | El flujo implícito está en desuso; el correo de Google puede cambiar (`EDGE-008-002`) |
| **ADR-008-02** (`#17`) | Vinculación solo con prueba de control del correo de la cuenta existente (enlace de un solo uso) y sin autovinculación; cuenta con correo no verificado no se vincula | Autovincular si Google dice `email_verified` | Pre-hijacking: el correo de las cuentas antiguas nunca se verificó (`EDGE-008-003`) |
| **ADR-008-03** (`#16`) | Estado del flujo en cookie `argos_oauth` (`SameSite=Lax`, `Path=/api/auth/google`, 15 min = 900 s, solo identificador opaco; estado en servidor con `expires_at`); *callback* responde `200` y establece `argos_session` `Strict`, la SPA navega a `/` | Relajar `argos_session` a `Lax`; `302` desde el *callback* | Una redirección encadenada tras navegación cross-site no lleva cookies `Strict`; relajar la sesión debilita CSRF de toda la app |
| **ADR-008-04** (`#16`) | `EmailSenderPort` con plantillas cerradas y adaptador `fake` determinista; el adaptador real se elige por `D8-04` | Enviar correo desde `application` con `fetch`; plantillas libres | Principio II y pruebas sin red; sin PII de mascotas en correos |
| **ADR-008-05** (`#18`) | `users.account_status` cerrado (`ACTIVE`/`PENDING`/`REJECTED`) y decisión por compare-and-set; la **política** que fija el estado inicial queda fuera del dominio (función con la opción de `D8-02`) | Boolean `approved`; lógica de política dispersa | Estados explícitos auditables; la política puede cambiar sin migrar |
| **ADR-008-06** (`#19`) | Portal con rutas, bundle y cookie propios (`argos_admin_session`, `Path=/admin` y `/api/admin`); `404` uniforme para no administradores; `PLATFORM_ADMIN` fuera de `RBAC` de hogar | Un rol más en `can(rol, acción)`; `403` para no administradores | `ADMIN` ya es rol de hogar; el `403` enumera el portal |
| **ADR-008-07** (`#20`) | Escritura de parámetros por caso de uso en el puerto existente; el catálogo (tipo, rango, defecto) sigue en el código | Tabla con `min_value`/`max_value` (retirada en `MIF-005-07`) | Mantiene `REQ-PRM-002`; sin claves creadas desde la interfaz |
| **ADR-008-08** (`#53`) | Sin dato nuevo: se usa `quota.resetsAt` del servidor | Calcular el día 1 en el cliente | El reloj del navegador no es fuente de verdad (`EDGE-008-019`) |
| **ADR-008-09** (`#54`) | Botón en `SceneBlock` (Hogar), no en Mascotas; `download` si funciona con la redirección firmada, si no parámetro de descarga (Caso B condicional `T1167`) | Descargar vía `fetch` + `Blob` (rompe `NFR-ESC6-003`: el DOM no guarda URL firmadas) | Respeta `D6-19` y la regla de no guardar URL firmadas |
| **ADR-008-10** (`#55`) | `figcaption` «Mi hogar» en `HomeSceneImage` (enmienda `D6-19`) | `aria-label` oculto | El Issue pide un texto visible |
| **ADR-008-11** (`#21`) | La biografía vive en `pets.biography` (anulable, 0..280, texto plano) y **no** entra en `ScenePayload` ni en `buildImagePrompt`; `pets[].biography` sigue `null` | Enviarla al prompt con saneamiento; guardarla en una tabla aparte | `INV-ESC6-010/017` la excluyen hasta revisión de `/rama`; el contrato 006 ya la tiene opcional, así que activarla después (`D8-12` = B) es un cambio aditivo sin migrar |
| **ADR-008-12** (`#24`) | Ruta de solo lectura con prefijo mínimo 3, 5 resultados, solo `username`, respuesta de forma y coste uniformes y límite de tasa por usuario e IP efectiva; correo solo por coincidencia exacta de correo verificado (`D8-10` = B) | Búsqueda abierta con `LIKE '%q%'`; devolver nombre visible o correo; devolver `404` si no hay resultados | Reduce la enumeración a la inherente de un selector de colaboradores y no cambia `REQ-HOUSE2-001` si `D8-10` = A; el índice único de `LOWER(username)` sirve el prefijo |
| **ADR-008-13** (`#25`) | La ayuda de rol se genera desde la fuente de `can(rol, acción)` (`REQ-RBAC-001`) y el aviso de hogar es texto estático en el diálogo del enlace; sin cambio de contrato ni de reglas | Copiar la matriz a textos fijos; endpoint de permisos | Una sola fuente evita que la ayuda mienta; no hay dato nuevo que servir |

## Estructura de archivos previstos (sin crear en esta pasada)
`src/domain/auth/`, `src/application/ports/email-sender.port.ts`, `src/infrastructure/http/google-oidc-verify.ts` (nombre sujeto a `D8-05`), `src/infrastructure/adapters/email/`, `src/infrastructure/persistence/{sqlite,postgres}/migrations/` (números por verificar al implementar), `src/presentation/web/admin/`, y los ajustes de `scene-view.ts`, `SceneBlock.tsx` y `HomeSceneImage.tsx`; para `#21`, `#24` y `#25`: campo de perfil de mascota y migración `pets.biography`, ruta y caso de uso `searchInvitees` y su combobox en la gestión de hogares, y los textos de rol y el aviso en el diálogo de enlace veterinario (nombres de archivo por fijar al implementar).

## Orden de riesgo mínimo
1. Lote UX F, G, H y, con sus decisiones o textos provisionales, `#25` (K), `#24` (J, solo `username`) y `#21` (I, solo perfil); sin decisiones previas de Neo salvo `D8-10..D8-13` para lo condicionado. 2. Bloque A con Google simulado y correo `fake`. 3. Bloque B. 4. Con `D8-02` y `D8-03` decididas: C, D y E. 5. Adaptador real de correo y credenciales (`T1124`) al final y por `/link`.

## Riesgos residuales
`RR-08-01`: `argos-avallejo.duckdns.org` no valida SPF/DKIM del remitente; el correo puede caer en spam (`D8-04`). `RR-08-02`: enlace de verificación reenviado por el usuario a terceros (acotado por un solo uso y vencimiento). `RR-08-03`: `PLATFORM_ADMIN` único como punto de fallo hasta tener un segundo administrador. `RR-08-04`: la búsqueda de colaboradores revela la existencia de un `username` por prefijo (inherente al selector; acotada por prefijo >= 3, 5 resultados, límite de tasa y sesión autorizada). `RR-08-05`: texto libre de biografía con PII posible; contenida porque no sale del perfil (`D8-12` = A).
