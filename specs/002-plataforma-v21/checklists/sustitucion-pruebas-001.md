# Tabla de sustitución de pruebas de la Feature 001 por las de la Feature 002

**Feature**: 002-plataforma-v21 | **Fecha**: 2026-11-10 | **Autor**: `/architect` (F6) | **Estado**: `REVIEW` (la aprobación es de Neo)
**Fuente**: `.specify/memory/audits/hoja-de-ruta-feature-002.md` sección C, ampliada con un barrido de `tests/` (búsqueda de `DOG`/`CAT`, `OWNER`/`MEMBER`, `canEdit`, sesión de 7 días, contraseña de 8 caracteres y `schemaVersion`).

## Regla

1. **Ninguna prueba de la 001 se borra, se comenta ni se relaja.** Una prueba que contradice la 002 se sustituye en el mismo archivo (o en el archivo nuevo que indica la tabla) por la prueba de la 002, y el motivo queda aquí. El historial de git conserva la versión de la 001.
2. Una prueba de la 001 que sigue siendo válida pasa como regresión sin cambios (T304).
3. La columna «Tarea» enlaza con `specs/002-plataforma-v21/tasks.md`. La sustitución ocurre en la tarea de pruebas de esa rebanada; la regeneración de `src/generated/` (T207) deja `tsc` en verde y no cambia el sentido de ninguna prueba.
4. Corrección frente a la hoja de ruta: la matriz tiene **44 celdas** (11 acciones por 4 roles, `REQ-RBAC-001` y `SC-008`), no 32.
5. `/mouse` verifica que no quede una prueba con un identificador reemplazado sin su sustituta.

## Tabla «prueba 001 → prueba 002 → motivo»

| # | Prueba de la 001 (archivo) | Prueba de la 002 (sustituta) | Motivo (ID reemplazado o cambiado) | Tarea |
|---|---|---|---|---|
| 1 | `tests/unit/pet-and-alerts.spec.ts`, `tests/property/pet.property.spec.ts`, `tests/unit/date-and-sort.spec.ts` (casos con `DOG`/`CAT`) | Mismos archivos con el enum de 8 especies; casos nuevos de `OTHER` con `speciesOther` y de edad estimada | `Species` pasa a 3.0.0; `REQ-PET-001` -> `REQ-PET2-001`, `INV-PET2-001` | T226 |
| 2 | `tests/property/records.property.spec.ts`, `tests/unit/record-invariants.spec.ts` (rango de peso 0.05 a 150 kg para todas las especies, `INV-REC-002`) | Mismos archivos con límites por especie en gramos enteros y propiedades de `SC-013` | `INV-REC-002` -> `INV-REC2-002`; `REQ-REC-001` -> `REQ-REC2-001` | T226 |
| 3 | `tests/integration/contracts/canonical-fixtures.spec.ts`, `generated-contracts.spec.ts`, `codegen-drift.spec.ts`, `openapi-conformance.spec.ts` (fixtures con `DOG`/`CAT`, contrato 2.x, contraseña de 8 caracteres) | Mismos archivos con fixtures canónicos de la 002 y esquemas 3.0.0 | El contrato cambia y se regenera `src/generated/**` | T207 |
| 4 | `tests/unit/backup-migration.spec.ts`, `tests/integration/persistence/sqlite-backup-import.spec.ts` (migra 1.0.0 a 2.0.0) | Migración de 1.0.0 y 2.0.0 a 3.0.0 con `DOG`->`CANINE` y `CAT`->`FELINE`; importar 2.0.0 sigue aceptado | Decisión 3; `REQ-BACKUP-002` -> `REQ-BACKUP2-002` | T233, T275 |
| 5 | `tests/unit/backup-use-cases.spec.ts`, `tests/unit/backup-import-atomicity.spec.ts`, `tests/integration/api/backup-atomicity.spec.ts` | Se conservan como regresión (el reemplazo atómico sigue válido); se añaden previsualización, `fileDigest`, token, exportación por los 4 roles y el criterio de fallo inyectado de `SC-004` | `REQ-BACKUP-001/002` -> `REQ-BACKUP2-001/002`; `INV-BACKUP-001` y `STATE-BACKUP-001` vigentes | T271, T272, T273 |
| 6 | `tests/unit/access-policy.spec.ts`, `tests/property/access.property.spec.ts` (`INV-ACC-001` e `INV-ACC-002`: solo el dueño escribe, lectura por hogar de todos los miembros) | `tests/unit/permissions-matrix.spec.ts` (44 casos de `can(rol, acción)`) y propiedades de rol efectivo y visibilidad por asignación | `INV-ACC-001/002` -> `INV-ACC2-001/002`; `REQ-RBAC-001` | T236 |
| 7 | `tests/unit/household-policies.spec.ts`, `tests/unit/use-cases.households.spec.ts`, `tests/property/households.property.spec.ts` (`OWNER`/`MEMBER`, `canEdit`, `INV-HOUSE-001/002`) | Mismos archivos con `ADMIN`/`CAREGIVER`/`READER`, propietario del hogar, `CHANGE_ROLE`, `TRANSFER_OWNERSHIP` y poda de asignaciones | `INV-HOUSE-001` -> `INV-HOUSE2-001`; `INV-HOUSE-002` absorbida por `REQ-HOUSE2-001/002`; `REQ-HOUSE-002/004/005` reemplazados | T237 |
| 8 | `tests/integration/api/households.api.spec.ts` | Mismo archivo con rol inicial en la invitación, cambio de rol, invitación uniforme siempre por `username` y `ERR-RATE-LIMITED` | `REQ-HOUSE-002/004` -> `REQ-HOUSE2-001/002`; se conserva `username` | T212, T238 |
| 9 | `tests/integration/persistence/sqlite-repositories.spec.ts`, `tests/fixtures/repository-contract-suite.ts`, `tests/fixtures/application-harness.ts` (`OWNER`/`MEMBER`, `DOG`/`CAT`) | Mismos archivos con la suite de repositorios de la 002 (especies, roles, asignaciones, invitaciones) sobre memoria y SQLite | Cambia el modelo de datos | T214, T227, T243 |
| 10 | `tests/unit/auth-policies.spec.ts`, `tests/property/auth.property.spec.ts` (`INV-AUTH-002` de 8 caracteres; `INV-AUTH-004` de 7 días) | Mismos archivos con 10 a 128 caracteres con política y 30 min deslizantes más 24 h absolutas, reloj inyectado y propiedades de ventanas | `INV-AUTH-002/004` -> `INV-AUTH2-001/002` | T208 |
| 11 | `tests/unit/use-cases.spec.ts` (registro con 8 caracteres, sesión de 7 días, `canEdit`, `DOG`/`CAT`) | Mismo archivo con la política nueva, `lastActivityAt`, permisos y 8 especies | `REQ-AUTH-001/002` -> `REQ-AUTH2-001/002`; `canEdit` -> `permissions` | T208, T226 |
| 12 | `tests/integration/api/auth.api.spec.ts` | Mismo archivo, más logout que revoca al instante, `GET /auth/me` tras recargar y expiración por inactividad | `REQ-AUTH-001/002` -> `REQ-AUTH2-001/002`; `STATE-AUTH-SESSION-001` v3 | T209 |
| 13 | `tests/security/exploits/session-csrf.security.spec.ts` (sesión expirada de 7 días; fixtures `DOG`/`CAT`) | Ampliada: expiración por inactividad y por tope, sesión revocada que no reactiva, peticiones rechazadas que no renuevan | `INV-AUTH-004` -> `INV-AUTH2-002` | T213 |
| 14 | `tests/security/exploits/access-control.security.spec.ts` (IDOR «dueño contra miembro», `canEdit`, `OWNER`/`MEMBER`) | IDOR por rol: cada celda «No» responde el error esperado y el Lector no muta | `INV-ACC-002` -> `INV-ACC2-002` | T242 |
| 15 | `tests/security/exploits/malicious-input.security.spec.ts` | Se conserva; se añaden `speciesOther` y `email` a los vectores de XSS almacenado y prototype pollution | Campos nuevos (`INV-PET2-001`, `REQ-AUTH2-001`) | T229 |
| 16 | `tests/security/exploits/credentials.security.spec.ts` (contraseña válida de 8 caracteres), `log-redaction.security.spec.ts` | Se conservan con contraseñas de la política nueva; se añade que auditoría y eliminación de cuenta no registran secretos | `INV-AUTH-002` -> `INV-AUTH2-001`; `INV-AUTH-003`, `INV-AUD-001` | T213 |
| 17 | `tests/integration/api/pets-records.api.spec.ts` (`canEdit`, `DOG`/`CAT`, peso 0.05 a 150 para todas) | Mismo archivo con permisos de Cuidador (puede registrar peso y evento; no edita perfil ni elimina), 8 especies y registros `SUPERSEDED` inmutables | `REQ-PET-001/003/005` -> `REQ-PET2-001/002/003`; `REQ-REC-003/004` -> `REQ-REC2-002`; `canEdit` -> `permissions` | T228, T240, T255 |
| 18 | `tests/property/alerts.property.spec.ts`, `tests/unit/record-invariants.spec.ts` (semáforo y próxima fecha obligatoria) | Regresión del semáforo; casos nuevos de próxima fecha opcional e inmutabilidad `SUPERSEDED` calculado | `STATE-ALERT-001` vigente (2.1.0); `REQ-REC2-002/003` | T255 |
| 19 | `tests/integration/presentation/web-client.spec.ts`, `tests/unit/presentation/**` (6 pantallas, rutas actuales, `canEdit`, `OWNER`/`MEMBER`, mensaje técnico del esquema, sesión de 7 días) | Mismos archivos con rutas en español, filtros por especie, estados de éxito, mensajes humanos y `permissions` | `REQ-UI-004/006/007` -> `REQ-UI2-008/005/003`; `REQ-UI-005` leída con mensajes humanos | T284 |
| 20 | `tests/e2e/visual/*.spec.ts`, `tests/e2e/visual/e2e-support.ts`, `tests/e2e/accessibility/wcag.spec.ts` (`DOG`/`CAT`, contraseña de 8 caracteres, 320/1024/1280 px) | Mismos archivos con pantallas nuevas, 4 anchos (768 px incluido), recargar-sigue-autenticado y dos navegadores por rol | `REQ-UI-004` -> `REQ-UI2-008`; constitución 3.1.0 | T222, T250, T285, T286 |
| 21 | `tests/integration/api/api-fixtures.ts`, `tests/unit/presentation/presentation-fixtures.ts` (`DOG`/`CAT`, `OWNER`/`MEMBER`, `canEdit`) | Mismos fixtures con 8 especies, roles y `permissions` | Cambia el contrato | T207, T284 |
| 22 | `tests/unit/layer-dependencies.spec.ts`, `tests/integration/gates/verify-gates.spec.ts` | Se ajustan solo para rutas multi-feature | F7 | T201, T205 |
| 23 | (no existe) | Pruebas nuevas: eliminación de cuenta (bloqueo, token, cascada atómica con rollback), auditoría (hash canónico, una fila por operación), perfil, asignación y transferencia, migración, vectores V10 a V16 | Decisiones 1 y 6; `REQ-ACC-001/002`, `REQ-AUD-001`, `REQ-OWN-001`, `REQ-HOUSE2-003`, `REQ-MIG-001` | T210, T211, T239, T241, T253 a T257, T297 a T299 |

## Resumen

- Filas de sustitución (pruebas de la 001 que contradicen la 002): **22** (filas 1 a 22). La fila 23 es de pruebas nuevas sin equivalente en la 001.
- Pruebas borradas: **0**.
- Archivos de la hoja de ruta (sección C) que ya estaban en la lista: 18 filas originales; se añadieron las filas 2, 9, 11, 21 y la ampliación de la 1 y de la 20 tras el barrido de `tests/`.

## IDs de la 001 reemplazados por la 002 (24)

Estos identificadores aparecen en `spec.md` de la 002 solo como «reemplazado por». No llevan tarea propia en `tasks.md` (no deben aparecer en código nuevo de la 002); sus pruebas se sustituyen según la tabla y el ID vigente que los reemplaza sí tiene tarea.

| ID reemplazado | Lo reemplaza | Fila de la tabla | Tarea sustituta |
|---|---|---|---|
| `REQ-AUTH-001`, `REQ-AUTH-002` | `REQ-AUTH2-001`, `REQ-AUTH2-002` | 11, 12 | T208, T209 |
| `REQ-PET-001`, `REQ-PET-003`, `REQ-PET-005` | `REQ-PET2-001`, `REQ-PET2-003`, `REQ-PET2-002` | 1, 17 | T226, T228, T240 |
| `REQ-REC-001` | `REQ-REC2-001` | 2 | T226 |
| `REQ-REC-003`, `REQ-REC-004` | `REQ-REC2-002` | 17, 18 | T255 |
| `REQ-HOUSE-002`, `REQ-HOUSE-004`, `REQ-HOUSE-005` | `REQ-HOUSE2-001`, `REQ-HOUSE2-002`, `REQ-HOUSE2-004` | 7, 8 | T212, T237, T238 |
| `REQ-BACKUP-001`, `REQ-BACKUP-002` | `REQ-BACKUP2-001`, `REQ-BACKUP2-002` | 4, 5 | T271 a T275 |
| `REQ-UI-004`, `REQ-UI-006`, `REQ-UI-007` | `REQ-UI2-008`, `REQ-UI2-005`, `REQ-UI2-003` | 19, 20 | T284, T285, T286 |
| `INV-AUTH-002`, `INV-AUTH-004` | `INV-AUTH2-001`, `INV-AUTH2-002` | 10, 13 | T208, T213 |
| `INV-REC-002` | `INV-REC2-002` | 2 | T226 |
| `INV-OWN-001` | `INV-OWN2-001` | 6 | T236, T239 |
| `INV-ACC-001`, `INV-ACC-002` | `INV-ACC2-001`, `INV-ACC2-002` | 6, 14 | T236, T242 |
| `INV-HOUSE-001`, `INV-HOUSE-002` | `INV-HOUSE2-001`; `REQ-HOUSE2-001/002` | 7 | T237 |
