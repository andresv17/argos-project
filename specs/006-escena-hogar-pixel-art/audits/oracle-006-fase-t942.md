# Oracle 006: auditoria forense Fase 13 (T935..T940, T942), compuertas T942

Fecha: 2026-11-19. Rama `006-escena-hogar-pixel-art`, HEAD `ea2c0f7`, Fase 13 sin commit. Autor: `/oracle` (sonnet). Sin cambios de codigo, tests, contratos ni `tasks.md`; sin commit ni push.

## Veredicto: PASS CON OBSERVACIONES

## 1. Estado de tareas (tasks.md en disco)
T910, T923, T934 `[ ]`; T911..T922 y T924..T933 `[x]` (commits a088f1c, ea2c0f7); T935..T943 todas `[ ]`. Sin desviacion. T941 pendiente de N2-17 (no es faltante).

## 2. Decisiones de Nivel 2 verificadas en codigo
- Boton unico (`scene-view.ts` `sceneGenerateState`, `SceneBlock.tsx`): `failed` -> «Reintentar»; `imageTag === null` -> «Crear imagen del hogar»; si no «Regenerar imagen del hogar». Sin boton «Actualizar», sin `SCENE_*_HELP_TEXT`, sin `onUpdate`; `onClick` siempre `run('REGENERATE')`, clave `crypto.randomUUID()` por clic. `canUpdate` y `NO_CHANGES` ya no se leen. Regla de cliente `idle` deshabilitado con motivo visible.
- Foto del hogar como inspiracion (`build-image-prompt.ts` `householdBlock`): frase nueva con `${photoRef}`; la frase generica sin foto, `STYLE_BASE_TEXT`, `PIXEL_REDRAW_RULE`, `PET_COUNT_RULE`, `STYLE_CLOSING`, «Place all N pets» y el bloque incremental no aparecen en el diff (intactos). `scene-spec.ts` y `decide-mode.ts` sin modificar.
- Conteo (`pet-phrases.ts` `animalCountLine`, `petSpeciesLabel`): «Exact animal count: N total (...)» calculado del payload sin `REMOVE`, sin cifra quemada, `null` con N = 0 (no se emite); grupos por primera aparicion (`Map`), plural regular, `OTHER` entre comillas invariable. Lineas `Pet k (especie): ...` siempre. INV-ESC6-001/010/017: sin id, nombre, biography, fallbackContext ni breed libre; `speciesOther` saneado (prueba de inyeccion en t939).

## 3. Contratos y generated
`git status` sobre `specs/006-escena-hogar-pixel-art/contracts/` vacio, `src/generated/` sin cambios (tambien tras `test:gate`, que recompila), `package.json` y lock sin diff. Modo `INCREMENTAL_*` sigue en servidor (`decide-mode.ts` intacto; t938 prueba `UPDATE` incremental). DEUDA-006-INCREMENTAL-SIN-UI vigente: la UI ya no puede producir `UPDATE`.

## 4. Caracterizacion del servidor (t938, SC-ESC6-134)
`src/application`/`src/infrastructure` sin diff; 9 pruebas (4 estados REGENERATE a-d, ciclo PENDING->DONE, 429 con Retry-After, misma clave 200, UPDATE directo sin generador, UPDATE incremental). Se ejecutan en memoria (`createHarness`, `FakeSceneImageGenerator`, `ControlledStorage`), 0 red. Limitacion: la tarea T938 dice «PostgreSQL 17 real» pero esta suite NO usa PG17; la cobertura PG17 de REGENERATE depende de otras suites del `test:gate`. Verdes desde el inicio.

## 5. Prueba eliminada t931
SC-ESC6-128..130 estan marcadas SUSTITUIDA por 131..133 en spec.md (lineas 461..463). Aserciones portadas a `t936` (SC-133): `aria-describedby` solo al motivo, ids unicos con 2 instancias, sin role/aria-live/tabindex, contenedor apilado 320 px y fila desde `sm`, `min-w-0 max-w-full`, `text-sm` slate-800 con contraste >= 4.5, sin anchos px ni overflow oculto. Lo no portado (textos de ayuda, orden de tabulacion de dos botones) ya no existe por diseno. Borrado coherente.

## 6. Compuertas T942 (orden pedido)
| Compuerta | Resultado |
|---|---|
| `verify-traceability.sh --feature 006` | CUMPLE, 241/241 IDs propios mapeados, 198/278 trazados, pureza 0 violaciones |
| `verify-oracles.sh` | CUMPLE, 376 archivos, 0 oraculos debiles |
| `npx tsc --noEmit` | rc 0 |
| `npm run test:gate` (PG17 `127.0.0.1:55432`, `TEST_DATABASE_URL`, contenedor `postgres:17` healthy) | rc 0; 326 archivos, 5114 pasan, 1 omitida, 0 rojas; cobertura 98.84 % lineas/sentencias, 95.58 % ramas, 99.65 % funciones; 77 s |
| `node scripts/scan-secrets.mjs repo` | 0 hallazgos (antes y despues del gate) |

Maquina: NO en reposo absoluto (load average de 1 min 13 al iniciar el gate y 34 despues; los procesos activos eran solo el cliente Claude). T591R-2 paso en la corrida; DEUDA-006-T591R2-TIMING sigue sin resolver. Base previa 5069 pasan; +45 pruebas netas.

## 7. Observaciones
- OBS-1: T938 sin PG17 (ver 4). No bloquea; el `test:gate` completo si corre contra PG17.
- OBS-2: `spec.md` mantiene N2-16 como PENDIENTE y SC-ESC6-125 con «redaccion final pendiente de N2-16», aunque el bus la registra resuelta (B+C) y la Fase 12 la implemento. Higiene documental de `/morpheus`/Neo.
- OBS-3: desviacion de redaccion de `PET_COUNT_RULE` (T923) sigue sin resolver por Neo.
- OBS-4: REGENERATE desde `idle` por API directa sigue permitido (la UI lo bloquea); y cada pulsacion envia mas fotos al proveedor (T943, `/rama`).
- OBS-5: N2-17 / T941 pendiente: la prosa de `scene.schema.json` y OpenAPI sigue nombrando «Actualizar»/«Regenerar escena desde cero» (opcion A recomendada o DEUDA-006-PROSA-BOTONES).

## 8. Ambito de commit de la Fase 13
- `src/domain/scene/build-image-prompt.ts`, `src/domain/scene/pet-phrases.ts`, `src/presentation/web/components/SceneBlock.tsx`, `src/presentation/web/scene-view.ts`
- `tests/security/t874-escena.security.spec.ts`, `tests/unit/presentation/t875-escena-presentacion.spec.ts`, `t876-escena-integracion.spec.ts`, `t879-escena-sati-correcciones.spec.ts`, `t916-escena-espera.spec.ts`, `tests/unit/t841-prompt-payload-escena-006.spec.ts`
- Eliminado: `tests/unit/presentation/t931-escena-ayuda.spec.ts`
- Nuevos: `tests/unit/presentation/t936-escena-boton-unico.spec.ts`, `tests/unit/t938-regenerar-caracterizacion-escena-006.spec.ts`, `tests/unit/t939-prompt-inspiracion-conteo-escena-006.spec.ts`
- `specs/006-escena-hogar-pixel-art/{spec,plan,tasks}.md`, `specs/006-escena-hogar-pixel-art/audits/architect-006-fase-t935.md`, `specs/006-escena-hogar-pixel-art/audits/oracle-006-fase-t942.md`
- Sin contratos, sin `src/generated/`. Excluir: `claude/*`, `.claude/*`, `tests/chaos/`, `logos.json`, `logos.json.bk`, `scripts/logos.py`, `specs/005-*/tasks.md`, `.gitignore`, `gate-T296-output.txt`, `.playwright-mcp/`, `.specify/memory/audits/*`.
