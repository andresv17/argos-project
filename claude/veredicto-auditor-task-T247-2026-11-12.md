# Veredicto Oracle T247 — 2026-11-12 — CONDICIONADO
Solo lectura. Sin tocar src/tests/specs/tasks.md/git.

## Gates (salidas literales re-ejecutadas)
- households.api.spec: Tests 3 failed | 26 passed (29) (EDGE-037/038 espera INVITED en members; HOUSE2-001 filas 3 vs 2; schema 422 n:1 vs 0). Son los mismos 3 ya conocidos desde la revalidación T246 (26/29).
- assignments-ownership.api.spec: Tests 1 failed | 10 passed (11). Rojo: [REQ-AUD-001][SC-016] SqliteError: no such table: audit_log.
- roles.api.spec: Tests 13 passed (13).
- tsc --noEmit: solo household-policies.spec.ts(366,72) y (376,37) 'permissions' (T248). Cero en src/.
- verify-oracles: Archivos analizados: 81; oráculos débiles: 0; CUMPLE.
- verify-traceability --feature 002 --task T247: IDs trazados 4/4; pureza 0; CUMPLE.

## Contrato
OpenAPI declara GET /pets/{petId}/assignments, PUT (no POST) y DELETE /pets/{petId}/assignments/{householdId} (200 PetAssignment / 204) y POST /pets/{petId}/ownership-transfer (200 TransferPetOwnershipResult, 401/403/404/422). Rutas, métodos y códigos coinciden. ownership-transfer devuelve {pet, prunedAssignments} validado por el harness contra el esquema. GET /pets/{id} no existe en el OpenAPI; /pets/{petId}/dashboard sí (getPetDashboard, 200/401/404).

## Spec
- REQ-HOUSE2-003: solo Propietario Legal (requireWritablePet), 403 si ve y no es dueño, 404 si no la ve, 403 si el dueño no es ACTIVE en el destino, PUT idempotente. Cumple.
- REQ-OWN-001 / INV-OWN2-001: transacción única (pets.save, assignments.save con assignedByUserId nuevo, remove de podadas); destino válido vía dominio. Cumple. Brecha: la microchip del destino no se valida (la spec lo exige; no hay código declarado) y las filas OWNERSHIP_TRANSFER/UNASSIGN esperan T264/T265.
- INV-ACC2-001 (loadPetAccess filtrado por asignación): CORRECTO conforme a la spec ("existe un hogar H con P asignada y U miembro ACTIVE"). Sin él SC-017 es imposible. No altera T244/T246: los fixtures derivan asignaciones (REQ-MIG-001) y la migración 0004 siembra pet_assignments, 15 pruebas 001 se recuperan, 0 nuevos rojos. Matiz: la migración asigna solo a hogares con otro miembro ACTIVE, el fixture a todo hogar ACTIVE del dueño (divergencia menor, el dueño siempre lee).
- INV-HOUSE-004: poda al expulsar/abandonar/borrar hogar ya existía (H-T245-2) y está probada con asignaciones reales.

## Pruebas con expectativa cambiada
- assignments-ownership: GET /api/pets/{id} -> GET /api/pets/{id}/dashboard. Mismo oráculo (200 y profile.ownerUserId / 404 para quien no ve). Ruta existe en el OpenAPI. Legítimo. El archivo es nuevo (untracked), no hay línea base git que comparar.
- households.api.spec: el diff sin commit solo contiene cambios de T238 (OWNER->ADMIN) y pruebas nuevas; las 3 expectativas rojas no fueron tocadas. Confirmado.
- canonicalState derivado (INVITED a invitations, assignments por REQ-MIG-001): cambia la forma del fixture 001; está declarado en el comentario del fixture y en la evidencia. Aceptable; es la causa de B1(b)(c).

## B1
(a) EDGE-037/038 exige INVITED en members: HouseholdMember.status ya no admite INVITED (3.0.0, decisión de Neo en T246). (b)(c) cuentan filas de household_invitations sin la de Carlos que el fixture ahora siembra. Adaptar a members ACTIVE + pendingInvitations ['carlos_88:INVITED'], filas = Carlos + nuevas, conteo de filas no-Carlos = 0 NO relaja el oráculo, lo traslada al modelo vigente conservando igualdad exacta. Legítimo, con dos condiciones: (1) autorización explícita de Neo/Oracle (tocar oráculo), (2) hecho como edición mínima de esas 3 aserciones, sin cambiar otros expect. Nota: pertenece naturalmente a T238.
## B2
La prueba de audit_log depende de T264/T265. El texto de T247 no incluye REQ-AUD-001; T247 puede darse por cumplida sin B2 si Neo acepta que el rojo se traslade a T264. Debe quedar registrado.
## H-T246-5
Sigue abierto: el OpenAPI no declara 422 en PATCH members ni en POST households/{id}/ownership-transfer; el orden 422/403 del PATCH necesita decisión de Architect (declarar 422 o reordenar acceso antes que cuerpo, como hacen assignments y ownership de mascota).

## Hallazgos nuevos
- H-T247-1 (Media): GET /households/{id}/pets (GetHouseholdPetsUseCase, household-use-cases.ts:405) lista por dueños ACTIVE vía pets.listByOwners, ignora pet_assignments. Tras DELETE de asignación o con mascotas nunca asignadas, un miembro sigue viendo la tarjeta de la mascota en el hogar mientras el dashboard le da 404: viola SC-017/INV-HOUSE-004 en esa ruta. Keymaker lo declaró pendiente; T248 lo cubre ("vista de hogar... visibilidad por asignación"). Aceptable diferirlo a T248 solo con constancia; no hay prueba que lo cubra hoy. Recomendado: prueba roja en T248.
- H-T247-2 (Baja): microchip duplicada del destino en la transferencia sin validar (REQ-OWN-001); requiere código de error de Architect.
- H-T247-3 (Baja): divergencia fixture vs migración en la siembra de asignaciones.
- H-T247-4 (Baja): AssignPet no comprueba que el hogar exista antes del 403 (devuelve 403 en lugar de 404 ERR-HOUSE-NOT-FOUND); coherente con el contrato ("nunca lo fue" -> 403), sin fuga.

## Decisión
CONDICIONADO. Código de T247 conforme al contrato y la spec, gates verdes, 0 rojos nuevos. Pendiente solo decisión de Neo sobre B1/B2 y registro de H-T247-1 en T248. MAX_RETRY de T247 sin usar.
- Corregible por Keymaker (sin gastar MAX_RETRY si Neo autoriza): adaptar las 3 aserciones de B1.
- Neo: autorizar B1 (adaptar 3 expectativas) y aceptar B2 trasladado a T264/T265.
- Architect: H-T246-5 (422 vs 403) y código de error para microchip duplicada.
