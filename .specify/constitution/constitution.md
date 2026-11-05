---
document_id: CONSTITUTION-ARGOS-001
version: 1.0.0
status: LOCKED
last_updated: 2026-11-05
---

# CONSTITUCIÓN ARQUITECTÓNICA — PROYECTO ARGOS (PET HEALTH TRACKER)

Esta Constitución define las invariantes técnicas, tecnológicas y operativas no negociables del **Proyecto Argos**. Ningún plan, tarea o línea de código en `src/` o `tests/` puede contradecir este documento.

## 1. DEFINICIÓN Y PROPÓSITO DEL SISTEMA
Argos es una aplicación web local, ligera y 100% determinista diseñada para administrar el expediente clínico, físico y sanitario de **exactamente hasta 4 mascotas (máximo 2 perros y 2 gatos)**, garantizando aislamiento estricto de datos por mascota, alertas sanitarias calculadas mediante máquinas de estados finitos y respaldo/restauración atómica en formato JSON.

## 2. STACK TECNOLÓGICO INMUTABLE
Para evitar decisiones heurísticas durante la implementación, se fija el siguiente stack ligero y sin dependencias pesadas de servidor externo:
- **Lenguaje y Compilador:** TypeScript 5.x bajo configuración de máxima rigurosidad (`strict: true`, `noUncheckedIndexedAccess: true`, `exactOptionalPropertyTypes: true`, `noImplicitReturns: true`).
- **Runtime & Bundler Web:** Vite + React 18+ con Tailwind CSS para interfaz responsiva (Desktop y Mobile).
- **Persistencia Local Transaccional:** Almacenamiento local estructurado mediante adaptador `StoragePort` implementado sobre **IndexedDB transaccional / LocalStorage atómico con snapshot de rollback en memoria** (y adaptador en memoria `InMemoryStorageAdapter` para pruebas unitarias y de propiedades).
- **Validación de Contratos en Runtime:** Validación declarativa estricta (`additionalProperties: false`) derivada de los esquemas de `contracts/schemas/` y expuesta a través de `src/generated/`.
- **Suite de Pruebas (The Test Gate):**
  - Unitarias e Integración de Contratos: **Vitest**.
  - Pruebas Basadas en Propiedades (Property-Based Testing): **fast-check** con semilla (`seed`) fija reproducible.
  - Pruebas de Mutación: **Stryker Mutator** (`tests/mutation/stryker.conf.json`).
  - Pruebas E2E y Accesibilidad: **Playwright** + **axe-core** (`@axe-core/playwright`).

## 3. REGLAS DE PUREZA Y AISLAMIENTO DE ENTROPÍA (DETERMINISMO TOTAL)
1. **Prohibición de Reloj Global (`INV-ARCH-001`):** Queda estrictamente prohibido invocar `new Date()`, `Date.now()` o `performance.now()` dentro de `src/domain/` y `src/application/`. Toda operación dependiente del tiempo (cálculo de edad de la mascota, validación de fechas futuras, evaluación de alertas `UP_TO_DATE` / `DUE_SOON` / `OVERDUE`) debe recibir una instancia de `ClockPort`:
   - `interface ClockPort { todayIsoDate(): string; nowIsoTimestamp(): string; }`
2. **Prohibición de Generadores Aleatorios Directos (`INV-ARCH-002`):** Queda prohibido invocar `Math.random()` o `crypto.randomUUID()` directamente en `src/domain/` y `src/application/`. La creación de identificadores debe inyectarse vía `IdGeneratorPort`:
   - `interface IdGeneratorPort { nextId(): string; }`
3. **Inmutabilidad de `src/generated/` (`INV-ARCH-003`):** Todo tipo de datos de contrato, esquema validador y catálogo de códigos de error reside en `src/generated/` y proviene de `scripts/compile-contracts.sh`. Ningún desarrollador o agente puede editar manualmente archivos bajo `src/generated/`.
4. **Regla de Dependencia Concéntrica (`INV-ARCH-004`):**
   - `src/domain/` depende únicamente de `src/generated/` (tipos puros y códigos de error). No importa nada de `application`, `infrastructure`, `presentation` ni librerías de UI/IO.
   - `src/application/` depende únicamente de `src/domain/` y `src/generated/`. Define los puertos (`ClockPort`, `IdGeneratorPort`, `PetRepositoryPort`, `MedicalRecordRepositoryPort`, `BackupStoragePort`).
   - `src/infrastructure/` implementa los puertos definidos en `src/application/` y ejecuta validación de esquemas en runtime antes de persistir o devolver datos.
   - `src/presentation/` consume únicamente casos de uso de `src/application/` y tipos de `src/generated/`. Prohibido incluir reglas de negocio o cálculos de fechas directamente en componentes JSX/TSX.

## 4. ESTÁNDAR DE TRAZABILIDAD (LINEAGE IDS)
Todo artefacto del repositorio debe mantener trazabilidad cruzada verificable mediante `scripts/verify-traceability.sh`:
- **Requisitos Funcionales:** `REQ-PET-001`..`003`, `REQ-REC-001`..`006`, `REQ-UI-001`..`004`, `REQ-BACKUP-001`..`002`.
- **Invariantes de Dominio:** `INV-PET-001`..`004`, `INV-REC-001`..`006`, `INV-SORT-001`, `INV-BACKUP-001`.
- **Máquinas de Estado:** `STATE-ALERT-001`, `STATE-BACKUP-001`, `STATE-PET-QUOTA-001`.
- **Catálogo de Errores:** `ERR-PET-*`, `ERR-REC-*`, `ERR-BACKUP-*`, `ERR-SCHEMA-*`.

Cada función o clase en `src/` debe incluir en su comentario JSDoc los IDs que implementa (ej. `@implements REQ-PET-001, INV-PET-001`), y cada bloque `describe` o `it` en `tests/` debe incluir explícitamente el ID verificado en su título (ej. `it('[INV-PET-001][ERR-PET-QUOTA-EXCEEDED] rechaza el registro de un tercer perro', ...)`).

## 5. UMBRALES NO NEGOCIABLES DEL TEST GATE
- **Cobertura de Trazabilidad:** 100% de los IDs declarados en `.specify/specs/pet-health-tracker.md` y `contracts/errors/error-catalog.json` deben estar referenciados en `src/` y probados en `tests/`.
- **Cobertura de Líneas y Ramas en `src/domain/` y `src/application/`:** Mínimo 95%.
- **Puntuación de Mutación (Mutation Score):** Mínimo 85% en `src/domain/` y `src/application/` (bloqueante por debajo de 80%).
- **Cero Weak Oracles:** Prohibido el uso de aserciones débiles (`toBeDefined()`, `toBeTruthy()` aislados sin comprobar el valor o código de error exacto), verificado por `scripts/verify-oracles.sh`.
