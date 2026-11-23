# Acta Oracle — Reconfirmación T1223 (feature 009, fase 2) — MAX_RETRY = 1

Fecha: 2026-11-23. Rama: 009-aprobacion-admin-correo. Acta previa: oracle-009-T1223-fase2.md (ORA-T1223-01).

| # | Verificación | Resultado literal |
|---|---|---|
| 1a | account-deletion-google.ts usa notifyActivity en startReauth y deleteAccount tras respuesta ok | import línea 10; `notifyActivity()` línea 92 dentro de `send()` (común a ambas), tras `if (!response.ok) {... throw}`. CUMPLE |
| 1b | Sin fetch directo en account-deletion-google.ts | grep fetch = 0 coincidencias. CUMPLE |
| 1c | api.ts añade createRawTransport sin la palabra fetch | función en línea 28; `grep -c fetch api.ts` = 0. CUMPLE |
| 2 | ui-invitation-logs.security.spec.ts sin modificar; lista blanca intacta | git diff vacío, sin entrada en git status; lista `['media-api.ts','scene-api.ts','share-api.ts']` (línea 62); suite 9 tests pasan en el gate. CUMPLE |
| 3 | Solo 3 archivos cambiados en la corrección | `find -newer` del acta previa: api.ts, account-deletion-google.ts, t1220-eliminar-cuenta-google-009.spec.ts (nada más en src/tests/scripts). CUMPLE |
| 4 | npm run test:gate con PG17 (TEST_DATABASE_URL real) | EXIT=1. Test Files: 1 failed, 401 passed (402). Tests: 1 failed, 6189 passed, 1 skipped (6191). Único fallo: verify-ci-ready.spec.ts "el repo real: la comprobacion (ii)..." por archivo sin seguimiento (`0014_oauth_flow_delete_intent.sql`, schema-parity.spec.ts:43) = ESPERADO (regla 6, archivos sin commit). Cobertura: no emitida (vitest no imprime el reporte al fallar el run). |
| 5a | npx tsc --noEmit | exit 0, 0 líneas. (Una primera pasada concurrente con el gate dio exit 2 por regeneración de src/generated/ mientras compile-contracts corría; artefacto de carrera, no defecto. Repetida en aislamiento: 0.) |
| 5b | verify-oracles.sh | exit 0; 466 archivos, oráculos débiles: 0; CUMPLE |
| 5c | verify-traceability --feature 008 | exit 0; CUMPLE |
| 5d | verify-traceability --feature 007 | exit 0; CUMPLE |
| 6 | Esperados | verify-ci-ready (sin commit) confirmado; traceability 009 final no ejecutada (fases 3-9 pendientes). |

## Hallazgos
- ORA-T1223-01: CERRADO.
- OBS-1: cobertura no verificable en este gate por el único fallo esperado de verify-ci-ready; reevaluar tras commit (el fallo desaparece al versionar la migración 0014).
- OBS-2: ejecutar tsc nunca en paralelo con test:gate (regenera src/generated).

## Veredicto: PASS CON OBSERVACIONES
Sin hallazgos bloqueantes. Ningún código editado, nada commiteado, ningún [x] marcado.
