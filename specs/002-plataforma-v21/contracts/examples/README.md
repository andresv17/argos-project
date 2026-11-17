# Fixtures canónicos de la Feature 002

**Archivo**: [`canonical-fixtures.json`](./canonical-fixtures.json) · versión 1.0.0 · estado `REVIEW` (no `APPROVED` ni `LOCKED`).

Nacen de los contratos 002 (`identity` 3.0.0, `pet` 3.0.0, `medical-records` 3.0.0, `backup-envelope` 3.0.0, `audit-entry` 1.0.0, `common` 2.3.0, catálogo de errores 3.0.0) y de la spec aprobada. No derivan de los fixtures de la 001. Todos los nombres, correos, microchips y contraseñas son ficticios; las contraseñas y el secreto HMAC son solo para pruebas.

## Convención de un caso

`id`, `description`, `requirementId`, `schema` (el validador generado `validate<Schema>`), `input` y `expected`: `"valid"` o el código `ERR-*` esperado. La capa (`layer`) es `SCHEMA` por defecto (decide el validador), `DOMAIN` (el esquema acepta la forma y una regla de dominio la rechaza; `rule` la describe), `PARSER` (falla antes del esquema: `rawJson` o `generate`) o `DISPATCH` (versión no soportada). Un fallo de esquema se resuelve con `x-sdd-error` del campo, y si no existe, con `ERR-SCHEMA-VALIDATION-FAILED` (o `ERR-BACKUP-SCHEMA-INVALID` en los sobres). Las claves `__proto__`, `constructor`, `prototype` y las duplicadas van en `rawJson` para que ni `JSON.parse` ni un clon las pierdan.

## Bloques

| Bloque | Qué cubre | IDs que prueba |
| :--- | :--- | :--- |
| `referenceClock`, `credentialsForTestsOnly`, `entities` | Reloj fijo (2026-11-11), cuentas de prueba, hogar con roles, mascotas de las 8 especies y registros de las 6 colecciones, reutilizables | REQ-TIME-001 |
| `userCases` (`FX-USR-*`) | Contraseña: un válido y un inválido por regla (10-128 por code points, mayúscula `Lu`, dígito ASCII, 1 de los 32 símbolos, 8 símbolos de frontera, emojis astrales); registro, login sin política, cambio de contraseña, perfil, sesión (30 min / 24 h), eliminación de cuenta con token | REQ-AUTH2-001..003, REQ-ACC-001, REQ-ACC-002, INV-AUTH2-001, INV-AUTH2-002, INV-AUTH-003, INV-AUTH-006, STATE-AUTH-SESSION-001 |
| `petCases` (`FX-PET-*`) | 8 especies, `speciesOther` solo con `OTHER`, `neutered`, `microchipId` de 15 dígitos, `birthDateIsEstimate`, edad estimada, hogar base, `ownerUserId` nunca del cliente, fecha futura, microchip duplicado por propietario, transferencia, asignación, permisos por rol | REQ-PET2-001, REQ-PET2-003, REQ-OWN-001, REQ-HOUSE2-003, INV-PET2-001, INV-OWN2-001, INV-PET-002, INV-PET-006 |
| `rbacMatrix` (`FX-RBAC-*`) | 11 acciones x 4 roles = 44 casos de la matriz | REQ-RBAC-001, SC-008, INV-ACC2-002 |
| `householdCases` (`FX-HOU-*`) | Hogar, membresías `ADMIN`/`CAREGIVER`/`READER`, propietario con `isHouseholdOwner`, `LEFT`/`REMOVED`, sin `INVITED` en la membresía, cambio de rol, transferencia, colores de dueño | REQ-HOUSE-001, REQ-HOUSE2-002, REQ-HOUSE2-004, INV-HOUSE2-001, INV-HOUSE-005, STATE-HOUSE-MEMBERSHIP-001 |
| `invitationCases` (`FX-INV-*`) | Invitación con `roleOnJoin` (4 estados), invitación inerte a usuario inexistente, entrada de invitar | REQ-HOUSE2-001, INV-HOUSE-003 |
| `recordCases` (`FX-REC-*`), `weightSeries` | Las 6 colecciones con `category`, `dewormingType`, próxima fecha opcional, veterinario y colegiado; peso por especie (0.001, 0.0005, 150, 150.001, 2 decimales de `CANINE`/`FELINE`), unidad entera mínima (centésimas o gramos) y `deltaKg`; medidas; fechas del dominio; registro `SUPERSEDED` inmutable | REQ-REC2-001..003, REQ-REC-002/005/006, INV-REC2-002, INV-REC-001/003/004/005, STATE-ALERT-001 |
| `alertCases` (`FX-ALR-*`) | `alert` nulo sin próxima fecha; `OVERDUE`, `DUE_SOON` (0 y 15 días), `UP_TO_DATE` (16 días), `SUPERSEDED` | STATE-ALERT-001 |
| `backupCases` (`FX-BAK-*`) | Sobres 3.0.0 válidos (sin `ownerUserId`, `userId` ni `exportedByUserId`), 2.0.0 y 1.0.0 de solo lectura, previsualización y resultado; inválidos de P-14 por propiedad, rol, asignación, `__proto__`, `constructor`, `prototype`, claves duplicadas, profundidad, JSON malformado, 10 MB, versión no soportada, integridad referencial | REQ-BACKUP2-001, REQ-BACKUP2-002, INV-BACKUP-001, STATE-BACKUP-001, P-14 |
| `auditHmac`, `auditCases` (`FX-AUD-*`) | Entradas de los 10 tipos de mutación con hashes SHA-256; `ACCOUNT_DELETE` y `PET_ASSIGNMENT` con HMAC-SHA256 calculado con el secreto de prueba; inválidos por regla condicional y por secretos | REQ-AUD-001, INV-AUD-001, REQ-OWN-001 |
| `errorCases` (`FX-ERR-*`) | Un `ProblemDetails` por cada uno de los 35 errores vigentes del catálogo 3.0.0 (nunca los dos retirados) y 5 formas inválidas | ERR-* del catálogo |
| `stateScenarios` (`FX-STT-*`) | Transiciones y errores de las máquinas de membresía, sesión, eliminación de cuenta e importación (descriptivos; los ejecuta el dominio) | STATE-HOUSE-MEMBERSHIP-001, STATE-AUTH-SESSION-001, STATE-ACCOUNT-DELETE-001, STATE-BACKUP-001 |

## Casos bloqueados por una discrepancia de contrato

Los casos con `contractDefect: "D-F8-01"` están correctos según la spec pero **no pasan** el validador generado: en `pet.schema.json`, `SpeciesOther` combina `type: ["string","null"]` con `allOf` de `NonEmptyTrimmedString` (`type: "string"`), así que `speciesOther: null` no valida, aunque `PetProfile` y `BackupPetProfileV3` lo exigen (`required`) y nulo para las 7 especies distintas de `OTHER`. Las pruebas de contrato deben tratarlos como pendientes hasta que Neo autorice la corrección del contrato (cambio de Nivel 2). No se cambió ningún contrato.

## Cómo se verificó

Cada caso con `schema` se validó con `src/generated/schemas/validators.mjs`; los de capa `DOMAIN`, `PARSER` y `DISPATCH` aplican la regla descrita en `rule`/`rawJson`/`generate`. El script de verificación vive fuera del repo.
