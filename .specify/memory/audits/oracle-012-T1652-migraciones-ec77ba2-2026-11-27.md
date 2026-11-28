# Oracle — Auditoría forense T1652 (migraciones Bloque C, feature 012)

Fecha: 2026-11-27 · Rango: 348faa3..ec77ba2 (c9b7f7f SQLite 0039, 4146607 PG 0035, ec77ba2 pruebas) · Solo lectura (sin commit, sin [x], sin APPROVED).

## Veredicto: CUMPLE CON RESERVAS
Paridad SQLite/PG exacta en estructura; gates verdes. Reservas: R1 (menor, regresión de contador t831 causada por T1652), R2 (menor, NUMERIC(8,3) vs tope 100000), decisión CASCADE/RESTRICT pendiente de Neo.

## 1. Paridad SQLite 0039 / PG 0035 (diff de DDL)
Columnas, CHECK, índices y FK idénticos en las 3 tablas. Únicas diferencias de tipo: `dose_amount` REAL vs NUMERIC(8,3), y SQLite `STRICT` (propio del motor). UNIQUE parcial `care_log_entries_occurrence (series_id, occurrence_date, occurrence_time) WHERE reverted_at IS NULL` presente en ambos (A-05). FK: pets CASCADE, users SET NULL (created_by/performed_by/reverted_by/granted_by), routine CASCADE, pet_caregiver_access.user_id CASCADE, supersedes_routine_id sin acción (NO ACTION). `pet_caregiver_access` PK (pet_id,user_id) cubre el UNIQUE del data-model. Sin `idempotency_key` (P-10) y sin columna de retención.

## 2. Discrepancias clasificadas
| # | Hallazgo | Clase |
|---|---|---|
| D1 | `series_id` (en routines y log_entries) no estaba en data-model; sí en schema 0.1.2 (A-05) y necesario para el UNIQUE. data-model ya se alineó en el working tree (architect). | Aceptable |
| D2 | `IU` en dose_unit (A-01 del schema 0.1.1/0.1.2); data-model original decía sin IU. Migración correcta con schema. | Aceptable |
| D3 | `effective_from/effective_to` TEXT sin CHECK de formato; schema = date-time, data-model original = YYYY-MM-DD. Sin formato forzado en BD (el CHECK `effective_to >= effective_from` es lexicográfico y válido para ISO). Validación de forma queda al dominio (T1655). | Aceptable |
| D4 | Sin columna de retención: coherente con data-model (purga por kind + occurrence_date/reverted_at, T1661). | Aceptable |
| D5 | PG `dose_amount NUMERIC(8,3)` admite máx 99999,999; el CHECK y el schema permiten 100000 exacto. Un 100000 falla en PG por desbordamiento y pasa en SQLite (divergencia de motores en el borde). Probabilidad clínica nula, pero rompe paridad. Corrección: NUMERIC(9,3) en PG o tope < 100000. | Menor |
| D6 | `note`/`instructions` solo `<= N` en SQL (sin mínimo), `times_of_day`/`days_of_week` CHECK solo de forma/longitud (elementos, orden, unicidad al dominio). Declarado en cabecera. | Aceptable |
| D7 | Tope 20 activas / 100 filas por mascota y paso 0,25 TABLET: no en BD (dominio, T1655). | Aceptable |
| D8 | data-model dice `ongoing`/`active` con DEFAULT; coinciden. `late` INTEGER (schema boolean): mapeo en repositorio. | Aceptable |
Ningún bloqueante.

## 3. Decisión pendiente de Neo: CASCADE (implementado) vs RESTRICT (pedido en misión)
Estado: pets -> care_routines CASCADE; care_routines -> care_log_entries CASCADE; pets -> pet_caregiver_access CASCADE; data-model (tabla de retención líneas 144-146) dice "Cascada con pets". La misión pedía RESTRICT: NO está implementado; no hay deriva silenciosa, la implementación sigue el data-model vigente.
Impacto de borrar una mascota (repositorios hacen `DELETE FROM pets WHERE id=?`, sqlite-repositories.ts:460, postgres-repositories.ts:429):
- CASCADE: el borrado de la mascota arrastra rutinas, registros de cuidado (incluida MEDICATION, retención nominal 1095 d) y niveles de cuidador. Coherente con "derecho al olvido" y con el resto de tablas hijas de pets (medical_visits, etc.). Pérdida inmediata de historial de medicación antes de 1095 d; la tabla de retención deja de ser un piso y pasa a ser un techo.
- RESTRICT: el DELETE de pets fallaría (FK) mientras existan filas de cuidado; exigiría que el caso de uso de borrado/eliminación de cuenta purgue primero registros -> rutinas -> accesos, o que RESTRICT se aplique solo a care_log_entries MEDICATION; cambia la semántica del borrado de cuenta (REQ de eliminación 002) y obliga a modificar ambos repositorios y pruebas de cascada ya escritas en t1652 (3 pruebas "borrar la mascota cascada").
- Recomendación Oracle (no decide): mantener CASCADE (coherente con el data-model y la eliminación de cuenta) y que Neo confirme que 1095/365/30 son techos de conservación y no piso. Si elige RESTRICT, cambio acotado a las 3 FK de pets y a care_log_entries->routines (ALTER no trivial en SQLite: se corrige in situ la 0039/0035 antes de merge, aún no desplegadas) + adaptar pruebas.

## 4. Gates (rc reales, ejecutados en este turno)
- `npx tsc --noEmit`: rc=0
- `bash scripts/verify-oracles.sh`: rc=0 (656 archivos, 0 oráculos débiles)
- `bash scripts/verify-traceability.sh --feature 012`: rc=0 (101/340 IDs trazados; 299/299 spec->tasks; pureza 0 violaciones)
- `vitest t1652-migracion-cuidador-012.spec.ts + schema-parity.spec.ts` con TEST_DATABASE_URL=postgres://argos_test:argos_test@127.0.0.1:55432/argos_test: rc=0, 2 archivos, 26/26 pasadas, 0 omitidas. **PG real EJECUTADO** (puerto 55432 abierto; la prueba "T1652 PostgreSQL real ... aplica 0035 y rechaza lo mismo que SQLite" pasó, y el bloque de paridad aplicó 0035 a PG).

## 5. Fallos de contadores (t1429, t1613, t831) — el supuesto "los 3 preexistentes" es parcialmente falso
Ejecutados en HEAD: 4 pruebas rojas en 3 archivos.
- t1429 (2 pruebas, "0029/0025 es la última migración") y t1613 (1 prueba, "0033 es la última"): PREEXISTENTES. En 348faa3 la última SQLite ya era 0038 (ls-tree) y PG 0034; sus aserciones esperaban 0029/0025/0033 y ya fallaban desde 0030+ (dbb826b/75d9c38 no las actualizaron). No causados por T1652.
- t831 (`toHaveLength(42)` de tablas SQLite): **NO preexistente: lo introduce T1652**. En 348faa3 el catálogo tenía 42 tablas (el propio ec77ba2 cambia sqlite-repositories de 42 a 45 y t831 espera 42); T1652 suma 3 tablas -> 45. ec77ba2 actualizó sqlite-repositories.spec pero olvidó t831 (tests/integration/persistence/t831-esquema-escena-006.spec.ts:47). Inferido por contabilidad de tablas y diff, no ejecutado en 348faa3 (no se hizo checkout ni worktree).
- Clasificación: t831 = menor, corrección de 1 línea (42 -> 45 con comentario "+care_routines, care_log_entries, pet_caregiver_access"). Es una regresión de T1652 que debe cerrarse antes de aceptar la tarea; t1429/t1613 son deuda previa (mismo patrón "es la última migración", conviene volverlos relativos o actualizarlos aparte).

## Resumen
Bloqueantes: 0. Menores: D5 (paridad NUMERIC), R1 (t831 por T1652). Pendiente Neo: CASCADE/RESTRICT + semántica de retención (techo vs piso). T1652 sigue en `[ ]` (techo del agente: REVIEW).
