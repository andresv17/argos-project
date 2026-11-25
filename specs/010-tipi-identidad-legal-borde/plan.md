# Implementation Plan: Identidad Tipi, legal, borde, menores y Acerca de (Feature 010)

**Spec**: `spec.md` | **Tasks**: `tasks.md` | **Estado**: `APPROVED` (2026-11-25, Nivel 2 Neo)

## Resumen técnico
Cinco cambios casi independientes sobre la base 009: (1) módulo `brand` + tokens + activos del paquete `tipi-marca.zip`; (2) dos páginas React públicas; (3) configuración del número de saltos de proxy y runbook de Cloudflare; (4) declaración de mayoría de edad en el registro (columna + error de catálogo); (5) contenido «Acerca de» (tabla singleton + rutas admin/públicas). Sin dependencias nuevas (`package.json` intacto).

## Constitution Check
| Principio | Evaluación |
| --- | --- |
| I Contratos como fuente | Contratos nuevos solo para `#75` (código de error) y `#33`/`D10-02` (OpenAPI admin); recompilación con autorización de Neo |
| II Determinismo | Sin relojes ni aleatoriedad nuevos fuera de puertos existentes; `adult_declared_at` usa el reloj inyectado |
| III Trazabilidad | IDs `REQ-TIP10/EDG10/LEG10/MEN10/ACE10`; `verify-traceability.sh --feature 010` requiere ampliar el script (ver más abajo) |
| IV Test Gate | TDD por bloque; prueba local previa en cada bloque |
| V Seguridad y privacidad | `/rama` y `/trinity` convocados; sin enumeración; EXIF eliminado; texto sanitizado |
| VI Stack | Sin dependencia nueva; proveedor Terraform de Cloudflare **no** se adopta sin `D10-04` (N2) |

## Decisiones técnicas
- **Marca**: `src/presentation/web/brand.ts` exporta `BRAND_NAME`; activos en la carpeta estática de Vite. Fuentes `woff2` locales con `@font-face` (sin CDN, CSP intacta). Identificadores internos intactos (`D10-01`).
- **IP real**: `ARGOS_TRUST_PROXY_HOPS` sustituye el `1` fijo de `server.ts:240`; `app.ts` conserva `hop < N`. Con Cloudflare: `Cliente -> Cloudflare -> Cloud Run -> app` = 2. Riesgo residual por acceso directo a `*.run.app` (`D10-03`).
- **Borde**: configuración manual por runbook (`D10-04`); no verificable en CI.
- **Menores**: declaración en servidor, columnas en `users`/cuenta (`data-model.md`), sin fecha de nacimiento.
- **Acerca de**: tabla singleton `about_content` + foto en el almacenamiento de media existente; sanitización de Markdown en servidor (lista blanca) y cliente.
- **Compuerta de trazabilidad**: `scripts/verify-traceability.sh` no tiene ramas específicas para 010 (solo 001..009). Escalar a Neo (N2: scripts de verificación) la adición de los prefijos `TIP10|EDG10|LEG10|MEN10|ACE10` y `SC-010` en una tarea de Keymaker antes del cierre; hasta entonces se ejecuta y se informa su salida (ver informe del Architect).

## Orden y gates
Fase 0 → 1 (`#65`) → 2 (`#67`) → 3 (`#66`) → 4 (`#75`) → 5 (`#33`) → 6. Cada bloque: prueba local → `tsc` → `test:gate` → `verify-oracles` → `verify-traceability`. `/mouse` una sola vez (`T1403`).

## Riesgos
`R1` Terracota/Crema sin AA en texto pequeño. `R2` hops mal fijado (`EDGE-010-002`). `R3` texto legal sin validación jurídica (`D10-05/06`). `R4` foto personal publicada (`/rama`).
