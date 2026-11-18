# Keymaker — Fase 6 (US4 Enlace veterinario, T750..T766) en argos-005

Fecha 2026-11-18 · rama 005-album-archivos-clinicos · base `a51405d` · HEAD `c95b5f7` · sin push · ninguna tarea `[x]` (la edición previa de `tasks.md` no se commiteó).
Entorno: sin procesos previos de este worktree; `node_modules` = symlink temporal (retirado); Postgres 17 con `down -v` al final.

## Commits
| Hash | Contenido |
|---|---|
| `42b9e67` | ROJO: 9 suites (T750 seguridad, dominio, token/limitador, casos de uso, repositorios/migración, rutas, concurrencia SQLite/PG, UI, resumen). Todas fallan por módulo ausente. |
| `82bbfe0` | VERDE 1: dominio `sharing/`, `summary/`, puertos, migraciones 0012 (SQLite) / 0008 (PG), repos memoria/SQLite/PG, casos de uso, `runReadOnly`. |
| `4b8b85f` | VERDE 2: rutas autenticadas y públicas, 404 uniforme (incl. errores de Fastify), redacción de `/shared/<token>`, paridad. |
| `c98ba4f` | VERDE 3: UI S4/S5/S6/S7, vista previa, página `/shared` fuera de sesión, E2E, suite de explotación (9 vectores), composición con clave HMAC. |
| `c95b5f7` | Trazabilidad por tarea, T764 ciclo de vida (cascada por mascota e importación por reemplazo), multi-hogar SC-005-048. |

## Verde por bloque
- Dominio/puertos/repos/casos de uso: memoria, SQLite y PG17 (contrato de 45 pruebas por motor, 42 de casos de uso).
- PG17 real: `REPEATABLE READ READ ONLY` verificado contra `READ COMMITTED` y rechazo de escritura (25006); revocación a mitad de lectura devuelve la instantánea coherente sin bloquear (SC-005-049); tope de 20 con dos creadores de hogar y 19 de mascota; clave de idempotencia simultánea (una fila).
- Rutas: cabeceras de REQ-VET-006 en 200/302/404/429/500; verbos distintos de GET = mismo 404 sin resolver; cookie inerte; 404 uniforme para parámetro largo, URL mal codificada (`frameworkErrors`), ruta no definida y barra final (probado por socket real); cuentan para la tasa; sin eco del token en cuerpo, cabeceras ni registros.
- Exploits (`tests/security/exploits/enlace-veterinario-005.security.spec.ts`, 20 pruebas, 9 vectores de Trinity) escritos por Keymaker con el rol de /seraph (no se invocó agente; se reporta).
- E2E `tests/e2e/enlace` 6/6 (Pixel 5, 320 px: crear/copiar una vez/listar/revocar con confirmación, lectura pública sin cookie ni /auth/me, nombre hostil como texto, impresión con `emulateMedia(print)` + PDF, axe sin críticos). E2E global: 80 pasan, 3 fallan (los 3 visuales preexistentes de 004 T550) y 9 no corren (dependientes seriales de esos).

## Compuertas
- `npx tsc --noEmit` = 0.
- Suite completa 001..005 con Postgres 17: 253 archivos, 4 039 pruebas: 4 038 pasan, 1 omitida (+220 sobre la línea base 3 819). La única falla de la corrida (`gates-004`, un `not.toBeNull` mío en T764) se corrigió y pasa; T591R-2 no falló.
- `verify-oracles.sh --feature 005` y sin flag: CUMPLE. `verify-traceability.sh --feature 001`: CUMPLE 113/113. `--feature 005 --task` T750..T769 y T764a: CUMPLE una a una (también T770..T775, T777, T779a; T776/T778/T779 quedan de la Fase 7).

## Decisiones firmadas aplicadas
Token en ruta con serializer sin URL, `instance` constante, `no-referrer`, `no-store`; autoridad del creador revalidada y `pet_owner_user_id_at_creation` (solo en migración); tope 20 bajo candado del alcance (PG: `FOR UPDATE` de mascota/hogar); `Idempotency-Key`; un único `nowIsoTimestamp()` por petición (espía); límite en memoria con barrido y tope duro, fail-closed, sin exención; caducidad {1,7,30}; URL firmada TTL<=300 s y mínimo 1 s (`allowShortTtl` en el puerto de medios, sin tocar el rango de 30 s de 004); `getSharedFile` 302; `SharedSummaryView` con `fileLabels`; share_* fuera del respaldo; purga 30/90/30 d en `runMaintenance` (todos los motores); sin rotación HMAC (PN-06).

## Excepciones (diff mínimo, por favor confirmar)
1. `tests/integration/persistence/sqlite-repositories.spec.ts` (autorizada): +tablas `share_link_audit`, `share_links` y `0012_share_links.sql` en las 2 listas.
2. `tests/integration/persistence/schema-parity.spec.ts` (+13/-3): añade `0008_share_links.sql` a la paridad estática y viva, las 2 tablas y 8 índices a las listas canónicas y reconoce `UNIQUE (a,b)` de tabla como restricción comparable.
3. `tests/integration/persistence/postgres-repositories-part3.spec.ts` (+2/-2): `RepositorySet` pasa de 13 a 15 claves (`shareAudit`, `shareLinks`).
4. `tests/security/exploits/ui-invitation-logs.security.spec.ts` (+3/-2): guarda INV-AUTH2-002 admite `share-api.ts` como segundo módulo con `fetch` (notifica actividad en toda petición con sesión; la lectura pública no la notifica).
Sin tocar contratos, specs, scripts de compuerta, `MediaPanel.tsx`, `t611`, `package.json`.

## Desviaciones y observaciones (requieren decisión o seguimiento)
- **MIF-005-09 / `node:crypto` en dominio**: `src/domain` no puede importar `node:*` (`layer-dependencies.spec.ts`, INV-ARCH-004). `hashToken` usa el SHA-256 PURO ya existente en el dominio (`audit/sha256.ts`), con comparación en tiempo constante propia; las pruebas lo verifican contra `node:crypto` (T752). Si Neo prefiere `node:crypto` literal, hay que exentar esa línea de la guarda. Escalar a /architect.
- **Fallos del framework**: un `GET` no definido bajo `/api/shared/` ejecuta la misma resolución de relleno que un token inexistente (misma secuencia de puertos) y puede agregar una fila `ACCESS_FAILED` (acotada por IP y ventana); los otros verbos no tocan la base.
- **Despliegue (para /link, T795)**: la clave `ARGOS_SHARE_IP_HMAC_SECRET` (Secret Manager) se lee en `config/share-config.ts`; sin ella, en producción (host 0.0.0.0) el enlace queda desactivado (crear = 500 interno, público = 404). No se tocó `.env.example` (varios tests lo comparan). La URL pública se arma con protocolo y host de la petición (`trustProxy` 1 salto); considerar `ARGOS_PUBLIC_BASE_URL` (Nivel 2). Filtro de Cloud Logging de `/shared/` pendiente de /link.
- **UI**: lista de enlaces en tarjetas también a >=1024 px (Sati pedía tabla); el alcance hogar se ofrece solo desde el contexto de un hogar donde el usuario es propietario/ADMIN y posee mascotas; la vista previa vive dentro del AppShell (al imprimir sale su cabecera). Para revisión de /sati y /seraph (Fase 8). Cabeceras de la PÁGINA `/shared` no se pueden ver con Vite en E2E: se prueban en `t759-pagina-compartida.api.spec.ts` con `staticRoot`.
- US5 parcial por dependencia de T758: `buildClinicalSummary` (T770), vista web (T775), hoja de impresión (T777) y vista previa (T776) se implementaron; sin T772 como caso de uso aparte, T778 ni T779 completo.
- La purga diaria traga errores (se reintenta al día siguiente), como la de la cola de medios.

## Estado por tarea (techo REVIEW; todas `[ ]`)
T750, T751, T752, T753, T754, T755, T756, T757, T758, T759, T760, T761, T762, T763, T764, T764a, T765, T766: REVIEW. T767..T769 (UI, revalidación, tope) también REVIEW. Ninguna BLOCKED.
