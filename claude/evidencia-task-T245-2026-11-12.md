# Evidencia T245 — Roles, propietario único, poda y transferencia (Keymaker)

Fecha: 2026-11-12. Rama: 002-plataforma-v21. HEAD: 9af6f0b (sin commit nuevo; cambios sin commit a la espera de /oracle).

## Archivos tocados
- `src/domain/households/household-policies.ts` (añadido: `applyMembershipEvent`, `changeMemberRole`, `transferHouseholdOwnership`, `pruneAssignmentsOf`; sin cambios en funciones existentes).
- `src/domain/pet/ownership-transfer.ts` (nuevo: `transferPetOwnership`).
- `tests/unit/ownership-transfer.spec.ts` (nuevo, 4 pruebas).

## Compuertas (salidas reales)
- `npx vitest run tests/unit/household-policies.spec.ts`: 32/35 pasan. Las 12 pruebas de roles de T237 pasan ahora.
  Fallan 3, fuera de T245: crear hogar con `role: ADMIN` (T246), `roleOnJoin` en invitación (T247), `permissions` en `householdPets` (T248).
- `npx vitest run tests/unit/ownership-transfer.spec.ts`: 4/4 pasan.
- `npx tsc --noEmit`: solo 2 errores, ambos en `tests/unit/household-policies.spec.ts` líneas 351 y 361 (`permissions`, T248). Ningún error en `src/`.
- `bash scripts/verify-traceability.sh --feature 002 --task T245`: CUMPLE, 6/6 IDs trazados, pureza 0 violaciones.
- `bash scripts/verify-oracles.sh`: CUMPLE, 80 archivos, 0 oráculos débiles.
- `npx vitest run tests/unit`: 441 pasan / 84 fallan. Fallos en backup (T279), use-cases.households (T246), record-invariants, presentation (T284) e infrastructure-adapters (timeout de scrypt, deuda ya registrada). No se hizo línea base contra HEAD en este turno.

## Decisiones de implementación (para revisión de Oracle)
1. Propietario siempre ADMIN con `isHouseholdOwner`; un no propietario no cambia el rol del propietario ni el suyo (403).
2. `TRANSFER_OWNERSHIP` devuelve `household: { id, ownerUserId }` porque la prueba T237 lo lee sin pasar el hogar.
3. `applyMembershipEvent` usa un `nowIsoTimestamp` opcional con respaldo fijo (1970); las pruebas no lo fijan. En producción debe pasar el reloj inyectado.
4. `DELETE_HOUSEHOLD` recibe `households = []`; el hogar real lo quita el caso de uso (T246).

## Pendiente
- Sin commit: los cambios están sin confirmar. Neo decide el commit.
- `tasks.md`: T245 sigue `[ ]`. Pasa a REVIEW solo tras /oracle.
