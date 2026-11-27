# Acta architect — 012 data-model: CASCADE y retención de cuidado (2026-11-27)

Decisión de Neo (Nivel 2, vía Logos): 
1. CASCADE desde `pets` hacia `care_routines`, `care_log_entries` y `pet_caregiver_access`: APROBADO. La retención es techo máximo de privacidad, no piso obligatorio.
2. Retención: MEDICATION 1095 d; MEAL/WALK/OTHER 365 d (desde `occurrence_date`); revertidos 30 d (desde `reverted_at`); rutinas inactivas 365 d. Sin columna adicional: `T1661` calcula la fecha límite en mantenimiento desde `kind`, `status`, `occurrence_date`/`reverted_at`, con constantes en `feature-012-limits.ts`.
3. `dose_amount` NUMERIC(8,3) -> NUMERIC(9,3) en PG `0035`: aprobado (lo aplica keymaker).

Cambios en `specs/012-multiduenio-microchip-cuidador/data-model.md` (7 líneas):
- `care_routines.pet_id`: referencia al PENDIENTE sustituida por CASCADE aprobado.
- `dose_amount`: NUMERIC(9,3).
- Párrafo «Borrado desde `pets`»: PENDIENTE NEO retirado; decisión aprobada con los 5 puntos.
- Línea «Retención» del bloque: sin PENDIENTE, plazos y ausencia de columna.
- Matriz de retención: filas `care_routines`, `care_log_entries`, `pet_caregiver_access` alineadas (techo, sin columna, cascada aprobada).

No tocado: src/, tests/, contratos APPROVED, tasks.md, estados. Sin APPROVED nuevo ni [x].
Gates: verify-traceability --feature 012 CUMPLE; verify-oracles CUMPLE.
