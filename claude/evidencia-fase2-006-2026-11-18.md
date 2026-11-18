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

## T812 verde (enmienda MINOR de INV-ARC-003)
```
npx vitest run tests/unit/media-keys-escena-006.spec.ts tests/integration/media -> 13 archivos pasan; 167 pasan | 11 omitidos (178)
npx vitest run (suite completa, tras corregir oráculos) -> sin fallos salvo los 3 oráculos débiles de mi propio t811 (ver abajo), corregidos
bash scripts/verify-oracles.sh --feature 006 (antes) -> "oráculos débiles: 3 / Resultado: FALLA" (3 `.not.toThrow()` en media-keys-escena-006.spec.ts, escritos por mí en T811)
bash scripts/verify-oracles.sh --feature 006 (después) -> "Archivos analizados: 312; oráculos débiles: 0 / Resultado: CUMPLE"
npx tsc --noEmit -> exit 0
verify-traceability --feature 001, 002, 006 -> CUMPLE (x3)
```
Reconocimiento: la corrida roja de T811 no pasó verify-oracles; las 3 aserciones débiles y una aserción vacua de t579 (`keys()` lista solo `pets/` por defecto) se corrigieron en T812 (más estrictas, no más débiles).
Suites de 001..005 cambiadas por la enmienda: ninguna aserción previa se tocó; solo se añadieron casos (t570, t571, t579, t606).

## T813 rojo (countBytesOfOwner con household_photos)
```
npx vitest run tests/integration/persistence/t813-cuota-foto-hogar.spec.ts
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 5 ⎯⎯⎯⎯⎯⎯⎯
 FAIL  tests/integration/persistence/t813-cuota-foto-hogar.spec.ts > T813 countBytesOfOwner suma pet_media y household_photos (memoria y SQLite) > [REQ-ESC6-018][SC-ESC6-028] la foto del hogar del propietario suma a los bytes de s
AssertionError: memoria propietario del hogar: expected 1000 to be 5000 // Object.is equality
 FAIL  tests/integration/persistence/t813-cuota-foto-hogar.spec.ts > T813 countBytesOfOwner suma pet_media y household_photos (memoria y SQLite) > [REQ-ESC6-001][EDGE-ESC6-013] la foto la sube cualquier administrador pero cuenta a
AssertionError: memoria: expected [ +0, +0 ] to deeply equal [ 700, +0 ]
 FAIL  tests/integration/persistence/t813-cuota-foto-hogar.spec.ts > T813 countBytesOfOwner suma pet_media y household_photos (memoria y SQLite) > [SC-ESC6-064] la subida de un archivo se rechaza con ERR-MEDIA-QUOTA-EXCEEDED cuand
AssertionError: memoria 4000 + 1001 > 5000: expected 'OK' to be 'ERR-MEDIA-QUOTA-EXCEEDED' // Object.is equality
 FAIL  tests/integration/persistence/t813-cuota-foto-hogar.spec.ts > T813 countBytesOfOwner suma pet_media y household_photos (memoria y SQLite) > [SC-ESC6-028] los hogares de otro propietario no suman aunque el usuario sea miembr
AssertionError: memoria: expected [ +0, +0 ] to deeply equal [ +0, 9000 ]
 FAIL  tests/integration/persistence/t813-cuota-foto-hogar.spec.ts > T813 countBytesOfOwner en el SQL de PostgreSQL (doble del cliente; REQ-PG-002) > [REQ-ESC6-018] una sola consulta parametrizada suma pet_media y household_photos
AssertionError: expected 'SELECT COALESCE(SUM(m.size_bytes), 0)…' to match /\bhousehold_photos\b/
 Test Files  1 failed (1)
      Tests  5 failed | 1 passed (6)
npx tsc --noEmit -> exit 0
verify-traceability --feature 001/002/006 -> CUMPLE x3; verify-oracles --feature 006 -> CUMPLE (oráculos débiles: 0)
```
Rojo documentado y esperado hasta T833 (tabla household_photos en SQLite 0013/T832) + T814 (los 4 countBytesOfOwner). Seed: media-harness.seedHouseholdPhoto (memoria: state.householdPhotos; SQLite: INSERT). Sin cobertura de PostgreSQL vivo (sin TEST_DATABASE_URL).

## T815 rojo (ganchos de privacidad, 7 suites)
```
npx vitest run tests/unit/ganchos-privacidad-escena-006.spec.ts
⎯⎯⎯⎯⎯⎯ Failed Tests 18 ⎯⎯⎯⎯⎯⎯⎯
 Test Files  1 failed (1)
      Tests  18 failed | 9 passed (27)
(18 rojas = cada gancho esperado sin llamar; 9 verdes = compatibilidad sin puerto y rechazos sin llamada)
npx tsc --noEmit -> exit 0; verify-traceability 001/002/006 CUMPLE; verify-oracles --feature 006 -> oráculos débiles: 0, CUMPLE
```
HALLAZGO H-KEY-F2-1 (a /architect, T827): el puerto ScenePrivacyHooksPort no está definido en plan/tasks. El contrato de los 8 ganchos (nombres, eventos, `deps.sceneHooks` opcional) es PROPUESTO en tests/fixtures/scene-privacy-hooks-spy.ts (único archivo a cambiar si T827 lo nombra distinto). Roja hasta T862..T868 (T868 cierra la suite).
