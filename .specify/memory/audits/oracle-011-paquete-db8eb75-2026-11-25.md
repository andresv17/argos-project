# Acta /oracle — Paquete DRAFT Feature 011 (db8eb75) — 2026-11-25
Veredicto: PASS CON OBS (3 OBS, ninguna bloqueante; paquete DRAFT, sin código).

## (a) Alcance — PASS
`git show --stat db8eb75`: spec.md, plan.md, tasks.md, contracts/README.md de specs/011 + 5 líneas añadidas a claude/log-architect.md (propias). 0 archivos en src/, tests/ ni bitácoras ajenas. 439 inserciones, 0 borrados.

## (b) Cobertura del inbox — PASS
9/9 (#63, #64, #72, #73, #31, #59, #62, #74, #78): cada uno con User Story, REQ y bloque A..I en tasks.md. Ningún ítem inventado ni omitido. Mapeo bloque A=#64, B=#72, C=#73, D=#63, E=#31, F=#59, G=#62, H=#74, I=#78 coincide en spec, plan y tasks.

## (c) Etiquetas [GH:#N] — PASS
- 61 tareas (T1501..T1561, sin IDs duplicados); 0 tareas sin `[GH:`.
- 9 encabezados `### Bloque` con su etiqueta correcta (grep líneas 37..156). Fase 0 y fase final llevan las 9 etiquetas.
- Números distintos en tasks.md: solo {63,64,72,73,31,59,62,74,78}; ninguno erróneo. spec.md: los 9 en el encabezado «Input» y en las 9 User Stories.

## (d) Reglas de Neo — PASS
1 etiquetas conservadas. 2 cada bloque A..I tiene tarea [LOCAL] (T1509, T1515, T1522, T1529, T1536, T1540, T1545, T1551, T1557) antes de la tarea de cierre con compuertas; regla escrita en «Reglas transversales». 3 cada cierre (T1511, T1516, T1523, T1531, T1537, T1541, T1547, T1552, T1558) ejecuta `gh-project-sync sync --tasks specs/011-.../tasks.md`. 4 T1560 asocia `Closes #N` x9 (o `Refs #N`) y deja el push a Neo. 5 `[x]` = 0; 61 `[ ]`. 6 sin push ni test:gate ejecutados; solo prescritos para cierres futuros.

## (e) Decisiones de producto — PASS CON OBS
D11-01..D11-13 son preguntas abiertas con opciones (A/B/C...), ninguna elegida; D11-ORDEN informativa. OBS-1 (MEDIA) y OBS-2 (MEDIA) abajo.

## (f) Hallazgos en disco — PASS (los 5 ciertos)
- Sin tope de hogares: grep `max_households|household.*limit|tope` en src/ sin ningún tope de hogares (solo cuotas de bytes, lista de bloqueo de borrado).
- Sin avatar ni foto de Google de usuario: `grep -w picture src` = 0; sin user_avatar/profile_photo/avatar_url.
- Única IA = imagen de escena: solo adaptadores gemini-api/fake y scene-*; sin ningún cliente de texto LLM. Matiz: el driver real es `vertex | gemini-api` (D9-30); la spec dice «Vertex AI» (OBS-3, BAJA).
- ARGOS_ADMIN_EMAILS única fuente: `ADMIN_EMAILS_NAME` en app-config.ts; 0 coincidencias de admin_delegate/PlatformRole/platform_role en src.
- Vista pública excluye avatar y álbum: src/domain/summary/clinical-summary.ts:4 («Sin álbum (PHOTO), avatar, correo…»). También cierto: ShareLinks.tsx:184 pinta «¿Qué quieres compartir?»; el prompt no se persiste en columnas (grep prompt en persistence = 0; `inputs_snapshot` existe y es de datos de entrada); `echo` incrusta `tEXt` (fake adapter línea 5/49).

## (g) Contradicciones internas — OBS
- OBS-1 (MEDIA): la columna «Bloquea» de spec.md cita IDs de tarea que no corresponden a tasks.md/contracts: D11-01 «T1506.. (Bloque #63)» (T1506 es Bloque A #64; el #63 es T1524..T1531); D11-03/D11-04 «T1507» (es ARCH de #64; debe ser T1524/T1527); D11-06 «T1510..» (debe ser T1507/T1508); D11-09 «T1523 (foto)» (es cierre del Bloque C; debe ser T1534/T1535). tasks.md y contracts/README.md sí son coherentes entre sí (T1524, T1507, T1534, T1542, T1553, T1548).
- Sin otras contradicciones: IDs REQ/INV/EDGE/NFR, nombres de bloques y orden de fases (A#64, B#72, C#73, D#63, E#31, F#59, G#62, H#74, I#78) idénticos en spec, plan y tasks.

## Decisiones dadas por hechas (OBS-2, MEDIA)
- STATE-ADM11-001 «ACTIVE ↔ DISABLED» (plan, contracts/README, T1524) presupone reactivación, que es D11-04 (opción B = solo recrear).
- REQ-HOG11-001 y US1 («una sola página», «sin segunda pestaña») cierran D11-05 aunque la opción C mantiene ambas.
- REQ-ALB11-001/002 y SC-011-045 fijan solo PHOTO, agrupado por mascota y permisos por mascota; D11-11 sigue preguntando alcance, orden y quién ve.
- REQ-IA11-002 incluye «descarga» y T1514 constante única; D11-07 sigue abierta en forma y alcance.
- EDGE-011-008 («sin expulsiones») y REQ-HOG11-004 («crear y/o aceptar») anticipan semántica de D11-12.
Leves (el inbox o el invariante las respalda), pero deben marcarse «condicionado a D11-xx» o suavizarse.

## (h) Trazabilidad — CONFIRMADA
`bash scripts/verify-traceability.sh --feature 011` rc 2, mensaje: «Fuente ausente: specs/011-.../contracts/errors/error-catalog.json». Causa doble: (1) no existe el catálogo (contracts/ solo tiene README, por diseño DRAFT); (2) el script solo ramifica 001..010 (FEAT10 etc.) y no tiene patrón de IDs 011. Script N2 no tocado. OBS-4 (BAJA): hace falta tarea de Neo/architect para dar soporte 011 al script y crear el catálogo antes del primer cierre (T1511 lo invoca). Además SC-011-004..009 y rangos 010..062 solo se citan por rango; no hay definición individual (el spec dice que se redactan en tasks.md y no está): riesgo de trazabilidad 1:1 (OBS-4).

## Hallazgos
| ID | Sev | Resumen |
| ORA-011-01 | MEDIA | IDs de tarea erróneos en columna «Bloquea» de spec (OBS-1) |
| ORA-011-02 | MEDIA | Decisiones presupuestas en REQ/STATE/EDGE (OBS-2) |
| ORA-011-03 | BAJA | Spec dice «Vertex AI»; el driver real es vertex o gemini-api |
| ORA-011-04 | BAJA | Script de trazabilidad sin soporte 011 y SC individuales sin definir |
Sin [x], sin push, sin stash, sin servidores, sin editar spec/tasks.
