# Contratos de la Feature 003

**Estado**: `APPROVED` (Aprobada por Neo (Level 2) el 2026-11-15, bajo condiciones R1 a R5 del veredicto Oracle). La Fase 3 **no cambia ningún contrato de dominio** de la 001 ni de la 002 (los contratos de entidades, máquinas de estado y errores de negocio siguen vigentes). Requiere solo un contrato operativo nuevo, que se materializa en la tarea `c_contract` (T408) y no se escribe en la fase de especificación para no adelantar decisiones D-07/D-09 ni alterar `src/generated/`.

## `openapi/ops.openapi.yaml` (por crear, SemVer 1.0.0, `additionalProperties: false`)

| Operación | Método y ruta | Auth | Respuesta | Errores |
|---|---|---|---|---|
| `getHealthz` | `GET /healthz` | ninguna, sin CSRF | 200 `{ "status": "ok" }` (esquema cerrado) | — |
| `getReadyz` | `GET /readyz` | ninguna, sin CSRF | 200 `{ "status": "ready" }` (resultado cacheado en memoria 60 s, D-17; sin OIDC) | 503 `application/problem+json` RFC 9457 con `ERR-INTERNAL-UNEXPECTED` (base inaccesible o migraciones faltantes; sin detalle de la causa) |
| `runMaintenance` | `POST /internal/maintenance` | `Authorization: Bearer <OIDC>` de la cuenta del Scheduler (audiencia = URL del servicio) | 200 `{ sessionsPurged, confirmationTokensPurged, membershipsPurged, invitationsPurged, auditRowsPurged }` (enteros >= 0, solo conteos) | 401 sin token, 403 identidad ajena (RFC 9457; reutiliza el catálogo de autenticación de la 002 si existe el código; si no, `/architect` añade `ERR-*` en la tarea `c_contract`) |

Metadatos `x-sdd-metadata` con `requirementRefs` = REQ-CLD-004, REQ-CLD-007, REQ-SEC-007. Ninguna de las tres rutas expone identificadores de personas. `ops.openapi.yaml` **no toca contratos de dominio** (ninguna ruta coincide con las 40 operaciones de la 002; `ERR-*` de readiness reutilizan `ERR-INTERNAL-UNEXPECTED`). `/internal/maintenance` usa Bearer OIDC, ajeno a cookies y CSRF: queda **excluida de la matriz CSRF** y se prueba aparte (H-MERO-017).

## Salida de compilación (H-MERO-003)
`bash scripts/compile-contracts.sh --feature 003` escribe **solo** en `src/generated/ops/`; no toca `src/generated/api` ni `errors/` de la 002 (criterio: `git diff --stat -- src/generated/api` vacío tras compilar 003). `npm run test:gate` compila 002 y 003 en secuencia, y el conteo de 40 operaciones de `openapi-conformance.spec.ts` no cambia. Un `ERR-*` nuevo, si hiciera falta, vive en `contracts/errors/` de la 003 y el compilador lo fusiona de forma determinista (adición MINOR).

## Configuración (no es un contrato OpenAPI)
El esquema de variables vive en `src/infrastructure/config/app-config.ts` (INV-ARCH-006) y se enmienda en la tarea `i_cfg` (T410): `HOST ∈ {127.0.0.1, 0.0.0.0}` (**D-26 resuelta por Neo**: `0.0.0.0` solo con `NODE_ENV=production` o `ARGOS_DB_DRIVER=postgres`; rechazos de `::`, `localhost`, `10.x` y vacío; firma junto con T403), `ARGOS_DB_DRIVER ∈ {sqlite, postgres}`, `DATABASE_URL` (patrón `^postgres(ql)?://`, obligatoria solo con `postgres`), `ARGOS_PG_POOL_MAX` entero 1..10.

## Compatibilidad
Cambio MINOR respecto de la 002 (solo rutas y variables nuevas, valores por defecto conservan el comportamiento local). Sin migración de datos de contratos.
