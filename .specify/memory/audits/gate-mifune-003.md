# Gate /mifune — Feature 003 (Argos en Cloud Run + Neon, costo 0 USD)

**Fecha**: 2026-11-15. **Autor**: `/mifune` (Anti-Overengineering & KISS). **Estado**: `DRAFT` informativo; no aprueba nada ni edita specs. **Objeto**: `specs/003-cloud-gcp/{spec,plan,tasks,data-model,research,quickstart}.md` (76 tareas T401..T476). **Excluido de este informe**: lo ya cubierto por `.specify/memory/audits/gate-lock-003.md` (29 H-LOCK) y lo ordenado expresamente por Neo (D-01..D-16).

Criterio: «¿cuál es el camino más simple que cumple el REQ/SC y los H-LOCK de integridad o seguridad?». Un recorte nunca elimina un H-LOCK; reduce la forma en que `/architect` lo mitigó cuando esa forma excede al hallazgo.

## Conteo

| Severidad | N | Significado |
|---|---|---|
| Alto | 2 | Recorte que elimina una pieza completa de CI o de ensayo (varias tareas) |
| Medio | 8 | Capa, tarea o requisito prescindible, con ahorro claro |
| Bajo | 6 | Limpieza menor o duplicación |
| Total | 16 | + 1 lista de «no recortar» |

Ahorro estimado si se aceptan todos: 4 tareas eliminadas o fusionadas (T468 parcial, T469+T470+T476 en una, T445 opcional), ~8 tareas reducidas en alcance, 1 secreto de GitHub (`NEON_API_KEY`), 1 cuenta de servicio (la de `plan`), 1 trabajo de CI (`compat`), 1 proyecto GCP desechable x3 ensayos → x1, y 6 requisitos/NFR/ADR de relleno.

---

## ALTOS

### H-MIF-001 (alto) — Trabajo de CI `compat` (N-1 contra esquema N) sobredimensiona el rollback
- **Ref**: REQ-CICD-010, NFR-CLD-013, SC-CLD-013 (parte) y SC-CLD-020 (parte), plan.md §6.2 (`compat`) y §6.4 punto 3, T468 (N2), EDGE-CLD-02.
- **Qué hay**: un job que arranca la imagen anterior contra el esquema migrado y ejecuta lectura y escritura con usuario sintético en transacción revertida, más una prueba equivalente en `tests/`; sin esa prueba verde no hay despliegue.
- **Por qué sobra**: el hallazgo H-LOCK-001 se cierra con el criterio **esperadas ⊆ aplicadas** (REQ-PG-013) y la regla *expand/contract*; el job `compat` es un extra de `/architect`. Para <= 3 usuarios, un solo desarrollador y migraciones que Neo revisa, es una pieza de CI con imagen previa, base real y usuario sintético que cuesta minutos de Actions por despliegue y mantenimiento propio.
- **Recorte**: eliminar el job `compat` y la parte de CI de T468; conservar (a) criterio de subconjunto y (b) la regla expand/contract como casilla obligatoria del `code-review.md` de cada migración y (c) **una** prueba en `tests/` que corre N-1 (código del commit previo) solo cuando el PR toca `migrations/`. Quitar NFR-CLD-013 (duplica SC-CLD-013) y la parte de «compat» de SC-CLD-020.
- **Qué se pierde**: detección automática de una migración incompatible con la revisión previa en cada despliegue; queda revisión humana más la prueba condicional. No toca H-LOCK-001 (el criterio de subconjunto permanece) ni H-LOCK-010 (migrador acotado permanece).

### H-MIF-002 (alto) — Tres ensayos separados en un proyecto GCP desechable (T469, T470, T476)
- **Ref**: tasks.md T469 (rollback + `ignore_changes`), T470 (bootstrap en dos fases), T476 (runbook de rotación), SC-CLD-015, SC-CLD-016, SC-CLD-018 (ensayo).
- **Qué hay**: tres tareas `[N2]` que piden un proyecto desechable (con facturación) y repiten `apply`, `gcloud run deploy --no-traffic`, rollback y segundo `plan`.
- **Recorte**: fusionar en **una** tarea «ensayo único en proyecto desechable» (bootstrap en dos fases → despliegue sin tráfico → rollback manual → `plan` vacío → una rotación de versión numérica) con un solo checklist, o ejecutarlo directamente como parte de T457/T458 en el proyecto real (el primer `apply` ya es un ensayo; es un servicio vacío con costo 0). Un proyecto desechable adicional consume cuota de proyectos y exige otra cuenta de facturación vinculada.
- **Qué se pierde**: aislamiento del ensayo respecto de producción; riesgo bajo porque en T457 el servicio aún no tiene datos. No elimina los H-LOCK-004/005/007: sus pruebas se conservan, solo cambia dónde y cuántas veces.

---

## MEDIOS

### H-MIF-003 (medio) — Rotación de secretos: runbook y automatización por encima de lo necesario
- **Ref**: REQ-SEC-008, REQ-CICD-009 (parte «deshabilitar/destruir»), plan.md ADR-003-16, T475, T476, NFR-CLD-003, SC-CLD-018.
- **Qué hay**: rol alterno de Neon, deshabilitar versión previa tras promover, destruir a los 7 días, eliminar versiones no vigentes del estado a los 30 días, HMAC «solo ante compromiso con decisión de Neo».
- **Recorte**: conservar lo que cierra H-LOCK-007: versión **numérica** fijada por despliegue + validación de formato (REQ-CICD-009 primera parte, T472). Reducir REQ-SEC-008 a un párrafo de 5 líneas en `terraform/README.md` (nueva versión → deploy → humo → promover; si falla, rollback de tráfico). Quitar «destruir a los 7 días» y el ciclo de 30 días del estado como requisitos (el bucket ya lo exige REQ-SEC-006; no duplicar). T476 desaparece (ver H-MIF-002).
- **Qué se pierde**: rotación sin ninguna ventana de error para `DATABASE_URL` (rol alterno); con <= 3 usuarios una ventana de segundos es aceptable. No toca H-LOCK-007.

### H-MIF-004 (medio) — Módulo Terraform `argos-platform` con un solo consumidor, más catálogos `locals`
- **Ref**: REQ-IAC-001, plan.md §1.2 y §2.1, T436 (`modules/argos-platform/{variables,outputs,services}.tf`).
- **Qué hay**: `main.tf` invoca un único `module "argos_platform"` con mapas de `locals` (`buckets`, `secrets`, `service_accounts`, `cloud_run`) y el módulo repite `variables.tf`/`outputs.tf`. Nunca se instancia dos veces; no hay segundo entorno (D-01: un proyecto).
- **Recorte**: raíz plana: `terraform/{providers,backend,variables,outputs,services,cloud_run,artifact_registry,secret_manager,iam,buckets,scheduler}.tf`; sin `module`, sin `modules/`, sin los catálogos `locals` (solo valores literales con `var.project_prefix`). Ahorra 3 archivos de plomería y la propagación variable→módulo→variable.
- **Qué se pierde**: paridad de estructura con Mirror (REQ-IAC-001 la pidió «espejo»; no es una orden expresa de Neo, es de `/architect`) y la posibilidad de un segundo entorno sin refactor. `grep -ri mirror terraform/` y el estado propio no cambian.

### H-MIF-005 (medio) — Puerto del verificador OIDC en `application/ports` contradice NFR-CLD-009 y no tiene segundo consumidor real
- **Ref**: tasks.md «Reglas transversales» y T414 (`puerto en application/ports`), NFR-CLD-009 («cero cambios en `src/domain/` y `src/application/`»), SC-CLD-011, plan.md §1.2 (`oidc-token-verifier.adapter.ts`).
- **Qué hay**: un puerto en la capa de aplicación para un concepto que solo existe en `infrastructure/http` (verificar un JWT de la ruta operativa). El único «segundo consumidor» es el doble de pruebas.
- **Recorte**: función `verifyOidc(token): Promise<Identity>` inyectada como opción del plugin de rutas operativas en `infrastructure/http/routes/ops-routes.ts`; pruebas con una función falsa. Sin puerto, sin cambios en `application/`, `git diff --stat` en `src/application` = 0 sin excepción.
- **Qué se pierde**: la simetría hexagonal formal; ninguna capacidad. Respeta H-LOCK-016 (la dependencia y la audiencia siguen requiriendo Nivel 2 en D-10; este recorte no las elimina).

### H-MIF-006 (medio) — Verificación de esquema «en el primer caso de uso» y diseño de `/readyz`; recomendación para D-17
- **Ref**: REQ-PG-013 («en `/readyz` y en el primer caso de uso de la instancia»), T463/T464, REQ-CLD-004, plan.md §9, D-17 (PENDIENTE).
- **Qué hay**: la comprobación de `schema_migrations` corre en dos lugares; el segundo (primer caso de uso) añade un estado compartido de «ya verificado» por instancia, ruta de error y pruebas.
- **Recorte**: verificar el esquema **solo** en `/readyz` y en el paso `smoke` del despliegue (ya es obligatorio antes de promover). Quitar «primer caso de uso» de REQ-PG-013 y T464 (menos estado, menos pruebas). `/readyz` se mantiene porque `smoke` lo necesita (y H-LOCK-024 pide humo real, no solo `SELECT 1`).
- **Para D-17** (no se cierra aquí): la opción más simple que cubre H-LOCK-002 es **caché en proceso de 60 s del resultado de `/readyz`** (≈10 líneas, sin dependencias, sin límite por IP nuevo). Descartar «`/readyz` con OIDC» (otra verificación OIDC) y la alerta semanal de CU-h por la API de Neon (obliga a `NEON_API_KEY`; ver H-MIF-007) salvo que Neo la pida.
- **Qué se pierde**: la detección de esquema desfasado antes del primer uso real (queda a `smoke`). No toca H-LOCK-001 (el arranque no verifica; `/healthz` no toca la base).

### H-MIF-007 (medio) — Ramas Neon `pre-<sha>` en cada despliegue y `NEON_API_KEY` en el pipeline
- **Ref**: REQ-CICD-005 («Opcional…»), plan.md §6.3 (`NEON_API_KEY`, `NEON_PROJECT_ID`), §6.4 punto 4, ADR-003-05, H-LOCK-011 (ramas sin limpieza).
- **Qué hay**: rama de seguridad por despliegue con tope de 10 sin limpieza (H-LOCK-011), un secreto de API de Neon con permisos amplios, y datos «borrados» retenidos en ramas.
- **Recorte**: no automatizar la rama. La red de seguridad ya es PITR 6 h (ADR-003-05 la nombra). Para una migración riesgosa: Neo crea la rama a mano. Eliminar `NEON_API_KEY`/`NEON_PROJECT_ID` del mapa de secretos (la única otra razón es la alerta de CU-h de D-17, que se desaconseja en H-MIF-006).
- **Qué se pierde**: restauración inmediata por migración fallida a mitad en un solo comando; la transacción por archivo (REQ-PG-006) ya revierte la migración fallida. Cierra H-LOCK-011 por eliminación. D-03 = A de Neo se cumple (migración directa previa al despliegue); la rama era un «opcional» de `/architect`.

### H-MIF-008 (medio) — Reproducir 5 migraciones SQLite en Postgres en lugar de un esquema base único
- **Ref**: REQ-PG-001/003/006, data-model.md §2 y §3, T419 («conversiones de 0003/0004/0005»), T430.
- **Qué hay**: `0001..0005` de Postgres, una por cada migración de SQLite, incluidas las conversiones intermedias (datos y reconstrucciones de tabla) que en Postgres nacen sobre una base **vacía**: no hay filas que migrar (el traslado usa el respaldo v3, REQ-PG-007).
- **Recorte**: un único `0001_baseline.sql` con el esquema **final** equivalente (mismas columnas, `CHECK`, FKs, índices parciales). La prueba de paridad de esquema (plan §7) compara el resultado final, no el historial. Las migraciones futuras sí se numeran y siguen *expand/contract*.
- **Qué se pierde**: correspondencia 1:1 de nombres de archivo entre SQLite y Postgres (sin consumidor) y la «prueba» de reproducir `0003..0005`. No toca REQ-PG-003 (el esquema final es idéntico) ni REQ-MIG-001.

### H-MIF-009 (medio) — Recomendación para D-18 y simplificación de `infraestructura.yml` (plan guardado, 409, pruebas con planes sintéticos)
- **Ref**: D-18 (PENDIENTE), plan.md §5 y §6.1, REQ-CICD-002 (plan guardado, comentario en PR, reintento ante 409), REQ-IAC-007/013, T446, T471, H-LOCK-008, H-LOCK-019.
- **Recomendación D-18 (no se cierra aquí)**: la opción más simple que cierra H-LOCK-008 es **no usar WIF en `pull_request`**: condición del proveedor WIF solo `refs/heads/main` (y el Environment con aprobación de Neo para `apply`); en PR corre solo `fmt`/`validate` sin credenciales de nube. Sin cuenta `argos-terraform-plan@`, sin comentario de plan en el PR, sin reglas de `job_workflow_ref` adicionales.
- **Recorte de flujo**: en `main`, un solo job: `plan` fresco → guardia → `apply` (sin reutilizar el plan del PR, lo que además resuelve H-LOCK-019 «plan obsoleto» y elimina el reintento ante 409). La guardia de borrados es un `jq` de ~10 líneas; T471 se reduce a **una** prueba con un plan real y otra sintética de `delete`, no una matriz.
- **Qué se pierde**: ver el plan en el PR antes de fusionar (Neo puede ejecutar `terraform plan` local o ver el plan del job de `main` antes de aprobar el Environment). No toca H-LOCK-006 (guardia permanece).

### H-MIF-010 (medio) — Bucket GCS: permisos y flujos sin productor
- **Ref**: plan.md §1 (arista punteada «export futuro»), §5 (`argos-run@` con `roles/storage.objectAdmin`), REQ-IAC-006/008, T454, US5 (P3), SC-CLD-008.
- **Qué hay**: la aplicación no escribe nunca al bucket en esta feature; sin embargo `argos-run@` recibe `objectAdmin`, el bucket tiene prefijos `exports/` y `dumps/`, T454 pide un procedimiento de `pg_dump` «con cifrado» y la historia US5 es P3. Neo pidió GCS expresamente, por lo que **el bucket permanece**.
- **Recorte**: quitar `storage.objectAdmin` de `argos-run@` hasta que exista un productor (feature 004+); dejar solo el uso por Neo/CI para `dumps/`. Reducir T454 a un comando documentado de `pg_dump | gsutil cp` sin «cifrado» propio (el bucket ya cifra en reposo) y retirar `exports/` del texto (queda `dumps/`). Fijar `us-central1` y STANDARD (H-LOCK-018 se conserva).
- **Qué se pierde**: nada hoy; un permiso que no se usa. Cuando una feature exporte desde la app, se añade el rol.

---

## BAJOS

### H-MIF-011 (bajo) — `vacuum-argos.yml` diario y aserción negativa en SC-CLD-019
- **Ref**: REQ-PG-015, ADR-003-17, T473, SC-CLD-019.
- **Recorte**: el borrado físico es una orden de Neo (D-06 = A) y el rol propietario es necesidad de H-LOCK-009: **se conserva el flujo**. Sí se puede: cadencia **semanal** (no diaria) más `workflow_dispatch`, y quitar de SC-CLD-019 la verificación de que «la misma sentencia bajo `argos_app` queda registrada como no válida» (prueba del propio motor de Postgres, no de Argos); basta `last_vacuum` actualizado.
- **Qué se pierde**: ventana de borrado físico de 1 a 7 días tras la purga; sigue dentro de la ventana PITR documentada.

### H-MIF-012 (bajo) — Duplicación en `code-quality.yml` y `trivy` informativo
- **Ref**: REQ-CICD-007, T449, REQ-SEC-005, T451.
- **Recorte**: `terraform fmt/validate` ya corre en `infraestructura.yml` (REQ-CICD-002); dejar en `code-quality.yml` solo `hadolint` y `actionlint`. `trivy` «informativo» (sin umbral ni REQ que lo consuma) se quita; `gitleaks`/`grep` de SC-CLD-004 se conservan.
- **Qué se pierde**: un reporte que nadie lee; el escaneo de secretos permanece.

### H-MIF-013 (bajo) — Dos políticas de limpieza de Artifact Registry y prueba de 5 despliegues
- **Ref**: REQ-IAC-004, NFR-CLD-002, SC-CLD-010, H-LOCK-021.
- **Recorte**: una sola política `keep` de las **5** versiones más recientes (rollback seguro) y quitar «borrar > 7 d» (la combinación causa H-LOCK-021). SC-CLD-010 se verifica con la métrica de tamaño en T461, sin una prueba dedicada de 5 despliegues.
- **Qué se pierde**: antigüedad máxima de imágenes; con <= 200 MB comprimida x 5 = ~1 GB podría exceder 0,5 GB: **medir primero en T434** y bajar a 3 si hace falta (cuidado: NFR-CLD-001 manda).

### H-MIF-014 (bajo) — Relleno documental: ADR de decisión trivial, tumbas numeradas y NFR duplicados
- **Ref**: plan.md ADR-003-07 (región, ya es D-02), ADR-003-10 (repite REQ-IAC-003), ADR-003-12 y REQ-IAC-011 (retirados «para no renumerar»), tabla §4.1 (enmiendas separadas de ADR-003-04/05/08/09/11), NFR-CLD-013 (= SC-CLD-013), NFR-CLD-003 (<= 10 000 accesos/mes de 2 secretos; no medible con un comando simple), NFR-CLD-005/006 (p95 «a recalibrar»), REQ-PG-009 (prohibición sin tarea propia).
- **Recorte**: fusionar las enmiendas dentro de su ADR original (una tabla, no dos); borrar ADR-003-12 y REQ-IAC-011 (no hay nada que conservar); convertir ADR-003-07 y ADR-003-10 en una línea de «Decisiones heredadas»; eliminar NFR-CLD-013 y NFR-CLD-003; dejar NFR-CLD-005/006 como una medición única en T459, no como contrato.
- **Qué se pierde**: la numeración continua de IDs (sin consumidor) y un NFR duplicado. Respetar `verify-traceability` (actualizar el mapa 1:1 si se borra un ID).

### H-MIF-015 (bajo) — `auto-pr.yml`: confirmar con Neo que se quiere
- **Ref**: REQ-CICD-001, T445, D-09.
- **Observación**: Neo fijó la rama `develop` (D-09), pero no ordenó expresamente `auto-pr.yml` (es patrón de Mirror elegido por `/architect`). Para un único contribuyente, `gh pr create` manual cubre lo mismo. **No recortar sin confirmar** con Neo.
- **Qué se pierde**: automatización de PR.

### H-MIF-016 (bajo) — Doble tope de sesión ociosa: `SET LOCAL` y `ALTER ROLE`
- **Ref**: REQ-PG-012, T421, T465, ADR-003-14.
- **Recorte**: `idle_in_transaction_session_timeout` en **un** solo sitio: nivel de rol (aplicado por el migrador), que cubre cualquier conexión incluso si el código olvida el `SET LOCAL`. Mantener `SET LOCAL` solo de `lock_timeout` y `statement_timeout`. **Verificar** que el pooler de Neon respeta la configuración de rol en el modo transacción antes de recortar; si no, conservar `SET LOCAL`. Es H-LOCK-003 (alto): no se recorta sin esa verificación.
- **Qué se pierde**: una línea y su prueba redundante.

---

## NO recortar (decidido por Neo o exigido por un H-LOCK de seguridad/integridad)

| Pieza | Razón |
|---|---|
| Candado global `pg_advisory_xact_lock` (ADR-003-04, REQ-PG-004) | Respuesta a plan §9: es la opción más barata que da paridad exacta con `BEGIN IMMEDIATE`; la alternativa (`FOR UPDATE` por fila) exigiría analizar ~66 métodos. Conservar. Endurecimiento H-LOCK-003 incluido. |
| `/healthz` sin base y `/internal/maintenance` OIDC | H-LOCK-001/016; D-04/ADR-003-06. |
| Versión numérica de secreto por despliegue y validación en CI | H-LOCK-006/007 (integridad). |
| `VACUUM` por el rol propietario | H-LOCK-009 y D-06 de Neo. |
| Migrador con candado y topes (REQ-PG-014) | H-LOCK-010. |
| WIF sin llaves JSON, `TF_VAR_*`, `esbuild`, un solo job de Scheduler, presupuesto 1 USD, bucket de estado propio | D-05, D-07, D-12, D-13 y NFR-CLD-001 (Neo). |
| Guardia de `delete`/`replace` (REQ-IAC-007) y bootstrap en dos fases (REQ-IAC-012) | H-LOCK-005/006. |
| Pool perezoso, reintento de `ECONNRESET` acotado, convención C-6 | H-LOCK-014/015 e INV-ARCH-005. |

## Observaciones transversales
- La Phase 9 (T463..T476, 14 tareas, SC-CLD-013..020) es el 18 % de la cola; varias son «máxima forma» de una mitigación mínima. Los recortes anteriores quitan 3 SC (013 parcial, 018 parcial, 020 parcial) sin perder la mitigación del hallazgo.
- Cuidado con el efecto de arrastre: cada borrado de REQ/NFR/SC exige actualizar el mapa 1:1 de `tasks.md` y `spec.md` antes de `/mouse`.
- Ninguna recomendación pide saltarse una compuerta ni una decisión de Nivel 2. D-17 y D-18 quedan PENDIENTE (Neo): las propuestas de H-MIF-006 y H-MIF-009 son recomendaciones, no decisiones.

## Próximo paso
`/morpheus` consulta a Neo H-MIF-015 y la recomendación de D-17/D-18; `/architect` aplica H-MIF-001..014 aceptados por Neo (los marcados «Neo» son Nivel 2) y actualiza el mapa 1:1; luego `/rama`, `/merovingian`, `/mouse`.

FROM: Mifune
TO: Morpheus
STATUS: Validation Required
