# Errata MINOR — ERR-CAR12-ROUTINE-STALE (catálogo 0.3.0)

- Estado: **DRAFT — PENDIENTE DE APROBACIÓN DE NEO (Nivel 2)**. Decisión de fondo `H-C2` tomada por Neo el 2026-11-27; la firma del catálogo la da solo Neo.
- Tipo de cambio: MINOR (código nuevo; sin renombrar ni retirar códigos).
- Contrato afectado: `contracts/errors/error-catalog.json` (`x-sdd-metadata.version` 0.2.0 → 0.3.0; `status` APPROVED se conserva solo para lo existente; `added` +`ERR-CAR12-ROUTINE-STALE`).
- Cuerpo: 409, título «Esta rutina cambió mientras la editabas», `detailTemplate` genérico, **sin datos de la fila sustituida ni de la vigente**.
- Uso: `updateCareRoutine`, `deactivateCareRoutine` y `setCaregiverAccess` (`care.openapi.yaml` 0.1.2) en lugar de `ERR-PET-VERSION-CONFLICT`, que no se toca.
- Si Neo no aprueba: `care.openapi.yaml` y los esquemas vuelven a `ERR-PET-VERSION-CONFLICT` en una enmienda 0.1.3.
