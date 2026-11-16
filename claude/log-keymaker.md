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
