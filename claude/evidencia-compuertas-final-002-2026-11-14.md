# Evidencia compuertas finales 002 — 2026-11-14 (Keymaker, sin commit)
Salidas completas en /private/tmp/claude-501/-Users-andresvalejo-Documents-Tecnica-Proyecto-Argos/515ca0fd-4e96-4cc9-9f37-4bd18c1a2a1a/scratchpad/{1-oracles,2-trace,3-contracts,4-tsc,5-coverage,6-e2e}.out. Secuencia estricta; E2E con ARGOS_AUDIT_HMAC_SECRET efímero.

| # | Compuerta | Comando | EXIT | Conteos |
|---|---|---|---|---|
| 1 | T305 | bash scripts/verify-oracles.sh | 0 | 116 archivos, 0 débiles, CUMPLE |
| 2 | T306 | bash scripts/verify-traceability.sh --feature 002 | 0 | 118/118, pureza 0 violaciones, CUMPLE |
| 3 | T309 | bash scripts/compile-contracts.sh --feature 002 | 0 | contratos compilados a src/generated |
| 4 | tsc | npx tsc --noEmit | 0 | sin errores |
| 5 | coverage | npm run test:coverage | **1** | 90 archivos, 1796/1796 pruebas OK; líneas/stmts 88.29 % (2927/3315) < umbral 95 %; ramas 97.09 %; funciones 96.41 % |
| 6 | e2e | npm run test:e2e | 0 | 53 passed |
| 7 | test:gate | no ejecutado | n/a | encadena test:mutation (prohibido relanzar; aprobado 88.98 %, EXIT=0) y falla en coverage |

## Diagnóstico del rojo de cobertura
- Ninguna prueba falla. El umbral falla por los 11 archivos src/application/ports/*.ts (solo interfaces, sin código ejecutable): v8 los reporta con 0 % y 369 líneas no cubiertas de las 388 totales.
- Sin ports, las líneas no cubiertas son 19 de ~2946 (~99.4 %); mayores: household-policies.ts 98.69 %, record-invariants.ts 98.08 %, backup-use-cases.ts 99 %, record-use-cases.ts 97.81 %.
- vite.config.ts (coverage.include 'src/domain/**','src/application/**', umbral 95) no cambió respecto a HEAD. No es defecto de src/.
- Remedio posible (no aplicado): coverage.exclude de 'src/application/ports/**' en vite.config.ts. Cambia el criterio de cobertura (config/Constitución §5): Caso B, requiere Architect/Neo.
