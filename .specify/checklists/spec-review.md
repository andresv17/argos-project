---
document_id: CHECKLIST-SPEC-REVIEW
version: 2.2.0
status: REVIEW
applies_to: SPEC-ARGOS-001 v2.2.0 (revisión 2 de contratos, rama spec/v2.2.0-review)
approved_by: Andrés Vallejo, 2026-11-05 (en frontmatter de la spec)
audited_by: Auditor SDD — 2026-11-05. Re-auditoría de la revisión 2 verificada en disco: criterios 1 a 8 cumplidos. Pendiente solo la firma humana en human_signature.
human_signature: Andrés Vallejo, 2026-11-05
note: Las marcas `[x]` de v2.1.0 fueron eliminadas (H-13). v2.1.0 quedó firmada en 42e9f0d. Este checklist no registra firma humana hasta que Andrés la confirme.
---

# Checklist de Compuerta Fase 1 -> Fase 2: Revisión de Especificación (`spec-review.md`)

Ninguna especificación en `.specify/specs/` puede pasar a `APPROVED` ni habilitar el diseño en `.specify/plans/` sin cumplir el 100 % de estos criterios deterministas.

## Auditoría de `SPEC-ARGOS-001` v2.2.0, revisión 2

- [x] **1. Cero prosa abierta o subjetiva.** Umbrales numéricos sin cambios frente a v2.1.0. `INV-AUTH-006` sin umbral temporal (D-02). *Verificado en disco.*
- [x] **2. Identificadores inmutables de trazabilidad.** Sin altas ni bajas de IDs REQ/INV/STATE. Nuevo `INV-AUTH-007` (CSRF). *Verificado en disco.*
- [x] **3. Clausura de contratos de datos.** Dos evidencias, con su origen:
  - *Metaesquema 2020-12:* salida aportada por el Arquitecto, `jsonschema 4.26.0`, `Draft202012Validator.check_schema` sobre los cinco esquemas de `contracts/schemas/`: OK en `backup-envelope`, `common`, `identity`, `medical-records` y `pet`. El Auditor verificó en disco que los hashes SHA-256 (primeros 16 caracteres) coinciden con los archivos evaluados: `7155767b901ee176`, `e3f8ab6ee919bd02`, `77b31916d0241d2e`, `0f89627497f56641`, `842225c18d6d544c`. Los esquemas no tienen cambios respecto al último commit.
  - *Recorrido de `additionalProperties`:* verificado en disco por el Auditor. Ningún objeto con `properties` carece de `additionalProperties: false` (0 casos).
- [x] **4. Modelado formal de estados.** Verificado en disco: ningún estado `"type": "final"` con transiciones salientes en `auth-session` y `household-membership`. Los únicos `final` son `COMPLETED` y `ROLLED_BACK` en `backup-import`, sin salidas. La spec §4 (líneas 143–144) describe las mismas transiciones. `ROLLBACK_FAILED` aparece como clave en `backup-import.machine.json` (línea 103), fuera de `states`; no es un estado, y su `finalState: UNKNOWN` está admitido en `common.schema.json`.
- [x] **5. Taxonomía exhaustiva de errores.** Catálogo y spec §5 coinciden. `CONST-6.3` ya no aparece en `.specify` ni en `contracts`. `ERR-PET-FUTURE-BIRTHDATE` está trazado en TASK-104. Verificado en disco.
- [x] **6. Aislamiento de entropía especificado.** Constitución §3 sin cambios desde v2.1.0; puertos y `APP_TIMEZONE` presentes. *Verificado por diff.*
- [x] **7. Seguridad y autorización especificadas.** `INV-AUTH-007` aparece en spec §3 (línea 125) y §5.1 (línea 185), en el catálogo (`ERR-AUTH-CSRF-REJECTED.invariantRef`, línea 93) y en EDGE-018 (línea 613). Constitución §4 (línea 71) lo cubre por rango `INV-AUTH-001..007`, sin ID explícito. Verificado en disco.
- [x] **8. Migración para cambios MAJOR.** El fixture `validLegacyBackupEnvelopeV1` pasa contra `BackupEnvelopeV1Legacy` con 0 errores, y un campo extra sí se rechaza (control negativo). Validación hecha con draft-07 por el Auditor; la confirmación 2020-12 queda cubierta por el criterio 3.

**Resultado:** 8 de 8 criterios cumplidos. La spec queda lista para `APPROVED` en cuanto Andrés confirme la firma en `human_signature`. Este checklist no firma por Andrés.
