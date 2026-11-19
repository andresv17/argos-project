# Diseño del tramo privado `gemini-api` (feature 006) — DRAFT del Architect

**Autor**: /architect · **Fecha**: 2026-11-18 · **Estado**: `DRAFT` (no `APPROVED`, no `LOCKED`; potestad de Neo) · **Orden**: Neo (Nivel 2), restricciones 1–4 del encargo.
**Alcance de esta entrega**: solo diseño. No se tocó `src/`, `tests/`, `tasks.md`, `constitution.md`, `.env*` ni se hicieron commits. Ninguna enmienda de abajo está aplicada.

## 0. Resumen ejecutivo

- Técnicamente cabe en la arquitectura actual: un segundo adaptador de `SceneImageGeneratorPort` en `src/infrastructure/adapters/`, con `fetch` inyectable, sin dependencia npm.
- **Hoy choca con 7 normas escritas** (sección 7). Las dos más graves: (a) T879/SC-ESC6-050/061 prohíben en `src/` el literal `generativelanguage.googleapis.com` y cualquier clase `*Gemini*`; (b) `REQ-ESC6-028` y el Principio VI 3.6.0 solo exceptúan el pago de **Vertex**, y `REQ-ESC6-028` dice textualmente que la API pública de Gemini **no equivale** a Vertex en términos de datos (retención/entrenamiento). Sin enmienda firmada por Neo no se puede implementar.
- Hallazgo de privacidad (bloqueante para el diseño de consentimiento): el consentimiento (INV-ESC6-014) solo se exige cuando `svc.realDriver === true` y el `providerId` actual es `vertex-gemini-image`. Con `gemini-api` hay que poner `realDriver=true` y un `providerId` nuevo (`gemini-api`), subir `noticeVersion` y reescribir el aviso (hoy dice «Vertex AI»). Si no, se enviarían fotos al proveedor sin consentimiento.

## 1. Decisión de diseño

Un solo valor nuevo de driver, `gemini-api`, con **gating de entorno propio** (nunca producción) y **sin pasar por `SCENE_REAL_DRIVER_ACTIVATED`** (esa constante sigue siendo la llave de `real`/Vertex y de producción, T885). El driver `gemini-api` es un tramo de desarrollo/staging local que vive junto a `fake` y comparte con él: despachador en proceso (no Cloud Tasks), almacenamiento, cuota, contadores de intentos (REQ-ESC6-034) y validación de salida (REQ-ESC6-035).

Matriz de arranque (la hace `loadAppConfig`; el error nombra solo la variable, nunca el valor):

| `NODE_ENV` | `fake` | `gemini-api` | `real` |
|---|---|---|---|
| `production` | rechazado (igual que hoy) | **rechazado** (nombra `ARGOS_SCENE_DRIVER`) | exige `SCENE_REAL_DRIVER_ACTIVATED` (false hoy) → no arranca |
| `development` / `test` / ausente | defecto | exige `GEMINI_API_KEY` y `ARGOS_SCENE_GEMINI_MODEL`; si falta alguna, `AppConfigError` al arrancar | exige constante (false) → no arranca |

Consecuencia: producción sigue sin poder arrancar con escena (ni `fake` ni `gemini-api`), igual que hoy. Nada en `terraform/`, workflows ni `deploy-argos.yml` cambia, y `.env.example` conserva `ARGOS_SCENE_DRIVER=fake`.

## 2. Archivos a crear / tocar (para /keymaker, tras las enmiendas)

Crear:
1. `src/infrastructure/adapters/gemini-api-scene-image-generator.adapter.ts` — clase `GeminiApiSceneImageGenerator implements SceneImageGeneratorPort` (nombre sujeto a la enmienda del test T879; ver §7-C1).
2. `src/infrastructure/adapters/gemini-api-wire.ts` — funciones puras: construcción del cuerpo JSON, parseo de respuesta, extracción de la imagen, mapeo de errores HTTP. Separado para probar sin red.
3. `tests/unit/gemini-api-scene-generator.spec.ts` (adaptador con `fetch` simulado), `tests/unit/gemini-api-config-escena-006.spec.ts` (arranque), `tests/unit/gemini-api-composicion-escena-006.spec.ts` (composición y consentimiento), `tests/unit/gemini-api-aislamiento-escena-006.spec.ts` (guardas estáticas nuevas que sustituyen a las de T879 para este archivo).

Tocar:
4. `src/infrastructure/config/app-config.ts`: `ARGOS_SCENE_DRIVER` enum `['fake','gemini-api','real']` (en `APP_CONFIG_SCHEMA` y en `RawAppConfig`); leer `GEMINI_API_KEY` y `ARGOS_SCENE_GEMINI_MODEL` (hoy el modelo es `ARGOS_SCENE_MODEL` y solo aplica a `real`; se usa variable propia para no mezclar proveedores); ampliar `SceneConfig` con `driver: 'fake'|'gemini-api'|'real'`, `geminiApiKey: string|null`, `geminiModel: string|null`; reglas §3. La clave **no** debe entrar en ningún objeto que se serialice o registre (campo no enumerable o solo pasada al constructor del adaptador). Reutilizar `SCENE_MODEL_PATTERN` para el modelo (se interpola en la URL, INV-ESC6-018).
5. `src/infrastructure/http/scene-composition.ts`: `composeSceneServices` elige el generador por driver; para `gemini-api`: `realDriver: true`, `providerId` del driver, `generator = new GeminiApiSceneImageGenerator({ apiKey, model, fetch: options.fetch ?? fetch })`. `selectSceneDispatcher`: `gemini-api` va por el **despachador en proceso** (rama actual de `fake`); la rama de Cloud Tasks queda solo para `real`. Hoy `composeSceneServices` lanza para `real`; ese lanzamiento se conserva.
6. `src/domain/scene/notice.ts` y `src/presentation/web/scene-notice.ts`: `SCENE_PROVIDER_ID` pasa a depender del driver (o se añade un segundo id `gemini-api`); `noticeVersion` nueva para ese proveedor; texto del aviso: «Google Gemini API (Developer API), clave de ARGOS, modelo X». El texto legal definitivo lo firma Neo (REQ-ESC6-026); aquí solo el borrador marcado.
7. `.env.example`: añadir **solo comentadas y sin valor**: `# ARGOS_SCENE_GEMINI_MODEL=` y `# GEMINI_API_KEY=` (con la nota «solo fuera de producción»). `ARGOS_SCENE_DRIVER=fake` no cambia. No se escribe ninguna clave.
8. `tests/unit/guarda-driver-real-escena-006.spec.ts` (T879): ajuste mínimo, ver §7-C1.
9. `specs/006-escena-hogar-pixel-art/{spec,plan,research,tasks}.md` y contrato: ver sección 7 (enmiendas; las hace /architect con firma, no ahora).

No se toca: `package.json`/lock (cero dependencias; `fetch` nativo), `terraform/`, workflows, `scripts/verify-traceability.sh` (ver §7-C6), `SceneImageGeneratorPort` (el puerto actual basta: `prompt`, `references`, `signal`; el resultado ya limita el mime a PNG/WebP).

## 3. Reglas de configuración (solo en `app-config.ts`, INV-ARCH-006)

- `ARGOS_SCENE_DRIVER ∈ {fake, gemini-api, real}`; defecto `fake`.
- `gemini-api` + `NODE_ENV=production` → `AppConfigError(['ARGOS_SCENE_DRIVER'])`.
- `gemini-api` sin `GEMINI_API_KEY` (ausente o vacía) → `AppConfigError(['GEMINI_API_KEY'])`; sin `ARGOS_SCENE_GEMINI_MODEL` o fuera de patrón → `AppConfigError(['ARGOS_SCENE_GEMINI_MODEL'])`. Falla al arrancar; el mensaje nunca incluye el valor.
- `GEMINI_API_KEY`: sin patrón rígido de formato (no asumir el esquema de Google), solo no vacía, sin espacios ni saltos de línea, longitud 20..256 (evita cabecera inyectada). Con `fake` o `real` la variable se ignora (no se lee ni se valida).
- `ARGOS_SCENE_GEN_TIMEOUT_SECONDS` (10..105, defecto 90) se respeta tal cual: el adaptador **no** crea su propio temporizador mayor; usa `request.signal` (que el worker ya liga a `T_GEN`) y, defensivamente, `AbortSignal.any([request.signal, AbortSignal.timeout(genTimeoutSeconds*1000)])` con el valor de config pasado al constructor.
- Host y ruta del endpoint son constantes del código (`https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent`), nunca de config ni de entrada de usuario (INV-ESC6-018, anti-SSRF). `redirect: 'error'` en el `fetch`.
- `SCENE_REAL_DRIVER_ACTIVATED` no se toca y sigue false.

## 4. Puerto y adaptador

**Puerto**: sin cambios (`SceneGenerationRequest { prompt, references[IMG_n: mime, bytes], signal }` → `{ ok:true, image{mime,bytes} } | { ok:false, code: SceneErrorCode }`). El adaptador no lanza: captura todo y devuelve código. (El worker ya trata una excepción como `ERR-SCENE-GENERATION-FAILED`.)

**Petición** (`POST`, JSON):
- Cabeceras: `x-goog-api-key: <clave>`, `content-type: application/json`. **La clave nunca va en la URL ni en query** (prueba lo verifica); URL sin `?`.
- Cuerpo `generateContent`: `contents:[{ role:'user', parts:[ {text: prompt}, ...refs.map(r => ({ inlineData:{ mimeType: r.mime, data: base64(r.bytes) } })) ] }]`. El orden de las partes respeta el orden `IMG_1..IMG_n` ya fijado por el worker (el prompt las nombra por ranura).
- `generationConfig: { responseModalities: ['IMAGE'] }` (modo por defecto). Alternativa `['TEXT','IMAGE']` solo si el modelo elegido la exige; se fija por constante del adaptador según el modelo, no por entrada de usuario. Verificar con la documentación vigente [no verificado hoy, sin red].
- Tope de payload inline: el límite de petición del proveedor es menor que los 32 MiB agregados de REQ-ESC6-027. El adaptador comprueba el tamaño total del JSON antes de enviar contra una constante `GEMINI_INLINE_MAX_BYTES` (propuesta 18 MiB tras base64, **[no verificado]**); si lo supera devuelve `ERR-SCENE-GENERATION-FAILED` sin llamar a red. Ajustar el tope agregado de referencias (hoy 32 MiB) para este driver en la composición (`fit`) a ≈ 13 MiB de bytes crudos.

**Respuesta**:
- 200: recorrer `candidates[0].content.parts`; tomar la **primera** `inlineData` con `data` base64; ignorar partes `text` (nunca se persisten ni registran). Decodificar con límite (rechazar si la longitud base64 implica > `ARGOS_MEDIA_MAX_BYTES`, antes de decodificar).
- `finishReason`/`promptFeedback.blockReason` de bloqueo de seguridad, sin parte de imagen, o candidatos vacíos → `ERR-SCENE-GENERATION-FAILED` (sin copiar el motivo del proveedor).
- Tipo de salida: el adaptador **no confía** en `mimeType` del proveedor; devuelve el mime solo si la firma de los bytes es PNG o WebP; si es JPEG u otra cosa devuelve `ERR-SCENE-INVALID-IMAGE`. La lista blanca de trozos (sin `tEXt`/`zTXt`/`iTXt` genérico) y los límites de tamaño/megapíxeles los aplica `validateOutput` / `stripGeneratedImageMetadata` del worker (REQ-ESC6-035, `H-ORA-F6-A`) **antes de `put`**: el adaptador no duplica esa lógica, pero se prueba la cadena completa con salida de `fetch` que trae `tEXt` con el prompt (SC-ESC6-085 equivalente).
- Cuerpo de error del proveedor: se **descarta sin leer más de lo necesario** (`response.body?.cancel()`); jamás se incluye en logs, mensajes ni excepciones. Sin `console.*`. El adaptador no registra el prompt ni los bytes; si se quiere trazabilidad solo: modelo, nº de referencias, status HTTP y duración.

**Consentimiento (INV-ESC6-014)**: no lo valida el adaptador; ya lo exigen los casos de uso mientras `realDriver===true` (`scene-use-cases.ts`, `scene-run-use-case.ts` líneas 308–325, recomprobado en T2). Por eso `composeSceneServices` debe poner `realDriver: true` para `gemini-api`. Se prueba que con `gemini-api` y sin consentimiento vigente (o con `noticeVersion`/`providerId` antiguos) el generador recibe 0 llamadas.

## 5. Mapa de errores

| Condición | Resultado del adaptador | Notas |
|---|---|---|
| `AbortError` por `request.signal` o por el temporizador de config | `ERR-SCENE-GENERATION-TIMEOUT` | No distingue quién abortó; coherente con el worker |
| 429 (cuota/tasa del proveedor) | `ERR-SCENE-GENERATION-FAILED` | Cuenta como intento `FAILED` (REQ-ESC6-034); **no** hay reintento interno (evita gasto doble y exceder T_GEN). `Retry-After` del proveedor se ignora; el usuario ya recibe su propio `429 ERR-RATE-LIMITED` por los contadores propios |
| 500/502/503/504 y `fetch` rechazado por red | `ERR-SCENE-GENERATION-FAILED` | Transitorio; el usuario puede reintentar sujeto a enfriamiento de 60 s |
| 400 (prompt/imagen inválidos), 401/403 (clave inválida o sin permiso), 404 (modelo) | `ERR-SCENE-GENERATION-FAILED` | Determinista; 401/403/404 son errores de configuración: se distinguen solo en un contador/log interno **sin valores** (`status`), no en el código público |
| 200 sin imagen, bloqueo de seguridad, JSON no parseable | `ERR-SCENE-GENERATION-FAILED` | |
| 200 con imagen no PNG/WebP, firma ≠ tipo, base64 inválido o excesiva | `ERR-SCENE-INVALID-IMAGE` | |
| Payload > `GEMINI_INLINE_MAX_BYTES` | `ERR-SCENE-GENERATION-FAILED` | Sin llamada a red |

**No se añaden códigos `ERR-SCENE-*` nuevos**: el catálogo de cuatro códigos `SCENE_STATE` del contrato 006 no cambia (la compilación de contratos no se toca). El `429` HTTP del usuario sigue siendo el heredado `ERR-RATE-LIMITED`.

## 6. Pruebas a escribir (todas con `fetch` simulado; cero red; `test:gate` intacto)

Adaptador (`gemini-api-scene-generator.spec.ts`), `fetch` es un doble que registra `(url, init)`:
1. URL exacta `https://generativelanguage.googleapis.com/v1beta/models/<modelo>:generateContent`, sin `?`, sin la clave; cabecera `x-goog-api-key` presente con el valor; la clave no aparece en `url`, en `body` ni en ningún error devuelto. Método `POST`, `redirect:'error'`.
2. Cuerpo: parte 0 = texto del prompt; partes siguientes `inlineData` con mime y base64 correctos y **en el orden IMG_1..IMG_n**; `responseModalities` = `['IMAGE']`; modo `['TEXT','IMAGE']` cuando el modelo lo exige.
3. Éxito PNG y WebP: devuelve `ok:true` con bytes decodificados; ignora partes `text`.
4. Salida JPEG, firma que no coincide con `mimeType` declarado, base64 inválido, imagen ausente → `ERR-SCENE-INVALID-IMAGE` / `ERR-SCENE-GENERATION-FAILED` según §5.
5. Tabla de status (400, 401, 403, 404, 429, 500, 503) → código esperado; 429 no dispara un segundo `fetch` (`calls === 1`).
6. Timeout: `fetch` simulado que espera la señal; con `signal` abortada → `ERR-SCENE-GENERATION-TIMEOUT`; con timeout de config de 10 s y reloj simulado (`vi.useFakeTimers`) aborta a los 10 s, no antes ni después.
7. `fetch` rechazado → `FAILED`; la excepción no escapa.
8. **Sin eco**: un cuerpo de error del proveedor que repite el prompt y la clave no aparece en el resultado, en `console.*` (espía) ni en `Error.message`.
9. Payload sobre el tope → `FAILED` con 0 llamadas.
10. Cadena completa con el worker: salida con `tEXt`(prompt)+`caBX`+XMP → publicada sin `tEXt`, con `caBX` y XMP; el prompt no es subcadena de los bytes publicados.

Config (`gemini-api-config-escena-006.spec.ts`): `gemini-api` en `production` falla nombrando solo `ARGOS_SCENE_DRIVER`; sin clave falla nombrando solo `GEMINI_API_KEY`; sin modelo / modelo inválido (`../`, espacios, `?`) falla nombrando `ARGOS_SCENE_GEMINI_MODEL`; el mensaje de error no contiene el valor de la clave (se usa una cadena centinela de prueba); `fake` y `real` ignoran `GEMINI_API_KEY`; `.env.example` conserva `ARGOS_SCENE_DRIVER=fake` y no contiene valor de `GEMINI_API_KEY`; `real` sigue sin arrancar (constante false).

Composición/consentimiento: `gemini-api` compone `GeminiApiSceneImageGenerator` con `realDriver:true`, despachador en proceso; sin consentimiento vigente → 0 llamadas al doble; consentimiento de `noticeVersion` o `providerId` viejo → 0 llamadas; revocación en vuelo cancela (EDGE-ESC6-025, ya cubierto por el worker; se repite con este driver).

Aislamiento estático (sustituye la guarda de T879 para este archivo): el literal `generativelanguage.googleapis.com` aparece **solo** en `gemini-api-scene-image-generator.adapter.ts` (y en `gemini-api-wire.ts` si se aloja ahí); `aiplatform.googleapis.com` sigue sin aparecer; ningún `import` de SDK de IA ni `google-auth-library`; `package.json` y lock sin cambios; los workflows y `terraform/` no mencionan `gemini-api` ni `GEMINI_API_KEY`; `process.env` no se lee fuera de `src/infrastructure/config/`.

## 7. CAMBIOS DE CONTRATO / NIVEL 2

**TO: Neo (Andrés Vallejo — Level 2)**. Cada fila es un choque verificado en disco. «Enmienda» = firma de Neo requerida; el Architect no aplica nada hasta recibirla.

| # | Norma existente (evidencia en disco) | Conflicto | ¿Enmienda firmada por Neo? |
|---|---|---|---|
| C1 | **T879** (`tasks.md` línea 175, ya `[x]` COMPLETED) y su prueba `tests/unit/guarda-driver-real-escena-006.spec.ts` líneas 61–80 (SC-ESC6-050, SC-ESC6-061, REQ-ESC6-017): ninguna clase `*Vertex*`/`*Gemini*` en `src/`; ningún literal `generativelanguage.googleapis.com` ni `aiplatform.googleapis.com` en `src/`; «cero llamadas a red de IA» | El adaptador exige exactamente ambas cosas. La guarda fallaría en `test:gate` | **Sí.** Autorizar modificar la prueba cerrada de T879 (una tarea nueva `[GOV]/[N2]`, no reabrir T879): permitir el literal y la clase **solo** en `gemini-api-scene-image-generator.adapter.ts` (lista blanca por ruta), manteniendo el resto de la guarda. Mantener `aiplatform.*` y SDKs prohibidos |
| C2 | **REQ-ESC6-017** (`spec.md` línea 159): `ARGOS_SCENE_DRIVER` ∈ {`real`,`fake`}; proveedor real = Vertex; adaptador real no seleccionable | Tercer valor `gemini-api` y proveedor distinto de Vertex | **Sí** (enmienda del texto del requisito y de `REQ-ESC6-031`; `SC-ESC6-025`, `SC-ESC6-061` ajustados; contrato de config no es OpenAPI, pero `plan.md` y `spec.md` sí cambian) |
| C3 | **REQ-ESC6-028** (`spec.md` línea 177): «se confirma además que la API pública de Gemini (Developer API) **no equivale** a Vertex en términos de datos»; sin retención/entrenamiento documentados con fuente el adaptador real no se activa | `gemini-api` envía fotos del hogar y de mascotas a la Developer API, cuyos términos (nivel gratuito frente a pago, uso para entrenamiento, retención) **no están documentados con fuente** en `research.md` [no verificado, sin red]. El diseño fuera de producción reduce, pero no elimina, el riesgo (las fotos con datos reales salen a un tercero) | **Sí.** Neo debe decidir: (a) acotar `gemini-api` a **datos de prueba** y declararlo en el aviso (no usar fotos reales de usuarios), o (b) exigir primero la verificación documental con red en `research.md`. Recomendación: (a) + (b) antes de usar con terceros |
| C4 | **Constitución Principio VI 3.6.0** (`constitution.md` línea 194): solo se admiten servicios gratuitos; única excepción de pago = **Vertex AI** (Gemini Image), condicionada a REQ-ESC6-028 y a la compuerta del driver real, tope 5 USD/mes | La Gemini Developer API con clave es un servicio de otro proveedor-producto; si es de pago (o su uso gratuito implica ceder datos) queda fuera de la excepción. «La excepción no cubre ningún otro servicio, modelo ni proveedor» (cláusula d) | **Sí, enmienda constitucional (Nivel 2).** Redacción mínima sugerida: ampliar la excepción a «`gemini-api` solo fuera de `NODE_ENV=production`, tope de gasto declarado, sin activación en producción». Neo debe fijar el tope (propuesta: el mismo de 5 USD/mes compartido, o 0 USD si solo nivel gratuito) |
| C5 | **N2-10 y compuerta del driver real** (`spec.md` líneas 556–575; T885 `[GOV]` bloqueada) | `gemini-api` no es `real` y no pasa por la compuerta; la restricción de Neo (1) lo permite solo fuera de producción, pero N2-10 dice «no activar `ARGOS_SCENE_DRIVER=real`» (no nombra `gemini-api`) y N2-01 A, N2-02 A (contador global) siguen «obligatorios antes del driver real» | **Aclaración firmada** (no cambio de fondo): que N2-10/N2-01/N2-02 no aplican a `gemini-api` por no poder ejecutarse en producción, y que `gemini-api` sin contador global de gasto queda limitado a dev. Sin esa aclaración, un auditor puede leer `gemini-api` como violación de N2-10 |
| C6 | **`scripts/verify-traceability.sh --feature 006`** (líneas 100–102, 337–345): exige spec→`tasks.md` 1:1 de todo ID propio `REQ|INV|NFR|SC|EDGE-ESC6-NNN` | Los requisitos/escenarios nuevos (p. ej. `REQ-ESC6-037` driver `gemini-api`, `SC-ESC6-097..` pruebas) deben figurar en `tasks.md` o la compuerta falla. El rango `SC-ESC6-001..096` está acotado en el script (cabecera líneas 29–30) | **Sí, sobre el script** (script de verificación = Nivel 2, Principio VI): ampliar el rango de SC a `..105` (o el que fije el Architect). Y **tarea nueva en `tasks.md`**: la agrega /morpheus/Architect con firma; no se marca COMPLETED sin Neo |
| C7 | **`app-config.ts`** (líneas 31–37, 145, 209): enum `fake\|real`, 9 variables `ARGOS_SCENE_*`, «las 9 variables solo se leen aquí»; `ARGOS_SCENE_GLOBAL_QUOTA_MAX` no se lee | Nuevo valor de enum y dos variables (`GEMINI_API_KEY`, `ARGOS_SCENE_GEMINI_MODEL`); `SC-ESC6-034/087/092` y pruebas que cuentan 9 variables | **Sí, al cambiar el conteo en spec/plan** (enmienda de documento) y T830 tests; el código de config es de infraestructura (lo toca /keymaker con tarea) |
| C8 | **`scene-composition.ts`** (líneas 4, 50, 65–68): «`real` = Cloud Tasks»; `composeSceneServices` fija `realDriver:false` y `providerId` único | Debe añadirse rama `gemini-api` con `realDriver:true` y despachador en proceso. Un `realDriver:false` por descuido evita el consentimiento: **riesgo de privacidad (INV-ESC6-014)** | No requiere firma por sí mismo (código), **pero** exige que el consentimiento y el aviso cubran el proveedor `gemini-api` (C9) |
| C9 | **REQ-ESC6-023/026**, `SCENE_PROVIDER_ID = 'vertex-gemini-image'` (`src/domain/scene/notice.ts:9`) y el aviso (`src/presentation/web/scene-notice.ts:43`, «Vertex AI») | El aviso declara Vertex; con `gemini-api` el dato viajaría a otro proveedor sin que el aviso lo diga | **Sí** (texto legal: lo redacta y firma Neo, REQ-ESC6-026). Hasta entonces el borrador del aviso para `gemini-api` va marcado «BORRADOR» y `noticeVersion` distinta |
| C10 | **Secretos**: «ausencia de secretos nuevos» (`spec.md` «Lo que no necesita decisión de Neo»), REQ-IAC-005 (Secret Manager), `REQ-ESC6-017` («la credencial se guarda en Secret Manager») | `GEMINI_API_KEY` es el primer secreto de proveedor. Este diseño la deja **solo en el entorno local no productivo** (nunca en `terraform/`, workflows ni repo) | **Aclaración firmada**: confirmar que no se crea secreto en Secret Manager ni variable en `deploy-argos.yml` para `gemini-api` (producción lo rechaza) |

Sin conflicto verificado: `package.json` (cero deps, `fetch` nativo; SC-ESC6-050 se cumple), constitución sobre stack (Node 22), contratos OpenAPI/JSON Schema/errores de 006 (sin cambios: 4 códigos `SCENE_STATE` bastan), `INV-ESC6-016` (el adaptador no devuelve cuerpo del proveedor), `REQ-ESC6-035` (validación de salida ya existe), `REQ-ESC6-034` (contadores ya cubren fallos).

### Orden propuesto de firmas

1. C3 y C4 primero (deciden si el diseño es lícito: proveedor, datos de prueba, tope).
2. C1, C2, C6, C7 (enmiendas de documento/prueba/script) → tareas `[N2]` en `tasks.md` (a crear por Architect/Morpheus; ninguna se marca `COMPLETED` salvo por Neo).
3. C5, C10 (aclaraciones).
4. C9 (texto del aviso) puede ir en paralelo; sin él, `gemini-api` solo con datos de prueba.

## 8. Riesgos residuales

- Datos del proveedor (retención, entrenamiento, nivel gratuito, límite de imágenes de entrada, tamaño máximo de petición inline, soporte de `responseModalities` por modelo) **no verificados** hoy (sin red): marcados en el texto; deben verificarse con fuente antes del primer uso con datos reales.
- Sin dependencia de imagen no hay redimensionado (N2-01 = B): una foto grande se envía tal cual hasta el tope inline; el tope baja a ~13 MiB crudos en este driver.
- La clave en variable de entorno local puede filtrarse por volcados de proceso o `.env` mal ignorado; mitigación: `.env` ya fuera de git (verificar en la tarea), clave nunca en errores/logs (prueba 8).
- Un cambio de comportamiento del modelo (`ARGOS_SCENE_GEMINI_MODEL`) altera el formato de salida: cubierto por validación por firma.

FROM: Architect · TO: Neo (vía /morpheus) · Evidencia: lectura de `spec.md`, `tasks.md`, `constitution.md`, `app-config.ts`, `scene-composition.ts`, `scene-run-use-case.ts`, `guarda-driver-real-escena-006.spec.ts`, `verify-traceability.sh`, `.env.example`.
