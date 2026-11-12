# Evidencia T247 — Keymaker (sonnet) — 2026-11-12
Sin commit, sin push, tasks.md intacto (T247 NO marcada). No se tocaron specs/**, contracts/**, src/generated/**, .specify/** ni esquemas.

## Archivos
Nuevos: src/application/use-cases/assignment-use-cases.ts (List/Assign/Unassign), src/application/use-cases/ownership-use-cases.ts (TransferPetOwnershipUseCase), src/infrastructure/http/routes/assignments.routes.ts, src/infrastructure/http/routes/ownership.routes.ts, tests/integration/api/roles.api.spec.ts (13 pruebas HTTP).
Editados: repositories.port.ts (PetAssignmentRepositoryPort.save), sqlite-repositories.ts y in-memory-unit-of-work.ts (save, upsert), use-case-support.ts (loadPetAccess), routes/use-cases.ts, http/app.ts (registro de rutas), tests/fixtures/application-harness.ts y sqlite-harness.ts, tests/integration/api/assignments-ownership.api.spec.ts.

## Decisiones
- Rutas segun OpenAPI: GET /pets/{id}/assignments, PUT (idempotente, 200 PetAssignment) y DELETE (204) /pets/{id}/assignments/{householdId}; POST /pets/{id}/ownership-transfer (200 {pet, prunedAssignments}). La instruccion decia POST de asignar; el contrato dice PUT y las pruebas tambien.
- Acceso antes que cuerpo: requireWritablePet (404/403) y despues el esquema (422) y el dominio.
- INV-ACC2-001: loadPetAccess ahora solo considera membresias en hogares donde la mascota esta asignada (antes: cualquier hogar compartido con el dueño). Sin esto SC-017 (404 antes de asignar) era imposible.
- Fixtures: canonicalState deriva petAssignments segun REQ-MIG-001 (cada mascota asignada a los hogares donde su dueño es ACTIVE) y seedSqlite las siembra; 'pet_assignments' se añade al volcado dumpSqlite. Sin esto 15 pruebas verdes de 001 pasaban a rojo.
- Transferir mascota: pets.save con ownerUserId nuevo y updatedAt (no hizo falta metodo nuevo en el puerto: save ya actualiza owner_user_id y data), assignments.save reasigna assignedByUserId, assignments.remove poda. Transferir el hogar no toca asignaciones (prueba propia).
- Poda al expulsar/abandonar: ya estaba (H-T245-2) y las pruebas HTTP de assignments-ownership la verifican con asignaciones reales (expulsion, abandono, borrado de hogar).
- Auditoria (ASSIGN/UNASSIGN/OWNERSHIP_TRANSFER): sin puerto ni tabla audit_log (T264/T265); no se persiste.
- Prueba cambiada: assignments-ownership leia GET /api/pets/{id}, ruta que el OpenAPI no declara (el harness falla con "sin operacion en el OpenAPI"). Se lee de GET /api/pets/{id}/dashboard (profile.ownerUserId). Mismo oraculo (dueño y 200), distinta ruta. Oracle debe confirmarlo.

## Salidas literales
- households.api.spec: Tests 3 failed | 26 passed (29) (los mismos 3, ver bloqueo).
- assignments-ownership.api.spec: Tests 1 failed | 10 passed (11). Rojo: "[REQ-AUD-001][SC-016] ... audit_log" -> "no such table: audit_log" (T264/T265).
- roles.api.spec: Tests 13 passed (13).
- tests/unit: Tests 73 failed | 455 passed (528); los 73 son los de la linea base (backup, record-invariants, presentation, household-policies permissions T248, adaptadores).
- Suite completa vs linea base: fallos 176 -> 161, pasan 1143 -> 1171, 0 fallos nuevos, 15 corregidos.
- tsc --noEmit: solo household-policies.spec.ts(366,72) y (376,37) 'permissions' (T248). Cero en src.
- verify-oracles: Archivos analizados: 81; oraculos debiles: 0; CUMPLE.
- verify-traceability --feature 002 --task T247: IDs trazados 4/4; pureza 0; CUMPLE.

## Bloqueos y hallazgos
- B1 (3 rojos de households.api.spec, NO tocados): exigen el modelo viejo y no se arreglan en src sin violar el esquema. (a) EDGE-037/038 espera status INVITED en members: HouseholdMember.status solo admite ACTIVE|LEFT|REMOVED; el 3.0.0 pone invitaciones en pendingInvitations (decision de Neo en T246). (b) y (c) esperan household_invitations sin la fila INVITED de Carlos (fixture 001), pero el fixture la siembra ahi (T246): hace falta ajustar la expectativa (filas = Carlos + las nuevas; n = 1). Propuesta: adaptar las 3 expectativas al modelo 3.0.0 conservando la fuerza (members ACTIVE + pendingInvitations ['carlos_88:INVITED']; filas con Carlos; conteo de filas distintas de Carlos = 0). Requiere decision de Neo/Oracle.
- B2: la prueba de auditoria depende de T264/T265.
- H-T246-5: el OpenAPI no declara 422 para PATCH members ni para transferencia de hogar; el harness rechaza un 422 en PATCH como violacion de contrato. El orden 422/403 no queda decidido por el contrato; no se añadio prueba (decision de Architect: declarar 422 o ajustar el orden).
- H-T246-7 cerrado: roles.api.spec cubre PATCH (200 HouseholdMemberView, 403, 401) y transferencia de hogar (401, sin poda) y de mascota (404/403 antes que 422, 422 esquema, destino invalido, prunedAssignments, assignedByUserId).
- GET /households/{id}/pets sigue listando por dueños ACTIVE (modelo 001), no por asignacion (INV-HOUSE-004 "sobre mascotas asignadas"); con el fixture derivado coinciden. Pendiente para T248/T238.
- Transferir a un destino con la misma microchipId en sus mascotas no se valida (no hay codigo declarado para ello en la transferencia).

## B1 adaptación (2026-11-12, autorizada por Neo Nivel 2)
Solo tests/integration/api/households.api.spec.ts; sin tocar fixtures, src ni otros tests. Diff exacto (unified=0):

```diff
@@ -27 +27 @@ describe('hogares por HTTP (src/infrastructure/http/routes/households.routes.ts)
-  it('[REQ-HOUSE-004][ERR-HOUSE-NOT-FOUND] D-01: EDGE-037 un INVITED recibe 404; EDGE-038 el OWNER ve INVITED en members y un MEMBER solo ACTIVE', async () => {
+  it('[REQ-HOUSE-004][ERR-HOUSE-NOT-FOUND] D-01: EDGE-037 un INVITED recibe 404; EDGE-038 members solo lista ACTIVE y el OWNER ve la invitación INVITED en pendingInvitations; un MEMBER solo ACTIVE', async () => {
@@ -33,2 +33,4 @@ describe('hogares por HTTP (src/infrastructure/http/routes/households.routes.ts)
-    expect([statuses(owner.json), statuses(member.json), problemOf(invited), problemOf(stranger)]).toEqual([
-      ['ACTIVE', 'ACTIVE', 'INVITED'],
+    const pending = (json: unknown) => (json as { pendingInvitations: Array<{ inviteeUsername: string; status: string }> }).pendingInvitations.map((i) => `${i.inviteeUsername}:${i.status}`);
+    expect([statuses(owner.json), pending(owner.json), statuses(member.json), problemOf(invited), problemOf(stranger)]).toEqual([
+      ['ACTIVE', 'ACTIVE'],
+      ['carlos_88:INVITED'],
@@ -115,0 +118 @@ describe('hogares por HTTP (src/infrastructure/http/routes/households.routes.ts)
+      { household_id: H1, invitee_username: 'carlos_88', invitee_user_id: USERS_BY_NAME.carlos, invited_by_user_id: USERS_BY_NAME.andres, role_on_join: 'CAREGIVER', status: 'INVITED', responded_at: null },
@@ -134 +137 @@ describe('hogares por HTTP (src/infrastructure/http/routes/households.routes.ts)
-    expect(api.db.prepare('SELECT COUNT(*) AS n FROM household_invitations').get()).toEqual({ n: 0 });
+    expect(api.db.prepare('SELECT COUNT(*) AS n FROM household_invitations WHERE invitee_username <> \'carlos_88\'').get()).toEqual({ n: 0 });
```

Salidas literales:

```text
## households
 Test Files  1 passed (1)
      Tests  29 passed (29)
## assignments
   × transferencia de propiedad legal por HTTP (REQ-OWN-001, SC-016, INV-OWN2-001) > [REQ-AUD-001][SC-016] la transferencia escribe una fila de auditoría OWNERSHIP_TRANSFER sobre la mascota (tabla audit_log, data-model.md §2.12; pendiente de T264) 10ms
     → no such table: audit_log
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯
 Test Files  1 failed (1)
      Tests  1 failed | 10 passed (11)
## roles
 Test Files  1 passed (1)
      Tests  13 passed (13)
## TSC
tests/unit/household-policies.spec.ts(366,72): error TS2339: Property 'permissions' does not exist on type 'HouseholdPetEntry'.
tests/unit/household-policies.spec.ts(376,37): error TS2339: Property 'permissions' does not exist on type 'HouseholdPetEntry'.
## ORACLES
[SDD Oracle Gate] Analizando suites en tests/ contra Weak Oracles...
[SDD Oracle Gate] Archivos analizados: 81; oráculos débiles: 0
[SDD Oracle Gate] Resultado: CUMPLE
```
B2 (audit_log) sigue rojo y se traslada a T264/T265.
