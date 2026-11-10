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
