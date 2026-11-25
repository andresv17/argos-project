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

### 2026-11-14 — Architect: inventario funcional para rediseño UI (architecture_spec.md)
- Generado `architecture_spec.md` en la raíz (4 secciones pedidas por Neo). Solo lectura de src/, contratos y tests; sin cambios de código.
- Brechas verificadas (sec. 4.3): B-1 invitación imposible (falta roleOnJoin en UI; 422 verificado en vivo), B-3 formularios de registros solo con editPetBasics (CAREGIVER no los ve), B-4 species vs filter, B-5 T284 (2 de 8 especies), B-7 sin manejo de 401, B-10 dos textos E2E desfasados y selector INVITED obsoleto, B-11 15 pruebas por fixtures 001, B-12 playwright sin ARGOS_AUDIT_HMAC_SECRET.
- No ejecutado: E2E de Playwright.

### 2026-11-14 — Architect: enmienda de redacción REQ-UI2-001 y T287 (decisión de Neo H-BP2-12)
- Decisión soberana de Neo: "Perfil" (/cuenta) como cuarto enlace directo en `<nav aria-label="Principal">`; sin menú del avatar; sin barra inferior móvil (WCAG 2.4.3).
- Editados solo `specs/002-plataforma-v21/spec.md` (REQ-UI2-001) y `tasks.md` (T287). IDs, requisitos funcionales y contratos intactos; sin estados COMPLETED/APPROVED/LOCKED tocados.

### 2026-11-14 — Architect: armonización de T288 con Opción A (orden de Neo, Nivel 2)
- Orden de Neo: el riel de mascotas en `/` es flex con scroll (listbox/option), no grilla de 1, 2 o 3 columnas.
- Editada solo la línea T288 de `specs/002-plataforma-v21/tasks.md`: reemplazado el fragmento de grilla por riel flex con scroll, flechas, Home, End, Enter, Espacio y desbordamiento a 320/768/1024/1280 px. ID, casilla y REQ intactos.
- Sin estados COMPLETED/APPROVED/LOCKED; sin commits; spec, constitución, contratos, src/ y tests/ intactos.

### 2026-11-14 — Architect: armonización de spec.md con navegación de cuatro enlaces (H-V22-4)
- Editadas 3 referencias en `specs/002-plataforma-v21/spec.md`: US8 escenarios 1 y 2 (L154-155) y nota de consistencia clase b (L361). Eliminadas las menciones a menú del avatar y barra inferior; alineadas con REQ-UI2-001 enmendado.
- IDs, requisitos y escenarios ajenos intactos. Sin COMPLETED/APPROVED/LOCKED; sin commits; sin tocar constitución, contratos, src/, tests/ ni §4.5 del blueprint.

### 2026-11-14 — Architect: Enmienda D-N1 opción A, decisión de Neo (2026-11-14) en architecture_spec.md §3.6 y §3.7
- §3.6 (L277, L289-290): la UI consume `POST /backup/import/preview` y muestra `sourceSchemaVersion`, `counts`, `collisions`, `affectedSharedPets` (`fileDigest` interno); barra de fases Validando, Previsualizando, Aplicando, Terminada (COMPLETED), Revertida (ROLLED_BACK) como resumen de STATE-BACKUP-001. Campos verificados contra `ImportPreviewResult` en backup-envelope.schema.json (coinciden).
- §3.7: retirado "Respaldo: vista previa de importación". Solo se editó architecture_spec.md. Sin COMPLETED/APPROVED/LOCKED; sin commits.

### 2026-11-14 — Architect: análisis T304 (solo lectura)
- Leída la tabla `specs/002-plataforma-v21/checklists/sustitucion-pruebas-001.md` (34 filas, sin columna de estado) y clasificadas las 27 pruebas rojas: a=25 (listadas, sustitución incompleta), b=2 (scrypt `verify` sin tope de N; `audit-pseudonym` contra la lista negra del secreto de fixtures), c=0.
- Causa de H-T303-2: `generated-contracts.spec.ts` y `canonical-fixtures.spec.ts` leen catálogo y fixtures de `specs/001` mientras `src/generated/` se compila desde la 002 (T207 cambió el defecto). Corrección mínima: rutas a `specs/002` y fixtures 001 solo vía `upgradePet` en casos legado.
- Propuesta (PENDIENTE DE FIRMA DE NEO): columna «Estado», regla 6, filas 35 y 36. No se escribió en la tabla. Hallazgos H-T304-1..4 en `claude/analisis-t304-pruebas-001.md`. Sin cambios en specs, contratos, src ni tests; sin commits.

### 2026-11-14 — Architect: decisiones de Neo sobre T304 ejecutadas (sin commit)
- `sustitucion-pruebas-001.md`: columna «Estado» (34 filas en `pendiente`; ninguna verificada como sustituida y en verde: la compuerta T296 tiene 27 rojas repartidas y T304 no se ha corrido), Regla 6 con el texto firmado, fila 35 (generated-contracts/canonical-fixtures leen `specs/002`; fixtures 001 solo legado con `upgradePet`) y fila 36 (codegen-drift: `--feature 002` por defecto tras T207, regresión `--feature 001` conservada).
- `tasks.md`: tarea nueva T311 `[ ]` (ruta Fastify `DELETE /households/:householdId/invitations/:invitationId`, `cancelInvitation`, REQ-HOUSE2-002, STATE-HOUSE-MEMBERSHIP-001, 40 operaciones servidas); subsección nueva «Ruta pendiente de la rebanada 3» en Fase 8, antes de «Mutación, regresión y compuerta final». Nota: `tasks.md` L19 cita «T311» como compuerta final (referencia obsoleta, la final es T309); no se tocó.
- `verify-traceability.sh --feature 002`: 118/118, CUMPLE. Sin tocar src/, tests/, contratos.

### 2026-11-14 — Architect: Estado de sustitucion-pruebas-001.md tras el grupo (a) de Keymaker (sin commit)
- Verificado en disco que los archivos de las filas 3, 17, 19, 21, 26, 27, 30, 31, 32, 33, 35, 36 existen y contienen la prueba de la 002 (IDs `*2-*`, `FELINE/CANINE/DRAGON`, `upgradePet`, `specs/002`, `lastActivityAt`, `permissions`). El verde lo aporta el informe de Keymaker (1792 pruebas), no lo reejecuté.
- Esas 12 filas pasan a `sustituida` (regla 6); filas 19 y 21 con nota de huecos de interfaz Caso A (T284/T238) bajo la tabla. Quedan 24 en `pendiente`. No se marcó ninguna tarea; sin tocar otros archivos.

### 2026-11-14 — Architect: filas 4 y 22 de sustitucion-pruebas-001.md a `sustituida` (opcion A de Neo, sin commit)
- Los 4 archivos citados existen en disco. Fila 4: backup-migration.spec.ts tiene 9 coincidencias CANINE/FELINE/2.0.0/3.0.0; sqlite-backup-import.spec.ts tiene 4 pruebas de importacion pero 0 coincidencias con esos terminos. Fila 22: verify-gates.spec.ts tiene 45 coincidencias de rutas 002/multi; layer-dependencies.spec.ts tiene INV-ARCH-004 pero 0 coincidencias multi-feature.
- Se marcaron por decision explicita de Neo (aceptar pruebas en sus archivos reales). Quedan 22 en `pendiente`. No se toco otra fila, tasks.md, src/ ni contratos.

### 2026-11-14 — Architect: T304, 21 de las 22 filas pendientes pasan a `sustituida` (sin commit)
- Verificado con grep en disco (no solo por el mapeo de Keymaker) que los archivos de las filas 1, 2, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 18, 23, 24, 25, 28, 29, 34 existen y contienen la prueba de la 002 (IDs `*2-*`, `ADMIN/CAREGIVER/READER`, `lastActivityAt`, `EXPORT_*/INVITE_*`, `upgradePet`, `multipleOfPrecision`, `NOT_YET_SERVED`, 14 archivos nuevos de la fila 23). El verde lo aporta Keymaker (E1 663/663, E2 192/192) y el Oracle (1792/1792); no reejecuté.
- Fila 20 queda `pendiente` (wcag.spec.ts inestable, Keymaker corrige). Solo se edita la columna Estado de `sustitucion-pruebas-001.md`; sin tocar tasks.md, src/, tests/ ni contratos.

### 2026-11-14 — Architect: fila 20 de sustitucion-pruebas-001.md se queda `pendiente` (sin commit)
- grep en disco: wcag.spec.ts SI tiene los 4 anchos (L147-L151 «320, 768, 1024 y 1280 px», L159, L166, L173, L197 `/cuenta`). nine-vectors-four-roles.security.spec.ts SI tiene `describe('V9 XSS almacenado por rol')` (L252) con `ROLES` x4.
- NO confirmado: wcag.spec.ts tiene 0 coincidencias de recargar/reload/autenticado/household-counter. Solo existe `reload()` en tests/e2e/visual/household-counter.spec.ts L67 (refresca contadores del CAREGIVER expulsado), no un escenario «recargar sigue autenticado». Ninguna prueba e2e afirma sesion viva tras recargar.
- Decision: fila 20 sigue `pendiente`; no se edito la tabla, tasks.md, src/ ni tests/.

### 2026-11-14 — Architect: fila 20 de sustitucion-pruebas-001.md pasa a `sustituida` (sin commit)
- grep en disco: rebanada6-recorridos.spec.ts L120 contiene la prueba «recargar con page.reload() mantiene la sesión» (`page.reload()` L127, `GET /auth/me` L134 con [200, null, username], cookie `argos_session` igual L136).
- Siguen confirmados: nine-vectors-four-roles.security.spec.ts L252 (V9 por cuatro roles) y tests/e2e/accessibility/wcag.spec.ts (cuatro anchos, L147-L151). El verde (3/3 aislado, 8/8) lo aporta Keymaker; no reejecuté.
- Solo se edita la columna Estado de la fila 20; sin tocar tasks.md, src/, tests/ ni commit.

### 2026-11-14 — Architect: T307, revisión a mano del mapa SC-001..SC-017 del quickstart §4 (sin commit)
- grep en tests/ por ID `SC-0NN` y por título: 16 de 17 SC tienen al menos un título `it/test` que los cita (incluye SC-007 y SC-008, SC-009 y SC-006).
- Hallazgo: el mapa §4 NO lista SC-002 ni SC-007 como filas propias. SC-007 sí tiene prueba (rebanada6-recorridos.spec.ts L63). SC-002 (100 % de IDs con implementación y prueba) no la cita ninguna prueba en tests/; lo cubre la compuerta `scripts/verify-traceability.sh` (T306), que verify-gates.spec.ts prueba solo como herramienta.
- Resultado en `.specify/memory/audits/mapa-sc-002.md`. Sin tocar tasks.md, src/, tests/ ni contratos.

### 2026-11-14 — Architect: mapa-sc-002.md, SC-002 pasa a aceptado por Neo (sin commit)
- Instrucción de Morpheus con decisión de Neo (Logos, iteración 70): SC-002 queda cubierto por T306 (118/118 IDs, pureza 0) + T305 (0 débiles) + suite verde.
- Se editan SOLO L8 (fila SC-002) y L30 (nota SC-002) de `.specify/memory/audits/mapa-sc-002.md`; la reserva «sin prueba propia en tests/» se mantiene visible.
- Sin tocar tasks.md, src/, tests/, contratos ni commit.
- 2026-11-14 Architect: mapa-sc-002.md L27 ajustada a «SIN PRUEBA PROPIA: 0» por aprobación de Morpheus; solo esa línea, sin commit.

### 2026-11-15 — Architect: especificación SDD de la Fase 3 (feature 003 Cloud GCP) en `specs/003-cloud-gcp/` (DRAFT, sin commit)
- Lectura previa: SKILL, bus, entorno, handover Morpheus, constitución, 002, `app-config.ts`, `server.ts`, UoW/migraciones SQLite, Mirror (terraform y workflows, solo lectura). Free Tier de GCP y Neon verificados por WebFetch el 2026-11-15 (cifras en `research.md §1-2`); Cloud Scheduler y Cloud Run Tier 1 NO se pudieron leer completos (marcados supuesto, tarea T402).
- Decisiones de diseño: ADR-003-01..12 en `plan.md` (candado global `pg_advisory_xact_lock` para igualar `BEGIN IMMEDIATE`; migraciones fuera de la app con URL directa; mantenimiento por Cloud Scheduler porque el `setInterval` no corre con escala a cero; BigQuery diferido; estado Terraform propio).
- Hallazgos H-03-01..09: sin Dockerfile/healthz/estáticos; `HOST` solo 127.0.0.1; borrado físico (ADR-002-13) más débil en Postgres+PITR 6 h (R-02); Scheduler: Mirror ya usa 2 de 3 jobs gratis.
- Entregado: spec.md (REQ/NFR/SC + D-01..D-16), plan.md, research.md, data-model.md, quickstart.md, tasks.md (T401..T465, todas `[ ]`), contracts/README.md. `.specify/feature.json` NO modificado (el flujo manual no lo exige). Sin tocar src/, tests/, Dockerfiles, workflows ni terraform; sin gcloud/terraform.

## 2026-11-15 — Feature 003: aplicación de D-01..D-16 resueltas por Neo
- Purga de Grafana/BigQuery en `specs/003-cloud-gcp/`: retirados US6, REQ-IAC-011 (número conservado, sin renumerar), ADR-003-12 (marcado retirado), `grafana_ro`, `bigquery.tf`, research §6 (ahora observabilidad nativa en Cloud Logging) y Phase 9 (T463..T465). `grep -ic` = 0 en todo salvo 1 línea en `spec.md` («Fuera de alcance: Grafana y BigQuery (decisión de Neo)»).
- `spec.md` DECISIONES: D-01..D-16 registradas «RESUELTA por Neo (2026-11-15)»; D-05 sin `GCP_SA_KEY` (REQ-CICD-006 ajustado). tasks.md: 62 tareas T401..T462, 0 en `[x]`, mapa 1:1 sin huérfanos (T403, T406, T462 añadidas al mapa; T407 anotada como compuerta transversal).
- Redactado `.specify/memory/audits/enmienda-constitucion-003-borrador.md` (MINOR 3.3.0, `DRAFT`, pendiente de firma de Neo); `constitution.md` intacta. Nada `APPROVED`/`LOCKED`; sin commit ni push.

## 2026-11-15 — Architect: respuesta a los 10 hallazgos ALTOS de /lock sobre la 003 (sin commit)
- Resueltos en spec/plan/tasks los técnicos H-LOCK-001, 003, 004, 005, 006, 007, 009, 010: REQ-PG-012..015, REQ-IAC-012..013, REQ-CICD-009..010, REQ-SEC-008, NFR-CLD-013, SC-CLD-013..020, ADR-003-13..17 y Phase 9 (T463..T476); ajustes en REQ-CLD-002/004/006, REQ-PG-004/006/011, REQ-IAC-005/007/010, T402, T415, T420, T421, T425, T429, T438, T440, T446, T448, T452, T455, T457, T462.
- D-17 (H-LOCK-002) y D-18 (H-LOCK-008) dejadas en `spec.md` como «PENDIENTE — Neo» con recomendación (A+B con alerta semanal de CU-h; separar cuenta de plan); T474 las recoge. D-06 reevaluación marcada para /rama (T452).
- Verificación por script: 86 IDs REQ/NFR/SC con mapa 1:1 (0 huérfanos, 0 IDs desconocidos), 76 tareas T401..T476 todas `[ ]`, sin ciclos de dependencia. Sin tocar src/, tests/, terraform/, workflows, constitución ni el informe de /lock.

## 2026-11-15 — Architect: recortes de /mifune aplicados a la 003 (sin commit)
- Aplicados H-MIF-001..005, 010..014 y 016 en spec/plan/tasks/research de `specs/003-cloud-gcp/`: sin job `compat` (retirados REQ-CICD-010, NFR-CLD-013; T468 condicionada), T469+T470+T476 fusionadas en T469, runbook de rotación a un párrafo, Terraform plano, sin puerto OIDC, sin `objectAdmin`, vacuum semanal, `code-quality` solo hadolint/actionlint, una política `keep` de AR, ADR fusionados y retirados (ADR-003-07/10/12, NFR-CLD-003 fundido en NFR-CLD-001). H-MIF-016: T477 verifica el pooler de Neon; `idle_in_transaction_session_timeout` se conserva.
- No aplicados: D-19 (H-MIF-007), D-20 (H-MIF-008) y D-21 (H-MIF-015, recorte rechazado: Neo pidió `auto-pr.yml`) quedan PENDIENTE — Neo en spec.md; H-MIF-006 y H-MIF-009 anotados bajo D-17 y D-18.
- Verificación por script: 83 IDs REQ/NFR/SC (antes 86 mapeados) con mapa 1:1 sin huérfanos; 75 tareas (antes 76; T470 y T476 retiradas, T477 nueva), 0 `[x]`, sin ciclos. Sin tocar src/, tests/, terraform/, workflows, constitución ni gate-mifune-003.md.

## 2026-11-15 — Architect: correcciones de /rama aplicadas a la 003 (sin commit)
- Aplicados H-RAMA-001, 002, 003, 004, 006, 007/008 (dump por pipe), 009, 010 y anotados 012..014: ventana `max(PITR 6 h, VACUUM <= 7 d, dumps 7 d)` en REQ-PG-011/ADR-003-09, `workflow_dispatch` de VACUUM (FULL solo en disparo manual con `lock_timeout`), soft delete 0 s, serializadores sin PII, plan+apply en el mismo trabajo, REQ-PG-016/SC-CLD-021/T478, matriz en `data-model.md §6`, `research.md §8`.
- Pendiente Neo: D-22 (C1..C6), D-23 (alcance SQLite→Postgres; redacción A solo como propuesta marcada), D-24 (RPO <= 7 d, RTO <= 2 h). D-17..D-21 y H-RAMA-005/007/011/013 sin cambio. Soft delete de GCS verificado por WebFetch; retención de `_Default`/`_Required` sigue `[verificar]`.
- Script 1:1: 85 IDs REQ/NFR/SC mapeados (antes 83), 0 huérfanos; 76 tareas (antes 75; T478 nueva), 0 `[x]`, sin ciclos. Sin tocar src/, tests/, terraform/, workflows, constitución ni gate-rama-003.md.

## 2026-11-15 — Architect: correcciones de /merovingian aplicadas a la 003 (sin commit)
- Aplicados H-MERO-003 (salida a `src/generated/ops/`, `git diff --stat src/generated/api` vacío, `test:gate` 002+003 en secuencia), 004 y 013 (REQ-CLD-009, SC-CLD-022, T479, sin `@fastify/helmet`), 005/014/015/016 (notas en `research.md §9`, textos obsoletos corregidos), 006 (carga dinámica, `better-sqlite3` fuera de la imagen), 007/008/009 (REQ-CICD-011, SC-CLD-023: SHA, binarios con sha256, permissions por trabajo, digest de imagen, `npm audit --omit=dev`, gate sin id-token; `gitleaks-action` no se usa), 017 y 018.
- Pendiente Neo: D-25 (proveedor google/Terraform/lockfile; recomendación B), D-26 (HOST; relajar `app-config.spec.ts:59` es Nivel 3), D-27 (versiones exactas pg/@types/pg/@fastify/static/esbuild; tsx/concurrently en CI), D-28 (encargados y transferencia). T480 las recoge. Nota: «T116/T431» del informe se aplicaron a T445..T449 y T428/T431..T434 según la numeración de la 003.
- Script 1:1: 89 IDs REQ/NFR/SC (antes 85), 0 huérfanos; 78 tareas (antes 76: T479, T480 nuevas), 0 `[x]`, sin ciclos. Sin tocar src/, tests/, terraform/, workflows, constitución ni gate-merovingian-003.md.

## 2026-11-15 — Architect: D-17..D-28 ratificadas por Neo y frentes F1..F3 incorporados a la 003 (sin commit)
- Aplicadas D-17..D-28 con la respuesta literal en `specs/003-cloud-gcp/spec.md` (RESUELTA por Neo): caché 60 s en `/readyz` sin OIDC (REQ-CLD-004), REQ-CICD-012 (cuentas Terraform separadas), sin rama `pre-<sha>`/`NEON_API_KEY`, baseline `0001_baseline.sql` (REQ-PG-001, data-model §2, T419), ventana de 7 días (REQ-PG-011, ADR-003-09), D-23 (REQ-PG-007, US2 AC3, T430), NFR-CLD-014/015 (RPO 7 d, RTO 2 h), proveedor 7.46.2 + Terraform 1.17.2 + lockfile, HOST (D-26, Nivel 3 anotado), dependencias exactas (T404 autorizada), D-28 en «Supuestos».
- Frentes: REQ-CLD-010 (F1/F2, F2 fuera del Terraform y de Mirror), REQ-IAC-014 (F3, `count = 0` con `custom_domain = ""`), ADR-003-18, SC-CLD-024/025, T481..T483; guía de bootstrap en `quickstart.md §6` y `plan.md §6.3`. Domain mapping: Preview, gratuidad NO confirmada por la doc oficial (`research.md §7.1`).
- Riesgos residuales nuevos: R-12 (caché no impide mantener Neon despierto), R-13 (plan RO lee estado con secretos), R-14 (RPO 7 d sin margen con dumps de 7 d), R-15 (F2 depende de Mirror, F3 Preview).
- Script 1:1: 96 IDs REQ/NFR/SC (antes 89), 0 huérfanos; 81 tareas (antes 78), 0 `[x]`, sin ciclos. Nada APPROVED/LOCKED; sin tocar src/, tests/, terraform/, workflows, constitución ni audits.

## 2026-11-15 — Architect: R-14 (dumps 14 d), F3 opcional, APPROVED y enmienda 3.3.0 aplicada (sin commit)
- R-14: dumps de GCS 7 -> 14 d en spec (REQ-PG-011, REQ-PG-016, REQ-IAC-008, NFR-CLD-014, SC-CLD-008, D-22), plan (ADR-003-09, bucket), research (R-02, R-14 mitigado), data-model §6, quickstart §4.1, tasks (T441, T454). Ventana D-22 = max(PITR 6 h, VACUUM <= 7 d, dumps 14 d). RPO <= 7 d coherente: con 14 d hay >= 2 copias. REQ-SEC-006 no cambia (estado Terraform 30 d). T473 sin cambios (VACUUM sigue semanal).
- F3 OPCIONAL: REQ-IAC-014, T481, T482, SC-CLD-024; sigue condicional por TF_VAR_custom_domain (default "").
- APPROVED (nota de Neo, R1..R5 visibles en spec.md) en spec, plan, tasks, data-model, research, quickstart y contracts/README.md. Ninguna tarea [x].
- T403: constitution.md 3.3.0, Last Amended 2026-11-15, firma de Neo; borrador marcado APLICADA. Script 1:1: 96 IDs, 0 huérfanos, 81 tareas, 0 [x].

## 2026-11-18 — Architect: spec.md DRAFT de la feature 006 (escena del hogar pixel art, IA)
- Escrito `specs/006-escena-hogar-pixel-art/spec.md` (DRAFT) desde `claude/requerimiento-escena-hogar-pixel-art.md`: 22 REQ-ESC6, 13 INV-ESC6, 17 EDGE-ESC6, 34 SC-ESC6, 4 NFR-ESC6; escenarios A1..D19 todos citados.
- 15 decisiones pendientes de Neo (D6-01..D6-15: proveedor IA, N, cuota, ubicacion, imagen previa con cuota agotada, Fase 4->5, foto de referencia, cambios mixtos, hogar implicito, roles, orden N, costo, retencion, criolla, segundo plano en Cloud Run).
- Revisiones requeridas antes de plan: /rama (fotos a API de IA externa, PII) y /merovingian (API/SDK como dependencia externa). No decididas por el Architect. `.specify/feature.json` apuntado a 006. Sin plan, tasks ni contracts; nada APPROVED/LOCKED.

## 2026-11-18 — Architect: enmienda del spec.md 006 con dictámenes de /rama y /merovingian
- Editado `specs/006-escena-hogar-pixel-art/spec.md` (sigue DRAFT): REQ 22->31 (023..031), INV 13->17, EDGE 17->23, SC 34->50, D6 15->17 (D6-16, D6-17 nuevas), RR-06-05..09.
- C1..C11 de /rama incorporadas con tablas de trazabilidad (C1 REQ-023, C2 REQ-024, C3 REQ-025, C4 REQ-026, C5 REQ-027, C6 REQ-028, C7 REQ-029, C8 REQ-021/INV-016, C9 REQ-030, C10 INV-017, C11 RR). H-MERO-006-02 queda como riesgo RR-06-06 y D6-15, sin resolver. Recomendación C de /merovingian en REQ-031.
- Decisiones D6-01..D6-17 todas PENDIENTES de Neo con propuesta no normativa. Texto legal del aviso no escrito. Sin plan, tasks ni contracts; nada APPROVED/LOCKED. Siguiente: /mouse una vez.

## 2026-11-18 — Corrección post-/mouse de spec 006 (DRAFT)
- Aplicadas M6-A1 (SC-ESC6-051..053 para REQ-022, INV-009, INV-012), M6-M1 (A5 -> B5 en REQ-006, dos sitios, registrado), M6-M2 (IDs en cabeceras SC), M6-M3 (REQ-020 dependiente de D6-10; SC-049 condicional), M6-M4 (D6-02..09, 11, 14 marcadas PENDIENTE; propuesta A en D6-02).
- Bajos: M6-B1, M6-B2 (nota en Supuestos), M6-B3 (SC-ESC6-054/055). No corregidos: M6-B4, M6-B5. Conteo final: 31 REQ, 17 INV, 23 EDGE, 55 SC, 4 NFR, 17 D6, 9 RR. Sin APPROVED/LOCKED; D6-01..17 siguen pendientes de Neo.
- Verificado con grep: 0 REQ/INV sin SC/EDGE, 0 referencias colgantes, 0 A5 fuera del registro de corrección.

## 2026-11-18 — Architect: D6-01..D6-17 firmadas por Neo aplicadas; paquete de diseño 006 en DRAFT (sin commit)
- spec.md: decisiones firmadas como normativas (sección «Decisiones firmadas por Neo 2026-11-18»), sin PENDIENTE; nuevos REQ-ESC6-032 (escena sin hogar y migración), EDGE-ESC6-024, SC-ESC6-056..067, INT-06-04, RR-06-10; corregidos M6-B4 (sección REQ→SC) y M6-B5 (historias 5 y 6 en Given/When/Then). Conteo: 32 REQ, 17 INV, 24 EDGE, 67 SC, 4 NFR, 17 D6, 10 RR.
- Creados en specs/006-*/: aviso-consentimiento-borrador.md (BORRADOR, 6 elementos), research.md (Vertex con [verificar], sin red; Cloud Tasks vs Job), data-model.md, plan.md, contracts/ (scene-payload 1.0.0, scene, error-catalog con 7 ERR-SCENE-*, home-scene.machine, OpenAPI 3.4.0 con 13 operaciones). Enmienda en .specify/memory/audits/enmienda-006-principio-VI.md (borrador, NO aplicada). Sin tocar src/, tests/, terraform/, tasks.md.
- Hallazgos abiertos para Neo: H-ARCH-006-01 (sin códec: solo se eliminan metadatos del contenedor, no se redimensiona; brecha frente a C5), H-ARCH-006-02 (5 USD solo avisa; sin tope global), N=8 depende del límite de imágenes del modelo [verificar]. Nada APPROVED/LOCKED.

## 2026-11-18 — Architect: revisión de diseño 006 (Mifune, Trinity, Lock, Link, Merovingian) aplicada en DRAFT (sin commit)
- Aplicado en specs/006-*/{spec,plan,data-model}.md y contracts/ (OpenAPI, scene, scene-payload, machine, errors): estado derivado en lectura (H-MIF-01), imagen vigente en columnas de home_scenes (H-MIF-02), 13->9 variables (H-MIF-06), normalizador como función por lista blanca (H-MIF-07, H-TRI-03/09), worker con audiencia y correo exactos (H-TRI-01), intentos y 429 (H-TRI-02/08), clave de idempotencia con alcance (H-TRI-05), etiqueta v (H-TRI-06), claim/T2 (H-TRI-07, H-LCK-01..04), EDGE-025..033, ganchos de transferencia/importación y UnitOfWork (H-MERO-15/16/17/24).
- No aplicados: H-MIF-03 (a /oracle: puede contradecir EDGE-016), H-MIF-04/05 (contradicen REQ-015, SC-021, D6-08). Nivel 2 sin decidir: N2-01..N2-12 en spec.md (normalizador, tope global, formato de salida, moneda 22500 COP, enmiendas REQ-IAC-006/009, REQ-CLD-002, NFR-CLD-001, auditoría 004, claves, jose, scripts, PN-06, memoria 1Gi, Principio VI).
- Conteo: REQ 32->36, INV 17->19, EDGE 24->33, SC 67->96, RR 10->12, NFR 4, D6 17 firmadas. Sin compilar (compile-contracts.sh no incluye 006). Nada APPROVED/LOCKED/COMPLETED; sin tocar 001..005, constitución, terraform/, scripts/, .github/, src/, tests/ ni tasks.md.

## 2026-11-18 — Architect: correcciones del informe de Oracle 006 (OBS-1/3/4/5/6) en DRAFT (sin commit)
- data-model §2.5: hash de idempotencia ahora incluye `action` (alineado con REQ-ESC6-012/OpenAPI/scene.schema); spec D6-13 y N2-06(c): la foto del hogar cuenta en la cuota de 1 GiB (REQ-ARC-005); «D6-13 B con TTL» marcado como historial no normativo; data-model cita D6-16.
- scene-payload.schema.json: `type` añadido en then/else de allOf (object y array anidados); compila con Ajv2020 strict:true + strictTypes:true junto a scene.schema (common/pet de 004 cargados). EDGE-ESC6-016 y H-MIF-006-03 intactos (a Neo).

### 2026-11-18 — Architect: asentadas N2-01..N2-12 y EDGE-ESC6-016; tasks.md 006 (DRAFT, sin commit)
- spec.md: sección «Decisiones de Nivel 2 firmadas por Neo» (N2-01 B ahora/A antes del real, N2-02 A, N2-03 PNG/WebP, N2-04 22500 COP o 5 USD, N2-05 4 enmiendas de 003, N2-06 (a)-(d), N2-07 A, N2-08, N2-09 B, N2-10, N2-11, N2-12) y «Compuerta del driver real»; sin marcas de pendiente/propuesta. EDGE-016, REQ-012, SC-080 y H-MIF-006-03: solo se recuerda la última clave (24 h), intentos en `scene_attempts`.
- plan.md (§1.2, §1.3, §5.4, §6.4, §6.5, §7, ADR, §9, nueva §13), data-model.md (§2.5 T1 anula hash previo; M-3 ya no condicional; retención ratificada) y contratos (scene.schema, OpenAPI) coherentes; conteos intactos (36 REQ, 19 INV, 33 EDGE, 96 SC, 4 NFR).
- tasks.md: 85 tareas T601..T798, todas [ ], 8 fases en el orden pedido; 196/196 IDs (REQ/INV/EDGE/SC/NFR/STATE/ERR) con tarea. T798 [GOV] bloqueada por N2-10 (driver real y main). Sin tocar 001..005, terraform/ ni src/; sin commit.

## 2026-11-18 — Renumeración 006 T601..T798 → T801..T885 (OBS-1/OBS-2 de oracle-006-tasks)
- Mapeo ordinal fila a fila (85 tareas, mismo orden y dependencias) en tasks/plan/data-model/spec; refs a 004 (T501..T617, T612) conservadas con prefijo; prueba provisional t801-compuerta-006.spec.ts. Contratos sin IDs de tarea (sin cambios).
- OBS-2: T825 (antes T639) depende de T814 (antes T625) -> T833 (Fase 4); aclarado en tasks.md que la Fase 2 cierra tras T833. Verificado por script: 85 únicas, 0 huérfanas, 188/188 IDs propios cubiertos. Sin commit.

## 2026-11-18 — Ratificacion del puerto ScenePrivacyHooksPort (H-KEY-F2-1)
- 8 ganchos y firmas del fixture ratificados; plan.md §1.2 nueva subseccion «Puerto ScenePrivacyHooksPort» (misma transaccion, orden: retiro ANTES de mutar / creado DESPUES, eventos opacos, sin escena sin efecto, un evento por causa, sceneHooks? opcional). Cambios al fixture: now: string; onMemberRemoved no se acompana de onPetUnassigned por mascota. tasks.md T827 aclarada (alcance). Cobertura 7/7 casos de uso (T862..T867). Sin commit.

### 2026-11-18 architect T825 H-T825-1..3
Alineados 003 plan/research (1 GiB, 120 s, 14 APIs, 5 USD, aiplatform.user), 004 spec (cuota con household_photos) y listas 3.2.0 en 002/004/port. Solo texto.
Sin commit; pendiente re-firma /merovingian.

### 2026-11-18 architect Decisiones de Fase 5 (H-KEY-F5-1..4)
- F5-1: payload incremental incluye REMOVE (pets=[] solo FROM_SCRATCH/REGENERATE sin mascotas); SC-ESC6-010 y REQ-ESC6-010 ajustados. F5-2: STYLE_BASE_TEXT normativo (plan 5.3) y Anexo A de razas (64 nombres); breed libre NUNCA entra al prompt (EDGE-ESC6-015, REQ-ESC6-009, SC-ESC6-066).
- F5-3: REQ-ESC6-034 solo FAILED, ventana 24 h, puerto countFailedAttemptsByScene {count, oldestAt} (plan 1.1, data-model 7). F5-4: D6-09 elimina la sobrante antes del UPDATE (data-model 5, EDGE-ESC6-030). Sin PENDIENTE DE NEO; sin commit; src/tests sin tocar.

### 2026-11-18 architect Decisiones de Fase 5 lote 2 (H-KEY-F5-5..7)
- F5-5: expiracion de arrendamiento al leer se AUDITA (SCENE_FAILED, actor = actor_user_id del intento, misma transaccion, una vez si el CAS transiciona). F5-6: scene_image_sources = solo duenos de fotos efectivamente enviadas; consentimiento en T2 solo actor + duenos de fotos.
- F5-7: cuota agotada en T2 = FAILED con ERR-SCENE-GENERATION-FAILED, motivo interno SCENE_QUOTA_AT_T2 solo en auditoria; catalogo de errores SIN cambios. Escrito en plan.md (seccion lote 2) y data-model.md 2.3/7. Sin PENDIENTE DE NEO. Sin commit.

### 2026-11-18 architect Decision de Fase 5 lote 3 (herencia de fuentes de imagen)
- F5-8: scene_image_sources = fotos enviadas en la generacion + fuentes heredadas de la imagen previa si viajo como referencia (INCREMENTAL_*). Confirmada la decision de Keymaker (ac55662): es interpretacion de REQ-ESC6-025 ("imagen que contenga"), no amplia D6-16 (T2 no exige consentimiento a heredados) ni altera el alcance firmado; sobre-purga solo en direccion segura. Escrito en spec.md REQ-ESC6-025 (2) y data-model.md 2.3.
- Sin PENDIENTE DE NEO. Sin commit; src/tests sin tocar.
### 2026-11-18 architect Enmienda 006 aplicada a la constitucion (3.5.0 -> 3.6.0)
- Principio VI: excepcion unica de pago (Vertex, imagenes; REQ-ESC6-028, N2-10, tope 5 USD = 22500 COP) y jose 6.2.17 solo en /internal/maintenance y /internal/scene-worker con audiencia y correo propios. Vigente era 3.5.0 (no 3.2.0), por eso MINOR 3.6.0.
- Borrador marcado APLICADO; sin APPROVED/LOCKED; sin commit; src/tests sin tocar.
### 2026-11-18 architect Decision de Fase 6 (H-ORA-F6-A/B) tras oracle-006-fase6
- A: normalizacion de SALIDA por lista blanca de trozos: PNG IHDR,PLTE,IDAT,IEND,tRNS,caBX + iTXt XML:com.adobe.xmp; WebP VP8 ,VP8L,VP8X,ALPH,XMP ,C2PA. Escrita en spec REQ-ESC6-035, N2-03 (sin cambiar su texto firmado) y plan 5.4. data-model sin cambio.
- B: 404 de imagen unificado en ERR-HOUSE-NOT-FOUND; solo cambia la descripcion de getHouseholdSceneImage en home-scene.openapi.yaml (sin tocar 001..005) y INV-ESC6-007. Sin PENDIENTE DE NEO. Sin commit; src/tests sin tocar.

## 2026-11-18 — Diseno tramo gemini-api (006)
- Escrito specs/006-escena-hogar-pixel-art/audits-gemini-api-diseno.md (DRAFT). Sin cambios en src/tests/tasks/constitution.
- 10 choques C1..C10 con normas (T879, REQ-ESC6-017/028, Principio VI, N2-10, verify-traceability, app-config); enmiendas pendientes de Neo.

### 2026-11-18 architect Enmiendas gemini-api (Opcion 2 de Neo, N2-13)
- Constitucion 3.6.0 -> 3.7.0 (Principio VI, excepcion local privada); spec (REQ-017/031, SC-025/061, nuevos REQ-037/038, INV-020, SC-097..103, D6-18, N2-13), plan, tasks Fase 9 (T886..T900, todas [ ]), comentario de rango en verify-traceability.sh.
- Unica linea de src/: redaccion AIza/x-goog-api-key en cloud-logging.ts. verify-traceability 006 CUMPLE (205/205), tsc 0. Sin commit; sin [x]. Informe: audits/architect-006-gemini-api-enmiendas.md.

### 2026-11-19 architect Impacto de 4 fallos en vivo (T900) y proxy /__dev/media
- Analisis solo lectura de 006 (HEAD 824d82c): punto 4a ya cumplido (decide-mode FROM_SCRATCH ante cambio de foto del hogar); punto 1 mal condicionado (cards.length vs pets.total); puntos 2, 3, 4b, 4c requieren cambio. Proxy vite solo dev, ruta ya existente en 004 (T571).
- Propuestas T901..T910 y SC-ESC6-104..109 en borrador dentro del informe; spec/plan/tasks sin tocar (necesitan visto bueno de Neo). Sin bloqueo normativo.
- Informe: specs/006-escena-hogar-pixel-art/audits/architect-006-fixes-en-vivo.md. Sin commit, sin [x]; bus central no tocado por restriccion de Morpheus.

### 2026-11-19 architect T901 [GOV] enmiendas DRAFT de correcciones en vivo (006)
- Aplicadas con aprobacion soberana de Neo (a)(b)(c): spec.md (REQ-007, 016, 019, 037 ampliados; SC-ESC6-104..109; tabla REQ->SC->tareas; conteo 109 SC; registro), plan.md (5.3, 11, 12), tasks.md (Fase 10 T901..T910 todas [ ], conteo 110, 211 IDs).
- decide-mode.ts sin cambio; STYLE_BASE_TEXT y frases base intactas. Sin src/, tests/, contratos, commit ni [x].
- verify-traceability.sh --feature 006: CUMPLE (211/211 IDs propios mapeados, pureza 0 violaciones).

## 2026-11-19 | /architect | Fase 11 T911..T923 (segunda ronda T910, D6-19)
- Revisé el spec.md parcial heredado: conservé REQ-007/019/034 (con ajustes), descarté el cierre numérico por especie de REQ-016 y lo sustituí por la especificación JSON saneada (plan §5.3.1). La compuerta heredada fallaba por 3 SC huérfanos.
- Añadí SC-ESC6-110..118, D6-19, N2-14 y N2-15 (pendientes de Neo), tareas T911..T923 en [ ], cierre de OBS-3. Sin contratos, src ni tests.
- verify-traceability --feature 006: CUMPLE (221/221). Informe: specs/006-escena-hogar-pixel-art/audits/architect-006-fase-t911.md.

## 2026-11-19 | T912 contrato retryAfterSeconds (N2-14 aprobada)
- scene.schema.json 1.0.0 -> 1.1.0 MINOR (supersedes 1.0.0): SceneActions.retryAfterSeconds integer|null 1..86400 opcional (no en required); descripcion de canRegenerate corregida; traceability +SC-ESC6-112/113.
- home-scene.openapi.yaml: solo change_note (SceneView llega por $ref); version 3.4.0 sin cambio (fijada en src/generated/v34, problem-details.ts, openapi-contract-006.ts).
- verify-traceability --feature 006: CUMPLE. STATE-SCENE-001 y error-catalog sin diff. Consulta /merovingian en curso; informe audits/architect-006-fase-t912.md.
- Dictamen merovingian incorporado (H1..H3, sin bloqueo; pregunta no bloqueante sobre rol ROLE). Informe escrito.

## 2026-11-19 — Correccion documental /mouse T911 (DRAFT, sin commit)
- spec.md: matriz regenerada (123 tareas T801..T923, 106 [x], 17 abiertas); REQ-007/016/019/034 y filas INV con Fase 11; N2-14 (SI) y N2-15 (B) = APROBADO por Neo 2026-11-19 (estado final lo firma Neo).
- tasks.md: Fase 11 sin "bloqueada"/"espera N2-15"; plan.md l.306 sin "pendiente N2-15".
- Pendiente de Neo: version OpenAPI home-scene.openapi.yaml sigue 3.4.0 vs escena 1.1.0; se mantiene hasta decision de Neo.
- verify-traceability --feature 006: CUMPLE (221/221 IDs propios mapeados).

## 2026-11-19 | /architect | Fase 12 T924..T934 (tercera ronda T910, D6-20)
- Enmendado en DRAFT spec/plan/tasks (+1 frase de research §2.2): hogar principal en Mascotas (createdAt asc, id asc, funcion pura cliente), fotos KEEP como IMG_n en INCREMENTAL_ADD/REPLACE/MIXED (sin tocar contrato ni scene-spec.ts), textos de ayuda con aria-describedby. SC-ESC6-119..130, T924..T934 todas [ ], ADR-006-14..16, D6-20.
- Abierta N2-16 (Neo): descarte por tope de bytes de las KEEP (A orden de seleccion / B KEEP primero a descartar, recomendada) y si su omision marca degraded (C no, recomendada / D si). Bloquea T928..T930.
- verify-traceability --feature 006: CUMPLE (233/233). Matriz verificada por script. Informe audits/architect-006-fase-t924.md. Bus central no tocado por restriccion de Morpheus.

## 2026-11-19 | /architect | Fase 13 T935..T943 (cuarta ronda T910, D6-21)
- Enmendado en DRAFT spec/plan/tasks: boton unico (Crear/Regenerar imagen/Reintentar) que siempre envia action=REGENERATE (ruta existente, sin cambio de contrato ni de STATE-SCENE-001); householdBlock como inspiracion (unica frase de plantilla sustituida); linea `Exact animal count` antes de PET_COUNT_RULE y `Pet k (especie)`. SC-ESC6-131..138, ADR-006-17..19, T935..T943 en [ ].
- INCREMENTAL_* queda en servidor (DEUDA-006-INCREMENTAL-SIN-UI). Abierta N2-17 (Neo): solo prosa de contrato, bloquea unicamente T941.
- verify-traceability --feature 006: CUMPLE (241/241). Informe audits/architect-006-fase-t935.md. Bus central no tocado por restriccion de Morpheus.

## 2026-11-19 | /architect | T941 y enmiendas de cierre Fase 13 (N2-17 A, N2-18)
- scene.schema.json 1.1.0 -> 1.1.1 PATCH (solo prosa de action, canUpdate, canRegenerate, blockedReason); OpenAPI 3.4.0, summary y descripcion de generateHouseholdScene/generateOwnerScene. Sin cambio de forma.
- spec.md: INV-ESC6-010 enmendada (A1, N2-18), N2-16 asentada B+C, N2-17 aprobada A, PET_COUNT_RULE ratificada ("When renderedPetsCount is zero"); plan ADR-006-20; tasks: DEUDA-006-AVISO-REGENERACION (condicion 8 de T885) y DEUDA-006-M4-TOPE-REGENERATE.
- verify-traceability --feature 006: rc 0, CUMPLE 241/241. Informe audits/architect-006-fase-t941.md. Falta recompilar (keymaker).

## 2026-11-19 | /architect | Alineación de prosa de cierre Fase 13 (sin commit)
- spec.md y plan.md alineados al código en disco: frase del hogar «Draw a brand-new …» y PIXEL_REDRAW_RULE «Render every wall …» (el encargo citaba «Recreate a recognizable …», que no está en el código; manda el disco). Contador regresivo en REQ-019/034/SC-115 y plan §5.7; N2-16 y PET_COUNT_RULE verificadas.
- Discrepancia reportada: relectura del cooldown a t s en código vs t+1 s en la prosa previa y en tasks.md T916.
- verify-traceability --feature 006: rc 0, CUMPLE 241/241. Informe audits/architect-006-fase-alineacion-cierre.md. Bus central no tocado por restricción.

## 2026-11-19 — Feature 007 (UX ficha, fechas, pestaña, fallecido, texto escena)
- Creado specs/007-ux-ficha-mascota-fallecimiento/{spec,plan,tasks,data-model}.md + contracts/README.md (DRAFT, tareas T1001..T1063 todas [ ]). .specify/feature.json apunta a la 007. Sin speckit-skills (redacción nativa con el formato de 005/006).
- Cobertura [GH:#N]: #11 Bloque A, #12 B, #13 C, #14 D, #15 E, #51 F (encabezados + línea de tarea). Dry-run de gh-project-sync lee 6 issues sin huérfanos.
- Solo #13 toca modelo/API/respaldo (lifeStatus, deceasedAt; enmienda minor aditiva a pet.schema.json, N2-07-01). Evaluar /merovingian, /rama, /maggie, /lock; /trinity no.
- Pendientes de Neo: D7-01 (#51 texto), D7-02 (#14 A vs B, recomendada B), D7-03 (rótulo; el recuento incluye desparasitaciones), D7-04/05/06 (#13 alertas, registros posteriores, escena), N2-07-01.
- Hallazgo: AlertsCard cuenta vacunas Y desparasitaciones; «Estado de vacunación» es literal del Issue pero impreciso (D7-03).

## 2026-11-19 | /architect | Feature 007: pase único de revisión + decisiones de Neo asentadas (sin commit)
- Incorporadas actas mifune/lock/rama/merovingian en spec, plan, tasks, data-model y contracts/README (DRAFT). Verificado en disco: error existente `ERR-SCHEMA-VALIDATION-FAILED` (422) en 002 (sin `ERR-PET-LIFE-STATUS`); no hay código 412 en el catálogo (contrato nuevo bajo N2-07-01); `spec-system.md` no exige máquina por campo enumerado; `ClinicalProfile` (005) es objeto cerrado sin `lifeStatus` (MINOR de 005); inbox #14 solo 4 módulos.
- Mifune aplicadas: M7-01..03, 05 (revertida por Neo: se versiona), 06, 07, 09..13, 15 (revertida por Neo: conteo en aria-label), 16, 17; M7-04 parcial (CHECK cruzado por Merovingian C2), M7-08 no aplicada (T1030 se conserva).
- Lock EDGE-007-009..022 en spec; Neo decidió 009, 012..014, 016, 017; 010/011 requisito técnico; 018 tarea condicional T1036; nuevas T1064..T1068. Rama C2/C3/C6 asentadas; C4/C7 en T1019/T1020/T1026.
- Tareas: 51 `[ ]`, 0 `[x]`. Etiquetas [GH:#11,12,13,14,15,51] intactas. Sin tocar contracts/ de specs ni src/.

## 2026-11-19 | /architect | 007: correccion de citas tras acta Mouse BLOCKED (sin commit)
- D1: NFR-007-003 anadida a T1003. D2: EDGE-007-004 anadida a T1015 y T1068.
- O2: SC-007-001..003 -> citas explicitas en T1031/T1032; SC-007-013..015 explicitas en T1023; SC-007-017..020 explicitas en T1046 (T1047/T1049 siguen por rango 017..019).
- O1: T1013 fija `version` como entero >= 1 (no updated_at); espejo en data-model.md. O3: REQ-REG7-003 marcada «descartada por Neo, sin tarea por diseno». O4: EDGE-007-021 anotado «sin tarea ni prueba por diseno» en spec.md.
- Estado intacto: 51 [ ], 0 [x]; etiquetas GH #11..#15,#51 intactas; sin tocar contracts/ ni src/. Pendiente: re-ejecutar /mouse.

## 2026-11-20 | /architect | Feature 006 Fase 14 (T944..T960, directiva D6-22 de Neo) asentada (sin commit)
- Editados spec.md (D6-22, matriz REQ->tareas, registro), plan.md (§5.8, ADR-006-21, §13) y tasks.md (Fase 14, T885 Dep ampliada, T900 N/A propuesto, conteo 160). Rango T944..T960 (no T1001+, reservado a 007). Todas [ ]; T885 y T900 siguen [ ].
- verify-traceability --feature 006: CUMPLE 241/241. No se tocó src/, contracts/, deploy, .env.
- Bloqueos humanos: T956 revisores entorno produccion; T957 Principio VI (texto ya en constitución 3.7.0 pero sin firma, modelo no nombrado); T958 fuente CDPA + firma aviso; T959 T900 N/A; T960 (extra) N2-01=A vs "0 dependencias", N2-04, unidad de ARGOS_SCENE_GLOBAL_QUOTA_MAX=5. T953: IAM/API Vertex en Terraform no cubierto por la directiva.

### 2026-11-20 — Architect: asentadas resoluciones de Neo (a)..(g) a la Fase 14 (D6-23)
- spec.md: D6-23 + enmienda de N2-01 (A sustituido por «0 dependencias npm nuevas») + registro; plan.md: §5.8 y ADR-006-21 (E1, E3); tasks.md: notas en T885, T900, T953, T956..T960 (ninguna [x]; T824 ya [x] por Neo); research.md: §2.3-bis con fuentes de T958.
- T953 verificada en solo lectura (services.tf:16, iam.tf:155-157, variables.tf COP/22500). Sin tocar src/, contracts/, terraform/, deploy, .env. Sin commit.
- verify-traceability --feature 006: CUMPLE (241/241).
- 2026-11-19 Architect: DEF-M14-R1 corregido: REQ-ESC6-027 y SC-ESC6-042 enmendados con D6-23(f)/E1 (0 deps npm); nota T958/research §2.3-bis (retención/borrado/región/SLA fuera de la firma). verify-traceability 006 ver reporte. Sin commit.

- 2026-11-20 Architect: propagacion cierre T955 (OBS-M5, C5). N2-10 (spec.md) y condicion 3 de T885 (tasks.md) y compuerta spec.md "Compuerta del driver real" alineadas con D6-23(f): "0 dependencias npm nuevas" sustituye N2-01=A; N2-10 sigue como bloqueo. aviso-consentimiento-borrador.md movido a specs/006-escena-hogar-pixel-art/archivo/ con nota en spec.md; referencias por nombre simple en plan/research/tasks/spec no tocadas. Sin src/contracts/terraform/.env, sin commit.

### 2026-11-20 — Architect: pasada de cierre Fase 14 (residuos #8 y firmas de Neo)
- tasks.md:18 reescrita (N2-01=A sustituido por 0 deps npm, D6-23 (f)); spec.md:610 ruta a archivo/aviso-consentimiento-borrador.md.
- Firmas asentadas: T958 aprobado (aviso v2, C2, DEUDA-006-AVISO-REGENERACION liquidada), OBS-M1, OBS-M2, H-F14-2 mantener, activar SCENE_REAL_DRIVER_ACTIVATED=true (commit local, sin merge/push).
- Registro nuevo al final de spec.md; notas en T958, T885 y Checkpoint T944..T960. Sin [x]. verify-traceability 006: CUMPLE.

### 2026-11-20 — Architect: Caso B 007 cerrado por Neo (OPCION A: O-3/O-4, O1, M2)
- 004 openapi 3.2.0 -> 3.3.0 MINOR (supersedes 3.2.0, exportBackup -> BackupEnvelopeV32); 005 share-links.openapi.yaml linea 8 ahora dice REVIEW (no LOCKED).
- O-4: 002 openapi x-sdd-metadata 3.2.0/supersedes 3.1.0; backup-envelope 002 y 004 supersedes 3.1.0.
- O1: clinical-summary.schema (005) ClinicalSummary.allOf if/else: pets[].profile.deceasedAt exige disclosure.deceasedAtIncluded true (v33 recompilado). M2: spec 007 REQ-FAL7-004 -> «Sin alertas (fallecida)».
- Pendiente keymaker: prueba de contrato negativa de O1 y actualizar contracts-004-openapi.spec.ts (pin 3.2.0 -> 3.3.0). Sin [x], sin push.
- R9 (merovingian T1070): plan.md:28 ADR-007-07 corregido: la huella no cambia (inputs-snapshot.ts sin prompt/estilo/paleta). R1-R3 quedan para T1072, no resueltos.

### 2026-11-20 — Architect: EDGE-007-027 Opcion A (Neo) + R1-R3/R7 de merovingian T1070 + deudas 029/030/032
- clinical-summary.schema.json (005, 1.1.0 DRAFT sin bump): age.required = years, months; allOf if/else cerrado (additionalProperties false con props enumeradas, deceasedAt false, DECEASED sin opt-in => age.totalDays false). Cerrar el if con lista completa de props conserva la semantica (11 casos Ajv OK); t778 pasa 5/5 sin tocarla.
- spec.md/plan.md: reglas R1-R3 y R7 (R7 verificado: scene-use-cases.ts:104-109 filtra consentimiento solo con driver real); deudas EDGE-029/030/032 como nota. Sin [x], sin src/tests.
- Compile 002/004/005/006 rc 0; src/generated/v33 regenerado. Rojos esperados hasta keymaker: 3 tests t1026 + 1 error tsc (t1026 l.52, totalDays opcional).

### 2026-11-20 — Architect: Feature 008 iniciada (rama 008-sso-portal-roles, DRAFT)
- Creados specs/008-sso-portal-roles/{spec,plan,tasks}.md y contracts/{README.md,errors/error-catalog.json (indice vacio)}. Tareas T1101..T1176, 0 [x], etiquetas [GH:#16..#20,#53..#55] en cada bloque y tarea.
- Decisiones abiertas para Neo: D8-01 (dividir 008/009), D8-02 (politica de aprobacion #18), D8-03/D8-07 (identidad admin #19), D8-04 (proveedor de correo), D8-05/D8-06 (verificacion id_token / scope), D8-08 (rango tope fotos), D8-09 (textos #53/#55).
- Hallazgos: cookie argos_session Strict no viaja en el callback de Google (ADR-008-03); correo de cuentas antiguas no verificado ni unico (pre-hijacking, EDGE-008-003); ADMIN ya es rol de hogar (usar PLATFORM_ADMIN); jose autorizada solo en oidc-verify.ts; D6-19 (Mascotas sin textos) enmendada por #55.
- verify-traceability --feature 008: 24/59 (falla esperada: sin src/tests; el script no tiene modo informativo para 008 y su --task solo acepta T###). Sin tocar src/, tests/, src/generated/.

### 2026-11-20 — Architect: reconciliación 008 antes de /mouse (T1109) con #21, #24, #25
- spec/plan/tasks/contracts README de 008: Bloques I (#21, T1177..T1185), J (#24, T1186..T1193), K (#25, T1194..T1199) y T1200 (H-8-02, STATE-AUTH-SESSION-001); D8-10..D8-14 nuevas para Neo. Total 100 tareas (76 + 24), 0 [x]. Bloques F, G, H intactos.
- /lock EDGE-008-023..040 incorporadas (012/SC-020 corregidos, INV-VIN8-004, TTL únicos: argos_oauth 600 s -> 900 s, email_verified_at NULL heredado); lo que implica política queda atado a D8-14/D8-03/D8-02/M8-03. M8-01..M8-14 NO aplicadas. Constitución citada 3.7.0; jose ya no «autorizada» (H-8-01).
- verify-traceability --feature 008: 36/85 (49 FAIL solo de evidencia de código). Sin src/, tests/, generated.

### 2026-11-20 — Architect: corrección FAIL /mouse 008 (ADR-008-01..13 en tasks.md)
- Añadidos ADR-008-01..13 a 13 tareas (T1114,T1126,T1111+T1121,T1119,T1138,T1149,T1158,T1164,T1168,T1172,T1182,T1190,T1196); sin renumerar, sin [x]. Commit NO hecho (prohibición del rol); lo ejecuta Morpheus.

### 2026-11-20 — Architect: reconciliación 008 con la resolución de Nivel 2 de Neo (iter 75, 17 puntos)
- Commits locales: c8e59e7 (constitución 3.7.0 -> 3.8.0: jose en google-oidc-verify.ts + cookie argos_oauth Lax 900 s), 86fad83 (contratos 002 openapi 3.3.0/identity 3.1.0/pet 3.2.0/backup 3.3.0/errores 3.2.0; 004 3.4.0/3.2.0/3.2.0/3.3.0/3.2.0; 006 openapi 3.5.0 download=1; src/generated regenerado v31, v33, v34 y línea 002), cebdf9f (spec/plan/tasks 008 + claude/decisiones-neo-008-2026-11-20.md).
- 008 queda con 64 tareas con casilla y 36 diferidas a 009 (sin casilla, mismos IDs); C/D/E y T1200 en «Diferido a 009»; 0 [x]. Se añaden INV-VIN8-005, SC-008-061/062. IDs de 008 fuera del texto de los contratos 002/004/006 (la compuerta de 002/004 los trata como vigentes).
- Hallazgos: verify-traceability --feature 002 pasa de CUMPLE a FALLA por ERR-AUTH-GOOGLE-FAILED y ERR-AUTH-GOOGLE-LINK-CONFLICT sin @implements/prueba (rojo esperado hasta keymaker); 005 se recompiló (v33) porque depende de 004; compile exige api limpio: orden 004, 005, 006 y 002 al final.
- Lecturas para Neo: D8-06 sin pronunciamiento (se mantiene A); D8-13/D8-09 texto citado = D8-09; M8-04/05/06 no elegidas (callback 200).

### 2026-11-21 — Architect: enmiendas documentales 003 quickstart, REQ-SSO8-007 y centinela de contraseña (Neo, Nivel 2)
- 003 quickstart sección 6: dos filas (GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_REDIRECT_URI). 008 spec: REQ-SSO8-007 (solo client_secret en Secret Manager) y REQ-SSO8-003 (centinela `!no-password!`, verifyPassword dummy constante, hasPassword false, startGoogleLink rechaza).
- plan.md: ADR-008-05 estaba ocupado (#18, Diferido a 009); la decisión quedó como ADR-008-14. Bootstrap docs 43/43 verde; trazabilidad 008: 57/87 (FALLA esperada, solo evidencia de código). Sin src/tests/contratos.

### 2026-11-21 — Architect: dictamen H-A21-2/2b (vinculación Google atada a la sesión de origen)
- Entregado .specify/memory/audits/architect-008-A2-link-sesion.md (sin commit; sin tocar contracts/src/tests/specs). Opción B refutada (Strict no viaja en el retorno de Google); Opción A recomendada (hash = sessions.token_hash en oauth_flow_states, sin Set-Cookie, revokeOthers con la de origen); H-A21-2b se cierra ajustando implementación.
- Hallazgo: A no cierra el robo de argos_oauth (atacante vincula su propio sub); cierre real = alternativa C (confirmación en dos pasos), propuesta como deuda 009. Requiere aprobación de Neo (esquema, contrato 004 3.4.1, spec/plan).

### 2026-11-21 — Architect: Opción A de vinculación aplicada en documentos (commit d319857, decisión de Neo Nivel 2)
- spec 008: REQ-VIN8-002 (sesión de origen activa, origin_session_hash = sessions.token_hash), REQ-VIN8-004 literal (conserva origen, sin Set-Cookie), EDGE-008-050, SC-008-063; plan: ADR-008-03 nota LINK y ADR-008-15 (límites 20/20/10/5 confirmados); tasks: T1121/T1126/T1122 anotadas.
- Deudas en «Diferido a 009» (spec y tasks, sin casilla): DEUDA-008-GOOGLE-LINK-2STEP y DEUDA-008-GOOGLE-ACCOUNT-DELETE (aviso de perfil por hasPassword false; soporte manual Ley 1581/2012; cierre obligatorio vía T1130).
- OpenAPI 004 (3.4.0) y 002 (3.3.0): texto del callback caso 3 y startGoogleLink, aclaración sin bump (siguen DRAFT; tests fijan 3.4.0). Compilar exige regenerar src/generated (solo comentarios de openapi-types.ts): NO hecho. Rojos: codegen-drift (2) y generated-004 (1). Trazabilidad 008: 61/87 -> 62/88.

### 2026-11-21 — Architect: H-VO-3 (SC-008-013 inexistente en T1129 y T1134)
- tasks.md líneas 64 y 68: `SC-008-013` sustituido por `SC-008-063` (verificado literal en spec.md:194). 061..062 no aplican (límite de tasa y cuenta sin contraseña). Sin más citas en specs/008. Trazabilidad 008 62/88 (sin cambio); bootstrap docs verde. Commit local solo tasks.md.

### 2026-11-21 — Architect: análisis H-SC14 (SC-008-014 409 vs 400 en el callback LINK), solo análisis
- Contradicción: spec.md:189 y tasks.md:62 (T1126) piden `ERR-AUTH-GOOGLE-LINK-CONFLICT` (409) para «sub ya vinculado a otra cuenta»; el catálogo 004 (`error-catalog.json:426-433`) lo admite en su nota; pero el openapi 004 del callback (L145-L180) solo declara 400/429/500 y `google-auth-use-cases.ts:222-224` responde 400 `ERR-AUTH-GOOGLE-FAILED`. `startGoogleLink` (L160-162) sí da 409, pero ahí el «sub» aún no se conoce: solo cubre «cuenta ya tiene Google».
- Recomendación: Opción A (400 uniforme en callback; corregir texto de SC-008-014 y T1126). Las pruebas t1126 (api L90-105) ya fijan 400. B exige decisión Nivel 2 de Neo (enmienda de contrato 004). Sin ediciones de contratos/src; sin commit.

### 2026-11-21 — Architect: H-SC14 opción A aplicada (decisión de Neo, Nivel 2)
- spec.md SC-008-014 y tasks.md T1126: 409 `ERR-AUTH-GOOGLE-LINK-CONFLICT` solo en `startGoogleLink` (cuenta con Google ya vinculado); `sub` ya vinculado a otra cuenta = 400 uniforme `ERR-AUTH-GOOGLE-FAILED` en el callback, sin vincular. INV-VIN8-001 y SC-008-012 sin cambio (no se contradicen).
- Nota de LINK-CONFLICT en `004/contracts/errors/error-catalog.json` reescrita (código y status intactos; JSON válido). La nota está compilada en `src/generated/v34/errors/error-codes.ts` y `src/generated/errors/error-codes.ts` (esta última viene del catálogo 002, que tiene la misma nota en L388 y NO se tocó): regenerar lo hace keymaker en commit aparte. Sin commit, sin src/tests.

### 2026-11-21 — Architect: notas LINK-CONFLICT (002/004) y precedencia H-429 (aprobado por Neo)
- 004 error-catalog (L433): nota ya alineada a Opción A (sin cambio adicional). 002 error-catalog (L388): nota gemela con la misma redacción (enmienda autorizada por Neo); código y status intactos.
- spec.md REQ-VIN8-002: añadida precedencia H-429 (limitador HTTP 5/15 min -> 429 ERR-RATE-LIMITED primero; bloqueo REQ-LOG-001 en casos de uso -> ERR-AUTH-TOO-MANY-ATTEMPTS). Cifras sin cambio.
- Ambos JSON parsean. Sin src/tests, sin regenerar (keymaker), sin commit.

### 2026-11-23 — Architect: Feature 009 spec reconciliada + plan.md + tasks.md (DRAFT, sin commit)
- spec.md: decisiones D9-01/02/04/09/15 y defaults aplicados; añadidos Bloque F (REQ-DEL9-001/002, INV-DEL9-001), REQ-APR9-007, REQ-ADM9-006, EDGE-009-031..034, SC-009-044..049; REQ-APR9-006 diferido; INV-LIM9-001 reconciliada con D9-11 (intento en vuelo); REQ-ADM9-002 con Path=/api/admin. Propuestas D9-17..D9-20 pendientes de Neo.
- plan.md (14 ADR, 2 enmiendas N2) y tasks.md (T1201..T1277, 78 tareas, T1130 reutilizada con [GH:#17]); contracts/README.md índice sin contratos. verify-traceability --feature 009 falla por fuente ausente contracts/errors/error-catalog.json (esperado: contratos son tareas [ARCH]); cotejo manual 47/47 IDs propios, SC y EDGE cubiertos.

### 2026-11-23 — Architect: incorporación del acta /lock T1204 a la Feature 009 (DRAFT, sin commit)
- spec.md: EDGE-009-035..049 (texto del acta), REQ-APR9-008, SC-009-050; EDGE-009-033 sustituido por la vía manual de EDGE-009-037 (D9-18 aprobado); D9-17..D9-20 pasan a decididas; precisiones LCK-17/18/20/22/24/26; enmienda de REQ-PRO9-007 sobre 007 solo como nota firmable (LCK-16).
- plan.md: ADR-009-15 (números de límites, propuesta pendiente de firma de Neo) y ADR-009-16 (decisiones técnicas); RR-09-04 actualizado. Preguntas D9-21..D9-26 en architect-009-preguntas-neo.md (Parte 4).
- tasks.md: 21 tareas nuevas T1278..T1298, todas [ ]; D9-18 corregido. Sin tocar src/, tests/, contratos ni casillas.

### 2026-11-23 — Architect: aplicadas actas /mifune y /merovingian (T1205) a la Feature 009 (DRAFT, sin commit)
- plan.md: MIF-02/03/05/06/08/09/10 aplicados; tabla de contratos vigentes enmendados (002/004/005/006/007/008), ADR-01+02 fusionadas, ADR-06 corregida (migración oauth_flow_states), autoría de /admin sin updated_by_user_id, tabla de códigos de error (MER-10), ADR-16 con EDGE-036 de gasto acumulado (propuesta pendiente D9-21).
- spec.md: EDGE-009-036 reescrita (gasto acumulado, modelo x región, techo derivado), EDGE-009-045, REQ-CFG9-007, INV-CFG9-002, SC-009-051. tasks.md: 107 tareas (+8 T1299..T1306), Fase 5 en 5a (19) y 5b (15), T1212 bloqueada hasta D9-26. Preguntas P5-01..P5-06 en la Parte 5 del acta. Sin tocar src/, tests/, contratos ni casillas.

### 2026-11-23 — Architect: asentadas resoluciones de Neo D9-21..26 y P5-01..06 en la Feature 009 (DRAFT, sin commit)
- spec.md: EDGE-009-035/036/040/041/042/043/045/046/049 reescritos o precisados; nota de REQ-PRO9-007 pasa a resolución; REQ-DEL9-001 y REQ-CFG9-001/004 precisados; tabla única de decisiones firmadas; SC-009-041 y SC-009-051 ajustados.
- plan.md: ADR-009-01 y ADR-009-16 (1)(2)(4) reescritos (plazo único 10 min, sobreconteo aceptado); ADR-009-15 aprobada; Enmienda 009-B con tabla de costes; 007 y 006 como enmiendas versionadas; operaciones de borrado en el admin.openapi.yaml único.
- tasks.md: T1301, T1300, T1292, T1296 movidas de 5a a 5b (5a=15, 5b=19, total 107); T1212 desbloqueada; T1217/T1226/T1280/T1282/T1284/T1295/T1298/T1299 reescritas. Sin casillas nuevas. Acta de preguntas con Partes 4 y 5 «resuelta por Neo».

### 2026-11-23 — Architect: T1212 enmienda versionada de 007 (orden del prompt, 009) (sin commit; tasks.md sin tocar)
- 007/spec.md: nota de versión en cabecera; «Enmienda 009» en REQ-ESC7-003, R4 (orden de 8 puntos de REQ-PRO9-003), R1, REQ-ESC7-006, SC-007-039 y SC-007-043 (texto previo conservado). Los IDs de 009 se citan sin prefijo `REQ-` para no romper la compuerta de 007.
- 006/spec.md: nota de versión al final de REQ-ESC6-016 (orden desde cero superado por 007/009).
- Inventario: `.specify/memory/audits/architect-009-T1212-enmienda-007.md` (4 pruebas + hallazgo t874; SC-007-035 no es de prompt: la cita de T1212 es errónea).
- `verify-traceability.sh --feature 007`: CUMPLE (51/51).

## 2026-11-24 — T1217 contratos base de 009 (REVIEW, sin marcar [x])
- Creados en `specs/009-aprobacion-admin-correo/contracts/`: `errors/error-catalog.json` (1.0.0, 7 códigos propios), `state-machines/account-registration.machine.json` (STATE-ACCT9-001, adelanta T1241 (b)) y `openapi/admin.openapi.yaml` (1.0.0, `startAccountDeletionReauth` y `deleteAccountWithGoogleReauth`, esquemas inline cerrados; `HouseholdsActiveProblem` extiende ProblemDetails con `households`). README actualizado.
- Scripts (N2, Neo autorizó): entrada `--feature 009` en `compile-contracts.sh` (ensayo 004+005+006+009, salida `v35/`) y en `verify-traceability.sh` (usage + 6 exclusiones por decisión justificadas). 006 y 008 sin regresión.
- Decisión abierta para Neo: si el borrado Google exige `backupConfirmationToken` (declarado opcional como en 004). Solape de `ERR-ACCOUNT-DELETE-HOUSEHOLDS-ACTIVE` con `ERR-ACCOUNT-OWNS-SHARED-*` de 004 (T1284 verifica `src/`).

## 2026-11-23 — Decisión (g) de Neo: CSRF 403 antes de resolver sesión en /api/admin/* mutantes
- `admin.openapi.yaml` 1.1.0 -> 1.2.0 (MINOR, igual criterio que 1.1.0; cambia la respuesta de endAdminSession sin sesión y sin cabecera: 404 -> 403). Regla en `x-sdd-metadata.x-sdd-admin-mutation-csrf-order`, `change_note_1_2_0`, descripción de endAdminSession, 403 y parámetro CsrfHeader.
- `plan.md` ADR-009-07 recoge la misma regla. No se tocó `src/generated/**`, constitución ni tareas. Pendiente: recompilar contratos (tarea con firma de Neo) y contraste de /oracle.

## 2026-11-23 — Fallos de Neo (a)(b)(c): contrato 1.2.0 y ADR-009-07 aprobados; Origin después de sesión
- `admin.openapi.yaml` 1.2.0: quitado el Origin del orden previo a la sesión (endAdminSession descripción y 403, CsrfHeader); change_note 1.2.0 explica que Origin va después de la sesión para no filtrar existencia y registra la aprobación de Neo. `x-sdd-status` se deja `DRAFT` (precedente 1.1.0: el estado formal lo fija solo Neo). YAML válido (node `yaml`).
- `plan.md` ADR-009-07: Origin después de sesión; 403 solo por falta de `X-Argos-Request`; nota de aprobación de Neo.
- T1228 (tasks.md) y SC-009-009 (spec.md) reescritos con el texto exacto de Neo (404 sin sesión / 403 mutadores sin cabecera, guard INV-AUTH-007). No se tocó src/tests/generated/constitución ni marcas de tareas.

## 2026-11-23 — 009 SC-009-010/T1236 reescritos y ratificacion APPROVED (fallo Neo, Logos, opcion 1)
- spec.md SC-009-010, tasks.md T1236 y plan.md (fila UI) -> «cero referencias NUEVAS al portal»; linea base 008 fija en 3 archivos (role-help.ts, view-model.ts, HouseholdsPage.tsx; verificado por grep).
- admin.openapi.yaml 1.2.0: x-sdd-status y x-sdd-metadata.status = APPROVED; change_note_1_2_0 con «APPROVED por Neo (Logos, 2026-11-23)». plan.md Estado + ADR-009-07 = APPROVED. YAML parsea. Sin tocar src/tests/generated/constitution ni [x].
## 2026-11-23 — 009 plan.md Estado revertido a DRAFT (alcance de ratificacion)
- plan.md linea 4: APPROVED -> DRAFT (pendiente de firma de Neo); la ratificacion de Logos cubre SOLO admin.openapi 1.2.0 y ADR-009-07 (nota APPROVED de ADR intacta). Nada mas tocado.

## 2026-11-23 — Enmienda oráculo REQ-UI-004 (T1240)
- `presentation-architecture.spec.ts:50` permitía solo `web`/`.gitkeep`; T1235 añadió `src/presentation/admin/`.
- Añadido ADR-009-17 en plan.md; oráculo ahora permite exactamente `web`, `admin`, `.gitkeep` (lista cerrada, sin comodín).
- Rojo (falla en `admin`) -> verde 4/4; estricto verificado con copia scratch (`zzz-probe` detectada).

## 2026-11-23 — T1241 contratos de aprobación (Fase 4, #18) + retención 24 meses (RAMA-T1239-03)
- Retención `admin_audit_entries` = 24 meses (decisión Neo) escrita en spec (REQ-ADM9-004, NFR-009-004) y plan (ADR-009-08, ADR-009-16 punto 8), igual que `audit_log`.
- Línea 009: `admin.openapi.yaml` 1.2.0 -> 1.3.0 DRAFT (+list/approve/reject/suppress de `/admin/registrations`); `STATE-ACCT9-001` y `ERR-ADMIN-REGISTRATION-NOT-FOUND` ya existían (T1217), sin cambio; sin `schemas/` (MIF-06).
- Enmienda MINOR paralela DRAFT: 002 OpenAPI 3.4.0 / errores 3.3.0 / auth-session 3.2.0 / identity 3.2.0; 004 OpenAPI 3.5.0 / errores 3.3.0 / auth-session 3.2.0 / identity 3.3.0 (+AccountStatus, AccountStatusView, 3 ERR-ACCOUNT-*).
- YAML/JSON parsean y sus `$ref` locales resuelven; compilar y T1242 quedan para `/keymaker`. Sin tocar constitución, src ni tests.

## 2026-11-23 — Corte soberano de Neo: eliminar supresión anticipada manual (009)
- Retirada de `suppressAdminRegistration` y `SuppressRegistrationInput` (ownershipVerification) de `admin.openapi.yaml`; versión 1.3.0 DRAFT sin cambio (nunca ratificada, solo nota en change_note; la 1.3.0 pasa de 4 a 3 operaciones).
- Limpiados `account-registration.machine.json`, `error-catalog.json`, `contracts/README.md`, `spec.md` (REQ-APR9-008, EDGE-009-037, SC-009-050 eliminados sin renumerar; EDGE-009-033 reescrito), `plan.md` y `tasks.md` (T1290/T1291 retiradas con línea conservada, sin `[x]`).
- OpenAPI 002 3.4.0 y 004 3.5.0 pasan a APPROVED (Logos/Source, 2026-11-23); sin referencias a supresión en ellas. Pendiente keymaker: recompilar y limpiar src/tests.
- 2026-11-23 T1252: diseno retencion admin_audit_entries (opcion a, auditRowsPurged); ver audits/architect-009-T1252-retencion-admin.md

## 2026-11-23 — T1252 aclaracion spec (RAMA-T1239-03)
- spec.md REQ-ADM9-004 (l.141) y NFR-009-004 (l.190): frase aclaratoria: conteo de admin_audit_entries se suma a auditRowsPurged (003), sin sexta clave (opcion a del acta). Sin cambio de requisitos, IDs, contratos ni plan.

## 2026-11-23 — 009 Fase 5a: contratos T1256, T1257, T1302 (REVIEW, sin [x], sin commit)
- `admin.openapi.yaml` 1.3.0 -> 1.4.0: +listAdminParameters, updateAdminParameter (If-Match/412), resetAdminSceneQuota; 4 claves `scene.*` con `writable=false` hasta 5b (P5-06=B). Los 3 ERR-ADMIN-* ya existían (T1217): catálogo 009 sin cambio.
- 006: `scene.schema.json` 1.2.0 (`SceneView.disabled` opcional; MIF-07: ningún estado sirve), OpenAPI 3.6.0 (409 ERR-SCENE-DISABLED, nota «3.4.0» corregida), catálogo 1.1.0 (+ERR-SCENE-DISABLED). 005 `platform-parameter.schema.json` 1.0.1 (PATCH documental, sin cambio de forma).
- Acta: `.specify/memory/audits/architect-009-fase5a-contratos.md` (H-5a-01: value maxLength 200 vs JSON de prompt, a decidir en 5b). Sin compilar ni tocar src/generated.

## 2026-11-23 — 009 T1257: cita documental de ERR-SCENE-DISABLED en tasks.md 006 (REVIEW, sin [x], sin commit)
- Compuerta t801 fallaba: ERR-SCENE-DISABLED huérfano. Añadida nota tras la línea de cobertura de `specs/006-escena-hogar-pixel-art/tasks.md` citando ERR-SCENE-DISABLED, 009 T1257 y REQ-CFG9-003. Sin cambiar IDs, requisitos ni contratos.

## 2026-11-23 — 009 OBS-3 (T1262/T1268): alcance del reinicio sobre hogar compartido (dictamen, sin editar spec)
- Lectura: spec REQ-CFG9-006/D9-10/EDGE-009-022/SC-009-026, plan ADR-009-13, tasks T1262/T1268. Ninguno enumera tablas ni dice si un hogar compartido (home_scenes.owner_user_id NULL, household_id) se reinicia; EDGE-009-022 solo dice "sin escena o sin hogar: no falla".
- Dictamen: la spec NO fija el alcance. STATUS Blocked, pregunta de Nivel 2 a Neo (A: solo owner_user_id + carry; B: tambien hogares que el admin posee/administra). Recomendacion: A. Sin editar archivos.

## 2026-11-23 — 009 OBS-3: opción A de Neo asentada en spec/plan
- Editados: spec.md REQ-CFG9-006 y SC-009-026; plan.md ADR-009-13. Una frase aclaratoria por sitio: el reinicio solo toca contadores con owner_user_id de identidad del admin; hogares compartidos (owner_user_id NULL + household_id) intactos.
- Sin D9-27, sin cambios de IDs/contratos/tasks.md (T1262/T1268 no enumeran tablas; sin nota). Sin [x], sin commit.

## 2026-11-23 — 009 Fase 5b: borradores T1254, T1299, T1300 y dictamen de contrato prompt-blocks (DRAFT, sin [x], sin commit)
- Acta `.specify/memory/audits/architect-009-5b-borradores.md`: Enmienda 009-B (3.10.0) con Anexo A de costes VACIO (NO VERIFICADA, T1301); 2.5-flash-image deprecado: recomendada opcion A (mantener con vigencia hasta 2027-03-15); condiciones C1..C7 previas a T1255.
- T1299: declara global NO habilitada (T1294 FAIL), condiciones 1..8; propone constante de codigo SCENE_GLOBAL_LOCATION_ENABLED=false (no BD). T1300: formula de gasto acumulado, techo floor(5/costeMin) fail-closed, micro-USD enteros.
- Dictamen contrato: prompt-blocks/buildImagePrompt/markProviderCall CONFIRMADOS con ajustes A-1..A-6 (constantes a prompt-blocks.ts con re-export; maxBlockLength propuesto 1000; providerModel/Location opcionales en el tipo). Dudas Neo D-1..D-4. Sin tocar spec/plan/contratos/src/tests.

## 2026-11-23 — Fase 5b: T1254, T1299, T1300 y MINOR 005 aplicados como DRAFT (decisiones D-1..D-3 de Neo)
- constitution.md: cláusula (e)..(i) del Principio VI, cabecera SYNC IMPACT 3.10.0 DRAFT y Anexo A (15 regiones x 3 modelos); línea «Version» sigue 3.9.0 (009-A intacta). Las 45 celdas regionales NO VERIFICADA (T1301 sin tarifas ni disponibilidad); cotas D-2 45_000/75_000/150_000 anotadas aparte como decreto de Neo; techo 111.
- D-1 = A: gemini-2.5-flash-image con (h) hasta 2027-03-15 y deuda DEUDA-009-MODEL-DEFAULT-2027 (2027-02-01).
- 006 spec.md: nota T1299 (global latente, SCENE_GLOBAL_LOCATION_ENABLED = false, condiciones 1..8 abiertas). Nueva regla: specs/009.../regla-coste-micro-usd-009.md (T1300).
- 005 platform-parameter.schema.json 1.0.1 -> 1.1.0 MINOR: value.maxLength 200 -> 8192 (H-5a-01); sin compilar (lo hace /keymaker). tasks.md: solo notas de estado, sin [x]. Sin tocar src/ ni tests/.

## 2026-11-23 — Pausa parcial (Morpheus): sin cifras de coste
- Retiradas cifras D-2 y techo 111 de constitution.md (cláusula f y Anexo A), regla-coste-micro-usd-009.md y notas de tasks.md; discrepancia 3-pro 158.160 vs 150.000 anotada. Celdas: NO VERIFICADA (pendiente tarifa oficial Vertex). Resto (T1299, fórmula T1300, MINOR 005) intacto.

## 2026-11-23 — Architect: OBS-1 oracle-009-5b (corrección documental)
- Eliminadas cifras de coste (45_000/75_000/150_000/158.160) de constitution.md Anexo A (l.349) y regla-coste-micro-usd-009.md (l.10); nota D-2 «no transcritas aquí; T1301 pendiente».
- D-1, D-2 (unidad), D-3 y condiciones abiertas intactas; Version 3.9.0 intacta. Sin [x], sin commit.

## 2026-11-23 — Architect: regla-coste-micro-usd-009.md a APROBADA con Enmienda 009-B 3.10.0
- Estado DRAFT -> «APROBADA como parte de la Enmienda 009-B (3.10.0)»; sección 1 con tabla us-central1 (45_000 / 75_000 µUSD, 3-pro solo global ref. 158_160 fuera de enmienda) citando Anexo A; sección 3 techo 111; sección 7 actualizada.
- Fórmula, fail-closed, reinicio, D-3 y condiciones de global intactos. Constitución/Version sin tocar. Sin [x], commit ni push.

## 2026-11-23 — Architect: dictamen SEN-T1271-04 (If-Match)
- Contrato: ausente/malformado = 422, bien formado desfasado = 412 (IfMatch l.639; op l.472). Código conforme (use-cases :99/:107). Falso positivo; sin cambio de código ni contrato. Acta .specify/memory/audits/architect-009-SEN04-ifmatch.md. Sin [x], commit ni push.

## 2026-11-23 — Architect: admin.openapi.yaml 1.4.0 -> 1.5.0 DRAFT (sceneImagesFit)
- Autorizado por Neo (Nivel 2). GET /api/admin/parameters: +sceneImagesFit (readOnly, array 0..2 de AdminSceneImagesFit {model, location=us-central1, imagesFit 0..111}); imagesFit = floor(max(0, 5_000_000 - gastoAcumuladoMes)/coste(par)); 0 = tope alcanzado. Sin USD, sin datos personales, items intacto. Cita EDGE-009-036, D9-21, REQ-CFG9-004, Anexo A 3.10.0.
- change_note_1_5_0 añadida; version 1.5.0 DRAFT, APPROVED fuera. Sin src/tests, sin [x], sin commit.

## 2026-11-23 — Architect: correccion de texto 1.5.0 (oracle FAIL documental)
- admin.openapi.yaml: imagesFit.description (l.820) y change_note_1_5_0 (l.21) sin cifras de dinero (quitados 45_000, 5_000_000, USD/micro-USD, SCENE_MONTHLY_CAP_MICRO_USD).
- Forma, enums, required y version 1.5.0 DRAFT intactos. YAML parsea OK; grep de cifras/USD = 0.
- Sin [x], sin commit, sin push; src/ y tests/ intactos.

## 2026-11-24 — Architect: enmiendas 006 (Neo N2) rama fix/006-escena-defectos-uso-real
- (1) INV-ESC6-010/017 + REQ-ESC6-026: biografía saneada (sanitizeBiography) en prompt con y sin foto (SceneSpecPet.bio / PET_BIO_BLOCK, PET_BIO_RULE); noticeVersion '3' / 'gemini-api-3'. (2) REQ-ESC6-034: enfriamiento 60 s solo tras SUCCEEDED; 0 s tras FAILED/CANCELLED; topes 3/24h y 12/24h intactos. (3) Nuevos REQ-ESC6-039, INV-ESC6-021, ERR-SCENE-GLOBAL-QUOTA-EXHAUSTED (409), blockedReason GLOBAL_QUOTA_EXHAUSTED, puerto isExhausted sin consumo.
- Contratos DRAFT: scene-payload 1.1.0, scene 1.3.0, error-catalog 1.2.0, openapi 3.7.0; state-machine sin cambio. SC-ESC6-139..144; tasks Fase 15 T961..T968 (todas [ ]). compile-contracts OK; verify-traceability --feature 006 CUMPLE (251/251). Sin src/tests, sin commit.

## 2026-11-24 — Architect: T969 (documentar correcciones E/F/G/H de fix/006)
- tasks.md: T969 [ ] en Fase 15 (E contador «Actualizando…», F reloj real sin visibilitychange/INV-AUTH2-002, G prompt mixto IMG_n y PRESERVATION singular, H prueba estática Dockerfile); numeración, checkpoint y tabla (Fase 15 = 9, total 169) actualizados.
- spec.md: línea fechada 2026-11-24 en la nota de enmienda. Contratos intactos, sin recompilar. verify-traceability --feature 006: CUMPLE. Sin src/tests, [x] ni commit.

## 2026-11-24 — Architect: T968 cerrada documentalmente (C-1 y C-2)
- spec.md: INV-ESC6-010 + condición C-1 (biografía solo con PET_PHOTOS vigente del propietario en driver real; simulado sí; restricción adicional); nota de enmienda 2026-11-24 con línea de C-1/C-2 (aviso v3 §4 y §6, REQ-ESC6-026 sin cambio de versión).
- tasks.md: T968 con avance C-1/C-2; sigue [ ] (firma de Neo). T969 confirmada con E/F/G/H. Contratos intactos, sin recompilar, sin src/tests/commit.

## 2026-11-24 — Architect: T970 (salida JPEG, REQ-ESC6-035)
- spec.md: REQ-ESC6-035 enmendado (JPEG, stripJpeg, CHECK aditivo SQLite/PG, .jpg, log INVALID_OUTPUT con MIME cerrado); EDGE-ESC6-029 alineado; línea fechada en la nota de enmienda.
- Contratos: scene.schema.json sin cambio (su enum de mime es la foto de ENTRADA, ya incluye jpeg). home-scene.openapi.yaml 3.7.0 -> 3.8.0 (ImageAttachment admite webp/jpeg y filename .png|.webp|.jpg). Sin recompilar (src/ intacto).
- tasks.md: T970 [ ] (Fase 15, conteo 10). verify-traceability --feature 006: CUMPLE. Sin src/tests/commit/[x].

## 2026-11-24 — Architect: enmiendas OBS-1/2/3 (acta oracle-006-consolidado)
- spec 009: REQ-PRO9-002/003, INV-PRO9-001, SC-009-029 enmendados (una línea por mascota con foto; PRESERVATION_BLOCK por mascota con {photoRef}->IMG_n; regla "From IMG_n: " sin marcador; incrementales una vez con "its reference photo"); línea en Registro.
- spec 006: REQ-ESC6-035 documenta la excepción APP14 "Adobe" de stripJpeg (12 bytes, sin datos personales); decisión OBS-3 en la nota de enmienda 2026-11-24. Contratos intactos, sin src/tests/commit/[x].

## 2026-11-24 — Architect: enmienda producción (fix/009-escena-prod-admin-global)
- Neo (N2): modelo gemini-3.1-flash-image-preview + global (75_000 µUSD) admitido; gemini-2.5-flash-image + us-central1 (45_000) se conserva; preview + us-central1 inválido. Global sin residencia regional fija; aviso con variante global y noticeVersion propia (reconsentimiento).
- Reinicio de cuota del admin: todas sus cuentas (sin hogar + hogares donde es propietario legal), conserva provider_call_started_at. Cuota del hogar R de M y fecha de renovación siempre visibles a quien puede generar.
- Spec 009: D9-27/D9-28 (IDs de decisión, no REQ, porque la compuerta exige evidencia en src/tests), SC-009-052..055, Fase 5c T1307..T1310 [ ] (111 tareas). Spec 006: nota de enmienda. Dictamen rama T1294 intacto (riesgo residual aceptado). verify-traceability 009 y 006: CUMPLE. Sin src/tests/contratos/commit/[x].

## 2026-11-24 — Architect: acta oracle 6d8420c (OBS-D, OBS-F, OpenAPI 1.6.0)
- spec 009: D9-27 (7) guardado atómico de pareja modelo/región (pareja única en tabla, CAS sobre ambas filas, 412, 2 auditorías mismo occurredAt sin valor, 422 sin pareja única). Decisión: If-Match solo de la clave editada; compañero verificado por CAS en la transacción. Sin cambio de contrato. OBS-F: referencia cruzada a D9-27 en REQ-CFG9-004 y fila D9-09.
- admin.openapi.yaml 1.5.0 -> 1.6.0 (MINOR): sceneImagesFit.location enum [us-central1, global], «hoy 2 pares válidos». Sin recompilar.
- tasks.md: T1311 (recompilar/alinear v35), T1312 (hogar ajeno, OBS-A); total 113. verify-traceability --feature 009: CUMPLE. Sin src/tests/commit/[x].

## 2026-11-24 — Architect: OBS-2 acta oracle 98448fa (OpenAPI admin 1.6.1)
- admin.openapi.yaml 1.6.0 -> 1.6.1 (PATCH, solo texto): descripcion de AdminParameterKey ajustada a D9-27 (2 pares validos, global sin dictamen pendiente); change_note_1_6_1. Sin cambio de enum ni tipos.
- spec.md: EDGE-009-046 anotada "sustituido por D9-27" (REQ-CFG9-004 ya lo tenia). Sin recompilar: src/generated/v35/api/openapi-types.ts (descripcion JSDoc) queda para /keymaker. Sin src/tests/commit/[x].

## 2026-11-24 — Architect: fix/009-escena-driver-selector-y-reset (D9-29, D9-30, D9-31)
- spec 009: D9-29 (selector único de modelo; región derivada: 2.5 ⇒ us-central1, 3.1-preview ⇒ global, gemini-api sin región; scene.provider_location sale del catálogo, sustituye el guardado atómico de pareja de D9-27 (7)), D9-30 (scene.provider_driver vertex|gemini-api en caliente, enrutador con caché <= 60 s, falla cerrado, 3 modelos en gemini-api, secreto argos-gemini-api-key por versión numérica), D9-31 (reinicio de 4 límites con limits_reset_at; scene_attempts y provider_call_started_at intactos); SC-009-056..060; notas en REQ-CFG9-004/006. Decisiones D9-xx (no REQ) por la regla de la compuerta.
- Contrato: admin.openapi.yaml 1.6.1 -> 1.7.0 (MINOR, DRAFT; scene.provider_location -> scene.provider_driver en AdminParameterKey; sceneImagesFit.location se conserva). Sin recompilar (T1313). Enmienda constitucional 009-C (3.10.0 -> 3.11.0) en BORRADOR: .specify/memory/audits/enmienda-009-C-borrador.md, sin tocar constitution.md ni firmar.
- tasks.md Fase 5d T1313..T1317 [ ] (118 tareas); nota de enmienda en spec 006. Traza 009 y 006: CUMPLE. Abiertos para Neo: costes oficiales de gemini-api (fail-closed en producción), closedWithoutCall 5 vs 20 (D9-25), semántica de run_state='failed', privacidad de gemini-api (/rama). Sin src/tests/commit/push/[x].

## 2026-11-24 — Architect: decisiones de Neo (a)(b)(c)(d) sobre fix/009-driver-selector-y-reset
- (a) closedWithoutCall = 20 confirmado: SC-009-059 y D9-31 (c) corregidos de 5 a 20 (D9-25, EDGE-009-043; sin cambio de código). (b) run_state='failed' -> NULL con current_attempt_id NULL; generating, scene_attempts y provider_call_started_at intactos (D9-31, SC-009-059).
- (c) 009-C APPROVED 3.11.0 verificada contra constitution.md. Contradicciones corregidas: D9-30 "en borrador" y (7) "bloqueante abierto/[verificar]" (ahora costes del Anexo A: 45_000/75_000/75_000 gemini-api; Vertex 2 pares); T1314/T1315 y línea de Fase 5d en tasks.md; spec 006 (nota 009-C "pendiente de firma", REQ-ESC6-037 (1) marcada sustituida, tope 20). Lista de modelos de gemini-api coincide con la constitución.
- (d) Compilación v35 desde OpenAPI 1.7.0 autorizada (anotado). OpenAPI sigue DRAFT (estado solo de Neo). verify-traceability 009 y 006: CUMPLE. Sin src/tests/commit/push/[x].

## 2026-11-24 — Architect: D9-32 retirada de gemini-3.1-flash-image-preview (chore/009-cierre-escena-prod)
- spec 009: D9-32 (preview retirado, 404 en Vertex global verificado en produccion; migracion PG 0023 / SQLite 0027); menciones normativas -preview -> sin sufijo en 009 y 006; historicas fechadas conservadas.
- Constitucion: preview fuera del Anexo A (tabla/lista) y de 009-C; firma intacta; linea fechada de retirada (Neo, Logos). OpenAPI admin 1.7.0 -> 1.7.1 PATCH (solo texto; sin enum con el preview).
- tasks: T1318..T1320 [ ] (121 tareas). verify-traceability 009 y 006: CUMPLE. Sin src/tests/commit/push/[x]/recompilar.

## 2026-11-24 Architect: correccion menor H-ORC-240b-2
- spec.md 009: L150 (nota "tras D9-32 son 2 modelos" + circularidad), L208 D9-09, L290 SC-009-052 (rechaza -preview y pares no listados), L296 SC-009-058 (duplicado). Sin tocar src/tests.

## 2026-11-24 — Architect: Feature 010 (Tipi identidad, legal, borde) — spec, plan, tasks
- Carpeta `specs/010-tipi-identidad-legal-borde/` (spec, plan, tasks T1401..T1442, research, data-model, quickstart); `.specify/feature.json` apunta a ella. Etiquetas `[GH:#65/#66/#67/#75/#33]` presentes en cada bloque y tarea; T1438..T1442 asocian el Linked PR por Issue.
- Orden: #65 -> #67 -> #66 -> #75 -> #33. Decisiones abiertas D10-01..D10-07 para Neo (renombre interno, /admin editable, spoofing XFF, Cloudflare manual vs Terraform, edad minima, placeholders legales, /acerca-de publica). Gates: /rama (#67,#75,#33), /trinity+/sentinels (#66,#33), /lock (T1402), /mouse una vez (T1403), /sati (#65,#67,#33).
- verify-traceability --feature 010: el script no tiene rama 010 y exige contracts/errors/error-catalog.json (ausente, no se crea sin N2): rc 2 "Fuente ausente". Tarea pendiente N2: ampliar script y crear contratos. Sin src/tests/commit/push/casillas marcadas.

## 2026-11-24 — Architect: decisiones D10-01..D10-07 APPROVED asentadas (010)
- spec.md: tabla «Decisiones de Neo» D10-01..07, todas `APPROVED` 2026-11-24 (spec sigue DRAFT). REQ-TIP10-005 no se implementa (D10-02, T1409 N/A tras T1403, sin marcar); EDG10-001 con ARGOS_TRUST_PROXY_HOPS 0..3 y nota EDGE-010-002; MEN10-001 con código de error. tasks.md: T1409, T1423, T1429 actualizadas; 0 casillas marcadas, 50 etiquetas [GH:#N] intactas.
- Creado contracts/errors/error-catalog.json 1.0.0 DRAFT (mínimo): ERR-MEN10-ADULT-DECLARATION-REQUIRED, ERR-ACE10-PHOTO-INVALID, ERR-ACE10-PRECONDITION-FAILED. JSON parsea. Sin recompilar. verify-traceability --feature 010: CUMPLE (70/70 IDs). Sin src/tests/commit/push.

## 2026-11-24 — Architect: enmienda 010 tras T1402 de /lock
- spec.md: H-06 (REQ-MEN10-002 vigente); EDGE-010-001..007 ampliados; formalizados EDGE-010-008..012 (011 con propuesta 20 000 caracteres); sección «Pendiente de decisión de Neo» con H-01, H-02, H-03 (dos opciones cada una, sin decidir). quickstart paso 4 y T1417/Bloque C corregidos (H-04: ARGOS_HOST=0.0.0.0 o prueba de unidad del parser).
- tasks.md: nuevas T1443 (EDGE-010-003, Bloque A) y T1444 (/acerca-de sin /auth/me y enlaces, H-05); T1411, T1416, T1418, T1422, T1428, T1429, T1432, T1404, T1408 ampliadas; total 44, 0 casillas marcadas. verify-traceability --feature 010: CUMPLE rc 0. Sin src/tests/commit/push.

## 2026-11-24 — Asiento de resoluciones de Neo en Feature 010 (H-01/H-02/H-03, tope body_markdown)
- Neo (Nivel 2, Logos) resolvió H-01=A (acceso directo *.run.app aceptado, anula REQ-EDG10-003 en ese camino), H-02=A (límite «por instancia y por IP real», sin tabla), H-03=A (adultDeclaration antes de consumir estado OAuth; 422 no lo consume), EDGE-010-011 = 20 000 caracteres.
- Editados: spec.md (REQ-EDG10-002/003, REQ-MEN10-001, SC-010-014..021, EDGE-010-002/005/008/009/010/011; sección «Pendiente» retirada y reemplazada por «Decisiones de Neo» APPROVED 2026-11-24), data-model.md (tope), tasks.md (T1416, T1418, T1419, T1422, T1428, T1429). Sin src/tests, sin [x], sin commit. H-04 confirmado.
- verify-traceability.sh --feature 010: CUMPLE (rc 0).

## 2026-11-24 — Feature 010: cierre de O-1 y O-2 (mouse T1403)
- O-1: spec.md cita `ERR-ACE10-PHOTO-INVALID` (422) en REQ-ACE10-002 y `ERR-ACE10-PRECONDITION-FAILED` (412) en REQ-ACE10-003.
- O-2: tasks.md expande rangos REQ/INV/EDGE/SC a IDs explícitos (18 líneas); se dejan intactas T1401..T1403 y T1409 (firmadas, incluidos sus rangos).
- verify-traceability --feature 010 rc 0; sin [x] nuevos, sin commit.

## 2026-11-24 — 010 Bloque B, T1412 (legal-texts.md)
- Redactado specs/010-tipi-identidad-legal-borde/legal-texts.md (DRAFT): bloques PRIVACIDAD y TÉRMINOS, tabla de verificación contra disco y resumen de puntos pendientes de validación legal (7).
- 4 placeholders literales (D10-06); ambos proveedores de IA (Vertex y Gemini Developer API) y biografía con consentimiento (009-C, aviso v3); cláusula 18+ y supresión (D10-05) con constancia de validación legal externa.
- Sin cifras de cuota/coste ni plazos de retención; retención del enlace /shared y de copias marcadas pendientes de validación (verificar en T1414).
- Sin src/tests, sin commit, sin [x]. verify-traceability --feature 010 ver registro.

## 2026-11-24 — 010 Bloque B: rangos SC y fecha en legal-texts (hallazgo T1411)
- spec.md líneas 53 y 119: `SC-010-007..013` expandido a 7 IDs explícitos (solo texto). tasks.md ya citaba IDs explícitos (T1411, T1413 sin rango).
- legal-texts.md: añadida fecha 2026-11-24 y nota «DRAFT hasta dictamen de /rama»; decisión de no publicar sin validación legal intacta.
- verify-traceability --feature 010 y --task T1411: ver registro. Sin src/tests, commit ni [x].

## 2026-11-24 — 010 legal-texts.md: correcciones del dictamen /rama (T1412/T1414)
- Solo legal-texts.md (DRAFT). §6: foto del hogar solo en desde cero, especie «otra», condición PET_PHOTOS (también sin foto), «no se copia en los registros de escena», región por modelo; §3: sub de Google, auditoría e intentos de escena; §7: caducidad 1/7/30, revocación, casillas; §8: cookies admin; §10: Google sin contraseña, respaldo opcional, hogar solo propietario.
- Bloques 18+ (§3, §11, Terms §3) condicionados a T1424. Menores: redacción provisional, sin acción de admin ni correo (pendiente Neo 2). Gemini API y clave: pendiente Neo 1. Plazos de copias: pendiente de verificación, sin cifras.
- Sin tocar scene-notice/notice, src/tests; sin commit/[x]. verify-traceability --feature 010 rc 0.

## 2026-11-24 — 010 T1412 cerrado con decisiones de Neo (Logos)
- legal-texts.md (DRAFT): clave de Gemini API = clave operativa de Tipi (Secret Manager, 009-C/D9-30), sin uso local ni clave propia (/privacidad §6, /terminos §7); menores = canal [CORREO DE CONTACTO / PRIVACIDAD] + eliminación directa en /cuenta, sin REQ ni botón; copias internas sin cifras («respaldos internos temporales con retención acotada que se purgan automáticamente»); aviso sin cambios (scene-notice.ts/notice.ts intactos).
- Hallazgos del dictamen ya incorporados (foto del hogar solo desde cero, Google sin contraseña, cookies admin, 18+ condicionado a T1424). tasks.md T1412: texto de estado REVIEW, sin [x].
- verify-traceability --feature 010 rc 0. Sin src/tests, commit ni push.

## 2026-11-24 — DEUDA-010-NOTICE (decisión de Neo vía Morpheus)
- spec.md: fila DEUDA-010-NOTICE en «Decisiones de Neo — H-01..» (scene-notice.ts v3→v4 diferido; líneas :52,:54,:68,:87,:101).
- tasks.md: línea sin casilla tras T1415 (cierre Bloque B). Sin src/tests, commit ni [x].

## 2026-11-25 — 010 spec: ipLimitKey y H-T1418-01..03 (autorizado por Neo en Logos)
- spec.md: REQ-EDG10-003 y SC-010-016 por clave normalizada ipLimitKey (IPv6 /64, IPv4 sin puerto, sin [ ] ni %zona, ::ffff: a IPv4, minúsculas, 'invalid') y tope duro por antigüedad en 5 mapas.
- Tabla de decisiones: H-T1418-01 APPROVED, -02 resuelto en código, -03 riesgo BAJO aceptado (runbook T1419). Dictamen trinity-010-T1418.
- tasks.md: solo nota; sin [x], commit ni push.

## 2026-11-25 — 010 SC-010-022..026 expandido y versión 18+ (hallazgos keymaker T1422/T1423)
- spec.md: `SC-010-022..026` (Independent Test de US4 y Success Criteria) expandido a 5 IDs explícitos, contenido normativo intacto; SC-010-023/024 dejan de salir «desconocido».
- `adult_notice_version` = SemVer N.N.N, constante única `ADULT_NOTICE_VERSION = "0.1.0"` mientras legal-texts.md sea DRAFT; 1.0.0 solo con aprobación de Neo. Registrado en spec.md (REQ-MEN10-001, H-ARCH-ADULT-VERSION) y legal-texts.md §0.
- verify-traceability --feature 010 rc 0; --task T1422 sin FAIL de desconocidos. Sin src/tests/contracts, sin [x], sin push.

## 2026-11-25 — 010 T1425: edad mínima 18+ y procedimiento ante cuenta de menor (REQ-MEN10-004)
- legal-texts.md (DRAFT) y páginas /terminos §3 y /privacidad §3 y §11: cláusulas 18+ sin condicionar (casilla «Soy mayor de edad (18+)» existe desde T1424), versión 0.1.0, sin fecha de nacimiento ni documento; cuentas anteriores intactas.
- Menores: contacto [CORREO DE CONTACTO / PRIVACIDAD] (previsto contacto@tipi.pet, placeholder intacto hasta T1437) y eliminación desde /cuenta; sin acción de administración. scene-notice y LegalLayout sin tocar.
- Pendiente /rama T1426: suficiencia de la declaración sin verificar edad, plazo de respuesta/supresión, conservación de la declaración, edad mínima por jurisdicción. verify-traceability --feature 010 rc 0, tsc 0, t1411 18/18. Sin [x], sin push.

## 2026-11-25 — 010 T1426: redacciones de /rama aplicadas (menores)
- Privacidad §3 (plazo de la declaración 18+), Privacidad §11 (sin documentos de identidad al revisar) y Términos §3 (eliminación desde /cuenta con condiciones de la sección 10), idénticas en legal-texts.md y en /privacidad y /terminos. Versión 0.1.0 DRAFT, 4 placeholders intactos, sin contacto@tipi.pet.
- No aplicado RAMA-T1426-01 (decide Neo). scene-notice y LegalLayout sin tocar. tsc 0, traza 010 rc 0, t1411 rc 0. Sin [x], sin push.

## 2026-11-25 — 010 deudas de menores y Google, versión 0.1.0 confirmada (decisiones de Neo en Logos)
- spec.md (tabla de decisiones): `DEUDA-010-MENOR-SUPRESION` (nunca DELETE manual en SQL; supresión por el caso de uso transaccional de /cuenta; ref. RAMA-T1426-01) y `DEUDA-010-LOCK-GOOGLE-MINOR` (H-01, H-02 BAJA, fuera de 010; ref. lock-010-T1426-google).
- legal-texts.md §0: 0.1.0 confirmada por Neo para DRAFT; 1.0.0 solo tras validación legal externa (T1437). tasks.md sin cambios míos (solo los [x] de Neo). Sin src/tests, sin push.

## 2026-11-25 — 010 dictamen T1428/T1429 antes de T1430 (3 puntos del keymaker)
- 413: opción (a) por convención (ERR-MEDIA-TOO-LARGE 004, ERR-BACKUP-PAYLOAD-TOO-LARGE 001/002): +ERR-ACE10-BODY-TOO-LARGE en catálogo 010 1.2.0 y about.openapi 1.0.1 (error-order y 413); compile --feature 010 rc 0 sin deriva en src/generated/api.
- Claves: `about/photo/<uuid-v4>` (excepción a INV-ARC-003, patrón 006); media-keys + guards (LIST_PREFIXES, RECONCILED_PREFIXES, 15 min); adaptadores memoria/GCS no cambian. Registrado en spec.md (H-ARCH-ACE-KEY).
- Foto siempre suma version y mapeo FST_ERR_CTP_BODY_TOO_LARGE→413 en /api/admin/about* confirmados (H-ARCH-ACE-413, -VERSION). traza 010 rc 0. Sin src/tests, sin [x], sin push.

## 2026-11-25 — 010 T1430: expansión SC-010-027..035 en spec.md
- Independent Test de la historia y línea de Success Criteria (#33) listan ahora los 9 IDs explícitos (mismo patrón que SC-010-022..026); 9 frases para 9 IDs, contenido normativo intacto. Mapeo ID-frase no inventado.
- verify-traceability --feature 010 --task T1430 rc 0 (antes rc 1) y --feature 010 rc 0. Sin src/tests, sin [x], sin push.

## 2026-11-25 — 010 dictamen OBS-3 de T1431: política de photoAlt con foto
- Opción (b): alt OPCIONAL; vacío con foto = imagen decorativa válida (WCAG 1.1.1, H67); la vista pública emite `alt=""` siempre presente. Motivo: la foto se sube por operación sin alt y el alt viaja en PUT de texto con If-Match; obligarlo bloquearía editar solo el texto y no hay operación de quitar foto. Aviso no bloqueante de la UI se mantiene.
- spec.md `H-ARCH-ACE-ALT`; about.schema 1.0.1 PATCH (solo descripción de AboutPhotoAlt); compile --feature 010 rc 0; traza 010 rc 0. Sin src/tests, sin [x], sin push.

## 2026-11-25 — 010 visto bueno a la excepción fetch de AboutPage (T1432 TRI-02, e384094)
- APROBADA: AboutPage.tsx tiene un único fetch (GET /api/about, credentials 'omit'), sin notifyActivity ni métodos de escritura; la guarda conserva toEqual exacto, así que otro archivo nuevo con fetch sigue fallando. Pública, sin sesión: no notifica actividad (INV-AUTH2-002).
- spec.md `H-ARCH-ACE-FETCH`. Observación: admin/about-api.ts (sesión, fuera de la guarda por ruta) no llama notifyActivity; no es objeto de este dictamen, se deja a oracle/keymaker si procede.
- security ui-invitation-logs rc 0 (9/9). Sin src/tests, sin [x], sin push.

## 2026-11-25 — 010 decisiones de Neo tras dictamen rama T1432
- spec.md: `DEUDA-010-ABOUT-DELETE-PHOTO` (foto = REEMPLAZO, retirada futura, contrato 1.8.0 intacto), `DEC-010-ABOUT-LEGAL-REVIEW` (abogado externo antes de T1437, pendiente legal, sin redactar), `DEC-010-E2E-SCHEMAVERSION` (3.2.0→3.3.0 autorizado), `NOTA-010-TIPI-FUENTE` (pendiente /sati,/keymaker antes de T1434).
- Sin src/tests, sin [x], sin push, sin stash.

## 2026-11-25 — 011 paquete SDD (spec, plan, tasks, contracts/README) desde claude/inbox-feature-011.md
- Creado specs/011-pulido-portal-hogares-admin/ (DRAFT): 9 bloques con [GH:#64,#72,#73,#63,#31,#59,#62,#74,#78], T1501..T1561; cada bloque con tarea [LOCAL] de prueba manual antes de compuertas y cierre con gh-project-sync; T1560 asocia Linked PR (Closes #N).
- spec.md: 13 decisiones pendientes para Neo (D11-01..13, 2FA = D11-02 sin decidir). Hallazgos: no existe tope de hogares; no hay avatar de usuario; vista publica excluye foto de mascota (invariante 005, contradice #31); no hay LLM de texto hoy; canal por el que se ve el prompt sin confirmar (echo del fake incrusta tEXt; T1520 lo audita).
- verify-traceability --feature 011 rc 2: el script no soporta 011 (exige contracts/errors/error-catalog.json y patrones de IDs; es script N2, no tocado). sync --dry-run reconoce los 9 Issues. Sin src/tests, sin [x], sin push, sin stash.
