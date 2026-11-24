# Acta Rama · Feature 009 · T1294 · ubicación del tratamiento (`provider_model` / `provider_location` y región `global`)

- Fecha: 2026-11-23 · HEAD de referencia: dc535bd · Rama 009-aprobacion-admin-correo
- Alcance: solo lectura. Sin edición de código, contratos, `tasks.md` ni `spec.md`. Sin `[x]`, sin commit, sin push.
- Sin red en esta sesión: lo que no consta en disco se marca **[fuente externa]** y no se da por verificado.
- Relacionado: `REQ-CFG9-004`, `EDGE-009-018`, `EDGE-009-046`, `EDGE-009-045`, `D9-22` = A, `D9-23` = A, `T1254`, `T1265`, `T1271`, `T1298`, `T1299`.

## Resumen de veredictos

| Punto | Veredicto | Motivo corto |
|---|---|---|
| (a) `scene_attempts.provider_model` y `provider_location` | **PASS CON OBS** | Son códigos de configuración, no datos personales. La fila que los contiene sí los tiene (`inputs_snapshot`, `actor_user_id`); la retención sigue la fila. |
| (b) región `global` (`aiplatform.googleapis.com`) | **FAIL** (hoy no habilitable) | No hay fuente en disco que diga dónde se procesa con `global`. El aviso vigente declara `us-central1`. Sin dictamen favorable, `global` no aparece en `/admin` (`EDGE-009-046`). |
| Lista cerrada de 15 regiones (`SCENE_ALLOWED_LOCATIONS`) | **PASS CON OBS** | No necesita cita propia para ser lista de validación anti-SSRF. Para declarar un uso concreto sí necesita cita de ubicación de procesamiento por región [fuente externa]. |

Conclusión operativa: la opción `global` **sigue oculta** en `/admin`. Este dictamen no la habilita. Su habilitación exige las condiciones de la sección 4 y una decisión nueva de Neo (Nivel 2).

## 1. Qué datos personales viajan al proveedor (verificado en disco)

Fuentes: `specs/006-escena-hogar-pixel-art/spec.md` (`INV-ESC6-010`, `REQ-ESC6-021`, `REQ-ESC6-024`, `REQ-ESC6-027`, `EDGE-ESC6-023`), `src/domain/scene/inputs-snapshot.ts` (según `rama-006-fase14-privacidad.md`), `specs/009-aprobacion-admin-correo/spec.md` (`REQ-CFG9-005`, `INV-CFG9-002`).

| Dato enviado | ¿Personal? | Nota |
|---|---|---|
| Foto del hogar (si hay consentimiento vigente del dueño, `REQ-ESC6-024`) | Sí, potencialmente | Puede mostrar personas (`EDGE-ESC6-023`, riesgo residual declarado en el aviso). Metadatos EXIF/GPS no viajan (`REQ-ESC6-027`). |
| Fotos de referencia de mascotas (avatar, `pets.avatar_object_id`) | Sí, potencialmente | Mismo riesgo de personas fortuitas. Solo viajan con consentimiento de su Propietario Legal. |
| Escena previa (modos incrementales) | Sí, indirectamente | Puede contener las mismas personas o mascotas. |
| `species`, `speciesOther` (texto libre saneado por lista blanca), `breed`, `breedCode`, `sex` | Bajo | Datos de la mascota, no del titular. `speciesOther` es texto libre: viaja saneado (`INV-ESC6-011`, `build-image-prompt.ts`). |
| Nombre de mascota, nombre de usuario, microchip, datos clínicos, `id` | **No viajan** | Excluidos por `INV-ESC6-010` y confirmados por `inputs-snapshot.ts`. |
| Prompt editable de `/admin` (`scene.prompt.blocks`, `REQ-CFG9-005`) | No en principio | Son textos genéricos. `INV-CFG9-002` limita los marcadores, pero no controla texto libre que un administrador escriba. Ver observación O-3. |

Consecuencia: el tratamiento que la 009 abre es el mismo que ya declara el aviso de 006 (`REQ-ESC6-026`). La 009 no añade categorías nuevas de dato enviado. Sí cambia el **destino** (sección 2).

## 2. Si `global` cambia la ubicación de procesamiento

- En disco, la única región de procesamiento documentada es `us-central1`: `specs/006-escena-hogar-pixel-art/research.md` §2.2 y §2.3 (fila «Región de proceso», `[verificar]`), y el texto del aviso vigente (`rama-006-fase14-privacidad.md`, punto 1: «declara `us-central1` (Iowa) y transferencia internacional»).
- Ningún artefacto del repo documenta el comportamiento del host `aiplatform.googleapis.com` (sin prefijo de región). Según mi conocimiento, el endpoint global de Vertex AI puede enrutar la petición a cualquier región con capacidad **[fuente externa, no verificada: Vertex AI, «Locations» y «Data governance»]**. Si eso es así, `global` **sí cambia la ubicación de procesamiento**: deja de estar fijada a una región concreta y el conjunto de regiones no está acotado en el repo.
- Por eso el texto del aviso (`REQ-ESC6-026`, «dónde se procesa») quedaría **inexacto** si se habilita `global` sin cambiar la versión del aviso. `SCENE_NOTICE_VERSION = '2'` (`src/domain/scene/notice.ts`) no cubre este caso.
- `EDGE-009-045` obliga a registrar `provider_location` por intento. Eso permite reconstruir dónde se llamó, pero no dónde se procesó. El registro no sustituye el dato de procesamiento.

## 3. Puntos por separado

### (a) `scene_attempts.provider_model` y `provider_location` (`D9-22` = A, `T1298`)

- **Qué son**: códigos de configuración (`gemini-2.5-flash-image`, `us-central1`). Son valores de la lista cerrada de `REQ-CFG9-004`. No identifican a una persona ni a un hogar.
- **Retención**: `scene_attempts` tiene retención de **30 días** ratificada (`specs/006-escena-hogar-pixel-art/spec.md` N2-11, línea 628). Las dos columnas nuevas siguen la fila y caen con ella. Se confirma que no necesitan política propia. Eliminar el hogar elimina sus intentos por `ON DELETE CASCADE` (`data-model.md` §2.5, `scene_id`).
- **Observación O-1 (BAJO)**: la fila que contiene las columnas sí tiene datos personales: `inputs_snapshot` (ids, especies, razas, sexo, referencias de foto), `actor_user_id` (seudonimizado por HMAC al borrar la cuenta). Los dos campos nuevos no agregan datos personales, pero la fila sí. La migración de `T1298` no debe añadir a esas columnas ningún identificador de usuario, de hogar o de mascota, ni el texto del prompt, ni la clave de objeto.
- **Observación O-2 (BAJO)**: `provider_location` debe guardar el código de región (`global` incluido), nunca el host compuesto con cualquier dato de entrada. Coherente con `INV-CFG9-001`.
- **Veredicto (a): PASS CON OBS** (O-1, O-2).

### (b) Región `global` (`D9-23` = A, `EDGE-009-046`)

- Puntos verificados: host fijo `aiplatform.googleapis.com` y ruta `locations/global` (`EDGE-009-018`, `SC-009-022`). Hoy el adaptador compone `{location}-aiplatform.googleapis.com` (`src/infrastructure/adapters/vertex-scene-image-generator.adapter.ts:26`). Sin caso especial para `global` no existe el host correcto. Cuando se añada, el host debe ser literal y no depender de la entrada. Eso es seguridad (anti-SSRF), no privacidad, y lo cubre `T1271`.
- Puntos que fallan hoy:
  1. Sin fuente que fije la ubicación de procesamiento con `global` (sección 2).
  2. El aviso vigente declara `us-central1` y no cubre `global`.
  3. `REQ-ESC6-028` sigue abierto: retención, entrenamiento, borrado y región deben citarse con fuente (`research.md` §2.3, «[verificar]»). Solo consta la fuente de entrenamiento y DPA registrada por Neo (§2.3-bis), no verificada en red.
  4. Condición de reapertura de `D-28` (`specs/003-cloud-gcp/spec.md` línea 40): el alcance de «uso personal controlado» se reabre si Argos se abre a terceros, con evaluación de transferencia internacional bajo Ley 1581 de 2012. `REQ-APR9-001` de la 009 introduce registro con aprobación, es decir, usuarios distintos de Neo. Hay que decidir si esa apertura ya reabre `D-28`. Esta decisión es de Neo.
- **Veredicto (b): FAIL** para habilitación hoy. Se recomienda mantener `global` oculta (`EDGE-009-046`).

### Lista cerrada de regiones

- `SCENE_ALLOWED_LOCATIONS` (`src/domain/scene/provider-parameters.ts`, 15 regiones: us-*, northamerica-northeast1, europe-*, asia-*) tiene función de validación anti-SSRF (`REQ-CFG9-004`, `INV-CFG9-001`). Para eso no necesita cita de residencia.
- Para **usar** una región en producción sí se necesita cita: qué modelos de imagen están disponibles en ella y dónde se procesa la petición [fuente externa, Vertex AI «Locations»]. Eso no consta en el repo (`research.md` §2.3, fila «Región de proceso», `[verificar]`).
- Como todas las regiones de la lista están fuera de Colombia, cualquiera de ellas es transferencia internacional bajo Ley 1581 de 2012 (art. 26, [fuente externa, no verificada en esta sesión]). El aviso ya lo declara («transferencia internacional»), así que la lista no exige cita adicional de residencia para la validación. Sí la exige cada región que se seleccione.
- **Veredicto (lista): PASS CON OBS** (O-4).

## 4. Condiciones previas a habilitar `global` (todas, en orden)

1. **Fuente oficial citada** (URL, fecha de consulta y cláusula) que documente, para `global`: (i) regiones posibles de procesamiento; (ii) retención de entradas y salidas; (iii) no entrenamiento con datos del cliente; (iv) borrado a petición. Registrarla en `research.md` §2.3-bis, como hizo Neo en `T958`. Sin esa fuente, `global` no se habilita (`REQ-ESC6-028`, `D6-23` (d)).
2. **Decisión de Neo (Nivel 2)** sobre la transferencia internacional de `global` y sobre si la apertura de la 009 a usuarios distintos de Neo reabre `D-28` (`specs/003-cloud-gcp/spec.md` línea 40).
3. **Aviso versionado**: incrementar `SCENE_NOTICE_VERSION` y declarar en el texto que el procesamiento con `global` puede ocurrir en cualquier región de la fuente de la condición 1. Eso reexige consentimiento (`REQ-ESC6-023`, `EDGE-ESC6-018`). El texto final lo firma Neo.
4. **Enmienda 006 (`T1299`) y Enmienda 009-B (`T1254`)** aprobadas por Neo. `T1254` ya condiciona la firma a este dictamen.
5. **Tarifa propia** de `global` en la tabla de `T1301`, con fuente oficial. Sin tarifa, el par modelo × región no es seleccionable (`EDGE-009-036`). Eso es de coste, no de privacidad, pero bloquea la misma activación.
6. **Anti-SSRF con host literal** para `global` (`aiplatform.googleapis.com`, `locations/global`) y prueba de `SC-009-022`, incluida en `T1271`.
7. **Registro por intento** de `provider_location = global` (`EDGE-009-045`), verificado en `T1298`.
8. **Firma `T1255` y paso de `/oracle`** antes de activar en producción. Activar exige además el cumplimiento de la compuerta del driver real (`REQ-ESC6-028`, N2-10).

## 5. Qué queda para T1299 y T1254

- **T1299** (enmienda 006 de `REQ-ESC6-017/031` para `global`): no puede redactarse como habilitación. Debe citar este dictamen (FAIL) y declarar las condiciones 1..8. Su nota de versión debe mencionar que `global` no procesa necesariamente en `us-central1`.
- **T1254** (Enmienda 009-B, tabla de costes): debe incluir la nota de que `global` queda fuera de la lista de `/admin` hasta cumplir la sección 4, y no puede firmar `global` sin la fuente de la condición 1.
- **T1265** (`PlatformParametersPort`): leer `global` solo cuando el dictamen esté en estado favorable (condiciones 1..8). Hasta entonces, la validación rechaza `global` aunque esté en BD (`EDGE-009-046`).
- **T1298** (columnas por intento): ver O-1 y O-2 (sin identificadores ni prompt).
- **T1271** (`/trinity`, `/sentinels`, `/rama`): incluir el anti-SSRF de la condición 6 y la prueba de que el prompt editable no transporta datos personales (O-3).

## 6. Observaciones

- **O-1 (BAJO)**: la fila de `scene_attempts` contiene datos personales (`inputs_snapshot`, `actor_user_id`). Preexistente en 006, no de la 009. Mantener la regla de no añadir identificadores a las columnas nuevas.
- **O-2 (BAJO)**: `provider_location` guarda solo el código de región.
- **O-3 (MEDIO, control por diseño)**: el prompt editable de `/admin` (`REQ-CFG9-005`) viaja al proveedor. `INV-CFG9-002` controla marcadores, no texto libre. Un administrador podría escribir datos personales en un bloque. Recomendación para `T1261`/`T1271`: aviso en `/admin` («no escriba datos personales en el prompt»), y prueba de que el snapshot del prompt no incluye nombres ni ids.
- **O-4 (BAJO)**: la lista cerrada no tiene cita de residencia propia. Cada región seleccionable necesita fuente (sección 3).
- **O-5 (MEDIO, bloqueante para `global`)**: `REQ-ESC6-028` sigue sin fuente verificada en red. `T958` registró las fuentes de entrenamiento y DPA, pero retención, borrado y región siguen `[verificar]`.

## 7. Límites de este dictamen

- No es dictamen jurídico. Ley 1581 de 2012 (art. 26) y la reglamentación se citan sin verificar en esta sesión [fuente externa].
- Las cifras y el comportamiento del endpoint `global` son de memoria del modelo y se marcan como [fuente externa]. No son evidencia.
- No se leyó `.env` ni se hizo ninguna llamada real a Vertex AI.
