# Acta /mouse T1206 — Compuerta estructural única de la Feature 009

- **Fecha**: 2026-11-23
- **Rama**: `009-aprobacion-admin-correo`
- **Alcance**: forma SDD únicamente (trazabilidad, historias, etiquetas `[GH:#N]`, contratos declarados, orden de fases, plantilla). No evalúa lógica de negocio (cubierta por `/lock`, `/mifune`, `/merovingian`).
- **Artefactos leídos**: `specs/009-aprobacion-admin-correo/{spec,plan,tasks}.md`, `contracts/README.md`; referencia de estructura `specs/008-sso-portal-roles/tasks.md`.
- **Modo**: lectura. Sin commit, sin push, sin checkout, sin casillas `[x]` nuevas, sin cambios en spec, plan, tasks, contratos ni `src/`.

## Veredicto

**BLOCKED (Requiere corrección de `/architect`)**, por un único defecto de etiquetado (criterio 3). Los criterios 1, 2, 4, 5 y 6 cumplen. El resto del paquete está estructuralmente sano.

## Checklist estructural

| # | Criterio | Resultado | Evidencia |
|---|---|---|---|
| 1 | Trazabilidad 1:1 spec → tasks (REQ, INV, EDGE, SC, NFR con tarea; sin tareas huérfanas con IDs inexistentes) | **PASS CON OBSERVACIONES** | 153 IDs propios de 009 en spec (37 REQ, 10 INV, 49 EDGE, 51 SC, 5 NFR, 1 STATE). Los 153 aparecen citados en `tasks.md`. 152 los cubren una tarea ejecutable. 1 solo en diferimiento explícito: `REQ-APR9-006` (spec línea 133, `D9-01` = A; tasks «Diferido de esta feature (sin casilla)»). IDs de tareas sin definición en spec: 0 propios. Las citas externas (`REQ-ESC6-016/028`, `REQ-ESC6-017/031`, `INV-ARCH-006`, `ERR-*` de `plan.md`) existen en 006/constitución/plan. |
| 2 | Cero historias huérfanas | **PASS** | 6 de 6 User Stories tienen bloque con tareas: US1 `#18` → Fase 4; US2 `#19` → Fase 3; US3 `#20` → Fase 5a/5b; US4 `#57` → Fase 1 Bloque B; US5 `#60` → Fase 1 Bloque A; US6 `#17` → Fase 2 (`T1130`). Ninguna marcada como diferida. |
| 3 | Etiquetas `[GH:#N]` en encabezados y tareas (#18, #19, #20, #57, #60; sin `[GH:#17]` activa, solo «(deuda #17)») | **FAIL** | Tasks: **PASS**. Encabezados de bloque `[GH:#60]`, `[GH:#57]`, `[GH:#19]`, `[GH:#18]`, `[GH:#20]` presentes. Las 10 tareas sin `[GH:]` son todas `(deuda #17)` (T1130, T1202, T1217–T1223, T1284); 0 tareas con `[GH:#17]` activa. **Spec: 4 ocurrencias de `[GH:#17]` activa**: línea 32 (Alcance), línea 69 (cabecera US6), línea 161 (cabecera Bloque F), línea 291 (fila de la tabla de trazabilidad). Deben pasar a «(deuda #17)». |
| 4 | Contratos declarados con tarea (`plan.md` y `contracts/README.md`) | **PASS** | Cada contrato del plan (tabla de enmiendas, líneas 17–28) y del README tiene tarea: 002/004 (`T1241`), 006 `SceneView`/catálogo/OpenAPI (`T1257`), 006 `REQ-ESC6-017/031` (`T1299`), 005 (`T1302`), 007 (`T1212`, bloqueada por `D9-26`), 008 `oauth_flow_states` (`T1219`), nuevos de 009: `admin.openapi.yaml` (`T1226`, `T1256`), `error-catalog.json` (`T1217`, `T1226`, `T1241`, `T1256`), `state-machines/` `STATE-ACCT9-001` (`T1241`), entrada `--feature 009` en scripts (`T1217`). Ningún `schemas/` (MIF-06). |
| 5 | Orden de fases F0 → F1 → F2 → F3 → F4 → F5a → F5b → Cierre sin dependencias invertidas | **PASS CON OBSERVACIONES** | Ninguna dependencia apunta a una fase posterior (comprobado con script sobre los 107 `Dep:`; 0 inversiones). Todas las dependencias inter-fase apuntan hacia atrás. Observación: 25 dependencias intra-fase citan una tarea de número mayor (p. ej. `T1209→T1279`, `T1216→T1281/T1282`, `T1130→T1218/T1219/T1284`, `T1300→T1301`). No cruzan fase; el orden de ejecución dentro de cada fase debe seguir el `Dep:` y no la numeración. |
| 6 | Plantilla: secciones obligatorias en spec, plan y tasks | **PASS** | Spec: título, cabecera (Branch, Created, Status, Input), Verificación de premisas, Alcance y no alcance, User Scenarios & Testing, Edge Cases, Requirements, Requisitos no funcionales, Decisiones, Success Criteria, Trazabilidad, Registro (superconjunto de la plantilla de 008). Plan: Summary, Technical Context, Constitution Check, Topología, Decisiones (ADR), Estructura, Orden de fases, Códigos de error, Riesgos, Diferido, Registro. Tasks: Format, Reglas transversales, Fases, Fase final, IDs de trazabilidad, Diferido, Registro, Estado y Numeración en cabecera. |

## Script de compuerta

- Comando: `bash scripts/verify-traceability.sh --feature 009`
- Salida literal: `[SDD Traceability Gate] Fuente ausente: specs/009-aprobacion-admin-correo/contracts/errors/error-catalog.json`
- **Exit code: 2**
- Interpretación: estado esperado. El script aborta por contrato ausente porque `error-catalog.json` se redacta en las tareas `[ARCH]` `T1217` (y `T1226`, `T1241`, `T1256`), que existen en `tasks.md`. No se cuenta como FAIL estructural. La compuerta de trazabilidad por código no puede evaluarse hasta que `/architect` cree el catálogo y `/keymaker` compile.

## Conteos

- **Tareas con casilla**: 107 (coincide con la cabecera de `tasks.md`).
- **Por fase**: F0 = 7 (T1201–T1206, T1278); F1 = 15; F2 = 9; F3 = 19; F4 = 18; F5a = 19; F5b = 15; Cierre = 5. Suma 107. Fase 5 = 34 (5a 19 + 5b 15), como declara la cabecera.
- **Marcadas `[x]`**: 3 (T1201, T1202, T1203, firmas de Neo previas). Ninguna marca de este acta.
- **Tareas `[ARCH]`**: 11 (T1212, T1217, T1224, T1226, T1241, T1254, T1256, T1257, T1299, T1300, T1302).
- **IDs propios de 009 en spec**: 153. Sin tarea ejecutable: 1 (`REQ-APR9-006`, diferido explícito). IDs propios sin ninguna cita en tareas: **0**.
- **IDs de tarea sin definición**: 0 propios de 009.

## Defectos estructurales (para /architect)

1. **D-1 (criterio 3, bloqueante)**: en `specs/009-aprobacion-admin-correo/spec.md`, reemplazar la etiqueta activa `` `[GH:#17]` `` por `(deuda #17)` en las líneas 32, 69, 161 y 291. Es un cambio de texto; no altera requisitos.

## Observaciones (no bloquean)

- **O-1**: `REQ-APR9-006` sin tarea ejecutable (diferido por `D9-01`). Se recomienda marcarlo como «DIFERIDO» en su línea de la spec, igual que las historias diferidas en 008.
- **O-2**: `ERR-SCHEMA-VALIDATION-FAILED` aparece en `SC-009-018` (spec línea 247), pero ninguna tarea nombra el código. `T1258` cubre el SC. Conviene citar el código en `T1258` o en el catálogo.
- **O-3**: el encabezado de la Fase 2 y los de F0 y Cierre no llevan `[GH:#N]` en el título (la Fase 2 usa «deuda de 008»). Es coherente con la regla de `(deuda #17)`; las tareas sí llevan etiqueta donde corresponde.
- **O-4**: el orden de bloques en la spec es A, B, C, F, D, E (F antes que D). Es cosmético.
- **O-5**: 25 dependencias intra-fase con numeración hacia adelante (ver criterio 5).

## Ruta de cierre

Tras D-1, `/architect` reemite la spec y Morpheus vuelve a despachar `/mouse` (T1206 sigue abierta y no se marca `[x]` hasta que Neo cierre la compuerta). `T1206` no se puede marcar `COMPLETED` desde este agente: su techo es `REVIEW`.

---

## Re-auditoría — T1206 tras la corrección de `/architect`

- **Fecha**: 2026-11-23
- **Modo**: lectura. Sin commit, sin push, sin checkout, sin casillas `[x]` nuevas, sin cambios en spec, plan, tasks, contratos ni `src/`. Esta sección no reescribe el acta previa.
- **Nota de método**: `specs/009-aprobacion-admin-correo/` es untracked en git; no hay diff disponible. Los cambios se verificaron contra el acta previa (conteos por fase, secuencia de IDs, presencia de etiquetas) y por grep literal.

### Veredicto

**PASS CON OBSERVACIONES**. D-1 queda resuelto. O-1 y O-2 quedan confirmadas como no bloqueantes (O-2 resuelta). O-4 es cosmética. Las observaciones O-3 y O-5 siguen vigentes y tampoco bloquean.

### Criterio 1: `GH:#17` activa en spec

- Comando: `grep -n "GH:#17" specs/009-aprobacion-admin-correo/spec.md`
- Salida: sin coincidencias (exit 1). **PASS**.
- Cuatro ocurrencias de «(deuda #17)» sin corchetes, en las líneas 32, 69, 161 y 291.

### Criterio 2: historias sin huérfanas

- Seis de seis User Stories con bloque de tareas. US6 (`#17`, deuda) → Fase 2 (`T1130`). **PASS, sin cambio**.

### Criterio 3: etiquetas `[GH:#N]`

- Encabezados de spec con etiqueta literal: `[GH:#18]` (línea 38), `[GH:#19]` (44), `[GH:#20]` (50), `[GH:#57]` (58), `[GH:#60]` (63); bloques A `#18` (127), B `#19` (138), C `#20` (148), D `#57` (166), E `#60` (178).
- Encabezados de US6 y Bloque F sin corchetes: «(deuda #17)» en líneas 69 y 161.
- Tabla de trazabilidad (líneas 286–290) con `#18`, `#19`, `#20`, `#57`, `#60`; la fila de deuda #17 en línea 291 también sin corchetes.
- Tasks: `[GH:#N]` presente en encabezados de Fase 1 (Bloques A y B, `#60` y `#57`), Fase 3 (`#19`), Fase 4 (`#18`), Fase 5 (`#20`), y en tareas de esos bloques. Las tareas `(deuda #17)` (T1130, T1202, T1217–T1223, T1284) no llevan `[GH:#17]`.
- **PASS**.

### Criterio 4: contratos declarados con tarea

- Sin cambio de IDs en el conteo de tareas `[ARCH]` (11, misma lista). Se confirma T1256 con `ERR-SCHEMA-VALIDATION-FAILED` (ver O-2). **Sin cambio, PASS**.

### Criterio 5: orden de fases

- Orden de fases en tasks sin cambio: Fase 0, 1, 2, 3, 4, 5 (5a, 5b), Fase final. **Sin cambio, PASS**. Las 25 dependencias intra-fase de la previa (O-5) se mantienen como observación.

### Criterio 6: plantilla

- Secciones de spec, plan y tasks presentes. **Sin cambio, PASS**.

### Criterios 1, 2, 4, 5 y 6 (ejecución)

- Por conteos idénticos al acta previa (ver criterio 5) y etiquetas corregidas sin cambio de IDs, se reporta **sin cambio**. No se reejecutaron scripts de dependencias.

### Conteos actuales (tasks.md)

- Tareas con casilla: **107** (coincide con la cabecera y con la previa).
- Marcadas `[x]`: **3** (T1201, T1202, T1203, firmadas por Neo). Ninguna marca de este acta.
- Por fase: F0 = 7 (T1201–T1206, T1278); F1 = 15; F2 = 9; F3 = 19; F4 = 18; F5a = 19; F5b = 15; Cierre = 5. Suma 107. Fase 5 = 34.
- Sin IDs duplicados. Las referencias sin definición en tasks (`T1101`, `T1122`, `T1200`) son citas a la numeración de la Feature 008 (`T1101..T1200`), no tareas huérfanas de 009.

### Observaciones (no bloquean)

- **O-1 (confirmada)**: `REQ-APR9-006` está diferido sin fase por `D9-01` = A. Lo declaran `spec.md` línea 133 («DIFERIDO sin fase»), `tasks.md` línea 142 («diferida sin fase») y `SC-009-008` (línea 237). Trazabilidad consistente. Sin tarea ejecutable, por diseño.
- **O-2 (resuelta)**: T1256 reutiliza `ERR-SCHEMA-VALIDATION-FAILED` del catálogo vigente de 001 (`specs/001-pet-health-tracker/contracts/errors/error-catalog.json`, línea 54). Se referencia, no se redefine. Cubre `SC-009-018` y `REQ-CFG9-007`.
- **O-3 (vigente, cosmética)**: encabezados de Fase 2, F0 y Cierre sin `[GH:#N]` en el título. Coherente con «(deuda #17)».
- **O-4 (confirmada, cosmética)**: en `spec.md` los bloques aparecen en orden A, B, C, F, D, E (F antes de D). `tasks.md` mantiene el orden de fases correcto. No afecta a la trazabilidad.
- **O-5 (vigente)**: 25 dependencias intra-fase apuntan a una tarea de numeración mayor. Ejecutar según `Dep:` y no según el número.

### Compuerta de script

- `verify-traceability.sh --feature 009` no se reejecutó en esta re-auditoría. La salida previa (exit 2, `error-catalog.json` ausente en 009) depende de `/architect` y `/keymaker`, no de esta corrección.

### Recomendación

- T1206 puede marcarse como revisada en `REVIEW` por el técnico de Morpheus. Su cierre `COMPLETED` solo corresponde a Neo.

---

## Re-auditoría final — T1206 tras las resoluciones de Neo (P5-01..06, D9-21..26)

- **Fecha**: 2026-11-23
- **Modo**: lectura. Sin commit, sin push, sin checkout, sin casillas `[x]` nuevas, sin cambios en spec, plan, tasks, contratos ni `src/`. Esta sección no reescribe las anteriores.
- **Método**: grep literal sobre `spec.md`, `plan.md`, `tasks.md`, `contracts/README.md`; script de dependencias (`Dep:`) por fase sobre las 107 tareas; conteo de IDs contra el texto de la spec.

### Veredicto

**PASS CON OBSERVACIONES**. Los criterios 1 a 6 cumplen. Ningún hallazgo bloquea la compuerta; las observaciones son de texto (ver O-F1 a O-F4).

### Criterio 1: trazabilidad 1:1

- IDs propios de 009 definidos en la spec (EDGE-009, SC-009, REQ-APR9/ADM9/CFG9/PRO9/LIM9/DEL9, INV-ADM9/CFG9/DEL9/LIM9/PRO9, NFR-009, STATE-ACCT9): **153** (49 EDGE, 51 SC, 37 REQ, 10 INV, 5 NFR, 1 STATE).
- Cada uno cita en al menos una línea de tarea con casilla (`^- \[ \]|^- \[x\]`): **153/153**. Sin ID sin tarea.
- Excepción documentada: `REQ-APR9-006` sin casilla, diferido por `D9-01` = A (spec línea 133; tasks línea 142, «Diferido de esta feature (sin casilla)»; `SC-009-008` lo verifica como ausencia de `EmailSenderPort`). **PASS**.
- Sin IDs de tarea huérfanos: los IDs de tarea citados que no están definidos en tasks (`T1101`, `T1122`, `T1200`) son de 008 y aparecen en texto histórico, no como dependencia.

### Criterio 2: historias huérfanas

- US1 `#18` → Fase 4 (Bloque `[GH:#18]`); US2 `#19` → Fase 3; US3 `#20` → Fase 5 (5a y 5b); US4 `#57` → Fase 1 Bloque B; US5 `#60` → Fase 1 Bloque A; US6 «(deuda #17)» → Fase 2 (`T1130`). **6/6 con bloque. PASS.**

### Criterio 3: etiquetas

- `grep -n "GH:#17" specs/009-aprobacion-admin-correo/spec.md` → **0 coincidencias**. PASS.
- Spec: «(deuda #17)» sin corchetes en líneas 32, 69, 123, 161, 297 (la línea 123 es nueva en EDGE-009-049, consistente). `\[(deuda` → 0. PASS.
- Spec: `[GH:#18]` `[GH:#19]` `[GH:#20]` `[GH:#57]` `[GH:#60]` en encabezados de US y bloques (4 apariciones cada una en el conjunto de la spec). PASS.
- Tasks: 107 casillas; **97 con `[GH:#…]`** y **10 sin etiqueta, todas «(deuda #17)»** (T1130, T1202, T1217–T1223, T1284). `GH:#17` en tasks.md → 0. Encabezados de bloque de tasks con `[GH:#60]`, `[GH:#57]`, `[GH:#19]`, `[GH:#18]`, `[GH:#20]`. PASS.
- Fuera de criterio literal (spec): `plan.md` línea 4 conserva `[GH:#17]` activo. Ver O-F1.

### Criterio 4: contratos declarados con tarea

- Tabla de `plan.md` (líneas 17–28) y `contracts/README.md` cruzadas con `tasks.md`:
  - 002/004 `pet-tracker-api`, `identity`, `error-catalog`, `STATE-AUTH-SESSION-001` → `T1241` [ARCH]. OK.
  - 006 `SceneView` / catálogo / OpenAPI → `T1257` [ARCH]. OK.
  - 006 `REQ-ESC6-017/031` (`global`) → `T1299` [ARCH]. OK.
  - 005 `platform-parameter.schema.json` → `T1302` [ARCH]. OK.
  - 007 R4 / `REQ-ESC7-003` → `T1212` [ARCH]. OK (ver O-F2 sobre su texto).
  - 008 `oauth_flow_states` → `T1219` [N2]. OK.
  - Nuevos de 009: `admin.openapi.yaml` → `T1226`, `T1256` [ARCH]; `error-catalog.json` → `T1217` [ARCH]; `state-machines/STATE-ACCT9-001` → `T1241`; entrada `--feature 009` → `T1217`. OK.
  - Enmienda 009-A (cookies, `jose`) → `T1224` [ARCH]; Enmienda 009-B → `T1254` [ARCH]. OK.
- Ningún `schemas/` nuevo (MIF-06). **PASS.**

### Criterio 5: orden de fases

- Script sobre las 107 tareas por rango de línea: 0 dependencias `Dep:` que apunten a una fase posterior. **PASS.**
- `T1292`, `T1296`, `T1298` (5b): quién las cita en `Dep:` → `T1296` (5b), `T1305` (5b), `T1271` (5b). **Ninguna tarea de 5a las requiere.** PASS.
- `T1304` (compuerta 5a): `Dep: T1270, T1262`, ambas 5a. **No depende de 5b.** PASS.
- Observación textual (no es dependencia): `T1262` y `T1268` (5a) mencionan `T1292`/`T1296` como «pasan a 5b». Es referencia informativa. Ver O-F4.
- Intra-fase: 131 dependencias internas; 25 apuntan a numeración mayor (sin cambio respecto a la re-auditoría previa, O-5).

### Criterio 6: plantilla

- Spec: título «Feature Specification», cabecera (Created, Status, Input), User Scenarios & Testing, Edge Cases, Requirements, Requisitos no funcionales, Decisiones, Success Criteria, Trazabilidad, Registro. **PASS.**
- Plan: Summary, Technical Context, Constitution Check, Topología, Decisiones (ADR), Estructura, Orden de fases, Códigos de error, Riesgos, Diferido, Registro. No incluye «Complexity Tracking» (opcional en la plantilla). **PASS.**
- Tasks: cabecera de Format, Reglas transversales, Fases, Fase final, IDs de trazabilidad, Registro. **PASS.**

### Conteos

- Tareas con casilla: **107** (cabecera de `tasks.md` y 107 IDs únicos; `T1201..T1306` completo más `T1130`).
- Por fase (por rango de línea, confirmado con script):

| Fase | Real | Esperado (prompt) |
| --- | --- | --- |
| F0 | 7 | 7 |
| F1 | 15 | 15 |
| F2 | 9 | 9 |
| F3 | 19 | 19 |
| F4 | 18 | 18 |
| F5a | 15 | 15 |
| F5b | 19 | 19 |
| Cierre | 5 | 5 |

  Suma 107. Confirmado. La cifra de la re-auditoría previa (5a = 19, 5b = 15) queda superada por la reasignación de `P5-06` = B (`T1301`, `T1300`, `T1292`, `T1296` pasan a 5b).
- `[x]`: **3**, `T1201`, `T1202`, `T1203` (firmas previas de Neo). Ninguna marca de esta re-auditoría.

### Observaciones (no bloquean)

- **O-F1** `plan.md` línea 4: «`[GH:#17]`» activo en la Input. Uniformar a «(deuda #17)».
- **O-F2** `contracts/README.md` línea 5: «`T1212` ... bloqueada hasta `D9-26`». `D9-26` = A está resuelta y `T1212` tiene `Dep: T1206` (desbloqueada según el Registro de `tasks.md`). Actualizar el texto.
- **O-F3** `spec.md` línea 5 (Status): «reconciliada ... con las decisiones `D9-01..D9-16`». No recoge `D9-21..26` ni `P5-01..06`. Actualizar la referencia.
- **O-F4** `T1262` y `T1268` (5a) nombran `T1292`/`T1296` (5b) en el texto de su descripción. No es dependencia. Conviene una frase «(tarea de 5b)» para que no se lean como `Dep:`.
- **O-O4 (arrastrada)**: el orden de bloques en la spec es A, B, C, F, D, E. Cosmético.
- **O-O3 (arrastrada)**: encabezados de F0, Fase 2 y Cierre sin `[GH:#N]` en el título; coherente con «(deuda #17)» y con las tareas.

### Ruta de cierre

- `T1206` queda en `REVIEW` (techo de agentes). No se marca `[x]`; solo Neo puede cerrar `COMPLETED`.
- Las observaciones O-F1 a O-F3 son de texto y pueden resolverse en la siguiente pasada de `/architect` sin reabrir la compuerta.
