# Quickstart — Feature 010 (prueba local)

1. `npm run dev` (API `127.0.0.1:3100`, Vite `127.0.0.1:5173`).
2. `#65`: abrir `/login`, `/`, `/cuenta`, `admin.html` en claro/oscuro; `grep -rIn "Argos" index.html admin.html src/presentation/web`.
3. `#67`: sin sesión abrir `/privacidad` y `/terminos`; DevTools > Red sin llamadas a la API.
4. `#66`: `server.ts:240` pone `trustProxy=false` si `host !== '0.0.0.0'`, así que con `npm run dev` (`127.0.0.1`) el número de saltos no se ejercita. La prueba local se hace (a) con `ARGOS_HOST=0.0.0.0 ARGOS_TRUST_PROXY_HOPS=2 npm run dev` y `curl -H "X-Forwarded-For: 203.0.113.9, 198.51.100.7" http://127.0.0.1:3100/...`, o (b) con la prueba de unidad del parser de saltos (`T1416`), que no depende del host. Cloudflare real solo en producción (Neo).
5. `#75`: `/register` sin y con la casilla; `curl` sin el campo.
6. `#33`: `/admin` → «Acerca de» (foto + texto); `/acerca-de` sin sesión.
7. Gates, en orden: `npx tsc --noEmit`; `npm run test:gate`; `bash scripts/verify-oracles.sh`; `bash scripts/verify-traceability.sh --feature 010`.
