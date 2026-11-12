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

## H-T250-1 y H-T250-2 (Keymaker, 2026-11-12) — PARCIAL, BLOQUEADO

Antes: e2e household+counter 15/16 (falla household.spec.ts:310: invitación del ADMIN 403 y el Eliminar del ADMIN).
Después de las dos correcciones autorizadas: tsc 0 errores; unit 59/59; integración 44/44; verify-oracles CUMPLE; verify-traceability CUMPLE; e2e 15/16 (sigue fallando :310, ahora SOLO por la invitación 403; la aserción de Eliminar ya pasa).
Causa: src/domain/households/household-policies.ts:270 inviteMember() llama requireOwner (segundo chequeo de propietario, dentro de la política de dominio). Ese archivo está fuera de la autorización de Neo; además tests/unit/household-policies.spec.ts "solo el OWNER invita" documenta el comportamiento (sus aserciones MEMBER 403/404 seguirían válidas con requireManager, pero no lo toqué). Propuesta H-T250-3: cambiar requireOwner por requireManager en inviteMember del dominio (y ajustar docstring/título de esa prueba) con autorización de Neo.

Diff aplicado (sin commit):
```diff
diff --git a/src/application/use-cases/household-use-cases.ts b/src/application/use-cases/household-use-cases.ts
index f2f9708..775317c 100644
--- a/src/application/use-cases/household-use-cases.ts
+++ b/src/application/use-cases/household-use-cases.ts
@@ -5,7 +5,7 @@
  * - Visibilidad: sin membresía ACTIVE, ERR-HOUSE-NOT-FOUND (INV-HOUSE-004,).
  * - Las invitaciones viven solo en household_invitations (T246, resolución de Neo): household_members no guarda filas
  *   INVITED, y aceptar, rechazar, cancelar y listar leen y escriben ahí; al aceptar nace la membresía ACTIVE con roleOnJoin.
- * - InviteMemberUseCase comprueba primero que el actor sea OWNER (T238 PENDIENTE: ADMIN), después valida la entrada
+ * - InviteMemberUseCase comprueba primero que el actor sea gestor (OWNER o ADMIN, requireManager; REQ-HOUSE2-001), después valida la entrada
  *   (el username no se normaliza), aplica el límite de frecuencia y responde siempre 202 {received:true} (REQ-HOUSE2-001).
  * - ListMyHouseholdsUseCase ordena por createdAt del hogar y luego id (la spec no fija el orden).
  *
@@ -168,7 +168,7 @@ export class CreateHouseholdUseCase {
  * con el `roleOnJoin` de la entrada; household_members no recibe filas INVITED.
  * El límite de frecuencia (INVITE_MAX_PER_WINDOW por INVITE_WINDOW_MINUTES y actor) se aplica después de la
  * autorización y de la validación, y su rechazo (ERR-RATE-LIMITED) es igual para usernames reales e inexistentes.
- * T238 PENDIENTE: autorización de ADMIN para invitar.
+ * Autorización: OWNER o ADMIN activo pueden invitar (requireManager; MANAGE_HOUSEHOLD_MEMBERS de REQ-RBAC-001).
  * @implements REQ-HOUSE2-001, INV-HOUSE-003, INV-AUTH-006, ERR-RATE-LIMITED
  */
 export class InviteMemberUseCase {
@@ -177,7 +177,7 @@ export class InviteMemberUseCase {
   async execute(userId: string, householdId: string, input: unknown): Promise<InviteAccepted> {
     return this.deps.uow.runInTransaction(async (repositories) => {
       const memberships = await repositories.households.listMemberships(householdId);
-      requireOwner(memberships, householdId, userId);
+      requireManager(memberships, householdId, userId);
       const { username, roleOnJoin } = parseInviteMemberInput(input);
       const now = this.deps.clock.nowIsoTimestamp();
       if (!(await this.deps.rateLimiter.tryConsume(repositories, 'INVITE', userId, now))) throw new DomainError('ERR-RATE-LIMITED');
diff --git a/src/presentation/web/components/PetDashboard.tsx b/src/presentation/web/components/PetDashboard.tsx
index b1d6d65..091223e 100644
--- a/src/presentation/web/components/PetDashboard.tsx
+++ b/src/presentation/web/components/PetDashboard.tsx
@@ -195,14 +195,18 @@ export function PetDashboard({ dashboard, activeTab, onTabChange, onAddRecord, o
           <p className="text-sm text-slate-700">Alertas: {alertCounters(dashboard.alertsSummary)}</p>
           <OwnerBadge owner={dashboard.owner} canEdit={dashboard.permissions.editPetBasics} />
         </div>
-        {actions.canEdit ? (
+        {actions.canEdit || dashboard.permissions.deletePet ? (
           <div className="flex gap-2">
-            <Button variant="secondary" onClick={onEdit}>
-              Editar
-            </Button>
-            <Button variant="danger" onClick={onDelete}>
-              Eliminar
-            </Button>
+            {actions.canEdit ? (
+              <Button variant="secondary" onClick={onEdit}>
+                Editar
+              </Button>
+            ) : null}
+            {dashboard.permissions.deletePet ? (
+              <Button variant="danger" onClick={onDelete}>
+                Eliminar
+              </Button>
+            ) : null}
           </div>
         ) : null}
       </header>
```

## H-T250-3 — Dominio: inviteMember usa requireManager (autorizado por Neo, Nivel 2)

Cambio: src/domain/households/household-policies.ts (inviteMember: requireOwner -> requireManager; docstrings) y tests/unit/household-policies.spec.ts (titulo + nueva prueba de ADMIN que invita).

```diff
diff --git a/src/domain/households/household-policies.ts b/src/domain/households/household-policies.ts
index 799744b..b48e670 100644
--- a/src/domain/households/household-policies.ts
+++ b/src/domain/households/household-policies.ts
@@ -1,7 +1,7 @@
 /**
  * Políticas puras de hogares y membresías.
  * - REQ-HOUSE-001 / INV-HOUSE-001: el creador nace OWNER ACTIVE y es el único OWNER.
- * - REQ-HOUSE2-001 / INV-HOUSE-002 / INV-HOUSE-003: solo el OWNER invita (T238 PENDIENTE: ADMIN); la invitación es
+ * - REQ-HOUSE2-001 / INV-HOUSE-002 / INV-HOUSE-003: el OWNER o un ADMIN invita (REQ-RBAC-001); la invitación es
  *   uniforme: si el username no existe o el par ya tiene una membresía INVITED o ACTIVE no hay efecto y no se
  *   distingue (INV-AUTH-006); a lo sumo una membresía INVITED o ACTIVE por par (householdId, userId). La
  *   re-invitación crea una fila nueva y hereda firstJoinedAt del par (D-05).
@@ -258,7 +258,7 @@ export interface InviteCommand {
 }
 
 /**
- * REQ-HOUSE2-001: el OWNER invita a un usuario existente. Orden de comprobación: OWNER (INV-HOUSE-002), después la
+ * REQ-HOUSE2-001 / REQ-RBAC-001: el OWNER o un ADMIN invita a un usuario existente. Orden de comprobación: gestor OWNER o ADMIN (INV-HOUSE-002), después la
  * invitación es uniforme: devuelve null (sin efecto) si el usuario no existe o si ya hay una fila INVITED o ACTIVE del
  * par (INV-HOUSE-003); la 001 respondía 404 y 409, que enumeraban cuentas y membresías y están retirados. Si procede,
  * crea una fila nueva en INVITED; desde DECLINED, CANCELLED, LEFT o REMOVED es el evento INVITE y hereda
@@ -267,7 +267,7 @@ export interface InviteCommand {
  */
 export function inviteMember(command: InviteCommand): LegacyHouseholdMember | null {
   const { memberships, householdId, actorUserId, invitee, nowIsoTimestamp } = command;
-  requireOwner(memberships, householdId, actorUserId);
+  requireManager(memberships, householdId, actorUserId);
   if (invitee === null || openRowOf(memberships, householdId, invitee.id) !== undefined) return null;
   return {
     membershipId: command.membershipId,
diff --git a/tests/unit/household-policies.spec.ts b/tests/unit/household-policies.spec.ts
index b3e7cc2..563fe73 100644
--- a/tests/unit/household-policies.spec.ts
+++ b/tests/unit/household-policies.spec.ts
@@ -189,7 +189,7 @@ describe('invitar (REQ-HOUSE2-001, INV-HOUSE-002, INV-HOUSE-003)', () => {
     expect(invite(andres.id, carlos)).toEqual(invite(andres.id, null));
   });
 
-  it('[INV-HOUSE-002][ERR-HOUSE-NOT-FOUND] solo el OWNER invita: MEMBER recibe 403; INVITED o ajeno, 404', () => {
+  it('[INV-HOUSE-002][ERR-HOUSE-NOT-FOUND] solo el OWNER o ADMIN invita: MEMBER recibe 403; INVITED o ajeno, 404', () => {
     expect(codeOf(() => invite(maria.id, lucia))).toEqual(['ERR-ACC-FORBIDDEN', 403]);
     expect([catchDomainError(() => invite(maria.id, lucia)).field, catchDomainError(() => invite(carlos.id, lucia)).field]).toEqual(['householdId', 'householdId']);
     const otherHouse = { ...members[0]!, membershipId: mid(60), householdId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb02', userId: lucia.id };
@@ -199,6 +199,12 @@ describe('invitar (REQ-HOUSE2-001, INV-HOUSE-002, INV-HOUSE-003)', () => {
     expect(requireOwner(members, H1, andres.id)).toBe(members[0]);
   });
 
+  it('[REQ-HOUSE2-001][REQ-RBAC-001][INV-HOUSE-002] un ADMIN activo no propietario puede invitar: fila nueva INVITED invitada por él', () => {
+    const adminRows = members.map((m) => (m.userId === maria.id ? { ...m, role: 'ADMIN' as const } : m));
+    const row = invite(maria.id, lucia, adminRows);
+    expect([row?.status, row?.userId, row?.invitedByUserId]).toEqual(['INVITED', lucia.id, maria.id]);
+  });
+
   it('[REQ-HOUSE2-001][INV-HOUSE-005] re-invitar a María crea una fila nueva y conserva firstJoinedAt y su color (EDGE-031)', () => {
     const steps = edge('EDGE-031');
     const removed = removeOrLeave(members, H1, andres.id, maria.id, steps.steps[0].at);
```

Compuertas: tsc --noEmit sin salida (cero errores); vitest unit 2 archivos 60/60; vitest integration households+roles 44/44; playwright household + household-counter 16/16; verify-oracles: oraculos debiles 0, CUMPLE; verify-traceability --feature 002 --task T250: IDs 3/3, pureza 0, CUMPLE.
