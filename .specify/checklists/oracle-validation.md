# Checklist de Compuerta Fase 5: Validación de Oráculos de Prueba (`oracle-validation.md`)

Esta lista de control previene que la IA genere pruebas tautológicas o *Weak Oracles* (pruebas que ejecutan código sin verificar el resultado real). Es auditada automáticamente por `scripts/verify-oracles.sh` y por el humano en el Punto de Control.

## Reglas de Rechazo Inmediato de Pruebas

- [x] **1. Prohibición de Aserciones Superficiales Aisladas:** Ningún test puede tener como única aserción `expect(result).toBeDefined()`, `expect(result).toBeTruthy()` o `expect(result).not.toBeNull()`. Debe verificarse el valor exacto o la estructura completa del objeto devuelto.
- [x] **2. Verificación Exacta de Códigos de Error (`ERR-*`):** Toda prueba de caso de borde o fallo debe verificar explícitamente el código `error.code` (ej. `expect(error.code).toBe('ERR-PET-QUOTA-EXCEEDED')`), nunca un `expect(() => fn()).toThrow()` genérico sin argumento.
- [x] **3. Prohibición de Relojes o Semillas Variables en Tests:** Todos los tests en `tests/unit/`, `tests/property/` y `tests/integration/` deben utilizar `FixedClockAdapter` (con fecha congelada `2026-11-05`) y `seed: 20261105` en `fast-check`.
- [x] **4. Verificación de Estado Intacto tras Rollback (`INV-BACKUP-001`):** Las pruebas de fallo en importación de backup no solo deben comprobar que se lanza `ERR-BACKUP-*`, sino también que una lectura posterior del repositorio devuelve exactamente el mismo snapshot previo byte por byte.
- [x] **5. Trazabilidad Explícita en el Nombre del Test:** Todo bloque `it(...)` o `test(...)` incluye entre corchetes el ID de especificación que valida (ej. `[INV-REC-004][ERR-REC-INVALID-BOOSTER-DATE]`).
