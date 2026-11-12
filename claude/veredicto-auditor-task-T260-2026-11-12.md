# Veredicto Oracle - T260 - 2026-11-12
Rama 002-plataforma-v21 @ eec5a23. Veredicto: APTO (con 3 observaciones no bloqueantes). Solo Neo firma COMPLETED.

## Dictamen
T260 NO quedo verde sin construirse: tiene evidencia propia, pero heredada de la fase roja T255 (commit d83cb77) y puesta en verde dentro del commit eec5a23 (titulado T258-T259). Keymaker acierta en "sin cambios nuevos"; se equivoca en la causa ("cubierta por T259"): T259 es canonical-json/state-hash/canonical-view, no la guarda.

## Evidencia (comandos)
1. git log --stat de los dos archivos: superseded-guard.ts nace en eec5a23 (+14, nuevo); record-invariants.ts +29 en eec5a23 (applyRecordUpdate, solo vaccinations, comentario "el resto llega con T260-T263"). T260 no tiene commit propio; su codigo viaja en el commit de T258-T259.
2. Rojo especifico: d83cb77 anade en tests/unit/record-invariants.spec.ts (bloque "T255 fase ROJA") 2 pruebas del guard (SUPERSEDED -> ERR-REC-SUPERSEDED-IMMUTABLE 409; OVERDUE/DUE_SOON/UP_TO_DATE no lanzan) y 4 de vacunas/desparasitaciones 002; evidencia-task-T254-T257 documenta rojo literal "Failed to load url .../superseded-guard.ts". Las 4 de proxima fecha/lote y las propiedades de records/alerts nacieron YA VERDES (T251 las cumplia; la evidencia lo admite). Asi, lo que T260 realmente convirtio de rojo a verde es la guarda.
3. Proxima fecha opcional: record-invariants.spec.ts:268-ish (null OK en vacuna y desparasitacion; igual a appliedAt -> ERR-REC-INVALID-BOOSTER-DATE / ERR-REC-INVALID-NEXT-DOSE-DATE; +1 dia OK) y records.property.spec.ts:154 (oraculo con nextDelta null/-3..3, 400 corridas, solo vacunas). Mutacion mental (aceptar null->error, o <= por <): ambas pruebas fallan. No se mutó src (prohibido).
4. STATE-ALERT-001: ejercitado por pruebas reales, no solo @implements: pet-and-alerts.spec.ts:299-374 (umbrales, orden, SUPERSEDED, resumen), alerts.property.spec.ts:65-150 (oraculo independiente, FX-ALR-007 sin fecha, reversion de SUPERSEDED).
5. Compuertas: tsc --noEmit = 0 errores; verify-oracles = 88 archivos, 0 debiles, CUMPLE; verify-traceability --feature 002 --task T260 = 8/8 CUMPLE, pureza 0; vitest 4 archivos = 78/78 verdes.

## Observaciones (no bloqueantes)
- O1: El guard solo tiene prueba unitaria con string; el disparo real (estado calculado SUPERSEDED en PATCH/DELETE) se prueba en pets-records.api.spec.ts:546 (T263 territorio). T260 sola prueba el contrato de la funcion, no su cableado.
- O2: eec5a23 mezclo alcance de T260/T263 (guard, applyRecordUpdate, rutas PATCH/DELETE de vacunas) dentro del commit T258-T259; el mensaje solo nombra el guard. Trazabilidad por commit imprecisa; no hay perdida de cobertura.
- O3: La propiedad de proxima fecha cubre solo nextBoosterAt; nextSuggestedDoseAt solo con casos unitarios (suficiente, no exhaustivo). H-T258-O1 (generalizar a {collection}/{recordId}, 6 modulos) sigue siendo de T263.
