# Bitácora Incremental — The Architect (`/architect` — Arquitecto SDD)

> **Regla Write-Ahead Log:** Cada vez que `/architect` tome una decisión (`CC-*`), modifique `spec.md`, `plan.md`, `.specify/memory/constitution.md` o `contracts/**`, debe añadir una entrada fechada al final de este archivo antes de responder en el chat.

---

## `[2026-11-09 | Bootstrap Inicial desde Commit 329c392]`
- **Estado Normativo Vigente:**
  - `.specify/memory/constitution.md` v2.4.0 (`REVIEW` — §1–§6 intactos, §7 añadido para estructura Spec Kit).
  - `specs/001-pet-health-tracker/spec.md` v2.4.0 (Aprobada por Arquitecto con hash `2eef58a2fc8944fe`; 63 IDs normativos intactos).
  - `specs/001-pet-health-tracker/plan.md` v2.3.0 (`REVIEW`).
  - `specs/001-pet-health-tracker/tasks.md` v2.3.0 (`REVIEW`; líneas `T001..T016` con alias `TASK-100..TASK-115`).
  - `contracts/**`: 12 contratos formales intactos en la raíz del proyecto (96 IDs vigentes verificados por `scripts/verify-traceability.sh`).
- **Decisiones Recientes Registradas:**
  - Ratificadas las 6 decisiones de migración Spec Kit en `.specify/memory/speckit-migration-2026-11-09.md` (líneas 190–197).
  - Re-ubicado `spec-review.md` en `.specify/memory/audits/spec-review.md` como checklist de gobernanza ARGOS fuera de la carpeta de la feature.
- **Pendiente para `/architect`:**
  - Acompañar a `/oracle` y a **Neo** en el cierre formal de `spec-review.md` y `TASK-115` (`T016`).

## 2026-11-10 — Migración real a Spec Kit
- Contratos reubicados en la feature; scripts y tests actualizados; spec-system.md, README y CLAUDE.md con rutas nuevas.
- Historia no canónica preservada en .specify/memory/history-001-pet-health-tracker.md.
- Verificado: verify-traceability 96/96, verify-oracles OK, tsc limpio, vitest 580/580, src/generated idéntico.

## 2026-11-10 — Hallazgo 6 y backlog Feature 002 (checkpoint)
- Escrito `.specify/memory/audits/hallazgo-6-traduccion-errores.md`: diagnóstico, diseño solo en presentación (nuevo schema-messages.ts), archivos, REQ-UI-*, criterios. Decisiones para Neo: D1 (solo presentación vs cambio de contrato para 422 de servidor) y D2 (REQ-UI-005 dice "mensajes del catálogo").
- Escrito `.specify/memory/backlog-feature-002.md` con hallazgos 2, 5 y 7 y preguntas abiertas. No se creó specs/002-*.
- Sin cambios en specs/**, contracts/**, src/**, tests/**, tasks.md. Sin commit.

## 2026-11-10 — Fase 2: análisis v2.1 contra 001 (checkpoint)
- Escrito `.specify/memory/audits/fase-2-analisis-v21.md`: A (24 filas de brecha + 19 pantallas + 10 incoherencias internas de la v2.1), B (timeout de sesión, especies, cuenta/perfil, hogares), C (Ruta 1 enmienda vs Ruta 2 Feature 002), D (hoja de ruta F0..F8, marcas Nivel 2).
- Recomendación: Ruta 2 (Feature 002 tras cerrar 001), implementación por rebanadas; SSO, recuperación por correo y adjuntos PDF diferidos. Pendiente decisión Nivel 2 de Neo.
- Numeración de hallazgos inconsistente entre la orden de Fase 2 y los archivos previos (nota en el documento). Sin cambios en specs/**, contracts/**, src/**, tests/**, tasks.md. Sin commit ni push.

## 2026-11-10 — Hoja de ruta Feature 002 (checkpoint)
- Escrito `.specify/memory/audits/hoja-de-ruta-feature-002.md`: A decisiones de Neo con impacto en contratos/RBAC, B fases F0–F8 con [N2], C tabla de sustitución de pruebas 001→002, D seis rebanadas con criterio verificable, E fuera de alcance (003), F correcciones previas en la 001, G pendientes (6-A/6-B sin confirmar).
- Sin cambios en specs/**, contracts/**, src/**, tests/**, tasks.md, constitución. Sin commit ni push. `specs/002-*` requiere autorización aparte (F3).

## 2026-11-10 — Hallazgo 6-A: alta de T058 en tasks.md (checkpoint)
- Decisión de Neo (opción A de REQ-UI-005, confirmada dos veces): traducir errores de esquema solo en presentación; el código ERR-SCHEMA-VALIDATION-FAILED no cambia; spec 001 sin enmienda.
- Se añade T058 (`[ ]`) al final de la Fase 9 de `tasks.md` y se cita en Dependencies. Sin tocar contratos, src, tests, constitución, spec ni package.json. Sin commit ni push.

## 2026-11-10 — F3: rama 002-plataforma-v21 y spec.md DRAFT (checkpoint previo)
- Autorizado por Neo (N2): crear la rama `002-plataforma-v21` desde `001-pet-health-tracker` (3ae0847) y `specs/002-plataforma-v21/{spec.md,contracts/README.md}`. Decisiones 1A-7B aplicadas; `supersedesId` se decide: calculado, no persistido (coherente con C-16).
- Sin commit ni push; sin tocar 001, src, tests, tasks.md ni constitución.

## 2026-11-10 — F3 entregada: spec.md DRAFT (checkpoint)
- Rama `002-plataforma-v21` creada. `specs/002-plataforma-v21/spec.md` (DRAFT, 8 historias, requisitos REQ/INV/STATE, SC-001..015) y `contracts/README.md`. `supersedesId`: calculado, no persistido (C-16).
- Sin commit ni push; 001, src, tests, tasks.md y constitución intactos. Siguiente: revisión de Neo y `/mouse` (F5).

## `[2026-11-10 | F5-fix Cambios de la auditoría de Mouse que no dependen de Neo]`
- Checkpoint: aplico a `specs/002-plataforma-v21/spec.md` los cambios 7-10, 12-17 y la poda del 6 (decisión del arquitecto). Solo spec (DRAFT).
- Dejo `[PENDIENTE N-x]` en 1, 2, 3, 5, 6/11 (hash con sal): dependen de Neo. Sin commit, sin push; 001, src, tests y constitución intactos.
- Hecho: cambios 7-10,12-17 y poda aplicados en spec.md; marcados [PENDIENTE N-1..N-5]. Esperando respuestas de Neo y repetir F5.

## `[2026-11-10 | Architect aplica N-1..N-5 y prepara borrador de enmienda]`
- Checkpoint: aplico en spec 002 las decisiones de Neo (N-1 A HMAC, N-2 A token efimero, N-3 A enmienda, N-4 B, N-5 A) y cierro hallazgos Mouse 1, 2, 3, 5 y H-F5-02.
- Escribo borrador `.specify/memory/audits/enmienda-constitucion-002-borrador.md` (no toca constitution.md). Spec sigue DRAFT; sin commit ni push.
- 2026-11-10 architect: spec 002 sin `[PENDIENTE]` (N-1..N-5 aplicados; token 10 min, ARGOS_AUDIT_HMAC_SECRET provisional). Borrador de enmienda 3.1.0 MINOR escrito; constitution.md intacta. Sin commit ni push.

## `[2026-11-10 | Architect cierra huecos de reauditoria Mouse: N-B, N-C, N-A, H-F5-05, N-E]`
- Checkpoint: voy a (1) anadir el parrafo Sistema (roles 002) a la enmienda, (2) corregir la cita de versionado (MINOR = "nuevos"), (3) fijar en REQ-AUD-001 entityId de ACCOUNT_DELETE, filas por mutacion compuesta y enums, (4) corregir citas de orden en REQ-PET2-002 y REQ-HOUSE2-004.
- Solo toco spec.md de la 002 y el borrador de enmienda. Spec sigue DRAFT; sin commit ni push.

## `[2026-11-10 | Architect aplica aprobación de Neo: spec APPROVED + constitución 3.1.0]`
- Checkpoint: voy a (1) pasar Status de la spec 002 a APPROVED, (2) aplicar la enmienda 3.1.0 a constitution.md (Sistema, Autenticación, Principio IV, Sync Impact Report, línea de versión), (3) revisar spec-system.md y plantillas por valores antiguos.
- No toco specs/001-*, src/, tests/, tasks.md. Sin commit ni push; nada COMPLETED.
- Cierre: spec APPROVED, constitución 3.1.0 aplicada (hallazgo: la cabecera no debe contener la frase literal del marcador de IDs retirados; el script toma la primera línea que la contenga). Trazabilidad CUMPLE, tsc OK.

## `[2026-11-10 | Architect F4 | Inicio: plan y contratos de la Feature 002]`
- Checkpoint: leídos spec APPROVED, constitución 3.1.0, insumos de Maggie/Trinity/Rama y decisiones de Neo (M1, T1-T8, R1-R7). Voy a redactar plan.md, data-model.md, quickstart.md y contracts/{schemas,openapi,state-machines,errors} en specs/002-plataforma-v21/.
- Alcance: solo documentación y contratos. No toco specs/001-*, src/, tests/, tasks.md, constitución ni insumos. Sin commit ni push; nada COMPLETED.

## `[2026-11-10 | Architect F4 | Cierre: plan y contratos de la Feature 002 redactados]`
- Entregados en specs/002-plataforma-v21/: plan.md (17 ADR-002-NN, check de constitución), data-model.md, quickstart.md, contracts/README.md, 6 esquemas JSON, OpenAPI 3.0.0 (40 operaciones), 5 máquinas de estado, catálogo de 35 errores. Esquemas verificados con Ajv estricto; OpenAPI sin $ref rotos ni códigos de error desconocidos.
- Pendientes de Neo: autorizar scripts de compilación hacia la 002 (Nivel 2); aprobar IDs sin equivalente en la spec (STATE-ACCOUNT-DELETE-001, ERR-PET-MICROCHIP-DUPLICATE, ERR-RATE-LIMITED); retiro de ERR-AUTH-USER-NOT-FOUND y ERR-HOUSE-MEMBER-ALREADY-EXISTS.
- Sin commit ni push; nada COMPLETED; contratos en REVIEW; no se tocó 001, src/, tests/, constitución ni insumos.

## `[2026-11-10 | Architect F4-fix | Inicio]`
- Corrige hallazgos F4-A1..A3, M1..M4, B1..B5 de /mouse (autorizado por Neo vía Morpheus). Contratos siguen en REVIEW.
- Solo specs/002-plataforma-v21/ (más L380 de spec.md). F4-M5 y 3 IDs quedan pendientes de Neo.
- Sin commit ni push; nada COMPLETED.

## `[2026-11-10 | Architect F4-fix | Cierre]`
- Aplicados F4-A1..A3, M1..M4, B1..B5 en specs/002-plataforma-v21/ (esquemas identity, audit, medical-records; máquinas de eliminación y alerta; catálogo; OpenAPI; plan; data-model; spec L380). A3: reasignar al nuevo dueño en transferencia y seudonimizar en B8. M3: HMAC de petId:householdId. M4: SUPERSEDED, a validar por Maggie.
- Verificación: 6 esquemas Ajv 2020 strict OK, 5 máquinas y catálogo parsean, OpenAPI 345 $ref y 0 rotos.
- Pendiente de Neo: F4-M5 (POST de exportación, X-Argos-Import-Confirm, fileDigest) y 3 IDs. Sin commit ni push; contratos en REVIEW; nada COMPLETED.

## `[2026-11-10 | Architect F6 | Inicio: tasks.md de la 002 y borrador del Principio III]`
- Checkpoint: leídos spec APPROVED, plan, data-model, quickstart, contratos, hoja de ruta (F8 y sección C) y tasks.md de la 001 (formato). Voy a crear specs/002-plataforma-v21/tasks.md, checklists/sustitucion-pruebas-001.md y .specify/memory/audits/enmienda-principio-iii-002-borrador.md.
- Alcance: solo documentos nuevos. No toco specs/001-*, src/, tests/, constitución ni artefactos de F4. Sin commit ni push; todas las tareas nacen [ ].

## `[2026-11-10 | Architect F6 | Cierre de tasks.md y sustitución]`
- Creados specs/002-plataforma-v21/tasks.md (110 tareas T201-T310, fases 1-8) y checklists/sustitucion-pruebas-001.md (22 filas de sustitución + 24 IDs reemplazados). Todo [ ]; nada COMPLETED.
- Cobertura de IDs de spec.md (117): 93 vigentes con tarea; los 24 restantes son IDs de la 001 reemplazados, cubiertos por la tabla.
- Falta la tarea B (borrador del Principio III). Sin commit ni push.

## `[2026-11-10 | Architect F6 | Cierre total: tasks.md + sustitución + borrador Principio III]`
- Creado .specify/memory/audits/enmienda-principio-iii-002-borrador.md (3.1.0 -> 3.2.0 MINOR, pendiente de firma Nivel 2 de Neo). Constitución intacta.
- tasks.md: 110 tareas (F1 6, F2 19, F3 10, F4 17, F5 18, F6 12, F7 14, F8 14). Tabla de sustitución: 22 filas, 0 pruebas borradas.
- Sin commit ni push; nada COMPLETED; no se ejecutaron compile-contracts ni codegen.

## `[2026-11-10 | Architect F6-fix | INICIO correcciones tasks.md (auditoría Mouse)]`
- Aplicando 7 correcciones autorizadas por Neo a specs/002-plataforma-v21/tasks.md.
- Solo ese archivo; sin renumerar, sin commit ni push, nada COMPLETED.
- Firma de enmienda III: nueva T204a [N2].

## `[2026-11-10 | Architect F6-fix | FIN]`
- tasks.md corregido (7 puntos): decisiones cerradas, firma T204a [N2], marcas [N2], refs T265/T276, [P] quitado en T223/T251/T289-T292, T293 movida antes de T289.
- Sin commit/push; todo sigue [ ]; sin scripts ejecutados.

## `[2026-11-10 | Architect F7-doc-fix | INICIO]`
- Tres correcciones documentales por hallazgo de Keymaker: T220 (IDs retirados), T202 (12 a 13 contratos), README contratos 002 (palabras registradas).
- Solo se editan tasks.md y contracts/README.md de la 002; sin commit/push; todo sigue [ ].

## `[2026-11-10 | Architect F7-doc-fix | FIN]`
- T220: sin IDs retirados en la línea de trazabilidad (quedan REQ-HOUSE2-001, INV-HOUSE-003, ERR-RATE-LIMITED, ERR-HOUSE-INVITATION-NOT-FOUND); T202: 13 contratos; README: $anchor registrado en la lista.
- Sin commit/push; todo [ ]. Siguiente: /oracle revalida compuerta de T220.

## `[2026-11-11 | Architect T207-fixtures | INICIO]`
- Despachado por Morpheus (decisión Neo): fixtures NATIVOS 002 en specs/002-plataforma-v21/contracts/examples/ (canonical-fixtures.json + README.md).
- Fuentes: contratos 002 y spec aprobada; fixtures 001 solo como referencia de formato. Verificación con script en scratchpad contra src/generated/schemas/validators.mjs.
- Sin editar src/, tests/, scripts/, contratos ni tasks.md; sin commit/push.

## `[2026-11-11 | Architect T207-fixtures | FIN]`
- Entregados canonical-fixtures.json (v1.0.0, REVIEW) y README en specs/002-plataforma-v21/contracts/examples/; 226 casos válidos y 181 inválidos; verificación contra validators.mjs: 0 fallas, 10 casos bloqueados.
- Discrepancia D-F8-01: pet.schema SpeciesOther (allOf type string + null) rechaza speciesOther nulo; PetProfile/BackupPetProfileV3 de las 7 especies no OTHER no pueden validar. Contrato sin tocar; escala a Morpheus.
- Sin commit/push; todo [ ].

## `[2026-11-11 | Architect D-F8-01 PATCH | INICIO]`
- Corrección de SpeciesOther en specs/002-plataforma-v21/contracts/schemas/pet.schema.json (oneOf null | texto 1-60), autorizada por Neo.
- Solo ese archivo; sin recompilar, sin commit.

## `[2026-11-11 | Architect D-F8-01 PATCH | FIN]`
- SpeciesOther reescrito (pet.schema.json líneas 52-69): oneOf [null | string 1-60 trimmed]; x-sdd-error conservado. Regla OTHER ya aplicada por if/then/else en PetProfile, CreatePetInput y BackupPetProfileV3.
- Verificación Ajv 2020 strict+strictTypes: 5 comprobaciones OK en PetProfile y BackupPetProfileV3. Sin recompilar, sin commit.

## `[2026-11-11 | Architect T219 texto | INICIO]`
- Contrato OpenAPI 3.0.0 (/account/deletion) y account.routes.ts (POST /api/account/deletion) confirmados; tasks.md T219 dice `DELETE /users/me`.
- Se corregira solo la ruta en la linea de T219; estado `[ ]` y demas palabras intactos. Sin commit.

## `[2026-11-11 | Architect T219 texto | FIN]`
- tasks.md linea 82: `DELETE /users/me` -> `POST /api/account/deletion` (servers base /api + path /account/deletion). Estado `[ ]` intacto.
- Solo ese archivo editado; sin commit.
## `[2026-11-11 | Architect fila 33 sustitucion-pruebas-001 | INICIO]`
- Oracle: la redaccion de la fila 33 sugiere que DRAGON es una especie equivalente y omite `?species=BIR` -> `?species=DRA`.
- Se reescribe solo la columna de cambio de la fila 33; sin commit.
## `[2026-11-11 | Architect Hoja de ruta: filas tabla C, diferimiento D-10, 32→44 | CIERRE]`
- Tabla C: añadidas filas `tests/unit/use-cases.households.spec.ts` (verificado en disco: ADMIN/CAREGIVER/READER, `roleOnJoin`; residuo `role: 'MEMBER'` línea 78) y `tests/integration/persistence/roles-migration.spec.ts` (nuevo, sin seguimiento en git; complementa, no sustituye).
- Nota D-10 añadida bajo la tabla C (diferimiento de `tests/unit/presentation/` a T284, verificado `presentation-fixtures.ts:5`). Corrección 32→44 en la fila de `permissions-matrix` (SC-008: 11 filas × 4 roles). Pendiente: filas A.4 y D.3(a) siguen diciendo 32.
- Solo se editó `.specify/memory/audits/hoja-de-ruta-feature-002.md`; sin commit, sin push, sin marcar tareas.
- 2026-11-11 Architect (T236, doc-only): corrección 32→44 celdas en .specify/memory/audits/hoja-de-ruta-feature-002.md, líneas 18 y 96. Cifra verificada en spec.md: REQ-RBAC-001 tiene 11 filas de acción × 4 roles = 44 (SC-008). Sin commit, sin push, sin tocar contratos/specs/src/tests/tasks.md.
