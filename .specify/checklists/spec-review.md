---
document_id: CHECKLIST-SPEC-REVIEW
version: 2.0.0
status: APPROVED
applies_to: SPEC-ARGOS-001 v2.0.0
audited_by: Auditor SDD — 2026-11-05 (pendiente de firma del arquitecto humano)
---

# Checklist de Compuerta Fase 1 -> Fase 2: Revisión de Especificación (`spec-review.md`)

Ninguna especificación en `.specify/specs/` puede pasar a estado `APPROVED` ni habilitar el diseño en `.specify/plans/` sin cumplir el 100% de los siguientes criterios deterministas. Cada ítem debe citar su evidencia.

## Auditoría Aplicada a `SPEC-ARGOS-001` v2.0.0 (`pet-health-tracker.md`)

- [x] **1. Cero Prosa Abierta o Subjetiva:** umbrales exactos para alertas (`0..15` días), biometría (`0.05..150.00` kg, `1.00..250.00` cm), credenciales (username 3–30, password 8–128), bloqueo (5 intentos / 15 min), sesión (7 días), backup (≤ 10 MB) y regla de edad en fin de mes / 29-feb. *Evidencia: spec §2–§3.*
- [x] **2. Identificadores Inmutables de Trazabilidad:** `REQ-AUTH-001..004`, `REQ-PET-001..005`, `REQ-REC-001..006`, `REQ-HOUSE-001..005`, `REQ-UI-001..007`, `REQ-BACKUP-001..002` e invariantes de §3 con IDs únicos; IDs retirados listados explícitamente. *Evidencia: spec §0 y §2–§3.*
- [x] **3. Clausura de Contratos de Datos:** toda entidad y entrada/salida tiene JSON Schema o `components.schemas` con `additionalProperties: false`. *Evidencia: `contracts/schemas/*.json` v2.0.0, `contracts/openapi/` v2.0.0.*
- [x] **4. Modelado Formal de Estados:** `STATE-ALERT-001`, `STATE-BACKUP-001`, `STATE-AUTH-SESSION-001`, `STATE-HOUSE-MEMBERSHIP-001`, un archivo por máquina; nombres de estados idénticos entre spec y contrato. *Evidencia: `contracts/state-machines/`.*
- [x] **5. Taxonomía Exhaustiva de Errores:** cada invariante violable tiene código `ERR-*` en el catálogo y en spec §5 (29 códigos, incluido `ERR-BACKUP-ATOMIC-ROLLBACK`). *Evidencia: `contracts/errors/error-catalog.json` v2.0.0.*
- [x] **6. Aislamiento de Entropía Especificado:** toda regla temporal referencia `ClockPort` (con zona horaria definida); identidad, tokens y hashing referencian `IdGeneratorPort`, `SecureTokenPort` y `PasswordHasherPort`. *Evidencia: constitución §3, spec §2.*
- [x] **7. Seguridad y Autorización Especificadas:** reglas de lectura/escritura (`INV-ACC-*`), anti-enumeración, CSRF y secreto de credenciales definidos. *Evidencia: spec §3, constitución §6.*
- [x] **8. Estrategia de Migración para Cambios MAJOR:** respaldo v1.0.0 importable vía `MIGRATING_LEGACY_ENVELOPE`. *Evidencia: `backup-import.machine.json`.*
