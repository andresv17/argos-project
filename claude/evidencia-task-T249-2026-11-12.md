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
