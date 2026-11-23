# Oracle + Seraph — T1240 compuerta FINAL Fase 3 (#19) — 2026-11-23

Veredicto global: **FAIL (compuerta roja, 2 fallos reales; no se corrigio nada, MAX_RETRY=1 no aplica: no hay fix mio).** No marcar [x].

Entorno: PostgreSQL 17.12 REAL (docker `postgres:17`, 127.0.0.1:55432, `nc -z` abierto; `select version()` via docker exec). `TEST_DATABASE_URL=postgres://argos_test:argos_test@127.0.0.1:55432/argos_test` (desechable local). `pg_isready`/`psql` no instalados en el host.

## Veredicto por item
1. PG17 alcanzable: PASS.
2. `npx vitest run tests/integration/persistence`: **FAIL**. 57 archivos: 56 pass / 1 fail; 883 tests: 881 pass / 1 fail / 1 skipped. Suites PG reales CORRIERON (no omitidas; solo 1 test skip). t1232 (11) y t1233 (22) pasan.
   - Fallo: `schema-parity.spec.ts:505` "0001_baseline.sql se aplica en un esquema vacio..." (viva contra PG). Recibe 31 tablas, esperaba 35: faltan `admin_audit_entries, admin_identities, admin_oauth_flow_states, admin_sessions`. Causa: el test vivo (lineas 478-492) aplica 0001..0014 pero NUNCA lee `ADMIN_PORTAL_PATH` (0015_admin_portal.sql, declarada en :46, usada solo en la paridad estatica :227, que si pasa). `CANONICAL_TABLES` (:50) ya incluye las 4 tablas admin. Es un defecto del TEST, no de la migracion. Dueno: **keymaker** (anadir `await client.query(readFileSync(ADMIN_PORTAL_PATH,'utf8'))` tras DELETE_INTENT_PATH). La paridad 0015(PG)/0019(SQLite) estatica: PASS; viva: NO demostrada hasta el fix.
3. `verify-traceability.sh --feature 009`: **52/79** IDs trazados, resultado FALLA (Purity 0 violaciones). Pendiente = Fase 4-5 (CFG9-*, LIM9-001/004/005/006, APR9-*, STATE-ACCT9-001, PRO9-007, INV-CFG9-003, INV-LIM9-001...), 27 abiertos; ninguno de la Fase 3 (ADM9) figura en la lista FAIL visible. Baseline esperado, sin regresion.
4. `verify-oracles.sh`: exit 0, PASS.
5. `npx tsc --noEmit`: exit 0, PASS.
6. `npm run test:gate` (con TEST_DATABASE_URL): **FAIL exit 1**. 415 archivos: 413 pass / 2 fail; 6378 tests: 6375 pass / 2 fail / 1 skip. Cobertura no se imprime al fallar (sin lineas de coverage). Fallos:
   a. `schema-parity.spec.ts` viva (misma causa del item 2; keymaker).
   b. `tests/unit/presentation/presentation-architecture.spec.ts:50` [REQ-UI-004]: `readdirSync('src/presentation')` filtra solo `web` y `.gitkeep`; ahora existe `src/presentation/admin/` (T1235: AdminPortal.tsx, main.tsx, styles.css; versionado) -> `legacy=['admin']`. Test obsoleto frente a la decision de portal propio; dueno: **architect** decide (permitir `admin` en el oraculo, REQ-UI-004) y keymaker aplica. Reportar a Neo no requerido (no es Nivel 2).
   Las compuertas previas de la cadena (compile-contracts 002/003/006, traceability 002/003/006, oracles, tsc) pasaron antes de vitest.
7. E2E multi-navegador `tests/e2e/admin` (E2E_FIREFOX=1 E2E_WEBKIT=1, 3 proyectos, 75 tests): **FAIL** 73 pass / 2 fail. chromium 25/25 ejecutados y verdes; firefox 25/25 ejecutados y verdes; webkit 23/25 (2 fallos). Fallos webkit (t1235-portal-admin-ui.spec.ts:92 A6 y :181 A7): `toBeFocused` de "Saltar al contenido" queda `inactive` tras Tab. Hipotesis (NO verificada): WebKit en macOS no enfoca enlaces con Tab sin Opcion+Tab (comportamiento de Safari); si se confirma es limite del arnes, no de la UI. Dueno: **keymaker/sati** deben demostrar causa (p. ej. press de Alt+Tab en webkit o skip condicional documentado). No lo he dado por bueno.
8. /seraph cookies (REQ-ADM9-002, SC-009-015): **PASS**.
   - `argos_admin_session`: `src/infrastructure/http/routes/admin.routes.ts:22` nombre, `:23` Path `/api/admin`, `:47-48` setCookie `httpOnly:true, sameSite:'strict', path, maxAge: ADMIN_SESSION_MAX_AGE_SECONDS, secure` (parametro `secure` = Cloud); `:51` clearCookie con los mismos atributos.
   - 30 min absolutos / 10 min inactividad: `src/domain/auth/admin-session-policy.ts:11-13` (30, 10, maxAge 1800 s), `:23-27` expiry (idle nunca supera al absoluto), `:30-36` estados REVOKED > EXPIRED > EXPIRED_IDLE; consumida desde `admin-use-cases.ts` y rutas.
   - Cookie OAuth separada `argos_admin_oauth`: HttpOnly, SameSite=Lax, Path `/api/admin/auth/google` (`:24`, `:42`), coherente con spec.
   - Aislamiento: `/admin/*` subrutas 404 uniforme y `/api/admin` con `%`/`;` sospechosos 404 (`static-assets.ts:6,32`); sesion de usuarios y admin independientes (cubierto por T1237 chromium, verde en esta corrida).
   - No verificado aqui: atributo `Secure` en Cloud Run real (solo por codigo/tests); firma de la enmienda constitucional MINOR (pendiente Neo).
9. Accesibilidad: **PASS CON OBS**. T1235 axe (A1 acceso, A2 shell, A9 cierre fallido): Chromium 6 ejecuciones a 320/1024/1280 verdes; Firefox y WebKit tambien ejecutan A1/A2/A9 con 0 violaciones (verdes en esta corrida). Obs: teclado (A6/A7) rojo en WebKit (item 7). axe no sustituye revision manual con lector de pantalla (no ejecutada).

## NO ejecutado / pendiente
- Cloud Run real, Google OAuth real (todo con simulador `admin-google-sim-support.ts`), Secure en HTTPS real.
- Firma de Neo: enmienda constitucional MINOR (Stack/Autenticacion), `admin_audit_entries` retencion (pendiente Neo desde T1239), cierre [x] de T1240.
- Fase 4-5 de 009 (27 IDs abiertos), `E2E` fuera de `tests/e2e/admin`, lector de pantalla manual.

## Resumen de duenos
- keymaker: schema-parity viva (aplicar 0015); WebKit A6/A7 (diagnostico).
- architect: oraculo REQ-UI-004 vs `src/presentation/admin`.
Reejecutar tras fixes: persistence, test:gate, E2E webkit.
