---
document_id: CHECKLIST-SPEC-REVIEW
version: 2.2.0
status: REVIEW
applies_to: SPEC-ARGOS-001 v2.2.0
audited_by: Auditor SDD — 2026-11-05, re-auditoría de v2.2.0 en disco contra v2.1.0 (42e9f0d). Veredicto: NO APTO para APPROVED. Hallazgos abiertos H-01 a H-05 y H-07 (ver informe de re-auditoría).
human_signature: pendiente (Andrés)
note: v2.1.0 quedó firmada en 42e9f0d; las marcas de v2.1.0 no aplican a v2.2.0. Este checklist no firma ni aprueba nada. Ítems 3, 4 y 8 quedan pendientes.
---

# Checklist de Compuerta Fase 1 -> Fase 2: Revisión de Especificación (`spec-review.md`)

Ninguna especificación en `.specify/specs/` puede pasar a `APPROVED` ni habilitar el diseño en `.specify/plans/` sin cumplir el 100 % de estos criterios deterministas.

## Auditoría de `SPEC-ARGOS-001` v2.2.0 (`pet-health-tracker.md`)

- [x] **1. Cero prosa abierta o subjetiva.** Umbrales numéricos sin cambios frente a v2.1.0 (diff de `.specify` y `contracts`). El umbral provisional de `INV-AUTH-006` fue retirado (D-02). *Verificado en v2.2.0.*
- [x] **2. Identificadores inmutables de trazabilidad.** Sin altas ni bajas de IDs REQ/INV/STATE en el diff. Todos los IDs de constitución §4 están cubiertos en la trazabilidad de `TASKS` v2.2.0. *Verificado en v2.2.0.*
- [ ] **3. Clausura de contratos de datos.** Recorrido sobre `contracts/schemas/*.json` y `components.schemas` del OpenAPI: sin objetos con `properties` y sin `additionalProperties: false`. *Verificado.* **Pendiente:** la validación contra el metaesquema 2020-12 no se pudo ejecutar (Ajv 8 bloqueado por política de seguridad, HTTP 403; el validador local es draft-07). Ver H-06.
- [ ] **4. Modelado formal de estados.** Los cuatro IDs de máquina y sus estados aparecen en la spec. **Pendiente:** en `auth-session.machine.json` (`EXPIRED`, `LOGGED_OUT`) y en `household-membership.machine.json` (`DECLINED`, `CANCELLED`, `LEFT`, `REMOVED`) los estados están marcados `"type": "final"` y, a la vez, tienen transiciones salientes (`LOGOUT`, `INVITE`). Contradicción formal (H-05).
- [x] **5. Taxonomía de errores.** Catálogo v2.1.1 y spec §5 coinciden en los códigos. Resolución de `$ref` en `contracts/`: 164 referencias, 0 rotas. *Verificado en v2.2.0.* La trazabilidad de `ERR-PET-FUTURE-BIRTHDATE` en tareas es un hallazgo de `TASKS` (H-07).
- [x] **6. Aislamiento de entropía.** Constitución §3 sin cambios desde v2.1.0; `ClockPort`, `IdGeneratorPort`, `SecureTokenPort`, `PasswordHasherPort` y `APP_TIMEZONE` presentes. *Verificado por diff.*
- [x] **7. Seguridad y autorización.** `INV-ACC-001/002`, `INV-AUTH-003`, `INV-AUTH-006` (espía sin umbral) y la cabecera CSRF `X-Argos-Request` están especificados. **Salvedad:** `ERR-AUTH-CSRF-REJECTED` referencia `CONST-6.3`, ID no definido (H-01). *Verificado en v2.2.0, con salvedad.*
- [ ] **8. Migración para cambios MAJOR.** Estado `MIGRATING_LEGACY_ENVELOPE` presente. Los seis `Legacy*RecordV1` tienen los mismos `required` que sus equivalentes v2 y `additionalProperties: false`. **Pendiente:** que el fixture `validLegacyBackupEnvelopeV1` sea válido contra el esquema no se verificó (sin Ajv 2020; H-06).

**Resultado de la re-auditoría de v2.2.0:** 5 de 8 criterios verificados (1, 2, 5, 6, 7 con salvedad); 3 pendientes (3, 4, 8). No se firma. Firma pendiente: Andrés.
