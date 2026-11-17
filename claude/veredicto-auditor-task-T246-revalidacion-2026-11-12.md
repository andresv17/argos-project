# Veredicto Oracle — T246 — REVALIDACIÓN (ciclo 2, MAX_RETRY agotado) — 2026-11-12
**APTO.** Sin tocar src/tests/specs/contratos/tasks.md ni git.

## Salidas literales
- vitest (3 archivos): `Test Files 1 failed | 2 passed (3)`, `Tests 1 failed | 59 passed (60)`. Único rojo: household-policies "mascotas por dueño ... permissions.editPetBasics" (línea 366, `Cannot read properties of undefined (reading 'editPetBasics')`) = T248.
- tsc --noEmit: solo household-policies.spec.ts(366,72) y (376,37) TS2339 'permissions' (T248). Cero en src.
- verify-oracles: `Archivos analizados: 80; oráculos débiles: 0` / CUMPLE.
- verify-traceability --feature 002 --task T246: `IDs trazados: 8/8`, pureza 0, CUMPLE.
- households.api.spec: `Tests 3 failed | 26 passed (29)` (antes 29/29). Los 3 rojos asumen el modelo viejo (INVITED en members, EDGE-037/038; fila INVITED al invitar; 422 con roleOnJoin): T247.

## Resolución por hallazgo
- H-T246-1 CERRADO. Los 'READER' que quedan (household-use-cases.ts:81,92,111) son el mapeo MEMBER->READER de filas heredadas del dominio (T237), no el roleOnJoin. Invitar guarda roleOnJoin de la entrada (:180,188,195); ListMyInvitations lo devuelve (:212); RespondInvitation ACCEPT crea membresía ACTIVE con ese rol vía membershipFromAcceptedInvitation (test :140-147: CAREGIVER, OWNER_COLOR_3).
- H-T246-2 CERRADO. removeOrLeave usa requireManager (propietario o ADMIN, household-policies.ts:345) y 403 field userId si el destino es el propietario (:351). Pruebas: household-policies.spec:302-311 (ADMIN expulsa CAREGIVER, ADMIN y CAREGIVER/READER 403 contra propietario, propietario expulsa ADMIN) y use-cases.households.spec:369-377 (403 y snapshot idéntico). Cancelación de invitación por ADMIN: endMembership con requireManager (:249-258).
- H-T246-3 CERRADO. InviteMemberUseCase solo invitations.save; la política inviteMember se usa únicamente como elegibilidad (su fila no se guarda). Único `status: 'INVITED'` en src fuera de generated: viewOf (:131, vista de HouseholdInvitation) e invitationOf (:195, household_invitations). Ningún saveMembership con INVITED. Prueba :83-84 verifica que memberships no cambia. Sqlite y memoria implementan listOpenForUser.
- H-T246-4 CERRADO (1a). household-policies.spec:133 usa isLegacyHouseholdMember + isOwnerRow. git status/diff de src/generated y specs/ (salvo specs/002.../tasks.md, ya modificado antes; no es esquema) está vacío: esquema no tocado. No se puede aislar qué cambió en tasks.md por T246 vs previo; no es relevante para el esquema.
- Prueba "invitar con CAREGIVER" (spec:177) a isLegacyHouseholdMember: LEGÍTIMO, no relajación. La fila INVITED de dominio es LegacyHouseholdMember (status INVITED, invitedAt, sin username), no un HouseholdMember del esquema (status ACTIVE/LEFT/REMOVED, additionalProperties false). validateHouseholdMember sobre ella era una contradicción, no un oráculo válido. El guard tiene contenido (rol CAREGIVER, status, invitedByUserId se comparan con toEqual justo arriba). Nota menor: isLegacyHouseholdMember solo se asierta con toBe(true) además del toEqual estructural; aceptable. Keymaker lo declaró con transparencia.
- Formas 3.0.0 CONFIRMADAS. openapi-types.ts:717-730: HouseholdMemberView {membership, colorToken}, HouseholdView {household, myRole, isHouseholdOwner, members[], pendingInvitations[]}. Pruebas crear (:70-73), aceptar (:146 `{membership, colorToken}`) y detalle (:199-212, m.membership.userId, pendingInvitations) coinciden; no queda `user` de la 001.

## Hallazgos abiertos no del rebote
- H-T246-5 (422 antes de 403 en PATCH, households.routes.ts:51): ACEPTABLE fuera de T246. Baja, el contrato no declara 422 y T238 reordena la API. Registrar en T238/T247.
- H-T246-6 (auditoría sin puerto): ACEPTABLE. Reconocida, REQ-AUD-001 pertenece a otra tarea; el dominio ya devuelve el evento. Debe existir tarea explícita antes del cierre de la feature.
- H-T246-7 (rutas sin prueba HTTP propia): ACEPTABLE fuera de T246, pero hoy 26/29 verdes en API y las 2 rutas siguen sin prueba HTTP propia; exigirla en T247.

## Rojos remanentes (no de T246)
household-policies:366 y tsc x2 (T248); API 3 rojos (T247). Suite completa: 0 fallos nuevos según Keymaker (no re-ejecutada por Oracle).

## Veredicto
APTO para REVIEW. Nada bloqueante. COMPLETED solo lo marca Neo.
