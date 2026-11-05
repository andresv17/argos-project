# Checklist de Compuerta Fase 1 -> Fase 2: Revisión de Especificación (`spec-review.md`)

Ninguna especificación en `.specify/specs/` puede pasar a estado `APPROVED` ni habilitar el diseño en `.specify/plans/` sin cumplir el 100% de los siguientes criterios deterministas:

## Auditoría Aplicada a `SPEC-ARGOS-001` (`pet-health-tracker.md`)

- [x] **1. Cero Prosa Abierta o Subjetiva:** Términos ambiguos como *"próxima a vencer"*, *"medidas razonables"* o *"algunas mascotas"* han sido reemplazados por umbrales matemáticos exactos (`0..15 días`, `0.05..150.00 kg`, `1.00..250.00 cm`, cupo exacto `<= 4` con máx. `2 DOG` y `2 CAT`).
- [x] **2. Identificadores Inmutables de Trazabilidad:** Todos los requisitos (`REQ-PET-001`..`003`, `REQ-REC-001`..`006`, `REQ-UI-001`..`004`, `REQ-BACKUP-001`..`002`) e invariantes (`INV-PET-001`..`004`, `INV-REC-001`..`006`, `INV-SORT-001`, `INV-BACKUP-001`) cuentan con IDs únicos.
- [x] **3. Clausura de Contratos de Datos:** Cada entidad de entrada/salida está respaldada por un JSON Schema en `contracts/schemas/` con `additionalProperties: false`.
- [x] **4. Modelado Formal de Estados:** Los comportamientos dependientes del tiempo o de transacciones cuentan con máquinas de estados finitos en `contracts/state-machines/` (`STATE-ALERT-001`, `STATE-BACKUP-001`, `STATE-PET-QUOTA-001`).
- [x] **5. Taxonomía Exhaustiva de Errores:** Cada violación de invariante tiene asignado un código de error único (`ERR-*`) en `contracts/errors/error-catalog.json`.
- [x] **6. Aislamiento de Entropía Especificado:** Toda regla temporal referencia explícitamente `ClockPort` y toda generación de identidad referencia `IdGeneratorPort`.
