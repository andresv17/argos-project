# Acta /rama — Revisión dirigida de Fase 0, Feature 012 (privacidad, supresión y ciclo de vida)

**Fecha:** 2026-11-26 · **Rama:** `012-multiduenio-microchip-cuidador` · **Agente:** `/rama` (subagente, dispatch de Morpheus)
**Modo:** solo lectura sobre `specs/012/**`, `claude/`, `.specify/`. No se editó spec, data-model, contrato, código, `tasks.md` ni `logos.json`. Sin `git add`, sin commit, sin push, sin `[x]`, sin `APPROVED`/`LOCKED`.
**Insumos:** `~/.claude/skills/rama/SKILL.md`; `claude/decisiones-neo-012-2026-11-26.md` (adendas N2-R §F, §G, §H, §I); `.specify/memory/audits/rama-012-reauditoria-2026-11-26.md` (R-01..R-10); `specs/012/data-model.md` (Bloques `#23`, `#26`, `#32`, reglas transversales, matrices de retención y de borrado de cuenta); `specs/012/spec.md` (REQ-OWN12-006/008/009/011, REQ-CHP12-004/005/008, REQ-QR12-002/006/007/010, EDGE-012-017/053/054, SC-012-096/106/108/110, NFR-012-008); `specs/005/data-model.md` §3 (`share_links`); `tasks.md` (T1622, T1646, T1681, T1685).

## 1. Veredicto global

**CUMPLE CON RESERVAS: 5 puntos cerrados (con reserva o sin ella), 2 puntos abiertos con cambio de texto, 3 decisiones que son de Neo.**

No se encuentra ningún estado de privacidad inseguro nuevo. Los dos puntos abiertos son de consistencia entre 012 y 005 (`share_links`) y de retención (disputas por ausencia). El resto son reservas de texto o decisiones de producto que el arquitecto no puede cerrar solo.

## 2. Veredicto por punto

| # | Punto | Veredicto | Motivo breve |
| --- | --- | --- | --- |
| 1a | Supresión del único propietario con disputa `UNDER_REVIEW` (N2-R2): procede | **CERRADO CON RESERVA** | Texto en REQ-OWN12-008(c), EDGE-012-053, SC-012-096, matriz de borrado. Reserva R-A1 (retención sin límite mientras `UNDER_REVIEW`) y R-A2 (contenido de la evidencia). |
| 1b | Chip reservado hasta `RESOLVED` | **CERRADO** | `INV-CHP12-009`, derivado de `owner_requests` (`chip_hmac`), sin tabla nueva; sobrevive a caducidad de congelación y a borrado de mascota (EDGE-012-054). |
| 1c | Expediente seudonimizado hasta `RESOLVED` + 365 días | **CERRADO CON RESERVA** | REQ-CHP12-008 y matriz de retención. Reserva: el plazo de 365 días empieza solo al resolver (ver R-A1). |
| 1d | La supresión del reclamante no adelanta el borrado | **CERRADO** | REQ-CHP12-008 (texto explícito) y fila «Disputa UNDER_REVIEW como reclamante o propietario» de la matriz. |
| 2a | `owner_requests.rejected_by`: FK `SET NULL` y seudónimo (R-04) | **CERRADO** | `data-model` Bloque `#23`/tabla de `owner_requests`: FK `ON DELETE SET NULL`, `rejected_by_pseudonym`; fila de la matriz; SC-012-108. |
| 2b | `approver_set` y `approvals` seudonimizados | **CERRADO CON RESERVA** | Texto en data-model. Reserva menor R-A4: el seudónimo es HMAC con la misma clave de `pseudonymizeUser`; es seudonimización (sigue siendo dato personal para quien tenga la clave), no anonimización. Aceptable en retención de 90 días. |
| 2c | `share_links.pet_owner_user_id_at_creation` anulado (R-04) | **ABIERTO** | Contradicción con 005 (ver R-A3): en 005 la columna es `NOT NULL` para `scope = PET` y `share_links.created_by_user_id` tiene `ON DELETE CASCADE`. 012 presupone que la fila sobrevive y la anula. |
| 3 | Cascadas sin cascada en ningún estado (R-05) | **CERRADO** | REQ-CHP12-008 (última frase: «en ningún estado»), reglas transversales del data-model, `dispute_evidence.request_id` con `RESTRICT`. Nota de orden de purga (ver §4, N-1). |
| 4a | Fallecimiento: ficha `OFF` (`AUTO_PET_DECEASED`) (R-08a) | **CERRADO** | REQ-QR12-010 incluye fallecimiento, `status_reason` con `AUTO_PET_DECEASED` en el CHECK, hash `NULL`, `404`, SC-012-106. |
| 4b | Alergias de terceros (R-08b) | **CERRADO CON RESERVA** | Aviso en el editor (REQ-QR12-002: «No escribas nombres ni datos de otras personas»). Falta el mismo aviso en el texto de activación (REQ-QR12-006). Riesgo del texto libre pendiente de confirmación de `/maggie` (ver R-A5). |
| 5 | Retención de `ip_rate_events` (R-06) | **CERRADO** | Matriz: 24 h, purga a las 25 h, solo `CHIP_LOOKUP`; el QR usa memoria acotada (REQ-QR12-007), sin fila. Bloque `#23` coincide. |
| I.1 | Variante `PRINCIPAL_ABSENT`: minimización y base legal | **CERRADO CON RESERVA** | No hay dato nuevo: el disparador sale de solicitudes ya existentes (`approver_set`, `expires_at`, voto/rechazo). Reserva R-A6: retención de 365 días tras `RESOLVED` para `CHIP_DISPUTE` incluidas las de ausencia (ver R-A6). Decisión de producto de Neo (ratificar o retirar). |
| I.3 | Preferencia del reclamante al liberar el chip | **ABIERTO (decisión de Neo)** | No hay texto en spec. Recomendación de privacidad en §3, punto N-2. |

Nota sobre las cifras que el encargo pedía: no se contradice ninguna cifra del pase N2-R. Los plazos verificados son: `DISPUTE_EVIDENCE_RETENTION_DAYS = 365` tras `RESOLVED`; `DISPUTE_FREEZE_MAX_DAYS = 30` con una prórroga y techo de 60; `DISPUTE_SLA_BUSINESS_DAYS = 15`; `ip_rate_events` 24 h con purga a las 25 h.

## 3. Hallazgos residuales nuevos de esta revisión

**R-A1 · MEDIA · Retención sin límite mientras la disputa está `UNDER_REVIEW` (limitación de almacenamiento).**
La congelación caduca (60 días como máximo), el SLA de 15 días hábiles solo escala a `SUPER_ADMIN` y marca «vencido», y el plazo de retención (365 días) empieza solo al `RESOLVED`. Mientras la disputa siga abierta, la evidencia (PDF, JPEG, PNG, WebP) y la identidad seudonimizada se conservan sin plazo. Propuesta: un plazo máximo de resolución con cierre por defecto, por ejemplo `REJECT` con `moot_reason = TIMEOUT` (sin cooldown), y la retención contada desde ese cierre. El valor del plazo lo fija Neo (ver N-3). Mientras tanto, el texto debe decir explícitamente que la retención sin resolver no tiene límite.

**R-A2 · MEDIA · La seudonimización no alcanza al contenido de la evidencia.**
Los documentos (factura veterinaria, certificado de chip) pueden contener el nombre, la dirección o el teléfono del dueño borrado. La seudonimización de `requester_user_id` no los toca. Se reduce el riesgo con EXIF eliminado, acceso solo para administradores no parte, URL firmada de 5 minutos y lectura auditada, pero no se elimina. Propuesta: en REQ-CHP12-008, añadir que la evidencia se trata como dato personal también en su contenido, que el aviso al subir pide solo documentos que acrediten el chip (no facturas completas con datos de contacto), y que `DEUDA-012-LEGAL-DISPUTAS-QR` incluye esta cuestión.

**R-A3 · MEDIA · Contradicción 012 / 005 en `share_links`.** (Punto 2c.)
- 005 `data-model.md` §3: `pet_owner_user_id_at_creation` es `NOT NULL` si `scope = 'PET'`, sin FK; `created_by_user_id` es FK `users(id)` con `ON DELETE CASCADE`.
- 012 REQ-OWN12-008(a), la matriz de borrado y SC-012-108 piden anular la columna «al suprimirse la cuenta del creador», y suponen que el enlace sobrevive.
- Resultado: si el creador borra su cuenta, 005 elimina la fila completa por cascada, y la columna desaparece con ella. Un `NULL` no se puede escribir en una columna `NOT NULL`. Hay dos salidas: (A) aceptar la cascada de 005 como comportamiento (lo más seguro en privacidad: no queda ningún ID ni enlace) y reescribir el texto de 012 para que diga eso; o (B) conservar el enlace, lo que exige un anexo `ENM-005-A` que relaje `NOT NULL` y anule la columna. Recomiendo (A), porque no añade ningún dato y es coherente con el `404` inmediato de `INV-OWN12-005`. Es un cambio de texto de `/architect`, que además debe confirmar que `ON DELETE CASCADE` de 005 está vigente en `LOCKED`/`APPROVED`.

**R-A4 · BAJA · Seudonimización HMAC con la misma clave.** (Punto 2b.)
Aceptable para retención de 90 días. Dejar escrito en el data-model que es seudonimización (no anonimización) y que la clave HMAC de `pseudonymizeUser` se trata como secreto con rotación documentada. No bloquea.

**R-A5 · MEDIA · Alergias de terceros: aviso incompleto en activación.** (Punto 4b.)
El aviso del editor cubre el caso, pero el texto de activación (REQ-QR12-006) no menciona que el campo es público. Lo que cualquiera que escanee ve son las alergias que el titular escribió. Propuesta: añadir a ese texto la frase «Las alergias se muestran tal cual las escribiste: no incluyas nombres ni datos de otras personas», y un SC que verifique que el texto aparece en `legal-texts.md`. Confirmación de `/maggie` pendiente (es un dictamen clínico sobre el texto libre, no mío).

**R-A6 · MEDIA · Retención de disputas por ausencia y minimización.** (Punto I.1.)
La matriz de retención aplica a todo `CHIP_DISPUTE`, incluidas las de ausencia (`dispute_reason = CO_OWNER_ABSENT_OR_BLOCKING` y `PRINCIPAL_ABSENT`), 365 días tras `RESOLVED`. Estas disputas no tienen chip ni evidencia documental obligatoria, y su contenido es la identidad del principal (o de un co-propietario) y una inferencia de inactividad. El 365 de Neo-J se justificó por la evidencia de apropiación de chip, no por las ausencias. Propuesta: separar la fila de la matriz. Chip: 365 tras `RESOLVED` (sin cambio). Ausencia: 90 días tras `RESOLVED`, igual que las solicitudes no disputa. Es una variación de Neo-J, así que la decide Neo; el arquitecto solo la propone.

**Reservas que ya estaban en la re-auditoría y siguen abiertas (no se reabren):** R-01 (`DEUDA-012-TERRAFORM-LOGS-QR`) queda cubierto por T1685 como criterio bloqueante; R-02/R-03/R-04/R-05/R-06/R-08/R-10 están cerrados en N2-R (§G, §H); R-07 (paridad E.164) cubierto por SC-012-110 y T1674; R-09 ratificado por N2-R3.

**Notas menores (sin veredicto propio):**
- N-1 · Orden de purga: `dispute_evidence.request_id` es `RESTRICT`. La purga de mantenimiento debe borrar primero los objetos vía `media_deletion_queue` y luego las filas, o fallará correctamente. Verificar en la tarea de purga (T1646 o la de mantenimiento). Es una nota de implementación, no de texto.
- N-2 · Preferencia del reclamante (I.3): recomendación de privacidad. No almacenar ninguna preferencia por defecto: tras `RESOLVED` la reserva se libera a la regla general y el reclamante registra el chip con las reglas ordinarias. Si Neo quiere una preferencia, debe ser opt-in explícito en el momento de la resolución, guardada en la propia fila de la disputa, con TTL de 30 días, seudonimizada al borrar la cuenta y sin notificar a nadie más. No puede ser una tabla nueva ni un derecho automático, porque eso crea un vínculo persona-chip que hoy no existe.
- N-3 · Plazo máximo de `UNDER_REVIEW` (R-A1): valor a decidir por Neo (propongo 60 días calendario desde la apertura, alineado con el techo de congelación).

## 4. Cambios de texto para /architect (solo los puntos abiertos)

1. **Punto 2c / R-A3 (`share_links`).** En `spec.md` REQ-OWN12-008(a) y SC-012-108, y en la matriz de `data-model.md` (fila «Solicitudes…», parte de `share_links`), sustituir «queda en `NULL`/seudónimo» por: «al suprimirse la cuenta del creador, la fila de `share_links` se elimina por la cascada de `created_by_user_id` (005, `ON DELETE CASCADE`); no queda ningún ID ni enlace vigente». Eliminar la mención a `pet_owner_user_id_at_creation` como columna que sobrevive. Confirmar que no hay contradicción con `ENM-005-A`. Si Neo prefiere conservar el enlace, abrir `ENM-005-A` con relajación de `NOT NULL` (opción B).
2. **R-A1 (plazo de `UNDER_REVIEW`).** En `spec.md` REQ-CHP12-004 y en la fila de `owner_requests` (`CHIP_DISPUTE`) de `data-model.md`, añadir: «Sin resolución en `DISPUTE_MAX_OPEN_DAYS` [valor pendiente de Neo] desde la apertura, el caso se cierra con `REJECT` y `moot_reason = TIMEOUT` (sin cooldown); la retención cuenta desde ese cierre o desde `RESOLVED`, lo que ocurra antes». Bloqueado por decisión de Neo (N-3).
3. **R-A2 (contenido de la evidencia).** En `spec.md` REQ-CHP12-008, añadir: «La evidencia es dato personal también en su contenido; el aviso de subida pide solo documentos que acrediten el chip, sin datos de contacto innecesarios. Pendiente en `DEUDA-012-LEGAL-DISPUTAS-QR`».
4. **R-A5 (aviso de activación).** En `spec.md` REQ-QR12-006, añadir a la frase de activación: «Las alergias se muestran tal cual las escribiste: no incluyas nombres ni datos de otras personas.» Añadir SC que lo verifique en `legal-texts.md`.
5. **R-A6 (retención de ausencias).** En la fila de `owner_requests` (`CHIP_DISPUTE` incluidas las de ausencia) de `data-model.md`, separar: chip 365 días tras `RESOLVED`; ausencia 90 días tras `RESOLVED`. Bloqueado por decisión de Neo.
6. **Punto I.1 (`PRINCIPAL_ABSENT`).** Sin cambio de texto. Requiere ratificación de Neo (o retirar la variante, como indica la propia adenda).
7. **Punto I.3 (preferencia del reclamante).** Sin cambio de texto hasta la decisión de Neo. Si Neo no elige, el texto por defecto es el de N-2: no se almacena preferencia.

## 5. Decisiones pendientes para Neo (Nivel 2)

1. **Plazo máximo de `UNDER_REVIEW`** (R-A1 / N-3): valor y cierre por defecto.
2. **Retención de disputas por ausencia** (R-A6): confirmar 90 días tras `RESOLVED` o mantener 365.
3. **Variante `PRINCIPAL_ABSENT`** (I.1): ratificar o retirar.
4. **Preferencia del reclamante al liberar el chip** (I.3): no almacenar (recomendado) o opt-in de 30 días.
5. Confirmación de la ratificación de la sucesión automática del principal, ya pendiente desde la re-auditoría (R-09, R-10). No cambia con esta revisión.

Ninguna de estas decisiones la puede cerrar `/architect` ni `/rama` por sí solos. Quedan en la lista de Neo; no se marca nada como `APPROVED`.

## 6. Pruebas que deben existir (adición a la re-auditoría §6)

- Supresión del único propietario con disputa `UNDER_REVIEW` que supera el plazo máximo: el caso se cierra y la retención cuenta desde ese cierre (R-A1).
- Evidencia de una cuenta borrada: la purga de mantenimiento borra primero los objetos y luego la fila (`RESTRICT`, N-1).
- `share_links` de un creador que borra su cuenta: no queda fila ni ID en ninguna columna (R-A3).
- Texto de activación de QR contiene la advertencia de terceros (R-A5).
- Disputa de ausencia resuelta: se purga a 90 días y no a 365 (R-A6), si Neo lo aprueba.

## 7. Límites de esta revisión

No ejecuté pruebas, consultas a base de datos ni `terraform plan`. No verifiqué bases legales (siguen en `DEUDA-012-LEGAL-DISPUTAS-QR`). No revisé `contracts/` (solo `README.md`). El estado `LOCKED`/`APPROVED` de 005 se dedujo de su texto y no se comprobó en el registro de estados (R-A3 depende de ello). No se modificó ningún archivo fuera de esta acta y las líneas de bitácora.
