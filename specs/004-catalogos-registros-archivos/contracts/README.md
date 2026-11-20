# Contratos de la Feature 004 (delta sobre la API 002 `3.0.0` → `3.1.0`)

**Estado**: `DRAFT` (enmienda única 2026-11-17; decisiones D-01..D-20 de Neo asentadas el mismo día). Este README es el **delta normativo**; los archivos JSON Schema y OpenAPI los crea `/architect` en T510..T512 (fase de contratos) siguiendo estas tablas y `x-sdd-metadata`/`x-sdd-error`. `src/generated/` solo se regenera con `bash scripts/compile-contracts.sh` (T515). El delta E-01..E-11 ya se aplicó al texto de `specs/002-plataforma-v21/spec.md` por orden de Neo (`D-10`); los **contratos máquina de la 002** (`schemas/`, `openapi/`, `errors/`) los edita `/architect` en T510 (esquemas), T511 (OpenAPI) y T512 (errores) siguiendo estas tablas, y T515 regenera `src/generated/` en el mismo paso (editarlos antes rompería la prueba de deriva de contratos). Hasta entonces la 004 los extiende por referencia.

Versión de la API: `3.1.0` (MINOR: campos opcionales, rutas nuevas, un error nuevo en una ruta existente). Respaldo: `schemaVersion` `3.1.0`; la importación acepta `3.0.0` y `3.1.0`. **Nota de compatibilidad (`D-16` A)**: exigir `If-Match` en `PATCH` es estrictamente incompatible para un cliente externo de `3.0.0`; se mantiene MINOR porque la única consumidora es la interfaz propia (se actualiza en el mismo despliegue); si aparece otro cliente de la API, la versión pasa a MAJOR.

## 1. Esquemas (delta)

| Esquema (002) | Cambio | Requisito |
|---|---|---|
| `Pet` / `PetProfile` | `+ breedCode` (`string\|null`, patrón único `^(DOG\|CAT)_[A-Z0-9_]{2,40}$` con prefijo igual a la especie, existe en el catálogo), `+ avatarVersion` (`integer\|null`, mínimo 1, **solo lectura**, derivado de `avatar_version`/`avatar_object_id`). `breed` se deriva con `breedCode` (rótulo; texto libre con `*_OTHER`). No existe `breedOther`. | REQ-RAZ-001..003, REQ-AVA-001 |
| `CreatePetInput`, `UpdatePetInput` | `+ breedCode`; `breed` pasa a opcional cuando hay `breedCode` (ausente o igual al rótulo; texto libre 1–60 con `*_OTHER`); `microchipId`: patrón `^\d{15}$` y rechazo de 15 dígitos iguales y de secuencias consecutivas. `avatarVersion` no se acepta como entrada. Regla cruzada de `INV-RAZ-001` en `x-sdd-invariants`. | REQ-RAZ-001..003, REQ-PET4-002 |
| `BodyMeasurementRecord` | sin cambio (`multipleOf: 0.01`: lee datos antiguos) | REQ-MDC-001 |
| `CreateBodyMeasurementInput`, `UpdateBodyMeasurementInput` | `neckCm`, `chestCm`, `backLengthCm`, `waistCm`: `multipleOf` `0.01` → `1` | REQ-MDC-001 |
| `CustomParameterRecord`, `CreateCustomParameterInput`, `UpdateCustomParameterInput` | `category` `+ SYMPTOM`; `+ symptomType` (`VOMIT\|APPETITE\|STOOL\|ENERGY\|null`), `+ severity` (`MILD\|MODERATE\|SEVERE\|null`); `if category = SYMPTOM then required [symptomType, severity] else both null`; `VOMIT` oculto para `RABBIT` y `SMALL_MAMMAL` es solo presentación (el contrato no lo impone, `D-17` A) | REQ-SIN-001, INV-SIN-001 |
| Los 6 `*Record` (`WeightRecord`, `BodyMeasurementRecord`, `VaccinationRecord`, `DewormingRecord`, `MedicalVisitRecord`, `CustomParameterRecord`) | `+ revision` (`integer`, mínimo 0, **solo lectura**; no se acepta como entrada; `D-16` A) | REQ-BOR-005 |
| `Username` | `pattern` `^[a-z0-9._-]+$` → `^[A-Za-z0-9._-]+$`; descripción: unicidad por `LOWER`, guardado tal como se escribió | REQ-LOG-002 |
| `LoginInput` | `username.maxLength` `30` → `254`; descripción: «usuario o correo» | REQ-LOG-001 |
| `AuditEntityType` | `+ PET_MEDIA`; 3.2.0 (*Enmienda 006, N2-06 a*): `+ HOME_SCENE`, `+ SCENE_CONSENT`, `+ HOUSEHOLD_PHOTO` (17 valores) | E-08; N2-06 a |
| `BackupEnvelope` | `schemaVersion` `3.1.0`; mascotas con `breedCode` (sin `avatarVersion`, que no viaja); parámetros con `symptomType`, `severity`; sin `revision` ni medios; la importación acepta `3.0.0` y `3.1.0` | REQ-SIN-001, REQ-RAZ-003, REQ-BOR-001, REQ-IMP-001 |
| `MediaItem` (nuevo) | `id` (UUID), `petId`, `kind` (`FILE\|PHOTO`), `mime` (lista cerrada de INV-ARC-001), `sizeBytes` (1–10 485 760), `originalName` (1–120 puntos de código), `createdAt`; `additionalProperties: false`; sin `objectKey` ni identificador de usuario | REQ-ARC-001, REQ-GCS-005 |
| `MediaAccess` (nuevo) | `url` (URI https), `expiresAt` (`IsoTimestamp`), `mime`; sin `disposition` (todo se sirve en línea, `D-06` C) | REQ-ARC-003 |
| `MediaPage` (nuevo) | `items: MediaItem[]` (<= 24), `page` (>= 1), `pageSize` (const 24), `total` (>= 0). *Enmienda 005, D5-01*: sin cambio de valores (`maxItems 24`, `const 24`); la página de 24 aplica a `kind = FILE` y a fotos heredadas por encima del tope de álbum de la 005 | REQ-ALB-001 |
| `ImportPreviewResult` (existente, 002) | `+ mediaToDeleteCount` (`integer`, mínimo 0: archivos, fotos y avatares de las mascotas que el reemplazo elimina; `D-15` A) | REQ-IMP-001 |

## 2. Rutas (delta del OpenAPI)

| Método y ruta | operationId | Permiso (E-06) | Respuestas | Requisito |
|---|---|---|---|---|
| `POST /pets/{petId}/media?kind=FILE\|PHOTO` (`D-18` A: cuerpo crudo `application/octet-stream`, nombre en la cabecera `X-Argos-Filename` codificado con `encodeURIComponent`; cabecera CSRF; cero dependencias multipart) | `uploadMedia` | `WRITE_MEDIA` | 201 `MediaItem`; 400 (cuerpo truncado), 401, 403, 404, 409 (cuota), 413, 415, 422, 429 (subidas simultáneas), 500, 502 | REQ-ARC-001 |
| `GET /pets/{petId}/media?kind=&page=` (*Enmienda 005, D5-01*: 24 por página para `FILE` y fotos heredadas por encima del tope) | `listMedia` | `READ_MEDIA` | 200 `MediaPage`; 401, 404, 422 | REQ-ALB-001 |
| `GET /pets/{petId}/media/{mediaId}/access` | `getMediaAccess` | `READ_MEDIA` | 200 `MediaAccess` (`Cache-Control: no-store`); 401, 404, 502 (`no-store`) | REQ-ARC-003 |
| `DELETE /pets/{petId}/media/{mediaId}` | `deleteMedia` | `DELETE_MEDIA` | 204 (siempre tras el `COMMIT`); 401, 403, 404. Sin 502 | REQ-GCS-004 |
| `PUT /pets/{petId}/avatar` (cuerpo crudo `image/jpeg`, `image/png` o `image/webp`, <= 524 288 bytes) | `putAvatar` | «Editar datos básicos» | 200 `{avatarVersion}`; 401, 403, 404, 413, 415, 502 | REQ-AVA-001 |
| `GET /pets/{petId}/avatar?v=` | `getAvatar` | `READ_MEDIA` | 200 imagen (con `v` actual: `Cache-Control: private, max-age=31536000, immutable` y `Vary: Cookie`; con `v` ausente o distinto: `no-cache`); 401, 404 (`no-store`; sin avatar `ERR-MEDIA-NOT-FOUND`), 502 (`no-store`) | REQ-AVA-001 |
| `DELETE /pets/{petId}/avatar` | `deleteAvatar` | «Editar datos básicos» | 204; 401, 403, 404, 502 | REQ-AVA-001 |
| `DELETE /pets/{petId}/records/{collection}/{recordId}` (existente) | `deleteRecord` | sin cambio | `+ 409` `ERR-REC-SUPERSEDED-IMMUTABLE`; el borrado es **físico** con la auditoría `DELETE` en la misma transacción (`D-11` A); un segundo borrado o el borrado simultáneo perdedor da `ERR-PET-NOT-FOUND` | REQ-BOR-001, REQ-BOR-002, REQ-BOR-005 |
| `PATCH /pets/{petId}/records/{collection}/{recordId}` (existente) | `updateRecord` | sin cambio | cabecera `If-Match: "<revision>"` **obligatoria** (ausente ⇒ `ERR-SCHEMA-VALIDATION-FAILED`, campo `If-Match`); `+ 409` `ERR-REC-CONFLICT` (revisión desactualizada); `+ 409` `ERR-REC-SUPERSEDED-IMMUTABLE` si la edición dejaría al propio registro `SUPERSEDED`; la respuesta trae la `revision` nueva | REQ-BOR-003, REQ-BOR-005 |
| `POST /backup/import/preview` (existente) | `previewBackupImport` | sin cambio | 200 `ImportPreviewResult` con `mediaToDeleteCount` | REQ-IMP-001 |
| `POST /auth/login` (existente) | `login` | público | cuerpo con usuario o correo (el servidor lo recorta); mismos errores genéricos y una sola verificación de hash | REQ-LOG-001 |

No hay ruta de catálogo de razas: `breeds.catalog.json` se compila a `src/generated/catalogs/` y lo consumen cliente y servidor (ADR-004-03).

## 3. Errores (delta del catálogo)

| Código | HTTP | Cuándo | Requisito |
|---|---|---|---|
| `ERR-MEDIA-TOO-LARGE` | 413 | `size_bytes > ARGOS_MEDIA_MAX_BYTES` o avatar > 524 288 | REQ-ARC-001, REQ-AVA-001 |
| `ERR-MEDIA-TYPE-NOT-ALLOWED` | 415 | firma fuera de lista (solo JPEG, PNG, WebP y PDF; DOCX, XLSX y TXT incluidos, `D-06` C), SVG/HTML, 0 bytes, `kind` incompatible, avatar que no es JPEG, PNG ni WebP | REQ-ARC-001, INV-ARC-002 |
| `ERR-MEDIA-QUOTA-EXCEEDED` | 409 | 1 GiB por propietario (*Enmienda 005, D5-02*: el tope de fotos de álbum NO usa este código; usa `ERR-MEDIA-ALBUM-LIMIT`, definido en el catálogo incremental de la 005, no en éste) | REQ-ARC-005 |
| `ERR-MEDIA-NOT-FOUND` | 404 | medio inexistente o de otra mascota (la mascota inexistente o sin acceso sigue siendo `ERR-PET-NOT-FOUND`) | REQ-ARC-002 |
| `ERR-MEDIA-STORAGE-UNAVAILABLE` | 502 | GCS o `signBlob` no responden en `uploadMedia`, `getMediaAccess` y las 3 operaciones del avatar (con `Cache-Control: no-store`); nunca en `deleteMedia` (la cola garantiza el borrado) | REQ-GCS-004, REQ-ARC-003 |
| `ERR-PET-MICROCHIP-DUPLICATE` (existente, `pendingIds` en 002) | 409 | duplicado propio o ajeno, cuerpo idéntico y misma ruta; `detail`: «Este microchip ya está registrado en ARGOS. Si es tuyo, contacta al administrador.» | REQ-PET4-001 |
| `ERR-RATE-LIMITED` | 429 | cuota propia del usuario agotada en el ámbito `MICROCHIP_DUPLICATE` (ventana deslizante de 24 h, 5 eventos, ADR-004-04; chequeo previo sin consultar la existencia del microchip); subida con el límite de subidas simultáneas por instancia alcanzado | REQ-PET4-002, REQ-ARC-001 |
| `ERR-REC-CONFLICT` (nuevo, `D-16` A) | 409 | `If-Match` con una `revision` desactualizada | REQ-BOR-005 |
| `ERR-REC-SUPERSEDED-IMMUTABLE` (existente) | 409 | edición **o borrado** de `SUPERSEDED` | REQ-BOR-002 |
| `ERR-AUTH-USERNAME-TAKEN` (existente, 001) | 409 | colisión por `LOWER(username)` | REQ-LOG-002 |

Todos con `type` `urn:argos:error:<CODE>` (RFC 9457), `requirementRef` y sin datos de terceros en `detail`.

## 4. Catálogo

`catalogs/breeds.catalog.json`: 68 entradas (42 perros y 22 gatos más Criolla y Otra por especie), `catalogVersion 0.1.0`, `status DRAFT`, revisado por `/maggie` el 2026-11-17 (rótulos de Pitbull, Mastín, Galgo, Angora Turco, Schnauzer y Tonkinés corregidos); pendiente de veterinario humano (`PE-03`). Reglas: `code` con patrón único `^(DOG|CAT)_[A-Z0-9_]{2,40}$` y prefijo igual a la especie (lo valida `compile-contracts.sh`, `SC-CAT-032`); `code` inmutable y nunca reutilizado; `deprecated` en lugar de borrar; `order` 1 = Criolla, 10, 20, ... alfabético sin tildes, 9999 = Otra; el `order` se recalcula al compilar y no es contrato estable para altas futuras (`TECHDEBT-004-05`).
