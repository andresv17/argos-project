# Implementation Plan: SSO con Google, vinculación, biografía, autocompletado de colaboradores, permisos y UX de escena (Feature 008)

**Branch**: `008-sso-portal-roles` | **Date**: 2026-11-20 | **Spec**: `specs/008-sso-portal-roles/spec.md`
**Estado**: `DRAFT`. **Input**: `spec.md`, `claude/inbox-feature-008.md` (8 ítems de 008; `#18`, `#19` y `#20` pasan a la Feature 009). Reconciliado el 2026-11-20 con la resolución de Nivel 2 de Neo (`claude/decisiones-neo-008-2026-11-20.md`): `D8-01..D8-14` resueltas o diferidas; este plan fija la arquitectura de 008 sin decisiones abiertas.

## Summary
Tres líneas de trabajo: (0) tres mejoras de colaboración y perfil (`#21` biografía, `#24` autocompletado de colaboradores por prefijo de `username`, `#25` claridad de permisos y aviso de hogar), independientes entre sí; (1) autenticación externa **solo con Google** (`#16`, `#17`): verificador OIDC con `jose` en `google-oidc-verify.ts` y vinculación desde la sesión activa con la contraseña actual; (2) tres mejoras de presentación de la escena (`#53`, `#54`, `#55`). Las líneas 0 y 2 son independientes y pueden entregarse primero. El correo real, el registro con correo, la aprobación de registro (`#18`), el portal `/admin` (`#19`) y el tope de fotos (`#20`) pasan a la Feature 009 (ver «Diferido a 009»).

## Technical Context
**Language/Version**: TypeScript 5 estricto, Node 22.23.4, React (Vite). **Testing**: Vitest + Playwright (`es-CO`), Google simulado (sin llamadas reales en CI). **Storage**: SQLite y Postgres con paridad. **Constraints**: `package.json` intacto (`jose` 6.2.17 ya instalada; alcance ampliado por la Enmienda constitucional 3.8.0); WCAG 2.1 AA; `domain`/`application` sin `fs`/`fetch`/`process.env` ni `Date`/`crypto` directos (Principio II). Contratos ya redactados y compilados (commit `86fad83`): líneas **002** (openapi 3.3.0, identity 3.1.0, pet 3.2.0, backup-envelope 3.3.0, error-catalog 3.2.0) y **004** (openapi 3.4.0, identity 3.2.0, pet 3.2.0, backup-envelope 3.3.0, error-catalog 3.2.0) y **006** (`home-scene.openapi.yaml` 3.5.0, `download=1`); `src/generated/` regenerado (`v31`, `v33`, `v34` y la línea 002).

## Constitution Check
- Versión vigente de la constitución: **3.8.0** (Enmienda 008, commit `c8e59e7`, autorizada por Neo el 2026-11-20): `jose` 6.2.17 queda autorizada además en `src/infrastructure/http/google-oidc-verify.ts` solo para el `id_token` de Google, y la cookie `argos_oauth` (`SameSite=Lax`, `Max-Age` 900 s, `Path=/api/auth/google`, solo identificador opaco) se admite acotada a ella (`argos_session` sigue `Strict`). Sigue valiendo que `jose` no se importa desde `src/domain/` ni `src/application/`. IV (TDD): pruebas rojas primero por bloque. VI: sin servicio de correo ni dependencia nueva en 008. `INV-ARCH-006`: toda configuración solo en `app-config.ts`.

## Topología (hexagonal)
| Capa | Pieza | Notas |
| --- | --- | --- |
| `domain/auth` | `one-time-token` (puro; identificador opaco del estado del flujo OIDC), reglas de vinculación y de titularidad de correo (`D8-14`) | sin `Date`/`crypto`; reloj y entropía por puerto |
| `application` | casos de uso `startGoogleLogin`, `completeGoogleLogin`, `chooseGoogleUsername`, `startGoogleLink`, `updatePetBiography` (vía `updatePet`), `searchInvitees` | puertos existentes de reloj, entropía, repositorios y auditoría |
| `infrastructure/http` | verificador `id_token` con `jose` en `google-oidc-verify.ts` (`D8-05` = A), rutas `/api/auth/google/{start,callback,username,link}`, ruta `GET /households/{householdId}/invitees`, parámetro `download=1` de las rutas de imagen de escena | la página del *callback* se sirve con CSP de página, no con `API_CSP` (H-8-03) |
| `infrastructure/adapters` | cliente HTTP de Google (token endpoint y JWKS) con adaptador simulado para CI | sin llamadas reales en CI |
| `infrastructure/persistence` | `auth_identities`, estado intermedio del flujo (con intención `LOGIN`/`LINK` y `user_id`), `users.email_verified_at`, `pets.biography`; borrado de cuenta limpia `auth_identities` y estado (H-8-04) | migraciones SQLite y Postgres con paridad; sin `identity_link_requests` ni `users.account_status` |
| `presentation/web` | pantalla de acceso con Google, «Elige tu usuario», «Vincular Google» en el perfil, 3 ajustes de escena, campo de biografía, combobox de invitación, ayuda de roles y aviso del enlace veterinario | sin bundle `/admin` |

## Decisiones de arquitectura (ADR breves)
| ID | Decisión | Alternativas descartadas | Por qué |
| --- | --- | --- | --- |
| **ADR-008-01** (`#16`) | OIDC *authorization code* con PKCE `S256`, `state` y `nonce` de un solo uso, *scope* `openid email`; identidad anclada en `sub`; firma verificada con `jose` 6.2.17 en `google-oidc-verify.ts` (`D8-05` = A) | Flujo implícito; anclar en el correo | El flujo implícito está en desuso; el correo de Google puede cambiar (`EDGE-008-002`) |
| **ADR-008-02** (`#17`) | Vinculación solo desde la sesión activa con la **contraseña actual** (`M8-02`), sin enlace por correo y sin autovinculación; la cuenta sin correo verificado no reclama el correo y Google verificado lo libera (`D8-14`) | Autovincular si Google dice `email_verified`; vinculación por enlace al correo existente (exige correo real y tabla de intentos: 009) | Pre-hijacking: el correo de las cuentas antiguas nunca se verificó (`EDGE-008-003`); la contraseña actual es prueba de control más fuerte que un correo no verificado |
| **ADR-008-03** (`#16`) | Estado del flujo en cookie `argos_oauth` (`SameSite=Lax`, `Path=/api/auth/google`, 15 min = 900 s, solo identificador opaco; estado en servidor con `expires_at` e intención `LOGIN`/`LINK`; aprobada por Neo, Enmienda 3.8.0); *callback* responde `200` y establece `argos_session` `Strict`, la SPA navega a `/` | Relajar `argos_session` a `Lax`; `302` desde el *callback* | Una redirección encadenada tras navegación cross-site no lleva cookies `Strict`; relajar la sesión debilita CSRF de toda la app |
| **ADR-008-08** (`#53`) | Sin dato nuevo: se usa `quota.resetsAt` del servidor | Calcular el día 1 en el cliente | El reloj del navegador no es fuente de verdad (`EDGE-008-019`) |
| **ADR-008-09** (`#54`) | Botón en `SceneBlock` (Hogar), no en Mascotas; el atributo `download` no funciona con la redirección firmada (confirmado en Chromium, Caso B), por lo que el botón pide la imagen con `download=1` y la URL firmada V4 lleva `response-content-disposition: attachment` (contrato 006 3.5.0, `T1167` ejecutada) | Descargar vía `fetch` + `Blob` (rompe `NFR-ESC6-003`: el DOM no guarda URL firmadas) | Respeta `D6-19` y la regla de no guardar URL firmadas |
| **ADR-008-10** (`#55`) | `figcaption` «Mi hogar» en `HomeSceneImage` (enmienda `D6-19`) | `aria-label` oculto | El Issue pide un texto visible |
| **ADR-008-11** (`#21`) | La biografía vive en `pets.biography` (anulable, 0..280, texto plano, sin caracteres de control), se edita por el `PATCH /pets/{petId}` existente y viaja en el respaldo 3.3.0; **no** entra en `ScenePayload` ni en `buildImagePrompt`; `pets[].biography` sigue `null` (`D8-12` = A, decidida por Neo) | Enviarla al prompt con saneamiento; guardarla en una tabla aparte; una ruta nueva para editarla | `INV-ESC6-010/017` la excluyen; reutilizar `updatePet` evita una operación nueva y hereda `EDIT_PET_BASICS` y `If-Match` |
| **ADR-008-12** (`#24`) | `GET /households/{householdId}/invitees?q=` de solo lectura con prefijo mínimo 3, 5 resultados, solo `username`, respuesta de forma y coste uniformes y límite de tasa por usuario e IP efectiva; sin búsqueda por correo (`D8-10` = A) | Búsqueda abierta con `LIKE '%q%'`; devolver nombre visible o correo; devolver `404` si no hay resultados; búsqueda por correo | Reduce la enumeración a la inherente de un selector de colaboradores y no cambia `REQ-HOUSE2-001`; el índice único de `LOWER(username)` sirve el prefijo |
| **ADR-008-13** (`#25`) | La ayuda de rol se genera desde la fuente de `can(rol, acción)` (`REQ-RBAC-001`) y el aviso de hogar es texto estático en el diálogo del enlace; sin cambio de contrato ni de reglas | Copiar la matriz a textos fijos; endpoint de permisos | Una sola fuente evita que la ayuda mienta; no hay dato nuevo que servir |

## Estructura de archivos previstos (sin crear en esta pasada)
`src/domain/auth/`, `src/infrastructure/http/google-oidc-verify.ts` (autorizado por la Enmienda 3.8.0), `src/infrastructure/persistence/{sqlite,postgres}/migrations/` (números por verificar al implementar), y los ajustes de `scene-view.ts`, `SceneBlock.tsx` y `HomeSceneImage.tsx`; para `#21`, `#24` y `#25`: campo de perfil de mascota y migración `pets.biography`, ruta y caso de uso `searchInvitees` y su combobox en la gestión de hogares, y los textos de rol y el aviso en el diálogo de enlace veterinario (nombres de archivo por fijar al implementar).

## Orden de riesgo mínimo
1. Lote UX F, G (con el contrato 006 3.5.0 ya redactado), H y `#25` (K), `#24` (J, solo `username`) y `#21` (I, solo perfil), todos con decisiones ya resueltas. 2. Bloque A con Google simulado. 3. Bloque B (vinculación desde la sesión activa). 4. Credenciales de Google (`T1124`) al final y por `/link`.

## Riesgos residuales
`RR-08-04`: la búsqueda de colaboradores revela la existencia de un `username` por prefijo (inherente al selector; acotada por prefijo >= 3, 5 resultados, límite de tasa y sesión autorizada). `RR-08-05`: texto libre de biografía con PII posible; contenida porque no sale del perfil (`D8-12` = A).

## Diferido a 009
Resolución de Neo (2026-11-20): salen de 008 y pasan a la Feature 009, conservados sin renumerar: Bloques C (`[GH:#18]`), D (`[GH:#19]`) y E (`[GH:#20]`), `T1200` (`STATE-AUTH-SESSION-001` con `PENDING`), el correo real (`EmailSenderPort`, proveedor, verificación, aviso de vinculación), el registro con correo y desvincular (`DEUDA-008-DESVINCULAR`). Decisiones `D8-02`, `D8-03`/`D8-07` y `D8-08` viajan con ellos.

| ID | Decisión diferida | Alternativas descartadas | Por qué |
| --- | --- | --- | --- |
| **ADR-008-04** (`#16`) | `EmailSenderPort` con plantillas cerradas y adaptador `fake` determinista; el adaptador real se elige por `D8-04` | Enviar correo desde `application` con `fetch`; plantillas libres | Principio II y pruebas sin red; sin PII de mascotas en correos |
| **ADR-008-05** (`#18`) | `users.account_status` cerrado (`ACTIVE`/`PENDING`/`REJECTED`) y decisión por compare-and-set; la **política** que fija el estado inicial queda fuera del dominio (función con la opción de `D8-02`) | Boolean `approved`; lógica de política dispersa | Estados explícitos auditables; la política puede cambiar sin migrar |
| **ADR-008-06** (`#19`) | Portal con rutas, bundle y cookie propios (`argos_admin_session`, `Path=/admin` y `/api/admin`); `404` uniforme para no administradores; `PLATFORM_ADMIN` fuera de `RBAC` de hogar | Un rol más en `can(rol, acción)`; `403` para no administradores | `ADMIN` ya es rol de hogar; el `403` enumera el portal |
| **ADR-008-07** (`#20`) | Escritura de parámetros por caso de uso en el puerto existente; el catálogo (tipo, rango, defecto) sigue en el código | Tabla con `min_value`/`max_value` (retirada en `MIF-005-07`) | Mantiene `REQ-PRM-002`; sin claves creadas desde la interfaz |

Riesgos residuales diferidos: `RR-08-01` (`argos-avallejo.duckdns.org` no valida SPF/DKIM del remitente; el correo puede caer en spam), `RR-08-02` (enlace de verificación reenviado a terceros) y `RR-08-03` (`PLATFORM_ADMIN` único como punto de fallo).

## Registro
- 2026-11-20 `/architect`: reconciliación con la resolución de Nivel 2 de Neo (`claude/decisiones-neo-008-2026-11-20.md`). Alcance de 008 reducido a `#16` (solo Google), `#17`, `#21`, `#24`, `#25`, `#53`, `#54`, `#55`; constitución 3.8.0 (`c8e59e7`); contratos 002/004/006 (`86fad83`); `ADR-008-04..07` pasan a «Diferido a 009»; `ADR-008-02`, `-03`, `-09`, `-11`, `-12` ajustados. Sin tocar `src/` ni `tests/`.
