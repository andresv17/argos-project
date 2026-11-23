# Acta Trinity — 009 T1238 AppSec del portal /admin — 2026-11-23 (refrescada tras Oracle y Sentinels)
Alcance: `admin.routes.ts`, `csrf-guard.ts`, `admin-rate-limit.ts`, `static-assets.ts`, `admin-session-policy.ts`, `src/presentation/admin`. Sin ediciones de `src/**`, specs ni contratos. Sin commit ni [x].

## SAST
Semgrep 1.186.0 (instalado; comando del proyecto, `.github/workflows/test-gate.yml:85`): `semgrep scan --config tests/security/sast-rules --error --metrics=off <archivos admin + src/presentation/admin>` -> 5 reglas, 7 archivos, 0 hallazgos. Revisión manual: sin `innerHTML`/`dangerouslySetInnerHTML`/`eval` en `src/presentation/admin`.

## Pruebas (tests/security/t1238-portal-admin-009.security.spec.ts, 28 casos)
XSS cross-site 5, IDOR 5, enumeración de rutas 4, sesión expirada 4, CSRF 5, fuerza bruta 4, uniformidad de tiempos 1. Suite propia: 28/28 verdes (sin cambios). Cifras vigentes: `npx vitest run tests/security` -> 28 archivos, 561/561 (antes 27 archivos, 537/537; la diferencia es la suite de Sentinels). Dos rojos iniciales fueron errores de mi prueba (HEAD sin cuerpo; `instance` en el 403), corregidos en la prueba, no en el producto. El tiempo es estadístico (medianas, tolerancia 3x o 1 ms): señal, no prueba de ausencia de canal.

## Sentinels (ejecutado)
`tests/security/sentinels-009-T1238.security.spec.ts`: 24/24. Su hallazgo SEN-T1238-01 queda CERRADO por la corrección de Keymaker en `src/infrastructure/http/plugins/static-assets.ts`; la variante `/./` es un artefacto del arnés light-my-request, verificado con una prueba de socket real. Detalle en `.specify/memory/audits/sentinels-009-T1238.md`.

## Hallazgos del producto
Ninguno ABIERTO bloqueante (0 ALTO, 0 MEDIO).
- TRI-01 (BAJO) `admin.routes.ts:123-124`: CERRADO por dictamen de Neo. Reglas finales: el Origin se valida DESPUÉS de la sesión admin; un Origin ajeno sin sesión responde 404 uniforme; solo la ausencia de `X-Argos-Request` responde 403 antes de la sesión. El código coincide; sin cambio de código. Origen ajeno nunca revoca (probado).
- TRI-02 (BAJO) `admin.routes.ts:2`: CORREGIDO por Keymaker. Verificado en disco: el docstring cita ahora contrato `admin.openapi.yaml` 1.2.0. Sin cambio de comportamiento.
- TRI-03 (BAJO, operativo) `admin-rate-limit.ts:34-35`: ABIERTO, dueño Link, no bloquea T1238. Límite en memoria por instancia; con varias instancias Cloud Run el tope efectivo es N veces mayor (ADR-009-15; aceptado). Confirmar antes del despliegue que `trustProxy` de producción sea 1 salto (default de `buildApp` es false; valor en el arranque no confirmado).
- TRI-04 (INFO) `static-assets.ts`: `/admin/x` y `/admin/` devuelven 404 text/plain, `/admin` solo con admin.html (verificado).

## Correcciones de producto pendientes para Keymaker
Ninguna.

## No ejecutado
E2E Playwright: no.
