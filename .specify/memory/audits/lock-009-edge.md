# Acta /lock: auditoría de casos límite de la Feature 009 (T1204, compuerta de Fase 0)

**FROM**: Lock (Anti-Bias Lens & Devil's Advocate) | **TO**: Morpheus | **Fecha**: 2026-11-23
**Alcance**: `specs/009-aprobacion-admin-correo/spec.md` (reconciliada con `D9-01/02/04/09/15/17/18/19/20`), contrastada con `plan.md`, `tasks.md`, `architect-009-preguntas-neo.md`, `claude/inbox-feature-009.md`, la spec 007 (`APPROVED`) y el código en disco (lectura).
**Modo**: solo lectura. No se modifica `spec.md`, `plan.md`, `tasks.md`, `src/`, `tests/` ni contratos. No se marca ninguna casilla. No hay commit ni push.
**Estado del EDGE-* existente**: último `EDGE-009-034`; los nuevos propuestos empiezan en `EDGE-009-035`.

---

## 1. Veredicto

**PASS CON CAMBIOS.**

- La spec es sólida en lo estructural: fases, trazabilidad 1:1, máquina de estados, `404` uniforme, cookies y sesión ya fijadas, y la mayoría de los casos límite de `#60` y `#20` están cubiertos.
- Hay **3 hallazgos ALTO** que hay que cerrar en la spec antes de la fase que los afecta. Ninguno bloquea la Fase 1 por sí solo.
- Hay **13 hallazgos MEDIO**. Varios afectan a la Fase 1 (`#60` y `#57`), así que deben estar en la spec **antes de `T1207`**.
- Hay **10 hallazgos BAJO**: precisiones y textos obsoletos.
- Condición de paso: `/architect` incorpora los EDGE propuestos (o los rechaza con Neo) antes de la compuerta de `/mouse` (`T1206`). Los ALTO 01 y 03 bloquean `T1241` y la Fase 3; el ALTO 02 bloquea la Fase 5.

## 2. Conteo por severidad

| Severidad | Cantidad | Hallazgos |
| --- | --- | --- |
| ALTO | 3 | LCK-01, LCK-02, LCK-03 |
| MEDIO | 13 | LCK-04 a LCK-16 |
| BAJO | 10 | LCK-17 a LCK-26 |
| **Total** | **26** | |

Los EDGE propuestos para ALTO y MEDIO van en la sección 4 (`EDGE-009-035` a `EDGE-009-049`; LCK-16 es una enmienda de texto, no un EDGE).

---

## 3. Hallazgos ALTO

### LCK-01 (ALTO): umbrales del límite de `/admin` nunca se fijan
- **Evidencia**: `EDGE-009-010` dice «los umbrales numéricos se fijan en el plan». `plan.md` no contiene ningún número (ADR-009-07 solo dice «límite por IP»). `tasks.md` T1231 y T1234 repiten «límite por IP efectiva» sin valores. La alternativa es que el implementador elija el número.
- **Escenario reproducible**: un atacante con 3 IP distintas envía 1.000 peticiones a `/api/admin/auth/google/callback`. Sin umbral fijado, el callback no tiene límite efectivo y el único administrador puede quedar bloqueado (DoS) o el límite se implementa sin prueba. `EDGE-008-025` pedía exactamente ese control.
- **REQ afectado**: REQ-ADM9-004, `EDGE-009-010`, T1231, T1234.
- **Mitigación determinista**: el EDGE-009-035 de la sección 4 fija los números propuestos por /lock; `/architect` los confirma o los cambia en `plan.md` (no en la spec).
- **Fase afectada**: Fase 3.

### LCK-02 (ALTO): el tope de gasto de 5 USD/mes no se garantiza al cambiar de modelo
- **Evidencia**: `REQ-CFG9-004` y `EDGE-009-021` dicen que el tope de 5 USD sigue vigente. Pero el freno es `scene.global_quota_max`, que cuenta **imágenes**, no dólares. `D9-09` reconoce que `gemini-3-pro-image` «suele costar más» que `gemini-2.5-flash-image`. Es decir, la spec admite que el coste unitario varía por modelo.
- **Escenario reproducible**: `scene.global_quota_max = 200` calibrado para `gemini-2.5-flash-image` (que cabe en 5 USD). Un administrador cambia el modelo a `gemini-3-pro-image` en `/admin`. Las mismas 200 imágenes cuestan más que el coste unitario anterior y el gasto mensual supera 5 USD sin que ninguna regla lo impida.
- **REQ afectado**: REQ-CFG9-004, NFR-009-003, `EDGE-009-021`, `EDGE-009-036` (propuesto).
- **Mitigación determinista**: EDGE-009-036 (sección 4). El coste unitario por modelo debe ser configuración (`app-config.ts`) y `/admin` debe rechazar la combinación modelo + tope que exceda 5 USD.
- **Fase afectada**: Fase 5 (`T1254` y tareas de modelo).

### LCK-03 (ALTO): la spec no refleja la decisión aprobada `D9-18` y la supresión anticipada no tiene requisito ni prueba
- **Evidencia**: Neo aprobó `D9-18` (textos `PENDING` y `REJECTED` aprobados, purga automática a 30 días, atención manual de supresión anticipada). Pero `spec.md` sigue diciendo «textos finales por aprobar, `D9-18`» (REQ-APR9-002), «la decisión de producto es D9-18» (`EDGE-009-033`), «vía por D9-18» (`RR-09-04`) y la tabla de propuestas pendientes incluye `D9-18` como abierta. `tasks.md` T1203 y T1241 siguen esperando `D9-18`. No existe ningún REQ ni SC para la supresión manual (Ley 1581 de 2012 es el motivo del `EDGE-009-033`).
- **Escenario reproducible**: un titular con cuenta `REJECTED` (día 5 de 30) pide la supresión. Según la spec, no hay ninguna vía definida, ni requisito, ni prueba. El implementador no sabe si construir un botón (que la decisión no pidió) o no hacer nada.
- **REQ afectado**: REQ-APR9-002, `EDGE-009-033`, `RR-09-04`, `D9-18`, T1203, T1241.
- **Mitigación determinista**: EDGE-009-037 (sección 4) con el flujo manual aprobado; reescribir el texto de `EDGE-009-033` para referirlo a `EDGE-009-037`; marcar `D9-18` como decidido en las tablas de `spec.md` y `tasks.md` (sin marcar casillas).
- **Fase afectada**: Fase 4 (`T1241`).

---

## 4. Textos exactos de los EDGE propuestos (ALTO y MEDIO)

Numeración a partir de `EDGE-009-034`. Estos textos NO están en `spec.md`; los incorpora `/architect`.

> **EDGE-009-035** (`#19`, `REQ-ADM9-004`, LCK-01): intentos de acceso a `/admin` por una misma IP efectiva: más de 10 fallos en el inicio del flujo o en el callback de `/api/admin/auth/google/*` en 15 minutos responden `429` con `Retry-After` hasta que expire la ventana. El límite no se aplica por cuenta ni a sesiones de administración válidas. Un administrador bloqueado desde una IP sigue pudiendo entrar desde otra IP efectiva. El `429` solo aparece en el flujo de Google porque `GET /admin` ya es público; el resto de `/api/admin/*` sigue con `404` uniforme. Los números (10 fallos, 15 min) son propuesta de /lock; `plan.md` los fija o los cambia.

> **EDGE-009-036** (`#20`, `REQ-CFG9-004`, LCK-02): `scene.global_quota_max` cuenta imágenes, no dólares. `/admin` no guarda un `scene.provider_model` si `scene.global_quota_max × coste_unitario(modelo)` supera 5 USD/mes. El coste unitario de cada modelo es configuración en `app-config.ts`, junto a la lista cerrada (no es un valor de BD). Un modelo sin coste unitario configurado no es seleccionable. El resultado (imágenes máximas que caben en 5 USD con ese modelo) se muestra antes de guardar.

> **EDGE-009-037** (`#18`, `REQ-APR9-002`, LCK-03; sustituye el texto de `EDGE-009-033`): la supresión anticipada de una cuenta `PENDING` o `REJECTED` (Ley 1581 de 2012; decisión `D9-18` aprobada) no tiene botón de autoservicio. El titular la solicita por el canal de contacto publicado en la pantalla de estado. El administrador verifica la titularidad con la misma prueba de `REQ-DEL9-001` (reautenticación con Google del titular) o con el correo de la solicitud, y ejecuta el borrado con una operación de `/admin` auditada. El procedimiento exacto y el plazo de respuesta los fija `/rama`. Requiere `REQ-APR9-008` y `SC-009-050`, que no existen en la spec.

### LCK-04 (MEDIO): sesión de `PENDING` y `REJECTED` ambigua; `EDGE-009-003` no es alcanzable
- **Evidencia**: `REQ-APR9-002` dice «sin sesión ni cookie». `REQ-APR9-001` dice que la cuenta «solo ve su pantalla de estado», y `SC-009-001` dice «no recibe sesión útil». `REQ-APR9-003` y `EDGE-009-003` dicen que el rechazo revoca sesiones de la cuenta. Pero solo `PENDING` puede pasar a `REJECTED`, y `PENDING` no tiene sesión (`STATE-ACCT9-001` no tiene transición `ACTIVE → REJECTED`). Por tanto `EDGE-009-003` no puede ocurrir. Además, sin sesión, ¿cómo ve el usuario su pantalla de estado si recarga la página? La spec solo cubre la respuesta del login.
- **Escenario reproducible**: un `PENDING` inicia sesión con Google, ve «Tu solicitud está en revisión», recarga la página. Sin cookie, la SPA vuelve a la pantalla de acceso. La spec no dice si eso es correcto.
- **REQ afectado**: REQ-APR9-001, REQ-APR9-002, REQ-APR9-003, `EDGE-009-003`, `EDGE-009-005`, SC-009-001.
- **EDGE propuesto (reemplaza `EDGE-009-003` y precisa `EDGE-009-005`)**:
  > **EDGE-009-038** (`#18`, `REQ-APR9-001/002/003`): ninguna respuesta de registro o de inicio de sesión de una cuenta `PENDING` o `REJECTED` crea fila de sesión ni cookie. Al recargar, la SPA vuelve a la pantalla de acceso; el estado solo se vuelve a mostrar tras credenciales o Google válidos. La revocación de sesiones en la decisión de rechazo es defensa en profundidad (no tiene efecto práctico porque una cuenta `PENDING` no tiene sesiones); se prueba como invariante, no como escenario de usuario.

### LCK-05 (MEDIO): carrera entre decisión y purga; `PENDING` de más de 30 días sin purgar
- **Evidencia**: `REQ-APR9-007` purga `PENDING` a los 30 días de la creación con el mantenimiento programado, y `REQ-APR9-003` decide con compare-and-set. La spec no dice qué pasa si la purga y la aprobación ocurren a la vez, ni si una cuenta de 31 días sin purgar puede aprobarse.
- **Escenario reproducible**: `PENDING` creada el día 0. El día 30 a las 23:59:59 el administrador aprueba y, a la vez, el job de purga la borra. Si la aprobación gana, el usuario entra; si la purga gana, la aprobación responde «estado vigente» sin explicación. Ambos resultados son defendibles pero la spec no fija cuál.
- **REQ afectado**: REQ-APR9-003, REQ-APR9-007, `EDGE-009-002`, `EDGE-009-007`.
- **EDGE propuesto**:
  > **EDGE-009-039** (`#18`, `REQ-APR9-003/007`): la decisión y la purga usan compare-and-set sobre `account_status` y la fecha de creación. Si la purga gana, la decisión responde «solicitud no encontrada» sin revelar el estado previo y no crea sesión. Una `PENDING` de más de 30 días aún no purgada no puede aprobarse: la decisión la rechaza con el mismo mensaje. La lista de `/admin` solo muestra `PENDING` con menos de 30 días.

### LCK-06 (MEDIO): ocupación masiva de identificadores por cuentas `PENDING`
- **Evidencia**: una `PENDING` ocupa `username` (y `sub`) durante 30 días sin límite de cantidad. No hay tope de registros por IP ni por ventana. `EDGE-009-004` cuida solo el reintento de rechazados.
- **Escenario reproducible**: un script registra 500 usuarios en 10 minutos con los nombres más probables (por ejemplo, nombres de mascotas o de personas). Cada uno queda `PENDING` 30 días y bloquea el nombre. El usuario legítimo recibe «username ocupado» y la cola de `/admin` se llena.
- **REQ afectado**: REQ-APR9-002, REQ-APR9-007, `EDGE-009-004`. El rate limit actual es de Google (`google-rate-limit.ts`) y no cubre el registro con contraseña.
- **EDGE propuesto**:
  > **EDGE-009-040** (`#18`, `REQ-APR9-002`): el registro (usuario/contraseña o Google) tiene un límite de cuentas nuevas por IP efectiva y por ventana, con respuesta uniforme al exceso y sin crear fila. Propuesta de /lock para que /architect la fije en el plan: 5 registros nuevos por IP efectiva en 24 h. Además, el contador de `PENDING` de `/admin` avisa al administrador si supera un umbral del plan. El límite no cambia la respuesta de `username` ocupado.

### LCK-07 (MEDIO): intento «en vuelo» sin marca que murió nunca deja de contar para `ACTOR_LIMIT`
- **Evidencia**: `EDGE-009-027` cuenta un intento sin `outcome` ni marca «solo mientras esté activo», sin definir «activo». La tabla de escenas tiene `lease_expires_at` (`scene-row-mappers.ts`), pero la spec no lo usa.
- **Escenario reproducible**: el proceso muere entre la creación del intento y la marca de llamada. El intento queda sin `outcome` y sin marca para siempre si nadie lo cierra. Si «activo» se interpreta como «existe», el usuario queda bloqueado por `ACTOR_LIMIT` de forma indefinida, lo contrario de `#60`.
- **REQ afectado**: REQ-LIM9-002, INV-LIM9-001, `EDGE-009-027`. Fase 1.
- **EDGE propuesto**:
  > **EDGE-009-041** (`#60`, `REQ-LIM9-002`): un intento sin `outcome` y sin `provider_call_started_at` deja de contar para `ACTOR_LIMIT` cuando vence `lease_expires_at` de su escena (o el plazo máximo de ejecución que fije el plan). Al vencer se cierra como `CANCELLED` sin llamada. Ningún intento permanece activo más allá de ese plazo.

### LCK-08 (MEDIO): caída entre consumir la cuota global y devolverla deja una unidad perdida
- **Evidencia**: ADR-009-01 consume (`tryConsume`), luego marca en transacción y, si la marca falla, llama a `refund(month)`. Un proceso que cae entre `tryConsume` y `refund` deja la unidad descontada sin llamada. `INV-LIM9-002` dice «sin cambio neto» pero no cubre la caída.
- **Escenario reproducible**: `tryConsume` ok → caída del proceso (OOM, reinicio de Cloud Run) → la marca nunca se escribe. `scene.global_quota_used` queda +1 sin llamada a Vertex. Repetido, el tope mensual se agota por fallos de infraestructura y `REQ-LIM9-003` falla.
- **REQ afectado**: REQ-LIM9-003, INV-LIM9-002, `EDGE-009-028`. Fase 1.
- **EDGE propuesto**:
  > **EDGE-009-042** (`#60`, `REQ-LIM9-003`, `INV-LIM9-002`): ninguna unidad de cuota global queda descontada sin llamada tras una caída. El plan elige una de dos vías y la declara: (a) la marca se escribe antes del consumo en la misma transacción, o (b) una reconciliación periódica devuelve unidades de intentos cerrados sin marca. El resultado observable se prueba con una simulación de caída entre `tryConsume` y `refund` en las tres implementaciones.

### LCK-09 (MEDIO): la cuota por propietario no está definida para intentos sin llamada; `EDGE-009-030` depende de ella
- **Evidencia**: `EDGE-009-030` dice que el abuso sin costo lo acota «el cooldown de 60 s y la cuota por propietario». Pero `REQ-LIM9-*` solo habla de `FAILED_LIMIT`, `ACTOR_LIMIT` y la cuota global. La spec no dice si un intento que falla antes de Vertex consume `consumed_generations` o `scene_quota_carry` del propietario.
- **Escenario reproducible**: una persona lanza un intento por minuto contra una escena con cuota global agotada. Cada intento crea una fila y lee GCS. Con 1.440 intentos al día, si la cuota por propietario no se consume, el abuso no tiene techo diario.
- **REQ afectado**: REQ-LIM9-001, REQ-LIM9-002, `EDGE-009-030`, `EDGE-009-022`.
- **EDGE propuesto**:
  > **EDGE-009-043** (`#60`, `REQ-LIM9-001/002`): la cuota por propietario se consume solo por intentos con `provider_call_started_at` no nulo. Para acotar el abuso sin coste de Vertex, cada escena admite un tope diario de intentos cerrados sin llamada (propuesta de /lock: 20 en 24 h) que responde con el mismo código de `FAILED_LIMIT`. El tope se prueba en las tres implementaciones. Si Neo prefiere solo el cooldown, debe firmarlo como riesgo aceptado.

### LCK-10 (MEDIO): el invariante «literal exactamente una vez» choca con un bloque de preservación editable
- **Evidencia**: `D9-08` (A) hace editable el bloque de preservación. `INV-PRO9-001` y `SC-009-029` piden que el literal de `REQ-PRO9-002` aparezca exactamente una vez. Si el administrador edita o vacía el bloque, el literal desaparece y el test rojo no distingue «bug» de «edición». `REQ-CFG9-005` dice que «el invariante lo impone el código», pero el código no puede imponer un literal que la BD controla.
- **Escenario reproducible**: Neo cambia el bloque de preservación en `/admin` por una frase más corta. Con una mascota con foto, el prompt sale sin preservación y SC-009-029 falla, aunque el código sea correcto.
- **REQ afectado**: REQ-PRO9-002, INV-PRO9-001, REQ-CFG9-005, SC-009-029, `D9-08`. Fase 1 (tests) y Fase 5 (editor).
- **EDGE propuesto**:
  > **EDGE-009-044** (`#57`/`#20`, `REQ-PRO9-002`, `REQ-CFG9-005`): el invariante de una aparición y solo si hay foto se formula sobre el bloque lógico `PRESERVATION_BLOCK` y no sobre el literal. El literal de `REQ-PRO9-002` es el valor sembrado. Un texto editado vacío o sin la instrucción de preservación se rechaza en `/admin` (`INV-CFG9-002`); si llega vacío a BD, rige el texto por defecto del código con aviso sin valor (`INV-CFG9-003`).

### LCK-11 (MEDIO): sin trazabilidad del modelo y región usados por intento
- **Evidencia**: `REQ-CFG9-002` hace que modelo y región se lean por solicitud. La spec no exige que cada intento guarde el `provider_model` y `provider_location` realmente usados. Sin eso, el gasto real por modelo (LCK-02) no se puede auditar, y un cambio entre el intento y su reintento no se puede explicar.
- **Escenario reproducible**: un intento arranca con `gemini-2.5-flash-image` y, a mitad, Neo cambia a `gemini-3-pro-image`. El reintento usa el modelo nuevo. Al revisar el gasto, no hay forma de saber qué imagen salió de qué modelo.
- **REQ afectado**: REQ-CFG9-002, REQ-CFG9-004, NFR-009-003, `EDGE-009-021`. Fase 5. Requiere columna nueva, es decir **migración (Nivel 2)**; no está en la lista de `SC-009-041`, que solo prohíbe migraciones por `#60`.
- **EDGE propuesto**:
  > **EDGE-009-045** (`#20`, `REQ-CFG9-002/004`): cada intento registra el modelo y la ubicación con los que se hizo la llamada (dato de auditoría, sin valores de prompt). Un reintento usa la configuración vigente en su marca de llamada. El gasto mensual se puede reconstruir por modelo a partir de esos registros. Requiere decisión de Neo sobre la migración (Nivel 2) o sustituirla por el registro de auditoría de `REQ-ADM9-004`.

### LCK-12 (MEDIO): `global` puede procesar fotos fuera de la región elegida sin dictamen de privacidad
- **Evidencia**: `D9-09`, REQ-CFG9-004 y `EDGE-009-018` habilitan `global` (host `aiplatform.googleapis.com`). La spec no dice dónde puede procesarse la imagen con `global`. Las fotos de mascotas y del hogar pueden ser datos personales. `NFR-009-004` solo cubre logs y pide a `/rama` la retención de cuentas, no la ubicación del tratamiento.
- **Escenario reproducible**: Neo habilita `global` para bajar la latencia. Las fotos de una casa en Colombia se procesan en otra región sin registro de la transferencia ni aviso al titular.
- **REQ afectado**: REQ-CFG9-004, NFR-009-004, `EDGE-009-018`. Principio VI y Ley 1581 (revisión de `/rama`).
- **EDGE propuesto**:
  > **EDGE-009-046** (`#20`, `REQ-CFG9-004`, `NFR-009-004`): `scene.provider_location = global` no se puede guardar mientras `/rama` no haya registrado un dictamen de ubicación del tratamiento para la lista de regiones. `/admin` muestra, antes de guardar, un aviso de que el procesamiento puede ocurrir fuera de la región. Sin dictamen, la opción no aparece en la lista.

### LCK-13 (MEDIO): retirar un administrador no tiene efecto inmediato; la precedencia entre correo y `sub` no está definida
- **Evidencia**: `EDGE-009-009` dice que la lista «solo cambia por configuración y despliegue». Una sesión de administración dura hasta 30 min (`D9-19`). La spec no dice si las sesiones se revalidan contra la lista vigente. Además, `REQ-ADM9-003` ancla el `sub` tras el primer acceso, pero no dice qué pasa si el correo sale de la lista y el `sub` sigue anclado, ni si la lista cambia y el correo se reasigna. La rotación del identificador de sesión en el callback y el cierre de sesión explícito no están en la spec.
- **Escenario reproducible**: se quita un correo de `ARGOS_ADMIN_EMAILS` porque el titular dejó de ser administrador. Su sesión de administración sigue viva hasta 30 minutos y puede aprobar cuentas o cambiar parámetros. Si además el `sub` queda anclado, el acceso sigue existiendo sin correo en la lista.
- **REQ afectado**: REQ-ADM9-002, REQ-ADM9-003, REQ-ADM9-006, `EDGE-009-009`.
- **EDGE propuesto**:
  > **EDGE-009-047** (`#19`, `REQ-ADM9-002/003`): cada petición de `/api/admin/*` valida que el correo de la sesión siga en la lista vigente; si no, la sesión se revoca. El acceso exige correo en la lista **y** `sub` coincidente con el anclado (si existe). Un `sub` anclado sin correo en la lista no concede acceso. El identificador de sesión se rota en el callback y el cierre de sesión es explícito. Se prueba: quitar el correo de la lista revoca la sesión en la siguiente petición.

### LCK-14 (MEDIO): subida concurrente de fotos puede superar el tope
- **Evidencia**: `EDGE-009-015` cubre bajar el tope. No cubre que dos subidas simultáneas, con tope 10 y 9 fotos existentes, creen 11. `005` (`REQ-ALB5-003`) no está en el alcance de 009 y no se sabe si su comprobación es transaccional (verificar en `src/` antes de cerrar).
- **Escenario reproducible**: tope 10, 9 fotos. Dos peticiones simultáneas comprueban el conteo (9 < 10) y ambas insertan. Resultado: 11 fotos.
- **REQ afectado**: REQ-CFG9-001, REQ-CFG9-002, `EDGE-009-015`, `SC-009-017`.
- **EDGE propuesto**:
  > **EDGE-009-048** (`#20`, `REQ-CFG9-002`): con el tope en 10 y 9 fotos, dos subidas concurrentes no crean 11. La comprobación de conteo y la inserción se hacen en la misma transacción con bloqueo por mascota (o restricción equivalente), y se prueba en memoria, SQLite y Postgres.

### LCK-15 (MEDIO): eliminar la cuenta propietaria de un hogar con miembros activos
- **Evidencia**: `REQ-DEL9-001` dice que los efectos son «idénticos a REQ-ACC-002». La spec no dice qué pasa con hogares cuyo único propietario se elimina mientras hay miembros `ACTIVE` (008, `STATE-HOUSE-MEMBERSHIP-001`, `INV-ACC-001/002`). Las mascotas compartidas quedarían huérfanas o los miembros sin propietario.
- **Escenario reproducible**: una cuenta nacida con Google es propietaria de un hogar con un co-cuidador `ACTIVE`. Pide eliminar la cuenta con la reautenticación de `D9-17`. Si la cascada de `REQ-ACC-002` borra el hogar, el co-cuidador pierde acceso a mascotas que comparte. Si no lo borra, queda un hogar sin propietario.
- **REQ afectado**: REQ-DEL9-001, INV-DEL9-001, `EDGE-009-031`, `EDGE-009-032`. Verificar la regla de `REQ-ACC-002` antes de cerrar.
- **EDGE propuesto**:
  > **EDGE-009-049** (deuda #17, `REQ-DEL9-001`): eliminar una cuenta que es propietaria de un hogar con miembros `ACTIVE` se rechaza con un mensaje que lista los hogares afectados, o transfiere la propiedad según la regla de 008 (`INV-ACC-001/002`), sin dejar mascotas compartidas huérfanas. La confirmación del borrado muestra esos hogares.

### LCK-16 (MEDIO): la enmienda documental de 007 (estado `APPROVED`) se edita sin versión ni firma de Neo
- **Evidencia**: `007` está `APPROVED` (firmada por Neo el 2026-11-19). `REQ-PRO9-007` y `T1212` piden editar el texto normativo de 007 regla R4 y `REQ-ESC7-003`. Un texto normativo aprobado no se cambia en silencio.
- **Escenario reproducible**: `/architect` edita la regla R4 de 007 para el nuevo orden. El acta de 007 y su firma siguen siendo las de antes. Una auditoría de `verify-traceability` no detecta que el texto cambió sin firma.
- **REQ afectado**: REQ-PRO9-007, T1212, SC-009-035.
- **Texto propuesto (enmienda de REQ-PRO9-007, no EDGE)**:
  > REQ-PRO9-007 (enmienda documental): la modificación de la regla R4 y de `REQ-ESC7-003` de la Feature 007 se registra como enmienda versionada de 007 (nota de versión, referencia a esta spec y firma de Neo) antes de que `T1212` edite el texto. Sin esa firma, 007 conserva su texto y la 009 documenta la diferencia como excepción.

---

## 5. Hallazgos BAJO (precisiones; no requieren EDGE nuevo salvo que Neo lo pida)

| ID | Hallazgo | Propuesta de corrección |
| --- | --- | --- |
| LCK-17 | `EDGE-009-004` promete «sin revelar REJECTED», pero `EDGE-009-005` muestra el texto de rechazo con credenciales o Google válidos. Son flujos distintos (registro frente a login), pero la frase no lo deja claro. | Precisar en `EDGE-009-004`: «en el registro»; en el login con credenciales válidas, el dueño ve el estado. Un tercero no puede llegar a ese estado sin credenciales. |
| LCK-18 | Un `/api/admin/*` sin sesión responde `404` uniforme, pero el tiempo de respuesta cambia si hay cookie válida o no (consulta a `admin_sessions`). `EDGE-009-008` solo cubre cuerpo y cabeceras. | Añadir a `EDGE-009-008` que el tiempo de respuesta de las rutas ocultas no depende de la existencia de sesión (tiempo constante o retardo fijo). Riesgo bajo: la pantalla `/admin` ya es pública. |
| LCK-19 | `scene.global_quota_used.YYYY-MM` no fija la zona horaria del mes. Un intento al cierre de mes puede caer en un mes u otro según UTC o Colombia. | Fijar en el plan que el mes es el de `America/Bogota` (o UTC) y añadir una prueba en el límite. |
| LCK-20 | `EDGE-009-034` permite que el administrador apruebe su propia cuenta sin dejar marca. | Registrar en `admin_audit_entries` un indicador de auto-aprobación. No cambia el comportamiento. |
| LCK-21 | `provider_call_started_at` se marca antes de la llamada. Si la conexión falla antes de enviar la petición, el intento cuenta como «con llamada». | Precisar en REQ-LIM9-006 que «llamada» significa «petición enviada al proveedor», o aceptar el conteo conservador y documentarlo. |
| LCK-22 | Textos obsoletos: `REQ-ADM9-002` dice «lectura a confirmar en `D9-19`»; `SC-009-015` menciona `D9-19`; la tabla de decisiones de `spec.md` marca `D9-19` y `D9-20` como pendientes. Ambas están decididas (`D9-19`, `D9-20`). | Actualizar el texto de la spec (lo hace `/architect`). |
| LCK-23 | `admin_audit_entries` no tiene retención ni tope de crecimiento. | Añadir al plan una retención declarada con `/rama` (`NFR-009-004`). |
| LCK-24 | `INV-CFG9-002` habla de «marcadores de sustitución de un conjunto cerrado» sin enumerar el conjunto. | Enumerar los marcadores permitidos en la spec o en `plan.md`. |
| LCK-25 | La sesión de 30 min absolutos puede caducar en mitad de la edición de un parámetro; el cambio se pierde sin aviso. | Mostrar aviso de caducidad a los 25 min en la UI del portal (no es EDGE: UX). |
| LCK-26 | `scene.global_quota_max` bajado por debajo del consumo del mes: la spec no dice si el intento falla o si se permite hasta llegar a cero. | Fijar en `EDGE-009-*` (o en REQ-CFG9-001): el tope nuevo bloquea intentos nuevos sin revertir consumo y no produce valores negativos. |

---

## 6. Lo que sí está bien cubierto (para no repetir trabajo)

- Compare-and-set de la decisión (`EDGE-009-002`, SC-009-004).
- Reintento tras rechazo y purga (`EDGE-009-004`, `EDGE-009-007`, SC-009-049).
- `404` uniforme de `/admin` y CSRF por cookie `Strict` (`EDGE-009-008`, `EDGE-009-011`, SC-009-014).
- Anti-SSRF con `global` y regex (`EDGE-009-017`, `EDGE-009-018`, SC-009-022).
- Orden de `buildImagePrompt` y `N = 0` (`EDGE-009-024..026`, SC-009-028..033).
- Titularidad reciente para el borrado (`EDGE-009-031`, SC-009-045).

## 7. Trazabilidad EDGE → SC/tareas (comprobación mecánica)

Los `EDGE-009-001..034` aparecen en `spec.md` y en `tasks.md` (al menos una vez cada uno). No todos aparecen en la sección «Success Criteria» de `spec.md`. Sin SC que los mencione directamente: `EDGE-009-001`, `003`, `004`, `006`, `007`, `008`, `009`, `010`, `011`, `013`, `017`, `018`, `019`, `021`, `022`, `023`, `024`, `025`, `026`, `027`, `028`, `033`, `034`. Varios quedan cubiertos por un REQ con SC (por ejemplo, `EDGE-009-024..026` por SC-009-028..033), pero **`EDGE-009-010`, `019`, `023`, `025`, `026`, `027` y `028` no tienen SC ni REQ que los cite en la sección de criterios**. `/mouse` debe revisarlo en T1206.

Hallazgo de la comprobación: **no hay umbrales numéricos en `plan.md` ni en `tasks.md`** (ver LCK-01).

---

## 8. Recomendación de orden para /architect

1. Incorporar `EDGE-009-035` (LCK-01) en la spec y los números en `plan.md` antes de T1206.
2. Incorporar LCK-03 (`EDGE-009-037`) y corregir `D9-18` en `spec.md` y `tasks.md`. Sin ello, `T1241` queda bloqueado.
3. Incorporar LCK-02 (`EDGE-009-036`) antes de la Fase 5.
4. Para la Fase 1 (`#60` y `#57`), incorporar **antes de `T1207`**: `EDGE-009-041`, `042`, `043`, `044`. Son los MEDIO que tocan la implementación de `#60` y de `#57`.
5. Resto de MEDIO (`EDGE-009-038..040`, `045..049`, LCK-16) antes de la compuerta de `/mouse`.
6. BAJO: a discreción de `/architect` y Neo.

Ningún ALTO ni MEDIO requiere cambiar `ScenePayload`, OpenAPI ni `src/` en este paso. LCK-11 (`EDGE-009-045`) sí puede requerir migración (Nivel 2) y eso se decide con Neo.

## 9. Riesgos que no se cierran con texto

- LCK-02 y LCK-12 dependen de cifras de costo y de dictamen legal que Lock no puede verificar. Quedan como propuestas, no como hechos.
- Los números de LCK-01, LCK-06 y LCK-09 son propuestas de /lock para que /architect y Neo las confirmen; no son decisiones de Neo.
- No se revisó la implementación actual de `scene-run-use-case.ts` línea por línea; solo se confirmó que `tryConsume` (línea 151) precede a la comprobación de vigencia (línea 162) y que no existe `refund`.

---

FROM: Lock
TO: Morpheus
STATUS: Validation Required
DETAILS: Veredicto PASS CON CAMBIOS. 26 hallazgos: 3 ALTO (LCK-01 umbrales de /admin sin fijar; LCK-02 tope de gasto no garantizado al cambiar de modelo; LCK-03 D9-18 aprobado no reflejado y supresión anticipada sin REQ/SC), 13 MEDIO (LCK-04..16), 10 BAJO (LCK-17..26). EDGE propuestos: EDGE-009-035 a EDGE-009-049 (texto exacto en el acta, sección 4); LCK-16 es enmienda de REQ-PRO9-007. Acta: /Users/andresvalejo/Documents/Tecnica/Proyecto Argos/.specify/memory/audits/lock-009-edge.md. Sin cambios en spec.md, plan.md, tasks.md, src/ ni tests/; sin casillas marcadas; sin commit ni push.
RECOMMENDED NEXT STEP: Morpheus envía el acta a /architect para que incorpore EDGE-009-035 a 049 en spec.md (y los números de LCK-01 en plan.md), corrija D9-18 en spec.md y tasks.md, y lo haga antes de T1207 (EDGE-041..044) y de la compuerta /mouse T1206; después, /mouse ejecuta T1206 y Neo decide los puntos de Nivel 2 (LCK-02 en la Fase 5, LCK-11 migración, LCK-12 dictamen de /rama).
