# Acta /lock — Re-auditoría dirigida de Fase 0, Feature 012 (Multidueño, Microchip y Cuidador)

**Fecha:** 2026-11-26 · **Autor:** Commander Lock (`/lock`, subagente, modelo haiku) · **Rama:** `012-multiduenio-microchip-cuidador`
**Ciclo:** re-auditoría única de `/lock` tras el pase de `/architect` (`MAX_RETRY = 1`). Tras esta acta no hay más reintentos automáticos de `/lock`: lo que queda se decide con Neo o con `/architect`.
**Alcance (solo lectura):** `specs/012-multiduenio-microchip-cuidador/{spec,data-model}.md` (reescritos), `claude/decisiones-neo-012-2026-11-26.md` (acta + adenda), mi acta previa `lock-012-fase0-2026-11-26.md`, y, como referencia cruzada, `trinity-012-reauditoria-2026-11-26.md` (valores y R-01..R-09 de `/trinity`).
**Restricciones cumplidas:** sin ediciones de specs, contratos ni código; sin `[x]`, sin `APPROVED`/`LOCKED`, sin `git add`, sin `git push`.

## 0. Veredicto

**NO CUMPLE.**

Los hallazgos H-01..H-23 de mi acta previa quedan cerrados en el texto, salvo residuos menores. Pero la reescritura **no cierra tres garantías críticas** y deja **un punto de la adenda de Neo sin trazar en el acta en disco**:

1. **END_CO_OWNERSHIP** (desenlace de la Válvula 2) no tiene precondición objetiva, no tiene ancla `(pet_id, target_user_id)` y no define qué congela. Es la vía por la que se expulsa a un co-propietario. Sin precondición objetiva, cualquier principal puede construir el caso contra un co-propietario que simplemente vota «no» (R-01).
2. **Carrera en la sucesión**: `LEAVE`, promoción y supresión de cuenta no están bajo el bloqueo por mascota de `NFR-012-008`. Dos salidas concurrentes pueden dejar una mascota con un propietario que ya salió (R-02).
3. **Bypass de la disputa de chip**: la congelación caduca a los 30 días y la supresión de cuenta del único propietario libera el chip de inmediato. Nada impide volver a registrar el chip mientras la disputa está `UNDER_REVIEW` (R-03).

Esto es corregible por enmienda de spec (`/architect`) para R-02 y R-03 de forma técnica, pero R-01 y R-03 (parte de supresión de cuenta) requieren decisión de Neo (Nivel 2) antes de que `/architect` los redacte.

## 1. Estado de los hallazgos H-01..H-23 de la acta previa

| ID | Sev. previa | Estado tras la reescritura | Dónde se verifica | Residuo |
| --- | --- | --- | --- | --- |
| H-01 VIEW_ONLY | ALTA | **CERRADO** | US3.3, `REQ-CAR12-004`, `SC-012-030`, `EDGE-012-049`, `SC-012-077`. VIEW_ONLY limita solo rutinas y registros de cuidado. | Ninguno. Neo-B confirmado. |
| H-02 QR ON que pierde la guarda | ALTA | **CERRADO** | `REQ-QR12-010`, `REQ-QR12-003` (guarda al activar), `EDGE-012-023/024/025`, `SC-012-083`, `Neo-D`. Auto-OFF en la misma transacción, hash invalidado, `404` uniforme, auditoría, aviso. | Ninguno. Regenerar desde OFF aplica la guarda (confirmado). |
| H-03 aprobaciones por solicitud | ALTA | **CERRADO** | `REQ-OWN12-004` (c), `NFR-012-008`, `EDGE-012-004/030`, `SC-012-010/074`. Versión `pets.ownership_version` por mascota, bloqueo `FOR UPDATE`/`IMMEDIATE` y revalidación. | Ver R-02: la misma garantía no cubre LEAVE ni promoción. |
| H-04 congelación sin DELETE_PET | ALTA | **CERRADO CON RESERVA** | `REQ-CHP12-004`, `INV-CHP12-005`, `EDGE-012-008/037/038`, `SC-012-081`. Congelación incluye `DELETE_PET`, `TRANSFER`, `CHANGE`, `INVITE` y aprobación de claims. | R-03: la congelación caduca a 30 días y no bloquea el registro del chip; la supresión de cuenta no está congelada. |
| H-05 índice y chip_conflict | ALTA | **CERRADO** | `Neo-G+Q` retira `CHIP_CONFLICT` y `D12-08`. `REQ-CHP12-006`, `SC-012-023`. El índice de 004 queda intacto. Sin `chip_conflict` en `data-model.md`. | Ninguno. Residuo de texto en `research.md:19` y `tasks.md:68,71,73` (menciones de retirada, no vigentes). |
| H-06 oráculo de existencia | ALTA | **CERRADO CON RESERVA** | `REQ-CHP12-005`: se cuenta todo intento con chip válido, `429` uniforme, `SC-012-021/078`. El oráculo por `429` queda eliminado. | R-09: el oráculo 201/409 persiste, acotado por tasas. La cifra global no está en la spec. |
| H-08 co-propietario ausente | ALTA | **CERRADO CON RESERVA** | Válvula 1 (`REQ-OWN12-006`, salida del principal sin aprobación) y Válvula 2 (`REQ-OWN12-009`, disputa con `END_CO_OWNERSHIP`). `EDGE-012-036`. | R-01 y R-07: la Válvula 2 no tiene precondición objetiva ni vía para el principal ausente. |
| H-18 disputas sin tope ni SLA | MEDIA | **PARCIAL** | `REQ-CHP12-004` (1 por usuario y chip, 3 simultáneas, SLA 15 días hábiles, congelación 30 días). `EDGE-012-039`, `SC-012-080`. | R-05: sin cooldown tras rechazo y con prórroga sin tope. |
| H-07 oráculo de cuentas en invitación | MEDIA | **CERRADO** | `REQ-OWN12-002`, `EDGE-012-042`, `SC-012-075`. Respuesta `202` uniforme. | Ninguno. |
| H-09 solicitudes huérfanas | MEDIA | **PARCIAL** | `EDGE-012-031/033/034`, `REQ-OWN12-004` (d)(e). | R-12 y R-15: TTL en el borde y expiración perezosa sin regla. |
| H-10 reclamaciones concurrentes | MEDIA | **CERRADO** | `REQ-CHP12-003`: varias `PENDING` por chip válidas (decisión de texto); oráculo cerrado (`INV-CHP12-003`, `EDGE-012-040/041`). | R-06: el índice de unicidad está anclado a `pet_id`, no al chip. |
| H-11 CHIP_CONFLICT sin salida | MEDIA | **CERRADO** | Retirado por `Neo-G+Q`. `EDGE-012-029` marcado RETIRADO. | Ninguno. |
| H-12 teléfono por mascota | MEDIA | **CERRADO** | `REQ-QR12-004/006`, `EDGE-012-026/027`, `SC-012-047/084`. Opt-in por mascota, deduplicado, orden determinista. | Ver R-04 sobre el criterio de orden. |
| H-13 IP tras proxy | MEDIA | **CERRADO CON RESERVA** | `REQ-QR12-007`, `REQ-CHP12-005`, `EDGE-012-046`: IP según `ARGOS_TRUST_PROXY_HOPS`. | R-10: el contador QR es en memoria por instancia. |
| H-14 reglas de cuidado | MEDIA | **CERRADO CON RESERVA** | `REQ-CAR12-003`: quién marca `SKIPPED`, `DONE` tardío con `late = 1`, corrección con motivo. `EDGE-012-048`. | Dictamen de `/maggie` pendiente (R-16). |
| H-15 idempotencia de cuidado | MEDIA | **CERRADO** | `P-10`: sin clave. Mismo autor → `200`; otro → `409`. `REQ-CAR12-003`, `SC-012-031/032`, `EDGE-012-047`. | Ninguno. |
| H-16 respaldo con chip ya registrado | MEDIA | **CERRADO** | `REQ-OWN12-008` (b), `EDGE-012-044`: falla cerrada. | Ninguno. |
| H-17 migración y escritor concurrente | MEDIA | **CERRADO POR RETIRADA** | `EDGE-012-045` RETIRADO (sin migración de duplicados). | R-08: el despliegue rolling de la migración de 012 no está tratado. |
| H-19 supresión frente a evidencia | MEDIA | **CERRADO CON RESERVA** | `data-model.md`, matriz de borrado: expediente y evidencia conservados con identidad seudonimizada. | Dictamen legal de `/rama` y `DEUDA-012-LEGAL-DISPUTAS-QR` pendientes (R-16). |
| H-20 `effective_from` | BAJA | **CERRADO** | `REQ-CAR12-001` y `data-model.md` incluyen `effective_from`. `EDGE-012-013` coherente. | Ninguno. |
| H-21 formato del chip | BAJA | **CERRADO** | `REQ-CHP12-002`, `EDGE-012-010`: cliente normaliza, servidor `^\d{15}$`, sin conteo. | Ninguno. |
| H-22 OFF frente a última escritura | BAJA | **CERRADO** | `REQ-QR12-003`, `EDGE-012-018`: `OFF` prevalece. | Ninguno. |
| H-23 chip de fallecida | BAJA | **CERRADO** | `Neo-F+L`, `EDGE-012-050`, `SC-012-079`: el chip sigue bloqueado. | Ninguno. |

## 2. Residuales nuevos y no resueltos (numerados con severidad)

### R-01 · ALTA · `END_CO_OWNERSHIP` sin precondición objetiva, sin ancla y sin congelación definida (dictamen pedido)

**Qué dice el texto:** `REQ-OWN12-009` y `REQ-CHP12-009` dicen que un co-propietario «considera que otro está ausente o bloquea con mala fe» y que se abre `CHIP_DISPUTE` con `dispute_reason = CO_OWNER_ABSENT_OR_BLOCKING`. El desenlace `END_CO_OWNERSHIP(target)` exige control dual o ventana de 72 h.

**Por qué falla (Input + Estado → Fallo):**
- **Input:** el principal P pide `DELETE_PET`. El co-propietario C vota «no» (`REJECTED`). P abre `CO_OWNER_ABSENT_OR_BLOCKING` contra C.
- **Estado:** el texto no distingue «ausente» de «rechazó». El criterio «bloquea con mala fe» es subjetivo y no reproducible, algo que esta acta exige como condición para formalizar un caso. Dos administradores distintos pueden ejecutar `END_CO_OWNERSHIP(C)` sin ningún hecho objetivo en la base de datos.
- **Fallo:** un co-propietario honesto es retirado por votar «no». Esto es una expulsión por disputa con base arbitraria, aunque D12-04 permita la vía de disputa.

**Anclaje roto:**
- `data-model.md` exige `chip_last4` y `chip_hmac` para `CHIP_DISPUTE`. Esa disputa de END no tiene chip, y una mascota sin chip no puede abrirla.
- La unicidad por chip (`UNIQUE (requester_user_id, chip_hmac) WHERE UNDER_REVIEW`) no aplica con `chip_hmac` nulo.
- No hay `CHECK` que obligue `target_user_id NOT NULL` ni `pet_id NOT NULL` cuando `resolution = END_CO_OWNERSHIP`.
- No se define qué se congela: la congelación se deriva de chip y no hay chip. Sin congelación, el principal puede avanzar `DELETE_PET` o `TRANSFER` mientras la disputa está abierta.

**Dictamen de `/lock` (precondición objetiva propuesta para `/architect`; los valores numéricos son propuesta a confirmar por Neo):**
1. **Ancla:** `pet_id` y `target_user_id` obligatorios para `CO_OWNER_ABSENT_OR_BLOCKING`; `chip_*` nulos. Índice único parcial `(pet_id, target_user_id) WHERE dispute_reason = 'CO_OWNER_ABSENT_OR_BLOCKING' AND status = 'UNDER_REVIEW'`.
2. **Sujeto:** `target` es co-propietario `ACTIVE`, distinto del principal y del solicitante. Se sella `pet_version` al abrir y se revalida al ejecutar. Si el target ya no es `ACTIVE` o la versión cambió, la disputa queda sin efecto (cierre `REJECT`).
3. **Disparador objetivo verificable en BD:** al menos **2** solicitudes críticas de esa mascota, creadas en los últimos **60 días**, que expiraron por TTL (`EXPIRED` sin `stale_reason`), con el target en `approver_set` y sin voto suyo. **Ningún** `REJECTED` del target en esa ventana: un «no» explícito es un voto legítimo y nunca cuenta como ausencia. Esto cierra el griefing del escenario de arriba.
4. **Exclusiones:** el target nunca puede ser el principal (el principal se trata con `LEAVE` o con `REQUEST_CHANGE_PRINCIPAL`). El solicitante debe ser principal o co-propietario `ACTIVE`, nunca un tercero.
5. **Congelación por pet_id** mientras esté `UNDER_REVIEW`: bloquea `DELETE_PET`, `TRANSFER_PRINCIPAL`, `CHANGE_PRINCIPAL`, `INVITE_CO_OWNER` y las aprobaciones de esa mascota. **Permite** `LEAVE` del target, que deja la disputa sin efecto.
6. **Ejecución:** control dual de dos administradores distintos, ninguno parte (`REQ-CHP12-009`), con revalidación del `ownership_version` y del disparador dentro de la transacción. La ventana de 72 h solo ejecuta una decisión ya registrada por humano y es cancelable (ver R-14).

**Decisión de Neo requerida:** confirmar el disparador (2 solicitudes, 60 días, sin rechazo) y si aplica la misma vía al principal ausente (R-07).

### R-02 · ALTA · Carrera en la sucesión: `LEAVE`, promoción y supresión de cuenta sin bloqueo por mascota

**Qué dice el texto:** `NFR-012-008` y `REQ-OWN12-004` (c) exigen bloqueo por mascota solo para transiciones de `owner_requests` y para ejecución de acciones críticas. `LEAVE`, promoción `PROMOTED` y supresión de cuenta de `REQ-OWN12-006` / `REQ-OWN12-008` (c) no aparecen en esa cláusula.

**Escenario reproducible (Input + Estado → Fallo):**
- **Input:** el principal P y el único co-propietario B ejecutan `LEAVE` a la vez (o B borra su cuenta mientras P sale).
- **Estado:** en PostgreSQL con READ COMMITTED, ambas transacciones leen B como `ACTIVE`. P promueve a B (`owner_user_id = B`) y B pasa a `LEFT`. Si la escritura de B no revalida la condición, la fila queda `PROMOTED` sobre un usuario `LEFT`.
- **Fallo:** `pets.owner_user_id` apunta a quien salió, o la mascota queda sin propietario `ACTIVE`. Esto viola «una mascota nunca queda sin propietario» (`REQ-OWN12-006`).

**Mitigación para `/architect` (no es decisión de Neo):** `LEAVE`, promoción y supresión de cuenta toman `SELECT … FOR UPDATE` sobre `pets` (PG) o transacción `IMMEDIATE` (SQLite), revalidan principal y conjunto `ACTIVE` dentro de la transacción y usan `UPDATE … WHERE` con la condición esperada. Añadir un EDGE de concurrencia para esta carrera.

### R-03 · ALTA · Bypass de la disputa de chip: congelación caducada y supresión de cuenta liberan el chip

**Qué dice el texto:** `REQ-CHP12-004` dice que la congelación caduca a 30 días, que el caso sigue `UNDER_REVIEW` y que la congelación **no bloquea** la supresión de cuenta. `REQ-OWN12-006` (c) indica que, sin co-propietarios, la supresión sigue `REQ-PET-004`, que borra la mascota y libera el índice global. El texto **no** bloquea el alta ni la edición de un chip con disputa abierta.

**Escenarios reproducibles:**
- **Escenario A (inmediato):** el apropiador es el único propietario de P con chip X. La disputa de C está `UNDER_REVIEW`. El apropiador borra su cuenta (permitida). P se elimina y X queda libre. El apropiador (u otro) registra X en una cuenta nueva → `201`. La disputa sigue viva, sin efecto. Este es el mismo riesgo que `trinity R-05`, pero aquí rompe la disputa en un paso.
- **Escenario B (a 30 días):** la congelación caduca sin prórroga. El titular borra P o cambia el chip. X queda libre y se vuelve a registrar.

**Fallo:** la disputa de chip (`INV-CHP12-005`, «el expediente sobrevive») protege la evidencia, pero no protege el chip. El apropiador gana el chip sin pasar por `/admin`.

**Mitigación para `/architect`:** mientras exista una disputa `UNDER_REVIEW` sobre `chip_hmac`, el alta o la edición con ese chip devuelve **el mismo `409 ERR-CHP12-MICROCHIP-REGISTERED`** que a cualquier otro tercero (sin nuevo código que sea oráculo). La congelación por chip sobrevive a la caducidad de 30 días para este fin: caducar libera solo `DELETE_PET`, `TRANSFER` y `CHANGE`, no el registro del chip.

**Decisión de Neo requerida (Nivel 2):** la supresión de cuenta del **único** propietario de una mascota con disputa abierta. Opciones: (a) la mascota queda retenida con el chip reservado (`chip_hmac`) hasta resolución; (b) se libera el chip, con el riesgo del Escenario A. `/lock` recomienda (a). Esto cambia `REQ-OWN12-006` (c) y `REQ-PET-004`, por lo que no puede decidirlo `/architect` por su cuenta.

### R-04 · ALTA · Sucesión híbrida: designación opcional y criterio de orden no trazables en el acta en disco

**Lo que pide la misión (y dice el resumen de Morpheus):** Neo aprobó «LEAVE con designación opcional; si no, co-propietario `ACTIVE` más antiguo, `created_at ASC`, `user_id ASC`, con `PRINCIPAL_AUTO_PROMOTED`».

**Lo que hay en disco:**
- `claude/decisiones-neo-012-2026-11-26.md`, adenda `Neo-A`, dice solo: «el principal sale (`LEAVE`) sin aprobación si queda ≥ 1 co-propietario `ACTIVE`; el más antiguo pasa a principal en la misma transacción». **No contiene** «designación opcional», **no** contiene `created_at` y **no** contiene `PRINCIPAL_AUTO_PROMOTED`.
- `trinity-012-reauditoria` (R-03) propone la designación del principal como **recomendación no vinculante**.
- `spec.md` `REQ-OWN12-006` (b) usa `joined_at` (empate `user_id`), sin designación. `SC-012-071` usa `joined_at`. `data-model.md` no tiene `created_at` en `pet_co_owners`: tiene `invited_at` y `joined_at`. La auditoría se llama `CO_OWNER_PROMOTED`, no `PRINCIPAL_AUTO_PROMOTED`.

**Por qué es ALTA:** si Neo aprobó la designación, la spec no la contiene y `REQ-OWN12-006` queda incompleto. Si Neo aprobó `created_at`, el modelo de datos no tiene esa columna y la regla de sucesión queda sin campo. Si no aprobó ninguno de los dos, la adenda sigue siendo ambigua. No puedo verificar lo que Neo aprobó en Logos fuera del disco.

**Lo que se pide:**
1. **Neo confirma y registra en el acta** si la designación opcional existe y cuál es el criterio de orden (`joined_at` o `created_at`). Mi dictamen: `joined_at`, porque mide la antigüedad como co-propietario; `created_at` de la invitación premia a quien fue invitado antes aunque haya entrado después.
2. Si hay designación: el designado debe ser co-propietario `ACTIVE` distinto del que sale, validado en la transacción; prevalece sobre el orden por defecto.
3. Renombrar la auditoría a `CO_OWNER_PROMOTED` o aprobar el nombre `PRINCIPAL_AUTO_PROMOTED` en un solo lugar.

### R-05 · MEDIA · Disputas en serie y prórroga de congelación sin tope

`REQ-CHP12-004` dice «caduca a 30 días salvo prórroga con motivo auditado», sin límite de prórrogas. `Neo-E` dice «caduca a 30 días si /admin no la prorroga», sin prever prórrogas indefinidas. Tampoco hay cooldown tras un rechazo para `(solicitante, chip)`, a diferencia de los claims (`CHIP_CLAIM_COOLDOWN_DAYS`). Un griefer puede abrir una disputa, ser rechazado y abrir otra al instante, con 30 días de congelación cada vez. La cola de `/admin` se llena y el límite de «3 simultáneas» no lo impide.

**Mitigación:** tope de prórrogas (una, o total de 30 días) o escalado a control dual. Cooldown tras `REJECT` por `(solicitante, chip)` igual que los claims.

### R-06 · MEDIA · Índices de unicidad anclados a `pet_id` en lugar del chip

- `data-model.md`: `UNIQUE (pet_id, requester_user_id) WHERE CLAIM AND PENDING`. `REQ-CHP12-003` y `EDGE-012-040` dicen «una `PENDING` por `(chip, solicitante)`».
- Si la mascota se elimina, `pet_id` pasa a `NULL` (`SET NULL`) y el índice deja de deduplicar: el mismo solicitante puede tener varias `PENDING` sobre el mismo chip.
- El cooldown sí usa `chip_hmac`. Son dos anclas distintas para lo mismo.
- Los END (R-01) no tienen `chip_hmac`, así que no cuentan para el «1 por chip».

**Mitigación:** unificar en `chip_hmac` para claims, cooldown y disputas. Para END, usar `(pet_id, target_user_id)` (R-01).

### R-07 · MEDIA · Principal ausente: no hay vía formal

`END_CO_OWNERSHIP` solo apunta a co-propietarios. `REQUEST_CHANGE_PRINCIPAL` existe como desenlace de `CHIP_DISPUTE`, pero ningún texto dice quién lo inicia ni con qué disparador. Si el principal está ausente, los co-propietarios no pueden `DELETE`, `TRANSFER` ni `INVITE`, y el principal no puede ser retirado. La Válvula 1 deja que el principal salga, pero el sucesor puede ser el ausente (cadena de ausencias).

**Mitigación:** definir el disparador objetivo del principal ausente (mismo esquema que R-01) y el desenlace `REQUEST_CHANGE_PRINCIPAL`. Decisión de Neo si se quiere cubrir.

### R-08 · MEDIA · Despliegue rolling: instancias antiguas ignoran `ownership_version` y `owner_requests`

La migración añade `ownership_version`, `pet_co_owners` y `owner_requests`. Una instancia de la versión anterior sigue activa durante el despliegue. Las rutas de transferencia de 002 (`REQ-OWN-001`) siguen existiendo y no consultan `owner_requests` ni incrementan la versión. Puede cambiar `owner_user_id` sin aprobación conjunta y dejar `pet_co_owners` inconsistente. El texto solo trata duplicados de chip (retirado).

**Mitigación para `/architect`/`/link`:** desactivar las rutas de transferencia antiguas antes de aplicar la migración, o usar ventana de mantenimiento. Registrar el criterio en la tarea de despliegue.

### R-09 · MEDIA · Valores de límite no alineados con la reauditoría de `/trinity` y sin cifra global

- `spec.md` `REQ-CHP12-005` y `feature-012-limits.ts`: `MICROCHIP_LOOKUP_MAX_PER_IP_PER_DAY = 20` (valor «de trabajo de /trinity») y `MICROCHIP_LOOKUP_GLOBAL_MAX_PER_DAY` sin cifra.
- `trinity-012-reauditoria` fija **30** por IP (motivo: CGNAT) y **1000** global por día, y pide persistir el evento antes de resolver.
- La spec cita a `/trinity` como fuente, pero no incorpora su corrección. El oráculo 201/409 sigue existiendo (un usuario lo sondea con 5 intentos por día, 20 o 30 por IP, y el global sin cifra no lo acota).
- Neo respondió a N2-C con «contar todo intento» (oráculo del `429` eliminado). No aceptó explícitamente el oráculo 201/409 residual; hay que pedirlo.

**Mitigación:** alinear la spec con la cifra de `/trinity` (o con la decisión de Neo), fijar la cifra global y registrar la aceptación explícita del oráculo residual en el acta de Neo.

### R-10 · BAJA · Límite de escaneo QR en memoria por instancia

`REQ-QR12-007`: `QR_SCAN_MAX_PER_IP_PER_MINUTE = 30` con contador en memoria acotado por instancia. Con N instancias, el límite efectivo es N × 30 por minuto por IP. La spec lo reconoce (decisión frente a `trinity H-17`). Declarar el límite efectivo en el texto o usar la tabla `ip_rate_events` si `/trinity` lo exige.

### R-11 · BAJA · Cómo obtiene el solicitante su `claimId` si la respuesta de `POST` es uniforme

`REQ-CHP12-003` exige `202` con el mismo cuerpo para chips libres y ocupados, y que el solicitante consulte «por `claimId`». Si el cuerpo no incluye `claimId`, el solicitante no tiene forma de consultarlo. Solución: un listado de «mis solicitudes» que solo muestre filas reales. Escribirlo en el texto.

### R-12 · BAJA · Contradicción entre `EDGE-012-034` y `data-model.md` sobre las solicitudes de una mascota eliminada

`EDGE-012-034`: las `PENDING` de la mascota pasan a `CANCELLED`. `data-model.md`: «las filas no-disputa se borran explícitamente al eliminar la mascota». Elegir una. Recomiendo `CANCELLED`, porque conserva la auditoría.

### R-13 · BAJA · Naming del árbitro en `EDGE-012-043`

`EDGE-012-043` dice «`ADMIN` u `OPERATOR`». `ADMIN` es el rol de hogar; el árbitro es `SUPER_ADMIN` u `OPERATOR` (`D12-07`). Corregir el texto para no confundir los roles.

### R-14 · BAJA · «Ningún temporizador resuelve el caso» frente a la ventana de 72 h

`REQ-CHP12-009` dice «ningún temporizador resuelve el caso», pero `ARBITRATION_DELAY_HOURS = 72` ejecuta un desenlace diferido. Aclarar que el temporizador solo ejecuta una decisión ya registrada por humano, cancelable por el árbitro principal, y que una cancelación devuelve el caso a `UNDER_REVIEW`.

### R-15 · BAJA · Expiración perezosa y frontera de voto en `owner_requests`

`data-model.md` dice que la expiración de `pet_co_owners` se evalúa en lectura, pero no dice lo mismo de `owner_requests`. Definir: el voto que llega en `expires_at` exacto se rechaza, y la expiración se aplica en lectura y en escritura bajo el bloqueo de la mascota.

### R-16 · BAJA · Dictámenes pendientes que la spec reconoce

- `/maggie`: quién puede marcar `SKIPPED` y si `DONE` tardío es correcto (`REQ-CAR12-003`, `EDGE-012-048`).
- `/rama`: retención de evidencia y dictamen legal (`H-19`, `DEUDA-012-LEGAL-DISPUTAS-QR`).

No bloquean el texto, pero sí bloquean la aprobación. Registrarlos como criterio de cierre de Fase 0.

## 3. Coherencia de EDGE-012-023..050 con las resoluciones de Neo

| EDGE | Coherencia | Nota |
| --- | --- | --- |
| 023, 024, 025 | Coherente | Alineado con `Neo-D` y `REQ-QR12-010`. |
| 026, 027 | Coherente | Orden principal → `joined_at` → `user_id` (ver R-04). |
| 028 | Coherente | Contenido mínimo, `Neo-K`. |
| 029 | Retirado | Correcto tras `Neo-G+Q`. |
| 030, 031, 032, 033 | Coherente | Sin contradicción con las resoluciones. |
| 034 | Contradicción menor | R-12. |
| 035 | Coherente | |
| 036 | **Insuficiente** | Resuelto por `Neo-A` en el enunciado, pero sin precondición objetiva ni anclaje (R-01, R-07). |
| 037, 038 | Coherente | Congelación revalidada. Ver R-03 para la caducidad. |
| 039 | Coherente con `Neo-E` | Falta cooldown tras rechazo (R-05). |
| 040 | Contradicción menor | Índice anclado a `pet_id` (R-06). |
| 041, 042 | Coherente | |
| 043 | Naming | R-13. |
| 044 | Coherente | |
| 045 | Retirado | |
| 046 | Coherente | |
| 047 | Coherente | Tras `Neo-P` P-10. |
| 048 | Pendiente de dictamen | R-16. |
| 049, 050 | Coherente | `Neo-B`, `Neo-F+L`. |

Los EDGE 001..022 modificados (004, 005, 007, 008, 010, 013, 018, 020) son coherentes con el texto nuevo. EDGE-012-008 cubre la congelación por chip correctamente, pero no la supresión de cuenta (R-03).

## 4. Decisiones que se elevan a Neo (Nivel 2)

**TO: Neo (Andrés Vallejo — Level 2)**

- **N2-R1 (R-01):** ¿se aprueba el disparador objetivo de `END_CO_OWNERSHIP` (2 solicitudes expiradas por TTL en 60 días, sin ningún rechazo del target), la exclusión del principal como target y la congelación por `pet_id`? Y ¿se aplica la misma vía a un principal ausente (R-07)?
- **N2-R2 (R-03):** supresión de cuenta del único propietario con disputa abierta: ¿mascota retenida con chip reservado (recomendado) o liberación?
- **N2-R3 (R-04):** confirmar en el acta si la sucesión tiene designación opcional, si el criterio es `joined_at` (recomendado) o `created_at`, y el nombre de la auditoría.
- **N2-R4 (R-09):** cifras del límite de chip (`trinity`: 30 por IP, 1000 global) y aceptación explícita del oráculo 201/409 residual.
- **N2-R5 (R-05):** tope de prórrogas de congelación y cooldown tras rechazo.

Ninguna de estas decisiones se ha tomado en esta acta. Ningún estado normativo ha cambiado.

## 5. Recomendación de secuencia

1. Neo responde N2-R1 a N2-R5 y registra sus respuestas en `claude/decisiones-neo-012-2026-11-26.md` (adenda).
2. `/architect` aplica sobre `DRAFT`: R-01 (anclaje y precondición), R-02 (bloqueo de sucesión), R-03 (chip reservado, texto de congelación), R-04, R-05, R-06, R-07, R-08, R-09, R-11 a R-15. No toca `APPROVED`/`LOCKED`.
3. `/trinity` revisa R-02, R-03 y R-09 (concurrencia, chip y cifras). `/rama` revisa R-03 (supresión de cuenta y retención) y R-16. `/maggie` revisa R-16.
4. **No hay más ciclos automáticos de `/lock`** (`MAX_RETRY = 1` consumido). Si tras el paso 2 quedan ALTA abiertas, la decisión es de Neo o de `/morpheus`, no de otra ronda de `/lock`.
5. Sin cambios en `tasks.md`: sin `[x]`, sin `APPROVED`/`LOCKED`.

## 6. Límites de esta auditoría

- No se revisó `src/`. Las afirmaciones sobre bloqueo de transacciones (R-02) y sobre `ON DELETE` (R-03, `pets` → `chip_claims`) son lectura del texto, no del código.
- Los valores numéricos propuestos en R-01 (2 solicitudes, 60 días) son propuesta de `/lock` para que Neo los confirme. No son decisiones tomadas.
- La sucesión con designación y `created_at` (R-04) se evalúa contra la adenda en disco. Si Neo lo aprobó fuera del disco, debe registrarse antes de que `/architect` lo redacte.
