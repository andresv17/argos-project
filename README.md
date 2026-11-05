# Proyecto Argos — Pet Health & Biometric Tracker (SDD Edition)

Plataforma web multi-usuario y determinista para la gestión clínica, biométrica y sanitaria de mascotas (perros y gatos, **sin límite de cantidad**). Cada usuario gestiona sus propias mascotas y puede crear **hogares** para compartirlas con otros usuarios, con distinción visual del dueño. Construida íntegramente bajo **Spec-Driven & Schema-Driven Development (SDD)**.

## Estado Actual del Repositorio (v2.0.0)

| Fase | Artefacto | Versión | Estado |
| :--- | :--- | :--- | :--- |
| 0. Gobernanza | `.specify/constitution/constitution.md` | 2.0.0 | `LOCKED` |
| 1. Specify | `.specify/specs/pet-health-tracker.md` | 2.0.0 | `APPROVED` |
| 1.5. Contract Lock | `contracts/**` | 2.0.0 | `LOCKED` |
| 2. Plan | `.specify/plans/pet-health-tracker-plan.md` | 2.0.0 | `APPROVED` |
| 3. Tasks | `.specify/tasks/pet-health-tracker-tasks.md` | 2.0.0 | `APPROVED` (cola `TASK-101`..`TASK-115` en `PENDING`) |
| 4–5. Implement / Test Gate | `src/`, `tests/` | — | **Pendiente.** La implementación v1.0.0 fue rechazada en auditoría (2026-11-05) y debe adecuarse a v2.0.0. |

## Mapa de Artefactos de Verdad

1. **Plano de Control Raíz:** [`spec-system.md`](./spec-system.md)
2. **Constitución:** [`.specify/constitution/constitution.md`](./.specify/constitution/constitution.md)
3. **Especificación Funcional:** [`.specify/specs/pet-health-tracker.md`](./.specify/specs/pet-health-tracker.md)
4. **Contratos Formales (`LOCKED`):**
   - Identidad (usuarios, sesiones, hogares): [`contracts/schemas/identity.schema.json`](./contracts/schemas/identity.schema.json)
   - Mascotas: [`contracts/schemas/pet.schema.json`](./contracts/schemas/pet.schema.json)
   - Registros médicos: [`contracts/schemas/medical-records.schema.json`](./contracts/schemas/medical-records.schema.json)
   - Respaldo JSON (v2 + v1 legado): [`contracts/schemas/backup-envelope.schema.json`](./contracts/schemas/backup-envelope.schema.json)
   - API OpenAPI 3.1: [`contracts/openapi/pet-tracker-api.openapi.yaml`](./contracts/openapi/pet-tracker-api.openapi.yaml)
   - Máquinas de estado: [`contracts/state-machines/`](./contracts/state-machines/) (`sanitary-alert`, `backup-import`, `auth-session`, `household-membership`)
   - Catálogo de errores: [`contracts/errors/error-catalog.json`](./contracts/errors/error-catalog.json)
   - Fixtures canónicos: [`contracts/examples/canonical-fixtures.json`](./contracts/examples/canonical-fixtures.json)
5. **Plan Técnico:** [`.specify/plans/pet-health-tracker-plan.md`](./.specify/plans/pet-health-tracker-plan.md)
6. **Cola de Tareas:** [`.specify/tasks/pet-health-tracker-tasks.md`](./.specify/tasks/pet-health-tracker-tasks.md)

## Ejecución Local (objetivo de `TASK-115`)

Requisitos: Node.js 22 LTS.

```bash
npm ci                 # instala dependencias exactas del lockfile
cp .env.example .env   # configuración local (sin secretos)
npm run dev            # API en http://127.0.0.1:3000 + web en http://localhost:5173
npm run test:gate      # compuerta completa (contratos, trazabilidad, oráculos, tests, mutación, e2e)
```
Los datos se guardan en `./data/argos.sqlite` (no versionado). Para Cloud solo se sustituirán adaptadores de `src/infrastructure/`.

## Protocolo de Ejecución para Agentes IA

1. Leer `spec-system.md` y `.specify/constitution/constitution.md`.
2. Tomar la siguiente tarea `PENDING` de `.specify/tasks/pet-health-tracker-tasks.md`.
3. Ejecutarla respetando las capas (`src/generated/`, `src/domain/`, `src/application/`, `src/infrastructure/`, `src/presentation/`).
4. Verificar con `scripts/verify-traceability.sh`, `scripts/verify-oracles.sh` y los checklists de `.specify/checklists/`, dejar la tarea en `REVIEW` con evidencia y esperar el aval humano.
