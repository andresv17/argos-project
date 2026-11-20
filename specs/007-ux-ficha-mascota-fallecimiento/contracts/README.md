# Contratos de la Feature 007

**Estado**: enmienda **APLICADA en `REVIEW`** por `/architect` (T1013, 2026-11-19; sin `APPROVED`/`LOCKED`, firma de Neo pendiente) sobre la **línea 002** (`specs/002-plataforma-v21/contracts/`), con coordinación aditiva en la **004** (sigue `DRAFT`). `N2-07-01` aprobada por Neo (2026-11-19). **Archivos**: 002 `schemas/pet.schema.json` 3.1.0, `schemas/backup-envelope.schema.json` 3.1.0 (envolvente `BackupEnvelopeV32`, `schemaVersion` `3.2.0`), `openapi/pet-tracker-api.openapi.yaml` 3.1.0 (`updatePet` con `If-Match`/`412` — la operación real es `PATCH /pets/{petId}`, no `PUT`), `errors/error-catalog.json` 3.1.0 (`ERR-PET-VERSION-CONFLICT`), `examples/canonical-fixtures.json` 1.1.0; 004 `pet`, `backup-envelope`, `error-catalog` y `openapi` con los mismos campos. Compilado con `bash scripts/compile-contracts.sh` (línea 002 → `src/generated/{api,errors,schemas}`). **Pendiente (Keymaker/Morpheus)**: regenerar la línea 004 (`v31`, y por herencia `v33`/`v34`), que cambia salidas de otras features y se detuvo por la regla de alcance. No se enmienda el 001. El texto de abajo conserva la propuesta original.

Solo `[GH:#13]` toca contratos. `[GH:#11]`, `[GH:#12]`, `[GH:#14]`, `[GH:#15]` y `[GH:#51]` no tienen contratos nuevos.

## Enmienda propuesta (SemVer minor aditiva) sobre la línea 002

`pet.schema.json` (v3.0.0; coordinar con la 004, v3.1.0 `DRAFT`, para no crear dos versiones en conflicto) en `CreatePetInput`, `UpdatePetInput` y vista de mascota:

```json
"lifeStatus": { "type": "string", "enum": ["ALIVE", "DECEASED"], "default": "ALIVE" },
"deceasedAt": { "type": ["string", "null"], "format": "date" }
```
- No requeridos en ninguna entrada ni en el respaldo (retrocompatible para datos); `additionalProperties: false` se conserva.
- Condicional `if lifeStatus = DECEASED then required deceasedAt` y `if ALIVE then deceasedAt = null`; `deceasedAt >= birthDate` y `<= hoy` en el caso de uso (`x-sdd-metadata`).
- Vistas: `PetCardView` y `PetDashboardView` exponen ambos campos y la `version` de control optimista; `ComputedAge` conserva su forma.
- **Sin** `state-machines/pet-life.machine.json` (`M7-01`) y **sin** `ERR-PET-LIFE-STATUS` (`M7-02`): la violación del invariante usa `ERR-SCHEMA-VALIDATION-FAILED` (422), existente en el catálogo de 002.
- `canonical-fixtures.json` (002): casos `ALIVE` por defecto, `DECEASED` válido e inválidos (fecha previa al nacimiento, futura, `ALIVE` con fecha).

## Control optimista (`EDGE-007-009`, decidido por Neo)
`PATCH /pets/{petId}` (`updatePet`, OpenAPI 002) exige `If-Match` con la `version` de la vista y responde `412` si no coincide; se añade el código de error de precondición (catálogo 002; **no existe hoy**, verificado en disco) con `type` `urn:argos:error:...` y plantilla sin datos personales. Contrato nuevo bajo `N2-07-01`; `/trinity` revisa el código de estado nuevo si Neo lo pide.

## Respaldo versionado (`EDGE-007-015`/C3, decidido por Neo)
`backup-envelope.schema.json` (002, v3.0.0): `pets[]` acepta ambos campos como opcionales. El formato se versiona: el valor exacto de `schemaVersion` (hoy constante `3.0.0` en `BackupEnvelopeV2`) y la variante se fijan en `T1067` con `/merovingian`. Un build anterior recibe un respaldo de versión superior y lo rechaza con el error explícito `ERR-BACKUP-VERSION-UNSUPPORTED` (existente), de forma atómica y sin estado parcial; sin versionar, `ERR-BACKUP-SCHEMA-INVALID` (documentado como comportamiento de builds anteriores). La importación de 1.0.0, 2.0.0 y 3.0.0 sigue asignando `ALIVE`/nulo. La importación por reemplazo previsualiza `DECEASED → ALIVE` y exige confirmación (`REQ-FAL7-009`).

## Enlace veterinario y `ClinicalSummary` (005, `C1`, decidido por Neo)
Verificado en disco (`H5`): `ClinicalProfile` en `clinical-summary.schema.json` (005, v1.0.0) es un objeto cerrado (`additionalProperties: false`) cuyo `required` copia campos de la mascota (`name`, `species`, `speciesOther`, `breed`, `sex`, `neutered`, `birthDate`, `birthDateIsEstimate`, `age`, ...) y no incluye `lifeStatus`. Enmienda MINOR propuesta de 005: `lifeStatus` visible (opcional) y `deceasedAt` opcional, presente solo con disclosure opt-in del creador del enlace (opción desmarcada por defecto, como `includeClinicalFiles`); el enlace de 005 expone la opción en su creación. Los enlaces activos no se revocan; al marcar `Fallecido` el creador recibe aviso con la acción de revocar. La revisión de privacidad es de `/rama` (`T1012`, `T1026`).

## Auditoría (`/rama` C8)
`REQ-AUD-001` calcula SHA-256 sin clave sobre la vista pública. Si `lifeStatus`/`deceasedAt` entran en la vista hasheada se acepta el riesgo equivalente al de `birthDate` (OBS-3); se registra en el ADR de `T1013`. La transición `Fallecido → Vivo` se audita con la fecha anterior (`EDGE-007-016`).


## Verificación del impacto en 005 (`T1012`/`T1026`, solo lectura en esta pasada)
`specs/005-album-archivos-clinicos/contracts/schemas/clinical-summary.schema.json` v1.0.0 **no se editó**: `ClinicalProfile` es cerrado (`additionalProperties: false`) y no incluye `lifeStatus` ni `deceasedAt`, de modo que las salidas de 005 no cambian con la enmienda de 002/004. La MINOR de 005 (`lifeStatus` visible, `deceasedAt` solo con disclosure opt-in) es la tarea `T1026`.

## Decisiones del Architect en la aplicación (T1013)
- **Operación**: el contrato vigente edita la mascota con `PATCH`; el control optimista (`If-Match` con `profile.version` entre comillas) se aplica a `updatePet` (`PATCH`), no a un `PUT` inexistente. `T1064` debe leerse como `PATCH`.
- **`version`**: entero `integer` ≥ 1 (`PetVersion`), inicial `1`, +1 en cada `PATCH`; opcional en `PetProfile` por retrocompatibilidad (el servidor siempre lo emite).
- **Respaldo**: `schemaVersion` `3.2.0` (el `3.1.0` ya lo usa la 004 para medios). `BackupEnvelopeV3` (3.0.0) y los legados no cambian. En 002 se añaden `BackupPetProfileV32`/`BackupEnvelopeV32`; en 004, los mismos sobre `BackupEnvelopeV31` (registros 3.1.0). `ImportPreviewResult`/`ImportBackupResult` admiten `3.2.0` en `sourceSchemaVersion`.
- **Error**: `ERR-PET-VERSION-CONFLICT` (412, `INV-PET2-001`) en los catálogos de 002 y 004; su índice incremental está en `contracts/errors/error-catalog.json` de 007 (no se compila por separado). `ERR-BACKUP-VERSION-UNSUPPORTED` reformula su detalle (EDGE-007-015).
- **Auditoría (`/rama` C8)**: `lifeStatus`/`deceasedAt` entran en la vista hasheada por `REQ-AUD-001` con el riesgo equivalente al de `birthDate` (OBS-3), aceptado.
