# Research: Fase 3 — Argos en GCP (Feature 003)

**Estado**: `APPROVED` (Aprobada por Neo (Level 2) el 2026-11-15, bajo condiciones R1 a R5 del veredicto Oracle). Solo investigación; no se desplegó ni se ejecutó `gcloud`/`terraform`.
**Fecha de consulta de fuentes externas**: **2026-11-15**. Los límites cambian: Google puede modificarlos con 30 días de aviso; T-CLD-VERIFY (T402) repite esta verificación antes del primer `apply`.

## 1. Límites Free Tier verificados

Fuente GCP: <https://docs.cloud.google.com/free/docs/free-cloud-features?hl=es-419> (redirige desde `cloud.google.com/free/docs/free-cloud-features`), consultada 2026-11-15. La página los llama «Free Tier» (no «Always Free»): no tiene fecha de término, **requiere cuenta de facturación activa**, el excedente se factura y lo no usado no se acumula.

| Servicio | Límite mensual verificado | Uso previsto de Argos | Veredicto |
|---|---|---|---|
| Cloud Run (facturación por solicitud) | 2 000 000 solicitudes; 360 000 GiB-s de memoria; 180 000 vCPU-s; 1 GB de salida desde Norteamérica | 1 vCPU, 512 MiB, `min-instances=0`. 180 000 vCPU-s = **50 h de CPU activa/mes**; memoria 0,5 GiB x 50 h = 90 000 GiB-s (cabe) | OK, **el cuello es vCPU-s y egress de 1 GB** |
| Artifact Registry | 0,5 GB de almacenamiento/mes | Imagen Node estimada 100-180 MB comprimida (sin medir). Sin limpieza se excede en pocos despliegues | **Riesgo ALTO sin política de limpieza** (REQ-IAC-004) |
| Secret Manager | 6 versiones activas/mes; 10 000 operaciones de acceso/mes; 3 notificaciones de rotación | 2 secretos x 1 versión activa = 2 versiones; 1 acceso por arranque de instancia | OK; versiones antiguas se deshabilitan en el runbook (NFR-CLD-001) |
| Cloud Storage | 5 GB-mes regional; 5 000 operaciones Clase A y 50 000 Clase B; 100 GB de salida; solo `us-east1`, `us-west1`, `us-central1`, **uso combinado** | Bucket `us-central1` STANDARD para `pg_dump` (`dumps/`) | OK, pero **el cupo se comparte con los buckets de Mirror** (mismo proyecto o cuenta de facturación) |
| Cloud Build | 2 500 min/mes en `e2-standard-2` | No se usa: el build corre en GitHub Actions (gratis en repos públicos; en privados 2 000 min/mes de GitHub Free) | N/A |
| Cloud Logging (Observability) | primeros 50 GiB/proyecto/mes | Logs de Fastify (JSON, sin cookies) | OK |
| Compute Engine e2-micro | 1 VM/mes en `us-west1`, `us-central1`, `us-east1` | **Es la VM de Mirror. Argos no la toca** | Fuera de alcance |
| Firestore | 1 GiB; 50 000 lecturas/20 000 escrituras/20 000 borrados por día | No se usa (decisión de usar Neon) | N/A |

**No verificado en la página (marcado como supuesto, a confirmar en T-CLD-VERIFY):**
- **Cloud Scheduler**: la página de precios no se pudo leer completa; de memoria, **3 jobs gratis por cuenta de facturación**, luego USD 0,10/job/mes. Mirror ya tiene **2** (`cloud_scheduler.tf`), así que **a Argos le queda 1 job gratis**. El diseño usa exactamente 1 (mantenimiento diario + keep-alive implícito). Un segundo job costaría USD 0,10/mes → violaría el costo 0: prohibido sin decisión de Neo.
- **Cloud Run, región Tier 1 y `min-instances=0` en el cupo gratuito**: de memoria, `us-central1` es Tier 1 y el cupo aplica a escala a cero. Confirmar en la tabla de precios.
- **Cloud Budgets**: crear un presupuesto/alerta no tiene costo, pero **no detiene el gasto**; solo avisa.

### Reglas de costo cero derivadas
1. `min-instances=0`, `max-instances=2` (tope de gasto y de conexiones).
2. Sin Cloud NAT, sin VPC connector/Direct VPC egress de pago, sin IP estática, sin Cloud Armor, sin Load Balancer, sin Cloud SQL, sin Memorystore. Cloud Run → Neon sale por Internet pública (TLS) y consume el cupo de 1 GB de egress Norteamérica solo en lo que Cloud Run envía (consultas SQL salen; respuestas HTTP también).
3. Todo recurso con facturación mensual fija queda prohibido (NFR-CLD-001).
4. El bundle web pesa **364 KB** (`dist/` actual); a 1 GB de egress equivale a ~2,9 millones de cargas completas sin caché: no es el cuello.

## 2. Base de datos: Neon Free

Fuentes (consultadas 2026-11-15): <https://neon.com/docs/introduction/plans>, <https://neon.com/docs/connect/connection-pooling>, <https://neon.com/docs/introduction/regions>.

| Dato | Valor verificado |
|---|---|
| Almacenamiento | 1 GB por proyecto (20 GB entre todos los proyectos) |
| Cómputo | **100 CU-horas/proyecto/mes**; hasta 2 CU (8 GB RAM) con autoescalado |
| Escala a cero | Se suspende tras **5 minutos** de inactividad; **no se puede desactivar** |
| Ramas | 10 por proyecto |
| Transferencia de salida | 5 GB/proyecto/mes |
| Historial PITR | hasta **6 horas**, máximo 1 GB de cambios, sin cargo |
| Pausa por 7 días de inactividad | **La página de planes NO la menciona**; solo describe la suspensión de 5 min. No se confirma que exista; el diseño la cubre igual (§2.3) |
| `max_connections` a 0,25 CU | 112 (7 reservadas para superusuario neon → **105** para la app) |
| Pooler | PgBouncer en modo transacción; `max_client_conn=10000`; `default_pool_size` = 90 % de `max_connections` por usuario y base; host con sufijo `-pooler`; `query_wait_timeout=120 s` |
| No soportado en conexión pooled | `SET`/`RESET`, `LISTEN/NOTIFY`, cursores `WITH HOLD`, `PREPARE` SQL, tablas temporales `PRESERVE`/`DELETE ROWS`, `LOAD`, **advisory locks de sesión** |
| Soportado | Prepared statements a nivel de protocolo (PgBouncer >= 1.22); advisory locks **de transacción** (`pg_advisory_xact_lock`) no figuran en la lista de no soportados |
| Migraciones / `pg_dump` | Neon recomienda **conexión directa** (sin `-pooler`) |
| Regiones nuevas | AWS: `us-east-1` (N. Virginia), `us-east-2` (Ohio), `us-west-2` (Oregón), `eu-central-1`, `eu-west-2`, `ap-southeast-1`, `ap-southeast-2`, `sa-east-1`. Azure deprecado. **No hay regiones GCP** |

### 2.1 Región cercana a `us-central1` (Iowa)
Neon no ofrece GCP. La más cercana a Iowa es **`aws-us-east-2` (Ohio)**; alternativa `aws-us-east-1`. Latencia Cloud Run (us-central1) → Neon (us-east-2): **estimada 20-35 ms de RTT, NO MEDIDA**; T-CLD-MEASURE (T459) la mide antes de fijar NFR de latencia. Un caso de uso típico emite 5-15 consultas secuenciales (BEGIN, lock, lecturas, escrituras, auditoría, COMMIT): 100-500 ms solo de red. Mitigación: reducir viajes (agrupar BEGIN+lock+primera consulta no es posible con `pg` sin pipelining; se fija el presupuesto en NFR-CLD-006 y se calibra con la medición).
Alternativa a evaluar: Cloud Run en `us-east1` (Carolina del Sur, Tier 1, dentro del cupo de GCS) con Neon `aws-us-east-1`: RTT estimado 10-20 ms, pero se aparta de `us-central1` de Mirror. Decisión D-02.

### 2.2 Cold start (dos capas, se suman)
1. **Cloud Run**: arranque del contenedor Node + validación de configuración + `createDummyHash()` (scrypt) + conexión a Neon. Estimación sin medir: 1-3 s.
2. **Neon**: reanudar cómputo suspendido. Neon lo documenta en la escala de cientos de milisegundos (la página de pooling consultada no da cifra; no verificado). Estimación 0,3-1,5 s.
Peor caso encadenado (instancia fría + cómputo suspendido) ~ 2-5 s en la primera solicitud tras inactividad. NFR-CLD-005 fija el techo en 8 s hasta medir. La interfaz ya maneja `GET /auth/me` al arrancar (REQ-AUTH2-003); debe mostrar estado de carga, no error (tarea de verificación E2E).

### 2.3 Presupuesto de CU-horas y la «pausa de 7 días»
- 100 CU-h con 0,25 CU = **400 h de cómputo activo/mes**. Un mes tiene 720 h: **un keep-alive permanente (ping < 5 min) agotaría la cuota a mitad de mes**. Por eso están **prohibidos los pings frecuentes** (REQ-PG-009).
- El job diario de mantenimiento (ADR-002-14) consulta la base cada 24 h: cubre cualquier política de inactividad de 7 días **sin consumir** más que ~5-10 min de cómputo/día (10 min x 0,25 CU x 30 días = ~1,3 CU-h/mes).
- Qué ocurre al agotar las 100 CU-h no está en la página consultada: **riesgo abierto R-05**; mitigación: alerta de uso (consola Neon) y guía operativa.
- Cota de autoescalado: configurar `min=0,25 CU` / `max=0,5 CU` en el proyecto Neon para acotar el consumo (D-08).

### 2.4 Pool de conexiones desde Cloud Run
- Cada instancia Cloud Run mantiene un `pg.Pool` con `max=5` (variable `ARGOS_PG_POOL_MAX`). Con `max-instances=2` → 10 conexiones al pooler, muy por debajo de 105 directas y 10 000 cliente.
- **Se usa el host `-pooler`** (modo transacción) para la app. Consecuencias de diseño obligatorias: sin `SET` de sesión, sin advisory locks de sesión, sin `LISTEN`, sin `PREPARE` SQL. `SET LOCAL` y `BEGIN ISOLATION LEVEL ...` por transacción sí son válidos en modo transacción.
- Cloud Run (CPU solo durante solicitudes) puede dejar sockets inactivos que Neon/PgBouncer cierra: el adaptador debe tratar `ECONNRESET` en la **primera consulta de una transacción** reintentando **una vez** con otra conexión; y `pool.on('error')` no debe tumbar el proceso. Configurar `idleTimeoutMillis ≈ 10 s`, `connectionTimeoutMillis ≈ 10 s`, `keepAlive: true`.
- Las **migraciones** usan la URL directa (`DATABASE_URL_DIRECT`), nunca el pooler.

## 3. Ruta a Cloud SQL sin cambiar código de aplicación
`src/application` y `src/domain` solo conocen `UnitOfWorkPort`/`RepositorySet` (INV-ARCH-005). El adaptador Postgres usa SQL estándar de PostgreSQL 16/17 (sin extensiones de Neon). Migrar a Cloud SQL = (1) `pg_dump`/`pg_restore` directo, (2) cambiar el valor del secreto `DATABASE_URL`, (3) opcional: conector Cloud SQL/socket Unix vía `DATABASE_URL` con `host=/cloudsql/...`. Cero cambios en `domain/` y `application/`; en `infrastructure/` solo configuración. **Cloud SQL no es gratis** (sin Free Tier de instancia): queda como ruta futura, fuera del costo 0. Restricciones para conservar la portabilidad: no usar ramas Neon, ni `neon_utils`, ni el driver `@neondatabase/serverless` (HTTP/WebSocket propietario): solo `pg` estándar.

## 4. Hallazgos del código actual que condicionan la Fase 3 (evidencia en disco)

| # | Hallazgo | Evidencia | Consecuencia |
|---|---|---|---|
| H-03-01 | No hay Dockerfile, ni `/healthz`, ni servicio de estáticos: en dev Vite sirve el front y Fastify solo la API | `src/infrastructure/http/app.ts` (sin `healthz`/`static`); `ls` raíz | Se requieren `/healthz`, `/readyz`, serving de `dist/` con SPA fallback (contrato nuevo) |
| H-03-02 | `HOST` solo admite `127.0.0.1`; Cloud Run exige escuchar en `0.0.0.0` y `PORT` (8080) | `app-config.ts` (`HOST: enum ['127.0.0.1']`) | Enmienda del esquema de configuración (Nivel 2 por constitución II.6) |
| H-03-03 | El mantenimiento ADR-002-14 se programa con `setInterval` de 24 h en proceso | `server.ts` (`scheduleMaintenance`) | Con `min-instances=0` y CPU solo durante solicitudes **nunca corre de forma fiable**. Se mueve a Cloud Scheduler → endpoint interno autenticado con OIDC (REQ-CLD-007) |
| H-03-04 | El código usa parámetros-propiedad de constructor (`constructor(private readonly db…)`) y se ejecuta con `tsx` en desarrollo; Node 22.23 solo elimina tipos sin transformar | `sqlite-unit-of-work.ts`; `package.json` (`tsx` en devDependencies) | Cómo se ejecuta TS en producción: **D-07 = A (Neo): bundle compilado con `esbuild`** (devDependency, solo etapa de build). La opción `tsx` de producción quedó descartada; alternativas en `§9` |
| H-03-05 | `BEGIN IMMEDIATE` serializa todas las transacciones (escritor único) | `sqlite-unit-of-work.ts` | Con Postgres y 1-2 instancias hay concurrencia real. Se conserva la semántica con un candado global de transacción (ADR-003-04) |
| H-03-06 | SQL específico de SQLite: `STRICT`, `json_extract`, `strftime`, `GLOB`, `INSERT OR IGNORE`, `RETURNING`, `PRAGMA` | migraciones 0001-0005 y `sqlite-unit-of-work.ts` (`purgeExpired`) | Traducción a PostgreSQL en `data-model.md` (tipos, `JSONB`, `~`, `ON CONFLICT`) |
| H-03-07 | Borrado físico: ADR-002-13 usa `secure_delete` y `wal_checkpoint(TRUNCATE)` (R4) | `plan.md` de la 002 L99 | En Postgres un `DELETE` no sobrescribe y Neon conserva **6 h de PITR** y cualquier `pg_dump` en GCS. **El equivalente cloud es más débil**: riesgo R-02, decisión D-06 (con revisión de `/rama`) |
| H-03-08 | `ARGOS_AUDIT_HMAC_SECRET` ya es obligatorio fuera de `NODE_ENV=test` y rechaza secretos públicos | `app-config.ts` | La Fase 3 solo debe **inyectarlo**; si falta, Cloud Run falla el arranque (comportamiento deseado) |
| H-03-09 | `test-gate.yml` no tiene `workflow_call`; ramas `main` y `develop` (Mirror usa `dev`) | `.github/workflows/test-gate.yml` | Modificar el flujo es Nivel 2; D-09 fija el nombre de la rama de integración |

## 5. Plantilla de referencia: convenciones tomadas de Mirror (solo lectura)
Leído en `/Users/andresvalejo/Documents/Tecnica/Proyecto Mirror/`: `proyecto/terraform/{main,locals,backend,provider,variables,outputs,imports}.tf` y `modules/mirror-platform/{services,secret_manager,buckets,cloud_scheduler,...}.tf`; workflows `infraestructura.yml`, `auto-pr.yml`, `deploy-functions.yml`, `code-quality.yml`.
Convenciones leídas de Mirror (módulo único por plataforma + catálogos en `locals.tf`); **la 003 las descarta y usa raíz plana (H-MIF-004)**; se conservan: `backend "gcs" {}` vacío con `-backend-config` desde CI; variables `TF_VAR_*`; `google_project_service` con `disable_on_destroy=false`; buckets STANDARD con `uniform_bucket_level_access=true`; secretos `replication { auto {} }` con versión condicional (`count` si no es nulo); `terraform ~> 5.20`, Terraform 1.9.0; `concurrency` por `github.ref`; reintento ante 409 en `apply`; PR = plan, `main` = apply.
**Diferencias deliberadas respecto de Mirror**: (a) prefijo de estado propio y, preferiblemente, bucket de estado propio (el de Mirror es `…-gcf-artifacts` con `force_destroy = true`: un `terraform destroy` de Mirror borraría el estado de Argos); (b) autenticación sin llave JSON (Workload Identity Federation) como opción recomendada; (c) `plan` guardado y aplicado tal cual; (d) sin `imports.tf` (Argos nace limpio); (e) Mirror tiene 2 jobs de Scheduler: se respetan sus cupos compartidos.

## 6. Observabilidad y analítica: decisión de Neo (2026-11-15)
- Los registros operativos van nativos a Cloud Logging (cupo gratuito de 50 GiB/mes; sin exportadores ni sumideros). Las métricas se consumen en el portal web de Argos.
- Almacén de datos: se ratifica Neon PostgreSQL; Firestore queda descartado.
- La analítica externa queda fuera de alcance por decisión de Neo (ver `spec.md`). No hay recursos, tareas ni requisitos de analítica en la 003.

## 7. Riesgos

| ID | Riesgo | Prob. | Impacto | Mitigación |
|---|---|---|---|---|
| R-01 | Artifact Registry > 0,5 GB | Alta sin política | Costo > 0 | Una sola política `keep` de N versiones (N=5 provisional, fijada tras medir en T434; sin regla «borrar > 7 d», H-MIF-013), imagen `-slim` por digest, sin devDependencies (REQ-IAC-004, NFR-CLD-002) |
| R-02 | Borrado físico más débil (Postgres + PITR 6 h + dumps) | Cierta | Incumple el espíritu de R4/ADR-002-13 | D-06 = A; ventana honesta `max(PITR 6 h, VACUUM <= 7 d, dumps 14 d)` (REQ-PG-011), `VACUUM` por `workflow_dispatch` tras cada eliminación y semanal, soft delete 0 s, restauración sin resurrección (REQ-PG-016); `/rama` aceptó con condiciones; D-22 = A ratificada por Neo (2026-11-15) |
| R-03 | Cupos compartidos con Mirror (GCS 5 GB, Scheduler 3 jobs, Logging 50 GiB) | Media | Costo > 0 oculto | D-01 (proyecto separado no aísla el cupo: el Free Tier de varios productos es **por cuenta de facturación**; aun así aísla IAM y estado); tope: 1 job Scheduler, 1 bucket |
| R-04 | Cold start encadenado 2-5 s degrada la UX | Alta | Medio | Probe de arranque, `startup-cpu-boost`, bundle esbuild, estado de carga en la UI; medir (T-CLD-MEASURE) |
| R-05 | Agotamiento de 100 CU-h de Neon | Baja con tráfico bajo | Caída del servicio | Sin keep-alive frecuente; cota 0,25-0,5 CU; alerta; guía operativa |
| R-06 | Valores de secretos en el estado de Terraform (por `TF_VAR_*`) | Cierta | Fuga si el bucket se filtra | Bucket de estado privado, versionado, acceso mínimo, cifrado en reposo; rotación documentada. Alternativa: crear solo el contenedor del secreto en Terraform y cargar versiones con `gcloud` (D-05). **Aceptación vigente (2026-11-16, espejo de `spec.md`, notas T452)**: R-06 se mantiene (decisión de Neo T444a, opción ii) con bucket privado, UBLA, cifrado en reposo, `prevent_destroy` y `public_access_prevention=enforced` (REQ-SEC-006, REQ-IAC-008). La aceptación de T446a (opción iii; el job `plan` de PR recibe secretos bajo el modelo de único mantenedor soberano, Neo) se refleja como **condición de reapertura: reabrir esta decisión si el repositorio incorpora colaboradores** |
| R-07 | Servicio público sin Cloud Armor: abuso/bot que consuma el cupo | Media | Costo > 0 | `max-instances=2`, límites de frecuencia de la app (ADR-002-12), `concurrency` acotada, alerta de presupuesto |
| R-08 | Conflicto de transacciones concurrentes entre 2 instancias | Media | Corrupción lógica | Candado global de transacción (ADR-003-04) + pruebas de concurrencia con 2 pools |
| R-09 | Proveedor `google` 5.x vs 6.x/7.x y cambios de API Cloud Run v2 | Media (5.x lleva 21 meses sin cambios, H-MERO-001) | Bajo | Fijar versión exacta y versionar `.terraform.lock.hcl`; `terraform validate` en CI; línea fijada por D-25: 7.46.2 exacta con lockfile (resuelta por Neo, 2026-11-15) |
| R-10 | Dependencias nuevas (`pg`, `@fastify/static`, `esbuild`) sin autorización | Cierta | Bloqueo de proceso | Nivel 2 (Neo): D-10 |
| R-11 | Free Tier sujeto a cambio (30 días de aviso) | Baja | Costo | T-CLD-VERIFY recurrente; alerta de presupuesto USD 1 |
| R-12 | **D-17 residual**: con caché de 60 s, un cliente que consulte `/readyz` cada minuto mantiene Neon despierto (0,25 CU x 720 h = 180 CU-h > 100 CU-h) aunque la base se consulte 1 vez por minuto por instancia | Baja (la URL no está enlazada; sin autenticación en `/readyz` por decisión de Neo) | Caída por cuota de Neon | Decisión de Neo: caché de 60 s y tráfico público en `/healthz`; no hay límite por IP ni alerta de CU-h por API (D-19 retira `NEON_API_KEY`); se vigila el consumo a mano en la consola de Neon en T461; si apareciera abuso, reabrir D-17 |
| R-13 | **D-18 residual**: `argos-terraform-plan@` es de solo lectura pero lee el estado, que contiene los secretos en claro (R-06) | Baja (un contribuyente, PR solo del mismo repositorio) | Fuga de secretos si un PR hostil ejecuta el flujo | Plan solo para PR del mismo repositorio, `-lock=false`, bucket de estado privado; reabrir D-18 si hay más contribuyentes |
| R-14 | **D-24 residual**: **MITIGADO por Neo (2026-11-15)**: dumps con 14 días de vida y cadencia semanal manual dejan al menos 2 copias; un dump omitido una semana aún deja 1 copia y RPO <= 7 d sigue coherente (NFR-CLD-014). Riesgo original: con 7 días un dump omitido dejaba 0 copias | Media | RPO incumplido | Cadencia semanal estricta (T454, recordatorio en el runbook); Neo aprobó ampliar la vida del dump a 14 d (R-14), lo que lleva a 14 d la ventana de purga física de D-22 (decisión de Neo) |
| R-15 | F2 depende de la VM de Mirror (disponibilidad, Nginx, cron de DuckDNS) y F3 usa un servicio en Preview con gratuidad no confirmada | Media | Alias caído o cargo inesperado | F1 es el frente principal y no depende de ellos; T483 y T482 verifican; costo medido en T461 |

## 7.1 Verificación de documentación oficial: domain mapping (2026-11-15)
Lectura de `docs.cloud.google.com/run/docs/mapping-custom-domains` (WebFetch): los mapeos de dominio de Cloud Run están en estado **Preview**, «no recomendados para servicios de producción», disponibles solo en ciertas regiones (incluye `us-central1`). Pasos: verificar la propiedad del dominio base (Search Console), crear el mapeo (consola, `gcloud` o Terraform) y actualizar los registros DNS en el registrador (A/AAAA/CNAME). **La página no declara tarifa ni declara el mapeo gratuito**, y la página de precios (`cloud.google.com/run/pricing`) no pudo leerse completa. Conclusión: la gratuidad **no está confirmada por la documentación oficial**; el uso de un Load Balancer sí tendría costo y se evita. Se mide en la factura en T461 (REQ-IAC-014, R-15).

## 8. Anotaciones de `/rama` (H-RAMA-010, 012..014; sin efecto sobre REQ)

Verificación del 2026-11-15 (WebFetch de `docs.cloud.google.com/storage/docs/soft-delete`): los buckets nuevos de GCS traen **soft delete de 7 días por defecto** y se desactiva con retención 0 (rango configurable 7 a 90 d). Confirma H-RAMA-002. **No** se pudo confirmar la retención por defecto de `_Default` (supuesto 30 d) ni de `_Required` (supuesto 400 d): la página de enrutamiento de Cloud Logging no cita el valor; quedan `[verificar]` en `data-model.md §6` y en T402. Un RTO medido y el resultado de T477 se anotarán aquí.

- **H-RAMA-012 (bajo)**: el estado de Terraform y los registros de Actions (90 d por defecto) pueden conservar valores de secretos y conteos de purga. Con soft delete 0 s la vida del estado no vigente es 30 d, no 37 d. Fijar el plazo de registros de CI en <= 30 d en la configuración del repositorio y confirmar que `vacuum` y `migrate` imprimen solo conteos (ya exigido en REQ-PG-015 y REQ-CICD-005).
- **H-RAMA-013 (bajo)**: la frase «las métricas se consumen en el portal web de Argos» (`spec.md`, nota de Grafana/BigQuery) no define métricas ni audiencia. Sin REQ, no existe portal en la 003; si se crea (feature 004+), limitarlo a agregados sin identificadores.
- **H-RAMA-014 (bajo)**: copias fuera de la nube. (a) Tras verificar T430, Neo borra de forma segura el `.db`, `-wal` y `-shm` locales de la 002 (paso para `quickstart.md`; hoy hay dos copias de los datos). (b) Los respaldos v3 que descargan los usuarios quedan en sus equipos, fuera del alcance de la nube; la UI de respaldo de la 002 no se modifica.

## 9. Anotaciones de `/merovingian` (H-MERO-005, 014, 015, 016; sin efecto sobre REQ)

Verificación del informe `.specify/memory/audits/gate-merovingian-003.md` (2026-11-15; no se repitieron las consultas).

- **`esbuild` (D-07 = A, decisión de Neo, sin cambio)**: 0.28.2 exacta (sin `^`, porque en 0.x el `^` admite cambios de minor), devDependency, `better-sqlite3` como `external`. El binario nativo `@esbuild/*` debe coincidir con la plataforma de CI (`linux-x64`); `npm ci --ignore-scripts` puede afectarlo **[verificar]**. **Alternativas anotadas, no adoptadas**: (1) `tsc` con emisión: sin dependencia nueva, pero requiere TypeScript >= 5.7 (`rewriteRelativeImportExtensions`; el proyecto usa `~5.6`, salto de Nivel 2); (2) *type stripping* nativo de Node 22 (`--experimental-strip-types`): cero dependencias, pero sin `enum` ni propiedades de parámetro de constructor (el código las usa, H-03-04) y con avisos experimentales **[verificar en 22.23.4]**; (3) `tsx` en producción: descartado por D-07.
- **`pg` (H-MERO-014)**: alternativas existentes `postgres` (porsager 4.1.1, Unlicense) y `@neondatabase/serverless` 1.2.1 (MIT, API de Neon por WebSocket); se mantiene `pg` (ADR-003-02: sin API propietaria). Compatible con PgBouncer en modo transacción mientras no haya sentencias preparadas con nombre ni `SET` de sesión fuera de `SET LOCAL`. `pg-types` 2.2.0 (transitiva) no tiene mantenimiento activo: T423/T424 registran parsers explícitos para `numeric`, `bigint` y `timestamptz` y prueban que las marcas `TEXT` ISO-8601 no se reinterpretan.
- **Licencia de Terraform (H-MERO-016)**: Terraform >= 1.6 es BUSL-1.1 (uso interno sin restricción práctica **[verificar con lectura de la licencia]**). OpenTofu (MPL-2.0) es la alternativa; se informa por transparencia y no se recomienda por paridad con Mirror. Ligado a D-25 (resuelta: Terraform 1.17.2).
- **Versión de Node (H-MERO-015)**: `.nvmrc` = 22.23.4; existe 22.23.5 (2026-11-11, menos de 14 d al 2026-11-15). Se mantiene 22.23.4 y se reevalúa en T433.
- **Proveedor `google` (H-MERO-001)**: 5.x termina en 5.45.2 (2025-02-10); 6.x en 6.50.0 (2025-09-19); 7.x en 7.46.2 (2026-10-23); vigente 8.11.0. Terraform vigente 1.17.2. Sin lockfile en la spec anterior. **D-25 resuelta por Neo: 7.46.2 exacta y Terraform 1.17.2 con `.terraform.lock.hcl` versionado**; el salto 5.x → 7.x puede cambiar nombres de argumentos de `google_cloud_run_v2_service` y de las versiones de secreto: se verifican con `terraform plan` real en T469.
- **Acciones de GitHub (H-MERO-007)**: versiones vigentes al 2026-11-15 según el informe (`actions/checkout v7.0.1`, `actions/setup-node v7.1.0`, `google-github-actions/auth v3`, `hashicorp/setup-terraform v4.0.1`, `docker/login-action v4.8.0` con menos de 14 d); los SHA se resuelven en T445..T449, no aquí.

## 10. Registro de petición de Cloud Run (R-3 de T415; 2026-11-16)
- **Qué es:** Cloud Run escribe por su cuenta, para los servicios, un registro por petición en el log `run.googleapis.com/requests` (recurso `cloud_run_revision`), creado automáticamente. Su `httpRequest` aporta método, URL solicitada (esquema, host, ruta y *query*), código de estado, latencia (duración en segundos) e IP remota del cliente (`remoteIp`, puede incluir puerto); además el *user-agent* según REQ-CLD-008 (c). Las definiciones de campo son las del objeto genérico `HttpRequest` de Cloud Logging; no se halló una página de Cloud Run que las redefina.
- **La aplicación no lo duplica:** una petición produce un único registro `incoming request` de la app (`tests/integration/ops/logging.spec.ts`) y `serializers.req` emite solo `method` y la ruta con plantilla, sin IP, `hostname`, `remotePort` ni *query* (`src/infrastructure/http/cloud-logging.ts`). Por tanto la IP y la URL con valores solo existen en el registro de la plataforma, que no se puede suprimir (REQ-CLD-008 (c)).
- **Retención:** el bucket `_Default` de Cloud Logging conserva 30 días si no se cambia (configurable de 1 a 3650 días). **[verificar]** que este log concreto se enruta a `_Default` (sumidero `_Default`) en el proyecto real: la documentación consultada no lo afirma para `run.googleapis.com/requests`. No se fija una cifra distinta; si Neo acorta o alarga el periodo, se actualiza `data-model.md §6`.
- **Fuentes:** [Logging and viewing logs in Cloud Run](https://docs.cloud.google.com/run/docs/logging), [Configure log buckets](https://docs.cloud.google.com/logging/docs/buckets), [LogEntry/HttpRequest](https://cloud.google.com/logging/docs/reference/v2/rest/v2/LogEntry) (consultadas 2026-11-16).


## 11. Medición T459 (latencia y arranque en frío; 2026-11-17)
- **Fuente de latencia:** logs de Cloud Run `httpRequest.latency` del servicio `argos`, últimas 24 h, todas las rutas: n=143, **p50 = 0.40 s, p95 = 1.22 s**. La muestra mezcla rutas (incluye login con hash de contraseña) y no separa instancia fría de caliente.
- **Contraste con NFR-CLD-006** (p95 <= 800 ms con instancia caliente y Neon activo): **no cumplido en esta muestra** (1.22 s). No se recalibra aquí: queda abierto para decisión de Neo (recalibrar el umbral o investigar la ruta lenta). Se registra tal cual.
- **Arranque en frío (SC-CLD-012):** primera solicitud autenticada tras pausa de 10 min (11:34 a 11:44 UTC): login 200 en **1.38 s**, `GET /pets` 200.
- **Contraste con NFR-CLD-005** (<= 8 s tras >= 15 min sin tráfico): **cumple con 1.38 s**, pero la pausa medida fue de 10 min, no de 15. La condición exacta no se midió.
- **RTT Cloud Run→Neon:** no medido por separado. Sin medición explícita de arranque encadenado (Neon despierto + instancia fría); queda como reserva.
- **Registro:** Seraph, `recorrido-aceptacion-003.md` (SC-CLD-012); Oracle, `oracle-T460-aceptacion.md`.

## 12. Prueba de restauración T478 (SC-CLD-021, NFR-CLD-014/015; 2026-11-17)
- **Alcance ejecutado:** validación local en Postgres 17 (Keymaker/Oracle, `oracle-T478-local.md`, pasos 1–4) **y** simulacro en vivo ejecutado por Neo (Level 2) contra GCS y rama desechable de Neon siguiendo el runbook de `T454` (`REQ-PG-016`).
- **RTO medido:** **20 min** (incluyendo operación manual completa), cumpliendo ampliamente el objetivo `<= 2 h` (`NFR-CLD-015`).
- **Verificación:** la cuenta eliminada tras el respaldo no reapareció después de la purga HMAC, las sesiones restauradas quedaron invalidadas y la rama desechable de Neon fue eliminada al concluir.
