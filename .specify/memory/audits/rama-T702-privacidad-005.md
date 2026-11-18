# T702 — Auditoría de privacidad y datos de la feature 005 (Rama, solo lectura)

Fecha: 2026-11-18 · Rama: 005-album-archivos-clinicos (HEAD 9627f32) · Alcance: `specs/005-*/{spec,plan,tasks}.md`, 004 (`REQ-GCS-004/006`, `REQ-ARC-003`, `REQ-BOR-004/005`, `NFR-ALM-002`), `src/infrastructure/http/plugins/problem-details.ts` y `cloud-logging.ts` (lectura). Sin ediciones de spec, contratos, código ni pruebas; sin commit ni push.

## 0. Veredicto

**ACEPTABLE CON CONDICIONES.** La solución de D5-06 y la de D5-14 son correctas en diseño. Hay 4 hallazgos ALTA que **bloquean T750 y T770** (gate declarado en `plan.md` §3 punto 3) hasta que se absorban en spec/plan/contratos, y 3 puntos **PENDIENTE NEO**.

| Verificación | Resultado |
|---|---|
| D5-06 (nombre solo en la vista, nunca en registros) | **CUMPLE CON CONDICIONES** (C-1..C-5) |
| D5-14 (microchip excluido por defecto) | **CUMPLE** (C-6..C-7) |
| D5-05 corte inmediato | CUMPLE CON CONDICIÓN (RAMA-005-006, ventana de URL firmada) |
| D5-11 / D5-12 | CUMPLE CON CONDICIONES (RAMA-005-008, 009) |
| Aislamiento por alcance (INV-005-001) | CUMPLE en diseño; falta ruta de archivos (RAMA-005-002) |
| Atomicidad subida con tope / crear enlace | CUMPLE en diseño; condiciones A-1..A-6 |

## 1. Hallazgos

| ID | Sev. | Hallazgo | Refs |
|---|---|---|---|
| RAMA-005-001 | **ALTA** | **El token viaja en la ruta (`/shared/{token}/summary`) y hoy se filtra por tres canales que `REQ-VET-008` no cubre.** (a) Registro de petición de Cloud Run (`run.googleapis.com/requests`, URL completa), que la plataforma escribe fuera del control de la app (lo reconoce `cloud-logging.ts` líneas 7-8). (b) `serializeRequest` del logger de Fastify (`req` serializer) si registra `url`. (c) `problem-details.ts`: `sendProblem` pasa `requestPath(request)` a `toProblemDetails` y lo emite como `instance` de RFC 9457; en la ruta pública el 404/429 devolvería el token y lo dejaría en cualquier traza de errores. Contradice `INV-005-005` y `SC-005-015/022` ("ningún registro contiene el token"). | REQ-VET-006/008, INV-005-005, NFR-005-001, EDGE-005-06 |
| RAMA-005-002 | **ALTA** | **Contradicción interna: "única ruta" vs descarga de archivos.** `REQ-VET-006` y `INV-005-002` fijan una sola ruta `GET /shared/{token}/summary`, pero `REQ-VET-009` exige URL firmada "emitida solo tras resolver el token". Falta definir cómo se obtiene: o bien (A) la vista HTML incrusta las URL firmadas al renderizar (caducan en <= TTL, la página recargada las regenera) o (B) una segunda ruta `GET /shared/{token}/files/{mediaId}` que re-resuelve el token y redirige 302. Sin definirlo, T750/T758 no pueden probar IDOR de `mediaId` entre mascotas/alcances. | REQ-VET-006, REQ-VET-009, INV-005-001 |
| RAMA-005-003 | **ALTA** | **Inconsistencia plan/spec sobre el nombre de archivo.** `plan.md` §1.5 dice `clinicalFiles[]` "nombre solo según D5-06"; `REQ-SUM-003` lo excluye del read-model. Si el esquema (T706) toma el plan, el nombre entra en el JSON determinista que Fase 5 enviará a IA y en cualquier caché del resumen. Debe prevalecer la spec. | REQ-SUM-003, REQ-SUM-006, D5-06 |
| RAMA-005-004 | **ALTA** | **Autoridad del creador no revalidada.** `REQ-VET-010` cubre eliminar mascota, hogar o cuenta, pero no que el `ADMIN` que creó un enlace `HOUSEHOLD` sea degradado o retirado del hogar, ni que la mascota cambie de propietario: el enlace seguiría exponiendo datos clínicos que su creador ya no puede ver (derecho de revocación del titular). Además un `ADMIN` que no es propietario legal de todas las mascotas del hogar expone con un solo enlace datos de otros titulares (ver P-1). | REQ-VET-001/002/010, D5-10, INV-ACC2-001 |
| RAMA-005-005 | MEDIA | **Retención de la auditoría de accesos sin definir**; la IP es dato personal. `REQ-VET-008` dice "HMAC de la IP si se registra" sin clave, dominio ni plazo. HMAC de IPv4 con clave filtrada o débil es reversible por fuerza bruta (2^32). Los accesos fallidos los provoca un atacante sin sesión: filas ilimitadas (minimización y costo). Tras eliminar cuenta/enlace persisten los ids de enlace en auditoría (ver RAMA-004-001: UUID en claro tras eliminar cuenta). | REQ-VET-008, NFR-005-001, INV-005-002 |
| RAMA-005-006 | MEDIA | **"Corte inmediato" (D5-05) y revocación (D5-12) tienen una ventana residual**: una URL firmada ya emitida sigue válida hasta su TTL (`EDGE-010` de 004; `ARGOS_MEDIA_SIGNED_URL_TTL_SECONDS` por defecto 300, techo 900). Con la misma variable, la superficie pública heredaría hasta 900 s. | D5-05, D5-06, D5-12, REQ-ARC-003 (004) |
| RAMA-005-007 | MEDIA | **Datos de terceros en texto libre y en archivos.** `medicalVisits`, `symptoms`, `otherParameters` son texto libre (pueden contener teléfonos, nombres de personas, direcciones); no hay allow-list por contenido. Los `kind FILE` se sirven tal cual: PDF de laboratorio con nombre y teléfono del dueño, JPEG con EXIF GPS (domicilio). D5-06 comparte **todos** los `FILE`, sin selección por archivo. | REQ-SUM-001/003, REQ-VET-009, D5-04, EDGE-005-09 |
| RAMA-005-008 | MEDIA | **Restauración y respaldos reviven enlaces.** PITR (6 h) y dumps (14 d) contienen `share_links`; tras una restauración, enlaces revocados o eliminados pueden volver a estar ACTIVOS. La exportación/importación de respaldo de 004 no declara qué hace con `share_links`/`platform_parameters` (una importación que restaurara `token_hash` resucitaría accesos). La importación por reemplazo borra mascotas: debe cumplir `REQ-VET-010` (cascada). | REQ-VET-010, REQ-IMP-001/REQ-PG-011 (004), EDGE-005-05 |
| RAMA-005-009 | BAJA | **TTL**: el `CHECK (expires_at > created_at)` no impone el máximo de 30 d (D5-11); si el cliente enviara `expiresAt` libre se podría crear un enlace de años. No hay purga de filas VENCIDO/REVOCADO (acumulación sin valor). `DELETE /share-links/{id}` es ambiguo entre revocar (conserva fila, estado REVOCADO listable) y borrar. | REQ-VET-004/005, D5-11, D5-12 |
| RAMA-005-010 | BAJA | **Sin lectura transaccional única** al construir el resumen `HOUSEHOLD`: una mascota retirada a mitad de la petición podría quedar en una respuesta parcial. | REQ-VET-002, D5-05 |
| RAMA-005-011 | BAJA | **Bypass del tope por `kind`**: un JPEG puede subirse como `FILE` y no cuenta para las 10 fotos (diseño aceptado, SC-005-006); el tope no es control de privacidad, y una foto familiar mal clasificada como `FILE` se expondría al veterinario. | REQ-ALB5-002, REQ-VET-009 |
| RAMA-005-012 | BAJA | **Rate limit en memoria por instancia** (D5-13) y confianza en `X-Forwarded-For`: la IP usada para el límite y para el HMAC debe ser la de confianza de Cloud Run, no la cabecera del cliente. Se delega a `/trinity` (T703). | REQ-VET-007, D5-13 |

## 2. Dictamen D5-06 (nombre original solo en la vista; URL firmada de TTL corto)

**La solución del Architect cumple privacidad**, con condiciones. Razones: el nombre original (`pet_media.original_name`) no está en `ClinicalSummary` (`REQ-SUM-003`), por lo que no puede llegar al JSON consumido por Fase 5, a cachés ni a auditoría; la URL firmada V4 lleva `response-content-disposition: inline; filename="archivo.pdf"` neutro (`REQ-ARC-003` de 004, D-14 A), así que el nombre real tampoco sale por la URL, el historial ni los registros del bucket; `redactSecrets` (`SENSITIVE_FIELDS` ya contiene `original_name`, `x-argos-filename`, `signed_url`, patrón `X-Goog-*`) cubre los registros de la aplicación. Condiciones, todas verificables por prueba:

- **C-1 (derivación segura)**: la capa de presentación obtiene el nombre con una consulta aparte (`pet_media.original_name` por `id` y solo de los `clinicalFiles` ya autorizados por el alcance del token), nunca desde el read-model. La vista HTML se renderiza en servidor; el JSON de la misma ruta, si se ofrece, **no** lleva nombres.
- **C-2 (escape y saneado)**: el nombre se inserta como texto escapado (nunca HTML crudo ni atributo sin escapar), ya saneado por `REQ-ARC-004`; no va en `<title>`, ni en URL, ni en cabeceras de respuesta, ni en mensajes de error.
- **C-3 (sin registros)**: ni el logger, ni la auditoría de acceso, ni `problem+json` reciben `original_name`; añadir al conjunto de pruebas de redacción (NFR-ALM-002) la ruta pública y comprobar con `stdout` capturado (SC-005-022/023).
- **C-4 (TTL de la superficie pública)**: tope duro de 300 s para las URL firmadas del enlace, aunque `ARGOS_MEDIA_SIGNED_URL_TTL_SECONDS` esté configurado más alto (RAMA-005-006); cada URL se emite tras re-resolver el token (vigencia, revocación, pertenencia del `mediaId` al alcance).
- **C-5 (aviso de la impresión)**: al imprimir o "Guardar como PDF" el nombre queda en el documento del veterinario; es consecuencia aceptada de D5-06. Informarlo en el diálogo de compartir (texto de `/sati`, T705).
- **Resolver RAMA-005-001/002/003** antes de implementar.

## 3. Dictamen D5-14 (microchip excluido por defecto)

**CUMPLE.** `include_microchip INTEGER NOT NULL DEFAULT 0` en `share_links` y la decisión queda en el `ShareLink` (REQ-SUM-003). El microchip es un identificador con el que registros externos pueden llegar al titular, por eso debe ser opt-in:

- **C-6**: `buildClinicalSummary(datos, ahora, opciones)` recibe `includeMicrochip` como parámetro de entrada (preserva determinismo, REQ-SUM-002); el campo en el esquema es opcional y ausente cuando es `false`, no `null`.
- **C-7**: inmutable tras crear el enlace (cambiarlo exige revocar y crear otro); la casilla nace desmarcada; en `HOUSEHOLD` aplica a todas las mascotas y la UI lo dice; la "Vista previa" (D5-15) refleja la elección; el microchip sigue en `SENSITIVE_FIELDS` de redacción (15 dígitos) y fuera de la auditoría.

## 4. Decisiones de privacidad (para el Architect/Keymaker salvo las marcadas PENDIENTE NEO)

| ID | Decisión / requisito | Refs |
|---|---|---|
| DP-1 | **Token fuera de todo registro.** Obligatorio: (i) no registrar `url` ni ruta en el serializer `req` para `/shared/*` (registrar la plantilla `/shared/:token/…` o solo `reqId`); (ii) la ruta pública emite `instance` constante (o la omite) en `problem+json`; (iii) filtro de exclusión de Cloud Logging para `httpRequest.requestUrl` que contenga `/shared/` en el sumidero `_Default` (IaC, sin costo; **dueño `/link`**, es cambio de Terraform: si no se acepta, el token queda en `run.googleapis.com/requests` durante la retención del sumidero y debe documentarse como riesgo residual); (iv) prueba que inyecta un token y verifica ausencia en `stdout`, auditoría y cuerpo de error. Alternativa de diseño que elimina la fuga de raíz: token en fragmento `#` leído por script propio (cambio de arquitectura; **PENDIENTE NEO** si se prefiere sobre el filtro). | REQ-VET-008, INV-005-005, NFR-005-001, SC-005-015/022, EDGE-005-06 |
| DP-2 | **Una sola superficie coherente**: definir en T706 si hay segunda ruta de archivos; si la hay, mismas cabeceras, mismo 404 uniforme y re-resolución del token; `mediaId` validado contra el conjunto de mascotas del token y `kind = FILE` (nunca `PHOTO`). Reescribir `REQ-VET-006`/`INV-005-002` en consecuencia. | REQ-VET-006/009, INV-005-001/004 |
| DP-3 | **Esquema** `clinical-summary.schema.json`: `clinicalFiles[]` solo `{id, mime, sizeBytes, createdAt}`; corregir `plan.md` §1.5 (RAMA-005-003). Sin `original_name`, claves de objeto, URLs ni `kind PHOTO`. | REQ-SUM-003, INV-005-004 |
| DP-4 | **Resolución con autoridad vigente**: en cada acceso, además de token/caducidad/revocación, comprobar que el creador conserva autoridad (propietario legal o `ADMIN` del hogar en ese instante); si no, mismo 404 uniforme. Para `HOUSEHOLD`, el conjunto de mascotas se calcula por consulta en cada petición (D5-05), sin instantánea ni caché, filtrando las mascotas sobre las que el creador ya no tiene `CREATE_SHARE_LINK`. Lectura en una sola transacción de lectura (RAMA-005-010). | D5-05, D5-10, REQ-VET-002/010 |
| DP-5 | **Auditoría de accesos**: HMAC-SHA-256 de la IP con clave dedicada (Secret Manager, >= 32 bytes, separada de las claves de sesión, rotable); nunca la IP en claro; nunca el token ni fragmentos (ni prefijo) del token intentado; fallos que no resuelven a un enlace se **agregan** (contador por ventana/HMAC) en vez de una fila por intento, y sin escritura de BD durante un 429. Si la escritura de auditoría falla en un acceso válido: **fail-closed** (el resumen no se sirve; respuesta genérica sin detalle). Retención: ver P-2. | REQ-VET-008, INV-005-002, NFR-005-001 |
| DP-6 | **Ciclo de vida de enlaces**: `share_links` (y `platform_parameters`) **excluidos** de exportación e importación de respaldo (y de la importación por reemplazo/fusión); la importación por reemplazo ejecuta la cascada de `REQ-VET-010`; `PRAGMA foreign_keys = ON` verificado en SQLite (prueba de paridad); el runbook de restauración (PITR/dump) añade el paso "invalidar todos los enlaces (`revoked_at = now`) tras restaurar". Purga diaria (mantenimiento `REQ-CLD-007`) de filas con `expires_at` o `revoked_at` anteriores a 30 días (plazo propuesto, ver P-2). | REQ-VET-010, REQ-IMP-001, REQ-PG-011, EDGE-005-05 |
| DP-7 | **Caducidad**: el cliente envía solo `{1,7,30}` días (enumeración); el servidor calcula `expires_at = createdAt + n días` con `ClockPort`; rechazar cualquier otro valor; comparación de vigencia con reloj inyectado (límite exacto cubierto en prueba). `DELETE /share-links/{id}` = revocar (marca `revoked_at`, idempotente, audita), no borrar fila. | D5-11, D5-12, REQ-VET-004/005, EDGE-005-07 |
| DP-8 | **Aviso de consentimiento en el diálogo de compartir** (texto de `/sati`): el veterinario verá todos los archivos clínicos, el texto libre de consultas y parámetros, y (si se marca) el microchip; los archivos pueden contener datos del dueño o ubicación; la URL es una credencial; caduca en N días; se puede revocar. La vista previa autenticada (D5-15) debe ofrecerse antes del botón "Crear enlace". | D5-06, D5-14, D5-15, REQ-SUM-004 |
| DP-9 | **Ventana de revocación documentada**: tras revocar, retirar mascota o eliminar un archivo, una URL firmada ya emitida vive <= 300 s (RAMA-005-006); `SC-005-017/019` deben afirmar corte de la API y de la emisión, no de URLs ya emitidas. Documentar junto a `EDGE-010` de 004. | D5-05, D5-12, EDGE-005-04 |
| DP-10 | **Borrado de archivos clínicos**: sin cambios respecto a 004 (`REQ-GCS-004`, retención 0, `REQ-BOR-004`); en 005 el resumen se calcula bajo demanda, no hay copia persistente del contenido clínico ni del nombre, de modo que borrar un `FILE` lo retira del enlace en la siguiente petición. Prohibido añadir caché/almacén del `ClinicalSummary`. | REQ-GCS-004, NFR-005-004, EDGE-005-05 |

## 5. Atomicidad

### 5.1 Subida de foto con tope (REQ-ALB5-002, INV-005-003, EDGE-005-02): CUMPLE EN DISEÑO
La secuencia heredada de `REQ-GCS-006` (INTENT en tx corta, `put`, tx final con candado de mascota, borrado de INTENT) es correcta. Condiciones:
- **A-1**: en la tx final, tomar primero el candado (`SELECT … FOR UPDATE` / `BEGIN IMMEDIATE`) y **después** contar `kind = 'PHOTO'`; contar antes del candado reintroduce la carrera.
- **A-2**: ante `ERR-MEDIA-ALBUM-LIMIT` tras el `put`: `rollback` completo (sin fila `pet_media`, sin auditoría de subida), INTENT -> `DELETE` y borrado inmediato; la 409 no revela el recuento exacto de otros datos.
- **A-3**: comprobación previa al `put` solo como rechazo barato, nunca autoritativa; sin cuota consumida por rechazos (`REQ-ALB5-002`).
- **A-4**: el valor de `maxPhotosPerPet` se lee una vez al inicio de la operación; la caché de <= 60 s (D5-07) permite excedentes transitorios de hasta una ventana tras bajar el parámetro; aceptable y documentable (`INV-005-003` ya usa `max(tope, conteo previo)`).
- **A-5**: `FILE` no cuenta y comparte cuota (REQ-CLI5-003): el conteo de cuota y el de tope son consultas separadas dentro de la misma tx.
- **A-6**: prueba con conexiones intercaladas en SQLite y Postgres (SC-005-003) y prueba de corte entre `put` e INSERT (conciliación `REQ-GCS-006`, `INV-GCS-002`).

### 5.2 Crear enlace (REQ-VET-001/003, INV-005-005): CUMPLE EN DISEÑO
- Orden obligatorio: generar token en memoria -> **una sola transacción** {revalidar permiso `CREATE_SHARE_LINK` bajo el candado de la mascota (o del hogar), validar alcance, insertar `share_links` con `token_hash`, insertar auditoría de creación} -> `COMMIT` -> **solo entonces** devolver la URL. Si falla cualquier paso: rollback total, token descartado, nada devuelto.
- Si la respuesta se pierde después del `COMMIT` el token es irrecuperable por diseño (INV-005-005): el enlace queda ACTIVO sin dueño que lo conozca; la UI lo lista y permite revocar (no recrear silenciosamente).
- Respuesta de creación con `Cache-Control: no-store`; la URL no se registra, no se audita y no se reenvía a ningún tercero.
- Revocar: `UPDATE … SET revoked_at WHERE id = ? AND revoked_at IS NULL` + auditoría en la misma tx; idempotente.
- Eliminación de mascota/hogar/cuenta: cascada de `share_links` en la misma tx (REQ-VET-010) y borrado de objetos por la cola `DELETE` de 004.

## 6. Checklist verificable (T702)

- [ ] DP-1: prueba con token inyectado ausente de `stdout`, auditoría, `instance` y serializer `req`; filtro de exclusión de Cloud Logging acordado con `/link` (o riesgo residual documentado).
- [ ] DP-2: `REQ-VET-006`/`INV-005-002` reescritos; `mediaId` fuera de alcance responde 404 uniforme.
- [ ] DP-3: `clinical-summary.schema.json` sin nombre ni claves; `plan.md` §1.5 corregido.
- [ ] DP-4: acceso falla uniforme cuando el creador pierde autoridad; HOUSEHOLD sin instantánea.
- [ ] DP-5: clave HMAC dedicada; agregación de fallos; fail-closed de auditoría.
- [ ] DP-6: `share_links` fuera de export/import; cascada en importación por reemplazo; invalidación tras restauración; `foreign_keys` verificado.
- [ ] DP-7: caducidad solo `{1,7,30}`; `DELETE` = revocar.
- [ ] DP-8/9: textos de consentimiento y ventana de 300 s en UI y spec.
- [ ] C-1..C-7 y A-1..A-6 con prueba asociada.
- [ ] T793 (revisión posterior de `/rama`): re-ejecuta este checklist sobre código.

## 7. PENDIENTE NEO (no decididos por Rama)

- **P-1 (RAMA-005-004)**: enlace `HOUSEHOLD` creado por un `ADMIN` que no es propietario legal de todas las mascotas. Opciones: (a) permitir (el `ADMIN` decide por todos); (b) incluir solo las mascotas que el creador posee legalmente; (c) exigir que el creador sea propietario de todas. Recomendación de Rama: (b).
- **P-2 (RAMA-005-005, 009)**: retención de auditoría de accesos al enlace y de filas VENCIDO/REVOCADO. Propuesta de Rama: auditoría de accesos 90 días, filas de enlaces vencidos/revocados 30 días, HMAC de IP rotado trimestralmente.
- **P-3 (RAMA-005-007)**: compartir **todos** los `FILE` es el alcance firmado en D5-06; falta decidir si se ofrece selección por archivo (o casilla "incluir archivos clínicos") para minimizar datos de terceros dentro de PDF/imágenes. Recomendación de Rama: casilla única "Incluir archivos clínicos" por enlace (valor por defecto a criterio de Neo) en lugar de selección por archivo.

Además, de existir la opción (iii) de DP-1 (filtro Terraform de Cloud Logging) es un cambio de IaC: la aprueba `/link` y, si toca recursos nuevos de pago o IAM, Neo (Nivel 2).

## 8. Referencias
`spec.md` (`REQ-ALB5-*`, `REQ-VET-*`, `REQ-SUM-*`, `INV-005-001..005`, `EDGE-005-01..10`, `D5-01..D5-15`), `plan.md` §1.5, §2.2, ADR-005-03; 004: `REQ-GCS-004/006`, `REQ-ARC-003/004`, `REQ-BOR-004/005`, `NFR-ALM-002`, `EDGE-010`; `src/infrastructure/http/plugins/problem-details.ts` (`requestPath` -> `instance`), `src/infrastructure/http/cloud-logging.ts` (`SENSITIVE_FIELDS`, `serializeRequest`, nota de `run.googleapis.com/requests`); informe previo `.specify/memory/audits/rama-004-lifecycle.md` (RAMA-004-001..021).
