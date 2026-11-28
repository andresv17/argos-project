# Bitácora Incremental — Mouse (`/mouse` — Auditor de Specs & Operador Spec Kit)

> **Regla Write-Ahead Log:** Cada vez que `/mouse` ejecute herramientas de Spec Kit (`speckit-analyze`, `speckit-clarify`), scripts de trazabilidad o detecte inconsistencias entre artefactos, debe añadir una entrada fechada al final de este archivo antes de responder en el chat.

---

## `[2026-11-10 | Inicialización de la Skill]`
- **Artefactos SDD Monitoreados:**
  - `specs/001-pet-health-tracker/spec.md` (v2.4.0 `REVIEW`).
  - `specs/001-pet-health-tracker/plan.md` (v2.3.0 `REVIEW`).
  - `specs/001-pet-health-tracker/tasks.md` (v2.3.0 `REVIEW` — `T001..T016`).
  - `.specify/memory/constitution.md` (v2.4.0 `REVIEW`).
- **Estado Actual de Spec Kit:**
  - `bash scripts/verify-traceability.sh`: CUMPLE (96/96 IDs vigentes, 0 violaciones de pureza).
  - Migración a estructura Spec Kit completada; pendiente cierre de checklists y firma Nivel 2 de **Neo**.

## `[2026-11-10 | F2 Clarificación Feature 002]`
- Checkpoint: documento `.specify/memory/audits/f2-clarificacion-feature-002.md` creado (27 incoherencias: (a)=5, (b)=15, (c)=7; 7 preguntas para Neo).
- Hallazgo: la 001 no usa UTC para el día civil; la constitución fija `APP_TIMEZONE` (`America/Bogota`). Los registros clínicos de la 001 no tienen `updatedAt` (afecta al Merge).
- Sin cambios en specs/contratos/src/tests/tasks/constitución; sin commit. Pendiente: respuestas de Neo (P1..P7).

## `[2026-11-10 | F5 Auditoría de spec 002 (analyze + checklist)]`
- Checkpoint: `specs/002-plataforma-v21/spec.md` auditada contra decisiones de Neo, 001, constitución y v2.1; checklist en `specs/002-plataforma-v21/checklists/requirements.md` (27 cumple, 13 abiertos).
- Hallazgos H-F5-01..17: 5 altos (matriz con celdas «cuenta», REQ-ACC-002 hogar propio y descarga previa no verificable en servidor, auditoría ambigua, constitución con DOG|CAT y TTL 7 días), 6 medios, 6 bajos. Decisiones 1A–7B y defaults: sin contradicción. Cero dependencias nuevas.
- «Hash con sal»: aplica solo a `executorUserId` tras eliminar cuenta; `previous/newStateHash` son SHA-256 sin sal. Sal sin definir: pregunta a Neo. Solo lectura; sin edición de spec, sin commit.

## `[2026-11-10 | F5 bis: reauditoría de spec 002 tras N-1..N-5]`
- Checkpoint: checklist `specs/002-plataforma-v21/checklists/requirements.md` pasa a 38 de 40 (abiertos: CHK033 y CHK051). Matriz RBAC: 44 celdas S/N, sin contradicciones; IDs de la 001 (60) sin huérfanos ni duplicados.
- Hallazgos previos: 13 cerrados, 1 parcial (H-F5-05 auditoría compuesta), 3 sin detalle en disco (14, 16, 17). Nuevos: N-A medio (entityId del usuario eliminado en claro vs SC-014), N-B alto (borrador de enmienda omite frase de «Sistema»), N-C, N-D, N-E bajos.
- Solo lectura sobre spec y enmienda; sin commit, spec sigue DRAFT. Pendiente del arquitecto: corregir N-A, N-B, N-C y cerrar H-F5-05.

## `[2026-11-10 | F5 ter: reauditoría de spec 002 y enmienda tras N-A/N-B/N-C/N-E/H-F5-05]`
- Checkpoint: los 6 puntos CUMPLEN (cita de «Sistema» línea 129 y regla MINOR verificadas con grep; HMAC en entityId, filas y valores cerrados coherentes; REQ-PET2-002/HOUSE2-004 sin fuente de orden de la 001; matriz 44 celdas coherente con «a bis»).
- Checklist 40 de 40; observación: la versión MINOR es interpretación declarada. Spec DRAFT; sin edición de spec/enmienda; sin commit.

## `[2026-11-10 | F4: /speckit-analyze sobre plan, modelo de datos, quickstart y contratos de la 002]`
- Checkpoint: checklist `specs/002-plataforma-v21/checklists/f4-contratos.md`. Ajv strict OK, 0 refs rotas, 40 operaciones, 35 errores; los 63 IDs de la spec con contrato están citados. Solo STATE-ACCOUNT-DELETE-001 es ID nuevo; ERR-PET-MICROCHIP-DUPLICATE y ERR-RATE-LIMITED los únicos errores nuevos sin nombre en la spec.
- Hallazgos: 3 altos (token ausente da 422 y no MISMATCH; migración omite invitaciones de la 001; assigned_by_user_id deja userId en claro y bloquea B10), 5 medios, 7 bajos. Decisiones de Neo (R2, R3, R6, T1, T3, secuencia A/B) aplicadas. ADR-002-04, 09 y 11 coherentes con la spec; ADR-002-08 (digest, POST) conviene que Neo lo vea.
- Solo lectura sobre artefactos F4; sin commit; sin tasks.md.

## `[2026-11-10 | F4 bis: reverificación de F4 tras correcciones del arquitecto]`
- Checkpoint: F4-A1, A2, A3, M1-M4 y B1-B5 CERRADOS con evidencia en disco; abiertos F4-M5 (decisión de Neo, marcado pendiente en plan.md ADR-002-07/08 y punto 10), F4-B6, F4-B7 y CHK305 (`ACCEPTED`). Cobertura 63 de 63 (REQ-MIG-001 por data-model §2.10, sin contrato ejecutable).
- Ajv 2020 strict + strictTypes: 6 de 6 esquemas OK; OpenAPI 40 operaciones, 345 `$ref`, 0 rotas. Checklist `f4-contratos.md` actualizada (sección 6 bis). Solo lectura sobre artefactos; sin commit.

## `[2026-11-10 | Mouse | F6 analyze de tasks.md 002 | Validación requerida]`
- Cobertura: 97 de 97 IDs vigentes (REQ/INV/STATE) + 17 SC + 35 ERR con tarea; los 24 sin tarea son los reemplazados (correcto). 110 tareas T201..T310 confirmadas; 22 filas de sustitución + fila 23, 0 pruebas borradas.
- Hallazgos: T293 y línea 217 mantienen D2/F4-M5 como pendientes (ya APROBADAS); línea 31 firma "antes de T204" contradice la enmienda (después de T204, antes de T306) y no hay tarea de firma ni marcas [N2]; T219 cita T266 (es T265) y T233 cita T277 (es T276).
- Sin ediciones a tasks.md, sustitución, enmienda ni constitución; sin commit.

## [2026-11-15 | Gate estructural 003]
- Veredicto PASS estructural: 96 IDs (58 REQ, 13 NFR, 25 SC) 1:1 con mapa, 81 tareas T401..T483, 0 [x], 0 huérfanos, 0 ciclos, estado DRAFT.
- Condiciones: ops.openapi.yaml por crear (T408); verify-traceability.sh ejecutable pero sin prefijos 003 hasta T406.
- Informe: .specify/memory/audits/gate-mouse-003.md

## [2026-11-18 | Gate estructural 006]
- Veredicto BLOCKED (menor): conteos 31 REQ/17 INV/23 EDGE/50 SC/4 NFR/9 RR/17 D verificados en disco, 0 duplicados, 0 refs cruzadas rotas hacia 001..005 y constitución; estado DRAFT sin APPROVED/LOCKED.
- Defectos: ALTO huérfanos REQ-ESC6-022, INV-ESC6-009, INV-ESC6-012; MEDIO escenario A5 inexistente (l.116/123), cobertura solo implícita (REQ-003/010, INV-004/005/008), default REQ-020 contradice propuesta D6-10, marcas PENDIENTE individuales ausentes en 9 D6.
- verify-traceability.sh --feature 006 falla por falta de tasks.md (no aplica aún). Informe: .specify/memory/audits/mouse-006-estructura.md

## [2026-11-19 | Gate estructural 006 Fase 11 (T911..T923) | Veredicto BLOCKED]
- `bash scripts/verify-traceability.sh --feature 006`: rc=0, CUMPLE; 258 IDs vigentes, 186 trazados, 221/221 IDs propios mapeados, pureza 0 violaciones. El script no detecta los defectos siguientes.
- Defectos ALTO: matriz REQ->SC->tareas de spec.md desactualizada en REQ-ESC6-007, 016, 019 y 034 (no cita SC-112..118 ni T912..T921); N2-14 y N2-15 figuran PENDIENTE en spec.md (l.605-606) y T912 sigue "bloqueada" aunque el bus registra aprobacion de Neo (N2-14 si, N2-15 B).
- Defecto MEDIO: cabecera de la matriz dice "85 tareas T801..T885" (faltan T886..T923).
- Observacion: OpenAPI sigue en 3.4.0 con contrato 1.1.0 (decision ya documentada por architect, T913 pendiente).
- Contratos: scene.schema.json 1.1.0 parsea, SceneActions additionalProperties false, retryAfterSeconds integer|null 1..86400 opcional; home-scene.openapi.yaml parsea (js-yaml), 10 rutas.
- Sin modificar archivos del proyecto, sin [x], sin commit, sin tocar registro-proceso (restriccion de Morpheus).

## [2026-11-19 | Gate estructural 006 Fase 12 (T924..T934, DRAFT) | Veredicto PASS con observaciones]
- `bash scripts/verify-traceability.sh --feature 006`: rc=0, CUMPLE; 270 IDs vigentes, 191 trazados, 233/233 IDs propios mapeados, pureza 0 violaciones.
- SC-ESC6-119..130 definidos una vez en spec.md y citados en tasks.md (2 a 5 citas cada uno). Conteo tasks.md: 134 (118 [x], 16 abiertas); Fase 12 = 11 tareas, todas [ ].
- Matriz spec.md (REQ-006/008/016/019/027, EDGE-028) comparada con citas directas en tasks.md: coinciden REQ-008, REQ-027 y REQ-019 salvo T910; falta T924 en REQ-006 y EDGE-028; falta T910 en REQ-016 y REQ-019. La cabecera de la matriz excluye T901/T910/T911/T924 de forma explicita (tareas de prueba en vivo y documentales); contradice el criterio de aceptacion de T924. Observacion, no bloqueo.
- N2-16 PENDIENTE explicito (spec.md l.620; SC-ESC6-125 marcado); no cuenta como defecto.
- research.md §2.2: frase obsoleta «KEEP no necesitan su foto» ya no aparece (corregida).
- Sin modificar archivos del proyecto, sin [x], sin commit/push.

## [2026-11-19 | Gate estructural 006 Fase 13 (T935..T943, DRAFT) | Veredicto PASS con observaciones]
- `bash scripts/verify-traceability.sh --feature 006`: rc=0, CUMPLE; 278 IDs vigentes, 241/241 IDs propios mapeados, 195/278 trazados, pureza 0 violaciones.
- SC-ESC6-131..138 definidos una vez cada uno (negrita, Given/When/Then) y citados en spec, plan §12 y tasks.md. SC-128..130 marcadas SUSTITUIDA, citadas solo en registro (T931/T932/T935) y en plan §12; sin huérfanas.
- T935..T943: 9 tareas, todas [ ]. Conteo tasks.md: 143 líneas de tarea, 143 IDs distintos (128 [x], 15 abiertas). Cobertura declarada 241: coincide.
- Matriz spec.md (cabecera excluye T901/T910/T911/T924/T935 por diseño): REQ-005/007/016/019/034, INV-001/004/010/011/017 y NFR-004 contienen T936..T941 que los citan; sin faltantes.
- Contratos: 0 cambios en specs/006/contracts; scene.schema.json parsea, 10 additionalProperties false.
- Observación (no bloqueo): N2-16 sigue PENDIENTE en spec.md (fila Decisiones, SC-125) pese a B+C resuelta en bus e implementada en Fase 12. Firma de Neo, no defecto de /architect.
- N2-17 pendiente de Neo: no contada como defecto.
- Sin modificar archivos del proyecto, sin [x], sin commit/push, sin tocar registro.
## [2026-11-19 | Gate estructural 007 (T1005) | Veredicto BLOQUEADO por citacion]
- verify-traceability.sh --feature 007: rc=2 por fuente ausente error-catalog.json (esperado hasta T1013; el script aborta antes de sus comprobaciones).
- Trazabilidad nativa: 0 historias huerfanas; etiquetas GH #11..#15 y #51 presentes en cada bloque, sin huerfanas; contratos solo README (esperado).
- Defectos: D1 NFR-007-003 sin tarea; D2 EDGE-007-004 sin cita. Observaciones O1..O5 en el acta.
- Sin commit, sin push, sin [x], sin COMPLETED.

## [2026-11-19 | Re-validación gate 007 T1005 | Veredicto PASS]
- D1 (NFR-007-003 en T1003), D2 (EDGE-007-004 en T1015 y T1068), O1 (version entero ≥1 en T1013), O2 (SC-007-002/014/019/020 literales), O3 (REQ-REG7-003 descartada en spec l.112) y O4 (EDGE-007-021 anotado en spec l.78): todos corregidos en disco.
- 0 huérfanas; 51 tareas `[ ]`, 0 `[x]`; etiquetas GH completas en bloques A..F. verify-traceability 007: fuente ausente error-catalog (esperado hasta T1013).
- Acta: .specify/memory/audits/mouse-007-estructura.md (sección 10). Sin commit, sin push, sin [x], sin COMPLETED.

## 2026-11-19 — Gate estructural 006 Fase 14 (T944..T960, D6-22)
- Veredicto: BLOCKED. Acta: .specify/memory/audits/mouse-006-fase14.md.
- Defecto bloqueante: T824 [HUM] aparece `[x]` en el arbol de trabajo (HEAD y bus: `[ ]`), sin firma de Neo en disco. Mouse no lo modifica; requiere confirmacion de Neo o reversion.
- Fase 14: 17 tareas `[ ]`, 0 IDs duplicados, conteo 160 coherente, verify-traceability --feature 006 rc=0 CUMPLE, REQ-ESC6-017/026/027/028/031, NFR-ESC6-001, N2-01/02/04/12 citados; N2-10 solo por T885 (observacion).
- Sin commit, sin push, sin [x] ni COMPLETED.

## [2026-11-19 | Re-validación 2 Fase 14 (T944..T960, DEF-M14-R1) | Veredicto PASS]
- spec.md:176 (REQ-ESC6-027) y :375 (SC-ESC6-042) dicen «0 dependencias npm nuevas» (D6-23 (f), T960 E1); la dependencia de imagen auditada ya no es condición (solo aparece negada).
- verify-traceability --feature 006 rc=0: 241/241 1:1, 198/278 trazados (informativo), purity 0.
- T944..T960: 17 presentes, 0 IDs definidos dos veces, 17 en [ ]. Único [x] nuevo vs HEAD: T824 (confirmada por Neo, D6-23 (a)).
- T958 y research §2.3-bis: retención, borrado, región y SLA declarados [verificar].
- Observación no bloqueante: spec.md:176 conserva «hasta resolver N2-01» para ARGOS_SCENE_REF_MAX_PX; /architect puede anotar la sustitución.
- Acta: .specify/memory/audits/mouse-006-fase14.md sección 8. Sin commit, sin push, sin [x], sin COMPLETED.
- 2026-11-20 mouse T1109 (008, ec50937): gate estructural BLOCKED por criterio 1 (ADR-008-03 citado en spec.md:14,85,136 sin traza en tasks.md). Traza 36/85, 49 FAIL solo evidencia de código; 0 FAIL estructurales del script. Acta .specify/memory/audits/mouse-008-estructura.md. Sin commit, sin [x].

## 2026-11-20 mouse T1109 R2 (008, 12e4d95): PASS criterios 1..7
- Criterio 1 cerrado: ADR-008-01..13 con tarea en tasks.md (13/13). Traza 36/85; 49 FAIL solo codigo, 0 estructurales. Acta .specify/memory/audits/mouse-008-estructura-r2.md. Sin commit, sin [x].

## 2026-11-20 mouse T1109 R3 (008, cebdf9f): PASS criterios 1..7 con observaciones
- Traza 37/87 (antes 36/85); 50 FAIL solo evidencia de código; 0 FAIL estructurales. Tareas: 64 `[ ]`, 36 diferidas sin casilla, 0 `[x]`.
- O5 nuevo: EDGE-008-037 y -039 activos sin cita en tasks.md (no diferidos). No bloquea el veredicto; `/architect` puede citarlos. Acta .specify/memory/audits/mouse-008-estructura-r3.md. Sin commit, sin push.

## 2026-11-23 mouse T1206 (009): BLOCKED por 1 defecto de criterio 3
- Traza: 153 IDs propios, 152 con tarea y 1 diferido (REQ-APR9-006). Tareas: 107 con casilla (F0 7, F1 15, F2 9, F3 19, F4 18, 5a 19, 5b 15, Cierre 5), 3 [x] previas.
- Defecto D-1: spec.md tiene [GH:#17] activa en lineas 32, 69, 161 y 291; debe ser «(deuda #17)». Criterios 1, 2, 4, 5 y 6 cumplen.
- verify-traceability.sh --feature 009: exit 2 por error-catalog.json ausente; esperado (T1217 [ARCH] existe).
- Acta .specify/memory/audits/mouse-009-estructura.md. Sin commit, sin [x].

## 2026-11-24 mouse T1403 (010): PASS con observaciones no bloqueantes
- Gate: verify-traceability --feature 010 RC=0 (75/75 1:1, purity 0). 44 tareas [ ] (T1401..T1444), 0 [x]. [GH:#65,#66,#67,#75,#33] presentes. Fases en orden. error-catalog DRAFT 3 códigos.
- Observaciones O-1 (ERR-ACE10-* sin cita en spec/tasks), O-2 (rangos sin ID literal), O-3 (IDs ajenos). Acta .specify/memory/audits/mouse-010-T1403-estructura-2026-11-24.md. Sin commit, sin push, sin [x].

## 2026-11-25 mouse 011 (estructura): PASS CON OBS
- Gate: verify-traceability --feature 011 rc=0 (120/120 1:1, pureza 0). 9/9 US con tareas (A..I), 0 huérfanas, 61 tareas T1501..T1561 sin huecos, 0 [x], 0 Dep rotas.
- Pendientes de Neo: presentes (7 filas, 11 IDs; la cifra 9 no se reproduce, OBS-1). Ninguno decidido; D11-02 abierta. Catálogo errores 011 existe y es JSON válido.
- OBS: 29 tareas sin etiqueta de tipo (OBS-4); SC individuales aún en rango (OBS-5). Acta .specify/memory/audits/mouse-011-estructura-2026-11-25.md. Sin commit, sin push, sin [x].

## 2026-11-26 mouse T1608 (012): BLOCKED por 1 defecto de ID (INV-HOUSE-004)
- verify-traceability --feature 012 rc=0 CUMPLE (331 IDs, 295/295 1:1, pureza 0); 0 casillas [x]; 0 APPROVED/LOCKED; US1..US5 con tareas, 0 huérfanas; contratos JSON y OpenAPI 3.1.0 parsean.
- INV-HOUSE-004 NO resuelto: en 001 es «visibilidad solo por membresía activa»; la regla de asignación no existe literal en 002 (anexo §5 la cita como texto vigente de la 002) y spec.md:15/199 mantienen «pendiente de /mouse». D-1..D-3 para /architect; el ID lo asigna Neo. Acta .specify/memory/audits/mouse-012-T1608-2026-11-26.md. Sin commit, sin push, sin [x].

## 2026-11-27 mouse 012 Bloque C (pasada única, T1650/T1651/T1660): BLOCKED
- verify-traceability --feature 012 rc=0 (299/299 1:1, pureza 0). Limitación: la compuerta no ve las brechas D-1 y D-2.
- D-1 (bloqueante): error-catalog x-sdd-metadata 0.3.0 con status APPROVED; ERR-CAR12-ROUTINE-STALE está DRAFT pendiente de Neo.
- D-2 (bloqueante): REQ-CAR12-002 sin cita por ID en tasks.md (SC-012-040 solo por rango).
- D-3 (menor): ERR-HOUSE-NOT-FOUND usado en care.openapi.yaml, ausente de inherited del catálogo 012.
- Schemas: 0 objetos abiertos. OpenAPI 14 operationId, códigos ERR-CAR12 presentes. Acta .specify/memory/audits/mouse-012-bloqueC-unica-2026-11-27.md. Sin commit, sin push, sin [x].

### 2026-11-27 — T1647 validación estructural (HEAD 09d913e)
- verify-traceability --feature 012: rc=0 (CUMPLE, 299/299).
- Veredicto BLOCKED: D-1 MAYOR (R-02/R-03/R-09 con significado distinto en lock y trinity; trinity T1647-03), D-2 MENOR (REQ-CHP12-003 sin cita literal), W-1 MENOR (T1632 sin ID).
- Acta: .specify/memory/audits/mouse-012-bloqueB-T1647-2026-11-27.md. Solo lectura; sin [x], sin commit.
### 2026-11-27 — T1647 revalidación tras 305df23 (HEAD 348faa3)
- verify-traceability --feature 012: rc=0 (CUMPLE, 299/299); --task T1647: rc=0.
- D-1 (lock R-02/R-03/R-09), D-2 (REQ-CHP12-003 en T1635), W-1 (REQ-CHP12-007/009 en T1632): cerrados en texto. Veredicto PASS con observación menor.
- Acta: .specify/memory/audits/mouse-012-bloqueB-T1647-revalidacion-2026-11-27.md. Solo lectura; sin [x], sin commit, sin logos.*.
