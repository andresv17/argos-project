# Oracle 009 — auditoría forense pre-commit selectivo, Fase 3 (2026-11-23)

Veredicto global: PASS CON OBS. Sin FAIL. Sin edición de código, sin commit, sin [x].

## Evidencia ejecutada
- `npx vitest run t1228 t1231 t1227`: 3 archivos, 38/38 (t1227 9, t1228 10, t1231 19).
- `npx tsc --noEmit`: exit 0.
- YAML: `python3 yaml.safe_load` falla con exit 1 por ModuleNotFoundError (PyYAML no instalado, no es defecto del contrato); equivalente `node` (paquete `yaml`) parsea OK.

## 1. Fallos de Neo (a)(b)(c): PASS
- (a) Contrato `admin.openapi.yaml` version 1.2.0 (l.5, l.17) con `change_note_1_2_0` (l.23) que declara APROBADO por Neo el 2026-11-23, estado APPROVED/LOCKED sin tocar. ADR-009-07 en plan.md reescrito con regla de orden y Origin tras sesión.
- (b) tasks.md T1228 y spec.md SC-009-009 contienen literalmente «mismo 404 que ruta inexistente sin sesión; mismo 403 que ruta inexistente para mutadores sin cabecera X-Argos-Request (guard global INV-AUTH-007)».
- (c) Código: csrf-guard.ts:22-27 (onRequest, antes de sesión) lanza 403 solo por falta de `X-Argos-Request: 1`; no mira Origin. admin.routes.ts:121-129 DELETE: sesión (l.124, 404 uniforme) -> Origin (l.125, 403) -> revocación (l.126). Sin sesión + origen ajeno = 404 (t1231 l.101-105).

## 2. Bandera del Architect (sesión válida + Origin ajeno = 403 ERR-AUTH-CSRF-REJECTED): CONFIRMED
- Contrato l.258 lo dice; código admin.routes.ts:125; t1231 l.71-74 (cinco orígenes ajenos incl. `null`), l.78-83 (sin Origin) y verifica que no revoca (sesión sigue 200).

## 3. O-2: PASS CON OBS
- `ADMIN_START_LIMIT = {maxStarts:20, windowMinutes:15}` app-config.ts:364; `consumeStart` admin-rate-limit.ts:47-55 lanza antes de `starts.set` (el inicio rechazado no suma), por IP efectiva (`request.ip`, trustProxy 1 salto server.ts:232), 429 con Retry-After. Cableado admin.routes.ts:79-80. Test `[O-2]` t1231 l.210-222: 429, Retry-After 1..900, otra IP libre, expira ventana.
- No rompe el 404 sin sesión (el limiter solo actúa en `/auth/google/start`; test l.203-208) ni el 403 por cabecera (onRequest solo mutadores; el start es GET).
- OBS-A: el test O-2 no discrimina "el rechazado no cuenta" (el rechazo ocurre en t0 sin avanzar reloj; expira igual). La propiedad está en el código, no en una aserción. Menor.

## 4. OBS-2: PASS
- admin.routes.ts:2 cita `contrato admin.openapi.yaml 1.2.0`.

## 5. Compuertas: PASS CON OBS (solo la de YAML con Python, ver arriba)

## 6. Alcance del commit: PASS
NO commitear (MER-11 / ajenos a 009): .claude/settings.json, .claude/hooks/logos-stop-guard.mjs, .claude/skills/superdesign/, .playwright-mcp/, CLAUDE.md, claude/log-* ajenos (architect, keymaker, lock, merovingian, mifune, morpheus, mouse, neb, rama, sati, sentinels, smith, trinity, link), playwright.config.ts, specs/005-album-archivos-clinicos/tasks.md, logos.json, logos.json.bk, scripts/logos.py, scripts/gh-project-sync.mjs, gate-T296-output.txt, claude/handover-*, claude/inbox-*, claude/decisiones-*, claude/backlog-*, claude/cierre-*, claude/requerimiento-*, audits de otras features (004..008, 126b4b2/45bde2b son REQ-IAC-009: decidir aparte).
Pertenecen a 009 (Fase 3): specs/009-*/{contracts/openapi/admin.openapi.yaml,plan.md,spec.md,tasks.md}; src/application/ports/{admin.port.ts,repositories.port.ts}; src/application/use-cases/{admin-use-cases.ts,use-case-support.ts}; src/domain/auth/admin-session-policy.ts; src/infrastructure/config/app-config.ts; src/infrastructure/http/{admin-rate-limit.ts,app.ts,server.ts,plugins/problem-details.ts,plugins/static-assets.ts,routes/admin.routes.ts,routes/use-cases.ts}; persistence: memory/in-memory-unit-of-work.ts, postgres/{postgres-repositories.ts,postgres-admin-repositories.ts,migrations/0015_admin_portal.sql}, sqlite/{sqlite-repositories.ts,sqlite-admin-repositories.ts,migrations/0019_admin_portal.sql}; tests: fixtures/{admin-fixtures.ts,google-fixtures.ts}, integration/api/{api-harness.ts,t1228..t1231}, integration/persistence/{t1232,t1233,postgres-pool,postgres-repositories-part3,schema-parity,sqlite-repositories,t1219,t831}, integration/t1234, unit/{t1227,app-config}; .env.example, terraform/{variables,outputs,README} (contienen líneas admin; confirmar que no mezclan 008/REQ-IAC); actas oracle-009-*, keymaker-009-timeouts-composicion.md.
- OBS-B: `.gitignore` (+1 línea, sin relación admin), `tests/.../t831-esquema-escena-006.spec.ts` y `t1219` modificados: verificar con `git diff` que son ajustes de 009 (t831 es de la 006; probablemente cuenta de migraciones) antes de incluir.
- OBS-C: `git add` selectivo por ruta; NO usar `-A`/`.`. Las tareas T1228..T1234 siguen en `[ ]` (techo REVIEW; [x] es solo de Neo).
