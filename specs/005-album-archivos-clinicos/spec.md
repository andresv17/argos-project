# Feature Specification: Álbum, archivos clínicos, cancelar edición, enlace veterinario y ClinicalSummary (Feature 005, Fase 4B)

**Feature Branch**: `005-album-archivos-clinicos` (creada desde `origin/main` 906671e; sin push)
**Created**: 2026-11-17
**Status**: `DRAFT` (borrador del Architect). Ningún documento está `APPROVED` ni `LOCKED` (potestad exclusiva de Neo, Nivel 2). Toda tarea nace `[ ]`.
**Input**: `claude/backlog-fase-4b.md` (5 requerimientos obligatorios de Neo tras el despliegue de 004, T597 firmada en 44c83e0) y la spec, el plan, el modelo de datos y los contratos de 004 (solo lectura).
**Contratos de 004**: tratados como `LOCKED`. Esta spec **no los edita**. Todo cambio que exijan se lista en «Decisiones pendientes de Neo» (`D5-*`) como enmienda por firmar; ninguno se aplica aquí.

## Verificación de premisas (lectura del estado real en disco)

- `pet_media` ya distingue `kind IN ('FILE','PHOTO')` (`specs/004-*/data-model.md` §2). `INV-ARC-001`: `PHOTO` acepta JPEG, PNG y WebP; `FILE` acepta JPEG, PNG, WebP y PDF. Por tanto **Álbum = `kind PHOTO`** y **Archivos clínicos = `kind FILE`** sin ampliar el enum del contrato; el cambio es de presentación y de regla de límite.
- **La cifra «24» de 004 es el tamaño de página, no un tope**: `REQ-ALB-001` pagina de 24 en 24 y `REQ-ARC-005` (`K-10`) declara «no hay tope de elementos por mascota». El backlog dice «límite bajado de 24 a 10 fotos»: se interpreta como un **tope nuevo de 10 fotos de álbum por mascota** (y, por coherencia, el álbum deja de necesitar paginación de 24). Esto contradice `K-10` y `REQ-ALB-001`/`INV-ALB-001` de 004 y exige la enmienda `D5-01`.
- Existe el permiso `WRITE_MEDIA`/`READ_MEDIA`/`DELETE_MEDIA` en la matriz `REQ-RBAC-001` (002) y la cuota de 1 GiB por propietario (`REQ-ARC-005`); ninguna tabla de parámetros de plataforma existe hoy (todo es variable de entorno).
- No existe ningún mecanismo de acceso sin sesión: toda ruta exige cookie y CSRF (002/004). El enlace veterinario es la **primera superficie pública autenticada por capacidad** (token), de ahí los gates de `/trinity` y `/rama`.
- `verify-traceability.sh --feature 005` acepta el argumento pero aborta con «Fuente ausente: specs/005-…/contracts» hasta que T706 cree los contratos (ver `tasks.md`, T709).

## Alcance y no alcance

**Dentro**: sección «Álbum»; sección «Historial / Archivos»; límite de fotos de álbum parametrizable en BD (sin UI); botón «Cancelar» en 6 formularios clínicos; enlace de solo lectura para veterinario (mascota u hogar); read-model `ClinicalSummary` con vista web de solo lectura y versión imprimible.
**Fuera**: UI de administración de parámetros y perfil de administrador de plataforma (solo se deja la estructura de BD lista, `REQ-PRM-003`); integración de IA y reportes (Fase 5; solo se garantiza que `ClinicalSummary` sea su entrada); galería de hogar (`TECHDEBT-004-03`, se mantiene diferida salvo decisión de Neo); 4C, 4D; correo, SSO; miniaturas en servidor; PDF generado en servidor (ver `D5-08`); dependencias nuevas (Nivel 2).

## Supuestos

- Un hogar contiene mascotas asignadas (`REQ-HOUSE2-*`, 002); «compartir un hogar» significa compartir las mascotas asignadas a ese hogar (`[NEEDS CLARIFICATION D5-05]`: foto instantánea o dinámica).
- Los archivos clínicos ya existentes (`kind FILE`) y las fotos existentes (`kind PHOTO`) se migran sin cambio de datos: ya caen en la sección correcta por su `kind`.
- El veterinario no tiene cuenta en ARGOS (no se crea rol ni usuario).

## User Scenarios & Testing

### User Story 1 — Tener un álbum de fotos de mi mascota separado de lo clínico (P1)
Subir y ver la galería directamente desde una sección «Álbum», con un máximo de 10 fotos por mascota.
**Why this priority**: es el requerimiento 1 de Neo y desbloquea la separación UX.
**Independent Test**: `SC-005-001..006`.
1. **Given** una mascota sin fotos, **When** abro «Álbum», **Then** veo la galería vacía y el botón de subir y no veo archivos clínicos.
2. **Given** una mascota con 10 fotos, **When** intento subir la undécima, **Then** se rechaza con un error claro y el servidor no guarda ni deja objeto huérfano.
3. **Given** el parámetro cambiado en BD a 12, **When** subo la undécima, **Then** se acepta (sin redeploy ni UI).

### User Story 2 — Guardar resultados de exámenes y radiografías con el historial clínico (P1)
En «Historial / Archivos», junto a peso, medidas, vacunas, desparasitaciones, consultas y parámetros, subir y ver archivos clínicos de control.
**Independent Test**: `SC-005-007..011`.
1. **Given** «Historial / Archivos», **When** subo un PDF de examen, **Then** aparece en esa sección y **no** en el Álbum.
2. **Given** una radiografía en JPEG, **When** la subo como archivo clínico, **Then** se acepta y no cuenta contra el límite del álbum.

### User Story 3 — Poder cancelar una edición sin guardar (P2)
Un botón «Cancelar» explícito al editar medidas, vacunas, pesos, desparasitaciones, consultas y parámetros.
**Independent Test**: `SC-005-012..014`.
1. **Given** un formulario de edición con cambios, **When** pulso «Cancelar», **Then** vuelvo a la lista, el registro no cambia y no se envía ninguna petición de escritura.

### User Story 4 — Compartir el expediente con mi veterinario con un enlace de solo lectura (P1)
Generar un enlace eligiendo una mascota o un hogar completo, que el veterinario abre sin cuenta.
**Why this priority**: requerimiento 4 de Neo; es la superficie de mayor riesgo de la feature.
**Independent Test**: `SC-005-015..026`.
1. **Given** una mascota mía, **When** genero un enlace «solo esta mascota», **Then** el veterinario ve únicamente el resumen clínico de esa mascota.
2. **Given** un enlace revocado o vencido, **When** se abre, **Then** responde exactamente igual que un enlace inexistente.
3. **Given** el enlace de una mascota, **When** se altera el token o se piden rutas de otra mascota, **Then** no se obtiene dato alguno.

### User Story 5 — Un resumen clínico único, imprimible y reutilizable (P1)
Una vista web de solo lectura con versión imprimible, alimentada por un read-model JSON determinista que Fase 5 consumirá.
**Independent Test**: `SC-005-027..033`.
1. **Given** los mismos datos, **When** se genera dos veces el resumen, **Then** el JSON es idéntico byte a byte (salvo el instante de generación inyectado).
2. **Given** una mascota con álbum y datos privados, **When** se genera el resumen, **Then** no aparecen fotos del álbum ni los campos excluidos.

### Edge Cases

- **EDGE-005-01**: mascotas con más de 10 fotos de 004 (no había tope): no se borra nada; se bloquea solo la subida de nuevas y se informa (`REQ-ALB5-003`).
- **EDGE-005-02**: dos subidas concurrentes con 9 fotos: bajo el candado de mascota solo una pasa; la otra recibe el error de límite y su objeto en GCS pasa a la cola (reutiliza `REQ-GCS-006`).
- **EDGE-005-03**: parámetro ausente, no numérico, 0 o negativo en BD: se usa el valor por defecto del código (10) y se registra un aviso sin datos (`REQ-PRM-002`).
- **EDGE-005-04**: enlace de hogar y una mascota se reasigna o se elimina después de crear el enlace (`D5-05`).
- **EDGE-005-05**: el propietario elimina la mascota o su cuenta: todos sus enlaces dejan de resolver de inmediato (borrado en cascada).
- **EDGE-005-06**: token en el `Referer`, en historial del navegador, en registros del proxy o en un chat reenviado (riesgo aceptable solo con TTL acotado y revocación; `/trinity`).
- **EDGE-005-07**: el veterinario pulsa «imprimir» en un enlace que caduca durante la sesión: la vista ya cargada sigue visible, ninguna petición nueva se sirve.
- **EDGE-005-08**: pulsar «Cancelar» con la petición de guardado ya en vuelo: el guardado manda; «Cancelar» se deshabilita mientras se guarda.
- **EDGE-005-09**: archivo clínico con nombre con datos personales (`Análisis Luna.pdf`) en el resumen: el nombre original se muestra al veterinario (decisión `D5-06`) pero nunca va a registros.
- **EDGE-005-10**: bots o rastreadores que sigan el enlace: `noindex`, sin cookies, sin enlaces salientes, límite de tasa.

## Requirements

### Álbum y archivos clínicos (US1, US2)

- **REQ-ALB5-001** (Sección «Álbum»): la ficha de la mascota ofrece una sección «Álbum» que sube y muestra solo `kind = PHOTO` (JPEG, PNG, WebP) y permite verlas e eliminarlas con los permisos `WRITE_MEDIA`/`DELETE_MEDIA`/`READ_MEDIA` de 004 sin cambio. No muestra ningún `kind = FILE`. Reutiliza `POST /pets/{petId}/media?kind=PHOTO` y `GET …/media?kind=PHOTO`. *Trazas*: REQ-ARC-001 (004), REQ-ALB-001 (004).
- **REQ-ALB5-002** (Tope de fotos de álbum): el servidor rechaza la subida de una foto (`kind = PHOTO`) cuando la mascota ya tiene `maxPhotosPerPet` fotos (valor por defecto **10**, leído de `REQ-PRM-002`). La comprobación se repite de forma autoritativa en la transacción final de la subida, bajo el candado de mascota (`REQ-BOR-005` de 004), y antes del `put` para el rechazo barato. El rechazo usa un error nuevo `ERR-MEDIA-ALBUM-LIMIT` (409) `[DECISIÓN PENDIENTE D5-02]`; no cuenta contra la cuota de 1 GiB ni deja objeto (la fila `INTENT` pasa a `DELETE`). Los archivos clínicos (`kind = FILE`) **no** cuentan para este tope. *Trazas*: REQ-GCS-006 (004), REQ-BOR-005 (004).
- **REQ-ALB5-003** (Mascotas por encima del tope): una mascota con más fotos que `maxPhotosPerPet` conserva todas; solo se rechazan subidas nuevas hasta bajar del tope. No se borra ni archiva nada automáticamente (`[NEEDS CLARIFICATION D5-03]`: ¿Neo prefiere conservar o migrar el excedente a archivos clínicos?). *Trazas*: REQ-ALB5-002.
- **REQ-ALB5-004** (Paginación del álbum): con tope de 10 por defecto, el álbum se muestra sin paginación hasta `maxPhotosPerPet`; `REQ-ALB-001` (página de 24) y `INV-ALB-001` de 004 siguen vigentes para `kind = FILE` y para el caso EDGE-005-01 (más de 10) `[DECISIÓN PENDIENTE D5-01: enmienda de REQ-ALB-001]`. *Trazas*: REQ-ALB-001 (004), INV-ALB-001 (004).
- **REQ-CLI5-001** (Sección «Historial / Archivos»): la sección clínica añade, junto a peso, medidas, vacunas, desparasitaciones, consultas y parámetros, un panel «Archivos» que sube y muestra solo `kind = FILE` (JPEG, PNG, WebP, PDF por `INV-ARC-001`): resultados de exámenes, radiografías, fotos médicas de control. No muestra fotos del álbum. *Trazas*: REQ-ARC-001 (004).
- **REQ-CLI5-002** (Clasificación opcional del archivo clínico): `[NEEDS CLARIFICATION D5-04]`: ¿cada archivo clínico lleva un tipo (`EXAM_RESULT`, `XRAY`, `MEDICAL_PHOTO`, `OTHER`) y una fecha del examen? Añadirlo cambia `media.schema.json`, `pet_media` y el OpenAPI de 004 (enmienda). Por defecto (sin decisión) **no se añade**: el rótulo es el nombre original y la fecha es `created_at`. *Trazas*: REQ-CLI5-001.
- **REQ-CLI5-003** (Cuota compartida y permisos sin cambio): álbum y archivos clínicos comparten la cuota de 1 GiB por propietario y los permisos de 004; nada nuevo en `REQ-RBAC-001`. *Trazas*: REQ-ARC-005 (004), REQ-RBAC-001 (002).

### Parámetros de plataforma (US1)

- **REQ-PRM-001** (Tabla de parámetros): existe en BD (SQLite y Postgres, con prueba de paridad) la tabla `platform_parameters` con clave textual única, tipo, valor, límites y descripción (ver `plan.md` §2.1). Sembrada con `album.max_photos_per_pet = 10`. *Trazas*: REQ-ALB5-002.
- **REQ-PRM-002** (Lectura por puerto, valor por defecto en código): un puerto `PlatformParameterPort` (`application`) lee un parámetro con valor por defecto y rango válido declarados en el **código**; si la fila falta o está fuera de rango, se usa el valor por defecto del código y se registra un aviso sin datos. No hay endpoint ni UI de edición. Lectura con caché en memoria de TTL <= 60 s `[NEEDS CLARIFICATION D5-07]`. *Trazas*: REQ-PRM-001.
- **REQ-PRM-003** (Preparada para administración futura): la tabla incluye `updated_at` y `updated_by_user_id` (anulable, sin FK a un rol que aún no existe) para asociarla después a un perfil de administrador de plataforma; **no** se crea el rol, ni ruta, ni UI en esta feature. *Trazas*: REQ-PRM-001.

### Cancelar edición (US3)

- **REQ-CAN-001** (Botón «Cancelar»): los formularios de edición de medidas, vacunas, pesos, desparasitaciones, consultas y parámetros muestran un botón «Cancelar» junto a «Guardar», alcanzable por teclado, que cierra el formulario y devuelve a la lista sin enviar ninguna petición de escritura. *Trazas*: REQ-BOR-003 (004), REQ-UI2-* (002).
- **REQ-CAN-002** (Sin efecto en datos): «Cancelar» no cambia el registro, no incrementa `revision`, no genera auditoría y descarta el estado del formulario. Si el formulario tiene cambios sin guardar se pide confirmación `[NEEDS CLARIFICATION D5-09]`; por defecto (sin decisión) **no** se pide. «Cancelar» queda deshabilitado mientras hay un guardado en curso (EDGE-005-08). *Trazas*: REQ-CAN-001, REQ-BOR-005 (004).

### Enlace de solo lectura para veterinario (US4)

- **REQ-VET-001** (Crear enlace): un usuario con permiso (`[NEEDS CLARIFICATION D5-10]`: propietario legal y `ADMIN` de hogar; nueva acción en la matriz = enmienda de `REQ-RBAC-001` de 002) crea un enlace eligiendo **una mascota** o **un hogar**. La respuesta de creación devuelve la URL **una sola vez**; después solo se listan metadatos (alcance, creación, caducidad, estado), nunca el token. *Trazas*: REQ-RBAC-001 (002).
- **REQ-VET-002** (Alcance): el alcance `PET` expone solo la mascota elegida; el alcance `HOUSEHOLD` expone las mascotas asignadas al hogar elegido y nada más (ni miembros, ni otros hogares). `[NEEDS CLARIFICATION D5-05]`: en `HOUSEHOLD`, ¿las mascotas añadidas o retiradas después de crear el enlace se reflejan (dinámico) o el conjunto se fija al crear (instantánea)? Se recomienda **dinámico con rechazo de mascotas ya no asignadas**, para que retirar una mascota del hogar corte su acceso. *Trazas*: INV-ACC2-001 (002).
- **REQ-VET-003** (Token de capacidad): el token es una cadena aleatoria de >= 256 bits generada con `node:crypto`, codificada en base64url (43 caracteres), no derivable del identificador ni de datos de la mascota. En BD solo se guarda su `SHA-256` (nunca el token). La comparación del hash es en tiempo constante. *Trazas*: REQ-VET-001.
- **REQ-VET-004** (Caducidad): todo enlace caduca. `[NEEDS CLARIFICATION D5-11]`: se propone por defecto 7 días, elegible entre 1, 7 y 30 días y máximo 30; sin enlaces perpetuos. Pasada la caducidad responde igual que un enlace inexistente. *Trazas*: REQ-VET-001.
- **REQ-VET-005** (Revocación): `[NEEDS CLARIFICATION D5-12]`: se propone que el creador, el propietario y los `ADMIN` del hogar puedan revocar el enlace en cualquier momento y que se liste el estado (ACTIVO, REVOCADO, VENCIDO); la revocación es inmediata (sin caché). Recomendado: sí revocable (el enlace es una credencial reenviable). *Trazas*: REQ-VET-001.
- **REQ-VET-006** (Superficie pública mínima): una única ruta de lectura `GET /shared/{token}/summary` (y su vista web) sin cookie, sin CSRF y sin escritura; ningún otro verbo ni ruta resuelve el token. Cabeceras de respuesta: `Cache-Control: no-store`, `Referrer-Policy: no-referrer`, `X-Robots-Tag: noindex, nofollow, noarchive`, `Content-Security-Policy` restrictiva (sin script de terceros), `X-Content-Type-Options: nosniff`. La página no enlaza a terceros ni carga recursos externos. *Trazas*: NFR-005-002.
- **REQ-VET-007** (Respuesta uniforme y límite de tasa): enlace inexistente, vencido, revocado o con mascota ya inaccesible responde el **mismo** 404 (cuerpo idéntico, misma ruta de código y tiempo comparable); tras N fallos por IP en una ventana se responde 429 `[NEEDS CLARIFICATION D5-13]` (valores N y ventana; el repositorio no tiene límite por IP, ver `RR-07`/`TECHDEBT-004-06` de 004: puede requerir Cloud Armor, decisión de Nivel 2). *Trazas*: REQ-PET4-002 (004, patrón de oráculo).
- **REQ-VET-008** (Auditoría y registros sin secretos): la creación, revocación y cada acceso exitoso o fallido al enlace se audita con identificador del enlace (nunca el token) y HMAC de la IP si se registra; ningún registro (`stdout`, auditoría, excepción) contiene el token, el microchip ni nombres de archivo. *Trazas*: NFR-005-001.
- **REQ-VET-009** (Archivos clínicos a través del enlace): `[NEEDS CLARIFICATION D5-06]`: ¿el veterinario ve y descarga los archivos clínicos (`kind FILE`)? Si sí, cada archivo se sirve con una URL firmada V4 de TTL corto emitida solo tras resolver el token, nunca la clave de objeto. Si no, el resumen solo lista nombre y fecha. *Trazas*: REQ-ARC-003 (004).
- **REQ-VET-010** (Ciclo de vida): eliminar la mascota, el hogar o la cuenta del creador elimina o invalida en la misma transacción los enlaces afectados (EDGE-005-05). *Trazas*: REQ-ACC-002 (002).

### ClinicalSummary (US5)

- **REQ-SUM-001** (Read-model determinista): una función pura de dominio/aplicación `buildClinicalSummary(datos, ahora)` produce un documento JSON `ClinicalSummary` versionado (`summaryVersion`) con: `pet` (perfil clínico mínimo), `weights`, `bodyMeasurements`, `vaccinations`, `dewormings`, `medicalVisits`, `symptoms` (parámetros de categoría `SYMPTOM`), `otherParameters` y `clinicalFiles` (lista de archivos clínicos `kind FILE`, sin binarios). *Trazas*: REQ-REC-* (002), REQ-SIN-001 (004).
- **REQ-SUM-002** (Determinismo): mismos datos y mismo `generatedAt` inyectado producen el mismo JSON byte a byte: orden de claves canónico, listas ordenadas por clave total `(fecha DESC, id DESC)`, sin valores derivados del reloj interno, sin identificadores aleatorios, fechas ISO-8601 UTC. `generatedAt` es parámetro de entrada. *Trazas*: REQ-SUM-001.
- **REQ-SUM-003** (Exclusiones): el resumen **excluye**: fotos del álbum (`kind PHOTO`) y avatar; credenciales, `username`, correo, identificadores de usuario y de hogar, nombres de miembros; auditoría; `microchipId` `[NEEDS CLARIFICATION D5-14]` (dato identificativo útil para el veterinario pero global y sensible; propuesta: incluirlo solo si el creador lo marca); nombres originales de archivo `[NEEDS CLARIFICATION D5-06]`; claves y URLs de objetos; `ownerUserId`; `revision`. Lista de **inclusión** (allow-list) en el esquema, con `additionalProperties: false`, de modo que un campo nuevo en dominio no se filtre por omisión. *Trazas*: NFR-005-001.
- **REQ-SUM-004** (Vista web de solo lectura): la ruta del enlace (REQ-VET-006) renderiza el `ClinicalSummary` en una página de solo lectura, sin formularios ni acciones de escritura. Para el propietario, la misma vista puede abrirse autenticada como «Vista previa del resumen» (`[NEEDS CLARIFICATION D5-15]`: ¿la ve el propietario antes de compartir? recomendado: sí). *Trazas*: REQ-SUM-001.
- **REQ-SUM-005** (Versión imprimible): la vista incluye una hoja de estilos de impresión (`@media print`) y un botón «Imprimir / Guardar como PDF» que usa la impresión del navegador; sin dependencia nueva ni PDF en servidor (`D5-08`). Incluye marca de fecha y hora de generación, aviso «Este resumen no sustituye la consulta veterinaria» y la identificación del alcance (mascota u hogar). *Trazas*: REQ-SUM-004.
- **REQ-SUM-006** (Entrada para IA en Fase 5): el contrato JSON del resumen es la única entrada prevista para reportes de IA; por eso es versionado, tiene esquema cerrado y no incluye datos de contacto. No se integra ningún proveedor de IA en 005 (solo se garantiza que no haga falta cambiar el esquema para ello; cualquier envío a terceros es Nivel 2 y requiere `/rama`). *Trazas*: REQ-SUM-001, REQ-SUM-003.

### Invariantes

- **INV-005-001** (Aislamiento del enlace): un token resuelve únicamente el alcance para el que fue creado; ninguna ruta pública acepta un identificador de mascota u hogar del cliente distinto al del token.
- **INV-005-002** (Solo lectura pública): ningún verbo distinto de `GET` y ningún estado de BD distinto de la auditoría de acceso se modifican desde la superficie pública.
- **INV-005-003** (Tope atómico): bajo concurrencia, el número de `PHOTO` de una mascota nunca supera `max(maxPhotosPerPet, conteo previo existente)` por efecto de subidas nuevas.
- **INV-005-004** (Resumen sin álbum): el `ClinicalSummary` no contiene referencia alguna a `kind = PHOTO` ni al avatar.
- **INV-005-005** (Token no recuperable): el token no existe en BD, registros ni auditoría tras su creación; solo su hash.

### Requisitos no funcionales

- **NFR-005-001** (Privacidad): sin PII en registros; el token y los nombres de archivo jamás se registran; revisión previa de `/rama` (T702) y posterior (T793).
- **NFR-005-002** (Seguridad de la superficie pública): modelo de amenazas de `/trinity` (T703) cubre enumeración, fuerza bruta, reutilización, fuga por `Referer`, caché intermedia, IDOR entre alcances y abuso de recursos.
- **NFR-005-003** (Accesibilidad y móvil): secciones, botón «Cancelar» y vista del enlace con WCAG 2.1 AA a 320, 1024 y 1280 px (diseño de `/sati`, T705).
- **NFR-005-004** (Costo): sin recursos de pago nuevos en Terraform; sin dependencias nuevas (`package.json` intacto); el resumen se calcula bajo demanda, sin tarea programada.

## Key Entities

- **PlatformParameter**: `key`, `valueType`, `value`, `minValue`, `maxValue`, `description`, `updatedAt`, `updatedByUserId`.
- **ShareLink**: `id`, `tokenHash`, `scope` (`PET`|`HOUSEHOLD`), `petId` o `householdId`, `createdByUserId`, `createdAt`, `expiresAt`, `revokedAt`, `includeMicrochip` `[D5-14]`.
- **ClinicalSummary**: documento JSON versionado (ver `plan.md` §1.5).
- **PetMedia** (existente): `kind PHOTO` = álbum, `kind FILE` = archivo clínico.

## Success Criteria

- **SC-005-001** (`REQ-ALB5-001`): **Given** una mascota con 3 fotos y 2 archivos clínicos, **When** abro «Álbum», **Then** veo las 3 fotos y ningún archivo; **And** «Historial / Archivos» muestra los 2 archivos y ninguna foto del álbum.
- **SC-005-002** (`REQ-ALB5-002`, `INV-005-003`): **Given** 10 fotos y `maxPhotosPerPet = 10`, **When** se sube la undécima, **Then** responde 409 `ERR-MEDIA-ALBUM-LIMIT`, no hay fila nueva ni objeto en GCS (la clave `INTENT` se encola y borra) y el conteo sigue en 10.
- **SC-005-003** (`REQ-ALB5-002`, EDGE-005-02): **Given** 9 fotos y dos subidas simultáneas (conexiones intercaladas), **Then** una pasa y la otra recibe `ERR-MEDIA-ALBUM-LIMIT`; el total es 10.
- **SC-005-004** (`REQ-PRM-001`, `REQ-PRM-002`): **Given** la fila `album.max_photos_per_pet = 12`, **When** se sube la undécima y la duodécima foto, **Then** ambas se aceptan y la decimotercera se rechaza; **And** con la fila ausente o `0`/`-1`/`abc` se usa 10 y se registra un aviso sin datos.
- **SC-005-005** (`REQ-ALB5-003`, EDGE-005-01): **Given** una mascota con 14 fotos de 004, **When** se lista el álbum, **Then** las 14 son visibles y borrables; **And** subir una nueva falla hasta quedar por debajo del tope.
- **SC-005-006** (`REQ-ALB5-002`): **Given** 10 fotos y 3 archivos clínicos, **When** se sube un archivo clínico, **Then** se acepta (los `FILE` no cuentan para el tope).
- **SC-005-007** (`REQ-CLI5-001`): **Given** «Historial / Archivos», **When** se sube un PDF, un JPEG, un PNG y un WebP como archivo clínico, **Then** los 4 se aceptan y se listan; **And** un `.docx` se rechaza con `ERR-MEDIA-TYPE-NOT-ALLOWED`.
- **SC-005-008** (`REQ-CLI5-003`): **Given** una cuota de 1 GiB casi agotada, **When** se sube un archivo clínico que la excede, **Then** responde `ERR-MEDIA-QUOTA-EXCEEDED`, con la misma suma que el álbum.
- **SC-005-009** (`REQ-CLI5-003`): **Given** un `READER`, **When** sube o borra un archivo clínico, **Then** `ERR-ACC-FORBIDDEN`; **And** sí puede verlos.
- **SC-005-010** (`REQ-CLI5-001`): **Given** el panel clínico en 320 px, **When** se navega por teclado, **Then** la sección es operable y cumple WCAG 2.1 AA (`/sati`).
- **SC-005-011** (`REQ-CLI5-002`): **Given** la decisión `D5-04`, **Then** el contrato refleja exactamente la opción firmada (con o sin tipo y fecha del examen).
- **SC-005-012** (`REQ-CAN-001`): **Given** cada uno de los 6 formularios de edición, **When** se pulsa «Cancelar», **Then** se vuelve a la lista sin petición de red de escritura.
- **SC-005-013** (`REQ-CAN-002`): **Given** un formulario con cambios, **When** se cancela, **Then** el registro conserva su `revision` y no hay fila de auditoría nueva; **And** reabrirlo muestra los valores guardados.
- **SC-005-014** (`REQ-CAN-002`, EDGE-005-08): **Given** un guardado en curso, **Then** «Cancelar» está deshabilitado.
- **SC-005-015** (`REQ-VET-001`, `REQ-VET-003`, `INV-005-005`): **Given** un enlace creado, **Then** la URL se devuelve una sola vez; en BD solo existe el `SHA-256`; ningún registro ni auditoría contiene el token.
- **SC-005-016** (`REQ-VET-002`, `INV-005-001`): **Given** un enlace `PET` de la mascota A, **When** se piden datos de la mascota B (mismo propietario) por cualquier ruta, **Then** 404 uniforme sin datos.
- **SC-005-017** (`REQ-VET-002`, EDGE-005-04): **Given** un enlace `HOUSEHOLD` con 2 mascotas, **When** se retira una del hogar, **Then** su dato deja de servirse según `D5-05`.
- **SC-005-018** (`REQ-VET-004`): **Given** un enlace con caducidad pasada (reloj controlado), **Then** responde el mismo 404 que un token inexistente.
- **SC-005-019** (`REQ-VET-005`): **Given** un enlace revocado, **Then** deja de resolver de inmediato y se lista como REVOCADO.
- **SC-005-020** (`REQ-VET-006`, `INV-005-002`): **Given** un enlace válido, **When** se usan `POST`, `PUT`, `PATCH`, `DELETE` o cabecera `Cookie`, **Then** ningún cambio de estado y 405 o 404 uniforme; **And** la respuesta lleva las cabeceras de `REQ-VET-006`.
- **SC-005-021** (`REQ-VET-007`): **Given** tokens inexistentes, vencidos y revocados, **Then** cuerpos y códigos idénticos y diferencia de tiempo dentro del margen de la prueba; **And** tras el umbral de `D5-13`, 429.
- **SC-005-022** (`REQ-VET-008`): **Given** crear, revocar y acceder a un enlace, **Then** hay una fila de auditoría por evento sin token ni nombre de archivo; **And** `stdout` no contiene el token.
- **SC-005-023** (`REQ-VET-009`): **Given** `D5-06`, **Then** los archivos clínicos se sirven con URL firmada de TTL corto o solo se listan, según la opción firmada; nunca la clave de objeto.
- **SC-005-024** (`REQ-VET-010`, EDGE-005-05): **Given** un enlace activo, **When** se elimina la mascota o la cuenta, **Then** el enlace deja de resolver y su fila desaparece en la misma transacción.
- **SC-005-025** (`REQ-VET-001`, `D5-10`): **Given** un `CAREGIVER` o `READER`, **When** intenta crear un enlace, **Then** `ERR-ACC-FORBIDDEN` (o lo que firme `D5-10`).
- **SC-005-026** (`NFR-005-002`): **Given** la suite de seguridad de `/trinity` para enumeración, fuerza bruta, `Referer`, caché y IDOR de alcances, **Then** 0 hallazgos abiertos de severidad >= media.
- **SC-005-027** (`REQ-SUM-001`): **Given** una mascota con registros de los 6 módulos, síntomas y 2 archivos clínicos, **Then** el resumen contiene cada sección y valida contra `clinical-summary.schema.json`.
- **SC-005-028** (`REQ-SUM-002`): **Given** los mismos datos y el mismo `generatedAt`, **When** se genera 2 veces y tras reordenar filas en BD, **Then** el JSON es idéntico byte a byte.
- **SC-005-029** (`REQ-SUM-003`, `INV-005-004`): **Given** una mascota con álbum, avatar, microchip y miembros, **Then** el resumen no contiene fotos, avatar, correo, `username`, identificadores de usuario/hogar, claves de objeto ni nombres de archivo (según `D5-06`), y el microchip solo según `D5-14`.
- **SC-005-030** (`REQ-SUM-003`): **Given** un campo nuevo añadido al dominio de la mascota sin tocar el esquema del resumen, **Then** el resumen falla la validación o no lo incluye (allow-list); nunca lo filtra.
- **SC-005-031** (`REQ-SUM-004`): **Given** la vista web, **Then** no contiene formularios ni elementos de escritura y se ve a 320, 1024 y 1280 px.
- **SC-005-032** (`REQ-SUM-005`): **Given** la impresión (emulación de medio `print`), **Then** muestra título, alcance, fecha de generación y aviso, sin navegación ni botones.
- **SC-005-033** (`REQ-SUM-006`): **Given** `package.json`, **Then** no hay dependencia nueva y el esquema del resumen está versionado y cerrado.

## Decisiones pendientes de Neo (Nivel 2)

| ID | Decisión | Recomendación del Architect | Enmienda a 004 si aplica |
|---|---|---|---|
| **D5-01** | Interpretar «límite 24 -> 10» como tope nuevo de fotos de álbum; retira `K-10` para `PHOTO` y limita `REQ-ALB-001`/`INV-ALB-001` a `FILE` | Sí | spec 004 `REQ-ALB-001`, `REQ-ARC-005`, `INV-ALB-001`; `pet-tracker-api.openapi.yaml` (`pageSize`) |
| **D5-02** | Error nuevo `ERR-MEDIA-ALBUM-LIMIT` (409) | Sí, código propio (no reutilizar `ERR-MEDIA-QUOTA-EXCEEDED`) | `error-catalog.json` y OpenAPI de 004 (o de 005 si se acuerda un catálogo incremental) |
| **D5-03** | Qué hacer con mascotas con > 10 fotos | Conservar y bloquear nuevas | ninguna |
| **D5-04** | Tipo y fecha de examen en archivo clínico | No en 005 (diferir) | `media.schema.json`, `pet_media`, OpenAPI |
| **D5-05** | Hogar compartido: dinámico o instantánea | Dinámico, con corte al retirar | ninguna |
| **D5-06** | Veterinario ve y descarga archivos clínicos; muestra nombre original | Ver y descargar con URL firmada corta; nombre original solo en la vista, nunca en registros | ninguna |
| **D5-07** | TTL de caché del parámetro | <= 60 s | ninguna |
| **D5-08** | PDF: impresión del navegador, sin PDF en servidor | Sí (sin dependencia) | ninguna |
| **D5-09** | Confirmar «Cancelar» con cambios | No | ninguna |
| **D5-10** | Quién crea el enlace y nueva acción en la matriz | Propietario legal y `ADMIN`; enmienda de la matriz | `REQ-RBAC-001` (002, texto) |
| **D5-11** | Caducidad por defecto y máxima | 7 d por defecto, opciones 1/7/30 d, máx. 30 d | ninguna |
| **D5-12** | Revocable | Sí | ninguna |
| **D5-13** | Límite de tasa por IP: valores y dónde (aplicación o Cloud Armor) | 20 fallos/10 min/IP en aplicación; Cloud Armor = Nivel 2 | ninguna |
| **D5-14** | Microchip en el resumen | Excluido por defecto; casilla opcional al crear | ninguna |
| **D5-15** | Vista previa del resumen autenticada para el propietario | Sí | ninguna |

## Trazabilidad REQ -> SC -> tareas (resumen; el mapa completo está en `tasks.md`)

| REQ / INV / NFR | SC | Tareas |
|---|---|---|
| REQ-ALB5-001 | SC-005-001 | T722, T726, T727 |
| REQ-ALB5-002 | SC-005-002, 003, 004, 006 | T720, T721, T723, T724 |
| REQ-ALB5-003 | SC-005-005 | T721, T725 |
| REQ-ALB5-004 | SC-005-005 | T721, T726 |
| REQ-CLI5-001 | SC-005-001, 007, 010 | T730, T732, T733, T734 |
| REQ-CLI5-002 | SC-005-011 | T700, T706 |
| REQ-CLI5-003 | SC-005-008, 009 | T731, T735 |
| REQ-PRM-001 | SC-005-004 | T710, T711, T712 |
| REQ-PRM-002 | SC-005-004 | T713, T714 |
| REQ-PRM-003 | SC-005-004 | T710 |
| REQ-CAN-001 | SC-005-012 | T740, T741, T742, T743 |
| REQ-CAN-002 | SC-005-013, 014 | T740, T744 |
| REQ-VET-001 | SC-005-015, 025 | T750, T754, T756 |
| REQ-VET-002 | SC-005-016, 017 | T751, T755 |
| REQ-VET-003 | SC-005-015 | T751, T752, T766 |
| REQ-VET-004 | SC-005-018 | T751, T753, T766 |
| REQ-VET-005 | SC-005-019 | T751, T757, T766 |
| REQ-VET-006 | SC-005-020 | T758, T759 |
| REQ-VET-007 | SC-005-021 | T760, T761 |
| REQ-VET-008 | SC-005-022 | T762 |
| REQ-VET-009 | SC-005-023 | T763 |
| REQ-VET-010 | SC-005-024 | T764 |
| REQ-SUM-001 | SC-005-027 | T770, T771, T772 |
| REQ-SUM-002 | SC-005-028 | T771, T773 |
| REQ-SUM-003 | SC-005-029, 030 | T770, T774 |
| REQ-SUM-004 | SC-005-031 | T775, T776 |
| REQ-SUM-005 | SC-005-032 | T777 |
| REQ-SUM-006 | SC-005-033 | T706, T778 |
| INV-005-001 | SC-005-016 | T758, T765 |
| INV-005-002 | SC-005-020 | T758, T759 |
| INV-005-003 | SC-005-002, 003 | T720, T724 |
| INV-005-004 | SC-005-029 | T774 |
| INV-005-005 | SC-005-015 | T752 |
| NFR-005-001 | SC-005-015, 022 | T702, T793 |
| NFR-005-002 | SC-005-026 | T703, T792 |
| NFR-005-003 | SC-005-010, 031 | T705, T794 |
| NFR-005-004 | SC-005-033 | T796 |
