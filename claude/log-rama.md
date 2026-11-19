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
