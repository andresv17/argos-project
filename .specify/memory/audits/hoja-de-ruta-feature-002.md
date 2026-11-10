# Hoja de ruta — Feature 002 (Especificación Técnica v2.1)

Autor: Architect · Fecha: 2026-11-10 · Estado: PROPUESTA (documentación, sin implementar) · Despachado por Morpheus con la aprobación de Neo (Nivel 2).
Fuentes: `fase-2-analisis-v21.md` (brecha y fases F0–F8), spec v2.1 (§5.2 matriz), decisiones de Neo en `claude/log-morpheus.md` (`Decisiones Nivel 2 de Neo para Feature 002`), `hallazgo-6-traduccion-errores.md`, `backlog-feature-002.md`.
Este documento no modifica `specs/**`, `contracts/**`, `src/**`, `tests/**`, `tasks.md`, la constitución ni la spec 001. Crear `specs/002-*` (F3) requiere autorización aparte de Neo.

Leyenda: `[N2]` = requiere autorización de Neo (Nivel 2). Agentes: A Architect, M Mouse, K Keymaker, O Oracle, S Sati; apoyo: Trinity (T), Rama (R), Maggie (Mg), Kid, Sentinels, Smith, Seraph, Link.

---

## A. Decisiones aprobadas por Neo y su impacto

| # | Decisión | Impacto en contratos | Impacto en RBAC / seguridad |
|---|----------|----------------------|------------------------------|
| 1 | `username` sigue como login e invitaciones. Email opcional en perfil, sin envío de correos. Correo real a Feature 003. | `identity.schema.json` conserva `username` (`INV-AUTH-001`, `INV-HOUSE-003`); se añade `email` opcional (RFC 5322, sin verificar) en el perfil. No cambian `RegisterUserInput`/`LoginInput`/`InviteMemberInput` en el identificador. Sin dependencia de correo. Se descarta la incoherencia v2.1 "invitar por correo" (P-16). | Anti-enumeración intacta. El email no autentica ni invita; no es dato de login. Rama revisa que el email opcional no aparezca en logs ni en respaldos de terceros. |
| 2 | Sesión: 30 min de inactividad, tope absoluto 24 h. Recargar mantiene la sesión; cerrar sesión la revoca de inmediato. | `INV-AUTH-004` (7 días pasa a 24 h absoluto + 30 min deslizante), `auth-session.machine.json` (nuevo motivo `EXPIRED_IDLE`), sesión con `lastActivityAt`, OpenAPI `SessionView` con expiración, constantes de dominio (no de entorno). Cookie HttpOnly de sesión se mantiene; JWT se descarta (no es revocable). | Exploit "sesión expirada" de los 9 vectores se amplía (inactividad y tope). `POST /auth/logout` revoca en servidor al instante. Recargar: la SPA consulta `GET /auth/me` al arrancar. |
| 3 | Especies: CANINE, FELINE, RABBIT, FERRET, BIRD, REPTILE, SMALL_MAMMAL, OTHER. Migración DOG→CANINE, CAT→FELINE. Importar respaldos 1.0.0 y 2.0.0. | `pet.schema.json` 3.0.0 (`$defs/Species` nuevo enum, `speciesOther` 1–40 obligatorio solo si `OTHER`), `CreatePetInput`/`UpdatePetInput`/`PetListFilter`, `backup-envelope` 3.0.0 con migración 1.0.0→2.0.0→3.0.0, migración de BD, regeneración de `src/generated/**`, fixtures. Reglas clínicas de peso/edad solo para CANINE/FELINE hasta que Maggie defina el resto. | Sin cambio de permisos. Validar `speciesOther` contra XSS almacenado (vector 9). |
| 4 | Roles según matriz v2.1 §5.2 (Propietario Legal, Admin Hogar, Cuidador, Lector). Cuidador registra pesos y eventos; no edita perfil básico ni elimina mascota. | Nuevo contrato `can(rol, acción)` (función pura, 8 acciones x 4 roles = 32 celdas); `household-membership.machine.json` con rol por membresía y evento `CHANGE_ROLE`; `HouseholdMemberView.role`; reescribe `INV-ACC-002` (hoy "solo el dueño escribe") y `INV-HOUSE-001/002`. | El cambio de mayor riesgo de seguridad: IDOR y escalada horizontal/vertical. Pruebas de matriz completa. Nota de diseño: "Exportar respaldo" lo tienen los 4 roles; el respaldo exportado se limita a lo que el rol puede ver en ese contexto y nunca incluye datos de otros usuarios (`REQ-BACKUP-001`/SC-003); se confirma en `/speckit-clarify`. |
| 5 | Diferidos a Feature 003: SSO (Google/Apple/SAML), recuperación por correo, adjuntos PDF. | Fuera de la 002: sin P-03, sin cuentas vinculadas en P-04, sin adjuntos en P-11. Sin dependencias Nivel 2 de OAuth, SAML ni correo ni almacenamiento de archivos. | Superficie de ataque menor en la 002. No hay recuperación de contraseña hasta la 003: dejarlo escrito como riesgo aceptado. |
| 6 | Eliminar cuenta bloqueado si es propietario único de un hogar con miembros, hasta transferir o vaciar/eliminar el hogar. Descarga previa de respaldo, re-autenticación, texto "ELIMINAR MI CUENTA". | Nuevos: `POST /account/deletion-intent` (respaldo + `deletionToken` de un solo uso), `DELETE /users/me`, error `ERR-ACCOUNT-OWNS-SHARED-HOUSEHOLD` (409 con lista de hogares), evento `TRANSFER_OWNERSHIP` en la máquina de hogares, cascada atómica en una transacción. | Precondiciones evaluadas en el servidor, no solo en el modal. Revoca todas las sesiones. Rama define qué queda en auditoría (solo hash del `userId`). |

Pendientes de Neo, no decididos aquí (ver sección G): renumeración 6-A / 6-B.

---

## B. Fases, dependencias, responsables y archivos

Archivos: rutas relativas al repositorio. "Docs" = `claude/**` y `.specify/memory/audits/**`.

| Fase | Entregables | Agente | Archivos que toca | Depende de | Nivel 2 |
|------|-------------|--------|-------------------|------------|---------|
| F0 | Cerrar la 001: T056 (tipado `any`), T057 (react-router v7), e2e pendientes, correcciones de la sección F, commits locales, etiqueta `v1.0.0-feature-001` | K, luego O | `src/**`, `tests/**` (solo lo de la sección F), `tasks.md` (hasta `REVIEW`), docs | Nada | `[N2]` Neo marca `COMPLETED`, hace `git push`, crea la etiqueta |
| F1 | Decisiones de política | Neo con A y Morpheus | `claude/log-morpheus.md` | F0 en paralelo | CERRADA (6 decisiones, sección A) |
| F2 | `/speckit-clarify`: 10 incoherencias de la v2.1 reescritas con las decisiones (contraseña 8 vs 10, roles Admin/Miembro vs Admin/Cuidador/Lector, hash de contraseña en cliente, color por hash vs posición, progreso vs atomicidad, nombre fijo en header, exportación del Lector, peso 0.05–150 kg para otras especies, merge) | M con A | `.specify/memory/audits/`, docs | F1 | Respuestas de Neo a las preguntas que queden |
| F2b | Diseño de pantallas (sin contratos): tokens, app shell, pantallas aplicables (P-01, P-02, P-04 sin SSO, P-05, P-06..P-19 sin adjuntos), 3 viewports, WCAG 2.1 AA | S con A | Docs de diseño (`claude/` o `.specify/memory/audits/`) | F1 (solapa con F2) | Aprobación de Neo del diseño; `[N2]` si se añade librería de iconos o fuentes (constitución §2) |
| F3 | `/speckit-specify`: crear rama y `specs/002-pet-health-tracker-v2` (nombre a confirmar) | A | `specs/002-*/spec.md`, checklist de requisitos, rama git | F1, F2 | `[N2]` autorizar la creación de la feature |
| F4 | Plan y contratos formales: `identity` (email opcional, `lastActivityAt`), `pet` 3.0.0, roles y `can(rol, acción)`, `household-membership` con roles y `TRANSFER_OWNERSHIP`, `auth-session` con `EXPIRED_IDLE`, `account-deletion`, auditoría con hash canónico, `backup-envelope` 3.0.0, errores nuevos, `supersedesId` de registros, OpenAPI | A (T para auth/RBAC, R para privacidad/auditoría/eliminación, Mg para reglas por especie) | `specs/002-*/{plan,research,data-model,quickstart}.md`, `specs/002-*/contracts/**` con `supersedes` en `x-sdd-metadata` | F3 | `[N2]` solo si hace falta enmendar la constitución |
| F5 | Análisis cruzado y checklists de requisitos y de compuerta | M, luego O | `specs/002-*/checklists/**`, auditoría | F4 | `[N2]` aprobación de la spec (`Approved`) |
| F6 | `tasks.md` de la 002 por rebanadas, con la tabla de sustitución (sección C) incorporada al plan | A (`/speckit-tasks`), luego M (`/speckit-analyze`) | `specs/002-*/tasks.md`, plan | F5 | `[N2]` aprobación; `COMPLETED` solo de Neo |
| F7 | Herramientas multi-feature: `compile-contracts.sh` (hoy lee `specs/001-*/contracts`), `verify-traceability.sh`, `verify-oracles.sh`, carpeta única `src/generated/` | K con A | `scripts/**`, `src/generated/**` | F6 | No (si no hay dependencia nueva) |
| F8 | Implementación por rebanadas (sección D). Cada una: A contrato, K código y pruebas, O veredicto | A, K, O + apoyos | `src/**`, `tests/**`, contratos | F7 | Cada `COMPLETED` es de Neo; `[N2]` por cualquier dependencia nueva (p. ej. hash de contraseña distinto al actual, iconos) |

Dependencias entre fases: F0 -> (puede solapar F1/F2/F2b); F2 -> F3 -> F4 -> F5 -> F6 -> F7 -> F8. F2b alimenta F4 (campos de formularios) y F8-6.

Autorizaciones [N2] que Neo debe dar, en orden:
1. F0: marcar `COMPLETED` T056/T057, `git push`, etiqueta de la 001.
2. F2b: aprobar el diseño y, si aplica, la librería de iconos/fuentes.
3. F3: autorizar la creación de `specs/002-*` y su rama.
4. F4: enmienda de la constitución solo si se detecta necesidad.
5. F5: aprobar la spec 002 como `Approved`.
6. F6: aprobar `tasks.md`.
7. F8: cada `COMPLETED`, y cualquier dependencia externa nueva.

---

## C. Sustitución de pruebas de la 001 que contradicen la 002 (solo diseño)

Regla: ninguna prueba se borra sin su sustituta. Las pruebas de la 001 que siguen siendo válidas pasan como regresión. Los nombres de archivo son de referencia; Keymaker/Oracle confirman los casos exactos al hacer `tasks.md` (F6). Mouse verifica que no quede prueba sin identificador vigente.

| Prueba 001 (archivo) | Prueba 002 (sustituta) | Motivo |
|----------------------|------------------------|--------|
| `tests/unit/pet-and-alerts.spec.ts` y `tests/property/pet.property.spec.ts` (casos con `DOG`/`CAT`) | Mismos archivos, enum de 8 especies; casos nuevos para `OTHER` + `speciesOther` y para las reglas de edad por especie | Cambia `Species` a 3.0.0 |
| `tests/integration/contracts/canonical-fixtures.spec.ts`, `generated-contracts.spec.ts`, `codegen-drift.spec.ts`, `openapi-conformance.spec.ts` (fixtures con `DOG`/`CAT`, versiones 2.0.0) | Mismos con fixtures canónicos 002 y esquemas 3.0.0 | Cambia el contrato y se regenera `src/generated/**` |
| `tests/unit/backup-migration.spec.ts` y `tests/integration/persistence/sqlite-backup-import.spec.ts` (migra 1.0.0 a 2.0.0) | Migración 1.0.0 y 2.0.0 a 3.0.0 con mapeo DOG→CANINE, CAT→FELINE; importar 2.0.0 sigue aceptado | Decisión 3, retrocompatibilidad |
| `tests/unit/backup-use-cases.spec.ts`, `backup-import-atomicity.spec.ts`, `tests/integration/api/backup-atomicity.spec.ts` | Se conservan como regresión (el reemplazo atómico sigue siendo válido); se añaden casos para la previsualización y la exportación por rol | La atomicidad no cambia; el Lector exporta |
| `tests/unit/access-policy.spec.ts` y `tests/property/access.property.spec.ts` (`INV-ACC-002`: solo el dueño escribe) | `tests/unit/permissions-matrix.spec.ts` (32 celdas de `can(rol, acción)`) + propiedades de acceso por rol | Decisión 4, la regla única pasa a matriz |
| `tests/unit/household-policies.spec.ts`, `tests/property/households.property.spec.ts` (`OWNER`/`MEMBER`, `INV-HOUSE-001/002`) | Mismos, con roles Propietario/Admin/Cuidador/Lector, `CHANGE_ROLE`, `TRANSFER_OWNERSHIP` y propietario único | Decisión 4 y 6 |
| `tests/integration/api/households.api.spec.ts` | Mismo, con rol inicial en la invitación y cambio de rol; invitación siempre por `username` | Decisión 4; se conserva `username` |
| `tests/unit/auth-policies.spec.ts` y `tests/property/auth.property.spec.ts` (`INV-AUTH-004` de 7 días; `INV-AUTH-002`) | Mismos con 30 min deslizante y 24 h absoluto, reloj inyectado, propiedades de ventanas; la política de contraseña solo cambia si Neo lo decide en F2 | Decisión 2 |
| `tests/integration/api/auth.api.spec.ts` | Mismo, más logout que revoca al instante, `GET /auth/me` tras recargar y expiración por inactividad | Decisión 2 |
| `tests/security/exploits/session-csrf.security.spec.ts` (sesión expirada) | Ampliada: expiración por inactividad y por tope; sesión revocada no reactiva | Decisión 2 |
| `tests/security/exploits/access-control.security.spec.ts` (IDOR con "dueño vs miembro") | IDOR por rol: cada celda "No" de la matriz devuelve el error esperado; Lector no muta | Decisión 4 |
| `tests/security/exploits/malicious-input.security.spec.ts` | Se conserva; se añade `speciesOther` y `email` a los vectores de XSS y prototype pollution | Campos nuevos |
| `tests/security/exploits/credentials.security.spec.ts`, `log-redaction.security.spec.ts` | Se conservan; se añade que auditoría y eliminación de cuenta no registran secretos | Habeas Data, `INV-AUTH-003` |
| `tests/integration/api/pets-records.api.spec.ts` | Mismo, con permisos de Cuidador (puede registrar pesos/eventos; no editar perfil ni eliminar) y `supersedesId` | Decisión 4 |
| `tests/unit/record-invariants.spec.ts`, `tests/property/records.property.spec.ts`, `alerts.property.spec.ts` | Regresión del semáforo; casos nuevos de inmutabilidad `SUPERSEDED` con `supersedesId` si F2 lo adopta | Cambia lo calculado a vínculo explícito |
| `tests/integration/presentation/web-client.spec.ts`, `tests/unit/presentation/**` (6 pantallas, rutas actuales, mensajes de formulario) | Mismos, con rutas en español, filtros por especie, estados de éxito, mensajes humanos | Pantallas v2.1; hallazgo 6-A |
| `tests/e2e/visual/*.spec.ts`, `tests/e2e/accessibility/wcag.spec.ts` | Mismos con nuevas pantallas; se añade el flujo recargar-sigue-autenticado y el de dos navegadores por rol (Kid) | Pantallas y roles nuevos |
| `tests/unit/layer-dependencies.spec.ts`, `tests/integration/gates/verify-gates.spec.ts` | Se ajustan solo para rutas multi-feature | F7 |
| (no existe) | Pruebas nuevas: eliminación de cuenta (bloqueo, token, cascada atómica con rollback), auditoría (hash canónico determinista), perfil | Decisiones 1 y 6 |

---

## D. Rebanadas de implementación (F8), con criterio de aceptación verificable

Cada rebanada pasa por las compuertas: `bash scripts/compile-contracts.sh`, `bash scripts/verify-traceability.sh`, `bash scripts/verify-oracles.sh`, `npx tsc --noEmit`, `npm run test:gate`, y veredicto de Oracle. Orden fijo; cada una puede cerrarse sin la siguiente.

| # | Rebanada | Contenido | Criterio de aceptación (verificable) |
|---|----------|-----------|---------------------------------------|
| 1 | Cuenta e identidad | Sesión 30 min / 24 h, logout que revoca, `GET /auth/me` al arrancar, perfil (`displayName`, `email` opcional, idioma, zona horaria decidida en F2, `avatarUrl` sin subida), cambio de contraseña con re-autenticación, eliminación de cuenta (decisión 6) | (a) Con reloj inyectado, una sesión inactiva 30 min y 1 s devuelve 401; una activa se renueva; ninguna sobrevive 24 h. (b) E2E: login, recargar, sigue autenticado; cerrar sesión y reusar la cookie devuelve 401. (c) `DELETE /users/me` sin token, sin re-autenticación o sin texto literal falla; con propietario único de hogar con miembros devuelve 409 `ERR-ACCOUNT-OWNS-SHARED-HOUSEHOLD`; con todo correcto, la cascada deja 0 filas que referencian al usuario y una falla a mitad hace rollback completo. (d) Sentinels: vectores de sesión y CSRF en verde. (e) Rama: informe sin hallazgos abiertos. |
| 2 | Modelo de mascota | 8 especies, `speciesOther`, migración DOG→CANINE / CAT→FELINE, sexo, `neutered`, `microchip_id` único, edad estimada | (a) Una BD de la 001 migra sin pérdida: conteos antes/después iguales y 0 filas `DOG`/`CAT`. (b) `OTHER` sin `speciesOther` devuelve error de validación; con `speciesOther` válido guarda. (c) Microchip duplicado devuelve el error de unicidad y no crea; `^\d{15}$` aplicado. (d) Importar respaldos 1.0.0 y 2.0.0 de prueba produce las mismas mascotas con especie mapeada. (e) Mg firma reglas: especies nuevas no generan alertas de peso/edad. |
| 3 | Roles y permisos | `can(rol, acción)`, roles de hogar, cambio de rol, transferencia de propiedad de hogar y de mascota, protección contra huérfanos, decisión A21 (mascotas del hogar) tomada en F2 | (a) Prueba de las 32 celdas de §5.2 pasa y coincide con la tabla de la spec. (b) Por API, cada celda "No" responde 403/404 según el catálogo; ningún rol edita datos de un hogar ajeno (IDOR). (c) Cuidador registra peso y evento sanitario y no puede editar perfil básico ni eliminar mascota; Lector no muta nada. (d) Una mascota nunca queda sin Propietario Legal tras transferir o expulsar (propiedad). (e) Kid: flujo de dos y tres navegadores por rol en verde. |
| 4 | Auditoría y registros clínicos | Log de mutaciones con `timestamp`, `executor_user_id`, `mutation_type`, `previous_state_hash`, `new_state_hash`; hash canónico; `supersedesId` e inmutabilidad de `SUPERSEDED`; lote y veterinario | (a) El mismo estado serializado en distinto orden de claves da el mismo hash (propiedad). (b) Toda mutación crea exactamente una fila de auditoría; ninguna contiene contraseña, token ni cookie (prueba de redacción). (c) Editar un registro `SUPERSEDED` devuelve el error del catálogo; superarlo con un registro nuevo funciona y deja el vínculo. (d) Eliminar la cuenta conserva solo el hash del `userId` en auditoría. |
| 5 | Respaldo 3.0.0 y P-19 | Sobre 3.0.0, validación y previsualización con conteos, colisiones de ID y microchip, Merge idempotente y Reemplazo, progreso por fase | (a) Importar dos veces el mismo respaldo en Merge deja el mismo estado (idempotencia, propiedad). (b) Reemplazo ante fallo inyectado a mitad deja el estado idéntico byte a byte (Smith). (c) Archivo > 10 MB o corrupto se rechaza sin tocar datos. (d) Se importan sin cambios los respaldos 1.0.0 y 2.0.0. (e) La exportación del Lector y del Cuidador no incluye datos de otros usuarios. |
| 6 | Interfaz | App shell, pantallas aplicables, filtros (Todos/Perros/Gatos/Con alertas más especies nuevas), estados vacíos y skeleton, mensajes humanos de error, aviso previo de expiración de sesión | (a) Cada pantalla pasa axe-core WCAG 2.1 AA a 320, 1024 y 1280 px sin violaciones (Seraph). (b) Ningún campo muestra el texto técnico "El payload incumple el esquema formal..." (prueba de presentación). (c) Tras crear un hogar se ve el mensaje de éxito, el hogar en la lista con rol y el selector de contexto actualizado. (d) Sin desbordamiento horizontal en 320 px. (e) Aprobación de Neo del diseño de Sati. |

Rebanada de herramientas previa (F7) y de cierre: tras la 6, regresión completa de la 001 válida (sección C) y mutación Stryker >= 85 %.

---

## E. Fuera de alcance (Feature 003 o posterior)

- SSO (Google, Apple, SAML) y cuentas vinculadas (P-01, P-02, P-04).
- Recuperación de acceso por correo (P-03) y todo envío de correos, incluida la verificación del email del perfil y las invitaciones por correo.
- Adjuntos PDF en el historial clínico (P-11) y almacenamiento de archivos; subida de foto de avatar y de mascota por archivo.
- Catálogo de razas por especie (la raza sigue siendo texto libre).
- Reglas clínicas por especie para las especies nuevas (curvas de peso, alertas geriátricas): Maggie las define aparte; mientras tanto, sin alertas automáticas de peso/edad.
- Internacionalización completa (solo `es`).
- Despliegue cloud (GCP/Terraform, Link) y telemetría IoT (Niobe).
- JWT sin estado: descartado, no solo diferido.

---

## F. Qué corregir en la 001 antes de cerrarla

| # | Punto | Estado | Responsable | Nota |
|---|-------|--------|-------------|------|
| 1 | Bugs 1 y 2 reportados por Neo | En curso con Keymaker: no reproducibles en código (API correcta); causa probable de entorno (Grafana en :3000 detrás del proxy de Vite). Puertos e2e configurables (`E2E_API_PORT`, `E2E_WEB_PORT`) y 3 pruebas de regresión añadidas, sin commit | K, luego O | Confirmar con Neo que el fallo desaparece con otro puerto; si persiste, reabrir con captura. |
| 2 | Hallazgo 6-A (mensaje técnico "El payload incumple el esquema formal...") | Diseño listo en `hallazgo-6-traduccion-errores.md`: módulo `schema-messages.ts` solo en presentación, sin tocar contratos | K tras aprobación de Neo de D1 y D2 de ese documento; Sati revisa textos | D1 y D2 son decisiones Nivel 2 aún sin respuesta registrada. D2: interpretar `REQ-UI-005` sin enmendar la spec LOCKED. |
| 3 | T056 (tipado `any`) y T057 (react-router v7) | Abiertas | K | Parte de F0. |
| 4 | Cambios sin commit en `playwright.config.ts`, `vite.config.ts` y las 3 pruebas | Pendiente de revisión de Oracle | O | Commit local lo decide el flujo; el push es de Neo. |
| 5 | Cualquier otro fallo reportado | Ninguno adicional registrado en `log-morpheus.md` a esta fecha | Morpheus | Neo debe listarlos antes de F0; los que cambien contrato o spec se desvían a la 002. |

Criterio de cierre de la 001: bugs 1 y 2 resueltos o descartados con evidencia, 6-A resuelto o diferido por decisión de Neo, T056/T057 en `REVIEW`, compuertas en verde, veredicto de Oracle, y `COMPLETED` y etiqueta de Neo.

---

## G. Puntos pendientes (no decididos)

1. Renumeración del hallazgo 6: 6-A (mensaje técnico, `hallazgo-6-traduccion-errores.md`) y 6-B (hogar sin actualizar tras crear). No confirmada por Neo. En este documento se usan las etiquetas 6-A y 6-B solo como referencia provisional. Para 6-B el comportamiento esperado está en `fase-2-analisis-v21.md` B4; puede ser un defecto de presentación de la 001 (sin refresco ni mensaje de éxito) y entonces entraría en la sección F.
2. D1 y D2 del hallazgo 6-A (alcance solo-presentación y lectura de `REQ-UI-005`).
3. Política de contraseña (8 vs 10 con complejidad): se resuelve en F2.
4. Zona horaria del día civil (UTC como en la 001, o la del usuario): F2.
5. Modelo de mascota-hogar (decisión A21) y transferencia de propiedad de mascota: F2, antes de la rebanada 3.
6. Alcance exacto de la exportación del Lector: F2.
7. Nombre de la rama y carpeta `specs/002-*`, y su autorización (F3).
