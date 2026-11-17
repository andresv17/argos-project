# Auditoría Oracle — T236 (primera parte): tests/unit/permissions-matrix.spec.ts

Fecha: 2026-11-11 · Rama: 002-plataforma-v21 · Auditor: Oracle · Destinatario: Neo (Andrés Vallejo — Nivel 2)

## Veredicto: PASS CON OBSERVACIONES

La primera parte de T236 (matriz de 44 casos) está entregada en rojo, correcta y coincide celda por celda con la spec y con los fixtures canónicos. Las observaciones no bloquean la primera parte, pero sí condicionan la firma de la tarea completa.

## Verificaciones

| # | Verificación | Evidencia en disco | Resultado |
|---|---|---|---|
| 1 | Existe y tiene 44 casos (11 × 4) | Archivo de 2773 bytes. `MATRIX` tiene 11 filas (M01–M11) y `ROLES` 4 roles. `it.each(CASES)` genera 44. Recuento por script: 11 filas, 44 celdas. | PASS |
| 2 | Aserción booleana exacta, sin oráculos débiles | Única aserción: `expect(can(role, action)).toBe(outcome === 'permitido')`. Sin `expect(true)`, `toBeDefined`, `.skip`, `.todo`, `.only`, `xit`. `verify-oracles.sh`: 77 archivos, 0 oráculos débiles. | PASS |
| 3 | Celda por celda contra spec §5.2 (REQ-RBAC-001) | Script de comparación: 11 de 11 filas coinciden (OWNER/ADMIN/CAREGIVER/READER). Ejemplos: M02 DELETE_PET = p,d,d,d; M11 EXPORT_IMPORT_BACKUP = p,p,p,p. | PASS |
| 3b | Celda por celda contra `contracts/examples/canonical-fixtures.json` (`rbacMatrix`) | 44 entradas `FX-RBAC-*`; 0 discrepancias con el archivo de prueba. | PASS |
| 4 | `npx vitest run tests/unit/permissions-matrix.spec.ts` falla por ausencia de módulo | Exit 1. Tests: 44 failed, 0 passed. Los 44 mensajes son: `Failed to load url ../../src/domain/access/rbac.ts ... Does the file exist?`. No hay errores de sintaxis ni de TypeScript. | PASS |
| 5 | No hay código de dominio nuevo | `src/domain/access/rbac.ts` no existe. `git status --short -- src specs/002-plataforma-v21/contracts src/generated` vacío. El único archivo nuevo es `tests/unit/permissions-matrix.spec.ts` (`??`). | PASS |
| 5b | Restricciones contextuales fuera de can() | El archivo no contiene lógica de hogar. M08 MANAGE_HOUSEHOLD_MEMBERS es p,p,d,d sin condiciones de propietario. Las restricciones quedan para INV-HOUSE2-001 / REQ-HOUSE2-002 (T237, T245/T246). | PASS |
| 5c | EXPORT_IMPORT_BACKUP permitido a los cuatro roles | M11 = p,p,p,p, conforme a N-4 (B), US2 AC2 y REQ-BACKUP2-001/002. | PASS |
| 6 | Marca de T236 sin cambios | `tasks.md` línea 132: `- [ ] T236`. No hay diff en la línea de T236. | PASS |
| 7a | `bash scripts/verify-oracles.sh` | `Archivos analizados: 77; oráculos débiles: 0`. `Resultado: CUMPLE`. Exit 0. | PASS |
| 7b | `bash scripts/verify-traceability.sh --feature 002 --task T236` | `IDs trazados: 0/3`. REQ-RBAC-001, INV-ACC2-001 e INV-ACC2-002 sin `@implements` en `src/`. `Violaciones de pureza: 0`. `Resultado: FALLA`. Exit 1. | ESPERADO: falla por ausencia de código, no por la prueba |

## Observaciones (no bloquean la primera parte)

1. **Cambios sin commit en `tasks.md` fuera de T236.** `git diff` muestra 10 líneas pasadas de `[ ]` a `[x]`: T226 a T235 (rebanada 2). Solo Neo puede marcar COMPLETED (CLAUDE.md §1.1). Si el `[x]` es el estado de REVIEW o de COMPLETED, debe revisarlo Neo antes de cualquier commit. Este hallazgo no afecta a T236.
2. **El gate de trazabilidad de T236 falla de forma esperada.** El fallo viene de que aún no existe `src/domain/access/rbac.ts` con `@implements`. Pasará cuando se implemente la función `can`.
3. **Título de `describe` con INV-ACC2-002.** El gate lo detecta como mención en el título del `describe`, no como caso `it`. Es una trazabilidad débil a INV-ACC2-002, que se resolverá con las pruebas de la fila 6 (`access.property.spec.ts`, `access-policy.spec.ts`).

## Pendientes de T236 (alcance no entregado, no es fallo de esta entrega)

- `tests/property/access.property.spec.ts` y `tests/unit/access-policy.spec.ts` existen, pero son versiones de la 001 (último commit `2dd2a9a` / `327b409`). Prueban `canRead` / `canWrite` de la 001 y no prueban `can(rol, acción)` ni el rol efectivo de REQ-RBAC-001 e INV-ACC2-002. T236 de la 002 aún necesita esas pruebas.
- Sin `src/domain/access/rbac.ts`, las 44 pruebas siguen en rojo, lo que es el estado esperado.
