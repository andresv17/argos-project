# Oracle 006 Fase 12, revalidacion de SC-ESC6-124

Autora: /oracle. Fecha: 2026-11-19. Rama 006-escena-hogar-pixel-art, HEAD a088f1c con cambios sin commit. Veredicto: PASS CON OBSERVACIONES (OBS-1 del acta anterior CERRADA). Sin [x], sin COMPLETED, sin commit.

## 1. Prueba SC-ESC6-124 (tests/unit/t855-run-scene-generation-escena-006.spec.ts:509, describe T929)
- Escenario: 2 KEEP con foto (Argos y otra mascota del mismo dueno), foto de Argos borrada del almacenamiento (ausente), segunda ejecucion incremental REPLACE con Luna.
- Aserciones exactas: resultado PUBLISHED; modo INCREMENTAL_REPLACE; references == [IMG_1, IMG_2, IMG_3] (sin huecos); JSON del prompt: photoRef de las mascotas con foto == [IMG_2, IMG_3], las demas hasReferencePhoto false con photoRef null y cantidad exacta (total - 2); photoRefs del texto == [IMG_2, IMG_3]; degraded true en el intento y imageDegraded true (decision A de Neo); imagen nueva distinta de la previa. Coincide con spec.md:457 y decision A. 0 red (generador simulado).
- No es oraculo debil (verify-oracles 0). Matiz menor: la KEEP ausente se identifica por conteo y no por petId de Argos; la ausencia de IMG_1 como foto de mascota queda implicita porque IMG_1 es la escena previa. No bloquea.

## 2. Codigo de produccion sin cambios
Sin snapshot hash de mi acta; verificacion por mtime: todas las rutas src/ y el schema (scene-run-use-case 13:37:44, decide-mode 13:36:58, scene-view/PetsPage 13:32:53, SceneBlock 13:33:03, schema 13:37:50) son anteriores a mi acta (13:43:29). git diff --stat src+contracts: 6 archivos, 73+/22-, igual que lo auditado (seccion 2 del acta anterior). Unico cambio posterior: t855 (13:53), solo adiciones de la prueba (1 import ajustado, sin borrado de pruebas).

## 3. Compuertas (load1 2.4 al iniciar)
- verify-traceability.sh --feature 006: rc 0, CUMPLE, 233/233 IDs propios, pureza 0.
- verify-oracles.sh: CUMPLE, 374 archivos, 0 debiles.
- npx tsc --noEmit: rc 0.
- npm run test:gate con PG17 real (127.0.0.1:55432, TEST_DATABASE_URL): rc 0; 324 archivos pasan; 5069 pasan, 1 omitida (fuera de 006), 0 rojas (+1 respecto a la corrida previa: la prueba SC-124). T591R-2 paso (sin fallo; DEUDA-006-T591R2-TIMING sigue abierta).
- scan-secrets.mjs repo: 0 hallazgos.

## 4. Ambito de commit
Seccion 7 del acta anterior confirmada (t855 ya incluido). Rutas: ver DETAILS del informe. Fuera: claude/*, .claude/*, tests/chaos/, logos.*, scripts/logos.py, specs/005/tasks.md, .gitignore, gate-T296-output.txt, .playwright-mcp/, .specify/memory/audits ajenos. Se anade esta acta de revalidacion.

## 5. Observaciones vigentes
OBS-2 DEUDA-006-T591R2-TIMING sin resolver; OBS-3 SC-128..130 por inspeccion de fuente, cierra la prueba en vivo [HUM] de Neo (T910/T923/T924..T934 pendientes de firma).
