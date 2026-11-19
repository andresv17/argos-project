# Mifune 006: filtro KISS sobre plan, data-model, research y contracts

Fecha: 2026-11-18. Rama `006-escena-hogar-pixel-art`. Solo lectura sobre `specs/006-*`; este informe es el único archivo creado. Estado de lo revisado: `DRAFT`.
Criterio: la ruta más simple que cumple el 100 % de los REQ/INV firmados. Donde una simplificación contradice un REQ/INV/D6, se marca **CONTRADICE** y no se recomienda (queda como opción para Neo). `D6-15` no se reabre.

## Resumen

| ID | Tema | Veredicto | Contradice |
|---|---|---|---|
| H-MIF-006-01 | `status` persistido + hooks `recomputeSceneStatus` en casos de uso de 002/004/005 | Simplificar (alto) | No (ver nota) |
| H-MIF-006-02 | Tabla `scene_images` con máx. 1 fila (`D6-13` = A) | Simplificar (medio) | No |
| H-MIF-006-03 | Tabla `scene_attempts` + retención 30 d + FK circular | Simplificar (medio) | Posible, comprobar EDGE-016 |
| H-MIF-006-04 | `mode` `REGENERATE` duplica `action = REGENERATE` | Opción, no recomendada | REQ-ESC6-015 |
| H-MIF-006-05 | `INCREMENTAL_ADD/REMOVE/REPLACE/MIXED` (4 modos) | Opción, no recomendada | `D6-08` = A, EDGE-008, SC-008/009 |
| H-MIF-006-06 | 13 variables `ARGOS_SCENE_*` | Reducir a 6-7 (medio) | No |
| H-MIF-006-07 | `ImageNormalizerPort` con un solo adaptador, sin fake | Bajar a función (bajo) | No |
| H-MIF-006-08 | Columnas muertas: `schema_version`, `household_photos.version`, `duration_ms` | Eliminar (bajo) | No |
| H-MIF-006-09 | Tope global de gasto (`H-ARCH-006-02`, `platform_parameters`) | No añadir ahora | No |
| H-MIF-006-10 | Capa de Cloud Tasks (solo señalar, `D6-15` cerrada) | Señalar 2 recortes de IaC | No |
| H-MIF-006-11 | Doble red de huérfanos: `INTENT` + conciliación diaria de prefijos | Verificar solape con 004 | No |
| H-MIF-006-12 | Contratos duplicados: `SceneErrorCode` en 2 sitios; 6 operaciones `/me/*` y `/households/*` gemelas | Bajo; aceptar | No |
| H-MIF-006-13 | `scene_image_sources`, `scene_consents`, `D6-09` migración, VertexAdapter inactivo | **Conservar** (no es sobreingeniería) | n/a |

---

## H-MIF-006-01 (ALTO): la proyección `status` persistida obliga a enganchar 7+ casos de uso ajenos

**Qué hay.** `data-model.md` §4 y `plan.md` §5.1 persisten `status` (`idle|outdated|ready`) y lo recalculan con `recomputeSceneStatus` dentro de la transacción de **cada** mutación de entrada: alta/baja/avatar de mascota (004), asignación y salida/expulsión (002), foto del hogar, consentimiento, creación y borrado de hogar y de cuenta. Esos casos de uso pertenecen a features `LOCKED` (002, 004, 005): la 006 los toca por dentro.
**Por qué sobra.** `GET scene` ya debe calcular la huella actual y el recuento por entidad de cambios (`REQ-ESC6-004`, `computeFingerprint` pura). Con ese cálculo, `idle|outdated|ready` son derivables en la lectura (`fingerprintNow` vs `last_fingerprint`, y si hay imagen). El propio plan admite «la huella actual no se guarda para que no haya estado derivado desfasado» y, aun así, guarda un estado derivado de ella.
**Simplificación.** Persistir solo lo que no es derivable: `generating` (con `lease_expires_at`, `current_attempt_id`) y `failed`. `idle|outdated|ready` se calculan en `getScene`/`requestSceneGeneration`. La condición del compare-and-set pasa de `status IN ('outdated','failed')` a «no hay arrendamiento vigente y hay cambios pendientes o fallo previo». Se eliminan `recomputeSceneStatus`, sus ganchos y la clase de defectos «proyección desfasada».
**Qué se pierde.** Una lectura barata sin cargar mascotas (hoy no existe ninguna lectura así: la vista siempre muestra pendientes). Hay que conservar, en las mismas transacciones de la causa, solo las acciones de privacidad que no son de estado: `current_image_id := NULL` y encolado de borrados (`D6-17`, `REQ-ESC6-025/030`). Eso sí es inevitable.
**Contradicción.** `REQ-ESC6-003` exige que la escena «tenga exactamente uno» de los cinco estados y una máquina cerrada: un estado derivado en lectura lo cumple. No se contradice ningún texto firmado; sí cambia la frase «estado persistido» de `home-scene.machine.json` y de `data-model.md` §4 (cambio de redacción de DRAFT, sin MAJOR). Confirmar con `/oracle`.
**Beneficio.** Menos acoplamiento con código `LOCKED`, menos pruebas de ganchos (una por cada mutación), menos riesgo de regresión en 002/004/005.

## H-MIF-006-02 (MEDIO): `scene_images` es una tabla de máximo una fila por escena

**Qué hay.** `D6-13` = A fija una sola imagen vigente por escena; la tabla existe con FK circular (`home_scenes.current_image_id` ↔ `scene_images.scene_id`), que el propio documento resuelve con «crear la fila antes y apuntar en la misma transacción». Además `last_fingerprint` se declara «redundante con `inputs_snapshot`».
**Simplificación.** Columnas en `home_scenes`: `image_id`, `image_mime`, `image_size_bytes`, `image_inputs_snapshot`, `image_created_at` (todas NULL si no hay imagen). Desaparecen la FK circular, el `ON DELETE SET NULL`, la fila-que-se-borra-al-publicar y la tabla. `scene_image_sources` apunta a `scene_id`.
**Qué se pierde.** La puerta a un historial de versiones (`D6-13` = B/C), que el spec declara **fuera de alcance** (`spec.md` l.24). Si algún día se firma, se crea la tabla entonces con una migración.
**Contradicción.** Ninguna.

## H-MIF-006-03 (MEDIO): `scene_attempts` como tabla con retención de 30 días no ratificada

**Qué hay.** Tabla de intentos con 12 columnas, índice único de idempotencia, FK `current_attempt_id` desde `home_scenes` (segunda FK circular) y un purgado diario a 30 días que el propio plan marca como «valor propuesto, requiere ratificación».
**Por qué sobra.** Solo hay un intento en vuelo por escena (`INV-ESC6-003`). La auditoría (`REQ-AUD-001`) ya registra `SCENE_REQUESTED/PUBLISHED/FAILED` con modo y código. El historial de intentos terminales no lo consume ningún REQ.
**Simplificación.** Columnas del intento en curso en `home_scenes` (`attempt_id`, `attempt_mode`, `attempt_fingerprint`, `attempt_inputs_snapshot`, `attempt_idempotency_key_hash`, `attempt_started_at`); el resultado terminal va al registro de auditoría y se sobrescribe/limpia al siguiente intento. Se elimina la tabla, la FK circular y el purgado de 30 días (y la decisión pendiente asociada).
**Qué se pierde.** Consulta SQL histórica de intentos y `duration_ms`. La idempotencia pasaría a recordar solo la **última** clave: un reintento con una clave más antigua que otra generación posterior se trataría como petición nueva (que igualmente respondería con el estado vigente si hay `generating`, o se rechazaría por falta de cambios pendientes).
**Contradicción.** Posible con `EDGE-ESC6-016` («misma clave devuelve el mismo resultado») si se interpreta como cualquier clave histórica. **Si `/oracle` lo interpreta así, no recomendar**; con «reintento de red» (misma pulsación) la última clave basta. `SceneGenerationAttempt` es una entidad del spec, pero su realización física es libre.

## H-MIF-006-04 (BAJO, opción): `mode = REGENERATE` y `action = REGENERATE` dicen lo mismo

El prompt de `REGENERATE` y el de `FROM_SCRATCH` son idénticos (plan §5.3: bloque Hogar «solo `FROM_SCRATCH` y `REGENERATE`»; mascotas todas `RENDER`). La diferencia (no usar la escena previa) la da `currentSceneRef = null`, que ya viaja en el payload. Se podría omitir `REGENERATE` del enum de modo y dejar solo la acción del usuario.
**CONTRADICE** `REQ-ESC6-015` (enumera `REGENERATE` en `mode`) y `SC-ESC6-021` («el modo es `REGENERATE`»). No se recomienda; se deja anotado por si Neo reabre el contrato `1.0.0` antes de `LOCKED`. Ahorro real: un valor de enum y una rama.

## H-MIF-006-05 (BAJO, opción): cuatro modos incrementales

`INCREMENTAL_ADD/REMOVE/REPLACE/MIXED` se pueden reducir a un `INCREMENTAL` con acciones por mascota (que ya viajan en `pets[].action`); `MIXED` es solo la unión de las tres frases. La plantilla de §5.3 ya compone esas frases por mascota.
**CONTRADICE** `D6-08` = A (firmada), `REQ-ESC6-006/015`, `EDGE-ESC6-008`, `SC-ESC6-008/009/010/011`. No se recomienda. Sí se señala: **la implementación debe construir `MIXED` componiendo las tres plantillas ya existentes, no como cuarta plantilla propia**; así el costo real de `MIXED` es una rama de `decide-mode` y no un texto aparte. Pedir a `/keymaker` que no duplique frases.

## H-MIF-006-06 (MEDIO): 13 variables de configuración, varias que nadie tocará

| Variable | Propuesta | Razón |
|---|---|---|
| `ARGOS_SCENE_NOTICE_VERSION`, `ARGOS_SCENE_PROVIDER_ID` | constantes de código junto al aviso del cliente | Deben coincidir con el aviso empaquetado en el cliente; si divergen por entorno, el consentimiento queda inválido. Cambian con un release, no con un ajuste |
| `ARGOS_SCENE_LEASE_SECONDS` | derivar `T_LEASE = T_GEN + 60` | `INV-ESC6-013` solo exige `T_LEASE ≥ T_GEN + 30`; una regla derivada lo cumple sin una variable más que validar |
| `ARGOS_SCENE_LOCATION` | tomar de la región de Terraform ya existente, o constante `us-central1` | «lista cerrada» con un solo valor |
| `ARGOS_SCENE_DISPATCH` | derivar de `NODE_ENV` (producción = `cloudtasks`); las pruebas inyectan el adaptador | Hoy hay dos interruptores (`DRIVER` y `DISPATCH`) cuyas combinaciones válidas son 2 de 4 |
| `ARGOS_SCENE_REF_MAX_PX` | no declarar hasta resolver `H-ARCH-006-01` | «sin valor» por diseño; es una variable fantasma. **Ojo**: `REQ-ESC6-027` la nombra; basta dejar la mención en el spec sin cablearla ahora |
| `ARGOS_SCENE_POLL_SECONDS` | constante del cliente | El sondeo lo hace el navegador; el servidor no lo usa. `REQ-ESC6-019` la nombra, por lo que la constante debe conservar ese nombre/valor documentado |

Quedan: `DRIVER`, `MAX_PETS`, `QUOTA_MAX`, `GEN_TIMEOUT_SECONDS`, `MODEL`, `QUEUE`. `MAX_PETS`, `QUOTA_MAX` y `GEN_TIMEOUT` se conservan por `D6-02`, `D6-03`, `INV-ESC6-013` y `SC-ESC6-034/060`. Ahorro: ~7 reglas de validación y sus pruebas de arranque.
**Contradicción.** Revisar el texto exacto de `REQ-ESC6-019` y `REQ-ESC6-027` (mencionan nombres de variable); si se exigen como variables de entorno, esa fila se conserva.

## H-MIF-006-07 (BAJO): `ImageNormalizerPort` con un único adaptador y sin fake

El puerto se justifica con «si Neo autoriza una dependencia de imagen solo cambia el adaptador». Hoy hay **un** adaptador real, y no hay segundo uso. Es una función pura sobre `Uint8Array` (recorrer el contenedor y quitar segmentos).
**Simplificación.** Función `stripImageMetadata(mime, bytes)` en un módulo de `infrastructure` (o `application/util`) inyectada como dependencia simple; se convierte en puerto cuando exista un segundo adaptador (decisión `H-ARCH-006-01` A). Mantiene `INV-ARCH-004/005` (sin red ni E/S, no necesita ser asíncrona: ver la pega: el puerto lo declaró `Promise` por convención de `INV-ARCH-005`, que aplica a **puertos**, no a funciones puras).
**Qué se pierde.** Un punto de sustitución ya preparado. Costo de crearlo después: bajo.
**Aviso fuera de KISS (para `/trinity`):** el reescritor de contenedores JPEG/PNG/WebP escrito a mano sobre bytes no confiables es la pieza de más riesgo de parsing de esta feature; sin recodificar ni redimensionar cumple `REQ-ESC6-027` solo en parte (`H-ARCH-006-01`). No lo simplifico (cumple `INV-ESC6-015`), pero no es barato.

## H-MIF-006-08 (BAJO): columnas y campos muertos

- `home_scenes.schema_version`: siempre `1.0.0`; el payload no se persiste y `inputs_snapshot` ya lleva `"v": 1`. Eliminar.
- `household_photos.version`: «caché de la vista; sube en cada reemplazo». `object_id` es un UUID nuevo en cada reemplazo y ya identifica la versión: usarlo como clave de caché. Eliminar.
- `scene_attempts.duration_ms`: ningún REQ ni SC lo lee (tampoco la auditoría). Eliminar (o ir con H-MIF-006-03).
- `home_scenes.last_generated_at`: conservar solo si la interfaz lo muestra («actualizada el…»); `SceneView.updatedAt` existe. Verificar uso antes de crear la columna.
- `biography` y `fallbackContext` del payload: siempre nulos por `INV-ESC6-017`. **No se tocan**: el spec exige que el contrato `1.0.0` los conserve opcionales (`REQ-ESC6-015`); es un gancho firmado de forma deliberada.

## H-MIF-006-09 (MEDIO): tope global de gasto `H-ARCH-006-02`

Opinión pedida por el plan §6.5. **No añadir `ARGOS_SCENE_GLOBAL_QUOTA_MAX` ni la fila `platform_parameters` en 006.** Razones: (1) el adaptador real está bloqueado tras `REQ-ESC6-028` y la enmienda del Principio VI (`D6-01`, `REQ-ESC6-031`): con el simulador el gasto es 0; (2) el riesgo existe solo cuando se active el real, que es un evento con firma de Neo; (3) hay controles más baratos sin código: un límite de cuota en el propio proyecto de Google (solicitudes por día del modelo) `[verificar]`, y bajar `ARGOS_SCENE_QUOTA_MAX` de 10 si el costo unitario lo exige.
**Acción.** Registrar como condición de activación del driver real («antes de poner `real` en producción: cuota de proyecto en la consola o contador global»), no como tarea de código de la 006. Si Neo prefiere el contador, es una fila y un `UPDATE ... WHERE restante > 0`: ~20 líneas y una prueba; no es caro, solo prematuro.

## H-MIF-006-10 (señalamiento; `D6-15` no se reabre): lo que sobra dentro de la capa Cloud Tasks

La decisión sigue firme. Dentro de ella, dos recortes de IaC que `/link` puede considerar:
1. **Cuenta de servicio nueva `argos-scene-tasks`** (con `roles/run.invoker` y el `serviceAccountUser` de `run` sobre ella). Se podría usar la cuenta `run` como identidad OIDC de la tarea y que la ruta valide el `email` del token (distinto del de Scheduler). Ahorra una cuenta y un binding, a costa de que la identidad del worker sea la misma que la de la aplicación. Si `/trinity` exige separación, se queda; aquí no hay respaldo en disco para elegir. `[verificar si la propia cuenta necesita actAs sobre sí misma]`.
2. **`maxConcurrentDispatches = 2` y `max_dispatches_per_second`** ya coinciden con `max_instance_count = 2`; no tocar nada más.
No hay capa que sobre más allá de eso: el hop de cola, la ruta OIDC y el arrendamiento `T_LEASE` son el mínimo para `NFR-ESC6-002` y `NFR-ESC6-003` (202 en ≤ 1 s). **Hacer la generación síncrona dentro del POST CONTRADICE `NFR-ESC6-003`** y no se recomienda aunque el timeout de Cloud Run se suba. `SceneJobDispatcherPort` tiene dos adaptadores reales (in-process para desarrollo y CI, cola en producción): justificado, no es puerto de un solo adaptador.

## H-MIF-006-11 (BAJO): dos redes para objetos huérfanos

`INTENT` (T1/T2, `EDGE-ESC6-021`) más la conciliación diaria que lista `scenes/` y `households/` y encola todo objeto de más de 24 h sin fila. Si la conciliación de 004 (`REQ-GCS-004`) ya lista por prefijo, 006 solo debe **añadir los dos prefijos** a esa lista, no una segunda rutina. Comprobar en `src/` antes de crear tarea. `INTENT` se conserva (lo exige `EDGE-ESC6-021`).

## H-MIF-006-12 (BAJO): contratos duplicados

- `SceneErrorCode` (4 valores) en `scene.schema.json` repite 4 de los 7 códigos de `error-catalog.json`. Es una duplicación pequeña y la compilación de `src/generated/` la hace visible; aceptable, pero que `/keymaker` genere el tipo del catálogo y no de dos fuentes. No hay solape OpenAPI-JSON Schema: OpenAPI usa `$ref` a los esquemas (no hay modelos duplicados inline), y `species`/`sex` ya van por `$ref` (`SC-ESC6-022`).
- Las seis operaciones `/me/scene*` espejan las de `/households/{id}/scene*` (`getOwnerScene`, `generateOwnerScene`, `getOwnerSceneImage`). Vienen de `D6-09` y `REQ-ESC6-032`: no contradecir. A nivel de código, un solo manejador parametrizado por ámbito; solo se pide que no existan dos casos de uso.

## H-MIF-006-13: lo que revisé y **conservo**

- `scene_image_sources`: único modo de saber, al retirar consentimiento o desasignar, si la imagen vigente contiene datos del usuario (`D6-17`, `REQ-ESC6-025/030`); `inputs_snapshot` no guarda dueños. Alternativa JSON en `scene_images` complica la seudonimización al borrar cuenta.
- `inputs_snapshot` (ADR-006-02): hace falta para el recuento por entidad y el modo.
- `scene_consents` (histórico de revocación): prueba exigida por `REQ-ESC6-023..025`.
- Migración `D6-09`: un `UPDATE` en la transacción de crear hogar; es barata.
- `VertexSceneImageGenerator` inactivo y sin SDK: código que cuesta por adelantado, pero lo exige `REQ-ESC6-031` («existe como código inactivo») y `D6-01`; el puerto tiene fake y real: no es el patrón de «solo fake». Riesgo KISS: no escribir su código real hasta resolver `[verificar]` de `research.md` §2.2; sin los datos del modelo se escribe a ciegas. Recomendación: en `tasks.md` dejar el adaptador real como esqueleto con contrato de errores y pruebas con `fetch` falso, y completar tras verificar con red.

## Costo y beneficio agregado

| Propuesta | Se elimina | Riesgo |
|---|---|---|
| H-01 | `recomputeSceneStatus`, ~7 ganchos en casos de uso LOCKED, columna `status` parcial | Bajo (confirmar redacción de REQ-003) |
| H-02 + H-03 | 2 tablas, 2 FK circulares, purgado 30 d, FK de intento | Medio en H-03 (EDGE-016) |
| H-06 | 6-7 variables y validaciones | Bajo |
| H-07, H-08 | 1 puerto, 3 columnas | Muy bajo |
| H-09 | 1 fila + contador (no crear) | Bajo; condición de activación |

Orden sugerido para Morpheus/Architect: H-01, H-06, H-08 (sin riesgo), luego H-02 y H-03 (decidir EDGE-016 con `/oracle`), H-07 al escribir `tasks.md`.

FROM: Mifune / TO: Morpheus / STATUS: Validation Required
