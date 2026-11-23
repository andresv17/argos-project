# Oracle 009 T1253 — Compuerta final Fase 4 (#18) — 2026-11-23

Veredicto: PASS CON OBS. Sin [x], sin commit, sin push, contratos y src/generated intactos.

## Compuerta real
- npx tsc --noEmit: exit 0.
- bash scripts/verify-oracles.sh: CUMPLE (498 archivos, 0 debiles), exit 0.
- npm run test:gate con PG17 (TEST_DATABASE_URL 127.0.0.1:55432): exit 0; 426 files / 6501 passed / 1 skipped; cobertura lineas 98.87%.
- verify-traceability.sh --feature 009: exit 1, 60/78 trazados, 0 violaciones de pureza; 18 FAIL, NINGUNO de Fase 4.

## Criterio de alcance (T1253 y estructura de fases)
T1253 [GOV] [GH:#18] es la compuerta del bloque Fase 4; cita REQ-APR9-001/003/006 y SC-009-001..008 y exige "contraste ... y compuerta (verify-traceability --feature 009, tsc, test:gate)". No dice "FALLA cero". La compuerta por feature en modo final falla por diseno mientras haya fases abiertas (precedente: T1223 43/79, T1240 52/79 firmados con FALLA residual de fases posteriores). El cierre con FALLA cero es de T1273 (Fase final, dep T1253 y T1272). Criterio aplicado: los IDs de Fase 4 (REQ-APR9-001..005,007, STATE-ACCT9-001) no aparecen en FAIL; el FALLA residual es solo de otras fases.
Correccion al encargo: no todos los 18 son Fase 5 (#20). Son Fase 5: ERR-ADMIN-PARAMETER-PRECONDITION-FAILED, ERR-ADMIN-QUOTA-RESET-CONFLICT, ERR-ADMIN-SCENE-COST-CAP-EXCEEDED, INV-CFG9-001/002/003, REQ-CFG9-001..008 (T1256+). Son Fase 1 (#60/#57, tareas [x] T1207/T1209/T1211/T1212/T1215): REQ-LIM9-004, REQ-LIM9-005 (solo en titulos de describe), REQ-PRO9-007 (sin titulo it/test), INV-LIM9-001 (sin @implements). Ya figuraban FAIL en T1240 (27 FAIL); no los introduce la Fase 4.

## Verificaciones en disco
1. REQ-APR9-001..005 y 007: @implements en src/ (6/9/7/1/10/4 archivos) y tests (9/7/4/4/6/5); STATE-ACCT9-001 en src/application. SC-009-001..008 y 049 citados en tests (1..5 archivos c/u). EDGE-009-001..007, 038..040 con tests. EDGE-009-033 sin tests: su texto de supresion anticipada fue retirado por el corte soberano de Neo; la purga a 30 dias la cubren REQ-APR9-007/SC-009-049. REQ-APR9-008 excluido por Neo (script lo excluye, T1290/T1291 retiradas).
2. grep EmailSender|nodemailer|sendgrid|mailgun|postmark|smtp|client-ses|resend en src/ (sin generated) y package.json: 0 coincidencias. REQ-APR9-006 diferido (D9-01 = A), EXCLUDED en el script, sin cobertura en src/tests (correcto). package.json/lock sin cambios.
3. Cambios sin commit de T1250-T1252 y limpieza: src/ M = unit-of-work.port, maintenance-use-cases, postgres-maintenance, sqlite-unit-of-work, AdminPortal.tsx; nuevos RegistrationsPanel.tsx, registrations-api.ts, registrations-view.ts; tests t1250 unit, t1251 e2e, 3 specs modificados. Coinciden con actas oracle T1250, T1251, T1252-retencion, rama-009-T1252, trinity-009-T1252.

## Observaciones
- OBS-1: trazabilidad 009 sigue en FALLA (Fase 1 x4, Fase 5 x14); debe quedar en cero antes de T1273. Los 4 de Fase 1 requieren titulo it/test con REQ-LIM9-004/005, REQ-PRO9-007 y @implements INV-LIM9-001 (keymaker; tarea nueva o arrastre a T1273) porque T1216 se firmo con ellos abiertos.
- OBS-2: parte /seraph de T1253 (accesibilidad/cookies) no cubierta por este acta; Morpheus debe despacharla.
- OBS-3: E2E multi-navegador y suite fuera de test:gate no re-ejecutados aqui (cubiertos por actas T1250/T1251).
