# Oracle 006 Fase 12 (T924..T933), auditoria T934

Autora: /oracle. Fecha: 2026-11-19. Rama 006-escena-hogar-pixel-art, HEAD a088f1c con cambios sin commit. Veredicto: PASS CON OBSERVACIONES. No se marco [x] ni COMPLETED; sin commit ni cambios de codigo.

## 1. Estado de tareas (disco)
T924..T934 [ ]; T910 y T923 [ ]; T911..T922 [x] (a088f1c). Sin desviacion.

## 2. Decisiones de Neo verificadas en codigo
- Hogar principal (SC-ESC6-119..121): scene-view.ts principalHouseholdId (createdAt ascendente, desempate por id, null con 0 hogares, no muta el arreglo); PetsPage.tsx `householdId = isMine ? principalHouseholdId(households) : contextId`; HomeSceneImage solo lee /scene del hogar, sin /me/scene, sin caida al segundo hogar. CUMPLE.
- KEEP como IMG_n (SC-ESC6-122/123): decide-mode.ts asigna ranura primero a RENDER/ADD/REPLACE y luego a KEEP con foto, salvo INCREMENTAL_REMOVE; scene-spec/payload sin cambio de codigo. CUMPLE.
- N2-16 B+C: scene-run-use-case.ts ordena ranuras por numero (escena previa, hogar, ADD/REPLACE, KEEP al final); fit recorta la cola; omitir KEEP por tope no marca degraded (`if (l.keep !== true) degraded = true`); omitir cualquier otra si; escena previa omitida = FAILED con degraded true, sin cuota. renumber ordena por ranura. CUMPLE (t855: 3 pruebas SC-125).
- change_note de scene-payload.schema.json: diff palabra a palabra = solo prosa del change_note (2 fragmentos); sin otro cambio; src/generated, package.json y lock sin diff. CUMPLE.
- Ayuda y aria-describedby (SC-128..130): SceneBlock.tsx, textos exactos, ids con idPrefix, sin texto bajo «Reintentar», describedBy con motivo + ayuda, sin role=alert/aria-live, min-w-0/max-w-full/text-sm/text-slate-800. CUMPLE.

## 3. Consentimiento y privacidad (SC-ESC6-126, INV-ESC6-010)
snapshot pone photo=null sin consentimiento (driver real; scene-use-cases.ts:98), asi la KEEP sin consentimiento no recibe ranura. dataOwners (run-use-case:310-337) exige consentimiento vigente del dueno de toda foto enviada, incluida KEEP (sent.petIds las incluye), y devuelve null (cancela en T2) si lo retira; scene_image_sources solo anade duenos de fotos enviadas mas los de la imagen previa. Pruebas t855 SC-126 (2). CUMPLE. Matiz: si una KEEP con foto cuyo dueno no figuraba en la imagen previa viaja, ese dueno entra en fuentes (correcto, su foto viajo).

## 4. Pregunta abierta de /keymaker (para Neo)
Una referencia KEEP ausente o ilegible marca degraded = true (run-use-case:~114-118, rama comun a toda foto opcional; REQ-ESC6-027). N2-16 solo decidio el tope de bytes; no cubre ausencia/ilegibilidad. Dictamen: la regla actual es coherente con REQ-ESC6-027 y distinta en motivo de N2-16 (el tope es una restriccion del sistema; un archivo perdido o corrupto es un fallo de dato que conviene senalar). NO esta decidida por N2-16: requiere decision de Neo (A: mantener degraded; B: tratar KEEP ausente como el tope, sin degraded). Recomendacion: A.

## 5. Compuertas (maquina con load1 ~3.5 al iniciar)
- verify-traceability.sh --feature 006: rc 0, CUMPLE (233/233 IDs propios mapeados, pureza 0 violaciones).
- verify-oracles.sh: CUMPLE, 374 archivos, 0 oraculos debiles.
- npx tsc --noEmit: rc 0.
- npm run test:gate con PG17 real (127.0.0.1:55432, TEST_DATABASE_URL): rc 0; 324 archivos; 5068 pasan, 1 omitida, 0 rojas; cobertura 98.84 % lineas/sentencias, 95.55 % ramas. T591R-2 paso.
- node scripts/scan-secrets.mjs repo: 0 hallazgos.

## 6. Observaciones
- OBS-1: SC-ESC6-124 (2 KEEP, la primera ilegible/404: IMG renumeradas, JSON hasReferencePhoto false/photoRef null, degraded) NO tiene prueba etiquetada en tests/ (0 coincidencias); T927 lo declara. El codigo (renumber + buildScenePayload) lo cubre por lectura, sin prueba KEEP especifica. Pendiente para /keymaker (prueba) antes de firmar T927.
- OBS-2: T591R-2 sigue sin resolver (DEUDA-006-T591R2-TIMING); paso en esta corrida.
- OBS-3: sin jsdom, SC-128..130 se verifican por inspeccion de fuente (limitacion OBS-3 de T923); la prueba en vivo [HUM] de Neo cierra el hueco.

## 7. Ambito de commit propuesto (Fase 12)
src/application/use-cases/scene-run-use-case.ts; src/domain/scene/decide-mode.ts; src/presentation/web/components/SceneBlock.tsx; src/presentation/web/pages/PetsPage.tsx; src/presentation/web/scene-view.ts; tests/unit/presentation/t875-escena-presentacion.spec.ts; tests/unit/presentation/t918-mascotas-solo-imagen.spec.ts; tests/unit/presentation/t931-escena-ayuda.spec.ts (nuevo); tests/unit/t839-decide-mode-escena-006.spec.ts; tests/unit/t841-prompt-payload-escena-006.spec.ts; tests/unit/t855-run-scene-generation-escena-006.spec.ts; specs/006-escena-hogar-pixel-art/{spec,plan,research,tasks}.md; specs/006-escena-hogar-pixel-art/contracts/schemas/scene-payload.schema.json; specs/006-escena-hogar-pixel-art/audits/architect-006-fase-t924.md; specs/006-escena-hogar-pixel-art/audits/oracle-006-fase-t934.md. Excluir: claude/*, .claude/*, tests/chaos/, logos.*, scripts/logos.py, specs/005/tasks.md, .gitignore, gate-T296-output.txt, .playwright-mcp/, .specify/memory/audits ajenos.
