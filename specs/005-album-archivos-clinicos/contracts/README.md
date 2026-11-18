# Contratos de la Feature 005 (delta incremental sobre la API 004 `3.2.0` → `3.3.0`)

**Estado**: `DRAFT` (T706, 2026-11-18; decisiones D5-01..D5-24 de Neo asentadas; revisión T707 del mismo día: brechas EDGE de `/lock` y podas de `/mifune` sin decisión de Neo, ver §9). Los contratos de la 004 y de la 002 son `LOCKED` y **no se editan** (salvo las enmiendas de texto firmadas del punto 7). Este directorio es **incremental**: contiene solo lo nuevo y referencia lo heredado por `$ref`. `src/generated/` **no** se regenera todavía (no hay generador de 005; ver §6, diseño).

Versión de la API: `3.3.0` (MINOR: 10 operaciones nuevas, ninguna existente cambia). `media.schema.json` de la 004 **conserva** `MediaPage.maxItems 24` y `pageSize const 24` (D5-01): la página de 24 sigue valiendo para `kind = FILE` y para mascotas con fotos heredadas por encima del tope.

## 1. Esquemas (`schemas/`)

| Archivo | Contenido | Requisito |
|---|---|---|
| `clinical-summary.schema.json` | `ClinicalSummary` (`summaryVersion` `1.0.0`): allow-list cerrada, `additionalProperties: false` en todo objeto, cotas explícitas. `dataProvenance` (`const CAREGIVER_REPORTED_NOT_VERIFIED`) y `automaticInterpretation` (`const NONE`) hacen explícitas la procedencia y la ausencia de interpretación (MAG-005-001/003). Fechas de calendario con `IsoDate` (`YYYY-MM-DD`, sin UTC); UTC solo en `generatedAt` y `createdAt` de archivos (MAG-005-004). `microchipId` **ausente** salvo `disclosure.microchipIncluded`. `clinicalFiles[]` = `{id, mime, sizeBytes, createdAt}`: **sin nombre original**, sin clave ni URL | REQ-SUM-001..003, 006..008, INV-005-004, INV-005-009 |
| `share-link.schema.json` | `CreateShareLinkInput` (`expiresInDays` ∈ {1,7,30}, `includeMicrochip`, `includeClinicalFiles`), `ShareLinkView`, `CreateShareLinkResult` (única aparición de la URL con el token), `CreateShareLinkReplay` (200 de un reintento idempotente, sin URL), `IdempotencyKey`, `ShareLinkList` (`activeCount`, `maxActiveLinks` 20), `FileLabel` y **`SharedSummaryView`** `{summary, fileLabels[{fileId, displayName}], validUntil}` | REQ-VET-001..005, 009, 011, 012, REQ-SUM-004 |
| `album.schema.json` | `AlbumLimits {photoCount, maxPhotosPerPet}` | REQ-ALB5-002, REQ-ALB5-005 |
| `platform-parameter.schema.json` | fila `PlatformParameter` (`key`, `value`, `description`, `updatedAt`, `updatedByUserId`; sin tipo ni límites en BD, MIF-005-07), claves conocidas y valores por defecto, tipo y rango solo en código | REQ-PRM-001..003 |

**Canal contractual del nombre original (B1 de `/merovingian`)**: el nombre NO entra en `ClinicalSummary` (REQ-SUM-003, REQ-SUM-006: entrada de IA de la Fase 5 sin PII). Viaja solo en el envoltorio cerrado `SharedSummaryView.fileLabels`, que arma un caso de uso de aplicación **después** de resolver el token, leyendo `pet_media.original_name` solo de los `clinicalFiles` ya autorizados por el alcance (nunca desde el read-model, nunca por la ruta de descarga). Se inserta como texto escapado; no va en `<title>`, URL, cabeceras, registros, auditoría ni `Content-Disposition`, ni en la hoja impresa (D5-23).

## 2. Rutas (`openapi/share-links.openapi.yaml`)

| Método y ruta | operationId | Autoridad | Respuestas | Requisito |
|---|---|---|---|---|
| `GET /pets/{petId}/album/limits` | `getAlbumLimits` | `READ_MEDIA` | 200 `AlbumLimits`; 401, 404 | REQ-ALB5-005 |
| `POST /pets/{petId}/share-links` | `createPetShareLink` | `CREATE_SHARE_LINK` (rol efectivo OWNER/ADMIN) | cabecera `Idempotency-Key` obligatoria; 201 `CreateShareLinkResult` (`no-store`) o 200 `CreateShareLinkReplay` (reintento, sin URL); 401, 403, 404, 409 `ERR-SHARE-LINK-LIMIT`, 422 | REQ-VET-001, 012 |
| `GET /pets/{petId}/share-links` | `listPetShareLinks` | ídem | 200 `ShareLinkList`; 401, 403, 404 | REQ-VET-001, 005 |
| `POST /households/{householdId}/share-links` | `createHouseholdShareLink` | `CREATE_SHARE_LINK` con el **rol del usuario en ese hogar** (propietario o ADMIN ACTIVE), conjunto = mascotas asignadas ahora **y** propias del creador | `Idempotency-Key` obligatoria; 201 o 200 (reintento); 401, 403 (incluye conjunto vacío), 404, 409 (conteo bajo el candado del **hogar**), 422 | REQ-VET-001, 002, 011 |
| `GET /households/{householdId}/share-links` | `listHouseholdShareLinks` | ídem | 200; 401, 403, 404 | REQ-VET-001, 005 |
| `DELETE /share-links/{shareLinkId}` | `revokeShareLink` | creador, propietario legal (PET) o propietario/ADMIN del hogar | 204 idempotente (marca `revoked_at`, **no borra**; un enlace ya vencido es no-op sin escritura); 401, 404 `ERR-SHARE-NOT-FOUND` | REQ-VET-005 |
| `GET /pets/{petId}/clinical-summary?includeMicrochip&includeClinicalFiles` | `previewPetClinicalSummary` | `CREATE_SHARE_LINK`; ajena = 404; no crea token | 200 `SharedSummaryView` (`validUntil` null); 401, 403, 404, 422 | REQ-SUM-004 (D5-15, B-3) |
| `GET /households/{householdId}/clinical-summary?...` | `previewHouseholdClinicalSummary` | ídem (rol en el hogar) | 200; 401, 403, 404, 422 | REQ-SUM-004, REQ-VET-002 |
| `GET /shared/{token}/summary` (pública) | `getSharedSummary` | token; sin cookie, sin CSRF | 200 `SharedSummaryView`; **404 uniforme**; 429 | REQ-VET-006, 007, SUM-004 |
| `GET /shared/{token}/files/{mediaId}` (pública) | `getSharedFile` | token + `mediaId` ∈ alcance, `kind FILE`, enlace con archivos | 302 a URL firmada V4 (TTL ≤ min(300 s, restante)); **404 uniforme**; 429; 502 | REQ-VET-009, INV-005-001, 002 |

Notas normativas de la superficie pública:

1. **Token en la ruta** (D5-16, firmado por Neo). Mitigaciones obligatorias en el contrato: `instance` constante `"/shared"` en todo `ProblemDetails` de la ruta (nunca la ruta con el token), `Referrer-Policy: no-referrer`, `Cache-Control: no-store`, `X-Robots-Tag: noindex, nofollow, noarchive`, `X-Content-Type-Options: nosniff` y CSP restrictiva en **toda** respuesta (200, 302, 404, 429, 5xx); serializer de registros sin URL (se registra la plantilla `/shared/:token/...` o solo `reqId`); TTL máximo de 30 días con opciones 1/7/30. El **filtro de Cloud Logging** para `httpRequest.requestUrl` que contenga `/shared/` lo ejecuta `/link` (IaC; si no se aplica, el token queda en `run.googleapis.com/requests` durante la retención del sumidero y se documenta como riesgo residual).
2. **Dos rutas públicas, no una**: el resumen y la descarga (opción B de RAMA-005-002 / A-02 de `/trinity`). La página HTML `/shared/{token}` es la SPA sin datos (mismas cabeceras) y **no resuelve** el token. Cualquier otro verbo (incluidos `HEAD` y `OPTIONS`) responde el mismo 404 sin resolver.
3. **Indistinguibilidad** (`INV-005-007`): token inexistente, mal formado (longitud, alfabeto, también el parámetro de más de 100 caracteres y la URL mal codificada que Fastify rechazaría con su propio 404 o 400: se normalizan a este 404 y cuentan como fallo, EDGE-005-25; prohibido devolver el token o la plantilla de ruta del framework), vencido, revocado, creador sin autoridad, alcance vacío, mascota retirada, `mediaId` ajeno o `PHOTO` o enlace sin archivos producen cuerpo, código, cabeceras y secuencia de llamadas a puertos idénticos, y cada uno cuenta como fallo (D5-13: 20 fallos en 10 minutos por IP efectiva; al 21.º, 429 con `Retry-After: 600`, sin escritura de BD).
4. **Lectura en una sola transacción de solo lectura con aislamiento explícito** (RAMA-005-010, EDGE-005-14; PostgreSQL `REPEATABLE READ READ ONLY`, SQLite sobre WAL) y **un único `ClockPort.now()` por petición** (EDGE-005-24): token, vigencia, revocación, autoridad vigente del creador (D5-17) y conjunto de mascotas se resuelven juntos y sin caché; sin instantánea persistente.
5. **Fail-closed**: si la escritura de la auditoría de un acceso válido falla, no se sirve el resumen (500 genérico, sin detalle).

## 3. Errores (`errors/error-catalog.json`, **incremental**, B2 de `/merovingian`)

| Código | HTTP | Cuándo | Requisito |
|---|---|---|---|
| `ERR-MEDIA-ALBUM-LIMIT` | 409 | subida de `PHOTO` con la mascota en `maxPhotosPerPet` o por encima; no consume cuota ni deja objeto | REQ-ALB5-002, 003 |
| `ERR-SHARE-LINK-LIMIT` | 409 | ya hay 20 enlaces activos para ese alcance | REQ-VET-012 |
| `ERR-SHARE-NOT-FOUND` | 404 | superficie pública (todos los fallos, incluidas las respuestas del framework normalizadas) y revocación de un enlace sin autoridad | REQ-VET-005, 007, 011 |
| `ERR-SHARE-RATE-LIMITED` | 429 | 21.º fallo en 10 minutos por IP efectiva | REQ-VET-007 |

Heredados sin cambio de la 004: `ERR-ACC-FORBIDDEN`, `ERR-PET-NOT-FOUND`, `ERR-HOUSE-NOT-FOUND`, `ERR-SCHEMA-VALIDATION-FAILED`, `ERR-MEDIA-QUOTA-EXCEEDED`, `ERR-MEDIA-TYPE-NOT-ALLOWED`, `ERR-MEDIA-STORAGE-UNAVAILABLE`, `ERR-AUTH-CSRF-REJECTED`, `ERR-INTERNAL-UNEXPECTED`. Todos con `type` `urn:argos:error:<CODE>`. `ProblemDetails` (cerrado, LOCKED en `common.schema.json`) **no admite miembros de extensión**: por eso `maxPhotosPerPet` se expone por `getAlbumLimits` y no dentro del 409 (B-1 de `/sati`).

## 4. Máquina de estados (`state-machines/share-link.machine.json`, `STATE-SHARE-001`)

Estado **derivado** (`REVOKED` > `EXPIRED` > `ACTIVE`) de `revoked_at` y `expires_at` con el reloj inyectado; regla de resolución uniforme, tope de 20 activos, retención (auditoría de accesos 90 días, enlaces vencidos o revocados 30 días, HMAC de IP con clave rotada trimestralmente) y limpieza en cascada.

## 5. Decisiones de contrato (ADR breves)

- **Envoltorio frente a render en servidor**: se elige `SharedSummaryView` JSON porque la SPA ya existe, el nombre se escapa como texto por el framework y un solo contrato sirve a la vista pública y a la vista previa. Descartado: HTML servido por la ruta con negociación (duplica contrato y plantillas).
- **Ruta de archivos con redirección 302 frente a URL incrustadas**: incrustar N URL firmadas por lectura multiplica las firmas (`signBlob`) y alarga su ventana; la redirección firma bajo demanda tras re-resolver el token.
- **Estado derivado sin columna**: evita deriva entre columna y reloj; costo: ninguno (índice por `token_hash`).
- **`getAlbumLimits` aparte**: `MediaPage` y `ProblemDetails` son cerrados y `LOCKED`; ampliar cualquiera sería MAJOR de 004.

## 6. Compilación (diseño de texto; NO ejecutado en T706)

`scripts/compile-contracts.sh` hoy admite `001|002|003|004` y escribe `src/generated/v31/` para la 004 con **un** catálogo. Diseño para `--feature 005` (lo implementa `/keymaker` tras T708, tarea de Nivel 2 porque toca la compuerta):
1. Rama `005` con su lista `CONTRACT_FILES` (los 4 esquemas, el OpenAPI, el catálogo y la máquina) y destino `<out>/v33/` (nunca `v31`, `api`, `errors`, `machines`, `schemas`, `ops`, `catalogs`); añadir `v33` a la lista `foreign` de las ramas 001/002 para conservarlo al recompilar.
2. El catálogo incremental se **fusiona** con el de la 004 al compilar: se generan `v33/errors/error-codes.ts` solo con los 4 códigos nuevos y el mapa de ejecución une `v31` y `v33`; la compilación **falla** si un código existe en ambos catálogos o si una referencia `inherited` no existe en el de la 004.
3. `x-sdd-metadata` de los esquemas de 005 se valida con las mismas reglas que las de 004 (`version`, `status`, `traceability`).
4. `contracts-004-errors.spec.ts` no cambia (la lista cerrada de `ERR-MEDIA-*` de la 004 sigue igual): ventaja del catálogo incremental.

## 7. Enmiendas de texto firmadas (aplicadas en T706, sin tocar contratos máquina)

- **004 (D5-01, D5-02)**: acotado a `kind = FILE` y a fotos heredadas por encima del tope el texto de `K-10`, `REQ-ARC-005`, `REQ-ALB-001`, `INV-ALB-001`, `SC-ALM-013`, `SC-ALM-021`, `D-02`, `data-model.md` (fila «Cuota») y `contracts/README.md` (`MediaPage`, `listMedia`, `ERR-MEDIA-QUOTA-EXCEEDED`). `media.schema.json` y el OpenAPI de la 004 **no cambian**.
- **002 (D5-10)**: `REQ-RBAC-001` gana la fila `CREATE_SHARE_LINK` y `SC-008` pasa a 15 filas × 4 roles = 60 casos; `src/domain/access/rbac.ts` añade `ShareRbacAction` (`['OWNER','ADMIN']`). Sin cambio en `identity.schema.json`, `PetPermissions` ni `canonical-fixtures.json` (precedente E-06 de la 004: la acción se anota como `x-sdd-rbac-action`).

## 8. Residuos conocidos

- El texto de `summary` del OpenAPI de 004 `listMedia` («Lista paginada (24 por página)») no se edita (contrato máquina `LOCKED`); el valor no cambia.
- Los límites de lista del resumen (5 000) son cotas de seguridad, no semántica de negocio; superarlas es un error interno (sin truncar en silencio).

## 9. Revisión T707 (2026-11-18): cierres aplicados sin firma de Neo

Aplicado en estos contratos: idempotencia de creación (`Idempotency-Key`, `CreateShareLinkReplay`; EDGE-005-16/17); candado de creación por alcance y no por creador (EDGE-005-15, texto en `STATE-SHARE-001` y `ShareLinkList`/409); lectura coherente y un solo `now` (EDGE-005-14/24); normalización de las respuestas de Fastify al 404 uniforme (EDGE-005-25, campos `uniformSources` y `normalizationRule` del catálogo); `X-Goog-Expires` mínimo 1 s (EDGE-005-23); `displayName` vacío = «Archivo» (EDGE-005-27); `EXPIRED -> REVOKED` convertido en no-op (MIF-005-08); `PlatformParameter` sin `valueType`, `minValue` ni `maxValue` (MIF-005-07).

**No aplicado (PENDIENTE NEO, ver `spec.md` «Decisiones pendientes de Neo»)**: PN-01..PN-11. El contrato mantiene `HOUSEHOLD`, `getSharedFile`, la auditoría por acceso, la caché de 60 s, la vista previa de hogar y la rotación HMAC tal como estaban. **Nota MIF-005-10**: `ShareLinkView.revokedAt` y la columna `expires_in_days` siguen en el contrato hasta que `/rama` y `/sati` confirmen que pueden retirarse.
