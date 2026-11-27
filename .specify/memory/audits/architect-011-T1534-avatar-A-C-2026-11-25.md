# Acta /architect — T1534 (Bloque E, #31) — Opción A + Opción C + condición TR-1 (2026-11-25)

Autoridad: directiva Nivel 2 de Neo (Logos iter 232), ya aprobada. Solo texto y contratos. Sin código, sin `src/generated/**`, sin tests, sin commit, sin push, sin [x], sin cambio de estados APPROVED/LOCKED.

## Cambios exactos
1. `specs/005-album-archivos-clinicos/spec.md`
   - **REQ-VET-006** (línea 112): «dos rutas» pasa a «dos rutas de lectura de resumen y archivos, más una tercera dedicada exclusivamente al avatar de la mascota» (`GET /shared/{token}/pets/{petId}/avatar`, sin álbum, sin claves, sin correo, `credentials: 'omit'`); única imagen que la superficie pública puede servir.
   - **INV-005-002** (línea 136): «solo existen las tres rutas»; «`kind PHOTO` nunca se sirve; el avatar nunca se sirve salvo por la ruta de avatar»; resumen y ruta de archivos nunca sirven avatar; nota «enmendado por Neo, opción A»; t750/t770/t778 no se relajan.
   - **ENM-005-3.5.0** (línea 120): reescrita. Ya no dice «texto de INV-005-002 intacto»; declara la enmienda; regla 1 (valida estrictamente `petId` ∈ alcance, clave solo con id resuelto); **regla 4 = TR-1** (todo servicio pasa por `stripImageMetadata`; bytes y `mime` del resultado saneado; cualquier fallo de lectura o saneado = 404 uniforme con mismo cuerpo, cabeceras y contador que `getSharedSummary`; nunca bytes originales ni `contentType` almacenado); regla 8 = **opción C**; contador compartido sin eximir «sin avatar» (TR-2); ruta de app `/api/shared/...`; recompilación de `src/generated/v33` en T1535.
   - **REQ-SUM-004**: envoltorio `SharedSummaryView {summary, fileLabels, validUntil, petIds?}`.
   - **REQ-SUM-003**: aclara que los ids de mascota solo viajan en `SharedSummaryView.petIds`, nunca en `ClinicalSummary`.
   - INV-005-004 y `clinical-summary.schema.json`: sin cambio.
2. `specs/005-album-archivos-clinicos/contracts/schemas/share-link.schema.json`: `x-sdd-metadata` 1.1.0 -> **1.2.0** (MINOR, supersedes 1.1.0, change_note, traceability +ENM-005-3.5.0); `$defs/SharedSummaryView` gana `petIds` (array uuid, `uniqueItems`, `maxItems 100`, **fuera de `required`**, mismo orden que `summary.pets`, ausente en la vista previa). `additionalProperties:false` se conserva.
3. `specs/005-album-archivos-clinicos/contracts/openapi/share-links.openapi.yaml` (sigue 3.5.0, DRAFT): `change_note` actualizado; descripción de `getSharedPetAvatar` con validación estricta de alcance, **condición TR-1**, 404 fail-closed, `petIds` y sin ETag/Last-Modified/Content-Disposition; se elimina la premisa falsa «derivado ya saneado almacenado».
4. `specs/005-album-archivos-clinicos/contracts/README.md`: fila de la ruta actualizada (TR-1, opción A y C).

## Compuertas
- `verify-traceability.sh --feature 005`: rc=0; `--feature 011`: rc=0; `verify-oracles.sh`: rc=0.
- `codegen-drift.spec.ts`: 13/13. (Primer intento 005 falló por IDs REQ-*11* citados en traza de la spec 005; corregido con texto sin IDs.)
- `src/generated/**`, t750, t770, t778: sin diff por esta misión.

## Pendiente para T1535 / Neo
- Recompilar (`bash scripts/compile-contracts.sh --feature 005`): el esquema cambió, `src/generated/v33` aún no refleja `petIds`; no se ejecutó aquí.
- Pruebas T1533 deben ampliarse (TR-1: WebP con EXIF/XMP, basura tras EOI, «en alcance sin avatar», 429, HEAD/OPTIONS, cookie, auditoría) y añadir prueba de `petIds` en `getSharedSummary` (orden = `summary.pets`, solo alcance vigente).
- Texto legal 010 sección 7 (RAMA-T1534-03) y aviso en diálogo de creación (TR-9): decisión de Neo/Sati.
- Obs. sin resolver: OBS-3 de /rama (EXIF en `GET /api/pets/:petId/avatar` autenticado) como deuda 004/011.

## Aclaraciones TR-4 / cookie / 500 (respuesta a /trinity R-1, R-2, R-3)
- **R-1 (TR-4)**: `spec.md` (`ENM-005-3.5.0`, regla 4) y la descripción de `getSharedPetAvatar` fijan que el estado del avatar se lee siempre con el `petId` del alcance vigente o `NIL`, y que `storage.get` solo se invoca con token válido, mascota en alcance y avatar presente.
- **R-2**: `ENM-005-3.5.0` regla 2 y la descripción OpenAPI declaran que el servidor ignora `Cookie` y `Authorization` y no emite `Set-Cookie` (también anotado en la respuesta 500).
- **R-3**: criterio fijado: 404 uniforme si el objeto falta o el saneado falla (TR-1 intacto, fail-closed); 500 genérico solo con almacenamiento caído (`MediaStorageUnavailableError`), mismo cuerpo exista o no avatar. Se corrigió la descripción del 500 en el OpenAPI y la regla 4 de la spec.
- Solo texto: sin cambio en `src/generated/**`, t750/t770/t778, estados ni `[x]`.
- Compuertas: `verify-traceability.sh --feature 005` y `verify-oracles.sh` (ver resultado en log).

## Corrección RES-1 / RES-3 / pendiente RES-2 (respuesta a /rama, 2026-11-25)
- **RES-1**: se retira de `getSharedPetAvatar` el 500 por almacenamiento caído (apartaba el texto aprobado por Neo, Logos iter 232, TR-1: «ante cualquier fallo de lectura o saneado responde el 404 uniforme»). Ahora todo fallo de lectura (incluido `MediaStorageUnavailableError`), objeto ausente o saneado fallido responde 404 uniforme (mismo cuerpo, cabeceras y contador que `getSharedSummary`). Corregidos: respuesta 500 y descripción en el OpenAPI y regla 4 de `ENM-005-3.5.0`. Esto sustituye la aclaración R-3 anterior (500 con almacenamiento caído), que queda sin efecto.
- El 500 queda en la ruta solo para errores no relacionados con el avatar (fallo de auditoría fail-closed). Ahora lleva `X-Content-Type-Options: nosniff` y `Content-Security-Policy` (regla 6), además de las demás cabeceras.
- **Verificación en disco tras la re-auditoría de /rama (2026-11-25)**: el primer intento no había quedado aplicado en el OpenAPI (RES-1 seguía ABIERTO). Corregido y verificado con grep: la descripción del 500 ya no menciona `MediaStorageUnavailableError` (solo aparece como caso del 404 uniforme, línea ~379) y el bloque 500 declara `X-Content-Type-Options` (NoSniff) y `Content-Security-Policy` (ApiCsp). Lo anterior en R-3 («500 genérico solo con almacenamiento caído») queda superado por RES-1.
- **RES-3**: frase explícita añadida en `ENM-005-3.5.0` y en la descripción OpenAPI: revocar o caducar el enlace no altera el avatar; solo cambia o se retira por sus propios eventos (reemplazo, retirada o eliminación de la mascota o de la cuenta).
- **RES-2 (PENDIENTE, decisión de Neo; no resuelto aquí)**: `REQ-AVA-002` de la spec 004 (LOCKED) dice «el servidor no procesa imágenes»; la ruta pública es una excepción que `ENM-005-3.5.0` debe declarar. Texto propuesto (a incorporar a la enmienda solo si Neo lo aprueba; 004 no se edita): «Excepción a REQ-AVA-002 (spec 004): en la ruta pública `getSharedPetAvatar` el servidor SÍ procesa la imagen, exclusivamente para eliminar metadatos (`stripImageMetadata`) antes de servirla; no la redimensiona, recodifica con pérdida ni almacena el resultado. La carga y el almacenamiento del avatar siguen sin procesamiento en servidor conforme a REQ-AVA-002.»
- R-1 (TR-4), R-2 (cookie/Set-Cookie) y TR-1 intactos. Sin cambio en `src/generated/**`, t750/t770/t778, spec 004, estados ni `[x]`.

## RES-2 aprobada (Neo, Logos iter 234)
- Decisión Nivel 2 de Neo: RES-2 = SÍ. Incorporada la excepción acotada a `REQ-AVA-002` (spec 004, LOCKED, no editada) con el texto exacto: «en la ruta pública de avatar el servidor procesa la imagen únicamente para eliminar metadatos con stripImageMetadata, sin redimensionar, sin recodificar con pérdida y sin almacenar el resultado».
- Ubicación: `spec.md` ENM-005-3.5.0 regla 4 (tras TR-1) y descripción de `getSharedPetAvatar` en `share-links.openapi.yaml` (versión sin tildes, por el estilo ASCII del archivo).
- Verificación: YAML válido; `verify-traceability.sh --feature 005` rc 0; `verify-oracles.sh` rc 0. Sin tocar spec 004, `src/generated/**`, t750/t770/t778, estados ni `[x]`.

## Precisión R-1 (Trinity código T1535, 2026-11-25)
- Dictamen: `.specify/memory/audits/trinity-011-T1535-codigo-2026-11-25.md` (R-1). Solo texto, sin nueva excepción ni cambio de comportamiento.
- `spec.md` (ENM-005-3.5.0 regla 2; y la mención en REQ-VET-006) y la descripción de `getSharedPetAvatar` precisan: (a) la imagen se pide con `<img src>` de mismo origen, `referrerPolicy no-referrer` y sin `srcset`; (b) el servidor ignora `Cookie` y `Authorization` y no emite `Set-Cookie`, así la respuesta no depende de la cookie HttpOnly `argos_session`; (c) `credentials: 'omit'` aplica solo al cliente `fetch` (`createShareApi().getSharedAvatar`) cuando exista.
- Verificación: `verify-traceability.sh --feature 005` rc 0; `verify-oracles.sh` rc 0. Sin tocar spec 004, `src/generated/**`, estados ni `[x]`.
