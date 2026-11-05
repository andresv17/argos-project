---
document_id: CHECKLIST-SPEC-REVIEW
version: 2.2.0
status: REVIEW
applies_to: SPEC-ARGOS-001 v2.2.0 (revisión 2 de contratos, rama spec/v2.2.0-review)
audited_by: Auditor SDD — 2026-11-05, re-auditoría de revisión 2 verificada en disco. Criterios 1, 2, 4, 5, 6, 7, 8 verificados; criterio 3 pendiente (ver abajo). No aprobado.
human_signature: pendiente (Andrés). Este checklist no registra firma humana.
note: Las marcas `[x]` de v2.1.0 fueron eliminadas (H-13). v2.1.0 quedó firmada en 42e9f0d. Esta versión no sustituye la firma de Andrés sobre D-10 (constitución §2, "pendiente de firma formal").
---

# Checklist de Compuerta Fase 1 -> Fase 2: Revisión de Especificación (`spec-review.md`)

Ninguna especificación en `.specify/specs/` puede pasar a `APPROVED` ni habilitar el diseño en `.specify/plans/` sin cumplir el 100 % de estos criterios deterministas.

## Auditoría de `SPEC-ARGOS-001` v2.2.0, revisión 2

- [x] **1. Cero prosa abierta o subjetiva.** Umbrales numéricos sin cambios frente a v2.1.0. `INV-AUTH-006` sin umbral temporal (D-02). *Verificado en disco (revisión anterior).*
- [x] **2. Identificadores inmutables de trazabilidad.** Sin altas ni bajas de IDs REQ/INV/STATE. Nuevo `INV-AUTH-007` (CSRF). *Verificado en disco.*
- [ ] **3. Clausura de contratos de datos.** **Verificado:** en `contracts/schemas/*.json` ningún objeto con `properties` carece de `additionalProperties: false` (recorrido recursivo, 0 casos). **No verificado:** la validación contra el metaesquema 2020-12. El entorno del Auditor solo tiene `jsonschema` 3.2, que implementa draft-07, y no hay acceso de red para instalar un validador 2020-12. `check_schema` draft-07 pasa en los cinco esquemas, pero no equivale a la validación 2020-12. Pendiente: salida literal de `Draft202012Validator.check_schema` (o Ajv 2020) con la versión de la librería, ejecutada en el entorno del Arquitecto o del Desarrollador.
- [x] **4. Modelado formal de estados.** Verificado en disco: en `auth-session.machine.json` y `household-membership.machine.json` no queda ningún estado `"type": "final"`. Los únicos `final` son `COMPLETED` y `ROLLED_BACK` en `backup-import.machine.json`, sin transiciones salientes. La spec §4 (líneas 143–144) describe las mismas transiciones. Salvedad: `ROLLBACK_FAILED` aparece como clave en `backup-import.machine.json` (línea 103), fuera de `states`; no es un estado. Su `finalState: UNKNOWN` está admitido en `common.schema.json`.
- [x] **5. Taxonomía exhaustiva de errores.** Catálogo y spec §5 coinciden. `CONST-6.3` ya no aparece en `.specify` ni en `contracts`. `ERR-PET-FUTURE-BIRTHDATE` está trazado en TASK-104. Verificado en disco.
- [x] **6. Aislamiento de entropía especificado.** Constitución §3 sin cambios desde v2.1.0; puertos y `APP_TIMEZONE` presentes. *Verificado por diff.*
- [x] **7. Seguridad y autorización especificadas.** `INV-AUTH-007` aparece en spec §3 (línea 125) y §5.1 (línea 185), en el catálogo (`ERR-AUTH-CSRF-REJECTED.invariantRef`, línea 93) y en EDGE-018 (línea 613). Constitución §4 (línea 71) lo cubre por rango `INV-AUTH-001..007`, sin ID explícito. Verificado en disco.
- [x] **8. Migración para cambios MAJOR.** El fixture `validLegacyBackupEnvelopeV1` pasa contra `BackupEnvelopeV1Legacy` con 0 errores, y un campo extra sí se rechaza (control negativo). **Salvedad:** la validación se hizo con draft-07 (aproximación; el esquema no usa palabras clave exclusivas de 2020-12 en esa rama). La confirmación 2020-12 queda cubierta por el pendiente del criterio 3.

**Resultado:** 7 de 8 criterios verificados (1, 2, 4, 5, 6, 7, 8); criterio 3 pendiente. No se firma. No se aprueba.

**Para pasar a APPROVED faltan:** (a) salida 2020-12 del criterio 3; (b) firma formal de Andrés sobre D-10 (dependencias, constitución §2) y su registro en `approved_by`.
