# Bitácora — /neb (Consola Nabucodonosor)

## 2026-11-11 — Consulta "cómo va el proyecto"
- Lectura en disco: registro-proceso-argos.md (últimas entradas), handover-morpheus-2026-11-11.md, tasks.md (35 `[x]`, 76 `[ ]`, 4 `COMPLETED`, 6 `REVIEW`), hoja-de-ruta-feature-002.md, git (HEAD 9af6f0b, rama 002-plataforma-v21, sin push).
- Hallazgo H-NEB-01: tasks.md (árbol de trabajo, sin commit) marca `[x]` T226–T235, pero el handover indica que la firma de Neo para T226–T235 sigue pendiente. Requiere confirmación de Neo.
- Hallazgo H-NEB-02: 50+ SKILL.md de `.claude/skills/` aparecen borrados en el árbol de trabajo (sin commit). Pendiente de explicación de Neo.
- Sin edición de specs, código ni handovers (solo lectura; esta bitácora es el único escrito).

## 2026-11-13 — Consulta de estado (Neo: "cuéntame cómo vamos")
- Lectura en disco: registro-proceso-argos.md (últimas entradas), handover-morpheus-2026-11-13.md (desactualizado: habla de T265 como última; el registro avanza hasta T270).
- tasks.md: 70 casillas [x] de 111. Feature 002: T253–T270 cerradas; T271–T310 abiertas (40 tareas).
- Git: rama 002-plataforma-v21, último commit 94fa123 (T270). 31 archivos sin commit (fase roja R5 de Keymaker, corrección de pipeline de Morpheus, bitácoras).
- Pendiente Nivel 2 de Neo: orden de commit de R5 y pipeline; aceptar DEUDA-001-TRACE-01 (test:gate falla en feature 001, 88/96, previo).

## 2026-11-14 — Consulta "cuéntame cómo vamos, cuántas rebanadas faltan" (Neo)
- Lectura en disco: handover-morpheus-2026-11-14.md, veredicto-auditor-frente-rojo-rebanada6-2026-11-14.md, tasks.md (encabezados de fase y casillas abiertas), git (rama 002-plataforma-v21, HEAD ff0fe62, sin commits pendientes de push).
- Hallazgo H-NEB-03: el conteo de casillas abiertas no cuadra entre métodos (grep 29; suma por fase 28). Se reporta como aproximado; no se corrige nada (solo lectura).
- Rebanadas 1 a 5 cerradas en disco. Rebanada 6 con frente rojo escrito (22 pruebas en rojo: 10 esperadas, 12 obsoletas) y sin commit. Fase 8 sin iniciar. Cinco decisiones pendientes de Neo.
- Sin edición de specs, código ni handovers.

## 2026-11-14 — Consulta "cómo vamos, qué sigue, qué falta" (Neo, lenguaje sencillo)
- Lectura en disco: git (rama 002-plataforma-v21, HEAD 425c006, 3 commits sin subir), tasks.md (95 [x], 16 [ ], 6 en REVIEW), handover-morpheus-2026-11-14.md, veredicto-auditor-pieza-t295-v25.md, entrega-T295-pieza-sati.md, bus registro-proceso-argos.md.
- Hallazgo: T295 (revisión visual de Sati) abierta a la espera de decisiones D-N1 (conflicto de previsualización de respaldo) y D-N2 (menú de navegación en móvil) de Neo. H-V25-1 (orden de foco en nav < 1024 px) ALTO sin corregir.
- Sin edición de specs, código ni handovers.

## 2026-11-14 — Consulta "ya terminamos feature 2? o estamos por terminarla?" (Neo)
- Lectura en disco: tasks.md 002 (111 casillas: 96 [x], 15 [ ]; 6 en REVIEW), handover-morpheus-2026-11-14.md, registro-proceso-argos.md (cola), veredicto-auditor-fallos-gate-t296.md, gate-T296-output.txt, git (rama 002-plataforma-v21, HEAD bf30703, ahead 5 de origin).
- Hallazgo: feature 002 NO terminada. Quedan 15 casillas: T204a (firma de Neo, N2), T297–T310 (fase 8: vectores de seguridad, mutación, regresión 001, compuerta final y veredicto de Oracle). T306 bloqueada por T204a.
- Hallazgo: gate-T296-output.txt registra 26 pruebas fallidas. Oracle (veredicto-auditor-fallos-gate-t296.md) las marca HEREDADAS de la línea base en el subconjunto de presentación; no verifiqué las 14 restantes.
- Pendientes de Neo: 5 decisiones de la rebanada 6 del handover (respaldos de spec, grilla 1280 px, 12 pruebas obsoletas, 422 que expone detalle del validador, reorganización del portal), T204a y autorizar push.
- Sin edición de specs, código ni handovers.

## 2026-11-14 — Consulta "qué es Stryker?" (Neo)
- Lectura en disco: package.json (script test:mutation, @stryker-mutator 10.1.1), tests/mutation/stryker.conf.json, claude/handover-neb-crew-2026-11-14.md, claude/hallazgos-t303-mutacion.md.
- Explicado a Neo en lenguaje sencillo: Stryker = herramienta de mutation testing (altera el código a propósito para comprobar que las pruebas lo detectan).
- Estado: mutación oficial NO concluida (SIGKILL al 15 
## 2026-11-14 — Consulta "qué es Stryker?" (Neo)
- Lectura en disco: package.json (script test:mutation, @stryker-mutator 10.1.1), tests/mutation/stryker.conf.json, claude/handover-neb-crew-2026-11-14.md, claude/hallazgos-t303-mutacion.md.
- Explicado a Neo en lenguaje sencillo: Stryker = herramienta de mutation testing (altera el código a propósito para comprobar que las pruebas lo detectan).
- Estado: mutación oficial NO concluida (SIGKILL al 15 %, sin informe). T303 y T309 abiertas.
- Sin edición de specs, código ni handovers.

- 2026-11-14 19:47 Neb: consulta "estado de mutación". Disco: Stryker vivo (PID 95969 y workers), salida mutacion-oficial-2026-11-14-b.txt en scratchpad de 515ca0fd, 1314/3457 (30 %) a las 19:47, sin errores SIGKILL hasta ahora (la corrida anterior moría al 15 %). Sin informe final aún. Solo lectura, sin commit ni push.

- 2026-11-14 19:49 Neb: Neo pregunta si debe volver en 40 min y si la mutación consume tokens. Respuesta: Stryker y Vitest son procesos locales de Node, sin llamadas a modelos, no consumen tokens. Riesgo: si el Mac se suspende o se cierra la sesión que lanzó el proceso, puede morir. Solo lectura.

- 2026-11-14 19:50 Neb: Neo cree que la feature 002 casi termina. Disco: tasks.md 102 [x], 10 [ ]; T303, T304 y T309 abiertas. Mutación 35 % (1550/3457) 19:50, sin SIGKILL. Corrijo: la caída anterior SIGKILL no tiene causa confirmada en disco; Neo indica que él terminó los procesos. Recomiendo caffeinate -dimsu -w 95948 para mantener el Mac activo. Solo lectura.

- 2026-11-14 19:53 Neb: Neo pregunta si la feature 002 solo depende de pruebas de seguridad. Disco: 10 tareas abiertas: T302 (Sentinels/Trinity), T303 (mutación), T304 (regresión 001), T305 (oráculos), T306 (trazabilidad, depende de T204a), T307 (mapa SC), T308 (recorrido manual Zee/Kid), T309 (compuerta final), T310 (veredicto Oracle), T311 (endpoint cancelInvitation). Respuesta: no, la seguridad es solo una parte. Solo lectura.

- 2026-11-14 19:54 Neb: Neo pide validar firma T204a (solo lectura). Disco: enmienda-principio-iii-002-borrador.md dice "ENMIENDA RATIFICADA Y FIRMADA POR NEO (NIVEL 2)", fecha 2026-11-14; constitution.md en 3.2.0 con firma T204a; tasks.md T204a [x]. Registro 2026-11-14 Morpheus: Neo ratifica 5 puntos. Pendiente: archivos sin commit (M). Sin cambios en repo.

- 2026-11-14 19:55 Neb: Neo pregunta si la feature 002 se termina hoy. Respuesta: no es realista. Quedan 9 tareas abiertas (T302, T303, T304, T305, T307, T308, T309, T310, T311), incluidas implementación de T311, 11 suites rojas de la 001 por corregir, mutación al 35 % y recorrido manual con personas (T308). Solo lectura.

- 2026-11-14 19:56 Neb: Neo pregunta cuántas horas tomaría cerrar la 002. Estimación (no medida): 12 a 20 h de trabajo efectivo, 2 a 3 días con esperas, reruns de mutación (~1 h cada una) y T308 con personas. Solo lectura.

- 2026-11-14 19:58 Neb: Neo supone que F3 (Cloud), F4 (mejoras) y F5 (IA) serán más cortas. Disco: no hay definición de F3-F5 en el repo (solo specs 001 y 002). Respuesta: no necesariamente; la seguridad no se reduce con cada fase, y F3 (infraestructura) y F5 (riesgos de IA) suman superficie. Solo lectura.

- 2026-11-14 20:00 Neb: Neo prefiere calidad y seguridad sobre velocidad. Las fases F3-F5 no se han comentado a otros agentes; se lanzarán tras cerrar la 002. Solo lectura.

- 2026-11-14 20:01 Neb: Neo pide avance antes de descansar. Mutación 41 % (1829/3457), 20:01, 30 sobrevivientes, 30 timeouts, sin SIGKILL, PID 95948 vivo, caffeinate activo (PID 19571). Estimado ~45 min restantes (~20:45). T303 y demás abiertas. Solo lectura.

- 2026-11-14 21:04 Neb: Neo pide estado tras pruebas. Disco: mutación oficial terminó EXIT=0, score 88.98 (>=85), 64 min. Commits nuevos ac566de (cierre ola 2) y 11637e0 (registro T304). tasks.md: 106 [x], 6 [ ] (T305-T310). T302, T303, T304 y T311 aparecen [x] en ac566de; tasks.md línea 321 dice que [x] solo con aprobación humana, agentes dejan REVIEW. Marca a verificar con Neo. Solo lectura.

- 2026-11-14 21:07 Neb: Neo pregunta si 85 % es estándar y qué validan las pruebas de mutación. Disco: umbral 85 en tests/mutation/stryker.conf.json; alcance src/domain y src/application (50 archivos). Por archivo bajo 85 %: ownership-transfer 80.95, weight-limits 80.65, estimated-age 83.33, record-invariants 84.26, import-hardening 84.75. Solo lectura.

- 2026-11-14 21:10 Neb: Neo pregunta si 88.98 % es buen puntaje. Respuesta: sólido y por encima del umbral del proyecto; buen nivel para lógica de negocio; no excepcional; el promedio oculta archivos bajo 85 %. Solo lectura.

- 2026-11-14 21:12 Neb: Neo ve a Zee y Kid probando el portal. Disco: vite (5173) y API (3100) en escucha desde 21:08; Chrome abierto; Morpheus lanzó T308 por agentes (autorizado por Neo). Zee y Kid son personas de agente, no humanos: corrijo mi estimado previo que suponía personas. Coverage 88.29 % < 95 % = Caso B pendiente de Neo. Solo lectura.

- 2026-11-14 21:18 Neb: Neo pregunta si está cerca de cerrar 002. Respuesta: cerca en pasos, con 3 dependencias: decisión de Neo sobre cobertura 88.29 % (Caso B), evidencia de T308 y T307 (SC-002), y veredicto de Oracle T310 antes de COMPLETED y push. Solo lectura.

- 2026-11-14 21:50 Neb: Neo pregunta si ya empezó la mutación de T309 (1 h). Disco 21:50: no hay Stryker vivo. Keymaker ejecutó compuertas en serie (1-6 OK excepto coverage 88.29 % < 95 %); test:mutation NO relanzado (evidencia lo marca como prohibido, usa 88.98 % aprobado). T309 literal incluye test:mutation: desviación que requiere decisión de Neo. Solo lectura.

## 2026-11-19 — Consulta "cómo va el proyecto?"
- Rama activa 006-escena-hogar-pixel-art, HEAD 7616fbd, 200 entradas sucias. Local main desfasado; 2862bed (PR #52, 006) está en origin/main.
- 006: 159 [x], 1 [ ] (T885 bloqueada). Worktree 007 (argos-007) en b1e5ab4, 57 cambios, 56 [ ] / 4 [x] en tasks.md.
- Discrepancia: bus fecha entradas 2026-11-20/21 con fecha de hoy 2026-11-19; no verificado.
- Sin modificación de código, specs ni tareas.

## 2026-11-19 — Corrección del informe de /neb (iteración 60)
- Error mío: di T885 como bloqueada. En disco: T885 es [x] (tasks.md:192), y su texto aún dice «BLOQUEADA… NO ejecutar» (texto obsoleto).
- 006: 159 [x] y 1 [ ] (T900 [HUM], N/A pendiente de confirmación de Neo, T959). Sin decisiones pendientes de 006 según Neo en logos.json.
- Neo confirma en logos.json: 006 desplegada (PR #52 @2862bed en origin/main), aviso v2 liquidado en T958, Vertex real activo en Cloud Run.
- 007: en worktree argos-007, Bloque C sin commitear (41 modificados, 3 nuevos). Turno de Logos pasado a morpheus.
