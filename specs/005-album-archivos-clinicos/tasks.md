# Tasks: Álbum, archivos clínicos, cancelar edición, enlace veterinario y ClinicalSummary (Feature 005, Fase 4B)

**Input**: `specs/005-album-archivos-clinicos/` (`spec.md`, `plan.md`); lectura de `specs/004-*/` y de `claude/backlog-fase-4b.md`.
**Estado**: `DRAFT` (borrador del Architect para aprobación de Neo, Nivel 2). Toda tarea nace `[ ]`; el techo de los agentes es `REVIEW` y solo Neo marca `COMPLETED` (`[x]`). Ningún documento está `APPROVED` ni `LOCKED`.
**Numeración**: `T700..T797` (004 usó `T501..T617`; no se reutiliza ningún ID). Huecos deliberados dentro de cada fase para ampliaciones.

## Format: `[ID] [P?] [N2?] [Story] Description — REQ/SC`
- **[P]**: paralelizable. **[N2]**: requiere autorización de Neo (migraciones, scripts de verificación, CI, Terraform, dependencias). **[GOV]**: gobernanza/gate. **[US1..US5]**: historia.
- Cada línea cita los IDs que cubre; la compuerta por tarea (`verify-traceability.sh --feature 005 --task T###`) los leerá cuando el script admita la feature (ver T709).

## Reglas transversales
- **TDD (constitución IV)**: las pruebas se escriben primero y rojas antes de implementar.
- **Contratos primero**: ninguna tarea de `src/` empieza antes de T708 (`/mouse` CUMPLE) y de los contratos de 005 compilados (`bash scripts/compile-contracts.sh`). Los contratos de 004 son `LOCKED`: ninguna tarea los edita sin la firma de Neo de la decisión `D5-*` correspondiente.
- **Capas**: `src/domain/` y `src/application/` sin `fs`, `fetch`, SDK ni `process.env`.
- **Sin dependencias nuevas** (`package.json` intacto, NFR-005-004); `node:crypto` basta.
- **Ninguna tarea ejecuta `terraform apply`, `gcloud` mutante, `git push` ni despliega.**
- **Caso B** (contrato vs implementación): vuelve a `/architect` (`MAX_HOPS = 2`).

---

## Phase 1: Gobernanza y compuertas previas (sin código)

**Goal**: decisiones firmadas, privacidad y seguridad diseñadas antes de código, contratos nuevos y compuerta estructural.
**Independent Test**: D5-01..D5-15 asentadas; T702 y T703 cerradas; `/mouse` CUMPLE.

- [ ] T700 [GOV] Neo firma `D5-01..D5-15` (tabla «Decisiones pendientes» de `spec.md`); `/architect` las asienta sin cambiar estados — REQ-ALB5-002, REQ-ALB5-004, REQ-CLI5-002, REQ-VET-001, REQ-VET-002, REQ-VET-004, REQ-VET-005, REQ-VET-007, REQ-VET-009; SC-005-011
- [ ] T701 [GOV] `/merovingian`: grafo de impacto de las enmiendas a 004 (`K-10`, `REQ-ALB-001`, `REQ-ARC-005`, `INV-ALB-001`, `ERR-MEDIA-ALBUM-LIMIT`, matriz `REQ-RBAC-001`) sobre OpenAPI, esquemas, `src/generated/` y tests — REQ-ALB5-002, REQ-ALB5-004, REQ-VET-001; SC-005-002
- [ ] T702 [GOV] `/rama` (gate previo de privacidad): datos clínicos en el enlace, lista de exclusiones del resumen, microchip, nombres de archivo, auditoría de accesos con HMAC de IP, retención, derechos del titular; entrega checklist verificable — NFR-005-001, REQ-SUM-003, REQ-VET-008; SC-005-015, SC-005-022, SC-005-029. **Bloquea T750 y T770**
- [ ] T703 [GOV] `/trinity` (gate previo de seguridad): modelo de amenazas del enlace público (enumeración, fuerza bruta, `Referer`, caché, IDOR entre alcances, abuso de recursos, CSP) y diseño de la suite de explotación `tests/security/` — NFR-005-002, REQ-VET-003, REQ-VET-006, REQ-VET-007, INV-005-001; SC-005-026. **Bloquea T750**
- [ ] T704 [GOV] `/maggie`: contenido, orden, unidades y avisos clínicos del `ClinicalSummary` y de la sección de archivos; confirma que síntomas no generan valoración (REQ-SIN-003 de 004) — REQ-SUM-001, REQ-CLI5-001; SC-005-027
- [ ] T705 [GOV] `/sati`: prototipos HTML (320/1024/1280 px, WCAG 2.1 AA) de Álbum, Historial/Archivos, «Cancelar», diálogo de compartir y vista pública/imprimible; aprobación de Neo — NFR-005-003, REQ-CAN-001, REQ-SUM-005; SC-005-010, SC-005-031, SC-005-032
- [ ] T706 [GOV] `/architect`: crear `contracts/` de 005 tras T700: `clinical-summary.schema.json`, `share-link.schema.json`, `contracts/openapi/` (rutas `share-links` y `/shared/{token}/summary`), catálogo de errores incremental (incluye `ERR-MEDIA-ALBUM-LIMIT` y el 404/429 uniformes) y, si `D5-04` lo firma, la enmienda de `media.schema.json`; la enmienda a contratos de 004 solo con firma — REQ-SUM-001, REQ-SUM-006, REQ-CLI5-002, REQ-ALB5-002, REQ-VET-006; SC-005-011, SC-005-033
- [ ] T707 [GOV] `/mifune` (recorte de exceso) y `/lock` (EDGE-005-*) sobre spec, plan y contratos — REQ-VET-007, REQ-ALB5-003; SC-005-005, SC-005-021
- [ ] T708 [GOV] `/mouse`: compuerta estructural **única** (1:1 spec-tareas, 0 historias huérfanas, contratos completos) — todos los REQ; SC-005-001..033
- [ ] T709 [N2] Revisar `scripts/verify-traceability.sh`, `scripts/verify-oracles.sh` y `scripts/compile-contracts.sh` para `--feature 005` (el primero acepta el argumento y, con `contracts/` ya creado, no aborta pero exige evidencia estricta de `src/` y `tests/`; verificar si las reglas propias de 004 bajo `FEAT4` deben replicarse; el compilador necesita la rama `005` y la fusión del catálogo incremental, diseño en `contracts/README.md` §6) y la tabla SC->tarea; sin relajar las compuertas de 001..004 — NFR-005-004; SC-005-033

**Checkpoint**: T700..T709 cerradas; solo entonces empiezan las fases siguientes.

---

## Phase 2: Fundamentos — parámetros de plataforma

**Goal**: tabla y puerto de parámetros, sin UI.
**Independent Test**: `SC-005-004`.

- [ ] T710 [N2] Migración `platform_parameters` (SQLite y Postgres, siembra `album.max_photos_per_pet = 10`; sin FK en `updated_by_user_id`) — REQ-PRM-001, REQ-PRM-003; SC-005-004
- [ ] T711 [P] Prueba de paridad de esquema y de siembra (`tests/integration/persistence/schema-parity.spec.ts` extendida solo en esta tarea) — REQ-PRM-001; SC-005-004
- [ ] T712 [P] `SqlPlatformParameterRepository` para ambos motores con pruebas de integración — REQ-PRM-001, REQ-PRM-003; SC-005-004
- [ ] T713 [P] Dominio `platform-parameters.ts` (catálogo en código: clave, tipo, defecto 10, rango 1..50) y puerto `PlatformParameterPort` con caché (TTL por `D5-07`) — REQ-PRM-002; SC-005-004
- [ ] T714 Pruebas: fila ausente, `0`, `-1`, `abc`, fuera de rango y TTL de caché con reloj controlado — REQ-PRM-002; SC-005-004

---

## Phase 3: User Story 1 — Álbum (P1)

**Goal**: sección «Álbum» y tope de 10 fotos parametrizable.
**Independent Test**: `SC-005-001..006` y `SC-005-034`.

- [ ] T720 [US1] Pruebas rojas del tope atómico con conexiones intercaladas (9 fotos, dos subidas) y rechazo sin objeto huérfano — REQ-ALB5-002, INV-005-003; SC-005-002, SC-005-003
- [ ] T721 [US1] Pruebas: mascota con 14 fotos de 004 (listado completo, borrado permitido, subida bloqueada), `FILE` no cuenta, parámetro en 12 — REQ-ALB5-002, REQ-ALB5-003, REQ-ALB5-004; SC-005-004, SC-005-005, SC-005-006
- [ ] T722 [P] [US1] Pruebas del listado: `kind=PHOTO` solo fotos; `kind=FILE` solo archivos — REQ-ALB5-001; SC-005-001
- [ ] T723 [P] [US1] Dominio `album-limit.ts` (`assertAlbumHasRoom`, error `ERR-MEDIA-ALBUM-LIMIT` del catálogo incremental), puerto `countByPetAndKind` en ambos motores y caso de uso/ruta `getAlbumLimits` — REQ-ALB5-002, REQ-ALB5-005, INV-005-003; SC-005-002, SC-005-034
- [ ] T724 [US1] Integrar el tope en `UploadMedia`: comprobación previa al `put` y autoritativa en la transacción final bajo candado de mascota; fila `INTENT` pasa a `DELETE` al rechazar; tras T708 y T713 — REQ-ALB5-002, INV-005-003; SC-005-002, SC-005-003, SC-005-004
- [ ] T725 [US1] Mensaje de error claro y estado «Álbum lleno» con conteo — REQ-ALB5-002, REQ-ALB5-003; SC-005-002, SC-005-005
- [ ] T726 [US1] UI «Álbum» (subir, ver, eliminar; sin archivos clínicos), con `loading="lazy"` y contador «N de M» tomado de `getAlbumLimits` (sin «10» cableado) — REQ-ALB5-001, REQ-ALB5-004, REQ-ALB5-005; SC-005-001, SC-005-005, SC-005-034
- [ ] T727 [US1] E2E del álbum (Playwright, móvil emulado) — REQ-ALB5-001; SC-005-001, SC-005-002

---

## Phase 4: User Story 2 — Historial / Archivos clínicos (P1)

**Goal**: panel «Archivos» en el historial clínico, separado del álbum.
**Independent Test**: `SC-005-007..011`.

- [ ] T730 [US2] Pruebas rojas: tipos aceptados (PDF, JPEG, PNG, WebP) y rechazados (DOCX) como `FILE`; los `FILE` no aparecen en el álbum — REQ-CLI5-001; SC-005-007, SC-005-001
- [ ] T731 [P] [US2] Pruebas: cuota de 1 GiB compartida con el álbum y permisos `WRITE/DELETE/READ_MEDIA` por rol — REQ-CLI5-003; SC-005-008, SC-005-009
- [ ] T732 [US2] UI del panel «Archivos» en «Historial / Archivos» (subir, listar, ver, eliminar) — REQ-CLI5-001; SC-005-007
- [ ] T733 [US2] Integrar el panel junto a peso, medidas, vacunas, desparasitaciones, consultas y parámetros; aplicar el diseño aprobado en T705 — REQ-CLI5-001; SC-005-001, SC-005-010
- [ ] T734 [US2] E2E y accesibilidad (320 px, teclado) del panel — REQ-CLI5-001, NFR-005-003; SC-005-010
- [ ] T735 [US2] Verificar que no se cambió la matriz de permisos ni la cuota de 004 (solo lectura de contratos) — REQ-CLI5-003; SC-005-008, SC-005-009
- [ ] T736 [US2] Aplicar la decisión `D5-04` (tipo y fecha de examen) solo si Neo la firmó y T706 enmendó el contrato — REQ-CLI5-002; SC-005-011

---

## Phase 5: User Story 3 — Cancelar (P2)

**Goal**: botón «Cancelar» en los 6 formularios.
**Independent Test**: `SC-005-012..014`.

- [ ] T740 [US3] Pruebas rojas de componente `FormActions` (Cancelar, deshabilitado durante el guardado, teclado) — REQ-CAN-001, REQ-CAN-002; SC-005-013, SC-005-014
- [ ] T741 [P] [US3] Aplicar a pesos y medidas — REQ-CAN-001; SC-005-012
- [ ] T742 [P] [US3] Aplicar a vacunas y desparasitaciones — REQ-CAN-001; SC-005-012
- [ ] T743 [P] [US3] Aplicar a consultas y parámetros — REQ-CAN-001; SC-005-012
- [ ] T744 [US3] E2E: «Cancelar» sin petición de escritura, `revision` y auditoría intactas — REQ-CAN-002; SC-005-012, SC-005-013

---

## Phase 6: User Story 4 — Enlace veterinario (P1)

**Goal**: enlace de solo lectura por mascota u hogar.
**Independent Test**: `SC-005-015..026`, `SC-005-035..042`, `SC-005-046` y `SC-005-048`.
**Bloqueos**: T702, T703, T706 y T708 cerradas. El dominio de resumen (T770..T774) se implementa antes de T758.

- [ ] T750 [US4] Pruebas rojas de seguridad en `tests/security/`: enumeración, 404 uniforme, `Referer`, caché, IDOR entre alcances, métodos distintos de `GET`, cookie inerte — REQ-VET-006, REQ-VET-007, INV-005-001, INV-005-002; SC-005-016, SC-005-020, SC-005-021, SC-005-026
- [ ] T766 [N2] Migración `share_links` (SQLite y Postgres; `CHECK` de alcance; `ON DELETE CASCADE`; solo `token_hash`) y prueba de paridad — REQ-VET-003, REQ-VET-004, REQ-VET-005, REQ-VET-010; SC-005-015, SC-005-018, SC-005-019, SC-005-024
- [ ] T751 [P] [US4] Dominio `sharing/` (alcance, caducidad, revocación, formato de token) con pruebas — REQ-VET-002, REQ-VET-003, REQ-VET-004, REQ-VET-005; SC-005-016, SC-005-018, SC-005-019
- [ ] T752 [US4] `CryptoTokenGenerator` (`randomBytes(32)`, base64url) y hash `SHA-256`; comparación en tiempo constante; prueba de que el token no se persiste ni se registra — REQ-VET-003, INV-005-005; SC-005-015
- [ ] T753 [US4] Caducidad con reloj controlado y tope de `D5-11` — REQ-VET-004; SC-005-018
- [ ] T754 [US4] Caso de uso `CreateShareLink` (permiso de `D5-10`, URL devuelta una sola vez, auditoría) — REQ-VET-001; SC-005-015, SC-005-025
- [ ] T755 [US4] `ResolveShareLink`: alcance `PET` y `HOUSEHOLD` (según `D5-05`), 404 uniforme — REQ-VET-002, INV-005-001; SC-005-016, SC-005-017
- [ ] T756 [US4] Rutas autenticadas de creación y listado (solo metadatos) — REQ-VET-001; SC-005-015, SC-005-025
- [ ] T757 [US4] Revocación inmediata y estado ACTIVO/REVOCADO/VENCIDO — REQ-VET-005; SC-005-019
- [ ] T758 [US4] Ruta pública `GET /shared/{token}/summary` fuera del grupo con sesión; solo `GET` — REQ-VET-006, INV-005-001, INV-005-002; SC-005-016, SC-005-020
- [ ] T759 [P] [US4] Cabeceras `no-store`, `no-referrer`, `noindex`, CSP, `nosniff` y prueba por ruta — REQ-VET-006, INV-005-002; SC-005-020
- [ ] T760 [US4] Límite de tasa por IP (`D5-13`); decisión de Cloud Armor, si aplica, es Nivel 2 y se escala a Neo — REQ-VET-007; SC-005-021
- [ ] T761 [US4] Uniformidad de respuesta (cuerpo, código, cabeceras y secuencia de puertos con espías) entre inexistente, mal formado, vencido, revocado, creador sin autoridad y `mediaId` ajeno; cabeceras también en 404 y 429 — REQ-VET-007, INV-005-007; SC-005-021, SC-005-041
- [ ] T762 [US4] Auditoría `share_link_audit` (HMAC de IP con clave dedicada y versión, fallos agregados, fail-closed), serializer sin URL, `instance` constante y redacción de `/shared/<token>`; prueba de `stdout` con centinela — REQ-VET-008, REQ-VET-013, INV-005-009, NFR-005-001; SC-005-022, SC-005-042
- [ ] T763 [US4] Ruta `getSharedFile` (302 a URL firmada V4 nueva, TTL <= min(300 s, restante), `Content-Disposition` neutro), `mediaId` validado contra el conjunto vigente y `FILE`, y `fileLabels` escapados — REQ-VET-009, INV-005-002, INV-005-008, INV-005-009; SC-005-023, SC-005-035, SC-005-036
- [ ] T764 [US4] Cascada (mascota, hogar, cuenta e importación por reemplazo), `share_links` fuera de exportación e importación, purga diaria de 30 y 90 días — REQ-VET-010, REQ-VET-013; SC-005-024, SC-005-042
- [ ] T765 [US4] Pruebas multi-hogar con `/kid` y `/sentinels` sobre IDOR entre alcances — INV-005-001, NFR-005-002; SC-005-016, SC-005-026
- [ ] T767 [US4] UI «Compartir con veterinario» (alcance, caducidad 1/7/30, casillas de microchip y archivos clínicos desmarcadas, copiar URL una vez, lista con `activeCount`, «Revocar» con confirmación en línea) según T705 — REQ-VET-001, REQ-VET-005; SC-005-015, SC-005-019, SC-005-040, SC-005-046
- [ ] T768 [US4] Revalidación de la autoridad del creador en cada acceso (PET: rol efectivo; HOUSEHOLD: rol en el hogar y propiedad legal) y selector validado contra el conjunto vigente, con `/kid` — REQ-VET-011, INV-005-006; SC-005-037, SC-005-039, SC-005-048
- [ ] T769 [US4] Tope de 20 enlaces activos bajo candado (SQLite y PostgreSQL con conexiones intercaladas) y `ERR-SHARE-LINK-LIMIT` — REQ-VET-012; SC-005-038

---

## Phase 7: User Story 5 — ClinicalSummary (P1)

**Goal**: read-model determinista, vista web y versión imprimible.
**Independent Test**: `SC-005-027..033`, `SC-005-043..045` y `SC-005-047`.
**Bloqueos**: T702, T704 y T706.

- [ ] T770 [US5] Dominio `buildClinicalSummary` por allow-list y esquema cerrado (`clinical-summary.schema.json`); sin álbum ni datos privados — REQ-SUM-001, REQ-SUM-003, INV-005-004; SC-005-027, SC-005-029
- [ ] T771 [P] [US5] Pruebas de determinismo: mismos datos y reloj -> mismo JSON byte a byte, tras reordenar filas — REQ-SUM-002; SC-005-028
- [ ] T772 [US5] Caso de uso `GetClinicalSummary` (mascota o conjunto de hogar) con los repositorios existentes — REQ-SUM-001; SC-005-027
- [ ] T773 [P] [US5] Prueba de propiedades (orden de listas, fechas UTC, sin aleatoriedad) — REQ-SUM-002; SC-005-028
- [ ] T774 [US5] Pruebas de exclusión: álbum, avatar, correo, `username`, IDs de usuario/hogar, claves de objeto, nombres (`D5-06`), microchip (`D5-14`); campo nuevo de dominio no se filtra — REQ-SUM-003, INV-005-004; SC-005-029, SC-005-030
- [ ] T775 [US5] Vista web de solo lectura (sin formularios) en la ruta pública — REQ-SUM-004; SC-005-031
- [ ] T776 [US5] Vista previa autenticada del propietario (`D5-15`) con `includeMicrochip` e `includeClinicalFiles` — REQ-SUM-004; SC-005-031, SC-005-045
- [ ] T777 [US5] Hoja `@media print` (`@page { margin: 0 }`, sin nombres de archivo, etiqueta de hogar sin nombre) y botón «Imprimir / Guardar como PDF» sin dependencia nueva — REQ-SUM-005; SC-005-032, SC-005-047
- [ ] T778 [US5] Documentar el contrato del resumen como entrada de Fase 5 (versión, esquema cerrado, sin contacto) y verificar que `package.json` no cambió — REQ-SUM-006; SC-005-033
- [ ] T779 [US5] Rótulos de procedencia, aviso «no sustituye la consulta veterinaria» en la vista web, «Microchip no compartido por el cuidador» y ausencia de interpretación automática (`dataProvenance`, `automaticInterpretation`) — REQ-SUM-007, REQ-SUM-008; SC-005-043, SC-005-045

---

## Phase 8: Cierre

- [ ] T790 [GOV] `/oracle`: auditoría en disco por lote (hash, diff, contratos, pruebas) — todos los REQ; SC-005-001..033
- [ ] T791 [GOV] `/lock` y `/kid`: casos de borde de hogar compartido y enlace de hogar (EDGE-005-04, EDGE-005-05) — REQ-VET-002, REQ-VET-010; SC-005-017, SC-005-024
- [ ] T792 [GOV] `/trinity`: ejecución de la suite de explotación de la superficie pública y SAST; 0 hallazgos >= media — NFR-005-002; SC-005-026
- [ ] T793 [GOV] `/rama`: verificación posterior de registros, auditoría y exclusiones del resumen — NFR-005-001; SC-005-015, SC-005-022, SC-005-029
- [ ] T794 [GOV] `/sati`: revisión de accesibilidad a 320, 1024 y 1280 px de las 5 superficies — NFR-005-003; SC-005-010, SC-005-031
- [ ] T795 [N2] `/link`: runbook (cuota de enlaces, rotación de parámetros por SQL, revocación de emergencia) y revisión de `terraform plan` sin recursos de pago — NFR-005-004; SC-005-033
- [ ] T796 Compuertas finales: `bash scripts/verify-traceability.sh --feature 005`, `bash scripts/verify-oracles.sh --feature 005`, `npx tsc --noEmit`, `npm run test:gate`; `git diff package.json` vacío — NFR-005-004; SC-005-033
- [ ] T797 [GOV] Firma de Neo (Nivel 2): `COMPLETED` y despliegue; los agentes no marcan `[x]` — todos los REQ

---

## Tabla SC -> tareas

| SC | Tareas |
|---|---|
| SC-005-001 | T722, T726, T727, T730, T733 |
| SC-005-002 | T720, T723, T724, T725, T727 |
| SC-005-003 | T720, T724 |
| SC-005-004 | T710, T711, T712, T713, T714, T721, T724 |
| SC-005-005 | T721, T725, T726 |
| SC-005-006 | T721 |
| SC-005-007 | T730, T732 |
| SC-005-008 | T731, T735 |
| SC-005-009 | T731, T735 |
| SC-005-010 | T733, T734, T794 |
| SC-005-011 | T700, T706, T736 |
| SC-005-012 | T741, T742, T743, T744 |
| SC-005-013 | T740, T744 |
| SC-005-014 | T740 |
| SC-005-015 | T752, T754, T756, T766, T767, T793 |
| SC-005-016 | T750, T751, T755, T758, T765 |
| SC-005-017 | T755, T791 |
| SC-005-018 | T751, T753, T766 |
| SC-005-019 | T751, T757, T766, T767 |
| SC-005-020 | T750, T758, T759 |
| SC-005-021 | T750, T760, T761 |
| SC-005-022 | T762, T793 |
| SC-005-023 | T763 |
| SC-005-024 | T764, T766, T791 |
| SC-005-025 | T754, T756 |
| SC-005-026 | T703, T750, T765, T792 |
| SC-005-027 | T704, T770, T772 |
| SC-005-028 | T771, T773 |
| SC-005-029 | T770, T774, T793 |
| SC-005-030 | T774 |
| SC-005-031 | T775, T776, T794 |
| SC-005-032 | T705, T777 |
| SC-005-033 | T706, T778, T796 |
| SC-005-034 | T706, T723, T726 |
| SC-005-035 | T763, T775 |
| SC-005-036 | T750, T763 |
| SC-005-037 | T751, T755, T768 |
| SC-005-038 | T754, T769 |
| SC-005-039 | T751, T755, T768 |
| SC-005-040 | T754, T763, T767 |
| SC-005-041 | T750, T760, T761 |
| SC-005-042 | T762, T764, T795 |
| SC-005-043 | T775, T779 |
| SC-005-044 | T771, T773 |
| SC-005-045 | T776, T779 |
| SC-005-046 | T757, T767 |
| SC-005-047 | T777 |
| SC-005-048 | T754, T765, T768 |

## Dependencias y orden
- T700 -> T701..T708 -> T709; T708 desbloquea todo `src/`.
- Fase 2 (T710..T714) antes de T724. T766 antes de T751/T754.
- US5 dominio (T770..T774) antes de T758. US1, US2 y US3 son independientes entre sí tras T708.
- T790..T797 al final; T797 es exclusivo de Neo.

## Deuda técnica registrada
- `TECHDEBT-005-01`: el límite de tasa por IP en memoria no sobrevive a varias instancias; Cloud Armor sería la solución (Nivel 2, depende de `RR-07`/`TECHDEBT-004-06`).
- `TECHDEBT-005-02`: galería de hogar sigue diferida (`TECHDEBT-004-03`).
