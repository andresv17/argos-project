# Contratos de la Feature 002

**Feature**: [spec.md](../spec.md) · [plan.md](../plan.md) · [data-model.md](../data-model.md)

Contratos formales de la Feature 002 (estado `REVIEW`, redactados en F4). Los contratos de la Feature 001 en `specs/001-pet-health-tracker/contracts/` no se modifican: cada archivo de esta carpeta declara lo que reemplaza con `supersedes` en `x-sdd-metadata`. Ante una diferencia entre la prosa de la spec y un contrato, prevalece el contrato.

## Inventario

| Contrato | Versión | Reemplaza | Contenido |
| :--- | :--- | :--- | :--- |
| [`schemas/common.schema.json`](./schemas/common.schema.json) | 2.3.0 | 2.2.0 | Primitivas, `ProblemDetails`, `Sha256Hex`, `HmacSha256Hex`, `ConfirmationToken` |
| [`schemas/identity.schema.json`](./schemas/identity.schema.json) | 3.0.0 | 2.1.1 | Usuario, perfil propio, sesión, contraseña (`INV-AUTH2-001`), hogar, membresía con rol, invitación, eliminación de cuenta, matriz `RbacAction` |
| [`schemas/pet.schema.json`](./schemas/pet.schema.json) | 3.0.0 | 2.0.2 | Mascota de 8 especies, `speciesOther`, `neutered`, `microchipId`, permisos, asignación, transferencia |
| [`schemas/medical-records.schema.json`](./schemas/medical-records.schema.json) | 3.0.0 | 2.1.1 | 6 colecciones, peso por especie (cota provisional), vacunas y desparasitaciones con veterinario y próxima fecha opcional |
| [`schemas/backup-envelope.schema.json`](./schemas/backup-envelope.schema.json) | 3.0.0 | 2.1.1 | Sobre 3.0.0 sin `userId`; lectura de 2.0.0 y 1.0.0; previsualización de importación |
| [`schemas/audit-entry.schema.json`](./schemas/audit-entry.schema.json) | 1.0.0 | nuevo | Entrada de auditoría, vista pública canónica, seudónimo HMAC, retención |
| [`openapi/pet-tracker-api.openapi.yaml`](./openapi/pet-tracker-api.openapi.yaml) | 3.0.0 | 2.4.0 | 40 operaciones (13 nuevas, 21 cambiadas, 6 vigentes), cada una con sus `REQ-*` |
| [`state-machines/auth-session.machine.json`](./state-machines/auth-session.machine.json) | 3.0.0 | 2.2.0 | `STATE-AUTH-SESSION-001` con `EXPIRED_IDLE` y `REVOKED` |
| [`state-machines/household-membership.machine.json`](./state-machines/household-membership.machine.json) | 3.0.0 | 2.2.0 | `STATE-HOUSE-MEMBERSHIP-001` con `CHANGE_ROLE` y `TRANSFER_OWNERSHIP` |
| [`state-machines/account-deletion.machine.json`](./state-machines/account-deletion.machine.json) | 1.0.0 | nuevo | `STATE-ACCOUNT-DELETE-001` (**ID pendiente**, ver plan) |
| [`state-machines/backup-import.machine.json`](./state-machines/backup-import.machine.json) | 2.3.0 | 2.2.0 | `STATE-BACKUP-001` con 3.0.0, previsualización y criterio de fallo inyectado |
| [`state-machines/sanitary-alert.machine.json`](./state-machines/sanitary-alert.machine.json) | 2.1.0 | 2.0.1 | `STATE-ALERT-001` con próxima fecha opcional |
| [`errors/error-catalog.json`](./errors/error-catalog.json) | 3.0.0 | 2.1.1 | 35 errores RFC 9457; 7 nuevos y 2 retirados |

## Reglas de generación y cambio

- Los `$id` de los esquemas se conservan: los de la 002 **sustituyen** a los de la 001 cuando se compila la 002. `scripts/compile-contracts.sh` y `scripts/codegen.mjs` hoy leen solo `specs/001-pet-health-tracker/contracts/`; apuntarlos a esta carpeta es un cambio de script que requiere autorización de Nivel 2 (constitución, principio VI) y pertenece a F6.
- Los esquemas se escribieron para Ajv 8 en modo `strict` y `strictTypes`: solo usan las palabras clave `x-sdd-metadata`, `x-sdd-status` y `x-sdd-error` que `codegen.mjs` ya registra; las reglas explicativas viven en `description` y `$comment`.
- `x-sdd-error` de un campo se resuelve contra `errors/error-catalog.json`; no existe una tabla escrita a mano.
- Crear, modificar o versionar un contrato sigue SemVer y requiere autorización humana previa (Nivel 2). Ningún agente cambia un contrato a `APPROVED` o `LOCKED`.
