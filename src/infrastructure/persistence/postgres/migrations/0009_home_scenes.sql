-- Escena del hogar en pixel art (Feature 006). Pieza M-3 de la enmienda MINOR N2-06 (a) (T810; REQ-ESC6-021, INV-ESC6-016, data-model.md §8 y §6 M-3).
-- @implements REQ-ESC6-021, INV-ESC6-016, REQ-AUD-001
-- Equivale a la 0013 de SQLite. Sin BEGIN/COMMIT: el migrador corre cada migracion en una transaccion y registra la version.
-- Por ahora SOLO el CHECK de `audit_log.entity_type` (HOME_SCENE, SCENE_CONSENT, HOUSEHOLD_PHOTO); T833 (Fase 4) anade en este archivo las tablas de la escena.
-- Las filas existentes cumplen la restriccion ampliada; no se tocan. AuditMutationType no cambia.
ALTER TABLE audit_log DROP CONSTRAINT audit_log_entity_type_check;
ALTER TABLE audit_log ADD CONSTRAINT audit_log_entity_type_check CHECK (entity_type IN
  ('USER', 'PET', 'WEIGHT_RECORD', 'BODY_MEASUREMENT', 'VACCINATION_RECORD', 'DEWORMING_RECORD', 'APPOINTMENT_RECORD',
   'CUSTOM_PARAMETER', 'HOUSEHOLD', 'HOUSEHOLD_MEMBERSHIP', 'HOUSEHOLD_INVITATION', 'PET_ASSIGNMENT', 'PET_MEDIA',
   'HOME_SCENE', 'SCENE_CONSENT', 'HOUSEHOLD_PHOTO', 'SYSTEM'));
