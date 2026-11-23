# Oracle 009 T1235 — RETRY (MAX_RETRY=1) revalidación del fix fail-closed — 2026-11-23

Veredicto: **PASS** (la SAFETY FAIL del acta oracle-009-T1235-admin-ui.md queda cerrada). 1 observación operativa (no FAIL).

## 1. Chequeo real (vite build en scratchpad, registerStaticAssets + fastify.inject)
Build: `vite build --outDir <scratchpad>/dist` OK (admin.html + index.html + assets/admin-*.js).
| Raíz | Petición | Resultado |
|---|---|---|
| con admin.html | GET /admin, GET /admin?a=1 | 200 text/html, `id="admin-root"`, sin `id="root"`, sin argos_session |
| con admin.html | HEAD /admin | 200 text/html, cuerpo vacío |
| con admin.html | /admin/, /admin/x | 404 text/plain "Not Found" |
| SIN admin.html | GET /admin, GET /admin?a=1, HEAD /admin | 404 text/plain; GET cuerpo "Not Found"; sin id="root" ni argos_session |
| SIN admin.html | /admin/, /admin/x | 404 text/plain |
| ambas | GET /login, GET / | 200 SPA de usuarios (id="root") |
PASS.

## 2. Ningún otro camino sirve index.html bajo /admin
static-assets.ts: `index.html` solo en :37 (`index: ['index.html']` de @fastify/static, aplica a directorios reales; /admin y /admin/ no son directorios en dist) y :57 (fallback SPA), este último inalcanzable para /admin y /admin/* porque :50 y :51-54 retornan antes. :25 hasAdminEntry; :52 `!isRead || !hasAdminEntry` -> 404 uniforme GET/HEAD. Verificado empíricamente arriba (/admin/ y /admin/x, con y sin admin.html). PASS.

## 3. Guardia de arranque server.ts:144-147
- `:146` (existente) lanza si no hay index.html y host 0.0.0.0.
- `:147` lanza "Falta dist/admin.html" solo si `options.staticRoot === undefined && serveStatic && host === '0.0.0.0' && !existsSync(admin.html)`.
- Desarrollo (127.0.0.1, sin dist): `serveStatic` false y host != 0.0.0.0 -> ninguna excepción; sin cambios. staticRoot inyectado: `options.staticRoot === undefined` falso -> se salta la guardia (server.api.spec.ts y fixtures siguen verdes).
PASS.
**OBS operativa (no FAIL):** el `dist/` actual del repo está viejo (solo index.html + assets); un arranque de producción desde él ahora falla al iniciar con "Falta dist/admin.html". Neo/Link debe ejecutar `npm run build` (vite build) y verificar que `dist/admin.html` existe antes de desplegar. (dist/ no se tocó.)

## 4. Compuertas
`npx vitest run t1235 t1228 t1230 t1231 t1227 t1234 tests/integration/api/server.api.spec.ts`: 7 archivos, **70/70 verdes** (t1235 8, t1228 10, t1231 19, t1230 18, t1234 5, t1227 9, server 1). `npx tsc --noEmit`: **exit 0**.

## 5. Rojo-luego-verde plausible
t1235.api.spec.ts:53-66: crea dir solo con index.html (USER_HTML con id="root"), levanta con staticRoot inyectado, y para GET y HEAD /admin exige 404, content-type text/plain y ausencia de `id="root"`; GET además cuerpo exacto "Not Found". Con el código previo (fallback a index.html, status 200 + text/html + id="root") esas tres aserciones habrían fallado: el rojo es plausible y el test ataca exactamente el defecto. t1228 usa ahora `staticRootWithAdmin()` (admin-fixtures.ts:46-50), coherente con el nuevo contrato. No ejecuté el rojo (no se editan archivos).
Cobertura: la guardia de arranque :147 no tiene test propio (OBS menor; verificada por lectura de código).

## Estado en disco: T1235 listo para commit
Archivos T1235: `admin.html`, `vite.config.ts`, `tailwind.config.ts`, `src/presentation/admin/`, `src/infrastructure/http/plugins/static-assets.ts`, `src/infrastructure/http/server.ts`, `tests/integration/api/t1235-portal-admin-ui-009.api.spec.ts`, `tests/e2e/admin/`, `tests/fixtures/admin-fixtures.ts`, `tests/integration/api/t1228-aislamiento-admin-009.api.spec.ts`, actas `oracle-009-T1235-admin-ui.md`, `oracle-009-T1235-retry.md`, `sati-009-T1235-admin-ui.md`, y bitácoras/bus. EXCLUIDOS: MER-11 y `playwright.config.ts`. (No stagear .gitignore/CLAUDE.md/005 tasks/logos.* salvo decisión de Morpheus.) Pendiente fuera de alcance: SC-009-010 (pregunta N2, la gestiona Morpheus). No marqué [x].
