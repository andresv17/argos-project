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

## T810 verde (enmienda MINOR 3.2.0 de audit-entry de 004 + migraciones M-3)
```
bash scripts/compile-contracts.sh --feature 004|005|006 -> compilado; "git diff --stat -- src/generated/api vacío: OK" (3 veces)
npx vitest run tests/integration/persistence tests/integration/contracts tests/unit/audit-log-adapter.spec.ts
 Test Files  57 passed | 3 skipped (60)   Tests  1019 passed | 149 skipped (1168)
npx vitest run (suite completa)
 Test Files  264 passed | 3 skipped (267)   Tests  3989 passed | 165 skipped (4154)
npx tsc --noEmit -> exit 0
verify-traceability --feature 001, 002, 006 -> "[SDD Traceability Gate] Resultado: CUMPLE" (x3)
verify-oracles --feature 006 -> "Archivos analizados: 311; oráculos débiles: 0 / Resultado: CUMPLE"
```
Suites de 001..005 cambiadas por la enmienda (únicamente): sqlite-repositories.spec.ts (lista de migraciones aplicadas: se añade '0013_home_scenes.sql' en 2 aserciones, sin debilitar) y schema-parity.spec.ts (HOME_PATH en la composición de Postgres).

## T811 rojo (claves de INV-ARC-003 con scenes/ y households/)
```
npx vitest run tests/unit/media-keys-escena-006.spec.ts tests/integration/media
⎯⎯⎯⎯⎯⎯ Failed Tests 13 ⎯⎯⎯⎯⎯⎯⎯
 FAIL  tests/unit/media-keys-escena-006.spec.ts > T811 claves de objeto de la escena (INV-ARC-003, INV-ESC6-009) > SC-ESC6-052: la imagen de la escena y la foto del hogar se derivan solo de UUID v4 y 
 FAIL  tests/unit/media-keys-escena-006.spec.ts > T811 claves de objeto de la escena (INV-ARC-003, INV-ESC6-009) > INV-ESC6-009: un identificador que no es UUID v4 en minúsculas lanza RangeError sin r
 FAIL  tests/unit/media-keys-escena-006.spec.ts > T811 claves de objeto de la escena (INV-ARC-003, INV-ESC6-009) > INV-ARC-003: isMediaObjectKey admite las 5 formas y rechaza mezclas de carpeta, extra
 FAIL  tests/unit/media-keys-escena-006.spec.ts > T811 claves de objeto de la escena (INV-ARC-003, INV-ESC6-009) > INV-ARC-003: assertMediaKey acepta las claves de la escena y rechaza las demás con Ra
 FAIL  tests/unit/media-keys-escena-006.spec.ts > T811 assertListPrefix con scenes/ y households/ (sin RangeError) > REQ-ESC6-029: acepta los prefijos de listado de la conciliación y del borrado en ca
 FAIL  tests/unit/media-keys-escena-006.spec.ts > T811 conciliación: prefijos y antigüedad (H-LCK-006-11, EDGE-ESC6-021) > REQ-ESC6-029: la rutina existente concilia pets/ (24 h) y añade scenes/ y hou
 FAIL  tests/unit/media-keys-escena-006.spec.ts > T811 conciliación: prefijos y antigüedad (H-LCK-006-11, EDGE-ESC6-021) > INV-ARC-003: reconciliationAgeMinutes rechaza una clave que no es de medios
 FAIL  tests/integration/media/t570-media-storage-port.spec.ts > MediaStoragePort: conformidad (memory) > T811 (006, N2-06 (b)): scenes/ y households/ son claves válidas: put, get, list por prefijo (o
 FAIL  tests/integration/media/t570-media-storage-port.spec.ts > MediaStoragePort: conformidad (gcs) > T811 (006, N2-06 (b)): scenes/ y households/ son claves válidas: put, get, list por prefijo (orde
 FAIL  tests/integration/media/t571-dev-media-route.spec.ts > GET /__dev/media/<clave> (T571) > T811 (006): sirve la imagen de la escena y la foto del hogar con sesión, sin sesión 401, y una carpeta a
 FAIL  tests/integration/media/t579-borrado-fisico.spec.ts > T811 borrado físico de claves de la escena (006, N2-06 (b); REQ-ESC6-029, EDGE-ESC6-021, SC-ESC6-044) > [SC-ESC6-044] la cola de borrado ac
 FAIL  tests/integration/media/t579-borrado-fisico.spec.ts > T811 borrado físico de claves de la escena (006, N2-06 (b); REQ-ESC6-029, EDGE-ESC6-021, SC-ESC6-044) > [EDGE-ESC6-021] la fila INTENT de u
 FAIL  tests/integration/media/t579-borrado-fisico.spec.ts > T811 borrado físico de claves de la escena (006, N2-06 (b); REQ-ESC6-029, EDGE-ESC6-021, SC-ESC6-044) > [REQ-ESC6-029] eliminar una mascota
 Test Files  4 failed | 9 passed (13)
      Tests  13 failed | 154 passed | 11 skipped (178)
npx tsc --noEmit -> exit 0
```
La consulta de referencias de scenes/ y households/ en la conciliación (home_scenes.image_id, household_photos) la entregan T834/T835 (Fase 4); T811/T812 fijan el dominio de claves, `assertListPrefix`, la edad de 15 min y la cola de borrado.
