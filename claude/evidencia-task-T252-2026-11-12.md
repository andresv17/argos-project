
## H-T252 (Keymaker, 2026-11-12, autorizado por Neo, solo pruebas y NOT_YET_SERVED)

Antes: households.property 1 fallo (contraejemplo [INVITE]); access-control 5 fallos; session-csrf 1 fallo (lista NOT_YET_SERVED).
Despues: households.property 3/3; session-csrf 14/14; household-policies 37/37; access-control 11/13 (quedan 2 fallos ajenos a H-T252: exportBackup responde 404 no declarado en OpenAPI, ruta no servida de la rebanada 5, tests INV-ACC-001/INV-ACC-002). tsc 0; verify-oracles CUMPLE; verify-traceability T242 CUMPLE.
Hallazgos extra resueltos dentro del alcance: (a) la proyeccion de membresia debe aportar username/displayName/isHouseholdOwner y excluir campos de invitacion para el esquema HouseholdMember (additionalProperties false); filas con joinedAt === null se tratan como invitacion. (b) GET /api/pets/{id} no existe en OpenAPI 002: se lee el nombre del dashboard. (c) las celdas deleteRecord (404 del enrutador sin codigo) se apartan del 403 y se afirman explicitamente por etiqueta.

```diff
diff --git a/tests/property/households.property.spec.ts b/tests/property/households.property.spec.ts
index 1fdead5..315c07b 100644
--- a/tests/property/households.property.spec.ts
+++ b/tests/property/households.property.spec.ts
@@ -7,6 +7,7 @@ import {
   createHousehold,
   declineInvitation,
   inviteMember,
+  isLegacyHouseholdMember,
   isOwnerRow,
   ownerColorTokens,
   removeOrLeave,
@@ -91,7 +92,29 @@ describe('propiedades de hogares', () => {
           }
           expect(thrown).toBeNull();
           if (result === null) return; // invitación uniforme sin efecto (usuario inexistente o par ya abierto)
-          expect(validateHouseholdMember(result)).toBe(true);
+          // H-T252-1: en la 002 la invitación vive en household_invitations, no en household_members. La fila INVITED
+          // (o su cierre DECLINED/REMOVED sin haber ingresado, joinedAt === null) es una invitación (LegacyHouseholdMember con invitedAt/invitedByUserId); solo las filas
+          // de membresía (ACTIVE/LEFT/REMOVED) deben cumplir el esquema generado HouseholdMember.
+          if (result.joinedAt === null) {
+            expect([isLegacyHouseholdMember(result), result.invitedAt !== null && result.invitedAt !== undefined, result.invitedByUserId !== null && result.invitedByUserId !== undefined]).toEqual([true, true, true]);
+          } else {
+            // La fila de dominio no porta username/displayName (los aporta el modelo de lectura) ni los campos de invitación
+            // (additionalProperties: false); se valida su proyección de membresía con valores deterministas.
+            const membership = {
+              membershipId: result.membershipId,
+              householdId: result.householdId,
+              userId: result.userId,
+              username: `u${result.userId.slice(-2)}`,
+              displayName: `Usuario ${result.userId.slice(-2)}`,
+              role: result.role,
+              isHouseholdOwner: isOwnerRow(result),
+              status: result.status,
+              joinedAt: result.joinedAt,
+              firstJoinedAt: result.firstJoinedAt,
+              updatedAt: result.updatedAt,
+            };
+            expect(validateHouseholdMember(membership)).toBe(true);
+          }
           rows = rows.some((r) => r.membershipId === result!.membershipId)
             ? rows.map((r) => (r.membershipId === result!.membershipId ? result! : r))
             : [...rows, result];
diff --git a/tests/security/exploits/access-control.security.spec.ts b/tests/security/exploits/access-control.security.spec.ts
index d6acf3a..5cdd25e 100644
--- a/tests/security/exploits/access-control.security.spec.ts
+++ b/tests/security/exploits/access-control.security.spec.ts
@@ -155,7 +155,7 @@ describe('hogares ajenos (tests/security/exploits)', () => {
     const asMember = await api.call('GET', `/api/households/${H1}`, { cookie: await api.login('maria.v') });
     const asOwner = await api.call('GET', `/api/households/${H1}`, { cookie: await api.login('andres') });
     const statuses = (r: ApiResponse) => (r.json as { members: Array<{ membership: { status: string } }> }).members.map((m) => m.membership.status);
-    expect([statuses(asMember), statuses(asOwner), asMember.text.includes('carlos_88')]).toEqual([['ACTIVE', 'ACTIVE'], ['ACTIVE', 'ACTIVE', 'INVITED'], false]);
+    expect([statuses(asMember), statuses(asOwner), asMember.text.includes('carlos_88')]).toEqual([['ACTIVE', 'ACTIVE'], ['ACTIVE', 'ACTIVE'], false]);
   });
 });
 
@@ -217,16 +217,33 @@ describe('acceso por rol 002: cada celda «No» de la matriz y hogares ajenos (T
     for (const [role, rows] of Object.entries(cells)) {
       const cookie = await api.login(ROLE_USER[role as keyof typeof ROLE_USER]);
       for (const [label, method, url, body] of rows) {
-        const r = await api.call(method, url, { cookie, body });
+        // H-T252-2a: deleteRecord pertenece a la rebanada 4 (ruta aún no servida con problem+json en esta rebanada);
+        // se omite solo la validación OpenAPI/problem+json de esa ruta, el 403 y el código de error se siguen exigiendo.
+        const unservedSlice4 = url.includes('/records/') && method === 'DELETE';
+        const r = await api.call(method, url, { cookie, body, ...(unservedSlice4 ? { contract: false } : {}) });
         results.push([role, label, problemOf(r)]);
       }
     }
-    const profile = await api.call('GET', `/api/pets/${pet}`, { cookie: await api.login('andres') });
+    // H-T252-2b': GET /api/pets/{petId} no existe en el OpenAPI 002; el nombre se lee del dashboard (profile.name).
+    const profile = await api.call('GET', `/api/pets/${pet}/dashboard`, { cookie: await api.login('andres') });
+    // H-T252-2a: deleteRecord pertenece a la rebanada 4 y su ruta aún no está servida (404 del enrutador, sin código de error ni
+    // problem+json). Esas dos celdas se apartan de la exigencia 403 y se afirman explícitamente; las demás deben ser 403 ERR-ACC-FORBIDDEN.
+    const isSlice4Unserved = (row: unknown) => {
+      const [, label, outcome] = row as [string, string, { status: number; code: string | undefined }];
+      return (label === 'eliminar evento sanitario' || label === 'eliminar otro registro') && outcome.status === 404 && outcome.code === undefined;
+    };
+    const unservedSlice4 = results.filter(isSlice4Unserved).map((row) => (row as [string, string])[1]);
     const notForbidden = results.filter((row) => {
+      if (isSlice4Unserved(row)) return false;
       const [, , outcome] = row as [string, string, { status: number; code: string }];
       return outcome.status !== 403 || outcome.code !== 'ERR-ACC-FORBIDDEN';
     });
-    expect([results.length, notForbidden, (profile.json as { name: string }).name]).toEqual([19, [], 'Nala']);
+    expect([results.length, unservedSlice4, notForbidden, (profile.json as { profile: { name: string } }).profile.name]).toEqual([
+      19,
+      ['eliminar evento sanitario', 'eliminar otro registro'],
+      [],
+      'Nala',
+    ]);
   });
 
   it('[REQ-RBAC-001] control positivo: el Cuidador registra un peso (201), el Administrador edita el perfil (200) y el Lector lee la ficha (200)', async () => {
@@ -254,8 +271,9 @@ describe('acceso por rol 002: cada celda «No» de la matriz y hogares ajenos (T
   it('[INV-ACC2-002][INV-HOUSE2-001] ningún rol edita un hogar ajeno: carlos_88 (CAREGIVER en otro hogar) no retira ni cambia a nadie de H1 y la base no cambia', async () => {
     api = await createApi();
     await roleScenario();
-    const before = api.dump();
     const cookie = await api.login('carlos_88');
+    // H-T252-2b: el volcado «before» se toma DESPUÉS del login (el login escribe la sesión de Carlos).
+    const before = api.dump();
     const changed = await api.call('PATCH', `/api/households/${H1}/members/${USERS_BY_NAME.maria}`, { cookie, body: { role: 'READER' } });
     const removed = await api.call('DELETE', `/api/households/${H1}/members/${USERS_BY_NAME.maria}`, { cookie });
     const deleted = await api.call('DELETE', `/api/households/${H1}`, { cookie });
diff --git a/tests/security/exploits/session-csrf.security.spec.ts b/tests/security/exploits/session-csrf.security.spec.ts
index 1704320..1bcfb0f 100644
--- a/tests/security/exploits/session-csrf.security.spec.ts
+++ b/tests/security/exploits/session-csrf.security.spec.ts
@@ -34,16 +34,10 @@ const MUTATING_ALL = SECURED_OPERATIONS.filter((op) => op.requiresCsrf);
  * las suyas de esta lista; la compuerta final exige la lista vacía (los barridos cubren las 37 protegidas y las 32 mutantes).
  */
 const NOT_YET_SERVED = [
-  'assignPetToHousehold',
   'cancelInvitation',
-  'changeMemberRole',
   'deleteRecord',
   'exportBackup',
-  'listPetAssignments',
   'previewBackupImport',
-  'transferHouseholdOwnership',
-  'transferPetOwnership',
-  'unassignPetFromHousehold',
   'updateRecord',
 ];
 /** Operaciones protegidas / mutantes que la API ya sirve. */
```

## Decisiones de Neo (T252)
Autorización Nivel 2 de Neo (Andrés Vallejo): (1) ratificada H-T252-2a (excepción temporal autocaducable deleteRecord del Cuidador) y el cambio a GET /dashboard; (2) it.skip excepcional en exactamente 2 pruebas exportBackup/importBackup.

Diff (tests/security/exploits/access-control.security.spec.ts), solo comentarios y 2 títulos/it.skip, cuerpos y aserciones intactos:
- `it(` -> `it.skip('[REBANADA-5][REQ-BACKUP2-001] POST /api/backup/export pendiente de implementación en T271 — [INV-ACC-001][INV-AUTH-003] la exportación ...` (línea ~86), con comentario de autorización de Neo encima.
- Idem para `[INV-ACC-002] importar el respaldo ...` (línea ~100).
- Comentario ~línea 220 reescrito: las celdas «eliminar evento sanitario» y «eliminar otro registro» del Cuidador aceptan 404 sin código mientras la Rebanada 4 no sirva la ruta; la excepción DEBE retirarse entonces; GET /api/pets/{id} sustituido por /dashboard.

Salidas literales:
- access-control: `Tests  11 passed | 2 skipped (13)` (13 tests | 2 skipped), 0 failed.
- property + session-csrf + household-policies: `Test Files  3 passed (3)  Tests  54 passed (54)`.
- `npx tsc --noEmit`: sin salida (cero errores).
- verify-traceability --feature 002 --task T242: `IDs trazados: 3/3 ... Resultado: CUMPLE`.
- verify-oracles.sh: **FALLA** (no se oculta). `[ORACLE FAIL] test deshabilitado o exclusivo (.skip, .todo, .only): access-control.security.spec.ts:86` y `:100`; `Archivos analizados: 83; oráculos débiles: 2; Resultado: FALLA`. El verificador marca los 2 it.skip autorizados como oráculo débil. Sin commit por este motivo; requiere decisión de Neo (excepción en el verificador o retirar el skip).
