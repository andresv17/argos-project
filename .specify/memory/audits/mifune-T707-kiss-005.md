# Mifune T707 — Filtro KISS sobre la feature 005 (rama 005-album-archivos-clinicos, HEAD 67efea8)

Fecha: 2026-11-18. Solo propuestas; no se editó spec, contratos, src ni tests. Todo lo marcado PENDIENTE NEO toca una decisión D5-* firmada o un requerimiento explícito de Neo: no se aplica sin su firma.

Veredicto global: la spec es sólida y los contratos están cerrados. El peso real no está en capas innecesarias (la arquitectura hexagonal reutiliza puertos de 004) sino en **tres superficies opcionales** (alcance HOUSEHOLD, archivos clínicos por el enlace, auditoría de accesos con HMAC rotado) que concentran ~60 % del riesgo y de las tareas. Las opciones de recorte van primero; los ajustes de implementación (sin tocar contratos) después.

## Resumen priorizado

| ID | Sev. | Propuesta | Neo |
|---|---|---|---|
| MIF-005-01 | ALTA | Diferir el alcance HOUSEHOLD a 006 (6 de 10 operaciones, D5-05/D5-19/B3) | PENDIENTE NEO |
| MIF-005-02 | ALTA | Diferir archivos clínicos por enlace (ruta 2, `fileLabels`, URL firmada pública) a 006 | PENDIENTE NEO |
| MIF-005-03 | MEDIA | Auditoría: no escribir fila por cada ACCESS_OK; fail-closed solo en CREATED/REVOKED | PENDIENTE NEO |
| MIF-005-04 | MEDIA | Una sola implementación para las 3 lecturas (resumen público, archivos, vista previa) | No |
| MIF-005-05 | MEDIA | Quitar la caché TTL 60 s de `PlatformParameterPort` | PENDIENTE NEO |
| MIF-005-06 | MEDIA | Diferir vista previa de HOUSEHOLD (si no se acepta 01) | PENDIENTE NEO |
| MIF-005-07 | BAJA | `platform_parameters`: quitar `min_value`/`max_value`/`value_type` sin consumidor | No |
| MIF-005-08 | BAJA | Máquina: `EXPIRED -> REVOKED` pasa a no-op idempotente (quita una transición) | No (ajuste de contrato) |
| MIF-005-09 | BAJA | `hashToken` en dominio con `node:crypto`; puerto solo para generar | No |
| MIF-005-10 | BAJA | `ShareLinkView.revokedAt` y columna `expires_in_days` sin consumidor | No |
| MIF-005-11 | BAJA | Rotación trimestral de la clave HMAC de IP y `ip_key_version`: diferir mecanismo | PENDIENTE NEO |
| MIF-005-12 | BAJA | Límite de tasa: Map simple con barrido, no estructura con expulsión del más antiguo | No |

## Propuestas

### MIF-005-01 (ALTA, PENDIENTE NEO) — Diferir alcance HOUSEHOLD a 006
- Dónde: `spec.md` L102-103 (REQ-VET-001/002), L111-112 (REQ-VET-010/011), EDGE-005-04, SC-005-017/039/048; `share-links.openapi.yaml` L109 (`createHouseholdShareLink`), L148 (`listHouseholdShareLinks`), L221 (`previewHouseholdClinicalSummary`); `data-model.md` L36-40 (columna `household_id`, CHECK de alcance, índice `share_links_household_active`); `share-link.machine.json` L38-39 (`resolvedPetSet` dinámico).
- Por qué: es la parte más cara del modelo: conjunto dinámico por consulta, autoridad por rol-en-hogar distinta de rol-por-mascota (B3), propiedad legal cruzada (D5-19), revalidación de autoridad por hogar, tope de 20 por hogar, cascada por hogar. Produce 3 de las 10 operaciones y la mayoría de las pruebas de aislamiento (SC-005-016/017/039/048). Una mascota = el caso de uso real de "mándale esto a mi veterinario"; el veterinario pedirá varias mascotas en 006 si hay demanda.
- Se conserva: REQ-VET-001..013 para `PET`, INV-005-001..009, STATE-SHARE-001 (no cambia), SC-005-015/016/018..026/037/038.
- Costo de aceptar: contradice el requerimiento 4 de Neo («mascota u hogar»); D5-05/D5-19 quedarían sin efecto en 005. Reduce de 10 a 7 operaciones. Decisión de producto, no la tomo yo.

### MIF-005-02 (ALTA, PENDIENTE NEO) — Diferir archivos clínicos por enlace a 006
- Dónde: `spec.md` L110 (REQ-VET-009), L125/EDGE-005-09, D5-06/D5-21/D5-23, INV-005-008, SC-005-023/035/036/040; `share-links.openapi.yaml` L289 (`getSharedFile`); `share-link.schema.json` (`FileLabel`, `fileLabels`, `includeClinicalFiles`); ADR-005-06 y ADR-005-07 de `plan.md`.
- Por qué: es la única razón de la segunda ruta pública, de la URL firmada sin sesión (TTL duro 300 s), del canal `fileLabels` con nombre original escapado, de la ventana residual tras revocar, de un campo inmutable más y de las pruebas de nombre fuera de la traza. Sin ella la superficie pública es **una** ruta GET sin escritura que toca GCS: el análisis de `/trinity` y `/rama` cae a la mitad. El resumen JSON (REQ-SUM-001) ya lista `clinicalFiles` como `{id, mime, sizeBytes, createdAt}` y se puede conservar o recortar.
- Se conserva: todo REQ-VET salvo 009; REQ-SUM-001..008 salvo `clinicalFiles`/`disclosure.clinicalFilesIncluded`; REQ-CLI5-001 (el panel «Archivos» del cuidador no depende del enlace).
- Costo: el veterinario no ve radiografías por el enlace en 005 (D5-06 y D5-21 firmadas se reabren). Alternativa intermedia sin firma nueva: mantener `clinicalFiles` como conteo/metadatos en el resumen y diferir solo descarga y `fileLabels`.

### MIF-005-03 (MEDIA, PENDIENTE NEO) — Auditoría de accesos más delgada
- Dónde: `spec.md` L109 (REQ-VET-008), L114 (REQ-VET-013), SC-005-022; `data-model.md` §4 L66-74 (`share_link_audit`, `fail_count`, agregación).
- Por qué: hoy cada GET exitoso escribe una fila y es **fail-closed** (si la auditoría falla, no se sirve). Convierte una ruta de solo lectura en una ruta con escritura de BD por petición pública (amplificación de costo y DoS si la BD se degrada) y obliga a la excepción «ningún estado de BD distinto de la auditoría» de INV-005-002. Propuesta: auditar `CREATED`/`REVOKED` (transaccional, ya existe) y `ACCESS_OK` solo como última fecha de acceso agregada o por muestreo; mantener la agregación de fallos que ya limita costo; fail-closed solo donde hay transacción.
- Se conserva: REQ-VET-008 para eventos de gestión, INV-005-009 (sin token en traza), límite de tasa D5-13.
- Costo: pierde la traza exacta de cada acceso exitoso (valor forense para `/rama`). D5-20 (retención) firmada; aplicar solo con firma.

### MIF-005-04 (MEDIA, sin decisión) — Un solo camino para resumen público, archivos y vista previa
- Dónde: `plan.md` L55-56 (`ResolveShareLink`, `GetSharedSummaryView`, `GetSharedFile`, `PreviewClinicalSummary`); `share-links.openapi.yaml` L194, L221, L248, L289.
- Por qué: hay cuatro casos de uso y tres controladores que arman el mismo `SharedSummaryView`. Instrucción para Keymaker: `ResolveShareLink` devuelve `{petIds, includeMicrochip, includeClinicalFiles, expiresAt}` y es lo único que cambia entre ramas; `GetSharedSummaryView(petIds, opts, generatedAt)` es una función única que usan la ruta pública y las dos vistas previas (la vista previa solo cambia de autorizador y `validUntil = null`); `GetSharedFile` reutiliza `ResolveShareLink` sin construir el resumen. Un único handler parametrizado por alcance para los pares create/list y preview PET/HOUSEHOLD (mismo caso de uso, dos rutas finas).
- Se conserva: los 10 operationId y ninguna garantía; no se fusionan operaciones en el OpenAPI porque el alcance sale de la ruta por seguridad (INV-005-001, A-03) y fusionar `POST /share-links` con `scope` en el cuerpo lo rompería.
- Lo que sí se debe prohibir: construir el resumen completo para validar un `mediaId`.

### MIF-005-05 (MEDIA, PENDIENTE NEO) — Sin caché de 60 s del parámetro
- Dónde: `spec.md` L92 (REQ-PRM-002, D5-07), L81 (excedente transitorio, INV-005-003 con `max(tope, conteo previo)`); `data-model.md` §2.
- Por qué: leer una fila por clave primaria en una subida (operación ya con candado, escritura a GCS y varias consultas) cuesta nada; la caché añade estado en memoria, TTL, invalidación en pruebas y la ventana de «excedente transitorio» que hay que documentar y probar. Sin caché, el parámetro cambia ya (SC-005-004 más simple) y la cláusula de excedente desaparece.
- Se conserva: REQ-PRM-001..003, REQ-ALB5-002, INV-005-003. Costo: reabre D5-07 (firmada).

### MIF-005-06 (MEDIA, PENDIENTE NEO) — Vista previa HOUSEHOLD, solo si se rechaza MIF-005-01
- Dónde: `share-links.openapi.yaml` L221; `spec.md` L121 (D5-15, B-3 de sati).
- Por qué: si el alcance hogar sigue en 005, la vista previa del hogar es el recorte barato: la previsualización de mascota cubre el caso común; el hogar mostraría lo mismo repetido. Queda 9 operaciones y se conserva D5-15 para `PET`.

### MIF-005-07 (BAJA) — `platform_parameters`: columnas sin consumidor
- Dónde: `data-model.md` L22-23 (`min_value`/`max_value` «informativos para la futura UI»), `value_type`.
- Por qué: el rango y el defecto ya viven en el catálogo del código (`plan.md` L51); la BD solo guarda `value`. Columnas especulativas para una UI que REQ-PRM-003 declara fuera. Mantener `key`, `value`, `description`, `updated_at`, `updated_by_user_id` (este último lo pidió Neo). Se conserva REQ-PRM-001..003. No toca contratos de 004; sí `data-model.md` de 005.

### MIF-005-08 (BAJA) — Transición `EXPIRED -> REVOKED`
- Dónde: `share-link.machine.json` L83-89.
- Por qué: la máquina tiene ya el mínimo (3 estados derivados; REVOKED y EXPIRED deben seguir separados por SC-005-019 y la lista). Lo único prescindible es revocar un enlace ya vencido solo para «listar REVOKED antes de la purga»: sin consumidor real. Propuesta: `DELETE` sobre vencido = 204 idempotente sin escribir ni auditar, y sigue VENCIDO. Se conserva REQ-VET-005 y REQ-VET-010..013. Cambio de contrato: lo aplica Architect, no yo.

### MIF-005-09 (BAJA) — `hashToken` por puerto
- Dónde: `plan.md` L49 («`hashToken` recibe el digest por puerto»), L54 (`TokenGeneratorPort`).
- Por qué: `createHash('sha256')` es determinista y sin E/S; no necesita puerto. Solo la generación aleatoria (`randomBytes`) merece puerto por testabilidad. Se conserva REQ-VET-003 e INV-005-005.

### MIF-005-10 (BAJA) — Campos sin consumidor
- `ShareLinkView.revokedAt` (`share-link.schema.json` L94, L136): la lista pinta `status`; ningún requisito muestra la fecha de revocación. Si la UI de `/sati` no la usa, quitar.
- Columna `expires_in_days` (`data-model.md` L41): la vista expone `expiresAt`; la columna solo existe por RAMA-005-009 (CHECK de enumeración). El CHECK equivalente es `expires_at - created_at` en {1,7,30} días o validación de dominio; confirmar con `/rama` antes de quitar. Se conserva REQ-VET-004.
- Se verifican con consumidor y se mantienen: `validUntil` (MAG-005-008), `disclosure` (mensaje «Microchip no compartido»), `activeCount`/`maxActiveLinks` (REQ-VET-012), `dataProvenance`/`automaticInterpretation` (constantes baratas exigidas por Maggie).

### MIF-005-11 (BAJA, PENDIENTE NEO) — Rotación de clave de IP
- Dónde: `spec.md` L109, L114 (D5-20), `data-model.md` L72 (`ip_key_version`).
- Por qué: con auditoría de 90 días y rotación trimestral hay que operar versionado de claves desde el primer día. Alternativa: clave única en Secret Manager en 005 y rotación + `ip_key_version` en 006. Reabre D5-20.

### MIF-005-12 (BAJA) — Límite de tasa en memoria
- Dónde: `spec.md` L108 (D5-13, TECHDEBT-005-01).
- Por qué: «mapa acotado con expulsión del más antiguo» es una estructura a medida; con Cloud Run multiinstancia es una mitigación parcial de todos modos. Basta un `Map` con barrido de ventanas vencidas y tope duro de entradas (rechazar con 429 si se llena, o vaciar). Se conserva REQ-VET-007; Cloud Armor sigue diferido.

## Qué NO recortar (verificado, con requisito)
- Dos puertos nuevos de BD (`platform_parameters`, `share_links`) y migraciones Nivel 2: necesarios para REQ-PRM-001 y REQ-VET-003/012.
- `getAlbumLimits` (REQ-ALB5-005): sin él la interfaz cablearía «10» y `MediaPage` es LOCKED.
- 404 uniforme, `instance` constante, cabeceras en toda respuesta, secuencia de puertos sin salida anticipada, comprobación del tope tras el candado: son el control de INV-005-001/007 y de la carrera EDGE-005-02; no son sobreingeniería.
- `buildClinicalSummary` por allow-list con esquema cerrado (INV-005-004, SC-005-030) y `FormActions` compartido (REQ-CAN-001): ya son lo mínimo.
- Los 10 operationId como están (no hay fusión segura): ver MIF-005-04.
- Sin PDF en servidor, sin dependencias, sin rol de administrador: ya diferidos correctamente.

## Candidatos a 006 que no rompen aceptación de 005
HOUSEHOLD (01), descarga de archivos por enlace (02), vista previa de hogar (06), rotación de clave HMAC (11), Cloud Armor (ya TECHDEBT-005-01), uso de cuota visible (ya diferido).

## Escalamiento
TO: Neo (Andrés Vallejo — Level 2): decidir MIF-005-01, 02, 03, 05, 06 y 11 (cada uno reabre una D5-* firmada o el requerimiento 4). Mientras tanto, Keymaker debe seguir los contratos tal como están; solo MIF-005-04, 07, 09, 10 y 12 son aplicables sin firma nueva (07/10 tocan `data-model.md`/esquemas: los aplica Architect).
