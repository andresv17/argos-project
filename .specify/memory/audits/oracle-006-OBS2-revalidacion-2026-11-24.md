# Oracle — Revalidación OBS-2 (aviso §4 Vertex) — 2026-11-24
Rama `fix/006-escena-defectos-uso-real`. Sin commit, push ni `[x]`. Dictamen: **PASS CON OBS**.

## 1. Texto §4 Vertex vs. redacción de Neo
Fuente de la redacción aprobada: `logos.json` (resolución Nivel 2 de Neo, OBS-2 opción b). Comparación literal por script: la cadena de Neo está contenida byte a byte en `src/presentation/web/scene-notice.ts` (línea 52). PASS.

## 2. Versiones
`NOTICE_VERSION='3'` (scene-notice.ts:16) y `NOTICE_GEMINI_API_VERSION='gemini-api-3'` (:77) intactas; `SCENE_NOTICE_VERSION='3'` y `SCENE_GEMINI_API_NOTICE_VERSION='gemini-api-3'` intactas en `src/domain/scene/notice.ts`. PASS.

## 3. t949 (REQ-ESC6-028)
La prueba quita la subcadena exacta `hasta 30 días por prevención de abuso` y sobre el resto sigue exigiendo `not.toMatch(/\b\d+\s*(días|horas|meses)\b/)`. Además exige que la subcadena esté presente. Es la única excepción y cualquier otra cifra (días/horas/meses) sigue prohibida; el exento es una subcadena literal, no un patrón laxo.
Dictamen: relajación LEGÍTIMA, decidida por Neo (Nivel 2), acotada y con fuente citada (términos de datos de cliente de Google Cloud). No debilita el invariante: pasa de «ninguna cifra» a «ninguna cifra salvo la sourced». OBS (menor, no revertido): (a) la prueba no cubre cifras sin unidad de esas tres (p. ej. «30 d»); (b) el paréntesis «hasta 30 días» proviene de la página Data governance (rama OBS-2), no de una lectura del DPA; la spec REQ-ESC6-028 no se ha enmendado: conviene que `/architect` refleje la excepción en spec.md para evitar divergencia spec/prueba. t968 cubre además la frase nueva y que gemini-api no afirma no-entrenamiento.

## 4. Gates (salida real, rc sin pipes)
- `npx tsc --noEmit`: rc 0.
- `bash scripts/verify-oracles.sh`: rc 0; 529 archivos, 0 débiles, CUMPLE.
- `bash scripts/verify-traceability.sh --feature 006`: rc 0; 251/251, pureza 0, CUMPLE.
- `npm run test:gate` (PG17 55432), corrida 1: rc 1. 6956 pass, 1 fail, 1 omitida: t1238 (`medianas ms: 0.154, 0.123, 0.163, 0.099, 1.820`), flake de tiempos ya conocido (admin 009, ajeno al fix).
- Corrida 2: rc 0 (cobertura 98.9% líneas). Fallo no reproducido.

## 5. Árbol
Ámbito del fix (006): `src/**` escena, `src/generated/v34|v35`, `tests/**` escena, `specs/006-*` (spec, tasks, contratos), `claude/log-*`, registro; nuevos sin seguir: `src/domain/scene/reference-labels.ts`, `tests/unit/t961-enmiendas-escena-006.spec.ts`, `tests/unit/t968-biografia-consentimiento-escena-006.spec.ts`, actas `.specify/memory/audits/`.
Ajenos (no tocados): `.claude/settings.json`, `.gitignore`, `CLAUDE.md`, `playwright.config.ts`, `specs/005-album-archivos-clinicos/tasks.md`; sin seguir: `.claude/hooks/logos-stop-guard.mjs`, `.claude/skills/superdesign/`, `.playwright-mcp/`, `Claude outputs/`, `gate-T296-output.txt`, `logos.json`, `logos.json.bk`, `scripts/gh-project-sync.mjs`, `scripts/logos.py`, `tipi-marca.zip` y ~270 actas antiguas en `.specify/memory/audits/` y `claude/`. El commit selectivo debe excluirlos (en especial logos.json/logos.py: memoria «Logos sin permiso»).
Nota: `src/` y `tests/` tienen 56 archivos modificados; verificar que todos son de escena antes de `git add`.

## 6. Tareas
Ningún `[x]` añadido en `specs/006-.../tasks.md` (el único `[x]` del diff es texto dentro de T968, no casilla). T961..T967, T969 y T968 siguen `[ ]`; T968 espera firma de Neo.
