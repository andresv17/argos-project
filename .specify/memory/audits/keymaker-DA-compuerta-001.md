# Keymaker — D-A: compuerta 001 excluye IDs sustituidos por 002 (aprobada por Neo, Nivel 2)
Fecha: 2026-11-18 · Worktree argos-005 (005-album-archivos-clinicos, base ebb4665)

## Linea base (antes)
- 001: 113/118 FALLA (FAIL: REQ-AUTH-001, REQ-AUTH-002, INV-AUTH-002, INV-AUTH-004, REQ-HOUSE-002)
- 002: 119/119 CUMPLE · 003: 25/114 CUMPLE · 004: 162/246 CUMPLE · 005: 21/128 FALLA (solo evidencia)

## Cambio (scripts/verify-traceability.sh)
- La tabla «Trazabilidad con la Feature 001» se lee tambien en modo 001, desde specs/002-plataforma-v21/spec.md (si existe).
- En modo 001 solo se aceptan los 5 IDs aprobados (constante SUPERSEDED_BY_002); los demas «Reemplazad...» de la tabla (REQ-PET-001, REQ-REC-001, etc.) NO se excluyen. Modos != 001 sin cambio.

## Resultado (despues)
- 001: 113/113 CUMPLE (113 vigentes; 6 retirados y 5 reemplazados excluidos)
- 002: 119/119 CUMPLE (sin cambio) · 003: 25/114 CUMPLE · 004: 162/246 CUMPLE
- 005: 21/128 FALLA, solo FAIL de evidencia src/tests (sin FAIL de estructura)
- npx tsc --noEmit = 0 (symlink temporal a node_modules, retirado)
- Sin tocar specs, src/, tests/, contratos; sin tareas [x]; sin push.
