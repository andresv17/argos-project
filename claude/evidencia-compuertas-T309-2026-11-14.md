# Evidencia de compuertas T305/T306/T309 — 2026-11-14 (Keymaker, sin commit)
| # | Comando | EXIT | Conteos |
|---|---|---|---|
| 1 | bash scripts/verify-oracles.sh (T305) | 0 | 118 archivos, 0 oráculos débiles |
| 2 | bash scripts/verify-traceability.sh --feature 002 (T306) | 0 | 118/118 IDs; pureza 0 violaciones |
| 3 | bash scripts/compile-contracts.sh --feature 002 (T309) | 0 | generación completa en src/generated |
| 4 | npx tsc --noEmit | 0 | sin errores |
| 5 | npx vitest run | 0 | 92/92 archivos, 1812/1812 pruebas |
| 6 | npm run test:coverage | 0 | 92/92, 1812/1812; líneas 99.35 % (2927/2946), ramas 97.89 % (1305/1333), sentencias 99.35 % (ports excluido) |
| 7 | npx playwright test tests/e2e (HMAC efímero) | 0 | 53 passed |
| 8 | npm run test:gate | NO EJECUTADO | encadena test:mutation; sustituida por informe aprobado 88.98 %, EXIT=0, reports/mutation/mutation.html. Las demás etapas del gate se cubrieron en 1-7. |
