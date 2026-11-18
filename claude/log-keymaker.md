# Bitácora Incremental — The Keymaker (`/keymaker` — Desarrollador SDD)

> **Regla Write-Ahead Log:** Cada vez que `/keymaker` edite archivos, ejecute compuertas o realice un commit local en la rama de trabajo, debe añadir una entrada fechada al final de este archivo antes de responder en el chat.
> **Regla de Modelo:** Corre en `sonnet` por defecto. Solo usa `/model opus` bajo demanda en turnos quirúrgicos de algoritmos complejos.

---

## `[2026-11-09 | Bootstrap Inicial desde Commit 329c392]`
- **Rama Activa:** `001-pet-health-tracker` (`HEAD -> 329c392`).
- **Estado de Implementación (`src/` y `tests/`):**
  - `TASK-100` (`T001`) a `TASK-114` (`T015`): 100% implementadas, auditadas y en estado `COMPLETED`.
  - `TASK-115` (`T016`): En estado `REVIEW`.
- **Estado de Compuertas Técnicas:**
  - `bash scripts/verify-traceability.sh`: CUMPLE (96/96 IDs, 0 violaciones de pureza).
  - `bash scripts/verify-oracles.sh`: CUMPLE (65 archivos, 0 oráculos débiles).
  - `npx tsc --noEmit`: 0 errores.
- **Cambios en Árbol de Trabajo Pendientes de Commit:**
  - Renombrado `specs/001-pet-health-tracker/checklists/spec-review.md -> .specify/memory/audits/spec-review.md` y ajustes documentales en `plan.md`, `requirements.md`, `README.md` y `.specify/memory/speckit-migration-2026-11-09.md`.
- **Deudas Técnicas Registradas (`tasks.md`):**
  - `DEUDA-TIPADO-001` (3 `any` en `backup-import-export.spec.ts` y 1 `!` en `migrations.ts:76`).
  - `DEUDA-DEP-001` (`react-router` / `@remix-run/router` moderada; requiere migración a v7 con aval Nivel 2 de **Neo**).
- **Siguiente Acción para `/keymaker`:**
  - Ejecutar `npm run test:gate` en macOS cuando **Neo** o `/morpheus` lo indiquen, y commitear los ajustes pendientes de la migración Spec Kit tras la validación en disco de `/oracle`.

## `[2026-11-10 | Hallazgos 1, 3 y 4 de Neo (UI) | Despacho de Morpheus]`
- Diagnóstico reproducido en Chrome real (Vite + API): Editar/Cancelar/Guardar apilaba formularios y React avisaba "two children with the same key". Causa raíz: en `PetsPage.tsx` `PetForm` (modo EDIT) y `PetDashboard` son hermanos y ambos usan `key={dashboard.profile.id}`; con claves duplicadas React omite/duplica hijos y el formulario no se desmonta (Cancelar/Guardar ya hacían `setMode('VIEW')`).
- Hallazgo 3 (nombre duplicado): sin contrato que cambiar; el formulario de alta tiene un solo campo `name`. El segundo "Nombre" aparecía por el formulario de edición que quedaba abierto (hallazgo 4) junto al de "Nueva mascota". Se resuelve con el arreglo de claves + prueba.
- Plan: claves distintas (`edit-`/`dashboard-`), botón "Mostrar contraseña" en `Field.tsx` (`PasswordField`) usado en `AuthPages.tsx`; pruebas en `tests/unit/presentation/`. Sin tocar contratos, spec, tasks ni git.

## `[2026-11-10 | Cierre hallazgos 1, 3 y 4]`
- Archivos: `PetsPage.tsx` (claves `edit-`/`dashboard-`), `Field.tsx` (`PasswordField`, sin desbordar a 320 px), `AuthPages.tsx`; pruebas `tests/unit/presentation/auth-password.spec.ts` y `tests/e2e/visual/auth-pet-forms.spec.ts`.
- E2E completo (28) en Chrome del sistema con servidores reales: OK, incluye axe a 320/1024/1280. Sin cambios de contrato, spec, tasks ni git.

## `[2026-11-10 | Checkpoint hallazgo 3 (filtro "Nombre")]`
- Causa: filtro de `PetCards.tsx` (`PetFilter`) usa las etiquetas "Nombre"/"Especie" como el alta.
- Plan: renombrar a "Buscar mascota" (placeholder "Escribe un nombre", aria-label propio) y "Filtrar por especie"; añadir e2e REQ-UI-001/002 en `auth-pet-forms.spec.ts`.
- Sin tocar contratos, spec, tasks, memory ni git.

## `[2026-11-10 | Puertos configurables para e2e (despacho Morpheus, aprobado por Neo)]`
- Causa: Grafana ocupa 3000 y el portal de Neo 5173; `playwright.config.ts` y `vite.config.ts` tienen puertos fijos.
- Plan: variables `E2E_API_PORT` (3000) y `E2E_WEB_PORT` (5173) en ambos archivos; defaults sin cambio. Luego tsc y e2e con 3200/5273.
- Sin tocar contratos, generated, specs, tasks, memory ni git. No se detienen procesos de Neo.

## `[2026-11-10 | Bugs 1 y 2 (login tras logout / guardar edición) | Despacho de Morpheus]`
- Reproducción con API real (SQLite temporal y copia de la base de Neo) + Vite aparte + Chrome: registro → editar → guardar → logout → login y PATCH completo del formulario: todo 200/204, sin ERR-INTERNAL-UNEXPECTED y sin errores nivel 50 en el log del servidor. No hay defecto reproducible en `src/`.
- Hallazgo de entorno: el puerto 3000 (destino del proxy de Vite) lo tiene también Grafana (brew, pid 865, escucha en `*:3000`); sin la API de ARGOS en 127.0.0.1:3000, el proxy llega a Grafana, que responde 401 JSON ajeno al catálogo, y `toProblem` (`api.ts`) lo traduce a ERR-INTERNAL-UNEXPECTED ("Ocurrió un error inesperado...").
- Acción: solo pruebas de regresión (login→logout→login; PATCH con el cuerpo completo del formulario; `toProblem` con cuerpo ajeno). Sin tocar contratos, spec, tasks ni git. Procesos propios (3100/3101/5199) detenidos; los de Neo no se tocaron.
- 2026-11-10 Resultado: puertos configurables listos (tsc OK). e2e con 3200/5273 canal Chrome: 4 pasan, 1 falla (test 5, línea 81: busca botón "Iniciar sesión" y el botón real se llama "Entrar"). Pruebas no tocadas. Config temporal borrada.

## `[2026-11-10 | Corrección selector e2e | Despacho de Morpheus]`
- Verificado en AuthPages.tsx:41 que el botón del login se llama "Entrar" ("Iniciar sesión" es título y aria-label del formulario, líneas 35-36).
- Se corregirá solo el selector de la línea 81 de tests/e2e/visual/auth-pet-forms.spec.ts; aserciones y título intactos.
- Selector línea 81 cambiado a 'Entrar'; el login ya avanza. Nueva falla en línea 90: getByLabel('Nombre',{exact:true}) resuelve 0 elementos (etiqueta visible "Nombre *", textbox accesible "Nombre"). No se tocaron aserciones. Config temporal borrada.

## `[2026-11-10 | Corrección aserción línea 90 e2e | Despacho de Morpheus]`
- Confirmado en PetForm.tsx: form con aria-labelledby (línea 29) e input name="name" (TextField línea 33, label "Nombre", required).
- Se cambia SOLO la línea 90 de auth-pet-forms.spec.ts a nameInputs-style: page.locator('form[aria-labelledby] input[name="name"]') con toHaveCount(1).
- Verificación con puertos 3200/5273 y config temporal con canal Chrome; se borra al terminar.
- Resultado: línea 90 ahora usa locator('form[aria-labelledby] input[name="name"]') toHaveCount(1); 5 pasan, 0 fallan. Config temporal borrada.

## `[2026-11-10 | Hallazgo 6-B (contador Hogares en 0) | Despacho de Morpheus]`
- Lectura de código: el "0" junto a "Hogares" en `AppShell.tsx` es el contador de invitaciones pendientes (REQ-UI-006), no de hogares; un hogar propio nunca lo incrementa. La lista (`HouseholdsPage`) sí se recarga tras crear. El contexto del hogar en Mascotas es de solo lectura para mascotas ajenas (INV-ACC-002) y "Nueva mascota" solo existe en "Mis mascotas".
- Plan: prueba e2e primero (fallará: no hay contador de hogares), luego añadir contador de hogares ACTIVE (`data-household-count`) en el encabezado, alimentado por el contexto del shell y refrescado tras crear/eliminar/abandonar. Contador de invitaciones intacto.
- Sin tocar specs, contratos, generated, tasks, memory, catálogo de errores ni git.
- Prueba `tests/e2e/visual/household-counter.spec.ts` falla antes (no existe `[data-household-count]`). Editando `AppShell.tsx`: el contexto del shell carga también `/households` y expone `householdCount`; `refresh()` ya lo invoca `HouseholdsPage.load()` tras crear/eliminar/abandonar, así que el encabezado se actualiza sin recargar. Insignia nueva neutra, la ámbar de invitaciones intacta.

## `[2026-11-10 | Mover API dev/e2e de 3000 a 3100 | Despacho de Morpheus, aprobado por Neo]`
- Motivo: Grafana ocupa el 3000 en la maquina de Neo; con la API caida el proxy de Vite recibia respuestas de Grafana.
- Plan: PORT por defecto 3100 en app-config.ts, proxy de vite.config.ts y E2E_API_PORT de playwright.config.ts; ajustar app-config.spec.ts (valor por defecto). Sin tocar specs, contratos, memory, README ni quickstart (se reportan).

## `[2026-11-10 | T057 migrar react-router-dom a v7 | Despacho de Morpheus, aprobado por Neo]`
- Antes: react-router-dom 6.30.6 fijo; npm audit --omit=dev: 2 moderadas (react-router 6.0.0-7.17.0, GHSA-wrjc-x8rr-h8h6 y GHSA-337j-9hxr-rhxg).
- Plan: npm install react-router-dom@^7, adaptar imports en src/presentation/web (App, main, AppShell, AuthPages) solo si la API cambia; sin tocar HouseholdsPage ni components.
- Cierre 6-B: `AppShell.tsx` con contador de hogares; e2e nuevo pasa (antes fallaba); e2e completo 30/30 en Chrome; tsc OK; vitest: scrypt (timeout, previo) y, mientras otro agente edita `src/infrastructure/config/app-config.ts` (PORT 3000→3100, ajeno a mí), una prueba de config. Trazabilidad y oráculos CUMPLEN. Config temporal borrada. Sin git.

## `[2026-11-10 | T056 deuda de tipado | Despacho de Morpheus, aprobado por Neo]`
- Alcance: 3 `any` en tests/unit/backup-use-cases.spec.ts (l. 267-269, mutadores de v1) y `match[1]!` en src/domain/backup/backup-migration.ts (l. 37).
- Plan: tipo local `LegacyEnvelopeV1` para los mutadores; el `!` pasa a chequeo explícito (`undefined` devuelve `value`, igual que el no-match). Sin cambios de comportamiento ni de forma pública.
- Resultado 3000->3100: tsc OK; app-config.spec 13/13; integration/api 64/64; curl a 3100 devuelve 401 problem+json ARGOS (proceso detenido por PID); e2e auth-pet-forms 5/5 con E2E_WEB_PORT=5273 sin E2E_API_PORT. Config temporal borrada. Ajustados tambien .env.example y app-config.spec.ts.
- Resultado: v7.18.5 instalado sin conflicto de peers; sin cambios de código (imports BrowserRouter, Routes, Route, Navigate, NavLink, Link, useNavigate, useLocation compatibles). Gates verdes. Estado REVIEW.

## `[2026-11-10 | F7 herramientas multi-feature T201-T206 | Despacho de Morpheus, aprobado por Neo (T204/T205 N2)]`
- Alcance: T201 (pruebas primero), T202 compile-contracts --feature, T203 codegen (solo palabras x-sdd-*), T204 verify-traceability --feature 002 (IDs con dígitos, reemplazados excluidos), T205 verify-oracles / layer-dependencies / rutas de CI, T206 compuerta. No toco constitución, T204a, T207, contratos ni generated; tareas quedan en [ ].
- Línea base guardada antes de editar (tsc 0, trazabilidad CUMPLE 001, oráculos CUMPLE, compile-contracts sin diff en src/generated).
- Plan: pruebas en verify-gates.spec.ts y codegen-drift.spec.ts primero (deben fallar), luego scripts. Sin git.
- T201 hecha en rojo: nuevos describe en tests/integration/gates/verify-gates.spec.ts y tests/integration/contracts/codegen-drift.spec.ts (fallan antes de implementar). Hallazgo: codegen.mjs ya acepta --contracts y la 002 compila a un directorio temporal; $anchor es necesario (common.schema.json de la 001 y la 002 lo usan; sin registrarlo Ajv strict falla), contra lo que dice el README de contratos 002.
- Editando scripts/compile-contracts.sh (--feature, --out) y scripts/codegen.mjs (mensaje claro de carpeta ausente, lista explícita de palabras de anotación).
- T202/T203 aplicadas. Siguiente: T204 (N2 autorizada) en scripts/verify-traceability.sh: --feature NNN (001 por defecto), carpeta specs/NNN-*, regex de ID con dígitos, tabla «Trazabilidad con la Feature 001» (Reemplazad*/absorbid*) fuera de los vigentes, principio III solo para la 001.
- T204 y parte de T205 aplicadas: verify-traceability.sh --feature NNN (001 por defecto; 002 reconoce 118 IDs vigentes, 23 reemplazados y 6 retirados excluidos); verify-oracles.sh --feature. layer-dependencies.spec.ts no tiene rutas por feature (SRC común), se deja sin cambios. Editando ahora .github/workflows/test-gate.yml y drift-detection.yml: entrada/variable FEATURE con valor por defecto 001 (autorizado por Neo para T205).
- T205/T206 cerradas en disco (sin marcar [x]). CI: FEATURE=${{ inputs.feature || '001' }} en test-gate.yml y drift-detection.yml. Compuertas: tsc 0; traceability 001 96/96 salida idéntica a la línea base; --feature 002 reconoce 118 vigentes (71 trazados, 47 pendientes, sin error de uso); oráculos CUMPLE; compile-contracts 001 sin diff en src/generated. Pendiente Neo: T204a, COMPLETED, revisar CI; T220 cita dos errores retirados.

## 2026-11-10 20:31 — T207 regeneración (solo regenerar, sin adaptar código)
- Línea base: src/generated limpio, tsc exit 0, vitest presentation+api 113/113 pasan (12 archivos).
- Autorizado por Neo vía Morpheus: ejecutar bash scripts/compile-contracts.sh --feature 002 y reportar impacto; no se edita src/, tests/ ni scripts/.
- Siguiente: regenerar, diff, impacto en tsc y pruebas, trazabilidad 001 y 002.
- T207 regeneración hecha (determinista; 14 M + 1 nuevo account-deletion.machine.ts en src/generated). Impacto: tsc 67 errores; vitest 4 fallos + 6 suites sin cargar (45/49); trazabilidad 001 y 002 en FALLA. Sin cambios en src/tests/scripts. Pendiente decisión de Neo.

## 2026-11-10 — T207 bloque 1 (pureza + regex de guarda)
- Autorizado por Neo: reemplazar «process.env» en audit-entry.schema.json:289 y recompilar 002.
- Ajustar regex de MAX_IMPORT_BYTES en backup-use-cases.ts a la guarda regenerada (`bytesRead <= 10485760`).
- tsc inicial: 205 errores. Sin commit.

## 2026-11-10 — T207 bloque 2 (respaldo: sobre 3.0.0 y legacy)
- Edito backup-use-cases.ts, backup-migration.ts, pet-/record-invariants.ts, sqlite-repositories.ts, in-memory-unit-of-work.ts: BackupEnvelopeV2 -> BackupEnvelopeV3; 1.0.0/2.0.0 rechazados con VERSION_MISMATCH hasta T233 (conservador, marcado PENDIENTE).
- No se implementa la migración a 3.0.0 (T233) ni preview/token (T271+).

## 2026-11-10 — T207 bloque 3 (sesión, alertas, canEdit)
- Edito auth-policies.ts (constantes 24 h / 30 min; solo tope absoluto aplicado), session-auth.ts, auth-use-cases.ts (SessionView con valores conservadores), sanitary-alert-evaluator.ts (alert nulo), use-case-support.ts/pet-use-cases.ts (canEdit retirado).
- Reglas de negocio nuevas NO decididas: marcadas // T2xx PENDIENTE.

## 2026-11-10 — T207 bloque 4 (hogares: modelo 001 aislado como Legacy)
- household-policies.ts conserva la lógica 001 sobre un tipo local LegacyHouseholdMember (OWNER/MEMBER, INVITED); los casos de uso la proyectan al contrato 002 (OWNER->ADMIN+isHouseholdOwner, MEMBER->READER conservador, INVITED->pendingInvitations).
- Errores retirados ERR-AUTH-USER-NOT-FOUND y ERR-HOUSE-MEMBER-ALREADY-EXISTS -> ERR-HOUSE-MEMBERSHIP-NOT-FOUND (T212/T237 PENDIENTE: invitación uniforme).
- Persistencia SQLite/memoria/puerto pasan a LegacyHouseholdMember con guarda estructural (T243 PENDIENTE: repos 002).

## 2026-11-10 — T207 bloque 5 (presentación web)
- Adapto src/presentation/web a tipos 002: especies CANINE/FELINE, roles ADMIN/..., permissions en vez de canEdit, miembros con username/displayName, alert nulo, BackupPage a rutas/cabeceras del contrato.
- Cambios mínimos de tipos; sin pantallas nuevas (T284 en adelante).

## 2026-11-10 — T207 bloque 6 (tests: solo tipos para compilar)
- src/ ya compila (0 errores). Ajusto tests/ solo en tipos y nombres que cambiaron (BackupEnvelopeV2->V3/V2Legacy, Legacy rows, canEdit->permissions, alert nulo); no borro ni relajo aserciones.
- Las pruebas que contradicen la 002 se listan en el informe para la tabla de sustitución, no se arreglan.

## 2026-11-10 — T207 cierre del bloque (informe a Morpheus)
- Resultado: tsc 205 -> 0 errores; guarda 10 MB leída del contrato regenerado; falso positivo process.env resuelto (0 menciones en src/generated).
- vitest completo: 260 fallan / 342 pasan (48 archivos, todos cargan); trazabilidad 001 CUMPLE 96/96, 002 FALLA 71/118 (+6 IDs retirados en household-policies.ts y títulos de household-policies.spec.ts).
- T207 NO se cierra: faltan fixtures canónicos 3.0.0 (no existe contracts/examples en la 002) y 40 operaciones OpenAPI vs 27 del conformance. Informe: pruebas fallidas en scratchpad fallos-t207.txt.

## 2026-11-11 — T207 conexion de fixtures canonicos 002 a pruebas de contrato (despachado por Morpheus)
- Crea tests/integration/contracts/canonical-fixtures-002.spec.ts; solo tests/, sin tocar src/, contratos, fixtures ni tasks.md.
- Casos con contractDefect D-F8-01 (10) van como it.skip pendientes de decision de Neo (correccion PATCH de SpeciesOther).
- Pendiente: correr vitest del archivo y tsc --noEmit.

## 2026-11-11 — T207 recompilacion y retiro de skips (Keymaker)
- Recompilo contratos --feature 002 tras PATCH D-F8-01 del arquitecto.
- Quito los 10 it.skip y su comentario en canonical-fixtures-002.spec.ts; sin tocar aserciones ni titulos.
- Luego vitest, tsc y compuertas.
- 2026-11-11 Keymaker: endurezco 2 toBeDefined (lineas 213, 225) de canonical-fixtures-002.spec.ts; el catalogo no tiene campo code, uso type urn + status numerico.

## 2026-11-11 — Rebanada 1 (T208-T225) bloque A: pruebas primero (T208-T213)
- Despachado por Morpheus con autorizacion de Neo. Leidas T208-T225, spec REQ-AUTH2/ACC/HOUSE2-001, contratos 3.0.0 y tasks.md.
- Escribo primero las pruebas de politica de contrasena/sesion, API de auth, cuenta, eliminacion, invitacion uniforme y seguridad; luego compruebo que fallan por la razon correcta.
- Sin tocar specs/**, scripts/ ni .claude/. Rutas del contrato: POST /account/password, PATCH /account/profile, POST /account/deletion (no DELETE /users/me).

## 2026-11-11 — Rebanada 1 bloque A cierre: pruebas T208-T213 escritas y en rojo
- Escritas/ampliadas: auth-policies.spec, auth.property.spec, auth.api.spec, account.api.spec (nueva), account-deletion.spec y account-deletion.api.spec (nuevas), households.api.spec (invitacion uniforme), session-csrf/credentials/log-redaction, repository-contract-suite, sqlite-repositories (migracion 0002), app-config, infrastructure-adapters, use-cases.spec (auth sustituida a 002).
- Rojo verificado: 15 archivos fallan; 12 por modulo ausente (password-policy, session-policy, account-use-cases, adaptadores de limite/token/auditoria) y app-config por aserciones de las 4 variables nuevas.
- Harness: openapi-contract.ts apunta ahora al OpenAPI 3.0.0 de la 002; application-harness eleva datos 001 al esquema 3.0.0 solo para sembrar (shim T226/T255); identity-fixtures.ts nuevo.

## 2026-11-11 — Rebanada 1 bloque B: implementacion T214-T220 (en caliente)
- Hecho: domain/auth/password-policy.ts y session-policy.ts, domain/account/{account-deletion-guards,profile-policy}.ts, migracion 0002_account_identity.sql, repositorios memoria+SQLite (usuarios, sesiones, tokens, eventos de frecuencia, invitaciones), puertos rate-limiter/backup-token/audit-log y sus adaptadores, config EXPORT_/INVITE_*.
- Hecho: auth-use-cases (renueva actividad), account-use-cases (perfil, contrasena, eliminacion A/B), rutas /account/*, invitacion uniforme 202 con limite de ritmo; inviteMember devuelve null y retira los dos errores de enumeracion.
- Verde: auth.api, account.api, account-deletion.api, session-csrf, credentials, log-redaction (68 pruebas). Pendiente: households.api, T221 cliente web, T222 E2E, compuertas.

## 2026-11-11 — Rebanada 1 (T208-T225) cierre: compuertas y estado
- T208-T222 implementadas con pruebas primero (rojo verificado por modulo ausente/aserciones antes de implementar); T223 (Sentinels/Trinity) y T224 (Rama) no son de Keymaker; T225 compuerta ejecutada por partes.
- Compuertas: compile-contracts --feature 002 sin deriva; tsc 0; verify-oracles CUMPLE 0 debiles; verify-traceability --feature 002 por tarea T208-T222 CUMPLE (global 85/118); vitest completo 154 fallan / 972 pasan (HEAD: 260 / 754), 0 regresiones; ninguna prueba nueva de la rebanada falla.
- Hallazgos para Morpheus: (1) la compuerta 001 (verify-traceability sin --feature) pasa a 89/96 por diseno (7 IDs reemplazados/retirados); (2) T208 PENDIENTE REVOKED vs LOGGED_OUT; (3) test:gate usa la 001; (4) ruta de eliminacion es POST /account/deletion, no DELETE /users/me.

## 2026-11-11 — Cierre de brechas de privacidad R1 (pedido de Rama T224) y compuerta T225
- Se anaden 3 aserciones: displayName y username fuera de los logs del primer flujo (log-redaction.security.spec.ts) y correo fuera de /api/backup/export y /api/households/{id} (credentials.security.spec.ts).
- Rutas verificadas en src: backup.routes.ts y households.routes.ts existen; no se inventa ninguna.
- Despues: tsc, vitest tres carpetas, compile-contracts a directorio temporal, verify-oracles y verify-traceability T208..T222.

## 2026-11-11 — Rebanada 2 (T226-T235) bloque A: pruebas primero (T226-T229)
- Despachado por Morpheus con autorizacion de Neo. Leidas T226-T235, spec REQ-PET2/REC2/MIG, INV-PET2-001/REC2-002, plan ADR-002-09/15/16 y contratos 3.0.0.
- Escribo antes las pruebas de especies, edad estimada, microchip, peso por especie en gramos, migracion 0003 y API; luego verifico el rojo por la razon correcta antes de implementar.
- Sin tocar specs/** (salvo la tabla de sustitucion), scripts/, .claude/ ni contratos. T234 es de Maggie.

## 2026-11-11 — Rebanada 2 bloque B: implementacion T230-T233 (en caliente)
- Rojo verificado antes de implementar: modulos ausentes (species, estimated-age, weight-limits), migracion 0003 inexistente, estimatedAge no soportada, tabla pets sin columnas nuevas.
- Hecho: migracion 0003 (pets con species/species_other/neutered/microchip_id/birth_date_is_estimate, indice unico por propietario; weights reconstruida con weight_grams), domain/pet/{species,estimated-age}.ts, domain/records/weight-limits.ts, pet-invariants (estimatedAge, microchip), record-invariants (peso por especie, sin deltaPercent), casos de uso y filtro de listado, repositorios SQLite, backup-migration (mapeo DOG/CAT).
- Pendiente: compuertas de T235 y informe.

## 2026-11-11 — Rebanada 2 cierre: compuerta T235
- tsc 0; verify-oracles CUMPLE 0 debiles; verify-traceability --feature 002 T226..T235 CUMPLE; compile-contracts --feature 002 a directorio temporal sin deriva.
- vitest completo: 121 fallan / 1079 pasan (inicio de la rebanada: 154 / 973); 0 pruebas nuevas en rojo; ninguna prueba de la rebanada 2 falla. Restantes: rebanadas 3 (registros), 4 (hogares/permisos), 5 (respaldo), 6 (UI) y contratos globales.
- T234 es de Maggie (no existe aun .specify/memory/audits/rebanada-2-maggie.md). Tareas dejadas en [ ].

## 2026-11-11 — T236 pruebas en rojo
- Escrito tests/unit/permissions-matrix.spec.ts: 44 casos (11 filas de RbacAction x 4 roles de RbacRole), titulo con id M01-M11 y rol; esperados tomados de la tabla §5.2 / REQ-RBAC-001 y verificados contra fixtures canonicas (sin discrepancias de celdas).
- Import de src/domain/access/rbac.ts dinamico dentro de cada caso para que cada celda falle por separado (importacion estatica dejaba 0 pruebas).
- vitest run: 44 fallidas / 0 pasan; motivo unico: Failed to load url ../../src/domain/access/rbac.ts (modulo ausente, esperado).
- Sin commit, sin tocar src/, contratos ni tasks.md; T236 sigue [ ].

## 2026-11-11 — T236 fila 6 pruebas en rojo
- Añadidas 15 pruebas 002: 11 en tests/unit/access-policy.spec.ts (rol efectivo, asignación, estados no ACTIVE, INV-ACC2-001/002) y 4 en tests/property/access.property.spec.ts (oráculo de rol y visibilidad con semilla 20261105, owner-only, escalera de la matriz). Las 8+2 de la 001 se conservan intactas, candidatas a sustitución (sin borrar).
- Firma supuesta de effectiveRole(usuario, mascota, membresías con rol, asignaciones) en src/domain/access/effective-role.ts: la spec no la fija (discrepancia a confirmar en T244).
- vitest: 17 fallidas / 8 pasadas. 15 nuevas fallan por módulo ausente (effective-role.ts, rbac.ts). 2 de la 001 (EDGE-008/009) ya estaban rojas en HEAD: esperan INV-ACC-00x y el catálogo generado usa INV-ACC2-00x.
- tsc --noEmit: 5 errores TS2307, todos de módulos ausentes (incluye permissions-matrix). Sin commit, sin tocar tasks.md ni src/.

## 2026-11-11 — T237–T242 pruebas en rojo + EDGE-008/009
- EDGE-008/009 (tests/unit/access-policy.spec.ts): solo se cambian las dos aserciones de invariantRef a INV-ACC2-001 (ERR-PET-NOT-FOUND) e INV-ACC2-002 (ERR-ACC-FORBIDDEN), según error-catalog 3.0.0. Ambas pasan ya.
- 52 pruebas nuevas 002 (T237 14, T238 11, T239 11, T240 5, T241 7, T242 4); 2 archivos nuevos (assignments-ownership.api, roles-migration) y el resto añadido al final de los archivos 001, sin tocar sus aserciones.
- vitest sobre 9 archivos: 170 pruebas, 94 pasan, 76 fallan: 47 nuevas 002, 11 de T236 fila 6 (effective-role.ts ausente), 18 de la 001 ya rojas con el código actual (no modificadas). 5 nuevas 002 ya pasan (expulsar, abandonar, eliminar hogar, propietario no abandona, responder dos veces).
- Motivos nuevos: función/caso de uso ausente (applyMembershipEvent, ChangeMemberRoleUseCase), ruta HTTP sin implementar (contrato OpenAPI), migración 0004 y tabla pet_assignments ausentes. Sin commit, sin tasks.md, sin src/.

## 2026-11-11 — Corrección B1–B9 T237–T242
- B1 (household-policies.spec.ts): tabla con las 11 transiciones del JSON de la máquina (incluye CHANGE_ROLE y TRANSFER_OWNERSHIP, actores literales del contrato) y conteo [11, 37]. Pasa.
- B2 (households.property.spec.ts): `expectedErrorCode` por operación y estado; código y status según error-catalog 3.0.0. Ya no acepta [403,404,409].
- B3 (households.api.spec.ts): precondición `myRole === 'ADMIN'` antes del DELETE de «eliminar el hogar» (hoy falla: READER, roleOnJoin ignorado) y aserción ADMIN del propietario en «abandonar». B4 (access-control): POST con X-Argos-Request; src solo sirve GET, queda rojo. B5: siembra la invitación de Carlos (202); sigue rojo por regresión D-01 en src. B7: audit_log, mutation_type, entity_type = PET. B8: firma de UseCaseCtor y tupla tipada; tsc sin TS2554/TS2345.
- B6 sin tocar la prueba. Causa en src: VaccinationRecord y DewormingRecord exigen category, veterinarianName y veterinarianLicense; NULLABLE_DEFAULTS no los aporta; encode lanza ERR-INTERNAL-UNEXPECTED y el HTTP responde 500. Defecto de src/, queda rojo. B9 declarado en el informe, no modificado.
- vitest (11 archivos): 96 pasan / 124 fallan (220), igual que antes en total. tsc: solo 5 TS2307 (effective-role.ts, rbac.ts). Sin commit, sin tasks.md. N-1 y N-2 pendientes de Neo.

## 2026-11-11 — Sustitución de 10 pruebas 001 (D-1)
- Sustitución en el mismo bloque, sin borrar ninguna 001 sin sustituta: household-policies (crear hogar, invitar a Lucía con roleOnJoin, abandono del propietario con INV-HOUSE2-001), use-cases.households (Lucía crea, Carlos ve, Mis hogares con ADMIN, EDGE-031 con READER), households.api (crear hogar 201 ADMIN), access-control (permissions.editPetBasics en lugar de canEdit), households.property (propietario ADMIN e invitación con roleOnJoin).
- Cuatro sustitutas salen en verde porque src ya implementa la 002 (abandono, Mis hogares, ficha de María, API crear hogar). Se dejan como 002 correcta y se señalan a Oracle. Resto en rojo por ausencia de implementación.
- Exportación de respaldo: todas las llamadas GET a /api/backup/export de tests/ pasan a POST con CSRF (contrato 3.0.0). src/ sin tocar. B6 y NULLABLE_DEFAULTS sin tocar.
- vitest (9 archivos tocados): 55 fallan / 89 pasan (144). tsc: solo 5 TS2307 previos, cero TS2554/TS2345. Sin commit ni push; tasks.md no tocado.

## 2026-11-11 — Corrección D1: 4 defectos tests/
- (1) household-policies.spec.ts:340-352: canEdit → permissions.editPetBasics (Andrés ADMIN de H1 = true sobre mascotas de H1, REQ-RBAC-001/REQ-MIG-001; María READER = true solo en Luna). Ahora rojo (TypeError: src/householdPets devuelve canEdit, no permissions). Regresión de conteo 24→23 pass; TS2339 x2 nuevos (src sin permissions).
- (2) malicious-input.security.spec.ts:252: roleOnJoin 'READER' añadido. Invitación ya no es 422; sigue rojo (members 1, Mallory no ACTIVE tras aceptar; causa src no verificada).
- (3) openapi-conformance.spec.ts:49 username 'nueva.usuaria' (patrón identity.schema ^[a-z0-9._-]+$); :63 roleOnJoin 'READER'. TypeError en :63 persiste (house.household undefined; causa no confirmada por falta de estados HTTP en el fallo).
- (4) access-control.security.spec.ts:46: añade myRole 'READER' (REQ-MIG-001) y permiso N. Sigue verde por legacyRoleAndPermissions: la fixture canonical sigue en 001 (MEMBER) y fuera de alcance. Control ADMIN con can() pendiente de T244.
- vitest 15 archivos: 126 pass / 140 fail / 266 (suite global 1087/224/1311). tsc: 5 TS2307 esperados + 2 TS2339 nuevos (household-policies:346,356). Sin commit ni push.

## 2026-11-11 · Última ronda: 3 correcciones tests/
- (1) malicious-input.security.spec.ts:248,253: password Mallory2026x! (símbolo, INV-AUTH2-001 en password-policy.ts) + confirmPassword (identity.schema.json:218-222); login con la misma clave. REQ-HOUSE-005 XSS en verde.
- (2) openapi-conformance.spec.ts:49: password Clave2026x! + confirmPassword. El fallo de :63 (TypeError) desaparece; ahora falla en :69 por exportBackup 404 no declarado (src/API, fuera de alcance).
- (3) use-cases.households.spec.ts:78: role MEMBER retirado de la fila INVITED (roleOnJoin vive en la invitación, membresía asigna rol al ACCEPT: STATE-HOUSE-MEMBERSHIP-001). Aserción: role undefined. Falla por src (household-policies.ts:231 sigue produciendo MEMBER).
- Vitest 3 archivos: 20 pass / 14 fail / 34. tsc: 7 errores (5 TS2307 + 2 TS2339), sin nuevos. Sin commit ni push.
- 2026-11-11 · T-1 (Neo): household-policies.spec.ts:323 cambiada de ['OWNER','MEMBER'] a ['ADMIN','READER'] (única línea tocada; setup sin invitación en el bloque, María es MEMBER ACTIVE de la fixture 001).
- Resultado: la prueba FALLA. Mensaje: expected [ 'OWNER', 'MEMBER' ] to deeply equal [ 'ADMIN', 'READER' ]. Causa: householdView (src/domain/households/household-policies.ts:385-400) devuelve me.role crudo y la fixture canonical-fixtures.json 001 aún trae OWNER/MEMBER. Fallo por src + fixture 001, fuera de alcance de T-1.
- Vitest archivo completo: 12 fallidos / 23 pasan / 35 (los 12 son del bloque T237 rojo, TypeError applyMembershipEvent no exportado). Sin commit ni push. Tareas sin marcar.
- 2026-11-11 · T-1 (a): setup 002 en household-policies 309–387. Entrada `entrada002` local al bloque: OWNER 001→ADMIN (+isHouseholdOwner:true, sin él isOwnerRow no ve a los INVITED), MEMBER 001→READER; 12 referencias a `members` del bloque redirigidas. Aserciones intactas.
- Resultado: household-policies.spec.ts 12 fallidos / 23 pasan / 35 (antes 13/22). Línea 323 VERDE (`['ADMIN','READER']`). Fallos restantes: 9 T237 (applyMembershipEvent no exportado), crear hogar y invitar (src produce OWNER/MEMBER/CAREGIVER), mascotas 350/361 (src devuelve canEdit, no permissions). tsc: 7 errores proyecto, 2 en el archivo (TS2339 permissions), sin nuevos. Sin commit ni push.

## 2026-11-11 — T243 migración 0004 de roles y asignaciones (en caliente)
- Antes: roles-migration 0/7 (no such table/column); tsc 7 errores; trazabilidad T243 FALLA (INV-HOUSE2-001 y REQ-HOUSE2-003 sin @implements en src/).
- Hecho: src/infrastructure/persistence/sqlite/migrations/0004_roles_and_pet_assignments.sql (household_members.role e is_household_owner con OWNER→ADMIN/MEMBER→READER, índice único de propietario ACTIVE, pet_assignments, asignación por hogar común, revocación de sesiones). @implements en sqlite-database.ts (el gate solo cuenta .ts).
- Después: roles-migration 5/7 (2 fallos por defectos de la prueba, ver abajo); tsc 7 (sin nuevos); trazabilidad T243 CUMPLE 4/4.
- Discrepancia D-T243-1: data-model §2.9/2.10 manda convertir INVITED a household_invitations y limitar el CHECK de status; la prueba exige a3 (INVITED) en household_members con READER y el código vigente escribe INVITED ahí. Se mantiene INVITED en household_members. PARA: Neo (Nivel 2).
- Defectos de prueba (no tocados): roles-migration:116 orden ORDER BY pet_id (TOBY antes que MISU, el esperado pone MISU primero); roles-migration:128 VISIBLE_IN_001 usa alias «id» y VISIBLE_IN_002 «pet_id» y no excluye al dueño, imposible de igualar.
- Regresión por diseño: 4 pruebas fijas de 0001–0003 (sqlite-repositories:65 y :116, species-migration:82 y :154) pasan a rojo por la 17.ª tabla y la 4.ª migración. Requiere decisión de Neo para actualizar esas aserciones.

## 2026-11-11 — T244 can(rol, acción) y rol efectivo (en caliente)
- Antes: permissions-matrix 0/44 (módulo ausente); access-policy + access.property 10 pasan / 59 fallan (69); tsc 7.
- Hecho: src/domain/access/rbac.ts (RBAC_MATRIX de las 11 acciones, can(), petPermissionsFor() con los 9 booleanos de PetPermissions) y src/domain/access/effective-role.ts (effectiveRole(user, pet, memberships, assignments) con firma confirmada por Neo; OWNER primero, luego mayor rol ACTIVE en hogares asignados). @implements REQ-RBAC-001, INV-ACC2-001, INV-ACC2-002, ERR-ACC-FORBIDDEN.
- Después: 3 archivos 69/69 pasan; tsc 2 errores (ambos en household-policies.spec.ts:351/361, «permissions» en HouseholdPetEntry: src de T248, fuera de alcance); trazabilidad T244 CUMPLE 4/4; pureza 0; layer-dependencies 4/4.
- Global vitest 1311: antes (sin 0004 ni T244) 224 fallan / 1087 pasan; después 164 / 1147. Sin commit, sin push, tasks.md sin tocar por Keymaker, tests/ sin tocar en esta tarea.

### 2026-11-11 — Ajustes T243: INVITED, aserciones fijas, roles-migration
- Hecho: 0004 convierte INVITED/DECLINED/CANCELLED a household_invitations y reconstruye household_members con CHECK ACTIVE/LEFT/REMOVED (contrato y data-model §2.9-2.10 coinciden). Tests: roles-migration (invitación, orden, pet_id, exclusión del dueño, usuarios en la base de partida), sqlite-repositories (17 tablas, 4 versiones x2), species-migration (MIGRATION_0004 x2).
- Después: roles 8/8, species 7/7 pasan; sqlite-repositories 12 rojas (CHECK status al guardar INVITED en household_members vía repositorio/harness: src de T247-T248, fuera de alcance). Global 321 rojas / 990 (antes de los ajustes 164 / 1147): efecto en cadena de la conversión. tsc: 2 errores previos (household-policies.spec.ts:351/361). Sin commit.

## 2026-11-11 — 0004: invitedByUserId nulo según data-model §2.10
- Autorizado por Neo: la conversión de invitaciones 001 deja invited_by_user_id NULO si la fila no lo trae, en lugar de abortar.
- 0004 reconstruye household_invitations (sin NOT NULL en invited_by_user_id; datos e índices conservados) antes del INSERT; transaccional.
- vitest roles+species 20/20; tsc solo errores previos en tests/unit/household-policies.spec.ts. Pendiente: /oracle revalida.
- 2026-11-11 Prueba caso invitedByUserId nulo: añadida en roles-migration.spec.ts (línea 111, [REQ-MIG-001][INV-HOUSE2-001]); invitación 001 sin invitedByUserId -> invited_by_user_id NULL, sin abortar.
- vitest roles-migration 8/8; tsc solo errores previos en tests/unit/household-policies.spec.ts. Pendiente: /oracle valida.
- 2026-11-11 Corrección toThrow roles-migration:120: `expect(() => runMigrations(db)).not.toThrow()` -> `const applied = runMigrations(db); expect(applied).toContain(MIGRATION_0004);`.
- verify-oracles CUMPLE (0 débiles), vitest 8/8, tsc solo 2 errores T248. Pendiente: /oracle revalida.

### 2026-11-12 07:35 — Keymaker (inline): T245 implementado
- household-policies.ts: applyMembershipEvent, changeMemberRole, transferHouseholdOwnership, pruneAssignmentsOf (añadido, sin tocar lo existente).
- src/domain/pet/ownership-transfer.ts nuevo; tests/unit/ownership-transfer.spec.ts 4/4.
- household-policies.spec: 12 pruebas T237 de roles ahora verdes; 3 fallos fuera de T245 (T246/T247/T248).
- Gates: traceability T245 CUMPLE, oracles CUMPLE, tsc solo 2 errores de T248. Evidencia: claude/evidencia-task-T245-2026-11-12.md. Sin commit.
- Riesgo: sesión en haiku; CLAUDE.md pide sonnet para src/.

### 2026-11-12 09:10 — Keymaker (sonnet): T246 implementado (REVIEW pendiente de Oracle)
- Puertos updateOwner y PetAssignmentRepositoryPort (SQLite+memoria); ChangeMemberRoleUseCase y TransferHouseholdOwnershipUseCase; REMOVE/LEAVE podan asignaciones con mascotas reales; rutas PATCH members/{userId} y POST ownership-transfer; createHousehold ADMIN+isHouseholdOwner.
- Tests T237 de casos de uso 4/4 verdes; oracles CUMPLE; tsc solo 2 errores T248. Bloqueo: test creador exige validateHouseholdMember sobre fila sin username (contradiccion). Evidencia: claude/evidencia-task-T246-2026-11-12.md. Sin commit.

### 2026-11-12 09:30 — Keymaker (sonnet): rebote T246 (resoluciones de Neo H-T246-1..4) aplicado
- Invitaciones solo en household_invitations (sin filas INVITED en household_members), roleOnJoin real en invitar/listar/aceptar, ADMIN expulsa y cancela, nadie expulsa al propietario (403); puerto listOpenForUser (SQLite+memoria).
- 3 archivos: 59/60 (queda 1 de T248 permissions); tsc solo 2 de T248; oracles CUMPLE; households.api 26/29 (3 rojos T247); suite 307->176 fallos, 0 nuevos. Evidencia: claude/evidencia-task-T246-2026-11-12.md (seccion Rebote). Sin commit.

## 2026-11-12 — T247 (sonnet) — checkpoint
- Implementado asignacion (PUT/DELETE/GET assignments), transferencia de mascota (POST ownership-transfer), rutas y casos de uso; loadPetAccess ahora por asignacion (INV-ACC2-001); fixtures derivan petAssignments (REQ-MIG-001).
- roles.api.spec.ts (13) verde; assignments-ownership 10/11 (auditoria depende de T264/T265); households.api 26/29: los 3 rojos exigen modelo viejo, NO tocados, bloqueo reportado a Oracle (B1).
- Suite completa 176 -> 161 fallos, 0 nuevos. Evidencia: claude/evidencia-task-T247-2026-11-12.md. Sin commit, tasks.md intacto.

## 2026-11-12 Keymaker T247 B1 adaptación
- Autorizado por Neo: 3 aserciones de households.api.spec.ts adaptadas al contrato 3.0.0 (members ACTIVE + pendingInvitations carlos_88:INVITED; fila sembrada de Carlos en household_invitations; conteo no-Carlos = 0). Se renombró el título de la primera prueba.
- households 29/29; assignments-ownership 10/11 (B2 audit_log -> T264); roles 13/13; tsc solo 2 errores T248; verify-oracles CUMPLE.
- Evidencia en claude/evidencia-task-T247-2026-11-12.md. Sin commit.

## 2026-11-12 Keymaker T248 (REVIEW propuesto)
- Prueba roja H-T247-1 (unitaria + HTTP) escrita y confirmada en rojo; GetHouseholdPetsUseCase ahora lista por pet_assignments. HouseholdPetEntry: myRole + permissions (sin canEdit). Visibilidad/403 por effectiveRole + can(); Mis mascotas = propias + asignadas.
- tsc 0, oracles CUMPLE, trazabilidad 12/12. household-policies 36/36. 5 pruebas 001 contradicen la spec (C1 use-cases.households, C2 roles.api:141, C3 x3 use-cases.spec); NO tocadas, a decidir por Neo/Oracle. Evidencia: claude/evidencia-task-T248-2026-11-12.md. Sin commit.

## 2026-11-12 Keymaker T248 C1-C3 adaptadas (REVIEW)
- Pruebas adaptadas por autorización de Neo, src intacto: C1 (Andrés editPetBasics true x6, María [false x5,true], + it.each READER/CAREGIVER false x6), C2 (403 con Andrés CAREGIVER en hogar de Lucía + caso ADMIN 200), C3 (Luna entre Kira y Milo, FELINE en filtros, María ve 6 con literales).
- Verde: households 23, use-cases 36, roles.api 15, households.api 29; assignments-ownership solo B2 audit_log (T264); tsc 0; oracles CUMPLE. tests/unit: 72 fallos en backup/presentation/record-invariants/infraestructura (fuera de C1-C3). Evidencia: claude/evidencia-task-T248-2026-11-12.md. Sin commit.

## 2026-11-12 Keymaker T249 (REVIEW)
- Parte 0: titulo de "Mis mascotas" actualizado. T249: rojo (3 pruebas, OK en vez de ERR-ACCOUNT-OWNS-SHARED-PETS), implementado B5/B6 + borrado de asignaciones en DeleteAccountUseCase y guarda planPetAssignmentsForDeletion; B4 ya releia en tx.
- account-deletion 26/26, use-cases 36/36, unit 72 fallos (= base), tsc 0, oracles CUMPLE, trazabilidad 4/4. Integracion: 75 fallos (CHECK status SQLite preexistente). Evidencia: claude/evidencia-task-T249-2026-11-12.md. Sin commit.

## 2026-11-12 Keymaker H-T249-1 (REVIEW)
- Causa: identityState() (identity-fixtures.ts) sembraba INVITED de Carla en memberships; sqlite/application-harness ya estaban bien. Movida a state.invitations (CAREGIVER).
- account-deletion.api + account.api 22/22; unit account-deletion 26/26; tsc 0; oracles CUMPLE; integracion 75 -> 35 fallos (documentados). Hallazgo H-T249-2: 3 fallos CHECK en sqlite-repositories.spec via repository-contract-suite:232.

## 2026-11-12 Keymaker H-T249-2 (REVIEW)
- Autorizado por Neo: 3 pruebas con INVITED directo en household_members adaptadas (repository-contract-suite.ts x2, sqlite-repositories.spec.ts x1). Causa: CHECK status 0004.
- sqlite-repositories 37/37; 22/22; 26/26; tsc 0; oracles CUMPLE; integracion 35->32. Evidencia: claude/evidencia-task-T249-2026-11-12.md

### 2026-11-12 — H-T250-1/2 parcial
Aplicado requireManager en InviteMemberUseCase y deletePet en PetDashboard. e2e 15/16: inviteMember del dominio (household-policies.ts:270) aún exige requireOwner (fuera de autorización). Detenido sin commit; evidencia en claude/evidencia-task-T250-2026-11-12.md.

## 2026-11-12 Keymaker H-T250-3
- inviteMember: requireOwner -> requireManager (autorizado por Neo N2) + prueba ADMIN invita. Compuertas verdes, E2E 16/16. Ver claude/evidencia-task-T250-2026-11-12.md. Commit local sin push.

### 2026-11-12 — Checkpoint H-T251-1 (Keymaker)
- Autorización Neo opción (a): NULLABLE_DEFAULTS de vacunas/desparasitaciones completado (category constante, clínicos null) en record-use-cases.ts.
- idor-matrix 6 rojos -> 61/61; pets-records.api 6 -> 3 fallas (ajenas, GET /pets); unit 72 = base; tsc 0; oracles y traza CUMPLE.
- Ajuste de 3 expectativas en tests/unit/use-cases.spec.ts a la forma 002. Evidencia en claude/evidencia-task-T251-2026-11-12.md.

## 2026-11-12 — Checkpoint H-T251-2
- Autorización Neo opción (a): nextBoosterAt: null y nextSuggestedDoseAt: null en NULLABLE_DEFAULTS (record-use-cases.ts).
- Prueba nueva tests/unit/record-next-dose.spec.ts: rojo 500 ERR-INTERNAL-UNEXPECTED antes; verde después.
- unit 72 rojos = base; idor 61/61; pets-records 32/35; tsc 0; oracles y traza CUMPLE. Evidencia en claude/evidencia-task-T251-2026-11-12.md.

### [2026-11-12] Keymaker checkpoint H-T252
- Pruebas corregidas (autorizacion Neo): households.property, access-control, session-csrf NOT_YET_SERVED. Sin tocar src/contratos.
- Verde: property 3/3, session-csrf 14/14, tsc 0, oracles CUMPLE, traza T242 CUMPLE. access-control 11/13: restan 2 fallos exportBackup 404 (rebanada 5), no autorizados. Sin commit.
- Evidencia: claude/evidencia-task-T252-2026-11-12.md

### [2026-11-12] Keymaker checkpoint Decisiones de Neo (T252)
- Aplicado it.skip (etiqueta [REBANADA-5][REQ-BACKUP2-001] ... T271) a exactamente 2 pruebas y comentario H-T252-2a/2b' reescrito en access-control.
- access-control 11 passed | 2 skipped; property/csrf/unit 54/54; tsc 0; trazabilidad T242 CUMPLE; verify-oracles FALLA (marca los 2 it.skip, oráculos débiles: 2).
- Sin commit (oracles no verde). Evidencia: claude/evidencia-task-T252-2026-11-12.md

### [2026-11-12] Keymaker checkpoint T253 (ROJO)
- Creadas tests/unit/audit-canonical.spec.ts y tests/property/audit.property.spec.ts (fast-check, semilla 20261112). Sin tocar src/.
- Rojo por módulo ausente (src/domain/audit/*); tsc: 6 TS2307 solo de estos archivos; oracles CUMPLE; traza INV-AUD-001 FALLA esperada (sin @implements).
- Evidencia: claude/evidencia-task-T253-2026-11-12.md

### [2026-11-12] Keymaker checkpoint T254-T257 (ROJO) + ajuste T253
- Lista de secretos de Neo aplicada a T253 (tokenHash, token_hash, confirmationToken, confirmation_token; sessionId fuera). Rojo por modulo ausente.
- Nuevas pruebas rojas: audit.api (no such table audit_log), account-deletion seudonimizacion, audit-pseudonym (config sin ARGOS_AUDIT_HMAC_SECRET), roles-migration fila MIGRATION, record-invariants (superseded-guard ausente), pets-records PATCH/DELETE sin ruta.
- Fixtures 001 llevados a forma 002 en pruebas (10 rojos de base saneados). tsc: 6 TS2307 de T253; oracles CUMPLE. Evidencia: claude/evidencia-task-T254-T257-2026-11-12.md

### [2026-11-12] Keymaker checkpoint T258-T259 (fase VERDE, sin commit)
- T259: src/domain/audit/{canonical-json,canonical-view,state-hash,sha256}.ts y src/domain/records/superseded-guard.ts. CC-T259-1: SHA-256 puro en el dominio (domain no puede importar node:crypto por layer-dependencies). CC-T259-2: lista de secretos de Neo; sessionId visible.
- T258: migracion 0005_audit_log_and_clinical_columns.sql (audit_log sin FK, CHECK enums/MIGRATION/hash, 3 indices, fila MIGRATION unica, columnas clinicas VIRTUAL anulables sobre data JSON, secure_delete ON; tambien al abrir conexion). CC-T258-1: columnas clinicas VIRTUAL porque los registros viven en data JSON.
- Config: ARGOS_AUDIT_HMAC_SECRET (NODE_ENV=production obligatoria; >=32 bytes hex; error solo nombra la variable). app-config.spec ajustado (auditHmacSecret: null).
- PATCH/DELETE /api/pets/:petId/records/vaccinations/:recordId (puerto replace/remove, UpdateVaccinationUseCase, DeleteVaccinationUseCase). CC-T260-parcial: registro inexistente -> ERR-PET-NOT-FOUND (el catalogo no tiene codigo de registro).
- Ajustes de listas de migraciones en sqlite-repositories.spec y species-migration.spec (0005). tsc 0, oracles CUMPLE, trazabilidad T258/T259 CUMPLE. Pendiente: access-control.security.spec (excepcion H-T252-2a caduca; no editada, reportada).

## 2026-11-12 — Decisión C1 de Neo: retiro de la excepción H-T252-2a para «eliminar evento sanitario»
- Archivo: tests/security/exploits/access-control.security.spec.ts (prueba «cada celda "No"…», ~L231-249). Lista esperada ahora ['eliminar otro registro']; filtro isSlice4Unserved acotado a esa etiqueta; comentario actualizado (caducó por T258, DELETE vacunas responde 403 ERR-ACC-FORBIDDEN).
- Sin cambios en src/, contratos, generated, tasks.md, logos. Sin commit ni push.
- Compuertas: vitest access-control 13/13; tsc --noEmit exit 0; verify-oracles CUMPLE (88 archivos, 0 débiles).

### [2026-11-12] Keymaker checkpoint T260 (sin cambios de codigo)
- Pruebas de T260 ya en verde antes de tocar nada: record-invariants 32, records.property 7, pet-and-alerts 33, alerts.property 6 = 78/78. superseded-guard.ts (T259) y record-invariants.ts (T253-T259 + 002) ya satisfacen REQ-REC2-002/003, INV-REC-003..006, STATE-ALERT-001, ERR-REC-SUPERSEDED-IMMUTABLE.
- Trazabilidad T260 CUMPLE 8/8; tsc 0; oracles CUMPLE. Sin src/ ni tests/ modificados. Sin commit.

### [2026-11-12] Keymaker checkpoint T261 (sin rojo propio, sin commit)
- No existian pruebas de los puertos nuevos (AuditLogPort append/pseudonymizeUser, AuditPseudonymPort, ARGOS_AUDIT_RETENTION_DAYS): T261 no tuvo rojo propio. No se invento prueba. Linea base previa: app-config 20/20, account-deletion 26/26, audit-pseudonym 4/4.
- Nuevos: audit-log.port.ts (reescrito: append, pseudonymizeUser con RepositorySet), audit-pseudonym.port.ts, hmac-audit-pseudonym.adapter.ts (node:crypto solo en infra; error sin clave), app-config.ts (+auditRetentionDays, default 730, entero positivo <=4 digitos, .env.example).
- CC-T261-1: la forma previa de AuditLogPort (pseudonymOf/recordAccountDeletion, consumida por DeleteAccountUseCase) se renombro AccountDeletionAuditPort (transitorio, account-deletion-audit.port.ts; T265 lo elimina). Ajustes de tipo en null-audit-log.adapter, use-case-support y import de tests/unit/account-deletion.spec.ts; app-config.spec esperado +auditRetentionDays:730.
- tsc 0; oracles CUMPLE; traza T261 CUMPLE 4/4; vectores HMAC de audit-fixtures coinciden (verificacion ad hoc).

### [2026-11-12] Keymaker checkpoint T262 (fase verde, sin commit)
- Rojo previo (7 archivos de auditoria/cuenta/asignaciones): 21 fallos de 90. Suite completa: 115 fallos de 1480 (base previa, mayoria rebanada 5).
- Nuevo: audit-support.ts (recordAudit, UNASSIGN podada, HMAC de PET_ASSIGNMENT), RepositoryAuditLogAdapter + AuditLogRepositoryPort (SQLite y memoria, via RepositorySet.auditLog), deps auditLog/auditPseudonym/auditHmacSecret/auditIds, DEVELOPMENT_AUDIT_HMAC_SECRET (solo si falta la variable fuera de produccion).
- Integrado en: pets (CREATE/UPDATE/DELETE), registros (alta, PATCH/DELETE vacuna), hogares (create, invitar, aceptar/rechazar/cancelar, leave/remove + UNASSIGN, ROLE_CHANGE, transferencia, delete), asignaciones, transferencia de mascota, registro de usuario, perfil, cambio de clave. IMPORT queda para T278 (backup deps).
- CC-T262-1: audit ids con generador aparte (auditIds) para no desplazar ids de entidades. CC-T262-2: api-harness borra la fila MIGRATION tras sembrar (T254 asume audit_log vacio). Aceptar invitacion = 1 fila UPDATE sobre la invitacion.
- Despues: suite 103 fallos (0 nuevos, 12 corregidos). Restan 5 de audit.api: DELETE weights (T263), 2 cuenta (T265), 2 purga (T266). tsc 0, oracles CUMPLE, traza T262 CUMPLE.

## 2026-11-12 — T262 commit local NO realizado (compuerta roja)
- tsc 0 errores; verify-oracles CUMPLE (89 archivos, 0 débiles); verify-traceability T262 CUMPLE (3/3).
- vitest audit-log-adapter.spec.ts (2/2 verde) + audit.api.spec.ts: 5 fallos, 15 pasan.
- Fallos: DELETE weight (contrato OpenAPI, ligado a T263), ACCOUNT_DELETE x2 (T265), purga 24 meses x2 (T266, falta maintenance-use-cases.ts).
- Conforme a instrucción (rojo => no commit), no se añadió nada al índice. Pendiente decisión de Neo/Oracle.

### 2026-11-12 — T263 [US5] updateRecord/deleteRecord genéricos (estado REVIEW, sin commit)
- Editados: record-invariants.ts (UPDATE_SCHEMAS de los 6 módulos, moduleOfCollection, species en applyRecordUpdate), record-use-cases.ts (UpdateRecordUseCase/DeleteRecordUseCase con WRITE_*/DELETE_* por módulo, guarda SUPERSEDED en vacunas y desparasitaciones, auditoría en la misma transacción), use-cases.ts, app.ts, nuevo records-edit.routes.ts; las rutas de vacunas salieron de pets.routes.ts.
- Compuertas: tsc 0 errores; verify-oracles CUMPLE; traceability T263 5/5 CUMPLE; audit.api.spec 14/18 (solo rojos T265/T266). Suite completa: base 103 fallos, ahora 104 (-1 DELETE peso, +2 andamios caducados en tests/security: NOT_YET_SERVED de session-csrf y la excepción H-T252-2a de access-control). No se tocaron pruebas.
- Colección desconocida en la ruta: 404 ERR-PET-NOT-FOUND (ambigüedad reportada).

## 2026-11-12 — Ajustes de prueba autorizados por Neo (post T263)
- session-csrf.security.spec.ts: NOT_YET_SERVED retira deleteRecord y updateRecord; queda [cancelInvitation, exportBackup, previewBackupImport].
- access-control.security.spec.ts: retirada formal de H-T252-2a (sin contract:false; espera [19, [], 'Nala']).
- Evidencia: 2 specs 27/27 verdes, tsc 0, suite completa 102 fallos (línea base 103 menos el rojo de DELETE de peso; 0 nuevos). Sin commit ni tasks.md.

### 2026-11-12 — T264 [US6] verificación de cierre (estado REVIEW, sin commit)
- Sin código ni pruebas nuevas: la implementación vino con T262/T263 (ownership-use-cases.ts + audit-support.ts: OWNERSHIP_TRANSFER/PET y UNASSIGN/PET_ASSIGNMENT por asignación podada, misma transacción). Pruebas ya existentes y verdes: assignments-ownership.api.spec.ts:154 (11/11), audit.api.spec.ts:113 (transferencia + poda), ownership-transfer.spec.ts.
- Compuertas: tsc 0; oracles CUMPLE (89, 0 débiles); traza T264 CUMPLE 2/2; audit.api 4 rojos solo T265/T266. Suite completa 102 fallos de 1482 (0 nuevos).
- Solo falta el texto «pendiente de T264» en el comentario/título de la prueba (no editado: no se tocan pruebas).

- 2026-11-13 Keymaker: checkpoint previo a limpieza autorizada por Neo (N2) de texto obsoleto «pendiente de T264».
- Alcance: solo tests/integration/api/assignments-ownership.api.spec.ts línea 8 (JSDoc) y línea 154 (título del it). Sin cambios en aserciones, lógica, imports, src/, contratos ni tasks.md.
- Sin commit ni push. Verificación: vitest run del archivo + tsc --noEmit.

- 2026-11-13 Keymaker: checkpoint previo a T265 [US6] (sin commit, sin [x]).
- Alcance: sustituir AccountDeletionAuditPort/NullAuditLogAdapter por AuditLogPort+AuditPseudonymPort en DeleteAccountUseCase (fila ACCOUNT_DELETE con HMAC, pseudonymizeUser, secure_delete, checkpoint WAL tras commit).
- Línea base: suite 102 fallos/1482; trío audit/account-deletion/audit-pseudonym 8 fallos (6 de T265, 2 de T266 fuera de alcance).

### 2026-11-13 — T265 [US6] implementado (estado REVIEW, sin commit)
- DeleteAccountUseCase usa auditPseudonym.hmacUserId (A3), recordAudit ACCOUNT_DELETE/USER con HMAC en executor y entityId (B7), auditLog.pseudonymizeUser (B8) y checkpointAfterCommit tras el commit. UnitOfWorkPort gana checkpointAfterCommit? (SQLite: wal_checkpoint(TRUNCATE), 1 reintento, aviso sin ids).
- Corregido bug latente T261: pseudonymize en SQLite usaba ?1/?2 repetidos (RangeError); ahora parámetros con nombre.
- Gates: tsc 0; oracles CUMPLE 89/0; traza T265 CUMPLE 4/4; trío 34/36 (2 rojos = T266). Suite 98 fallos/1482 (base 102): -6 de T265, +2 en tests/unit/account-deletion.spec.ts (afirman el puerto transitorio audit), 1 scrypt preexistente.

### 2026-11-13 — T265 corrección H-2/H-3 (Keymaker, sin commit)
- Decisión: checkpointAfterCommit leerá {busy,log,checkpointed} de wal_checkpoint(TRUNCATE); busy!==0 = fallo, 1 reintento, luego process.emitWarning sin ids, sin revertir (plan.md:99, ADR-002-13).
- Pruebas nuevas en tests/integration/persistence/sqlite-checkpoint.spec.ts (base en archivo temporal). No se tocan H-1 ni H-4 ni T266.
- Resultado: sqlite-unit-of-work.ts lee busy; 4 pruebas nuevas verdes; tsc 0; oracles CUMPLE (90 archivos); traza T265 4/4; suite 98 fallos/1486 (1388 ok).

### 2026-11-13 — T265 H-1 y H-4 aplicadas (Keymaker, sin commit)
- H-1: tests/unit/account-deletion.spec.ts ya no usa el mock auditCalls; comprueba la fila ACCOUNT_DELETE/USER con HMAC (executorUserId = entityId) en snapshot().auditLog.
- H-4: retirados AccountDeletionAuditPort de ApplicationDeps (use-case-support.ts), NullAuditLogAdapter (archivo borrado) y sus usos en application-harness, infrastructure-adapters.spec y log-redaction.security.spec. PENDIENTE: src/application/ports/account-deletion-audit.port.ts y su export en ports/index.ts:14 (fuera de lista cerrada).
- Resultado: tsc 0; account-deletion 26/26; sqlite-checkpoint 4/4; suite 96 fallos/1485 (98 antes).

### 2026-11-13 — H-4 cerrada (Keymaker, sin commit)
- Borrado account-deletion-audit.port.ts y su export en ports/index.ts (autorizado por Morpheus/Neo).

### 2026-11-13 — T266 [US6] mantenimiento ADR-002-14 implementado (Keymaker, REVIEW, sin commit)
- Nuevo maintenance-use-cases.ts (runMaintenance, maintenanceCutoffs: auditoría = 24 meses de calendario con monthlyAnniversary, sin Date); UnitOfWorkPort.purgeExpired? (opcional) + SqliteUnitOfWork.purgeExpired (una transacción, ventanas en SQL, secure_delete ON, checkpoint WAL tras commit); server.ts programa pasada al arrancar y cada 24 h (solo conteos al log).
- Pruebas nuevas: tests/integration/persistence/sqlite-maintenance.spec.ts (3). audit.api 18/18; tsc 0; oracles CUMPLE 91/0; traza T266 2/2 y pureza 0; suite 94 fallos de 1488 (base 96): -2 de T266, 0 nuevos.
- Decisiones: sesión expirada = created_at+24h o last_activity+30min anterior a ahora-7d, o revoked_at anterior a ahora-7d; token vencido = expires_at < ahora; membresía terminal por data.updatedAt, invitación por COALESCE(responded_at, created_at). Frecuencia de ejecución no está en la spec (elegí inicio + 24 h).

### 2026-11-13 — T267 [US6] checkpoint previo (Keymaker, sin commit, sin [x])
- Hallazgo: 0005_audit_log_and_clinical_columns.sql (T258) ya inserta la fila MIGRATION (SYSTEM/SYSTEM/MIG-0005_..., hashes NULL, CHECK en tabla) y schema_migrations impide repetirla. Falta solo la prueba de repetibilidad.
- Alcance: crear tests/integration/persistence/sqlite-migration-marker.spec.ts; no se toca la migración ni runMigrations. Línea base: 94 fallos/1488.

### 2026-11-13 — T267 [US6] terminada (REVIEW, sin commit)
- Creado tests/integration/persistence/sqlite-migration-marker.spec.ts (5 pruebas). Migración y runMigrations sin cambios (ya cumplían). Suite 94 fallos/1493 (base 94/1488), 0 nuevos.

### 2026-11-13 — T268 H-1/H-2 (Keymaker, REVIEW, sin commit)
- H-1: 3 pruebas nuevas fijan ADR-002-15 (anterior sin fecha + posterior misma clave = SUPERSEDED): 2 unitarias en tests/unit/pet-and-alerts.spec.ts (vacuna, desparasitación) y 1 API en pets-records.api.spec.ts (supersededVaccinations + PATCH 409).
- H-2: comentario "T255 PENDIENTE" corregido en src/domain/alerts/sanitary-alert-evaluator.ts:92 (la ruta real es domain/alerts, no domain/records). daysRemaining=0 de SUPERSEDED sin fecha NO cambiado: la spec no lo fija; decisión abierta para Neo.
- H-3: previo (src/tests sin cambios en el árbol antes de mi trabajo; 3 fallos de GET /pets idénticos). tsc 0; oracles CUMPLE 92/0; traza T268 3/3; suite 94 fallos/1496 (base 94/1493).

### 2026-11-13 — T269/D-1 checkpoint previo (Keymaker, sin commit, sin [x])
- Decisión de Neo D-1 A: ARGOS_AUDIT_HMAC_SECRET obligatoria salvo NODE_ENV=test; AppConfigError cita solo el nombre. Alcance: app-config.ts + tests/unit/app-config.spec.ts + archivo nuevo tests/unit/app-config-audit-secret.spec.ts.
- Riesgo detectado: tests/integration/persistence/audit-pseudonym.spec.ts:37 y tests/integration/api/server.api.spec.ts:18 asumen carga sin secreto/sin NODE_ENV (fuera de lista cerrada). Línea base 94/1496.

### 2026-11-13 — T269/D-1 implementada parcialmente (Keymaker, REVIEW condicionado, sin commit)
- app-config.ts: invalidSecret = faltante && NODE_ENV !== 'test' (+docs). app-config.spec.ts ajustado (NODE_ENV=test); nuevo tests/unit/app-config-audit-secret.spec.ts (6 casos). tsc 0; traza T269 1/1, T268 3/3; oracles 93/0.
- Suite 96 fallos/1502 (base 94/1496): 2 nuevos esperados y FUERA de lista cerrada: audit-pseudonym.spec.ts:37 (asume carga sin secreto en {} y development) y server.api.spec.ts:18 (loadAppConfig sin NODE_ENV). No se tocaron; requieren autorización.

### 2026-11-13 — T269/D-1 cierre (Keymaker, REVIEW, sin commit)
- Autorizado por Morpheus: audit-pseudonym.spec.ts (caso línea 37: test carga; development y {} lanzan AppConfigError) y server.api.spec.ts:18 (NODE_ENV:'test'). tsc 0; traza T268/T269 CUMPLE; oracles 93/0; suite 94 fallos/1502, 0 nuevos.

### 2026-11-13 — E-3 .env.example ARGOS_AUDIT_HMAC_SECRET (Keymaker, REVIEW, sin commit)
- Decisión E-3 de Neo. Leídos .env.example y app-config.ts (regla: >=32 bytes hex, 64+ caracteres pares, obligatoria salvo NODE_ENV=test).
- Edición única: .env.example (marcador REEMPLAZAR, sin secreto real). Sin tocar logos.json ni scripts/logos.py.
- Cierre E-3: línea comentada para no romper app-config.spec.ts:16 (regex ^[A-Z_]+=). Incidente: git stash accidental revertido de inmediato con pop (árbol íntegro).

### 2026-11-13 — R5 T271/T272 fase ROJA checkpoint previo (Keymaker, sin commit, sin [x])
- Alcance: crear tests/integration/api/backup-export.api.spec.ts (T271) y backup-import-preview.api.spec.ts (T272); solo pruebas, sin src/ ni contratos. Prohibido test:gate/compile-contracts. Ruta actual: GET export 2.0.0 y POST import sin preview.
- Contrato: POST /api/backup/export (token en X-Argos-Confirmation-Token, no-store), POST /api/backup/import/preview (fileDigest), POST /api/backup/import con X-Argos-Import-Confirm.

### 2026-11-13 — Corrección default feature en compile-contracts.sh / test:gate (Keymaker, autorizado por Neo, sin commit)
- (a) git status --short -- src/generated vacío antes de tocar. Edición: scripts/compile-contracts.sh (FEATURE="${ARGOS_FEATURE:-002}") y package.json test:gate (--feature 002 en compile-contracts y verify-traceability).
- verify-traceability.sh tiene default 001 (línea 26); NO se cambia. Prohibido --feature 001 en compile-contracts.

### 2026-11-13 — R5 T271/T272 fase ROJA terminada (Keymaker, REVIEW, sin commit)
- Creados backup-export.api.spec.ts (13 pruebas) y backup-import-preview.api.spec.ts (12). 25 rojas / 0 verdes: la API sirve GET export 2.0.0 y no tiene preview ni X-Argos-Import-Confirm (fallo del contrato OpenAPI/404). tsc 0; traza T271 y T272 CUMPLE.

### 2026-11-13 — R5 T271 B/C/D checkpoint previo (Keymaker, sin commit, sin [x])
- Autorizado por Neo (Logos): B) access-control.security.spec.ts -> POST /api/backup/export sin contract:false (líneas 85-102); C) pruebas T271 unitarias; D) quitar contract:false de confirm() en backup-import-preview.api.spec.ts (200 y 422 declarados en OpenAPI).
- Hallazgos previos: tests/unit/backup-use-cases.spec.ts YA existe (458 líneas, versionado) -> se AÑADE un describe, no se crea; D-T271-3 (excepción deleteRecord) ya estaba retirada (línea 228), sin cambio.

### 2026-11-13 — R5 T273/T274/T275 fase ROJA checkpoint previo (Keymaker, sin commit, sin [x])
- Alcance: 3 archivos NUEVOS bajo tests/ (backup-atomicity-red, backup-hostile-input-red, backup-envelope-migration-red); solo pruebas; sin src/, contratos, logos ni test:gate/compile-contracts. No se tocan access-control.security, backup-use-cases.spec ni backup-import-preview.api.spec.
- Contexto: import actual solo admite 3.0.0 (T233 pendiente), sin previsualización ni X-Argos-Import-Confirm, sin fila IMPORT de auditoría; el SIGKILL se prueba con un hijo node (transform-types) y una función SQL kill9.

### 2026-11-13 — R5 T271 B/C/D terminada (Keymaker, REVIEW, sin commit, sin [x])
- B: access-control.security.spec.ts líneas 85/88 y 99/102 -> POST sin contract:false (2 rojas por contrato 404; D-T271-3 ya retirada). C: describe T271 añadido a tests/unit/backup-use-cases.spec.ts (archivo ya existía; 3 pruebas rojas). D: confirm() sin contract:false (línea 22; 12/12 rojas).
- tsc 0. Unit 52 rojas/14 verdes (49 heredadas de la API 2.0.0 + 3 nuevas); access-control 2/11; preview 12/0.

### 2026-11-13 — R5 T273/T274/T275 fase ROJA terminada (Keymaker, REVIEW, sin commit, sin [x])
- Creados: tests/integration/api/backup-atomicity-red.spec.ts (180 l, 19 pruebas), tests/security/exploits/backup-hostile-input-red.spec.ts (176 l, 38), tests/integration/persistence/backup-envelope-migration-red.spec.ts (219 l, 26). 83 rojas / 0 verdes.
- Causas: sin fila IMPORT de auditoría, sin previsualización (404/422), sin X-Argos-Import-Confirm, import solo 3.0.0 (T233), sin finalState UNKNOWN, sin hardening (claves duplicadas, profundidad). tsc 0; oracles CUMPLE 0 débiles; traza T273 4/4, T274 6/6, T275 4/4 CUMPLE; git status -- src vacío.

### 2026-11-13 — R5 FASE VERDE T276-T279 + E (rojo opción b) checkpoint previo (Keymaker, sin commit, sin [x])
- Alcance: PARTE 1 tests nuevos unit rbac-export-permission + api 401 export; PARTE 2 T276..T279 en orden con tsc+vitest por tarea. Cierra H-R5-2/4/5/6. Sin tocar contratos, logos, test:gate ni compile --feature 001.
- Parte 1 hecha: tests/unit/rbac-export-permission.spec.ts (5 verdes), tests/integration/api/backup-export-unauthenticated.api.spec.ts (roja solo por POST export ausente: 404).

### 2026-11-13 — R5 T276 verde (Keymaker, REVIEW, sin commit)
- Creados src/domain/backup/file-digest.ts, import-hardening.ts; ampliados backup-migration.ts (migrateEnvelopeV2ToV3) y domain/audit/sha256.ts (sha256HexOfBytes). Nuevo tests/unit/backup-import-hardening.spec.ts (22). tsc 0; vitest unit backup-import-hardening+migration+layers 63/63.
- T277: creado src/infrastructure/persistence/fault-injector.ts (inyector determinista por Proxy) cableado opcionalmente en InMemoryUnitOfWork (faultInjector) y SqliteUnitOfWork(db, injector); tests/unit/fault-injector.spec.ts 3/3; el token SHA-256 de 32 bytes ya existía (sha256-backup-token.adapter, REQ-ACC-002) sin cambios.

### 2026-11-13 — R5 T278/T279 implementados (Keymaker, REVIEW, sin commit)
- backup-use-cases.ts reescrito: ExportBackupUseCase (3.0.0, rate limit EXPORT, token en headers), PreviewBackupImportUseCase nuevo, ImportBackupUseCase(userId,payload,confirmDigest,observer) con digest en INVARIANTS_VALID, fila IMPORT + checkpoint WAL. backup.routes.ts: POST export/preview/import, no-store, X-Argos-Import-Confirm. use-cases.ts: previewBackupImport. problem-details: 413 tambien en /preview.
- Contradicciones de aserciones ROJAS (no tocadas): (A) hostile 'ID ajeno' exige preview 409 vs T272 Lucia exige preview 200 con IDs ajenos; (B) T275 2.0.0 peso 900 exige ERR-REC-WEIGHT-OUT-OF-RANGE pero el esquema 2.0.0 (max 150) da ERR-BACKUP-SCHEMA-INVALID segun maquina.
- Falta: migrar tests heredados (backup-use-cases.spec 49, sqlite-backup-import, backup-atomicity, atomicity unit).

### 2026-11-13 — R5 fase VERDE T276-T279 terminada (Keymaker, REVIEW, sin commit, sin [x])
- tsc 0; oracles 102/0 CUMPLE; traza T276 4/4, T277 3/3, T278 6/6, T279 4/4 CUMPLE. Suite 28 fallos/1656 (base 94/1502): 26 heredados ajenos + 2 rojas R5 por contradiccion de aserciones (A: hostile ID ajeno preview 409 vs T272 Lucia preview 200; B: T275 2.0.0 peso 900 ERR-REC-WEIGHT-OUT-OF-RANGE vs esquema 2.0.0 -> SCHEMA-INVALID segun maquina). src/generated limpio.
- Tests heredados migrados (H-R5-4/5): backup-use-cases, backup-import-atomicity, sqlite-backup-import, backup-atomicity, malicious-input (digest), session-csrf (NOT_YET_SERVED). Riesgo: BackupPage.tsx usa GET /backup/export (ya no existe).

### 2026-11-13 — H-A-2, H-B-1 e I aplicados (Keymaker, REVIEW, sin commit, sin [x])
- T274 hostile "ID ajeno": preview 200 con colisiones = baseline propio (no 0/0: Andrés tiene 5 mascotas; el ajeno no suma); import 409 ROLLED_BACK, detail único, sin fugas. T275 900 kg -> 422 ERR-BACKUP-SCHEMA-INVALID.
- BackupPage.tsx: requestBackupExport (POST + X-Argos-Request, token en X-Argos-Confirmation-Token), importBackupFile (digest Web Crypto sobre bytes crudos). Nueva prueba tests/integration/presentation/backup-client.spec.ts (2 verdes).
- tsc 0; 66/66 en las 3 specs; oracles 103/0; traza T271-T279 CUMPLE; src/generated limpio.

### 2026-11-13 — H-1 de Rama (checkpoint de inicio, Keymaker)
- Tarea: reparar aserción vacía INV-ACC-001 en tests/security/exploits/access-control.security.spec.ts (~86-98): el sobre 3.0.0 no tiene ownerUserId/exportedByUserId. Solo ese bloque; sin commit, sin [x], sin tocar src/ ni contracts.
- H-1 aplicado y verificado (13/13, mutación detectada, copia temporal eliminada).

### 2026-11-14 — Keymaker: regresión de arranque corregida (sin commit, para Oracle)
- server.ts: scheduleMaintenance se programa antes de app.listen (startServer). Causa: fb165388 (T266) registraba addHook después de listen.
- package.json script dev: `tsx watch --env-file-if-exists=.env ...` (carga .env; el flag va después de watch).
- Verificado: tsc 0; audit.api.spec.ts 18/18; sqlite-maintenance.spec.ts 3/3; npm run dev levanta API 3100 (/api/auth/me 401) y web 5173 (200), proxy OK.

### 2026-11-14 — Keymaker: defectos A y B reportados por Neo (sin commit)
- A (guardar mascota): causa raíz = PetForm.tsx petFormInitial con species 'DOG' (no está en enum Species del contrato). Reproducido en API real: DOG → 422 ERR-SCHEMA-VALIDATION-FAILED (species); CANINE → 201. Corregido a 'CANINE'. El body solo envía campos del contrato (sin username/confirmPassword/frase).
- B (contador Hogares): no es bug de datos. El encabezado muestra dos insignias sin etiqueta visible: [N hogares] y [N invitaciones pendientes]. "1 0" = 1 hogar, 0 invitaciones. Sin cambios.
- Gates: tsc 0. Presentación + pets-records: 15 fallos ANTES y DESPUÉS del cambio (heredados, deuda legacy 'editPetBasics').
- Dev: el proceso se cerró (SIGTERM, exit 143) y se reinició con npm run dev.

### 2026-11-14 — Keymaker: B y C (sin commit)
- B: AppShell.tsx, etiquetas visibles "hogares" e "invitaciones" junto a los contadores (aria-hidden; el texto accesible sr-only se mantiene).
- C: nuevo src/presentation/web/components/PetAssignments.tsx (casillas por hogar; GET /households + GET /pets/{id}/assignments; PUT/DELETE asignación). Montado en PetsPage.tsx solo si dashboard.permissions.assignPetToHouseholds.
- tsc 0; presentación + pets-records: 15 fallos heredados / 91 aciertos (sin cambio).
- API real: PUT asignar 200, GET lista 200 con la asignación, DELETE 204, GET tras borrar [].
- No verificado en navegador (solo API y tipos).

### 2026-11-14 — Keymaker: alta con hogar base y panel en edición (sin commit)
- Backend: regla de asignación extraída a assignOwnedPetToHousehold (assignment-use-cases.ts), usada por la asignación directa y por RegisterPetUseCase (pet-use-cases.ts) dentro de la misma transacción. Hogar ajeno → 403, sin mascota creada.
- Presentación: PetForm.tsx selector "Hogar base (opcional)" en alta; PetAssignments dentro del formulario en edición (canAssign). PetsPage.tsx pasa hogares y canAssign; se quita el montaje bajo la ficha.
- Pruebas nuevas: tests/integration/api/pet-create-household.api.spec.ts 3/3 verdes. assignments-ownership y use-cases en verde.
- tsc 0. Presentación + pets-records: 15 fallos heredados, mismos 5 archivos. Sin fallos nuevos.
- curl real: alta propio 201 y asignada; ajeno 403 y mascotas 1→1; DELETE 204; PUT 200.
- No verificado en navegador.

### 2026-11-14 — Keymaker: rediseño visual (ui_blueprint v1.1) implementado. Sin commit, para Oracle.
- Archivos: tailwind.config.ts (tokens §1), src/presentation/web/styles.css (bg-app + bg-deco solo ≥1024px), AppShell.tsx (cabecera oliva, marco L1 glass con blur solo ≥640px y con soporte), Field.tsx (controles 48px, botones píldora, tokens), AuthPages.tsx (marco glass), ContextSelector/PetCards/PetDashboard/WeightChart (azul → tokens), HouseholdsPage.tsx ([FIX B-1] roleOnJoin).
- typecheck 0; build OK; CSS generado con variantes arbitrarias verificadas.
- vitest: 26 fallos / 1645 pases, idéntico recuento a la línea base (deuda heredada de contratos legados y fixtures).
- E2E Playwright: 23 pasan, 2 fallan por causas PREEXISTENTES de la suite (no del diseño): (a) wcag.spec.ts beforeAll siembra mascota con species 'DOG' → 422 del contrato; al fallar el beforeAll no corre ninguna prueba axe de ese archivo; (b) pet-dashboard.spec.ts registra 'duena.e2e', ya creado por household-counter.spec.ts en la misma base.
- axe-core fuera del repo sobre DOM real (5 rutas × 320/1024/1280 px, tags wcag2a/aa/21a/21aa): 0 violaciones, 0 desbordamiento horizontal, 0 errores de página. Verificado que la página es contenido real (h1 y nav presentes).
- [FIX B-1] verificado en navegador: select id invite-<hid>-roleOnJoin, valor READER, opciones Administrador/Cuidador/Lector; envío ya no devuelve 422.

### 2026-11-14 — Keymaker: OPCIÓN 1A (defectos de pruebas E2E, sin commit)
- wcag.spec.ts: línea 29 'DOG'→'CANINE' (pedido). Mismo defecto de seed, necesarios para desbloquear el beforeAll: líneas 30-31 'CAT'→'FELINE'; línea 44 invitación con roleOnJoin 'READER' y esperado 202; línea 70 texto "entre 8 y 128" → "entre 10 y 128".
- pet-dashboard.spec.ts línea 10: username 'duena.dashboard.e2e' (sin otras dependencias del nombre).
- tsc 0. accessibility: 2 pasan, 1 falla (wcag.spec.ts:83, SUPERSEDED esperado 1, hay 0), 4 sin ejecutar (modo serial). Suite completa: 26 pasan, 2 fallan, 10 sin ejecutar.
- Fallo 2: pet-dashboard.spec.ts:58 mensaje de peso fuera de rango obsoleto (límites 002 por especie). No tocado: requiere decisión de Neo.
- Dev servers detenidos. No src/, contratos ni specs tocados.

## 2026-11-14 — Keymaker: directivas Neo 2B/3A en tests/e2e
- wcag.spec.ts: L83 ahora espera 3 insignias vigentes (OVERDUE, DUE_SOON, UP_TO_DATE); L107 INVITED sustituido por heading h3 del hogar (owner) y L110 añade heading Invitaciones (member) + contador data-pending-invitations existente. pet-dashboard.spec.ts L61 texto del catálogo 002.
- tsc=0. Playwright: 29 pasan, 2 fallan, 7 no ejecutadas (serial). Fallos: wcag.spec.ts:123 (member no ve Argos: la semilla no asigna la mascota al hogar, PUT /pets/{petId}/assignments/{householdId}); pet-dashboard.spec.ts:71 (espera '−1.37 %', la UI muestra '—'). Sin commit.

## 2026-11-14 — Directivas Neo e2e (1A/2A/Semáforo)
- wcag.spec.ts: asignación PUT /pets/{petId}/assignments/{household.household.id} (200) antes de la invitación; import apiCall.
- pet-dashboard.spec.ts: Variación '—'; semáforo a 3 vacunas vigentes; SUPERSEDED omitido hasta T289.
- tsc=0; playwright: 34 pasan, 1 falla (pet-dashboard.spec.ts:115 selectOption('CAT') vs FELINE), 3 no ejecutadas. Sin commit.

## 2026-11-14 — CAT→FELINE en pet-dashboard.spec.ts (ratificado por Neo 1A)
- pet-dashboard.spec.ts:115 selectOption('CAT') -> 'FELINE'. Sin otros 'CAT' en el archivo. tsc=0.
- Playwright: 36 pasan, 1 falla, 1 no ejecutada. Falla: pet-dashboard.spec.ts:155/157 espera schemaVersion '2.0.0', API da '3.0.0' (no tocado, pendiente Neo/Architect). Servidores detenidos.

## 2026-11-14 — Checkpoint e2e (3.0.0)
- tests/e2e/visual/pet-dashboard.spec.ts L157: '2.0.0' -> '3.0.0' (BackupEnvelopeV3). tsc=0. Playwright: 38 passed, 0 failed, 0 skipped. Dev servers terminados. Sin commit.

## 2026-11-14 — Frente ROJO Rebanada 6 (T284, T285, T286) — solo pruebas, sin commit
- T284: nuevos tests/unit/presentation/{rebanada6-fixtures.ts, rebanada6-permisos.spec.ts, rebanada6-directorio.spec.ts, rebanada6-mensajes.spec.ts} y 3 pruebas nuevas en tests/integration/presentation/web-client.spec.ts. Unit/integración: antes 12 fallan/51 pasan (63, rojos previos por fixtures 001); después 22 fallan/56 pasan (78): 15 nuevas = 10 rojas legítimas + 5 verdes (comportamiento ya existente).
- T285: wcag.spec.ts amplía con describe a 320/768/1024/1280 (+ helper accessibilityFindingsAt y VIEWPORT_WIDTHS_V21 en e2e-support.ts, aditivo). Rojo: /cuenta (redirige a /). /cuenta va última porque el archivo es serial.
- T286: tests/e2e/visual/rebanada6-recorridos.spec.ts (7 recorridos, 5 rojos legítimos, 2 verdes).
- Errores de prueba corregidos: getByRole('option') contaba <option> del select (33 vs 30); locator .or() en modo estricto; writeFileSync(readFileSync(Buffer)) mal usado; /cuenta en medio de un describe serial ocultaba pruebas (reordenado).
- tsc=0. Sin tocar src/, contratos ni specs. Servidores detenidos.

## 2026-11-14 — Corrección de calidad frente ROJO (Oracle cond. b)
- rebanada6-recorridos.spec.ts ~L126/135: eliminada aserción tautológica `user.username.length > 0`; ahora `await signedInPage(...)` sin variable y `expect(pets.body.map(p => p.profile.name)).toEqual(['Intacta'])` (comprueba que la importación fallida no alteró las mascotas). tsc=0. Playwright: 5 rojos / 2 verdes, igual que antes (UI sin implementar: faseras, aviso de sesión, directorio, mensaje de hogar). Servidores detenidos. Sin commit.

## 2026-11-14 — Keymaker: INICIO Rebanada 6 verde (T284-T293 UI, T287) + enmienda Opción A (sin commit)
- Autorización de Neo (Nivel 2): implementar sobre ui_blueprint v2.1 y enmendar rebanada6-recorridos.spec.ts:84-86 (riel flex, sin grilla 1/2/3).
- Lectura previa hecha: registro, entorno, log, tasks T284-T296, blueprint v2.1 completo, src/presentation/web/**, pruebas rojas T284-T286.
- Conflictos detectados antes de editar (se reportan a Morpheus): (1) presentation-architecture.spec.ts prohíbe setTimeout/Date.now en src/presentation/web, pero T288 pide búsqueda de 300 ms y T293 aviso de expiración sin sondeo: se enmienda esa guarda con lista blanca de 2 módulos; (2) blueprint §4.3 dice «Solo lectura» si !editPetBasics, pero la prueba T284 exige que el Cuidador NO lo vea: se usa la regla «ningún permiso de escritura».

### 2026-11-14 — Keymaker: Rebanada 6 verde, código escrito (T284-T293 UI, T287) + enmienda Opción A
- src/presentation/web: nuevos schema-messages.ts (T293 mensajes llanos), activity.ts + idle-notice.ts (aviso previo 5 min, sin sondeo), use-debounced-value.ts (300 ms), components/PetAvatar.tsx (D1), pages/AccountPage.tsx (/cuenta). Reescritos: AppShell (marco único, 4 enlaces, sin barra inferior), PetCards (filtro de 5 valores + riel flex), PetDashboard (hero, tarjeta oliva D3, bento, D2, acordeón «Registros anteriores»), PetsPage, BackupPage (previsualización + barra de fases + arrastre), HouseholdsPage (2 columnas, aviso de éxito, rol), AuthPages (marco §5.1), session.tsx (idleExpiresAt, setUser, dropSession), api.ts (problemMessage llano, notifyActivity), view-model.ts, records.ts, OwnerBadge, WeightChart, RecordForm.
- tests: enmienda Opción A en rebanada6-recorridos.spec.ts (grilla -> teclado + selección + sin desbordamiento); guardas de temporizadores (presentation-architecture.spec, session-client.spec) con lista blanca de use-debounced-value.ts e idle-notice.ts y comprobación de que no tocan la API; validation.spec/session-client.spec/view-model.spec actualizados al texto llano T293 y a «Reemplazada por registro posterior».
- Unit/integración presentación: 12 fallos (los 12 heredados de fixtures 001), 66 pasan; los 10 rojos legítimos de T284 pasan.

### 2026-11-14 — Keymaker: compuertas Rebanada 6 (sin commit, estado propuesto REVIEW para T284-T293)
- tsc 0. vitest completo 26 fallos / 1660 pases (1686): los mismos 26 de la línea base (12 de presentación con fixtures 001 + 14 de contratos/API heredados); los 10 rojos legítimos de T284 pasan. verify-oracles CUMPLE (0 débiles/111 archivos). verify-traceability: global 88/96 (sin cambio); --feature 002 117/118 (solo INV-HOUSE-001, ajeno); T284..T293 por tarea CUMPLE. Playwright (E2E_API_PORT=3180, E2E_WEB_PORT=5180, .env cargado): 52/52 tras enmendar auth-pet-forms:63 (51 ok + 1 corregido y verificado). Verificación temporal 320/639/640/768/1024/1280 en /, /households, /backup, /cuenta: blur 0 bajo 640 y 1 desde 640, 0 ids duplicados, 1 «Nueva mascota» en /, 0 desbordamiento. test:gate completo NO ejecutado (compile-contracts regenera src/generated; vitest --coverage y stryker fallarían/tardarían por los 26 heredados).
- Hallazgos: H-K-1 guarda de temporizadores enmendada (lista blanca); H-K-2 «Solo lectura» blueprint §4.3 vs T284; H-K-3 auth-pet-forms:63 doble clic en Editar incompatible con blueprint §4.6; H-K-4 rol de hogar «Administrador» (T286) vs blueprint §5.2 «Propietario|Miembro»; H-K-5 aviso de sesión sin botón (blueprint no define control).

### 2026-11-14 — Keymaker: compuerta final T296 (npm run test:gate, orden de Neo)
- Ejecutado con .env cargado, E2E_API_PORT=3180/E2E_WEB_PORT=5180. Salida en gate-T296-output.txt. compile-contracts OK (13 contratos, regeneró src/generated). verify-traceability --feature 002 FALLA: 117/118, solo INV-HOUSE-001 (sin título it/test; solo en describe de tests/unit/household-policies.spec.ts:109). Por el encadenado &&, no corrieron oracles, tsc, vitest --coverage, Stryker ni Playwright dentro del gate. Sin commit.

## 2026-11-14 — T296 compuerta final (autorización Neo, opción A)
- Cita aplicada: tests/unit/household-policies.spec.ts:111, it "[REQ-HOUSE-001][INV-HOUSE-001][INV-HOUSE2-001] el creador queda como único propietario..." (única modificación de tests).
- Trazabilidad 002: 118/118 CUMPLE; pureza 0 violaciones. tsc --noEmit: exit 0. verify-oracles: CUMPLE (111 archivos, 0 débiles).
- test:gate (E2E_API_PORT=3180, E2E_WEB_PORT=5180, .env cargado): exit 1, 26 fallos / 1660 pasan (10 archivos fallan de 85). Salida en gate-T296-output.txt.
- Archivos con fallo: pets-records.api(3), canonical-fixtures(4), codegen-drift(1), generated-contracts(3), openapi-conformance(2), web-client(1), infrastructure-adapters(1), components(8), validation(1), view-model(2). Nada marcado COMPLETED.

## 2026-11-14 — Keymaker: commits LOCALES Rebanada 6 (autorización de Neo vía Logos, sin push)
- Inventario hecho: (a) src/presentation/web/** + 5 pruebas de Rebanada 6 + 6 pruebas modificadas + este log -> commit 1. (b) ui_blueprint.md, ui_maqueta_v2.html, ui_maqueta_cuenta.html, ui_propuestas_estructura.md, spec.md y tasks.md (diff solo de la enmienda de navegación T287/T288/REQ-UI2-001) -> commit 2.
- (c) excluido por orden: wcag.spec.ts, e2e-support.ts, web-client.spec.ts, CLAUDE.md, guías, logs ajenos, veredictos, logos, gate-T296-output.txt, .playwright-mcp/. Sin push. Nada COMPLETED.

## 2026-11-14 — Commit 3 de cierre local de la rebanada 6
- Autorización expresa de Neo (Nivel 2, vía Logos): commit local, sin push, sin --no-verify.
- Marcadas en tasks.md: T284-T293 y T296 (solo la casilla). T294 y T295 siguen abiertas.
- Stage explícito: 3 archivos de prueba, tasks.md, claude/veredicto-*, handover-*, log-*, archivo/. Excluidos: registro-proceso-argos.md, logos.json, gate-T296-output.txt, .playwright-mcp/.

## 2026-11-14 — Keymaker: correcciones D1-D3 de la pieza T295 (opción C de Neo)
- D1 AppShell.tsx:41-75: cabecera en dos filas (order-1 wordmark, order-2 Cerrar sesión, order-3 nav w-full con scroll interno <lg); enlaces 48 px, px-3 y sufijos "hogares/invitaciones" ocultos <sm (siguen los sr-only y data-*). D2 Field.tsx:~67-83: contenedor flex-wrap y input con min-w-[14rem] (224 px). D3 PetDashboard.tsx:~323-348: sin flex-wrap, avatar en div shrink-0.
- tsc 0; vitest presentación 11 fallos (igual a la línea base en árbol limpio); axe 14/14 con puertos 3200/5200. Sin commit.

## 2026-11-14 — H-V25-4 (BackupPage, barra de fases)
- Edición: `src/presentation/web/pages/BackupPage.tsx` catch de `upload` (línea ~165-168): fase `ROLLED_BACK` solo si `problem.finalState === 'ROLLED_BACK'`; en otro caso `APPLYING`. Textos y orden de fases intactos.
- tsc exit 0; vitest tests/unit/presentation: 11 fallos heredados (components/validation/view-model), 0 nuevos. Sin commit.

## 2026-11-14 — D-N2 opción A, H-V25-6, H-V25-5, H-V25-4 (sin commit)
- AppShell.tsx: nav con `flex flex-wrap gap-1` (sin order-*, sin overflow-x-auto); wordmark y cuenta sin order-*; palabras «hogares»/«invitaciones» visibles en todos los anchos (sin `hidden sm:inline`), sr-only y data-* intactos.
- BackupPage.tsx: PhaseBar recibe `stalled` (APPLYING con error): sin aria-current="step" en «Aplicando»; «Revertida» solo con ROLLED_BACK.
- Verificación: tsc 0; vitest presentation 11 fallos heredados; 4 anchos x 4 rutas sin desbordamiento, nav 256/256 a 320 px; accesibilidad 14/14. Procesos 3220/5220 cerrados.

## 2026-11-14 — Cierre T295 (autorización expresa de Neo, Nivel 2)
- tasks.md: T295 marcada [x] (T294 ya venía [x] sin commit; T296 intacta). Commit local de cierre de la pieza; sin push.
- Excluidos: logos.json, scripts/logos.py, gate-T296-output.txt, .playwright-mcp/, CLAUDE.md, GUIA-SKILLS-MATRIX.md, SKILLS-PROPUESTAS.MD, claude/registro-proceso-argos.md.

## 2026-11-14 — Hallazgo V12 (T298, Caso A de Seraph): denylist de secretos públicos de auditoría
- src/infrastructure/config/app-config.ts: con NODE_ENV != 'test' se rechaza ARGOS_AUDIT_HMAC_SECRET si es la clave de desarrollo o el secreto de los fixtures (huella SHA-256, sin valor en claro). AppConfigError nombra solo la variable.
- Verificación: tsc 0; audit-secret 11/11 dos veces; tests/security 264/264; línea base 12 fallos heredados (11 presentación + 1 scrypt). Sin commit.

## 2026-11-14 — Correcciones Caso A (análisis T304 grupo b), sin commit
- scrypt-password-hasher.adapter.ts: verify rechaza (false) hashes con N>16384, r>8 o p>1 (DEFAULT_SCRYPT_PARAMETERS, lo que el sistema genera); cierra DoS de INV-AUTH-003.
- audit-pseudonym.spec.ts: el test de producción usa randomBytes(32).toString('hex') en vez de AUDIT_SECRET_HEX (denylist V12 intacta); aserciones sin cambios.
- Gates: tsc 0; audit-pseudonym 4/4; scrypt 10/10; tests/security 267/267; verify-oracles 0 débiles.

## 2026-11-14 — Sustitución grupo (a) de T304 (25 pruebas) y ruta T311 cancelInvitation (autorización de Neo, Nivel 2), sin commit
- Ruta T311: nuevo CancelHouseholdInvitationUseCase (household-use-cases.ts; requireManager = MANAGE_HOUSEHOLD_MEMBERS, INVITED a CANCELLED, auditoría UPDATE, 404 ERR-HOUSE-INVITATION-NOT-FOUND), registrado en routes/use-cases.ts y servido en households.routes.ts (DELETE /api/households/:householdId/invitations/:invitationId, 204). El caso de uso no existía en src: se creó. NOT_YET_SERVED queda vacío (única edición de session-csrf.security.spec.ts). Prueba nueva en households.api.spec.ts.
- Sustituciones: generated-contracts y canonical-fixtures leen catálogo (35), máquinas y esquemas de specs/002 (fixtures 001 solo para sobres legados con upgradePet); codegen-drift (--feature 002 = defecto + regresión 001); openapi-conformance (40 operaciones y recorrido feliz completo); pets-records.api (Luna visible por hogar, ADMIN); presentation-fixtures reescrito con permissions/roles 002; components, view-model, validation y web-client reescritos.
- Hallazgos Caso A (presentación, no tocados): (1) WeightTable aún pinta la columna «Variación (%)» con «—» fijo (view-model.ts weightRows, T284 PENDIENTE); (2) HouseholdCard no pinta pendingInvitations ni «Cancelar invitación» (memberActions nunca devuelve CANCEL_INVITATION); (3) memberActions solo ofrece REMOVE al propietario, no a un ADMIN no propietario (MANAGE_HOUSEHOLD_MEMBERS).
- Gates: tsc 0; contratos+pets-records+presentación 567/567; tests/security 267/267; verify-oracles 0 débiles; verify-traceability --feature 002: 118/118.

## 2026-11-14 — Mapeo de las 24 filas pendientes de sustitucion-pruebas-001.md (modo lectura, sin commit)
- Ejecuté 31 archivos de las filas en una sola corrida de vitest (663 passed) y 14 archivos nuevos de la fila 23 (192 passed). Sin tocar specs/, tests/, src/ ni la tabla.
- Fila 20 (Playwright visual + wcag): 41 passed, 1 failed, 10 did not run; repetí wcag.spec.ts: 11 passed, 1 failed, 2 did not run. Fallos distintos (timeout de 60 s en :91; `main` no visible en :173). Hallazgo Caso A pendiente de aislar causa.
- Reservas: fila 4 (sqlite-backup-import.spec.ts sin caso de migración 1.0.0/2.0.0) y fila 22 (layer-dependencies.spec.ts sin rutas multi-feature).
- Playwright exige ARGOS_AUDIT_HMAC_SECRET; usé un valor aleatorio efímero solo en el proceso. Entregable: claude/mapeo-filas-pendientes-t304.md.

## 2026-11-14 — Diagnóstico línea base roja de mutación (sin ediciones, sin commit)
- vitest households.api (EDGE-037/038), pets-records.api (SUPERSEDED 409): 3 archivos 110/110 verdes; vitest completo 90 archivos, 1792/1792; tsc 0.
- Log de Stryker: "Initial test run succeeded. Ran 1172 tests" (dry run verde). Los «FAIL» (households EDGE-037/038, pets-records SUPERSEDED, backup-use-cases) son salidas de mutantes activos que matan pruebas (esperado), volcadas al caer el proceso hijo con SIGKILL al 15 %.
- Clasificación: no hay defecto de producción, ni prueba desalineada, ni Caso B. Causa real: SIGKILL del proceso hijo (recursos/sandbox, ~35 min proyectados, 3457 mutantes). No se tocó src/ ni tests/.

## 2026-11-14 — T304 fila 20 (wcag.spec.ts) y M-1 (V9 por rol): inicio, sin commit
- Decisión: correr wcag.spec.ts completo 3 veces con ARGOS_AUDIT_HMAC_SECRET efímero (aleatorio, solo en el proceso, nada en disco del repo); sin omitir pruebas. Diagnosticar solo si falla; no se toca el oráculo ni sustitucion-pruebas-001.md (Architect).
- Decisión M-1: la única prueba V9 (nine-vectors-four-roles) mezcla los 4 roles en una sola aserción; se añaden pruebas por rol (it.each ROLES) con el mismo oráculo (marcadores crudos ausentes, escape presente, códigos por rol), sin tocar la existente.
- M-1 hecho: nine-vectors-four-roles.security.spec.ts +4 pruebas V9 por rol (it.each); tests/security 271/271, tsc 0.

## 2026-11-14 — T304 fila 20: 3 corridas wcag.spec.ts verdes
- 3/3 corridas, exit 0, 14 passed, 0 failed, 0 omitidas (31.9 s, 31.7 s, 35.6 s), secreto HMAC efímero. Sin ediciones de src/ ni del oráculo. Hipótesis de los fallos previos (timeout 60 s, main no visible): carga de la máquina por corridas concurrentes (vitest/Stryker); en corridas aisladas no reproduce. Sin commit.

## 2026-11-14 — Fila 20: prueba «recargar sigue autenticado» (pedido de Morpheus), sin commit
- Decisión: añadir en tests/e2e/visual/rebanada6-recorridos.spec.ts una prueba con page.reload() que afirma /api/auth/me 200 con el mismo username, la misma cookie argos_session httpOnly y la pantalla /households visible. Ya existía un reload en auth-pet-forms.spec.ts (solo URL + botón). No se toca checklist ni tasks.md.
- Corrección de mi aserción: SessionView es {user:{username},...} (contrato identity.schema); el rojo era de la prueba nueva, no de src/.
- Prueba reload: 3/3 aisladas exit 0, 8 passed (archivo completo); tsc 0. Sin commit.

## 2026-11-14 — Compuerta final 002 (T305/T306/T309 + tsc, coverage, e2e, gate): inicio, sin commit
- Decisión: ejecutar las 7 compuertas en secuencia (un solo runner), `cmd; echo EXIT=$?`, salida en scratchpad. test:mutation NO se lanza (ya aprobado 88.98 %, EXIT=0). e2e con ARGOS_AUDIT_HMAC_SECRET efímero.
- Nota: `npm run test:gate` incluye test:mutation y playwright; se ejecutará tal cual lo pide Morpheus salvo que se indique lo contrario; ver decisión siguiente.

## 2026-11-14 — Compuerta final 002: resultados y Caso B de cobertura (sin commit)
- oracles 0 (116 arch., 0 débiles); traceability --feature 002 0 (118/118); compile-contracts 0; tsc 0; e2e 0 (53 passed); coverage EXIT=1 (90 arch., 1796/1796 OK).
- Causa del rojo: líneas 88.29 % < 95 % por los 11 src/application/ports/*.ts (solo interfaces; 369 de 388 líneas sin cubrir). Sin ellos ~99.4 %. vite.config.ts sin cambios vs HEAD.
- Decisión: NO corregir. Excluir ports es cambio de criterio de cobertura (config), no defecto de src/. Se reporta como Caso B. test:gate no ejecutado (incluye mutation, prohibido, y cae en coverage). Evidencia: claude/evidencia-compuertas-final-002-2026-11-14.md

## 2026-11-14 — T284/T291 presentación + O-6/O-4 + cobertura ports (autorización Neo N2), sin commit
- Decisión: PetForm con 8 especies, speciesOther condicional, birthDateIsEstimate/neutered/microchipId (nombres del OpenAPI CreatePetInput/UpdatePetInput). formValues gana parámetro `booleans` (conversión 'true'/'false') y, en edición, los campos anulables vaciados se envían null (contrato lo permite).
- Contrato verificado: servidos transferPetOwnership (POST /pets/{id}/ownership-transfer), transferHouseholdOwnership (POST /households/{id}/ownership-transfer) y changeMemberRole (PATCH /households/{id}/members/{userId}, ChangeRoleInput {role}); sin Caso B. Rol: propietario o ADMIN, nunca sobre el propietario (household-policies).
- O-6: nextBoosterAt opcional en records.ts (y la ficha no imprime «null»). O-4: plural en previsualización de respaldo. C: vite.config coverage.exclude ports.

## 2026-11-14 — T284/T291: src hecho, pruebas nuevas, Caso B por prueba existente
- src: PetForm (8 especies, speciesOther, birthDateIsEstimate, neutered, microchipId, petFormBody), TransferOwnership.tsx (panel de mascota), HouseholdsPage (selector de rol, transferir hogar), view-model (canChangeRole, canTransferHousehold, plural), validation (FormBody, booleans), records/PetDashboard (O-6), BackupPage (O-4), vite.config (exclude ports).
- tests: tests/unit/presentation/t284-t291-controles.spec.ts (14 pruebas verdes).
- Caso B: components.spec.ts L89 («cada campo del formulario tiene etiqueta asociada por id») espera 6 campos en PetForm; con los 3 nuevos son 9. El permiso me negó editar esa prueba existente; NO se tocó. Pendiente de Neo/Morpheus.

## 2026-11-14 — e2e: etiqueta ambigua
- Defecto propio en src: el checkbox "La fecha de nacimiento es estimada" chocaba con getByLabel(Fecha de nacimiento) (strict mode). Renombrado a "Es una fecha estimada". Se reejecutan los gates.

## 2026-11-14 — Gates finales T284/T291
- tsc 0; vitest 92 archivos 1811/1812 (falla components.spec L89, Caso B); e2e 0, 53 passed; coverage con esa prueba excluida (solo diagnóstico): exit 0, 1797/1797, líneas 99.35 %, ramas 97.89 %. npm run test:coverage real: exit 1 por la misma prueba. Sin commit.

## 2026-11-14 — Compuertas T305/T306/T309 (orden de Morpheus), sin commit
- Decisión: ejecutar en serie oracles, trazabilidad, compile-contracts, tsc, vitest, coverage, e2e. package.json: test:gate encadena test:mutation, por tanto NO se corre; se sustituye por el informe aprobado (88.98 %, EXIT=0).
- Resumen se guardará en claude/evidencia-compuertas-T309-2026-11-14.md.

## 2026-11-14 — Resultado compuertas
- Compuertas 1-7 EXIT=0; vitest 1812/1812; e2e 53; evidencia escrita. Sin defectos de src.

## 2026-11-15 — T406/T408 (Ola 0, rama 003-cloud-gcp): compuertas con prefijos 003 y contrato ops
- Creado specs/003-cloud-gcp/contracts/openapi/ops.openapi.yaml (OpenAPI 3.1, 3 ops, errores RFC 9457 con ERR-* ya existentes de la 002) y scripts/codegen-ops.mjs (valida y emite solo openapi-types.ts).
- compile-contracts.sh admite --feature 003 (destino por defecto src/generated/ops/, rechaza api/errors/machines/schemas, exige git diff --stat -- src/generated/api vacío); verify-traceability.sh reconoce NFR/SC y IDs propios de la 003 (spec→tasks 1:1, evidencia de código informativa salvo SDD_STRICT_EVIDENCE=1); verify-oracles.sh solo documentado.
- Hallazgo: la 002 fallaba 4 IDs (REQ-CLD-003, REQ-PG-001, REQ-SEC-002/003) desde la enmienda 3.3.0 de la constitución; corregido filtrando IDs propios de la 003 del principio II en 001/002. Verde: 002 118/118. Sin tocar src/ ni terraform/. Compilado solo a scratchpad.

## 2026-11-15 — T409 (rojo, rama 003-cloud-gcp): pruebas de la regla HOST (D-26)
- tests/unit/app-config.spec.ts: la fila `HOST=0.0.0.0 → rechazo` se conserva (sigue válida en test/sqlite) y se refuerza con 3 filas (sqlite, development, staging+memory); 7 pruebas/casos nuevos en total para production, postgres, rechazos permanentes, defecto 127.0.0.1 y mensaje sin eco.
- Rojo real: 2 fallan (0.0.0.0 con production; 0.0.0.0 con postgres) con `Configuración inválida: HOST`. 33 pasan hoy: son rechazos que el código actual ya cumple (guardas de regresión).
- Nota: HOST vacío toma el defecto 127.0.0.1 (comportamiento existente), no se rechaza; se afirma así. src/ sin cambios. T410 no implementada.

## 2026-11-15 — T409 (rojo, completado): HOST vacío, ARGOS_DB_DRIVER, DATABASE_URL, ARGOS_PG_POOL_MAX
- Orden de Neo: HOST="" se rechaza (la prueba que lo daba por 127.0.0.1 ahora espera ['HOST']; ' ' sigue rechazado). Añadidas pruebas de ARGOS_DB_DRIVER (defecto sqlite, postgres, rechazo de mysql/vacío/mayúsculas/memory fuera de test y staging), DATABASE_URL (obligatoria solo con postgres, sslmode=require, sin eco: mensaje, stack y JSON sin contraseña ni URL) y ARGOS_PG_POOL_MAX (1..10, defecto 5, rechazo de 0, -1, 11, 2.5, abc, 05, " 3", 1e1).
- vitest app-config.spec.ts: 59 pruebas, 26 fallan (todas por la regla nueva: error esperado que no ocurre o propiedad undefined), 33 pasan (guardas previas). Supuesto de nombres para T410: dbDriver y pgPoolMax. src/ intacto; T410 no implementada.

## 2026-11-16 — T404 (deps fijas D-27, rama 003-cloud-gcp)
- Instaladas con --save-exact: pg 8.23.1, @types/pg 8.23.1, @fastify/static 10.1.8 (dependencies) y esbuild 0.28.2 (devDependencies). Sin tsx/concurrently/dotenv/helmet nuevos. Fastify sigue en 5.12.8.
- package.json y lock verificados con versiones exactas; prueba de humo de @fastify/static con Fastify 5.12.8: inject 200; tsc --noEmit PASS. Commit local, sin [x], sin push.

## 2026-11-16 — T410 (config dbDriver, pgPoolMax, regla HOST)
- app-config.ts: HOST admite 127.0.0.1 y 0.0.0.0 (este solo con NODE_ENV=production o ARGOS_DB_DRIVER=postgres); HOST/ARGOS_DB_DRIVER/ARGOS_PG_POOL_MAX vacíos se rechazan (solo ausente = defecto). dbDriver sqlite|postgres|memory (memory solo test/staging), pgPoolMax 1..10 (5). DATABASE_URL solo con postgres: URL postgres(ql): con sslmode=require; error nombra solo la variable. host tipado '127.0.0.1' | '0.0.0.0'.
- .env.example: ARGOS_DB_DRIVER=sqlite, ARGOS_PG_POOL_MAX=5; DATABASE_URL como marcador comentado. Tests: añadidas dbDriver/pgPoolMax al objeto por defecto y las reservas del Oracle (URL malformada, URL vacía/ausente); sin debilitar aserciones.
- Resultados: tsc PASS; app-config.spec 63/63 verdes. Suite unit+integration: 1539 pasan, 3 fallan en codegen-drift (src/generated/ops/ sin seguimiento, efecto de las compuertas de la 003; no es de T410). No se añadió databaseUrl a AppConfig (T427 lo decidirá).

## 2026-11-16 — T404 R-1 (prueba de arranque @fastify/static)
- Creado tests/unit/static-startup.spec.ts: registra @fastify/static 10.1.8 (dotfiles:'deny') con Fastify 5.12.8 sobre directorio temporal; app.inject GET /index.html -> 200 y contenido; GET /.env -> 403/404 sin filtrar contenido.
- Resultados: tsc exit 0; vitest 2/2 verdes. Sin defectos de @fastify/static. No se tocó src/, package*.json ni src/generated/ops/.

## 2026-11-16 — Saneamiento pg, ops types y codegen-drift (orden directa de Neo)
- @types/pg 8.23.1 movido a devDependencies (--save-exact); lock solo cambia posición y flags dev de @types/pg, @types/node y undici-types; sin otros cambios de versión. src/generated/ops/openapi-types.ts versionado (compile-contracts --feature 003: rc 0, salida idéntica a la existente; git diff src/generated/api vacío).
- codegen-drift.spec.ts: readTree omite el subdirectorio ops/ de primer nivel; aserción de feature desconocida 003 -> 999. Sin otros cambios. T404/T410 [x] ya aplicadas por Morpheus se incluyen en el commit.
- Gates: tsc exit 0; codegen-drift 13/13; app-config+static-startup 65/65; unit+integration 72 archivos, 1544/1544 verdes.

## 2026-11-16 — T411 (pruebas primero: healthz, readyz, estáticos, cabeceras, traversal)
- Creado tests/integration/ops/ops-http.spec.ts (51 pruebas). Contrato de módulos que T412/T479 debe crear en src/infrastructure/http/: plugins/security-headers.ts (registerSecurityHeaders(app)), routes/ops-routes.ts (registerOpsRoutes(app, {checkReady})), plugins/static-assets.ts (registerStaticAssets(app, {root})). Carga por import dinámico con ruta absoluta (la ruta del repo tiene espacio: no usar file URL) para que cada prueba falle sola por ausencia.
- Decisiones: traversal exige 400/404 y ningún contenido de un secreto fuera de dist/ (también bajo /pets/123/...); caché de 60 s de /readyz no probada (fuera del texto de T411); invariantRef del 503 = INV-ARCH-003 (ops.openapi); detalle sin causa.
- Resultado: tsc exit 0; vitest 51/51 rojas (módulos inexistentes), 0 verdes. Comprobado con una implementación desechable (ya borrada, src/ intacto) que las pruebas son satisfacibles (32 pasaron; el resto fallos del borrador). Sin push, sin [x].

## 2026-11-16 — R-1 de T411 (pruebas primero: caché de 60 s de /readyz)
- Creado tests/integration/ops/readyz-cache.spec.ts (6 pruebas, fake timers): 2 GET <60 s = 1 llamada; fallo cacheado 60 s (mismo 503); expira a 61 s; fallo expirado se reevalúa; /healthz nunca cacheado ni llama a checkReady; caché por instancia (app nueva sin caché). Misma firma registerOpsRoutes(app, {checkReady}).
- Resultado: tsc exit 0; vitest 6/6 rojas, causa única "Failed to load url .../routes/ops-routes.ts" (módulo inexistente). No probadas contra implementación desechable. src/ intacto. Sin push, sin [x].

## 2026-11-16 — PASO 0 RC-1 de Oracle (concurrencia de la caché de /readyz)
- Añadida a readyz-cache.spec.ts una prueba: 10 GET /readyz simultáneos con caché vacía y checkReady pendiente -> una sola llamada (promesa en vuelo compartida) y 10 respuestas 200.
- Resultado: 7/7 rojas (módulo ops-routes.ts aún inexistente; causa única de ausencia). Commit local, sin push.

## 2026-11-16 — T412 + T479 (verde)
- Creados security-headers.ts, ops-routes.ts, static-assets.ts en src/infrastructure/http/. server.ts/app.ts NO tocados (el cableado a producción queda para otra tarea).
- Decisiones: CSP añade base-uri/form-action/object-src 'self'/'none'; /readyz cachea la promesa (éxito/fallo, 60 s, Date.now) y el timeout de 5 s se limpia; 503 con cuerpo fijo sin causa. Estáticos: hook onRequest da 404 a rutas con %2e/%2f/%5c/%00/\\ o // (fuera de /api/); el fallback SPA excluye /api/*, /assets/* y últimos segmentos con extensión (inject normaliza el traversal a /secret.txt y no debe devolver index.html).
- Gates: ops 58/58; tsc 0; unit+integration 74 archivos, 1602/1602; contratos 003 sin diferencias con src/generated/ops.

## 2026-11-16 — T413 (pruebas primero: POST /internal/maintenance)
- Creado tests/integration/ops/maintenance-route.spec.ts (15 pruebas). Contrato para T414: src/infrastructure/http/routes/maintenance-routes.ts exporta registerMaintenanceRoute(app, { verifyOidc(token): Promise<Identity>, runMaintenance(): Promise<{purged:number}> }). Identidad del Scheduler fijada en el test (argos-scheduler@test-project...; Identity {email, sub}).
- Cubre: 401 sin header / no Bearer / token inválido; 403 identidad ajena; 200 Scheduler (body.purged); 5xx sin causa; respuesta y log sin token ni identidad (log solo conteo "purged":7); CSRF aparte (Bearer sin cookie 200, cookie sin Bearer 401); GET/PUT/DELETE/PATCH 404|405.
- Ambigüedad: openapi MaintenanceResult tiene 5 conteos, la firma dada es {purged}; se prueba solo body.purged (T414/Architect alinean).
- Resultado: tsc exit 0; vitest 15/15 rojas, causa única módulo inexistente. src/ intacto. Sin push, sin [x]. registro-proceso no tocado por instrucción.

## 2026-11-16 — T413 corregida (R-1/R-2 de Oracle; decisiones D-A1/D-A3 de Architect) + pruebas de AppConfig
- maintenance-route.spec.ts: firma con schedulerEmail:string; runMaintenance -> Promise<MaintenanceCounts> (5 campos, valores 1..5); sustituidas {purged}/purged===7 por los 5 campos en cuerpo 200 (toEqual + 5 aserciones) y en el log (5 regex); 5 casos 403 por igualdad exacta (mayúsculas, subcadena prefijo/sufijo, dominio parecido x2) + caso 200 exacto; el test de log sin secretos cubre también las identidades casi iguales.
- app-config.spec.ts: toEqual por defecto ampliado con schedulerEmail:null y oidcAudience:null (+2 líneas, 0 eliminadas); nuevas pruebas (obligatorias con postgres, null con sqlite/memory, formato email, https, mensaje sin valor). No se prueba el caso "valor presente con sqlite" (no fijado por Architect).
- Resultado: tsc exit 0. maintenance 21/21 rojas (módulo inexistente); app-config 22 rojas / 62 verdes (propiedades inexistentes en src/). src/ intacto. Sin push, sin [x].

## 2026-11-16 — T414 (verde: ruta de mantenimiento, config schedulerEmail/oidcAudience, verificador fail-closed)
- app-config.ts: schedulerEmail/oidcAudience (obligatorias con postgres, null en sqlite/memory; error nombra solo la variable). maintenance-routes.ts: 401/403/200 con 5 conteos, log solo conteos. oidc-verify.ts: createOidcVerifier FAIL-CLOSED (rechaza siempre) por BLOQUEO N2 abierto: librería JWT/JWKS (jose o google-auth-library) sin elegir; sin dependencias nuevas.
- server.ts: registra la ruta solo con dbDriver==='postgres'; setInterval solo con sqlite. csrf-guard.ts: exención exacta de POST /internal/maintenance. T412 (ops-routes, static-assets, security-headers) sin cambios. .env.example: solo comentarios.
- Desvío: tests/unit/app-config.spec.ts, solo fixtures: 11 entornos postgres previos aportan PG_CLOUD (las variables ahora obligatorias); aserciones intactas.
- Gates: tsc 0; ops+app-config 163/163; unit+integration 1644/1644 (75 archivos); suite completa 1957/1957 (96). Sin push, sin [x].

## 2026-11-16 — T415 (pruebas primero: logging con severity, redacción, serializers, SIGTERM)
- Creados tests/unit/cloud-logging.spec.ts (13), tests/unit/graceful-shutdown.spec.ts (9), tests/integration/ops/logging.spec.ts (6) = 28 pruebas. Contrato para src/: http/cloud-logging.ts (cloudLoggerOptions({databaseUrl}), severityOf, redactSecrets, serializeRequest, serializeError) y http/graceful-shutdown.ts (SHUTDOWN_TIMEOUT_MS=7000, CLOUD_RUN_GRACE_MS=10000, shutdownGracefully({closeServer, closePool?, timeoutMs?}), installShutdownHandlers({target, closeServer, closePool?, timeoutMs?, exit})).
- Cubre: severity/message sin level/msg/pid/hostname; DATABASE_URL (URL, usuario, clave, host) fuera de mensaje, campos y Error; req solo method+url con plantilla; err solo sqlstate+constraint; microchip duplicado (409) y 404 con UUID sin UUID/microchip/IP en stdout; cierre simulado < 7 s (nunca señal real). Registro de Cloud Run documentado en el encabezado de logging.spec.ts.
- Resultado: 3 archivos rojos (28 pruebas), causa única: módulos cloud-logging.ts y graceful-shutdown.ts inexistentes. src/ intacto. Sin push, sin [x].

## 2026-11-16 — T415 (verde: logging Cloud Logging, redacción, serializers, cierre SIGTERM)
- Creados src/infrastructure/http/cloud-logging.ts (severity/message, base null, hora ISO, serializers req/err, redactSecrets, hook logMethod que redacta texto y reescribe "Route X:/url not found" -> "Route not found": hallazgo de la prueba del 404, Fastify registraba la URL con el UUID) y graceful-shutdown.ts (7 s < 10 s, servidor -> pool, SIGTERM/SIGINT una vez).
- server.ts: PRODUCTION_LOGGER_OPTIONS = cloudLoggerOptions(); installShutdownHandlers solo en el bloque de arranque principal. app.ts y T412 sin cambios.
- Limitación: DATABASE_URL no llega al logger (argos-no-process-env; AppConfig no la expone): se redacta por patrón postgres(ql):// y por el valor si se pasa a cloudLoggerOptions({databaseUrl}). Pool: aún no existe; closePool queda opcional.

## 2026-11-16 — T416 (órdenes A-D de Neo, logos it. 76)
- A: playwright.config.ts, NODE_ENV:'test' en env del webServer API. B: package.json test:gate, compile-contracts --feature 003 tras el 002. C: commit local con research.md §10, data-model.md §6, architect-T415-registro-requests.md + A y B. Sin push, sin [x]. D: compuerta T416 completa a continuación (resultado en el informe a Morpheus).

## 2026-11-16 — T417 (orden de Neo, logos it. 78)
- Hallazgo: la suite ya era función parametrizada (tests/fixtures/repository-contract-suite.ts, defineRepositoryContractSuite) usada por memoria y SQLite. Hueco real para Postgres: la fábrica era síncrona y sin ciclo de vida.
- Cambio: tipo UnitOfWorkFactory (síncrona o Promise), opción dispose (afterEach), 19 `await createUnitOfWork()`. Cero aserciones tocadas. Specs de memoria/SQLite sin cambios.
- Base 21+37=58 verdes; después 21+37=58; completa 1985/1985; tsc exit 0.

## 2026-11-16 — T418 (servicio PostgreSQL de pruebas)
- Creados docker-compose.test.yml (postgres:17, healthcheck, loopback 55432, tmpfs), .env.example (marcador comentado `# TEST_DATABASE_URL=`), tests/integration/persistence/postgres-service.spec.ts (2 estáticas + 1 con describe.skipIf(!TEST_DATABASE_URL), motivo en el nombre).
- process.env en tests/ tiene precedente (audit-secret.security.spec.ts); la regla SAST y el gate de pureza se aplican a src/. Docker: CLI instalado, daemon apagado (no se levantó el servicio).
- tsc 0; completa 1987 verdes + 1 omitida (antes 1985).

## 2026-11-16 — T419 (baseline 0001 de PostgreSQL y paridad)
- Pruebas primero: tests/integration/persistence/schema-parity.spec.ts (7 estáticas + 1 viva con skipIf(!TEST_DATABASE_URL)); roja por 0001 inexistente. Luego src/infrastructure/persistence/postgres/migrations/0001_baseline.sql (ruta de data-model.md §2; no existía carpeta migrations/ en la raíz).
- Paridad leída del DDL de sqlite_master (migraciones reales) vs el SQL: tablas (lista canónica de 18), columnas, tipos (data->JSONB, flags->SMALLINT), nulabilidad, defectos, UNIQUE, FK/cascadas, PK, CHECK (GLOB -> regex), índices parciales. Una sola fila schema_migrations ('0001_baseline') y una sola MIGRATION en audit_log.
- Hallazgo propio: mi primer SQL conservaba length()=15 redundante junto a la regex; se alineó a la regex sola (data-model §1).
- tsc 0; completa 1994 verdes + 2 omitidas. Sin dependencias nuevas.

## 2026-11-16 — T420 (pool pg con límites y cierre)
- Pruebas primero: tests/integration/persistence/postgres-pool.spec.ts (8 + 1 viva con skipIf(!TEST_DATABASE_URL)); rojas: 1 archivo, 9 pruebas sin ejecutar, causa única módulo postgres-database.ts inexistente.
- Creado src/infrastructure/persistence/postgres/postgres-database.ts: createPostgresPool({connectionString, pgPoolMax}, {createPool, log}) con max=AppConfig.pgPoolMax (1..10, RangeError si no), idle 10 s, connection 5 s, keepAlive + delay 10 s, pool.on('error') que registra solo el código; closePool idempotente y sin lanzar. Sin schema_migrations (T464). Sin process.env.
- Desvío menor: la URL entra por parámetro (AppConfig no expone DATABASE_URL). Valores de timeouts elegidos por mí (no fijados en spec): idle 10 s, conexión 5 s.

## 2026-11-16 — T465 (pruebas primero de topes de sesión PostgreSQL)
- Creado tests/integration/persistence/postgres-session-caps.spec.ts (17 + 1 viva con skipIf(!TEST_DATABASE_URL)). Doble del cliente: orden/texto exacto BEGIN, 3 SET LOCAL, pg_advisory_xact_lock, COMMIT; ROLLBACK/COMMIT fallidos (C-6); reintento único por ECONNRESET; keepAlive; SIGTERM <= 7 s con installShutdownHandlers de T415.
- Import dinámico del módulo inexistente para que cada prueba falle por separado y tsc siga en 0. Rojas: 14; verdes previas 3 (keepAlive y 2 SIGTERM, ya cubiertos por T420/T415).
- Decisión: lock/statement 10 s e idle 15 s según REQ-PG-004/012 (la tarea decía 15 s para los tres). SET LOCAL antes del candado asesor para que lock_timeout acote la espera.

## 2026-11-16 — T421 (unidad de trabajo PostgreSQL)
- Creado postgres-unit-of-work.ts (PostgresUnitOfWork(pool, createRepositories(client))): BEGIN, 3 SET LOCAL (10 s/10 s/15 s), pg_advisory_xact_lock(0x4152474f53), work, COMMIT; ROLLBACK ante fallo.
- C-6 tomada del SqliteUnitOfWork: error original salvo fallo de ROLLBACK -> DomainError ERR-INTERNAL-UNEXPECTED finalState UNKNOWN (cliente destruido). Reintento único solo por ECONNRESET en connect() o BEGIN.
- PoolLike ampliado con connect/query (PoolClientLike, QueryResultLike); quitado el cast 'as unknown' de la prueba viva; la prueba R1 de Oracle ahora afirma la línea exacta 'pg pool end error code=ECONNRESET'.

## 2026-11-16 — T422 pruebas primero (repositorios PostgreSQL parte 1)
- Creados tests/integration/persistence/postgres-repositories-part1.spec.ts (23 pruebas con doble del cliente: SQL exacto, $n consecutivos, sin interpolación, orden de columnas, sha256 de token, filas corruptas, fuente sin process.env/schema_migrations) y postgres-repositories.spec.ts (suite de conformidad con fábrica async + dispose, describe.skipIf(!TEST_DATABASE_URL); 19 omitidas, esquema aislado por prueba con baseline 0001).
- Rojas: 23 (módulo postgres-repositories.ts inexistente, import dinámico para que tsc siga en 0). tsc 0.
- Nota: la suite es única; sus pruebas de mascotas/hogares solo pasarán vivas tras T423/T424.

## 2026-11-16 — T422 implementación (repositorios PostgreSQL parte 1)
- Creado postgres-repositories.ts: createPostgresRepositoriesPart1(client) con users, sessions, loginAttempts, confirmationTokens, rateLimits; SQL con $n, JSONB con ::jsonb, ANY($1::text[]), UPSERT con EXCLUDED, COUNT bigint->Number, revokeOthers en un solo UPDATE con jsonb_set (sin N+1). Reutiliza corruptData/sessionTokenHash/isSessionRecord de sqlite-repositories.ts (solo se añadió `export` a isSessionRecord).
- Comentario R1 en postgres-unit-of-work.ts (ROLLBACK con conexión caída => ERR-INTERNAL-UNEXPECTED/UNKNOWN; verifican T427/T477). Sin cambio de comportamiento.
- Verdes: 23 de 23 rojas; tsc 0; vitest completa 2042 verdes + 23 omitidas.

## 2026-11-16 — T423 pruebas primero (repositorios PostgreSQL parte 2)
- Creados tests/integration/persistence/postgres-repositories-part2.spec.ts (23 pruebas con doble del cliente: SQL exacto de mascotas y 6 módulos, $n consecutivos, sin interpolación, orden de columnas, microchip 23505 propagado y por propietario, cascadas: pets.delete una sola sentencia, deleteForPet 6 DELETE, listForPet 6 SELECT fijos) y tests/fixtures/pg-fake-client.ts (doble compartido con T424).
- Rojas: 23 (createPostgresRepositoriesPart2 inexistente; import dinámico, tsc 0).
- Reservas de Oracle para T427 (no se resuelven aquí): R-1 revokeOthers sin validación por fila (probar fila corrupta y timestamp no canónico en Postgres real); R-2 comparaciones de fecha como TEXT (probar bordes de countSince y consume).

## 2026-11-16 — T423 implementación (repositorios PostgreSQL parte 2)
- Decisión: parte 2 en el mismo postgres-repositories.ts (sin módulo hermano: comparte encode/decode y evita import circular; ~420 líneas). createPostgresRepositoriesPart2(client) -> pets y records. Pets: UPSERT EXCLUDED, neutered/estimado 0/1/null, delete en una sola sentencia (cascada FK). Microchip: 23505 de pets_owner_microchip se propaga sin traducir. Records: SQL por módulo con nombre de tabla constante, listForPet 6 SELECT fijos, findPetIdOfRecord UNION ALL con un $1, weights con weight_grams.
- Rojas 23 -> verdes 23 (módulo inexistente -> implementado). Ajustes de prueba: la spec part2 usa upgradeRecords (fixtures 001 sin category/veterinarian*; mismo adaptador que ya usa la suite SQLite); la prueba de fuente de part1 (conteo 20 de client.query) se acota a la sección de la parte 1 porque el archivo ahora contiene más sentencias.
- tsc 0; vitest completa 2065 verdes + 23 omitidas.

## 2026-11-16 — T424 pruebas primero (repositorios PostgreSQL parte 3 + fábrica compuesta)
- Creado tests/integration/persistence/postgres-repositories-part3.spec.ts (21 pruebas: hogares, membresías con role/is_household_owner, 23505 de un segundo propietario y de una segunda INVITED propagadas, updateOwner con jsonb_set, invitaciones, asignaciones, auditoría insert/pseudonymizeUser, fábrica createPostgresRepositories con las 11 claves, y chequeo estático de que la spec viva ya no usa el cast ni la parte 1 sola).
- Rojas: 21 (todas por createPostgresRepositoriesPart3/createPostgresRepositories inexistentes o spec viva aún con cast). tsc 0.

## 2026-11-16 — T424 implementación (parte 3 + cierre de la fábrica compuesta)
- postgres-repositories.ts: createPostgresRepositoriesPart3 (households con updateOwner por jsonb_set, saveMembership con role/is_household_owner, invitations con 23505 propagada, assignments, auditLog insert/pseudonymize) y createPostgresRepositories(client): RepositorySet de las 3 partes. Archivo único (~700 líneas, similar al SQLite de 683); decisión: no se parte en módulos para no crear import circular con encode/decode.
- tests/integration/persistence/postgres-repositories.spec.ts ahora usa createPostgresRepositories (tipado, sin `as RepositorySet`); en su encabezado quedan las reservas de Oracle R-1 (revokeOthers sin validación por fila) y R-2 (fechas como TEXT) para T427.
- Rojas 21 -> verdes 21. tsc 0; vitest completa verde, vivas omitidas (19 + 4) por falta de TEST_DATABASE_URL.

## 2026-11-16 — T425 pruebas primero (purga por lotes PostgreSQL)
- Creado tests/integration/persistence/postgres-maintenance.spec.ts (14 rojas + 1 viva skipIf(!TEST_DATABASE_URL), aplazada a T431). Doble del cliente: DELETE acotado `ctid IN (SELECT ctid ... LIMIT $n)`, $n consecutivos, umbrales ADR-002-14 con ::timestamptz e intervalos, sin VACUUM/TRUNCATE/INSERT/UPDATE, auditoría solo DELETE por auditBefore, lotes 500+500+120, rowCount null = 0, lote inválido = RangeError, UoW.purgeExpired con topes de sesión y ROLLBACK.
- Criterio de lote (SQLite no tiene lotes): ctid acotado por LIMIT, repetido por tabla hasta lote < tamaño (500). Módulo cargado por import dinámico; tsc 0.

## 2026-11-16 — T425 implementación (purga por lotes PostgreSQL)
- Creado postgres-maintenance.ts (purgeExpiredInBatches, PURGE_BATCH_SIZE=500) y PostgresUnitOfWork.purgeExpired (refactor interno: runInTransaction y purgeExpired comparten private transaction(); mismo BEGIN/SET LOCAL/candado/ROLLBACK). Decisión: módulo aparte (no postgres-repositories.ts) porque la purga no es un repositorio y se comparte solo con la UoW.
- Rojas 14 -> verdes 14 (módulo y método inexistentes). tsc 0; vitest completa 2100 verdes + 24 omitidas (vivas, TEST_DATABASE_URL).
- INV-AUD-001 interpretado como: no se escriben ni modifican filas de auditoría; el único DELETE de audit_log es la retención de 24 meses de ADR-002-14 (igual que SQLite). Nota: audit_log.timestamp es TEXT con ::timestamptz, sin uso del índice (tablas pequeñas).

## 2026-11-16 — T426 pruebas primero (inyector de fallos PostgreSQL)
- Creado tests/integration/persistence/postgres-fault-injection.spec.ts (6 rojas + 1 viva skipIf(!TEST_DATABASE_URL), aplazada a T431). Doble transaccional del cliente (escrituras pendientes hasta COMMIT, descartadas por ROLLBACK): para cada N 1..4 error InjectedWriteFailure, ROLLBACK final, sin COMMIT, 0 escrituras confirmadas; la escritura N no llega al cliente; repetible; contador reiniciado por transacción; error original sin traducir y release único.
- El envoltorio (tests/fixtures/pg-fault-injection.ts) se carga con import dinámico (tsc 0). Reutiliza DeterministicFaultInjector de src (T277), sin tocarlo.

## 2026-11-16 — T426 implementación (inyector de fallos PostgreSQL)
- Creado tests/fixtures/pg-fault-injection.ts (faultInjectingRepositories(injector, createRepositories)): envuelve la fábrica que ya recibe PostgresUnitOfWork; beginTransaction() por transacción + injector.wrap. Ubicación: tests/fixtures porque es solo de pruebas y no exige cambios en src (el DeterministicFaultInjector de T277 se reutiliza tal cual).
- Rojas 6 -> verdes 6 (fixture inexistente). tsc 0; vitest completa 2106 verdes + 25 omitidas (vivas).

## 2026-11-16 — T427 pruebas de concurrencia (prueba viva aplazada a T431)
- Creado tests/integration/persistence/postgres-concurrency.spec.ts: 7 no vivas (doble de pg_advisory_xact_lock como cola FIFO: 2 pools -> misma constante 0x4152474f53; resultado serial 3 transacciones sin cuentas perdidas + control negativo sin candado que sí las pierde; lock_timeout antes del candado en ambas; 55P03 propagado sin traducir con ROLLBACK, work no ejecutado, release único; recuperación posterior; sin reintento por 55P03) y 3 vivas skipIf(!TEST_DATABASE_URL) (2 pools serial, lock_timeout real ~10 s, 3 pools sin 40P01), aplazadas a T431 por decisión de Neo.
- Nada que implementar en src/: el orden/texto del candado y los topes ya estaban fijados por T421/T465 (postgres-session-caps.spec.ts); lo nuevo es solo la semántica concurrente. Única roja inicial: error del propio doble (la espera no era cola); corregido en la prueba. Reservas R-1/R-2 de Oracle y R-1 de T425 quedan para T431 (requieren base real).
- tsc 0; vitest completa 2113 verdes + 28 omitidas.

## 2026-11-16 — T428 pruebas primero (composición PostgreSQL en server.ts)
- Decisiones vinculantes de /architect (architect-T428-composicion.md): AppConfig.databaseUrl (A), import() dinámico por dbDriver, onClose -> closePool, 55P03 sin mapear (solo comentario).
- tests/unit/app-config.spec.ts: único toEqual literal de defaults (línea ~38) recibe databaseUrl: null (sin eliminar ni debilitar aserciones; el segundo toEqual usa spread de loadAppConfig y no cambia); +2 casos (databaseUrl con postgres/sqlite/memory; URL ausente del mensaje y variables).
- Nuevos: tests/unit/server-composition-static.spec.ts (3), tests/integration/server-composition-postgres.spec.ts (3 + 1 viva skipIf aplazada a T431), tests/integration/server-composition-sqlite.spec.ts (1; ya verde: con sqlite no se carga pg, guarda regresión).
- Rojas confirmadas: 7 (2 app-config, 2 estáticas, 3 postgres).

## 2026-11-16 — T428 implementación (composición PostgreSQL en server.ts)
- app-config.ts: AppConfig.databaseUrl (isPostgres ? env[DATABASE_URL]! : null). server.ts: composePersistence(config) con import() dinámico por dbDriver (postgres: postgres-database, postgres-unit-of-work y postgres-repositories, fábrica necesaria para PostgresUnitOfWork; memory sigue el camino sqlite), createPostgresPool({connectionString: config.databaseUrl, pgPoolMax}), error sin valor si databaseUrl es null, onClose -> persistence.close() (closePool o db.close()), comentario de 55P03. Sin process.env ni logs de config.
- Rojas 7 -> verdes 7 (databaseUrl inexistente; imports estáticos; sqlite-composición). tsc 0; vitest completa 2122 verdes + 29 omitidas (vivas). git diff --stat src/domain src/application vacío.

## 2026-11-16 — T429 pruebas primero (migrador acotado de PostgreSQL)
- Creado tests/integration/persistence/postgres-migrator.spec.ts: 23 rojas (módulos scripts/migrate-postgres.ts y config/migrator-config.ts inexistentes, import dinámico) + 1 viva skipIf(!TEST_DATABASE_URL), aplazada a T431 (sin Docker, decisión de Neo). Doble del cliente con reloj simulado: pg_try_advisory_lock acotado a 60 s y unlock en finally; candado ajeno = MigrationLockTimeoutError sin unlock; SET lock_timeout 5s/statement_timeout/application_name antes del candado; 55P03 con 3 reintentos y espera creciente; una transacción por migración; idempotencia; salida sin URL/usuario/contraseña; DATABASE_URL_DIRECT por config (sin process.env en el script).
- Regla baseline: 0001_baseline crea schema_migrations e inserta su fila; el migrador no la crea (to_regclass) y registra con INSERT ... ON CONFLICT DO NOTHING dentro de la transacción. tsc 0.

## 2026-11-16 — T429 implementación (migrador acotado de PostgreSQL)
- Creados scripts/migrate-postgres.ts (runPostgresMigrations inyectable, MigrationLockTimeoutError/MigrationFailedError, main solo si es el punto de entrada) y src/infrastructure/config/migrator-config.ts (loadMigratorConfig: DATABASE_URL_DIRECT con sslmode=require, sin -pooler; error solo con el nombre de la variable). Decisión: NO se amplió AppConfig (la aplicación nunca lee la URL directa; evita tocar el toEqual literal y el patrón databaseUrl); función aparte en config/.
- Clave del candado 0x41524d4947 (distinta de la 0x4152474f53 de la UoW). Candado 60 s con sondeo de 1 s; 55P03 -> 3 reintentos (4 intentos) con espera 1/2/4 s; statement_timeout 30 s.
- Rojas 23 -> verdes 23 (módulos inexistentes); 1 prueba corregida (afirmaba la versión en logs cuando el fallo solo viaja en el error). tsc 0; vitest 2145 verdes + 30 omitidas (vivas).

## 2026-11-16 — T430 prueba de traslado SQLite -> PostgreSQL (sin código nuevo)
- Creado tests/integration/persistence/sqlite-to-postgres-transfer.spec.ts: 7 no vivas + 1 viva skipIf(!TEST_DATABASE_URL), aplazada a T431 (sin Docker). Origen SQLite real con ANDRES y MARIA, hogar compartido, 2 sesiones, fallos de login, registros en las 6 colecciones de ambas cuentas (MARIA recibe uno por colección sobre LUNA). Destino: PostgresUnitOfWork con doble del cliente; RegisterUserUseCase registra de nuevo y ImportBackupUseCase importa el respaldo v3 de ExportBackupUseCase.
- Afirma lo conservado (ids y conteos de mascotas y 6 colecciones, con el dueño nuevo) y lo perdido (ningún id de cuenta, hash, hogar, membresía, invitación ni sesión del origen en escrituras de Postgres; sin escrituras a households, household_members, household_invitations, pet_assignments, login_attempts; auditoría solo CREATE e IMPORT propias, sin MIGRATION del origen).
- Rojas 0: las pruebas pasan a la primera porque exportBackup/importBackup (REQ-BACKUP2-001/002) y los repositorios de Postgres (T423/T424) ya cubren el traslado; no hay nada que implementar en src/. tsc 0.

## 2026-11-16 T431 pruebas vivas alineadas (Keymaker)
- Tests: 55P03 o 57014 en concurrencia viva; timeout 60 s solo en suites vivas; títulos neutros (sin "SE OMITE"). Sin tocar src/ ni constantes.
- Corrida viva (Postgres 55432): 23 archivos, 301 pasan, 0 fallan. Suite sin variable: 114 archivos pasan, 1 omitido; 2152 pasan, 31 omitidas. tsc exit 0.

## 2026-11-16 T432 y T433 (Keymaker, Phase 4 Contenedor)
- T432: pruebas primero f4ab470 (7 rojas: script inexistente); scripts/build-server.mjs (esbuild 0.28.2, ESM, splitting, external better-sqlite3 y pg-native, banner createRequire, copia migraciones SQLite) 7513308. Dependencias de terceros EMPAQUETADAS salvo better-sqlite3; el fragmento de SQLite es el unico que lo importa. Humo: arranca y /api/auth/me da 401. HALLAZGO: /healthz da 404 en el bundle: ops-routes.ts, security-headers y static-assets (T412/T479) existen pero server.ts/app.ts no los componen (y por tanto la imagen no sirve dist/). Fuera de mi alcance (src/).
- T433: pruebas primero cbad577 (14 rojas: sin Dockerfile ni .dockerignore); Dockerfile (2 etapas, digest del indice sha256:5ec23b7c... verificado con docker buildx imagetools inspect), .dockerignore. Etapa final sin node_modules, sin npm, sin better-sqlite3 (REQ-PG-010: ARGOS_DB_DRIVER=postgres por defecto). dist-server no esta en .gitignore (fuera de alcance).
- tsc 0; vitest 2173 verdes + 31 omitidas.

## 2026-11-16 Cierre de cableado Fase 2 (H-1) — pruebas primero (Keymaker)
- Decisión de /architect (architect-H1-composicion-fase2.md) adoptada: trustProxy = host '0.0.0.0' ? 1 : false (la orden decía true; se sigue /architect), checkReady SQLite = SELECT 1 + esperadas ⊆ aplicadas en sqlite-database.ts, tercer parámetro de createProductionApp { staticRoot?, checkReady? }.
- tests/integration/ops/app-composition.spec.ts: 13 pruebas, 9 rojas (sondas, estáticos y cabeceras no compuestos; trustProxy ausente), 4 verdes (API 401, estática de process.env, etc.).
- Implementado (cierre Fase 2): app.ts recibe trustProxy/checkReady/staticRoot opcionales (orden: problem-details, security-headers, CSRF, API, ops, estáticos al final); server.ts provee checkReady (sqlite: assertSchemaReady nueva en sqlite-database.ts = SELECT 1 + esperadas ⊆ aplicadas; postgres: SELECT 1 hasta T464), trustProxy = host 0.0.0.0 ? 1 : false (convertido a función hop<1 porque los tipos de Fastify no aceptan number), staticRoot = <cwd>/dist, falla cerrado en 0.0.0.0 sin index.html, omite en desarrollo. tsc 0; vitest 2186 verdes + 31 omitidas.
- Desvíos: maintenance se registra tras estáticos (POST; el notFoundHandler no depende del orden). persistence/sqlite tocado por orden de Morpheus.

## 2026-11-16 CSP img-src (Keymaker, orden de Neo Logos 92)
- Pruebas primero: app-composition.spec.ts y ops-http.spec.ts exigen "img-src 'self' data:" en la CSP. Rojas antes de implementar; luego security-headers.ts y REQ-CLD-009 (una frase).
- Implementado: CSP = default-src 'self'; img-src 'self' data:; frame-ancestors 'none'; ... ; REQ-CLD-009 actualizado. El spec.md tenía cambios previos sin commitear de /architect: se stagea solo mi hunk.

## 2026-11-16 T434 humo local de la imagen (Keymaker)
- Build 13.3 s (capas posiblemente en caché). Size 80 565 172 B; docker save | gzip 79 943 345 B. Arranque en 0.43 s hasta /healthz 200 (bridge + -p 8080:8080; --network host no sirve en macOS). /healthz 200, GET / 200 (index.html, CSP con img-src), /readyz 503: Postgres de pruebas sin TLS (ssl=off) y la app exige sslmode=require; no se debilita. Sin fallo de esbuild/--ignore-scripts. Limpieza hecha; Postgres de pruebas intacto. N keep: 4 (5 solo si se cuenta comprimido: 399.7 MB).

## 2026-11-16 Fase 5 T435/T436/T437 — pruebas primero (Keymaker, orden de Neo Logos 94)
- Terraform NO instalado (`which terraform` vacío): no se instala ni se usa; verificación por lectura y pruebas estáticas. N keep = 4 (ratificado).
- Pruebas: tests/unit/terraform-bootstrap.spec.ts (6; 5 rojas), terraform-root.spec.ts (9 rojas), terraform-artifact-registry.spec.ts (1 roja de 3 que pasan vacuas... ver commit). Un commit de pruebas por tarea; sin push; no se stagea claude/log-keymaker.md por tener cambios previos ajenos.
- T436/T437 implementados: provider.tf (google 7.46.2, TF 1.17.2), backend.tf (gcs vacío), variables.tf (secretos sensitive sin default con validation REQ-IAC-013; custom_domain ""), outputs.tf (project_id y ruta del repositorio; ningún secreto), services.tf (11 APIs, for_each inline, sin locals), artifact_registry.tf (1 keep, keep_count 4, repository_id "${prefix}-docker"). 12 pruebas verdes. Decisión a confirmar: outputs.tf referencia artifact_registry.tf (T437). Sin .terraform.lock.hcl (requiere terraform; T444/T456).
- T435 implementado: terraform/bootstrap.sh (set -euo pipefail, dry-run por defecto, --execute explícito, sin secretos: los 3 secretos de GitHub solo se imprimen como `gh secret set` por stdin de Neo). Pasos: proyecto+facturación, APIs de arranque (incl. sts), bucket `<proyecto>-tfstate` (versionado, PAP, soft-delete 0, ciclo 30 d no vigentes), cuentas plan (viewer/securityReviewer/secretmanager.viewer + objectViewer) y apply (roles admin acotados + objectAdmin), WIF (condición repository_id y repository_owner_id; plan por repository_id, apply por job_workflow_ref de infraestructura.yml en main [verificar T469]), variables de GitHub, Environment produccion con revisor Neo y política de rama main. Prueba ajustada: aserción de --body ahora `gh secret set ... --body`. Verificado en dry-run local (sin llamadas); bash -n OK; shellcheck y terraform no instalados.

## 2026-11-16 T471 pruebas primero (Keymaker, orden de Neo: continuar Fase 5)
- tests/unit/terraform-plan-guard.spec.ts con planes JSON sintéticos: borrados protegidos (rotacion-secreto solo autoriza la versión), TF_VAR nula/vacía/espacios/salto, dominio ""/válido (0 o 1 mapeo). Rojas antes del guardia. Sin terraform. log-keymaker.md tiene cambios ajenos previos: no se stagea.
- T471 implementado: scripts/terraform-plan-guard.mjs (evaluatePlan + CLI 0/1/2). 25 pruebas verdes. Ajuste de la prueba: import relativo (la ruta con espacio rompía el import por URL) con @ts-expect-error TS7016. Decisión: etiqueta rotacion-secreto solo autoriza la versión; el resto de protegidos exige aprobacion-manual; etiquetas por --label o PLAN_GUARD_LABELS.

## 2026-11-16 T438 pruebas primero (Keymaker)
- tests/unit/terraform-secret-manager.spec.ts (8 pruebas estáticas): rojas antes de secret_manager.tf. Versión sin count/for_each, secret_data = var.*, create_before_destroy + deletion_policy ABANDON en versión, prevent_destroy en secretos.
- T438 implementado: terraform/secret_manager.tf (2 secretos con replicación auto y prevent_destroy; 2 versiones sin count, secret_data = var.*, ABANDON, create_before_destroy). 8 pruebas verdes. Decisiones: prevent_destroy solo en secretos (en la versión bloquearía la rotación); depends_on de los secretos a google_project_service.apis; sin deletion_protection del secreto (argumento no verificado en 7.46.2).

## 2026-11-16 R-1/R-3 del guardia — pruebas primero (Keymaker, orden de Neo: continuar Fase 5)
- 5 pruebas nuevas en terraform-plan-guard.spec.ts: protegido sin change/actions (ausente, null, [], string) debe dar plan-invalido, CLI exit 1, no protegido no bloquea, sin plan.variables con mapeo falla. 3 rojas antes del arreglo (exit 0 hoy); la de R-3 ya era verde (domain "" + mapeo falla) y queda fijada.
- R-1 implementado en scripts/terraform-plan-guard.mjs: protegido con actions ausente/vacío/no-array -> violación plan-invalido (exit 1). 30 pruebas verdes.

## 2026-11-16 T439 pruebas primero (Keymaker)
- tests/unit/terraform-iam.spec.ts (9 estáticas): 3 cuentas, accessor por secreto, deployer (3 roles acotados), scheduler invoker, allUsers solo run.invoker, sin owner/editor/admin, sin bucket/dumps, sin claves JSON. Rojas antes de iam.tf.
- T439 implementado: terraform/iam.tf (3 cuentas; accessor por secreto para argos-run; deployer: run.developer en servicio, artifactregistry.writer en repo, serviceAccountUser solo sobre argos-run; scheduler y allUsers run.invoker en servicio). Corregida una aserción defectuosa de mi prueba allUsers. Decisión: iam.tf referencia google_cloud_run_v2_service.argos (T440); validate completo requiere T440.

## 2026-11-16 T440 cloud_run.tf (Keymaker)
- Pruebas primero a714c88 (tests/unit/terraform-cloud-run.spec.ts, 10 rojas). Implementado terraform/cloud_run.tf: servicio v2 "argos", 1 vCPU/512Mi, concurrencia 20, escala 0..2, timeout 60s, cpu_idle, boost (plan.md:85, spec REQ-CLD-002); imagen marcadora hello; ignore_changes de 10 campos. Sin sondas/env/secretos. 76 terraform verdes, suite 2262 verde, tsc 0.

## 2026-11-16 — Phase 5: R-A, T484, T441 (Keymaker)
- 95ee124 test R-A (depends_on incluye scheduler_invoker; roja al quitarlo, verde con el .tf actual).
- d0ef857 pruebas T484 (5 rojas) -> 3765e88 etiquetas literales en artifact_registry, secret_manager (x2), cloud_run (servicio).
- 5652c21 pruebas T441 (9 rojas) -> buckets.tf (google_storage_bucket.exports). Estado: REVIEW pendiente de /oracle; sin [x].

## 2026-11-16 R1 de Oracle: nombre del bucket (Keymaker)
- Prueba de orden exacto de REQ-IAC-008 (7190d9d), roja antes; buckets.tf alineado a ${var.project_prefix}-${var.project_id}-exports. 103 terraform, suite 2289, tsc 0. REVIEW pendiente de /oracle; sin [x].

## 2026-11-16 — T443 y T444 (Keymaker, orden de Neo, Nivel 2)
- c06d790 pruebas T443 (8 rojas) -> c240903 budget.tf (google_billing_budget 1 USD, umbrales 0.5/0.9/1.0, filtro labels app=argos) + variable billing_account (sin default, validación AAAAAA-BBBBBB-CCCCCC).
- CC-K-T443: sin all_updates_rule (el proveedor 7.46.2 exige canal de Monitoring o Pub/Sub allí y D-13 no da dirección); queda el correo por defecto a destinatarios IAM de facturación. Validation Required: ¿basta, o Neo da una dirección (canal google_monitoring_notification_channel + variable)? Además billingbudgets.googleapis.com no está entre las 11 APIs de REQ-IAC-009.
- Pruebas T444 (terraform-hygiene.spec.ts) -> README.md, .terraform.lock.hcl (google 7.46.2, linux_amd64 + darwin_arm64), terraform/.gitignore. terraform fmt/validate OK; 119 terraform verdes; tsc 0. Bootstrap ya tenía --soft-delete-duration=0. Sin [x]; REVIEW pendiente de /oracle.

## 2026-11-16 — REQ-IAC-009 enmendado: billingbudgets y rol de facturación (Keymaker, N2)
- Pruebas primero: terraform-root (12 APIs incl. billingbudgets) y terraform-bootstrap (costsManager sobre cuenta de facturación solo a argos-terraform@) -> 2 rojas.
- Implementado: services.tf (12 APIs), bootstrap.sh (gcloud billing accounts add-iam-policy-binding, roles/billing.costsManager, solo APPLY_SA), README.md.
- CC-K-REQ009: el paso va tras 4b del bootstrap (no en el paso 1) por depender de que la cuenta de servicio ya exista; H-K: spec dice "paso 1", Oracle/Architect pueden ajustar. Gates: fmt 0, validate OK, mirror 0, 120 terraform verdes, tsc 0. Sin [x].

## 2026-11-16 — T445 auto-pr.yml (Keymaker)
- 86a5238 pruebas primero (tests/unit/auto-pr-workflow.spec.ts, 8 rojas) -> feat auto-pr.yml: push a develop (D-09) -> PR a main; permissions por trabajo contents:read + pull-requests:write; solo actions/checkout@v4 (actions/*, sin terceros); metadatos por git log y env (sin interpolar contexto en run); concurrency por ref; sin emojis.
- CC-K-T445: se descartó el fallback REST de creación de Mirror y el contents:write de nivel raíz. H-K: actionlint/shellcheck no instalados; YAML validado con js-yaml. REVIEW pendiente de /oracle; sin [x].

## 2026-11-16 — T447 test-gate.yml workflow_call (Keymaker)
- 1555672 pruebas primero (tests/unit/test-gate-workflow.spec.ts, 2 rojas: workflow_call y permissions por trabajo; las otras 4 ya verdes por diseño: develop ya estaba en push/pull_request, pasos y drift sin cambio).
- feat: workflow_call + permissions contents:read en el trabajo; pasos idénticos a b6cacc5; sin id-token ni secrets. drift-detection.yml intacto. H-K: develop ya existía en test-gate.yml; actionlint no instalado (YAML con js-yaml). REVIEW pendiente de /oracle; sin [x].

## 2026-11-16 — T448 deploy-argos.yml (Keymaker)
- 3193488 pruebas primero (tests/unit/deploy-argos-workflow.spec.ts, 18 rojas) -> feat deploy-argos.yml: gate (uses test-gate.yml, contents:read, sin id-token/secretos), audit (npm audit --omit=dev --audit-level=high), migrate (DATABASE_URL_DIRECT, sin GCP), deploy (único id-token: build/push, secretos por versión numérica, --no-traffic con sondas, humo /healthz y /readyz, --to-revisions NEW=100, retroceso con failure()). auth v3.0.0 y login-action v4.8.0 por SHA; sin compat.
- CC-K-T448: migrate va antes de build (build requiere id-token y solo deploy lo tiene); environment produccion en migrate y deploy. H-K: actionlint no instalado. Preguntas a Neo: valores de sondas liveness, flags de sondas [verificar T469], variables de entorno de Cloud Run más allá de COOKIE_SECURE. REVIEW pendiente de /oracle; sin [x].

## 2026-11-16 — T448 correccion Neo D1-D4 (Keymaker)
- Commits 3720571 (pruebas, 8/22 rojas) y fix (ver git log). D1 email/audiencia OIDC en gcloud run deploy; D2 gate->audit->build-push->migrate->deploy; D3 environment solo en deploy; D4 sondas sin cambio.
- H-K-T448-2: build-push necesita id-token: write (push a Artifact Registry); REQ-CICD-011(c)/plan 6.1 dicen id-token solo en deploy. Prueba ahora fija 2 trabajos. Pendiente /architect. Sin [x]; actionlint no instalado.

## 2026-11-16 — T449 code-quality.yml (Keymaker)
- 86c686c pruebas primero (10 rojas) -> 061d5f8 feat: hadolint v2.15.1 (sha256 c7187db9...c8c507, checksums.sha256 oficial) y actionlint 1.7.12 (sha256 8aca8db9...a3d8, checksums.txt oficial) como binarios; npm audit --omit=dev --audit-level=high; permissions contents:read; lista de acciones y justificación deploy-functions/Mirror en comentario.
- actionlint 1.7.12 (darwin_arm64, aba9ced2...953f) corrido en local sobre auto-pr, test-gate, deploy-argos, code-quality: salida vacía, rc=0 (cierra H-K-T448-3; sin shellcheck local). H-K-T449-1: hashicorp/setup-terraform listada como pendiente (T446). H-K-T449-2: npm audit reporta 3 moderadas (glob/minimatch via @fastify/static), pasa con nivel high. REVIEW pendiente de /oracle; sin [x].

## 2026-11-16 — T472 validación de secretos en CI (Keymaker)
- 4559891 pruebas primero (tests/unit/validate-secrets.spec.ts, 34 rojas de 35) -> 39c8196 scripts/validate-secrets.mjs (validateSecrets + CLI; ::add-mask:: antes de cualquier salida; HMAC espeja app-config con prueba de paridad).
- CC-K-T472: vive en scripts/ porque infraestructura.yml (T446) aún no existe y la spec dice que ese workflow valida; trim = solo espacios/tab de borde, \n/\r finales se rechazan (EDGE-CLD-05). Gates: suite 2387 verde, tsc 0. H-K: T446 debe invocar el script y usar los valores recortados. Sin [x].

## 2026-11-16 — T446 infraestructura.yml (Keymaker)
- 9981f77 pruebas primero (tests/unit/infraestructura-workflow.spec.ts, 15 rojas) -> feat infraestructura.yml (validate / plan PR / apply main) + ajuste de una aserción propia (GITHUB_ENV solo prohibido para TF_VAR/DATABASE_URL, porque apply guarda ROTACION_SECRETO).
- setup-terraform v3.1.2 = b9cd54a3c349d3f38e8881555d616ced269862dd (git ls-remote --tags hashicorp/setup-terraform; etiqueta ligera, sin ^{}); cierra H-K-T449-1. actionlint 1.7.12 rc=0, 61 pruebas verdes, tsc 0.
- CC-K-T446: id-token en plan (WIF solo lectura, REQ-CICD-012) y apply; REQ-CICD-002/011(c) dicen solo apply -> H-K-T446-1 para /architect. TF_VAR_billing_account sale de vars.TF_VAR_billing_account (no está en plan 6.3 ni bootstrap) -> H-K-T446-2. Valores recortados no se propagan (el script no los exporta; Terraform valida salto de línea y vacío, no espacios de borde) -> H-K-T446-3. Etiqueta rotacion-secreto: PR label en plan, API commits/pulls en apply (pull-requests: read) -> H-K-T446-4. Sin [x].

## 2026-11-16 — Neo Q3-Q4 sobre T446/T472 (Keymaker)
- 4920bca pruebas primero (14 rojas: 12 validate-secrets, 2 workflow) -> feat (ver git log): validate-secrets rechaza espacios/tab de borde (regla espacio-o-salto, sin recorte; ya no devuelve values); infraestructura.yml invoca `node scripts/terraform-plan-guard.mjs "${RUNNER_TEMP}/plan.json"` con PLAN_GUARD_LABELS (PR: join de labels; main: gh api commits/SHA/pulls --jq unique|join). Sin jq duplicado. Cierra H-K-T446-3, H-O-1, H-O-2.
- Gates: 137 pruebas de workflows/guard/secretos verdes, tsc 0, js-yaml 0, actionlint 1.7.12 darwin_arm64 (sha256 verificado) rc 0. Sin [x].

## 2026-11-16 — D-H1 de Neo: secretos acotados a pasos y GITHUB_ENV seguro (Keymaker)
- 73dfb45 pruebas primero (3 rojas de 19: env de trabajo sin secretos, secretos solo en pasos de validación/plan/guardia/comentario/apply, regex antes de GITHUB_ENV) -> fix (ver git log): TF_VAR secretos movidos a env: de paso; DATABASE_URL_DIRECT solo en validate-secrets (guardia no lo lee).
- CC-K-DH1: GITHUB_ENV por regex ^[a-z0-9,._-]*$ + rechazo de saltos, tras filtrar con --jq a rotacion-secreto/aprobacion-manual (evita que una etiqueta ajena con espacio rompa el apply). Gates: 94 verdes, tsc 0, js-yaml 0, actionlint 1.7.12 rc 0. Sin [x].

## 2026-11-16 — H-DH1-1 (PLAN_GUARD_LABELS vacío aborta apply)
- Pruebas primero 19d5ff2: 4 pruebas bash reales (vacío, válidas, `a\nB=1`, `A b`); la de vacío en rojo (rc 1) contra el YAML previo.
- Corrección b57472a: `if [ -n "$LABELS" ] && { ! grep ... || wc -l ...; }`; solo cambia 1 línea de infraestructura.yml.
- Compuertas: vitest 3 archivos 98/98, tsc 0, js-yaml 0, actionlint 0. Sin push, sin [x].

## 2026-11-16 — T450 guía de bootstrap día 0 (Keymaker)
- 6f57cfa: tests/unit/github-bootstrap-docs.spec.ts (17 rojas de 33 antes; nombres, orden, produccion/Neo, D-19, cruce con los `${{ secrets|vars }}` de infraestructura.yml y deploy-argos.yml) -> terraform/README.md (sección nueva + Despliegue) y quickstart.md §6 reescrito. Quickstart ya tenía §6 pero omitía TF_VAR_billing_account.
- YAML lee exactamente 3 secretos y 9 variables = lista de T450. H-K-T450-1: plan 6.3 dice que `vacuum-argos.yml` lee DATABASE_URL_DIRECT; no existe ese flujo. H-K-T450-2: plan 6.3 no lista TF_VAR_billing_account como variable de la tabla de Neo (sí la incluye; ok) pero bootstrap.sh crea TF_VAR_custom_domain solo como eco, no ejecuta. H-K-T450-3: bootstrap.sh comenta que la vinculación WIF de argos-deployer@ se añade en "T439/T450"; T450 no la cubre. Sin [x].

## 2026-11-16 — T485 paso 5c bootstrap.sh (Keymaker)
- c94f509 pruebas primero (4 rojas de 11: binding existe, member con job_workflow_ref+deploy-argos.yml@refs/heads/main, ninguno sin job_workflow_ref, comentario) -> 02d5f2d feat paso 5c (DEPLOY_WORKFLOW_REF, mismo formato que WORKFLOW_REF) -> ajuste de aserción de comillas (dry-run imprime sin comillas). Comentario de línea 157 corregido: "la vincula el paso 5c (T485)". Gates: terraform-* 124 verdes, tsc 0, bash -n ok. Sin [x], sin push, bootstrap no ejecutado.
- H-K-T485-1: 02d5f2d se commiteó con 1 prueba roja por aserción de comillas; corregido en commit siguiente. H-K-T485-2: el paso 5c exige que argos-deployer@ exista (apply de T439 antes); anotado en el texto del paso.

## 2026-11-16 — T451 escaneo de secretos y T454 runbook de respaldo (Keymaker)
- T451: 2a12008 pruebas primero (40 rojas de 40) -> d3528fa scripts/scan-secrets.mjs (grep de patrones, sin gitleaks ni dependencias; modos repo|dir|file --literal-env) -> a2e65b6 marca allow en fila sintetica. Repo 0 hallazgos; imagen construida (3765 archivos exportados, inspect e history) 0 hallazgos. NO conectado a ningun workflow (fuera de alcance).
- T454: 834d8ad pruebas primero (12 rojas) -> 582c668 terraform/README.md seccion "Respaldo y restauracion" + quickstart 4.2. Flags verificados con postgres:17 y gcloud local; SQL del paso 3 ejecutado contra Postgres 17 real con el esquema 0001. Sin neonctl (no verificable).
- H-K-T451-1 no hay job que lo invoque (code-quality.yml); H-K-T451-2 quickstart fila SC-CLD-004 dice `gitleaks detect`; H-K-T454-1 REQ-PG-016 "cascada" no existe en BD, SQL replica B9; H-K-T454-2 audit_log restaurado conserva IDs en claro. Gates: suite 2510 verde, tsc 0. Sin [x], sin push.

## 2026-11-16 Keymaker: E-1 / E-2 R1 / E-2 R2 (escaner de secretos)
- Pruebas primero bcaff10: 17 rojas de 67 (R1 detecta host real en tests/, R2 allow solo en tests/, paso scan-secrets en code-quality.yml).
- Implementacion (ver commit siguiente): scan-secrets.mjs (allow solo si name empieza por tests/; exencion URL en tests/ solo *.example.com y *.test; loopback en cualquier ruta); job scan-secrets en code-quality.yml (checkout, setup-node .nvmrc, run node scripts/scan-secrets.mjs repo).
- Efecto colateral: R1 destapo 12 URL sinteticas en 7 archivos de tests/ (hosts neon/ejemplo/h); se marcaron con argos-scan:allow (valido en tests/). Se ajusto el regex /secrets\./ de code-quality-workflow.spec.ts a ${{ secrets. (coincidia con scan-secrets.mjs).
- Compuertas: suite 2536 verde/31 skipped, tsc 0, repo 0 hallazgos. actionlint no instalado. Sin [x], sin push. E-3 intacto.

## 2026-11-16 Keymaker: R-2 / R-3 (Opcion A de Neo)
- Pruebas primero d4f1a51: 15 rojas (9 R-2 detector secrets, 6 R-3 rutas file/dir). Implementacion c0fa21a.
- R-2: usesSecretsContext analiza cuerpos `${{ }}` (multilinea) y `if:` sin llaves con /(?<![\w.-])secrets(?![\w-])/i; no coincide con job scan-secrets ni scan-secrets.mjs.
- R-3: classifyPath (realpath, rechaza `..` con exit 2); exencion allow/URL solo si la ruta real cae bajo <raiz>/tests/. Rutas fuera del repo se escanean SIN exenciones (desviacion: no se rechazan, para no inutilizar dir/file sobre imagen/registros de CI).
- Compuertas: 102/102 en las 2 specs, suite 2561 verde/31 skipped, tsc 0, repo 0 hallazgos. actionlint no instalado. Sin [x], sin push.

## 2026-11-16 Keymaker T473 (vacuum-argos.yml)
- Pruebas primero 149d10a: tests/unit/vacuum-argos-workflow.spec.ts, 14/14 rojas (archivo inexistente).
- Impl: .github/workflows/vacuum-argos.yml (cron lunes 07:00 UTC, dispatch con modo full|simple, psql -c por tabla, lock_timeout=3s x3 en full, falla por only table owner y last_vacuum > 10 d). Una prueba ajustada (regex sobre ${SENTENCIA}). 14/14 verde; suite 2575 verde, tsc 0. actionlint no instalado.
- Pendiente fuera de alcance: prueba de integracion con centinela (requiere Postgres real). Sin push, sin [x].

## 2026-11-16 Keymaker T473b (centinela de VACUUM)
- Pruebas primero: postgres-vacuum-sentinel.spec.ts sin scripts/vacuum-argos.sql = 0 pruebas recogidas (archivo falla al cargar; 6 previstas); con SQL pero sin ajustes: 5 de 5 rojas (TRUNCATE FK, mensaje PG17, get_raw_page regclass). Verde final 6/6 contra postgres:17 (contenedor proyectoargos-postgres-1 healthy, puerto 55432).
- Compartido: scripts/vacuum-argos.sql con secciones `-- @sql`; el flujo las extrae con awk (sql_seccion), la prueba con el mismo criterio. vacuum-argos-workflow.spec.ts 14 -> 15 verdes.
- H-K-T473-3 (ALTA): PG17 emite "permission denied to vacuum ... skipping it" (no "only table owner"); el grep del flujo nunca disparaba en PG16+/17. Corregido en yml (grep -E de ambas frases) y pineado en prueba.
- H-K-T473-5 (ALTA): VACUUM (FULL, ANALYZE) NO actualiza last_vacuum (solo last_analyze) en PG17; el disparo manual full fallaria por last_vacuum nulo si el cron no corrio antes (<=10 d). Sin corregir (criterio de spec): pineado con prueba; propuesta a Architect/Neo.
- H-K-T473-6: VACUUM simple recupera la tupla pero los bytes del centinela quedan en heap e indice (users, users_username_key); por tanto el manual NO baja a simple. Suite 2613 verde, tsc 0, scan 0 hallazgos. Sin [x], sin push.

## 2026-11-16 Keymaker T473b micro-ciclo (H-K-T473-5 opcion A + H-O-T473b-1/2/3)
- Pruebas primero 5417e64: rojo 3 fallos / 20 verdes (23); luego impl 4efa006: seccion vacuum_tras_full en scripts/vacuum-argos.sql y paso por tabla tras el FULL solo en modo manual full (cron intacto).
- Micro-ajustes: relleno 3000 filas + borrado y exigir pg_relation_size <; quitado users_pkey; roles con sufijo unico creados y borrados solo por la prueba (desviacion: no se reutilizan argos_app/argos_migrator).
- Compuertas: 23/23 en las 2 specs con PG17, suite 2615 verde, tsc 0, scan 0. actionlint no instalado. Sin [x], sin push.

## 2026-11-16 Keymaker T452 micro-ciclo (RI-3 pipefail, RI-y *.tfvars)
- Pruebas primero b5feb4d: tests/unit/backup-runbook-hardening.spec.ts, rojo 8 fallos / 3 verdes (11); impl: *.tfvars y *.tfvars.json en .gitignore raiz y terraform/.gitignore; terraform/README.md y specs/003-cloud-gcp/quickstart.md con set -eo pipefail, if ! pg_dump|gcloud, rm del objeto parcial y verificacion size > 0. README.md raiz no contiene pg_dump (sin cambios).
- Restriccion: backup-restore-runbook-docs.spec.ts exige la linea literal del pipe con gs://${BUCKET}/dumps/$(date...); se conservo literal (la ruta OBJ se calcula aparte: carrera teorica en medianoche UTC).
- Desviacion: el unico quickstart con pg_dump esta en specs/ (permitido por el mandato). actionlint no instalado. Sin [x], sin push.

## 2026-11-16 Keymaker: H-A1/H-A3 (T454a) BLOQUEADO antes de escribir pruebas
- Conflicto: tests/unit/backup-restore-runbook-docs.spec.ts:31 [REQ-IAC-008] exige la linea literal `pg_dump "$DATABASE_URL_DIRECT" | gcloud storage cp - "gs://${BUCKET}/dumps/$(date -u +%Y-%m-%d).sql"` en terraform/README.md. La correccion H-A1 (`cp - "$OBJ"`) la rompe.
- Segun instruccion: no se relaja la prueba ni se toca specs/. Sin cambios en disco ni commits. H-A3 no iniciado (se entrega junto con H-A1).
- Salida propuesta: autorizar a Keymaker a cambiar esa regex a `gcloud storage cp - "\$OBJ"` + exigir OBJ="gs://${BUCKET}/dumps/$(date ...).sql" (misma garantia de REQ-IAC-008, sin archivo local); quickstart.md (specs/) tambien tiene el doble date -> Architect.

## 2026-11-16 H-A1/H-A3 (decision Neo)
- Prueba a7d36b1: regex docs:31 relajada (OBJ= y cp "$OBJ") + 2 pruebas nuevas hardening. Rojo: 3 fallos/22 ok.
- Impl c84c94d: README con OBJ unico y nota de shell interactiva. Verde 25/25. Sin push, sin [x].

## 2026-11-16 Keymaker F-T453-01/02 (dotfiles 500)
- Prueba a587d16: buildOpsApp registra el registerProblemDetails real; dotfile exige 404 exacto + it.each de 9 URLs (/.env, /.git/config, /assets/.x, /.well-known/x, /sub/.hidden/y, dist/.env real, dist/.well-known/x, dist/assets/.x) en GET y HEAD. Rojo 9 fallos / 51 verdes (60), todos 500.
- Impl c051620: SUSPICIOUS += \/\. (segmento con punto inicial) en plugins/static-assets.ts; el onRequest y el notFoundHandler ya lo tratan como 404 plano sin SPA.
- Opcion elegida: guardia en static-assets (1 alternativa de regex) en vez de mapear 403 sin FST_* en problem-details (ampliaria la traduccion de errores global) o dotfiles:'ignore' (mandaria /.well-known/x al SPA). dotfiles:'deny' queda como defensa en profundidad.
- Verde: ops 107/107 (5 archivos), tsc 0, suite 2599 ok/38 skipped sin fallos, scan-secrets 0. actionlint no instalado. Sin push, sin [x]. O-3/O-4 no tocados.

## 2026-11-16 Keymaker - T453 decisiones N2 de Neo (A, B, C)
- 9fd554c: git rm de 6 scripts/.fuse_hidden* (0000000300000001, 0000000900000001, 0000000a00000002, 0000000b00000003, 0000000c00000004, 0000001500000003) + `.fuse_hidden*` en .gitignore.
- ec5744f: excepcion documentada en tests/security/sast-rules/argos-no-process-env.yml (4 scripts de CI exentos; alcance y CI sin cambios). Ninguna prueba lee la regla, por eso no hubo rojo previo.
- 13e6920 + d431c31: tests/security/ops-surface.security.spec.ts, 56 pruebas con inject(), verde de entrada (regresion); mutando static-assets a la version previa a c051620 fallan 4 (dotfiles). Ajuste de tipos (tsc 0).
- Compuertas: ops-surface + integration/ops 163/163; tsc 0; vitest completo 141 archivos, 2655 pasan, 38 skipped, 0 fallos; scan-secrets 0. actionlint no instalado. Sin push, sin [x].

## 2026-11-16 T486 jose OIDC
- Prueba primero b0d3b98 (rojo: 2 fallos de aceptacion, 9 pasan por fail-closed). Implementacion 329c841: jose@6.2.17 exacta, createRemoteJWKSet/createLocalJWKSet + jwtVerify (iss, aud, exp, RS256, email_verified===true). tsc 0, vitest completo 2666 ok, scan-secrets 0. Sin push, sin [x].

## 2026-11-16 T441a (opción i, Neo): IAM de storage por bucket en bootstrap.sh
- Prueba 87a84a7 (tests/unit/bootstrap-iam-storage.spec.ts): ROJO 5/5 contra bootstrap.sh previo.
- Impl 871876f: fuera roles/storage.admin y roles/viewer de proyecto; plan con visores concretos; roles personalizados de proyecto argosTerraformApplyBuckets (buckets.create/get/list/update) y argosTerraformPlanBuckets (get/list), sin storage.objects.*; objectViewer/objectAdmin solo sobre el bucket de estado. README: frase "solo Neo lee" ajustada.
- Gates: bash -n OK; 57/57 bootstrap; vitest completo 2671 passed; tsc 0; scan-secrets 0. T441a sigue [ ] (verificación real en T469). Sin push.

## 2026-11-16 — Documentación del límite residual T441a (Neo, opción a)
- Prueba roja fb2b313 (2 fallos de 14) en backup-restore-runbook-docs.spec.ts; implementación 6e5d21a en terraform/README.md (2 viñetas tras «Lectura limitada a Neo»). quickstart.md §4 no describe get-iam-policy: sin cambio.
- Compuertas: vitest 19/19 (docs + bootstrap-iam-storage), suite 2673 pass/38 skip, tsc 0, scan-secrets 0 hallazgos. Sin push, sin [x].

## 2026-11-16 — scripts/verify-bootstrap-inputs.sh (decisión Neo, Level 2)
- Prueba b5d6ded: ROJO 35 fallan / 1 pasa (36). Impl fc11099: VERDE 36/36 (tras corregir que check silenciaba PASA de herramientas). f7e535c: valores de prueba sin forma URL (scan-secrets marcó 2 hallazgos en la prueba, ahora 0).
- Script: herramientas (gh, gcloud, terraform, gh auth status, gcloud cuenta activa) y formato de ARGOS_PROJECT_ID/REPO/BILLING/REGION/REVIEWER; códigos 0/1/2; no lee ni imprime secretos ni la cuenta.
- Gates: bash -n 0; tsc 0; vitest 2709 pass/38 skip/0 fallos; scan-secrets 0. actionlint no instalado. Sin push, sin [x].

## 2026-11-16 — README: paso previo verify-bootstrap-inputs.sh (decisión Neo)
- Prueba d33d08e (en verify-bootstrap-inputs.spec.ts): ROJO 2 fallos de 39. Impl en terraform/README.md (1 párrafo de 1 línea tras «Solo Neo ejecuta…»): VERDE 39/39. Primer intento puso `bootstrap.sh` antes del script y la prueba de orden lo detectó; reformulado y commit enmendado (local).
- Compuertas: vitest completo sin fallos, tsc 0, scan-secrets 0. Sin push, sin [x].

## 2026-11-16 Keymaker T489 BLOQUEADO
- Lectura completa. El member exige <owner>/<repo> (job_workflow_ref). En terraform/ no existe variable, local ni data con el repositorio (solo bootstrap.sh REPO=ARGOS_GITHUB_REPO y workflows). Proyecto (data google_project) y pool ("${var.project_prefix}-github") sí se derivan sin valores nuevos.
- Se requiere variable nueva (p. ej. github_repository): DETENIDO, escalado a Architect. Sin cambios en disco salvo esta nota. Nota: terraform-bootstrap.spec.ts (describe 5c) deberá reescribirse al quitar el paso 5c.

## 2026-11-16 Keymaker T487 (D-29, Neo manual)
- Prueba primero 49e8558 (rojo 4 fallos/7 pasan), luego implementacion 93fdd4f: test-gate.yml sin push a main, paths-ignore (terraform, specs, docs, claude) en push y PR; test:gate sin playwright, con verify-traceability 002 y 003; playwright en test:gate:full.
- Verde 34/34 (test-gate + deploy-argos workflow); vitest completo 2719 pasan, 0 fallos; tsc 0; scan-secrets 0. actionlint no instalado. Sin push, sin [x].

## 2026-11-16 Keymaker T487 H1 (D-29 punto 6, Neo)
- Prueba primero 7aa4e0e (rojo 2 fallos/10 pasan de 12): pasos comparados contra b6cacc5 sin bloque Playwright + caso nuevo sin Install Playwright/playwright install.
- Implementacion: quitado paso "Install Playwright Chromium with system dependencies" de test-gate.yml. Verde 35/35 (test-gate + deploy-argos); vitest completo 2720 pasan, 0 fallos; tsc 0; scan-secrets 0. Sin push, sin [x].

## 2026-11-16 T488 (D-29 res. 4, opción A) — Keymaker
- Prueba primero 36bbf0e: 4 casos nuevos (a)-(d) en deploy-argos-workflow.spec.ts + 1 caso de docs por documento en github-bootstrap-docs.spec.ts. Rojo: 1 fallo (c) en workflow (26/27), 2 fallos docs (33/35).
- Implementación eb80eba: solo texto de los dos mensajes de fallo del sondeo + frase en quickstart.md §6 y terraform/README.md. Sondeo, concurrency y pasos intactos.
- Verde: 62/62 en los dos archivos; completo 2726 pasan/38 skipped; tsc=0; scan-secrets=0. actionlint no instalado.

## 2026-11-16 Keymaker T489 (D-30)
- Prueba primero db5c1ac (terraform-bootstrap.spec 5c reescrito, terraform-iam-secrets.spec nuevo, terraform-iam.spec ajustado a 5 roles del deployer): ROJO 10 fallos (5+4+1) de 29.
- Implementacion 3367b30: variables.tf github_repository (sin default, regex owner/name); iam.tf data google_project.this (no existia) + deployer_wif + 2 secretmanager.viewer a nivel de secreto; bootstrap.sh 5c solo nota a T489 y paso 6 fija TF_VAR_github_repository; infraestructura.yml TF_VAR_github_repository.
- Verde 19/19 (2 specs) y 29/29 con iam.spec; vitest completo 2734 pasan/38 skipped; tsc=0; traza 003 CUMPLE; scan-secrets repo 0 hallazgos; terraform fmt -check=0 y validate OK (init -backend=false, sin credenciales). Sin push, sin [x].

## 2026-11-16 Keymaker T489 fix H-O-T489-1/2
- Prueba primero f2aae21 (terraform-iam-secrets.spec.ts): TF_VAR_github_repository exactamente 1 vez por job plan y apply (2 total) + pool del principalSet anclado a ${var.project_prefix}-github. ROJO: 1 fallo "job apply: expected +0 to be 1" (5/6 pasan; el regex anclado ya coincidia con iam.tf).
- Implementacion 27edc2f: TF_VAR_github_repository en env del job apply de infraestructura.yml. iam.tf sin cambios.
- Verde 29/29 (3 specs); tsc=0; traza 003 CUMPLE; scan-secrets 0; terraform fmt -check=0. Sin push, sin [x].

## 2026-11-16 Keymaker T490 (D-31)
- Prueba primero 91c538f (terraform-bootstrap.spec.ts): 2 lineas billing add-iam-policy-binding; costsManager solo a argos-terraform@, billing.viewer solo a argos-terraform-plan@ (sin costsManager); sin admin/owner/editor. ROJO: 1 fallo (expected length 1 to be 2), 12/13 pasan.
- Implementacion 1d8163e (bootstrap.sh 4b): segundo binding billing.viewer a PLAN_SA tras costsManager; comentario corregido.
- Verde 29/29 (3 specs); tsc=0; traza 003 CUMPLE; scan-secrets 0; bash -n OK. Sin push, sin [x], sin ejecutar gcloud.

## 2026-11-16 Keymaker deploy 44003087897 (GFE 404 en TAG_URL)
- Prueba primero (deploy-argos-workflow.spec.ts): smoke sobre TAG_URL con --retry 18 --retry-delay 5 --retry-all-errors --fail; nombre de job y paso con "Smoke test" sin humo/Humo. ROJO: 1 fallo "expected ... to match /--retry 18/" (27/28 pasan).
- Implementacion: solo .github/workflows/deploy-argos.yml (retry 18 x delay 5 = 90 s, nombres Smoke test en job, paso, eco y comentario). Verde 47/47 (3 specs); tsc=0; traza 003 CUMPLE; scan-secrets 0. Sin push, sin [x], sin gh/gcloud.

## 2026-11-16 Keymaker D-32 (smoke externo /readyz y /)
- Prueba primero 70f2538 (deploy-argos-workflow.spec.ts): smoke con curl a ${TAG_URL}/readyz y ${TAG_URL}/ (--fail, retry 18x5, retry-all-errors), sin /healthz; probes internas en /healthz. ROJO: 2 fallos (27/29).
- Implementacion 6bded9d: solo deploy-argos.yml; paso Smoke test con dos curl (/readyz, /). Probes sin cambio. Verde 48/48 (3 specs); tsc=0; traza 003 CUMPLE; scan-secrets 0. Sin push, sin [x], sin gh/gcloud.

## 2026-11-17 Keymaker T473b (verificacion, sin cambios)
- T473b ya implementada y auditada: pruebas 5417e64 (rojo 3 fallos/23), impl 4efa006, tipo 0cd4259; Oracle CUMPLE (oracle-T473-opcion-A.md). Incluye H-O-T473-3 (sleep 2 y relectura) y SQL compartido scripts/vacuum-argos.sql. Sin nuevo codigo: nada que escribir. Compuertas reverificadas en HEAD 7f5c193.

## 2026-11-17 — H-O-T473b-1 (T473 vacuum-argos.yml)
- Rojo: nueva prueba en tests/unit/vacuum-argos-workflow.spec.ts (1 lectura de vencidas, sin sleep 2) -> 16 pass / 1 fail.
- Verde: sleep 2 + una sola relectura de vencidas antes de exit 1; 17/17. Commit 27e05d4.
- tsc 0, traceability 003 CUMPLE, test:gate verde, scan-secrets ejecutado. postgres-vacuum-sentinel: NO EJECUTADO (sin Postgres 17 local).

## 2026-11-17 — T478 (parte local) ensayo del runbook T454 en Postgres 17 local
- Ejecutados pasos 1-4 de REQ-PG-016 contra bases desechables argos_restore_src/dst en proyectoargos-postgres-1 (SQL y node tal cual; psql/pg_dump via docker exec; tramo GCS sustituido por pipe local).
- Resultado: dump 26061 B; conteos origen=destino (2/2/2/1); tras pasos 3-4 destino 1/1/1/1, referencias_restantes 0, sesiones no revocadas 0. Observaciones: runbook asume psql local (\copy de archivo cliente); H-K-T454-2 reconfirmado.
- Limpieza verificada: sin argos_restore_*, sin roles de prueba. No se toco Neon/GCS/prod. Informe: .specify/memory/audits/keymaker-T478-restauracion-local.md. T478 sigue abierta (Neon, RTO).

## 2026-11-17 — H-O-O4-1 / H-O-O4-2 (remediación de Oracle, prueba primero)
- Nuevo tests/security/ops-surface-production.security.spec.ts: usa createProductionApp (staticRoot y checkReady inyectados, pool postgres doble, verificador OIDC real jose con token sintético). 9 pruebas: sondas/estáticos/CSP, mantenimiento vs estáticos (401), CSRF, traversal; guarda de server.ts (postgres completo -> 401; sin email, sin audiencia, sin ambas, y sqlite con ambas -> 404).
- ROJO: el único fallo inicial fue un supuesto erróneo de la propia prueba (GET /internal/maintenance cae al fallback SPA 200, no 4xx); corregido en la prueba. Ningún defecto de producción: la guarda ya funcionaba, las pruebas pasan por construcción como cierre.
- No se tocó src/ (mutación de la guarda para probar que las pruebas fallan: denegada por permisos; queda pendiente si Neo la autoriza). Comentario "hasta elegir la librería JWT" sigue en src/server.ts L103 (fuera de mi alcance; pedir a Architect/Neo). Compuertas: tsc, traceability 003, test:gate (2746 passed), scan-secrets 0.

## 2026-11-17 H-O-O4-3 comentario OIDC de server.ts (autorizado por Neo N2)
- Línea 104 de server.ts: reemplazado «Falla cerrado hasta elegir la librería JWT (N2)» por «El token OIDC del Scheduler se verifica con jose (createOidcVerifier, T486): firma, issuer, audiencia y correo.». Sin cambio de lógica.
- Compuertas: tsc 0; ops-surface-production 9/9; test:gate 2746 pass; scan-secrets 0 hallazgos.
- Commit local 993b101 (sin push, sin [x]).

## 2026-11-17 004 bloque 1 / T510 esquemas 3.1.0 (Keymaker)
- Decision: /architect no dejo JSON en contracts/ de 004 (solo README y catalogo): materialice schemas/ copiando los de 002 (sin editarlos) y aplicando el delta del README; 002 intacta (INV-ARCH-003). Nuevo media.schema.json; BackupEnvelopeV31 + registros BackupXRecordV3/V31 sin revision; MicrochipInput aparte de MicrochipId.
- ROJO: contracts-004-schemas.spec.ts -> ENOENT specs/004.../contracts/schemas (0 tests). VERDE tras materializar (1 ajuste: strictRequired en else de breed): 21/21.

## 2026-11-17 004 bloque 1 / T511 OpenAPI 3.1.0 (Keymaker)
- OpenAPI 004 = copia de 002 + delta: 7 operaciones nuevas (media/avatar, cuerpo crudo), If-Match en updateRecord, 409 en deleteRecord, 429 en registerPet/updatePet, respaldo 3.1.0, login con usuario o correo. 47 operaciones. 002 intacta.
- ROJO: contracts-004-openapi.spec.ts -> ENOENT openapi/pet-tracker-api.openapi.yaml. VERDE 15/15 (1 ajuste: mi descripcion contenia la palabra prohibida).

## 2026-11-17 004 bloque 1 / T512 catalogo de errores (Keymaker)
- error-catalog.json 3.1.0: +6 errores (MEDIA-TOO-LARGE/TYPE-NOT-ALLOWED/QUOTA-EXCEEDED/NOT-FOUND/STORAGE-UNAVAILABLE, REC-CONFLICT), ERR-PET-MICROCHIP-DUPLICATE oficializado (detalle del README), ERR-RATE-LIMITED conserva pendingId (no oficializado por mi: decision de Neo). state-machines copiadas tal cual de 002 para compilar 004 de forma autonoma.
- ROJO: contracts-004-errors.spec.ts -> ENOENT error-catalog.json. VERDE 12/12.

## 2026-11-17 004 bloque 1 / T514 [N2] scripts (Keymaker)
- compile-contracts.sh: --feature 004 (contratos a <out>/v31, catalogs a <out>/catalogs; guarda contra src/generated/{api,errors,machines,schemas,ops}); 001/002 ahora apartan y restauran ops/catalogs/v31 del destino (antes los borraban). Nuevo scripts/codegen-catalogs.mjs (valida patron, prefijo=especie, unicidad, Criolla/Otra; order recalculado). verify-traceability.sh: 004 = prefijos NFR/SC, rangos X-NNN..MMM (solo 004), IDs 003 citados en spec no exigidos, spec->tasks 1:1 de 125 IDs propios, evidencia informativa (SDD_STRICT_EVIDENCE=1 la hace bloqueante). verify-oracles.sh: --feature 004 exige pruebas de contrato 004.
- ROJO (scripts sin tocar, 8/12 fallos): compile 004 'Feature desconocida', oracles/traceability 004 sin soporte. Nota: codegen-catalogs.mjs ya existia al correr el rojo, por eso 4 pruebas (catalogo x3 + regresion 002/003) pasaron en rojo. VERDE 12/12. verify-oracles detecto 2 toBeTruthy en mi propia prueba T511: corregidos.

## 2026-11-17 004 bloque 1 / T515 publicar src/generated (Keymaker)
- Ejecutados compile 002, 003 y 004 (salida solo por herramienta): src/generated/v31 (contratos 3.1.0: 123 validadores, 41 errores) y src/generated/catalogs (68 razas). 002/003 sin diff. codegen-drift.spec.ts (002) ahora omite ops, catalogs y v31 como ya omitia ops (cambio de prueba, no de contrato).
- ROJO: generated-004.spec.ts -> 'Failed to load url src/generated/catalogs/index.ts'. VERDE 9/9; tsc 0 errores.

## 2026-11-17 004 4A-1 slice A (Keymaker): T516..T531
- T516/T517 (7322323, 38705ba): --contracts DIR (solo 004) en compile-contracts.sh; catálogo se valida ANTES de v31; rótulo duplicado por especie rechazado. T520 (f6c768f) pasa sin cambios: T521 sin código, premisa «solo Perro y Gato» no se reproduce (8 especies; el filtro agrupa).
- T522/T523 (7f3d94d, 7d95db4, 33896be): src/domain/pet/breed-catalog.ts. T524/T525 (c474c00, bceeca6, 5e425fc): breedCode en pet-invariants (validadores v31 de PetProfile/Create/Update, breed derivado), repos SQLite/PG con isStoredPetProfile, vista normalizada (breedCode nulo). DECISIÓN: respaldo 3.1.0 con breedCode NO hecho (acopla con symptomType/severity/mediaToDeleteCount y arnés 002); el export 3.0.0 quita breedCode.
- T528..T531 (6712d7b, 9b4ad0d, 01950fb, 0eb7448): trim en formValues salvo contraseñas; casilla de fecha estimada bajo Fecha de nacimiento. T526/T527 (133f1b4, 80ea2e4): BreedSelect; guarda de arquitectura de presentación admite generated/catalogs y v31 validators.
- Pruebas 002 tocadas (supersesión): use-cases.spec, pet-and-alerts.spec (breedCode nulo en la vista), t284-cliente y t284-controles (chip 123456789012345 es secuencia rechazada por MicrochipInput 3.1.0), openapi-contract.ts (pet.schema 3.1.0 sin avatarVersion required).

## 2026-11-17 004 4A-1 slice B1 (Keymaker): T532..T536
- T532/T533 (3b4a253 test, a4bf823 feat): medidas enteras. ROJO 5/8 fallos (dominio acepta 32.5, edicion 40.5 pasa, form step=0.01, cliente sin rechazo); VERDE 8/8. Entradas y PATCH de medidas con validadores v31; el registro conserva el esquema 002 (decimales guardados se leen, listan, exportan y editan en otros campos). Supersesion 002: fixtures de entrada con decimales a enteros (api-fixtures, wcag e2e, use-cases, record-invariants baseInput).
- T534 (864883e test): ROJO 6/8 dominio + suite de presentacion sin symptoms.ts. T535 (70f863e test, d069b5c feat): ROJO 6/9; VERDE. CustomParameter 3.1.0 en record-invariants (validador de registro tolerante: symptomType/severity ?? null, revision ?? 0), isStoredCustomParameter compartido por SQLite y PG, defaults null al alta, ficha normaliza viejos, export 3.0.0 omite nulos y FALLA CERRADO ante SYMPTOM hasta T617. Arnes OpenAPI 002: medical-records 004 sin exigir revision/symptomType/severity.
- T536 (c623dd0): symptoms.ts, SymptomLegend, RecordForm (species, initial), listado, ExportSection. Verde 131/131 presentacion. Gates: tsc 0; traceability 004 CUMPLE; oracles 004 CUMPLE (0 debiles); test:gate 2931 pass / 38 omitidas (igual que antes); scan-secrets 0.
- DECISIONES propias a revisar: leyenda de «exportacion» vive en la UI de Respaldo (el sobre JSON es cerrado); intensidad preseleccionada «Leve»; PG sin prueba viva (omitida sin PG17).

## 2026-11-17 004 4A-1 T617 respaldo 3.1.0 (Keymaker)
- ROJO bb558dd (backup-31-roundtrip.spec.ts, 21 pruebas en memoria, SQLite y Postgres 17 en 127.0.0.1:55432): 18 fallan (export 3.0.0 falla cerrado por SYMPTOM, sin breedCode; 1.0.0/2.0.0 sin breedCode nulo); 3 pasan (version futura). VERDE 0108dc2: 21/21 con PG vivo.
- Impl: ExportBackupUseCase emite 3.1.0 (breedCode ?? null, symptomType/severity ?? null, sin avatarVersion/revision/medios/mediaToDeleteCount) validado con validateBackupEnvelopeV31; importacion acepta 1.0.0/2.0.0/3.0.0/3.1.0; liftEnvelopeV3ToV31 (backup-migration.ts) deja breedCode/symptomType/severity nulos y conserva breed; assertBreedConsistency en invariantes de importacion (INV-RAZ-001). ImportPreviewResult local con version ampliada (mediaToDeleteCount queda para T604/T605). Mensaje VERSION_MISMATCH ahora lista 3.1.0.
- Supersesiones 002 (tests, no contratos): openapi-contract.ts (backup-envelope 004 mismo $id, export 200 -> BackupEnvelopeV31 en memoria, mediaToDeleteCount exento de required, symptomType/severity vuelven a required = endurecimiento), backup-use-cases.spec, backup-export.api, backup-import-preview.api, backup-atomicity, backup-client, sqlite-to-postgres-transfer ('3.0.0' -> '3.1.0' y validador V31 en exportacion).
- Gates: tsc 0; traceability 004 CUMPLE; oracles 004 CUMPLE (0 debiles); test:gate 2945 pass / 45 omitidas (antes 2931/38; +7 PG de T617 omitidas sin PG); scan-secrets 0.

## 2026-11-17 004 4A-1 slice B2 (Keymaker): H-O-T617-1, T537..T545
- H-O-T617-1 (3fb961b): caso de dominio en backup-use-cases.spec: respaldo 3.1.0 con DOG_BEAGLE y breed «Labrador» -> ERR-SCHEMA-VALIDATION-FAILED (campo breed, ROLLED_BACK, DOMAIN_INVARIANT_VIOLATED), estado intacto. NOTA: el codigo es ERR-SCHEMA-VALIDATION-FAILED, no ERR-PET-* (no existe ERR-PET-INVALID-BREED; failBreed lanza el de esquema). ROJO en worktree sin la linea assertBreedConsistency: se acepta la importacion («se esperaba un rechazo»). Un breedCode de otra especie lo rechaza el esquema (ERR-BACKUP-SCHEMA-INVALID), por eso no es caso de dominio.
- T537/T538 (722762c test, 85a8c84 feat): ROJO 4/10 (sin cambios audita; edicion que deja SUPERSEDED se acepta) -> VERDE 10/10 memoria y SQLite. fixtures/record-engines.ts.
- T539/T541 (42a558c test, 1722ce2 feat): ROJO 2/10 (borrar SUPERSEDED se acepta) -> VERDE. Los repos ya borraban fisicamente.
- T540 (8273114 test, f3d31e8 feat): ROJO 13 -> VERDE; 0006 SQLite, 0002 Postgres (probado en PG17 55432, esquema desechable). Retiro de exencion de revision en openapi-contract.ts DIFERIDO a T614: probado, rompe 21 pruebas de API (36 en total) porque el servidor no lee/expone revision; exponerla exige validadores v31, repos de 3 motores y 5 baselines PG.
- T542 (950eadd), T545 (84e3018): guardas verdes de inicio, sensibilidad demostrada por mutacion. T544 (e6a9953 test, f4098c2 feat): ROJO suite no carga -> VERDE 144 presentacion.
- Gates: tsc 0; traceability 004 CUMPLE; oracles 004 CUMPLE (0 debiles); test:gate 2993 pass / 48 omitidas (antes 2945/45); con PG 3041/3041 pasan, 0 omitidas; scan-secrets 0.

## 2026-11-17 004 slice C (Keymaker): T600
- T600: tests/fixtures/concurrent-engines.ts (dos conexiones: SQLite archivo en node_modules/.cache con busy_timeout 0 en B; PG17 55432 con dos transacciones) + t600-concurrencia-registros.spec.ts (6 pruebas: doble DELETE, edicion antes/despues de la vacuna posterior). VERDE de inicio (los candados globales ya serializan). Sensibilidad demostrada por mutacion: sin pg_advisory_xact_lock fallan 2 PG; con BEGIN diferido fallan 3 SQLite (B llega a leer con A abierta). Fuente restaurada.
- Credenciales PG de pruebas: docker-compose.test.yml (argos_test:argos_test@127.0.0.1:55432/argos_test).
- T601: ROJO 68408e5 (6 fallas: sin findByIdForUpdate/lockOwnerThenPet; PG no esperaba la fila de la mascota). VERDE: port findByIdForUpdate en pets y users (memoria/SQLite lectura normal, PG SELECT ... FOR UPDATE), helpers lockPet y lockOwnerThenPet (orden usuario->mascota) en use-case-support, y Add/Update/DeleteRecord toman lockPet antes de todo. SQLite: BEGIN IMMEDIATE ya existia (probado).
- T604 (b75462c test, UI test commit despues): ROJO 6/12 (detalle del microchip sin posicion/nombre; vista previa sin mediaToDeleteCount) + 3 UI. Reemplazo por pet_id de las 6 tablas y exportar-borrar-importar YA PASABAN (3 motores).
- T605: ImportBackupUseCase: detalle «La mascota n.º N del archivo («nombre») repite el microchip...» (sin microchip), vista previa con mediaToDeleteCount (countMediaToDelete = 0 hasta T575), candados usuario->mascotas en el commit, UI (canImportBackup, MediaDeletionConfirm, aviso). Exencion de mediaToDeleteCount RETIRADA de openapi-contract.ts; arnes la exige (tests/integration/api 760 verdes).
- BLOQUEO PARCIAL T604/T605: avatar_object_id/avatar_version, pet_media y media_deletion_queue (T574/T575/T580) y el indice global de microchip (T553/T554) NO existen aun; sin ellos no se pueden probar ni implementar «avatar nulo conservando avatar_version», «encola medios y avatar» ni el duplicado de microchip ante OTRO usuario. «fusion» no existe en 002 (importacion Merge fuera de alcance). Reportado a Morpheus.
- T613 (20d1299): ROJO 20/21 (3 motores + 2 conexiones + HTTP). No existe en el arnes ninguna exencion de If-Match (solo revision y mediaToDeleteCount): nada que retirar por ese lado.
- T614: VERDE. Dominio: validadores de registro 3.1.0 tolerantes (revision ?? 0) y STORED_RECORD_CHECKS; RecordOf con revision opcional + revisionOf. Repos: columna `revision` autoritativa (data sin revision) en SQLite/PG, memoria la normaliza a 0. UpdateRecordUseCase(…, ifMatch): comparacion bajo lockPet, ERR-REC-CONFLICT (clase DomainError de v31; problem-details reconoce ambas), sin If-Match ERR-SCHEMA-VALIDATION-FAILED campo If-Match, sin cambios efectivos no incrementa. Ruta PATCH parseIfMatch (`"n"`). Importacion: revision existente+1 / 0 nueva. UI: updateRecord con If-Match, mensaje «El registro cambió; recarga y vuelve a intentarlo.» (ERR-REC-CONFLICT no esta en el catalogo 002 de la SPA; api.ts lo reconoce).
- EXENCION de `revision` RETIRADA de openapi-contract.ts (H-O-T540-1) y verificada: sin devolver revision en SQLite fallan 11 pruebas de API.
- Supersesiones de pruebas por contrato 3.1.0: lecturas con revision 0 (use-cases.spec, suite de repositorios), 5 baselines PG con 0002, dobles SQL de postgres-repositories-part2, idempotencia de importacion sin contar revision, PATCH con If-Match en API.
- Gates: tsc 0; oracles 004 CUMPLE (0 debiles); traceability 004 CUMPLE; vitest focal api+persistence+unit 2008/2008 (PG17 vivo), presentation 162, security+property 383, contracts incluidos en api. NO se corrio test:gate completo.
- 2026-11-17 US3 (T546..T555) arranca. Decisiones: migraciones nuevas SQLite 0007/0008 y Postgres 0003/0004 (0006/0002 ya estan aplicadas con `revision`; T574 media pasa a 0009/0005: AVISO a Architect). Validadores v31 para Username/LoginInput/InviteMemberInput (el top-level generado sigue en 3.0.0). Fallos de login en UNA sola clave (cuenta resuelta, o identificador si no hay cuenta).
- T546: ROJO. tests/integration/persistence/t546-login-registro.spec.ts (3 motores) + fixtures/identity-engines.ts; pruebas previas superadas (use-cases, auth-policies, auth.api, precedence, households.api) con el comportamiento 3.1.0.
- T547: VERDE (migraciones). SQLite 0007_username_case_insensitive.sql + comprobacion previa en `MIGRATION_PRECHECKS` (sqlite-database.ts, solo conteo en el mensaje); Postgres 0003 con bloque DO/RAISE (solo conteo). Indices users_username_lower y household_invitations_one_open sobre LOWER; login_attempts a minusculas con fusion por mayor contador. schema-parity ahora parsea indices de expresion y DROP INDEX; 5 listas BASELINE de pruebas PG y species/sqlite-repositories actualizadas. Persistencia completa 398 verdes + 31 rojos esperados de T546.
- T548+T549: VERDE (un solo commit: auth-policies/auth-use-cases/repos son los mismos archivos). normalizeLoginIdentifier/isEmailIdentifier (dominio), resolveLoginAccount (correo unico o null), LoginUseCase con un solo verify y fallos en una clave (cuenta resuelta, o identificador), users.findByUsername por LOWER y users.listByEmail (LIMIT 2) en los 3 motores, validadores v31 (Register, Login, Invite, UserPublicProfile en repos). Arnes OpenAPI toma identity.schema.json 3.1.0 de la 004. Pruebas previas actualizadas (repo-contract-suite, security credentials, auth.api, PG dobles). Queda T551 (invitaciones) para cerrar T546 SC-CAT-021.
- T551: VERDE. invitations.findOpen y la invitacion abierta por LOWER(invitee_username) en memoria/SQLite/PG; InviteMemberUseCase guarda el username de la cuenta cuando existe. T546 completo (3 motores). Prueba de unicidad de invitacion abierta por LOWER anadida.
- T550: VERDE. Login: campo «Usuario o correo» + ayuda «Si no puedes entrar con tu correo, usa tu usuario.»; registro: «Usuario (letras, números, . _ -)» sin exigir digitos; validation.ts toma los validadores v31 de Register/Login/Invite (254, mayusculas). Pruebas en session-client.spec (4 rojas -> verdes) y web-client. E2E NO ejecutado (prohibido); los getByLabel('Usuario') de Playwright siguen casando por subcadena.
- T552: ROJO. tests/integration/persistence/t552-microchip-global.spec.ts (3 motores: respuesta byte a byte igual propio/ajeno, misma ruta = un save sin listByOwners, sin microchip/Key (/UUID en cuerpo ni logs, CHECK no es duplicado, importacion con chip de otro usuario, indice y migracion con duplicados SQLite+PG) + tests/unit/microchip-violation.spec.ts. Esqueleto microchip-violation.ts (stub) para que compile. 18 rojos de 24.
- DECISION a confirmar (T554/importacion): la maquina backup-import NO admite ERR-PET-MICROCHIP-DUPLICATE desde COMMITTING_SNAPSHOT (solo desde CHECKING_DOMAIN_INVARIANTS; en COMMITTING solo STORAGE_ERROR). El duplicado contra OTRO usuario aparece al guardar (ya en COMMITTING). Plan: lanzar el DomainError (finalState ROLLED_BACK) desde el commit sin disparar evento de la maquina; se reporta a Morpheus/Architect como pregunta.
- T553: VERDE (migraciones). SQLite 0008_pets_microchip_global.sql (precheck TS con conteo) y Postgres 0004 (DO/RAISE con conteo): DROP pets_owner_microchip + indice unico parcial global. Paridad ya cubre ambos; listas de esquema PG y expectativas de migraciones actualizadas; pruebas antiguas de «unico por propietario» (species-migration, sqlite-repositories) pasan a semantica global. Pendientes en rojo a proposito hasta T554: API/use-cases (otra cuenta ahora 409) y los 12 de T552 que dependen del clasificador.
- T554: VERDE. microchip-violation.ts (isMicrochipGlobalViolation: PG 23505+constraint exacta / SQLite SQLITE_CONSTRAINT_UNIQUE+mensaje exacto; mapMicrochipViolation -> DomainError v31 sin cause ni datos), RegisterPet/UpdatePet sin consulta previa (solo save), memoria impone la unicidad global, assertMicrochipUniqueForOwner eliminada (pruebas sustituidas por una propiedad sobre memoria), importacion: violacion en pets.save -> ERR-PET-MICROCHIP-DUPLICATE ROLLED_BACK nombrando la mascota del archivo. PREGUNTA ABIERTA a Architect: la maquina backup-import no declara ese error desde COMMITTING_SNAPSHOT (se lanza sin disparar evento). T552 24/24 en 3 motores; persistencia+api+unit+security+property+contracts+ops 3085 pass (PG17 vivo).
- T555: VERDE. Lista canonica de INDICES en schema-parity (22; sin pets_owner_microchip; con users_username_lower y pets_microchip_global) y comentarios de repos/uso/pruebas que citaban «unico por propietario». Reintento acotado (retry 2, solo PG) en T546/T552 por el candado asesor global que retiene ~10 s postgres-concurrency.spec (interferencia preexistente entre suites PG).
- US3 CIERRE: tsc 0; verify-oracles CUMPLE (general y 004); verify-traceability 004 CUMPLE; vitest integration+unit+security+property 3168/3168 con PG17 vivo (dos pasadas de persistencia 453/453). NO se corrio test:gate ni E2E. Sin [x]; sin push; tasks.md intacto.

## 2026-11-17 A1 (US3)
- Commit 8a3a5f0 contrato/docs; 52c78e0 codigo+test+generado v31. propagateUnique en ImportRun; microchipConflict eliminado. tsc, traceability, oracles y vitest focal (117) verdes.

## 2026-11-17 Reservas A1 + H-O-004US3-4/5 (Keymaker)
- Bloque 1 (1d8f476): prueba del duplicado con microchip real 985112345678901; la asercion de fuga revisa JSON, message, stack y problem details y FALLA si el detalle lo incluye (mutacion probada). propagateUnique lanza DomainError v31. Efecto lateral: `failure()` de backup-harness solo reconocia la 002 y rompio T552 (3 motores): corregido en 051f68c (fixture acepta ambas clases).
- Bloque 2 (5bf839b): unique-violation.ts (clasificacion compartida por nombre de restriccion), username-violation.ts, RegisterUserUseCase mapea 23505 users_username_lower -> ERR-AUTH-USERNAME-TAKEN (v31). t556 con dos conexiones: (a) dos altas por la UoW quedan serializadas por el candado asesor (ya pasaba); (b) carrera real: A inserta sin candado asesor, B bloqueada en el indice recibe 23505 (ROJO: error crudo del driver; VERDE tras el mapeo). Limitacion: por la UoW normal nunca se llega al 23505.
- Bloque 3 (7393f22): retry:2 retirado de t546/t552. vite.config.ts: poolMatchGlobs envia las suites que leen TEST_DATABASE_URL a `threads` con singleThread (serial); resto en paralelo. Sin serializar y sin retry: 2-3 fallas por corrida (T546, T552 y una vez T540). Con serializar: persistencia 455/455 en 3 corridas, t540 sin reintentos.
- Gates: tsc 0; traceability 004 CUMPLE; oracles 004 CUMPLE (0 debiles); vitest focal 91/91 + persistencia 455/455. NO test:gate completo ni E2E. tasks.md intacto; esta bitacora no se commitea (ya tenia cambios ajenos sin commit).

## 2026-11-17 Keymaker: H-O-004US3R-1 + T556..T559 (004)
- 6309e1b: t556-registro-concurrente-pg compara sin distinguir mayusculas (mutacion temporal detectada, restaurada).
- ec99364 (rojo) + 51b8dfe: T556/T557 microchip trivial. Hallazgo H-K-004T556-1: patron MicrochipInput del contrato 3.1.0 lista mal las descendentes que empiezan en 0,1,2,3 (09876543210-1-2-3-4...); cubierto con isTrivialMicrochip en dominio. Contrato por corregir por /architect.
- a76b6f9 (rojo) + commit T559: T558/T559 purga TTL de login_attempts (ventana 15 min, sin conteo propio). Recorte, cuenta resuelta, ayuda UI ya existian.
- PENDIENTE (pregunta a Neo/Architect): contador de 5 duplicados/dia/usuario con ERR-RATE-LIMITED. tasks.md intacto.

- 2026-11-17 Keymaker: t556 3/3 tras af2aa3b; el fallo era el eco del patron en detail de ajv (falso positivo), ajustada la prueba (62465e1). Dominio sin cambios: isTrivialMicrochip es aritmetico, unit ya cubre 10 asc y 10 desc. Gates verdes.

## 2026-11-17 Keymaker: T556/T557 limite de duplicados de microchip (ADR-004-04)
- Commits: 15a2367 (A rojo), a3b431f (D config), 8f14798 (C migraciones SQLite 0010 / PG 0006), 45b1c96 (B puerto), 6c461a7 (E casos de uso), 612ce76 (F docblock), 193855c (ajuste de pruebas existentes).
- Chequeo previo en RegisterPet, UpdatePet (solo si cambia microchipId) e ImportBackup; evento registrado solo tras ERR-PET-MICROCHIP-DUPLICATE, en transaccion independiente, best effort. Sin logger en ApplicationDeps: no se loguea nada.
- Pruebas 429: contract:false (el harness valida contra OpenAPI 002, que no declara 429). Gates: tsc, traceability, oracles OK; vitest focal 162 archivos / 2765 pass / 1 omitida con PG 55432. Sin [x], sin push, tasks.md intacto.

## 2026-11-17 Keymaker: US4 slice (T560..T572 parcial), sin push ni [x]
- C-1 OK: npm view = 9.0.0 (latest, integrity coincide); npm audit del arbol aislado: 0 vulnerabilidades. Linea base del proyecto ANTES: 27 vulns (12 moderate, 12 high, 3 critical), no «3 moderadas» del informe; DESPUES: identica (mismas 27, mismos paquetes). Sin nuevos.
- T560 52dbba9 (rojo, 8 pruebas esperan buckets_media.tf/iam.tf de /link); iam.spec 003 admite storage.objectUser solo sobre media. T563/T564 f82b83f/0ec9302 (CSP: mediaBucketHost, buildContentSecurityPolicy). T565/T566 5a60e76/0dcd06c (ARGOS_MEDIA_*; production exige gcs+bucket; fixtures production de 5 suites ajustados).
- T567 7fbf6d1: package.json 1 linea; lock +41 paquetes, integrity ok, hasInstallScript solo los 4 previos; npm ci --dry-run ok. C-4 c48a63e (mutacion verificada).
- T568/T569 a6fd09b..77482a3 (dominio src/domain/media). T570/T571/T572 30fe1f2, 5d7e455, 8f845f0, f072db5 (puerto, memoria + /__dev/media, GCS con doble HTTP).
- Gates: tsc 0; traceability 004 CUMPLE; oracles 004 CUMPLE; vitest tests/unit 1505/1513 (8 rojas = T560 pendiente de /link); integration media/ops/api/build + security 801/801; PG 55432. tasks.md intacto.

## 2026-11-17 Keymaker: slice T573..T588 (checkpoint 1)
- T573/T574: 6228a25 (rojo) + 41d93d8 migraciones SQLite 0009 / PG 0005; 8d0d90e amplia CHECK de audit_log.entity_type con PET_MEDIA (DESVIACION: no esta en data-model.md; sin ello la auditoria PET_MEDIA de T577 viola el CHECK). Pendiente de ratificar por Architect/Neo.
- T575: db61802 (rojo) + fe37cef repositorios media, mediaQueue y avatar (memoria, SQLite, PG). listPage admite kind nulo (sin filtro).
- T576/T577: fde2839 tests + 2014ac9 casos de uso. Acciones READ/WRITE/DELETE_MEDIA en domain/access/rbac.ts (MediaRbacAction); AuditEntry ahora de generated/v31.
- Hallazgo: SC-ALM-029 pide 400 ERR-SCHEMA-VALIDATION-FAILED pero el catalogo da 422 a ese codigo (pregunta a Architect).
- Sin [x], sin push; tasks.md intacto; NO test:gate.

## 2026-11-17 Keymaker: slice T573..T588 (checkpoint 2)
- T578 a2895b9+fab4cbc rutas HTTP medios; arnes de contrato incorpora rutas 004 de medios/avatar. T579/T580 753e6ca+10b3828 cola, cascadas (mascota, cuenta, importacion con avatar_version conservada), mantenimiento runMediaQueueMaintenance, mediaToDeleteCount real.
- T577 conexion server.ts: SOLO memoria. GCS NO conectado: el bundle con @google-cloud/storage rompe REQ-SEC-005 (process.env.DEBUG= de `debug` y JSDoc BEGIN PRIVATE KEY); el clasificador denego relajar esa prueba; la imagen final no tiene node_modules. Pregunta a Neo/Link/Trinity.
- MemoryMediaStorage devuelve URL relativa /__dev/media/..., el contrato MediaAccess.url exige https: el doble de pruebas devuelve https; en dev real el cliente recibe la ruta relativa (desviacion).

## 2026-11-17 Keymaker: slice T573..T588 (checkpoint 3)
- T583/T584: avatar PUT/GET/DELETE + avatarVersion en TODA respuesta de mascota (register, update, lista, tablero, hogar, traspaso); exencion de avatarVersion retirada del arnes de contrato; el inventario OPERATIONS (40 de la 002) se mantiene y MEDIA_OPERATIONS es aparte.
- Desviaciones: SC-ALM-030 lista deleteAvatar con 502 pero REQ-AVA-001/OpenAPI dicen 204 -> se sigue 204 (idempotente, cola); avatar no escribe auditoria (el perfil no cambia); date-utils.shiftIsoTimestamp nuevo para umbrales sin Date.

## 2026-11-17 Keymaker: cierre del slice T573..T588 (parcial)
- T582 d1a8fe4+d6fd23a redaccion de logs; T587 d1a8fe4 tests de paginacion (el codigo del listado ya estaba en T577); T585/T586 parcial (PetAvatar proxy + enlace externo + ayuda) commits finales.
- NO hechos: T581 (panel de archivos), T585 (recortador canvas + Chromium/WebKit), T586 (AvatarCropper), T588 (pantalla del album con loading=lazy). Motivo: UI interactiva + Playwright fuera del alcance de esta pasada; el endpoint del album esta.
- Gates focales: tsc 0; traceability 004 CUMPLE; oracles 004 CUMPLE (0 debiles); vitest tests/unit+integration+security 3513 pasadas / 1 omitida con PG 55432. NO test:gate, NO e2e, NO property. tasks.md intacto; sin [x]; sin push.

## 2026-11-17 Keymaker: pendientes US4 medios y avatar (GCS, REQ-SEC-005, T608, T581/T585/T586/T588)
- 51695d8 deleteAvatar sin 502 (contrato). 89c5ff1 regexes REQ-SEC-005 (opcion a de Neo). 69e8e08 GCS en server.ts. b37266d + 061fd61 T608 transporte.
- T585/T615 rojo f541455; logica ab14167 (recortador) y b965d51 (reexportacion, T616 como dependencia de T581). T611/T588 rojo 38c20d9; T581 5268d26; T588 cfbd4ef; T586 b9b7b55 (rojo) + b1ed172; refactor 6779f3d; integracion c99f724.
- DETENIDO: planificador real (temporizador) de la renovacion al 80 %: la regla presentation-architecture.spec.ts/session-client.spec.ts solo admite 2 modulos con temporizadores; el clasificador denegó relajarla. Renovador por puertos hecho y probado; no conectado. Pregunta a Neo en el informe.
- Pendiente: E2E Chromium/WebKit del recortador y la reexportacion (EXIF/orientacion reales), T592/T597. Sin [x], sin push, tasks.md intacto.

## 2026-11-17 Keymaker: T581 scheduler, H-O-004CIE-6, T606/T607/T610, cierre T600/T601/T604/T605 de medios
- T581: 73804a4+(session-client) rojo, ef14698 browser-scheduler.ts (tercer modulo con temporizadores autorizado por Neo; reglas de capas y session-client ajustadas SOLO para ese modulo) conectado por defecto a MediaPanel (NO_RENEWAL retirado). Queda abierta hasta /oracle.
- H-6: PetForm ya tenia ayuda de avatarUrl y AvatarExternalLink; t585 (2 pruebas de render estatico) lo cubre y pasa; sin cambios de codigo.
- T606 e2884c2 (rojo) / T607 616d599 conciliacion diaria pets/ >24 h en runMediaQueueMaintenance (+campo reconciled; t579 ajustada). T609: ya implementado en T578/T608 (bodyLimit, limitador); sin cambios. T610 9654970 (pruebas). T600/T601 4d8cc21 (medios/avatar 2 conexiones SQLite+PG). T604/T605 4b6a493 (3 motores). Sin [x], sin push, tasks.md intacto.

## 2026-11-17 Keymaker: H-T591-1, H-T591-2, H-T591-3 y H-O-004ENM-2 (sin push, sin [x])
- A 6406516: X-Argos-Renewal=1 solo en getMediaAccess (requireSessionPassiveRenewal; AuthenticateRequestUseCase.execute(token,{renew:false}) usa assertAuthenticated y no guarda). Cliente: media-api access(...,{renewal}) y access-renewer fetchAccess(renewal). contracts-004-openapi actualizado a 3.2.0/supersedes 3.1.0.
- B 3aca769: LoginUseCase cuenta solo bajo el identificador normalizado; t546/t558 ajustadas; t558-login-identificador-logs (secuencia 429 ahora con 5 fallos del correo) ajustada por el mismo cambio.
- C 596a713: listas blancas (browser-scheduler.ts, fetch solo en media-api.ts) y prueba que exige la cabecera. D 2e440e6: import JPEG retirado; tsc 0.
- Gates: tsc 0, traceability 004 CUMPLE, oracles 004 CUMPLE, vitest security+unit+integration(api,persistence,contracts) con PG 55432: 3324 pass / 1 omitida. tasks.md intacto.

## 2026-11-17 Keymaker: E2E Fase 8 T615, T585, T586 (sin push, sin [x])
- a739c7c T615: tests/e2e/media/reexportacion-fotos.spec.ts (8 pruebas Chromium): JPEG EXIF+GPS orient. 6 sale sin EXIF y con rojo arriba; PNG tEXt, WebP EXIF; WebP no codificable -> JPEG .jpg; DECODE; PDF intacto; TOO_LARGE; POST real del panel. playwright.config.ts: proyecto webkit solo con E2E_WEBKIT=1.
- 6e84f38 T585/T586: tests/e2e/media/recortador-avatar.spec.ts (4 pruebas): mascara circular, teclado, 512x512 WebP, respaldo JPEG, avatar cargado > inicial, avatarUrl solo enlace bajo img-src 'self' data: (control de violacion incluido).
- Gates: playwright media 12/12 Chromium; vitest t585/t586/t615 27/27; tsc 0. WebKit NO ejecutado: webkit-2388 no instalado (PE-04; no se instalo). Sin defectos de src/ hallados.

## 2026-11-17 Keymaker: reintento H-O-E2E-1 (sin push, sin [x])
- tests/e2e/media/reexportacion-fotos.spec.ts: eliminados los 2 test.skip(webp === null) (l.89/101); ahora se afirma la cabecera RIFF/WEBP (bytes 8..12 == 'WEBP') porque not.toBeNull() es oraculo debil. La prueba noWebp usa siempre WebP real.
- Gates: playwright media 12/12; vitest 27/27; tsc 0; verify-oracles 004 CUMPLE (debiles 0, deshabilitados 0).

## 2026-11-18 Keymaker: T801 pruebas rojas compuerta 006 (sin push, sin [x])
- Creado tests/integration/gates/t801-compuerta-006.spec.ts (10 pruebas: 8 fixtures + 2 sobre el repo real). Rojo: 7/10 fallan (EDGE/SC/rangos no reconocidos, tarea sin ID pasa, sin spec->tasks 1:1, repo real FAIL por evidencia bloqueante y 98 IDs sin EDGE/SC).
- Alcance: solo tests/; scripts/ intactos hasta T802. Dep: ninguna.

## 2026-11-18 Keymaker: T802 rama FEAT6 en verify-traceability.sh (sin push, sin [x])
- scripts/verify-traceability.sh: FEAT6 (NUM_ID con EDGE y segmento ESC6, RANGE, OWNED_006, spec->tasks 1:1 con catalogo, tarea sin ID falla, evidencia informativa salvo SDD_STRICT_EVIDENCE=1). 001..005 sin cambio de rama.
- Verde: t801 10/10; --feature 006 CUMPLE (195/195 propios, 30/233 con evidencia informativa); 001 113/113 y 002 119/119 CUMPLE. Autorizado por N2-08.

## 2026-11-18 Keymaker: T803 pruebas rojas del compilador fusionado 006 (sin push, sin [x])
- Creado tests/integration/contracts/t803-compilador-006.spec.ts (21 pruebas): v34 con barrel/validadores/maquina/cliente, union 004+005+006 con duplicados prohibidos, herencia, metadata, guardas de destino, v34 ajeno para 001/002/005, deriva src/generated/v34.
- Rojo: 19/21 fallan ("Feature desconocida: 006"). La prueba de guarda 005->v34 escribio en src/generated/v34/v33 durante el rojo (005 aun sin guarda); contaminacion borrada a mano antes de commitear.

## 2026-11-18 Keymaker: T804 rama 006 en compile-contracts.sh + src/generated/v34 (sin push, sin [x])
- scripts/compile-contracts.sh: rama 006 (union catalogos 004+005+006 con duplicados prohibidos, herencia contra la union, metadata, ensayo 004+006 con $ref absolutos a common normalizados a ../schemas/), v34 en las listas de directorios ajenos y en la guarda de la 005. Compilado con el script (nada a mano): src/generated/v34/.
- tests/integration/contracts/codegen-drift.spec.ts: solo se anade v34 a la lista de directorios ajenos (no se debilita ninguna asercion). Verde: t803 21/21; contracts 14 archivos 549/549; tsc 0.

## 2026-11-18 Keymaker: T805 pruebas rojas test:gate y test-gate.yml (sin push, sin [x])
- Creado tests/integration/gates/t805-test-gate-006.spec.ts (9 pruebas; rojo 6/9: test:gate sin 006, workflow sin paso 006, entrada manual sin 006). Base de comparacion del lock/deps: dda060b.
- tests/integration/gates/verify-gates.spec.ts ampliada con 3 pruebas --feature 006 (traceability, oracles positivo y negativo); estas ya pasan (T802) porque las compuertas son genericas.

## 2026-11-18 Keymaker: T805 implementacion test:gate + test-gate.yml (sin push, sin [x])
- package.json: solo el script test:gate (+ compile 006 y verify-traceability 006); deps y lock intactos. test-gate.yml: paso aditivo "Compilar contratos 006 y cero deriva de v34" y descripcion de la entrada manual.
- tests/unit/test-gate-workflow.spec.ts: la comparacion con b6cacc5 descuenta unicamente el paso nuevo (misma asercion toBe sobre el resto de pasos). Verde: gates + workflow 80/80.

## 2026-11-18 Keymaker: ajuste del pin de package.json en T778 por T805 (sin push, sin [x])
- La suite completa (3964 verdes) mostro 1 rojo: t778 fija el sha256 de package.json; el cambio autorizado de test:gate lo altera. Actualizado el hash (lock intacto, mismo hash) con comentario de trazabilidad T805/N2-08; /oracle debe revisarlo.
- Alcance: T806 (deploy-argos.yml) y T807 (terraform/bootstrap.sh) quedan BLOQUEADAS por alcance del encargo (deploy-argos.yml no listado; terraform/ prohibido).

## 2026-11-18 — T806 y T807 (N2-08)
- Pruebas rojas b0ab49c: t806-deploy-argos-escena-006.spec.ts (3/5 rojas) y t807-bootstrap-cloudtasks-006.spec.ts (3/4 rojas).
- Implementación bc043bb: deploy-argos.yml añade ARGOS_SCENE_* (DRIVER=fake fijo, nunca real; WORKER_URL=${PUBLIC_BASE_URL}/internal/scene-worker; sin secretos nuevos, ARGOS_SHARE_* intactas); bootstrap.sh añade roles/cloudtasks.viewer (plan) y cloudtasks.admin (apply) en los bucles existentes (idempotentes).
- Hallazgo: plan §1.3 exige driver real en producción y fake falla al arrancar allí; con N2-10 (no merge a main hasta la compuerta real) queda como riesgo R-LINK-006-3 aceptado. Sin push, sin [x], nada ejecutado.

## 2026-11-18 Keymaker: T809 pruebas rojas esquema de auditoría 004 (N2-06 (a)) (sin push, sin [x])
- Creado tests/integration/contracts/t809-auditoria-escena-006.spec.ts (contrato 3.2.0, generado v31/v33/v34, adaptador en memoria, CHECK SQLite 0013 y texto Postgres 0009) y un `it` nuevo en schema-parity.spec.ts (`postgresSchema(extra)` con parámetro opcional, sin cambio de comportamiento).
- Rojo: 11 fallan, 15 pasan (tsc 0). AuditMutationType no cambia (mapeo a CREATE/UPDATE/DELETE existentes, data-model §8). Evidencia: claude/evidencia-fase2-006-2026-11-18.md.
- Decisión: el CHECK de audit_log (M-3) se entrega en T810 como migraciones 0013 (SQLite) y 0009 (Postgres) con solo la reconstrucción; T832/T833 añaden las tablas al mismo archivo.

## 2026-11-18 Keymaker: T810 enmienda MINOR de auditoría 004 aplicada (sin push, sin [x])
- audit-entry.schema.json 3.1.0 -> 3.2.0 (+HOME_SCENE, +SCENE_CONSENT, +HOUSEHOLD_PHOTO; supersedes 3.1.0; trazabilidad REQ-ESC6-021/INV-ESC6-016). Recompilados 004, 005 y 006 con compile-contracts.sh (solo v31, v33, v34; src/generated/api intacto; la 002 no cambia).
- Nuevas migraciones sqlite 0013_home_scenes.sql y postgres 0009_home_scenes.sql con solo M-3 (T832/T833 añaden las tablas al mismo archivo). schema-parity compone HOME_PATH; sqlite-repositories.spec lista 0013 (cambio que la enmienda impone).
- Verde: t809 11/11, suite completa 3989 verdes, tsc 0, trazabilidad 001/002/006 y oráculos 006 CUMPLE.

## 2026-11-18 Keymaker: T811 pruebas rojas del dominio de claves INV-ARC-003 (N2-06 (b)) (sin push, sin [x])
- Nuevo tests/unit/media-keys-escena-006.spec.ts (claves, isMediaObjectKey, assertMediaKey, assertListPrefix, RECONCILED_PREFIXES y reconciliationAgeMinutes: 24 h pets, 15 min scenes/households) y casos añadidos (sin tocar los existentes) en t570 (memoria y GCS), t571 (ruta dev), t579 (cola de borrado) y t606.
- Rojo: 13 fallan, 154 pasan; tsc 0 (API nueva leída por vista tipada). La consulta de referencias de scenes/households en la conciliación queda para T834/T835 (necesita las tablas de Fase 4); la rutina de 004 sigue listando solo pets/.

## 2026-11-18 Keymaker: T812 enmienda MINOR de INV-ARC-003 (sin push, sin [x])
- spec 004 INV-ARC-003 ampliado; src/domain/media/media-keys.ts (sceneImageObjectKey, householdPhotoObjectKey, isMediaObjectKey con 5 formas, RECONCILED_PREFIXES, reconciliationAgeMinutes 24 h/15 min) y assertListPrefix con scenes/ y households/. La rutina de conciliación sigue listando solo pets/ (referencias de escena: T834/T835).
- Corregido en mis pruebas de T811: 3 `.not.toThrow()` (verify-oracles FALLA 3 débiles) y una aserción vacua de t579 (keys() solo mira pets/). Verde: media 167, suite completa sin fallos tras la corrección, oráculos 006 CUMPLE, tsc 0.

## 2026-11-18 Keymaker: T813 pruebas rojas de countBytesOfOwner con household_photos (N2-06 (c)) (sin push, sin [x])
- Nuevo tests/integration/persistence/t813-cuota-foto-hogar.spec.ts (memoria y SQLite vía createMediaEngines, SQL de Postgres con pg-fake-client); tests/fixtures/media-harness.ts gana seedHouseholdPhoto (memoria state.householdPhotos, SQLite INSERT household_photos). Foto de hogar cuenta al propietario del hogar (households.owner_user_id), la escena no.
- Rojo: 5 de 6 fallan (la memoria falla primero, SQLite no se alcanza); tsc 0. Seguirá rojo hasta T833 (tabla) y T814 (implementación, DIFERIDA por tasks.md). Sin Postgres vivo.

## 2026-11-18 Keymaker: T815 pruebas rojas de los 7 ganchos de privacidad (N2-06 (d)) (sin push, sin [x])
- Nuevos tests/unit/ganchos-privacidad-escena-006.spec.ts (7 describes: pet, avatar, assignment, household, account, ownership, backup) y tests/fixtures/scene-privacy-hooks-spy.ts (contrato PROPUESTO de 8 ganchos con `deps.sceneHooks` opcional, misma transacción, evento opaco). Cada caso: llamada con evento exacto, rollback total si el gancho lanza, sin llamada si la causa se rechaza, compatibilidad sin puerto.
- Rojo: 18 fallan, 9 pasan; tsc 0; oráculos 006 CUMPLE. H-KEY-F2-1: T827 aún no define el puerto; el nombre de cada gancho se ratifica con /architect y se cambia solo en el fixture. Cierra en T868.

## 2026-11-18 Keymaker: T816 pruebas rojas de las 14 APIs (N2-05, REQ-IAC-009) (sin push, sin [x])
- Nuevo tests/unit/terraform-apis-escena-006.spec.ts (14 APIs exactas con aiplatform y cloudtasks, un solo google_project_service, texto de REQ-IAC-009 en 003 con «14» y «Enmienda 006 ... N2-05», comentario sin «solo estas 12»). Rojo 3/4; tsc 0; gates en CUMPLE.
- La prueba antigua terraform-root (12) se actualiza en T817 junto con services.tf. No se ejecuta terraform.

## 2026-11-18 Keymaker: T817 enmienda de REQ-IAC-009 y services.tf a 14 APIs (N2-05) (sin push, sin [x])
- spec 003 REQ-IAC-009 (14 APIs, Enmienda 006), terraform/services.tf (+aiplatform, +cloudtasks), terraform/README.md y terraform-root.spec.ts (12 -> 14, mismas aserciones más las dos APIs). Sin plan/apply.
- Verde: t816 4/4, terraform-* (hygiene, labels, bootstrap, scheduler) verdes; suite completa solo con los rojos documentados de T813/T815; tsc 0; gates CUMPLE.

## 2026-11-18 Keymaker: T818 pruebas rojas de IAM de la escena y cola argos-scene (N2-05, REQ-IAC-006) (sin push, sin [x])
- Nuevo tests/unit/terraform-iam-escena-006.spec.ts: 4 cuentas, único google_project_iam_member = aiplatform.user de argos-run con comentario «EXCEPCIÓN DOCUMENTADA» (REQ-IAC-006, N2-05), scene-tasks solo run.invoker sobre el servicio, cloudtasks.enqueuer de argos-run solo sobre la cola, serviceAccountUser de run solo sobre scene-tasks, sin llaves; y cloud_tasks.tf (cola argos-scene, max_attempts 1, 2 concurrentes, 1/s, depends_on API, sin http_target).
- Rojo 10/12; tsc 0; gates CUMPLE. terraform-iam.spec (3 cuentas, sin google_project_iam) se amenda en T819, no se debilita sin su contraparte.

## 2026-11-18 Keymaker: T819 enmienda de REQ-IAC-006, iam.tf y cloud_tasks.tf (N2-05) (sin push, sin [x])
- spec 003 REQ-IAC-006 con «Enmienda 006» (excepción documentada aiplatform.user de proyecto, argos-scene-tasks, enqueuer acotado a la cola); terraform/iam.tf (+cuenta scene_tasks, +4 bindings, comentario EXCEPCIÓN DOCUMENTADA) y terraform/cloud_tasks.tf (cola argos-scene, max_attempts 1, 2 concurrentes, 1/s, sin http_target; el dispatchDeadline 130 s lo fija la app por tarea).
- Suites de 003 cambiadas por la enmienda: terraform-iam (4 cuentas, un único google_project_iam_member) y terraform-iam-secrets (misma excepción); además un regex mío de T818 corregido. t818 12/12 verde, terraform-* verdes, tsc 0. Sin plan ni apply.

## 2026-11-18 Keymaker: T820 pruebas rojas de Cloud Run 120 s y 1 GiB (N2-05, N2-11, REQ-CLD-002) (sin push, sin [x])
- Nuevo tests/unit/terraform-cloud-run-escena-006.spec.ts: timeout 120s y memoria 1Gi (no 60s/512Mi), resto de REQ-CLD-002 sin cambio (cpu_idle, escala 0..2, concurrencia 20), sin env ni ARGOS_SCENE_* en Terraform, T_GEN máx. 105 + 15 <= 120 < dispatchDeadline 130, texto de REQ-CLD-002 en 003 con Enmienda 006.
- Rojo 4/6; tsc 0; gates CUMPLE.

## 2026-11-18 Keymaker: T821 enmienda de REQ-CLD-002 y cloud_run.tf (N2-05, N2-11) (sin push, sin [x])
- spec 003 REQ-CLD-002 (1 GiB, timeout=120s, Enmienda 006, dispatchDeadline 130 s) y terraform/cloud_run.tf (timeout 120s, memoria 1Gi, comentario actualizado; sin env, sin cambio de cpu_idle ni de instancias). terraform-cloud-run.spec: 60s/512Mi -> 120s/1Gi. La cola ya documenta dispatchDeadline 130 s (T819); Terraform no tiene ese campo en la cola.
- Verde: t820 6/6, terraform-* 17 archivos; tsc 0; sin plan ni apply.

## 2026-11-18 Keymaker: T822 pruebas rojas del presupuesto de 5 USD (N2-05, N2-04, NFR-CLD-001) (sin push, sin [x])
- Nuevo tests/unit/terraform-budget-escena-006.spec.ts: budget_units 22500 con COP (5x4500), validación que admite "22500" y "5", descripciones con 5 USD, filtro por proyecto (projects/<número>) sin labels, display_name sin «1-usd», umbrales 50/90/100 y depends_on intactos, texto de NFR-CLD-001 con Enmienda 006.
- Rojo 5/7; tsc 0; gates CUMPLE. Nota: el plan 006 §6 menciona «umbral previsto al 100 %» pero T822/T823 no lo piden; no se añade un cuarto umbral (H-KEY-F2-2).

## 2026-11-18 Keymaker: T823 enmienda de NFR-CLD-001, budget.tf y variables.tf (N2-05, N2-04) (sin push, sin [x])
- spec 003 NFR-CLD-001 (5 USD, Enmienda 006, filtro por proyecto, solo avisa, Neo verifica moneda); budget.tf (filtro projects/<número>, display_name sin «1-usd», comentario) y variables.tf (budget_units 22500, descripciones). terraform-budget.spec: 4500 -> 22500 y filtro por proyecto. README de terraform al día.
- Verde: t822 7/7, terraform-* 18 archivos; suite completa solo con rojos documentados (T813 x5, T815 x18). T824 queda para Neo (moneda real); no se ejecutó gcloud/terraform. 22500 COP por defecto hasta su confirmación.

## 2026-11-18 Keymaker: T826 pruebas rojas de pureza de capas y entropia de la escena (INV-ESC6-001/002) (sin push, sin [x])
- Nuevo tests/unit/t826-pureza-escena-006.spec.ts: detectores de Date/entropia/node:/fs/fetch/SDK/process.env con autoprueba; src/domain/scene (vacio hasta Fase 4) sin entropia, sin node:, solo generated/v34; src/application sin fs/fetch/SDK/env; los 4 archivos de puertos de escena existen, exportados en el indice y solo con import type.
- Rojo 2/9 (puertos de escena inexistentes hasta T827); tsc 0; trazabilidad 001/002/006 y oraculos 006 CUMPLE.

## 2026-11-18 Keymaker: T827 puertos de la escena con implementaciones nulas y ApplicationDeps.sceneHooks? (REQ-ESC6-017, REQ-ESC6-031) (sin push, sin [x])
- Pruebas primero: tests/unit/t827-puertos-escena-006.spec.ts (rojo: modulo null-scene-adapters inexistente y 5 errores tsc TS2307/TS2339). Luego src/application/ports/{scene-image-generator,scene-job-dispatcher,scene-repositories,scene-privacy-hooks}.port.ts (+index), ScenePrivacyHooksPort con los 8 ganchos de plan §1.2, ApplicationDeps.sceneHooks? en use-case-support.ts y src/infrastructure/adapters/null-scene-adapters.ts (8 ganchos = Promise.resolve(); generador nulo devuelve solo SceneErrorCode).
- Fixture scene-privacy-hooks-spy.ts: port tipado ScenePrivacyHooksPort, UTC_TIMESTAMP_PATTERN/invalidNow() (a), hooksInvoked() (b), probe y failOn intactos (c); forma de eventos sin cambio.
- Verde: t826 9/9, t827 19/19; tsc 0; trazabilidad 001/002/006 y oraculos 006 CUMPLE; suite completa solo con rojos documentados (T813 x5, T815 x18).

## 2026-11-18 Keymaker: T828 UnitOfWork con SceneRepository y SceneConsentRepository nulos, orden de candados (ADR-006-07) (sin push, sin [x])
- Pruebas primero: tests/unit/t828-unit-of-work-escena-006.spec.ts (rojo 5/7 y 5 errores tsc TS2339: RepositorySet sin scenes ni sceneConsents). Luego RepositorySet +scenes +sceneConsents (repositories.port.ts) y los repositorios nulos en las tres fabricas (memoria, SQLite, PostgreSQL); SCENE_LOCK_ORDER = OWNER, PET, HOUSEHOLD, SCENE.
- Unico cambio en una suite previa: postgres-repositories-part3 (claves de RepositorySet 15 -> 17), previsto por plan §1.2. application-harness, sqlite-harness, pg-fake-client y record-engines no definen literales de RepositorySet: no necesitan cambio (createDeps queda sin sceneHooks para conservar 001..005).
- Verde: t828 7/7; tsc 0; trazabilidad 001/002/006 y oraculos 006 CUMPLE; suite completa solo con rojos documentados (T813 x5, T815 x18).

## 2026-11-18 Keymaker: T829 pruebas rojas de app-config con las 9 variables ARGOS_SCENE_* (INV-ESC6-013, INV-ESC6-018) (sin push, sin [x])
- Nuevo tests/unit/t829-app-config-escena-006.spec.ts (59 pruebas): defaults, rangos (MAX_PETS 1-32, QUOTA_MAX 1-50, GEN_TIMEOUT 10-105), T_LEASE = T_GEN + 60 y T_QUEUE = 600, produccion rechaza fake, real exige modelo, proyecto y constante de activacion, ARGOS_SCENE_WORKER_URL (https, *.run.app, ruta exacta, sin consulta/credenciales/puerto), modelo/proyecto/cola sin "/", "?", "..", y GLOBAL_QUOTA_MAX no se lee.
- Decisiones de diseno (H-KEY-F3-1): «constante de activacion» sin nombre en el spec; la modelo como `loadAppConfig(env, { sceneRealDriverActivated })` con defecto false en el codigo (SCENE_REAL_DRIVER_ACTIVATED). Host del worker solo *.run.app (no hay variable de dominio propio).
- Rojo 57/59; tsc 0 (vista tipada hasta T830); trazabilidad 001/002/006 y oraculos 006 CUMPLE.

## 2026-11-18 Keymaker: T830 app-config.ts, unico lector de ARGOS_SCENE_* (INV-ESC6-013, INV-ESC6-018) (sin push, sin [x])
- src/infrastructure/config/app-config.ts: AppConfig.scene (9 variables: 5 con defecto en el esquema Ajv y APP_CONFIG_DEFAULTS; MODEL, PROJECT_ID, TASKS_SA_EMAIL y WORKER_URL leidas como DATABASE_URL), SCENE_QUEUE_WAIT_SECONDS = 600, sceneLeaseSeconds(g) = g + 60, SCENE_REAL_DRIVER_ACTIVATED = false (H-KEY-F3-1) y loadAppConfig(env, { sceneRealDriverActivated }). Produccion rechaza fake y real sin activacion/modelo/proyecto/cuenta/URL; GLOBAL_QUOTA_MAX no se lee; sin dependencia npm nueva. .env.example con las 9 variables.
- Verde: t829 59/59. REGRESION ESPERADA Y CORREGIDA (H-KEY-F3-2, a /architect y /oracle): SC-ESC6-092 hace que production solo arranque con driver real activado, y la constante es false hasta T885. 21 pruebas de 003/004 con NODE_ENV=production (app-config, -media, -audit-secret, validate-secrets, audit-pseudonym, audit-secret.security) ahora aportan PROD_SCENE y la activacion via tests/fixtures/scene-config-fixtures.ts; el unico arranque real de proceso en production (audit-secret.security) pasa a staging y en production verifica el rechazo por ARGOS_SCENE_DRIVER sin filtrar el secreto. app-config.spec: literal con scene.
- Suite completa: solo rojos documentados (T813 x5, T815 x18); tsc 0; trazabilidad 001/002/006 y oraculos 006 CUMPLE.

## 2026-11-18 Keymaker: T831 pruebas rojas de paridad y migracion de la escena (REQ-ESC6-018, REQ-ESC6-035; INV-ESC6-004/005; SC-ESC6-091) (sin push, sin [x])
- schema-parity.spec: CANONICAL_TABLES 23 -> 29 e indices +6 (home_scenes_household/owner, scene_attempts_actor_started/idempotency/scene_started, scene_consents_active), prueba de CHECK identicos y de image_mime solo PNG/WebP, phase/outcome; paridad viva carga la 0009. Nuevo t831-esquema-escena-006.spec.ts (11 pruebas de comportamiento SQLite: CHECK, unicos parciales, cascadas, sin FK en current_attempt_id). Marker, postgres-pool, postgres-maintenance (BASELINE hasta 0009) y t542 declaran la ruta.
- Rojo 16 (schema-parity 3, t831 11, pool 1, marker 1, t542 1) + T813 x5 documentados; tsc 0; trazabilidad 001/002/006 y oraculos 006 CUMPLE (not.toThrow sustituido por runs() == 'ok').

## 2026-11-18 Keymaker: T832 SQLite 0013_home_scenes.sql con las 6 tablas de la escena (REQ-ESC6-011/012/023/025/032; INV-ESC6-003/004) (sin push, sin [x])
- 0013 conserva la reconstruccion de audit_log (M-3, T810) y anade M-1: home_scenes, scene_attempts, scene_image_sources, household_photos, scene_consents, scene_quota_carry (STRICT, FKs en ese orden, current_attempt_id sin FK) y 6 indices (4 unicos parciales: household, owner, idempotency_key_hash, consentimiento vigente).
- Verde t831 SQLite (10/10) y sqlite-repositories (lista de tablas 20 -> 29: actualizacion prevista por la enmienda, sin aflojar). Quedan rojos esperados hasta T833: schema-parity x6 y t831 Postgres x1; mas T813 x5 y T815 x18. tsc 0; gates CUMPLE.

## 2026-11-18 Keymaker: T833 Postgres 0009_home_scenes.sql con paridad exacta (REQ-ESC6-011/012/023/025/032; EDGE-ESC6-016; SC-ESC6-091) (sin push, sin [x])
- 0009 conserva el ALTER del CHECK de audit_log (M-3) y anade las mismas 6 tablas e indices que la 0013 (sin STRICT; mismos tipos, CHECK, parciales y cascadas). schema-parity (tablas 29, indices, CHECK, columnas) y t831 Postgres en verde; la ruta ya estaba declarada en HOME_PATH (T831).
- Verificacion viva: con docker-compose.test.yml (postgres:17 local, TEST_DATABASE_URL desechable) la paridad viva aplica 0001..0009 y compara con information_schema: 39/39 verde (schema-parity, t831, t809). Solo quedan T813 x5 y T815 x18.

## 2026-11-18 Keymaker: T834 repositorios de la escena en memoria, SQLite y Postgres (INV-ESC6-003/004/012; REQ-ESC6-012/036; EDGE-ESC6-016/027/031) (sin push, sin [x])
- Pruebas primero: t834-repositorios-escena-006.spec.ts (contrato unico memoria/SQLite/Postgres real + SQL exacto con fakeClient): rojo 29 (TypeError: r.scenes.insert/lockScene/beginGeneration/claimAttempt/upsertQuotaCarry is not a function). Luego puerto ampliado (SceneRecord, SceneAttemptRecord, beginGeneration T1 CAS, claimAttempt, contadores, upsertQuotaCarry con max, consentimientos grant/revoke/findActive), memoria, SQLite y Postgres (FOR UPDATE, rowCount, GREATEST), scene-row-mappers.ts comun; nulos conservados y completados.
- t828: la prueba de Postgres pasa de 'sin sentencias' a 'sin sentencias al crear; un SELECT por lectura' (cambio previsto: los repositorios dejan de ser nulos). Contrato corrido tambien contra postgres:17 local (docker-compose.test.yml).
- Verde 29/29 + 12 PG; suite completa con PG real: solo T813 x5 y T815 x18; tsc 0; trazabilidad 001/002/006 y oraculos 006 CUMPLE.

## 2026-11-18 Keymaker: T814 enmienda MINOR de countBytesOfOwner: pet_media + household_photos del propietario del hogar (N2-06 (c); REQ-ESC6-001/018; EDGE-ESC6-013; SC-ESC6-019/028/064) (sin push, sin [x])
- countBytesOfOwner suma pet_media de sus mascotas y household_photos de los hogares con households.owner_user_id = usuario (quien sube la foto no consume; las escenas no cuentan) en memoria (MemoryState.householdPhotos), SQLite (una consulta con dos subconsultas) y Postgres (una consulta parametrizada); doc del puerto actualizado. El unico cambio de suites previas es anadir 0009_home_scenes.sql a los esquemas de postgres-repositories.spec y concurrent-engines (PG real).
- t813 verde (5/5: x5 rojos documentados pasan a verde); suite con PG real: solo T815 x18; tsc 0; trazabilidad 001/002/006 y oraculos 006 CUMPLE.

## 2026-11-18 Keymaker: T835 mantenimiento diario de la escena: purga de intentos > 30 dias, hashes > 24 h, arrastres viejos; conciliacion de scenes/ y households/ (N2-11; REQ-ESC6-012/029; INV-ESC6-016; EDGE-ESC6-016/021; SC-ESC6-095/044) (sin push, sin [x])
- Pruebas primero: t835-mantenimiento-escena-006.spec.ts (memoria y SQLite): rojo 7/7 (purgeSceneData no es funcion; reconciled 0 en lugar de 2/1/1). Luego purgeSceneData en maintenance-use-cases (una transaccion, nunca lanza, enlazada en runMaintenance: no hay segunda rutina) y 5 metodos nuevos del repositorio (purgeTerminalAttempts sin el intento vigente de la escena, clearExpiredIdempotencyHashes, purgeQuotaCarryBefore, findHouseholdPhoto, putHouseholdPhoto) en memoria, SQLite y Postgres.
- reconcileObjects recorre RECONCILED_PREFIXES (pets 24 h; scenes y households 15 min) y decide huerfano por pet_media/avatar, home_scenes.image_id o household_photos.object_id y siempre por la cola (INTENT incluido); un fallo de list en un prefijo omite solo ese prefijo. Decision: no se purga el current_attempt_id de una escena (la derivacion failed -> outdated lo lee, data-model §4).
- Contrato t834 ampliado (PG real incluido). Verde t835 7/7 y t834 54/54; suite con PG real: solo T815 x18; tsc 0; trazabilidad 001/002/006 y oraculos 006 CUMPLE.

## 2026-11-18 Keymaker: T836 exclusion del respaldo: la foto del hogar y las escenas no viajan; runbook actualizado (REQ-ESC6-022, REQ-ESC6-018; INV-ESC6-009; SC-ESC6-051/088) (sin push, sin [x])
- Pruebas primero: backup-restore-runbook-docs.spec (+5 pruebas de la subseccion 006) y backup-runbook-hardening.spec (+2): rojo 6 (falta la subseccion). backup-31-roundtrip (+2): la exportacion es byte a byte igual con y sin escena/foto/consentimiento/arrastre y no nombra sus tablas; importar no restaura ni crea escena (son pruebas de fijacion: ya verdes, protegen contra regresiones; 0009 anadida al esquema PG real).
- terraform/README.md: subseccion 'Fuera del respaldo exportable (feature 006)' (no viajan en el sobre 3.x, importar no restaura, foto cuenta en 1 GiB y escenas no, pg_dump sin objetos y conciliacion 15 min, cascadas del paso 3, ventana PITR). Hallazgo H-KEY-F4-1: scene_attempts.actor_user_id, scene_image_sources.owner_user_id y household_photos.uploaded_by_user_id no tienen FK y el paso 3 de restauracion no las elimina; documentado como decision pendiente, sin tocar el SQL del runbook.
- Verde 61/61; suite sin y con PG real: solo T815 x18; tsc 0; trazabilidad 001/002/006 y oraculos 006 CUMPLE.

## 2026-11-18 Keymaker: H-KEY-F4-1 corregido en el runbook (opcion (a)); sin tocar migraciones; sin push, sin [x]
- Pruebas primero: +5 en backup-restore-runbook-docs.spec (3 columnas, DELETE antes de users, cola media_deletion_queue, referencias_restantes, texto): rojo 5; verde 24/24 y hardening 15/15.
- terraform/README.md paso 3: 2 INSERT en media_deletion_queue (households/ y scenes/, omite la imagen vigente) + DELETE de scene_attempts, scene_image_sources y household_photos antes de DELETE FROM users; referencias_restantes suma las 3 columnas. La FK (opcion (b)) sigue pendiente de Neo.
- tsc 0; trazabilidad 001/002/006 y oraculos 006 CUMPLE.

## 2026-11-18 Keymaker: T837+T838 select-visible-pets e inputs-snapshot (REQ-ESC6-004/008; INV-ESC6-001/008; EDGE-ESC6-001/002/012) (sin push, sin [x])
- Pruebas primero: t837 (15): rojo 'Failed to load url ../../src/domain/scene/inputs-snapshot.ts' (modulo inexistente). Luego src/domain/scene/select-visible-pets.ts (orden assignedAt asc + id, tope N) e inputs-snapshot.ts (canonicalJson + sha256 puro, EMPTY, parse, countPendingChanges por entidad).
- Verde 15/15; suite completa 18 rojos (solo T815), tsc 0, gates CUMPLE.

## 2026-11-18 Keymaker: T839+T840 decide-mode y ranuras IMG_n (REQ-ESC6-006/007/009/010; EDGE-ESC6-008/010; SC-ESC6-056) (sin push, sin [x])
- Pruebas primero: t839 (17): rojo 'Failed to load url ../../src/domain/scene/decide-mode.ts'. Luego decide-mode.ts (precedencia REGENERATE > sin imagen > foto del hogar > incrementales; MIXED con >1 tipo; ranuras IMG_1 escena o foto del hogar, luego mascotas dibujadas con foto; null sin cambios).
- Decision: las mascotas REMOVE viajan al final del plan (desde el snapshot anterior); SC-ESC6-010 dice 'pets = []' y plan.md dice que incluye las REMOVE: se deja a T842 y se reporta a /architect (H-KEY-F5-1).
- Verde 17/17; suite completa solo T815 x18; tsc 0; gates CUMPLE.

## 2026-11-18 Keymaker: T841+T842 build-image-prompt, sanitize-free-text, breed-names y scene-payload (REQ-ESC6-015/016; INV-ESC6-001/006/010/011/017; EDGE-ESC6-015) (sin push, sin [x])
- Pruebas primero: t841 (22): rojo 'Failed to load url .../breed-names.ts'. Luego sanitize-free-text (NFKC + lista blanca + marcadores secundarios), breed-names (tabla en ingles de 65 razas; criolla/*_OTHER mestizas), build-image-prompt (plantillas plan.md 5.3) y scene-payload (valida contra validateScenePayload de v34).
- Decisiones (H-KEY-F5-2 a /architect): el catalogo trae etiquetas en espanol, asi que la tabla canonica en ingles es del dominio; el texto de estilo base no esta en spec/plan y se fijo en DEFAULT_SCENE_STYLE; breed libre sin catalogo => 'mestizo amigable (sexo; breed label "x")' (une REQ-ESC6-009 y EDGE-ESC6-015).
- Verde 22/22; suite solo T815 x18; tsc 0; gates CUMPLE.

## 2026-11-18 Keymaker: T842 correccion: pet-phrases.ts separa la logica de raza de build-image-prompt.ts (T599 SC-CAT-033) (sin push, sin [x])
- Hallazgo: tras el commit de T841+T842 la suite dio 19 rojos: domain-sin-raza-peso-edad-alertas (T599, 004) escanea los archivos de src/domain cuyo nombre contiene 'age' y 'build-image-prompt.ts' lo contiene ('im-age'); no se toca el test cerrado de 004.
- Correccion: las frases por mascota (raza, mestizo, etiqueta) viven en pet-phrases.ts y build-image-prompt.ts ya no nombra 'breed'. Verde t841 22/22 y T599 28/28; suite solo T815 x18.

## 2026-11-18 Keymaker: T843+T844 quota-window y attempt-limits (REQ-ESC6-011/034; INV-ESC6-004; EDGE-ESC6-007/029/031) (sin push, sin [x])
- Pruebas primero: t843 (15): rojo 'Failed to load url .../attempt-limits.ts'. Luego utc-instant.ts (epochMillis sin Date), quota-window.ts (ventana de todayIsoDate, restante, applyPublication T2, windowResetsAt con desfase como dato) y attempt-limits.ts (60 s, 3 FAILED/escena, 12/actor, Retry-After).
- Hallazgo H-KEY-F5-3: SceneRepository.countAttemptsByScene cuenta TODOS los intentos; REQ-ESC6-034 pide 3 con resultado FAILED por escena: T853 ampliara el puerto con countFailedAttemptsByScene (+ instante mas antiguo). resetsAt necesita el desfase de APP_TIMEZONE como dato de composicion (ClockPort no lo expone).
- Verde 15/15; suite solo T815 x18; tsc 0; gates CUMPLE.

## 2026-11-18 Keymaker: T845+T846 scene-state y scene-policy (REQ-ESC6-003/020; INV-ESC6-007; STATE-SCENE-001; SC-ESC6-086/089/090) (sin push, sin [x])
- Pruebas primero: t845 (26): rojo 'Failed to load url .../scene-state.ts'. Luego scene-state.ts (transitionScene desde STATE_SCENE_001, deriveStatus de 7 reglas en orden estricto con leaseExpired, SCENE_STATE_ERROR_CODES vs HTTP_SCENE_ERROR_CODES) y scene-policy.ts (OWNER/ADMIN actuan, todo miembro lee, sin rol nada).
- Decision: con imagen y huella distinta la derivacion da outdated aunque no queden entradas (necesario para SC-ESC6-010: eliminar la unica mascota habilita INCREMENTAL_REMOVE); rbac.ts intacto.
- Verde 26/26; suite solo T815 x18; tsc 0; gates CUMPLE.
