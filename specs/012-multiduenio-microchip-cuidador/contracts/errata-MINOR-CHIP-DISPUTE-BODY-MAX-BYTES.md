# Errata MINOR — CHIP_DISPUTE_BODY_MAX_BYTES = 15728640 (H-04)

- Estado: APPROVED (Nivel 2, Neo, 2026-11-27: «fijar CHIP_DISPUTE_BODY_MAX_BYTES = 15728640 conservando APPROVED»)
- Tipo de cambio: MINOR (documental; sin cambio de forma, validación ni comportamiento)
- Origen: hallazgo H-04 del acta `.specify/memory/audits/oracle-012-bloqueB-T1636-T1643-2026-11-27.md` (contrato con `value: null` frente a `15_728_640` ya implementado en `src/domain/platform/feature-012-limits.ts`, decisión de Neo en el commit `c08cda6`)
- Contrato afectado: `contracts/schemas/chip-claim.schema.json` (status APPROVED conservado, change_type MINOR, versión 0.2.0 → 0.2.1)

## Antes / Después

| Ubicación | Antes | Después |
|---|---|---|
| `x-sdd-metadata.version` | `0.2.0` | `0.2.1` |
| `x-sdd-constants.CHIP_DISPUTE_BODY_MAX_BYTES.value` | `null` | `15728640` (15 MiB = 15 × 1024 × 1024) |
| `...CHIP_DISPUTE_BODY_MAX_BYTES.rule` | «valor a fijar en T1641... no decidido aquí» | valor fijado por Neo (Nivel 2, 2026-11-27); decidido por `Content-Length` antes de leer el cuerpo (413) |
| `x-sdd-metadata.change_note` | sin nota | añade la nota 0.2.1 |

`chip-claim.openapi.yaml` y `error-catalog.json`: sin referencias al valor numérico (verificado por lectura); sin cambios. Keymaker: sin trabajo de código (el valor ya está en `feature-012-limits.ts`); `compile-contracts.sh --feature 012` se verifica con `--out` ajeno a `src/generated/`.
