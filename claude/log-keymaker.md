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
