# Evidencia T246 — Keymaker (sonnet) — 2026-11-12
Sin commit, sin push, tasks.md intacto (T246 NO marcada).

## Archivos tocados
- src/domain/households/household-policies.ts: createHousehold produce role 'ADMIN' + isHouseholdOwner: true.
- src/application/ports/repositories.port.ts: HouseholdRepositoryPort.updateOwner; PetAssignmentRecord; PetAssignmentRepositoryPort (listByHousehold, listByPet, remove, deleteForHousehold, deleteForPet); RepositorySet.assignments.
- src/infrastructure/persistence/sqlite/sqlite-repositories.ts: updateOwner (owner_user_id + json_set data.ownerUserId), assignmentRepository sobre pet_assignments (pet_id, household_id, assigned_by_user_id, assigned_at), y saveMembership ahora escribe tambien role e is_household_owner (columnas de 0004; el indice unico de propietario depende de ellas).
- src/infrastructure/persistence/memory/in-memory-unit-of-work.ts: state.assignments, updateOwner, assignmentRepository; cascada (borrar hogar/mascota borra sus asignaciones, como ON DELETE CASCADE).
- src/application/use-cases/household-use-cases.ts: ChangeMemberRoleUseCase, TransferHouseholdOwnershipUseCase, parseChangeRoleInput; endMembership usa applyMembershipEvent con mascotas reales (listByOwners([target])) y asignaciones reales, y borra las asignaciones podadas; viewOf calcula myRole/isHouseholdOwner desde la fila del actor (antes un ADMIN propietario salia READER).
- src/infrastructure/http/routes/households.routes.ts: PATCH /api/households/:householdId/members/:userId (cuerpo ChangeRoleInput, 200 HouseholdMemberView) y POST /api/households/:householdId/ownership-transfer (cuerpo TransferHouseholdOwnershipInput, 200 HouseholdView). Resto intacto.
- src/infrastructure/http/routes/use-cases.ts: registra los dos casos de uso.
- tests/unit/use-cases.households.spec.ts (fila del propietario +isHouseholdOwner: true) y tests/unit/household-policies.spec.ts (test "el creador queda como unico propietario", misma forma +isHouseholdOwner: true), segun resolucion A2.

## Compuertas
- use-cases.households.spec: 13 pasan / 5 fallan (antes 9 fallaban). Los 4 T237 ChangeMemberRole/Transfer PASAN. Fallan 5, todos preexistentes: creacion (la vista esperada tiene forma 001: user, sin isHouseholdOwner; la fila guardada ya coincide), invitar (role MEMBER vs undefined), Carlos invitacion, detalle INVITED, EDGE-031 (T238).
- household-policies.spec: 32 pasan / 3 fallan (igual que antes, sin regresion): (1) creador: toEqual de la fila ya pasa, falla `validateHouseholdMember(ownerMembership)` porque HouseholdMember exige username y displayName y prohibe invitedAt/invitedByUserId (additionalProperties false) y el test exige en la misma fila invitedAt/invitedByUserId y ningun username: contradiccion test/contrato, requiere decision (T248/Architect); (2) invitar rol CAREGIVER (T238); (3) permissions (T248).
- households.api.spec: falla todo con "CHECK constraint failed: status IN ('ACTIVE','LEFT','REMOVED')" (INVITED aun se guarda en household_members tras 0004; T238/T247). Fuera de alcance.
- npx tsc --noEmit: solo los 2 errores preexistentes tests/unit/household-policies.spec.ts(352,72) y (362,37) 'permissions' (T248). Cero errores nuevos en src/.
- bash scripts/verify-oracles.sh: Archivos analizados: 80; oraculos debiles: 0; Resultado: CUMPLE.
- Regresion: tests/integration/persistence/sqlite-repositories.spec.ts + tests/unit/infrastructure-adapters.spec.ts dan 13 fallos con y sin mis cambios en src (mismo CHECK de INVITED).

## Decisiones
- H-T245-1: todos los casos de uso pasan nowIsoTimestamp desde deps.clock (verificado; los nuevos tambien).
- H-T245-2: REMOVE/LEAVE cargan pets.listByOwners([targetUserId]) y asignaciones del hogar, y persisten la poda.
- Se guardan solo las filas cambiadas; en la transferencia el propietario nuevo se guarda al final (indice unico household_members_one_owner).
- Cambio de rol: el cuerpo se valida en la ruta (422 antes que 403); transferencia valida dentro del caso de uso tras comprobar propietario.
- Auditoria (ROLE_CHANGE, OWNERSHIP_TRANSFER, UNASSIGN): el dominio la devuelve pero no existe puerto de auditoria; no se persiste.

## Fuera de alcance / hallazgos
- Contradiccion de la fila de creador (ver arriba): decision de Neo/Architect.
- Invitaciones (T238), vistas con permissions (T248), integracion households.api (T247).
- Rutas nuevas sin pruebas HTTP propias (la API aun no corre por el CHECK de INVITED).

## Rebote (resoluciones de Neo: H-T246-1 a H-T246-4) — Keymaker (sonnet) — 2026-11-12
Sin commit, sin push, tasks.md intacto. No se tocaron specs/**, contracts/**, src/generated/**, .specify/** ni esquemas.

### Archivos
- src/domain/households/household-policies.ts: `InviteCommand.roleOnJoin` (la fila heredada lleva ese rol, antes MEMBER fijo); nuevas `requireManager` (ACTIVE y propietario o ADMIN) y `membershipFromAcceptedInvitation` (membresía ACTIVE con roleOnJoin, firstJoinedAt heredado o now); `removeOrLeave` usa `requireManager` y prohíbe expulsar o cancelar al propietario (ERR-ACC-FORBIDDEN 403, field userId).
- src/application/ports/repositories.port.ts: `InvitationRepositoryPort.listOpenForUser(userId)`.
- src/infrastructure/persistence/sqlite/sqlite-repositories.ts y memory/in-memory-unit-of-work.ts: `listOpenForUser`; la memoria borra también las invitaciones al borrar el hogar (como ON DELETE CASCADE).
- src/application/use-cases/household-use-cases.ts: InviteMemberUseCase ya NO guarda filas INVITED en household_members (solo household_invitations, con el roleOnJoin de la entrada; invitación existente = sin efecto, 202 uniforme); ListMyInvitationsUseCase lee household_invitations y devuelve el roleOnJoin real; RespondInvitationUseCase: ACCEPT guarda invitación ACCEPTED y crea membresía ACTIVE con ese rol, DECLINE guarda DECLINED (sin invitación abierta, ERR-HOUSE-INVITATION-NOT-FOUND); endMembership cancela invitaciones (CANCELLED) con `requireManager`; viewOf arma pendingInvitations desde household_invitations (solo propietario/ADMIN, sin las inertes). Quitados los placeholders 'READER'.
- tests/unit/household-policies.spec.ts: test del creador valida con `isLegacyHouseholdMember` + `isOwnerRow` (no validateHouseholdMember); mismo cambio en el test de invitar con CAREGIVER (misma contradiccion de esquema, ver hallazgos); nuevo test ADMIN expulsa CAREGIVER / ADMIN y CAREGIVER no expulsan al propietario (403).
- tests/unit/use-cases.households.spec.ts: pruebas de invitar, aceptar, rechazar, cancelar, detalle y EDGE-031 adaptadas al modelo (invitaciones en household_invitations, forma de vista 3.0.0); nuevo describe T246 con ADMIN expulsa a CAREGIVER y cancela invitacion (204) y ADMIN contra propietario (403, estado intacto).
- tests/fixtures/application-harness.ts: canonicalState pasa la fila INVITED de Carlos del fixture 001 a `invitations` (roleOnJoin CAREGIVER) y deja household_members solo con ACTIVE. tests/fixtures/sqlite-harness.ts: seedSqlite siembra `state.invitations`.

### Salidas literales
- `npx vitest run` (3 archivos): `Test Files  1 failed | 2 passed (3)` / `Tests  1 failed | 59 passed (60)`. El unico rojo es household-policies "mascotas por dueño ... permissions.editPetBasics" (T248, `permissions` no existe aun). Antes: 8 rojos; ahora 0 de T246.
- `npx tsc --noEmit`: solo `tests/unit/household-policies.spec.ts(366,72)` y `(376,37)` TS2339 'permissions' (los 2 de T248; cambiaron de linea por pruebas nuevas). Cero errores en src/.
- `bash scripts/verify-oracles.sh`: `Archivos analizados: 80; oráculos débiles: 0` / `Resultado: CUMPLE`.
- `npx vitest run tests/integration/api/households.api.spec.ts`: `Tests  3 failed | 26 passed (29)` (antes 0/29). Los 3 rojos asumen el modelo viejo (INVITED en `members`; conteo de filas en household_invitations sin la de Carlos sembrada; 422 con n=0): T247, no se tocaron.
- Suite completa: fallos 307 -> 176 (1143 pasan); comparacion contra la linea base: 0 fallos nuevos.

### Decisiones y hallazgos
- ADMIN expulsa a otro ADMIN: permitido (REQ-HOUSE2-002 solo protege al propietario). La proteccion del propietario se comprueba tras "destino sin membresia abierta" (404) y antes de transicionar.
- Invitar sigue exigiendo propietario (`requireOwner`); abrirlo a ADMIN es T238 (marcado en el comentario).
- H-T246-4 extension: la prueba "invitar con CAREGIVER" tambien llamaba validateHouseholdMember sobre una fila INVITED de dominio (estado INVITED no es del esquema); la cambie a isLegacyHouseholdMember por la misma resolucion 1a. Avisar a Oracle.
- Las pruebas de vista/aceptar se alinearon a la forma 3.0.0 de HouseholdView/HouseholdMemberView (antes esperaban `user` de la 001).
- El dominio conserva el modelo INVITED en `LegacyHouseholdMember` (pruebas puras T237 lo usan); la persistencia ya no lo escribe.
