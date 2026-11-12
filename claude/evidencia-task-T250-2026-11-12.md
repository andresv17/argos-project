# Evidencia T250 — Kid: recorrido de dos y tres navegadores por rol (2026-11-12)

Estado propuesto: REVIEW (no se marca `tasks.md`). Rama 002-plataforma-v21, base 9e4f478, sin push.

## Archivos
- `tests/e2e/visual/household.spec.ts` (reescrito a 002): 13 pruebas seriales con 4 navegadores (Ana propietaria, Bruno ADMIN, Carla CAREGIVER, Dario READER) + 1 prueba de brecha ADMIN.
- `tests/e2e/visual/household-counter.spec.ts`: se conserva la prueba original y se añade la de tres navegadores por rol (propietaria, CAREGIVER, READER).
- `tests/e2e/visual/e2e-support.ts`: helper `apiCall` (PUT/PATCH/DELETE/GET con sesión del contexto, devuelve status, code y cuerpo).

## Cobertura
- Dos navegadores: invitación con `roleOnJoin` ADMIN, INVITED sin acceso (404 ERR-HOUSE-NOT-FOUND, INV-ACC2-001), aceptar por UI, miembros con rol y propietario, SC-017 (cero mascotas sin asignación, solo Argos tras asignar, Bruma no asignada oculta).
- Tres navegadores: CAREGIVER y READER; `pendingInvitations` vacío para ellos y visible para propietaria/ADMIN; los 9 permisos de `PetPermissions` por rol (toEqual contra la matriz REQ-RBAC-001); escrituras: CAREGIVER peso 201, edita/cita 403 ERR-ACC-FORBIDDEN, READER todo 403; CAREGIVER/READER no invitan ni expulsan; ERR-PET-NOT-FOUND para mascota no asignada.
- UI: READER sin Editar/Eliminar/Guardar y con «Solo lectura»; CAREGIVER sin Editar/Eliminar.
- Ciclo: CHANGE_ROLE READER a CAREGIVER (permisos cambian), ADMIN no expulsa ni degrada al propietario (403), propietario no abandona (409 ERR-HOUSE-OWNER-CANNOT-LEAVE), desasignar/reasignar, expulsar (404 hogar y mascota), abandonar, eliminar hogar (mascotas siguen).

## Salidas literales
- `npx playwright test tests/e2e/visual/household.spec.ts tests/e2e/visual/household-counter.spec.ts`: `1 failed, 15 passed`. Falla solo la prueba de brecha `ADMIN de hogar que no es propietario` (household.spec.ts:310) con 3 aserciones suaves.
- `npx tsc --noEmit`: exit 0, sin salida.
- `bash scripts/verify-oracles.sh`: `Archivos analizados: 81; oráculos débiles: 0` / `Resultado: CUMPLE`.
- `bash scripts/verify-traceability.sh --feature 002 --task T250`: `IDs trazados: 3/3` / `Resultado: CUMPLE`.

## Hallazgos (producción en src/**, fuera de mi alcance)
- H-T250-1 (backend): `InviteMemberUseCase` (src/application/use-cases/household-use-cases.ts:180) usa `requireOwner`; un ADMIN que no es propietario del hogar recibe 403 ERR-ACC-FORBIDDEN al invitar. REQ-HOUSE2-001, REQ-RBAC-001 y REQ-HOUSE2-002 lo permiten (`requireManager`). Recibido: 403; esperado: 202 y la invitación visible al propietario.
- H-T250-2 (UI): `PetDashboard.tsx:199-206` muestra «Eliminar» con `editPetBasics`; un ADMIN no tiene `deletePet` (matriz). Debe condicionarse a `permissions.deletePet` (T284/T283).
- Observación: `memberActions`/`HouseholdCard` muestran solo «Propietario/Miembro» y no el rol por miembro ni invitaciones pendientes (REQ-HOUSE2-004); la spec no fija el texto, por eso no se afirmó (evitar inventar etiqueta). El formulario de invitar no envía `roleOnJoin`, de ahí que las invitaciones con rol se hacen por API.

## Decisiones
- Invitaciones/cambios de rol/asignaciones por API real con la sesión de cada navegador; aceptar/rechazar/abandonar/eliminar/crear por UI.
- Brecha ADMIN aislada en su propia prueba con `expect.soft` para que no cancele la cadena serial.
- Se instaló el navegador con `npx playwright install chromium` (caché de usuario, sin tocar el repo).
- Se corrigió la especie obsoleta DOG a CANINE (INV-PET2-001) del recorrido anterior.

## Fuera de alcance
src/**, contracts/**, specs/**, tasks.md, scripts/handoff.py, handoff.json; no hay push.
