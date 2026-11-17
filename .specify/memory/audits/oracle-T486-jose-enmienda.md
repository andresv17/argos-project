# Oracle T486 — jose@6.2.17, enmienda 3.4.0 y registro (2026-11-16)

Veredicto: CUMPLE CON RESERVAS (3 reservas menores, ninguna bloquea REVIEW).

1. Alcance: b0d3b98 = solo tests/unit/oidc-verify.spec.ts (+105). 329c841 = package.json (+1), package-lock.json (+11), src/infrastructure/http/oidc-verify.ts, correccion de tipos de la prueba (KeyLike -> CryptoKey). Sin ajenos.
2. package.json:31 "jose": "6.2.17" exacto (sin ^ ni ~). Lock: raiz y node_modules/jose 6.2.17, integrity presente.
3. Lock: diff = jose (2 hunks) + "hasInstallScript": true en better-sqlite3. Version de better-sqlite3 sin cambio (13.0.3). Dictamen: artefacto inocuo de npm. better-sqlite3 no declara script install en su package.json, pero trae binding.gyp, por lo que npm lo trata como install implicito (node-gyp rebuild) desde siempre; el lock solo registra el hecho. La superficie de instalacion no cambia. Accion: aceptar (no revertir; revertirlo dejaria un lock menos fiel).
4. Rojo (worktree temporal en b0d3b98^, eliminado): 2 fallos, 9 pasan. Los 2 rojos son los caminos felices ((a) valido y (a2) emisor sin esquema) con "verificador OIDC no configurado"; los 9 negativos pasan porque el stub era fail-closed. Rojo valido para TDD.
5. Verde: oidc-verify 11, maintenance-route 21, ops-surface 56 = 88/88.
6. Implementacion: jwtVerify con issuer [https://accounts.google.com, accounts.google.com], audience, algorithms ['RS256'] (oidc-verify.ts:50); email_verified !== true rechaza; fail-closed sin audiencia, sin emisores, sin JWKS valido; sin token rechaza via jwtVerify. Sin claves/tokens reales: claves efimeras con generateKeyPair en beforeAll. process.env: solo aparece en un comentario (linea 8), cero lecturas; argos-no-process-env y Purity Gate (0 violaciones) OK. Sin imports desde src/domain ni src/application; unico consumidor server.ts:107.
7. JWKS remoto por defecto https://www.googleapis.com/oauth2/v3/certs; createRemoteJWKSet solo si no hay jwks inyectado. La red real no se probo: reserva aceptable, se cubre en T458/T462 (SC-CLD-009).
8. Enmienda 3.4.0: Sync Impact Report 3.3.0 -> 3.4.0 con fecha 2026-11-16 y autorizacion de Neo (Logos iter 150, T486); Technology Stack acota jose a /internal/maintenance, prohibe domain/ y application/ y exige autorizacion nueva para otro uso; la unica diferencia respecto a HEAD son 4 hunks (reporte, linea de dependencias, version 3.4.0/Last Amended, nota de firma); ningun principio cambia. Formato coherente con 3.3.0. MINOR correcto.
9. tasks.md: T486 [ ] dep T414, trazas REQ-SEC-007, REQ-CLD-007, SC-CLD-009 (+ mapa); T458 dep T486; T462 sin "pendiente de creacion"; T469 anclada en T457/T458, proyecto real, 1 USD, alternativa descartada. Cero [x] nuevos; T401 [x] y T453 [ ] intactos.
10. Compuertas: tsc 0; scan-secrets 0 hallazgos; verify-traceability 003 CUMPLE. actionlint no instalado: no ejecutado (reserva).

Hallazgos
- H-1 (baja) package-lock.json: hasInstallScript, ver punto 3; informativo.
- H-2 (baja) La prueba en rojo solo fallo en 2 casos (los felices); aceptable.
- H-3 (baja) Red real de Google no probada; verificar en T458/T462.
- H-4 (baja, higiene) El working tree incluye cambios ajenos a T486: plan.md (ADR-003-09), research.md (R-06), .claude/settings.json, logs. No mezclar.

Commiteables para T486/enmienda: .specify/memory/constitution.md y specs/003-cloud-gcp/tasks.md (+ este informe y la linea del bus). plan.md, research.md, settings.json y logs: commit aparte segun su dueno. Codigo de Keymaker ya esta commiteado.
