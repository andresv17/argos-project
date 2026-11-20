# Lock 006: revisión adversarial del diseño de la escena del hogar

**Fecha**: 2026-11-18. **Autor**: /lock (solo lectura; sin ediciones de specs, src ni tests; sin commit ni push; nada marcado APPROVED/LOCKED).
**Objeto**: `specs/006-escena-hogar-pixel-art/{spec,plan,data-model,research}.md` y `contracts/state-machines/home-scene.machine.json` (todos DRAFT).
**Método**: lectura de disco y razonamiento sobre interleavings. Nada se ejecutó. Lo que exige red, proveedor real o pruebas está marcado **[NO VERIFICABLE]**.
**Cobertura**: COBERTA = el spec la cierra con EDGE/SC; PARCIAL = existe regla pero con hueco; BRECHA = no cubierta.
**Severidades**: ALTA (privacidad, pérdida de datos, sobrecosto sistemático o fallo determinista), MEDIA, BAJA.

## Veredicto
El núcleo (CAS de arrendamiento, T2 atómico, cuota solo en publicación, entrega duplicada tardía) está bien razonado. Lo frágil es lo que ocurre **entre** T1 y T2: el diseño trata a T2 como compuerta de integridad pero no como compuerta de **privacidad ni de costo**. Hay cuatro supuestos falsos: (1) el lease nace al encolar, no al arrancar el worker; (2) una entrega duplicada concurrente de la misma tarea es indistinguible de la primera; (3) T2 solo mira intento, lease, cuota y huella, no consentimiento ni purgas D6-17; (4) el modelo devuelve PNG/WebP.

## Hallazgos ALTOS

### H-LCK-006-01 (ALTA, BRECHA): T2 publica una imagen que contiene datos de quien retiró el consentimiento o de una mascota desasignada
- Entrada: el worker ya leyó las fotos y llamó al proveedor (t=40 s de 90). El miembro B retira consentimiento (REQ-ESC6-025) o es expulsado (REQ-ESC6-030), o su mascota se elimina. La transacción de B purga solo `scene_images` **vigente** y `scene_image_sources` **de la imagen vigente**; la imagen en vuelo aún no existe en tablas.
- Resultado incorrecto: T2 (data-model §7) comprueba solo intento vigente, lease, restante >= 1. Publica la imagen con la mascota/foto de B, la escena queda `outdated` (REQ-ESC6-014) y **todos los miembros la ven**. Viola D6-17, REQ-ESC6-025 (purga inmediata) y EDGE-ESC6-021 ("no se publica").
- Estado en el spec: EDGE-ESC6-021 lo promete, pero ni §7 ni la máquina lo implementan. EDGE-ESC6-005 es además contradictorio: "no se publica" vs "queda outdated". `scene_attempts.outcome = CANCELLED` existe y nadie lo emite. La máquina no tiene transición `generating -> ...` por revocación o desasignación.
- Mitigación determinista: T2 debe recalcular, bajo candado, el **conjunto de dueños de datos** del snapshot y exigir consentimiento vigente y asignación vigente de cada uno; si falta alguno, `outcome = CANCELLED`, no publicar, fila INTENT a DELETE. La revocación/desasignación debe además marcar el intento `CANCELLED` (cierra la ventana aunque T2 falle por otra razón). Test: revocar entre `generate()` y T2 con `FakeSceneImageGenerator` lento.

### H-LCK-006-02 (ALTA, BRECHA): la clave del objeto resultante no se persiste: INTENT no puede ser pre-asignado por T1
- Entrada: plan §1.2 dice que `requestSceneGeneration` (T1) "inserta INTENT del objeto resultante"; data-model §6 dice "T1 antes del `put`" y 004 REQ-GCS-006 genera la clave y hace INTENT justo antes del `put`. `scene_attempts` no tiene columna `image_id`/`object_key`.
- Resultado incorrecto: o el worker genera otro UUID (la fila INTENT de T1 apunta a una clave que nunca existe y la real no tiene INTENT: INV-GCS-002 roto si el worker muere entre `put` y T2), o la clave viaja en la tarea (rompe "solo sceneId y attemptId"). Además, si INTENT lo inserta el worker, el borrado de hogar/cuenta con generación en vuelo (EDGE-ESC6-021) no tiene fila que convertir a DELETE.
- Mitigación: una sola vía. Columna `scene_attempts.result_object_id` fijada en T1 (misma transacción que INTENT) y que el worker lea. Aclarar quién convierte INTENT en DELETE si el worker muere (hoy lo hace el worker que ya no existe; en la práctica solo el vencimiento de lease o la conciliación).

### H-LCK-006-03 (ALTA, BRECHA): el lease nace en T1; con la cola ocupada vence antes de que el worker arranque o a mitad de la llamada
- Entrada: `max_concurrent_dispatches = 2`, `max_dispatches_per_second` bajo, instancias frías, cada generación puede durar hasta 120 s. Tres hogares piden a la vez. Tarea 3 espera 120 s en cola; el lease (150 s) empezó en T1.
- Resultado incorrecto: la tarea llega con 30 s de lease; el worker arranca, llama al proveedor (cobra), T2 ve lease vencido y rechaza. Escena `failed`, **proveedor cobrado, sin imagen ni cuota**. Con 5 hogares simultáneos es sistemático.
- Más: T_GEN (90 s) solo acota `generate()`; leer referencias, normalizar, `put` y T2 no tienen tope, y Cloud Run corta a 120 s. El rango `GEN_TIMEOUT` 10-120 s con `timeout` de Cloud Run fijo en 120 s permite T_GEN=120 + put > timeout.
- Cubierto: EDGE-ESC6-003 (proceso caído) sí; la cola saturada, no.
- Mitigación: el lease debe iniciar en un **claim del worker** (CAS `claimed_at`, `lease_expires_at = claimed + T_LEASE`) con un tope separado de "espera en cola" (p. ej. 600 s), o heartbeat. Validar al arranque `Cloud Run timeout >= T_GEN + margen` y `T_LEASE > timeout`.

### H-LCK-006-04 (ALTA, BRECHA): entrega duplicada concurrente de la misma tarea llama dos veces al proveedor
- Entrada: Cloud Tasks entrega «al menos una vez» (EDGE-ESC6-024). Dos entregas del mismo `attemptId` coinciden (reintento por 5xx de red del lado de la cola, dispatchDeadline 180 s > timeout 120 s). Ambas ven intento vigente y lease vigente.
- Resultado incorrecto: EDGE-ESC6-024 solo cubre intento terminado o "lease ajeno"; aquí el lease es el mismo. No existe un claim por entrega, así que ambas llaman a Vertex (doble costo). T2 de la segunda será rechazado (la cuota no se duplica: eso sí está bien), pero se pagó dos veces y se subieron dos objetos.
- Mitigación: CAS `UPDATE scene_attempts SET claimed_at = :now WHERE id = :a AND claimed_at IS NULL`; la segunda entrega responde 2xx sin llamar. Test con dos `POST` concurrentes al worker.

### H-LCK-006-05 (ALTA, PARCIAL): imagen de la IA en JPEG o con formato no admitido: fallo determinista y reintentos ilimitados
- Entrada: el modelo real devuelve JPEG (research §2 lo marca `[verificar]`, plan R-06-D). El contrato y `scene_images.mime CHECK` solo admiten PNG/WebP; research sugiere "aceptar JPEG también" (contradice el CHECK y el puerto).
- Resultado incorrecto: 100 % de generaciones `failed` con `ERR-SCENE-INVALID-IMAGE`. Como los fallos **no consumen cuota** (REQ-ESC6-011/013), el usuario puede reintentar sin límite; cada reintento puede facturarse en el proveedor. Mismo patrón con un filtro de seguridad que bloquea una foto concreta: fallo determinista, sin límite de intentos fallidos.
- Cubierto: EDGE-ESC6-004 define que es fallo. **No cubierto**: (a) quién valida la salida (no hay puerto; "valida la salida" sin módulo; el mime declarado por el proveedor no es de fiar: validar por firma/`IHDR`/`RIFF`), (b) dimensiones y "más de un cuadro" (APNG/WebP animado) exigen parsear cabeceras, sin códec solo se logra con parser propio, (c) tope de intentos fallidos o enfriamiento.
- Mitigación: decidir el formato antes de activar el driver real; validador de salida por firma y cabecera en `infrastructure`; contador de fallos consecutivos con enfriamiento (p. ej. 3 fallos seguidos con la misma huella = bloqueo de 1 h, sin tocar cuota). **[NO VERIFICABLE]** qué devuelve realmente Vertex y si bloquea con cobro.

### H-LCK-006-06 (ALTA, BRECHA): foto de referencia reemplazada o purgada durante la generación degrada la imagen y la publica como vigente (`ready`)
- Entrada: el snapshot fija `avatar objectId = X`. Mientras corre el worker, el propietario sube otro avatar; 004 encola X para borrado inmediato (`media_deletion_queue DELETE`). El worker lee X: ya no existe.
- Resultado incorrecto: EDGE-ESC6-009 manda tratarla "sin foto". La imagen sale sin la mascota fiel, pero `fingerprint` del intento (con X) vs huella actual (con Y) difieren, así que queda `outdated`: bien. Caso peor: la foto falta por una purga **sin** cambio de huella (almacenamiento transitorio, objeto no encontrado por eventual consistency o error 404 espurio). T2 publica `ready` con `inputs_snapshot` que dice que había foto y la imagen no la usó; nunca se ofrece regenerar. Además, el modo (`INCREMENTAL_*`) se decidió en T1; si falta la escena previa, el prompt dice "Use IMG_1 as exact base scene" y IMG_1 ya es otra cosa: cambiar el modo en el worker contradice "el worker arma desde el snapshot".
- Mitigación: si el worker degrada una referencia, el intento registra `degraded = true`/lista de refs faltantes y T2 deja la escena `outdated` (o `failed` sin cuota); nunca `ready`. Distinguir 404 real de error transitorio (reintentar lectura una vez).

## Hallazgos MEDIOS

### H-LCK-006-07 (MEDIA, BRECHA): cuota agotada o rotación entre T1 y T2 cuesta una llamada paga sin imagen
- Entrada: T1 con restante 1; antes de T2 baja `ARGOS_SCENE_QUOTA_MAX` por despliegue, o T2 cae en otra ventana. T2 exige "restante >= 1" y rechaza si el valor cambió.
- Resultado: llamada cobrada y descartada. Con un solo intento por escena (INV-003) la cuota no puede agotarse por otra vía, así que el caso real es el cambio de configuración. Tratar el rechazo por cuota en T2 como éxito del proveedor perdido y registrarlo.
- Cubierto: no. Mitigación: decidir si T2 debe publicar de todos modos con la cuota reservada en T1 (reserva = más simple y no pierde el trabajo). **[NO VERIFICABLE]** coste real.

### H-LCK-006-08 (MEDIA, PARCIAL): frontera mensual: ventana de T1 vs T2 y zona horaria
- Entrada: T1 el 30-nov 23:59:50 (restante 1), T2 el 1-dic 00:00:25. `windowOf(now)` en T2 es dic: la generación cuenta como 1 de diciembre, restante vuelve a 9. Efecto: 11 imágenes de uso "en la misma semana" y el mes de noviembre no consumió la última.
- Otros: miembros del hogar en otra zona ven el restablecimiento a una hora local inesperada (REQ-ESC6-011 fija `APP_TIMEZONE`); cambiar `APP_TIMEZONE` en caliente deja `quota_window` en otra regla; `windowOf` en `domain/` sin `Date`/`Intl` debe implementarse con tablas de zona, **[NO VERIFICABLE]** cómo sin `Intl` (INV-ARCH-001).
- Cubierto: SC-ESC6-057 prueba el reinicio con reloj fijo pero no T1/T2 a ambos lados de la frontera. Mitigación: cuota imputada a la ventana de T1 (guardarla en el intento) y mostrar la fecha de reinicio en la UI.

### H-LCK-006-09 (MEDIA, BRECHA): el fallo de `enqueue` ambiguo marca `failed` mientras la tarea sí existe
- Entrada: `enqueue` agota el tiempo en el cliente pero Cloud Tasks creó la tarea (el nombre es `attemptId`). Plan §1.2 manda intento `FAILED` y escena `failed`.
- Resultado: el worker de esa tarea llega, ve intento `FAILED` y responde 204 (bien), **o** llega antes del `UPDATE` de fallo y llama al proveedor (cobro) y T2 se rechaza. Además, un segundo `enqueue` de reintento con el mismo nombre recibe `ALREADY_EXISTS` (409) y hoy sería otro "fallo".
- Mitigación: tratar `ALREADY_EXISTS` como éxito; no marcar `failed` por error ambiguo, dejar vencer el lease.

### H-LCK-006-10 (MEDIA, BRECHA): `Idempotency-Key` sin alcance ni vigencia
- Entrada: el cliente reutiliza la clave en «Reintentar» tras un `failed` (la UI genera la clave al montar la vista). Índice único `(scene_id, idempotency_key_hash)`.
- Resultado: el reintento devuelve el resultado viejo (el fallo) y nunca arranca otra generación; o 500 por violación de unicidad. REQ-ESC6-012 solo dice "mismo resultado".
- Mitigación: la clave identifica **una acción**; la respuesta repetida solo vale si el intento sigue vigente; una clave consumida con intento terminal debe responder 409/200 con el estado vigente y no bloquear un intento nuevo con clave nueva. Documentar que la UI genera clave nueva por clic.

### H-LCK-006-11 (MEDIA, BRECHA): worker zombi pasa el vencimiento del lease y sube un objeto después de que el INTENT pasó a DELETE
- Entrada: la solicitud de Cloud Run se corta a 120 s (504) pero el handler de Node no se cancela hasta que se recicla la instancia; a los 150 s la lectura marca `failed` y convierte INTENT a DELETE; a los 160 s el zombi hace `put`.
- Resultado: objeto huérfano de hasta 24 h (lo recoge la conciliación) con datos de usuarios y posiblemente retirados. T2 no corrompe (rechaza por `current_attempt_id`).
- Mitigación: el worker comprueba el `AbortSignal` de la solicitud antes del `put` y vuelve a verificar el lease; la conciliación debe barrer `scenes/` con edad > 15 min (no 24 h) para objetos sin fila. **[NO VERIFICABLE]** el comportamiento de Cloud Run al expirar.

### H-LCK-006-12 (MEDIA, BRECHA): reinicio de cuota por borrar y recrear el hogar
- Entrada: cuota por fila `home_scenes`; `ON DELETE CASCADE` al borrar el hogar; "hogares posteriores nacen sin escena" y la fila perezosa nace con `consumed = 0`. Un usuario crea hogar, consume 10, borra el hogar, crea otro y repite.
- Resultado: la cuota mensual no acota el gasto (H-ARCH-006-02 ya lo reconoce para el total, pero no este vector concreto). Idem con N cuentas y la escena sin hogar.
- Mitigación: cuota por **propietario** (o contador por `owner_user_id` en tabla aparte que sobreviva al hogar) y/o el tope global de §6.5. Decisión de Neo.

### H-LCK-006-13 (MEDIA, BRECHA): migración D6-09 con escena de hogar ya existente rompe la creación del hogar
- Entrada: el usuario crea su primer hogar; un hook (alta de mascota/asignación) en la misma transacción crea perezosamente `home_scenes(household_id = H)` antes del `UPDATE ... SET household_id = :h WHERE owner_user_id = :u`.
- Resultado: violación del índice único parcial `(household_id)`; la creación del hogar falla con 500. No hay orden definido entre la migración y los hooks.
- Cubierto: SC-ESC6-058 solo prueba el camino feliz. Mitigación: ejecutar el `UPDATE` **primero** en la transacción de creación; si existe fila de hogar, borrarla (sin imagen) o fusionar. Test de paridad SQLite/Postgres.
- Relacionado (BAJA): con la migración, las mascotas no asignadas del dueño salen de la huella (solo cuentan las asignadas al hogar) y la escena pasa a `outdated` sin cambio del usuario; REQ-ESC6-032 afirma "la huella no cambia". **[NO VERIFICABLE]** si 002 asigna automáticamente al crear el hogar.

### H-LCK-006-14 (MEDIA, PARCIAL): ganchos `recomputeSceneStatus` en casos de uso LOCKED; cualquier ruta omitida deja `ready` falso
- Entrada: importar respaldo (REQ-ESC6-022 dice que debe dejar `idle`/`outdated` pero la importación reemplaza mascotas y no es un hook listado), purga diaria de avatares, seudonimización de cuenta, cambio de `ARGOS_SCENE_MAX_PETS` 8 a 4 por despliegue.
- Resultado: `status` persistido `ready` mientras la huella calculada difiere; el botón no aparece o la imagen muestra mascotas que ya no existen. El diseño dice "la huella siempre se calcula", pero `getScene` no se compromete a recomputar al leer.
- Mitigación: `getScene` recalcula y corrige la proyección en cada lectura (barato); prueba de arquitectura que enumere todos los escritores de `pets`, `pet_assignments`, `household_photos`, `scene_consents`.

### H-LCK-006-15 (MEDIA, PARCIAL): consentimiento retirado a mitad: la API ya envió los datos
- Entrada: B retira a los 30 s; las fotos ya están en el proveedor.
- Resultado: el spec promete "purga de inmediato" pero el dato ya salió; la retención del proveedor es la que cuenta (REQ-ESC6-028, **[NO VERIFICABLE]**). El aviso debe decirlo; hoy REQ-ESC6-025 afirma lo contrario por omisión. Documentar como riesgo residual RR-06-xx.

### H-LCK-006-16 (MEDIA, BRECHA): contratos de `T_GEN` y de timeout inconsistentes
- `ARGOS_SCENE_GEN_TIMEOUT_SECONDS` 10-120 y `LEASE >= T_GEN + 30`, pero `cloud_run.tf timeout = 120 s` fijo y `dispatchDeadline = 180 s`. Con T_GEN = 120 el servicio se corta antes del `put`. Validar en arranque `timeout >= T_GEN + 15`.

## Hallazgos BAJOS

### H-LCK-006-17 (BAJA, BRECHA): T2 reinserta `scene_image_sources` con un usuario cuya cuenta se eliminó/seudonimizó en vuelo
Eliminación de cuenta (propietario único) borra el hogar por cascada, así que T2 falla limpio; el hueco es un miembro no propietario que borra su cuenta con `uploaded_by`/`owner_user_id` sin FK: T2 escribe el id en claro después de la seudonimización. Mitigación: T2 verifica existencia de cada `owner_user_id`.

### H-LCK-006-18 (BAJA, COBERTA/PARCIAL): hogar eliminado con tarea en vuelo
Cubierto por EDGE-ESC6-005/021 y `ON DELETE CASCADE`. Falta decir que el worker responde **2xx** (no 5xx) cuando la escena o el intento no existen, y que con `maxAttempts = 1` un 5xx no se reintenta pero ensucia las alertas. Test: worker con escena inexistente = 204.

### H-LCK-006-19 (BAJA, PARCIAL): modo decidido en T1 con escena previa que luego se retira
Mensaje: si la imagen vigente se purga (D6-17) tras T1 en modo `INCREMENTAL_*`, el worker no puede cumplir el prompt. Resolver con H-LCK-006-06 (fallar sin cuota en vez de cambiar de modo).

### H-LCK-006-20 (BAJA, BRECHA): fallos repetidos acumulan filas y consumen CPU sin cuota
`scene_attempts` guarda hasta 16 KB de `inputs_snapshot` por intento, 30 días. Con reintentos ilimitados (H-LCK-006-05) crece sin tope. Cubierto por el enfriamiento propuesto.

### H-LCK-006-21 (BAJA, BRECHA): metadatos de la imagen **generada**
La normalización (REQ-ESC6-027) cubre solo entradas. La salida puede traer C2PA/XMP/SynthID `[verificar]`; no se limpia ni se valida antes del `put`. **[NO VERIFICABLE]**.

### H-LCK-006-22 (BAJA, COBERTA): más de N mascotas
EDGE-ESC6-002 e INV-ESC6-008 cubren altas/ediciones fuera del tope y B7 la promoción. Hueco residual: bajar `ARGOS_SCENE_MAX_PETS` por configuración cambia la huella de todos los hogares y los deja `outdated` sin acción del usuario (relacionado con H-LCK-006-14); y N=8 + escena previa + foto del hogar = 9 imágenes de entrada, probablemente sobre el límite del modelo (R-06-A, **[NO VERIFICABLE]**), lo que haría fallar de forma determinista a hogares grandes (ver H-LCK-006-05).

### H-LCK-006-23 (BAJA, COBERTA): carrera entre dos actualizaciones
Cubierta por REQ-ESC6-012, INV-ESC6-003 (CAS) y SC-ESC6-016. No se encontró fallo: T2 lee estado vivo bajo el candado de la escena y las mutaciones recalculan tras T2, así que `ready` falso no ocurre. Verificar con prueba de intercalado en Postgres (read committed) **[NO VERIFICABLE]**.

## Resumen
| Sev. | Cantidad | IDs |
|---|---|---|
| ALTA | 6 | 01, 02, 03, 04, 05, 06 |
| MEDIA | 10 | 07..16 |
| BAJA | 7 | 17..23 |

Cubiertas del todo por el spec: 18 (parcial), 22, 23. Parcialmente: 05, 08, 14, 15, 17, 19. Brechas puras: el resto.

## EDGE nuevos propuestos para /architect
EDGE-ESC6-025 (retiro/desasignación entre `generate()` y T2 cancela el intento), 026 (lease desde claim, cola saturada), 027 (doble entrega concurrente de la misma tarea), 028 (referencia degradada nunca publica `ready`), 029 (formato/firma de salida y enfriamiento tras fallos), 030 (migración D6-09 con escena de hogar ya creada), 031 (cuota imputada a la ventana de T1), 032 (`ALREADY_EXISTS` de Cloud Tasks).

## Para /seraph: tests destructivos
Intercalados con `FakeSceneImageGenerator` lento: revocar/expulsar entre `generate` y T2; dos POST concurrentes al worker; lease vencido entre claim y T2; creación de hogar con escena perezosa previa; salida con MIME `image/jpeg` y APNG; mismo `Idempotency-Key` tras `failed`.
