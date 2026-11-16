# Gate /rama — Feature 003 (Argos en la nube): ciclo de vida de datos y privacidad

**Fecha**: 2026-11-15 · **Autor**: /rama (Rama Kandra) · **Estado**: informe `DRAFT`; no aprueba ni bloquea nada. Sin ediciones de specs ni código, sin commit ni push.
**Objeto**: `specs/003-cloud-gcp/{spec,plan,tasks,data-model,research,quickstart}.md` tras las pasadas de `/lock` y `/mifune`. Contraste con `specs/002-plataforma-v21/plan.md` L99 (ADR-002-13, R4), REQ-AUD-001, REQ-BACKUP2-001/002, SC-014 y `src/infrastructure/http/server.ts` L30.
**No repite**: H-LOCK-009 (quién vacía; ya resuelto por REQ-PG-015), H-LOCK-011 (ramas `pre-<sha>`), H-LOCK-023 (restauración), H-MIF-007/011. Los retoma solo cuando la spec actual no los cierra.

## 1. Veredicto D-06 (borrado físico)

**ACEPTABLE CON CONDICIONES.** D-06 = A (Neo, 2026-11-15) se sostiene como decisión: con ≤ 3 usuarios y datos de mascotas el riesgo residual es bajo. No se sostiene el **texto** que la respalda. ADR-002-13 exige que, tras una eliminación o importación, los datos no queden recuperables del medio de la base: `secure_delete` más checkpoint con truncado, inmediatos. El equivalente en nube no lo reproduce, y la spec describe una ventana más corta que la real (H-RAMA-001, 002).

**PENDIENTE — Neo (ratificación, Nivel 2).** Recomendación de /rama: mantener A, pero ratificar una ventana redactada con honestidad y las condiciones C1..C6. Sin ratificar, `plan.md` ADR-003-09 y R-02 prometen algo que el diseño no cumple.

| Condición | Contenido | Hallazgo |
|---|---|---|
| C1 | Reescribir ADR-003-09, R-02 y REQ-PG-011: la ventana es `max(PITR 6 h, próximo VACUUM ≤ 7 d, vida de dumps 7 d)`; retirar «dentro de la ventana PITR» y «dumps sin cuentas eliminadas nuevas». Prometer inaccesibilidad lógica inmediata y purga física acotada, no borrado físico | 001 |
| C2 | `soft_delete_policy { retention_duration_seconds = 0 }` en el bucket de dumps y en el de estado | 002 |
| C3 | Un disparo de `vacuum-argos.yml` (`workflow_dispatch`) documentado tras cada eliminación de cuenta o importación, además del cron semanal; valorar `VACUUM (FULL)` en tablas pequeñas con `lock_timeout` | 001, 009 |
| C4 | Dumps: cadencia definida, flujo en memoria sin archivo local, retención ≤ 7 d | 008, 014 |
| C5 | Procedimiento de restauración con reaplicación de lápidas y revocación de sesiones | 004 |
| C6 | Redacción de logs verificada (prueba) y matriz de retención por tipo de dato | 003, 010 |

## 2. Conteo por severidad

6 altos, 5 medios, 3 bajos: **14 hallazgos** (H-RAMA-001..014).

## 3. Hallazgos altos

### H-RAMA-001 (alto) — La ventana de borrado real no es «≤ 6 h» y `VACUUM` no sobrescribe
- **Ref**: plan.md ADR-003-09 («ventana de borrado físico de 1 a 7 días tras la purga, dentro de la ventana PITR»), spec.md REQ-PG-011 («`VACUUM` diferido tras una eliminación de cuenta o importación») frente a REQ-PG-015 (cron **semanal**), research.md R-02 y H-03-07, spec.md D-06, tasks.md T452/T473.
- **Escenario**: una usuaria elimina su cuenta el lunes (`DELETE` en cascada, inmediato). (a) REQ-PG-011 promete `VACUUM` «tras» la eliminación, pero T473 solo lo programa cada semana; nada lo dispara por eliminación ni importación. (b) `VACUUM` simple marca espacio reutilizable pero no sobrescribe los bytes; las páginas de heap, de TOAST/JSONB y las hojas de índice (`email`, `microchip_id`) conservan el contenido hasta que se reutilicen. Es mejor que nada, no equivale a `secure_delete`. (c) El WAL y la historia de Neon cubren 6 h; un dump de GCS tomado el domingo conserva a la usuaria hasta 7 d. Las frases «1 a 7 días» y «dentro de PITR» se contradicen: 7 d no cabe en 6 h. (d) R-02 afirma «dumps sin cuentas eliminadas nuevas»: ningún REQ/T lo impone.
- **Corrección**: C1 y C3. Redactar la ventana como el máximo de las tres fuentes. Añadir al runbook de eliminación un `workflow_dispatch` de VACUUM. Para tablas de ≤ 3 usuarios, `VACUUM (FULL)` reescribe tabla e índices y elimina las copias muertas; hace falta `lock_timeout` corto, ya que toma `ACCESS EXCLUSIVE` unos milisegundos. Es una elección de `/architect`, no de /rama.

### H-RAMA-002 (alto) — Soft delete de GCS: los dumps «de 7 días» viven hasta ~14 d
- **Ref**: spec.md REQ-IAC-008 y SC-CLD-008 (borrar `dumps/` a los 7 d), REQ-SEC-006 (estado: no vigentes a 30 d), plan.md L74, tasks.md T441, T444.
- **Escenario**: desde 2024 los buckets nuevos de GCS traen **soft delete de 7 días por defecto** **[verificar contra la documentación vigente en T402]**. La regla de ciclo de vida borra el objeto al día 7; queda recuperable 7 d más y no cuenta como «borrado» para quien lee el bucket con permiso de restauración. SC-CLD-008 («se elimina a los 7 días») pasa en la prueba y la promesa a la usuaria falla: un dump con datos de una cuenta eliminada sigue en el proyecto hasta ~14 d. Igual con el estado de Terraform (30 d + 7 d), que contiene `DATABASE_URL` y el HMAC.
- **Corrección**: C2. Declarar `soft_delete_policy { retention_duration_seconds = 0 }` en `buckets.tf` y en el bucket de estado (T441, T444), y que SC-CLD-008 verifique `softDeletePolicy` con `gcloud storage buckets describe`.

### H-RAMA-003 (alto) — Los logs de la app y de Cloud Run no cumplen «sin identificadores de personas»
- **Ref**: spec.md REQ-CLD-008, SC-CLD-004, T415; `src/infrastructure/http/server.ts` L30 (`redact` solo `req.headers.cookie` y `set-cookie`); plan.md (sin sección de logs).
- **Escenarios**:
  1. El serializador por defecto de Fastify/pino registra `req.url`, `req.hostname`, `remoteAddress` y `remotePort`. La URL lleva UUID de mascota y de hogar (`/pets/<uuid>/...`) y cualquier *query*; `remoteAddress` es una IP personal. REQ-CLD-008 dice «sin identificadores de personas (redacción existente + nuevas rutas)», pero la redacción existente cubre solo cookies. T415 solo menciona `DATABASE_URL`.
  2. Los errores de `pg` traen `detail` con valores: una violación de unicidad en `pets_owner_microchip` imprime `Key (owner_user_id, microchip_id)=(<uuid>, <15 dígitos>) already exists`. El serializador de errores de pino incluye propiedades extra, y ese texto llega a Cloud Logging con el microchip de la mascota y el ID del dueño. Igual con violaciones de `CHECK` y de FK.
  3. Los errores de validación de Ajv en la importación pueden incluir valores del archivo (nombres, diagnósticos).
  4. Cloud Run escribe por sí mismo su registro de petición (`run.googleapis.com/requests`: IP remota, URL, *user-agent*), fuera del control de la app. La spec no lo menciona.
  5. SC-CLD-004 busca «secretos», no PII: pasa con todo lo anterior presente.
- **Corrección**: C6. (a) `serializers.req` propio que solo emita `method`, ruta **con plantilla** (`routerPath`/`routeOptions.url`, sin valores de parámetros) y sin `remoteAddress`; (b) `serializers.err` que elimine `detail`, `where`, `parameters` y `hint` de errores `pg`, y registre solo `code` (SQLSTATE) y nombre de restricción; (c) prueba de integración: provocar violación de microchip duplicado y 404 con UUID, y afirmar que stdout no contiene el UUID, el microchip ni la IP; (d) documentar el registro de petición de Cloud Run y su retención (ver H-RAMA-010). Cambio solo en `infrastructure/http` (NFR-CLD-009 intacto).

### H-RAMA-004 (alto) — Restaurar (PITR, rama de Neon o dump) resucita cuentas eliminadas y sesiones; la spec no lo dice
- **Ref**: spec.md US5, SC-CLD-008, REQ-PG-011, REQ-AUD-001 heredado; tasks.md T454; plan.md ADR-003-09; gate-lock-003 H-LOCK-023 (no incorporado a la spec).
- **Escenario**: martes: la usuaria U elimina su cuenta; el miércoles un error de migración obliga a restaurar desde el dump del lunes (o el PITR de las últimas 6 h se aplica a un punto anterior). U, su correo, el hash de contraseña, sus mascotas y su historial clínico vuelven, y también sus sesiones, que siguen válidas. Neon, además, deja una rama de respaldo con el estado previo a la restauración. La auditoría no ayuda: `ACCOUNT_DELETE` guarda solo el HMAC del ID, y esa fila vive en la base que se acaba de reemplazar. Hoy la spec no dice nada de esto; R-02 acepta la ventana pero no la resurrección.
- **RPO/RTO reales**: pérdida del proyecto Neon o de la cuenta = RPO igual al último dump **manual** (T454; sin cadencia, no está acotado) y RTO sin definir ni probar. PITR da RPO ≈ 0 solo ante error lógico dentro de 6 h, y es una restauración sobre el mismo proyecto.
- **Corrección**: C5. Añadir a T454 y al quickstart un procedimiento: (1) antes de restaurar, exportar de la base viva las filas `ACCOUNT_DELETE` (`entityId` = HMAC); (2) restaurar; (3) calcular `HMAC(ARGOS_AUDIT_HMAC_SECRET, user.id)` de cada usuario restaurado y eliminar a los coincidentes (cascada); (4) revocar todas las sesiones restauradas; (5) eliminar la rama de respaldo de Neon; (6) registrar el RPO/RTO efectivos. Exige el mismo secreto HMAC (rotarlo rompe el paso 3, ver H-RAMA-010). Fijar una prueba de restauración en T454 con RTO medido y objetivos escritos en NFR-CLD (propuesta: RPO ≤ 7 d por dump programado; RTO ≤ 2 h).

### H-RAMA-005 (alto) — «Sin pérdida» en la carga SQLite → Postgres es falso con el respaldo v3
- **Ref**: spec.md US2 AC3, REQ-PG-007, T430; spec 002 REQ-BACKUP2-001/002, REQ-MIG-001, ADR-002-02 (migración 001→002).
- **Escenario**: REQ-PG-007 promete trasladar «una base SQLite con datos de la 002 … sin pérdida» mediante `exportBackup`/`importBackup`. REQ-BACKUP2-001 define el respaldo como **por cuenta**: solo mascotas propias y sus 6 colecciones; «nunca … datos de otros usuarios, hogares, asignaciones, sesiones ni credenciales». La importación (REQ-BACKUP2-002) sustituye los datos del **usuario autenticado**, reescribe `ownerUserId` y deja las mascotas sin asignaciones. Consecuencias al migrar a Postgres: (1) cada usuario debe registrarse de nuevo y hacer su propia importación; (2) se pierden hogares, membresías, roles, asignaciones, invitaciones y la tabla `audit_log` completa (la cadena de auditoría y las filas `ACCOUNT_DELETE` de la 002 desaparecen, lo que además agrava H-RAMA-004); (3) las mascotas de un co-cuidador compartido pierden su visibilidad; (4) la 002 y la 003 coinciden en no migrar credenciales, de modo que es una decisión implícita de descartar datos, no de conservarlos. Con 1-3 usuarios es asumible, pero la spec dice lo contrario y T430 solo prueba un caso feliz de un usuario.
- **Corrección**: reescribir REQ-PG-007/US2 AC3: «conserva las mascotas y los 6 registros por cuenta; **descarta** credenciales, hogares, asignaciones, sesiones y auditoría, que se recrean»; T430 con dos usuarios y un hogar compartido que verifique exactamente qué se pierde. Si Neo necesita conservar hogares o auditoría, requiere un exportador de base completa (feature nueva, decisión de Nivel 2). Nota de privacidad: el respaldo v3 es un archivo con datos de salud en claro; el usuario lo conserva en su equipo, fuera del alcance de la nube (ver H-RAMA-014).

### H-RAMA-006 (alto) — El «plan guardado» de Terraform puede exponer los secretos fuera de Secret Manager
- **Ref**: spec.md REQ-CICD-002 («`plan` guardado», comentario de PR, `apply` del plan), REQ-SEC-001, REQ-CICD-008, REQ-IAC-005; tasks.md T446. No cubierto por H-LOCK-007/019 ni H-MIF-009.
- **Escenario**: un archivo `tfplan` binario guarda los valores `sensitive` (`TF_VAR_database_url`, HMAC) en claro. Para aplicarlo en otro trabajo hay que subirlo como artefacto de GitHub Actions, que se conserva 90 días por defecto y es descargable por cualquiera con lectura del repositorio (cualquier persona, si es público). `::add-mask::` no protege un archivo. El comentario de PR (`terraform show`) también puede exponer valores si algún atributo no está marcado `sensitive`. REQ-SEC-001 afirma que los secretos «solo existen» en GitHub Secrets, Secret Manager y memoria.
- **Corrección**: no subir `tfplan` como artefacto: planificar y aplicar en el mismo trabajo (la opción más simple, alineada con H-MIF-009), o cifrar el plan y fijar `retention-days: 1`. Añadir prueba: `grep` de los valores del secreto de prueba en comentario y artefactos (extender SC-CLD-004 a «artefactos de CI»). Marcar `sensitive = true` en `variables.tf` y `outputs.tf`.

## 4. Hallazgos medios

### H-RAMA-007 (medio) — Ramas Neon `pre-<sha>`: copia de datos «borrados» sin vida útil
- **Ref**: REQ-CICD-005, plan.md ADR-003-05 y L170, D-19 (PENDIENTE), research.md L41; H-LOCK-011.
- **Escenario**: si Neo rechaza el recorte de D-19, cada despliegue crea una rama con copia íntegra de los datos, sin plazo de borrado en la spec: una cuenta eliminada sobrevive semanas, fuera de la ventana de C1.
- **Corrección**: desde la perspectiva de privacidad, la recomendación es **recortar (D-19 = sí)**, de acuerdo con `/mifune`. Si se conserva, borrar ramas a las 24 h y contarlas en la ventana de C1.

### H-RAMA-008 (medio) — Dumps: contenido, cadencia, acceso y copia local
- **Ref**: T454, REQ-IAC-008, REQ-IAC-006, plan.md L23 («Neo `pg_dump` manual»), US5.
- **Escenario**: el `pg_dump` completo contiene correos, hashes scrypt, tokens de sesión (o sus hashes), invitaciones y todos los datos clínicos. «Sin cifrado propio» es defendible (cifrado en reposo del bucket), pero no se dice quién lee (IAM del proyecto: propietarios y editores; ninguna cuenta de Argos tiene rol sobre el bucket, bien), ni se prohíbe el archivo local intermedio: `pg_dump > archivo; gsutil cp` deja el volcado sin ciclo de vida en el portátil de Neo. Sin cadencia, el RPO no existe (H-RAMA-004).
- **Corrección**: C4: instrucción literal `pg_dump ... | gcloud storage cp - gs://.../dumps/<fecha>.sql`; sin archivo local; cadencia mínima semanal (si se automatiza, en GitHub Actions con cron y no con Scheduler, cupo de 1 job; solo si Neo lo aprueba por tamaño); nombre de objeto sin datos personales; IAM de lectura limitado a Neo.

### H-RAMA-009 (medio) — `vacuum-argos.yml` semanal: fallos silenciosos y evidencia insuficiente
- **Ref**: REQ-PG-015, T473, SC-CLD-019, H-MIF-011.
- **Escenario**: (a) GitHub deshabilita los flujos con `schedule` tras 60 días sin actividad del repositorio; el VACUUM deja de correr sin aviso, y nadie ve que el «borrado físico» dejó de ocurrir. (b) El fallo se notifica por correo al último editor del cron, no a Neo necesariamente. (c) `last_vacuum` y `n_dead_tup` demuestran que hubo VACUUM, no que los bytes de una cuenta concreta hayan desaparecido; SC-CLD-019 es una evidencia de proceso, no de efecto. (d) Si Neon es PG < 17 y el rol propietario no existe aún, T455 lo detecta tarde (Fase 8).
- **Corrección**: el flujo también falla si `last_vacuum` tiene más de 10 días (lo comprueba el siguiente despliegue o `/readyz` interno, sin exponer datos); recordatorio documentado cada 50 días para reactivar el cron; SC-CLD-019 añade una prueba de integración: insertar usuario con correo centinela, eliminarlo, `VACUUM (FULL)` y comprobar con `pg_relation_size` y `pageinspect` (solo en pruebas) que el centinela no aparece.

### H-RAMA-010 (medio) — Falta una matriz de retención por tipo de dato; los logs no tienen plazo
- **Ref**: spec.md REQ-CLD-005 (`ARGOS_AUDIT_RETENTION_DAYS=730`), REQ-CLD-008, REQ-SEC-006/008, REQ-IAC-008; research.md L17 (50 GiB), D-06.
- **Escenario**: la spec fija plazos sueltos y calla el resto. Ejemplo: el *bucket* `_Default` de Cloud Logging retiene 30 d por defecto **[verificar]** y `_Required` (auditoría de administración) 400 d; ninguna tarea los configura ni los declara. Una regla de «derecho al olvido» necesita saber cuánto vive cada copia.
- **Corrección**: añadir a `spec.md` o `data-model.md` §6 la tabla siguiente (valores propuestos entre paréntesis donde la spec calla):

| Dato | Lugar | Vida | Fuente |
|---|---|---|---|
| Cuenta, mascotas, registros clínicos | Neon | hasta eliminación; físico ≤ 7 d (C1) | REQ-PG-011 |
| Historia de Neon | Neon PITR | ≤ 6 h | research.md |
| Sesiones expiradas, tokens, invitaciones terminales | Neon | 7 d / 7 d / 90 d | ADR-002-14 |
| Auditoría (HMAC) | Neon | 730 d; HMAC rotado = no correlaciona | REQ-AUD-001 |
| Dumps lógicos | GCS `dumps/` | 7 d (con soft delete en 0 s; sin él ~14 d) | REQ-IAC-008 |
| Estado de Terraform no vigente | GCS | 30 d (con soft delete en 0 s) | REQ-SEC-006 |
| Logs de aplicación y petición | Cloud Logging `_Default` | (30 d, fijar explícito) | por definir |
| Registros de auditoría de administración | `_Required` | 400 d (fijo de Google) | por definir |
| Registros de GitHub Actions y artefactos | GitHub | (≤ 30 d; artefactos 1 d) | por definir |
| Ramas Neon de respaldo/migración | Neon | (≤ 24 h o recortadas) | D-19 |

### H-RAMA-011 (medio) — Ubicación y transferencia internacional de datos personales sin declarar
- **Ref**: D-02 (Neon `aws-us-east-2`, Cloud Run `us-central1`), spec.md APP_TIMEZONE `America/Bogota`, research.md R-xx de regiones.
- **Escenario**: correo, nombre y datos de salud de las mascotas de usuarios colombianos se tratan y almacenan en EE. UU., con proveedores distintos (GCP, AWS/Neon). La spec no menciona aviso de privacidad, finalidad ni encargados del tratamiento (Ley 1581 de 2012 y normativa de transferencia internacional **[verificar con asesoría jurídica]**). Con 3 usuarios conocidos el riesgo es bajo; si la audiencia crece, no.
- **Corrección**: una nota en la spec (Supuestos): usuarios conocidos y consentimiento directo de Neo; lista de encargados (Google, Neon, GitHub); revisar si se abre a terceros.

## 5. Hallazgos bajos

- **H-RAMA-012 (bajo)** — REQ-SEC-006/R-06 y REQ-CICD-008. El estado de Terraform y los registros de GitHub Actions (90 d por defecto) pueden conservar valores de secretos y conteos de purga. R-06 acepta lo primero; falta fijar `retention-days` de los registros de CI y confirmar que `vacuum`/`migrate` imprimen solo conteos. Con H-RAMA-002 la vida real del estado es 37 d. Corrección: fijar 30 d en la configuración del repositorio y el cero de soft delete.
- **H-RAMA-013 (bajo)** — spec.md L179: «las métricas se consumen en el portal web de Argos». No define qué métricas ni quién las ve. Sin REQ, nada impide mostrar correos o conteos por usuario. Corrección: un REQ que limite el portal a agregados sin identificadores, o excluirlo del alcance de la 003 hasta que exista.
- **H-RAMA-014 (bajo)** — Copias fuera de la nube. (a) El archivo SQLite local de la 002 sigue en el equipo de Neo con `secure_delete` solo para lo borrado en el pasado; tras el traslado hay dos copias de los datos. (b) Los respaldos v3 descargados quedan en discos de usuarios. Corrección: paso en quickstart «tras verificar T430, borrar de forma segura el `.db`, `-wal` y `-shm` locales» y una línea de aviso en la UI de respaldo (ya existente en la 002; no se modifica).

## 6. Cobertura de la solicitud

| Punto | Resultado |
|---|---|
| 1. Borrado físico D-06, H-LOCK-009, T452 | ACEPTABLE CON CONDICIONES; H-RAMA-001, 002, 009. REQ-PG-015 resuelve quién vacía; falta cuándo, evidencia de efecto y la ventana real |
| 2. PII en logs, dumps, ramas, portal | H-RAMA-003, 007, 008, 013 |
| 3. Retención | H-RAMA-002, 010, 012; dumps y estado no coinciden con lo que la spec promete (soft delete) |
| 4. Restauración | H-RAMA-004 (RPO/RTO reales; resurrección no dicha en la spec) |
| 5. Migración desde SQLite | H-RAMA-005 (descarta datos; spec dice «sin pérdida»), H-RAMA-014 |

## 7. Qué está bien (no tocar)

Rol propietario `argos_migrator` para `VACUUM` (REQ-PG-015) y `argos_app` sin DDL; bucket con `public_access_prevention=enforced`, versionado desactivado y sin rol de `argos-run@`; HMAC del ID de cuenta eliminada y secreto fuera de la base y de los dumps (REQ-AUD-001); retención de auditoría de 730 d; el modelo lógico y el adaptador sin cambios en `domain/` y `application/` (NFR-CLD-009).
