---
document_id: PLAN-ARGOS-001
version: 1.0.0
status: APPROVED
spec_ref: .specify/specs/pet-health-tracker.md
constitution_ref: .specify/constitution/constitution.md
---

# Plan de Arquitectura Técnica: Argos Pet Health & Biometric Tracker

## 1. Mapeo de Contratos a Capas (`contracts/` -> `src/`)

| Contrato Fuente (`contracts/`) | Artefacto Generado (`src/generated/`) | Consumidores Autorizados (`src/`) |
| :--- | :--- | :--- |
| `contracts/schemas/pet.schema.json` | `src/generated/schemas/pet.validator.ts` + tipos `PetProfile`, `Species`, `Sex` | `src/domain/pet/`, `src/infrastructure/`, `src/presentation/` |
| `contracts/schemas/medical-records.schema.json` | `src/generated/schemas/medical-records.validator.ts` + tipos de los 6 módulos | `src/domain/records/`, `src/infrastructure/`, `src/presentation/` |
| `contracts/schemas/backup-envelope.schema.json` | `src/generated/schemas/backup.validator.ts` + tipo `BackupEnvelope` | `src/application/backup/`, `src/infrastructure/storage/` |
| `contracts/state-machines/sanitary-alert.machine.json` | `src/generated/machines/sanitary-alert.types.ts` | `src/domain/alerts/`, `src/presentation/components/alerts/` |
| `contracts/errors/error-catalog.json` | `src/generated/errors/error-codes.ts` + clase `DomainError` | Todas las capas (`domain`, `application`, `infrastructure`, `presentation`) |
| `contracts/openapi/pet-tracker-api.openapi.yaml` | `src/generated/api/openapi-types.ts` | `src/application/`, `tests/integration/contracts/` |

## 2. Diseño de Capa de Dominio (`src/domain/`)
Capa 100% pura, sincrónica y libre de IO/entropía:
- `src/domain/shared/date-utils.ts`: Funciones puras para aritmética de fechas ISO-8601 (`YYYY-MM-DD`), cálculo de diferencia en días calendario (`diffInCalendarDays`) y cálculo de edad (`calculatePetAge` -> `REQ-PET-002`, `INV-PET-002`).
- `src/domain/pet/pet-invariants.ts`: Validación de cupo máximo de 4 mascotas (máx. 2 `DOG` y 2 `CAT` -> `INV-PET-001`, `INV-PET-004`, `STATE-PET-QUOTA-001`).
- `src/domain/records/record-invariants.ts`: Validadores de ventana temporal (`pet.birthDate <= eventDate <= currentDate` -> `INV-REC-001`), rangos de peso (`INV-REC-002`), rangos de medidas (`INV-REC-003`), fechas de refuerzo de vacunas (`INV-REC-004`), fechas de desparasitación (`INV-REC-005`), strings no vacíos (`INV-REC-006`) y cálculo de evolución de peso (`deltaKg`).
- `src/domain/alerts/sanitary-alert-evaluator.ts`: Implementación pura de la máquina de estados `STATE-ALERT-001` (`UP_TO_DATE`, `DUE_SOON`, `OVERDUE`, `SUPERSEDED`).
- `src/domain/sorting/deterministic-sorter.ts`: Función pura de ordenamiento `INV-SORT-001` (`eventDate DESC`, `createdAt DESC`, `id ASC`).

## 3. Diseño de Capa de Aplicación (`src/application/`)
- **Puertos (`src/application/ports/`):**
  - `ClockPort`: `{ todayIsoDate(): string; nowIsoTimestamp(): string; }`
  - `IdGeneratorPort`: `{ nextId(): string; }`
  - `StorageRepositoryPort`: Lectura/escritura transaccional de mascotas y registros con soporte de snapshot atómico.
- **Casos de Uso (`src/application/use-cases/`):**
  - `RegisterPetUseCase` y `UpdatePetUseCase` (`REQ-PET-001`, `INV-PET-001`..`004`).
  - `GetPetDashboardUseCase` (`REQ-PET-003`, `INV-PET-003`, `INV-SORT-001`, `STATE-ALERT-001`).
  - `AddWeightRecordUseCase`, `AddBodyMeasurementUseCase`, `AddVaccinationUseCase`, `AddDewormingUseCase`, `AddMedicalVisitUseCase`, `AddCustomParameterUseCase` (`REQ-REC-001`..`006`).
  - `ExportBackupUseCase` y `ImportBackupUseCase` (`REQ-BACKUP-001`, `REQ-BACKUP-002`, `INV-BACKUP-001`, `STATE-BACKUP-001`).

## 4. Diseño de Infraestructura y Presentación (`src/infrastructure/`, `src/presentation/`)
- **Infraestructura (`src/infrastructure/`):**
  - `SystemClockAdapter` y `FixedClockAdapter` (para tests/fixtures).
  - `CryptoUuidAdapter` y `DeterministicIdAdapter` (para tests/fixtures).
  - `LocalStorageTransactionalRepository` (e `InMemoryTransactionalRepository`): Valida cada lectura/escritura contra los esquemas de `src/generated/` (`additionalProperties: false`) y mantiene copia en memoria previa al commit para garantizar rollback atómico en `ImportBackupUseCase`.
- **Presentación Web (`src/presentation/`):**
  - `PetSelectorBar`: Selector superior/lateral accesible (`REQ-UI-001`, `STATE-PET-QUOTA-001`) con contadores de alertas e indicador de cupo (`2/2 Perros`, `2/2 Gatos`).
  - `PetDashboard`: Ficha técnica aislada por mascota (`REQ-PET-003`, `REQ-UI-002`) con pestañas para los 6 módulos históricos y gráfico SVG determinista de evolución de peso.
  - `AlertBadge`: Semáforo visual (`REQ-UI-003`, `STATE-ALERT-001`).
  - `BackupModal`: Exportación e importación JSON con reporte detallado de errores `ERR-BACKUP-*` (`REQ-BACKUP-001`..`002`).

## 5. Estrategia de Verificación (`tests/`)
- `tests/unit/`: Cobertura exhaustiva de cada invariante (`INV-*`), estado (`STATE-*`) y código de error (`ERR-*`).
- `tests/property/`: Pruebas con `fast-check` (`seed: 20261105`) para `INV-SORT-001`, `INV-REC-002`, `INV-REC-003`, `STATE-ALERT-001` y atomicidad de `INV-BACKUP-001`.
- `tests/integration/contracts/`: Validación de `contracts/examples/canonical-fixtures.json` contra los validadores de `src/generated/`.
- `tests/e2e/`: Pruebas visuales y de accesibilidad (`axe-core`) sobre el flujo de las 4 mascotas.
