# Contracts: Argos Pet Health & Biometric Tracker

**Feature**: [spec.md](../spec.md) · [plan.md](../plan.md)

Los contratos formales de esta feature viven en [`contracts/`](../../../contracts/) de la raíz del repositorio. Este directorio es solo su índice: `scripts/compile-contracts.sh` lee la carpeta de la raíz para regenerar `src/generated/`, y duplicar los archivos aquí crearía dos fuentes de verdad.

Versión y estado leídos de la cabecera de cada archivo el 2026-11-09.

| Contrato | Contenido | Versión | Estado |
| :--- | :--- | :--- | :--- |
| [`contracts/schemas/common.schema.json`](../../../contracts/schemas/common.schema.json) | Tipos comunes (`IsoDate`, `IsoTimestamp`, `Uuid`, `OwnerColorToken`) y `ProblemDetails` | 2.2.0 | `REVIEW` |
| [`contracts/schemas/identity.schema.json`](../../../contracts/schemas/identity.schema.json) | Usuarios, sesión, hogares y membresías | 2.1.1 | `REVIEW` |
| [`contracts/schemas/pet.schema.json`](../../../contracts/schemas/pet.schema.json) | Perfil de mascota, edad calculada y entradas de alta y edición | 2.0.2 | `REVIEW` |
| [`contracts/schemas/medical-records.schema.json`](../../../contracts/schemas/medical-records.schema.json) | Los 6 tipos de registro histórico, sus entradas y `AlertStatus` | 2.1.1 | `REVIEW` |
| [`contracts/schemas/backup-envelope.schema.json`](../../../contracts/schemas/backup-envelope.schema.json) | Sobre de respaldo v2 y esquemas del formato v1 legado | 2.1.1 | `REVIEW` |
| [`contracts/openapi/pet-tracker-api.openapi.yaml`](../../../contracts/openapi/pet-tracker-api.openapi.yaml) | API HTTP (OpenAPI 3.1, 27 operaciones) | 2.4.0 | `APPROVED` |
| [`contracts/state-machines/sanitary-alert.machine.json`](../../../contracts/state-machines/sanitary-alert.machine.json) | Máquina `STATE-ALERT-001` | 2.0.1 | `REVIEW` |
| [`contracts/state-machines/backup-import.machine.json`](../../../contracts/state-machines/backup-import.machine.json) | Máquina `STATE-BACKUP-001` | 2.2.0 | `REVIEW` |
| [`contracts/state-machines/auth-session.machine.json`](../../../contracts/state-machines/auth-session.machine.json) | Máquina `STATE-AUTH-SESSION-001` | 2.2.0 | `REVIEW` |
| [`contracts/state-machines/household-membership.machine.json`](../../../contracts/state-machines/household-membership.machine.json) | Máquina `STATE-HOUSE-MEMBERSHIP-001` | 2.2.0 | `REVIEW` |
| [`contracts/errors/error-catalog.json`](../../../contracts/errors/error-catalog.json) | Catálogo de errores `ERR-*` (RFC 9457) | 2.1.1 | `REVIEW` |
| [`contracts/examples/canonical-fixtures.json`](../../../contracts/examples/canonical-fixtures.json) | Fixtures canónicos y casos de borde `EDGE-*` | 2.2.0 | `REVIEW` |

## Reglas

- Ante una diferencia entre la prosa de `spec.md` y un contrato, prevalece el contrato (`spec-system.md` §1).
- Crear, modificar o versionar un contrato requiere autorización humana previa (Nivel 2, `spec-system.md` §3).
- Tras un cambio aprobado se ejecuta `bash scripts/compile-contracts.sh`; `src/generated/` no se edita a mano (constitución §3, regla 3).
- El mapeo de cada contrato a su artefacto generado y a sus consumidores está en `plan.md`, §1.
