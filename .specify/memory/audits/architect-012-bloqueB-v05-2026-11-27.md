# Acta /architect — Bloque B DRAFT 0.5 (feature 012, #23, T1630..T1632) — 2026-11-27

Solo texto. Sin commits, sin `[x]`, sin `APPROVED` nuevo, sin `compile-contracts`, sin tocar `src/`, `tests/`, `scripts/`, specs 001/004/005 ni archivos de H-01. `tasks.md`: solo la frase de T1646 (N-07). T1641 ya estaba alineada (`closed_at`, `RESOLVED` o `EXPIRED`).

| Hallazgo | Cambio aplicado | Pendiente Neo |
| --- | --- | --- |
| rama N-07 (ALTO) | `spec.md` SC-012-096, EDGE-012-053, EDGE-012-054 y `tasks.md` T1646: reserva «hasta `RESOLVED` o `EXPIRED` (cierre con `closed_at`)», igual que `data-model.md:152` y `admin-disputes-annex.md:50` | No |
| rama N-09 (BAJO) | `data-model.md` encabezado en líneas separadas: Fase 0 y Bloque A `APPROVED`; Bloque B `DRAFT 0.5` sin aprobar | No |
| rama N-08 | No decidido: la prueba de restauración sigue «propuesta, sin numerar»; se añade marcador `PENDIENTE NEO (rama N-08)` en `data-model.md` | Sí: numeración de la SC y tarea |
| oracle 1 (MEDIA) | `error-catalog.json` `change_note`: el raíz `0.1.0 / APPROVED` cubre solo el bloque 0.1.0 aprobado; el 0.2.0 está en DRAFT. Raíz intacto. Verificado por lectura: `compile-contracts.sh` valida `x-sdd-metadata` (version/status/traceability), nunca el `status`/`version` raíz | No |
| oracle 3 (BAJA) | `chip-claim.openapi.yaml` (`info.version` y `x-sdd-metadata.version`) y `chip-claim.schema.json` a `0.2.0` DRAFT, con `change_note` de la 0.5 | No |
| oracle 4 (BAJA) | Renombrada `errata-MINOR-bloqueB-v03.md` → `errata-MINOR-bloqueB-v04.md` (contenido intacto; encabezado dice «cubre 0.3 y 0.4»); referencias actualizadas en `spec.md`, anexos y OpenAPI; actas y bitácora históricas conservan el nombre antiguo | No |
| trinity B-N8 (BAJO) | OpenAPI paso 10: solo «confirmar» la clave, sin copiar ni mover bytes bajo candado | No |
| trinity B-N9 (BAJO) | OpenAPI (paso 3 y respuesta 413), `data-model.md` (contador multipart) y `schema` (`CHIP_MULTIPART_MAX_PER_USER_PER_DAY`): el 413 por `Content-Length` y el 411 no cuentan; solo el 413 por archivo (paso 4) | No |
| trinity B-N10 (BAJO) | Área de espera con TTL y barrido de huérfanos (OpenAPI, anexo de disputas); constante nueva `DISPUTE_EVIDENCE_STAGING_TTL_HOURS` con `value: null`, PENDIENTE T1646; un 503 de subida también encola lo ya subido | No (valor en T1646) |
| trinity B-N11 (BAJO) | OpenAPI y anexo: reintentos tras 503 de subida/antimalware consumen intentos de chip y multipart; se considera en el valor de `CHIP_MULTIPART_MAX_PER_USER_PER_DAY` en T1646 | No |
| trinity B-N12 (BAJO) | Verificado por lectura: `specs/004` no define 411. OpenAPI declara que el 411 usa el `ProblemDetails` genérico de la plataforma (`common.schema.json`), sin esquema ni código propios; confirmar en T1646 | No |
| Antimalware bloqueante | Condición declarada como marcador en `admin-disputes-annex.md` (§5.1): `PENDIENTE NEO` | Sí |

## Validación
JSON (catálogo, schema) y YAML (OpenAPI) válidos; `verify-traceability.sh --feature 012` rc=0; `verify-oracles.sh` rc=0. `compile-contracts` NO ejecutado.

## Decisiones que siguen PENDIENTE NEO (no tomadas por architect)
H-A2 (oráculo del listado), N-1 (canal de tiempo del 202), criterio del contador bloqueado, T1648 para N-3 (propuesta no numerada), visto bueno a la nota de `ERR-OWN12-RETRYABLE` (0.1.0), antimalware bloqueante para APPROVED, N-08 (SC de restauración), F-03, F-05, F-08, F-09, `BACKUP_MAX_RETENTION_DAYS`, errata 001 y firmas E-B1/E-B3/E-B4 (no tocadas).
