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
| 1 | **Sin aserciones superficiales aisladas**: ningún test tiene como aserción principal `toBeDefined()`, `toBeTruthy()`, `toBeFalsy()` o `not.toBeNull()`. | Salida de `verify-oracles.sh` + test negativo del propio script. | [ ] | [ ] |
| 2 | **Código de error exacto**: toda prueba de fallo verifica `code` y `status` (`ERR-*` + HTTP). Prohibido `toThrow()` sin argumento. | `grep` de `toThrow(` y revisión de muestra. | [ ] | [ ] |
| 3 | **Determinismo**: `FixedClockAdapter` (`2026-11-05T12:00:00.000Z`, zona `America/Bogota`), `DeterministicIdAdapter` y `seed: 20261105` en fast-check en `unit/`, `property/` e `integration/`. | `grep` de `seed` y de adaptadores. | [ ] | [ ] |
| 4 | **Estado intacto tras rollback (`INV-BACKUP-001`)**: además del `ERR-*`, una lectura posterior devuelve exactamente el mismo snapshot previo (comparación serializada), incluido el caso de fallo en el commit. | Tests en `tests/integration/api/`. | [ ] | [ ] |
| 5 | **Trazabilidad en el nombre**: todo `it`/`test` incluye entre corchetes el ID que valida. | Salida de `verify-traceability.sh`. | [ ] | [ ] |
| 6 | **Herramientas oficiales**: Vitest, fast-check, Stryker, Playwright y `@axe-core/playwright` reales; ningún harness propio ni auditoría de accesibilidad por expresiones regulares. | `package.json` + `package-lock.json` + salida de Playwright. | [ ] | [ ] |
| 7 | **Mutación**: Mutation Score ≥ 85% en `src/domain/` y `src/application/`; mutantes sobrevivientes revisados. | Reporte HTML de Stryker. | [ ] | [ ] |
| 8 | **Pruebas negativas de seguridad**: cada caso de `tests/security/exploits/` falla si se elimina la defensa correspondiente (verificado al menos una vez manualmente). | Nota del revisor. | [ ] | [ ] |
