# Oracle 009 T1216 — Auditoría en disco de la Fase 1 (bloques A #60 y B #57)

Fecha: 2026-11-23. Auditor: `/oracle`. Base: HEAD 5e785a2 + cambios sin commit de `/keymaker`. Alcance: T1207..T1215 y dependencias T1279..T1283. No se corrigió código, no se marcó `[x]`, no se commiteó.

## Veredicto: PASS CON OBSERVACIONES

No hay defecto en el código de Fase 1. Las observaciones son un oráculo ajeno a la fase que falla (gates-004), una cita errónea en la tarea y el estado de la compuerta de trazabilidad de 009 (depende de contratos que aún no existen).

## Tabla de verificaciones

| # | Verificación | Resultado | Evidencia |
|---|---|---|---|
| 1 | Alcance del diff | PASS | 29 archivos tracked (271+/77-) en `src/` (16), `tests/` (11) y `specs/` (007 spec.md, 006 spec.md y 005 tasks.md; ver obs. 5). Sin cambios en `src/generated/`, `specs/*/contracts/`, `scripts/` ni migraciones (`git status` vacío en esas rutas). Cuatro tests nuevos sin trackear: `t1207-conteo-sin-llamada-escena-009`, `t1208-cuota-global-sin-llamada-escena-009`, `t1213-prompt-orden-preservacion-escena-009` (cubre T1213/T1214/T1283), `t1279-plazo-y-tope-escena-009` |
| 2 | Paridad Memoria / SQLite / PG | PASS | Las tres implementaciones añaden `countClosedWithoutCallByScene` y `cancelStaleUnmarkedAttempts` y filtran `countFailedAttemptsByScene` (`provider_call_started_at IS NOT NULL`) y `countAttemptsByActor` (`marca NOT NULL OR outcome IS NULL`). PG real ejecutado con `TEST_DATABASE_URL=postgres://argos_test:argos_test@127.0.0.1:55432/argos_test` (contenedor `proyectoargos-postgres-1` arriba): 14 pruebas PG reales de t1207 ejecutadas, ninguna omitida. Total de las 4 suites nuevas: 61/61 verdes. El único skip de la corrida completa (1) es ajeno (otra suite, no de 009) |
| 3 | Sin migración nueva | PASS | Ningún archivo de migración tocado ni nuevo. `t1207` incluye la prueba SC-009-041 (columna `provider_call_started_at` ya existente en sqlite y postgres) |
| 4 | Prompt (T1213/T1214/T1283) | PASS | `build-image-prompt.ts`: orden desde cero = STYLE, hogar, líneas `Pet k`, `PRESERVATION_BLOCK` (solo si hay línea con foto), JSON (solo sin foto), `Place all N` (N>=2), conteo o `Draw no animals in this room.` (N=0, ya no `PET_COUNT_RULE`), `PIXEL_REDRAW_RULE`. Incrementales: `PRESERVATION_BLOCK` inmediatamente antes de `PIXEL_REDRAW_RULE` y solo con `ADD`/`REPLACE` con foto. JSON antes de `Place all` verificado. El invariante de una sola aparición se formula sobre la constante `PRESERVATION_BLOCK` |
| 5 | Cuota | PASS | `scene-run-use-case.ts`: verificar vigencia (`stillCurrent`, sin consumir) -> `tryConsume` -> reverificar y marcar `markProviderCall` -> si falla, `refund(window)` y cierre `CANCELLED`. Agotada: `FAILED` sin marca. `refund` con `value > 0` (nunca negativo), falla cerrado. Plazo 10 min: `SCENE_UNMARKED_ATTEMPT_TTL_SECONDS = 600`. Tope 20: `SCENE_MAX_CLOSED_WITHOUT_CALL_PER_DAY = 20` solo en `app-config.ts`, inyectado vía `scene-composition.ts`; el dominio lo recibe como dato (`closedWithoutCall.max`); `grep` sin literales 20/600 en use-cases ni dominio. Comentario del puerto documenta que `tryConsume` y marca NO comparten transacción y el sobreconteo aceptado (T1210/T1282) |
| 6 | Oráculos | PASS | `bash scripts/verify-oracles.sh`: exit 0, 461 archivos analizados, 0 débiles, CUMPLE (incluye los 4 tests nuevos y t853, t851, t834, t1071 x2, t841, t939, t874, t947, t951) |
| 7a | `npx tsc --noEmit` | PASS | exit 0 |
| 7b | vitest `tests/unit tests/security tests/integration` | 1 FALLO ajeno | 389/390 archivos; 6077 pasan, 1 falla, 1 omitido (de 6079). El fallo: `tests/integration/contracts/gates-004.spec.ts:149` (ver H-1) |
| 7c | `verify-traceability.sh --feature 009` | exit 2 (esperado hoy) | «Fuente ausente: specs/009-aprobacion-admin-correo/contracts/errors/error-catalog.json». Los contratos de 009 aún no existen (se crean en Fases 2+). No es regresión de Fase 1 (ver H-4) |
| 7d | `--feature 007` / `006` / `008` | PASS | 007: exit 0, 51/51 trazados; 006: exit 0, 196/279 (igual que en el `test:gate`), CUMPLE, pureza 0 violaciones; 008: exit 0, 66/66 |
| 7e | `npm run test:gate` | exit 1 | Compuertas intermedias CUMPLE (traza 002 124/124, 003 33/120, 006 196/279; oráculos 0 débiles; tsc OK). vitest con cobertura: 397/398 archivos, 6119 pasan, 1 falla, 1 omitido. Único fallo = gates-004 (H-1). `src/generated/` sin cambios tras el gate |

## Hallazgos (reportados, no corregidos)

- **H-1 (a)** `tests/integration/contracts/gates-004.spec.ts:148-149` espera que `verify-oracles.sh --feature 009` salga con exit 2 (feature desconocida) y hoy sale 0 (`expected +0 to be 2`). El script ya acepta 009. Fallo preexistente de supuesto obsoleto de la 004 que rompe `npm run test:gate` y el CI. Recomendación: pedir a `/architect`/`/keymaker` usar un identificador realmente inexistente (p. ej. `999`) en esa prueba, sin relajar el aserto.
- **H-2 (b)** `SC-007-035` está citada por error en `T1212` y `T1215` (es «Fallecido a Vivo», `EDGE-007-016`). Los criterios de prompt afectados son `SC-007-039` y `SC-007-043` (confirmado en el acta de `/architect`). Corrección documental pendiente de `/architect`.
- **H-3 (c)** PG real NO quedó en skip: se ejecutó contra PG17 en `127.0.0.1:55432` con las 14 pruebas reales de t1207 verdes. Sin `TEST_DATABASE_URL` esa suite se omite por diseño (`describe.skipIf`); el CI debe definir la variable para que la paridad PG cuente.
- **H-4** `verify-traceability.sh --feature 009` sale 2 por ausencia de `contracts/errors/error-catalog.json` (y demás contratos 009, T1217+). La compuerta de T1216 pedida («`--feature 009` verde») no es satisfacible hasta que existan los contratos de 009; la entrada `--feature 009` de `compile-contracts.sh` se añade en `T1217` (Nivel 2). Recomiendo que `/morpheus` registre que esa parte de T1216 queda condicionada a T1217 o se acepte como diferida.
- **H-5 (obs. 5)** `specs/005-album-archivos-clinicos/tasks.md` aparece modificado con `T797` pasando a `[x]`. Estaba en el estado inicial del working tree (cambio ajeno, MER-11, atribuible a Neo/otro flujo); no es parte de la Fase 1, no fue tocado ni revertido por este auditor y no se atribuye a `/keymaker`. Nivel 2: solo Neo puede firmarlo.
- **H-6** No hay desviaciones de oráculo: ninguna aserción relajada detectada en los tests actualizados (la compuerta da 0 débiles). Pendiente de contraste fino por `/oracle` en T1216 posterior: `T1211`, `T1214` y `T1280` no tienen archivo propio (están cubiertos en t1207/t1213/t1208), lo cual es aceptable mientras `tasks.md` los referencie.

## Conteos

- Archivos tracked cambiados: 29 (271 inserciones, 77 eliminaciones); tests nuevos: 4 archivos, 61 pruebas, 100 % verdes (14 en PG real).
- Corrida completa unit+security+integration: 6077 verdes / 1 fallo (gates-004) / 1 omitido.
- `test:gate`: 6119 verdes / 1 fallo (gates-004) / 1 omitido.

## Siguiente paso

`/architect` corrige la cita `SC-007-035` en `T1212`/`T1215` y la entrada obsoleta de gates-004; `/morpheus` decide el tratamiento de `--feature 009` hasta T1217. Los bloques A y B quedan listos para firma `[x]` de Neo tras resolver H-1 (única barrera real del `test:gate`).
