# T701 — Grafo de impacto de las enmiendas de 005 sobre 004 y 002 (Merovingian, 2026-11-18)

Alcance: lectura sola. Base: worktree argos-005 (HEAD 9627f32). Nada editado en specs/, contracts/, src/ ni tests/.
Enmiendas: D5-01 (tope 10 PHOTO, retiro K-10 para PHOTO, REQ-ALB-001/INV-ALB-001 acotados a FILE), D5-02 (ERR-MEDIA-ALBUM-LIMIT 409), D5-10 (CREATE_SHARE_LINK en REQ-RBAC-001 de 002), D5-06 (nombre original vs ClinicalSummary).

## 1. Resumen para Neo
- El tope de 10 fotos es aditivo en contrato (error nuevo, parametro nuevo) pero contradice texto vigente de 004 en 9 lugares y obliga a un metodo nuevo de repositorio (`countByPet`) en 2 motores, hoy inexistente.
- Hallazgo clave: NO hay que cambiar `pageSize = 24` ni `MediaPage.maxItems 24`. La pagina de 24 sigue valiendo para FILE y para mascotas con mas de 10 fotos heredadas (D5-03). Lo que cambia es el TEXTO "pagina de 24 para fotos" y los tests que siembran 50 fotos por API.
- La matriz de 002 puede ampliarse con CREATE_SHARE_LINK siguiendo el precedente E-06 de 004 (accion fuera del enum `RbacAction`, solo `x-sdd-rbac-action`): no se toca `identity.schema.json` de 002 ni su `src/generated`. Pero hay una trampa de modelo (alcance HOUSEHOLD, ver 3.3).
- D5-06: la solucion del Architect es COHERENTE en privacidad, pero INCOMPLETA en trazabilidad (ver 4).

## 2. Cadena causa -> efecto: 004 (D5-01, D5-02)

### 2.1 Causa raiz normativa
- `specs/004-catalogos-registros-archivos/spec.md:130` REQ-ARC-005 ("no hay tope de elementos por mascota (K-10; el album pagina de 24 en 24)").
- `spec.md:372` fila K-10 ("Aplicado: solo cuota de bytes"); `spec.md:423` D-02 ("sin tope por mascota (K-10)").
- `spec.md:134` REQ-ALB-001 (24 por pagina, pageSize = 24) y `spec.md:156` INV-ALB-001 (pageSize = 24; salvedad TECHDEBT-004-02 en `:411`).
- `spec.md:229` SC-ALM-013 ("no existe tope de elementos por mascota"); `spec.md:237` SC-ALM-021 (50 fotos -> 24/24/2: bajo D5-01 inalcanzable por API para PHOTO; valido para FILE).
- `spec.md:285,289,308` matriz REQ->SC->T (T501, T512, T565, T566, T576, T577, T587, T588): sin cambio de IDs, si de texto.
- `spec.md:430,433,441` D-09, D-12, D-20 B (pagina de 24 con lazy): acotar a FILE y al caso D5-03.
- `plan.md:83` (trazas REQ-ARC-005) y `plan.md:104` (cuota signBlob: "24 firmas por pagina", sigue valido para FILE).
- `data-model.md:46` (indice `pet_media_pet_created`, "paginacion de 24"): el indice ya cubre `(pet_id, kind, ...)`; sirve tambien para `COUNT` por mascota y kind sin indice nuevo.
- `data-model.md:74` fila "Cuota" ("No hay tope de elementos por mascota (K-10)"): reescribir; el conteo por mascota y kind va dentro de T2 bajo `lockOwnerThenPet` (el candado ya existe).
- `contracts/README.md:23` (MediaPage <= 24, pageSize const 24), `:31` (listMedia), `:50` (tabla de errores: agregar ERR-MEDIA-ALBUM-LIMIT).

### 2.2 Contratos 004 (LOCKED; T706 los hereda como catalogo incremental o enmienda firmada)
- `contracts/errors/error-catalog.json`: cabecera `x-sdd-metadata.version 3.1.0` (:5), listas `added` (:12-16) y orden alfabetico (:44-48); bloque ERR-MEDIA-QUOTA-EXCEEDED en `:249-256` es la plantilla. Agregar ERR-MEDIA-ALBUM-LIMIT (409, REQ-ALB5-002) implica MINOR aditivo. D5-02 deja abierto "catalogo de 004 o incremental de 005": recomiendo incremental en 005 (no tocar LOCKED), pero entonces `compile-contracts.sh` y `src/generated/v31/errors/error-codes.ts` y `field-errors.ts` deben fusionar dos catalogos (hoy solo 001/002/004; TECHDEBT conocida de H-MERO-001 sobre compile-contracts). Decision de Architect/Neo.
- `contracts/openapi/pet-tracker-api.openapi.yaml:700` respuesta 409 de `uploadMedia` ("ERR-MEDIA-QUOTA-EXCEEDED"): ampliar descripcion a cuota o tope de album (aditivo, mismo status). `:725` summary de `listMedia` ("Lista paginada (24 por pagina)"): reescribir, el valor no cambia. D5-01 cita `pageSize` en el OpenAPI: no requiere cambio de valor, solo de texto.
- `contracts/schemas/media.schema.json:123` (`maxItems 24`), `:134` (`const 24`), `:141` (descripcion): SIN cambio de valor. Cualquier cambio a `const 24` seria BREAKING para `contracts-004-schemas.spec.ts:208-213`. Solo ajustar descripcion y trazas ("FILE y fotos heredadas > tope").
- `contracts/schemas/media.schema.json:54,75` `originalName` es campo requerido de MediaItem (relevante para D5-06).

### 2.3 Codigo afectado
- `src/domain/media/media-limits.ts:12` `MEDIA_PAGE_SIZE = 24`: se conserva. Nuevo dominio `album-limit.ts` (T723).
- `src/application/use-cases/media-use-cases.ts`: pasos 1 (`:121-122`, comprobacion previa al put) y 3 (`:141`, transaccion final tras `lockOwnerThenPet` en `:137-138`) son los puntos exactos de insercion del conteo de PHOTO, junto al `ERR-MEDIA-QUOTA-EXCEEDED`. Orden recomendado: tope de album despues de la validacion de tipo y antes de la cuota, para no consumir cuota (REQ-ALB5-002). `:174-185` ListMedia usa `MEDIA_PAGE_SIZE`; sin cambio.
- `src/application/ports/repositories.port.ts:179-181`: existen `listPage` y `countBytesOfOwner`; NO existe conteo por mascota y kind. Hay que agregar `countByPetAndKind(petId, kind)` y propagarlo a `src/infrastructure/persistence/sqlite/sqlite-repositories.ts`, `src/infrastructure/persistence/postgres/postgres-repositories.ts` y `tests/fixtures/media-repository-contract-suite.ts` (suite de contrato de repositorio: debe agregar un caso). Es un cambio de PUERTO (Nivel 1 de arquitectura, no de dependencia).
- `src/presentation/web/media-view.ts:17` (mapa de mensajes ERR-MEDIA-*): agregar el mensaje de ERR-MEDIA-ALBUM-LIMIT; `:30-32` `ALBUM_PAGE_SIZE = 24` y `albumPageCount`: sin cambio de valor para FILE.
- `src/presentation/web/components/PhotoAlbum.tsx:2` y `pages/AlbumPage.tsx` (T588): hoy muestran fotos paginadas de 24; la seccion "Album" (T726) las reemplaza/ajusta (sin paginacion hasta tope, REQ-ALB5-004), y `media-api.ts` consume `listMedia`.
- `src/infrastructure/http/routes/media.routes.ts:58`: la ruta de subida mapea errores via el catalogo; el 409 nuevo sale del catalogo generado, sin logica nueva si `error-codes.ts` se regenera.
- `src/generated/v31/errors/error-codes.ts`, `field-errors.ts`, `schemas/types.ts`, `api/openapi-types.ts`, `schemas/validators.*`: regenerados por `bash scripts/compile-contracts.sh`; el diff esperado es solo el codigo nuevo y descripciones.

### 2.4 Tests afectados (riesgo de regresion)
- ROJOS probables si se aplica D5-01 al codigo: `tests/integration/api/t587-album.api.spec.ts:30-42` (50 fotos por API; con tope 10 la subida 11 falla: sembrar por repositorio o cambiar a `kind=FILE`); `tests/integration/api/t578-medios.api.spec.ts:182-184` (total/pageSize de fotos); `tests/unit/presentation/t588-album.spec.ts:45-46` (50 -> 3 paginas; sigue verde si es funcion pura, pero el texto cita "album"); `tests/security/exploits/media-004.security.spec.ts` (si sube >10 fotos en alguna prueba; revisar `:178` es FILE/cuota).
- Deben seguir verdes sin cambio: `tests/integration/contracts/contracts-004-schemas.spec.ts:208-213` (const 24), `contracts-004-openapi.spec.ts`, `tests/fixtures/media-repository-contract-suite.ts:71-72,110-111` (FILE, 24).
- Rotos por cambio de catalogo: `tests/integration/contracts/contracts-004-errors.spec.ts:35` (lista cerrada ordenada de ERR-MEDIA-*) y `:42` (tabla [codigo, status, REQ]): agregar la fila nueva o fallara si el codigo entra al catalogo 004; si va a un catalogo incremental de 005, esta prueba no cambia (ventaja del incremental). `tests/integration/contracts/generated-004.spec.ts` revisa codigos generados.
- Nuevos (ya planeados): T720-T727 (tope atomico, 14 fotos heredadas, parametro 12), T710-T714 (platform_parameters).

### 2.5 Orden seguro de aplicacion
1. T706 crea los contratos de 005 SIN tocar 004. 2. Enmienda de texto de 004 (K-10, REQ-ARC-005, REQ-ALB-001, INV-ALB-001, SC-ALM-013/021, data-model:74, README) marcada "Enmienda 005, D5-01", con firma Neo (documento LOCKED). 3. Regenerar. 4. Tests rojos primero (T720/T721), luego puerto + caso de uso.

## 3. Cadena causa -> efecto: 002 (D5-10, CREATE_SHARE_LINK)

### 3.1 Causa raiz
- `specs/002-plataforma-v21/spec.md:221` REQ-RBAC-001 y tabla `:228-238` (11 filas originales + 3 de medios E-06). `spec.md:351` SC-008 ("14 filas x 4 roles = 56 casos"): pasa a 15 filas = 60 casos.
- `spec.md:9` y `:206-217` (convencion "Enmienda 004, E-xx" solo al texto). Precedente directo: E-06 se aplico al texto, a `src/domain/access/rbac.ts:22-37` (union `MediaRbacAction` + matriz) y como `x-sdd-rbac-action` en el OpenAPI de 004, sin tocar `RbacAction` (`specs/002.../contracts/schemas/identity.schema.json:584`, 11 valores) ni `PetPermissions` (9 permisos, `src/generated/schemas/types.ts:1468`).
- `specs/002.../plan.md:89` ADR-002-03 ("matriz como funcion pura sobre 11 acciones"): nota de enmienda.
- `specs/002.../tasks.md:126,132,143` (T236/T244 "44 casos"), `checklists/requirements.md:22,39` (CHK013/CHK032), `checklists/f4-contratos.md:16` (CHK106: "11 acciones en RbacAction"), `checklists/sustitucion-pruebas-001.md:11`: son registros historicos CERRADOS; no se editan, se anota la enmienda en la spec.

### 3.2 Efectos
- Codigo: `src/domain/access/rbac.ts` (agregar 'CREATE_SHARE_LINK' a una union nueva, p. ej. `ShareRbacAction`, y entrada `['OWNER','ADMIN']` en `RBAC_MATRIX`, `Record<PetAction,...>` obliga a completarla: el compilador detecta olvidos). `petPermissionsFor` no cambia (9 permisos): el boton "Compartir" necesita exponer la accion (campo nuevo en `permissions` seria cambio de contrato de `PetPermissions` en 002/004; alternativa: calcularlo en la UI via endpoint propio de 005).
- Tests: `tests/unit/permissions-matrix.spec.ts` (44 casos de 11 acciones; el archivo no cubre hoy las 3 de medios: verificar donde estan los 12 casos de E-06) y `tests/integration/contracts/canonical-fixtures-002.spec.ts`. `canonical-fixtures.json` de 002 (muchas entradas REQ-RBAC-001, `:2387-8440`) NO se toca: es fixture LOCKED.
- Contratos: ningun cambio en `identity.schema.json`/`household-membership.machine.json` de 002 si se sigue el precedente E-06.

### 3.3 Trampa de modelo (RIESGO MEDIO)
`can(rol, accion)` evalua el rol EFECTIVO sobre una MASCOTA (propietario legal o mayor rol ACTIVE entre hogares con la mascota). El alcance HOUSEHOLD de un enlace es sobre un HOGAR: la fila de miembros de 002 (`:234`) ya aclara que esa accion usa "Propietario del hogar", no rol por mascota. Si CREATE_SHARE_LINK se evalua con el rol efectivo por mascota, un `ADMIN` de hogar A que ve una mascota compartida tambien en hogar B podria crear un enlace HOUSEHOLD de B, o un `ADMIN` de hogar crear enlace PET de una mascota que solo ve como CAREGIVER en otro. Regla propuesta: PET -> rol efectivo sobre esa mascota (OWNER/ADMIN); HOUSEHOLD -> rol del usuario EN ESE hogar (ADMIN o propietario del hogar). Debe quedar como lectura de fila (como `:236`) y con prueba IDOR (INV-ACC2-001).

## 4. D5-06 vs REQ-SUM-003 — dictamen

Hechos:
- `spec.md(005):116` REQ-SUM-003 excluye "nombres originales de archivo en el read-model ClinicalSummary (D5-06: ... derivado en la capa de presentacion, no forma parte del esquema de inclusion)" con allow-list y `additionalProperties:false`.
- `plan.md(005):68` (1.5) dice `clinicalFiles[]` = "id opaco, tipo MIME, tamano, fecha, y nombre solo segun D5-06": CONTRADICE REQ-SUM-003 (el plan sugiere el nombre dentro del read-model).
- `spec.md(005):109` REQ-VET-009 y `:167` SC-005-023, `:173` SC-005-029 (sin nombres en read-model), `:73` EDGE-005-09, `:108` REQ-VET-008 ("ningun registro contiene nombres de archivo"), `:131` NFR-005-001.
- `spec.md(005):106` REQ-VET-006: UNICA ruta publica `GET /shared/{token}/summary`; ningun otro verbo ni ruta resuelve el token.
- 004 `media.schema.json:54,75`: `originalName` ya es campo de MediaItem (usuario autenticado).

Veredicto: CONDICIONAL. Coherente en privacidad e intencion; NO suficiente en trazabilidad hasta cerrar 3 puntos.
- A favor: mantener el read-model sin nombres protege REQ-SUM-006 (entrada de IA de Fase 5 sin PII), el determinismo REQ-SUM-002 (el nombre no altera el hash del JSON) y el esquema cerrado. El nombre es PII potencial (EDGE-005-09) y solo debe viajar al navegador del veterinario.
- Brecha 1 (bloqueante de diseno): "derivar en presentacion" no define de DONDE sale el nombre. La vista publica no tiene sesion ni acceso a `pet_media`; si la vista es SPA, el nombre debe llegar por la red, es decir, por la unica ruta publica. Eso es un campo de respuesta, no "capa de presentacion". Debe declararse un contrato: p. ej. `SharedSummaryView = { summary: ClinicalSummary, fileLabels: [{fileId, displayName}] }` (esquema cerrado, schema propio, separado de `clinical-summary.schema.json`), construido por un caso de uso de aplicacion, con `displayName` leido de `pet_media.original_name` DESPUES de resolver el token, sin `petId`/clave. Alternativa mas simple: render del lado servidor (HTML) donde el nombre nunca es JSON; pero entonces el requisito `GET /shared/{token}/summary` debe aclarar que sirve HTML y JSON por negociacion (el JSON sin nombres para Fase 5/IA).
- Brecha 2: REQ-VET-009 y SC-005-023 deben reescribirse para nombrar esa estructura; agregar SC que pruebe: (a) el `ClinicalSummary` validado NO contiene nombre, (b) la vista/envoltorio SI, (c) ningun log ni auditoria lo contiene (REQ-VET-008). Hoy no hay criterio que verifique la presencia del nombre en la vista.
- Brecha 3: corregir `plan.md:68` ("y nombre solo segun D5-06") a "sin nombre" para eliminar la contradiccion; si no, un Keymaker lo implementara dentro del read-model.
- Riesgos de privacidad residuales (para /rama T702): el nombre llega a un tercero por diseno (aceptado por Neo en D5-06); cabeceras `Content-Disposition` de descarga firmada no deben incluir el nombre sin sanear; el envoltorio no debe cachearse (REQ-VET-006 ya exige no-store); aplicar `canonicalMediaName` ya usado en 004 (`media-use-cases.ts`, al subir) y escapado en HTML (XSS, EDGE de nombres).
- Trazabilidad: el `ClinicalSummary` no cambia para IA, el envoltorio es un ID nuevo (`REQ-VET-009` + schema `shared-summary-view` o seccion en OpenAPI de 005); REQ-SUM-004 debe citarlo.

## 5. Bloqueantes y recomendaciones
Bloqueantes (para T706/T708):
- B1: definir el canal del nombre (Brecha 1) y corregir `plan.md:68` (Brecha 3).
- B2: decidir catalogo de errores incremental de 005 vs enmienda de 004 (D5-02 lo deja abierto) y su efecto en `compile-contracts.sh` (solo 001/002/004 hoy).
- B3: regla de rol para CREATE_SHARE_LINK en alcance HOUSEHOLD (3.3).
No bloqueantes: nuevo puerto `countByPetAndKind` (T723/T724 lo incluyen implicitamente: agregar a descripcion de T712/T724); reescritura de pruebas t587/t578; SC-008 de 002 a 60 casos; revisar que T709 (verify-traceability) acepte IDs de 005 antes de fusionar enmiendas a 004/002.
No hay dependencias nuevas (Exiled Programs: sin cambio; `package.json` no se toca).

## 6. Archivos de 004/002 que requieren firma de Neo para edicion de texto
004: spec.md (REQ-ARC-005, REQ-ALB-001, INV-ALB-001, SC-ALM-013/021, K-10, D-02), data-model.md:74, contracts/README.md; si el catalogo no es incremental: error-catalog.json, openapi, media.schema.json (descripcion). 002: spec.md (REQ-RBAC-001, SC-008, plan ADR-002-03 nota).
