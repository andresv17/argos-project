# Bitácora Sentinels

- 2026-11-12 T251: creada `tests/security/exploits/idor-matrix.security.spec.ts` (61 pruebas: matriz 13 acciones x 4 roles + IDOR sin relación/entre hogares). 55 verdes, 6 rojas (H-T251-1: POST vaccinations/dewormings devuelve 500 para OWNER/ADMIN/CAREGIVER). tsc 0, oráculos CUMPLE, trazabilidad CUMPLE. Línea base del directorio: 11 fallas preexistentes ajenas. Evidencia: claude/evidencia-task-T251-2026-11-12.md. Sin tocar src/specs; tasks.md sin marcar.
