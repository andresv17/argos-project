# Evidencia T248 [US2] · Keymaker · 2026-11-12 (sin commit; tasks.md sin tocar)

## Archivos
src: domain/households/household-policies.ts (toRoleMembership, HouseholdPetEntry con myRole+permissions sin canEdit, householdPets con contexto de acceso), application/use-cases/use-case-support.ts (effectiveRoleOf, requireReadablePet, requirePetAction, listVisiblePets; se eliminan requireWritablePet y legacyRoleAndPermissions; buildPetCard recibe rol), pet-use-cases.ts (EDIT_PET_BASICS, DELETE_PET, Mis mascotas = propias + asignadas, ficha con myRole/permissions), record-use-cases.ts (acción por módulo), assignment-use-cases.ts y ownership-use-cases.ts (ASSIGN_PET_TO_HOUSEHOLDS / TRANSFER_PET_OWNERSHIP), household-use-cases.ts (GetHouseholdPetsUseCase por pet_assignments).
tests (añadidos, rojos primero): tests/unit/use-cases.households.spec.ts (H-T247-1 unitaria), tests/integration/api/roles.api.spec.ts (H-T247-1 HTTP).

## Prueba roja
Antes: 2 rojas (la lista del hogar de María seguía incluyendo Argos tras desasignar; recibido ['Argos','Kira','Milo','Nyx','Toby','Luna'] vs esperado sin Argos; HTTP: 'Vista' seguía en la lista tras DELETE). Después: ambas en verde, sin debilitar.

## Mapa módulo -> acción (spec §5.2)
weights, bodyMeasurements -> WRITE_WEIGHTS_AND_MEASUREMENTS; vaccinations, dewormings -> WRITE_HEALTH_EVENTS; medicalVisits, customParameters -> WRITE_APPOINTMENTS_AND_PARAMETERS. 404 si no visible, 403 si visible sin la acción.

## Salidas
- household-policies.spec: 36/36 (sin rojos de permissions).
- use-cases.households.spec: 20 pasan, 1 falla (contradicción C1, abajo).
- households.api + roles.api + assignments-ownership: 52 pasan, 2 fallan (B2 audit_log -> T264, y contradicción C2).
- tests/unit: 76 fallan / 453 pasan (línea base 73): +4 nuevos que son contradicciones C1 y C3, -1 liquidado (household-policies).
- Suite completa: 165 fallos (base 161): 161 - 1 + 5 = 165; los 5 nuevos son C1, C2, C3 (x3).
- tsc --noEmit: 0 errores. verify-oracles: CUMPLE (81 archivos, 0 débiles). verify-traceability --feature 002 --task T248: 12/12 CUMPLE.

## CONTRADICCIONES prueba vs spec (NO modificadas; requieren decisión de Neo/Oracle)
- C1 use-cases.households.spec.ts "mascotas del hogar ... canEdit solo para el dueño": espera editPetBasics=false para Andrés sobre Luna (de María). Andrés es ADMIN de H (REQ-MIG-001) y la matriz REQ-RBAC-001 da S; household-policies.spec (con entrada002) exige true. Propuesta: en esa prueba, esperar true para Andrés sobre todas las mascotas; María [false x5, true].
- C2 roles.api.spec.ts:141 "el dueño anterior ya no escribe ... 403": Andrés queda ADMIN del hogar donde está asignada la mascota, la matriz da EDIT_PET_BASICS=S a Admin: PATCH -> 200. Propuesta: usar un hogar donde Andrés sea CAREGIVER/READER, o esperar 200.
- C3 use-cases.spec.ts (3 pruebas "Mis mascotas: solo las propias", filtro q/species, filtro por grupo): REQ-PET2-002 y el OpenAPI listMyPets exigen propias + visibles por asignación; Andrés ahora ve también Luna (Casa Vallejo, rol READER). Propuesta: añadir Luna (owner de María, colorToken null, editPetBasics true para Andrés ADMIN) a las esperas.

## Decisiones
- Rol de membresía legado: OWNER/isHouseholdOwner -> ADMIN, MEMBER -> READER (REQ-MIG-001), en toRoleMembership.
- access-policy.ts queda sin uso en casos de uso (solo sus pruebas); no se borró.
- Vista de hogar usa membresías del actor en todos sus hogares y todas las asignaciones de cada mascota para el myRole real.
- Dueños de mascotas asignadas que no son miembros ACTIVE del hogar no aparecen (la poda de T245 evita el caso).

## Fuera de alcance
Pruebas de backup, record-invariants, presentation (canEdit del cliente web, T284+), adaptadores; B2 audit_log (T264); H-T246-5 (422 sin declarar).


## C1-C3 adaptación (autorizada por Neo, solo pruebas; src intacto) · 2026-11-12
Ficheros: tests/unit/use-cases.households.spec.ts (C1), tests/integration/api/roles.api.spec.ts (C2), tests/unit/use-cases.spec.ts (C3). Corrección H-T248-3: el rol de Andrés sobre Luna es ADMIN (no READER); María es READER sobre las mascotas de Andrés.

### C1 diff
```diff
@@ -205,3 +216,3 @@ describe('hogares (src/application/use-cases/household-use-cases.ts)', () => {
 
-  it('[REQ-HOUSE-005] mascotas del hogar en el orden y con los colores de expectedHouseholdView; canEdit solo para el dueño; Carlos (INVITED) recibe 404 (EDGE-017)', async () => {
+  it('[REQ-HOUSE-005] mascotas del hogar en el orden y con los colores de expectedHouseholdView; editPetBasics: Andrés (ADMIN del hogar) true en las 6, María solo en su propia mascota; Carlos (INVITED) recibe 404 (EDGE-017)', async () => {
     const { deps } = createHarness();
@@ -223,2 +234,25 @@ describe('hogares (src/application/use-cases/household-use-cases.ts)', () => {
 
+  it.each(['READER', 'CAREGIVER'] as const)('[REQ-HOUSE-005][REQ-RBAC-001] un miembro %s del hogar recibe editPetBasics false en las 6 mascotas ajenas', async (role) => {
+    const state = canonicalState();
+    state.invitations = state.invitations.map((i) => (i.inviteeUsername === 'carlos_88' ? { ...i, roleOnJoin: role } : i));
+    const { deps } = createHarness(state);
+    await new RespondInvitationUseCase(deps).execute(CARLOS, H, 'ACCEPT');
+    const view = await new GetHouseholdPetsUseCase(deps).execute(CARLOS, H);
+    expect([view.pets.length, view.pets.map((p) => p.permissions.editPetBasics), view.pets.map((p) => p.myRole)]).toEqual([6, Array(6).fill(false), Array(6).fill(role)]);
+  });
+
+  it('[REQ-HOUSE2-004][INV-ACC2-001][ERR-PET-NOT-FOUND] H-T247-1: la vista del hogar lista SOLO las mascotas asignadas; tras desasignar Argos, María no la ve en el hogar y su ficha da 404 (coherente)', async () => {
+    const state = canonicalState();
+    const argos = ANDRES_PETS.find((p) => p.name === 'Argos')!;
+    state.assignments = state.assignments.filter((a) => !(a.petId === argos.id && a.householdId === H));
+    const { deps } = createHarness(state);
+    const names = async (userId: string) => (await new GetHouseholdPetsUseCase(deps).execute(userId, H)).pets.map((p) => p.profile.name);
+    expect([await names(MARIA), await names(ANDRES)]).toEqual([
+      ['Kira', 'Milo', 'Nyx', 'Toby', 'Luna'],
+      ['Kira', 'Milo', 'Nyx', 'Toby', 'Luna'],
+    ]);
+    expect(await outcome(new GetPetDashboardUseCase(deps).execute(MARIA, argos.id))).toBe('ERR-PET-NOT-FOUND@petId');
+    expect(await outcome(new GetPetDashboardUseCase(deps).execute(ANDRES, argos.id))).toBe('OK');
+  });
+
   it('[REQ-PET-005][REQ-HOUSE-005] DEUDA-UI-FILTRO-001: el filtro del hogar conserva orden y colores; un no miembro recibe 404 aunque el filtro no deje nada', async () => {
```
### C2 diff
```diff
```
### C3 diff
```diff
@@ -292,3 +291,11 @@ describe('mascotas (src/application/use-cases/pet-use-cases.ts)', () => {
     const expectedOwner = edge('EDGE-030-').expectedOwner;
-    expect(cards.map((c) => [c.profile.name, c.owner, c.permissions.editPetBasics])).toEqual(['Argos', 'Kira', 'Milo', 'Nyx', 'Toby'].map((n) => [n, expectedOwner, true]));
+    const mariaOwner = { userId: MARIA, displayName: 'María', colorToken: null };
+    expect(cards.map((c) => [c.profile.name, c.owner, c.myRole, c.permissions.editPetBasics])).toEqual([
+      ['Argos', expectedOwner, 'OWNER', true],
+      ['Kira', expectedOwner, 'OWNER', true],
+      ['Luna', mariaOwner, 'ADMIN', true],
+      ['Milo', expectedOwner, 'OWNER', true],
+      ['Nyx', expectedOwner, 'OWNER', true],
+      ['Toby', expectedOwner, 'OWNER', true],
+    ]);
     const argos = cards[0]!;
@@ -299,4 +306,11 @@ describe('mascotas (src/application/use-cases/pet-use-cases.ts)', () => {
     ]);
-    expect(cards.map((c) => [c.alertsSummary.totalActiveAlerts, c.latestWeightKg])).toEqual([[1, 32.85], [0, null], [0, null], [1, null], [0, null]]);
-    expect((await new ListMyPetsUseCase(deps).execute(MARIA)).map((c) => c.profile.id)).toEqual([LUNA.id]);
+    expect(cards.map((c) => [c.alertsSummary.totalActiveAlerts, c.latestWeightKg])).toEqual([[1, 32.85], [0, null], [0, null], [0, null], [1, null], [0, null]]);
+    expect((await new ListMyPetsUseCase(deps).execute(MARIA)).map((c) => [c.profile.name, c.myRole, c.permissions.editPetBasics])).toEqual([
+      ['Argos', 'READER', false],
+      ['Kira', 'READER', false],
+      ['Luna', 'OWNER', true],
+      ['Milo', 'READER', false],
+      ['Nyx', 'READER', false],
+      ['Toby', 'READER', false],
+    ]);
   });
@@ -312,3 +326,3 @@ describe('mascotas (src/application/use-cases/pet-use-cases.ts)', () => {
       ['Ñandú'],
-      ['Milo', 'Nyx'],
+      ['Luna', 'Milo', 'Nyx'],
       ['Kira'],
@@ -383,5 +397,5 @@ describe('especies, microchip y peso por especie en los casos de uso (REQ-PET2-0
       ['Nube', 'Piolín'],
-      ['Milo', 'Nyx'],
+      ['Luna', 'Milo', 'Nyx'],
       ['Argos', 'Kira', 'Toby'],
-      7,
+      8,
       ['Piolín'],
```
Nota C3: la lista "Mis mascotas" de María también incluye, por asignación, las 5 mascotas de Andrés (rol READER, editPetBasics false) y su propia Luna (OWNER, true); se fijó con valores literales en orden alfabético (la expectativa anterior [LUNA.id] contradecía igualmente REQ-PET2-002). Se retiró el import LUNA, ya sin uso.

### Salidas literales
- vitest use-cases.households.spec.ts: Test Files 1 passed (1); Tests 23 passed (23)
- vitest use-cases.spec.ts: Test Files 1 passed (1); Tests 36 passed (36)
- vitest roles.api.spec.ts: Test Files 1 passed (1); Tests 15 passed (15)
- vitest households.api.spec.ts: Test Files 1 passed (1); Tests 29 passed (29)
- vitest assignments-ownership.api.spec.ts: Tests 1 failed | 10 passed (11); único fallo B2 "no such table: audit_log" (T264)
- vitest tests/unit: Test Files 7 failed | 18 passed (25); Tests 72 failed | 459 passed (531). Los fallos están en backup-import-atomicity, backup-use-cases (49), infrastructure-adapters, presentation/components, presentation/validation, presentation/view-model, record-invariants; ninguno en use-cases*.spec.ts, access-policy ni household-policies (fuera de C1-C3; no tocados).
- npx tsc --noEmit: exit 0, sin errores
- verify-oracles.sh: Archivos analizados: 81; oráculos débiles: 0; Resultado: CUMPLE
