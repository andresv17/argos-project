# Keymaker 009 T1244 — inventario de pruebas que usan `auth/register` (ADR-009-10)

Fecha: 2026-11-23. Fuente: `grep -rE "auth/register" tests` (21 archivos, 52 llamadas). Helper nuevo: `tests/fixtures/active-accounts.ts`
(`registerActiveAccount`, `activateAccount`, `markPending`; prueba propia `tests/integration/api/t1244-arnes-cuentas-activas-009.api.spec.ts`).
No se migró ninguna prueba existente (la política de registro no cambia hasta T1246); este inventario es la lista de migración de T1246.

Hecho de contexto: el OpenAPI 002 3.4.0 DRAFT (T1241) ya declara `registerUser 201 = AccountStatusView`; `api.call` valida cada respuesta contra el contrato, por eso las pruebas marcadas
CONTRATO fallan hoy por la deriva contrato/servidor, no por el arnés, y se resolverán con T1246 (el helper registra con `contract: false`).

| # | Archivo | Llamadas | Espera sesión tras registrar | Acción T1246 |
|---|---------|----------|------------------------------|--------------|
| 1 | tests/integration/api/auth.api.spec.ts | 12 | SÍ (cookie `argos_session`, `me`, logout) | las de sesión: `registerActiveAccount`; reescribir las de registro a `PENDING` (T1245); CONTRATO |
| 2 | tests/integration/api/precedence.api.spec.ts | 4 | NO (orden de errores 409/422) | sin cambio salvo contrato |
| 3 | tests/integration/api/server.api.spec.ts | 1 | SÍ (`logged`, `me`) | `registerActiveAccount` |
| 4 | tests/integration/api/t1230-identidad-flujo-admin-009.api.spec.ts | 1 | NO (cuerpo hostil, `contract:false`) | sin cambio |
| 5 | tests/integration/contracts/openapi-conformance.spec.ts | 1 | SÍ (cookie `lucia`, token de respaldo) | `registerActiveAccount`; CONTRATO |
| 6 | tests/integration/media/t577-composicion-medios.spec.ts | 1 | SÍ (cookie) | `registerActiveAccount` (SQLite del arnés propio) |
| 7 | tests/integration/media/t724-composicion-parametro.spec.ts | 1 | SÍ (cookie, 201) | `registerActiveAccount` |
| 8 | tests/integration/ops/logging.spec.ts | 1 | SÍ (cookie) | activar por SQL tras el alta |
| 9 | tests/integration/ops/t873-composicion-escena.spec.ts | 1 | SÍ (cookie) | `registerActiveAccount` |
| 10 | tests/integration/presentation/web-client.spec.ts | 3 | SÍ (cookie, `me`, logout); 1 de contraseña débil NO | activar por SQL; CONTRATO de tipos del cliente (`session.user`) |
| 11 | tests/security/exploits/credentials.security.spec.ts | 8 | 1 SÍ (scrypt, 201); resto NO (suplantación, fuerza bruta) | la de scrypt: `registerActiveAccount`; CONTRATO |
| 12 | tests/security/exploits/log-redaction.security.spec.ts | 3 | SÍ (cookie) | activar por SQL |
| 13 | tests/security/exploits/malicious-input.security.spec.ts | 6 | NO (entradas hostiles) | sin cambio salvo contrato |
| 14 | tests/security/exploits/media-004.security.spec.ts | 1 | SÍ (usuarios para medios) | `registerActiveAccount` |
| 15 | tests/security/exploits/t558-login-identificador-logs.security.spec.ts | 1 | SÍ (201 y luego login) | activar por SQL |
| 16 | tests/security/exploits/t591-revalidacion.security.spec.ts | 2 | SÍ (usuarios para revalidación) | `registerActiveAccount` |
| 17 | tests/security/exploits/ui-invitation-logs.security.spec.ts | 1 | SÍ (`lucia.sombra`) | activar por SQL |
| 18 | tests/unit/username-violation.spec.ts | 1 | NO (solo el path del problema) | sin cambio |
| 19 | tests/e2e/visual/e2e-support.ts (`registerViaApi`) | 1 | SÍ (cookie en el contexto del navegador; usada por todos los E2E de usuario) | activar por SQL/ruta de arnés E2E (`T1237` y otros) o aprobar vía `/admin` |
| 20 | tests/e2e/visual/google-vincular-008.spec.ts | 1 | SÍ (registra y espera 201 + sesión) | activar tras el alta |
| 21 | tests/e2e/admin/t1237-admin-usuarios-sesiones.spec.ts | 1 | SÍ (vía `registerViaApi`, 3 altas) | hereda el cambio de `registerViaApi` |

Totales: 21 archivos; 52 llamadas; 14 archivos esperan sesión tras registrar directamente (1, 3, 5, 6, 7, 8, 9, 10, 11 [1 de 8], 12, 14, 15, 16, 17) más 3 E2E (19, 20, 21) = 17 que migran con `registerActiveAccount`
o con activación SQL (≈18 del plan); 4 archivos no esperan sesión (2, 4, 13, 18) y solo se afectan por el contrato.

Pendientes para T1246 (fuera de T1244): rama de memoria del arnés (el estado aún no está en `UserAccount`/`MemoryState`); los E2E (Playwright) requieren una vía de activación que no dependa de SQL del
proceso de prueba (el servidor E2E es otro proceso): ruta de arnés de prueba, SQL contra el archivo SQLite del servidor E2E o aprobación real por `/admin`.

Hallazgo: recompilar 002/004 (`compile-contracts.sh --feature 002|004`) rompe `tsc` en `src/presentation/web/session.tsx`, `google-login.ts` y `tests/integration/presentation/web-client.spec.ts`
(las respuestas de `/auth/register`, `/auth/login` y `/auth/google/username` pasan a unión con `AccountStatusView`); por eso la recompilación de 002/004 queda para T1246/T1249 (ver informe).
