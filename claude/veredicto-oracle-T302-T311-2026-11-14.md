# Veredicto Oracle — T302, T303, T304, T311 (2026-11-14, HEAD 6c2e953, rama 002-plataforma-v21)

Solo auditoría. No se editó src/, tests/ ni specs/; sin commit, sin push, sin marcar tareas (T302, T303, T304 y T311 siguen `[ ]`).

## Gates rápidos (salidas reales)
- `npx tsc --noEmit`: exit 0.
- `bash scripts/verify-traceability.sh --feature 002`: 118/118, pureza 0 violaciones, CUMPLE.
- `bash scripts/verify-oracles.sh`: 116 archivos, 0 oráculos débiles, CUMPLE.
- `npx vitest run` (completo): 90 archivos, 1792/1792 pasan.
- `npx vitest run tests/security`: 13 archivos, 267/267 pasan.

## T302 — CUMPLE CON RESERVAS
- Evidencia: `claude/hallazgos-t302-trinity.md` inventaría V1..V16, cada uno con archivo y prueba (nine-vectors-four-roles V1-V9; backup-token V10-V11; audit-secret V12; session-csrf V13; session-audit-import V14-V16). Reejecuté la batería: 267/267, 0 saltadas.
- Reservas: (1) M-1, V9 (XSS almacenado) con una sola prueba en la matriz de roles: Caso A abierto para Keymaker. (2) Semgrep no instalado; el SAST por grep no es un AST. Neo decidió Semgrep solo en CI. (3) Sin servidor real en red; todo es `app.inject`. (4) Una ejecución intermedia con 1 fallo V14 coincidió con una edición concurrente de la prueba; no se reprodujo (esta auditoría: 267/267).

## T303 — CUMPLE
- `scratchpad/mutacion-oficial-2026-11-14-b.txt`: línea 3786 `All files | 88.98 | 90.62`; línea 3841 «Final mutation score of 88.98 is greater than or equal to break threshold 85»; línea 3844 `EXIT=0`; dry-run «Initial test run succeeded. Ran 1172 tests»; duración 64 min 23 s. Informe `reports/mutation/mutation.html` existe (5.5 MB, 20:33).
- `git diff HEAD -- tests/mutation/stryker.conf.json`: vacío (sin cambios). Config: `mutate` = src/domain/** y src/application/** (sin src/generated); umbrales high 90, low 85, break 85. Sin `exclude` de suites en vite.config.ts (solo `include` por carpetas) ni en la config de Stryker. Sin SIGKILL.
- Nota: archivos con score por debajo del 85 % (p. ej. ownership-transfer 80.95, weight-limits 80.65, import-hardening 84.75, estimated-age 83.33): el criterio es global, pero son candidatos de deuda para Dojo.

## T304 — NO CUMPLE
- La suite está verde (1792/1792), pero la tarea y la regla 6 de `specs/002-plataforma-v21/checklists/sustitucion-pruebas-001.md` exigen todas las filas en «sustituida». En disco: 14 sustituidas (filas 3, 4, 17, 19, 21, 22, 26, 27, 30, 31, 32, 33, 35, 36) y 22 «pendiente» (1, 2, 5-16, 18, 20, 23, 24, 25, 28, 29, 34).
- Todos los archivos citados en la tabla existen (verificado). El mapeo de Keymaker (`claude/mapeo-filas-pendientes-t304.md`) afirma 23 SUSTITUIDA_VERDE y 1 PENDIENTE_ROJO (fila 20, wcag.spec.ts, e2e Playwright no ejecutada aquí), pero nadie ha trasladado ese resultado a la columna Estado. Eso es una actualización documental pendiente (Architect, firma de Neo), no una falla de pruebas.
- Filas 4 y 22: las pruebas existen en los archivos de la nota; `sqlite-backup-import.spec.ts` no contiene 1.0.0/2.0.0 (0 coincidencias) y `layer-dependencies.spec.ts` no menciona rutas multi-feature. La cobertura real está en backup-migration.spec.ts (DOG→CANINE, 1.0.0/2.0.0) y verify-gates.spec.ts (T201). Neo ratificó el criterio (D2); queda como reserva aceptada.
- H-T304-1 confirmado: T221, T226, T228, T240, T255 y T284 están `[x]` en tasks.md mientras sus filas (1, 2, 5-18, 19-21, etc.) siguen «pendiente» en la tabla. Es una incoherencia de proceso, no de código. Fila 20 (e2e) requiere `npx playwright test` para cerrarse.
- Para cerrar: Architect reclasifica las 22 filas con la evidencia del mapeo (Keymaker corre wcag.spec.ts en verde), luego Oracle revalida.

## T311 — CUMPLE CON RESERVAS
- Ruta: `src/infrastructure/http/routes/households.routes.ts:52` `app.delete('/api/households/:householdId/invitations/:invitationId', { onRequest })` responde `reply.status(204).send()`; caso de uso `CancelHouseholdInvitationUseCase` (household-use-cases.ts, INVITED→CANCELLED, `requireManager`, 1 fila de auditoría) registrado en `use-cases.ts`. `onRequest` aplica sesión y CSRF como al resto de mutantes.
- `session-csrf.security.spec.ts:36`: `const NOT_YET_SERVED: string[] = [];` (antes `['cancelInvitation']`); los barridos 401/CSRF cubren ya las 40 operaciones.
- `households.api.spec.ts:410` prueba 204, 403 (CAREGIVER), 401 (`ERR-AUTH-UNAUTHENTICATED`), 404 `ERR-HOUSE-INVITATION-NOT-FOUND` (repetida, desconocida y tras cancelar) y que el invitado ya no puede aceptar; `openapi-conformance.spec.ts:81` valida la respuesta contra el OpenAPI. `vitest` de las 4 suites relacionadas: 112/112.
- Reservas: (1) no hay prueba específica del 500 de esta ruta (lo cubre el manejador global `ERR-INTERNAL-UNEXPECTED`, no un caso propio). (2) La tarea dice `src/presentation/`; la ruta está en `src/infrastructure/http/routes/` (ubicación correcta por arquitectura; el texto de tasks.md está desactualizado). (3) El 403 por actor ajeno al hogar se resuelve como 404 `ERR-HOUSE-NOT-FOUND` por diseño (INV-ACC2-002).

## Decisiones que son de Neo (no ejecutadas)
1. Marcar `[x]` T303 (cumple) y T311 (cumple con reservas); T302 tras aceptar M-1/Semgrep.
2. No marcar T304: depende de reclasificar las 22 filas y de la corrida e2e de la fila 20.
3. Commit del paquete (incluye constitution.md y la enmienda III, D3) y push.
4. Si se corrige H-T304-1: desmarcar o documentar T221/T226/T228/T240/T255/T284.
