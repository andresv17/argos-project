# Acta /rama — Revisión dirigida del DRAFT del Bloque B (feature 012, #23, T1630..T1632)

- Fecha: 2026-11-27. Autor: `/rama` (ejecución haiku, subagente de `/morpheus`). Solo lectura: no se editaron contratos, specs, `src/`, `tests/`, `scripts/`, `tasks.md`, `logos.json` ni `scripts/logos.py`. Sin commits, sin `[x]`, sin `APPROVED`.
- HEAD de referencia: `8dee07e`.
- Alcance pedido: ciclo de vida de datos y privacidad (RGPD / Ley 1581/2012). Retención de evidencias (T1644), enumeración y datos en «mis solicitudes», borrado de cuenta con disputas abiertas, seudonimización en resoluciones y avisos, purga a 90 días y `trigger_request_ids`, retención de auditoría del árbitro.
- Artefactos revisados:
  - `specs/012-multiduenio-microchip-cuidador/contracts/openapi/chip-claim.openapi.yaml` (0.1.0 DRAFT)
  - `specs/012-multiduenio-microchip-cuidador/contracts/schemas/chip-claim.schema.json` (0.1.0 DRAFT)
  - `specs/012-multiduenio-microchip-cuidador/contracts/errors/error-catalog.json` (bloque 0.2.0)
  - `specs/012-multiduenio-microchip-cuidador/contracts/microchip-error-split-annex.md` (T1631)
  - `specs/012-multiduenio-microchip-cuidador/contracts/admin-disputes-annex.md` (T1632)
  - Contexto de verificación: `spec.md` (REQ-CHP12-004/007/008/010, REQ-OWN12-008, NFR-012-002/009, P-1..P-7, SC-012-082/096), `data-model.md` (§ owner_requests, dispute_evidence, retención por dato), `tasks.md` (T1641, T1644, T1647), acta previa `rama-012-dirigida-2026-11-26.md` (R-A1..R-A6).

## Veredicto

**NO CUMPLE (sellable tras correcciones textuales).** Hay un hueco de retención que deja datos sin plazo (F-01), una contradicción sobre el borrado de evidencias (F-02) y una evidencia que sigue identificando al reclamante tras el borrado de su cuenta (F-03). Son correcciones de texto y de contrato; ninguna exige rediseñar la arquitectura. Además hay un problema de gobernanza (F-04) que no es de privacidad pero debe corregirse antes de cualquier otra cosa: el catálogo declara `APPROVED` sobre un bloque 0.2.0 en DRAFT.

## Premisa a corregir

La petición menciona «365 días para apropiación con evidencia, P-2 de la spec» como retención de auditoría del árbitro. P-2 no regula auditoría: fija la retención de **expedientes** (365 días tras el estado terminal para apropiación con evidencia; 90 días para ausencias), `spec.md:194`. La retención de auditoría del árbitro **no está definida en 012**; hereda «igual que `audit_log`» (`data-model.md:141`), cuyo valor es provisional en 002 (ver F-05).

## Hallazgos

### F-01 · ALTO · Expedientes EXPIRED sin fecha de purga (la evidencia no se purga nunca)
- `data-model.md:71`: `delete_after = resolved_at + DISPUTE_EVIDENCE_RETENTION_DAYS`.
- `data-model.md:63`: `resolved_at` solo para `CHIP_DISPUTE`, sin regla de escritura. En EXPIRED la resolución es `NULL` (`data-model.md:135`, `admin-disputes-annex.md:50`), así que nada escribe `resolved_at` al vencer.
- Lo que sí exigen: la retención cuenta desde **RESOLVED o EXPIRED** (`spec.md:91`, `admin-disputes-annex.md:39`, `data-model.md:135` «la retención cuenta desde EXPIRED (P-1)»).
- Efecto: una disputa de apropiación que vence a los 60 días produce evidencia con `delete_after = NULL`. No entra en `media_deletion_queue` y queda sin plazo. Eso rompe NFR-012-009 (`spec.md:414`: cada dato nuevo tiene retención) y el principio de limitación del plazo de la ley de protección de datos.
- Corrección: definir un ancla única `closed_at` que se fije en RESOLVED **y** en EXPIRED en el mismo `UPDATE` de estado terminal, y calcular `delete_after = closed_at + 365` (apropiación) o `+ 90` (ausencia). Añadir a SC-012-082 el caso «vencida por EXPIRED» y que la purga la encola.

### F-02 · ALTO · Contradicción sobre el encolado de evidencia al borrar mascota o cuenta del reclamante
- `data-model.md:136`, columna «Borrado y cascada»: «`media_deletion_queue` al vencer, **al borrar mascota o cuenta del reclamante**».
- Lo contrario en tres fuentes: `data-model.md:135` («también la del reclamante, que no adelanta el borrado»), `spec.md:95` (REQ-CHP12-008: «borrar la mascota o la cuenta del reclamante no adelanta el borrado»), `tasks.md:84` (T1641, mismo texto).
- Riesgo: un implementador que siga la fila 136 encola la evidencia en el momento del borrado, destruye material que el árbitro necesita y viola INV-CHP12-005. Un implementador que siga la spec no encola nunca antes de vencer. Hay que corregir la fila 136 para que diga: «encolado solo al vencer la retención; el borrado de cuenta o mascota no encola».

### F-03 · ALTO · La evidencia sigue identificando al reclamante (y a terceros) tras el borrado de cuenta
- La seudonimización de `requester_user_id`, `target_user_id` y `rejected_by` (`data-model.md:135`, `:151-152`) no alcanza al **contenido** de los documentos. Una factura veterinaria o un certificado de chip suele llevar nombre, dirección o teléfono del dueño.
- Esto es lo que R-A2 de la acta previa (`rama-012-dirigida-2026-11-26.md`, R-A2) pedía. Está **parcialmente** cerrado: `spec.md:95` y `admin-disputes-annex.md:39` reconocen que la evidencia es dato personal en su contenido, y `legal-texts`/T1643 recogen la deuda. Pero no hay ningún mecanismo exigido: ni minimización en la subida (solo un texto de interfaz), ni redacción, ni plazo distinto para el contenido frente al expediente.
- Efecto: tras el borrado de cuenta del reclamante, sus datos identificativos permanecen hasta 365 días tras el estado terminal (y, con F-01, potencialmente sin límite). La base de la conservación es la defensa de reclamaciones (en el marco RGPD, art. 17.3.e), pero eso debe documentarse y no se documenta. Por la Ley 1581/2012 (supresión, art. 8; autorización y excepciones, arts. 9-10) la asesoría legal debe confirmar la excepción; este acta no emite criterio jurídico.
- Corrección: (a) exigir en REQ-CHP12-008 que la subida pida solo el documento que acredita el chip y que el contenido no se use para nada distinto del arbitraje; (b) documentar la excepción de conservación tras el borrado de cuenta como decisión de Neo con su base; (c) dejar `DEUDA-012-LEGAL-DISPUTAS-QR` como bloqueante de producción (ya está en T1643, pero no se vincula a este punto).

### F-04 · ALTO · Gobernanza: `error-catalog.json` declara `APPROVED` sobre el bloque 0.2.0 en DRAFT
- `contracts/errors/error-catalog.json:5-6`: `"version": "0.2.0"`, `"status": "APPROVED"`. Su `change_note` describe el bloque 0.2.0 como «DRAFT; el estado lo fija solo Neo».
- CLAUDE.md §1.1: ningún agente puede cambiar un documento normativo a `APPROVED`. Aquí el dato lo puso `/architect`. Debe revertirse a `DRAFT` y dejar la aprobación a Neo.
- No es un hallazgo de privacidad, pero afecta a la cadena de aprobación de todo el bloque y debe corregirse antes de otros cambios.

### F-05 · MEDIO · Retención de auditoría del árbitro sin valor propio
- `admin-disputes-annex.md:68` (§8) define la auditoría de apertura, lectura de evidencia, prórroga, decisión, confirmación, ejecución, cierre y recusación. `data-model.md:141` la remite a «igual que `audit_log`».
- `audit_log` hereda `ARGOS_AUDIT_RETENTION_DAYS` de 002: valor **provisional** de 730 días, con unidad pendiente de F4-B1 (`specs/002-plataforma-v21/plan.md:126`; `contracts/schemas/audit-entry.schema.json:314`). No es un valor aprobado para 012.
- Falta decidir: si la auditoría del árbitro sobrevive a la evidencia (es la prueba de quién leyó qué, y suele justificar más tiempo), cuánto, y que no contenga ni nombre del reclamante ni contenido. Propuesta: constante propia `ARBITER_AUDIT_RETENTION_DAYS` en `feature-012-limits.ts`, decidida por Neo, y verificar que las filas tras la purga de la evidencia conservan solo `disputeId`, `adminId` interno, acción e instante.

### F-06 · MEDIO · Copias de seguridad fuera del ciclo de purga
- La purga de evidencia y de expedientes usa `media_deletion_queue` y el mantenimiento (`data-model.md:136`, `:135`). No hay ninguna mención en 012 a copias de la base de datos, instantáneas, versionado del almacén de medios ni ventanas de restauración (búsqueda en `spec.md`, `data-model.md`, `deploy-rolling-bloque-A.md`: sin resultados).
- Efecto: la evidencia purgada y los expedientes pueden seguir en copias durante un periodo no documentado.
- Corrección: añadir a la matriz de retención (`data-model.md`, sección «Retención y borrado por dato») una línea de copias con su ventana máxima y la regla de no restauración de filas purgadas.

### F-07 · MEDIO · Purga a 90 días y `trigger_request_ids` (interacción no verificable)
- `data-model.md:52`: `trigger_request_ids` es TEXT (lista JSON) **sin FK**. La protección de las solicitudes referenciadas (`data-model.md:134`: «la purga consulta la tabla/chequeo de referencias») depende de parsear JSON en la purga, no de la base de datos.
- `dispute_evidence.request_id` tiene FK `RESTRICT` (`data-model.md:71`): la purga debe borrar primero los objetos de evidencia y después la fila del expediente, en el orden correcto y en la misma unidad de trabajo.
- Hay que fijar tres cosas: (a) la purga de solicitudes **no** puede tocar una fila referenciada por un expediente no terminal ni por uno terminal dentro de su plazo; (b) el ancla de esos 90 días es el `closed_at` de F-01; (c) una prueba de purga con `trigger_request_ids` (no existe en SC-012-*).
- Riesgo de F-01 en cascada: si el expediente EXPIRED no tiene ancla, sus solicitudes disparadoras no tienen plazo tampoco.

### F-08 · MEDIO · Seudonimización de solicitantes en la cola de `/admin`: criterio indefinido
- `admin-disputes-annex.md:33`: «Cuentas de los intervinientes: seudonimizadas **cuando proceda** (`rama`)». No hay criterio. El árbitro necesita identificar al reclamante para decidir la recusación (§3) pero no debe ver su correo ni su teléfono (`NFR-012-002`).
- Corrección: regla cerrada. Por defecto, seudónimo (HMAC de `pseudonymizeUser`, ya usado en `data-model.md`); la identidad visible solo mediante una acción auditada con motivo, o nunca, decidido por Neo. Si se mantiene «cuando proceda», el implementador decide, y eso no es aceptable para datos personales.
- Nota: el seudónimo HMAC es reidentificable con la clave (R-A4 ya reconocido en `data-model.md:14`), así que no es anonimización; el texto debe decirlo en el anexo.

### F-09 · MEDIO · Avisos de resolución a propietarios y reclamante no especificados
- `admin-disputes-annex.md:72` (§9) y `REQ-CHP12-010` cubren el aviso de **apertura** a propietarios, el estado del reclamante por `listMyChipRequests`, y el aviso de vencimiento (`spec.md:91`). **No** especifican qué ven los propietarios cuando la disputa se resuelve con `REJECT`, `ADD_CO_OWNER` o `REQUEST_CHANGE_PRINCIPAL`.
- Riesgo: un aviso de resolución añadido sin contrato puede nombrar al reclamante. Corrección: especificar que el aviso de resultado a propietarios es sin identidad del reclamante, salvo que el propio desenlace lo haga visible (un co-propietario nuevo aparece en la lista de co-propietarios por diseño). Añadir a T1645 la prueba correspondiente.

### F-10 · MEDIO · 503 con posible oráculo de existencia del chip (remitir a `/trinity`)
- `chip-claim.openapi.yaml:87-88` (`createChipClaim`) y `:147-148` (`openChipDispute`): 503 `ERR-OWN12-RETRYABLE` «espera acotada del candado por mascota agotada». La especificación dice que el candado es **por fila de mascota** (`spec.md:85`, REQ-OWN12-011), y la implementación del commit `1dcc063` usa un **candado asesor global** con espera de 3 s. La descripción del 503 dice «independiente del chip», pero un candado por mascota solo se toma si el chip tiene mascota.
- Efecto: en carrera, un 503 solo aparece para chips asociados a una mascota, lo que revela existencia. La probabilidad de explotación es baja, pero viola la uniformidad de INV-CHP12-003 si se confirma.
- Corrección: el candado de estas dos rutas debe tomarse en **todos** los casos (o no tomarse en ninguno) antes del comprobador, y la especificación y la implementación deben decir lo mismo. Derivado a `/trinity` para confirmar; este acta no evalúa la parte de seguridad.

### F-11 · MEDIO · Saneo de metadatos de PDF no especificado
- `chip-claim.schema.json:111` y `admin-disputes-annex.md:37`: «EXIF y metadatos se sanean al subir». EXIF es de imagen. Un PDF puede llevar metadatos del documento (autor, XMP), archivos incrustados o acciones; ninguno está cubierto por la especificación.
- Corrección: definir el método de saneo por tipo (PDF: eliminar metadatos del documento, XMP y archivos incrustados; imágenes: EXIF y XMP), o rechazar PDF con contenido activo. Coordinar con `/trinity` (SAST del cargador).

### F-12 · BAJO · Regex de `chip_last4` inconsistente
- `data-model.md:61`: `chip_last4 ^\d{4}$`. `chip-claim.schema.json:207` (`ChipRequestView.chipLast4`): `^[0-9]{4}$`. El schema evita `\d` a propósito (lock H-21); el data-model no.
- Corrección: alinear el data-model a `^[0-9]{4}$`.

### F-13 · BAJO · Ambigüedad sobre últimos 4 dígitos en auditoría
- `admin-disputes-annex.md:68`: «nunca correo, chip completo (últimos 4), contenido de evidencia». Se lee como si los últimos 4 estuvieran prohibidos, mientras `REQ-CHP12-007` y `chip-claim.schema.json:78` los permiten.
- Corrección: redactar «chip completo; solo los últimos 4 dígitos, si se registran».

### F-14 · INFO · Lo que se verificó y cumple
- **Enumeración** (`listMyChipRequests`, `chip-claim.openapi.yaml`, descripción y `ChipRequestList`): solo filas reales cuyo solicitante es el usuario autenticado; `chipLast4` es el del propio envío; los 202 sin fila no aparecen. Tras borrar la cuenta, `requester_user_id` pasa a `NULL` (`data-model.md:48`), así que no hay filas propias que mostrar. Sin fuga de terceros.
- **Vista del solicitante** (`ChipRequestView`, `chip-claim.schema.json:178-267`): omite mascota, propietarios, hogar, fechas ajenas, evidencia y árbitro. Cumple INV-CHP12-007.
- **Respuestas uniformes** (`ChipRequestAccepted`, 202 sin `claimId`/`disputeId`): cumple INV-CHP12-003 en el contrato. El 409 de cooldown solo se evalúa sobre filas propias (`createChipClaim`, descripción), lo que no revela nada a un tercero.
- **Avisos a propietarios** (`admin-disputes-annex.md:72`): sin cuenta, hogar, nombre de mascota ajena, fecha ni evidencia. Cumple INV-CHP12-007.
- **Mensaje de conflicto del arbitraje** (`ERR-CHP12-DISPUTE-ARBITRATION-CONFLICT`, `error-catalog.json:222-228`): no indica el vínculo.
- **Campos efímeros** (`data-model.md:9`, `:134`): `message`, `target_username_sealed` y `target_response` se borran en cada estado terminal, en el mismo `UPDATE`.
- **Contadores de IP** (`data-model.md:80`): sin FK a usuarios, purga a las 25 h.
- **Sin cascada** en `owner_requests` ni en `dispute_evidence` (`data-model.md:6`, `:71`): cumple INV-CHP12-005.
- **Retenciones de P-1 y P-2 incorporadas**: `UNDER_REVIEW` máximo 60 días (cierra R-A1 de la acta previa), ausencias 90 días y apropiación 365 (cierra R-A6). La reserva del chip se mantiene mientras dura `UNDER_REVIEW` (`spec.md:91`).
- **Solicitudes `CLAIM` PENDING**: el mensaje del reclamante (≤280) lo ven los propietarios hasta la decisión y se borra al terminar (`data-model.md:134`). Aceptable; el `requesterUsername` lo ven por diseño (aprobación de co-propiedad).
- **Pseudonimización declarada como tal** (`data-model.md:14`, R-A4): correcto.

## Estado de R-A1..R-A6 (acta 2026-11-26)

| Residual | Estado |
| --- | --- |
| R-A1 (plazo de `UNDER_REVIEW`) | Cerrado por P-1 (60 días, `EXPIRED`). |
| R-A2 (evidencia con datos del propietario) | **Parcial**: texto reconocido; falta mecanismo y excepción documentada (F-03). |
| R-A3 (`share_links` vs 005) | Cerrado por P-7 (cascada de 005 conservada). |
| R-A6 (retención de ausencias y minimización) | Cerrado por P-2 (90 días). El cierre de la retención debe corregirse por F-01 (ancla). |

## Decisiones que se piden a Neo (Nivel 2)

1. Ancla de retención `closed_at` para RESOLVED y EXPIRED (F-01): confirmar.
2. Corregir la fila 136 de `data-model.md` (F-02): confirmar que el borrado de cuenta no encola evidencia.
3. Excepción de conservación de evidencia tras el borrado de cuenta del reclamante, con base documentada y revisión legal (F-03, `DEUDA-012-LEGAL-DISPUTAS-QR`).
4. Valor de `ARBITER_AUDIT_RETENTION_DAYS` (F-05).
5. Criterio de seudonimización en la cola de `/admin` (F-08).
6. Contenido del aviso de resultado a propietarios (F-09).
7. Revertir `error-catalog.json` a `DRAFT` (F-04) y aprobar lo que corresponda solo tras las correcciones.

## Recomendación de secuencia

1. `/architect` corrige F-01, F-02, F-04, F-12 y F-13 (texto y contrato, sin cambio de decisiones).
2. Neo decide los puntos de la sección anterior.
3. `/architect` incorpora F-03, F-05, F-06, F-08, F-09 y F-11 con las decisiones.
4. `/trinity` valida F-10 y F-11 (oráculo del 503, saneo de PDF).
5. `/rama` re-audita el DRAFT corregido antes de sellar T1644.

## Trazabilidad

- Requisitos y normas: REQ-CHP12-004/007/008/010, REQ-OWN12-008, NFR-012-002/009, INV-CHP12-003/005/007, P-1, P-2, P-7, SC-012-082, SC-012-096, T1641, T1644, T1645, T1647.
- Este acta no cambia estados (`[x]`, `APPROVED`, `LOCKED`) ni toca archivos normativos.
