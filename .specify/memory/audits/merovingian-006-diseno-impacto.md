# Merovingian 006 — Grafo de impacto del diseño (plan.md, contracts/, data-model.md) sobre 001..005

Fecha: 2026-11-18. Autor: /merovingian. Modo: solo lectura (sin ediciones de specs, src, tests ni scripts; sin instalar paquetes). Continúa `merovingian-006-dependencia-ia.md` (H-MERO-006-01..05); este informe usa 006-11 en adelante.
Evidencia: lectura y grep en disco de `specs/006-*/{plan,data-model}.md`, `contracts/`, `scripts/compile-contracts.sh`, `scripts/verify-traceability.sh`, `src/` y `tests/`.

## 1. Veredicto

Los contratos de 006 son aditivos y no editan ningún LOCKED: catálogo incremental (7 códigos, sin colisión con 001..005), OpenAPI 3.4.0 solo con operaciones nuevas, máquina `STATE-SCENE-001` nueva, esquemas nuevos y sin cambio en el sobre de respaldo (`schemaVersion` vigente 3.1.0, D6-13). El riesgo está en lo que el diseño asume del código existente y no es cierto: claves de objeto, enums cerrados de auditoría, cuota, presupuesto de Terraform, ganchos de recálculo y compuertas. Hay hallazgos ALTA que obligan a tareas de enmienda antes de implementar.

## 2. Grafo de impacto resumido (REQ → INV → STATE → ERR → src → tests)

| Cambio de 006 | Artefacto existente tocado | Código afectado | Suites existentes que se rompen o deben ampliarse |
|---|---|---|---|
| ERR-SCENE-* (7) | Catálogo 004 3.1.0 + 005 1.0.0 (sin editar); los 12 heredados existen en 004 | `src/generated/` (destino nuevo), mapeo HTTP de errores | Ninguna se rompe; nueva validación del catálogo fusionado 004+005+006 (patrón `catalog-validation-004`, `contracts-004-errors`) |
| OpenAPI 3.4.0 (13 ops) | 004 3.2.0 y 005 3.3.0 sin cambio | rutas nuevas en `infrastructure/http/routes` | `openapi-conformance.spec.ts` (fija 40 ops de 002) no se rompe; hace falta suite de conformidad 006 y ampliar `codegen-drift` |
| Eventos de auditoría SCENE_* | `audit-entry.schema.json` 004 3.1.0 (enums cerrados) y CHECK de `audit_log` | `audit-support.ts`, SQL de ambos motores | `contracts-004-schemas`, `codegen-drift`, `audit-log-adapter`, `schema-parity`, `postgres-repositories-part3` (006-11) |
| Claves `scenes/…` y `households/…` | `domain/media/media-keys.ts` (regex solo `pets/…`), `assertListPrefix` | todos los adaptadores de `MediaStoragePort` | `t570-media-storage-port`, `t606-intencion-conciliacion`, `t579-borrado-fisico`, `t571-dev-media-route` (006-12) |
| Cuota de 1 GiB con foto del hogar | `countBytesOfOwner` (solo `pet_media`) | `repositories.port.ts`, in-memory, sqlite, postgres | `t578-medios`, `t600-concurrencia-medios` (006-13) |
| 6 tablas nuevas | SQLite hoy 0012, Postgres hoy 0008 | migraciones SQLite 0013 y Postgres 0009 | `schema-parity.spec.ts` (listas cerradas de 23 tablas e índices), `sqlite-migration-marker`, `postgres-pool`, `postgres-maintenance` (006-14) |
| Ganchos `recomputeSceneStatus` | casos de uso de mascota, avatar, asignación, hogar, cuenta, propiedad, importación | `pet-`, `avatar-`, `assignment-`, `household-`, `account-`, `ownership-`, `backup-use-cases` | `application-harness.ts`, `in-memory-unit-of-work`, `use-cases.households`, `t542-retencion-cero`, `account-deletion*` (006-15, 006-16) |
| D6-10 roles | `RBAC_MATRIX` exhaustiva por `PetAction` | `domain/access/rbac.ts` | `rbac-export-permission`, `access-policy`, `roles.api` solo si se amplía `PetAction` (006-17) |
| Terraform (§7) | `budget.tf`, `services.tf`, `iam.tf`, `cloud_run.tf` | `terraform/` | `terraform-budget`, `terraform-root`, `terraform-cloud-run`, `terraform-iam`, `terraform-scheduler` (006-18) |
| Worker OIDC | `oidc-verify.ts`, `ARGOS_SCHEDULER_EMAIL`, `ARGOS_OIDC_AUDIENCE` únicos | `app-config.ts`, `server.ts` | `oidc-verify.spec`, `maintenance-route.spec`, `ops-surface*.security`, `app-config.spec` (006-19) |
| Compuertas | `compile-contracts.sh`, `verify-traceability.sh`, `test:gate`, workflows | `scripts/`, `.github/workflows/` | `verify-gates.spec`; `t796-compuerta-005` como patrón (006-20) |
| Pureza de capas INV-ARCH | `layer-dependencies.spec.ts`, reglas Semgrep | `src/domain/scene/` | No se rompe nada (006-21) |

## 3. Hallazgos

### H-MERO-006-11 — ALTA — Eventos de auditoría SCENE_* no caben en los enums cerrados
- Causa: `data-model.md` §8 declara 6 eventos nuevos (`SCENE_REQUESTED`, etc.) y los deja «a coordinar con /merovingian». En disco, `specs/004*/contracts/schemas/audit-entry.schema.json` (3.1.0) cierra `AuditMutationType` (CREATE, UPDATE, DELETE, ROLE_CHANGE, ASSIGN, UNASSIGN, OWNERSHIP_TRANSFER, IMPORT, MIGRATION, ACCOUNT_DELETE) y `AuditEntityType` (hasta `PET_MEDIA`, sin escena ni consentimiento), y `audit_log` tiene CHECK sobre ambas columnas (SQLite 0005, Postgres 0001). Los nombres `SCENE_*` no son valores de ninguno.
- Efecto: sin enmienda el INSERT de auditoría falla en ambos motores. 004 ya pagó este precio (`0009_pet_media.sql` reconstruye `audit_log` y declara «DESVIACIÓN: el data-model no lo lista»).
- Ruta: REQ-AUD-001, REQ-ESC6-021 → `audit-entry.schema.json` → CHECK de `audit_log` → `audit-support.ts` → `contracts-004-schemas`, `codegen-drift`, `audit-log-adapter`, `schema-parity`.
- Acción: decidir el mapeo (p. ej. `entity_type` nuevos `HOME_SCENE`, `SCENE_CONSENT`, `HOUSEHOLD_PHOTO` con `mutation_type` existentes) y declarar en M-1 la reconstrucción del CHECK (SQLite recrea la tabla; Postgres ALTER). El esquema es de 004 (no editable): el cambio MINOR debe ser una enmienda Nivel 2.

### H-MERO-006-12 — ALTA — El almacén de medios rechaza las claves de 006
- Causa: `src/domain/media/media-keys.ts` línea 12: `OBJECT_KEY = ^pets/{uuid}/(files|photos|avatar)/{uuid}$`; `assertMediaKey` y `assertListPrefix` (`media-storage-guards.ts`) lo aplican en todos los adaptadores. `plan.md` §5.5 usa `scenes/{sceneId}/images/{imageId}` y `households/{id}/photo/{objectId}`; `data-model.md` §6 manda a la conciliación diaria listar `scenes/` y `households/`, pero `maintenance-use-cases.ts` solo lista `pets/`.
- Efecto: `put`, `delete`, `list` y la firma de URL lanzan `RangeError` con esas claves; `media_deletion_queue` (sin CHECK de clave) las aceptaría y el borrado fallaría después.
- Ruta: INV-ARC-003, INV-ESC6-009, REQ-ESC6-018/029 → `media-keys.ts`, guards, adaptadores fake/local/GCS, conciliación → `t570`, `t606`, `t579`, `t571`.
- Acción: tarea explícita de ampliar el dominio de claves (INV-ARC-003 es de 004 LOCKED: enmienda Nivel 2) y la conciliación. Hoy el plan no lo declara.

### H-MERO-006-13 — ALTA — La cuota de 1 GiB no cuenta la foto del hogar
- Causa: `data-model.md` §2.4 dice que la foto del hogar cuenta en la cuota del propietario (REQ-ARC-005). `countBytesOfOwner` (`repositories.port.ts:184`, sqlite, postgres, in-memory) suma solo `pet_media` (`media-use-cases.ts:143,163`).
- Efecto: sin cambio de puerto el límite no se aplica a `household_photos`; con cambio se tocan 4 implementaciones y sus suites.
- Acción: especificar `countBytesOfOwner` como unión `pet_media` + `household_photos` de los hogares que posee, alineado con T578/T600.

### H-MERO-006-14 — ALTA — Migraciones: numeración, paridad y listas cerradas
- Causa: `data-model.md` §5 habla solo de «tras 0008 de Postgres». En disco SQLite llega a `0012_share_links.sql` y Postgres a `0008_share_links.sql`; las siguientes son SQLite 0013 y Postgres 0009. `schema-parity.spec.ts` fija `CANONICAL_TABLES` (23) y `CANONICAL_INDEXES` y lee cada migración Postgres por ruta explícita.
- Efecto: añadir 6 tablas e índices (incluidos únicos parciales) rompe la comparación hasta ampliar ambas listas y declarar la ruta nueva. Hay ciclo `home_scenes.current_image_id → scene_images` / `scene_images.scene_id → home_scenes`: en SQLite `STRICT` hay que fijar el orden de creación.
- Ruta: REQ-ESC6-003/018 → M-1 → `sqlite-migration-marker`, `postgres-pool`, `postgres-maintenance`, `schema-parity`, `t542-retencion-cero` (revisa SQL de migraciones; ninguna `deleted_at`).
- Acción: tarea de migración con paridad. La purga de `scene_attempts` a 30 días es regla nueva de mantenimiento (añade casos a `postgres-maintenance`); su valor aún no lo ratificó Neo.

### H-MERO-006-15 — ALTA — Ganchos de recálculo incompletos: transferencia e importación
- Causa: `plan.md` §1.2 lista ganchos en mascota, avatar, asignación, salida/expulsión, hogar y cuenta. Faltan dos flujos que cambian las entradas de la escena: (a) `ownership-use-cases.ts` (transferencia de propiedad): el consentimiento de la foto de referencia es del Propietario Legal (REQ-ESC6-024), así que cambiarlo altera la foto efectiva y las fuentes de la imagen; 005 resolvió el equivalente revocando enlaces en la misma transacción (`t798`); (b) `backup-use-cases.ts` importación: reemplaza mascotas y deja `avatar_object_id = NULL` (~línea 521) sin tocar `home_scenes`.
- Efecto: escena `ready` con imagen derivada de datos de quien ya no es propietario, sin purgar; contradice REQ-ESC6-025/030.
- Ruta: REQ-ESC6-024/029/030, INV-ESC6-014 → `ownership-use-cases`, `backup-use-cases` → `t591`, `t593`, `t795`, `t798` como modelo.
- Acción: añadir ambos flujos al plan §1.2 y a la matriz de pruebas.

### H-MERO-006-16 — ALTA — Ampliar repositorios y casos de uso rompe los arneses
- Causa: añadir `SceneRepository` y `SceneConsentRepository` al `UnitOfWork` y ganchos en 7 casos de uso obliga a implementar el puerto en memoria, SQLite, PostgreSQL y `pg-fake-client.ts`, y a cambiar `tests/fixtures/application-harness.ts` (`createDeps`), `record-engines`, `sqlite-harness`.
- Efecto: casi toda la suite de casos de uso e integración falla a la vez por tipos. `deleteWithMemberships` (hogar y cuenta) debe encolar objetos de escena antes del `DELETE` (data-model §6), con orden de candados propietario → mascota → hogar → escena.
- Acción: primera tarea de la cadena = puertos y arneses con implementación nula, verde (`npx tsc --noEmit` y suite) antes de cualquier lógica.

### H-MERO-006-17 — MEDIA — Roles D6-10: acción de hogar, no de mascota
- Causa: `RBAC_MATRIX` es `Record<PetAction, RbacRole[]>` con `PetAction = RbacAction | MediaRbacAction | ShareRbacAction`. `GENERATE_SCENE` y `READ_SCENE` del OpenAPI son texto libre en `x-sdd-rbac-action`, como las de medios.
- Efecto: si se añaden a `PetAction` hay que declararlas en la matriz y se afectan `rbac-export-permission`, `access-policy`, `roles.api`. Evaluarlas con el rol efectivo por mascota rompe D6-10 («propietario del hogar o `ADMIN`»): el alcance es el hogar y debe decidirse con el rol EN el hogar, como `CREATE_SHARE_LINK` de alcance `HOUSEHOLD` (precedente en `rbac.ts`).
- Ruta: REQ-ESC6-020, D6-10 → `rbac.ts`, `household-policies.ts` → `household-policies.spec`, `rbac-export-permission`. Los 9 permisos de `PetPermissions` (002 generado) no cambian si 006 no toca `RbacAction`.
- Acción: función propia de política de escena en `domain/` (por ejemplo `canGenerateScene`) sin ampliar `PetAction`.

### H-MERO-006-18 — ALTA — Plan §7 contradice Terraform real y 5 suites
- Causa: `plan.md` §7 dice «`budget_units` de 1 a 5 USD». En disco `budget_currency` = «COP» y `budget_units` = «4500» (`terraform-budget.spec.ts`). `terraform-root.spec.ts` exige exactamente 12 APIs en `services.tf` (+2 = 14); `terraform-cloud-run.spec.ts` exige `timeout = "60s"`; `terraform-iam*.spec.ts` comparan listas exactas de roles.
- Efecto: el plan parte de un dato falso (D6-12) y cada cambio previsto rompe su test. El timeout de 120 s afecta a todas las rutas (R-06-C).
- Ruta: NFR-ESC6-001, D6-12 → `budget.tf`, `services.tf`, `iam.tf`, `cloud_run.tf`, `cloud_tasks.tf` → `terraform-budget`, `terraform-root`, `terraform-cloud-run`, `terraform-iam`, `terraform-scheduler`, `terraform-hygiene`, `terraform-labels`.
- Acción: corregir §7 con la moneda real y decidir la cifra en COP; cada archivo Terraform = tarea Nivel 2 con su test actualizado en la misma tarea.

### H-MERO-006-19 — MEDIA — Segunda identidad OIDC para el worker
- Causa: `app-config.ts` (~líneas 173-174) define un único `ARGOS_SCHEDULER_EMAIL` y un único `ARGOS_OIDC_AUDIENCE`; `oidc-verify.ts` valida `iss`, `aud`, `email_verified`. El plan exige que `/internal/scene-worker` acepte solo `argos-scene-tasks` y rechace al Scheduler, y viceversa.
- Efecto: hay que parametrizar la verificación por ruta y añadir una variable de correo del worker; la constitución limita `jose` a `/internal/maintenance` (ya reconocido en plan §6.4, Nivel 2).
- Ruta: NFR-ESC6-002 → `oidc-verify.ts`, `server.ts` → `oidc-verify.spec`, `maintenance-route.spec`, `ops-surface.security`, `ops-surface-production.security`, `app-config.spec`; nueva suite del worker con prueba cruzada de identidades.
- Nota: las variables `ARGOS_SCENE_*` solo pueden leerse en `app-config.ts` (regla Semgrep `argos-no-process-env`).

### H-MERO-006-20 — ALTA — Compuertas: 006 no existe para los scripts
- `compile-contracts.sh`: `--feature 006` cae en «Feature desconocida» (exit 2); el `case` admite 001..005. Hace falta una rama como la de 005: fusionar catálogos 004+005+006 (los 12 heredados están en 004 y ninguno en el de 005; la rama de 005 verifica herencia solo contra 004, la de 006 debe verificar contra la unión y fallar ante duplicados), compilar a `src/generated/v34/` y normalizar los `$ref` relativos a esquemas de 004. La lista de directorios ajenos `ops catalogs v31 v33` aparece 3 veces (compilación de 001/002 y guardas de 004/005): sin añadir `v34`, compilar 001 o 002 borraría lo generado de 006.
- `verify-traceability.sh`: acepta `--feature 006` por forma pero sale con 2 por «Fuente ausente» (no hay `tasks.md`). Tiene ramas FEAT4/FEAT5 con listas `OWNED_*`; los IDs `REQ-ESC6`, `INV-ESC6`, `NFR-ESC6`, `SC-ESC6`, `EDGE-ESC6` y `STATE-SCENE` no figuran. Sin rama FEAT6, los IDs ajenos que cita la spec (REQ-ARC-001, INV-ACC2-001, REQ-HOUSE2-002, INV-ARC-003, REQ-GCS-006) se exigirían como propios; hay que replicar o relajar la regla de 005 con decisión explícita.
- `package.json` `test:gate` compila solo 002 y 003; `.github/workflows/test-gate.yml` usa `FEATURE` por defecto `003`. Plan §7 lo prevé pero sin tarea ni test.
- Tests: `verify-gates.spec.ts`, `t796-compuerta-005.spec.ts` (patrón), `codegen-drift.spec.ts`. La evidencia de código bloqueante hace que 006 falle hasta implementar, por diseño.
- Acción: tarea inicial de compuertas antes de cualquier código, con prueba `t8xx-compuerta-006`. Todo cambio en `scripts/` y workflows es Nivel 2 (plan §7).

### H-MERO-006-21 — BAJA — Pureza de capas: se sostiene; dos precisiones
- Verificado: `layer-dependencies.spec.ts` recorre `src/domain` y `src/application` recursivamente y solo permite `domain|generated` y `application|domain|generated`; `src/domain/scene/` queda dentro y no requiere autorización de carpeta (confirma lo que el plan pidió comprobar). El 4.º test fija el conjunto exacto de destinos de infraestructura; el `fetch` global no es import y no lo altera.
- Precisión 1: plan §4 dice «prueba existente ampliada a `src/domain/scene`»; no hay nada que ampliar para capas. Lo nuevo es la prueba de entropía y reloj sobre `scene` (SC-ESC6-023) y que el dominio importe tipos generados por la barrel `src/generated/index.ts`: hay que exportar v34 o `domain/scene` no puede importar el tipo de `scene-payload`.
- Precisión 2: `AbortSignal.timeout`, `setImmediate` y temporizadores deben vivir en `infrastructure` (INV-ARCH-001/002, regla `argos-no-entropy-outside-adapters`); `runSceneGeneration` en `application` recibe la señal por puerto.

### H-MERO-006-22 — BAJA — PN-06 de 005, diferida a 006, no tiene dueño
- Causa: `specs/005*/contracts/README.md` (línea 54 y notas de decisiones): rotación de la clave HMAC de IP e `ip_key_version` diferidas a 006 (PN-06). `grep PN-06|ip_key_version` en `specs/006-*` da cero.
- Efecto: compromiso de 005 huérfano; ningún REQ, SC ni tarea de 006 lo cubrirá. Decisión de Neo: asignarlo a 006 o a una feature futura.

### H-MERO-006-23 — BAJA — Respaldo: sin cambio de sobre; documentación comprobada por test
- Verificado: el sobre vigente es 3.1.0 (`backup-migration.ts`); 006 no lo cambia y los avatares sí viajan (`backup-use-cases.ts:384`), por lo que D6-13 es coherente con el disco. REQ-ESC6-022 exige que la documentación y la ayuda declaren que la foto del hogar y las escenas no viajan.
- Efecto: `backup-restore-runbook-docs.spec.ts` y `backup-runbook-hardening.spec.ts` comparan texto del runbook; ampliarlo exige actualizar esas pruebas. Añadir en `backup-31-roundtrip` una aserción de que no aparecen tablas de escena.

### H-MERO-006-24 — BAJA — Catálogo de errores y máquinas existentes: sin colisión
- Verificado: ningún `ERR-SCENE-*`, `ESC6` ni `STATE-SCENE` aparece en `src/`, `tests/`, `scripts/`, `.github/` ni en specs 001..005. Las máquinas existentes (membresía de hogar, cuenta, alertas, importación, sesión, enlace) no se editan; 006 solo reacciona a ellas por ganchos (006-15/16). Cuatro códigos con `surface = SCENE_STATE` viajan en `SceneView.lastError`, no como respuesta HTTP: el mapeador HTTP no debe traducirlos y la suite de errores de 006 debe distinguir ambas superficies.

## 4. Suites existentes que se romperían (resumen)

- Por ampliar puertos y arneses (006-16): `tests/fixtures/application-harness.ts`, `in-memory-unit-of-work`, `sqlite-harness`, `pg-fake-client` y, por arrastre, las suites de casos de uso de mascota, hogar, cuenta, avatar, asignación y propiedad.
- Por contenido: `schema-parity.spec.ts` (006-14); `contracts-004-schemas`, `codegen-drift`, `audit-log-adapter` (006-11); `t570`, `t579`, `t606`, `t571` (006-12); `t578`, `t600` (006-13); `terraform-budget`, `terraform-root`, `terraform-cloud-run`, `terraform-iam` (006-18); `oidc-verify`, `maintenance-route`, `ops-surface*` (006-19); `backup-restore-runbook-docs` (006-23).
- No se rompen: `layer-dependencies.spec.ts`, `openapi-conformance.spec.ts`, lo generado v31 y v33, las máquinas existentes ni los 9 `PetPermissions`.

## 5. Suites a añadir

1. Compuerta de 006 (`t8xx-compuerta-006`, patrón `t796`) y compilación fusionada 004+005+006 con prueba de duplicados y herencia.
2. Paridad SQLite/Postgres de las 6 tablas (ampliar `schema-parity`) y contrato de repositorios de escena y consentimiento.
3. Conformidad OpenAPI 006 (13 ops, 202 en ≤ 1 s, 404 sin revelar INV-ESC6-007) y worker con identidad cruzada.
4. Máquina `STATE-SCENE-001` (8 transiciones, cerrada) y `recomputeSceneStatus` idempotente.
5. Pureza: entropía y reloj en `domain/scene` (SC-ESC6-023), único adaptador activo = simulado (SC-ESC6-050), sin dependencia npm nueva.
6. Privacidad y borrado: cascada de hogar y cuenta, retiro de consentimiento, desasignación, transferencia e importación con escena (006-15), generación en vuelo con `INTENT` (EDGE-ESC6-021).
7. Concurrencia: compare-and-set, arrendamiento vencido y reinicio mensual de cuota (SC-ESC6-057).
8. Configuración `ARGOS_SCENE_*` con rangos (SC-ESC6-034) y producción rechaza el simulado.

## 6. Orden recomendado (dependencias causales)

1. Compuertas (compile y traceability para 006, `v34` en listas ajenas).
2. Decisiones Nivel 2: eventos de auditoría (006-11), claves de medios (006-12), cifra en COP y Terraform (006-18), `jose` en segunda ruta (006-19).
3. Puertos y arneses con implementación nula (006-16); migraciones con paridad (006-14).
4. Dominio puro, casos de uso con simulado, rutas, interfaz.
5. Terraform y adaptador real solo tras `REQ-ESC6-028` y la enmienda del Principio VI.

FROM: Merovingian / TO: Morpheus / STATUS: Validation Required
