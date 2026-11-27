# Acta architect — Bloque B (T1630..T1632, T1648), iteración DRAFT 0.6 (feature 012, 2026-11-27)

Autoridad: decisiones de **Neo — Nivel 2, 2026-11-27** (directiva Logos vía `/morpheus`). Estado de los contratos del Bloque B: **`DRAFT`** (T1630, T1631, T1632 y T1648 NO pasan a `APPROVED`; es del siguiente turno de Neo). Única promoción: `errata-MINOR-bloqueB-v04.md` (firma de Neo en su encabezado). Sin commits, sin push, sin `[x]`, `compile-contracts` no ejecutado; `specs/001-*`, `004`, `005`, `src/`, `tests/`, `scripts/` y archivos `H-01` intactos.

## Tabla resolución → cambio aplicado

| # | Resolución de Neo | Cambio aplicado (archivo) |
| --- | --- | --- |
| 1 | `E-B1` | `spec.md` `REQ-OWN12-011`: añadida la regla de candado global + candado asesor por `chip_hmac` para `createChipClaim`, `openChipDispute` y el comprobador único; mismo `503` uniforme; candado por mascota solo dentro de la rama que crea fila. (Nota: la errata fija `REQ-OWN12-011`, no `REQ-CHP12-002`, como destino; `REQ-CHP12-002` no cambia) |
| 1 | `E-B3` | `spec.md` `REQ-CHP12-009`: `CHIP_APPROPRIATION` solo control dual (no elegible), step-up en `resolve` y `confirm`; ventana de 72 h solo en ausencia, con veto de cualquier administrador no parte |
| 1 | `E-B4` | `spec.md` `REQ-CHP12-008` (línea 95) y `SC-012-082` (línea 297): «saneo de EXIF» pasa a saneo profundo (imagen reencodificada con límite de píxeles, PDF sin contenido activo y rechazado con 422, antimalware), según `admin-disputes-annex.md` §5.1; `T1641` actualizada |
| 1 | Errata 001 (orden chip vs IDs ajenos) | `microchip-error-split-annex.md` §1, §5 y §7: **APROBADA por Neo**, ratifica la propuesta; la 001 NO se toca |
| 1 | Errata marcada | `errata-MINOR-bloqueB-v04.md`: `E-B1`, `E-B3`, `E-B4` = **Aplicada**; `E-B2` sin marcador `PENDIENTE`; línea de la errata 001 aprobada |
| 2 | `ARBITER_AUDIT_RETENTION_DAYS = 1095`, `BACKUP_MAX_RETENTION_DAYS = 30`, `DISPUTE_EVIDENCE_STAGING_TTL_HOURS = 24` | `chip-claim.schema.json` `x-sdd-constants` con `value` (24 en la existente; 1095 y 30 nuevas); `spec.md` lista de constantes; `data-model.md` (matriz de retención y auditoría); `admin-disputes-annex.md` §5.1, §8; `chip-claim.openapi.yaml`. Marcadores `PENDIENTE` retirados |
| 3 | `F-08` árbitro solo ve seudónimos | `admin-disputes-annex.md` §4 (sin acción de revelar identidad); `spec.md` `REQ-CHP12-007`; `admin-disputes.schema.json` (`DisputePartyView`) |
| 3 | `F-09` aviso de resolución | `spec.md` `REQ-CHP12-010` y `admin-disputes-annex.md` §9: solo desenlace cerrado (`APPROVED`/`REJECTED`/`EXPIRED`), ID de solicitud y fecha; `DisputeResolutionNotice` en el schema; marcador `[CONTENIDO...]` retirado |
| 4 | `F-03` excepción de conservación | `data-model.md` (fila `owner_requests` `CHIP_DISPUTE`), `admin-disputes-annex.md` §5.3 y `spec.md` `REQ-CHP12-008`: aprobada, **condicionada** a validación legal en `DEUDA-012-LEGAL-DISPUTAS-QR` antes de producción |
| 5 | Antimalware bloqueante | `admin-disputes-annex.md` §5.1, `chip-claim.openapi.yaml` y `chip-claim.schema.json`: condición **bloqueante para producción** (checklist de release junto con `DEUDA-012-LEGAL-DISPUTAS-QR`); en dev/CI puerto/stub determinista sin llamadas externas |
| 6 | `H-A2` y `N-1` aceptados | `spec.md` fila `N2-R4` (residuales, acotados por: solicitante ya conoce el chip, sin identidad ajena, mitigado por `REQ-CHP12-005`; `N-1` consistente con igualdad estructural y candado `chip_hmac`) y `REQ-CHP12-005`; `admin-disputes-annex.md` §10.5-6; `chip-claim.openapi.yaml` y `.schema.json`. Marcadores retirados |
| 7 | Contador bloqueado confirmado | `spec.md` `REQ-CHP12-005` y `SC-012-100`; `data-model.md`; `chip-claim.openapi.yaml`; `chip-claim.schema.json`; `microchip-error-split-annex.md` regla 5 y §4 bis; `admin-disputes-annex.md` §10.7. Marcadores retirados |
| 8 | `SC-012-118` y `SC-012-119` | `spec.md`: numeradas tras `SC-012-117` (118 con las aserciones (a)-(g) de `data-model.md`; 119 = restauración de copia sin purgar); rango `SC-012-091..119`; `tasks.md`: ambas mapeadas en `T1641` (y citadas en la línea de Independent Test del Bloque B); `data-model.md` y annex §5.3 actualizados |
| 9 | `change_type` MINOR | `chip-claim.schema.json` `x-sdd-metadata`: `change_type` `MINOR`, `version` `0.2.0`, `status` `DRAFT` (coherente con OpenAPI y `error-catalog`) |
| 10 | `T1648` autorizada | `tasks.md`: `T1648 [ARCH] [N2] [GH:#23]` añadida (sin `[x]`); `T1636` marcada «depende de T1648»; `T1639` depende de `T1648`; nuevos `contracts/openapi/admin-disputes.openapi.yaml` y `contracts/schemas/admin-disputes.schema.json` en `DRAFT` 0.1.0 (9 rutas bajo `/admin/disputes`: cola, expediente, evidencia, prórroga, `step-up`, `resolve`, `confirm`, `cancel-execution`, `close-moot`; columnas de administrador y de persona; `decisionPhase` derivado); `admin-disputes-annex.md` §2 y §10, `contracts/README.md` |
| 11 | Errata `v04` a `APPROVED` | `errata-MINOR-bloqueB-v04.md`: encabezado con «Firma: APPROVED por Neo — Autoridad Nivel 2, 2026-11-27» |

## Propuestas de T1648 que Neo debe confirmar al aprobar (no decididas por architect)

- `ADMIN_STEPUP_WINDOW_MINUTES = 5` y step-up de **un solo uso** por (administrador, disputa, acción) mediante `POST /admin/disputes/{id}/step-up` (011 no define step-up); `DECISION_REASON_MAX_CHARS = 500`.
- Falta de step-up = rechazo genérico `403` de `/admin` sin código nuevo; opción: `ERR-ADM12-STEPUP-REQUIRED` por MINOR del catálogo.
- Columnas `resolved_by_admin_id`, `resolved_by_person_id`, `second_approver_admin_id`, `second_approver_person_id` (la migración es de `T1633`/`T1636`, no de este turno).

## Validación

`verify-traceability.sh --feature 012` rc=0 (297/297 IDs 1:1 con `SC-012-118/119`); `verify-oracles.sh` rc=0; JSON (schemas, catálogo, máquinas) y YAML (`chip-claim`, `admin-disputes`) parsean; sin marcadores `PENDIENTE NEO`, `[CONTENIDO...]` ni `PENDIENTE T1646` en `specs/012-*`.
