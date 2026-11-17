# Gate /lock — Feature 003 (Argos en GCP Cloud Run + Neon, costo 0 USD)

**Autor**: Lock (Anti-Bias Lens). **Fecha**: 2026-11-15. **Estado del informe**: `Validation Required` (no aprueba nada; `APPROVED` es de Neo).
**Objeto**: `specs/003-cloud-gcp/{spec,plan,research,data-model,quickstart,tasks}.md`, `contracts/README.md`. Solo lectura de specs; verificado en código: INV-AUTH2-002 (`src/application/use-cases/auth-use-cases.ts` L5, L128) y ausencia de uso de IP (`grep` sin coincidencias).
**Convención**: archivo:línea según `cat -n` de la fecha. «Cubre» = la spec ya trata el escenario (SI / PARCIAL / NO). Cada hallazgo es Input + Estado = Falla. Las afirmaciones sobre comportamiento de GCP/Neon/Terraform que no pude verificar en disco van marcadas **[verificar]**.

## Conteo
| Severidad | N |
|---|---|
| Alto | 10 |
| Medio | 14 |
| Bajo | 5 |
| Total | 29 |

---

## HALLAZGOS ALTOS

### H-LOCK-001 (alto) — Contradicción: la app verifica `schema_migrations` al arrancar, pero el pool es perezoso y `/healthz` no toca la base
- **Ref**: spec.md L65 (REQ-PG-006: «al arrancar verifica … y, si no, falla el arranque»), plan.md L32 (§1.1 «pool perezoso; startup probe solo toca /healthz para no despertar Neon»), spec.md L44 (Neon agotado: «/healthz 200; el servicio no se cae»), T420 (tasks.md L66).
- **Escenario A**: Neon con cuota agotada o suspendido + instancia nueva de Cloud Run. Si el chequeo es síncrono al arrancar, `/healthz` nunca llega a 200, el startup probe (2 s x 10 = 20 s, plan.md L103) falla y Cloud Run entra en bucle de reinicios: contradice L44 y R-04.
- **Escenario B (rollback)**: migración N aplicada, humo falla, el tráfico queda en la revisión N-1 (SC-CLD-006). Si «contenga las versiones esperadas» se implementa como igualdad de conjuntos, N-1 ve una versión de más y **falla todo arranque en frío**: el «rollback» deja el servicio caído en la siguiente escala desde cero.
- **Cubre**: NO (ambigüedad no resuelta; no hay prueba de «revisión anterior contra esquema nuevo»).
- **Mitigación determinista**: el chequeo es «versiones esperadas ⊆ aplicadas» (nunca igualdad), se ejecuta de forma perezosa en `/readyz` y en el primer caso de uso, nunca en el arranque; añadir prueba que arranque el servidor N-1 contra el esquema N.

### H-LOCK-002 (alto) — `/readyz` público y rutas autenticadas permiten a un tercero mantener Neon despierto y agotar las 100 CU-h
- **Ref**: spec.md L53 (REQ-CLD-004: `/readyz` hace `SELECT 1`, sin autenticación), L68 (REQ-PG-009 solo prohíbe el keep-alive **propio**), research.md L62 (§2.3: 0,25 CU x 720 h = 180 CU-h > 100), research.md L110 (R-07 solo cubre costo de Cloud Run), plan.md L87.
- **Escenario**: un script (o un monitor de uptime, bot, escáner) hace `GET /readyz` cada 4 min. Neon nunca se suspende (suspende a los 5 min, research.md L40). 0,25 CU x 24 h x 30 = 180 CU-h (hasta 360 con 0,5 CU, D-08): la cuota de 100 CU-h se agota hacia el día 14-17; comportamiento al agotarse = **no documentado** (R-05 abierto, research.md L64). Cuesta una petición cada 4 min; el presupuesto de 1 USD no alerta (no es gasto GCP).
- **Cubre**: PARCIAL (R-05 reconoce el agotamiento pero atribuye la causa solo a Argos; ninguna mitigación para tráfico hostil; NFR-CLD-007 se mide en T461 al final del mes, tarde).
- **Mitigación**: `/readyz` con caché en proceso de 30-60 s o protegido (solo OIDC/CI); límite de frecuencia por IP previo a la base; alerta de consumo de CU-h con umbral semanal; documentar qué ocurre al agotar cuota antes de aprobar.

### H-LOCK-003 (alto) — Transacción zombi retiene el candado global y bloquea todas las escrituras (y, por INV-AUTH2-002, todas las peticiones autenticadas)
- **Ref**: spec.md L63 (REQ-PG-004: `lock_timeout` y `statement_timeout` de 10 s, **sin** `idle_in_transaction_session_timeout` ni tope por transacción), spec.md L55 (REQ-CLD-006: espera ≤ 10 s en SIGTERM = periodo de gracia de Cloud Run de 10 s **[verificar]**), plan.md L99/L101, research.md L70 (CPU solo durante solicitudes).
- **Escenario**: instancia A abre `BEGIN` + `pg_advisory_xact_lock(K)`; Cloud Run la termina (SIGKILL tras la gracia, escala a cero, o el contenedor se congela con CPU throttled en mitad de la transacción). El socket queda medio abierto; Postgres no detecta el cliente muerto hasta el timeout TCP (horas por defecto) y la transacción sigue «idle in transaction» reteniendo `K`. Toda transacción posterior espera 10 s y falla con `lock_timeout`. Como cada petición autenticada **escribe** `lastActivityAt` (INV-AUTH2-002, `auth-use-cases.ts` L5), la app entera queda inutilizable hasta intervención manual.
- **Cubre**: NO.
- **Mitigación**: `SET LOCAL idle_in_transaction_session_timeout='15s'` (o a nivel de rol `argos_app`) + `transaction_timeout`/tope total; `keepAlive` TCP corto; SIGTERM con espera ≤ 7 s (< gracia); prueba de caos: matar un cliente con la transacción abierta y verificar recuperación en < 20 s (para `/seraph` y `/smith`).

### H-LOCK-004 (alto) — `terraform apply` reasigna el tráfico y deshace el despliegue/rollback de `gcloud`
- **Ref**: spec.md L82 (REQ-IAC-010: `ignore_changes` solo sobre la imagen), plan.md L83, ADR-003-11 (plan.md L122), spec.md L112 (NFR-CLD-008), plan.md L161.
- **Escenario**: el pipeline despliega `--no-traffic`, el humo falla, el tráfico sigue en la revisión A (correcto). Días después, un PR toca `terraform/**` y su `apply` encuentra el bloque `traffic` del recurso v2 en su valor por defecto (100 % `LATEST`) **[verificar con `terraform plan` real]** y mueve el 100 % del tráfico a la revisión más reciente, que es **la revisión fallida**. Igual si Neo hizo rollback manual a una revisión previa. Además `gcloud run deploy` altera etiquetas/anotaciones de plantilla (`client`, `commit-sha`) que el `plan` ve como cambio perpetuo, y el segundo `plan` «sin cambios» (NFR-CLD-008) deja de cumplirse tras el primer despliegue.
- **Cubre**: NO (solo se ignora la imagen).
- **Mitigación**: `ignore_changes` también sobre `traffic`, `client`, `client_version`, `template[0].revision`, `template[0].labels`; prueba en T457/T458: apply de Terraform tras un despliegue no cambia tráfico ni crea revisión.

### H-LOCK-005 (alto) — El primer `terraform apply` falla: la imagen marcadora no sirve `/healthz` y los secretos pueden no tener versión
- **Ref**: spec.md L82 (REQ-IAC-010 imagen marcadora pública), spec.md L51 (REQ-CLD-002: startup/liveness probe HTTP en `/healthz`), plan.md L103, spec.md L77 (versión de secreto solo si la variable no es nula), T440 (tasks.md L104), T457.
- **Escenario**: `apply` crea `google_cloud_run_v2_service` con la imagen pública de ejemplo (hello) y probes en `/healthz` (404) y con `secret_key_ref` a `latest` de secretos sin versión si `TF_VAR_*` llegó nulo. La revisión inicial no pasa el startup probe: Terraform queda a mitad, estado parcial, T457/NFR-CLD-008 («converge en una ejecución») imposible.
- **Cubre**: NO.
- **Mitigación**: el recurso inicial sin probes propios (o probe TCP) y sin `secret_key_ref` hasta que exista versión; o dos fases (crear servicio vacío, luego configurar). Prueba en un proyecto desechable antes de T457.

### H-LOCK-006 (alto) — El guardia de destrucción no cubre `google_secret_manager_secret_version`; un `TF_VAR` vacío destruye la única versión del secreto
- **Ref**: spec.md L77 (REQ-IAC-005 versión condicional por `count`), L79 (REQ-IAC-007 solo protege `run_v2_service`, `secret`, `storage_bucket`), tasks.md L102 (T438), plan.md L170-171.
- **Escenario**: un PR del propio repo dispara `plan` sin secretos (secrets de GitHub no se exponen a PR de forks ni a Dependabot; o el secreto se renombró). `TF_VAR_database_url` nulo → `count=0` → el plan **destruye la versión**; en el `apply` de `main` si el secreto falta también. El secreto queda sin versión; toda instancia nueva (`latest`) no arranca: caída total. Además, al rotar, el reemplazo por defecto es destroy-then-create: ventana sin versión habilitada.
- **Cubre**: NO.
- **Mitigación**: guardia de borrado también sobre `google_secret_manager_secret_version`; `create_before_destroy`; en lugar de `count` condicional, fallar el plan si la variable es nula; fijar `deletion_policy = "DISABLE"` en versiones **[verificar nombre del argumento en provider 5.x]**.

### H-LOCK-007 (alto) — `secret_key_ref: latest`: una rotación defectuosa rompe todas las revisiones (incluida la de rollback) y deja instancias vivas con valores distintos
- **Ref**: plan.md L105 (versión `latest`), spec.md L77 (REQ-IAC-005, rotación), research.md L109 (R-06), plan.md L116 (ADR-003-08), spec.md L110 (NFR-CLD-012: estado versionado), spec.md L95 (REQ-SEC-001).
- **Escenarios**:
  1. Neo pega `DATABASE_URL` con salto de línea final o credencial errónea en el secreto de GitHub. `sslmode=require\n` falla la validación (REQ-PG-010) → toda instancia que arranque **de cualquier revisión** muere; revertir tráfico no ayuda (el secreto no es parte de la revisión).
  2. Rotación del rol Neon: las instancias vivas conservan la contraseña vieja (se resuelve al arrancar la instancia) hasta reciclarse; Neon la invalida de inmediato → errores 5xx hasta 15 min (o indefinido con tráfico continuo).
  3. `ARGOS_AUDIT_HMAC_SECRET` rotado mientras conviven 2 instancias con valores distintos → identificadores de auditoría inconsistentes; las filas previas no correlacionan (INV-AUD-001). La spec no define ni la política de rotación del HMAC ni su efecto.
  4. El bucket de estado con versionado (NFR-CLD-012) retiene versiones no vigentes del `.tfstate` **con los valores antiguos de los secretos en claro**: rotar no los elimina nunca, contradice REQ-SEC-001 y la rotación «destruye las anteriores».
- **Cubre**: PARCIAL (R-06 acepta el estado con secretos; nada sobre rollback de secretos, reciclaje de instancias ni ciclo de vida del estado).
- **Mitigación**: fijar versión numérica por despliegue (no `latest`) y re-desplegar revisión al rotar; validar la URL con `trim()` y rechazar `\n` en el paso de CI (`::add-mask::`); runbook de rotación (crear versión → nueva revisión → humo → deshabilitar anterior); regla de ciclo de vida del bucket de estado (noncurrent 7-30 d) o solo contenedores de secreto en Terraform + versiones por `gcloud` (alternativa D-05 a).

### H-LOCK-008 (alto) — WIF: el flujo de `pull_request` puede impersonar la cuenta administradora de Terraform
- **Ref**: plan.md L133 (`argos-terraform@` con `run.admin`, `secretmanager.admin`, `iam.serviceAccountAdmin`, `storage.admin`…), plan.md L136 («`refs/pull/*` solo para `plan` de solo lectura»), spec.md L87 (REQ-CICD-002), plan.md L168.
- **Escenario**: WIF no distingue «solo lectura»: la condición es por repositorio/ref, no por permiso. Un PR que edite `infraestructura.yml` (el workflow del PR se ejecuta con el archivo del PR) obtiene el token de `argos-terraform@` y puede leer secretos, cambiar IAM de cuentas de servicio y ejecutar `apply`. `iam.serviceAccountAdmin` permite además escalar a otras cuentas. Además, condicionar solo por nombre de repositorio es débil si se renombra o recrea (usar `repository_id`/`repository_owner_id`) **[verificar]**.
- **Cubre**: NO (declara «solo lectura» sin mecanismo).
- **Mitigación**: cuenta distinta `argos-terraform-plan@` (solo lectura: `viewer` + lectura del estado) para PR, y la admin condicionada a `ref == refs/heads/main` + `job_workflow_ref` del archivo exacto; Environment de GitHub con aprobación para `apply`; `permissions:` mínimos en el workflow.

### H-LOCK-009 (alto) — `VACUUM` ejecutado por `argos_app` no puede cumplirse; el borrado físico de D-06 queda sin efecto de forma silenciosa
- **Ref**: spec.md L70 (REQ-PG-011: `VACUUM (ANALYZE)` en el mantenimiento), data-model.md L61-64 (`argos_app` sin DDL, tablas propiedad de `argos_migrator`), spec.md L63 (`statement_timeout` 10 s), plan.md L120 (ADR-003-09), tasks.md L71 (T425).
- **Escenario**: `/internal/maintenance` conecta como `argos_app` por el pooler. `VACUUM` requiere ser propietario de la tabla (o `MAINTAIN` en PG 17 **[verificar versión de Neon]**); en PG < 17 emite un `WARNING: skipping … only table owner can vacuum` y **no falla**. Además `VACUUM` no corre dentro de transacción y `statement_timeout=10 s` lo cancela en tablas mayores. El job devuelve 200, los conteos parecen correctos y nunca se vacía nada: el supuesto de D-06 («DELETE + VACUUM + PITR 6 h») es falso sin que nadie lo vea. (Aparte, `autovacuum` de Neon actúa de todos modos, pero ya no es una garantía de la spec.)
- **Cubre**: NO.
- **Mitigación**: decidir quién vacía (rol dedicado con `MAINTAIN`, o confiar y documentar autovacuum); prueba de integración que compruebe `pg_stat_user_tables.last_vacuum/last_autovacuum` o `n_dead_tup`; `/rama` debe reevaluar D-06 con esta evidencia.

### H-LOCK-010 (alto) — Migración de DDL contra producción en vivo: sin `lock_timeout` ni exclusión con la app; *expand/contract* sin ninguna comprobación
- **Ref**: spec.md L65 (REQ-PG-006: candado de sesión `pg_advisory_lock` sin tiempo máximo), spec.md L90 (REQ-CICD-005), plan.md L175-179 (§6.4), tasks.md L75 (T429), data-model.md L22 (0003/0004 «reconstrucción de tabla … dentro de la transacción»).
- **Escenarios**:
  1. La migración toma `ACCESS EXCLUSIVE` (`ALTER TABLE`, reconstrucción) mientras la app tiene transacciones abiertas (por ejemplo una zombi de H-LOCK-003). El DDL espera y **todas** las consultas posteriores a esa tabla se encolan detrás: parálisis total hasta que el DDL gane o el job expire. La clave del candado de migración no es la `K` de la app: no hay exclusión mutua entre migrador y app.
  2. `pg_advisory_lock` de sesión espera sin límite: un `migrate` previo colgado (job cancelado en GitHub con la conexión viva en Neon) hace que el siguiente se quede esperando hasta el límite del workflow.
  3. La regla *expand/contract* es solo texto: ninguna tarea ni prueba verifica que la migración N sea compatible con el código N-1 (ni con el humo, que usa `SELECT 1`). Una columna `NOT NULL` sin default rompe las escrituras de N-1 mientras sigue sirviendo.
- **Cubre**: PARCIAL (REQ-CICD-005 enuncia la regla; sin mecanismo ni prueba).
- **Mitigación**: `SET lock_timeout='5s'` en el migrador con reintento acotado, `statement_timeout` y `application_name`; `pg_try_advisory_lock` con límite; añadir prueba de compatibilidad (código N-1 contra esquema N) como compuerta de T429/T448.

---

## HALLAZGOS MEDIOS

### H-LOCK-011 (medio) — Ramas Neon `pre-<sha>`: tope de 10 ramas sin limpieza; retienen datos «borrados»
- **Ref**: spec.md L90 (REQ-CICD-005 opcional), plan.md L173/L179, research.md L41 (10 ramas/proyecto), plan.md L120 (ADR-003-09, ventana ≤ 6 h).
- **Escenario**: cada despliegue crea una rama; el despliegue nº 11 falla en el paso `migrate` (límite de ramas) y bloquea el pipeline. Además cada rama conserva copia de los datos al momento del despliegue: una cuenta eliminada sigue en una rama días o semanas, mucho más que las 6 h aceptadas en D-06. **[verificar** si Neon Free cuenta la rama contra almacenamiento/cómputo**]**.
- **Cubre**: NO. **Mitigación**: borrar ramas con edad > 1 día en el mismo flujo; contar solo la última; reflejar el hallazgo en el cálculo de la ventana de borrado y en `/rama`.

### H-LOCK-012 (medio) — Candado global + concurrencia 20 + pool 5 + `lock_timeout` 10 s: colas largas y error sin mapear
- **Ref**: plan.md L99-101 (concurrencia 20, pool 5, 2 instancias), spec.md L63, research.md L53 (5-15 consultas secuenciales a 20-35 ms de RTT), spec.md L110 (NFR-CLD-006).
- **Escenario**: 3 usuarios navegando; cada petición autenticada es una transacción de escritura (INV-AUTH2-002) con ~10 viajes x 30 ms = 300 ms bajo el candado. 40 peticiones simultáneas (2 instancias x 20): la 34.ª espera más de 10 s → `lock_timeout` → 5xx. Un pool de 5 con 20 peticiones por instancia hace esperar 15 por conexión hasta `connectionTimeoutMillis` 10 s. La spec no define el código `ERR-*`/HTTP de `lock_timeout` ni de timeout de conexión (¿500 o 503 con `Retry-After`?). El p95 ≤ 800 ms se rompe con 3 usuarios en ráfaga.
- **Cubre**: PARCIAL (T427 prueba serialización, no profundidad de cola ni el mapeo del error).
- **Mitigación**: bajar `concurrency` a ~5-8 por instancia, mapear `lock_timeout`/pool a 503 con `Retry-After`, no actualizar `lastActivityAt` en cada GET (ventana de renovación) — Caso B hacia `/architect`.

### H-LOCK-013 (medio) — `scrypt` y la resolución DNS/conexión comparten el *thread pool* de libuv
- **Ref**: plan.md L99 («20 evita encolar logins»), research.md L57 (`createDummyHash` en el arranque).
- **Escenario**: 4 inicios de sesión simultáneos ocupan los 4 hilos con `scrypt`; `dns.lookup` y fs de `pg` esperan en la misma cola: la conexión a Neon se retrasa y vence `connectionTimeoutMillis`. La justificación del plan es la contraria al efecto real. Con 1 vCPU y CPU boost solo al arrancar, el login se serializa de hecho.
- **Cubre**: NO. **Mitigación**: `UV_THREADPOOL_SIZE` ≥ 8 o `lookup` previo cacheado, y prueba de carga de 10 logins concurrentes.

### H-LOCK-014 (medio) — El reintento cubre solo `ECONNRESET`; Neon suspendido/pooler cierran de otras formas y el usuario ve un error
- **Ref**: spec.md L64 (REQ-PG-005), research.md L70, spec.md L134 (SC-CLD-012), spec.md L39, research.md L58.
- **Escenario**: tras 5 min de inactividad Neon suspende; la primera conexión puede devolver «Connection terminated unexpectedly», `ETIMEDOUT`, SQLSTATE `57P01` (admin shutdown) o `08006`, no `ECONNRESET`. Sin reintento, `GET /auth/me` devuelve 5xx; si la UI trata cualquier error de `/auth/me` como «sin sesión», el usuario ve el login o pierde la pantalla (SC-CLD-012 exige «sin error visible»). El reintento «una vez» tampoco cubre el *wake-up* que tarda > 1 conexión.
- **Cubre**: PARCIAL. **Mitigación**: lista explícita de errores reintentables (códigos Node y SQLSTATE 08xxx/57P0x) con 2 intentos y espera acotada **solo antes del primer comando**; contrato de que `/auth/me` ante error de infraestructura devuelve 503 y la UI conserva el estado de carga; prueba E2E con Neon apagado.

### H-LOCK-015 (medio) — `COMMIT` desconocido (`finalState=UNKNOWN`) sin idempotencia: el reintento del usuario duplica
- **Ref**: spec.md L64 (REQ-PG-005, C-6), plan.md L115 (ADR-003-04: «casos de uso no son idempotentes en IDs y auditoría»).
- **Escenario**: se corta la red durante `COMMIT` de «registrar peso»; el cliente recibe 500 con UNKNOWN y reintenta; el primer `COMMIT` sí se aplicó → dos pesos (o dos invitaciones/auditorías). La probabilidad aumenta respecto de SQLite local (red Cloud Run→Neon).
- **Cubre**: PARCIAL (el error es honesto, no hay mitigación). **Mitigación**: clave de idempotencia por petición mutante o IDs generados por el cliente con `ON CONFLICT DO NOTHING`; mensaje de UI «verifica antes de reintentar». Caso B hacia `/architect`.

### H-LOCK-016 (medio) — Verificador OIDC: dependencia sin autorizar y audiencia ambigua
- **Ref**: spec.md L56/L102, tasks.md L50-51 (T413/T414), D-10 (spec.md L158: solo `pg`, `@types/pg`, `@fastify/static`, `esbuild`), plan.md L156 (URL etiquetada para humo).
- **Escenarios**: (1) verificar JWT de Google exige `google-auth-library` o `jose` + descarga de certificados Google (egress, fallo en frío): dependencia **no autorizada** en D-10, o verificación artesanal (riesgo criptográfico). (2) «audiencia = URL del servicio»: el servicio tiene varias URL (`*.run.app` determinista, la heredada y las de etiqueta `sha-…`); un `audience` mal fijado produce 401 permanente y el job diario nunca corre sin que nadie se entere. (3) Hay que comprobar `email` == cuenta del Scheduler y `email_verified`, no solo firma.
- **Cubre**: PARCIAL. **Mitigación**: ampliar D-10 (Nivel 2) o usar la validación nativa de Cloud Run IAM (servicio privado + invocador) para esa ruta; fijar `audience` por variable; prueba con token de otra SA válida.

### H-LOCK-017 (medio) — Mantenimiento: la purga puede no converger, una fila corrupta la bloquea y nadie se entera de que falló
- **Ref**: spec.md L69 (REQ-PG-008 `data->>'updatedAt'` con conversión a `timestamptz`), spec.md L63 (`statement_timeout` 10 s), spec.md L56 (REQ-CLD-007), tasks.md L71.
- **Escenario**: (a) tras semanas de fallos, el lote vencido supera 10 s → `statement_timeout` cancela y revierte la purga cada día: nunca avanza (retención de 730 días incumplida silenciosamente). (b) Una fila con `updatedAt` mal formado hace que el *cast* lance error en toda la sentencia: la purga queda bloqueada para siempre. (c) La spec no define alerta de Cloud Scheduler/Monitoring si el job devuelve 4xx/5xx, ni `retry_config`; el 401 por audiencia (H-LOCK-016) pasa inadvertido.
- **Cubre**: NO. **Mitigación**: purga por lotes con `LIMIT`, `statement_timeout` propio del mantenimiento, comparación léxica ISO (como SQLite, sin *cast*), y alerta de Cloud Monitoring con política de «job fallido» (cuota gratuita).

### H-LOCK-018 (medio) — Bucket de estado de Terraform: región/costo no fijados y versionado sin ciclo de vida
- **Ref**: spec.md L100 (REQ-SEC-006), D-12 (spec.md L154), spec.md L116 (NFR-CLD-012), research.md L15 (Free Tier GCS solo `us-east1/us-west1/us-central1`).
- **Escenario**: `bootstrap.sh` crea `argos-<project>-tfstate` sin región definida por la spec (por defecto multirregión US): almacenamiento facturado (centavos, pero rompe 0,00 USD de NFR-CLD-001/SC-CLD-003). El versionado conserva cada `.tfstate` (con secretos) indefinidamente.
- **Cubre**: NO. **Mitigación**: región `us-central1`, STANDARD, `lifecycle` de versiones no vigentes (p. ej., 30 d o 5 últimas); documentar en REQ-SEC-006.

### H-LOCK-019 (medio) — Sin detección de deriva para Argos; `apply` del plan guardado puede quedar obsoleto
- **Ref**: spec.md L87 (REQ-CICD-002: `apply` del plan guardado, reintento ante 409), spec.md L91 (REQ-CICD-004: `drift-detection.yml` «se mantiene», es el de Mirror), plan.md L147.
- **Escenario**: alguien cambia a mano un recurso (`gcloud` o consola: instancia mínima a 1, un secreto, IAM) y nadie lo detecta: el costo cero se pierde sin aviso; `drift-detection.yml` sigue apuntando a la infraestructura de Mirror. Aparte, el plan guardado del PR queda obsoleto si `main` avanzó (`Saved plan is stale`) y el reintento ante 409 no lo resuelve.
- **Cubre**: NO. **Mitigación**: un `drift-detection` propio de Argos (solo `plan -detailed-exitcode`, diario) y que el `apply` de `main` genere un `plan` fresco con guardia, no reutilice el del PR.

### H-LOCK-020 (medio) — Presupuesto y WIF: APIs y roles no listados hacen fallar el `apply`
- **Ref**: spec.md L81 (REQ-IAC-009 lista cerrada «solo»), plan.md L89 y T443 (`google_billing_budget`), plan.md L133 (roles de `argos-terraform@`), spec.md L93.
- **Escenario**: `google_billing_budget` requiere `billingbudgets.googleapis.com` (no listada) y permiso sobre la **cuenta de facturación** (`billing.costsManager`/`billing.admin`), que `argos-terraform@` no tiene; el WIF requiere `sts.googleapis.com`. El primer `apply` falla en 403 y la alarma de 1 USD (única defensa de costo, NFR-CLD-001) no existe. `google_project_service` además habilita `monitoring` sin uso.
- **Cubre**: NO. **Mitigación**: crear el presupuesto en `bootstrap.sh` (acción de Neo) o añadir API y rol al IAM documentado; revisar la lista de APIs con una pasada real.

### H-LOCK-021 (medio) — Política de limpieza de Artifact Registry vs rollback con despliegues fallidos
- **Ref**: spec.md L76 (REQ-IAC-004: conservar 2, borrar > 7 d), plan.md L122 (retroceso moviendo tráfico).
- **Escenario**: sirve la imagen A (> 7 días); dos despliegues seguidos fallan el humo (B, C): quedan `keep={C,B}` y A es borrable. Si Cloud Run necesita arrancar una instancia nueva de A tras escala a cero y la imagen ya no existe, falla **[verificar** si Cloud Run conserva copia interna de la imagen**]**. También: el «retroceso» a revisiones más viejas no está garantizado por el diseño.
- **Cubre**: NO. **Mitigación**: política `keep` de ≥ 3 versiones y/o etiquetar `serving`, y una guarda que no limpie la imagen en uso; SC-CLD-010 con la secuencia B,C fallidos.

### H-LOCK-022 (medio) — Equivalencia de SQLite a Postgres: colación, `\u0000`, orden de claves JSONB
- **Ref**: spec.md L61 (REQ-PG-002 «orden de resultados»), data-model.md L10, L17.
- **Escenarios**: (1) `ORDER BY` sobre `TEXT` en SQLite usa BINARY; en Postgres depende de la colación de la base de Neon (puede ser `en_US.UTF-8`): el orden de nombres con tildes/mayúsculas difiere, y la suite por 3 adaptadores pasa solo si sus datos no lo ejercitan. (2) Un nombre con `\u0000` es válido en SQLite y rechazado por Postgres (`unsupported Unicode escape`/`invalid byte sequence`) → 500 donde antes era 201, si Ajv no lo prohíbe. (3) `JSONB` no conserva el orden de claves: cualquier exportación determinista de respaldo/ hash (INV-ARCH-001) cambia de bytes entre adaptadores; la importación v3 SQLite→PG→export no es idéntica byte a byte.
- **Cubre**: NO. **Mitigación**: `COLLATE "C"` en columnas ordenadas o `ORDER BY` explícito; prueba con tildes/emoji/NUL; comparar respaldos de forma canónica, o usar `JSON` en lugar de `JSONB` donde se requiera identidad.

### H-LOCK-023 (medio) — Respaldo y recuperación: la restauración resucita cuentas eliminadas y no existe RPO real
- **Ref**: spec.md L129-131 (SC-CLD-008), tasks.md L136 (T454, `pg_dump` manual), spec.md L70 (REQ-PG-011), research.md L41 (PITR 6 h, 1 GB).
- **Escenario**: (a) borrar el proyecto Neon/perder la cuenta = pérdida total; el único respaldo es un `pg_dump` manual con retención de 7 días: RPO indefinido, RTO no definido (no hay prueba de restauración). (b) Restaurar PITR/dump trae de vuelta cuentas **eliminadas** después de ese punto (derecho al olvido, REQ-AUD-001); no hay registro de «lápidas» que se reaplique tras restaurar.
- **Cubre**: PARCIAL (R-02 acepta la ventana, no la resurrección). **Mitigación**: procedimiento de restauración con reaplicación de eliminaciones desde `audit_log`/lista de lápidas; prueba de restauración en T454; programar el dump (Scheduler no, porque el cupo es 1 job: usar GitHub Actions con cron).

### H-LOCK-024 (medio) — Humo débil: `/readyz` (`SELECT 1`) no detecta fallos reales y el límite de 5 s es frágil con Neon frío
- **Ref**: spec.md L53, spec.md L89 (REQ-CICD-003 paso 5), plan.md L159, data-model.md L61-64.
- **Escenario**: la revisión nueva pasa `SELECT 1` pero `argos_app` carece de `USAGE` en una secuencia o de privilegios sobre una tabla creada por migración (`ALTER DEFAULT PRIVILEGES` solo se aplica a objetos creados por el rol que lo ejecutó **[verificar]**) → el 100 % del tráfico va a una revisión que falla en el primer registro. Inversamente, Neon frío tarda y `/readyz` de 5 s da falso negativo, sin reintento ni espera definidos en el humo.
- **Cubre**: NO. **Mitigación**: humo con una operación de lectura+escritura de un usuario sintético dentro de transacción revertida (o `SELECT` de `has_table_privilege`) y reintentos 3x espaciados.

---

## HALLAZGOS BAJOS

- **H-LOCK-025 (bajo)** — spec.md L52 (REQ-CLD-003): `trustProxy` sin número de saltos. Con `trustProxy: true`, `X-Forwarded-For` es falsificable. En el código actual no hay uso de `request.ip` (grep vacío), por lo que hoy no afecta límites; sí afectaría registros y cualquier límite futuro por IP. Cubre: NO. Fijar `trustProxy: 1` (o lista de saltos).
- **H-LOCK-026 (bajo)** — spec.md L99 (REQ-SEC-004): `sslmode=require` tiene semántica distinta entre versiones de `pg`/`pg-connection-string` (en algunas versiones equivale a `verify-full`; cambia con versiones mayores). Cubre: PARCIAL. Fijar versión exacta y prueba de conexión con CA del sistema.
- **H-LOCK-027 (bajo)** — plan.md L176 vs tasks.md L75 (T429): el migrador es `node dist-server/migrate.mjs` «con la misma imagen» en el plan y `scripts/migrate-postgres.ts` en la tarea; el bundle `esbuild` no incluye los `.sql` por defecto y el paso `migrate` corre en el runner antes de `deploy`. Cubre: PARCIAL. Definir un solo mecanismo y cómo se empaquetan los `.sql`.
- **H-LOCK-028 (bajo)** — research.md L22: el cupo de Scheduler «Mirror tiene 2 jobs» no está verificado contra la cuenta de facturación (3 gratis); si Mirror añade un job, Argos pasa a pagar (NFR-CLD-001). Cubre: PARCIAL (R-03). T402 debe contar los jobs de la cuenta, no del repositorio.
- **H-LOCK-029 (bajo)** — plan.md L159/L156: las etiquetas de revisión `sha-<corto>` se acumulan en el servicio (límite de etiquetas por servicio **[verificar]**) y cada una expone una URL pública (`allUsers`) hacia una revisión sin tráfico, con el mismo acceso a la base. Limpiar etiquetas tras `promote`.

---

## Veredicto realista
El diseño asume que (1) el candado global solo cuesta rendimiento, (2) los secretos/IaC son idempotentes y reversibles, y (3) el tráfico hostil es un problema de dinero y no de cuota de Neon. Los tres supuestos fallan con entradas concretas. Los 10 hallazgos altos deben tener respuesta escrita de `/architect` antes de que `/mouse` audite la estructura; ninguno exige rediseño de dominio (NFR-CLD-009 se mantiene), pero H-LOCK-012 y H-LOCK-015 requieren decisión de Caso B porque tocan `application/`.

## Casos EDGE propuestos (para `/architect` → `spec.md`; pruebas para `/seraph`)
EDGE-CLD-01 (H-003), EDGE-CLD-02 (H-001, H-010: N-1 contra esquema N), EDGE-CLD-03 (H-002: `/readyz` repetido), EDGE-CLD-04 (H-004/H-005/H-006: `apply` tras despliegue, primer `apply`, `TF_VAR` nulo), EDGE-CLD-05 (H-007: secreto malformado y rotación), EDGE-CLD-06 (H-014: Neon suspendido, error no `ECONNRESET`), EDGE-CLD-07 (H-017: purga acumulada/fila corrupta), EDGE-CLD-08 (H-009: `VACUUM` sin privilegio).
