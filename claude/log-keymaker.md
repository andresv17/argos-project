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
