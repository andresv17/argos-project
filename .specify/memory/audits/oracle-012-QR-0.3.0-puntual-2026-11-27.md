# Acta /oracle — Verificación puntual Bloque D (#32 Ficha QR, feature 012) sobre DRAFT 0.3.0

- Fecha: 2026-11-27. Rama `012-multiduenio-microchip-cuidador`, HEAD `f9b46d0` (cambios del Bloque D SIN commitear; verificado con `git diff HEAD` y lectura directa; los 3 contratos emergency y el annex son archivos nuevos sin rastrear).
- Alcance: solo lectura. No se modificó código, contratos, tasks.md ni src/generated; sin commits, push, stash ni `[x]`.
- Archivos inspeccionados: `contracts/openapi/emergency.openapi.yaml`, `contracts/schemas/emergency-card.schema.json`, `contracts/emergency-additive-annex.md`, `contracts/errors/error-catalog.json` (0.4.1), `contracts/README.md`, `data-model.md`, `spec.md` (REQ-QR12-002/005..010, SC-012-086, SC-012-121..129), `tasks.md` (T1673, T1675, T1676, T1684, T1685; T1680), `src/generated/v38/**`, actas rama/trinity r2.

## Veredicto global: CUMPLE CON RESERVAS (0 bloqueantes, 0 ALTA, 2 MEDIA, 4 BAJA)

## Por punto
| # | Punto | Veredicto | Evidencia |
|---|---|---|---|
| 1 | Espera 90 d, borrado al vencer, reconciliación | CUMPLE | schema `EMERGENCY_NOTICE_WAIT_DAYS`, `NOTICE_COMPATIBILITY`; annex §7 (l.81); data-model l.125; spec REQ-QR12-006 (l.116), SC-012-123 |
| 2 | Rotación `PHONE_HMAC_KEY` | CUMPLE CON RESERVAS | recalcular, borrar si falla/sin teléfono, actor sistema, sin columna de versión, runbook annex §9 (l.86-97) y schema `PHONE_HMAC_KEY` (H-A, H-B) |
| 3 | Retención auditoría 90 d y NULLs | CUMPLE | schema `AUDIT_EVENTS.rule`, `EMERGENCY_HISTORY_RETENTION_DAYS`; annex l.77, l.80; data-model l.129 y matriz; SC-012-127. `PET_CRITICAL_ALLERGIES_UPDATED` estándar |
| 4 | Redacción de tokens | CUMPLE CON RESERVAS | `LOG_REDACTION` (forma, sin anclar, cualquier longitud, `req.url`, Route not found), annex §6.1, REQ-QR12-008 (l.118). Reservas H-C |
| 5 | Reconciliación perezosa ordenada | CUMPLE | `LAZY_RECONCILIATION`, annex l.82, SC-012-123, openapi `getEmergencyCardStatus`; ruta pública nunca escribe |
| 6 | `criticalAllergiesChange` y `lastChange` | CUMPLE | `EmergencyCriticalAllergiesChange` `{at, byMe}`, `EmergencyCardLastChangeKind` 4 tipos, owner view required, SC-012-128 |
| 7 | `TEXT_POLICY` | CUMPLE CON RESERVAS | Zl/Zp/Co/Cn/Cs, invisibles, tope 3 combinantes, plegado sin locale, `petName` misma función (schema, annex §2, REQ-QR12-002, SC-012-124). Reserva H-D |
| 8 | `QR_SCAN` IPv6 /64 y LRU | CUMPLE | schema `QR_SCAN_MAX_PER_IP_PER_MINUTE.rule`, openapi 429, REQ-QR12-007, SC-012-129 |
| 9 | `PUBLIC_ROUTE_HARDENING` | CUMPLE | `exposeHeadRoutes:false`, HEAD/OPTIONS 404 uniforme sin `Access-Control-*`, cuentan para tope; annex §5, SC-012-126 |
| 10 | Nombres | CUMPLE | `AUTO_NOTICE_CHANGED` (enum schema = CHECK data-model), `PHONE_HMAC_KEY`, `QR_CARD_MUTATION`, `QR_PRIVATE_WRITE` consistentes en los 5 documentos |
| 11 | Versiones y estado | CUMPLE CON RESERVAS | openapi `info.version` (l.5) y `x-sdd-metadata` (l.24-25) 0.3.0 DRAFT; schema metadata 0.3.0 DRAFT; annex 0.3.0 DRAFT; README fila T1670 0.3.0. Reserva H-E |
| 12 | IU / care.* | CUMPLE | `git diff HEAD --stat` sobre openapi/schemas care.* vacío; IU solo aparece como retirada |

## Gates (PG real `TEST_DATABASE_URL=postgres://argos_test:argos_test@127.0.0.1:55432/argos_test`)
- `npx tsc --noEmit`: rc=0
- `bash scripts/compile-contracts.sh --feature 012`: rc=0 (checksum de `src/generated` idéntico antes/después: sin deriva; `git diff src/generated/api` vacío; `validators.mjs` cita emergency-card v0.3.0 DRAFT; `ERR-QR12-ALREADY-ACTIVE` presente)
- `bash scripts/verify-oracles.sh`: rc=0, 667 archivos analizados, 0 oráculos débiles, CUMPLE
- `bash scripts/verify-traceability.sh --feature 012`: rc=0, 309/309 IDs propios mapeados, 350 vigentes, 125/350 con evidencia de código (informativo), pureza 0 violaciones, CUMPLE (confirma el rc=0 tras el mapeo de SC-012-121..129)

## Hallazgos
- Bloqueantes / ALTA: ninguno.
- H-A (MEDIA) Trazabilidad de implementación débil: SC-012-122 (barrido de rotación) solo mapea a T1685 (GOV, criterio de release); SC-012-127 (purga a 90 d de campos y auditoría `EMERGENCY_*`) mapea a T1673 (migraciones), pero es código de mantenimiento; ninguna tarea nombra el "barrido de mantenimiento de la 012" (espera vencida, 90 d, rotación) que `LAZY_RECONCILIATION.triggers` y annex l.82 exigen. Ver `tasks.md` T1673/T1675/T1685. Propuesta: trazar SC-012-122 y SC-012-127 también a T1675 (casos de uso/mantenimiento).
- H-B (BAJA) Runbook de rotación: `PHONE_HMAC_KEY.rule` dice barrido "ANTES de reabrir tráfico o inmediatamente tras el despliegue"; annex §9 l.92 solo "inmediatamente tras". Alinear (con "inmediatamente tras", la ventana es de falla cerrada, ya documentada).
- H-C (MEDIA) `SC-012-086` en `spec.md:301` no fue ampliado (sigue "el token no aparece"); los vectores de 43, 42, 44 y 200 caracteres, con sufijo y barra final viven solo en annex §6.1 y `LOG_REDACTION.proof`. `tasks.md` T1680 (l.134) conserva la redacción vieja (`/e/<token>`). Riesgo: oráculo de prueba ambiguo. Ampliar SC-012-086 y T1680.
- H-D (BAJA) `data-model.md:126` (`pets.critical_allergies`) resume la política como "rechazo de `Cc`/`Cf`/bidi"; omite Zl/Zp/Co/Cn/Cs, invisibles, tope de combinantes y carácter visible. Remitir a `TEXT_POLICY`.
- H-E (BAJA) `error-catalog.json:5` conserva `x-sdd-metadata.status = "APPROVED"` con `version 0.4.1` y `amendment_status 0.4.1/0.4.0 DRAFT` (patrón heredado de 0.3.0 aprobado). Los archivos propios del Bloque D están en DRAFT. Aceptable mientras el amendment_status deje claro el DRAFT; conviene dejarlo señalado a Neo al firmar.
- H-F (BAJA) `emergency-additive-annex.md`: §9 (l.86) aparece antes de §8 (l.99) (orden de secciones).
- Nota INFO: el límite de `QR_SCAN` dice "TODA petición al prefijo público"; el shell `GET /e/{token}` (200 idéntico) no declara si cuenta. Aclarar en T1675.

## Estado
Validation Required. Nada pasa a APPROVED/LOCKED; solo Neo. Tras corregir H-A y H-C (texto, sin cambio de decisiones), el DRAFT 0.3.0 queda listo para la firma de Neo y re-lectura de `/trinity` y `/rama` si Morpheus lo estima.
