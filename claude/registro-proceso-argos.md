# Registro Central del Proceso SDD — Proyecto ARGOS (Bus Inter-Sesión `/logos`)

> **Propósito:** Bus central de memoria persistente en disco para las 24 skills de *The Matrix* en ARGOS. Ninguna skill depende de la ventana de conversación: toda decisión, commit, hallazgo o transición se registra aquí y en `claude/log-<personaje>.md`.

---

## 1. Fotografía de Estado Actual en Disco (Bootstrap Inicial — `2026-11-09`)

- **Autoridad Nivel 2:** **Neo (`Andrés Vallejo`)**
- **Rama Activa:** `001-pet-health-tracker` (creada desde `spec/v2.2.0-review` en `76a31bf`)
- **Último Commit en Disco (`HEAD`):** `329c392` — `docs(speckit): registro de decisiones del Arquitecto sobre la migración`
- **Commits Recientes de Migración Spec Kit:**
  - `329c392`: `docs(speckit): registro de decisiones del Arquitecto sobre la migración`
  - `3ed71e2`: `chore(speckit): cambios de Nivel 2 para Spec Kit (rutas, constitución §7, compuerta)`
  - `62486e4`: `docs(speckit): migración de artefactos SDD a la estructura de GitHub Spec Kit`
  - `9fbac7c`: `chore(speckit): renombra artefactos a rutas Spec Kit con git mv`
  - `76a31bf`: `docs(TASK-115): firma humana de checklist oracle-validation (autorizada por Andrés Vallejo)`
- **Estado de la Cola de Tareas (`specs/001-pet-health-tracker/tasks.md`):**
  - `TASK-100` (`T001`) a `TASK-114` (`T015`): **`COMPLETED`** (15/16 tareas completadas y firmadas).
  - `TASK-115` (`T016` — Cierre documental y checklists de compuerta): **`REVIEW`** (`code-review.md` y `oracle-validation.md` firmados y re-firmados en formato `CHK###`; pendiente firma Nivel 2 de **Neo** en `.specify/memory/audits/spec-review.md` y cierre final).
- **Estado de Compuertas Verificadas:**
  - `bash scripts/verify-traceability.sh`: **CUMPLE** (96/96 IDs vigentes, 0 violaciones de pureza).
  - `bash scripts/verify-oracles.sh`: **CUMPLE** (65 archivos, 0 oráculos débiles).
  - `npx tsc --noEmit`: **CUMPLE** (0 errores).
  - Pendiente ejecutar `npm run test:gate` completo en macOS y confirmar cierre de migración Spec Kit.

---

## 2. Deuda Técnica Activa Registrada en `tasks.md`

| ID Deuda | Descripción | Estado | Responsables |
| :--- | :--- | :--- | :--- |
| **`DEUDA-TIPADO-001`** | 3 usos de `any` en `tests/unit/application/backup-import-export.spec.ts` y 1 non-null assertion (`!`) en `src/infrastructure/persistence/sqlite/migrations.ts:76` | Abierta (No bloqueante) | `/keymaker`, `/dojo`, `/oracle` |
| **`DEUDA-DEP-001`** | Vulnerabilidad moderada en `react-router` / `@remix-run/router` reportada por `npm audit`; se resuelve al migrar a React Router v7 (requiere autorización Nivel 2 de **Neo**) | Abierta (Documentada) | `/merovingian`, `/trinity`, `/keymaker` |

---

## 3. Historial Cronológico de Eventos del Bus (`Write-Ahead Log`)

- **`[2026-11-09 | 76a31bf | Neo + Oracle]`** Firma humana autorizada por **Neo (Andrés Vallejo)** en `oracle-validation.md` para `TASK-115`.
- **`[2026-11-09 | 9fbac7c..3ed71e2 | Keymaker + Architect]`** Migración de artefactos SDD a la estructura oficial de GitHub Spec Kit (`specs/001-pet-health-tracker/` y `.specify/memory/`). Reporte detallado en `.specify/memory/speckit-migration-2026-11-09.md`.
- **`[2026-11-09 | 329c392 | Architect (/architect)]`** Registro de 6 decisiones arquitectónicas sobre la migración Spec Kit en `.specify/memory/speckit-migration-2026-11-09.md`:
  1. Re-firma de `code-review.md` y `oracle-validation.md` en formato `CHK###` (`.specify/memory/audits/checklist-signature-mapping-2026-11-09.md`).
  2. `spec.md` v2.4.0 aprobada por el Arquitecto con hash `2eef58a2fc8944fe`.
  3. Commit `3ed71e2` (Nivel 2) ratificado, incluyendo soporte `--task T###` en `verify-traceability.sh`.
  4. Principios IV y VI de la constitución aceptados sin ID de lineage.
  5. `tasks.md` v2.3.0 con líneas `T###` y alias `TASK-NNN` aprobado (`[x]` solo para `COMPLETED`).
  6. Re-ubicado `spec-review.md` hacia `.specify/memory/audits/spec-review.md` (pendiente de commit y firma Nivel 2 de **Neo**).
- **`[2026-11-09 | Ecosistema Matrix v1.0 | Inicialización]`** Instalación de las **24 skills de *The Matrix*** en `.claude/skills/<nombre>/SKILL.md` (`19 haiku` / `5 sonnet`), `CLAUDE.md` raíz y bitácoras incrementales `claude/log-*.md`. Jubilación de las ventanas conversacionales manuales anteriores.

---

## 4. Próximos Pasos en Cola para la Tripulación

1. **Verificación en disco por `/oracle`:** Auditar los cambios aún sin commitear en el árbol de trabajo (`git status`: renombrado de `.specify/memory/audits/spec-review.md`, actualizaciones en `plan.md`, `requirements.md`, `README.md` y `speckit-migration-2026-11-09.md`).
2. **Compuerta completa en macOS por `/keymaker` o `/seraph`:** Ejecutar `npm run test:gate` en el entorno macOS de **Neo**.
3. **Decisión Nivel 2 de `Neo`:** Revisar y autorizar la firma final de `.specify/memory/audits/spec-review.md` y el paso de `TASK-115` (`T016`) de `REVIEW` a `COMPLETED`.
- 2026-11-10 Arquitecto/Spec Kit: contratos movidos a specs/001-pet-health-tracker/contracts/, constitución v3.0.0, spec/plan/tasks en plantilla; gates: trazabilidad 96/96, oráculos 0 débiles, tsc OK, vitest 580/580 (copia scratch). Pendiente: TASK-NNN y §-refs en comentarios de src/tests/skills.
- 2026-11-10 Arquitecto: Neo confirma Status Approved en spec.md; plan/tasks/constitución no tienen campo de estado en Spec Kit, sin cambios. Alcance: solo organización Spec Kit.
- 2026-11-10 Arquitecto: tras /speckit-analyze alineé constitución (1024 px), plan (fila Principio VI) y tasks (dependencia T056/T057). G1 resuelto (spec Approved); G2 y I3 requieren confirmación de Neo.
- 2026-11-10 Arquitecto: Neo aprueba constitución v3.0.0 y ratifica desviación de tipado; reescribí Follow-up TODOs, plan (ratificación) y INV-HOUSE-001 (enlace a ERR-HOUSE-OWNER-CANNOT-LEAVE). Trazabilidad 96/96.
- 2026-11-10 Morpheus: despertar de sesión en HEAD `ef6af0d`. Cola: T001–T055 `[x]`, abiertas T056 (tipado `any`) y T057 (react-router v7). Hallazgos de Neo (1,2,3,4,5,6,8) registrados. Primer rol propuesto: `/architect` (cambios de contrato en DOG|CAT y en el texto de ERR-SCHEMA-VALIDATION-FAILED, y nuevas funciones de hogar). Sin COMPLETED, sin push.
- 2026-11-10 Morpheus/Neo (Nivel 2): hallazgos 2, 5 y 7 (rediseño visual, no 8) → Feature 002 tras cerrar 001. Hallazgo 6 → `/architect` (traducción en presentación). Orden: `/keymaker` arregla solo 1, 3 y 4 → `/oracle` valida en disco → `/architect` con el resto.
- 2026-11-10 Keymaker: hallazgos 1/3/4 de Neo. Causa del 3 y 4: claves React duplicadas en PetsPage (PetForm y PetDashboard con key=profile.id). Editando PetsPage.tsx, Field.tsx, AuthPages.tsx y pruebas unitarias. Sin contratos/git.
- 2026-11-10 Keymaker: hallazgos 1/3/4 listos. PetsPage (claves distintas), Field.tsx (PasswordField), AuthPages.tsx, tests unit auth-password.spec.ts y e2e auth-pet-forms.spec.ts. E2E 28/28 en Chrome real.
- 2026-11-10 Morpheus: Keymaker entrega bugs 1, 3 y 4 (cambios sin commit). Bug 4 = claves React duplicadas en PetsPage. Pendiente validación de `/oracle` en disco; discrepancia del bug 3 ("Agregar") por verificar.
- 2026-11-10 Oracle: PASS CON OBSERVACIONES a bugs 1/3/4; unit 581/582 (scrypt timeout preexistente), gates CUMPLE. Ver log-oracle.md.
- 2026-11-10 Oracle: veredicto PASS CON OBSERVACIONES sobre bugs 1, 3 y 4. Sin commit (decisión de Neo). e2e pendiente de corrida local. Scrypt timeout preexistente. Siguiente: Architect para hallazgo 6 y backlog Feature 002.
- 2026-11-10 Architect: hallazgo 6 (audits/hallazgo-6-traduccion-errores.md) y backlog Feature 002 (.specify/memory/backlog-feature-002.md) escritos; pendientes decisiones D1/D2 y preguntas de Neo. Sin commit.
- 2026-11-10 Architect: entrega diseño del hallazgo 6 (solo presentación, `.specify/memory/audits/hallazgo-6-traduccion-errores.md`) y backlog de Feature 002 (`.specify/memory/backlog-feature-002.md`). Pendientes para Neo: D1 (contrato para 422 del servidor) y D2 (lectura de REQ-UI-005).
