# Errata MINOR — renombrado MicrochipId → ChipClaimMicrochipId

- Estado: APPROVED (Nivel 2, Neo, 2026-11-27, directiva Logos opción 1A)
- Tipo de cambio: MINOR (sin cambio de forma ni de validación; solo nombre de definición)
- Contrato afectado: `contracts/schemas/chip-claim.schema.json` (status APPROVED conservado, change_type MINOR, version 0.2.0)
- Motivo: evitar colisión homónima en codegen con `MicrochipId` de `pet.schema.json` (feature 004), que no se toca.

## Antes / Después

| Ubicación | Antes | Después |
|---|---|---|
| `$defs` (línea 108) | `"MicrochipId": {` | `"ChipClaimMicrochipId": {` |
| `$ref` (línea 130) | `#/$defs/MicrochipId` | `#/$defs/ChipClaimMicrochipId` |
| `$ref` (línea 157) | `#/$defs/MicrochipId` | `#/$defs/ChipClaimMicrochipId` |
| `change_note` | sin nota | añade «renombrado MicrochipId→ChipClaimMicrochipId para evitar colisión homónima en codegen (Neo, Nivel 2, 2026-11-27)» |

`chip-claim.openapi.yaml`, `admin-disputes.schema.json` y demás contratos de 012: sin referencias a `MicrochipId` (verificado con grep). Pendiente de keymaker: `compile-contracts.sh` y comentarios de migraciones 0037 (SQLite) / 0033 (PG).
