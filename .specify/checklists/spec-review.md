---
document_id: CHECKLIST-SPEC-REVIEW
version: 2.1.0
status: APPROVED
applies_to: SPEC-ARGOS-001 v2.1.0
audited_by: Auditor SDD — 2026-11-05 (re-auditoría v2.1.0 verificada en disco; las marcas de v2.0.0 quedan sin validez, C11)
human_signature: Andrés — 2026-11-05
---

# Checklist de Compuerta Fase 1 -> Fase 2: Revisión de Especificación (`spec-review.md`)

Ninguna especificación en `.specify/specs/` puede pasar a estado `APPROVED` ni habilitar el diseño en `.specify/plans/` sin cumplir el 100% de los siguientes criterios deterministas. Cada ítem debe citar su evidencia.

## Auditoría Aplicada a `SPEC-ARGOS-001` v2.1.0 (`pet-health-tracker.md`)

- [x] **1. Cero Prosa Abierta o Subjetiva:** umbrales exactos para alertas (`0..15` días), biometría (`0.05..150.00` kg, `1.00..250.00` cm), credenciales (username 3–30, password 8–128), bloqueo (5 intentos en ventana deslizante de 15 min, `INV-AUTH-005`; tiempo uniforme, `INV-AUTH-006`), sesión (7 días), backup (≤ 10 MB) y regla de edad en fin de mes / 29-feb. *Evidencia: spec §2–§3.* *Verificado: los 11 umbrales están presentes en la spec v2.1.0.*
- [x] **2. Identificadores Inmutables de Trazabilidad:** `REQ-AUTH-001..004`, `REQ-PET-001..005`, `REQ-REC-001..006`, `REQ-HOUSE-001..005`, `REQ-UI-001..007`, `REQ-BACKUP-001..002` e invariantes de §3 con IDs únicos; IDs retirados listados explícitamente. *Evidencia: spec §0 y §2–§3.* *Verificado: 55 IDs REQ/INV en tablas, sin duplicados; 4 IDs retirados listados.*
- [x] **3. Clausura de Contratos de Datos:** toda entidad y entrada/salida tiene JSON Schema o `components.schemas` con `additionalProperties: false`. *Evidencia: `contracts/schemas/*.json` v2.1.0, `contracts/openapi/` v2.1.0.* *Verificado: 0 objetos sin `additionalProperties: false` en los 5 esquemas y en `components.schemas`; los 5 esquemas pasan el metaesquema 2020-12.*
- [x] **4. Modelado Formal de Estados:** `STATE-ALERT-001`, `STATE-BACKUP-001`, `STATE-AUTH-SESSION-001`, `STATE-HOUSE-MEMBERSHIP-001`, un archivo por máquina; nombres de estados idénticos entre spec y contrato. *Evidencia: `contracts/state-machines/` v2.1.0 (incluido `INV-AUTH-006` en `auth-session`).* *Verificado: los 4 IDs de máquina y todos sus estados aparecen literalmente en la spec.*
- [x] **5. Taxonomía Exhaustiva de Errores:** cada invariante violable tiene código `ERR-*` en el catálogo y en spec §5 (30 códigos en v2.1.0, incluidos `ERR-BACKUP-ATOMIC-ROLLBACK` y `ERR-HOUSE-MEMBERSHIP-NOT-FOUND`). *Evidencia: `contracts/errors/error-catalog.json` v2.1.0 y `contracts/schemas/common.schema.json#/$defs/ProblemDetails` v2.1.0.* *Verificado: 30 códigos idénticos entre catálogo y spec §5; `ProblemDetails` resuelve desde el catálogo.*
- [x] **6. Aislamiento de Entropía Especificado:** toda regla temporal referencia `ClockPort` (con zona horaria definida); identidad, tokens y hashing referencian `IdGeneratorPort`, `SecureTokenPort` y `PasswordHasherPort`. *Evidencia: constitución §3, spec §2.* *Verificado: los 4 puertos y `APP_TIMEZONE` en la constitución.*
- [x] **7. Seguridad y Autorización Especificadas:** reglas de lectura/escritura (`INV-ACC-*`), anti-enumeración, CSRF y secreto de credenciales definidos. *Evidencia: spec §3, constitución §6.* *Verificado: `INV-ACC-001/002`, `INV-AUTH-003/006` y `X-Argos-Request` en la spec.*
- [x] **8. Estrategia de Migración para Cambios MAJOR:** respaldo v1.0.0 importable vía `MIGRATING_LEGACY_ENVELOPE`. *Evidencia: `backup-import.machine.json`.* *Verificado: estado `MIGRATING_LEGACY_ENVELOPE` y fixture v1.0.0 válido contra el esquema legado.*

**Resultado de la re-auditoría:** 8/8 criterios cumplidos. Fixtures canónicos: 11/11 objetos válidos contra los esquemas. Firmado por Andrés el 2026-11-05; SPEC-ARGOS-001 v2.1.0 en `APPROVED`.
