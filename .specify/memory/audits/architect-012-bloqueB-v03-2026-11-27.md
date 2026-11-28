# Acta /architect — Iteración DRAFT 0.3 de los contratos del Bloque B (T1630..T1632) — 2026-11-27

Rama `012-multiduenio-microchip-cuidador` (HEAD `8dee07e`). Entradas: `trinity-012-bloqueB-DRAFT-2026-11-27.md` y `rama-012-bloqueB-DRAFT-2026-11-27.md`. Todo queda en `DRAFT`; no hay `APPROVED`, `[x]` ni commit. No se tocó `src/`, `tests/`, `scripts/`, `tasks.md`, 001, 004, 005 ni archivos de H-01. `compile-contracts` NO ejecutado.

## Tabla de cierre

| Hallazgo | Estado | Cambio aplicado / pendiente | Archivo |
| --- | --- | --- | --- |
| trinity H-A1 (503 oráculo) | Aplicado | Candado global del UnitOfWork y candado asesor por `chip_hmac` siempre antes del comprobador; 503 idéntico para todo chip; candado por mascota solo en la rama que crea fila y su agotamiento da 202 sin fila | `chip-claim.openapi.yaml`, `microchip-error-split-annex.md` regla 7 |
| trinity H-A2 (listado revela existencia) | **PENDIENTE NEO** | Retirada la afirmación falsa; marcador con opciones (aceptar en N2-R4 o rediseñar) | `chip-claim.openapi.yaml`, `chip-claim.schema.json` |
| trinity H-A3 (control dual evitable) | Aplicado | Control dual obligatorio y no elegible en `CHIP_APPROPRIATION`; ventana 72 h solo en ausencia, con veto de cualquier administrador no parte; step-up en `resolve` y `confirm`; B-1 (persona distinta, lectura previa, motivo propio) | `admin-disputes-annex.md` §2, §7 |
| trinity H-A4 y rama F-11 (saneo) | Aplicado | Reencodificación, límite de píxeles, PDF sin JS/Launch/OpenAction/XFA/embebidos/metadatos, antimalware antes de guardar; igual para cualquier chip (422 sin oráculo); constante `DISPUTE_EVIDENCE_MAX_PIXELS` sin valor | schema (EvidenceContentType, OpenChipDisputeForm, constantes), OA, anexo §5 |
| trinity M-1 (multipart) | Aplicado | Validación por cabeceras y `Content-Length` antes de leer; 413 por cuerpo; contador multipart consumido antes de parsear; límites de parser; constantes `CHIP_DISPUTE_BODY_MAX_BYTES` y `CHIP_MULTIPART_MAX_PER_USER_PER_DAY` sin valor decidido | OA, schema |
| trinity M-2 (contadores) | Aplicado | Atomicidad; el intento bloqueado cuenta en el contador que lo bloquea y no se propaga; `REQ-CHP12-005` corregido a «alta, edición, claim o disputa» (E-B2) | OA, schema, split annex regla 5, `spec.md:92`, errata |
| trinity M-4 (oráculo por límites) | Aplicado | DISPUTE-LIMIT, DISPUTE-COOLDOWN y CLAIM-COOLDOWN se evalúan antes de las precondiciones, solo sobre filas propias sin unir a mascotas/reservas, mismo 409 para cualquier chip; 202 uniforme solo para precondiciones fallidas. Notas del catálogo sustituidas con marca visible | OA, catálogo, anexo §6 |
| trinity B-5 (huérfanos) | Aplicado (extra) | Guardado y fila como una unidad; huérfanos a `media_deletion_queue` | OA |
| trinity M-3, M-5, M-6, M-8, B-2..B-4, B-6, I-1..I-5 | No tocado | No pedidos. B-2 anotado en split annex §4 bis para T1646. M-7 → propuesta T1648 (abajo) | — |
| rama F-01 (EXPIRED sin ancla) | Aplicado | `closed_at` común a RESOLVED y EXPIRED en el mismo UPDATE; `delete_after = closed_at + 365/+90`; caso SC-012-082 | `data-model.md`, anexo §5.3 |
| rama F-02 (fila 136) | Aplicado | El borrado de cuenta o mascota no encola ni adelanta la evidencia | `data-model.md`, anexo §5.3 |
| rama F-03 (excepción de conservación) | **PENDIENTE NEO** | Marcador en datos y anexo; legal en `DEUDA-012-LEGAL-DISPUTAS-QR` | `data-model.md`, anexo §5.3 |
| rama F-04 (catálogo APPROVED) | Aplicado | `status` = `DRAFT`, versión 0.2.0; contenido de 0.1.0 intacto; `change_note` documenta el cambio | `error-catalog.json` |
| rama F-05 (retención auditoría árbitro) | **PENDIENTE NEO** | Constante propia `ARBITER_AUDIT_RETENTION_DAYS` propuesta, sin valor | anexo §8, `data-model.md` |
| rama F-06 (copias de seguridad) | Aplicado como regla nueva en DRAFT | Fila de retención de copias y no restauración de filas purgadas; `BACKUP_MAX_RETENTION_DAYS` sin valor (pendiente Neo/link) | `data-model.md` |
| rama F-07 (`trigger_request_ids`) | Aplicado como regla nueva en DRAFT | Sin FK: orden de purga fijado y unidad de trabajo; prueba exigida `SC-012-118` (id propuesto, sin añadir a spec) | `data-model.md`, anexo §5.3 |
| rama F-08 (seudonimización en /admin) | **PENDIENTE NEO** | Marcador; aclarado que el seudónimo HMAC es reidentificable | anexo §4 |
| rama F-09 (aviso de resolución) | **PENDIENTE NEO** | Marcador `[CONTENIDO DEL AVISO DE RESOLUCIÓN: por decidir]` | anexo §9 |
| rama F-10 (503 vs spec/implementación) | Aplicado | Alineado con el candado global de `1dcc063`; spec.md:85 no lista las rutas de chip: errata E-B1 (no aplicada, la firma Neo) | errata-MINOR-bloqueB-v03.md |
| rama F-12 (regex) | Aplicado | `^[0-9]{4}$` en data-model (el schema ya lo tenía) | `data-model.md` |
| rama F-13 (últimos 4) | Aplicado | «solo los últimos 4 dígitos, si se registran» | anexo §8 |
| Errata 001 (orden chip vs IDs ajenos) | **PENDIENTE NEO** | Sin cambios; sigue como propuesta del §5 | split annex §5 |

## Notas de criterio

- «Los intentos bloqueados cuentan» se interpretó como: cuentan en el contador que los bloquea, sin propagarse al global (coherente con `trinity L-1` en `REQ-CHP12-005`). Si se quería que también incrementen IP y global, hay que revertirlo.
- Para M-4 se eligió «mismo 409 para cualquier chip, sobre filas propias» frente a la alternativa «202 uniforme con aviso por el listado»; ambas las ofrecía `trinity`.
- Se eligió que el agotamiento del candado por mascota en la rama de fila dé 202 sin fila (nunca 503); la alternativa «encolar» queda abierta para `/trinity`.
- Las constantes nuevas del schema llevan `value: null`: no se inventaron cifras.
- Propuesta (no añadida a `tasks.md`): **`T1648` `[ARCH]` OpenAPI y schema de `/admin/disputes`** (incluye step-up, IDOR de `evidenceId`, URL firmada de 60 s con auditoría previa, límites de lectura), dependencia dura de `T1636`.

## Validación

JSON del schema y del catálogo parsean; YAML del OpenAPI parsea (`yaml` de node); `bash scripts/verify-traceability.sh --feature 012` rc=0.

## Decisiones de Neo pendientes

H-A2, F-03, F-05, F-08, F-09, errata 001, más `DRAFT → APPROVED` de los tres contratos/anexos y del bloque 0.2.0 del catálogo, firma de las erratas E-B1, E-B3, E-B4, y T1648. Segunda revisión de `/trinity` y `/rama` sobre esta versión antes de aprobar.
