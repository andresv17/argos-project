# Acta Architect — data-model Bloque C alineado con T1652 (2026-11-27)
Alcance: solo specs/012-.../data-model.md (sin reglas de negocio nuevas; DRAFT, sin APPROVED).
Cambios: (1) series_id NOT NULL en care_routines y care_log_entries + UNIQUE parcial care_log_entries_occurrence (series_id, occurrence_date, occurrence_time) WHERE reverted_at IS NULL (A-05); (2) dose_unit incluye IU (A-01); (3) effective_from/effective_to date-time (A-04), con CHECK effective_to >= effective_from; (4) marcador PENDIENTE NEO: CASCADE o RESTRICT de pets hacia registros clinicos y columna de retencion (1095/365/30), sin fijar plazo ni columna; (5) declarado CASCADE desde pets como decision de data-model mientras Neo no decida otra cosa.
Gates: verify-traceability --feature 012 y verify-oracles: ver registro.
Pendiente Neo: CASCADE vs RESTRICT y columna de retencion antes de T1655.
