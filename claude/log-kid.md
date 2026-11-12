# Bitácora de Kid (co-cuidador, multi-navegador)

## 2026-11-12 T250
- Reescribí household.spec.ts a 002 (Ana, Bruno ADMIN, Carla CAREGIVER, Dario READER) y amplié household-counter.spec.ts; helper apiCall en e2e-support.ts.
- Resultado: 15 pasan, 1 roja intencional por brechas reales: H-T250-1 (ADMIN no propietario no puede invitar, requireOwner) y H-T250-2 (UI muestra Eliminar a ADMIN).
- Compuertas: tsc 0, verify-oracles CUMPLE, verify-traceability T250 CUMPLE. Evidencia: claude/evidencia-task-T250-2026-11-12.md
