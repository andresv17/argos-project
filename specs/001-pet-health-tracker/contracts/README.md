# Contracts: Argos Pet Health & Biometric Tracker

**Feature**: [spec.md](../spec.md) · [plan.md](../plan.md)

Contratos formales de la feature. Son la entrada de `scripts/compile-contracts.sh`, que los compila hacia `src/generated/`. La versión y el estado de cada contrato están en su cabecera `x-sdd-metadata`.

## Inventory

| Contrato | Contenido | Artefacto generado en `src/generated/` | Consumidores |
| :--- | :--- | :--- | :--- |
| [`schemas/common.schema.json`](./schemas/common.schema.json) | Tipos comunes (`IsoDate`, `IsoTimestamp`, `Uuid`, `OwnerColorToken`) y `ProblemDetails` | `schemas/types.ts`, `schemas/validators.*` | Todas las capas |
| [`schemas/identity.schema.json`](./schemas/identity.schema.json) | Usuarios, sesión, hogares y membresías | `schemas/types.ts`, `schemas/validators.*` | `domain/auth`, `domain/households`, infraestructura, presentación |
| [`schemas/pet.schema.json`](./schemas/pet.schema.json) | Perfil de mascota, edad calculada y entradas de alta y edición | `schemas/types.ts`, `schemas/validators.*` | `domain/pet`, infraestructura, presentación |
| [`schemas/medical-records.schema.json`](./schemas/medical-records.schema.json) | Los 6 tipos de registro histórico, sus entradas y `AlertStatus` | `schemas/types.ts`, `schemas/validators.*` | `domain/records`, infraestructura, presentación |
| [`schemas/backup-envelope.schema.json`](./schemas/backup-envelope.schema.json) | Sobre de respaldo 2.0.0 y esquemas del formato 1.0.0 | `schemas/types.ts`, `schemas/validators.*` | `application/use-cases` (respaldo), infraestructura |
| [`openapi/pet-tracker-api.openapi.yaml`](./openapi/pet-tracker-api.openapi.yaml) | API HTTP (OpenAPI 3.1, 27 operaciones) | `api/openapi-types.ts`, `api/client.ts` | `infrastructure/http`, `presentation/web`, `tests/integration` |
| [`state-machines/sanitary-alert.machine.json`](./state-machines/sanitary-alert.machine.json) | Máquina `STATE-ALERT-001` | `machines/sanitary-alert.machine.ts` | Dominio, aplicación, presentación |
| [`state-machines/backup-import.machine.json`](./state-machines/backup-import.machine.json) | Máquina `STATE-BACKUP-001` | `machines/backup-import.machine.ts` | Dominio, aplicación |
| [`state-machines/auth-session.machine.json`](./state-machines/auth-session.machine.json) | Máquina `STATE-AUTH-SESSION-001` | `machines/auth-session.machine.ts` | Dominio, aplicación |
| [`state-machines/household-membership.machine.json`](./state-machines/household-membership.machine.json) | Máquina `STATE-HOUSE-MEMBERSHIP-001` | `machines/household-membership.machine.ts` | Dominio, aplicación |
| [`errors/error-catalog.json`](./errors/error-catalog.json) | Catálogo de errores `ERR-*` (RFC 9457) | `errors/error-codes.ts`, `errors/field-errors.ts` | Todas las capas |
| [`examples/canonical-fixtures.json`](./examples/canonical-fixtures.json) | Fixtures canónicos y casos de borde `EDGE-*` | No se compila | `tests/` |

## Generation Rules

- `scripts/compile-contracts.sh` limpia `src/generated/` y lo regenera completo; `src/generated/` no se edita a mano (constitución, principio II, regla 3).
- `ProblemDetails` tiene una única definición, en `schemas/common.schema.json`; `errors/error-catalog.json` y el contrato OpenAPI la referencian con `$ref` y no la duplican.
- La anotación `x-sdd-error` de un campo de un JSON Schema se registra como palabra clave de metadatos en Ajv; el generador deriva de ella el mapa campo → código de error (`errors/field-errors.ts`). No existe una tabla escrita a mano.
- Los validadores se generan con Ajv en modo standalone, `strictTypes: true` y `multipleOfPrecision: 10`.
- Los `@implements` de los archivos generados se leen de `x-sdd-metadata.traceability` de cada contrato.
- Las etiquetas `Source: contracts/...` de las cabeceras generadas son rutas relativas a este directorio de la feature.

## Change Rules

- Ante una diferencia entre la prosa de `spec.md` y un contrato, prevalece el contrato (constitución, principio I).
- Crear, modificar o versionar un contrato requiere autorización humana previa (Nivel 2) y sigue SemVer.
- Tras un cambio aprobado se ejecuta `bash scripts/compile-contracts.sh`.
