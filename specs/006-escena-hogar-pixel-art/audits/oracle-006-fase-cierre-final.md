# Oracle 006: auditoria final de cierre de la Fase 13 (T935..T943)

Fecha: 2026-11-19. Rama `006-escena-hogar-pixel-art`, HEAD `ea2c0f7`, Fase 13 sin commit. Autor: `/oracle` (sonnet). Sin cambios de codigo, tests, contratos ni `tasks.md`; sin commit ni push.

## Veredicto: PASS CON OBSERVACIONES (sin bloqueantes)

## 1. Tareas (tasks.md)
T910, T923, T934, T935..T943, T824, T885, T900 en `[ ]`. Ninguna Fase 13 en `[x]`. Sin desviacion.

## 2. Contratos
- `scene.schema.json` 1.1.1 (PATCH, `supersedes` 1.1.0); el diff solo toca version, change_note, descripciones y el listado de cobertura (`SC-ESC6-134`). OpenAPI `3.4.0` (summary y description). Sin cambio de propiedades, tipos, enum, required ni additionalProperties.
- `src/generated/v34` (9 archivos): el diff son descripciones/comentarios y version; coherente con el contrato. `git status` sobre `src/generated` identico antes y despues del gate (que recompila).

## 3. Codigo
- Frase del hogar en disco (`build-image-prompt.ts:34`): «Draw a brand-new 32-bit retro video-game isometric cutaway room diorama, like a classic pixel-art indie game, inspired by … ${photoRef}.»; `PIXEL_REDRAW_RULE` positivo (linea 26). Cero «Recreate» en codigo, t939 y plan; en spec.md solo mencion historica de frases sustituidas (lineas 158, 754). spec/plan/t939 citan la frase vigente.
- Contador: `scene-view.ts` `cooldownStep`/`startCooldownCountdown` (tick de 1 s; al llegar a 0 `onExpire` -> `reload()`, sin margen). `SceneBlock.tsx`: el motivo/contador se pinta en `<p id=reasonId>` fuera del unico `role="status" aria-live` (linea 69, que solo muestra `sceneStatusText`); sin aria-live nuevo.
- INV-ESC6-001 (pureza, t826 + gate de pureza 0 violaciones), INV-ESC6-010 (enmendada N2-18) e INV-ESC6-017 (sin biography/fallbackContext) con pruebas en t841/t855/t939; verdes.
- N2-16: SC-ESC6-125 con redaccion asentada (B+C). OBS-2 y OBS-5 de T942 cerradas.

## 4. Compuertas (en orden)
| Compuerta | Resultado |
|---|---|
| `verify-traceability.sh --feature 006` | rc 0, CUMPLE, 241/241 propios, 198/278 trazados, pureza 0 |
| `verify-oracles.sh` | rc 0, CUMPLE, 376 archivos, 0 debiles |
| `npx tsc --noEmit` | rc 0 |
| `npm run test:gate` (PG17 `127.0.0.1:55432`, contenedor healthy, `TEST_DATABASE_URL` exportada; 0 red externa) | rc 0; 326 archivos pasan, 5122 pasan, 1 omitida, 0 rojas; cobertura 98.84 % lineas, 95.58 % ramas, 99.65 % funciones; 73 s |
| `node scripts/scan-secrets.mjs repo` | 0 hallazgos |

Maquina: reposo razonable al iniciar (load 2.1-2.6); T591R-2 paso (350 ms). DEUDA-006-T591R2-TIMING sigue sin resolver. Delta vs T942: +8 pruebas (M1/M2 + contador/frase).

## 5. Observaciones
- OBS-1: DEUDA-006-AVISO-REGENERACION (A2), DEUDA-006-M4-TOPE-REGENERATE, DEUDA-006-INCREMENTAL-SERVIDOR y DEUDA-006-T591R2-TIMING siguen abiertas por decision de Neo.
- OBS-2: M1 es solo candado de composicion (sin guarda de produccion), segun decision.
- OBS-3: T938 corre en memoria; el gate completo si usa PG17.
- OBS-4: `scripts/gh-project-sync.mjs` no pertenece a 006 (sin mencion en specs/006); excluir.

## 6. Ambito de commit de la Fase 13 (rutas explicitas)
- src/: `src/domain/scene/build-image-prompt.ts`, `src/domain/scene/pet-phrases.ts`, `src/presentation/web/components/SceneBlock.tsx`, `src/presentation/web/scene-view.ts`
- src/generated: `src/generated/v34/api/openapi-types.ts`, `src/generated/v34/errors/field-errors.ts`, `src/generated/v34/schemas/types.ts`, `validators.cjs`, `validators.d.cts`, `validators.d.mts`, `validators.mjs` (todos bajo `src/generated/v34/schemas/`)
- tests modificados: `tests/security/t874-escena.security.spec.ts`, `tests/unit/gemini-api-composicion-escena-006.spec.ts`, `tests/unit/presentation/t875-escena-presentacion.spec.ts`, `t876-escena-integracion.spec.ts`, `t879-escena-sati-correcciones.spec.ts`, `t916-escena-espera.spec.ts`, `tests/unit/t841-prompt-payload-escena-006.spec.ts`, `tests/unit/t855-run-scene-generation-escena-006.spec.ts`
- tests eliminado: `tests/unit/presentation/t931-escena-ayuda.spec.ts`
- tests nuevos: `tests/unit/presentation/t936-escena-boton-unico.spec.ts`, `tests/unit/t938-regenerar-caracterizacion-escena-006.spec.ts`, `tests/unit/t939-prompt-inspiracion-conteo-escena-006.spec.ts`
- specs: `specs/006-escena-hogar-pixel-art/{spec,plan,tasks}.md`, `contracts/schemas/scene.schema.json`, `contracts/openapi/home-scene.openapi.yaml`
- audits: `specs/006-escena-hogar-pixel-art/audits/architect-006-fase-t935.md`, `architect-006-fase-t941.md`, `architect-006-fase-alineacion-cierre.md`, `oracle-006-fase-t942.md`, `oracle-006-fase-cierre-final.md`
- Excluidos: `claude/*`, `.claude/*`, `tests/chaos/`, `logos.json`, `logos.json.bk`, `scripts/logos.py`, `scripts/gh-project-sync.mjs`, `specs/005-album-archivos-clinicos/tasks.md`, `.gitignore`, `CLAUDE.md`, `gate-T296-output.txt`, `.playwright-mcp/`, `.specify/memory/audits/*`.
