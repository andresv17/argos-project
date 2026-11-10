# Reporte de migración a GitHub Spec Kit — Proyecto Argos

- **Fecha:** 2026-11-09
- **Rama:** `001-pet-health-tracker` (antes `chore/speckit-migration`, creada desde `spec/v2.2.0-review` `76a31bf`). Sin commits: los cambios están en el árbol de trabajo.
- **Referencia:** clon local de GitHub Spec Kit, commit `0382d7a0`, CLI `1.3.4.dev0`.
- **Estado:** todos los documentos migrados quedan en `REVIEW`. Falta la validación del Auditor y la aprobación de Andrés Vallejo (Nivel 2).
- **Alcance:** solo documentación y artefactos SDD. `src/` y `contracts/` no se modifican.

## 1. Tabla de equivalencias

### 1.1 Archivos reubicados (`git mv`)

| Archivo anterior | Nueva ruta | Rol en Spec Kit | Cambio de contenido | Versión y estado |
| :--- | :--- | :--- | :--- | :--- |
| `.specify/constitution/constitution.md` | `.specify/memory/constitution.md` | Constitución | Plantilla `constitution-template.md`: se añaden «Core Principles» (I–VI), «Governance» y la línea de versión. §1–§6 conservan su texto; §4 cambia una ruta; §7 autoriza el árbol de Spec Kit. | 2.3.0 `LOCKED` → 2.4.0 `REVIEW` |
| `.specify/specs/pet-health-tracker.md` | `specs/001-pet-health-tracker/spec.md` | Especificación de la feature | Plantilla `spec-template.md`. Se añaden historias US1–US6, «Key Entities», «Success Criteria» (SC-001…SC-007) y «Assumptions», derivados de los requisitos. §0–§5.1 conservan texto, numeración e identificadores. | 2.3.1 `APPROVED` → 2.4.0 `REVIEW` |
| `.specify/plans/pet-health-tracker-plan.md` | `specs/001-pet-health-tracker/plan.md` | Plan de implementación | Plantilla `plan-template.md`. Se añaden «Technical Context», «Constitution Check», «Project Structure» y «Complexity Tracking». §0–§6 conservan su texto. | 2.2.0 `APPROVED` → 2.3.0 `REVIEW` |
| `.specify/tasks/pet-health-tracker-tasks.md` | `specs/001-pet-health-tracker/tasks.md` | Lista de tareas | Plantilla `tasks-template.md`. Se añaden las fases con una línea `- [x] T### [USn] … (TASK-NNN)` por tarea. La tabla «Cola v2.2.0», la deuda y los cambios de criterio conservan su texto. Ninguna tarea cambia de estado. | 2.2.0 `APPROVED` → 2.3.0 `REVIEW` |
| `.specify/checklists/spec-review.md` | `specs/001-pet-health-tracker/checklists/spec-review.md` | Checklist de la feature | Plantilla `checklist-template.md`: cada ítem recibe un `CHK###`. Criterios y estados sin cambios de contenido; firmas pendientes de re-firma (mapeo `CHK###` → ítem anterior y hash de la firma previa). | 2.2.0 → 2.3.0 `REVIEW` |
| `.specify/checklists/code-review.md` | `specs/001-pet-health-tracker/checklists/code-review.md` | Checklist de la feature | La tabla pasa a ítems `CHK001`…`CHK010`. Criterios, evidencias y estados sin cambios de contenido; firmas pendientes de re-firma (mapeo `CHK###` → ítem anterior y hash de la firma previa). | 2.2.0 → 2.3.0 `REVIEW` |
| `.specify/checklists/oracle-validation.md` | `specs/001-pet-health-tracker/checklists/oracle-validation.md` | Checklist de la feature | La tabla pasa a ítems `CHK001`…`CHK008`. Criterios, evidencias y estados sin cambios de contenido; firmas pendientes de re-firma (mapeo `CHK###` → ítem anterior y hash de la firma previa). | 2.2.0 → 2.3.0 `REVIEW` |
| `.specify/checklists/spec-review-v2.2.0-auditor-r2.md` | `.specify/memory/audits/spec-review-v2.2.0-auditor-r2.md` | Artefacto de soporte (auditoría histórica) | Ninguno (idéntico byte a byte) | Sin cambios |
| `.specify/tasks/pet-health-tracker-audit-2026-11-05.md` | `.specify/memory/audits/pet-health-tracker-audit-2026-11-05.md` | Artefacto de soporte (auditoría histórica) | Ninguno (idéntico byte a byte) | 1.0.0 `LOCKED` |
| `.specify/specs/templates/spec-template.md` | `.specify/memory/legacy-templates/spec-template.md` | Artefacto de soporte (plantilla anterior) | Ninguno (idéntico byte a byte) | Sin cambios |
| `.specify/plans/templates/plan-template.md` | `.specify/memory/legacy-templates/plan-template.md` | Artefacto de soporte (plantilla anterior) | Ninguno (idéntico byte a byte) | Sin cambios |
| `.specify/tasks/templates/tasks-template.md` | `.specify/memory/legacy-templates/tasks-template.md` | Artefacto de soporte (plantilla anterior) | Ninguno (idéntico byte a byte) | Sin cambios |

Los 12 archivos que había bajo `.specify/` en `76a31bf` existen en su nueva ruta. No se borró ni se truncó ninguno.

### 1.2 Archivos nuevos

| Ruta | Rol en Spec Kit | Origen |
| :--- | :--- | :--- |
| `.specify/templates/{spec,plan,tasks,constitution,checklist}-template.md` | Plantillas oficiales | `specify init --here --integration none --script sh` |
| `.specify/scripts/bash/{common,check-prerequisites,create-new-feature,resolve-template,setup-plan,setup-tasks}.sh` | Scripts oficiales | Igual |
| `.specify/init-options.json`, `.specify/integration.json`, `.specify/integrations/*.manifest.json`, `.specify/workflows/**`, `.specify/.gitignore` | Estado y manifiestos del CLI | Igual |
| `.specify/feature.json` | Puntero local a la feature activa (`specs/001-pet-health-tracker`); ignorado por git | Igual |
| `specs/001-pet-health-tracker/research.md` | Decisiones técnicas (Phase 0) | Derivado de la constitución, el plan y los cambios de criterio de `tasks.md`. No añade decisiones. |
| `specs/001-pet-health-tracker/data-model.md` | Modelo de datos (Phase 1) | Derivado de `contracts/schemas/` y de la spec. Remite a los contratos. |
| `specs/001-pet-health-tracker/quickstart.md` | Guía de arranque y validación (Phase 1) | Derivado de `README.md` y `package.json`. |
| `specs/001-pet-health-tracker/contracts/README.md` | Índice de contratos (Phase 1) | Enlaza a `contracts/` de la raíz, sin duplicar archivos. |
| `specs/001-pet-health-tracker/checklists/requirements.md` | Checklist de calidad de spec de Spec Kit | Evaluación de `spec.md` v2.4.0. |
| `.specify/memory/speckit-migration-2026-11-09.md` | Artefacto de soporte | Este reporte. |

### 1.3 Archivos modificados en su ubicación original

| Archivo | Cambio | Autorización requerida |
| :--- | :--- | :--- |
| `scripts/verify-traceability.sh` | 3 constantes de ruta (`SPEC`, `CONSTITUTION`, `TASKS`). Sin cambios de lógica. | Nivel 2 (`spec-system.md` §3) |
| `tests/integration/gates/verify-gates.spec.ts` | 3 rutas de los archivos de prueba y 1 mensaje esperado. Sin cambios de aserciones. | Revisión |
| `spec-system.md` | Rutas de §1–§4 y nota de migración. Ninguna regla cambia. | Nivel 2 |
| `README.md` | Tabla de estado, mapa de artefactos y protocolo con las rutas nuevas. Además se corrige el estado de TASK-115 y de las firmas, que estaba desactualizado frente a `tasks.md` y a los checklists. | Revisión |

## 2. Árbol resultante

```text
.specify/
├── .gitignore
├── feature.json                     # local, ignorado por git
├── init-options.json
├── integration.json
├── integrations/
│   ├── none.manifest.json
│   └── speckit.manifest.json
├── memory/
│   ├── constitution.md              # CONSTITUTION-ARGOS-001 v2.4.0
│   ├── speckit-migration-2026-11-09.md
│   ├── audits/
│   │   ├── pet-health-tracker-audit-2026-11-05.md
│   │   └── spec-review-v2.2.0-auditor-r2.md
│   └── legacy-templates/
│       ├── plan-template.md
│       ├── spec-template.md
│       └── tasks-template.md
├── scripts/bash/
│   ├── check-prerequisites.sh
│   ├── common.sh
│   ├── create-new-feature.sh
│   ├── resolve-template.sh
│   ├── setup-plan.sh
│   └── setup-tasks.sh
├── templates/
│   ├── checklist-template.md
│   ├── constitution-template.md
│   ├── plan-template.md
│   ├── spec-template.md
│   └── tasks-template.md
└── workflows/
    ├── speckit/workflow.yml
    └── workflow-registry.json

specs/
└── 001-pet-health-tracker/
    ├── spec.md                      # SPEC-ARGOS-001 v2.4.0
    ├── plan.md                      # PLAN-ARGOS-001 v2.3.0
    ├── tasks.md                     # TASKS-ARGOS-001 v2.3.0
    ├── research.md
    ├── data-model.md
    ├── quickstart.md
    ├── contracts/
    │   └── README.md                # índice de contracts/ de la raíz
    └── checklists/
        ├── requirements.md
        ├── spec-review.md
        ├── code-review.md
        └── oracle-validation.md
```

En Spec Kit las features viven en `specs/<NNN-feature>/` en la raíz del repositorio, no bajo `.specify/`.

## 3. Archivos preservados y sin categoría canónica

Ningún archivo quedó sin categorizar. Estos no encajan en constitution, spec, plan o tasks y se preservaron así:

| Archivo | Tratamiento | Trazabilidad |
| :--- | :--- | :--- |
| `spec-system.md` | Se queda en la raíz. Es el plano de control operativo; solo cambian sus rutas. | Citado en «Governance» de la constitución y en `README.md` |
| `README.md` | Se queda en la raíz. | — |
| `contracts/**` (12 archivos) | Sin cambios y en la raíz, porque `scripts/compile-contracts.sh` los lee de ahí. | Índice en `specs/001-pet-health-tracker/contracts/README.md`; «Structure Decision» de `plan.md` |
| `.specify/memory/audits/*` (2 archivos) | Artefactos de soporte, sin cambios. | `tasks.md` («Reglas de ejecución»), `README.md` |
| `.specify/memory/legacy-templates/*` (3 archivos) | Artefactos de soporte, sin cambios. Sustituidas por `.specify/templates/`. | `README.md`, constitución §7 |
| `_to_delete/task115.patch`, `_to_delete/task115b.patch` | No se tocaron. La carpeta está en `.gitignore` (CC-109-C7). | Este reporte |
| `scripts/codegen.mjs`, `scripts/compile-contracts.sh`, `scripts/verify-oracles.sh`, `.github/workflows/*` | Sin cambios. | — |
| Documentos `claude/*.md` del proyecto ARGOS en claude.ai (decisiones, veredictos, evidencias) | No están en el repositorio y no se modificaron. Citan las rutas anteriores como registro histórico. | `research.md`, `tasks.md` |

Las rutas `.specify/specs/…`, `.specify/tasks/…` y `.specify/checklists/…` que siguen apareciendo en el repositorio son registro histórico y se dejaron a propósito: filas de historial, la fila de TASK-100 y TASK-115 en «Cola v2.2.0», las auditorías firmadas por hash de `spec-review.md` y los archivos de `.specify/memory/`.

## 4. Decisiones de migración

1. **Identificadores.** `REQ-*`, `INV-*`, `STATE-*` y `ERR-*` se conservan. Las tareas usan `T###` en la línea de la lista (TASK-100 → T001 … TASK-115 → T016); `TASK-NNN` queda como alias al final de la línea y en la tabla de alias de `tasks.md`. `verify-traceability.sh` acepta `--task T###` y `--task TASK-NNN`.
2. **Numeración interna.** Los subtítulos conservan su numeración anterior (por ejemplo «5.1») para que las citas «spec §5.1» del código, del plan y de los checklists sigan resolviendo.
3. **Cabecera YAML.** Se conserva (`document_id`, `version`, `status`, `supersedes`, `approved_by`) encima de la cabecera de la plantilla.
4. **Idioma.** Encabezados de plantilla en inglés, contenido en español.
5. **Tareas.** La cola se ejecutó por capas, no por historia. Cada tarea aparece una vez en la fase de la historia a la que sirve principalmente; las que sirven a varias están en la fase final. US4 y US5 no tienen tarea propia y lo indican.
6. **Versionado.** MINOR en todos los documentos migrados, no PATCH, porque ganan secciones revisables. Ningún requisito, contrato ni estado de tarea cambia.
7. **Integración de agente.** Se instaló `claude` (Claude Code) como integración por defecto. Comandos instalados como skills en `.claude/skills/speckit-*/SKILL.md`: `specify`, `plan`, `tasks`, `implement`, `clarify`, `analyze`, `checklist`, `constitution`, `converge`, más las de la extensión git.
8. **Extensión git.** Instalada con `specify extension add git`. Crea la rama `001-…` antes de `specify`. El auto-commit viene desactivado en `.specify/extensions/git/git-config.yml`; no hay commits automáticos.

## 5. Verificación

Ejecutada el 2026-11-09 sobre el árbol de trabajo de la rama.

| Comprobación | Resultado |
| :--- | :--- |
| `bash scripts/verify-traceability.sh` (compuerta final) | CUMPLE: 96/96 IDs, 0 violaciones de pureza |
| `bash scripts/verify-traceability.sh --task TASK-NNN`, de TASK-100 a TASK-115 | 16 de 16 con salida 0 |
| `bash scripts/verify-oracles.sh` | CUMPLE: 65 archivos, 0 oráculos débiles |
| `npx tsc --noEmit` | Salida 0 |
| IDs de la spec antes y después | 63 y 63, sin altas ni bajas |
| Constitución §3 antes y después | Texto idéntico |
| Constitución §4 antes y después | Mismos IDs; cambia solo la línea de la ruta de la spec |
| Filas `TASK-NNN` de «Cola v2.2.0» antes y después | 16 de 16 idénticas |
| Enlaces relativos de `README.md`, `spec-system.md`, `specs/**` y `.specify/memory/**` | 57 comprobados, 0 rotos |
| `.specify/scripts/bash/check-prerequisites.sh --json --require-tasks --include-tasks` | Resuelve `specs/001-pet-health-tracker` y lista `research.md`, `data-model.md`, `contracts/`, `quickstart.md`, `tasks.md` |
| Casos de `verify-gates.spec.ts` afectados por las rutas, reproducidos a mano en un repositorio temporal | Mismos mensajes y códigos de salida que espera la prueba |

**No ejecutado:** `vitest`, Stryker y Playwright. El entorno donde se hizo la migración es Linux y `node_modules` está instalado para macOS (falta `@rollup/rollup-linux-arm64-gnu`). La compuerta completa `npm run test:gate` queda pendiente de ejecutar en el equipo de Andrés.

## 6. Pendientes

1. Ejecutar `npm run test:gate` en macOS.
2. Autorización Nivel 2 de Andrés para: constitución v2.4.0 (en especial §7), rutas de `spec-system.md` y constantes de `scripts/verify-traceability.sh`.
3. Validación del Auditor y aprobación del Arquitecto de `spec.md` 2.4.0, `plan.md` 2.3.0, `tasks.md` 2.3.0 y los tres checklists 2.3.0. Los hashes validados antes por el Auditor corresponden al contenido y a las rutas anteriores.
4. Revisión del contenido derivado: principios I–VI de la constitución, historias US1–US6, entidades clave, SC-001…SC-007, «Technical Context», «Constitution Check», `research.md`, `data-model.md` y `quickstart.md`.
5. `checklists/requirements.md` deja sin marcar CHK001, CHK003 y CHK016: la spec nombra puertos, códigos HTTP y algoritmos. Separar ese detalle hacia `plan.md` es una mejora opcional que cambiaría texto aprobado.
6. Commit. Para que `git log --follow` conserve el historial de los 12 archivos, conviene un primer commit solo con los renombrados que ya están en el índice y un segundo commit con el resto.

## 7. Cómo volver a la estructura anterior

La rama `spec/v2.2.0-review` sigue en `76a31bf` sin cambios. Mientras no haya commits en `001-pet-health-tracker`, descartar el árbol de trabajo y volver a esa rama restaura la estructura anterior. Copia de seguridad previa a la integración del 2026-11-09 en `~/backup-pre-speckit-014128`.

## Conteo de identificadores (método declarado)

El único conteo oficial es el de la compuerta `scripts/verify-traceability.sh`, reproducido por separado:

| Fuente | Identificadores únicos |
| :--- | ---: |
| `spec.md`: `REQ-`, `INV-`, `STATE-` con sufijo numérico | 63 |
| `contracts/**`, fuera de la spec | 2 |
| `constitution.md` §3, fuera de la spec y de los contratos | 4 |
| `contracts/errors/error-catalog.json`: códigos `ERR-*` | 30 |
| **Total de la compuerta** | **99** |
| Menos retirados presentes en el universo (`INV-PET-001`, `INV-PET-004`, `STATE-PET-QUOTA-001`) | −3 |
| **IDs vigentes** | **96** |

La lista de retirados de la constitución §4 tiene 4 IDs; `ERR-PET-QUOTA-EXCEEDED` no está en el catálogo, por eso la resta es 3. Los 4 retirados aparecen en `spec.md` solo dentro de notas de retiro (fila de historial y «Retirado en v2.0.0»), no como requisitos vigentes.

Los números 114, 131, 104 y 106 que aparecieron antes en el proceso de validación miden otra cosa y no deben citarse como conteo de la migración.
