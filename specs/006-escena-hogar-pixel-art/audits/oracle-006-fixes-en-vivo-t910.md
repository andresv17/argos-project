# Oracle 006 — Auditoría forense de T901..T909 (T910 [GOV])

Fecha: 2026-11-19. Rama `006-escena-hogar-pixel-art`, HEAD `824d82c`, cambios sin commit. Auditora: /oracle (sonnet). Sin modificar código, tests ni specs; sin marcar tareas.

## Veredicto: PASS CON OBSERVACIONES

## 1. Estado de tareas (disco)
T901..T910 en `[ ]` (tasks.md líneas 226-235). 0 marcas `[x]` o `COMPLETED` en la Fase 10. Sin marca indebida. T900 `[ ]` (acción [HUM] de Neo), T885 bloqueada.

## 2. Diff verificado (20 archivos modificados + 1 nuevo `tests/unit/t908-vite-proxy-dev-media-escena-006.spec.ts`)
- `gemini-api-wire.ts`: antepone `{text: r.ref + ':'}` a cada `inlineData`; 0 referencias => solo el texto del prompt. Sin cambio de puerto.
- `build-image-prompt.ts`: `Pet k:` 1-based solo en `scratchBlocks` (FROM_SCRATCH/REGENERATE); `PIXEL_REDRAW_RULE` una vez, solo si hogar o alguna mascota emitida lleva `photoRef` no nulo (incrementales: solo ADD/REPLACE con foto); `STYLE_BASE_TEXT` y `STYLE_CLOSING` intactos.
- `SceneBlock.tsx`/`scene-view.ts`/`HomeScene.tsx`/`PetsPage.tsx`: `isOwnerSceneEmpty` = OWNER && pets.total===0 && imageTag===null && ambos consentimientos false; `reloadToken` (el valor inicial no recarga); `petsRevision` incrementa en alta, edición y baja; «Regenerar» solo con `src !== null`.
- `vite.config.ts`: +4 líneas, proxy `/__dev/media` dentro de `server.proxy` (no entra en build); cubierto por t908 (2 pruebas estáticas).
- `decide-mode.ts`, `package.json`, `package-lock.json`, `src/generated/`, contratos, `scripts/scan-secrets.mjs`: 0 diferencias frente a HEAD.
- specs 006 (spec/plan/tasks): SC-ESC6-104..109, T901..T910, tabla de cobertura 211 IDs; estado DRAFT, sin APPROVED/LOCKED.

## 3. Decisiones de Neo (a)(b)(c): verificadas en código y pruebas
(a) CUMPLE (`scene-view.ts` isOwnerSceneEmpty + `SceneBlock` render vacío + `reloadToken`; pruebas t875/t876). (b) CUMPLE (t841: 5 pruebas nuevas, fixture byte a byte). (c) CUMPLE (decide-mode sin diff; regresión SC-ESC6-107 en t839).

## 4. Desviación 1: marca `argos-scan:allow`
Dictamen: USO LEGÍTIMO. Evidencia: (i) la clave `AIzaSyTEST-SENTINEL-[redactada]` es sintética (no existe en proveedor) y activa la regla `token-conocido` (`/\bAIza[0-9A-Za-z_-]{35}\b/`), un falso positivo; (ii) la marca es el mecanismo documentado del escáner (cabecera de `scripts/scan-secrets.mjs` líneas 10-11, E-2 R2) y ya hay precedente en HEAD (tests/integration/persistence/*, tests/unit/scan-secrets.spec.ts); (iii) solo se usó en 4 archivos bajo `tests/`, ninguno en `src/`, `scripts/` ni docs; (iv) `scan-secrets.mjs` sin cambios (`git diff HEAD` vacío); (v) prueba negativa: `scanText('src/x.ts', ...// argos-scan:allow)` sigue reportando `token-conocido` (la marca no suprime fuera de tests/) y `scanText('tests/unit/x.ts', sin marca)` lo reporta; (vi) `node scripts/scan-secrets.mjs repo` => 0 hallazgos, rc 0; (vii) 0 apariciones de `AIzaSy` sin marca en src/tests/scripts/specs/.specify (la única fuera es una frase de `claude/log-keymaker.md`, que no contiene el valor completo). El literal del acta `.specify/memory/audits/keymaker-006-gemini-api.md` fue redactado (1 línea), legítimo porque ese archivo no está bajo tests/ y la marca ahí no operaría. Requiere reconocimiento de Neo (no es decisión de Nivel 2, pero toca la política del escáner).

## 5. Compuertas (ejecutadas por la auditora)
- `verify-traceability.sh --feature 006`: CUMPLE (211/211 IDs propios mapeados; 186/249 trazados; pureza 0 violaciones).
- `verify-oracles.sh`: CUMPLE (370 archivos, 0 oráculos débiles).
- `npx tsc --noEmit`: rc 0, sin salida.
- `npm run test:gate` con PostgreSQL 17 real (`proyectoargos-postgres-1` en 127.0.0.1:55432, TEST_DATABASE_URL): rc 0; 320 archivos pasan; 4974 pasan | 1 omitida (4975); cobertura Statements 98.83%, Branches 95.48%, Functions 99.64%, Lines 98.83%. Salida en el scratchpad de la sesión (gate.out). 0 llamadas de red externa (fetch simulado; solo PG local).
- Reposo: la máquina NO estaba en reposo absoluto al llegar (load average 1 min 18.9 -> 27). Esperé a que bajara; la corrida arrancó con load1 ≈ 4.2 (ncpu del host no leído). Con esa carga moderada `tests/security/exploits/t591-revalidacion.security.spec.ts` (9 tests, T591R-2) PASÓ (1076 ms). No se reproduce el fallo del keymaker, pero tampoco se probó en reposo absoluto: T591R-2 sigue siendo sensible a la carga (ratio de tiempos).

## 6. Ámbito de commit (fuera de 006: NO deben entrar)
Fuera: `claude/*`, `.claude/*` (settings.json, hooks/logos-stop-guard.mjs, skills/superdesign), `tests/chaos/`, `scripts/logos.py` (logos.*), `specs/005-album-archivos-clinicos/tasks.md`, `.gitignore`, `gate-T296-output.txt`, `.playwright-mcp/`, y los ~60 `.specify/memory/audits/*` sin seguimiento de otras features (004 etc.).
Propuesta de commit solo 006 (25 rutas): `src/infrastructure/adapters/gemini-api-wire.ts`, `src/domain/scene/build-image-prompt.ts`, `src/presentation/web/{scene-view.ts,components/SceneBlock.tsx,components/HomeScene.tsx,pages/PetsPage.tsx}`, `vite.config.ts`, `tests/unit/{gemini-api-composicion-escena-006,gemini-api-config-escena-006,gemini-api-no-fuga-escena-006,gemini-api-scene-generator,t839-decide-mode-escena-006,t841-prompt-payload-escena-006,t908-vite-proxy-dev-media-escena-006}.spec.ts`, `tests/unit/presentation/{escena-fixtures.ts,t875-escena-presentacion.spec.ts,t876-escena-integracion.spec.ts}`, `specs/006-escena-hogar-pixel-art/{spec,plan,tasks}.md`, `specs/006-escena-hogar-pixel-art/audits/{architect-006-fixes-en-vivo,oracle-006-fixes-en-vivo-t910}.md`, `.specify/memory/audits/keymaker-006-gemini-api.md`. Agregar por ruta explícita (nunca `git add -A`). Aviso: `specs/006.../audits/` es un directorio sin seguimiento; revisar `.gitignore` antes (modificado y fuera de ámbito).

## Observaciones
- OBS-1: la marca `argos-scan:allow` (ver 4) requiere reconocimiento de Neo.
- OBS-2: T591R-2 pasó a carga moderada (load1 ≈ 4); sigue siendo frágil bajo carga alta. Recomendación: registrar deuda (p. ej. DEUDA-006-T591R2-TIMING) en vez de declararla resuelta; no es de la 006.
- OBS-3: redacción de SC-ESC6-106 y T904 ("byte a byte igual a la fixture previa / sin cambio de byte" sin `photoRef`) choca con SC-ESC6-105: un payload con mascotas RENDER sin foto cambia por el prefijo `Pet k:`. La prueba solo asegura la igualdad byte a byte con 0 mascotas. Comportamiento correcto y decidido por Neo; sugerir a /architect precisar el texto (aplica solo a PIXEL_REDRAW_RULE).
- OBS-4: `tasks.md` T901 depende de T900 (aún `[ ]`) por diseño; el [HUM] de repetición de la prueba en vivo queda a Neo tras el commit.
- OBS-5: el estado DRAFT de spec/plan debe permanecer hasta firma de Neo.

0 hallazgos bloqueantes.
