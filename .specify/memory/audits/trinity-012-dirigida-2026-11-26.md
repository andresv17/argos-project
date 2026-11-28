# Acta de revisión dirigida de Trinity — Fase 0, Feature 012 (pase N2-R)

**Fecha:** 2026-11-26 · **Rol:** `/trinity` (subagente de `/morpheus`) · **Rama:** `012-multiduenio-microchip-cuidador`
**Modo:** solo lectura sobre `specs/012`; sin `[x]`, `APPROVED`, `LOCKED`, commit ni push. Insumos: adenda `claude/decisiones-neo-012-2026-11-26.md` (N2-R y sección I), acta previa `trinity-012-reauditoria-2026-11-26.md`, `spec.md` (REQ-OWN12-006/008/009/011, REQ-CHP12-003/004/005/009, SC-012-091..100, EDGE-012-051..058, NFR-012-008), `data-model.md`, `tasks.md` (T1627, T1640, T1642, T1646, T1647).

## Veredictos
| Residual | Veredicto | Motivo breve |
| --- | --- | --- |
| R-02 sucesión/LEAVE/supresión | CERRADO CON RESERVA | Bloqueo por mascota correcto; faltan 3 transiciones fuera de la lista y cota de reevaluación (C-1) |
| R-03 bypass de chip en disputa | ABIERTO (texto) | La importación de respaldo y otras rutas de escritura no consultan la reserva; apertura de disputa sin precondiciones (C-2) |
| R-09 límites de chip | ABIERTO (texto) | Un solo usuario puede agotar el contador global; atomicidad; la importación no cuenta (C-3) |
| Supresión con disputa abierta | CERRADO CON RESERVA | Reserva derivada es a prueba de carrera; depende de C-1 y C-2; carrera de reserva al liberarse |
| `PRINCIPAL_ABSENT` | ABIERTO (texto) | Ventana móvil de 60 días anula el caso por el paso del tiempo; disparador fabricable; respuestas no uniformes (C-4) |
| Designación inválida (I.4) | CERRADO CON RESERVA | Sin oráculo si la respuesta es idéntica; faltan precisiones (C-5) |

## R-02 — carrera de sucesión, LEAVE y supresión
Cerrado: bloqueo `FOR UPDATE` / `BEGIN IMMEDIATE` por mascota, revalidación y `UPDATE … WHERE` condicional, orden `pet_id ASC`, equivalencia a orden serial (`SC-012-095`), salida nunca rechazada por la carrera. `EDGE-012-051/052` cubren principal vs único co-propietario y supresión vs aprobación.
Reservas:
- (a) La lista de `REQ-OWN12-011` omite la **apertura de una disputa por ausencia** (evalúa disparador, ancla y congelación; sin bloqueo, el `target` puede salir entre la evaluación y la inserción) y la **ejecución de `ADD_CO_OWNER(claimant)`** (inserta fila y revalida el tope).
- (b) «Reevalúa desde cero» no tiene cota: si el `UPDATE … WHERE` afectara 0 filas bajo bloqueo es un defecto de invariante, no una carrera, y un bucle infinito es una vía de DoS.
- (c) `SC-012-095` solo cubre tres combinaciones. Faltan: aceptación de invitación vs supresión del principal, `END_CO_OWNERSHIP` vs `LEAVE` del `target`, designación vs `LEAVE` del designado, y supresión simultánea de principal y co-propietario (resultado: último propietario, `REQ-PET-004`, reserva si hay disputa).
- (d) Una supresión de cuenta que bloquea N mascotas no debe quedar esperando sin límite: falta `lock_timeout` con error reintentable.

## R-03 — bypass de la reserva del chip
Cerrado: reserva derivada de `owner_requests` (sin tabla nueva) que sobrevive a `frozen_until` y a la eliminación de la mascota; mismo `409`; no hay carrera con la supresión porque la reserva no depende de decidir nada al borrar. Hallazgos:
- **B-1 (bypass real).** `INV-CHP12-009` y `T1646` cubren «alta y edición». La **importación de respaldo** (`REQ-OWN12-008` (b), `EDGE-012-044`) falla solo si el chip «ya existe en el sistema»; con la mascota borrada (`PET_GONE`) el chip no existe en `pets` y la importación lo registra sin consultar la reserva. Lo mismo vale para cualquier ruta que escriba `pets.microchip_id` (restauración, herramientas de `/admin`, semillas).
- **B-2 (cortocircuito).** Si la consulta de reserva solo corre cuando `pets` no devuelve fila, el camino «reservado sin mascota» hace una consulta más que «ocupado»; `SC-012-097` pide llamadas idénticas pero no dice que ambas consultas corren siempre.
- **B-3 (apertura sin precondiciones).** `REQ-CHP12-004` no dice quién puede abrir `CHIP_APPROPRIATION` ni qué pasa con un chip sin mascota. Dos abusos: (i) reservar a voluntad cualquier número de 15 dígitos que no existe aún (acaparamiento; la reserva dura hasta `RESOLVED` y el SLA no la acota); (ii) un propietario o co-propietario abre la disputa sobre su propia mascota para congelar `DELETE_PET`, `TRANSFER_PRINCIPAL`, `CHANGE_PRINCIPAL` e `INVITE_CO_OWNER` hasta 60 días. Además, el `POST` de apertura es un segundo oráculo de existencia de chip si distingue «existe» de «no existe».
- **B-4 (reserva).** Al liberarse la reserva (`REJECT`, `PET_GONE`) gana el primero que registre el chip; un titular fraudulento con otra cuenta puede adelantarse al reclamante. Es la decisión abierta de I.3; no la cierro, la elevo (ver «Para Neo»).
- **B-5 (informativo).** Tras caducar la congelación el dueño puede cambiar el chip de su mascota: el chip viejo sigue reservado (no hay bypass de registro), pero la disputa pierde su objeto; debe quedar auditado y visible en el expediente.
- Menor: validar `^[0-9]{15}$` explícito (no `\d`) para evitar variantes de dígitos en motores con `\d` Unicode.

## R-09 — límites de chip
Cerrado: cifras 10/30/1000 con alerta al 70 %, conteo antes de resolver, fuera de la transacción de negocio, falla cerrada con el mismo `429`, IPv6 a /64, clave HMAC de dominio propio. Oráculo `201`/`409` aceptado explícitamente por Neo (N2-R4): se respeta. Hallazgos:
- **L-1 (MEDIA-ALTA).** El texto cuenta «todo intento» y el evento global se persiste «antes de resolver». Si cada petición, incluso las que ya superaron el tope del usuario o de la IP, incrementa el contador global, **una sola cuenta con 1000 peticiones agota el global y niega el alta con chip a todos**. Solo deben incrementar los contadores amplios los intentos admitidos por los estrechos (usuario, luego IP, luego global); lo mismo para la IP compartida en CGNAT.
- **L-2 (MEDIA).** «Comprobar y registrar» en dos pasos permite ráfagas en paralelo que superen el tope (50 peticiones leen 9 y todas insertan). Debe ser atómico (inserción condicionada al conteo o bloqueo por sujeto) y `SC-012-100` debe incluir una ráfaga paralela.
- **L-3 (MEDIA).** La importación de respaldo con chips es un sondeo por lotes: un archivo con N chips falla si alguno existe (prueba de grupo, un solo intento para N números) y no cuenta en `REQ-CHP12-005`. Cada chip importado debe contar como intento, con tope de mascotas por importación y respuesta uniforme.
- **L-4 (BAJA).** «Por día» vs ventana de 24 h: el texto usa ambas. Fijar ventana móvil de 24 h; un día calendario permite doble ráfaga en el cambio de día.
- **L-5 (BAJA).** El canal de la «alerta operativa» no está definido y debe emitirse una vez al cruzar el umbral, sin datos personales.
- Aclaración: los `POST` de reclamación ya cuentan en el mismo contador (`REQ-CHP12-003`); el de disputa debe hacerlo igual (B-3).

## Supresión de cuenta con disputa abierta
Correcto: la supresión procede, los datos personales se borran o seudonimizan, el expediente y la evidencia se conservan (`rama`), y la reserva no depende de ninguna decisión tomada al borrar (carrera inexistente con la apertura de la disputa). `ERR-ACCOUNT-OWNS-SHARED-PETS` solo sin sucesor. Reservas: la resolución `ADD_CO_OWNER(claimant)` debe tomar el bloqueo por mascota y degradar a `PET_GONE` si la mascota ya no existe (C-1); la importación puede saltarse la reserva (B-1); la carrera de registro al liberarse (B-4). La supresión del **reclamante** cierra el caso como `REQUESTER_NOT_ACTIVE` y libera la reserva: es correcto, pero hay que registrarlo en el aviso de «Para Neo» porque habilita a un titular fraudulento que consigue que el reclamante suprima su cuenta.

## `PRINCIPAL_ABSENT` (sección I.1) — perspectiva AppSec
Bien: desenlace único `REQUEST_CHANGE_PRINCIPAL` (nadie pierde la co-propiedad, el principal conserva `LEAVE`), control dual o 72 h, árbitro ajeno, congelación acotada. Hallazgos:
- **P-1 (MEDIA, funcional y de seguridad).** `REQ-OWN12-009` define el disparador como solicitudes «creadas en los últimos 60 días» y lo **revalida al ejecutar**. Con congelación de 30 a 60 días más 72 h, el paso del tiempo saca las solicitudes de la ventana y el caso termina `TRIGGER_LOST`: el `target` evade esperando. El disparador debe **sellarse al abrir** (ids de las solicitudes que lo cumplen) y la revalidación comprobar solo que siguen `EXPIRED` sin voto del `target` (son inmutables).
- **P-2 (MEDIA, abuso).** El disparador es «objetivo» pero lo puede fabricar el solicitante: crea dos solicitudes críticas de acciones distintas (hasta cuatro pueden vivir a la vez), el principal no entra en 7 días y se cumple. Con un co-propietario hostil, el peor caso es convertirse en principal (exportación de respaldo, control de acciones críticas) con el principal original degradado y aún con derecho a salir. No se reabre `N2-R1` (definitiva), pero el árbitro debe ver hechos objetivos: quién creó cada solicitud, fechas, y si el `target` tuvo sesión o actividad desde su creación (`target_last_active_at`); y se eleva a Neo la opción de exigir además ausencia de actividad (ver «Para Neo»).
- **P-3 (BAJA, IDOR y enumeración).** `ERR-CHP12-ABSENCE-NOT-ELIGIBLE` y la violación del UNIQUE de ancla se emiten a quien envíe cualquier `pet_id`/`target_user_id`: para un solicitante que no es co-propietario `ACTIVE` de esa mascota debe ser el mismo `404` uniforme que cualquier mascota ajena o inexistente; el error de elegibilidad y el de «ya hay una disputa abierta» solo a miembros `ACTIVE`, con cuerpos que no revelen quién la abrió ni cuántas solicitudes votó el `target`.
- **P-4 (BAJA).** `target_response` (≤ 280, texto libre) se muestra en la cola de `/admin`: escapado de salida, sin marcado, longitud contada en puntos de código, inmutable tras la primera escritura (una sola respuesta, `UPDATE … WHERE target_response IS NULL`).
- **P-5 (informativo).** La congelación por `pet_id` durante una disputa por ausencia bloquea `DELETE_PET` del principal hasta 60 días: ligar con `rama` si afecta el derecho de supresión.

## Designación inválida en `LEAVE` (sección I.4)
Aceptable desde AppSec: caer a la herencia determinista evita que una salida se bloquee y no crea oráculo mientras la respuesta no distinga las causas (usuario inexistente, no es co-propietario de **esa** mascota, es quien sale, ya salió). Reservas: validar contra las filas `ACTIVE` de esa mascota (no contra «cualquier usuario»); el campo `successorUserId` no se acepta en la supresión de cuenta ni de quien no es principal; la respuesta devuelve siempre el principal resultante (ya visible entre co-propietarios) y nunca el motivo del descarte; una designación ignorada no se audita como `PRINCIPAL_SUCCESSOR_DESIGNATED` (el motivo queda solo en auditoría interna). Alternativa para Neo: responder `ERR-OWN12-STALE` sin salir si la designación caducó por carrera; no la recomiendo porque choca con `INV-OWN12-003`.

## Cambios de texto para `/architect` (no aplicados; solo lectura)
**C-1 `REQ-OWN12-011`, `NFR-012-008`, `SC-012-095`, `EDGE-012-051/052`:**
1. Añadir a la lista de transiciones bajo bloqueo: «la apertura de una disputa por ausencia (evaluación del disparador, ancla y congelación), la ejecución de `ADD_CO_OWNER(claimant)` y la de cualquier solicitud aprobada».
2. Añadir: «Si el `UPDATE … WHERE` afecta 0 filas bajo el bloqueo, se reevalúa una sola vez; si vuelve a ocurrir, rollback y error reintentable genérico, sin escritura parcial. La toma del bloqueo usa `lock_timeout` y devuelve el mismo error reintentable».
3. `SC-012-095`: añadir las combinaciones (aceptación vs supresión del principal; `END_CO_OWNERSHIP` vs `LEAVE` del `target`; designación vs `LEAVE` del designado; supresión simultánea de principal y co-propietario) y la expectativa «mismo resultado que algún orden serial».
**C-2 `REQ-CHP12-004`, `INV-CHP12-009`, `REQ-OWN12-008` (b), `EDGE-012-044`, `EDGE-012-053/054`, `SC-012-097`, `T1646`:**
1. «Toda ruta que escriba `pets.microchip_id` (alta, edición, importación de respaldo, restauración, herramientas de `/admin`) pasa por el mismo comprobador de unicidad y reserva; la importación consulta la reserva y falla con el mismo `409 ERR-CHP12-MICROCHIP-REGISTERED`».
2. «La consulta de reserva se ejecuta siempre, para todo chip, además de la de `pets`, sin cortocircuito; `SC-012-097` lo verifica con espías (misma secuencia de llamadas para libre, ocupado, reservado con mascota y reservado sin mascota)».
3. Apertura de `CHIP_APPROPRIATION`: «el solicitante no puede ser propietario principal ni co-propietario `INVITED`/`ACTIVE` de una mascota con ese chip; para un chip sin mascota registrada y sin reserva, o ante cualquier precondición fallida, responde `202` con el mismo cuerpo y **sin crear fila** (como `REQ-CHP12-003`); cuenta en los contadores de `REQ-CHP12-005`». Añadir `SC` correspondiente (y `EDGE`) para disputa sobre chip inexistente y sobre mascota propia.
4. «Cambiar el chip de una mascota con disputa `UNDER_REVIEW` (tras caducar la congelación) queda auditado y visible para el árbitro; el chip anterior sigue reservado».
5. `REQ-CHP12-004`: sustituir `[0-9]{15}` explícito donde se cite `^\d{15}$`.
**C-3 `REQ-CHP12-005`, `SC-012-100`, `T1640`, `data-model` (`ip_rate_events`):**
1. «Los contadores se evalúan en orden usuario → IP → global; solo los intentos admitidos por el contador más estrecho incrementan el siguiente. Un intento que ya recibe `429` por usuario o IP **no** incrementa el global».
2. «Comprobar y registrar es una operación atómica (inserción condicionada al conteo, o bloqueo por sujeto); `SC-012-100` incluye una ráfaga paralela que no supera el tope».
3. «La importación de respaldo cuenta **cada chip importado** como un intento en los tres contadores, tiene un tope de mascotas por importación y responde de forma uniforme (`409`/`429` sin indicar qué chip chocó)».
4. «Ventana móvil de 24 h en los tres contadores (no día calendario)»; «la alerta del 70 % se emite una sola vez por cruce, a un canal operativo definido (`T1640`), sin datos personales».
**C-4 `REQ-OWN12-009`, `T1627`, `SC-012-091..093`, `EDGE-012-056/057`, `data-model` (`owner_requests`):**
1. «El disparador se **sella al abrir** (ids de las solicitudes que lo cumplen, en la fila); la revalidación al ejecutar comprueba el sujeto, el solicitante `ACTIVE` y que esas solicitudes siguen `EXPIRED` sin voto ni rechazo del `target`; el paso del tiempo no cuenta como `TRIGGER_LOST`».
2. «El expediente que ve el árbitro incluye, por cada solicitud del disparador, creador, fecha de creación y expiración, y `target_last_active_at` (última sesión o actividad del `target`)». Añadir `SC` que verifique estos campos.
3. «Para un solicitante que no sea co-propietario `ACTIVE` de la mascota, cualquier `pet_id`/`target_user_id` devuelve el mismo `404` uniforme; `ERR-CHP12-ABSENCE-NOT-ELIGIBLE` y el error de ancla ya abierta solo se devuelven a miembros `ACTIVE`, sin identificar a quien abrió ni el detalle de votos».
4. «`target_response`: escapado de salida, sin marcado, longitud en puntos de código, escritura única (`UPDATE … WHERE target_response IS NULL`)».
**C-5 `REQ-OWN12-006`, `EDGE-012-058`, `SC-012-094`:** «`successorUserId` se valida contra las filas `ACTIVE` de esa mascota y se ignora si es quien sale; no se acepta en la supresión de cuenta ni de quien no es principal; la respuesta de `LEAVE` devuelve el principal resultante y nunca el motivo de un descarte; una designación ignorada no genera `PRINCIPAL_SUCCESSOR_DESIGNATED` (motivo solo en auditoría interna). Prueba: designación de inexistente, de no miembro, de sí mismo y de caducada producen respuesta idéntica».

## Para Neo (Nivel 2, vía `/morpheus`; no son cambios de texto de `/architect`)
1. **I.3 abierta, recomendación:** no dar preferencia automática al reclamante; al liberarse la reserva por `REJECT` o `PET_GONE`, evaluar una ventana corta (p. ej. 72 h) en la que solo el reclamante pueda registrar el chip, para impedir que un titular fraudulento se adelante con otra cuenta. Requiere decisión.
2. **P-2:** opción de endurecer `N2-R1` exigiendo, además de las dos solicitudes expiradas, que el `target` no haya tenido sesión desde la primera de ellas. No se aplica sin su firma; mientras tanto el árbitro lo ve en el expediente (C-4.2).
3. **Principal ausente (I.1):** mantengo la variante (rotación del ancla, nadie pierde la co-propiedad) siempre que C-4 se aplique; sin C-4.1 la variante es evadible.

## Reglas respetadas
Solo lectura sobre `specs/012`; sin `[x]`, `APPROVED`, `LOCKED`, commit ni push; sin tocar contratos, `src/` ni `terraform/`.
