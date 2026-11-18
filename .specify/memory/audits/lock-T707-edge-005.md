# /lock T707 — Casos borde EDGE-005-11..33 (Feature 005)

**Fecha**: 2026-11-18 · **Rama/HEAD**: `005-album-archivos-clinicos` @ `67efea8` · **Estado**: informe de revisión; no edita specs, contratos, `src/` ni `tests/`. Nada `APPROVED`/`LOCKED`.
**Fuentes leídas**: `spec.md` (D5-01..D5-24, REQ/INV/SC), `plan.md`, `data-model.md`, `contracts/README.md`, `share-links.openapi.yaml`, `share-link.machine.json`, `clinical-summary.schema.json` (puntos), spec 004 (`REQ-ARC-001/004`, `EDGE-004`).
**Numeración**: la spec ya define `EDGE-005-01..10` (spec.md §Edge Cases). Este informe continúa en `EDGE-005-11..33` (23 nuevos; total 005 = 33). Ningún ID se reutiliza.

Leyenda de cobertura: **CUBIERTO** (hay REQ/INV/SC que fija el resultado y su prueba), **PARCIAL** (lo central está cubierto pero queda un hueco concreto), **BRECHA** (la spec no dice nada verificable). Las BRECHAS y PARCIALES que exigen cambiar la spec o un contrato se entregan a `/architect`; las decisiones de producto se marcan **PENDIENTE NEO** y no se deciden aquí.

## Resumen

| Cobertura | Cantidad | IDs |
|---|---|---|
| CUBIERTO (algunos con nota menor) | 10 | 11, 13, 18, 19, 21, 22, 26, 28, 31, 33 |
| PARCIAL (hueco concreto) | 7 | 12, 23, 24, 25, 27, 29, 30 |
| BRECHA | 6 | 14 (b), 15, 16, 17, 20, 32 |

Total: 23 EDGE nuevos (011..033); con los 10 ya en la spec, 005 suma 33. Severidad: ALTA = exposición de datos clínicos o violación de tope; MEDIA = inconsistencia o ventana operativa; BAJA = UX o documental.

---

## A. Concurrencia

### EDGE-005-11 — Dos subidas simultáneas con la mascota ya en 10/10, o subida concurrente con borrado de foto
- **Escenario**: (a) dos `POST ...?kind=PHOTO` llegan con 10 fotos; (b) con 10 fotos, una subida y un `DELETE` de otra foto se intercalan en dos instancias de Cloud Run; (c) dos subidas con 9 fotos ya cubierto por `EDGE-005-02`.
- **Resultado esperado**: (a) ambas reciben `ERR-MEDIA-ALBUM-LIMIT` (409), ambas filas `INTENT` pasan a `DELETE`, conteo sigue en 10; (b) el resultado depende del orden, pero nunca supera `max(maxPhotosPerPet, conteo previo)` y nunca deja objeto huérfano.
- **Cobertura**: **CUBIERTO** para (a) y (c): `REQ-ALB5-002` (conteo autoritativo tras el candado, también en PostgreSQL, A-06), `INV-005-003`, `SC-005-002`, `SC-005-003`. (b): **PARCIAL**, el invariante de techo cubre el resultado, pero ni `REQ-ALB5-002` ni `SC-005-003` afirman que el borrado (`REQ-BOR-005` de 004) comparta el mismo candado de mascota; si no lo comparte, la subida puede ver un conteo obsoleto y rechazar de más (error benigno, no de seguridad). Sugerencia a `/architect`: añadir una línea a `SC-005-003` o confirmar el candado compartido en 004. Severidad MEDIA-BAJA.

### EDGE-005-12 — Caché de parámetro por instancia: `getAlbumLimits` y el rechazo del servidor discrepan
- **Escenario**: Neo cambia `album.max_photos_per_pet` 10 → 12 en BD. Con varias instancias, cada una tiene su propia caché de <= 60 s: la UI pide `getAlbumLimits` a la instancia A (12) y la subida cae en la B (10), o al revés tras bajar el valor.
- **Resultado esperado**: durante <= 60 s puede haber «11 de 12 fotos» y un 409; tras el 409 la UI vuelve a pedir `getAlbumLimits` (`REQ-ALB5-005`) y se reconcilia; nunca se supera el tope con el valor más permisivo por más de una ventana.
- **Cobertura**: **PARCIAL**. `REQ-ALB5-002` acepta un excedente transitorio «de hasta una ventana» y `SC-005-034` cubre la lectura con caché, pero describe una sola instancia; el texto no dice que la ventana es **por instancia** ni que `getAlbumLimits` y el rechazo pueden provenir de instancias distintas (UI inconsistente). Solo documental. Severidad BAJA.

### EDGE-005-13 — Dos revocaciones simultáneas del mismo enlace (o revocar un enlace ya revocado)
- **Escenario**: el propietario y un `ADMIN` pulsan «Revocar» a la vez; o doble clic.
- **Resultado esperado**: ambas devuelven 204; `revoked_at` queda con el primer instante; una sola fila de auditoría `REVOKED`.
- **Cobertura**: **CUBIERTO**. `REQ-VET-005` (idempotente), `data-model.md` §3.1 (`UPDATE ... WHERE revoked_at IS NULL`, 0 filas = sin segunda auditoría), `SC-005-019`.

### EDGE-005-14 — Revocación durante un acceso en curso (lectura no atómica frente a la revocación)
- **Escenario**: el veterinario abre el resumen en el instante exacto en que el propietario revoca. (a) la revocación hace `COMMIT` entre la resolución del token y la emisión del `302` de un archivo; (b) la lectura del resumen ocupa varias consultas (token, autoridad, conjunto de mascotas, cada módulo clínico, `fileLabels`) y la revocación se confirma a mitad.
- **Resultado esperado**: (a) el `302` ya emitido tiene una URL válida <= 300 s (ventana documentada); (b) la respuesta es o bien el 404 uniforme o bien un resumen **coherente** de un solo instante; nunca un resumen mezcla datos de dos estados (p. ej. mascota retirada del hogar a mitad de la lectura).
- **Cobertura**: (a) **CUBIERTO**: `REQ-VET-005`, `INV-005-008`, `SC-005-017` (ventana <= 300 s). (b) **BRECHA**: `RAMA-005-010` y `data-model.md` §3.1 exigen «una transacción de lectura», pero no fijan el **nivel de aislamiento**. En PostgreSQL el valor por defecto es `READ COMMITTED`, que no da instantánea entre consultas de una transacción de solo lectura; hace falta `REPEATABLE READ` (o `SERIALIZABLE`) y `READ ONLY` para que «una sola transacción» signifique una sola vista. En SQLite (WAL) la transacción de lectura sí da instantánea. Falta además una prueba con dos conexiones en PostgreSQL real (como `SC-005-003`). Entregar a `/architect` (texto de `RAMA-005-010`/§3.1) y `/seraph` (prueba). Severidad MEDIA.

### EDGE-005-15 — Crear el enlace número 21 en paralelo: el candado de `HOUSEHOLD` es por creador, no por hogar
- **Escenario**: un hogar con 19 enlaces activos; el propietario del hogar y un `ADMIN` (usuarios distintos) crean un enlace `HOUSEHOLD` a la vez.
- **Resultado esperado**: uno se crea (20) y el otro recibe 409 `ERR-SHARE-LINK-LIMIT`; el tope es **por hogar** (`REQ-VET-012`).
- **Cobertura**: **BRECHA (ALTA en integridad del tope)**. `data-model.md` §3.1 define el candado para `HOUSEHOLD` como «propietario del creador» (el candado del usuario creador). Dos creadores distintos toman candados distintos, ambos cuentan 19 y ambos insertan: quedan 21 enlaces activos en el hogar. `SC-005-038` solo prueba dos creaciones simultáneas del **mismo** alcance y, en la práctica, del mismo creador/mascota. Para `PET` el candado de mascota sí es único. Además, el conjunto servido es por propietario legal (D5-19) y el tope es por hogar: dos criterios distintos. Entregar a `/architect`: fijar un candado por `household_id` (o restricción en BD) y añadir al SC el caso de dos creadores. Prueba con PostgreSQL real.

---

## B. Red y reintentos

### EDGE-005-16 — Se pierde la respuesta de creación: el enlace queda activo y nadie conoce la URL
- **Escenario**: `POST /pets/{petId}/share-links` hace `COMMIT`, pero la respuesta 201 no llega (corte móvil, timeout de proxy, pestaña cerrada). El token solo existe en esa respuesta (`INV-005-005`); el servidor no puede reemitirlo.
- **Resultado esperado**: la interfaz no debe dar por fallida la creación a ciegas; el cuidador ve en la lista un enlace ACTIVO que no puede copiar, puede revocarlo y crear otro; el enlace huérfano cuenta contra el tope de 20 y es una exposición latente (token válido que nadie controla, hasta 1/7/30 días).
- **Cobertura**: **BRECHA (MEDIA)**. `REQ-VET-001`/`SC-005-015` fijan «URL una sola vez» y «`COMMIT` antes de devolver», pero no hay clave de idempotencia ni regla de interfaz para el caso «la creación pudo haber ocurrido». Un reintento ciego crea un segundo enlace. Opciones técnicas (no se deciden aquí): `Idempotency-Key` con almacén del cuerpo (contradice «token no recuperable»), o recomendación de listar y revocar. **PENDIENTE NEO**: si se acepta el riesgo residual (como `RR-05` de 004 acepta duplicados) o se exige mitigación. Entregar a `/architect` y `/sati` (mensaje de error de creación y distinción en la lista, p. ej. «creado hace N min, sin URL mostrada»).

### EDGE-005-17 — Doble clic o reintento del cliente en «Crear enlace»
- **Escenario**: doble envío del formulario o reintento automático tras 502/504; dos tokens distintos, dos filas, dos entradas de auditoría.
- **Resultado esperado**: la interfaz deshabilita el botón durante el envío (como la subida de 004, `REQ-ARC-001`); si aun así se crean dos, ambos aparecen en la lista y cuentan para el tope.
- **Cobertura**: **BRECHA (BAJA)**. La spec fija el deshabilitado para «Cancelar» (`REQ-CAN-002`) y para la subida de 004, pero no para crear o revocar enlaces. Entregar a `/sati`/`/architect` como requisito de interfaz. Relacionado con 16.

---

## C. Cambios de autoridad

### EDGE-005-18 — El creador pierde el rol en mitad de una sesión
- **Escenario**: un `ADMIN` tiene la pantalla de enlaces abierta; el propietario lo degrada a `CAREGIVER` o lo retira. Pulsa «Crear enlace», «Vista previa» o «Revocar».
- **Resultado esperado**: crear y vista previa: `ERR-ACC-FORBIDDEN`/404 por revalidación bajo candado; revocar: según `REQ-VET-005` (la autoridad de revocar es del creador, del propietario legal o del propietario/`ADMIN` del hogar) un ex-`ADMIN` que ya no cumple recibe 404; los enlaces que creó dejan de resolver (404 uniforme) sin borrar la fila.
- **Cobertura**: **CUBIERTO**: `REQ-VET-001` (revalidar permiso dentro de la transacción), `REQ-VET-011`, `INV-005-006`, `SC-005-037`, `SC-005-025`, `SC-005-048`. Observación: el ex-`ADMIN` pierde también la capacidad de revocar los enlaces que creó (no es el propietario legal); el propietario sí puede, pero la lista debe mostrárselos. `/kid` debe cubrirlo en T791.

### EDGE-005-19 — La mascota sale del hogar después de crear el enlace `HOUSEHOLD`
- **Escenario**: el propietario retira una mascota del hogar (o la reasigna a otro hogar de otro usuario).
- **Resultado esperado**: en la siguiente petición la mascota deja de servirse; si el conjunto queda vacío, 404 uniforme; la URL firmada ya emitida vive <= 300 s.
- **Cobertura**: **CUBIERTO**: `EDGE-005-04`, `REQ-VET-002` (D5-05 dinámico), `SC-005-017`, `INV-005-008`.

### EDGE-005-20 — Cambio de propietario: el antiguo dueño sigue como `ADMIN` y el enlace `PET` sigue sirviendo
- **Escenario**: la mascota se transfiere (`owner_user_id` cambia); el antiguo propietario queda con rol efectivo `ADMIN` en el hogar. Su enlace `PET` se creó cuando era `OWNER`.
- **Resultado esperado según la spec**: contradictorio. `REQ-VET-011` define la autoridad `PET` como «rol efectivo `OWNER` o `ADMIN`» (el antiguo dueño la conserva: el enlace sigue sirviendo), mientras `SC-005-037` y el texto de `REQ-VET-011` («mascota transferida») dicen que el enlace pasa al 404 uniforme. Para `HOUSEHOLD` D5-19 exige propiedad legal, para `PET` no.
- **Cobertura**: **BRECHA (MEDIA-ALTA)**: ambigüedad de spec que decide si un ex-propietario sigue exponiendo datos clínicos de una mascota que ya no es suya. Tampoco se dice si el nuevo propietario ve en la lista los enlaces creados por el ex-propietario (la revocación sí lo permite al «propietario legal»). **PENDIENTE NEO**: si el enlace sobrevive a la transferencia o muere con ella. Entregar a `/architect` para que `REQ-VET-011`, la máquina `STATE-SHARE-001` (`creatorAuthority`) y `SC-005-037` queden consistentes con la decisión.

### EDGE-005-21 — El creador `ADMIN` (no propietario) elimina su cuenta
- **Escenario**: un `ADMIN` crea el enlace `HOUSEHOLD`/`PET`, el propietario lo comparte con su veterinario y luego el `ADMIN` borra su cuenta.
- **Resultado esperado**: los enlaces de ese creador se eliminan en cascada (`created_by_user_id ... ON DELETE CASCADE`); el veterinario pierde acceso sin aviso; el propietario puede crear otro.
- **Cobertura**: **CUBIERTO** técnicamente: `REQ-VET-010`, `data-model.md` §3 (FK cascada), `EDGE-005-05`. Observación de producto sin decisión: el dueño no recibe aviso (consecuencia aceptable bajo `REQ-VET-010`; mencionar en `/sati`). Severidad BAJA.

### EDGE-005-22 — Mascota o hogar nuevos entran al alcance de un enlace `HOUSEHOLD` ya compartido (exposición automática)
- **Escenario**: tras crear el enlace con `includeClinicalFiles` y microchip, el propietario asigna al hogar una mascota nueva o sube un archivo clínico nuevo; el veterinario, con el enlace vigente, lo ve sin que el cuidador haya decidido compartirlo.
- **Resultado esperado**: según `D5-05` firmada (dinámico) se sirve a partir de la siguiente petición; no hay regresión de la decisión, pero el cuidador debe ser advertido en la interfaz.
- **Cobertura**: **CUBIERTO como decisión** (`D5-05`, `REQ-VET-002`, `SC-005-017`). **PARCIAL** en producto: ningún REQ obliga a que la pantalla de creación y la lista expliquen que «las mascotas y archivos añadidos después también se comparten». Entregar a `/sati`. Sin cambio de la decisión (no se reabre D5-05).

---

## D. Tiempo

### EDGE-005-23 — URL firmada de 300 s emitida justo antes de revocar o de que venza el enlace
- **Escenario**: el veterinario recibe el `302` a t = 0; el propietario revoca a t = 1 s o el enlace vence a t = 2 s; la URL firmada sigue válida hasta 300 s (o hasta `min(300, restante)`).
- **Resultado esperado**: la URL sigue sirviendo el archivo <= 300 s tras la revocación; no se puede acortar (URL V4 no revocable); si el enlace vence antes, `X-Goog-Expires` ya es `<= restante`.
- **Cobertura**: **CUBIERTO**: `REQ-VET-005`, `REQ-VET-009`, `INV-005-008`, `SC-005-017`, `SC-005-023`, `SC-005-036`. Hueco menor: **PARCIAL** en el redondeo: con tiempo restante `< 1 s` (o igual a 0 s) `min(300 s, restante)` produce `X-Goog-Expires = 0`, valor inválido en GCS; la spec no fija el mínimo ni que ese caso responda el 404 uniforme. Además la URL es portadora: quien la reciba la usa 300 s (aceptado implícitamente; falta documentarlo). Entregar a `/architect` (mínimo de 1 s o 404 si `restante < 1 s`). Severidad BAJA.

### EDGE-005-24 — El enlace caduca durante la lectura del resumen (lectura en una sola transacción)
- **Escenario**: la petición comienza a t = `expiresAt - 5 ms`; la lectura de seis módulos clínicos dura 50 ms.
- **Resultado esperado**: el estado se evalúa **una sola vez** con un único `ClockPort.now()` por petición; la respuesta es el resumen completo con `validUntil` o el 404 uniforme; nunca mezcla; `generatedAt`, `X-Goog-Expires` y el estado usan el mismo `now`.
- **Cobertura**: **PARCIAL**. `STATE-SHARE-001` (`now: ClockPort.now()`) y `SC-005-018` cubren el límite con reloj controlado, pero ninguna regla dice «un solo `now` por petición» ni lo prueba intercalando un reloj que avance durante la lectura. Entregar a `/architect` (una frase en `RAMA-005-010`) y `/seraph` (prueba con reloj avanzando entre consultas). Severidad BAJA-MEDIA.

---

## E. Datos anómalos

### EDGE-005-25 — Token mal formado, URL degenerada o ruta no definida bajo `/shared/`
- **Escenario**: tokens de 5, 43 con alfabeto inválido, 100 y más de 100 caracteres (hasta varios KB), con `%00`, `%2e%2e`, secuencias de porcentaje inválidas (`%E0%A4%A`), mayúsculas distintas, barra final (`/shared/x/summary/`), `/shared/x/other`.
- **Resultado esperado**: el mismo 404 `ERR-SHARE-NOT-FOUND` (`instance` `"/shared"`, mismas cabeceras) y cada intento cuenta como fallo de tasa; ninguno revela el formato esperado.
- **Cobertura**: **PARCIAL**. `REQ-VET-007`, `INV-005-007`, `SC-005-041` cubren 5/43/100 caracteres y el inexistente; `REQ-VET-006` dice que «ninguna otra ruta» resuelve el token. **BRECHA** concreta: Fastify corta antes del manejador con su propio 404 genérico cuando el parámetro supera `maxParamLength` (por defecto 100) o con 400 `FST_ERR_BAD_URL` ante un `%` inválido; esos cuerpos y cabeceras no son los de `ERR-SHARE-NOT-FOUND`, no llevan las cabeceras de `REQ-VET-006` y no cuentan para la tasa, lo que distingue «formato inválido» de «no existe» (oráculo de enumeración y de fuerza bruta sin límite). El texto exige uniformidad pero ninguna SC prueba tokens `> 100` caracteres ni URL malformadas. Entregar a `/architect` (SC con longitudes mayores y `%` inválido; manejador `setNotFoundHandler`/`onBadUrl` coherente) y a `/trinity`/`/sentinels` para la prueba. Severidad ALTA (enumeración).

### EDGE-005-26 — Mascota sin fotos (álbum vacío) y mascota sin ningún registro
- **Escenario**: álbum con 0 fotos; resumen de una mascota recién creada sin pesos, vacunas ni archivos; enlace `HOUSEHOLD` donde una mascota no tiene datos.
- **Resultado esperado**: `getAlbumLimits` devuelve `{photoCount: 0, maxPhotosPerPet: 10}`; el resumen valida con listas vacías (no `null`) y `pets[]` con `minItems: 1`; sin fotos no se emite avatar ni referencia.
- **Cobertura**: **CUBIERTO**: User Story 1 escenario 1, `SC-005-001`, `SC-005-034`, `REQ-SUM-001/003`, `INV-005-004`; el esquema admite listas vacías (`clinical-summary.schema.json`). Recomendación a `/seraph`: caso de prueba explícito con todas las listas vacías (sin `SC` dedicado).

### EDGE-005-27 — Nombre original con caracteres de control, bidi, HTML o equivalente vacío
- **Escenario**: `Análisis<script>.pdf`, `<img src=x onerror=...>`, `‮`/`\u0000` o un nombre que queda **vacío** al sanear (solo controles).
- **Resultado esperado**: `original_name` ya se normaliza al subir (NFC; sin C0/C1, separadores de ruta, bidi, U+FEFF; 1–120 puntos de código); `displayName` se inserta como **texto escapado**, nunca como HTML; no aparece en `<title>`, URL, cabeceras, registros ni hoja impresa.
- **Cobertura**: **PARCIAL**. Saneado en 004 (`REQ-ARC-004`, `SC-ALM-007`); escape y exclusiones en 005: `REQ-VET-009`, `INV-005-009`, `SC-005-035`, `SC-005-047`. Huecos: (a) el caso «nombre vacío tras el saneado» (la columna es `NOT NULL`, 1–120) no está en 005 ni se cita su resultado en 004; comportamiento en `fileLabels` indefinido (¿rótulo genérico?); (b) filas anteriores a una eventual corrección del saneado: `fileLabels` debería escapar por construcción y no confiar en el saneado de la subida; (c) la prueba debe renderizar en navegador real (no solo comparar cadenas). Entregar a `/architect` (a) y `/seraph` (b, c). Severidad MEDIA.

### EDGE-005-28 — Archivo clínico de 0 bytes
- **Escenario**: subida de un `FILE` o `PHOTO` vacío; o fila heredada con `size_bytes = 0` que entra al resumen.
- **Resultado esperado**: 415 en la subida (`REQ-ARC-001` paso 2, `SC-ALM-005` de 004); el resumen exige `sizeBytes >= 1`.
- **Cobertura**: **CUBIERTO**: `REQ-ARC-001`/`SC-ALM-005` (004, sin cambio), `REQ-CLI5-003`; el esquema `clinicalFiles[].sizeBytes` tiene `minimum: 1`, así que un dato heredado inválido haría fallar la generación (ver 29, no hay regla de degradación). Severidad BAJA.

### EDGE-005-29 — Fechas de calendario y edad derivada en el límite de zona horaria
- **Escenario**: vacuna del `2026-11-03`; servidor y navegador en zonas distintas; a las 23:30 en Bogotá (UTC-5) el reloj UTC del servidor ya marca el día siguiente; cumpleaños de la mascota ese día; el enlace vence «en 7 días» y la vista muestra `validUntil` en hora local.
- **Resultado esperado**: las fechas guardadas salen tal cual (`YYYY-MM-DD`); la edad derivada es determinista y su día de referencia está fijado.
- **Cobertura**: **PARCIAL**. Fechas de calendario: **CUBIERTO** (`REQ-SUM-002` MAG-005-004, `SC-005-044`). **BRECHA** en la edad derivada: `REQ-SUM-001` incluye `age` calculada a partir del `generatedAt` inyectado (UTC), pero la spec no dice con qué fecha de calendario se resta (¿fecha UTC de `generatedAt`? ¿zona del hogar?). Cerca de la medianoche la edad (y días hasta «próxima dosis», si se calcula) puede diferir en un día respecto a lo que ve el cuidador. Verificar contra `REQ-PET-002` de 002 antes de decidir. **PENDIENTE NEO** solo si se elige una zona (decisión de producto); el cálculo en sí lo define `/architect`. También: `validUntil` y «Fecha de subida» se muestran en hora local mientras el contrato lleva UTC: puede verse un día distinto del que el cuidador esperaba al elegir «7 días» (documental, `/sati`).

---

## F. Impresión

### EDGE-005-30 — Enlace revocado mientras la vista está abierta y el veterinario imprime
- **Escenario**: el veterinario ya cargó la vista; el propietario revoca; el veterinario pulsa «Imprimir / Guardar como PDF». Variante: la SPA hace un refresco o reintento y recibe 404.
- **Resultado esperado**: imprimir no hace ninguna petición (`@media print`, sin recursos externos); la hoja sale con los datos ya entregados y la leyenda «Enlace vigente hasta <fecha>» puede estar obsoleta; un refresco recibe el 404 uniforme y la vista debe mostrar un estado de «enlace no disponible» sin dejar el resumen anterior como si fuera vigente.
- **Cobertura**: **PARCIAL**. `EDGE-005-07` cubre el vencimiento («la vista cargada sigue visible, ninguna petición nueva se sirve»); la revocación es análoga pero no está citada, y la hoja impresa de un enlace ya revocado lleva «vigente hasta» sin advertir que los datos son los de la carga. La hoja ya incluye «Datos al momento de esta consulta; pueden cambiar» (MAG-005-006, solo en vista web según `REQ-SUM-004`): **BRECHA menor**, `REQ-SUM-005` no lo exige en la hoja impresa. Entregar a `/architect`/`/sati`: extender `EDGE-005-07` a revocación y llevar MAG-005-006 a la hoja. El corte de datos ya entregados al navegador es una limitación inherente (aceptada por D5-12). Severidad BAJA.

---

## G. Respaldo y restauración

### EDGE-005-31 — Importación de respaldo que intenta revivir un enlace
- **Escenario**: el propietario importa un respaldo exportado cuando existía un enlace, o fabricado con tablas de enlaces.
- **Resultado esperado**: ninguna fila de `share_links` se importa ni exporta; la importación por reemplazo ejecuta la cascada (borra los enlaces de las mascotas reemplazadas).
- **Cobertura**: **CUBIERTO**: `REQ-VET-013`, `REQ-VET-010`, `data-model.md` §5 (RAMA-005-008), `SC-005-042` (el sobre `backup-envelope.schema.json` no cambia y es cerrado).

### EDGE-005-32 — Restauración de la BD (PITR o volcado) reactiva enlaces ya revocados
- **Escenario**: se restaura una copia anterior a la revocación; `revoked_at` vuelve a `NULL` y el token revocado resucita; ventana entre la restauración y la ejecución manual del runbook.
- **Resultado esperado**: tras restaurar, ejecutar `UPDATE share_links SET revoked_at = :now WHERE revoked_at IS NULL` **antes de reabrir el tráfico**; ningún enlace restaurado sirve datos.
- **Cobertura**: **BRECHA operativa (MEDIA-ALTA)**. `REQ-VET-013`/`data-model.md` §5 fijan el runbook (T795, `/link`), pero es un paso humano sin compuerta técnica: nada impide que el servicio arranque sobre la copia restaurada y sirva enlaces revocados hasta que alguien ejecute el `UPDATE`. Tampoco hay prueba que verifique el runbook, ni regla para el caso en que el volcado contenga enlaces que el propietario no reconozca (aparecen ACTIVOS en la lista hasta el `UPDATE`). Opciones que no se deciden aquí: bandera de arranque («modo restauración» que revoca al iniciar) o ejecutar el `UPDATE` como paso del script de restauración. **PENDIENTE NEO** únicamente si se acepta la ventana como riesgo residual. Entregar a `/architect`/`/link`.

---

## H. Límites de tasa y disponibilidad (adicional)

### EDGE-005-33 — IP compartida: el veterinario legítimo recibe 429 por fallos ajenos
- **Escenario**: una clínica con NAT/IPv6 /64 compartida; un cliente suyo teclea mal 20 tokens, o un bot desde la misma IP efectiva; el veterinario con un token válido recibe 429 durante 10 minutos. Con varias instancias de Cloud Run el límite es por instancia (efectivo ~20 × N).
- **Resultado esperado**: 429 `ERR-SHARE-RATE-LIMITED` con `Retry-After: 600`; el valor correcto no se distingue de uno falso.
- **Cobertura**: **CUBIERTO como decisión**: `REQ-VET-007`, `D5-13`, `SC-005-021`, `SC-005-041`, `TECHDEBT-005-01` (mapa en memoria, diferido Cloud Armor). **PARCIAL**: el texto dice «solo cuenta fallos» pero no aclara si un token válido desde una IP ya limitada recibe 429 (la spec implica que sí; `INV-005-007`); es una limitación aceptada con coste de disponibilidad para el veterinario. Documental. **PENDIENTE NEO** solo si se quiere eximir a tokens válidos (cambia el modelo de amenaza, decisión `/trinity`).

---

## Tabla final

| ID | Tema | Cobertura | Severidad | Dueño sugerido |
|---|---|---|---|---|
| EDGE-005-11 | Subidas concurrentes en el tope / borrado intercalado | CUBIERTO (+ nota de candado en borrado) | MEDIA-BAJA | `/architect` |
| EDGE-005-12 | Caché del parámetro por instancia | PARCIAL | BAJA | `/architect` |
| EDGE-005-13 | Dos revocaciones | CUBIERTO | — | — |
| EDGE-005-14 | Revocación durante lectura; aislamiento de la «transacción de lectura» | BRECHA (b) | MEDIA | `/architect`, `/seraph` |
| EDGE-005-15 | Enlace 21.º en paralelo en hogar (candado por creador) | BRECHA | ALTA | `/architect` |
| EDGE-005-16 | Se pierde la respuesta de creación | BRECHA / PENDIENTE NEO | MEDIA | `/architect`, `/sati`, Neo |
| EDGE-005-17 | Doble clic / reintento en crear | BRECHA | BAJA | `/sati` |
| EDGE-005-18 | Creador pierde rol en la sesión | CUBIERTO | — | `/kid` T791 |
| EDGE-005-19 | Mascota sale del hogar | CUBIERTO | — | — |
| EDGE-005-20 | Cambio de propietario (ex-dueño `ADMIN`) | BRECHA / PENDIENTE NEO | MEDIA-ALTA | `/architect`, Neo |
| EDGE-005-21 | Creador `ADMIN` elimina cuenta | CUBIERTO | BAJA | `/sati` |
| EDGE-005-22 | Exposición automática por alcance dinámico | CUBIERTO (decisión) / PARCIAL UX | BAJA | `/sati` |
| EDGE-005-23 | URL firmada 300 s y revocación; mínimo de `X-Goog-Expires` | CUBIERTO / PARCIAL (redondeo) | BAJA | `/architect` |
| EDGE-005-24 | TTL vence durante la lectura; un solo `now` | PARCIAL | BAJA-MEDIA | `/architect`, `/seraph` |
| EDGE-005-25 | Token mal formado y URL degenerada (Fastify) | PARCIAL / BRECHA | ALTA | `/architect`, `/trinity` |
| EDGE-005-26 | Mascota sin fotos / sin registros | CUBIERTO | — | `/seraph` |
| EDGE-005-27 | Nombre con control/HTML/vacío | PARCIAL | MEDIA | `/architect`, `/seraph` |
| EDGE-005-28 | Archivo de 0 bytes | CUBIERTO | BAJA | — |
| EDGE-005-29 | Fechas y edad en zona horaria | PARCIAL (edad: BRECHA) | MEDIA | `/architect`, `/maggie` |
| EDGE-005-30 | Revocado con la vista abierta e impresión | PARCIAL | BAJA | `/architect`, `/sati` |
| EDGE-005-31 | Importación de respaldo vs enlaces | CUBIERTO | — | — |
| EDGE-005-32 | Restauración reactiva enlaces revocados | BRECHA operativa / PENDIENTE NEO | MEDIA-ALTA | `/architect`, `/link` |
| EDGE-005-33 | IP compartida y 429 al veterinario válido | CUBIERTO (decisión) / PARCIAL | BAJA | `/trinity` |

**Cuenta**: CUBIERTO 10, PARCIAL 7, BRECHA 6 = 23 nuevos (011..033); total 005 = 33.

## Decisiones PENDIENTE NEO (no decididas)

1. **EDGE-005-16**: aceptar o no el riesgo residual de enlace activo sin URL visible tras perder la respuesta de creación (idempotencia vs. revocar y recrear).
2. **EDGE-005-20**: si el enlace `PET` sobrevive o muere con la transferencia de propiedad (y si el ex-propietario con rol `ADMIN` conserva autoridad).
3. **EDGE-005-29**: solo si se pretende fijar una zona horaria de referencia para la edad derivada.
4. **EDGE-005-32**: aceptar la ventana de restauración como riesgo residual o exigir compuerta técnica.
5. **EDGE-005-33**: solo si se quiere eximir a tokens válidos del 429 (cambia el modelo de amenaza).

## Entrega

- A `/architect` (cambios de spec/contrato): 11 (borrado y candado), 12, 14, 15, 16/17, 20, 23, 24, 25, 27, 29, 30, 32.
- A `/seraph` y `/trinity` (pruebas negativas): 14b (dos conexiones en PostgreSQL real), 15, 24 (reloj avanzando), 25 (longitudes y `%` inválido), 26, 27 (render real).
- A `/sati`: 16, 17, 21, 22, 29, 30.
- A `/link`: 32 (compuerta o script de restauración).
- A `/kid` (T791): 18, 19, 21.
