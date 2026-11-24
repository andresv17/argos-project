# Oracle 009 T1240 — reintento unico (2026-11-23)
Previo: oracle-009-T1240-fase3-final.md (BLOCKED). Sin ediciones, sin commit, sin [x].

| Item | Comando | Resultado |
|---|---|---|
| Fix 1 schema-parity (0015 tras DELETE_INTENT_PATH) | diff en disco | PASS |
| Fix 2 presentation allowedEntries + ADR-009-17 | diff + plan.md:63 | PASS |
| Fix 3 focusKey WebKit | git diff e2e | PASS CON OBS (ver abajo) |
| a | TEST_DATABASE_URL=PG17 npx vitest run tests/integration/persistence | PASS: 57 archivos, 882 passed, 1 skipped (883); PG real corrio |
| b | vitest run presentation-architecture.spec.ts | PASS: 4/4 |
| c | verify-traceability.sh --feature 009 | exit 1 esperado: 52/79 trazados, 27 FAIL (ERR-ADMIN-*, INV-CFG9/LIM9, REQ-APR9/CFG9/LIM9-004/005/PRO9-007, STATE-ACCT9-001); 0 ADM9 en FAIL; pureza 0 violaciones. OBS: Oracle no verifico contra tasks.md que los 27 sean exactamente Fase 4-5; ninguno es ADM9 |
| d | verify-oracles.sh | PASS exit 0 (483 archivos, 0 debiles) |
| e | npx tsc --noEmit | PASS exit 0 |
| f | npm run test:gate (PG17) | PASS exit 0: 415 archivos passed, 6377 passed, 1 skipped (6378); cobertura Lines 98.87% (6476/6550), Stmts 98.87%, Branches 95%, Funcs 99.7% |
| g | E2E_FIREFOX=1 E2E_WEBKIT=1 playwright tests/e2e/admin 3 proyectos | PASS exit 0: 75 passed; por proyecto chromium 25, firefox 25, webkit 25; 0 fail, 0 skip |

## Juicio focusKey (A6/A7)
Diff verificado: solo cambian la firma ({page, browserName}) y las teclas Tab -> focusKey(); aserciones (skip link focused, destino focused, anillo >=2px/sombra, no focused tras 3er avance) identicas. Chromium/Firefox siguen con Tab (la funcion devuelve 'Tab' salvo webkit+darwin). Adaptacion honesta, no debilitamiento.
Veredicto sobre la afirmacion de Keymaker: PLAUSIBLE (no CONFIRMED por Oracle). Es comportamiento conocido de Safari/WebKit en macOS (Tab solo recorre campos salvo preferencia; Option+Tab recorre todo), y los 25 tests WebKit pasan con el cambio, pero Oracle no reprodujo el estado previo ni inspecciono document.activeElement. Un skip condicional habria sido peor: dejaria sin cobertura de teclado en WebKit/macOS justo donde se puede probar; Alt+Tab conserva la cobertura. Obs: en WebKit Linux/CI se usa Tab, ruta no ejercitada aqui.

## NOT RUN
Cloud Run real; Google OAuth real; HTTPS Secure real; Fase 4-5; retencion de admin_audit_entries (pendiente Neo); confirmacion MINOR constitucional (pendiente Neo); cierre [x] (pendiente Neo); WebKit en Linux.

## Veredicto
Gate T1240 VERDE (PASS CON OBS). Marcado [x] reservado a Neo.
