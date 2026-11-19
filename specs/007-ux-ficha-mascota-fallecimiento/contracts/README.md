# Contratos de la Feature 007

**Estado**: `DRAFT`. **Esta feature no crea ni edita contratos en esta fase**: este archivo es la propuesta de cambio como texto. `N2-07-01` fue aprobada por Neo (2026-11-19) sobre la **línea 002** (`specs/002-plataforma-v21/contracts/`); la aplicación es la tarea `T1013` (y `T1064`, `T1067`), seguida de `bash scripts/compile-contracts.sh` (por defecto la 002). **No se enmienda el 001**: su compilación pisaría las salidas de la 002 en `src/generated/`.

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
`PUT /pets/{petId}` (OpenAPI 002) exige `If-Match` con la `version` de la vista y responde `412` si no coincide; se añade el código de error de precondición (catálogo 002; **no existe hoy**, verificado en disco) con `type` `urn:argos:error:...` y plantilla sin datos personales. Contrato nuevo bajo `N2-07-01`; `/trinity` revisa el código de estado nuevo si Neo lo pide.

## Respaldo versionado (`EDGE-007-015`/C3, decidido por Neo)
`backup-envelope.schema.json` (002, v3.0.0): `pets[]` acepta ambos campos como opcionales. El formato se versiona: el valor exacto de `schemaVersion` (hoy constante `3.0.0` en `BackupEnvelopeV2`) y la variante se fijan en `T1067` con `/merovingian`. Un build anterior recibe un respaldo de versión superior y lo rechaza con el error explícito `ERR-BACKUP-VERSION-UNSUPPORTED` (existente), de forma atómica y sin estado parcial; sin versionar, `ERR-BACKUP-SCHEMA-INVALID` (documentado como comportamiento de builds anteriores). La importación de 1.0.0, 2.0.0 y 3.0.0 sigue asignando `ALIVE`/nulo. La importación por reemplazo previsualiza `DECEASED → ALIVE` y exige confirmación (`REQ-FAL7-009`).

## Enlace veterinario y `ClinicalSummary` (005, `C1`, decidido por Neo)
Verificado en disco (`H5`): `ClinicalProfile` en `clinical-summary.schema.json` (005, v1.0.0) es un objeto cerrado (`additionalProperties: false`) cuyo `required` copia campos de la mascota (`name`, `species`, `speciesOther`, `breed`, `sex`, `neutered`, `birthDate`, `birthDateIsEstimate`, `age`, ...) y no incluye `lifeStatus`. Enmienda MINOR propuesta de 005: `lifeStatus` visible (opcional) y `deceasedAt` opcional, presente solo con disclosure opt-in del creador del enlace (opción desmarcada por defecto, como `includeClinicalFiles`); el enlace de 005 expone la opción en su creación. Los enlaces activos no se revocan; al marcar `Fallecido` el creador recibe aviso con la acción de revocar. La revisión de privacidad es de `/rama` (`T1012`, `T1026`).

## Auditoría (`/rama` C8)
`REQ-AUD-001` calcula SHA-256 sin clave sobre la vista pública. Si `lifeStatus`/`deceasedAt` entran en la vista hasheada se acepta el riesgo equivalente al de `birthDate` (OBS-3); se registra en el ADR de `T1013`. La transición `Fallecido → Vivo` se audita con la fecha anterior (`EDGE-007-016`).
