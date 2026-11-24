# Oracle 009 / T1252 punto 5 - RAMA-T1239-03 (retencion admin_audit_entries)
Fecha 2026-11-23. Veredicto: PASS CON OBS. Sin [x], sin commit, sin tocar contratos ni src/generated.

## Compuerta real
- npx tsc --noEmit: exit 0.
- vitest t1239-retencion-privacidad-admin-009.security.spec.ts: 13/13.
- postgres-maintenance.spec.ts con PG17 real (127.0.0.1:55432): 17/17; las 2 pruebas "PostgreSQL real" corrieron (no omitidas), incluida la nueva RAMA-T1239-03.
- verify-oracles.sh: 498 archivos, 0 debiles, CUMPLE.

## Verificaciones
1. Opcion (a): CUMPLE. SQLite suma run(audit_log)+run(admin_audit_entries) en auditRowsPurged; PG agrega 2.o paso STEPS con key auditRowsPurged. MaintenanceCutoffs sin cambio (reusa auditBefore); git diff vacio en specs/003-cloud-gcp y src/generated; 5 claves verificadas con Object.keys en ambos motores.
2. Frontera: CUMPLE. SQLite `occurred_at < @auditBefore` (texto ISO, igual que audit_log); PG `occurred_at::timestamptz < $1::timestamptz` (igual forma que audit_log). Pruebas siembran fila == auditBefore y se conserva (ambos motores).
3. Ediciones a aserciones existentes de postgres-maintenance.spec.ts: son 3 ediciones, todas ADITIVAS y necesarias: (i) TABLES + 'admin_audit_entries' (el test compara el orden exacto de DELETE con [...TABLES]: sin ella falla por la tabla nueva; el orden esta fijado tras audit_log, conforme al STEPS); (ii) byTable toEqual + entrada admin_audit_entries con [auditBefore, BATCH] (toEqual exacto se mantiene, no se relaja a objectContaining); (iii) un expect nuevo toContain timestamptz. No se elimino ni relajo ningun expect, ni se cambio el literal de las 5 claves. NO debilitan. Los tests con mock siguen exigiendo exactamente una sentencia por tabla.
4. Timeout 30_000 en la prueba PG real: OBS-1. Todo el archivo corre en ~1 s, la prueba no se acerca a 5 s (default); no enmascara un problema observado, pero no hay evidencia que lo justifique y es inconsistente con las demas pruebas reales (sin timeout explicito). Recomendado bajarlo/quitarlo; no bloquea.

## Observaciones
- OBS-1: timeout 30_000 injustificado (inocuo).
- OBS-2: JSDoc de unit-of-work.port.ts agrega un segundo bloque /** */ consecutivo sobre MaintenanceCounts (dos comentarios apilados; solo el ultimo es el doc). Cosmetico: fusionar.
- OBS-3 (heredada del architect): spec.md:141/190 aun sin aclarar que el conteo suma a auditRowsPurged (pasada documental de /architect).
- Prueba SQLite: B es frontera y C reciente; mutacion no ejecutada (no se modifico codigo), pero la fila A vencida y el conteo 2 fallarian sin el DELETE nuevo (red-by-design segun architect).
