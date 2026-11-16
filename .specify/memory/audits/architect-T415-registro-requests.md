# Architect: registro de petición de Cloud Run (R-3 de T415), 2026-11-16
- Documentado en `specs/003-cloud-gcp/research.md §10` y fila en `data-model.md §6` (la fila existía sin campos ni verificación; se completó).
- Retención: 30 d de `_Default` confirmados en la documentación oficial de Cloud Logging (valor por defecto). **[verificar]**: que `run.googleapis.com/requests` se enrute a `_Default`; no confirmado en las páginas consultadas.
- Campos de `httpRequest` tomados del objeto genérico de Cloud Logging; Cloud Run no los redefine en las páginas halladas.
- Sin cambios en requisitos, contratos, src/, tests/, tasks.md ni spec.md. Sin `[x]`.
