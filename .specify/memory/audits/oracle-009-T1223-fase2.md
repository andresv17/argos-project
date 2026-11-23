# Acta /oracle T1223 — Compuerta final de la Fase 2 de la Feature 009 (T1217..T1223, T1130, T1284)

Fecha: 2026-11-23. Rama `009-aprobacion-admin-correo`, HEAD `65b92ce` + cambios sin commit de Fase 2. PostgreSQL 17 real (`TEST_DATABASE_URL=postgres://argos_test:argos_test@127.0.0.1:55432/argos_test`). No se editó código, no se marcó `[x]`, no se hizo commit ni push.

## Veredicto: FAIL (un defecto de código bloqueante, ORA-T1223-01; el resto cumple)

La compuerta `npm run test:gate` sale con 1 por 2 pruebas rojas. Una es esperada (sin commit, ver ORA-T1223-02); la otra es una regresión real introducida por T1220 (ORA-T1223-01). Corregida esa, la Fase 2 queda en PASS CON OBSERVACIONES.

## Tabla de verificaciones

| # | Verificación | Resultado literal |
|---|---|---|
| 1 | `git status` / `git diff --stat` | 47 archivos rastreados modificados, `2783 insertions(+), 118 deletions(-)` (incluye cambios ajenos MER-11: `claude/log-*`, `.claude/settings.json`, `.gitignore`, `CLAUDE.md`, `playwright.config.ts`, `specs/005.../tasks.md`; no tocados). Sin seguimiento de la Fase 2: `src/application/use-cases/account-google-deletion-use-cases.ts`, `src/domain/auth/reauthentication-policy.ts`, `src/presentation/web/account-deletion-google.ts`, migraciones `postgres/0014_oauth_flow_delete_intent.sql` y `sqlite/0018_oauth_flow_delete_intent.sql`, `src/generated/v35/`, y 5 specs (`t1218-eliminacion-google-009.api`, `t1219-migracion-intencion-delete-009`, `t1220-eliminar-cuenta-google-009`, `t1130-reautenticacion-reciente-009`, E2E `eliminar-cuenta-google-009`) |
| 2 | `npx tsc --noEmit` | exit 0, sin salida |
| 3 | `npm run test:gate` (PG real) | **exit 1**. `Test Files  2 failed \| 400 passed (402)`; `Tests  2 failed \| 6185 passed \| 1 skipped (6188)`; `Duration 102.85s` (113 s totales, no pasó de 10 min). Cobertura: **no emitida** (vitest no imprime el reporte v8 con pruebas rojas) |
| 3a | Fallo 1 | `tests/integration/gates/verify-ci-ready.spec.ts` (comprobación ii): lee `0014_oauth_flow_delete_intent.sql` sin seguimiento. Esperado hasta el commit |
| 3b | Fallo 2 | `tests/security/exploits/ui-invitation-logs.security.spec.ts:62` [INV-AUTH2-002]: `expected [ 'account-deletion-google.ts', …(3) ] to deeply equal [ Array(3) ]`. **Defecto real** |
| 4a | `verify-traceability.sh --feature 009` | **exit 1** `IDs trazados: 43/79`, `Violaciones de pureza: 0`, `Resultado: FALLA`. 36 FAIL de evidencia (modo final con evidencia estricta): `ERR-ADMIN-*` (5), `INV-ADM9/CFG9/LIM9`, `REQ-ADM9-001..006`, `REQ-APR9-001..005,007,008`, `REQ-CFG9-001..008`, `REQ-LIM9-004,005`, `REQ-PRO9-007`, `STATE-ACCT9-001`. Todos son de las Fases 3 a 9 (T1224+). **0 huérfanos** («sin tarea» y «huérfano»: 0). Ningún ID de Fase 2 (`REQ-DEL9-*`, `INV-DEL9-*`, `REQ-VIN8-*`) figura en FAIL |
| 4b | `--feature 008` | exit 0, `IDs trazados: 66/66`, `CUMPLE` |
| 4c | `--feature 007` | exit 0, `IDs trazados: 51/51`, `CUMPLE` |
| 4d | `--feature 006` | exit 0, `IDs trazados: 196/279` (`Spec→tasks 1:1: 241/241`), `CUMPLE` |
| 4e | `--feature 009 --task T####` | exit 2: el script solo acepta `T###` (3 dígitos); las tareas 009 son de 4 dígitos. Limitación del script, no del repo |
| 5 | `verify-oracles.sh` | exit 0, `Archivos analizados: 466; oráculos débiles: 0`, `CUMPLE` |
| 6 | TRI-02 | En disco: `GOOGLE_AUTH_LIMITS.deleteAccount = { maxPerWindow: 5, windowMinutes: 15 }` (`google-auth-config.ts`); `limiter.consume('deleteAccount', request.userId)` al inicio del manejador de `POST /api/account/deletion/google`, antes de leer el cuerpo. Prueba `[TRI-02]` en `t1218-eliminacion-google-009.api.spec.ts:302-309` (6.º intento = 429 `ERR-RATE-LIMITED`): pasa en el gate |
| 6 | RAMA-03 | SQLite: `DELETE FROM oauth_flow_states WHERE expires_at <= strftime(..., '-900 seconds')` (`sqlite-unit-of-work.ts:88`); PG: `expires_at::timestamptz <= $1::timestamptz - interval '900 seconds'` (`postgres-maintenance.ts:76`, ahora en `STEPS`). Pruebas: SQLite 899 s se conserva / 900 s se borra y aserción del SQL de PG en `t1134-purga-mantenimiento-oauth-008.spec.ts`: pasan |
| 6 | RAMA-01 | `terraform/logging.tf`: nuevo `google_logging_project_exclusion.admin_google_auth_callback_requests` con filtro `httpRequest.requestUrl:"/api/admin/auth/google/callback"`; prueba en `tests/unit/cloud-logging.spec.ts` exige ambos filtros: pasa. Sin `plan` ni `apply` (pendiente de Neo, Nivel 2) |
| 6 | TRI-01 | En disco: la URL lleva `max_age` y `prompt=login` solo con `maxAgeSeconds` y el verificador devuelve `auth_time` solo si es número (`google-oidc-verify.ts:181`); política fail-closed (`reauthentication-policy.ts`). Pruebas en `t1130-reautenticacion-reciente-009.spec.ts:33-44`: pasan. Con `max_age`, OIDC Core obliga a Google a emitir `auth_time`. Verificación contra Google real sigue siendo tarea de `/link` (smoke), no demostrable en disco |
| 7 | `verify-ci-ready.sh` | exit 1, «2 comprobacion(es) fallan». (i) Semgrep: PASA, sin hallazgos. (ii) FALLA: `schema-parity.spec.ts:43` lee `0014_oauth_flow_delete_intent.sql` sin seguimiento. (iii) FALLA: 27 archivos rastreados modificados sin commit. **Esperado** por no existir el commit; no es defecto de código |

## Hallazgos

**ORA-T1223-01 (ALTO, bloqueante) — `account-deletion-google.ts` llama a `fetch` directamente y no notifica actividad.** La prueba de seguridad INV-AUTH2-002 (`ui-invitation-logs.security.spec.ts:62`) fija que solo `media-api.ts`, `scene-api.ts` y `share-api.ts` usan `fetch`. T1220 añadió `src/presentation/web/account-deletion-google.ts:74` con `fetch` propio, y el archivo no contiene `notifyActivity` (grep: 0). Dos consecuencias: la compuerta queda roja y la acción explícita de borrar no cuenta como actividad de sesión (los otros tres archivos con `fetch` sí la notifican). Es regresión de la Fase 2 que ni `/sati` ni el E2E detectaron porque nadie ejecutó el gate completo. Corrección (para `/keymaker` o `/sati`, y `/trinity` si se toca la lista blanca): (a) preferido, hacer que el cliente notifique actividad como `share-api.ts` y ampliar la lista blanca de la prueba con una aserción equivalente de `notifyActivity` para el nuevo archivo, o (b) pasar por `api.ts`. Cambiar la prueba de seguridad exige decisión explícita de `/trinity` o `/architect`, no un ajuste silencioso.

**ORA-T1223-02 (informativo, esperado) — Comprobación de `verify-ci-ready` y su prueba `verify-ci-ready.spec.ts` rojas por archivos sin commit.** Se resuelve con el commit de la Fase 2 (incluidas las migraciones `0014` PG y `0018` SQLite). Reejecutar `verify-ci-ready.sh` y el gate tras el commit.

**ORA-T1223-03 (observación) — `src/generated/v35/` aparece sin seguimiento aunque el commit `65b92ce` declara «compilación de 009».** Verificar si `src/generated/` está bajo `.gitignore` por versión o debe commitearse (el gate de CI lo regenera con `compile-contracts`; `test:gate` solo compila 002, 003 y 006). Un `verify-traceability --feature 009` ejecutado en paralelo al gate falló con `ENOENT src/generated/v33/schemas/validators.mjs` porque el gate regenera `src/generated`: carrera de mi ejecución, no defecto (reejecutado en serie: sin ENOENT).

**ORA-T1223-04 (observación) — `verify-traceability.sh --feature 009` sale 1 por diseño en modo final.** Las 36 evidencias faltantes son de las Fases 3 a 9; la expectativa de «sin IDs sin tarea» se cumple (0 huérfanos). No debe usarse como compuerta de Fase 2 sin acotar por tarea; el script no admite `--task T####` de 4 dígitos (deuda de `/link` o `/architect`).

**ORA-T1223-05 (observación) — Cobertura no medida** porque vitest no emite el reporte con pruebas rojas; reportar tras corregir ORA-T1223-01 y commitear.

## Ajustes de actas previas verificados en disco con prueba

TRI-01, TRI-02, RAMA-03 y RAMA-01: en disco y con prueba verde en el gate (tabla, fila 6). Pendientes fuera del código (Neo, Nivel 2): `terraform plan/apply` de las dos exclusiones de logging (RAMA-01/RAMA-02) y el smoke con Google real (TRI-01).

## Próximos pasos

1. `/keymaker` (o `/sati`): corregir ORA-T1223-01 con `/trinity` validando el cambio en la lista blanca de INV-AUTH2-002.
2. Commit de la Fase 2 (Neo/Morpheus), reejecutar `npm run test:gate` (esperado exit 0 con cobertura) y `bash scripts/verify-ci-ready.sh` (esperado exit 0).
3. Solo entonces `/oracle` reconfirma y T1223 pasa a `REVIEW` (el `[x]` es de Neo).
