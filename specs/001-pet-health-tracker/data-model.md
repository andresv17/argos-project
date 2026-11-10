# Data Model: Argos Pet Health & Biometric Tracker

**Feature**: [spec.md](./spec.md) · [plan.md](./plan.md)

**Date**: 2026-11-09

Resumen de entidades, relaciones y ciclos de vida. La definición normativa de cada estructura es su contrato en `contracts/` (índice en [contracts/README.md](./contracts/README.md)); este documento remite a él y no lo sustituye. Los campos listados se leyeron de los esquemas el 2026-11-09. Las reglas de validación se citan por su identificador de [spec.md](./spec.md).

## Entities

### Usuario

- **Contrato**: `UserPublicProfile` en `contracts/schemas/identity.schema.json`
- **Campos**: `id`, `username`, `displayName`, `createdAt`
- **Reglas**: `username` único sin distinguir mayúsculas (`INV-AUTH-001`); política de contraseña (`INV-AUTH-002`); las credenciales no aparecen en ninguna salida (`INV-AUTH-003`)
- **Relaciones**: es dueño de 0 o más mascotas; tiene 0 o más sesiones; participa en 0 o más hogares mediante membresías

### Sesión

- **Contrato**: `SessionView` (`user`, `expiresAt`) en `contracts/schemas/identity.schema.json`
- **Reglas**: vigencia de 7 días y revocación (`INV-AUTH-004`); bloqueo por intentos fallidos (`INV-AUTH-005`)
- **Ciclo de vida**: `STATE-AUTH-SESSION-001`

### Mascota

- **Contrato**: `PetProfileSchema` (raíz de `contracts/schemas/pet.schema.json`); entradas `CreatePetInput` y `UpdatePetInput`
- **Campos**: `id`, `ownerUserId`, `name`, `species` (`DOG` | `CAT`), `breed`, `birthDate`, `sex` (`MALE` | `FEMALE`), `avatarUrl`, `createdAt`, `updatedAt`
- **Derivado**: `ComputedAge` (`years`, `months`, `totalDays`), calculado según `REQ-PET-002`
- **Reglas**: dueño único e inmutable (`INV-OWN-001`); fecha de nacimiento no futura (`INV-PET-002`) y coherente con el historial (`INV-PET-006`); lectura y escritura según `INV-ACC-001` e `INV-ACC-002`
- **Relaciones**: pertenece a un usuario; tiene 0 o más registros en cada una de las 6 colecciones; su eliminación borra sus registros en la misma transacción (`INV-PET-005`)

### Registros históricos

Contrato: `contracts/schemas/medical-records.schema.json`. Todo registro tiene `id`, `petId` y `createdAt`, referencia una mascota existente (`INV-PET-003`), cumple la ventana temporal de `INV-REC-001` y se ordena según `INV-SORT-001`.

| Colección | Estructura | Campos propios | Reglas |
| :--- | :--- | :--- | :--- |
| Peso | `WeightRecord` | `recordedAt`, `weightKg`, `notes` | `INV-REC-002` |
| Medidas corporales | `BodyMeasurementRecord` | `recordedAt`, `neckCm`, `chestCm`, `backLengthCm`, `waistCm`, `notes` | `INV-REC-003` |
| Vacunación | `VaccinationRecord` | `vaccineName`, `appliedAt`, `nextBoosterAt`, `batchOrClinic`, `notes` | `INV-REC-004` |
| Desparasitación | `DewormingRecord` | `productBrand`, `dewormingType`, `appliedAt`, `nextSuggestedDoseAt`, `notes` | `INV-REC-005` |
| Cita médica | `MedicalVisitRecord` | `visitDate`, `reason`, `diagnosis`, `treatment`, `clinicOrVet`, `observations` | `INV-REC-006` |
| Parámetro adicional | `CustomParameterRecord` | `recordedAt`, `category`, `title`, `description`, `notes` | `INV-REC-006` |

### Alerta sanitaria

- **Contrato**: `AlertStatus` (`UP_TO_DATE`, `DUE_SOON`, `OVERDUE`, `SUPERSEDED`)
- **Naturaleza**: estado calculado para cada vacunación y desparasitación a partir de su fecha objetivo y de la fecha actual
- **Reglas**: `STATE-ALERT-001`

### Hogar y membresía

- **Contrato**: `Household` (`id`, `name`, `ownerUserId`, `createdAt`) y `HouseholdMember` (`membershipId`, `householdId`, `userId`, `role`, `status`, `invitedByUserId`, `invitedAt`, `joinedAt`, `firstJoinedAt`, `updatedAt`) en `contracts/schemas/identity.schema.json`
- **Valores**: `role` es `OWNER` o `MEMBER`; `status` es `INVITED`, `ACTIVE`, `DECLINED`, `CANCELLED`, `LEFT` o `REMOVED`
- **Reglas**: propietario único (`INV-HOUSE-001`); gestión exclusiva del propietario (`INV-HOUSE-002`); una sola membresía `INVITED` o `ACTIVE` por usuario y hogar (`INV-HOUSE-003`); visibilidad solo para miembros `ACTIVE` (`INV-HOUSE-004`); color del dueño `OwnerTag.colorToken` (`INV-HOUSE-005`)
- **Relaciones**: un hogar tiene 1 o más membresías; un usuario puede pertenecer a varios hogares; las mascotas no pertenecen al hogar, se comparten a través de la membresía de su dueño

### Sobre de respaldo

- **Contrato**: `BackupEnvelopeV2` (`schemaVersion`, `exportedAt`, `exportedByUserId`, `pets`, `records`) y `BackupEnvelopeV1Legacy` para la migración, en `contracts/schemas/backup-envelope.schema.json`
- **Reglas**: `INV-BACKUP-001`; importación de hasta 10 MB (`REQ-BACKUP-002`)

### Error

- **Contrato**: `ProblemDetails` (`type`, `code`, `title`, `status`, `detail`, `invariantRef`, y opcionales `field`, `instance`, `finalState`) en `contracts/schemas/common.schema.json`; códigos en `contracts/errors/error-catalog.json`
- **Reglas**: precedencia de validación de spec §5.1

## State Transitions

| Máquina | Estados | Contrato |
| :--- | :--- | :--- |
| `STATE-AUTH-SESSION-001` | `ANONYMOUS` → `AUTHENTICATED` → `EXPIRED` \| `LOGGED_OUT` | `contracts/state-machines/auth-session.machine.json` |
| `STATE-HOUSE-MEMBERSHIP-001` | `INVITED` → `ACTIVE` \| `DECLINED` \| `CANCELLED`; `ACTIVE` → `LEFT` \| `REMOVED`; reinvitación con fila nueva | `contracts/state-machines/household-membership.machine.json` |
| `STATE-ALERT-001` | `SUPERSEDED`, `OVERDUE`, `DUE_SOON`, `UP_TO_DATE` (evaluación en ese orden) | `contracts/state-machines/sanitary-alert.machine.json` |
| `STATE-BACKUP-001` | `IDLE` → `CHECKING_PAYLOAD_SIZE` → `PARSING_JSON` → `VALIDATING_VERSION_AND_SCHEMA` → [`MIGRATING_LEGACY_ENVELOPE`] → `CHECKING_DOMAIN_INVARIANTS` → `COMMITTING_SNAPSHOT` → `COMPLETED` \| `ROLLED_BACK` | `contracts/state-machines/backup-import.machine.json` |

Las guardas, eventos y casos límite de cada máquina están en spec §4.

## Persistence

SQLite local con las tablas `users`, `sessions`, `login_attempts`, `pets`, seis tablas de registros con `ON DELETE CASCADE`, `households` y `household_members` (plan.md, §4). Las migraciones están en `src/infrastructure/persistence/sqlite/migrations/`.
