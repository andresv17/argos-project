# Sentinels — 009 T1238 enjambre de 9 vectores sobre `/api/admin/*` y `/admin` — 2026-11-23

Alcance: `src/infrastructure/http/routes/admin.routes.ts`, `plugins/csrf-guard.ts`, `plugins/static-assets.ts`, `admin-rate-limit.ts`, `src/presentation/admin`. Sin ediciones de `src/**`, `specs/**`, `src/generated/**`, `playwright.config.ts` ni MER-11. Sin commit, sin push, sin [x] en `tasks.md`.
Prueba: `tests/security/sentinels-009-T1238.security.spec.ts` (24 casos, no duplica los 28 de Trinity en `t1238-portal-admin-009.security.spec.ts`).
Reglas FINALES (Neo, Logos) aplicadas: origen validado DESPUÉS de la sesión; sin sesión + origen ajeno = 404 uniforme; solo `X-Argos-Request` ausente = 403 antes de sesión. No marcadas como hallazgo.

## Resultado por vector

| Vector | Casos | Resultado | Hallazgo |
|---|---|---|---|
| I IDOR | 4 | 4 PASS | SEN-T1238-01 (BAJO) CERRADO |
| II Multi-tenant / estados inválidos | 2 | PASS | — |
| III Anónimo (matriz de verbos) | 2 | PASS | — |
| IV Sesión alterada / intercambiada / duplicada | 3 | PASS | — |
| V CSRF (formas de navegador entre sitios) | 2 | PASS | — |
| VI Enumeración y fuerza bruta | 2 | PASS | — |
| VII Prototype pollution / esquema | 3 | PASS | — |
| VIII Desbordamiento de carga | 3 | PASS | — |
| IX XSS y esquemas peligrosos | 3 | PASS | — |

Total: 24 casos, 24/24 PASS.

### I — IDOR
- Intentado: variantes de ruta de la sesión (mayúsculas en el segmento `Session` y en el prefijo `/API/ADMIN/`, barra final, `//`, `%73ession`, `session%2F`, `session;x=1`, `./session`, `/api/admin/./session`), con y sin cookie válida; identificadores ajenos en rutas hipotéticas (`/sessions/<uuid>`, `/admins/<uuid>`, `/session/<uuid>`); normalización de `../`.
- Resultado: PASS.
- **SEN-T1238-01 (BAJO) — CERRADO.** Hallazgo original: `GET /API/ADMIN/SESSION` servía el `index.html` de la app de usuarios (200, `text/html`) en lugar del 404 uniforme. Corrección aplicada por keymaker en `src/infrastructure/http/plugins/static-assets.ts`: comprobaciones de `/api/` y `/assets/` sin distinguir mayúsculas, y una regla de hook que responde el 404 uniforme a rutas `/api/admin` con `%`, `;`, `//`, `/.` o `..`. Durante la corrección se detectó y cerró también el bypass `%73ession`.
- **SEN-T1238-01b — VERIFICADO (artefacto de harness, no de la app).** `/api/admin/./session` se normaliza por light-my-request antes de llegar a la app, por lo que `app.inject` no ejercita esa ruta. La verificación se hace por socket real en `[EDGE-009-012] SEN-T1238-01b`, con control canónico 200 (`application/json`, misma cookie) y referencia NOT_FOUND 404. La petición `/./` devuelve 404 `text/plain` idéntico a la referencia, sin `adminId`, con y sin sesión.

### II — Multi-tenant / estados inválidos
- Intentado: DELETE de la sesión del administrador B no revoca la de A (y viceversa) con dos identidades administrativas (`ADMIN_EMAIL`, `ADMIN_EMAIL_2`); la cookie de administración no autentica en `/api/households` ni `/api/auth/me`.
- Resultado: PASS. Un administrador solo revoca su propia sesión; la cookie de administración no entra en la app de usuarios.
- No ejecutado: estado "pendiente de invitación" de administrador (N/A: el modelo de administración no tiene invitaciones; la pérdida de permiso ya la cubre Trinity, EDGE-009-047).

### III — Anónimo
- Intentado: matriz GET/POST/PUT/PATCH/DELETE/HEAD × `/api/admin/session`, `/api/admin/x`, `/api/admin/auth/google/callback/x`, `/api/admin/auth`, `/api/admin`, con origen propio y cabecera CSRF, sin cookie; callback sin parámetros; start con POST.
- Resultado: PASS. Todas las combinaciones dan 404 idéntico al de una ruta inexistente (cuerpo comparado en todos los verbos salvo HEAD, cuyo cuerpo es vacío por protocolo); ninguna 2xx ni 5xx; sin `Set-Cookie` de sesión.

### IV — Sesión expirada / revocada / alterada
- Intentado: alteración de un carácter en 4 posiciones del token; token OAuth usado como sesión y token de sesión usado como cookie OAuth en el callback; cookies `argos_admin_session` duplicadas (inválida antes/después de la válida, vacías).
- Resultado: PASS. Ningún token alterado autentica; la cookie OAuth no crea sesión; duplicadas sin 5xx y solo 200 o 404.

### V — CSRF
- Intentado: DELETE con `application/x-www-form-urlencoded`, `text/plain`, `multipart/form-data` sin `X-Argos-Request` → 403 y sesión viva; DELETE con `Origin` ajeno, `Referer` ajeno y `Sec-Fetch-Site: cross-site` sin cabecera → 403 y sesión viva.
- Resultado: PASS.

### VI — Enumeración y fuerza bruta
- Intentado: seis causas de fallo del callback (sin código, código inválido, estado inválido, `error=access_denied`, sin cookie OAuth, cookie basura) comparadas byte a byte; tope de inicios por IP (`ADMIN_START_LIMIT.maxStarts` = 20) con 429 + `Retry-After`, sin cookie OAuth nueva, y con `X-Forwarded-For` rotado.
- Resultado: PASS. Causas indistinguibles; el tope de inicios no se evade con `X-Forwarded-For`.
- No aplicable: fuerza bruta de contraseña y enumeración de cuentas por login con usuario/clave (N/A: el portal es solo Google OIDC). Tiempos: cubiertos por Trinity (`uniformidad de tiempos`); su fallo intermitente bajo carga es riesgo de flakiness, no hallazgo nuevo.

### VII — Prototype pollution / esquema
- Intentado: cuerpo JSON con `__proto__`, `constructor.prototype` y `admin:true` a DELETE con sesión; consultas `__proto__[x]` y `constructor[prototype][x]` en session y callback; cuerpos JSON no objeto (array, cadena, null, número) a POST con sesión.
- Resultado: PASS. `Object.prototype` no se contamina; no hay 5xx; los no-objeto dan 404.

### VIII — Desbordamiento de carga
- Intentado: DELETE de 2 MB sin sesión y con sesión (si 413, la sesión debe seguir viva); `code` de 3 KB y `state` de 10 KB en el callback (ignorados como ausentes); cookie de 20 KB.
- Resultado: PASS. Sin 5xx; sin 2xx anónimo; sin revocación por cuerpo grande; los parámetros sobredimensionados no se reflejan.

### IX — XSS y esquemas peligrosos
- Intentado: `javascript:`, `JaVaScRiPt:`, `data:text/html,<script>`, `vbscript:` en `code`, `state` y `error` del callback; página de éxito sin destino derivado de la consulta; `GET /admin?next=javascript:…&x=<script>`.
- Resultado: PASS. Ningún valor del atacante aparece en la respuesta ni en cabeceras; la página de éxito navega solo a `/admin`; `/admin` sirve el HTML estático sin reflejar la consulta.

## Vectores NO ejecutados
- E2E en navegador real (Playwright) para XSS y CSRF: NO ejecutado (fuera de la misión: `tests/security` solo, sin E2E).
- Ataques contra entornos remotos: NO ejecutado (prohibido sin autorización; todo en `app.inject` o socket local).
- Pruebas de carga reales de límite por tiempo (ventanas de 15 min): NO ejecutado en tiempo real; el reloj del harness se usa solo donde ya existe en Trinity.
- Estado "pendiente de invitación" de administrador: N/A (el modelo de administración no tiene ese estado).
- Fuerza bruta de contraseña: N/A (portal solo Google OIDC).

## Ejecución
- `npx vitest run tests/security/sentinels-009-T1238.security.spec.ts`: 24/24 PASS (corrida final, según acta de oracle; 24 `it(` verificados en el archivo).
- `npx vitest run tests/security` (suite completa, según oracle): 28 archivos, 561/561 PASS.
- `npx vitest run tests/security/t1238-portal-admin-009.security.spec.ts`: 28/28.
- Mutaciones (según oracle, en copia scratch): M1 (sin normalización de mayúsculas) → SEN-T1238-01 en rojo; M2 (sin regla de hook `/api/admin`) → rojo en `/api/admin/%73ession` con sesión.

## Veredicto
Vectores I–IX: 24/24 PASS. SEN-T1238-01 (BAJO) cerrado por keymaker; SEN-T1238-01b verificado por socket real. Ningún vector penetró el perímetro de autenticación, sesión, CSRF ni XSS. Estado: sin hallazgos abiertos; acta lista para revisión de commit por /oracle.
