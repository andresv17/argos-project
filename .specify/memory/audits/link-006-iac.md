# Auditoría IaC/CI de la 006 (escena del hogar): revisión de `plan.md` §6-§7 y `research.md` §6

**Autor**: Link (`/link`), 2026-11-18. **Rama**: `006-escena-hogar-pixel-art`. **Estado**: `REVIEW` (ningún cambio escrito en `terraform/`, `.github/` ni `specs/`; sin `terraform plan/apply`; sin commit ni push).
**Fuentes leídas**: `terraform/{cloud_run,budget,services,iam,scheduler,secret_manager,variables,outputs,provider}.tf`, `terraform/bootstrap.sh`, `.github/workflows/{infraestructura,deploy-argos}.yml`, `specs/006-*/{plan,research}.md`, `specs/003-cloud-gcp/spec.md` (REQ-CLD-002, REQ-IAC-006, REQ-IAC-009, NFR-CLD-001), `tests/unit/terraform-*.spec.ts`.
**Sin red**: todo dato de precios, cuotas y comportamiento de Cloud Tasks / Cloud Run / Vertex que no esté en disco va marcado **[verificar]**.

---

## 0. Resumen ejecutivo

1. **La arquitectura de `plan.md` §6 (Cloud Tasks → `/internal/scene-worker`) es la opción más simple y es compatible con `cpu_idle = true`.** No hace falta Cloud Run Job. Hay que subir el `timeout` del servicio y, recomendado, la memoria.
2. **Tres errores de la §7 que hay que corregir antes de implementar:**
   - **Moneda del presupuesto.** `budget_currency` vale `COP` por defecto y `budget_units = "4500"` equivale a ~1 USD. Poner `budget_units = 5` daría **5 COP**. Para 5 USD hay que poner ~22500 COP (tipo de cambio fijo a verificar) o cambiar la moneda a USD si la cuenta de facturación es USD.
   - **Las variables de entorno `ARGOS_SCENE_*` no van en `cloud_run.tf`.** `env` está en `ignore_changes` y `deploy-argos.yml` usa `--set-env-vars`, que reemplaza todo el entorno. Van en `deploy-argos.yml`.
   - **El filtro del presupuesto por etiqueta `app=argos` probablemente no ve el gasto de Vertex AI.** Las llamadas a la API no llevan etiquetas de recurso [verificar]. Un presupuesto que no ve el gasto no alerta de nada.
3. **El presupuesto de 5 USD no detiene nada.** No hay en 003 ningún mecanismo que corte el gasto. El único tope real que propone el plan es el contador de la aplicación (`ARGOS_SCENE_GLOBAL_QUOTA_MAX`, plan §6.5). Sin él, con el modelo Pro el gasto del peor caso (130 generaciones/mes) es de 17 a 31 USD, muy por encima de 5 USD.
4. **Costo de la infraestructura nueva:** dentro de la capa gratuita con el volumen previsto, con margen amplio [verificar]. El costo real es el de Vertex (imágenes), no el de Cloud Tasks ni el de Cloud Run.
5. **Cambios que contradicen textos firmados** (requieren enmienda de Nivel 2 y actualizar pruebas): API de 12 a 14 (REQ-IAC-009), IAM de proyecto para la cuenta de ejecución (REQ-IAC-006), `timeout` de 60 s (REQ-CLD-002), memoria 512 MiB (REQ-CLD-002), alarma de 1 USD (NFR-CLD-001 y Fase Cloud de la constitución).
6. **CI:** no hay secretos nuevos ni variables nuevas de GitHub. Sí hay que dar permisos a las cuentas de CI (`bootstrap.sh`, que lo ejecuta Neo a mano) y añadir variables de entorno a `deploy-argos.yml`. Nada se aplica sin Neo si el entorno `produccion` tiene revisores requeridos [verificar en la configuración de GitHub].

---

## 1. Estado real de `terraform/` frente a lo previsto (punto 1 de la petición)

| Cambio previsto (plan §7) | Estado real en disco | Compatibilidad | Hallazgo |
|---|---|---|---|
| Habilitar `aiplatform.googleapis.com` y `cloudtasks.googleapis.com` en `services.tf` | `services.tf` tiene 12 APIs en un `for_each`; el test `tests/unit/terraform-root.spec.ts:79` exige exactamente 12 | Técnicamente sí | **Contradice REQ-IAC-009** («solo estas 12»). Requiere enmienda Nivel 2 y actualizar el test. |
| `roles/aiplatform.user` a `argos-run` a nivel de proyecto | `iam.tf` declara que `argos-run` solo tiene acceso al bucket y a sus 3 secretos. La cabecera cita REQ-IAC-006 («ni roles de proyecto») | Sintácticamente sí (`google_project_iam_member`; el apply SA tiene `resourcemanager.projectIamAdmin`) | **Contradice REQ-IAC-006.** Es la única concesión de proyecto del repositorio. Ver §3. |
| Cuenta nueva `argos-scene-tasks` | No existe. Patrón de `google_service_account` de `iam.tf` (3 cuentas) | Sí | Ninguna. El apply SA tiene `iam.serviceAccountAdmin`. |
| `run.invoker` de `argos-scene-tasks` sobre el servicio | Mismo patrón que `scheduler_invoker` de `iam.tf` | Sí | Ninguna. |
| `iam.serviceAccountUser` de `argos-run` sobre `argos-scene-tasks` | Mismo patrón que `deployer_acts_as_run` | Sí | Ninguna. |
| `cloudtasks.enqueuer` de `argos-run` sobre la cola | No existe. Usar `google_cloud_tasks_queue_iam_member` (a nivel de cola, no de proyecto) | Sí | Ninguna. |
| Cola `argos-scene` nueva en `cloud_tasks.tf` | No existe. `google_cloud_tasks_queue` con `location = var.region` | Sí, si `depends_on` la API | `cloudtasks` no está en `services.tf`; falta la dependencia. |
| `timeout` 60 s → 120 s en `cloud_run.tf` | `cloud_run.tf` l.25: `timeout = "60s"`. `timeout` **no** está en `ignore_changes` (Terraform lo gestiona) | Sí | Contradice REQ-CLD-002. El test `terraform-cloud-run.spec.ts:50` exige `"60s"`. |
| `budget_units` 1 → 5 USD y `display_name` | `variables.tf`: `budget_currency = "COP"`, `budget_units = "4500"`. `budget.tf` nombra `…-presupuesto-1-usd`. Test `terraform-budget.spec.ts:31` exige `"4500"` | **No como está escrito** (ver §2) | Error de unidades. |
| Variables `ARGOS_SCENE_*` en `cloud_run.tf` | `cloud_run.tf` ignora `template[0].containers[0].env` y no declara env. El pipeline reemplaza todo el entorno | **No surten efecto** | Deben ir a `deploy-argos.yml` (§6). |
| `secret_manager.tf` sin cambios | Sin cambios en el repositorio | Sí | Coincide con D6-01 (sin llave). Correcto. |

Verificación de que el patrón de 003 se mantiene: la cuenta nueva sigue el patrón de `argos-scheduler` (cuenta + `run.invoker` por recurso + OIDC con `audience` = URL del servicio). La cola sigue el patrón de recursos de `google_*_iam_member` acotados, sin roles de proyecto salvo la excepción de Vertex.

---

## 2. Presupuesto de 5 USD (punto 4 y parte del 1)

### 2.1 Unidades y moneda: error a corregir
- `variables.tf`: `budget_currency` default `"COP"`; `budget_units` default `"4500"` con la descripción «~1 USD = 4500 COP». `budget.tf` usa `var.budget_currency` y `var.budget_units` en `specified_amount`.
- El plan dice «`budget_units` de 1 a 5 USD». Si se escribe `"5"` con `COP`, el presupuesto será de **5 COP**.
- Opciones:
  - (A) Mantener COP y poner `budget_units = "22500"` (5 × 4500). El tipo de cambio es aproximado. [verificar el tipo vigente].
  - (B) Cambiar a `budget_currency = "USD"` y `budget_units = "5"`, **solo si la cuenta de facturación está en USD**. GCP exige que la moneda coincida con la de la cuenta. [verificar: `gcloud billing accounts describe`, que es lectura, la hace Neo].
- Cambiar la moneda del presupuesto no toca el recurso de forma destructiva [verificar]. El `display_name` se puede renombrar en sitio [verificar].

### 2.2 Filtro por etiqueta: el gasto de Vertex probablemente no cuenta
- `budget.tf` filtra por `labels = { app = "argos" }`. Cloud Run sí hereda las etiquetas del servicio en la factura. Las llamadas a Vertex AI, en cambio, no llevan etiquetas de recurso [verificar]. Si es así, **el presupuesto no ve el gasto que más puede crecer**.
- Propuesta: filtrar por proyecto con `budget_filter { projects = ["projects/${data.google_project.this.number}"] }`. `data.google_project.this` ya existe en `iam.tf`. El proyecto es de ARGOS; no mezcla gasto ajeno.
- Cambia NFR-CLD-001 (que dice «filtro `labels.app=argos`»). Enmienda Nivel 2.

### 2.3 Alertas y cuándo llegan
- Umbrales 50/90/100 % sobre gasto **real**. El gasto real llega con retraso [verificar: la facturación puede tardar horas]. Propuesta: añadir un umbral de gasto **previsto** (`spend_basis = "FORECASTED_SPEND"` al 100 %) [verificar que el proveedor 7.46.2 lo soporta]. Así la alarma llega antes de cruzar el tope.
- Destinatarios: correo por defecto de administradores de facturación (ya pendiente de Neo en `budget.tf`).

### 2.4 Qué mecanismo sí detiene el gasto (punto 4)
| Mecanismo | Existe en 003 | Detiene el gasto | Costo de implantarlo |
|---|---|---|---|
| `google_billing_budget` (alerta) | Sí | **No** (su propio comentario lo dice) | Ya está |
| Pub/Sub + función que desvincula la facturación del proyecto | No | Sí, pero **apaga todo el proyecto** (Cloud Run, Artifact Registry, Secret Manager). Es un corte total | Medio: topic, suscripción, función, IAM de `billing.projectManager` a la cuenta de la función. Nivel 2 |
| Cuota de Vertex por minuto (`google_service_usage_consumer_quota_override`) | No | Limita **tasa**, no dinero total [verificar] | Bajo, pero no acota el mes |
| **Contador global en la aplicación** (`ARGOS_SCENE_GLOBAL_QUOTA_MAX`, plan §6.5) | No (se añade con la 006) | **Sí**, antes de cada llamada, con el mismo mecanismo que la cuota por hogar | Bajo (una fila `platform_parameters`, patrón de 005). Es el único tope fino y reversible |
| Poner `max_instance_count = 0` por Pub/Sub | No | Parcialmente (detiene el servicio, no solo la escena) | Medio |

**Recomendación**: el tope real es el contador de la aplicación (`H-ARCH-006-02`, decisión de Neo). El presupuesto queda como alarma temprana, con filtro por proyecto y umbral previsto. Si Neo quiere un corte duro a nivel de facturación, es otra decisión de Nivel 2 con impacto en todo el servicio.

### 2.5 Escala del gasto frente a 5 USD (cuantificado con los supuestos del plan)
Supuestos: 13 hogares activos (research §2.4), cuota de 10 generaciones por hogar y mes (D6-03). Peor caso: 130 generaciones al mes, una llamada a Vertex por generación.

| Modelo (precio recordado, [verificar]) | USD/imagen | 130 generaciones | Frente a 5 USD |
|---|---|---|---|
| Flash Image | ~0,04 | ~5,20 | Justo en el tope |
| Pro | ~0,13 | ~16,90 | 3,4 veces el tope |
| Pro, resolución alta | ~0,24 | ~31,20 | 6,2 veces el tope |

Con 5 USD y el precio Flash, el tope se alcanza con ~125 generaciones. Con Pro, con unas 38 generaciones. **Conclusión**: 5 USD solo es compatible con el uso previsto si el modelo es Flash **y** existe el contador global; con Pro hace falta el contador y bajar la cuota. Esto debe quedar en la decisión de Neo.

---

## 3. IAM de Vertex y de Cloud Tasks (punto 1)

### 3.1 `roles/aiplatform.user` a nivel de proyecto (excepción a REQ-IAC-006)
- Vertex no ofrece IAM por recurso para los modelos del editor de Google [verificar]. El rol de proyecto es la forma habitual.
- Alternativa más estricta: rol personalizado `argosSceneGenerate` con solo el permiso de predicción de Gemini (`aiplatform.endpoints.predict` [verificar]). Requiere `roles/iam.roleAdmin` en el apply SA, que hoy no tiene (`bootstrap.sh`).
- **Recomendación**: `roles/aiplatform.user` a nivel de proyecto solo para `argos-run`, documentado como excepción en REQ-IAC-006 y en la cabecera de `iam.tf`. Si Neo prefiere el rol personalizado, es un cambio en `bootstrap.sh` (manual).
- Sin llave: la aplicación usa la identidad de Cloud Run por el servidor de metadatos (research §2.1). No hay ningún secreto nuevo.

### 3.2 Cloud Tasks
- `argos-run` necesita `cloudtasks.enqueuer` sobre la **cola** (no en proyecto) y `iam.serviceAccountUser` sobre `argos-scene-tasks` para adjuntar el token OIDC al crear la tarea.
- `argos-scene-tasks`: `run.invoker` sobre el servicio y nada más. Sin llave.
- [verificar]: si Cloud Tasks necesita además `roles/iam.serviceAccountTokenCreator` para su agente de servicio sobre `argos-scene-tasks`. Scheduler funciona hoy sin ese rol explícito (`scheduler.tf`), así que es probable que no haga falta; confirmarlo con una tarea de prueba en el entorno de pruebas.
- `dispatchDeadline`, `audience` y el nombre de la tarea (`attemptId`) se fijan **al crear la tarea desde la aplicación**, no en Terraform. Ver §4.2.

### 3.3 Cuentas de CI (no están en `terraform/` pero rigen el `plan` y el `apply`)
- `bootstrap.sh` define los roles de `argos-terraform-plan@` y `argos-terraform@`. Hoy **no** tienen `roles/cloudtasks.admin` (apply) ni `roles/cloudtasks.viewer` (plan). Sin ellos, el `plan` de PR y el `apply` de main fallan con 403 al crear o leer la cola.
- `bootstrap.sh` lo ejecuta Neo a mano (no lo puede hacer CI). Cambio de Nivel 2.
- Las pruebas de bootstrap fijan la lista de roles (H-LINK-005-1 de `claude/log-link.md`). Hay que actualizarlas.

---

## 4. Cloud Run: `cpu_idle`, timeout y memoria (punto 2)

### 4.1 ¿Basta `cpu_idle = true`?
**Sí, si el trabajo ocurre dentro de la solicitud.** Con facturación por solicitud, la CPU está asignada mientras una solicitud HTTP está abierta. El worker recibe la tarea de Cloud Tasks como una solicitud `POST /internal/scene-worker`, hace la llamada a Vertex y responde al final. Ese trabajo tiene CPU. El estrangulamiento de `H-MERO-006-02` solo aplica a trabajo lanzado **después** de responder (`setImmediate`, promesas sin esperar). El diseño debe garantizar que el worker espere la generación antes de responder. Eso ya está en el plan (§2.1: el worker responde tras `publica`).

**Opción más simple: Cloud Tasks → `/internal/scene-worker` del mismo servicio, sin cambiar `cpu_idle`.** Descartar el Job: exige otra imagen, otro pipeline de despliegue y más IAM, sin ganancia para este volumen.

### 4.2 Timeout
- `timeout` es **por servicio**; no hay timeout por ruta en Cloud Run. Subirlo a `120s` afecta a todas las rutas. Aceptable: el límite solo importa si una ruta cuelga, y el resto son respuestas de milisegundos [verificar].
- Cuadre de tiempos: `T_GEN = 90 s` (AbortSignal en el cliente de Vertex) < `timeout = 120 s` < `T_LEASE = 150 s`. Así el worker aborta por su cuenta antes de que Cloud Run lo mate, y `T_LEASE` cubre cualquier corte.
- `dispatchDeadline` de la tarea: el plan dice 180 s (§6.1) y research §4.3 dice ≥150 s. Como Cloud Run corta a 120 s, cualquier valor por encima de 120 s no tiene efecto práctico: el 504 llega antes y con `maxAttempts = 1` no hay reintento. Recomendado: fijar `dispatchDeadline` a 130 s (margen de 10 s) y no 180 s, para que el número del código coincida con el del servicio. Es un valor de aplicación, no de Terraform.
- Riesgo de `timeout` en `cloud_run.tf`: el cambio crea una revisión nueva. Como `traffic` está en `ignore_changes`, esa revisión puede recibir tráfico al 100 % **sin pasar el smoke test de `deploy-argos.yml`** [verificar el comportamiento del proveedor 7.46.2]. Mitigación: aplicar `infraestructura.yml` solo cuando no haya un despliegue `--no-traffic` en curso, o ejecutar el apply antes del siguiente `deploy-argos.yml`.

### 4.3 Memoria (cambio adicional recomendado, no está en el plan)
- Un worker con 9 imágenes de referencia de hasta 10 MiB (`ARGOS_MEDIA_MAX_BYTES`): ~90 MiB en bytes, ~120 MiB en base64, más la copia del JSON y el búfer de respuesta. Pico estimado: ~300 MiB por generación.
- Con `max_instance_request_concurrency = 20`, dos generaciones en la misma instancia (posible con `max_concurrent_dispatches = 2` y `max_instance_count = 2`) superan los 512 MiB.
- **Propuesta**: `memory = "1Gi"`. Coste en la capa gratuita: despreciable (ver §5). Cambio de Nivel 2 (REQ-CLD-002 dice 512 MiB). Validar con una prueba de carga [verificar en entorno de pruebas].

### 4.4 Lo que no cambia
- `cpu = "1"`, `cpu_idle = true`, `startup_cpu_boost = true`, `min_instance_count = 0`, `max_instance_count = 2`, `max_instance_request_concurrency = 20`. No hace falta cambiarlos.

---

## 5. Costo de la capa gratuita (punto 3)

Volumen: 130 generaciones/mes (peor caso de §2.5); tráfico web de 003 (≤ 50 000 solicitudes/mes, NFR-CLD-001). Tiempo por generación facturado: ~120 s (90 s de generación más arranque y escritura).

| Recurso | Uso previsto | Capa gratuita [verificar] | Resultado |
|---|---|---|---|
| Cloud Tasks (operaciones) | 130 tareas × ~3 operaciones (crear, despachar, confirmar) ≈ 390 | 1 millón al mes | 0 USD |
| Cloud Run (solicitudes) | 50 130 | 2 millones al mes | 0 USD |
| Cloud Run (vCPU-s) | Web: ~5 000 (estimado). Worker: 130 × 120 = 15 600. Total ≈ 20 600 | 180 000 al mes | 0 USD (≈ 11 %) |
| Cloud Run (GiB-s), con 1 GiB | Web: ~2 500. Worker: 15 600. Total ≈ 18 100 | 360 000 al mes | 0 USD (≈ 5 %) |
| Cloud Run Job (opción B, no recomendada) | Mismo cálculo | Compartida con Cloud Run | 0 USD |
| Cloud Logging | Líneas nuevas por generación (sin prompt ni bytes, `INV-ESC6-016`) | 50 GiB al mes | 0 USD |
| **Vertex AI (imágenes)** | 130 × 0,04–0,24 | **Sin capa gratuita para imágenes** (research §2.4, `H-MERO-006-01`) [verificar] | **5,20 a 31,20 USD** |

**Conclusión**: la infraestructura nueva (Cloud Tasks, worker, memoria mayor) cuesta 0 USD dentro de la capa gratuita. El costo que supera 5 USD es **solo Vertex**. Por eso el tope relevante es el de la aplicación, no el de la cola.

---

## 6. Impacto en CI (punto 5)

### 6.1 `infraestructura.yml`
- **Secretos nuevos: ninguno.** Vertex y Cloud Tasks usan identidades de servicio sin llave.
- **Variables de GitHub nuevas: ninguna** si `budget_units` y `budget_currency` se mantienen como defaults en `variables.tf`. Si se quiere otra moneda en CI, añadir `TF_VAR_budget_currency` y `TF_VAR_budget_units` como variables (no secretos).
- **Permisos de CI**: el plan de PR necesita `cloudtasks.viewer` (plan SA) y el apply `cloudtasks.admin` (apply SA). Cambio en `bootstrap.sh` (Neo, a mano).
- **Aplicación automática**: el job `apply` solo corre con `push` a `main` y `environment: produccion`. Si el entorno tiene revisores requeridos, **nada se aplica sin la aprobación de Neo**. Esto debe verificarse en la configuración del repositorio [verificar: no está en disco]. Si no hay revisores, el apply sí es automático al hacer merge.
- `scripts/validate-secrets.mjs` y `terraform-plan-guard.mjs`: sin cambios necesarios (no hay secretos nuevos ni borrados).

### 6.2 `deploy-argos.yml`
- **`--set-env-vars` reemplaza todo el entorno.** Todas las variables `ARGOS_SCENE_*` deben añadirse aquí, no en Terraform. Son no secretas. Propuesta de lista:
  - `ARGOS_SCENE_DRIVER` (debe ser el simulado o el real según la compuerta; ver riesgo R-LINK-006-3)
  - `ARGOS_SCENE_TASKS_QUEUE=argos-scene`, `ARGOS_SCENE_TASKS_LOCATION=us-central1`
  - `ARGOS_SCENE_TASKS_INVOKER_EMAIL=argos-scene-tasks@${PROJECT_ID}.iam.gserviceaccount.com` (mismo patrón que `ARGOS_SCHEDULER_EMAIL`)
  - `ARGOS_SCENE_VERTEX_PROJECT=${PROJECT_ID}`, `ARGOS_SCENE_VERTEX_LOCATION=us-central1`, `ARGOS_SCENE_VERTEX_MODEL=<versión fijada>` [verificar]
  - `ARGOS_SCENE_MAX_PETS=8`, `ARGOS_SCENE_QUOTA_MAX=10`, `ARGOS_SCENE_GEN_TIMEOUT_SECONDS=90`, `ARGOS_SCENE_LEASE_SECONDS=150`, `ARGOS_SCENE_POLL_SECONDS` y `ARGOS_SCENE_GLOBAL_QUOTA_MAX` (si Neo lo aprueba)
- **Sin secretos nuevos**: no hace falta ampliar `validate-secrets.mjs` ni los `--set-secrets`.
- **`--timeout` no aparece** en `deploy-argos.yml`, así que el valor de `cloud_run.tf` se conserva en los despliegues de CI [verificar que `gcloud run deploy` sin `--timeout` conserva el valor de la plantilla vigente].
- **Nada del despliegue automático cambia**: `deploy-argos.yml` se dispara con `push` a `main` sobre `src/**`. Ver R-LINK-006-3.

### 6.3 Pruebas que fijan valores antiguos (la compuerta fallará hasta actualizarlas)
| Prueba | Valor antiguo que fija | Cambio previsto |
|---|---|---|
| `tests/unit/terraform-cloud-run.spec.ts:45-50` | `timeout 60s`, `512Mi` [verificar] | 120 s y 1 Gi |
| `tests/unit/terraform-root.spec.ts:74-79` | 12 APIs | 14 APIs |
| `tests/unit/terraform-budget.spec.ts:20-31` | `budget_units` default `"4500"` | Nuevo valor según §2.1 |
| `tests/unit/terraform-iam*.spec.ts` | Conjuntos de roles por cuenta | Nuevas cuentas y roles |
| `tests/unit/terraform-bootstrap.spec.ts` | Listas de roles de CI | Añadir `cloudtasks.admin` y `cloudtasks.viewer` |

Las pruebas de `tests/` las edita **Keymaker** con orden de Neo; Link no las toca.

---

## 7. Lista de cambios Terraform exacta, por archivo (sin escribirlos)

| Archivo | Acción | Detalle | Nivel |
|---|---|---|---|
| `terraform/services.tf` | Editar | Añadir `"aiplatform.googleapis.com"` y `"cloudtasks.googleapis.com"` al `toset([...])`. Actualizar el comentario «solo estas 12» | **2** (REQ-IAC-009) |
| `terraform/variables.tf` | Editar | `budget_units` default según §2.1 (opción A `"22500"` con COP, o B `"5"` con USD); actualizar la descripción | **2** (moneda y tope) |
| `terraform/budget.tf` | Editar | `display_name` sin «1-usd»; `budget_filter` por `projects = ["projects/${data.google_project.this.number}"]` en vez de `labels` (§2.2); umbral previsto al 100 % (`spend_basis = "FORECASTED_SPEND"`, §2.3); cabecera: «solo avisa; el tope lo aplica la aplicación» | **2** (NFR-CLD-001, Fase Cloud) |
| `terraform/iam.tf` | Editar | (a) `google_service_account "scene_tasks"` con `account_id = "argos-scene-tasks"`; (b) `google_project_iam_member "run_aiplatform_user"` con `roles/aiplatform.user` para `argos-run` (excepción documentada); (c) `google_cloud_run_v2_service_iam_member "scene_tasks_invoker"` con `roles/run.invoker`; (d) `google_service_account_iam_member "run_acts_as_scene_tasks"` con `roles/iam.serviceAccountUser` sobre `argos-scene-tasks` para `argos-run`; (e) `google_cloud_tasks_queue_iam_member "run_enqueuer"` con `roles/cloudtasks.enqueuer` sobre la cola para `argos-run`. Actualizar la cabecera (hoy dice que `argos-run` solo tiene bucket y secretos) | **2** (REQ-IAC-006) |
| `terraform/cloud_tasks.tf` (nuevo) | Crear | `google_cloud_tasks_queue "scene"`: `name = "argos-scene"`, `location = var.region`, `retry_config { max_attempts = 1 }`, `rate_limits { max_concurrent_dispatches = 2, max_dispatches_per_second = 1 }` [propuesta], `depends_on` de la API | **2** (Principio VI y `D6-15`) |
| `terraform/cloud_run.tf` | Editar | `timeout = "120s"`; `memory = "1Gi"` (§4.3, propuesta); **no** añadir `env` (ver §6.2). Mantener `cpu_idle = true` | **2** (REQ-CLD-002) |
| `terraform/secret_manager.tf` | Sin cambios | Vertex y Cloud Tasks sin llave | — |
| `terraform/outputs.tf` | Sin cambios | No hace falta exponer la cola | — |
| `terraform/bootstrap.sh` (manual, fuera de `terraform/*.tf`) | Editar y ejecutar a mano | Apply SA: `roles/cloudtasks.admin`. Plan SA: `roles/cloudtasks.viewer`. Actualizar sus pruebas | **2** (Neo ejecuta) |
| `terraform/README.md` | Editar (opcional) | Documentar las dos excepciones (Vertex a nivel de proyecto; cola) | — |
| `.github/workflows/deploy-argos.yml` | Editar | Añadir variables `ARGOS_SCENE_*` no secretas a `--set-env-vars` (§6.2) | **2** (CI; no toca secretos) |
| `.github/workflows/infraestructura.yml` | Sin cambios | No hay secretos ni variables nuevas (si Neo quiere otra moneda, añadir `TF_VAR_budget_*`) | — |

**Dependencias de orden**: la API `cloudtasks` antes que la cola; la cuenta `argos-scene-tasks` antes de sus `iam_member`; la cola antes del `enqueuer`. El `timeout` se aplica antes del primer despliegue con la 006.

---

## 8. Riesgos

| ID | Riesgo | Severidad | Mitigación |
|---|---|---|---|
| R-LINK-006-1 | Presupuesto en COP con valor de USD: 5 COP en vez de 5 USD | Alta | Corregir §2.1 antes de `plan` |
| R-LINK-006-2 | El presupuesto por etiqueta no ve Vertex; alarma muda | Alta | Filtro por proyecto (§2.2) [verificar] |
| R-LINK-006-3 | `deploy-argos.yml` se dispara con `src/**` en `main`. Si el código de la 006 llega a `main` antes de la compuerta del driver real, el arranque de producción con el simulador falla (`ARGOS_SCENE_DRIVER=fake` rechazado en producción, plan §7). El rollback de CI lo deja en la revisión anterior, pero queda un fallo de despliegue. | Media | No hacer merge a `main` hasta la compuerta, o que CI fije `ARGOS_SCENE_DRIVER` de forma segura. Decisión de Neo |
| R-LINK-006-4 | Cualquier apply cambia `timeout` y crea revisión con `traffic` ignorado: puede saltarse el smoke test | Media | Orden de apply (§4.2) [verificar] |
| R-LINK-006-5 | 512 MiB insuficientes con dos generaciones en la misma instancia | Media | `memory = "1Gi"` y prueba de carga (§4.3) |
| R-LINK-006-6 | El tope de gasto de 5 USD no detiene nada (solo el contador de la aplicación lo hace) | Alta | Decisión de Neo sobre `ARGOS_SCENE_GLOBAL_QUOTA_MAX` (plan §6.5); con Pro, bajar la cuota |
| R-LINK-006-7 | Permiso de proyecto a `argos-run` para Vertex (excepción a REQ-IAC-006) | Media | Enmienda o rol personalizado (§3.1) |
| R-LINK-006-8 | Cloud Tasks sin el rol de agente de servicio requerido (token OIDC) | Baja | Prueba en entorno de pruebas [verificar] |
| R-LINK-006-9 | Retraso de la facturación: el aviso de 50 % puede llegar tarde | Media | Umbral previsto (§2.3) [verificar] |
| R-LINK-006-10 | Las pruebas `terraform-*.spec.ts` fallan hasta actualizarse (§6.3) | Baja | Keymaker, con orden de Neo |

---

## 9. Requiere autorización explícita de Neo (Nivel 2)

**TO: Neo (Andrés Vallejo — Level 2)**

1. **Moneda y monto del presupuesto**: confirmar si la cuenta de facturación es COP o USD, y el monto (22500 COP, o 5 USD). Mientras no se confirme, no se toca `variables.tf`.
2. **Filtro del presupuesto**: cambiar de etiqueta `app=argos` a proyecto (cambia NFR-CLD-001).
3. **Enmienda de REQ-IAC-009**: de 12 a 14 APIs (`aiplatform`, `cloudtasks`).
4. **Enmienda de REQ-IAC-006**: excepción para `roles/aiplatform.user` de proyecto en `argos-run`, o rol personalizado (requiere `roles/iam.roleAdmin` en el apply SA).
5. **Enmienda de REQ-CLD-002**: `timeout` 60 → 120 s y memoria 512 MiB → 1 GiB.
6. **Enmienda de la constitución (Fase Cloud)**: alarma de 1 USD → 5 USD, y la excepción de pago de Vertex (ya en borrador en `.specify/memory/audits/enmienda-006-principio-VI.md`).
7. **`bootstrap.sh`**: ejecutar a mano los nuevos roles de CI (`cloudtasks.admin` para apply, `cloudtasks.viewer` para plan).
8. **Tope global de gasto** (`ARGOS_SCENE_GLOBAL_QUOTA_MAX`, plan §6.5): decisión de si es obligatorio antes de producción. Sin él, 5 USD no se cumple con el modelo Pro.
9. **Entorno `produccion`**: confirmar en la configuración de GitHub que tiene revisores requeridos. Sin eso, el `apply` es automático al hacer merge en `main`.
10. **Compuerta del driver** (R-LINK-006-3): decidir si la 006 llega a `main` antes del driver real.
11. **Memoria y timeout**: aprobar `memory = "1Gi"` (§4.3) y `timeout = 120 s` para todo el servicio.

**Lo que Neo no tiene que decidir**: Cloud Tasks frente a Cloud Run Job (queda Cloud Tasks, opción más simple); no hace falta llave de cuenta de servicio; no hay secretos nuevos.

---

## 10. Respuesta a los cuatro puntos del objeto

1. **Compatibilidad con los módulos y el patrón de 003**: compatible con `iam.tf`, `scheduler.tf` y `cloud_run.tf` en su forma. Incompatible como está escrito en cuatro puntos: moneda del presupuesto (§2.1), variables de entorno en `cloud_run.tf` (§6.2), API 12 → 14 y IAM de proyecto (contradicen textos firmados, §1 y §3.1).
2. **`cpu_idle` y timeout**: `cpu_idle = true` basta si el worker responde tras terminar la generación. Timeout de 120 s por servicio. Opción más simple: Cloud Tasks → `/internal/scene-worker` (§4).
3. **Costo**: la capa gratuita cubre Cloud Tasks y Cloud Run con margen (§5). El costo que supera 5 USD es Vertex (17 a 31 USD en el peor caso con Pro).
4. **Riesgo del presupuesto**: la alarma no detiene la facturación. En 003 no hay ningún mecanismo de corte. El único tope fino disponible es el contador de la aplicación (§2.4).
5. **CI**: sin secretos ni variables de GitHub nuevas; cambios en `deploy-argos.yml` (variables) y en `bootstrap.sh` (roles, manual). Nada se aplica sin Neo si el entorno `produccion` tiene revisores (§6).

---

**Verificaciones pendientes con red o con Neo** (no se han hecho): precios y capas gratuitas de Vertex, Cloud Tasks y Cloud Run (§5); moneda de la cuenta de facturación; revisores del entorno `produccion`; comportamiento del proveedor 7.46.2 con `timeout` y `traffic` ignorado; rol de agente de servicio de Cloud Tasks; nombres exactos de parámetros de `retry_config` y `spend_basis` en el proveedor 7.46.2.

**Estado**: informe en `REVIEW`. Ningún `tasks.md` tocado; ningún `COMPLETED` marcado; sin cambios en `terraform/`, `.github/` ni `specs/`.
