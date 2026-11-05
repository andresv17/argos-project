# Proyecto Argos — Pet Health & Biometric Tracker (SDD Edition)

Plataforma web local determinista para la gestión y control médico/físico de 4 mascotas (2 perros y 2 gatos), construida íntegramente bajo **Spec-Driven & Schema-Driven Development (SDD)**.

## Estado Actual del Repositorio (Control Plane Ready)

Las Fases **0 (Gobernanza)**, **1 (Specify)**, **1.5 (Contract Lock)**, **2 (Plan)** y **3 (Tasks)** se encuentran **completas, validadas y bloqueadas (`LOCKED` / `APPROVED`)**. El repositorio está listo para iniciar la **Fase 4 (Implement)** y **Fase 5 (Test Gate)** siguiendo la secuencia estricta de `.specify/tasks/pet-health-tracker-tasks.md`.

## Mapa de Artefactos de Verdad

1. **Plano de Control Raíz:** [`spec-system.md`](./spec-system.md)
2. **Constitución del Proyecto:** [`.specify/constitution/constitution.md`](./.specify/constitution/constitution.md)
3. **Especificación Funcional:** [`.specify/specs/pet-health-tracker.md`](./.specify/specs/pet-health-tracker.md)
4. **Contratos Formales (`LOCKED`):**
   - Esquema de Mascotas: [`contracts/schemas/pet.schema.json`](./contracts/schemas/pet.schema.json)
   - Esquema de Registros Médicos: [`contracts/schemas/medical-records.schema.json`](./contracts/schemas/medical-records.schema.json)
   - Esquema de Backup JSON: [`contracts/schemas/backup-envelope.schema.json`](./contracts/schemas/backup-envelope.schema.json)
   - Contrato OpenAPI 3.1: [`contracts/openapi/pet-tracker-api.openapi.yaml`](./contracts/openapi/pet-tracker-api.openapi.yaml)
   - Máquinas de Estado: [`contracts/state-machines/sanitary-alert.machine.json`](./contracts/state-machines/sanitary-alert.machine.json)
   - Catálogo de Errores: [`contracts/errors/error-catalog.json`](./contracts/errors/error-catalog.json)
   - Fixtures Canónicos: [`contracts/examples/canonical-fixtures.json`](./contracts/examples/canonical-fixtures.json)
5. **Plan Técnico:** [`.specify/plans/pet-health-tracker-plan.md`](./.specify/plans/pet-health-tracker-plan.md)
6. **Cola de Tareas Atómicas:** [`.specify/tasks/pet-health-tracker-tasks.md`](./.specify/tasks/pet-health-tracker-tasks.md)

## Protocolo de Ejecución para Agentes IA

1. Leer `spec-system.md` y `.specify/constitution/constitution.md`.
2. Inspeccionar la siguiente tarea `PENDING` en `.specify/tasks/pet-health-tracker-tasks.md`.
3. Ejecutar la tarea respetando las fronteras de capas (`src/generated/`, `src/domain/`, `src/application/`, `src/infrastructure/`, `src/presentation/`).
4. Verificar la cobertura de IDs (`scripts/verify-traceability.sh`) y la fortaleza de aserciones (`scripts/verify-oracles.sh`).
