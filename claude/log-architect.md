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
