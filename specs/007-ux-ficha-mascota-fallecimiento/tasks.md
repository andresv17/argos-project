# Tasks: UX de la ficha de mascota, fechas, Historial/Archivos, mascota fallecida y texto de escena (Feature 007)

**Input**: `specs/007-ux-ficha-mascota-fallecimiento/` (`spec.md`, `plan.md`, `data-model.md`, `contracts/README.md`); `claude/inbox-feature-007.md`.
**Estado**: `APPROVED` (firmado por Neo, Nivel 2, el 2026-11-19 tras `/mouse` PASS; `T1001`, `T1002`, `T1004` y `T1005` marcadas `[x]` `COMPLETED`). Neo aprobó las decisiones de Nivel 2 el 2026-11-19 (`claude/decisiones-neo-007-2026-11-19.md`, asentadas en `spec.md`). El techo de los agentes es `REVIEW` y solo Neo marca `COMPLETED`.
**Numeración**: `T1001..T1068` (006 usó hasta `T943`; no se reutiliza ningún ID). Huecos deliberados: `T1018`, `T1024`, `T1025` y `T1061` se fundieron en otras tareas por `/mifune` (`M7-06`, `M7-07`, `M7-16`) y no se reasignan.
**Sincronización GitHub Projects**: cada bloque `##` lleva su etiqueta `[GH:#N]` (el script `gh-project-sync.mjs sync --tasks` la lee del encabezado). Cobertura: `#11` Bloque A, `#12` Bloque B, `#13` Bloque C, `#14` Bloque D, `#15` Bloque E, `#51` Bloque F. Los bloques de gobernanza y cierre son transversales y no llevan etiqueta.

## Format: `[ID] [P?] [N2|GOV|HUM] Descripción — REQ/SC; Dep: tareas`
- **[P]**: paralelizable. **[N2]**: requiere autorización de Neo (enmiendas a contratos, migraciones). **[GOV]**: gobernanza o compuerta. **[HUM]**: paso humano de Neo.

## Reglas transversales
- **TDD (constitución IV)**: pruebas rojas antes de implementar; cada tarea de implementación depende de su tarea de pruebas.
- **Sin dependencias nuevas** (`package.json` intacto, NFR-007-001). Ninguna tarea ejecuta `git push`, `terraform apply` ni despliega.
- **Decisiones de Neo**: todas las de Nivel 2 están decididas y asentadas; ninguna tarea espera una decisión. Quedan por delante la compuerta `/mouse` (`T1005`), la creación de la rama `007-...` por Neo desde `006` y el cierre `APPROVED`/`LOCKED` de Neo.
- **Contratos**: la enmienda de `#13` se aplica sobre la línea 002 (nunca 001) y coordina 004 y 005.
- **Caso B** (contrato vs implementación): vuelve a `/architect` (`MAX_HOPS = 2`).

---

## Fase 1: Gobernanza y compuertas previas (sin código)

- [x] T1001 [GOV] `/lock`: EDGE-007-009..022 emitidos en `lock-007-edge.md` e incorporados a `spec.md`; queda la confirmación del cierre de la tarea por Neo — EDGE-007-001..022; SC-007-027
- [x] T1002 [GOV] `/mifune`: acta `mifune-007-kiss.md` emitida y aplicada (registro de poda en `spec.md`) — NFR-007-001; SC-007-027
- [ ] T1003 [GOV] `/sati`: prototipo HTML solo de `DateField` (segmentos; 320/1024/1280 px, WCAG 2.1 AA) y aprobación de Neo de su aspecto; pestaña, tarjeta y selector se validan visualmente en `T1040`, `T1045` y `T1028` sin prototipo previo (`M7-13`) — NFR-007-002, NFR-007-003, REQ-FEC7-004; SC-007-004
- [x] T1004 [HUM] Neo firmó las decisiones de Nivel 2 (`claude/decisiones-neo-007-2026-11-19.md`); `/architect` las asentó en «Decisiones de Neo asentadas» de `spec.md` sin cambiar estados. La casilla queda `[ ]` hasta la firma de cierre de Neo — REQ-ESC7-001, REQ-REG7-001, REQ-PAN7-002, REQ-FAL7-004..006; SC-007-013..015, SC-007-017, SC-007-024
- [x] T1005 [GOV] `/mouse`: compuerta estructural única (1:1 spec-tareas, 0 etiquetas huérfanas, contratos completos) — todos los REQ; SC-007-001..027. Dep: T1001, T1002

**Checkpoint**: tras `T1005` los Bloques A, B, D, E y F pueden empezar; el Bloque C empieza en `T1011`/`T1012` (revalidación) y `T1013`.

---

## Bloque A — [GH:#11] Auto-avance al escribir fechas manualmente (P1)

**Goal**: componente de fecha por segmentos con auto-avance y retroceso fluido.
**Independent Test**: `SC-007-001..004`. Sin firma pendiente.

- [ ] T1031 [GH:#11] Pruebas rojas de las dos funciones puras de `date-segments` (entrada tecleada y análisis de texto; avance por 2 dígitos, relleno de `4..9`/`2..9`, `Backspace` con y sin contenido, pegado ISO y `DD/MM/AAAA`, solo dígitos) — REQ-FEC7-002, REQ-FEC7-003; SC-007-001, SC-007-002, SC-007-003. Dep: T1005
- [ ] T1032 [GH:#11] Implementar `src/presentation/web/date-segments.ts` (puro, sin DOM, dos funciones, `M7-11`) — REQ-FEC7-002, REQ-FEC7-003; SC-007-001, SC-007-002, SC-007-003. Dep: T1031
- [ ] T1033 [GH:#11] Pruebas rojas de `DateField` (foco, `aria-label`, emite ISO o vacío, `fieldset`/`legend`, objetivo táctil 44 px) — REQ-FEC7-001, REQ-FEC7-004; SC-007-004. Dep: T1032
- [ ] T1034 [GH:#11] Implementar `components/DateField.tsx` y delegar `type="date"` de `Field.tsx` (usado por `RecordForm` y `PetForm`); sin dependencias nuevas — REQ-FEC7-001, REQ-FEC7-004, REQ-FEC7-005; SC-007-004. Dep: T1033
- [ ] T1035 [GH:#11] E2E Playwright en Chromium, Firefox, WebKit, viewport 390 px y emulación de Android Chrome: escribir fecha sin Tab, `Backspace` en segmento vacío, pegado, 29 de febrero y mes `13`; revisión `/sati` del `DateField` real — REQ-FEC7-004, EDGE-007-001, EDGE-007-002, EDGE-007-018; SC-007-004. Dep: T1034
- [ ] T1036 [GH:#11] **Condicional** (`EDGE-007-018`, `M7-12`): solo si `T1035` demuestra que `keydown` no basta en WebKit o Android, retroceso sobre `beforeinput` (`deleteContentBackward`) con `keydown` como respaldo y su E2E; si no hay evidencia, queda sin ejecutar — REQ-FEC7-006; SC-007-003. Dep: T1035

---

## Bloque B — [GH:#12] Mover Historial / Archivos a su propia pestaña (P1)

**Goal**: séptima pestaña «Historial / Archivos» tras Parámetros.
**Independent Test**: `SC-007-005..007`. Sin firma pendiente.

- [ ] T1037 [GH:#12] Pruebas rojas del `tablist`: siete pestañas en orden, panel `history` solo con `mediaSlot`, sin «Registrar», sin sección final duplicada, flechas/`Home`/`End`, `editSlot` definido sin pestaña — REQ-PES7-001..003, EDGE-007-003; SC-007-005..007. Dep: T1005
- [ ] T1038 [GH:#12] Implementar la pestaña en `PetDashboard.tsx` (tipo `ActiveTab`) y ajustar quienes pasan `activeTab`/`onTabChange`; retirar la sección «Historial / Archivos» final — REQ-PES7-001..003; SC-007-005, SC-007-006. Dep: T1037
- [ ] T1039 [GH:#12] Actualizar pruebas existentes de 005 que buscan la sección al final y E2E de álbum/archivos clínicos para navegar por la pestaña — REQ-PES7-002; SC-007-006. Dep: T1038
- [ ] T1040 [GH:#12] [P] E2E de teclado y lector de pantalla de las 7 pestañas (320/1024/1280 px) — REQ-PES7-003, NFR-007-002; SC-007-007. Dep: T1038

---

## Bloque C — [GH:#13] Estado de mascota: Vivo / Fallecido con fecha de fallecimiento (P1)

**Goal**: `lifeStatus` + `deceasedAt` con su impacto en alertas, registros y escena. **Toca modelo, persistencia, API y respaldo.** Línea de contratos: 002 (nunca 001), coordinando 004 y 005.
**Independent Test**: `SC-007-008..016`, `SC-007-028..033`. Decisiones de Nivel 2 ya asentadas; la aplicación de contratos es `T1013` (N2-07-01 aprobada).

- [ ] T1011 [GOV] [GH:#13] `/merovingian`: acta `merovingian-007-impacto.md` emitida (condiciones C1..C6 asentadas en `spec.md`, `data-model.md` y `contracts/README.md`); revalidar el grafo tras la enmienda de la línea 002 y comprobar que no cambian las salidas de 004, 005 y 006 (`v31`, `v33`, `v34`) — REQ-FAL7-001, REQ-FAL7-009; SC-007-008, SC-007-010. Dep: T1005
- [ ] T1012 [GOV] [GH:#13] `/rama`: acta `rama-007-privacidad.md` emitida; revalidar C1 (enlace público), C2 (importación por reemplazo), C3 (versionado) y C6 (retención) con los textos asentados, y **verificar la enmienda MINOR de `ClinicalProfile`/005** (`H5`, objeto cerrado sin `lifeStatus`) — REQ-FAL7-008, REQ-FAL7-009, REQ-FAL7-010; SC-007-010, SC-007-016, SC-007-031. Dep: T1005
- [ ] T1013 [N2] [GH:#13] `/architect`: aplicar la enmienda minor sobre la **línea 002** (`pet.schema.json` v3.0.0, OpenAPI de mascotas, `backup-envelope`, `canonical-fixtures`) coordinando con 004 (v3.1.0 `DRAFT`) y con la MINOR de 005 (`ClinicalSummary`); sin máquina de estados y sin `ERR-PET-LIFE-STATUS` (usa `ERR-SCHEMA-VALIDATION-FAILED`); incluir `version` (tipo fijado: entero `integer` ≥ 1, inicial `1`, incrementado en cada `PUT` de mascota; no `updated_at`) y `If-Match` y su código `412` (T1064) y el formato versionado (T1067); compilar con `bash scripts/compile-contracts.sh` — REQ-FAL7-001, REQ-FAL7-002; SC-007-008, SC-007-009. Dep: T1005, T1011, T1012
- [ ] T1014 [GOV] [GH:#13] `/maggie`: semántica clínica de la mascota fallecida (alertas, valor neutro de `globalAlertStatus` con todas fallecidas, edad «Vivió …» con «aprox.», registros posteriores) — REQ-FAL7-004, REQ-FAL7-005, REQ-FAL7-007, EDGE-007-019, EDGE-007-020; SC-007-012..014. Dep: T1005
- [ ] T1015 [GH:#13] Pruebas rojas del invariante en `pet-invariants` (`DECEASED` ⇔ fecha, `>= birthDate`, `<= hoy`, estado **resultante** al editar `birthDate`, transición a `ALIVE` borra fecha, edad hasta `deceasedAt`) — REQ-FAL7-002, REQ-FAL7-007, EDGE-007-004, EDGE-007-011, EDGE-007-022; SC-007-009, SC-007-012, SC-007-029. Dep: T1013
- [ ] T1016 [GH:#13] Implementar el invariante y la edad en `src/domain/pet/pet-invariants.ts` (y `estimated-age.ts`), no en un directorio nuevo — REQ-FAL7-002, REQ-FAL7-007; SC-007-009, SC-007-029. Dep: T1015
- [ ] T1017 [N2] [GH:#13] Migración `pets` (`life_status`, `deceased_at`, `version`): SQLite `0014` y Postgres `0010`; primero la prueba de paridad (`schema-parity.spec.ts` con el mapeo manual y filas previas `ALIVE`), luego la migración; `CHECK` cruzado con `NOT VALID`+`VALIDATE` en Postgres y reconstrucción de `pets` en SQLite (asimetría documentada) — REQ-FAL7-001; SC-007-008, SC-007-033. Dep: T1013
- [ ] T1019 [GH:#13] Repositorios SQLite/Postgres y mapeadores con los campos nuevos; `lifeStatus`/`deceasedAt` fuera de logs y de `detail`/`instance` RFC 9457 (prueba de regresión, C4) — REQ-FAL7-001, REQ-FAL7-010; SC-007-008, SC-007-031. Dep: T1017, T1016
- [ ] T1020 [GH:#13] Pruebas rojas de casos de uso: crear/editar con estado, rechazos de `REQ-FAL7-002`, vistas con `lifeStatus`/`deceasedAt`/edad, y permisos (`CAREGIVER`/`READER` rechazados sin revelar la mascota, C7) — REQ-FAL7-001..003, REQ-FAL7-007, REQ-FAL7-010; SC-007-009, SC-007-012, SC-007-031. Dep: T1019
- [ ] T1021 [GH:#13] Implementar casos de uso y DTO/rutas existentes de mascota con los campos nuevos (sin rutas nuevas), validando el invariante sobre el estado resultante — REQ-FAL7-001..003, REQ-FAL7-007, REQ-FAL7-008, EDGE-007-011; SC-007-009, SC-007-012, SC-007-029. Dep: T1020
- [ ] T1064 [N2] [GH:#13] Control optimista en `PUT /pets/{petId}` (`version`/`If-Match`, `412` con código de error nuevo en 002, mensaje «Esta ficha cambió, recarga»); prueba: dos `PUT` secuenciales, el segundo con versión anterior → `412` y estado intacto — EDGE-007-009; SC-007-034. Dep: T1013, T1021
- [ ] T1065 [GH:#13] `updatePetProfile` toma `lockPet(petId)` como primera operación (antes de leer mascota y registros); `/keymaker` confirma si `requireReadablePet` ya bloquea; prueba con dos transacciones y barrera (Postgres con dos clientes; SQLite por serialización) — REQ-FAL7-011, EDGE-007-010; SC-007-028. Dep: T1019, T1021
- [ ] T1022 [GH:#13] Respaldo: exportar e importar ambos campos (opcionales; respaldo previo importa `ALIVE`/nulo); importación por reemplazo con previsualización y confirmación de `DECEASED → ALIVE` (atómica si se cancela, C2) — REQ-FAL7-009, EDGE-007-006; SC-007-010, SC-007-030. Dep: T1021
- [ ] T1067 [N2] [GH:#13] Formato de respaldo versionado: error explícito ante versión superior en builds anteriores (`ERR-BACKUP-VERSION-UNSUPPORTED`), sin escritura parcial; importación de 1.0.0/2.0.0/3.0.0 sigue asignando `ALIVE`; valor de `schemaVersion` fijado con `/merovingian` — REQ-FAL7-009, EDGE-007-015; SC-007-010. Dep: T1013, T1022
- [ ] T1023 [GH:#13] Derivados de estado en una sola tarea (`M7-06`), con tres sub-casos de prueba: (a) alertas: `DECEASED` fuera de `alertsSummary`, `globalAlertStatus` (valor neutro con todas fallecidas) y `WITH_ALERTS`; (b) registros: rechazo de altas/ediciones con fecha **resultante** posterior a `deceasedAt`, notas editables, y al marcar el fallecimiento rechazo con lista de registros posteriores; (c) escena: `DECEASED` filtrado **antes** de `buildInputsSnapshot` sin campos nuevos en `SnapshotPet`, snapshot previo a 007 sigue parseando, `pets.shown/total` — REQ-FAL7-004..006, EDGE-007-005, EDGE-007-012, EDGE-007-013, EDGE-007-019; SC-007-013, SC-007-014, SC-007-015, SC-007-032. Dep: T1021, T1014
- [ ] T1066 [GH:#13] Escena en vuelo: el paso T2 de 006 revalida que las mascotas de la huella sigan `ALIVE`; si alguna pasó a `DECEASED`, cancela la publicación (`CANCELLED`, sin cuota); prueba con `FakeSceneImageGenerator` lento — REQ-FAL7-006, EDGE-007-014; SC-007-015. Dep: T1023
- [ ] T1068 [GH:#13] Transición `Fallecido → Vivo`: auditoría con fecha anterior (`REQ-AUD-001`) y confirmación explícita en la UI («Al volver a Vivo se reactivarán las alertas») — REQ-FAL7-003, EDGE-007-004, EDGE-007-016; SC-007-035. Dep: T1021, T1028
- [ ] T1026 [GH:#13] Enlace veterinario y `ClinicalSummary` (enmienda MINOR de 005): `lifeStatus` visible, `deceasedAt` solo con disclosure opt-in del creador (desmarcado por defecto), aviso al creador al marcar `Fallecido` sin revocación automática; `lifeStatus`/`deceasedAt` fuera de logs (C4) — REQ-FAL7-008, REQ-FAL7-010; SC-007-016, SC-007-031. Dep: T1021, T1012
- [ ] T1027 [GH:#13] Pruebas rojas de UI: selector `Estado: Vivo | Fallecido`, campo «Fecha de fallecimiento» condicional, insignia «Fallecido», «Vivió …» (con «aprox.»), `DateField` sin cálculo de «hoy» en el cliente (`EDGE-007-022`), mensaje «Esta ficha cambió, recarga» — REQ-FAL7-003, REQ-FAL7-007; SC-007-011, SC-007-012. Dep: T1021, T1034
- [ ] T1028 [GH:#13] Implementar `PetForm` (selector + `DateField`), `PetCards` y `PetDashboard` con el estado; `/sati` valida visualmente el selector y la insignia (320/1024/1280 px) — REQ-FAL7-003; SC-007-011, SC-007-012. Dep: T1027
- [ ] T1029 [GH:#13] E2E: marcar fallecida, ver historial, revertir con confirmación, exportar/importar respaldo, edición obsoleta con `412` — REQ-FAL7-003, REQ-FAL7-009, EDGE-007-009; SC-007-010..012, SC-007-034. Dep: T1028, T1022, T1064
- [ ] T1030 [GOV] [GH:#13] `/lock` + `/rama` sobre la implementación terminada del Bloque C (se conserva por la revalidación de privacidad de `/rama`; `M7-08` no aplicada) — REQ-FAL7-004..010; SC-007-013..016, SC-007-031. Dep: T1029

---

## Bloque D — [GH:#14] Simplificar UX de botones Registrar vs Guardar (P1, `needs-decision`)

**Goal**: el módulo sin registros no muestra a la vez «Registrar» y «Guardar» (Opción B decidida por Neo, **solo** Peso, Medidas, Vacunas y Desparasitaciones; Consultas y Parámetros fuera de alcance).
**Independent Test**: `SC-007-017..020`.

- [ ] T1046 [GH:#14] Pruebas rojas del predicado `showsFormOpenByDefault` y de los cuatro módulos para la Opción B (sin registros, con 1 registro, borrado del último, solo lectura); Consultas y Parámetros sin cambio — REQ-REG7-001, REQ-REG7-002, EDGE-007-007; SC-007-017, SC-007-018, SC-007-019, SC-007-020. Dep: T1005
- [ ] T1047 [GH:#14] Implementar el predicado puro y su uso en `PetDashboard.tsx`/`RecordForm` conservando `frozenOpen`; el predicado implementa solo la Opción B, sin constante de opción — REQ-REG7-002; SC-007-017..019. Dep: T1046
- [ ] T1048 [GH:#14] Actualizar pruebas E2E existentes que abren el `<details>` «Registrar …» antes de guardar — REQ-REG7-001; SC-007-017, SC-007-018. Dep: T1047
- [ ] T1049 [GH:#14] [P] E2E de la primera medida en Peso, Medidas, Vacunas y Desparasitaciones (flujo completo sin Tab) — REQ-REG7-002; SC-007-017..019. Dep: T1047, T1035

---

## Bloque E — [GH:#15] Limpiar panel derecho de mascota (P2)

**Goal**: quitar «Registrar peso» y renombrar la tarjeta a «Estado de vacunación».
**Independent Test**: `SC-007-021..023`. Sin firma pendiente (D7-03 es una observación no bloqueante).

- [ ] T1042 [GH:#15] Pruebas rojas: la tarjeta se titula «Estado de vacunación», no contiene «Registrar peso»; la pestaña Peso sí conserva su formulario — REQ-PAN7-001, REQ-PAN7-002; SC-007-021, SC-007-022. Dep: T1005
- [ ] T1043 [GH:#15] Actualizar las pruebas unitarias y E2E existentes que buscan «Alertas sanitarias» o el botón «Registrar peso» del panel (inventario por `grep` en `tests/`) — REQ-PAN7-003; SC-007-023. Dep: T1042
- [ ] T1044 [GH:#15] Implementar en `AlertsCard`: retitular y eliminar `canRegisterWeight`/`onRegisterWeight` y su cableado en `PetDashboard.tsx` — REQ-PAN7-001..003; SC-007-021..023. Dep: T1042
- [ ] T1045 [GH:#15] [P] Verificación visual `/sati` de la tarjeta sin botón (320/1024/1280 px) — NFR-007-002; SC-007-021. Dep: T1044

---

## Bloque F — [GH:#51] Cambiar texto de Actualización de escena pendiente (`needs-decision`)

**Goal**: mensaje claro cuando hay cambios pendientes en la escena. Texto decidido por Neo (neutral, con conteo en `aria-label`).
**Independent Test**: `SC-007-024..026`.

- [ ] T1051 [GH:#51] Pruebas rojas de `scenePendingMessage`: `pending = 0` sin aviso, `pending ≥ 1` «Hubo cambios en tu hogar o en tus mascotas. Puedes volver a generar tu hogar para ver los cambios.» + «Generaciones restantes: R», conteo numérico en `aria-label`, caso de cambio por `DECEASED`, cuota agotada sin invitar a regenerar — REQ-ESC7-001, REQ-ESC7-002, EDGE-007-008, EDGE-007-017; SC-007-024, SC-007-025. Dep: T1005
- [ ] T1052 [GH:#51] Implementar `scenePendingMessage` en `scene-view.ts` (sustituye `scenePendingText`) y su uso en `SceneBlock.tsx` — REQ-ESC7-001, REQ-ESC7-002; SC-007-024..026. Dep: T1051
- [ ] T1053 [GH:#51] Actualizar las pruebas y E2E del bloque Hogar que esperan «cambios pendientes:» — REQ-ESC7-001; SC-007-026. Dep: T1052

---

## Fase final: Cierre transversal

- [ ] T1060 [GOV] `/oracle` y `/seraph` (pasada E2E multi-navegador y accesibilidad fundida aquí, `M7-16`): auditoría en disco de los Bloques A..F (diff, pruebas, rótulos, 7 pestañas) — NFR-007-002; SC-007-001..027. Dep: T1035, T1040, T1030, T1049, T1045, T1053
- [ ] T1062 Compuerta final: `bash scripts/verify-traceability.sh`, `bash scripts/verify-oracles.sh`, `npx tsc --noEmit`, `npm run test:gate`; `package.json` sin cambios — NFR-007-001; SC-007-027. Dep: T1060
- [ ] T1063 [HUM] Neo: firmas de cierre (`APPROVED`/`LOCKED`, `COMPLETED`, push y merge); ningún agente las ejecuta — SC-007-027. Dep: T1062
