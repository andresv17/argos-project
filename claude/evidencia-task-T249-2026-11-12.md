# Evidencia T249 [US7] · Keymaker · 2026-11-12 (sin commit; tasks.md sin tocar)

## Parte 0
tests/unit/use-cases.spec.ts:288 titulo -> "Mis mascotas: propias y visibles por asignación, por nombre, con owner sin color ..." (solo texto del titulo).

## Archivos
- src/domain/account/account-deletion-guards.ts: nueva `planPetAssignmentsForDeletion` (B5 bloqueantes + B6 asignaciones ajenas en hogares en cascada), tipo local `AssignmentRef` (dominio no importa application).
- src/application/use-cases/account-use-cases.ts: en la fase B, dentro de la transaccion, relee mascotas propias, asignaciones (por mascota y por hogar en cascada) y membresias de esos hogares; B5 -> ERR-ACCOUNT-OWNS-SHARED-PETS; B6 -> ERR-INTERNAL-UNEXPECTED; B9 borra explicitamente asignaciones (b: por mascota, e: por hogar en cascada). B4 (hogar compartido) ya existia y relee en la transaccion.
- tests/unit/account-deletion.spec.ts: 9 pruebas nuevas (+ guarda unitaria) y helper `joinBetweenPhases` (altas simultaneas entre fase A y B).

## Prueba roja (antes de implementar)
`npx vitest run tests/unit/account-deletion.spec.ts`: 3 fallidas / 21 pasan, todas por la causa correcta: `expected 'OK' to be 'ERR-ACCOUNT-OWNS-SHARED-PETS'` (la eliminacion procedia aunque la mascota estaba asignada a un hogar con otro ACTIVE): (1) Bruno con mascota asignada al hogar de Ana, (2) asignacion a hogar ajeno con otro ACTIVE, (3) carrera: Ana pasa a ACTIVE entre fase A y B. La carrera de hogar (B4) ya pasaba: el codigo ya releia en la transaccion; la prueba la fija.
Despues: 26/26 verdes, sin debilitar aserciones.

## Cobertura nueva
bloqueo PETS con rollback (snapshot identico, token vigente, sin auditoria); hogar ajeno; orden de errores B4 antes de B5; asignacion a hogar de unico ACTIVE no bloquea y se borra en cascada; LEFT no bloquea y se borran asignaciones; carrera PETS; carrera HOUSEHOLD; B6 aborta con ERR-INTERNAL-UNEXPECTED sin cambios; guarda pura.

## Salidas literales
- account-deletion.spec: Tests 26 passed (26)
- use-cases.spec: Tests 36 passed (36)
- tests/unit: Test Files 7 failed | 18 passed (25); Tests 72 failed | 468 passed (540) (base 72, sin fallos nuevos; +9 pruebas verdes)
- tests/integration: Tests 75 failed | 641 passed (716). Los fallos de account-deletion.api y account.api (22) son `SqliteError: CHECK constraint failed: status IN ('ACTIVE', 'LEFT', 'REMOVED')` (esquema SQLite 001 sin INVITED, fixtures 002) y `Cannot read properties of undefined (reading 'close')`: preexistentes, no tocan este cambio. No hay baseline numerico limpio en esta sesion (git stash arrastra T245-T248); NO es B2 audit_log en este caso, es CHECK de status/T264 por esquema.
- tsc --noEmit: 0 errores
- verify-oracles: Archivos analizados: 81; oraculos debiles: 0; Resultado: CUMPLE
- verify-traceability --feature 002 --task T249: IDs trazados 4/4; Violaciones de pureza: 0; Resultado: CUMPLE

## Decisiones
- B5 compara contra TODAS las membresias ACTIVE del hogar asignado, distintas del usuario (incluye hogares ajenos donde no es miembro).
- Las asignaciones se borran de forma explicita aunque FK/ON DELETE CASCADE ya lo haria (STATE B9 b, e).
- B6 reutiliza ERR-INTERNAL-UNEXPECTED (la maquina lo fija asi).

## Fuera de alcance
Auditoria B7/B8 (T265), reasignacion assigned_by_user_id, fallos de integracion SQLite preexistentes, B2 audit_log (T264). Sin contradiccion spec/contrato.

## H-T249-1 (Keymaker, 2026-11-12): 22 fallos de integracion de cuenta por sembrado INVITED
**Causa real**: no eran sqlite-harness.ts ni application-harness.ts (ya separaban INVITED hacia household_invitations). El sembrado erroneo estaba en `tests/fixtures/identity-fixtures.ts` (`identityState()`), que metia la fila `row(4, ..., CARLA, 'MEMBER', 'INVITED', ELENA)` en `state.memberships`; `seedSqlite` la guardaba con `saveMembership` y la migracion 0004 la rechaza (CHECK status IN ACTIVE/LEFT/REMOVED). src, esquema y aserciones intactos.

**Antes** (`npx vitest run` account-deletion.api + account.api): `Test Files 2 failed (2)`, `Tests 22 failed (22)`; errores `CHECK constraint failed: status IN ('ACTIVE', 'LEFT', 'REMOVED')` y `Cannot read properties of undefined (reading 'close')`.

**Diff** (tests/fixtures/identity-fixtures.ts, identityState):
```diff
-  state.memberships = structuredClone(IDENTITY_MEMBERSHIPS);
+  // H-T249-1 (T246): household_members no guarda INVITED; la invitacion de Carla vive en household_invitations con roleOnJoin CAREGIVER.
+  state.memberships = structuredClone(IDENTITY_MEMBERSHIPS.filter((m) => m.status !== 'INVITED'));
+  state.invitations = IDENTITY_MEMBERSHIPS.filter((m) => m.status === 'INVITED').map((m) => ({
+    invitationId: m.membershipId, householdId: m.householdId, inviteeUsername: USERNAMES[m.userId]!, inviteeUserId: m.userId,
+    roleOnJoin: 'CAREGIVER' as const, invitedByUserId: m.invitedByUserId!, status: 'INVITED' as const, createdAt: m.invitedAt!, respondedAt: null,
+  }));
```
(IDENTITY_MEMBERSHIPS se conserva intacta: la usa account-deletion.spec.ts en pruebas de politica pura.)

**Despues**: `Test Files 2 passed (2)`, `Tests 22 passed (22)`. tests/unit/account-deletion.spec.ts 26/26. `npx tsc --noEmit` 0 errores. verify-oracles.sh: `Archivos analizados: 81; oraculos debiles: 0 / Resultado: CUMPLE`.

**tests/integration completo**: `Test Files 9 failed | 13 passed (22)`, `Tests 35 failed | 681 passed (716)` (antes 75 fallos tras T249). Restantes: backup-atomicity (11), pets-records (6), canonical-fixtures (4), sqlite-backup-import (4), generated-contracts (3), openapi-conformance (2), assignments-ownership (1), web-client (1) = documentados (B2 audit_log/OpenAPI/backup). **Hallazgo H-T249-2 (no corregido, fuera de alcance)**: 3 fallos CHECK status restantes en tests/integration/persistence/sqlite-repositories.spec.ts, via tests/fixtures/repository-contract-suite.ts:232 (saveMembership con INVITED directo: pruebas "[INV-ARCH-005] hogares", "[REQ-ACC-002] deleteMembershipsOfUser", "[INV-HOUSE-003] indice unico INVITED"). Son pruebas de comportamiento 001 que asumen INVITED en household_members; requieren decision/adaptacion (patron C1-C3) y no un cambio de sembrado.

## H-T249-2 (Keymaker, 2026-11-12) - autorizado por Neo (Nivel 2)

**Antes** (`npx vitest run tests/integration/persistence/sqlite-repositories.spec.ts`): `Tests 3 failed | 34 passed (37)`. Causa en las 3: `SqliteError: CHECK constraint failed: status IN ('ACTIVE', 'LEFT', 'REMOVED')` en `saveMembership` (migracion 0004: household_members ya no admite INVITED/DECLINED/CANCELLED).

**Adaptaciones** (solo tests; sin cambios en src, esquema ni migraciones):
1. `[INV-ARCH-005] hogares...` (repository-contract-suite.ts ~232): Carlos (INVITED en fixture 001) se guarda ACTIVE y luego pasa a LEFT (antes DECLINED). Oraculo: `carlos: ['LEFT']` (antes `['DECLINED']`); ofHousehold/ofAndres/ofBoth intactos (mismos membershipId).
2. `[REQ-ACC-002] deleteMembershipsOfUser...` (~395): se siembran solo las membresias no INVITED (`MEMBERSHIPS.filter(x => x.status !== 'INVITED')`); la INVITED de Carlos vive en household_invitations. Aserciones (`>=4`, `toBe(1)`, `[0,false]`) intactas.
3. `[INV-HOUSE-003] indice unico...` (sqlite-repositories.spec.ts ~288): titulo ahora "segunda membresia ACTIVE del mismo par" (mismo ID); duplicate pasa a status ACTIVE; oraculo `['SQLITE_CONSTRAINT_UNIQUE', [active:LEFT, duplicate:ACTIVE].sort()]` (antes `:INVITED`). La unicidad de INVITED abierta la cubre ya la prueba REQ-HOUSE2-001 (household_invitations_one_open).

Sin toBeDefined/toBeTruthy/toBeFalsy/any/skip/todo/only/toContain ni solo longitudes anadidos.

**Despues**: sqlite-repositories.spec `Tests 37 passed (37)`; account-deletion.api + account.api `22 passed (22)`; unit account-deletion `26 passed (26)`; `npx tsc --noEmit` exit 0; verify-oracles.sh `Archivos analizados: 81; oraculos debiles: 0 / CUMPLE`. tests/integration: 35 -> 32 fallos (restantes documentados B2). tests/unit: 72 fallos (= base).
