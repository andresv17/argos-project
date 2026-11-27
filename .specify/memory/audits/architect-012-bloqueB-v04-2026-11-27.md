# Acta /architect — Iteración DRAFT 0.4 del Bloque B (feature 012, #23, T1630..T1632) — 2026-11-27

Autor: `/architect` (subagente de `/morpheus`). Rama `012-multiduenio-microchip-cuidador`, HEAD `8dee07e` + cambios sin commit (v0.3 y v0.4). Entradas: `rama-012-bloqueB-v03-2026-11-27.md`, `trinity-012-bloqueB-v03-2026-11-27.md`. **Todo sigue en `DRAFT`; no se marcó `[x]`, no se puso `APPROVED` en nada nuevo, no se hicieron commits, no se ejecutó `compile-contracts`; no se tocó `src/`, `tests/`, `scripts/`, 001, 004, 005 ni archivos de H-01.**

## Tabla hallazgo → cambio aplicado / pendiente Neo

| Hallazgo | Estado | Cambio (archivo) |
| --- | --- | --- |
| rama N-01 (ALTO) reserva en EXPIRED | **Aplicado** | `data-model.md` matriz de borrado de cuenta: «reservado hasta `RESOLVED` o `EXPIRED` (`closed_at`)», se libera al cerrarse; coherente con la fila de retención y `admin-disputes-annex.md` §6 |
| rama N-02 (ALTO) ancla `closed_at` | **Aplicado** | `spec.md` REQ-CHP12-008 (3 frases), Neo-J, SC-012-082 (incluye caso «vencida por EXPIRED»); `tasks.md` T1641 (solo las dos frases de retención) |
| rama N-03 (MEDIO) SC-012-118 | **Aplicado en `data-model.md`** (no en `spec.md`) | Aserciones (a)–(g): fronteras ±1 ms, orden observable, inyección de fallo, EXPIRED, solicitud con dos expedientes, `trigger_request_ids` mal formado, borrado de cuenta. Motivo: numerarla en `spec.md` hace fallar `verify-traceability` (huérfana en `tasks.md`, que no se puede tocar); su incorporación a `spec.md` y a una tarea queda para Neo o `/architect` |
| rama N-04 (MEDIO) borrado físico | **Aplicado** | `data-model.md` `dispute_evidence`: purga es `DELETE` físico (FK RESTRICT); `deleted_at` reservado y `NULL`; anexo §5.3 |
| rama N-05 (MEDIO) restauración sin purgar | **Aplicado** (SC propuesto, sin numerar en spec) | `data-model.md` fila Copias de seguridad: prueba «copia sin purgar» asignada a `/link`; anexo §5.3 |
| rama N-06 (MEDIO) encabezado APPROVED | **Aplicado** | `data-model.md:3`: `APPROVED` solo Fase 0/Bloque A; Bloque B `DRAFT 0.4` sin aprobar |
| trinity N-2 (MEDIO) subida bajo candado global | **Aplicado** | `chip-claim.openapi.yaml` pasos 5-10 de `openChipDispute`: saneo, antimalware y subida a área de espera tras contar el intento y ANTES de los candados; bajo candados solo se registran claves y se crea la fila; huérfanos del área de espera a `media_deletion_queue`; `503` de subida no retiene candados. Reflejado en schema (`OpenChipDisputeForm`), anexo §5.1 y respuesta 503 |
| trinity B-N1 (BAJO) 411 y contador multipart | **Aplicado** | Respuesta `411` añadida a `openChipDispute`; ámbito `CHIP_MULTIPART` (usuario en `rate_limit_events`, IP en `ip_rate_events`) en `data-model.md`, OpenAPI y schema; valor sigue `null` (T1646) |
| trinity B-N2 (BAJO) PDF y antimalware | **Aplicado** | PDF «se rechaza (422), nunca se rasteriza»; antimalware con producto por determinar en T1646; fallo = `503 ERR-OWN12-RETRYABLE` (OpenAPI, schema, anexo §5.1) |
| trinity B-N3 (BAJO) «inserción condicionada» vs «registrado» | **Aplicado** | Unificado: el intento bloqueado no se registra (OpenAPI cabecera, pasos 6, change_note; schema; `microchip-error-split-annex.md` regla 5 y §4 bis; `errata-MINOR-bloqueB-v03.md` E-B2 anotada) |
| trinity B-N4 (BAJO) nota de `ERR-OWN12-RETRYABLE` | **Aplicado** (cambio de texto sobre código de 0.1.0 aprobado; requiere visto bueno de Neo) | `error-catalog.json`: menciona candado global, candado por `chip_hmac`, candado por mascota y antimalware/subida; no se tocaron status, título ni `requirementRef` |
| trinity B-N5 (BAJO) texto doble en notas | **Aplicado** | `error-catalog.json`: notas de `CLAIM-COOLDOWN`, `DISPUTE-LIMIT`, `DISPUTE-COOLDOWN` solo con el criterio vigente (marca `[SUSTITUIDO]` retirada; permanece solo aquí) |
| Contador bloqueado (trinity discrepancia 1) | **Alineado al código, pendiente de confirmación de Neo** | `spec.md` REQ-CHP12-005 y SC-012-100, `data-model.md` `ip_rate_events`, OpenAPI, schema, split annex: un intento bloqueado NO se registra y la ventana no se prolonga (`co-ownership-support.ts` ~95). Marcador `PENDIENTE NEO` |
| H-A2 (listado revela existencia) | **PENDIENTE NEO** (sin cambio) | Marcador en `chip-claim.openapi.yaml` `listMyChipRequests`; anexo §10.5 |
| trinity N-1 (canal de tiempo del 202) | **PENDIENTE NEO** | Marcador en OpenAPI y anexo §10.6; el orden de 0.4 lo reduce, no lo elimina. Opciones: igualar (cola o latencia mínima fija) o aceptar como residual `N2-R4` |
| trinity N-3 (step-up, id de administrador) | **Dependencia, no cerrada** | Propuesta `T1648 [ARCH]` en anexo §10.4 (columnas de administrador/persona, step-up, estado «a la espera de confirmación», OpenAPI de cola); `T1636` marcada con dependencia dura de `T1648` en el anexo; NO añadida a `tasks.md` |
| Errata 001 y firmas E-B1/E-B3/E-B4 | **No tocado** | — |

## Decisiones pendientes de Neo (Nivel 2)
1. Confirmar criterio del contador bloqueado (no registra; alineado al código).
2. H-A2: aceptar el oráculo del listado en `N2-R4` o rediseñar.
3. N-1: igualar tiempos del 202 o aceptarlo como residual.
4. Autorizar abrir `T1648 [ARCH]` y su dependencia con `T1636`; decidir si `SC-012-118` pasa a `spec.md` con tarea que la mapee (editar `tasks.md`).
5. Visto bueno al texto nuevo de la nota de `ERR-OWN12-RETRYABLE` (código de 0.1.0).
6. Siguen abiertos de v0.3: F-03, F-05, F-08, F-09, `BACKUP_MAX_RETENTION_DAYS`, errata 001, firmas E-B1/E-B3/E-B4, aprobación de los tres contratos y del anexo.

## Validación
JSON (`chip-claim.schema.json`, `error-catalog.json`) y YAML (`chip-claim.openapi.yaml`, js-yaml) parsean. `bash scripts/verify-traceability.sh --feature 012` rc=0 (295/295 mapeados). Pendientes de Bloque B no tratados: `trinity B-N6/B-N7`, M-3, M-5, M-6, M-8, B-3, B-4.
