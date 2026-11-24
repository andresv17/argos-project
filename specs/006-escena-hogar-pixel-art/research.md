# Research: Escena visual del hogar en pixel art con IA (Feature 006)

**Estado**: `DRAFT` (Architect, 2026-11-18). Sin `APPROVED` ni `LOCKED`.
**Metodología y honestidad de fuentes**: esta sesión **no tiene red**. Todo dato sobre Vertex AI, Cloud Tasks o Cloud Run Jobs que no esté en un archivo del repositorio proviene de la memoria del modelo (corte de conocimiento junio 2026) y se marca **`[verificar]`**: no es evidencia. Lo que consta en disco se cita con su ruta. Ningún `[verificar]` puede convertirse en requisito firmado sin consultar la fuente oficial (`REQ-ESC6-028`, `SC-ESC6-043`, `SC-ESC6-060`).

## 1. Qué consta en disco (evidencia)

| Hecho | Fuente |
|---|---|
| Ningún SDK de IA en `package.json` ni en el lock; `google-auth-library` 11.3.4 (Apache-2.0) es solo transitiva de `@google-cloud/storage` 9.0.0 | `.specify/memory/audits/merovingian-006-dependencia-ia.md` |
| `terraform/cloud_run.tf`: `timeout = "60s"`, `max_instance_request_concurrency = 20`, `min_instance_count = 0`, `max_instance_count = 2`, `cpu = "1"`, `cpu_idle = true`, `startup_cpu_boost = true`, `location = var.region` | `terraform/cloud_run.tf` l.18-47 |
| Presupuesto actual de 1 USD, filtro por etiqueta `app=argos`, umbrales 50/90/100 %; **solo avisa, no detiene el gasto** | `terraform/budget.tf` (cabecera) |
| `terraform/services.tf` ya habilita `run.googleapis.com` (no `aiplatform` ni `cloudtasks`) | `terraform/services.tf` |
| Región del proyecto `us-central1`; el bucket de medios y Cloud Run están allí | `.specify/memory/constitution.md` (Fase Cloud) |
| `jose` 6.2.17 autorizado solo para la verificación OIDC de `/internal/maintenance`; Cloud Scheduler ya invoca ese endpoint con OIDC | `constitution.md` (dependencias), `terraform/scheduler.tf`, `src/infrastructure/http/oidc-verify.ts` |
| No existe códec de imágenes (`sharp`, `jimp`, `pngjs`) en `package.json`; 004 elimina EXIF solo con `canvas` en el cliente (`D-13`) | `package.json`; `specs/004-.../spec.md` REQ-ARC-001 |
| Ventana residual de borrado: PITR 6 h y volcados de 14 d | `claude/log-architect.md` (003, R-14) |

## 2. Vertex AI (Gemini Image): lo que se necesita saber

Todo lo de esta sección es `[verificar]` salvo indicación contraria.

### 2.1 Superficie REST y autenticación
- Endpoint de generación: `POST https://us-central1-aiplatform.googleapis.com/v1/projects/{PROJECT}/locations/us-central1/publishers/google/models/{MODEL}:generateContent` `[verificar]`. Cuerpo: `contents[].parts[]` con `text` y `inlineData {mimeType, data(base64)}`; `generationConfig.responseModalities = ["IMAGE"]` (y, según modelo, `["TEXT","IMAGE"]`) `[verificar]`. Respuesta: `candidates[0].content.parts[]` con `inlineData` de la imagen `[verificar]`.
- Autenticación sin SDK ni `google-auth-library`: token OAuth2 de la cuenta de servicio de Cloud Run obtenido del servidor de metadatos, `GET http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token` con la cabecera `Metadata-Flavor: Google`; se usa como `Authorization: Bearer`. Se cachea hasta ~60 s antes de `expires_in`. Rol requerido: `roles/aiplatform.user` `[verificar]`; API `aiplatform.googleapis.com` habilitada `[verificar]`.
- **Gemini Developer API (`generativelanguage.googleapis.com`) NO es Vertex**: otra superficie, otros términos de datos y clave de API; queda excluida (`REQ-ESC6-028`, `RAMA` §3). El adaptador solo apunta al host `*-aiplatform.googleapis.com`.
- SSRF: el host del proveedor es constante (no entra por entrada del usuario) y se valida con una lista cerrada en la configuración (`INV-ARCH-006`); el cliente no sigue redirecciones (`redirect: 'error'`).

### 2.2 Modelos y límite de imágenes de referencia (**riesgo mayor para `D6-02` = 8**)
| Dato | Valor recordado | Estado |
|---|---|---|
| Modelo rápido de imagen (familia «Flash Image») | admite pocas imágenes de entrada (del orden de 3) | `[verificar]` |
| Modelo «Pro» de imagen | admite del orden de 14 imágenes de referencia (hasta 5-6 con alta fidelidad por objeto o persona) | `[verificar]`; puede estar en vista previa |
| Formatos de entrada | PNG, JPEG, WebP, HEIC/HEIF | `[verificar]` |
| Tamaño máximo de la petición con datos en línea | del orden de 20 MB totales | `[verificar]`; con 9 imágenes de hasta 10 MiB (`ARGOS_MEDIA_MAX_BYTES`) se superaría |

**Consecuencia de diseño (no depende de la verificación)**: el número real de imágenes por llamada es `N + 1` en `FROM_SCRATCH` y `REGENERATE` (foto del hogar + `N` avatares; sin escena previa) y `1 + (#ADD + #REPLACE + #KEEP con foto)` ≤ `N + 1` en `INCREMENTAL_ADD`, `INCREMENTAL_REPLACE` e `INCREMENTAL_MIXED` (**enmienda 2026-11-19, `T924`, `D6-20`**: las `KEEP` con foto vigente también viajan como referencia para conservar su apariencia; la cota `N + 1` no cambia), y `1` en `INCREMENTAL_REMOVE` (las `REMOVE` no necesitan foto y no se dibuja nada). La regla del spec `N + 2 ≤ límite` es conservadora; la condición exacta es `N + 1 ≤ límite`. Si el límite verificado del modelo elegido es menor que 9, `N` baja por configuración a `límite − 1` (o `límite − 2` por la regla vigente del spec) **sin cambiar el contrato** (`D6-02` = A, `SC-ESC6-060`). **Este es el punto del que depende que `N = 8` sea realmente usable**; con un modelo de ~3 imágenes `N` quedaría en 1 o 2 y la feature perdería gran parte de su valor.

### 2.3 Términos de datos (exigidos por `REQ-ESC6-028`; sin fuente en disco)
| Pregunta | Estado | Fuente a consultar |
|---|---|---|
| ¿Entrena Google con datos del cliente de Vertex? | Se recuerda que **no** («los datos del cliente no se usan para entrenar sin permiso») `[verificar]` | documentación «Data governance» de Vertex AI y términos de servicio de Cloud |
| Retención de entradas y salidas | La retención de caché de Gemini (hasta 24 h) puede desactivarse a nivel de proyecto `[verificar]`; puede haber registro de prompts para detección de abuso hasta 30 d `[verificar]` | «Data governance / zero data retention» |
| Región de proceso | `us-central1` por el endpoint regional; confirmar que el modelo elegido no procesa fuera `[verificar]` | Ubicaciones de Vertex AI |
| Borrado a petición | `[verificar]` | Política de datos de Cloud |
| SLA de datos / DPA | Términos de procesamiento de datos de Cloud (CDPA) `[verificar]` | Google Cloud DPA |
| Nivel gratuito para imágenes | No confirmado; se asume **sin** nivel gratuito (`H-MERO-006-01`) `[verificar]` | Precios de Vertex AI |

Mientras estas filas no tengan fuente, el aviso (`aviso-consentimiento-borrador.md`, puntos 3 y 4) **no puede firmarse** y el adaptador real **no se activa** (`D6-01`).

### 2.4 Costo y su efecto sobre `D6-12`
- Costo unitario recordado: del orden de 0,04 USD por imagen en el modelo rápido y 0,13-0,24 USD en el modelo Pro según resolución `[verificar]`. Con 5 USD/mes, eso equivale a entre ~20 y ~125 generaciones **en total de toda la plataforma**.
- La cuota firmada (`D6-03`: 10 por hogar y mes) **no acota el gasto total**: con 13 hogares activos que agoten su cuota con el modelo Pro se superarían los 5 USD. Y `terraform/budget.tf` solo **avisa** (su propio comentario lo dice). Por eso se registra `H-ARCH-006-02` (tope global opcional, `plan.md` §6.5) para decisión de Neo; no se añade sin su firma.

### 2.5 Salida
Imagen PNG o JPEG en base64 `[verificar]`; el modelo puede devolver texto en lugar de imagen o rechazar por seguridad (`finishReason`/`promptFeedback`) `[verificar]`: ambos son fallo (`EDGE-ESC6-004`). La salida puede llevar una marca de agua invisible (SynthID) `[verificar]`; no afecta el diseño. El formato esperado por contrato es PNG o WebP; si el modelo entrega JPEG se convierte en una decisión pendiente (no hay códec): se acepta JPEG también en `EDGE-ESC6-004` `[verificar con la salida real]` y se propone ampliar el conjunto aceptado a `image/jpeg` (MINOR, `contracts/`).

### 2.3-bis Fuentes consultadas (`T958`, Neo, 2026-11-19)

Fuentes registradas por Neo (Nivel 2) como consultadas el 2026-11-19; los agentes no las verificaron en red:
- *Google Cloud Data Processing Addendum*: https://cloud.google.com/terms/data-processing-addendum
- *Google Cloud Service Specific Terms*, Generative AI / Vertex AI: https://cloud.google.com/terms/service-terms (los Customer Data no se usan para entrenar modelos fundacionales).

Cubren las filas de §2.3 sobre entrenamiento y DPA. Retención, borrado, región, SLA y precios siguen con `[verificar]` hasta que se cite su fuente y **quedan fuera de la firma del texto final del aviso**; Neo confirma el texto final tras `T950` y la revisión de `/rama` (`T958`, `D6-23` (d)).

#### Nota REQ-ESC6-028 (`T1301`, Link, 2026-11-23): lectura de la fuente oficial
- *Data governance* de Vertex AI: https://docs.cloud.google.com/vertex-ai/generative-ai/docs/data-governance (redirección 301 desde `cloud.google.com/...`; sin fecha en la página). Leída por WebFetch.
- **No entrenamiento: VERIFICADA.** Texto: "Google won't use your data to train or fine-tune any AI/ML models without your prior permission or instruction." Aplica a todos los modelos gestionados.
- **Retención de salidas de imagen: NO VERIFICADA.** La página no fija un plazo general para prompts y salidas de modelos de imagen Gemini. Solo da plazos de otras funciones (Interactions API, grounding con Maps 30 d, Deep Research 7 d, Gemini Live 24 h). No se usa ninguno como plazo de imagen.
- **Residencia: PARCIAL.** "It's processed in the region that serves the request." Con endpoint `global`: "requests and their cached data can be served from any region". Por tanto la residencia solo se sostiene con endpoint regional; si la lista cerrada incluye `global`, REQ-ESC6-028 no se cumple.
- **Borrado a petición: NO VERIFICADO** en esta página.
- **Precios (referencia, no Vertex):** la página de precios de Vertex sigue truncada; sin cifras oficiales. Detalle en `specs/009-aprobacion-admin-correo/research-tarifas-vertex-009.md`.
- Estado: REQ-ESC6-028 queda **abierto** (sin cerrar retención ni borrado). Sin cambios en el texto del aviso ni en contratos.

## 3. Costo e IAM: resumen de lo que habría que cambiar (solo descripción)
Ver `plan.md` §7. Nada de esto se ejecuta ni se escribe en `terraform/`.

## 4. Decisión de ejecución en segundo plano (`D6-15` = B): Cloud Tasks vs Cloud Run Job

### 4.1 Problema
`NFR-ESC6-002` y `H-MERO-006-02`: con `cpu_idle = true` (CPU solo durante solicitudes) el trabajo lanzado tras responder la petición se estrangula; el timeout de solicitud es 60 s y `T_GEN` es 90 s.

### 4.2 Opciones

| Criterio | **A. Cloud Tasks → endpoint interno del mismo servicio** | **B. Cloud Run Job (una ejecución por generación)** |
|---|---|---|
| Cómo corre | Cloud Tasks hace `POST` autenticado por OIDC a `/internal/scene-worker` de Cloud Run; es una solicitud real con CPU asignada | `run.googleapis.com` `jobs:run` con `overrides` (env/args con `sceneId` y `attemptId`); la ejecución es un contenedor aparte |
| CPU durante el trabajo | Sí (es una solicitud en curso), sin cambiar `cpu_idle` | Sí (CPU de la tarea del Job) |
| Timeout | El del servicio: hay que subir `timeout` (60 s) a ≥ `T_GEN` + margen (p. ej. 120 s) para todo el servicio, o crear un segundo servicio solo-worker | Hasta horas; sin cambiar el servicio web |
| Reintentos / duplicados | Entrega «al menos una vez» con reintentos configurables; hay que ser idempotente (`EDGE-ESC6-024`); `maxAttempts` bajo (1-2) porque el reintento automático no debe consumir cuota (`REQ-ESC6-013`: 0 reintentos automáticos → `maxAttempts = 1`) | `maxRetries` del Job configurable (0 recomendable) |
| Reutiliza lo existente | Sí: patrón OIDC de Scheduler y `oidc-verify.ts` (`jose` ya autorizado, ámbito acotado: habría que extender el ámbito de esa autorización a una segunda ruta, **Nivel 2**) | El mismo contenedor; imagen/arranque del Job con otro `command`; más IaC |
| Arranque | Instancia caliente o arranque en frío del servicio (~segundos) | Arranque de contenedor por ejecución (~segundos a decenas de s) `[verificar]` |
| Capa gratuita | Cloud Tasks: 1 M de operaciones/mes gratis `[verificar]`; cabe de sobra | Cloud Run Jobs: capa gratuita compartida de vCPU-s y GiB-s `[verificar]`; cabe de sobra con 90 s por generación |
| IaC nueva | `google_cloud_tasks_queue`, API `cloudtasks.googleapis.com`, `roles/cloudtasks.enqueuer` y `iam.serviceAccountUser` sobre la propia cuenta, `roles/run.invoker` para el OIDC, `timeout` ≥ 120 s | `google_cloud_run_v2_job`, `roles/run.developer`/`run.jobs.run` para la cuenta de la API, sobrescritura de entorno por ejecución, API ya habilitada |
| Superficie de seguridad | Nueva ruta interna; el `payload` de la tarea solo lleva IDs opacos (sin PII); sin PII en la cola | Los IDs viajan en `overrides`; la identidad es la cuenta de servicio |
| Desarrollo local y CI | `SceneJobDispatcherPort` con adaptador en proceso (mismo proceso, `setImmediate`) | El mismo puerto con el mismo adaptador en proceso |

### 4.3 Recomendación del Architect (sujeta a la revisión de `/link`)
**Opción A (Cloud Tasks hacia `/internal/scene-worker`)**, con `maxAttempts = 1`, cola con límite de concurrencia 1-2 (`maxConcurrentDispatches`) y `dispatchDeadline` ≥ 150 s. Motivos: (1) cambia menos IaC que un Job (cola + 3 permisos frente a Job + sobrescrituras), (2) reutiliza el patrón OIDC ya probado de `/internal/maintenance`, (3) el worker es una solicitud real: se acaba el estrangulamiento sin tocar `cpu_idle`. Costos: subir el timeout del servicio (afecta a todas las rutas; mitigable limitando la ruta del worker con su propio límite de `T_GEN` en el cliente `fetch`) y extender la autorización de `jose` a una segunda ruta (Nivel 2). Si `/link` o Neo prefieren aislar el trabajo largo, la **opción B** es equivalente en el puerto y solo cambia el adaptador `SceneJobDispatcherPort` (el dominio y la aplicación no cambian, `INV-ARCH-005`). `T_LEASE` = 150 s es la red de seguridad en ambos: si la tarea nunca corre, el arrendamiento vence y la escena pasa a `failed` sin consumir cuota (`EDGE-ESC6-003`).

**Esta evaluación no sustituye la de `/link`**; `plan.md` §6 la recoge como pendiente de revisión.

## 5. Normalización de imágenes sin códec (`H-ARCH-006-01`)
- `REQ-ESC6-027` (condición `C5` de `/rama`) pide recodificar y redimensionar en el servidor. Sin `sharp` ni equivalente (no autorizados) Node 22 no puede decodificar JPEG/PNG/WebP.
- Lo que **sí** se puede sin dependencia: eliminar metadatos reescribiendo el contenedor: JPEG (eliminar segmentos `APP1` EXIF/XMP, `APP13` IPTC, `APP2` ICC, `COM`), PNG (eliminar trozos `eXIf`, `tEXt`, `iTXt`, `zTXt`, `iCCP`, `tIME`), WebP/RIFF (eliminar trozos `EXIF`, `XMP `, `ICCP`). Sin recodificar los píxeles; se verifica la ausencia por recorrido del contenedor.
- Lo que **no** se puede: redimensionar ni reducir el peso. Opciones para Neo: (A) autorizar una dependencia de imagen (Nivel 2; `sharp` trae binarios nativos que afectan al `Dockerfile` y al supply chain, requiere a `/merovingian`), (B) aceptar `RR-06-10` (solo metadatos; peso por `ARGOS_MEDIA_MAX_BYTES` 10 MiB), (C) que el cliente reduzca la imagen con `canvas` antes de subir (mejora de 004, no garantía del servidor).
- Orientación EXIF: al borrar `APP1` una foto subida por API directa con orientación EXIF puede verse girada. 004 aplica la orientación en el cliente con `canvas`; el riesgo solo afecta a cargas por API directa.

## 6. Resumen de pendientes con red
1. Modelo exacto, nombre, versión (GA o preview), región y límite de imágenes de entrada (§2.2).
2. Términos de datos de Vertex (§2.3) con enlace y fecha de lectura.
3. Costo unitario por resolución y cuotas (§2.4).
4. Tamaño máximo de petición con `inlineData` (§2.2) y formatos de salida (§2.5).
5. Capa gratuita y precios de Cloud Tasks y de Cloud Run Jobs (§4.2).
6. `npm audit` y licencias: no aplica en esta fase (sin dependencia nueva, `SC-ESC6-050`).

## 7. Descartado
- SDK `@google/genai`/`@google-cloud/vertexai` (`D6-01` = A: sin dependencia).
- OpenAI u otro proveedor (`D6-01` = A).
- Ejecutar en la misma instancia tras responder (`D6-15` = A; descartado por `H-MERO-006-02`).
- Pub/Sub como cola (más IaC que Cloud Tasks para el mismo fin).
