# Evidencia Fase 2 de la 006 (enmiendas N2-05 y N2-06), Keymaker, 2026-11-18
Salida literal de terminal por tarea. Sin push, sin [x].

## T809 rojo (salida literal de vitest, resumen de fallos)
```
⎯⎯⎯⎯⎯⎯ Failed Tests 11 ⎯⎯⎯⎯⎯⎯⎯
 FAIL  tests/integration/contracts/t809-auditoria-escena-006.spec.ts > T809 contrato de auditoría 004 (3.2.0): entity_type de la escena > REQ-ESC6-021: AuditEntityType admite HOME_SCENE, SCENE_CONSENT y HOUSEHOLD_PHOTO y conserva 
 FAIL  tests/integration/contracts/t809-auditoria-escena-006.spec.ts > T809 contrato de auditoría 004 (3.2.0): entity_type de la escena > REQ-ESC6-021: la lista de entidades es exactamente los 14 valores de 3.1.0 más los 3 nuevos,
 FAIL  tests/integration/contracts/t809-auditoria-escena-006.spec.ts > T809 contrato de auditoría 004 (3.2.0): entity_type de la escena > INV-ESC6-016: una fila de auditoría de la escena valida con CREATE, UPDATE y DELETE y no adm
 FAIL  tests/integration/contracts/t809-auditoria-escena-006.spec.ts > T809 contrato de auditoría 004 (3.2.0): entity_type de la escena > REQ-ESC6-021: x-sdd-metadata declara MINOR 3.2.0 con trazabilidad a REQ-ESC6-021 e INV-ESC6-
 FAIL  tests/integration/contracts/t809-auditoria-escena-006.spec.ts > T809 tipos y validadores generados (INV-ARCH-003) > REQ-ESC6-021: src/generated/v31 incluye los 3 valores en el tipo y en el validador
 FAIL  tests/integration/contracts/t809-auditoria-escena-006.spec.ts > T809 tipos y validadores generados (INV-ARCH-003) > REQ-ESC6-021: src/generated/v33 incluye los 3 valores en el tipo y en el validador
 FAIL  tests/integration/contracts/t809-auditoria-escena-006.spec.ts > T809 tipos y validadores generados (INV-ARCH-003) > REQ-ESC6-021: src/generated/v34 incluye los 3 valores en el tipo y en el validador
 FAIL  tests/integration/contracts/t809-auditoria-escena-006.spec.ts > T809 CHECK de audit_log en SQLite (migración 0013) > REQ-ESC6-021: audit_log admite las 3 entidades nuevas y rechaza cualquier otra
 FAIL  tests/integration/contracts/t809-auditoria-escena-006.spec.ts > T809 CHECK de audit_log en SQLite (migración 0013) > REQ-ESC6-021: antes de 0013 no las admitía; migrar conserva las filas byte a byte, los 3 índices y la fila
 FAIL  tests/integration/contracts/t809-auditoria-escena-006.spec.ts > T809 CHECK de audit_log en Postgres (migración 0009, texto) > REQ-ESC6-021: 0009_home_scenes.sql reconstruye audit_log_entity_type_check con los 17 valores, si
 FAIL  tests/integration/persistence/schema-parity.spec.ts > paridad estática 0001_baseline.sql + 0002 vs SQLite final (REQ-PG-003, REQ-MIG-001) > T809 (006, N2-06 (a)): el CHECK de audit_log.entity_type admite HOME_SCENE, SCENE_C
 Test Files  2 failed (2)
      Tests  11 failed | 15 passed | 1 skipped (27)
npx tsc --noEmit -> exit 0
```
