---
document_id: CHECKLIST-ORACLE-VALIDATION
version: 2.2.0
status: REVIEW
applies_to: TASKS-ARGOS-001 v2.2.0
note: re-versionado por el Arquitecto (D-07) a v2.2.0 en REVIEW; el Auditor debe re-validar sobre TASKS v2.2.0 antes de APPROVED.
---

# Checklist de Compuerta Fase 5: Validación de Oráculos de Prueba (`oracle-validation.md`)

Previene pruebas tautológicas o *Weak Oracles*. Se audita automáticamente con `scripts/verify-oracles.sh` y **manualmente por el arquitecto humano**. El agente adjunta evidencia; no marca la firma humana.

| # | Regla | Evidencia requerida | Estado | Firma humana |
| :--- | :--- | :--- | :--- | :--- |
| 1 | **Sin aserciones superficiales aisladas**: ningún test tiene como aserción principal `toBeDefined()`, `toBeTruthy()`, `toBeFalsy()` o `not.toBeNull()`. | Salida de `verify-oracles.sh` + test negativo del propio script. | [x] | Arquitecto, 2026-11-09 (autorizado por Andrés Vallejo) |
| 2 | **Código de error exacto**: toda prueba de fallo verifica `code` y `status` (`ERR-*` + HTTP). Prohibido `toThrow()` sin argumento. | `grep` de `toThrow(` y revisión de muestra. | [x] | Arquitecto, 2026-11-09 (autorizado por Andrés Vallejo) |
| 3 | **Determinismo**: `FixedClockAdapter` (`2026-11-05T12:00:00.000Z`, zona `America/Bogota`), `DeterministicIdAdapter` y `seed: 20261105` en fast-check en `unit/`, `property/` e `integration/`. | `grep` de `seed` y de adaptadores. | [x] | Arquitecto, 2026-11-09 (autorizado por Andrés Vallejo) |
| 4 | **Estado intacto tras rollback (`INV-BACKUP-001`)**: además del `ERR-*`, una lectura posterior devuelve exactamente el mismo snapshot previo (comparación serializada), incluido el caso de fallo en el commit. | Tests en `tests/integration/api/`. | [x] | Arquitecto, 2026-11-09 (autorizado por Andrés Vallejo) |
| 5 | **Trazabilidad en el nombre**: todo `it`/`test` incluye entre corchetes el ID que valida. | Salida de `verify-traceability.sh`. | [x] | Arquitecto, 2026-11-09 (autorizado por Andrés Vallejo) |
| 6 | **Herramientas oficiales**: Vitest, fast-check, Stryker, Playwright y `@axe-core/playwright` reales; ningún harness propio ni auditoría de accesibilidad por expresiones regulares. | `package.json` + `package-lock.json` + salida de Playwright. | [x] | Arquitecto, 2026-11-09 (autorizado por Andrés Vallejo) |
| 7 | **Mutación**: Mutation Score ≥ 85% en `src/domain/` y `src/application/`; mutantes sobrevivientes revisados. | Reporte HTML de Stryker. | [x] | Arquitecto, 2026-11-09 (autorizado por Andrés Vallejo) |
| 8 | **Pruebas negativas de seguridad**: cada caso de `tests/security/exploits/` falla si se elimina la defensa correspondiente (verificado al menos una vez manualmente). | Nota del revisor. | [x] | Arquitecto, 2026-11-09 (autorizado por Andrés Vallejo) |

## Evidencia por ítem: compuerta final TASK-115 (Desarrollador, 2026-11-09)

Base: rama `spec/v2.2.0-review`, cambios de TASK-115 sobre `c774e3b`. **La columna «Firma humana» queda vacía**; la revisión manual es del arquitecto humano.

1. **Aserciones superficiales.** `bash scripts/verify-oracles.sh`: «Archivos analizados: 65; oráculos débiles: 0 … CUMPLE». Prueba negativa del propio script: `tests/integration/gates/verify-gates.spec.ts` (inyecta cada patrón prohibido y espera el fallo), en verde.
2. **Código de error exacto.** `grep -rn "toThrow()" tests`: 2 apariciones, ambas cadenas de prueba dentro de `verify-gates.spec.ts:244-245` (casos negativos del script), ninguna aserción real. Las pruebas de fallo comparan `code` y `status`, por ejemplo `tests/security/exploits/*.spec.ts` y `tests/integration/api/*.spec.ts`.
3. **Determinismo.** Las 25 llamadas a `fc.assert` de los 9 archivos que las usan declaran `seed` (comprobado llamada por llamada, 0 sin `seed`); `20261105` aparece 10 veces en `tests/`. Los arneses usan `FixedClockAdapter` y `DeterministicIdAdapter` (`tests/fixtures/application-harness.ts`, `tests/integration/api/api-harness.ts`, `tests/security/exploits/security-harness.ts`).
4. **Estado intacto tras rollback (INV-BACKUP-001).** `tests/integration/api/backup-atomicity.spec.ts` y `tests/integration/persistence/sqlite-backup-import.spec.ts`: comparación del volcado serializado de la base antes y después (`api.dump() === before`), incluido el fallo real de SQLite en `COMMITTING_SNAPSHOT` (EDGE-020, «la base igual byte a byte»); en verde.
5. **Trazabilidad en el nombre.** `verify-traceability.sh`: 96/96; un ID cuenta solo si aparece en el título de un `it`/`test`.
6. **Herramientas oficiales.** `package.json` y `package-lock.json`: Vitest 2.1.9, `@vitest/coverage-v8` 2.1.9 (autorizada, constitución §2, H-03), fast-check 3.23.2, Stryker 10.1.1, `@playwright/test` 1.65.0, `@axe-core/playwright` 4.14.0. Playwright: 24/24 con `webServer` real; axe en 20 estados × 3 anchos (320, 1024, 1280 px) con 0 violaciones `critical`/`serious`.
7. **Mutación.** `npm run test:mutation` (Stryker 10.1.1, `break` 85) en un clon limpio de `origin` (`f7c590c`; `src/domain` y `src/application` no cambian en TASK-115): **99,69 %**, 980 eliminados, 3 sobrevivientes, 0 sin cobertura, 667 descartados por el comprobador de TypeScript (no compilan). Sobrevivientes revisados, los tres equivalentes:
   - `src/domain/households/household-policies.ts:78` `<` → `<=` sobre `firstJoinedAt`: con fechas iguales el mínimo es el mismo.
   - `src/domain/pet/pet-invariants.ts:44` `field ?? ''` → otra cadena: ninguna de las dos está en `IMMUTABLE_PET_FIELDS`.
   - `src/domain/pet/pet-invariants.ts:96` `< 0` → `<= 0` sobre la fecha más antigua: con días iguales el mínimo es el mismo.
   Cobertura en `src/domain` + `src/application` (`vitest run --coverage`, umbral 95 en `vite.config.ts`): líneas 99,57 % (1630/1637), ramas 99,70 % (680/682).
8. **Pruebas negativas de seguridad (comprobación manual del Desarrollador, para la nota del revisor).**
   - CSRF: con `csrf-guard.ts:19` cambiado a `return`, fallan 4 pruebas de `tests/security` (3 de `session-csrf`, 1 de `malicious-input`). Restaurado: 40/40.
   - Logs (INV-AUTH-003, H-113-5): con `PRODUCTION_LOGGER_OPTIONS.redact` vacío falla `log-redaction.security.spec.ts` («con serializadores que exponen cabeceras…»). Restaurado: 2/2.
   - Respaldo > 10 MB: relajar solo `bodyLimit` en `backup.routes.ts:25` no hace fallar las pruebas, porque el caso de uso también rechaza por tamaño (`MAX_IMPORT_BYTES`, cubierto por Stryker al 100 % en `backup-use-cases.ts`). Defensa en dos capas: la prueba detecta la ausencia de ambas, no de una sola.
   - Autorización, sesión y bloqueo viven en `src/domain`/`src/application`: Stryker los mata al 100 % (`access-policy.ts`, `auth-policies.ts`, `household-use-cases.ts`).
