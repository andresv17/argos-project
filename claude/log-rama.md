# Bitácora Incremental — Rama (`/rama` — Privacidad, Habeas Data y Respaldos Atómicos)

> Regla Write-Ahead Log: cada micro-hito se registra aquí y en `claude/registro-proceso-argos.md` antes de responder.

## `[2026-11-10 | F4: insumo de privacidad y atomicidad, Feature 002]`
- Checkpoint: entregado `.specify/memory/audits/f4-insumo-rama-privacidad.md` (datos por entidad, secuencia de eliminación A1-A4 y B1-B11, atomicidad de importación, 11 riesgos R-01..R-11, 7 decisiones D-1..D-7).
- Todo lo fuera de la spec 002 va marcado PROPUESTA. Fase B de la eliminación es 100 % atómica; los pasos no atómicos (NA-1..NA-6) son externos y tienen compensación.
- Solo documentación; sin edición de specs, contratos, src, tests, tasks ni constitución; sin commit ni push; nada marcado COMPLETED.

## 2026-11-11 · T224 verificación de privacidad (rebanada 1) · checkpoint
- credentials.security.spec.ts (11) y log-redaction.security.spec.ts (3): 14/14 pasan; buscan correo, contraseñas, token, cookie, hash, userId y username en logs, respuestas y volcado de la base.
- Mutation check: hook temporal en src/infrastructure/http/app.ts que registraba el cuerpo de la petición; las 3 pruebas de log-redaction fallaron; archivo restaurado (shasum OK, git diff vacío en src/). Primer intento con Buffer sin convertir no filtraba texto y no valía como mutante.
- Pendiente de cobertura: displayName en logs sin aserción; correo ausente en respuestas de export/hogar sin aserción. T224 no marcada (techo REVIEW); informe rebanada-1-rama.md sin escribir por restricción.

## 2026-11-11 · T224 informe · checkpoint (inicio)
- Escribo .specify/memory/audits/rebanada-1-rama.md con la evidencia ya registrada arriba.
- Solo ese archivo; sin tocar src/tests/tasks; T224 no se marca.

## 2026-11-11 · T224 informe · checkpoint (fin)
- Entregado .specify/memory/audits/rebanada-1-rama.md (5 secciones, 4 brechas B1-B4 hacia T225).
- T224 no marcada; sin commit ni push.

## 2026-11-13 · T269 revisión de la rebanada 4 · checkpoint (inicio)
- Revisión de privacidad de T265-T267 en HEAD 14a9b3d: ACCOUNT_DELETE con HMAC, pseudonymizeUser, secure_delete + checkpoint WAL, purga ADR-002-14, fila MIGRATION.
- Solo se escribe .specify/memory/audits/rebanada-4-rama.md; sin tocar src/tests/tasks/logos; T269 no se marca; sin commit ni push.

## 2026-11-13 · T269 · checkpoint (fin)
- Pruebas del alcance: 6 archivos, 68/68 pasan (incluye log-redaction 3/3). Prueba física propia (script en scratchpad): userId 20 apariciones en db tras commit, 0 tras wal_checkpoint(TRUNCATE).
- Hallazgos: H-1 baja (ARGOS_AUDIT_RETENTION_DAYS configurada pero ignorada: purga fija en 24 meses); D-1 y D-2 decisiones para Neo (clave de desarrollo fija si NODE_ENV != production; secure_delete/UPDATE sin prueba de bytes en la suite). Fuera de alcance: 4 pruebas rojas en sqlite-backup-import.spec.ts (US7).
- Informe entregado: .specify/memory/audits/rebanada-4-rama.md.

## 2026-11-13 · T281 auditoría de exportación/respaldo (Rebanada 5) · checkpoint (inicio)
- Auditoría de privacidad HEAD 304ed41: exportación sin datos ajenos, token solo en cabecera/hash, vista previa genérica, auditoría sin PII. Solo se escribe .specify/memory/audits/rebanada-5-rama.md; sin tocar src/tests/tasks/logos; T281 no se marca; sin commit ni push.

## 2026-11-13 · T281 · checkpoint (fin)
- 4 archivos, 76/76 en verde. 0 logs en archivos de respaldo. Token solo cabecera y SHA-256 en base. Vista previa sin oráculo de IDs ajenos.
- H-1 baja: access-control.security.spec.ts:86-98 compara ownerUserId/exportedByUserId inexistentes (undefined=undefined, aserción vacua). O-1: 409 de importación confirma existencia de UUID ajeno (diseño de spec).
- Informe entregado: .specify/memory/audits/rebanada-5-rama.md; sin commit, push ni [x].

## 2026-11-15 · gate 003 · checkpoint (fin)
- Veredicto D-06: ACEPTABLE CON CONDICIONES (C1..C6); ventana real = max(PITR 6 h, VACUUM semanal, dumps 7 d) y soft delete de GCS la alarga a ~14 d. Ratificación de Neo PENDIENTE.
- 14 hallazgos (6 altos, 5 medios, 3 bajos): logs con url/IP/detail de pg, restauración que resucita cuentas, respaldo v3 que no trae hogares ni auditoría, tfplan con secretos.
- Informe: .specify/memory/audits/gate-rama-003.md; sin ediciones de specs ni commit.

## 2026-11-18 · spec 006 (escena hogar pixel art) · revisión de privacidad
- Revisados 7 puntos de la spec 006 DRAFT contra 002 (HOUSE2-002, ACC-002) y 004 (GCS-004, ARC-001, D-13, NFR-ALM-002).
- Veredicto: PASA CON CONDICIONES (C1..C11); hallazgos altos: consentimiento por dueño de datos, EXIF solo en cliente, términos del proveedor sin fijar, imagen persiste tras salida de miembro.
- Informe: .specify/memory/audits/rama-006-privacidad.md; sin ediciones de specs/src ni commit. Nuevas D6-16/D6-17 para Neo.

## 2026-11-19 · Fase 12 (feature 006) · auditoría de privacidad del reenvío de fotos KEEP · solo lectura
- Alcance: decide-mode.ts:91-98, scene-run-use-case.ts:94-139 y 266-336, scene-use-cases.ts:82-108, scene-consent-use-cases.ts (revoke), scene-payload.ts / scene-spec.ts (ids excluidos), scene-audit.ts, postgres-scene-repositories.ts:110, select-visible-pets.ts:27, gemini-api-wire.ts:16-19, app-config.ts:32, notice (scene-notice.ts:36, 96; notice.ts:15 `gemini-api-draft-1`). Spec: REQ-ESC6-024..028, INV-ESC6-010, INV-ESC6-017, D6-20, N2-16.
- Veredicto: sin bloqueante de código. Consentimiento y retiro se aplican en la carga de entradas, en el claim y en T2. Ids, nombres y biografía no llegan al proveedor. Logs sin foto ni prompt. Cota 1+N cumplida. Descarte de KEEP primero sin fuga (la KEEP descartada sale de `sent`).
- Hallazgo ALTO: minimización. INV-ESC6-010 sigue diciendo «necesarias»; la enmienda D6-20 lo reinterpreta sin texto propio. Cada incremental reenvía fotos de mascotas ya incorporadas (decide-mode.ts:96). Decisión de Nivel 2 de Neo.
- Hallazgo ALTO: aviso (REQ-ESC6-026). Scene-notice.ts:36 cubre «avatar de cada mascota si consentiste» pero no declara el reenvío en cada actualización. El aviso gemini-api (scene-notice.ts:96) pide «solo imágenes de prueba» mientras la prueba en vivo usa fotos reales. Cambiar texto exige bump de noticeVersion y reconsentimiento. Decisión de Nivel 2 de Neo.
- Hallazgo MEDIO: el consentimiento por foto depende de `svc.realDriver` (scene-use-cases.ts:98, scene-run-use-case.ts:323). Acoplamiento a un flag: si un generador real se compusiera con realDriver=false, las KEEP sin consentimiento se enviarían. Recomendar prueba de guarda.
- Nota: el tope inline 18 MiB (gemini-api-wire.ts:16-19) deja ~0,67 MiB de holgura sobre 13 MiB base64. El fallo por tope de cuerpo es cerrado (adapter:80) pero no respeta el orden KEEP-primero. Sin fuga.
- Nota: no verifiqué un test específico de KEEP sin consentimiento (t855:304..346 cubren consentimiento retirado en ADD/REPLACE genérico).
- Dependencia REQ-ESC6-028: la producción rechaza gemini-api (app-config.ts:32). Exposición ampliada solo local/privada. Vertex no activo hasta T885.
- No modifiqué nada fuera de este log. Entrada en bus delegada a Morpheus.

## 2026-11-19 · Fase 13 (feature 006, T943 adelantado) · auditoría de privacidad y ciclo de datos del botón único · solo lectura
- Alcance: scene-use-cases.ts:98,104,159-183,331; scene-run-use-case.ts:236,258,314,323,331,118,123-129; decide-mode.ts:91,96-97; gemini-api-wire.ts:19; scene-consent-use-cases.ts (revoke, cancelInFlight); scene-audit.ts:51; scene-notice.ts:36,96; app-config.ts:32; 0009_home_scenes.sql:69-72; diff sin commit de build-image-prompt, pet-phrases, SceneBlock, scene-view. Pruebas leídas: t855:536 y :545. Sin ejecución de pruebas.
- Consentimiento: PASS con condiciones. Foto de mascota solo si el dueño tiene PET_PHOTOS vigente (carga de entradas y claim/T2 por mascota). Revocación purga imagen y cancela en vuelo (t855:545). Hallazgos M1 (acoplamiento a realDriver) y M2 (sin prueba negativa KEEP/REGENERATE sin consentimiento).
- Minimización: ALTO. REGENERATE (decide-mode:91) envía foto del hogar y todas las fotos vigentes (hasta N+1). REQ-ESC6-007 ya lo autoriza, pero D-1 cubre solo KEEP y INV-ESC6-010 dice «necesarias». Decisión de Nivel 2 sin resolver.
- Costo: sin duplicados automáticos. Adaptador sin reintento interno (gemini-api-wire:4), claim CAS PENDING→RUNNING (run:236, redelivery = NOOP), Idempotency-Key nueva por clic (SceneBlock:185), cooldown 60 s y 12/24 h (REQ-034). MEDIO M3: un fallo cuesta 0 de cuota ARGOS pero sí llamada al proveedor. MEDIO M4: en REGENERATE el tope de 13 MiB descarta fotos no-KEEP, marca degraded (run:118,124-129) y el mismo set se reenvía en cada clic.
- Retención y logs: PASS. Sin console ni logger en los 4 archivos nuevos; audit (scene-audit:51) solo householdRef HMAC, modo, número y resultado. scene_image_sources guarda owner_user_id (PK scene_id+owner_user_id, 0009:69-72): ids de usuario por diseño (REQ-ESC6-022/030), no fotos ni ids de mascota ni claves. Nota.
- Proveedor (REQ-028): sin cambio de política. Producción rechaza gemini-api (app-config:32). ALTO A2: aviso scene-notice:96 dice «usa solo imágenes de prueba» mientras D-3 autoriza fotos reales en la repetición local; scene-notice:36 no declara el reenvío en cada regeneración. Cambiar texto exige bump de noticeVersion (D-2, antes de T885).
- Veredicto: sin bloqueante de código. Decisiones N2 pendientes: minimización (A1), aviso y noticeVersion (A2). Prueba negativa y guarda (M1, M2) recomendadas antes de T943.
- No modifiqué nada fuera de este log. Bus central delegado a Morpheus.

## 2026-11-19 · Fase 13 · T943 (parte privacidad) tras N2-18 · verificación de la enmienda y del botón único · solo lectura
- Alcance: decide-mode.ts:76,88-96; scene-use-cases.ts:92,98,104,314,323,331; scene-run-use-case.ts:94-99,107-129,202-203,204,267,314; app-config.ts:361; scene-composition.ts:71,83; t855:536-589 (M2 en :557-589); gemini-api-composicion:45-53; tasks.md:189-190; spec.md:631 (N2-18). Diff ea2c0f7 de presentation/domain sin console, localStorage ni persistencia nueva. Sin ejecución de pruebas.
- Consentimiento: PASS. Foto de mascota solo con PET_PHOTOS vigente de su dueño (snapshot :98, claim y T2 :323). Retiro en vuelo: T2 CANCELLED (run:202-203, t855:545). M2 cubre REGENERATE sin consentimiento (t855:563) y revocación entre regeneraciones (t855:575). Nota: el segundo título dice «foto KEEP» y el escenario es REGENERATE.
- Minimización (N2-18): PASS, coincide con la enmienda. REGENERATE: scratch=true (decide-mode:76), sin escena previa (run:88), sin KEEP (decide-mode:91), RENDER con foto (:95); foto del hogar solo con HOUSEHOLD_PHOTO (scene-use-cases:104,331); acotado por maxPets (:92) y por fit de bytes (run:123). Ninguna otra imagen viaja.
- Costo: PASS. Cuota +1 solo en T2 publicado (run:204, quota-window.ts:66-69); fallos y cancelaciones no descuentan. Adaptador sin reintento (gemini-api-wire:4). Sin duplicados: generating rechaza (scene-use-cases:365), cooldown 60 s (:371). Nota: el reintento de lectura de almacenamiento (run:107) no es de proveedor.
- Retención y logs: PASS. Auditoría sin ids de mascota ni fotos (scene-use-cases:393). Sin console ni logger en los archivos nuevos. Sin migración nueva en el diff.
- Proveedor (REQ-028): PASS. Producción rechaza gemini-api (app-config:361) y real (scene-composition:71). Sin cambio de política.
- M1: el candado (gemini-api-composicion:45-53) basta para el alcance actual; las dos compuertas de producción ya lo cubren. Guarda de producción recomendable antes de T885, no bloqueante.
- Deudas: DEUDA-006-AVISO-REGENERACION (tasks.md:189) y DEUDA-006-M4-TOPE-REGENERATE (tasks.md:190) registradas.
- Veredicto: sin bloqueante ni alto de código. T943 privacidad puede cerrarse; la marca COMPLETED es de Neo. Bus central no tocado (misión: solo log-rama.md).

## 2026-11-19 · Fase 13 · T943 (privacidad) revalidación al cierre · HEAD ea2c0f7 + cambios sin commit · solo lectura
- Alcance revisado: build-image-prompt.ts (frase del hogar y PIXEL_REDRAW_RULE :27-29, :38-40 contador :48-51 y :75), pet-phrases.ts (animalCountLine :31-38, petSpeciesLabel :28), scene-view.ts (cooldownStep :72-76, startCooldownCountdown :81-101, sceneGenerateState :177-198), SceneBlock.tsx (contador vía remaining/startCooldownCountdown), scene.schema.json 1.1.1 (solo descripciones, sin propiedades nuevas). Sin ejecución de pruebas.
- Cambios sin datos nuevos: el conteo usa solo `species` (enum o speciesOther ya saneado, INV-ESC6-011) y excluye REMOVE; la frase del hogar usa el `photoRef` opaco ya existente. Ningún campo nuevo viaja a la IA respecto a la revisión T943.
- Contador: grep sobre scene-view.ts, SceneBlock.tsx, build-image-prompt.ts y pet-phrases.ts sin hits de localStorage, sessionStorage, indexedDB, console, fetch ni logger. Solo timers vía scheduler inyectado y estado de React en memoria. No se revisó browser-scheduler.ts por separado.
- Backend (application/infrastructure y decide-mode, scene-use-cases, scene-run-use-case, app-config, scene-composition): sin diff vs HEAD. Consentimiento y minimización N2-18 se mantienen tal como en la revisión T943.
- INV-ESC6-010/017: PASS. Prosa del prompt sin id, nombre, biography ni fallbackContext; scene-spec.ts excluye household.id y pets[].id por construcción.
- REQ-ESC6-028: PASS, sin cambio de política (app-config y composición siguen rechazando gemini-api y real en producción). D-3 acotado a repetición local privada (REQ-ESC6-037).
- Arrastre (no nuevo): scene-notice.ts:96 dice «usa solo imágenes de prueba y no fotos con datos reales» para gemini-api, lo que contradice D-3. Diferido por Neo (D-2 «no ahora», N2-18 A2). Clasificado alto, no bloqueante: el driver no existe en producción.
- Veredicto: PASS sin hallazgos nuevos. T943 (parte privacidad) sigue válida; tasks.md:309 sigue `[ ]` y la marca COMPLETED es de Neo. Bus central no tocado (misión: solo log-rama.md).

## 2026-11-19 · Feature 007 · T1012 privacidad (Bloque C, #13) · solo lectura
- Veredicto: BLOQUEADO parcial (solo carril #13). #11/#12/#14/#15/#51 PASS.
- Bloqueos: C1 enlace veterinario/ClinicalSummary (T1026); C2 respaldo por reemplazo revierte DECEASED->ALIVE sin aviso; C3 compatibilidad backup (T1013).
- deceasedAt: dato personal asociado al titular, no sensible segun artefactos; sin causa de muerte ni nota libre (C4).
- Acta: .specify/memory/audits/rama-007-privacidad.md. Sin edicion de specs/src, sin commit, sin [x].
2026-11-19 | rama | Fase 14 privacidad: PASS CON OBS. Acta rama-006-fase14-privacidad.md. T949 19/19. Condiciones C1 (Neo verifica fuentes DPA), C2 (retencion sin cifra), C3 (region us-central1 vs platform_parameters), C4 (T885), C5 (borrador en spec). Sin commit, sin [x].

## 2026-11-19 · Feature 007 · revalidación de privacidad de includeDeceasedAt (T1012/T1026) · solo lectura
- Alcance: 005 share-link 1.1.0 (schemas/share-link.schema.json:86-89, :164-167), clinical-summary (:54-57 deceasedAtIncluded, :107-118 lifeStatus/deceasedAt), share-links.openapi 3.4.0 (:5, :418-424, :223, :251), machine :154; src/domain/summary/clinical-summary.ts:41,72,136; shared-view-use-cases.ts sin cableado; audit-support.ts:41. Worktree argos-007 @ a63e285.
- Veredicto: PASS CON OBSERVACIONES. Default false y gate único en clinical-summary.ts:72; fail-closed porque el flag no está cableado en aplicación.
- Observaciones: O1 el esquema no liga deceasedAt a deceasedAtIncluded (sin if/then); O2 disclosure no emite deceasedAtIncluded (clinical-summary.ts:136); O3 cableado pendiente, repetir revalidación tras T1026. Sin fuga, sin logs con fecha.
- Acta: .specify/memory/audits/rama-007-revalidacion-includeDeceasedAt.md (worktree argos-007). Sin ediciones de contratos, src ni tests; sin commit, push ni [x].

## 2026-11-19 · Feature 007 · REVALIDACIÓN T1026 (cableado includeDeceasedAt) · HEAD 94e0865 · solo lectura
- Cableado verificado en commit 2e099b5: default false en CreateShareLinkUseCase, sameCreation con inmutabilidad (otro valor = ERR-SCHEMA-VALIDATION-FAILED/422), gate único clinical-summary.ts:72, deceasedAtIncluded condicional en :136.
- Migraciones: SQLite 0015 y Postgres 0011 con CHECK IN (0,1), DEFAULT 0 y sin fuga; paridad schema-parity 15 pasan (1 omitida: Postgres en vivo sin TEST_DATABASE_URL).
- Pruebas ejecutadas sin editar: UI 5/5, integración 8/8, API 4/4, con afirmaciones de valor. O2 y O3 cerradas. O1 abierta (contrato sin if/then, es de /architect). Obs: respaldo del propietario exporta deceasedAt por diseño (REQ-FAL7-009).
- Veredicto: PASS CON OBSERVACIONES. Acta actualizada en argos-007 (.specify/memory/audits/rama-007-revalidacion-includeDeceasedAt.md). Sin commit, push ni [x].

## 2026-11-21 · T1193 (Feature 008, #24) · auditoría de privacidad de searchInvitees · HEAD 6965d52 · solo lectura
- CC: alcance = SearchInviteesUseCase (household-use-cases.ts:223-234), ruta households.routes.ts:54-57, cloud-logging.ts:119-138,154-168, problem-details.ts:29,59-67, use-case-support.ts:165-172, repos PG/SQLite searchUsernamesByPrefix, rate limiter, terraform/logging.tf:6-13, contrato identity 004 (InviteeSearchResult) y openapi 004 (:1171-1205).
- Pruebas: t1188 unit+api 15/15 verdes; ops/logging + cloud-logging 19/19 verdes. Sin instalación, sin código modificado.
- H-RAMA-008-J-01 (ALTO): la URL con `?q=` llega al log de solicitudes de la plataforma Cloud Run. terraform/logging.tf solo excluye `/shared/`, no `/invitees`. Propuesta a /link.
- H-RAMA-008-J-02 (MEDIO, relacionado): NFR-008-004 afirma que el `code`/`state` del callback de Google se redacta en el registro de peticiones, pero la exclusión de plataforma tampoco lo cubre. Verificar a /link.
- Sin escritura ni recordAudit en la búsqueda; sin logger ni console en el caso de uso; respuesta solo `username`.
- Próximo paso: redactar .specify/memory/audits/rama-008-T1193-privacidad.md y cerrar la bitácora.
- Acta escrita: .specify/memory/audits/rama-008-T1193-privacidad.md. Pruebas T1188 15/15 y logging 19/19 verdes.
- Veredicto: PUNTOS 1-4 PASS (con obs. BAJO), 5 FAIL ALTO (registro de plataforma Cloud Run con ?q=, sin exclusion en terraform/logging.tf), 6 PARCIAL (sin base juridica ni retencion documentadas; Neo decide). Mitigacion recomendada: exclusion tipo T793 para /invitees?q= (a), aplicada por Neo tras terraform plan.
- Hallazgo relacionado H-RAMA-008-J-02 (MEDIO): NFR-008-004 dice que el code/state del callback de Google se redacta en el registro de peticiones; solo es cierto en la app, no en plataforma.
- Corregido en el acta: ventana del limitador = 1 minuto (invitee-search-config.ts:12).
- T1193 NO se marca. Sin commit, push, [x], ni toque a logos.json o al bus central. Bus delegado a Morpheus.

## 2026-11-21 · Feature 008 · T1134 [GOV] privacidad (NFR-008-004, REQ-VIN8-004, SC-008-063) · HEAD d1369af · en curso
- CC: alcance leído: google-auth-use-cases.ts, google-auth.routes.ts, cloud-logging.ts, audit-support/canonical-view, account-use-cases.ts (DeleteAccount), repos SQLite/PG, migraciones 0013/0017, maintenance-use-cases, terraform/logging.tf.
- Hipótesis a probar: (a) filas oauth_flow_states consumidas conservan pending_email/pending_subject hasta que arranque otro flujo (purga solo en beginAuthorization; mantenimiento no la incluye); (b) redactSecrets no cubre code/JWT/sub; (c) borrado en cascada de auth_identities y oauth_flow_states.
- Pruebas nuevas: tests/unit/t1134-*.spec.ts y tests/security/t1134-*.security.spec.ts. Sin tocar src, spec, tasks ni contratos.
- Pruebas nuevas: tests/unit/t1134-privacidad-retencion-cascada-008.spec.ts (11) y tests/security/t1134-privacidad-logs-callback-008.security.spec.ts (7). 18/18 verdes; 3 defectos reales como it.fails (H-RAMA-008-T1134-01 MEDIO, -02 BAJO, -03 BAJO). Verificado que fallan por la aserción esperada.
- H-RAMA-008-T1134-01 (MEDIO): oauth_flow_states solo se purga al iniciar un flujo (google-auth-use-cases.ts:87). La purga de mantenimiento (SQLite y PG) no la incluye. Una fila USERNAME consumida conserva pending_email y pending_subject tras vencer, sin límite si no hay tráfico de Google. Propuesta a /keymaker: incluir oauth_flow_states en purgeExpired (ambos motores) y/o anular pending_* al consumir.
- Logs: el registro de la app solo guarda método y ruta con plantilla (cloud-logging.ts serializeRequest); code/state/error del callback no salen por la app. El registro de plataforma de Cloud Run sigue pendiente: exclusiones en terraform/logging.tf para /api/auth/google/callback y /invitees?q= existen, sin aplicar (Neo, Nivel 2, tras terraform plan). No se ha tocado terraform.
- Auditoría: la vista canónica excluye email/displayName/passwordHash; el hash no depende del correo; el alta por Google y la vinculación no escriben correo ni sub. Borrado: auth_identities y oauth_flow_states con ON DELETE CASCADE (verificado en SQLite con PRAGMA y en vivo; PG solo por DDL, sin base en esta ejecución).
- tsc PASS, verify-oracles CUMPLE (450 archivos, 0 oráculos débiles), t1117/t1120/t1125/t1126/t1114/cloud-logging/account-deletion/t582/t1116 verdes (137 antes de añadir las nuevas).
- Veredicto T1134: PASS CON OBSERVACIONES. Bloqueo de cierre por H-RAMA-008-T1134-01 (MEDIO). Sin commit, sin [x], sin push, sin tocar spec/tasks/contracts/src/terraform.

## 2026-11-21 · Feature 008 · H-RAMA-008-T1134-01 · retirada del it.fails (parte a) y pendiente (b) · sin commit
- CC: convertida la prueba de purga en `it` normal en tests/unit/t1134-privacidad-retencion-cascada-008.spec.ts. Verifica que la fila USERNAME consumida y vencida (con pending_email/pending_subject) desaparece tras maintenanceCutoffs. Pasa con la purga de keymaker (sqlite-unit-of-work.ts). Sin tocar src/**, spec, tasks, contracts, generated, migraciones, terraform ni logos.
- Parte (b) NO CUBIERTA: anular pending_* al consumir choca con el CHECK de 0017 (SQLite) y 0013 (PG). Decisión de esquema de Neo/architect. No hay prueba ejecutable: it.skip/it.todo lo marca verify-oracles como oráculo débil (FALLA), así que queda un bloque de comentario "PENDIENTE DE DECISIÓN DE ESQUEMA".
- Gates: vitest 3 archivos 20/20 verdes (11 + 2 + 7). tsc 0. verify-oracles CUMPLE (451 archivos, 0 débiles).
- Veredicto: (a) CERRADO con prueba en verde; (b) ABIERTO. -02 y -03 sin cambios. Sin commit, sin [x], sin push.

## 2026-11-21 · Feature 008 · T1134 parte (b) · nota de privacidad (opción B de Neo) · solo documentación
- CC: decisión de Neo (Nivel 2, opción B): conservar CHECK de 0017 (SQLite) y 0013 (PG); aceptar retención transitoria acotada de pending_email/pending_subject/state en oauth_flow_states.
- Verificado: CHECK en ambas migraciones exige pending_* en fase USERNAME; purga de mantenimiento en commit 95b5a08; TTL 900 s según plan ADR-008-03 y cookie argos_oauth (no localicé la constante en código).
- Acción: addendum en .specify/memory/audits/rama-008-T1193-privacidad.md (único documento de privacidad de 008 en disco; no se creó archivo nuevo). Sin cambios en src, tests, migraciones, contracts, generated, terraform ni tasks.md. Sin commit, sin push, sin [x].

## 2026-11-21 · Feature 008 · T1185 [GOV] privacidad de la biografía (#21, REQ-BIO8-002/003/004, NFR-008-004) · HEAD 2359021 · sin commit
- CC: D8-12 = A verificado en spec.md:173 y :125-128, plan.md:36 (ADR-008-11) y contrato pet 3.2.0 (Biography con pattern sin control de caracteres). El envío a proveedor de IA NO aplica: no hay dictamen de B que emitir. buildImagePrompt, scene-spec, scene-payload y pet-phrases no leen biography; snapshot de escena con lista blanca de campos (inputs-snapshot.ts:41-50, scene-use-cases.ts:106).
- Prueba nueva: tests/unit/t1185-privacidad-biografia-008.spec.ts (10 tests, verdes). Cubre (a) errores de dominio y auditoría sin el texto, (b) respaldo: el dueño la lleva, la de otra cuenta no; sobre 3.3.0 rechaza control de caracteres, salto de línea y 281; resumen veterinario sin biografía; (c) ficha como texto escapado; guarda estática sin console ni logger en los archivos que mencionan biography.
- Centinela de escena: no duplicado en T1185 (un snapshot sin el texto daría prueba vacía). Cobertura end-to-end en t1182 (2/2 verdes).
- Verificado en disco: pet-invariants.ts:221-226,319; use-case-support.ts:338-352; audit-support.ts:44-60 y state-hash.ts:12-14 (solo huella); clinical-summary.ts:67-80 (campos explícitos); backup-use-cases.ts:228,300; backup-migration.ts:202-205.
- Hallazgos: ninguno ALTO ni MEDIO de producción. BAJO-T1185-01: la auditoría guarda sha256 sin clave del estado de la mascota, que incluye la biografía. Es el diseño de AUD-001 para todos los campos; un texto corto y conocido se podría verificar por fuerza bruta. Propuesta a /architect: valorar HMAC como HmacAuditPseudonymAdapter.
- Gate: tsc 0. vitest T1185 10/10, t1182 2/2, t1179, t1183, backup-use-cases 82/82 verdes. verify-oracles FALLA por un archivo ajeno: tests/security/t1185-biografia-texto-libre-008.security.spec.ts:77 (not.toBeNull, untracked, creado 15:34 durante esta ejecución, no es mío; 45/45 verdes). Hay que pedir a quien lo escribió que reemplace esa aserción. Tampoco es mío tests/e2e/visual/biografia-008.spec.ts.
- No toqué src, spec, tasks, contracts, generated, migraciones, terraform, logos ni el bus central. Sin commit, sin [x], sin push.

## 2026-11-23 — T1222 (009): privacidad del borrado con Google y supresión manual
- Acta: `.specify/memory/audits/rama-009-T1222-privacidad.md`. Veredicto PASS CON CAMBIOS; 1 ALTO (RAMA-01), 3 MEDIO bloqueantes según fase (RAMA-02..04), resto MEDIO/BAJO.
- Verificado en disco: cascada `eraseAccountInTransaction` (account-use-cases.ts:179-240), migraciones 0018 SQLite y 0014 PG, purga `oauth_flow_states` (SQLite diaria; PG fuera de STEPS), `terraform/logging.tf` (filtro del callback sin prefijo /admin).
- Sin cambios en src/tests, sin commit, sin `[x]`. Dictamen sobre TRI-05, TRI-06 y el 409 con nombres de hogares incluido en el acta.

## 2026-11-23 · Feature 009 · T1239 [GOV] privacidad y retención del portal /admin (REQ-ADM9-004, NFR-009-004, SC-009-013) · HEAD 4e56270 · sin commit
- CC: correo en claro y en minúsculas en admin_identities respetado (decisión de Neo, no reabierta). Sin fuga de correo, sub, código, state, nonce, verificador ni tokens en logs (cloud-logging.ts:120, admin.routes.ts:86-94), audit (0019:44-50) ni errores (problem-details.ts:31).
- Hallazgos: RAMA-T1239-01 (MEDIO) admin_oauth_flow_states sin purga de mantenimiento; RAMA-T1239-02 (MEDIO) admin_sessions purgadas solo al iniciar sesión; RAMA-T1239-03 (MEDIO) admin_audit_entries sin plazo de retención ni purga. Tres BAJO/OBS. Acta: .specify/memory/audits/rama-009-T1239.md.
- Prueba nueva: tests/security/t1239-retencion-privacidad-admin-009.security.spec.ts (12/12; 2 it.fails = hallazgos -01/-02). Afectadas 73/73 verdes; tsc 0; verify-oracles FALLA por sentinels-009-T1238 (ajeno).
- Sin tocar src/**, specs/**, generated, MER-11, 008, playwright. Sin commit, sin push, sin [x]. Owners: keymaker (-01, -02), architect + Neo (-03).

## 2026-11-23 · Feature 009 · T1252 [GOV] auditoría /rama (GH:#18; REQ-APR9-001/007, NFR-009-004, EDGE-009-033; SC-009-001/049) · HEAD 82a9cdc · solo lectura
- Veredicto global: FAIL. 1 minimización PASS CON OBS (REJECTED conserva correo y hash 30 d). 2 purga PASS CON OBS (código SQLite y PG correcto; pruebas solo SQLite). 3 evasión PASS (obs. BAJO: GetCurrentSession y borrados sin guarda ACTIVE). 4 cola PASS CON OBS (límite en memoria por instancia, sin tope global). 5 admin_audit_entries 24 m FAIL: sin purga ni prueba.
- Pruebas: vitest 7 archivos 66/66 verdes (t1245, t1246, t1247, t1288, t1239). PG no ejecutado (sin TEST_DATABASE_URL).
- Acta: .specify/memory/audits/rama-009-T1252.md. Sin código, contratos ni generated tocados; sin [x], commit ni push.

## 2026-11-23 · Feature 009 · T1252 reauditoría punto 5 (RAMA-T1239-03) · HEAD 82a9cdc · solo lectura
- Verificado en disco: SQLite sqlite-unit-of-work.ts:107 y PG postgres-maintenance.ts:57 suman admin_audit_entries (occurred_at < auditBefore, <, frontera conservada) a auditRowsPurged; sin FK; ACTIVE/PENDING no tocados por este paso.
- Pruebas con TEST_DATABASE_URL: postgres-maintenance.spec.ts + t1239 security: 30/30 verdes; la prueba PG real se ejecuto (no omitida). Fase roja no repetida (sin cambio de codigo).
- Contrato 003 MaintenanceResult sigue 5 claves. Logs sin datos personales (solo conteos).
- Veredicto punto 5: PASS CON OBS (OBS-5.1..5.4 BAJO). Acta audits/rama-009-T1252.md: veredicto global pasa a PASS CON OBS. Sin [x], commit ni push.

## 2026-11-23 · Feature 009 · T1294 [GOV] ubicación del tratamiento (REQ-CFG9-004, EDGE-009-018, EDGE-009-046, D9-22/D9-23) · HEAD dc535bd · solo lectura
- CC: lectura de 006 spec (INV-ESC6-010, REQ-ESC6-017/021/024/026/027/028/031, N2-11), research §2.2-2.3-bis, rama-006-fase14-privacidad.md, data-model §2.5, provider-parameters.ts, adapter Vertex (host por región), 003 spec D-28, 009 spec (EDGE-009-018/036/045/046, REQ-CFG9-004/005, INV-CFG9-002).
- Hallazgo: `global` puede cambiar la ubicación de procesamiento (fuente externa, no verificada). El aviso vigente (SCENE_NOTICE_VERSION '2') declara us-central1. Veredicto (b) FAIL: `global` sigue oculta.
- Hallazgo: scene_attempts.provider_model/provider_location son códigos, no datos personales; la fila sí los tiene (inputs_snapshot, actor_user_id). Veredicto (a) PASS CON OBS (O-1, O-2).
- Hallazgo: REQ-CFG9-005 (prompt editable) viaja al proveedor y no controla texto libre (O-3, MEDIO para T1261/T1271). Lista cerrada: cita de residencia necesaria por región seleccionada (O-4).
- Acta: .specify/memory/audits/rama-009-T1294-ubicacion.md. Sin edición de código, contratos, tasks.md; sin [x], commit ni push. Sin red: todo lo externo marcado [fuente externa].

## 2026-11-23 · Feature 009 · T1271 parte /rama (privacidad y retención Fase 5b, #20) · solo lectura · sin commit
- CC: lectura de migraciones 0023 SQLite / 0019 PG, repos de escena y admin, maintenance (30 d), scene-lifecycle-hooks (cuenta), admin-parameter-use-cases (auditoría y reinicio), scene-notice.ts, provider-parameters.ts y catálogo (global oculta). Acta: .specify/memory/audits/rama-009-T1271-fase5b.md.
- Veredictos: (1) provider_* PASS; (2) prompt.blocks PASS CON OBS (no llega al proveedor hoy; aviso sin texto editable, O-3 de T1294 abierto); (3) filtro mensual y quota_window PASS; (4) reinicio opción A PASS; (5) global oculta y SCENE_GLOBAL_LOCATION_ENABLED = false, T1294 vigente.
- Grep: 0 log.*/logger.*/console.* en escena y parámetros de 5b; auditoría admin_audit_entries sin columna de valor, objectRef = clave.
- Test: tests/security/t1239-retencion-privacidad-admin-009.security.spec.ts 13/13 verde en serie (salida real en el acta). No marcado [x]; sin commit, push ni cambios en src/tests.
- Hallazgos: RAMA-T1271-01 (MEDIO, condición para cablear prompt.blocks), -02 (BAJO, acta de Trinity desactualizada), -03 (BAJO, falta prueba de «sin log» en 5b).

## 2026-11-24 · Feature 010 · T1414 adelantado (coherencia de legal-texts.md con el código) · HEAD 0afc98d · solo lectura
- Acta: .specify/memory/audits/rama-010-legal-texts-coherencia-2026-11-24.md. Veredictos: (1) datos a IA INCUMPLE parcial (foto del hogar solo en desde cero; falta especie «otra»); (2) proveedores CUMPLE en draft, aviso gemini-api INCUMPLE (describe uso local, contrario a D9-30); (3) biografía: código aplica PET_PHOTOS (T968), texto INCUMPLE; (4) eliminación INCUMPLE en 4 frases (Google sin contraseña, respaldo opcional, cascada solo propietario) y menores INCUMPLE (sin acción admin de bloqueo ni correo); (5) 18+ INCUMPLE hasta T1424; (6) draft CUMPLE, aviso Vertex INCUMPLE en 2 frases.
- Hallazgos extra: cookies argos_admin_session y argos_admin_oauth omitidas (INCUMPLE); identificador sub de Google omitido; enlaces compartidos resolubles (caducidad 1/7/30 d, revocación, casillas microchip y archivos).
- Sin cambios en código, specs ni legal-texts.md; sin commit, sin [x].

## 2026-11-24 · Feature 010 · T1414 /rama (texto publicado vs código, HEAD 8e635c6) · solo lectura
- Verificado en disco: decide-mode, provider-parameters, account-deletion-guards, cookies admin/sesión, app-config (Gemini), scene-notice, share-link, ShareLinks; PP/TP sin ocurrencias de 18+ funcional ni de uso local.
- Veredictos: 1 CUMPLE con matiz (PP:75 «cada vez»); 2 CUMPLE en páginas, Aviso INCUMPLE (scene-notice.ts:87,101); 3 CUMPLE en páginas, Aviso INCUMPLE (:52,:54); 4 CUMPLE; 5 CUMPLE; 6 CUMPLE; 7 CUMPLE con pendiente operativo; respaldo/avatarUrl PENDIENTE.
- Acta: .specify/memory/audits/rama-010-T1414-texto-publicado-2026-11-24.md. Sin código, specs ni texto tocados; sin commit, sin [x].

## 2026-11-25 · Feature 010 · T1426 [GOV] dictamen de datos de menores (REQ-MEN10-001..004, D10-05) · HEAD 8c01cdf · solo lectura
- Verificado en disco: solo casilla booleana (schema cerrado), versión fijada por servidor (0.1.0), declaración en fila users (se borra con la cuenta y con la purga PENDING/REJECTED), fuera del respaldo, sin logs; estado OAuth abandonado se purga. vitest t1422+t1424: 37 pass, 15 skip (PG sin TEST_DATABASE_URL).
- Veredictos: minimización PASS, cuentas anteriores PASS, retención PASS CON OBS, procedimiento menor PASS CON OBS. Puntos legales: 1 aceptable con cambio, 2 aceptable, 3 aceptable con cambio, 4 aceptable con cambio menor, 5 aceptable. Jurisdicción: no evaluable por /rama (abogado).
- Hallazgos: RAMA-T1426-01 (MEDIO) supresión sin acción de admin no operable sin romper cascada atómica (runbook o deuda, decide Neo); -02 (BAJO) no pedir documentos al confirmar; -03 (BAJO) Términos §3 sin remisión a condiciones de §10.
- Acta: .specify/memory/audits/rama-010-T1426-menores-2026-11-25.md. Sin código, specs ni tasks.md; sin [x], sin push. Falta parte /lock (flujo Google).

## 2026-11-25 · Feature 010 · T1432 parte /rama (privacidad de la foto de «Acerca de», #33) · HEAD 3fbc04b · solo lectura
- CC: EXIF PASS (stripImageMetadata antes de storage.put, about-use-cases.ts; lista blanca JPEG/PNG/WebP, image-metadata-stripper.ts:105,131,181). Retención PASS CON OBS (sustitución con DELETE en la misma petición; conciliación about/ protege la foto viva por clave exacta, 15 min; GCS media sin soft delete ni versionado).
- Pública PASS CON OBS: sin clave ni ruta de almacenamiento; Cache-Control public max-age=60 sin prueba; Cloudflare no cachea /api/*. Auditoría PASS (ABOUT_UPDATE y ABOUT_PHOTO_UPDATE solo con objectRef=about, sin texto, alt, clave ni bytes).
- Consentimiento FAIL de cobertura: legal-texts.md sin mención de /acerca-de ni de publicación del operador (0 coincidencias). Sin sustitutos legales: pendiente de abogado (P4-a..e). Hallazgo RAMA-T1432-01 MEDIO: no hay retirada de la foto.
- Pruebas: vitest 5 archivos, 75 pasan, 21 omitidas (PG sin TEST_DATABASE_URL). Acta: .specify/memory/audits/rama-010-T1432-about-2026-11-25.md. Sin cambios en código, pruebas, specs ni tasks; sin [x], sin push.
- 2026-11-25 [rama] T1513 (lectura, sin cambios): texto «Imagen generada con inteligencia artificial» veraz como etiqueta; no cambia lo enviado ni el consentimiento (no requiere noticeVersion nueva).
  H-RAMA-01 ALTA (para Neo, Nivel 2): scene-notice.ts gemini-api (l.87 y l.101) dice «clave del propietario de esta instalacion» y «uso local con tu propia clave», contra /privacidad §6 y 010 (clave de Tipi; sin clave propia). D9-30 permite gemini-api en produccion desde /admin: el aviso vivo es falso. Deuda DEUDA-010-NOTICE con prioridad sube.
  H-RAMA-02 MEDIA: aviso Vertex §4 afirma como hecho «no se usan para entrenar» y «30 dias»; /privacidad lo deja pendiente de validacion legal. Sin fuente en disco. Acta .specify/memory/audits/rama-011-T1513-etiqueta-ia-2026-11-25.md. Sin commit, sin [x].
- 2026-11-25 [rama] T1518 dictamen prompt (011 Bloque C): PASS CON OBS. Prompt no persistido ni hasheado en produccion; echo no alcanzable (scene-composition:167). OBS-1 ALTA: REQ-IA11-004 'solo conteos' no implementable (diff necesita ids opacos) -> decision Neo; T1519 = saneado con migracion (no 'sin migracion'), recalcular huella. OBS-2: retencion copias/logs sin evidencia (sin IaC). OBS-5: plantilla editable sin control de datos personales. Acta .specify/memory/audits/rama-011-T1518-prompt-2026-11-25.md. Sin codigo, sin [x], sin commit.

## 2026-11-25 · Feature 011 · T1530 /rama (Bloque D #63, delegados y roles) · solo lectura
- Acta: .specify/memory/audits/rama-011-T1530-delegados-2026-11-25.md. Verificado en código: auditoría de 7 acciones con objectRef=admin_id sin correo ni sub; logs solo method+routeOptions.url; registro de rol SUPER_ONLY; alta 202 uniforme sin consultar users.
- Veredicto: PASS CON OBS. OBS-1 MEDIA sub/correo de DISABLED retenidos en admin_identities sin plazo; OBS-2 MEDIA servidor devuelve correos de otros SUPER_ADMIN delegados (filtro solo en UI); OBS-5 ALTA aviso no describe a administradores delegados (decisión Neo, Nivel 2); sin plazo de retención para DISABLED ni INVITED caducadas.
- T1531: no-fuga en auditoría PG y memoria (hoy solo SQLite), canario en logs, byte a byte del 202. Sin commit, sin [x], sin cambios de código.

## 2026-11-25 · Feature 011 · T1534 parte /rama (avatar compartido, #31) · HEAD 1486eaf · solo lectura
- Acta: .specify/memory/audits/rama-011-T1534-avatar-2026-11-25.md. Verificado en disco: PutAvatarUseCase guarda sin stripImageMetadata (la premisa "avatar saneado" del contrato no se cumple); strip solo en about y scene; t750/t770/t778 leídos sin cambios.
- Veredicto: FAIL en estado actual (RAMA-T1534-01 ALTA: strip al servir obligatorio fail-closed; RAMA-T1534-02 ALTA: la nota ENM no basta, INV-005-002 y REQ-VET-006 requieren enmienda decidida por Neo). PASS CON OBS si se cumplen ambas y se actualiza la sección 7 de legal-texts.
- Sin commit, sin [x], sin código.
- 2026-11-25 [rama] Dictamen final T1534 (A+C+TR-1): CUMPLE CON RESERVAS. Cierra RAMA-T1534-01/02 en contrato; RES-1 bloqueante para T1535 (OpenAPI getSharedPetAvatar 500 por fallo de almacenamiento contradice TR-1; faltan nosniff y CSP en 5xx). Sec.7 legal-texts = deuda Neo/abogado, no bloquea T1535. Acta .specify/memory/audits/rama-011-T1534-avatar-A-C-2026-11-25.md. Sin ediciones de specs/código.
- 2026-11-25 [rama] CC-RES1 Cierre RES-1 T1534: CERRADA tras verificacion linea a linea (OpenAPI L379, L411, L416-417; spec L120 reglas 4 y 6). Solo lectura salvo acta y registro. Sin commit ni cambios de estado.

## 2026-11-25 — T1555 (dictamen de privacidad, foto de perfil de usuario, #78)
- CC-RAMA-T1555-01: lectura completa de tasks T1553/T1555, spec REQ-PRF11-001/002, INV-PRF11-001, SC-011-057..062, EDGE-011-007, anexo user-avatar, OpenAPI 3.2.0, schema 1.0.0, acta D11-13 y enmienda Logos iter 244/246.
- H-RAMA-T1555-01..08: hallazgos de cache privada de larga duracion, texto legal 010 sin foto de perfil, excepcion INV-ARC-003 sin enmienda en 004 ni regex de listado para users/, sin tarea legal en tasks.md, falta registrar iter 246 en el acta de decisiones.
- Veredicto: CUMPLE CON RESERVAS. Sin edicion de codigo ni contratos. Acta en .specify/memory/audits/rama-011-T1555-avatar-usuario-2026-11-25.md.

## 2026-11-26 · Feature 012 · Fase 0 (T1605) auditoría de privacidad del data-model · solo lectura
- Veredicto: NO CUMPLE (sellable tras correcciones). 7 ALTA: F-01 premisa falsa (unicidad global de microchip ya existe en 004: SQLite 0008, PG 0004); F-02 índice con chip_conflict/deceased_at deja huecos; F-03 token QR en logs de plataforma sin exclusión; F-04 consentimiento del teléfono por cuenta, no por mascota; F-05 borrado de cuenta del principal sin bloqueo por co-propietarios (account-use-cases.ts:181-240); F-06 IDs de usuario sin FK ni pseudonimización; F-07 evidencias sin ciclo de vida.
- Retención y borrado propuestos por dato nuevo en el acta (sección 4). Decisiones para Neo: D-P1..D-P5 (sección 7).
- Acta: .specify/memory/audits/rama-012-fase0-2026-11-26.md. Sin ediciones de specs, contratos, código ni tasks; sin [x], commit ni push.

## 2026-11-26 · Feature 012 · Re-auditoría dirigida Fase 0 (F-01..F-14) · solo lectura
- Veredicto: CUMPLE CON RESERVAS. F-01..F-14 cerrados en el texto nuevo; 10 residuales (R-01..R-10). Sucesión del principal (Nivel 1 §D.4) confirmada con condición de ratificación de Neo (R-09, R-10).
- Acta: .specify/memory/audits/rama-012-reauditoria-2026-11-26.md. Sin ediciones de specs, contratos, código ni tasks; sin [x], commit, push ni git add.

## 2026-11-26 21:30 · Feature 012 · Revisión dirigida (N2-R2, N2-R2 cascadas, rejected_by, R-08, R-06, I.1, I.3) · solo lectura
- Veredicto: CUMPLE CON RESERVAS. Cerrados: cascadas (R-05), rejected_by/approver_set (R-04 parcial), ficha OFF al fallecer (R-08a), ip_rate_events (R-06), supresión del reclamante no adelanta borrado. Abiertos: share_links vs 005 (NOT NULL + CASCADE, R-A3), retención de disputas por ausencia (R-A6), plazo máximo de UNDER_REVIEW (R-A1), aviso de alergias en activación (R-A5).
- Acta: .specify/memory/audits/rama-012-dirigida-2026-11-26.md. Sin ediciones de specs, contratos, código ni tasks; sin [x], commit, push ni git add. Decisiones pendientes para Neo: plazo UNDER_REVIEW, retención ausencias, PRINCIPAL_ABSENT, preferencia del reclamante.

## 2026-11-27 · Feature 012 · Bloque B DRAFT (T1630-T1632) revision dirigida privacidad · solo lectura
- CC-RAMA-BB-01: lectura de chip-claim (openapi/schema), catalogo 0.2.0, anexos T1631/T1632, spec REQ-CHP12-004/007/008/010, REQ-OWN12-008, data-model (retencion por dato, dispute_evidence, owner_requests) y acta R-A1..R-A6.
- H-RAMA-BB-01..14: hueco de purga EXPIRED (delete_after=resolved_at), contradiccion L136 data-model, evidencia sin redaccion tras borrado, APPROVED indebido en catalogo, auditoria del arbitro sin valor propio (002 provisional 730), copias sin ventana, trigger_request_ids sin FK, seudonimizacion 'cuando proceda', avisos de resolucion sin contrato, 503 posible oraculo (a trinity), saneo PDF, regex chip_last4, ambiguedad 4 digitos en auditoria.
- Veredicto: NO CUMPLE (sellable tras correcciones). Premisa corregida: P-2 regula expedientes, no auditoria del arbitro. Acta .specify/memory/audits/rama-012-bloqueB-DRAFT-2026-11-27.md. Sin ediciones normativas, sin commit, sin [x].

## 2026-11-27 · Feature 012 · Bloque B DRAFT 0.3 segunda revision · solo lectura
- CC-RAMA-BB3-01: verificacion de F-01..F-13 contra data-model (63,71,135,136,141,142,150), annex (33,37,39,50,61,71,75), error-catalog (6), openapi (24-25,97,112-119,167-168), schema (126,222), spec (85,95,96,174,297), tasks (84,87).
- H-RAMA-BB3-01..08: N-01 ALTO reserva EXPIRED (data-model:150); N-02 ALTO ancla RESOLVED residual en spec/tasks; N-03 oraculo SC-012-118 debil; N-04 borrado fisico vs deleted_at; N-05 restauracion sin prueba; N-06 APPROVED en cabecera con bloque DRAFT; N-07 residual E-B3; N-08 sin cambio.
- Veredicto: NO CUMPLE (sellable tras correcciones textuales). Acta .specify/memory/audits/rama-012-bloqueB-v03-2026-11-27.md. Sin ediciones normativas, sin commit, sin [x].

## 2026-11-27 — re-auditoria dirigida v0.6 Bloque B
- Veredicto NO CUMPLE (N-A ALTO: fuente de person_id sin definir). Cerrados en texto: N-07, F-03 (condicionado), F-05, F-08, BACKUP_MAX=30, SC-012-118/119. Parciales: F-09, STAGING (sin tarea). Acta: .specify/memory/audits/rama-012-bloqueB-v06-2026-11-27.md. Sin commits ni cambios fuera de la acta.

## 2026-11-27 — T1644 re-auditoria ciclo de vida y privacidad (Bloque B)
- Veredicto NO CUMPLE. A-01 ALTO: person_id sin NULL tras 1095 d; purga de delegados borra admin_identities con FK RESTRICT de owner_requests y falla en silencio (maintenance-use-cases.ts:213-217). M-01..M-05, B-01, B-02. Retencion admin_audit 24 m (R-1) CUMPLE; metadata solo resolve/confirm CUMPLE. Acta: .specify/memory/audits/rama-012-bloqueB-T1644-2026-11-27.md. Sin cambios en src ni commits.

## 2026-11-27 — T1644 re-auditoria con D8 (solo lectura)
- Veredicto NO CUMPLE. D8 no implementado: purgeDelegateData borra admin_identities con expedientes (RESTRICT) y person_id nunca pasa a NULL. Texto data-model.md:149-151 CUMPLE. M-02, M-04 cerrados por texto; A-01, M-01, M-03 abiertos. Acta rama-012-bloqueB-T1644-D8-2026-11-27.md.

## 2026-11-27 — T1644 re-auditoria con D8 sobre f96e16d (solo lectura)
- Veredicto CUMPLE CON RESERVAS. A-01, A-01b, M-01, M-03 cerrados en codigo. Prueba t1580 D8: 14 OK en memoria/SQLite, PG omitida (R-PG-1). Nota PG: ruta ACTIVE hace COMMIT sobre tx abortada (ROLLBACK, DENIED correcto); riesgo fragil BAJO. Acta: .specify/memory/audits/rama-012-bloqueB-T1644-D8-reaudit-f96e16d-2026-11-27.md. Sin commits, sin [x].

## 2026-11-27 — T1647 pase /rama: supresión con disputa, retención, rejected_by (solo lectura, HEAD 348faa3)
- Veredicto CUMPLE CON RESERVAS en (a), (b) y (c). Sin prueba de SC-012-096/EDGE-012-053 ni del límite 1095 d. Vitest 4 ficheros: 49 OK, 22 omitidas PG. Acta rama-012-bloqueB-T1647-supresion-retencion-rejected-2026-11-27.md.

## 2026-11-27 — T1671 privacidad Ficha QR (solo lectura)
- Veredicto CUMPLE CON RESERVAS. P-01 (retencion consentimiento tras OFF/fallecimiento) y P-02 (alcance ADMIN) ALTA; P-03..P-09 MEDIA. Huecos 1,6,7,8 decididos; 2 y 3 piden Neo. Sin edicion de contratos ni codigo. Acta: .specify/memory/audits/rama-012-T1671-2026-11-27.md.

## 2026-11-27 — T1671 r2 (Bloque D, DRAFT 0.2.0)
- Re-auditoria de privacidad y retencion sobre contratos 0.2.0. Veredicto CUMPLE CON RESERVAS, sin ALTA nueva.
- P-01, P-02, D-R1 y D-R3 cerrados; N-01 (rotacion PHONE_HMAC_KEY) y N-02 (en espera sin plazo) son las reservas principales.
- Acta: .specify/memory/audits/rama-012-T1671-r2-2026-11-27.md (no commiteado).

## 2026-11-28 07:52 — T1683 re-auditoria dirigida privacidad QR (Bloque D, HEAD 6581ea2) · solo lectura
- CC-RAMA-T1683-01: lectura de anexo §1/§4/§7/§9, data-model 125-134/145-147/161, código emergency-*, chip-dispute-admin, co-ownership, account-use-cases, repos 3 motores, maintenance y scheduler (0 6 * * *).
- H-RAMA-T1683-01 MEDIA: purga 90 d incluye PET_CRITICAL_ALLERGIES_UPDATED (emergency-use-cases.ts:332; test audit-purge-012 la fija a 100 d) vs anexo §7 «no se acorta» y data-model:161 (730 d). Decisión Neo.
- H-RAMA-T1683-02 MEDIA: fallecimiento no dispara reconcileCard; OFF y borrado de consentimientos perezosos (barrido diario); público cerrado por state.deceased → 404. Decisión Neo (hook o excepción escrita).
- H-RAMA-T1683-03 BAJA: guardSatisfied cuenta STALE (phones.length + stale) no documentado en data-model:134.
- Veredicto: CUMPLE CON RESERVAS (0 ALTA). LEFT/ENDED, historial 90 d en 3 motores, purga EMERGENCY_* 90 d, ADMIN (requireOwner 404; alergias EDIT_PET_BASICS) y rotación HMAC: CUMPLE.
- Acta: .specify/memory/audits/rama-012-T1683-2026-11-28.md. Sin ediciones de código, contratos, specs ni tasks; sin commit, [x] ni push.

## 2026-11-28 · Feature 012 · T1691 revision privacidad y retencion del anexo PETS (DRAFT 0.1.0, Bloque E) · solo lectura
- CC-RAMA-T1691-01: lectura de share-link-subset-annex (§2-§8), share-links-pets.openapi.yaml, share-link-pets.schema.json, 012 data-model (retencion y auditoria), 012 spec (REQ-VET12, SC-012-053..066, SC-012-108), enm-005-a-annex §2 y 005 (data-model §3-§6, spec EDGE-005-20-bis, SC-005-052).
- H-RAMA-T1691-01 ALTA: enlaces PETS no se revocan en traspaso ni salida del creador (anexo §5), a diferencia de PN-08/B-1 de 005: A->B->A resucita el enlace hasta expires_at (<=30 d). Decision de Neo (Nivel 2).
- H-RAMA-T1691-02..04 MEDIA: borrado de mascota deja PETS vivo con cero filas; PET_WITHDRAWN sin tabla, CHECK ni retencion; householdId visible a co-propietarios no miembros. H-05..08 BAJA.
- Veredicto: NO CUMPLE (1 ALTA). Acta .specify/memory/audits/rama-012-T1691-2026-11-28.md. Sin ediciones de contratos ni codigo, sin commit, sin [x] ni push.

## 2026-11-28 · Feature 012 · T1691 r2 re-auditoria privacidad y retencion ENM-005-E DRAFT 0.2.0 (PETS) · solo lectura
- CC-RAMA-T1691-R2-01: lectura de share-link-subset-annex 0.2.0 (§1-§10), openapi y schema PETS 0.2.0, data-model (retencion, auditoria, matriz de borrado), enm-005-a-annex §2, spec REQ-VET12-007, deuda-012-withdraw-audit y terraform/logging.tf (exclusiones de Cloud Logging).
- Verificado H-RAMA-01 (cerrado en §5.1 + §9(i)), H-02 (cerrado), H-03 (eliminado; deuda existe), H-04 (quitado de schema), H-05 (cerrado), H-06 (abierto parcial: infra), H-07 (cerrado con nota), H-08 (cerrado con reserva, stub).
- H-RAMA-T1691-R2-01 MEDIA: petIds de la vista previa van en la query y terraform/logging.tf solo excluye /shared/; Cloud Run guarda requestUrl+remoteIp. Precondicion de publicar la ruta; aplicacion por Neo.
- H-RAMA-T1691-R2-02 MEDIA: la deuda y §5.2 dicen que la retirada solo desaparece para el retirador; desaparece para todos los co-propietarios. Neo debe reconfirmar la aceptacion.
- H-RAMA-T1691-R2-03..06 BAJA (activeCount, minimizacion de la fila de la mascota que sale, disparadores de principal incompletos, data-model desalineado), R2-07/08 INFO.
- Veredicto: CUMPLE CON RESERVAS (0 ALTA). Acta .specify/memory/audits/rama-012-T1691-r2-2026-11-28.md. Sin ediciones de contratos ni codigo, sin commit, sin [x] ni push.

## 2026-11-28 · Feature 012 · T1691 r3 re-auditoria privacidad y retencion ENM-005-E DRAFT 0.2.1 (PETS) · solo lectura
- CC-RAMA-T1691-R3-01: lectura de share-link-subset-annex 0.2.1 (§2, §3.7, §4.7, §5.1-§5.5, §8.2, §8.6, §10.2), openapi y schema PETS 0.2.1, data-model 138, deuda-012-withdraw-audit, spec REQ-VET12-003..007, terraform/logging.tf, src/infrastructure/http/cloud-logging.ts (serializeRequest usa routeOptions.url, sin query), tasks/quickstart (trazabilidad de R2-01).
- H-RAMA-T1691-R3-01 MEDIA: R2-01 no escrito sin ambiguedad. Las exclusiones de Cloud Logging descartan entradas completas, no redactan la query; la precondicion va «antes de activar»; pero la ruta de vista previa existe desde la Fase 1 (flag OFF responde 404) y Cloud Run registra requestUrl con petIds. Ademas no tiene deuda propia, tarea ni entrada en quickstart (DEUDA-012-TERRAFORM-LOGS-QR solo cubre /e/ y /api/emergency/). §3.7, §4.7 y OpenAPI afirman «los registros de acceso NO guardan la query»: cierto solo para los logs de la app.
- H-RAMA-T1691-R3-02 BAJA: R2-04 abierta, ambas opciones escritas, pero §10.2 dice «Opcion A (vigente)» y «Se aplica A hasta que Neo decida»: default provisional sin marcar como no vinculante. Cruce roto en §2 (apunta a §5.2 en vez de §10.2).
- H-RAMA-T1691-R3-03 BAJA: R2-03 (activeCount cuenta PETS ajenos visibles a owners/ADMIN) aceptado por architect sin decision de Neo registrada.
- H-RAMA-T1691-R3-04 BAJA: §5.1 disparadores ajenos a ENM-005-A solo citan REQUEST_CHANGE_PRINCIPAL y supresion; END_CO_OWNERSHIP por arbitraje (spec REQ-OWN12-009) no aparece nombrado. Verificar cobertura en ENM-005-A.
- H-RAMA-T1691-R3-05 BAJA: EDGE-012-076 (≤300 s) depende del valor desplegado (app-config admite 30-900, defecto 300); no esta en §8.6. R2-01 ausente de la cabecera de trazabilidad.
- Cerrados: R2-02 (§5.2, deuda y data-model 138 consistentes), R2-05 (disparadores en §5.1), R2-06 (data-model alineado). D-1 (a) aceptable en privacidad con reservas (aviso solo al actor; revocacion por cualquier co-propietario = disponibilidad).
- Veredicto: CUMPLE CON RESERVAS (0 ALTA; 1 MEDIA; 4 BAJA; INFO). Acta .specify/memory/audits/rama-012-T1691-r3-2026-11-28.md. Sin ediciones de contratos ni codigo, sin commit, sin [x] ni push.
