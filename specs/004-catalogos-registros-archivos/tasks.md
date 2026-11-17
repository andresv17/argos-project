# Tasks: Catálogos, registros y archivos — UX base, auth local y medios en GCS (Feature 004, 4A-1 y 4A-2)

**Input**: `specs/004-catalogos-registros-archivos/` (`spec.md`, `plan.md`, `data-model.md`, `contracts/README.md`, `contracts/catalogs/breeds.catalog.json`)
**Enmienda única 2026-11-17**: integra los hallazgos de `/maggie`, `/mifune`, `/rama` y `/lock` (ver «Registro de la enmienda» en `spec.md`). Las tareas T516, T517, T556..T559 y T598..T611 son nuevas; las demás conservan su ID y se ampliaron.
**Asiento de decisiones 2026-11-17**: Neo firmó D-01..D-20 y reconoció RR-01..RR-06 (ver «Decisiones de Neo asentadas» en `spec.md`). Nuevas: T612..T616. Retiradas por `D-11` A y `D-12` B: T543, T589, T590, T602 y T603 (los números no se reutilizan). Ningún estado cambió: todas siguen `[ ]`.

**Estado**: `DRAFT` (borrador del Architect para aprobación de Neo, Nivel 2). Toda tarea nace `[ ]`; el techo de los agentes es `REVIEW` y solo Neo marca `COMPLETED` (`[x]`). Ningún documento está `APPROVED` ni `LOCKED`.

**Numeración**: `T501..T517`, `T520..T542`, `T544..T559`, `T560..T588`, `T591..T601`, `T604..T611` y `T612..T617` (las nuevas se numeran por orden de incorporación y se listan en la fase donde se ejecutan; huecos deliberados T518-T519, T543, T589, T590, T602 y T603). 003 usó `T401..T490`; 004 empieza en `T501`. Las tareas de 4B, 4C y 4D tendrán su propia feature.

## Format: `[ID] [P?] [N2?] [Story] Description`
- **[P]**: paralelizable (archivos distintos, sin dependencia). **[N2]**: requiere autorización de Neo (Nivel 2: dependencias, CI, scripts, Terraform, migraciones de esquema, despliegue). **[GOV]**: gobernanza. **[EXT]**: pendiente externo a los agentes (veterinario humano, dispositivo real). **[US1..US5]**: historias de `spec.md`.
- Cada línea cita los IDs que cubre; la compuerta por tarea (`verify-traceability.sh --feature 004 --task T###`) lee esos IDs.

## Reglas transversales
- **Orden TDD (constitución IV)**: cada par «pruebas» / «implementación» se escribe con las pruebas primero y rojas antes de implementar.
- **Specs bloqueadas**: no se edita `specs/001-*`. El delta E-01..E-11 (002) y E3-01..E3-05 (003) ya se aplicó al texto de sus `spec.md` (y al `plan.md` de la 003) por orden de Neo (`D-10`); los contratos máquina de la 002 los edita `/architect` en T510..T512 y los regenera T515. T507 conserva la firma formal de Neo.
- **Decisiones**: D-01..D-20 están firmadas por Neo (2026-11-17) y asentadas en `spec.md`; las tareas siguen en `[ ]` hasta que se ejecuten y Neo firme. Los pendientes externos PE-01..PE-06 siguen abiertos (T598, T597).
- **Ninguna tarea ejecuta `terraform apply`, `gcloud` mutante ni despliega**: lo hacen los flujos de CI aprobados o Neo (T597).
- **Capas**: `src/domain/` y `src/application/` sin `fs`, `fetch`, SDK ni `process.env` (INV-ARCH-001/002/006). El SDK de GCS vive solo en `src/infrastructure/adapters/`.
- **Contratos primero**: ninguna tarea de `src/` empieza antes de T515 (contratos compilados) en su historia.
- **Caso B** (contrato vs implementación): vuelve a `/architect` (`MAX_HOPS = 2`).
- **Los archivos de `tests/` y los scripts de verificación** se tocan solo en la tarea que los nombra.

---

## Phase 1: Gobernanza y compuertas previas (sin código)

**Goal**: Decisiones D-01..D-20 firmadas y asentadas, auditoría de la dependencia, validación clínica y de privacidad, prototipos y compuerta estructural.
**Independent Test**: D-01..D-20 asentadas; T612 (auditoría de `@google-cloud/storage`) cerrada antes de T567; pendientes externos T598 cerrados; `/mouse` CUMPLE.

- [x] T501 [N2] [GOV] Neo firmó D-01..D-20 el 2026-11-17 y `/architect` las asentó en `spec.md` («Decisiones de Neo asentadas»), `plan.md`, `tasks.md`, `data-model.md` y `contracts/README.md`; queda el cierre formal de Neo (REQ-GCS-003, REQ-LOG-001, REQ-LOG-002, REQ-BOR-004, REQ-ARC-005, REQ-ARC-001, REQ-ARC-003, REQ-AVA-003, REQ-IMP-001)
- [x] T502 [P] [GOV] `/merovingian`: grafo de impacto antes de tocar contratos (qué rutas, puertos y pruebas rompen `breedCode`, `username` por `LOWER`, índice de microchip global, borrado físico con guarda, `revision` y `schemaVersion 3.1.0`) (REQ-RAZ-001, REQ-LOG-002, REQ-PET4-001, REQ-BOR-001, REQ-SIN-001, REQ-MDC-001)
- [x] T503 [P] [GOV] `/maggie`: validar los 4 tipos de síntoma, los 3 niveles de intensidad, sus rótulos en español y el catálogo de razas de `contracts/catalogs/breeds.catalog.json` (D-08). Borrador revisado el 2026-11-17 (`maggie-004-clinica.md`) e integrado; D-08 aprobada con D-17 A; restan los pendientes externos de T598 (REQ-SIN-001, REQ-SIN-003, REQ-RAZ-001, INV-SIN-001, INV-SIN-002, INV-RAZ-002)
- [x] T504 [P] [GOV] `/sati`: prototipos HTML + Tailwind a 320, 1024 y 1280 px de selector de raza, formulario de síntoma (niveles Leve/Moderado/Intenso sin color por intensidad, aviso y derivación fijos, y aviso en lugar de «Vómito» para conejo y pequeño mamífero), orden de `PetForm`, recortador circular, álbum, visor de documentos con «Abrir o descargar» en móvil, enlace de texto «Ver enlace externo» de `avatarUrl` y aviso de importación por reemplazo con recuento y casilla de confirmación (D-15 A); sin «AI Slop» (REQ-FRM-002, REQ-AVA-002, REQ-AVA-003, REQ-ALB-001, REQ-ARC-003, REQ-SIN-001, REQ-SIN-003, REQ-IMP-001)
- [x] T505 [P] [GOV] `/lock`: revisión de modos de falla (`EDGE-*`) de subida, borrado y login por correo, realizada el 2026-11-17 (`lock-004-edge.md`) e integrada; `/seraph` convierte los escenarios 001, 002, 004, 005, 008, 011, 015, 016, 017, 018, 019, 021, 022 y 024 en pruebas negativas y de propiedad (INV-GCS-002, INV-ARC-002, INV-LOG-002, REQ-GCS-004)
- [x] T506 [P] [GOV] `/rama`: privacidad de medios, microchip global y cola de borrado, realizada el 2026-11-17 (`rama-004-lifecycle.md`) e integrada; ventana de borrado físico de medios en el runbook (REQ-PET4-001, NFR-ALM-002, REQ-GCS-004, INV-PET4-001)
- [x] T507 [N2] [GOV] Firma formal de Neo del delta E-01..E-11 (002) y E3-01..E3-05 (003), ya aplicado por `/architect` en el texto de sus `spec.md` (y `plan.md` de la 003) por orden de Neo (D-10); E-11 quedó retirada por D-11 A (REQ-BOR-002, REQ-MDC-001, REQ-SIN-001, REQ-LOG-002, REQ-PET4-001, REQ-GCS-002)
- [x] T508 [GOV] `/mifune`: filtro anti-sobreingeniería del `plan.md` antes de sellar contratos; revisión del 2026-11-17 (`mifune-004-kiss.md`) integrada, con K-01, K-02, K-07 y K-11 resueltos por Neo como D-18 A, D-06 C, D-11 A y D-12 B (NFR-ALM-003)
- [x] T509 [GOV] `/mouse`: compuerta estructural única (1:1 spec-tareas, 0 huérfanos, contratos completos) antes de que `/keymaker` empiece (REQ-ESP-001)
- [ ] T598 [EXT] [GOV] Veterinario humano valida los umbrales de intensidad de síntoma, la semántica para `FERRET`, `BIRD` y `REPTILE` y las agrupaciones de razas (PE-01, PE-02, PE-03); `/maggie` registra el resultado y `/architect` ajusta los textos (REQ-SIN-001, REQ-SIN-003, REQ-RAZ-001)
- [x] T612 [P] [GOV] `/merovingian`: auditoría del árbol transitivo de `@google-cloud/storage` (versión exacta propuesta, licencias, advisories, scripts de instalación, tamaño en la imagen) **antes** de instalar; requisito previo de T567 y T572 (D-01 A, precedente `jose`, H-O-O4-3) (NFR-ALM-003, REQ-GCS-003)

---

## Phase 2: Contratos, catálogo y compuertas

**Goal**: Contratos 004 completos y compilados.
**Independent Test**: `bash scripts/compile-contracts.sh` verde; `verify-traceability.sh --feature 004` reconoce los prefijos.

- [x] T510 [GOV] `/architect`: `contracts/schemas/` de 004 (delta de `pet` con `breedCode` y `avatarVersion` derivado de solo lectura, `medical-records` con `SYMPTOM` y `revision` de solo lectura, `identity`, `backup-envelope 3.1.0` con `ImportPreviewResult.mediaToDeleteCount`, esquema nuevo `media` sin autoría, sin clave y sin `disposition`) con `additionalProperties: false` y patrón de código único `^(DOG|CAT)_`; materializa en los esquemas de la 002 los E-02, E-03, E-04, E-05, E-07 y E-08 ya asentados en su `spec.md` (REQ-RAZ-003, REQ-MDC-001, REQ-SIN-001, REQ-LOG-001, REQ-LOG-002, REQ-GCS-005, REQ-ARC-003, REQ-AVA-001, REQ-IMP-001, REQ-BOR-005)
- [x] T511 [GOV] `/architect`: `contracts/openapi/` de 004 (rutas de medios con subida de cuerpo crudo, `kind` en la query y `X-Argos-Filename` (D-18 A); `MediaAccess` sin `disposition`; avatar con cuerpo crudo; login con identificador; `PATCH` de registros con `If-Match` y 409 `ERR-REC-CONFLICT` (D-16 A); `deleteRecord` con 409 (E-01); `previewBackupImport` con `mediaToDeleteCount`; 502 en `getMediaAccess`, `putAvatar`, `getAvatar` y `deleteAvatar`; sin 502 en `deleteMedia`; 429 `ERR-RATE-LIMITED` en la subida y el microchip; sin ruta de galería, D-12 B) (REQ-ARC-001, REQ-ARC-003, REQ-AVA-001, REQ-ALB-001, REQ-BOR-002, REQ-BOR-005, REQ-PET4-002, REQ-IMP-001)
- [x] T512 [GOV] `/architect`: `contracts/errors/` de 004: crea `error-catalog.json` de la feature (la compuerta `verify-traceability.sh --feature 004` aborta hoy por su ausencia) con `ERR-MEDIA-TOO-LARGE`, `ERR-MEDIA-TYPE-NOT-ALLOWED`, `ERR-MEDIA-QUOTA-EXCEEDED`, `ERR-MEDIA-NOT-FOUND`, `ERR-MEDIA-STORAGE-UNAVAILABLE` y `ERR-REC-CONFLICT` (D-16 A), `type` RFC 9457 y `requirementRef`; oficializa `ERR-PET-MICROCHIP-DUPLICATE` (REQ-ARC-001, REQ-ARC-005, REQ-GCS-004, REQ-BOR-005)
- [ ] T513 [GOV] `/architect`: cierra `contracts/catalogs/breeds.catalog.json` con el veredicto de T503 y de T598 y fija `catalogVersion` (REQ-RAZ-001, INV-RAZ-001)
- [x] T514 [N2] [GOV] Extender `scripts/compile-contracts.sh` (compilar `catalogs/` a `src/generated/`), `scripts/verify-traceability.sh` y `scripts/verify-oracles.sh` para reconocer la feature 004 y los prefijos `ESP, RAZ, FRM, MDC, SIN, BOR, LOG, PET4, GCS, ARC, AVA, ALB` y `NFR-ALM`, `SC-CAT`, `SC-ALM` (REQ-ESP-001, NFR-ALM-004)
- [x] T515 `/keymaker`: ejecutar `bash scripts/compile-contracts.sh` y publicar `src/generated/` (nunca editar a mano); pruebas de contrato verdes (REQ-RAZ-001, REQ-MDC-001, REQ-SIN-001, REQ-ARC-003)
- [x] T516 [P] [N2] [GOV] Pruebas (fixtures negativos): `compile-contracts.sh` rechaza un catálogo con `code` sin prefijo `DOG_`/`CAT_`, prefijo distinto de la especie, `code` duplicado o rótulo duplicado por especie; el catálogo vigente de 68 entradas compila (SC-CAT-032) (REQ-RAZ-001)
- [x] T517 [N2] [GOV] Validación del catálogo en `scripts/compile-contracts.sh` / `scripts/codegen.mjs` según T516; se ejecuta antes de T515 (REQ-RAZ-001)

---

## Phase 3: US1 — Mascota correcta desde el móvil (P1, 4A-1)

**Goal**: especie, raza de catálogo, fecha aproximada, recorte de espacios.
**Independent Test**: `SC-CAT-001..006`.

- [x] T520 [P] [US1] Pruebas: las opciones de «Especie» del alta y de la edición coinciden con `SPECIES` del dominio y con el enum del contrato (SC-CAT-001) (REQ-ESP-001)
- [x] T521 [US1] Ajustar `PetForm.tsx` y cualquier otra superficie de alta/edición si T520 falla; si pasa, queda como prueba de regresión (REQ-ESP-001)
- [x] T522 [P] [US1] Pruebas de dominio: catálogo de razas (orden «Criolla» primero y «Otra» al final, códigos únicos y estables, `deprecated`) y `assertBreedConsistency` con `breed` derivado (SC-CAT-002, SC-CAT-004) (REQ-RAZ-001, INV-RAZ-001)
- [x] T523 [US1] `src/domain/pet/breed-catalog.ts` y `assertBreedConsistency` sobre el catálogo generado (REQ-RAZ-001, REQ-RAZ-003, INV-RAZ-001)
- [x] T524 [P] [US1] Pruebas de casos de uso: alta y edición con `breedCode`, derivación de `breed` (rótulo; texto libre con `*_OTHER`; «Otra» por defecto), `breed` distinto del rótulo rechazado, mascota antigua sin `breedCode` (SC-CAT-003, SC-CAT-004) (REQ-RAZ-002, REQ-RAZ-003, INV-RAZ-001)
- [x] T525 [US1] Casos de uso, repositorios (memoria, SQLite, Postgres), vista pública y hash canónico con `breedCode`; el respaldo `3.1.0` con `breedCode` se parte a T617 (la exportación sigue en `3.0.0` sin `breedCode` hasta T617) (REQ-RAZ-002, REQ-RAZ-003, INV-RAZ-001)
- [x] T526 [P] [US1] Pruebas de componente: selector de raza (orden, «Otra» con campo libre opcional que se envía como `breed`, «Raza actual» para mascotas antiguas) (SC-CAT-002, SC-CAT-003) (REQ-RAZ-001, REQ-RAZ-002)
- [x] T527 [US1] `BreedSelect` en `PetForm` según el prototipo de T504; campo de raza libre solo para las 6 especies sin catálogo (REQ-RAZ-001, REQ-RAZ-002, REQ-RAZ-003)
- [x] T528 [P] [US1] Pruebas: `trim()` en el límite del formulario y rechazo del servidor con espacio final (SC-CAT-005) (REQ-FRM-001)
- [x] T529 [US1] `trim()` en `use-contract-form.ts` / `validation.ts` para todo texto salvo contraseñas (REQ-FRM-001)
- [x] T530 [P] [US1] Pruebas: orden de foco de `PetForm` (SC-CAT-006) (REQ-FRM-002)
- [x] T531 [US1] Mover `birthDateIsEstimate` bajo «Fecha de nacimiento» con el rótulo «Fecha de nacimiento aproximada (estimada)» (REQ-FRM-002)
- [ ] T599 [P] [US1] Prueba estática: ningún módulo de `src/domain/` de peso, edad o alertas referencia `breedCode` ni `breed` (SC-CAT-033) (INV-RAZ-002)

---

## Phase 4: US2 — Registros clínicos: medidas, síntomas, edición y borrado (P1, 4A-1)

**Goal**: medidas enteras, síntomas, edición auditada con control de revisión y borrado físico auditado con inmutabilidad de `SUPERSEDED`.
**Independent Test**: `SC-CAT-007..015`, `SC-CAT-028`, `SC-CAT-031`, `SC-CAT-034`, `SC-CAT-035`.

- [x] T532 [P] [US2] Pruebas: medidas enteras (contrato, dominio, formulario `step=1`) y conservación de registros con decimales (SC-CAT-007, SC-CAT-008) (REQ-MDC-001)
- [x] T533 [US2] Contrato compilado, invariante de dominio y formulario de medidas (REQ-MDC-001)
- [x] T534 [P] [US2] Pruebas: síntomas (catálogo cerrado, coherencia categoría/tipo, rótulos de D-17 A («Apetito disminuido», «Energía disminuida», «Heces (diarrea u otro cambio)») y «Vómito» oculto con aviso en `RABBIT` y `SMALL_MAMMAL` (solo presentación: el servidor lo acepta), ayuda de nivel, `title` sincronizado al cambiar el tipo, sin efecto en alertas, búsqueda estática de `symptomType` y `severity` en `src/domain/alerts/` y de `severity` en clases, estilos, orden y texto condicional de `src/presentation/`, aviso y derivación fijos en formulario, listado y exportación, sin las palabras «tratamiento», «medicamento», «dosis», «dar», «administrar») (SC-CAT-009, SC-CAT-010, SC-CAT-011, SC-CAT-034) (REQ-SIN-001, REQ-SIN-003, INV-SIN-001, INV-SIN-002)
- [x] T535 [US2] Dominio, caso de uso de `custom-parameters` (sin interpretar `title` ni `description`), persistencia, permisos, auditoría `CUSTOM_PARAMETER`; el respaldo `3.1.0` para `SYMPTOM` va en T617 (SC-CAT-026) (REQ-SIN-001, REQ-SIN-002, REQ-SIN-003, INV-SIN-001)
- [x] T617 [US2] Respaldo `3.1.0` único (partido de T525; depende de T515 y T535): exportación con `schemaVersion` `3.1.0`, mascotas con `breedCode` (sin `avatarVersion`, sin `revision`, sin medios) y parámetros con `symptomType` y `severity`; la importación acepta `1.0.0`, `2.0.0`, `3.0.0` y `3.1.0` (`breedCode` = `null` si falta) y rechaza versiones futuras; ajusta el arnés OpenAPI de 002 (`sourceSchemaVersion`) y el hash/aduana del sobre; pruebas de ida y vuelta exportar → importar que conserva `breedCode` y `breed` en los 3 motores, e importación de un `3.0.0` (REQ-RAZ-003, REQ-SIN-001, INV-RAZ-001; `REQ-BACKUP2-001`, `REQ-BACKUP2-002`). `ImportPreviewResult.mediaToDeleteCount` no va aquí: es de T604/T605
- [x] T536 [US2] Formulario de síntoma (4 tipos con los rótulos de D-17 A y aviso en lugar de «Vómito» para `RABBIT` y `SMALL_MAMMAL`, intensidad «Leve/Moderado/Intenso» con ayuda fija y texto de pie, `title` sincronizado, placeholder de `description` sin medicación, sin color ni ícono por intensidad) y leyenda «Este registro no sustituye la consulta veterinaria» más «Si tu mascota empeora o tienes dudas, consulta a tu veterinario.» en formulario, listado y exportación (SC-CAT-010, SC-CAT-034) (REQ-SIN-001, REQ-SIN-003, INV-SIN-002)
- [x] T537 [P] [US2] Pruebas: edición auditada (con `If-Match` vigente) de peso, cita médica y vacuna vigente; sin cambios no audita; Lector 403; la edición que dejaría al propio registro `SUPERSEDED` se rechaza con 409 sin cambios (SC-CAT-012, SC-CAT-028) (REQ-BOR-003)
- [x] T538 [US2] Ajustar `UpdateRecordUseCase` para omitir la fila de auditoría cuando el estado canónico no cambia y rechazar la edición que deja al propio registro `SUPERSEDED` (REQ-BOR-003, INV-REG-002)
- [x] T539 [P] [US2] Pruebas: borrado físico con fila de auditoría `DELETE` en la misma transacción (reversión si la auditoría falla), segundo borrado con `ERR-PET-NOT-FOUND`, guarda de `SUPERSEDED` en edición y borrado, exclusión de listados, tablero, exportación y cálculo (SC-CAT-013, SC-CAT-014) (REQ-BOR-001, REQ-BOR-002, INV-REG-001, INV-REG-002)
- [x] T540 [N2] [US2] Migración `0002` de Postgres y `0006` de SQLite: columna `revision INTEGER NOT NULL DEFAULT 0` en las 6 tablas de registros (D-16 A) y **ninguna** columna ni índice de borrado lógico (D-11 A); prueba de paridad (`schema-parity`) actualizada (REQ-BOR-005, INV-REG-003) **Nota (H-O-T617-2):** al existir la columna `revision`, retirar la exención de `revision` de `openapi-contract.ts` del arnés OpenAPI de 002 (hoy solo en comentario) y verificar que el arnés la exige. **Enmienda (R-1 Oracle B2, H-O-T540-1):** esa retirada queda DIFERIDA a T614 (retirarla rompe 36 pruebas); la exención actual sigue en `openapi-contract.ts` (línea ~60) con un comentario que la difiere.
- [x] T541 [US2] Repositorios y casos de uso: `DELETE` físico con comprobación de filas afectadas, auditoría `DELETE` en la misma transacción, `assertRecordNotSuperseded` en el borrado, sin filtros por `deleted_at`; el cálculo y la exportación operan sobre los registros existentes (REQ-BOR-001, REQ-BOR-002, REQ-BOR-005, INV-REG-001, INV-REG-002)
- [x] T542 [P] [US2] Pruebas de retención cero: ninguna de las 6 tablas tiene `deleted_at` ni `deleted_by_user_id` (paridad), `app-config.ts` no define `ARGOS_SOFT_DELETE_RETENTION_DAYS`, `/internal/maintenance` no purga registros clínicos y la cascada de mascota y de cuenta elimina todas las filas y encola sus medios (SC-CAT-015) (REQ-BOR-004)
- [x] T544 [US2] Interfaz: diálogo de confirmación de borrado, mensaje del 409 de `SUPERSEDED` y acciones de edición solo en registros vigentes (REQ-BOR-001, REQ-BOR-002, REQ-BOR-003)
- [x] T545 [US2] Batería de conformidad de repositorios (memoria, SQLite, Postgres) con borrado físico y exclusión de `SUPERSEDED` (REQ-BOR-001, INV-REG-001)
- [x] T600 [P] [US2] Pruebas de concurrencia con dos conexiones intercaladas (SQLite y Postgres): doble `DELETE` del mismo registro, edición contra creación de una vacuna posterior, orden de candados usuario → mascota (SC-CAT-028) (REQ-BOR-005, INV-REG-003, REQ-BOR-002)
- [x] T601 [US2] Candado de mascota y de propietario en la unidad de trabajo (`BEGIN IMMEDIATE` en SQLite; `SELECT … FOR UPDATE` en Postgres) para registros, medios y avatar (REQ-BOR-005, INV-REG-003)
- [x] T604 [P] [US2] **[Solo reemplazo (002 excluye merge)]** Pruebas de importación (reemplazo y fusión): borra por `pet_id` las 6 tablas de las mascotas reemplazadas, deja `avatar_object_id` nulo conservando `avatar_version`, encola medios y avatar, el error de microchip nombra la mascota propia del archivo, exportar → borrar → importar restaura el registro, y la vista previa informa `mediaToDeleteCount` con confirmación adicional antes de importar (D-15 A) (SC-CAT-024, SC-CAT-031) (REQ-IMP-001, REQ-PET4-001, REQ-GCS-004) **Nota (H-O-T617-2):** retirar la exención de `mediaToDeleteCount` de `openapi-contract.ts` (hoy solo en comentario) al implementarse la vista previa; se completa con T605.
- [x] T605 [US2] **[Solo reemplazo]** Importación de respaldo conforme a T604 en los 3 motores de repositorio (REQ-IMP-001) **Nota (H-O-T617-2):** con T604, queda retirada la exención de `mediaToDeleteCount` de `openapi-contract.ts`.
- [x] T613 [P] [US2] Pruebas de control de revisión (D-16 A) en memoria, SQLite y Postgres: dos `PATCH` con el mismo `If-Match` (uno 200 con `revision + 1`, el otro 409 `ERR-REC-CONFLICT` sin cambios ni auditoría), `PATCH` sin `If-Match` rechazado, edición sin cambios efectivos sin incremento e importación sobre un `id` existente con `revision` mayor (SC-CAT-035) (REQ-BOR-005, INV-REG-003) **Nota (H-O-T617-2):** incluye retirar la exención de `If-Match` del arnés OpenAPI (`openapi-contract.ts`) de su parte de control de revisión.
- [x] T614 [US2] `revision` en repositorios y `UpdateRecordUseCase` (comparación bajo el candado de mascota), cabecera `If-Match` en la ruta `PATCH`, `ERR-REC-CONFLICT` con `requirementRef` en el catálogo (Opción A, H-O-004C-1), `revision` de solo lectura en los registros y mensaje de conflicto en la interfaz («El registro cambió; recarga y vuelve a intentarlo»); retirar la exención de `revision` en openapi-contract.ts y verificar que el arnés OpenAPI la exige (diferido desde T540, H-O-T540-1) (REQ-BOR-005, INV-REG-003, REQ-BOR-003)

---

## Phase 5: US3 — Entrar con usuario o correo; microchip único (P2, 4A-1)

**Goal**: `username` sin distinguir mayúsculas, login por correo, microchip global.
**Independent Test**: `SC-CAT-016..025`.

- [x] T546 [P] [US3] Pruebas: registro con mayúsculas, colisión por `LOWER`, login por usuario y por correo, correo ambiguo, una sola verificación de hash por caso (espía) con medición de tiempo informativa, límite de intentos por identificador, invitación por `username` (SC-CAT-016..021) (REQ-LOG-001, REQ-LOG-002, INV-LOG-001, INV-LOG-002)
- [x] T547 [N2] [US3] Migraciones: índice único `LOWER(username)`, normalización de `login_attempts.username` a minúsculas, índice de invitaciones sobre `LOWER(invitee_username)`; comprobación previa de colisiones (REQ-LOG-002, INV-LOG-001)
- [x] T548 [US3] Resolutor de identificador de inicio de sesión (usuario o correo con coincidencia única) con `normalizeLoginIdentifier`, hash ficticio y error genérico (REQ-LOG-001, INV-LOG-002)
- [x] T549 [US3] Dominio y contrato de registro: patrón `^[A-Za-z0-9._-]+$`, guardado tal como se escribió, `ERR-AUTH-USERNAME-TAKEN` (REQ-LOG-002, INV-LOG-001)
- [x] T550 [US3] Interfaz: campo «Usuario o correo» en el inicio de sesión y ayuda del registro sin exigir dígitos (REQ-LOG-001, REQ-LOG-002)
- [x] T551 [US3] Búsquedas de usuario por `LOWER(username)` en invitaciones y membresías (REQ-LOG-002)
- [x] T552 [P] [US3] Pruebas: microchip global (propio y ajeno con respuesta idéntica y misma ruta, sin datos del tercero en cuerpo ni logs contra Postgres 17 real, violación `CHECK` no reportada como duplicado, importación, migración con duplicados) (SC-CAT-022..025) (REQ-PET4-001, INV-PET4-001)
- [x] T553 [N2] [US3] Migración: reemplazar `pets_owner_microchip` por `pets_microchip_global` con comprobación previa de duplicados entre propietarios que aborta con conteo (REQ-PET4-001, INV-PET4-001)
- [x] T554 [US3] Casos de uso y adaptadores: error uniforme sin filtrar datos, captura solo por restricción `pets_microchip_global`, sin propagar el objeto de error del driver; misma regla en la importación de respaldo (REQ-PET4-001, INV-PET4-001)
- [x] T555 [US3] Actualizar la lista canónica de `schema-parity` y los comentarios de repositorio que citan «único por propietario» (REQ-PET4-001)
- [x] T556 [P] [US3] Pruebas: microchip trivial rechazado, límite de 5 duplicados por día y por usuario con `ERR-RATE-LIMITED`, `detail` del 409 con la referencia al administrador (SC-CAT-029) (REQ-PET4-002)
- [x] T557 [US3] Validación de patrones triviales, contador de duplicados por usuario y texto del 409 (REQ-PET4-002)
- [x] T558 [P] [US3] Pruebas: recorte del identificador de login, contador por cuenta resuelta entre usuario y correo, purga de `login_attempts`, identificador ausente de logs, ayuda de la pantalla de login (SC-CAT-018, SC-CAT-030) (REQ-LOG-001)
- [x] T559 [US3] Contador por cuenta resuelta, purga de `login_attempts` en `purgeExpired` y ayuda «Si no puedes entrar con tu correo, usa tu usuario.» (REQ-LOG-001)

---

## Phase 6: US4 — Archivos médicos y fotos en GCS (P1, 4A-2)

**Goal**: bucket dedicado, subida validada, vista en línea y borrado físico.
**Independent Test**: `SC-ALM-001..015`.

- [x] T560 [P] [US4] Pruebas estáticas de Terraform: dos buckets distintos, `soft_delete_policy` 0 s, `exports` sin cambios, IAM mínimo, sin `google_service_account_key`, sin Data Access logs del bucket de medios (SC-ALM-001, SC-ALM-002) (REQ-GCS-001, REQ-GCS-002, INV-GCS-001)
- [x] T561 [N2] [US4] `terraform/buckets_media.tf`, variables, memoria y concurrencia de Cloud Run para `ARGOS_MEDIA_MAX_CONCURRENT_UPLOADS`; etiquetas de T484; `prevent_destroy` (REQ-GCS-001, INV-GCS-001, NFR-ALM-001)
- [x] T562 [N2] [US4] `terraform/iam.tf`: `storage.objectUser` sobre el bucket de medios y `serviceAccountTokenCreator` sobre `argos-run@` para sí misma (REQ-GCS-002)
- [x] T563 [P] [US4] Prueba de la CSP: `img-src` y `frame-src` con el host del bucket de medios y `object-src 'none'` (SC-ALM-012) (REQ-ARC-003)
- [x] T564 [N2] [US4] Ampliar la CSP en `security-headers.ts` (E3-03) (REQ-ARC-003)
- [x] T565 [P] [US4] Pruebas de `app-config`: `ARGOS_MEDIA_DRIVER` ∈ {`gcs`, `memory`}, `ARGOS_MEDIA_BUCKET`, TTL 30–900, `ARGOS_MEDIA_MAX_BYTES` <= 10 MiB, cuota por propietario, `ARGOS_MEDIA_MAX_CONCURRENT_UPLOADS` 1–8; producción sin `gcs` no arranca (SC-ALM-023) (REQ-GCS-003, REQ-ARC-005, REQ-ARC-001)
- [x] T566 [US4] `app-config.ts`: variables `ARGOS_MEDIA_*` (único lector de `process.env`) (REQ-GCS-003, REQ-ARC-005)
- [x] T567 [N2] [US4] Añadir `@google-cloud/storage` (D-01 A, Nivel 2 autorizada por Neo) con versión exacta y `npm ci` reproducible, **solo después** de la auditoría de `/merovingian` del árbol transitivo (T612); sin dependencia multipart (D-18 A) (SC-ALM-024) (NFR-ALM-003)
- [x] T568 [P] [US4] Pruebas de dominio de medios (SC-ALM-024): firmas JPEG/PNG/WebP/PDF (la extensión no decide; DOCX, XLSX y TXT rechazados, D-06 C), rechazo de SVG/HTML/políglotas/ejecutables/0 bytes, saneado de nombre (vacío, bidi, puntos de código, extensión canónica), clave solo con UUID, sin imports de `fs`/`fetch` (SC-ALM-003..007, SC-ALM-028) (INV-ARC-001, INV-ARC-002, INV-ARC-003, REQ-ARC-004, NFR-ALM-004)
- [x] T569 [US4] `src/domain/media/` (detector de firmas JPEG/PNG/WebP/PDF, saneador de nombre, generador de clave y nombre neutro de la URL; sin lector de encabezado WebP ni inspección ZIP) (INV-ARC-001, INV-ARC-002, INV-ARC-003, INV-ARC-004, REQ-ARC-004, NFR-ALM-004)
- [x] T570 [P] [US4] Pruebas de conformidad del `MediaStoragePort` (memoria y GCS contra emulador o doble HTTP): `put`, `get`, `delete` idempotente (inexistente = éxito), `list` con fecha de creación, `createReadUrl` (REQ-GCS-003)
- [x] T571 [US4] Puerto `MediaStoragePort` en `src/application/ports/` y adaptador de memoria con la ruta de desarrollo `/__dev/media/…` solo bajo `NODE_ENV != production` (REQ-GCS-003)
- [x] T572 [US4] Adaptador GCS con URL V4 por host virtual, firma por `signBlob` sin llaves, `response-content-*` fijados y nombre neutro (D-14 A) (REQ-GCS-003, REQ-ARC-003, INV-ARC-004)
- [x] T573 [P] [US4] Pruebas de esquema: `pet_media` (sin `sha256`, `object_key` ni autoría), `media_deletion_queue` con `reason`, y columnas `avatar_version` y `avatar_object_id` de `pets`, idénticas en SQLite y Postgres, sin binarios (SC-ALM-023) (REQ-GCS-005, REQ-GCS-004)
- [x] T574 [N2] [US4] Migraciones `pet_media`, `media_deletion_queue` y columnas de avatar de `pets` (Postgres `0005`, SQLite `0009`) (REQ-GCS-005, REQ-GCS-004, REQ-AVA-001)
- [x] T575 [US4] Repositorios de `pet_media` y de la cola en los 3 motores (REQ-GCS-005)
- [x] T576 [P] [US4] Pruebas de casos de uso de subida, listado, acceso y borrado: validación en orden, matriz de roles, tercero sin acceso, cuota por propietario sin tope por mascota, permiso re-verificado en la transacción final (SC-ALM-003..010, SC-ALM-013, SC-ALM-026) (REQ-ARC-001, REQ-ARC-002, REQ-ARC-005, REQ-ARC-003)
- [x] T577 [US4] Casos de uso de medios, acciones `READ_MEDIA`/`WRITE_MEDIA`/`DELETE_MEDIA` en `src/domain/access/`, auditoría `PET_MEDIA`, cuota bajo el candado del propietario (REQ-ARC-001, REQ-ARC-002, REQ-ARC-003, REQ-ARC-005, INV-ARC-004)
- [x] T578 [US4] Rutas HTTP: subida de cuerpo crudo con `kind` en la query y `X-Argos-Filename` (D-18 A, `addContentTypeParser`), `bodyLimit` de 10 MiB con corte en streaming, límite de subidas simultáneas, `Cache-Control: no-store` en `/access` y en errores, conformidad con el OpenAPI (SC-ALM-010, SC-ALM-011, SC-ALM-029, SC-ALM-030) (REQ-ARC-001, REQ-ARC-003)
- [x] T579 [P] [US4] Pruebas: borrado físico inmediato, cola transaccional, `delete` idempotente, 204 siempre tras el `COMMIT`, cascada de mascota, de cuenta y de importación con refuerzo por `list`, fallo de GCS con reintento sin tope del mantenimiento, alerta a las 48 h, transacción revertida sin borrar (SC-ALM-014, SC-ALM-015) (REQ-GCS-004, INV-GCS-002)
- [x] T580 [US4] Cola de borrado dentro de la unidad de trabajo, borrado posterior al `COMMIT`, refuerzo por `list` del prefijo y reintento sin tope en `/internal/maintenance` (E3-04) (REQ-GCS-004, INV-GCS-002)
- [x] T581 [US4] Interfaz del panel de archivos: subida con botón deshabilitado en vuelo, `accept` de fotos, mensaje del 415 con los tipos permitidos, lista, visor en línea (imagen y PDF), «Abrir o descargar» en móvil, renovación de la URL al 80 % de `expiresAt` y reintento único, descarga y borrado con confirmación, reexportación de fotos de T616 (D-13 A) (REQ-ARC-003, REQ-ARC-002, INV-ARC-004)
- [x] T582 [US4] Extender la redacción de logs por campo y por forma (`X-Goog-Signature`, `pets/<uuid>/`, 15 dígitos, `Key (`): nunca registrar `original_name`, cabecera del nombre, URL firmada, clave de objeto ni microchip, con pruebas de fallo del SDK, nombre malicioso y violación `23505` (SC-ALM-024) (NFR-ALM-002)
- [x] T606 [P] [US4] Pruebas de intención previa y conciliación: proceso muerto entre `put` e `INSERT`, `put` ambiguo, fila `INTENT` vencida, objeto sin referencia de más de 24 h, objeto referenciado intacto, subida concurrente con eliminación de mascota, cuota simultánea, permiso revocado durante la transmisión (SC-ALM-025, SC-ALM-026, SC-ALM-031) (REQ-GCS-006, INV-GCS-002, REQ-BOR-005)
- [x] T607 [US4] Subida en dos transacciones con fila `INTENT`, conversión a `DELETE` ante fallo, conversión de `INTENT` vencidas y conciliación diaria del prefijo `pets/` en `/internal/maintenance` (REQ-GCS-006, INV-GCS-002)
- [x] T608 [P] [US4] Pruebas de subida: corte a mitad, `Content-Length` distinto de lo recibido, cuerpo de 32 MiB cortado en 10 MiB + 1, 6 subidas con límite de 4, memoria acotada (SC-ALM-005, SC-ALM-029) (REQ-ARC-001)
- [x] T609 [US4] Lectura en streaming con corte, detección de corriente truncada (400 sin `put`) y límite de subidas simultáneas por instancia (REQ-ARC-001)
- [x] T610 [P] [US4] Pruebas de contrato con doble de GCS caído: 502 y `no-store` en `getMediaAccess`, `putAvatar`, `getAvatar` y `deleteAvatar`; 204 en `deleteMedia` (SC-ALM-030) (REQ-ARC-003, REQ-AVA-001)
- [x] T611 [P] [US4] Pruebas de componente del panel de archivos: `accept` de fotos, mensaje del 415, renovación proactiva con reloj simulado y «Abrir o descargar» en ventana móvil (SC-ALM-032) (REQ-ARC-003, REQ-ARC-001)
- [x] T615 [P] [US4] Pruebas de la reexportación de fotos (D-13 A): un JPEG con EXIF y GPS sale sin segmentos EXIF y con la orientación visual correcta, PNG y WebP sin metadatos, WebP no codificable cae a JPEG, una imagen no decodificable no se sube, el PDF no se modifica y el resultado respeta 10 MiB; en Chromium y, si está disponible, WebKit (PE-04) (SC-ALM-035) (REQ-ARC-001)
- [x] T616 [US4] Función de cliente de reexportación por `canvas` (orientación EXIF aplicada, formatos de salida, error visible si falla) integrada en el panel de archivos antes del `POST` (REQ-ARC-001)

---

## Phase 7: US5 — Avatar y álbum (P2, 4A-2)

**Goal**: avatar con caché y álbum paginado por mascota (la galería del hogar queda diferida a la 005: `TECHDEBT-004-03`).
**Independent Test**: `SC-ALM-016..021`, `SC-ALM-027`.

- [x] T583 [P] [US5] Pruebas: avatar (JPEG/PNG/WebP, tope de 512 KiB sin validar dimensiones, UUID por versión, `avatar_version` monótono y nunca reiniciado, `PATCH` concurrente con `PUT`, `DELETE` con GCS caído seguido de `PUT`, caché inmutable solo con `v` actual y `no-cache` en otro caso, 404 sin avatar, tercero sin acceso) (SC-ALM-016, SC-ALM-017, SC-ALM-027) (REQ-AVA-001, INV-AVA-001)
- [x] T584 [US5] Casos de uso y rutas `PUT`/`GET`/`DELETE /pets/{petId}/avatar` con proxy autenticado, columnas `avatar_version` y `avatar_object_id`, cola del avatar anterior y del avatar eliminado, `Vary: Cookie` (REQ-AVA-001, INV-AVA-001, REQ-GCS-006) **Nota (H-O-004A-1):** retirar la exención de `avatarVersion` en `required` de `openapi-contract.ts` cuando la columna `avatar_version` exista.
- [x] T585 [P] [US5] Pruebas de componente: recortador (salida 512×512 WebP, o JPEG si `canvas` no codifica WebP; máscara circular; teclado), en Chromium y WebKit (si WebKit exige instalar un navegador en CI es [N2]; si no, PE-04), prioridad avatar cargado > inicial y `avatarUrl` como enlace de texto sin `<img>` bajo la CSP de producción (D-19 A), ayuda de `avatarUrl` (SC-ALM-018..020) (REQ-AVA-002, REQ-AVA-003)
- [x] T586 [US5] `PetAvatar`, `AvatarCropper` con respaldo JPEG y ayuda del campo `avatarUrl` en `PetForm`, con el enlace «Ver enlace externo» (REQ-AVA-002, REQ-AVA-003)
- [x] T587 [P] [US5] Pruebas de paginación del álbum: 24 por página, orden determinista, página fuera de rango, `page = 0`, `loading="lazy"` en cada imagen (SC-ALM-021) (REQ-ALB-001, INV-ALB-001)
- [x] T588 [US5] Endpoint y pantalla del álbum por mascota con imágenes completas y `loading="lazy"` (D-09, D-20 B) (REQ-ALB-001, INV-ALB-001)

---

## Phase 8: Seguridad, accesibilidad, cierre y despliegue

- [x] T591 [P] `/trinity` y `/sentinels`: pruebas de seguridad de medios (IDOR entre mascotas y hogares, políglotas, SVG/HTML, CSRF y límite de tamaño en la subida, enumeración y límite por usuario del microchip) en `tests/security/` (INV-ARC-002, INV-ARC-001, REQ-ARC-002, REQ-PET4-001, REQ-PET4-002, INV-LOG-002)
- [x] T592 [P] `/seraph`: E2E con las cabeceras de CSP de producción y WCAG 2.1 AA a 320, 1024 y 1280 px del recortador, el visor y `PetForm` (REQ-AVA-002, REQ-FRM-002, REQ-ARC-003)
- [x] T593 [P] `/kid`: recorrido multi-navegador de un hogar compartido con medios de mascotas compartidas (REQ-ARC-002)
- [x] T594 [P] Comprobación de costo: `terraform plan` sin recursos de pago y cuenta de operaciones esperadas dentro del cupo (SC-ALM-024) (NFR-ALM-001)
- [x] T595 Runbook y `quickstart.md` de 004: retención 0 y ventana única de `REQ-PG-011` para los registros borrados, ventana de la cola de GCS (inmediata, <= 24 h, sin tope con alerta a las 48 h), aviso de eliminación de cuenta, restauración (`REQ-PG-016`) sin resurrección de medios y reaplicando borrados desde la auditoría, migración aditiva sin retroceso destructivo, no activar Data Access logs del bucket de medios, canal de resolución de microchip por Neo, métrica de bytes servidos (SC-ALM-033) (REQ-GCS-004, REQ-ACC-002, REQ-BOR-004, NFR-ALM-005, REQ-PET4-002, NFR-ALM-001)
- [x] T596 Compuertas finales: `npx tsc --noEmit`, `npm run test:gate`, `bash scripts/verify-traceability.sh --feature 004`, `bash scripts/verify-oracles.sh`; auditoría de `/oracle` (REQ-ESP-001, NFR-ALM-004)
- [ ] T597 [N2] Neo: despliegue por CI aprobado, `terraform apply` y verificación en vivo de subida, vista en línea (URL firmada, `iframe`, caducidad y CSP de producción), borrado físico, avatar, y prueba en un dispositivo móvil real (PE-04, PE-05, PE-06); firma `[x]` (REQ-GCS-001, REQ-GCS-002, REQ-ARC-003, REQ-GCS-004)

---

## Deuda técnica registrada (`TECHDEBT-004-*`, sin tarea hasta que se dispare)

| ID | Descripción | Disparador | Origen |
|---|---|---|---|
| TECHDEBT-004-01 | DOCX, XLSX y TXT como adjuntos descargables (inspección del directorio central ZIP y disposición `attachment`) | petición explícita de Neo con un caso de uso | `D-06` C |
| TECHDEBT-004-02 | paginación del álbum por cursor `(created_at, id)` | repetidos u omitidos observados en uso real | EDGE-004-032 |
| TECHDEBT-004-03 | galería del hogar (feature 005) | decisión de producto de la 005 | `D-12` B |
| TECHDEBT-004-04 | tope de píxeles y miniaturas de las fotos | página del álbum con > 3 s hasta la primera imagen en 4G simulado, o cierre de pestaña por memoria con fotos reales | `D-20` B, `D-09` |
| TECHDEBT-004-05 | altas de razas del catálogo (`0.2.0`) | validación de `/maggie` y veterinario (`PE-03`) | MAG-004-013, 014 |
| TECHDEBT-004-06 | límite por IP en el login: limitador en la aplicación (`src/`) o Cloud Armor en `terraform/`, a decidir en una feature posterior; hoy solo mitiga el hash costoso uniforme (`INV-AUTH-006`) | feature posterior de endurecimiento del login, o evidencia de fuerza bruta distribuida contra cuentas con correo conocido (tope efectivo 10 intentos por ventana) | `RR-07`, H-T591R-1 (decisión y firma de Neo 2026-11-17) |
| TECHDEBT-004-07 | recorrido E2E Playwright multi-navegador de cohabitación sobre UI con medios compartidos (hoy cubierto por pruebas de integración API `t593-cohabitacion.api.spec.ts` en los 5 estados y permisos cruzados) | regresión de concurrencia multi-sesión en UI o ampliación de la suite E2E de hogares compartidos | `T593`, H-O-T593-1 (decisión y firma de Neo 2026-11-17) |

## Mapa de trazabilidad ID → tareas (1:1 con `spec.md`; sin huérfanos)

| ID | Tareas |
|---|---|
| REQ-ESP-001 | T509, T514, T520, T521, T596 |
| REQ-RAZ-001 | T502, T503, T513, T515, T516, T517, T522, T523, T526, T527, T598 |
| REQ-RAZ-002 | T524, T525, T526, T527 |
| REQ-RAZ-003 | T510, T523, T524, T525, T527, T617 |
| REQ-FRM-001 | T528, T529 |
| REQ-FRM-002 | T504, T530, T531, T592 |
| REQ-MDC-001 | T502, T507, T510, T515, T532, T533 |
| REQ-SIN-001 | T502, T503, T504, T507, T510, T515, T534, T535, T536, T598, T617 |
| REQ-SIN-002 | T535 |
| REQ-SIN-003 | T503, T504, T534, T535, T536, T598 |
| REQ-BOR-001 | T502, T539, T541, T544, T545 |
| REQ-BOR-002 | T507, T511, T539, T541, T544, T600 |
| REQ-BOR-003 | T537, T538, T544, T614 |
| REQ-BOR-004 | T501, T542, T595 |
| REQ-BOR-005 | T510, T511, T512, T540, T541, T600, T601, T606, T613, T614 |
| REQ-LOG-001 | T501, T510, T546, T548, T550, T558, T559 |
| REQ-LOG-002 | T501, T502, T507, T510, T546, T547, T549, T550, T551 |
| REQ-PET4-001 | T502, T506, T507, T552, T553, T554, T555, T591, T604 |
| REQ-PET4-002 | T511, T556, T557, T591, T595 |
| REQ-GCS-001 | T560, T561, T597 |
| REQ-GCS-002 | T507, T560, T562, T597 |
| REQ-GCS-003 | T501, T565, T566, T570, T571, T572, T612 |
| REQ-GCS-004 | T505, T506, T512, T573, T574, T579, T580, T595, T597, T604 |
| REQ-GCS-005 | T510, T573, T574, T575 |
| REQ-GCS-006 | T584, T606, T607 |
| REQ-ARC-001 | T501, T511, T512, T565, T576, T577, T578, T608, T609, T611, T615, T616 |
| REQ-ARC-002 | T576, T577, T581, T591, T593 |
| REQ-ARC-003 | T501, T504, T510, T511, T515, T563, T564, T572, T576, T577, T578, T581, T592, T597, T610, T611 |
| REQ-ARC-004 | T568, T569 |
| REQ-ARC-005 | T501, T512, T565, T566, T576, T577 |
| REQ-AVA-001 | T510, T511, T574, T583, T584, T610 |
| REQ-AVA-002 | T504, T585, T586, T592 |
| REQ-AVA-003 | T501, T504, T585, T586 |
| REQ-ALB-001 | T504, T511, T587, T588 |
| REQ-IMP-001 | T501, T504, T510, T511, T604, T605 |
| INV-RAZ-001 | T513, T522, T523, T524, T525, T617 |
| INV-RAZ-002 | T503, T599 |
| INV-SIN-001 | T503, T534, T535 |
| INV-SIN-002 | T503, T534, T536 |
| INV-REG-001 | T539, T541, T545 |
| INV-REG-002 | T538, T539, T541 |
| INV-REG-003 | T540, T600, T601, T613, T614 |
| INV-LOG-001 | T546, T547, T549 |
| INV-LOG-002 | T505, T546, T548, T591 |
| INV-PET4-001 | T506, T552, T553, T554 |
| INV-GCS-001 | T560, T561 |
| INV-GCS-002 | T505, T579, T580, T606, T607 |
| INV-ARC-001 | T568, T569, T591 |
| INV-ARC-002 | T505, T568, T569, T591 |
| INV-ARC-003 | T568, T569 |
| INV-ARC-004 | T569, T572, T577, T581 |
| INV-AVA-001 | T583, T584 |
| INV-ALB-001 | T587, T588 |
| NFR-ALM-001 | T561, T594, T595 |
| NFR-ALM-002 | T506, T582 |
| NFR-ALM-003 | T508, T567, T612 |
| NFR-ALM-004 | T514, T568, T569, T596 |
| NFR-ALM-005 | T595 |
| SC-CAT-001 | T520 |
| SC-CAT-002 | T522, T526 |
| SC-CAT-003 | T524, T526 |
| SC-CAT-004 | T522, T524 |
| SC-CAT-005 | T528 |
| SC-CAT-006 | T530 |
| SC-CAT-007 | T532 |
| SC-CAT-008 | T532 |
| SC-CAT-009 | T534 |
| SC-CAT-010 | T534, T536 |
| SC-CAT-011 | T534 |
| SC-CAT-012 | T537 |
| SC-CAT-013 | T539 |
| SC-CAT-014 | T539 |
| SC-CAT-015 | T542 |
| SC-CAT-016 | T546 |
| SC-CAT-017 | T546 |
| SC-CAT-018 | T546, T558 |
| SC-CAT-019 | T546 |
| SC-CAT-020 | T546 |
| SC-CAT-021 | T546 |
| SC-CAT-022 | T552 |
| SC-CAT-023 | T552 |
| SC-CAT-024 | T552, T604 |
| SC-CAT-025 | T552 |
| SC-CAT-026 | T535 |
| SC-CAT-028 | T537, T600 |
| SC-CAT-029 | T556 |
| SC-CAT-030 | T558 |
| SC-CAT-031 | T604 |
| SC-CAT-032 | T516 |
| SC-CAT-033 | T599 |
| SC-CAT-034 | T534, T536 |
| SC-CAT-035 | T613 |
| SC-ALM-001 | T560 |
| SC-ALM-002 | T560 |
| SC-ALM-003 | T568, T576 |
| SC-ALM-004 | T568, T576 |
| SC-ALM-005 | T568, T576, T608 |
| SC-ALM-006 | T568, T576 |
| SC-ALM-007 | T568, T576 |
| SC-ALM-008 | T576 |
| SC-ALM-009 | T576 |
| SC-ALM-010 | T576, T578 |
| SC-ALM-011 | T578 |
| SC-ALM-012 | T563 |
| SC-ALM-013 | T576 |
| SC-ALM-014 | T579 |
| SC-ALM-015 | T579 |
| SC-ALM-016 | T583 |
| SC-ALM-017 | T583 |
| SC-ALM-018 | T585 |
| SC-ALM-019 | T585 |
| SC-ALM-020 | T585 |
| SC-ALM-021 | T587 |
| SC-ALM-023 | T565, T573 |
| SC-ALM-024 | T567, T568, T582, T594 |
| SC-ALM-025 | T606 |
| SC-ALM-026 | T576, T606 |
| SC-ALM-027 | T583 |
| SC-ALM-028 | T568 |
| SC-ALM-029 | T578, T608 |
| SC-ALM-030 | T578, T610 |
| SC-ALM-031 | T606 |
| SC-ALM-032 | T611 |
| SC-ALM-033 | T595 |
| SC-ALM-035 | T615 |
| SC-ALM-036 | T591 |

## Dependencias entre fases

- Phase 1 antes de Phase 2; T503 antes de T513; T507 es la firma formal del delta ya aplicado en el texto de 002 y 003.
- Phase 2 (T515) antes de cualquier tarea de `src/`; T516 y T517 antes de T515; T513 después de T503 y T598.
- Phase 3 y Phase 4 son independientes entre sí tras T515; Phase 5 depende de T540 solo en el orden de numeración de migraciones. T601 (candado) antes de T541, T580, T584 y T607; T613 antes de T614; T540 y T601 antes de T614.
- Phase 6 depende de T501 (D-01 y D-18), T507 (E3-01..E3-05), T515 y T601; T612 antes de T567; T567 antes de T572; T615 antes de T616 y T616 antes de T581; T574 antes de T575; T606 antes de T607; T608 antes de T609.
- Phase 7 depende de T569, T571, T574, T575, T577, T607.
- Phase 8 al final; T597 es humana.
