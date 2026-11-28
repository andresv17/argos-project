# Acta Oracle — commit f9b46d0 (0036 PG / 0040 SQLite, retiro de IU en dose_unit) — 2026-11-27

Veredicto global: CUMPLE (APTO / VALIDADO EN DISCO). Sin hallazgos bloqueantes.

1. 0036 PG: CUMPLE. DROP + ADD de `care_routines_dose_unit_check` (nombre automatico del CHECK de columna de 0035:15) con MG|MCG|ML|TABLET|DROP; 0035 sin diff en f9b46d0; ADD falla cerrado con filas IU (documentado en cabecera).
2. 0040 SQLite: CUMPLE. Triggers BEFORE INSERT y BEFORE UPDATE OF dose_unit, RAISE(ABORT) con mensaje "CHECK constraint failed: dose_unit"; sin reconstruir tabla; 0039 sin diff.
3. t1652: CUMPLE. IU y UNIT rechazadas en SQLite y PG (PG real, no skipped); insercion valida PG usa DROP; SQLite valida con la rutina base.
4. Contadores: CUMPLE. t1429 (SQLite 0029: -11 a -12; PG 0025: -11 a -12), t1613 (SQLite 0033: -7 a -8), t1517 (SQLite 0030 -10 a -11; PG 0026 -10 a -11), sqlite-repositories (lista 0001..0040), postgres-pool (0036, longitud 36): cada uno suma exactamente 1 migracion posterior. Ningun fallo oculto.
5. tasks.md: CUMPLE. Solo T1658 a [x] (1 linea). El resto del diff del archivo en el arbol de trabajo (T1670) no pertenece a f9b46d0.
6. Orden: CUMPLE. SQLite: pending .sort() por nombre (0039 < 0040). PG: scripts/migrate-postgres.ts:161,183 ordena por version (0035 < 0036).

Gates: tsc rc0; verify-oracles rc0 (667 archivos, 0 debiles); verify-traceability 012 T1658 rc0; vitest 5 archivos solicitados 72/72; postgres-pool + sqlite-repositories 90/90.

Hallazgos:
- Menor M-1: comentario residual "012 B-4..." en tests/integration/persistence/postgres-pool.spec.ts (linea del expect at(-1)) desactualizado; cosmetico.
- Menor M-2: la cabecera de 0035/0039 sigue diciendo "IU incluida" (deliberado, migraciones no se mutan; 0036/0040 lo documentan).
- Menor M-3: SQLite 0040 no rechaza IU ya existente (aditivo; feature no en produccion).
