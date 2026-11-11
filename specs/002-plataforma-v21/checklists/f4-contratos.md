# Checklist de F4 (plan, modelo de datos, quickstart y contratos): Plataforma ARGOS v2.1 (Feature 002)

**Propósito**: Validar cobertura, consistencia y trazabilidad de los artefactos de F4 contra la spec APPROVED, la constitución 3.1.0 y las decisiones de Neo del 2026-11-10.
**Creada**: 2026-11-10 por `/mouse` (equivale a `/speckit-analyze` sobre F4). Solo lectura sobre los artefactos; esta checklist no aprueba nada.
**Artefactos auditados**: `plan.md`, `data-model.md`, `quickstart.md`, `contracts/README.md`, 6 esquemas, OpenAPI (40 operaciones), 5 máquinas de estado, catálogo de 35 errores.
**Leyenda**: `[x]` cumple; `[ ]` abierto, con su hallazgo (`F4-A` alto, `F4-M` medio, `F4-B` bajo).
**Verificación mecánica hecha**: los 6 esquemas compilan en Ajv 2020 `strict` + `strictTypes`; 0 `$ref` rotos en el OpenAPI; 40 operaciones (13 NEW, 21 CHANGED, 6 UNCHANGED); 35 errores (30 de la 001, menos 2, más 7); todo `ERR-*` citado existe en el catálogo; casos de contrato del quickstart §2 reproducidos (contraseña, especie, peso 0.0005/0.001/150, sobre 3.0.0 con `exportedByUserId`).

## 1. Cobertura de la spec

- [x] CHK101 Los 31 `REQ-*` no visuales de la spec que piden contrato aparecen en al menos un contrato (esquema, OpenAPI, máquina o catálogo).
- [x] CHK102 `REQ-MIG-001` tiene especificación formal: ADR-002-10 y `data-model.md` §2.10 y §2.13 (conversión de `INVITED`/`DECLINED`/`CANCELLED`, F4-A2 cerrado). No hay contrato ejecutable de migración (es detalle de datos, no de API); se acepta.
- [x] CHK103 Los 28 `INV-*` vigentes o nuevos (9 nuevos + 18 vigentes + `INV-BACKUP-001`) están en `x-sdd-metadata.traceability` o en el mapa de `data-model.md` §3.
- [x] CHK104 Las 4 `STATE-*` (`ALERT`, `AUTH-SESSION`, `HOUSE-MEMBERSHIP`, `BACKUP`) tienen contrato con versión nueva y `supersedes` correcto (2.0.1, 2.2.0, 2.2.0, 2.2.0, verificados contra la 001).
- [x] CHK105 Los `SC-003` a `SC-006`, `SC-008` a `SC-017` y `SC-001`, `SC-010` tienen prueba nombrada en `quickstart.md` §4. Faltan `SC-002` (compuerta de trazabilidad) y `SC-007` (teclado, e2e): bajo, F4-B6.
- [x] CHK106 Las 11 acciones de `REQ-RBAC-001` están en `RbacAction`; las 9 de mascota en `PetPermissions`; la prueba de 44 casos está en ADR-002-03 y quickstart.
- [x] CHK107 Los 8 tipos de `mutationType` y 13 de `entityType` coinciden con los valores cerrados de la spec.
- [x] CHK108 Cada `entityType` tiene un `entityId` definido. `PET_ASSIGNMENT` no tiene identificador propio (clave compuesta). Ver F4-M3.
- [x] CHK109 Las 40 operaciones tienen `x-sdd-requirements` no vacío y todas las que cambian estado exigen `X-Argos-Request`, incluida la exportación.

## 2. Consistencia entre artefactos

- [x] CHK201 Especies: las 8 coinciden en `Species`, `CHECK` de tabla, filtro `OTHERS` del OpenAPI, sobre 3.0.0 y migración `DOG`/`CAT`.
- [x] CHK202 `speciesOther`: 1–60, obligatorio solo con `OTHER`, nulo en el resto, igual en `CreatePetInput`, `PetProfile`, `BackupPetProfileV3` y `CHECK` de tabla.
- [x] CHK203 `microchipId`: `^\d{15}$`, nullable, único por propietario (índice parcial) y excluido de la vista canónica; igual en esquema, tabla, sobre 3.0.0 y error 409.
- [x] CHK204 `neutered`: booleano nulable en esquema, sobre y tabla (`INTEGER NULL`).
- [x] CHK205 Peso: kg con `multipleOf 0.001` en el contrato, gramos enteros en la tabla (`1..150000`), tabla por especie en `SpeciesWeightLimits` (0.05–150.00 con 2 decimales; 0.001–150.000 con 3). Equivalente al 0.05–150 kg de la spec; ADR-002-09 no cambia lo observable.
- [x] CHK206 Contraseña: `Password` (10–128, `\p{Lu}`, `[0-9]`, 32 símbolos) en registro y cambio; `LoginPassword` sin política; mensaje del catálogo coincide.
- [x] CHK207 Sesión: 30 min y 24 h en `SessionView`, máquina, constitución y catálogo; el mismo error para todos los motivos.
- [x] CHK208 `username`: `^[a-z0-9._-]+$`, 3–30, sin normalizar, igual en `Username`, tabla e invitación.
- [x] CHK209 Rol: `ADMIN`/`CAREGIVER`/`READER` coinciden en esquema, `CHECK` de tabla y máquina; el propietario del hogar siempre `ADMIN` (`CHECK` y índice parcial).
- [x] CHK210 Versiones de contratos coherentes entre README, plan (ADR-002-01) y `x-sdd-metadata`; la diferencia con la «v2» de la spec está declarada.
- [x] CHK211 `DeleteAccountInput` coincide con el catálogo y la spec para el token ausente. Ver F4-A1.
- [x] CHK212 La etiqueta de `SUPERSEDED` coincide entre spec, OpenAPI y máquina. Ver F4-M2 (máquina: «Histórico reemplazado»).
- [x] CHK213 `updateRecord` se puede validar con el esquema tal como está escrito. Ver F4-M1 (`oneOf` ambiguo).
- [x] CHK214 Los nombres de configuración de límites de frecuencia son los mismos en plan y OpenAPI. Ver F4-B1 (`INVITE_WINDOW_MINUTES` solo en el OpenAPI).
- [x] CHK215 El estado de `SUPERSEDED` para un registro sin próxima fecha está definido de una sola manera. Ver F4-M4.

## 3. IDs nuevos

- [x] CHK301 Solo `STATE-ACCOUNT-DELETE-001` es un ID de requisito que no existe en la spec, la 001 ni el catálogo (comprobado por búsqueda de todos los `REQ|INV|STATE|SC|ERR-*` en los artefactos de F4).
- [x] CHK302 `ERR-PET-MICROCHIP-DUPLICATE` y `ERR-RATE-LIMITED` son los únicos errores del catálogo que la spec no nombra, y están marcados `pendingIds`.
- [x] CHK303 No hay más IDs inventados. Los `ADR-002-NN` se declaran propios del plan y no son requisitos.
- [x] CHK304 Los dos errores retirados (`ERR-AUTH-USER-NOT-FOUND`, `ERR-HOUSE-MEMBER-ALREADY-EXISTS`) solo se citan en el catálogo y en el plan como retirados.
- [ ] CHK305 Los nombres provisionales de configuración y de cabecera nuevos están todos declarados como pendientes. Faltan `INVITE_WINDOW_MINUTES`, `X-Argos-Import-Confirm` y el estado de invitación `ACCEPTED` (F4-B1, F4-M5).

## 4. Decisiones de Neo aplicadas

- [x] CHK401 M1 A: 150 kg provisional, marcado `PROVISIONAL_MAX_TO_VALIDATE_BY_VET` en `SpeciesWeightLimits`, en el catálogo, en el plan y en el modelo de datos.
- [x] CHK402 T1: HMAC con clave por parámetro en `hmacUserId(userId, key)`; sin `auditKeyVersion`.
- [x] CHK403 R2/T2: vista canónica sin `email`, `displayName` ni `microchipId` a cualquier profundidad (`AuditCanonicalViewRules`, `data-model` §2.12, ADR-002-05, quickstart, máquina B7).
- [x] CHK404 R3: invitación uniforme (202 con `InviteAccepted` idéntico, invitación inerte con `invitee_user_id` nulo, límite de frecuencia). Sin errores de existencia en el catálogo.
- [x] CHK405 R6/T6: sobre 3.0.0 sin `userId`, `exportedByUserId` ni `ownerUserId` (`additionalProperties: false`, probado); sesión 3.0.0 con `REVOKED` separado.
- [x] CHK406 T3/T5/T8 (P-09 a P-12): token en cabecera y nunca en el archivo, solo SHA-256 en base, una fila por usuario, emisión solo si la generación terminó bien, fallos de contraseña actual en el limitador.
- [x] CHK407 T7 (P-14): sobres 1.0.0 y 2.0.0 con validación final idéntica, `ownerUserId` ignorado, claves prohibidas, 10 MB sobre bytes leídos.
- [x] CHK408 R1, R4, R5: retención de 24 meses, `secure_delete` más checkpoint de WAL después del commit, purga de 90 días de terminales y 7 días de sesiones.
- [x] CHK409 Límites de frecuencia configurables y fuera del contrato. Los valores 5 exportaciones y 20 invitaciones por 15 min están marcados «sugeridos, no aprobados» en el plan (ADR-002-12, punto 4 para Neo). Anotación de `/mouse`: son provisionales del arquitecto.
- [x] CHK410 `avatarUrl` conserva la regla de la 001 y el plan lo declara como punto para Neo.

## 5. Eliminación de cuenta

- [x] CHK501 Fase A sin escrituras (A1, A3, A4) y fase B en una transacción con bloqueo de escritura (B1 a B11) en `STATE-ACCOUNT-DELETE-001`.
- [x] CHK502 Consumo del token con `UPDATE` condicional (`usedAt IS NULL AND expiresAt > now AND userId = sesión`, 1 fila) dentro de la transacción; el rollback de bloqueos lo devuelve a vigente (`data-model` §2.4 y máquina B3, B4).
- [x] CHK503 Fila `ACCOUNT_DELETE` con `executorUserId` y `entityId` iguales al HMAC; el esquema de auditoría rechaza un valor en claro (`allOf`).
- [x] CHK504 Orden de borrado hoja a raíz, aserción B6 y poscondiciones B10 definidos.
- [x] CHK505 El OpenAPI refleja las dos fases. `deleteAccount` dice «transacción única» y no describe la fase A, el `UPDATE` condicional ni el orden de errores de B. Ver F4-B2.
- [x] CHK506 La poscondición B10 («cero filas con el `userId` en claro en cualquier tabla») es alcanzable. No lo es si la cuenta transfirió antes una mascota asignada (`pet_assignments.assigned_by_user_id`). Ver F4-A3.

## 6. Decisiones del arquitecto fuera de la spec

- [x] CHK601 ADR-002-04 (invitación como entidad propia): coherente con la spec, que ya nombra `HOUSEHOLD_INVITATION` y «invitaciones» como entidad borrable. No requiere decisión de Neo. Deja un hueco de migración (F4-A2).
- [x] CHK602 ADR-002-09 (peso en gramos enteros): detalle interno de almacenamiento; el contrato público sigue en kg y respeta `INV-REC2-002` y `deltaKg` exacto. No requiere decisión de Neo.
- [x] CHK603 ADR-002-11 (ruta genérica de registros): la spec no fija rutas; coherente con `REQ-REC2-003` y la matriz. No requiere decisión de Neo. El esquema del cuerpo debe corregirse (F4-M1).
- [ ] CHK604 ADR-002-08 añade `fileDigest` y la cabecera `X-Argos-Import-Confirm`, y ADR-002-07 pasa la exportación de `GET` a `POST`. No figuran en la spec ni en el bloque aprobado de forma literal (T4, T7, P-09 a P-12 los inspiran). Conviene que Neo los vea. Ver F4-M5.

## 6 bis. Reverificación tras correcciones del arquitecto (2026-11-10, `/mouse`)

**Cobertura**: 63 de 63 requisitos con contrato citado. De ellos, 62 con contrato formal y `REQ-MIG-001` con especificación formal en `data-model.md` §2.10/§2.13 y ADR-002-10 (cita en `x-sdd-metadata` de 2 esquemas). Antes: 62 de 63.
**Cerrados**: F4-A1, A2, A3, M1, M2, M3, M4, B1, B2, B3, B4, B5. **Siguen abiertos**: F4-M5 (decisión de Neo, marcado «pendiente» en `plan.md` ADR-002-07/08 y punto 10, no en los contratos), F4-B6 (`SC-002` y `SC-007` sin prueba nombrada), F4-B7 (ya en punto 5 para Neo) y CHK305 (estado de invitación `ACCEPTED` no declarado provisional).
**Ajv**: 6 de 6 esquemas compilan en Ajv 2020 `strict` + `strictTypes` (las claves `x-sdd-*` se registran como palabras clave); OpenAPI 3.1.0 parsea con `yaml`: 33 rutas, 40 operaciones, 345 `$ref`, 0 rotas; 5 máquinas parsean; 35 errores. `DeleteAccountInput` sin token valida (por diseño, A1); `UpdateWeightInput {notes}` ya no valida sin `collection`.

## 7. Hallazgos (resumen tras reverificación)

| ID | Gravedad | Dónde | Resumen |
|---|---|---|---|
| F4-A1 | Alto (CERRADO) | `identity.schema.json` L302–319; `account-deletion.machine.json` L50; `error-catalog.json` L85 | Token ausente da `ERR-SCHEMA-VALIDATION-FAILED`; spec, US7 AC7, SC-014, V11 y el catálogo exigen `ERR-ACCOUNT-CONFIRMATION-MISMATCH` |
| F4-A2 | Alto (CERRADO) | `plan.md` L96; `data-model.md` L146 | La migración no convierte las filas `INVITED`/`DECLINED`/`CANCELLED` de `household_members` de la 001; el `CHECK` las rechazaría |
| F4-A3 | Alto (CERRADO) | `data-model.md` L173; `account-deletion.machine.json` L173–185 | `pet_assignments.assigned_by_user_id` conserva el `userId` de quien asignó y transfirió; B9 no lo borra y B10 aborta |
| F4-M1 | Medio (CERRADO) | `pet-tracker-api.openapi.yaml` L598 | `oneOf` de los 6 cuerpos de `updateRecord` es ambiguo: `{ "notes": "x" }` no valida |
| F4-M2 | Medio (CERRADO) | `sanitary-alert.machine.json` L43 | Etiqueta «Histórico reemplazado» contradice «Reemplazada por registro posterior» (spec REQ-UI-003, OpenAPI) |
| F4-M3 | Medio (CERRADO) | `data-model.md` L169–175; `audit-entry.schema.json` L74 | `PET_ASSIGNMENT` sin `entityId` válido (clave compuesta) |
| F4-M4 | Medio (CERRADO) | `sanitary-alert.machine.json` L27, L65 | Registro sin próxima fecha con uno posterior: ¿`SUPERSEDED` o fuera de evaluación? Afecta inmutabilidad y acordeón |
| F4-M5 | Medio (ABIERTO: decisión de Neo) | `plan.md` L93–94 | `fileDigest`, `X-Argos-Import-Confirm` y exportación por `POST` no están en la lista de puntos para Neo |
| F4-B1 | Bajo (CERRADO) | `plan.md` L98; OpenAPI L766 | `INVITE_WINDOW_MINUTES` solo en el OpenAPI; unidad de `ARGOS_AUDIT_RETENTION_DAYS` frente a 24 meses |
| F4-B2 | Bajo (CERRADO) | OpenAPI L166–190 | `deleteAccount` no describe fases A y B |
| F4-B3 | Bajo (CERRADO) | `account-deletion.machine.json` | Numeración A1, A3, A4 (falta A2) |
| F4-B4 | Bajo (CERRADO) | `pet-tracker-api.openapi.yaml` L655–680 | `assignPetToHousehold` y `listPetAssignments` sin caso de «dueño no es miembro ACTIVE» ni 403 documentado |
| F4-B5 | Bajo (CERRADO) | `spec.md` L380 | Frase «La spec sigue en `DRAFT`» obsoleta (el plan ya la señala) |
| F4-B6 | Bajo | `quickstart.md` L44–56 | `SC-002` y `SC-007` sin prueba nombrada |
| F4-B7 | Bajo | `data-model.md` L165 | Invitaciones `INVITED` inertes no vencen y guardan un `username` ajeno; ya señalado en el punto 5 para Neo |
