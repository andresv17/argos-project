# Veredicto Oracle — T246 — 2026-11-12
**CONDICIONADO.** Sin tocar src/tests/specs/contratos/tasks.md ni git. Alcance en disco: 8 archivos src + 2 tests de T246 (sobre cambios T243-T245 sin commit).

## Gates (re-ejecutados)
- vitest (3 archivos): 49 pasan / 8 fallan (57). household-policies 3 fallan (líneas 131, 163, 352), use-cases.households 5 fallan (67, 88, 137, 195, 269), ownership-transfer pasa.
- tsc --noEmit: 2 errores, tests/unit/household-policies.spec.ts(352,72) y (362,37), 'permissions' (T248). Cero en src.
- verify-oracles: 80 archivos, 0 débiles, CUMPLE.
- verify-traceability --feature 002 --task T246: 8/8 IDs, pureza 0, CUMPLE.
- households.api.spec: 29/29 fallan, CHECK constraint status IN ('ACTIVE','LEFT','REMOVED').

## Resoluciones de Neo
- A2: CUMPLE. Fila del propietario con role ADMIN + isHouseholdOwner:true en use-cases.households.spec y household-policies.spec (131 aprox.); createHousehold (household-policies.ts:194-195) la produce.
- B: CUMPLE. updateOwner en puerto, SQLite (sqlite-repositories.ts, UPDATE owner_user_id + json_set data) y memoria; PetAssignmentRepositoryPort sobre pet_assignments (0004: pet_id, household_id, assigned_by_user_id, assigned_at).
- H-T245-1: CUMPLE en use cases (household-use-cases.ts:178,228,264,286,307 pasan deps.clock). El fallback NOW_FALLBACK sigue en dominio (household-policies.ts:588,627), sin uso desde src.
- H-T245-2: CUMPLE. household-use-cases.ts:255 listByOwners([targetUserId]); 256-269 aplica y persiste la poda (assignments.remove).

## Contrato
- PATCH members/{userId}: ChangeRoleInput {role} -> 200 HouseholdMemberView; ruta households.routes.ts:49. POST ownership-transfer: {targetUserId} -> 200 HouseholdView; ruta :55. Conformes. Reglas de dominio: ADMIN no cambia al propietario ni a sí mismo; solo propietario transfiere; anterior queda ADMIN.
- Cobertura HTTP real de las dos rutas: NINGUNA (API no arranca por el CHECK).

## Hallazgos
- H-T246-1 (media, alcance): T246 declara crear, roleOnJoin, responder, pero siguen placeholders: roleOnJoin fijo 'READER' en household-use-cases.ts:121 y :213 ("T237 PENDIENTE"); inviteMember (:181) sigue guardando fila INVITED en household_members sin rol y sin leer la invitación; RespondInvitation no aplica roleOnJoin. Efecto: 5 fallos en use-cases.households.spec (88, 137, 195, 269, y 67 por forma de vista) y household-policies.spec:163. Keymaker los llamó "preexistentes (T238)"; T238 es la tarea de la API, no de estos casos de uso: pertenecen a T246.
- H-T246-2 (alta): removeOrLeave (household-policies.ts:303) exige requireOwner para expulsar/cancelar; REQ-HOUSE2-002 permite también a un ADMIN. Un ADMIN no propietario no puede expulsar (y no hay regla "ADMIN no expulsa al propietario" porque nunca pasa). Origen T245, expuesto por endMembership (household-use-cases.ts:249-270). Sin prueba que lo cubra.
- H-T246-3 (alta, bloqueante de integración): INVITED sigue escribiéndose en household_members, pero 0004 (línea 62) restringe status a ACTIVE/LEFT/REMOVED. Cualquier invitación en SQLite falla; 29/29 API y 13 de persistencia rojos. La 0004 es untracked (git cat-file: no existe en HEAD), así que no preexistía en el commit; viene de T243 (decisión de Neo, INVITED a household_invitations) y T246 no migró la escritura de invitaciones. Mismo origen que H-T246-1.
- H-T246-4 (media): test del creador (household-policies.spec.ts:131) CONFIRMADO. El esquema exige username y displayName y prohíbe campos extra para HouseholdMember (identity.schema.json:381-410, additionalProperties false), y el test pide la misma fila con invitedAt/invitedByUserId sin username, no valida contra ese esquema. Es contradicción test/contrato (el método válido es toMemberDto). Requiere decisión Neo/Architect; no es defecto de src.
- H-T246-5 (baja): PATCH valida el cuerpo antes de comprobar acceso (households.routes.ts:51), 422 antes que 403/404; invitar hace lo inverso (casos de uso :177). Inconsistencia de orden de errores, posible fuga de existencia. Contrato PATCH no declara 422.
- H-T246-6 (baja): auditoría ROLE_CHANGE/OWNERSHIP_TRANSFER/UNASSIGN (REQ-AUD-001) devuelta por dominio y descartada; sin puerto. Reconocido por Keymaker, fuera de T246.
- H-T246-7 (info): rutas nuevas y updateOwner SQLite sin prueba ejecutada.

## Veredicto
CONDICIONADO. Núcleo (A2, B, H-T245-1/2, cambiar rol, transferir) correcto en disco y compuertas de forma verdes. T246 no puede pasar a REVIEW limpio con H-T246-1/3 abiertos ni con H-T246-2 sin decisión. Neo es el único que marca COMPLETED.
