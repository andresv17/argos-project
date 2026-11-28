# Rama · Pase T1647 (Bloque B, feature 012): supresión con disputa, retención y rejected_by

- Fecha: 2026-11-27 · Solicitante: Morpheus · Agente: Rama (solo lectura)
- HEAD auditado: 348faa3 (tras 305df23). Sin ediciones de src/, contratos ni tests; sin commit, push, `[x]`, `logos.*` ni `git stash`.
- Fuentes: spec.md (N2-R2, REQ-OWN12-008 (c), REQ-CHP12-004/007/008, SC-012-076/096/097/108/118, EDGE-012-053), data-model.md:58, :141, :159, :161; tasks.md T1647 (L90).
- Acta previa consultada: `rama-012-bloqueB-T1644-D8-reaudit-f96e16d-2026-11-27.md`. Aquí no se repiten `claimIdentity`, la transacción PG abortada ni la purga de delegados (A-01, M-01, M-03).
- Verificación ejecutada (solo lectura): `npx vitest run` sobre `co-ownership-erasure-012`, `co-ownership-maintenance-012`, `chip-evidence-arbitration-012`, `chip-dispute-012`: 4 ficheros OK, 49 pasan, 22 omitidas (las omitidas son PostgreSQL, sin `TEST_DATABASE_URL`).

## Dictamen

**CUMPLE CON RESERVAS** para (a), (b) y (c). Ningún punto contradice el spec; las reservas son de verificación (sin prueba de SC-012-096/EDGE-012-053, PG no ejecutada) y de riesgo (PII dentro de la evidencia, anclas `resolved_at` frente a `closed_at`).

| Punto | Veredicto |
|---|---|
| (a) Supresión con disputa `UNDER_REVIEW` del único propietario | CUMPLE CON RESERVAS |
| (b) Retención (365 / 1095 / 90 / 24 meses / person_id / evidencia) | CUMPLE CON RESERVAS |
| (c) `rejected_by` (quién, auditoría, id vs alias, contraparte) | CUMPLE CON RESERVAS (nota de visibilidad entre co-propietarios) |

## (a) Supresión de cuenta del único propietario con disputa abierta

Trazado en código:

1. **Mascota sin sucesor se borra.** `account-use-cases.ts:205`: `chooseSuccessor` devuelve `null` y la mascota entra en `ownedPets`. `account-use-cases.ts:238`: las solicitudes `PENDING` pasan a `CANCELLED` salvo `CHIP_DISPUTE`, así que la disputa no se toca. `account-use-cases.ts:243`: `repositories.pets.delete(pet.id)`. Cumple el texto del spec (sucesor ausente, borrado) y no lo contradice. Los guardas de `domain/account/account-deletion-guards.ts` no mencionan disputas, así que la supresión no se bloquea.
2. **`owner_requests.pet_id` pasa a NULL.** Migraciones SQLite `0033_co_ownership.sql:38` y PostgreSQL `0029_co_ownership.sql:36`: `REFERENCES pets (id) ON DELETE SET NULL`. El adaptador en memoria lo emula en `in-memory-unit-of-work.ts:435`. Sin `pet_id`, el expediente sigue válido: `chip-dispute-admin-use-cases.ts:238-240` cierra con `moot('PET_GONE')`, es decir `RESOLVED`, y eso libera la reserva conforme a SC-012-096.
3. **`chip_hmac` se conserva.** `scrubUserFromRequest` (`ownership-rows.ts:112-127`) hace un spread de la fila y no toca `chipHmac`, `chipLast4` ni `disputeReason`.
4. **Reserva del chip hasta `RESOLVED` o `EXPIRED`.** Consulta de reserva sin dependencia de la mascota: SQLite `sqlite-ownership-repositories.ts:74` y `:124-126`; PostgreSQL `postgres-ownership-repositories.ts:119-122` (`chip_hmac`, `CHIP_DISPUTE`, `CHIP_APPROPRIATION`, `UNDER_REVIEW`, `expires_at > now`); memoria `in-memory-ownership-repositories.ts:128-130`. La reserva se mantiene mientras la fila siga `UNDER_REVIEW` y no haya vencido. `expires_at` coincide con `EXPIRED` (`chip-dispute-retention.ts:17-27`).
5. **Seudonimización del expediente.** `account-use-cases.ts:263` llama a `ownerRequests.pseudonymizeUser` antes de `users.delete`. SQLite `sqlite-ownership-repositories.ts:112-123` y PostgreSQL `postgres-ownership-repositories.ts:103-118` aplican `scrubUserFromRequest` a `requester_user_id`, `target_user_id`, `rejected_by`, `resolved_by_user_id`, `second_approver_user_id`, `approver_set` y `approvals`, con alias en `requester_pseudonym` y `rejected_by_pseudonym`. `target_username_sealed` lo limpia `settledRequest` (`co-ownership-support.ts:120-122`). Un expediente `CHIP_DISPUTE` nace con `message: null` (`absence-dispute-use-cases.ts:79`) y el motivo de disputa es un enum, así que no hay texto libre que purgar en la fila.
6. **Auditoría.** `ACCOUNT_DELETE` y `pseudonymizeUser` del audit log van antes de borrar el usuario (`account-use-cases.ts` B7/B8), así que el id del usuario no queda en `audit_log`.

Reservas de (a):

- **A-R1 (MEDIO, verificación): no hay prueba del caso.** `grep` de `096`, `053` y `N2-R2` en `tests/` no devuelve nada. Ningún test cubre "único propietario + `CHIP_APPROPRIATION` `UNDER_REVIEW` → supresión procede, mascota borrada, `pet_id` NULL, reserva activa, mismo `409`". La cobertura cercana es `co-ownership-erasure-012.spec.ts:53` (solicitudes `PENDING` de mascota borrada) y `:82` (SC-012-076), que usan solicitudes no-disputa. Recomendación: añadir la prueba de regresión a Keymaker (SQLite y, si es posible, PG).
- **A-R2 (MEDIO, residual de PII): la evidencia no se seudonimiza.** `dispute_evidence` (migración `0036`, `postgres/0032`) conserva los archivos subidos por el reclamante. El saneo elimina EXIF/XMP y metadatos (SC-012-082), pero el contenido visual o textual (nombre en una factura o certificado) sigue ahí. El spec exige conservar la evidencia, así que no es incumplimiento, pero el texto "pseudonymizeUser no debe dejar identificadores en el expediente" se cumple solo para la fila. Decisión para Neo.
- **A-R3 (BAJO): PG no ejecutada.** Las rutas de `pseudonymizeUser`, `hasOpenChipReservation` y `clearPersonId` para este caso solo se han leído en PostgreSQL. Requiere `TEST_DATABASE_URL`.

## (b) Retención

| Plazo del spec | Implementación | Evidencia |
|---|---|---|
| Evidencia 365 d desde `closed_at` | `chip-dispute-admin-use-cases.ts:153-157` (`closeDispute` fija `delete_after = closedAt + 365 d`); `chip-dispute-retention.ts:25` (vencimiento, desde `expiresAt`); constante `feature-012-limits.ts:70` | `chip-evidence-arbitration-012.spec.ts:171` (EDGE-012-064) |
| Purga física de evidencia antes que el expediente (RESTRICT) | `chip-dispute-retention.ts:33-44` (filas y encolado `DELETE` en la misma transacción); `maintenance-use-cases.ts:297` exige `!withEvidence` | `chip-evidence-arbitration-012.spec.ts:186` (SC-012-118) |
| Expediente de apropiación 1095 d | `maintenance-use-cases.ts:297`: `TERMINAL && !withEvidence && terminalDate < now-1095 d`; constante `feature-012-limits.ts:79` | Sin prueba del límite 1095 en `owner_requests` (ver B-R1) |
| Ausencia 90 d | `maintenance-use-cases.ts:298`: no apropiación, `terminalDate < cutoff`, con `cutoff = now - OWNERSHIP_TERMINAL_RETENTION_DAYS (90)`; constante `feature-012-limits.ts:32` | `co-ownership-maintenance-012.spec.ts:57` (H-08/P-2) |
| Auditoría 24 meses (R-1) | `maintenance-use-cases.ts:14,26` (`AUDIT_RETENTION_MONTHS = 24`); `sqlite-unit-of-work.ts:107` y `postgres-maintenance.ts:57` purgan `audit_log` y `admin_audit_entries` (incluido `metadata`, motivo ≤ 500) | `unit-of-work.port.ts:22`; spec data-model.md:159 |
| `person_id = NULL` tras plazo (D8) | `maintenance-use-cases.ts:220` (llamada), `:239-261` (`releaseExpiredPersonIds`): `closedAt = resolvedAt ?? decidedAt ?? expiresAt` + 1095 / 90 / 90; abierto (`PENDING`/`UNDER_REVIEW`) retiene | `t1580-purga-delegados-011.spec.ts` (14 OK en memoria/SQLite; PG omitida) |
| Expediente no purgado antes de plazo | `maintenance-use-cases.ts:291-301`: solo terminales; `retainedUntil` protege solicitudes selladas | `co-ownership-maintenance-012.spec.ts:57` |
| Evidencia no purgada antes de plazo | `purgeExpiredDisputeEvidence` usa `delete_after <= now`; `delete_after` solo se fija al cerrar o vencer | `chip-evidence-arbitration-012` |

Reservas de (b):

- **B-R1 (MEDIO, verificación): sin prueba del límite de 1095 días.** `co-ownership-maintenance-012` prueba los plazos de 90 días; no hay prueba de que un expediente de apropiación `RESOLVED` con 1094 días sobreviva y con 1096 se purgue, ni de que `person_id` se libere en 1095 (la prueba D8 de 994/996 días está en el acta previa T1644).
- **B-R2 (BAJO, ancla): `resolved_at` frente a `closed_at`.** Una decisión programada (`executesAfter`, 72 h) guarda `resolvedAt` en la decisión (`chip-dispute-admin-use-cases.ts:220`), mientras que `closeDispute` en la ejecución fija `decidedAt`/`closedAt` en el momento de ejecutarla (`:278`: `resolvedAt: dispute.resolvedAt ?? now`). `terminalDate` (`maintenance-use-cases.ts:291`) usa `resolvedAt`, así que el expediente y `person_id` pueden vencer hasta 72 h antes que el `closed_at` del spec. La evidencia sí usa el cierre real. Impacto mínimo, pero el spec pide ancla común `closed_at` (SC-012-118).
- **B-R3 (BAJO): constantes acopladas por valor.** La ausencia usa `OWNERSHIP_TERMINAL_RETENTION_DAYS` (90) en lugar de `DISPUTE_ABSENCE_RETENTION_DAYS` (90), que existen y valen lo mismo. Cambiar una no cambia la otra.
- **B-R4 (BAJO): evidencia de ausencia a 365 d.** `chip-dispute-retention.ts:25` y `chip-dispute-admin-use-cases.ts:156` usan `DISPUTE_EVIDENCE_RETENTION_DAYS` (365) también para disputas de ausencia. El comentario de la migración `0036` dice 90 d. No he encontrado un endpoint de evidencia para ausencia, así que el efecto probablemente es nulo; no verificado.
- **B-R5 (NO VERIFICADO): "revertidos".** En el dominio de disputas no existe estado "revertido" (`grep REVERT src/application` sin resultados; `CARE_LOG_REVERTED` es de rutinas de cuidado, fuera de este bloque). Interpreto la cláusula como rollback de la purga, que sí se cumple: `purgeOwnershipData` y `purgeDelegateData` corren en una transacción y devuelven contadores a cero si fallan (`reportMaintenanceFailure`, sin PII). Pedir a Morpheus que aclare el término si se refería a otro concepto.

## (c) rejected_by

- **Quién puede rechazar.** `domain/pet/co-ownership.ts` `evaluateOwnerRequest` (líneas 157-165): el votante debe estar en `currentOwners` (si no, 404 uniforme), no puede ser el solicitante (`ERR-ACC-FORBIDDEN`) y debe estar en `approverSet` (co-propietarios `ACTIVE` distintos del solicitante). El `INVITED` y el `target` no votan salvo que sean propietarios. `rejected_by` solo puede ser un propietario actual en ese instante. Cumple REQ-OWN12-004 (b).
- **Auditoría.** `owner-request-use-cases.ts:254-255`: `OWNER_REQUEST_REJECTED` vía `recordOwnershipAudit`, con `executorUserId = actorUserId` y `entityId = petId`. Cumple REQ-CHP12-007. Nota: el id del votante queda en claro en `audit_log` hasta la supresión (B8 lo seudonimiza). El spec pide "autor seudonimizado cuando proceda"; es razonable para la auditoría de 002, pero conviene que Neo lo confirme (BAJO).
- **Id o alias.** Vivo: `rejected_by` guarda el id (FK `users(id)`, `ON DELETE SET NULL`; SQLite `0033:49`, PostgreSQL `0029:47`), coherente con data-model.md:58. Tras la supresión: `rejected_by = NULL` y `rejected_by_pseudonym` (HMAC) en `scrubUserFromRequest`. Prueba: `co-ownership-erasure-012.spec.ts:93-108` (`rejectedBy: null`).
- **No revelar a la contraparte.**
  - Solicitante no propietario (`CLAIM_CO_OWNERSHIP`, `INVITE`, `TARGET`): `toView` (`owner-request-use-cases.ts:31-58`, rama `reduced` al no ser propietario) devuelve la fila `reduced` sin `approvers` ni `rejectedBy`. La reclamación del solicitante fija `rejectedBy: null` (`chip-claim-use-cases.ts:82`). Cumple SC-012-110 y la matriz de `trinity H-01/H-07`.
  - Disputa de chip: `rejectedBy: null` (`chip-dispute-use-cases.ts:121`); el árbitro ve alias u opaco (REQ-CHP12-007).
  - Propietario `ACTIVE` actual: ve `approvers[].vote = 'REJECTED'` con `username` (`owner-request-use-cases.ts:43`, `:52` en `toView`). Lo permite la matriz del spec (`spec.md:422`, "detalle solo a propietario `ACTIVE` actual"). Nota de visibilidad: si A pide `DELETE_PET` o `TRANSFER_PRINCIPAL` y B rechaza, A ve que lo rechazó B. Es transparencia dentro del grupo de propietarios, no una filtración a un tercero, pero si Neo quiere voto anónimo entre co-propietarios esto no lo cumple (BAJO-MEDIO, decisión de producto).

Reservas de (c):

- **C-R1 (BAJO): la auditoría de rechazo guarda el id en claro** hasta la supresión (ver arriba).
- **C-R2 (BAJO): visibilidad del votante** entre co-propietarios, por diseño según spec:422 (ver arriba).
- **C-R3 (verificación): sin prueba de "no revelar a la contraparte" en `rejected_by`.** `co-ownership-erasure-012.spec.ts:93-108` prueba la seudonimización, no la vista del solicitante no propietario en estado `REJECTED`.

## Riesgos abiertos (resumen)

| ID | Sev. | Tema | Acción |
|---|---|---|---|
| A-R1 | MEDIO | Sin prueba de SC-012-096 / EDGE-012-053 | Keymaker: prueba de regresión (SQLite; PG si hay `TEST_DATABASE_URL`) |
| A-R2 | MEDIO | PII dentro de los archivos de evidencia tras la supresión | Decisión de Neo (retener sin tocar, o redacción/limitación) |
| A-R3 | BAJO | PG sin ejecutar para este camino | Morpheus: suite PG con `TEST_DATABASE_URL` |
| B-R1 | MEDIO | Sin prueba del límite 1095 d de apropiación ni de liberar `person_id` | Keymaker: prueba de frontera 1094/1096 |
| B-R2 | BAJO | Ancla `resolved_at` frente a `closed_at` en decisiones programadas (hasta 72 h) | Keymaker o Architect: usar `closed_at` (o documentar) |
| B-R3 | BAJO | Constantes de ausencia acopladas por valor | Refactor menor |
| B-R4 | BAJO | Evidencia de ausencia a 365 d (migración dice 90) | Verificar endpoint de evidencia de ausencia |
| B-R5 | INFO | "Revertidos" sin definición en el dominio | Morpheus: aclarar término |
| C-R1 | BAJO | Id del votante en claro en `audit_log` hasta supresión | Confirmar con Neo |
| C-R2 | BAJO-MEDIO | Votante visible a co-propietarios | Decisión de producto de Neo |

## Recomendación

1. Keymaker: prueba de regresión de SC-012-096 / EDGE-012-053 y prueba de frontera de 1095 d / `person_id` (A-R1, B-R1). Corregir el ancla a `closed_at` si Neo lo confirma (B-R2).
2. Neo (Nivel 2): decidir A-R2 (PII en evidencia) y C-R2 (visibilidad del votante). No es tarea de agentes marcar `[x]` en T1647; sigue `[ ]`.
3. Morpheus: ejecutar la suite PG con `TEST_DATABASE_URL` antes de dar T1647 por cerrado sin reservas.

TO: Neo (Andrés Vallejo — Level 2) para las decisiones A-R2 y C-R2.
