# Errata T1616-B3 — codigo de validacion de esquema de la feature 012

- **Estado:** APPROVED (firmada por Neo — Nivel 2, 2026-11-27: S1..S7 aprobados como errata, S8 aprobado para eliminar `SDD_AJV_STRICT_REQUIRED=false`, y `422 ERR-SCHEMA-VALIDATION-FAILED` confirmado para `POST` de solicitud con un único propietario `ACTIVE`).
- **Autor:** /architect, 2026-11-26. **Origen:** hallazgo B-3 de /keymaker (T1616). **Contratos afectados:** `errors/error-catalog.json` (0.1.0), `openapi/co-ownership.openapi.yaml` (0.1.0), `schemas/owner-request.schema.json`, `README.md`.
- **Precedente:** errata T1613 (E-1..E-3) sobre data-model.md.

## 1. Diagnostico (hechos en disco)

1. `error-catalog.json` de la 012 lista `ERR-VALIDATION` en `x-sdd-metadata.inherited` (linea 46), junto a `ERR-SCHEMA-VALIDATION-FAILED` (linea 43). `ERR-VALIDATION` no existe en ningun catalogo 001..011; `ERR-SCHEMA-VALIDATION-FAILED` (HTTP 422, 004 `v3.3.0`) si existe y es el que usan 004..011.
2. El OpenAPI de la 012 promete `400 ERR-VALIDATION` en prosa (lineas 20, 263, 303) y declara `'400'` con `components/responses/Problem` en las lineas 88, 279, 313, 445 y 480. No declara ningun `'422'`.
3. `scripts/compile-contracts.sh:812` tolera solo `ERR-VALIDATION` con aviso (`UNRESOLVED_INHERITED_WAIVED`). `scripts/codegen.mjs:160` relaja `strictRequired` solo en la compilacion v38 (012).
4. La relajacion de Ajv existe por 2 sitios de `owner-request.schema.json`: `#/$defs/CreateOwnerRequest/allOf/0/then/not` y `.../allOf/1/then` (`required` sin `properties` en la misma rama). `pet-co-owner.schema.json` no los tiene (barrido estatico; la cifra exacta la confirma la compilacion con `strictRequired` activo).

## 2. Propuesta (a): codigo canonico

Para validacion de esquema y de formato de entrada en la 012 el codigo es **`ERR-SCHEMA-VALIDATION-FAILED`, HTTP 422**, definido por la 004 y heredado sin redefinir. `ERR-VALIDATION` se retira del contrato 012 (nunca fue implementable: no tiene cuerpo en ningun catalogo). Alcance: texto con control/bidi (H-11), cursor invalido o ajeno (H-15; la respuesta sigue siendo uniforme, solo cambia el codigo), `POST` de solicitud con un unico propietario ACTIVE (REQ-OWN12-004 j) y chip distinto de `^\d{15}$` (EDGE-012-010).

## 3. Propuesta (b): sustitucion exacta

Regla: cada `old` se sustituye por `new`; el resto de la linea queda intacto.

| # | Archivo | Ubicacion | old | new |
|---|---|---|---|---|
| S1 | `errors/error-catalog.json` | `x-sdd-metadata.inherited`, linea 45-46 | `      "ERR-SHARE-LINK-LIMIT",\n      "ERR-VALIDATION"` | `      "ERR-SHARE-LINK-LIMIT"` |
| S2 | `errors/error-catalog.json` | `change_note`, linea 10 (2 apariciones en la lista de reutilizados) | `ERR-RATE-LIMITED, ERR-VALIDATION, ERR-SHARE-LINK-LIMIT` | `ERR-RATE-LIMITED, ERR-SCHEMA-VALIDATION-FAILED, ERR-SHARE-LINK-LIMIT` |
| S3 | `README.md` | linea 21 | `ERR-RATE-LIMITED`, `ERR-VALIDATION`, `ERR-SHARE-LINK-LIMIT` | `ERR-RATE-LIMITED`, `ERR-SCHEMA-VALIDATION-FAILED`, `ERR-SHARE-LINK-LIMIT` |
| S4 | `openapi/co-ownership.openapi.yaml` | lineas 20, 263, 303 (prosa) | `400 ERR-VALIDATION` | `422 ERR-SCHEMA-VALIDATION-FAILED` |
| S5 | `openapi/co-ownership.openapi.yaml` | lineas 88, 279, 313, 445, 480 | `'400': { $ref: '#/components/responses/Problem' }` | `'422': { $ref: '#/components/responses/Problem' }` |
| S6 | `schemas/owner-request.schema.json` | descripciones, lineas 189 y 564 | `400 ERR-VALIDATION` | `422 ERR-SCHEMA-VALIDATION-FAILED` |
| S7 | `spec.md` (no es contrato; DRAFT/REVIEW) | lineas 89 y 344 | `ERR-VALIDATION` | `ERR-SCHEMA-VALIDATION-FAILED` (422) |

Efecto en `scripts/compile-contracts.sh` (no es contrato; lo ajusta /keymaker): tras S1 se elimina `UNRESOLVED_INHERITED_WAIVED` y el aviso, y cualquier heredado inexistente vuelve a ser error sin excepcion.

## 4. Propuesta (c): relajacion de `strictRequired`

**Recomendacion: eliminarla** corrigiendo los esquemas, no documentarla. Motivo: una excepcion de compilador por feature degrada la regla "strict mode completo" que rige 001..011, y el arreglo es local y de bajo riesgo.

- Correccion: en las 2 ramas de `CreateOwnerRequest` repetir `"properties": { "<campo>": true }` para cada campo citado en `required` (o `{}`), sin cambiar ninguna restriccion. Semantica de validacion identica.
- Alternativa B (documentar y mantener): conservar `SDD_AJV_STRICT_REQUIRED=false` solo para v38 y registrarla como `DEUDA-012-AJV-STRICTREQUIRED` con cierre en T1630. Aceptable solo si Neo prefiere no tocar `owner-request.schema.json`.
- Nota: el cambio de esquema no altera valores aceptados ni rechazados, pero `owner-request.schema.json` esta APPROVED; el cambio estructural va incluido en esta misma firma (S8).

| # | Archivo | old | new |
|---|---|---|---|
| S8 | `schemas/owner-request.schema.json` | ramas `allOf/0/then/not` y `allOf/1/then` con `required` solo | las mismas ramas con `properties` declarando cada campo de `required` (texto exacto lo fija /architect al aplicar tras la firma, verificado con `SDD_AJV_STRICT_REQUIRED` sin definir) |

## 5. Clasificacion del cambio

**Errata, no enmienda MINOR (anexo).** Razon: no se anade ni se retira ningun codigo definido de un catalogo (ERR-VALIDATION no tenia cuerpo ni consumidores), no cambia la forma de ningun campo ni los valores aceptados, y la 012 aun no se ha publicado ni desplegado. Es una correccion de referencia a un codigo ya canonico. Cambia, eso si, el estado HTTP documentado de 400 a 422 en 5 operaciones; ningun cliente existente lo consume. Si Neo prefiere trazabilidad estricta de `x-sdd-metadata.version`, la alternativa es registrarla como PATCH 0.1.1 de catalogo y OpenAPI (sin anexo MINOR). Una MINOR solo seria necesaria si se eligiera crear un codigo nuevo `ERR-OWN12-*` para el caso del unico propietario (no recomendado).

## 6. Impacto en codigo (para /keymaker, T1617)

- Todo rechazo de validacion de esquema/formato de la 012 responde **422 `ERR-SCHEMA-VALIDATION-FAILED`** (`type: urn:argos:error:ERR-SCHEMA-VALIDATION-FAILED`), cuerpo RFC 9457 sin detalle del valor rechazado y uniforme para cursor invalido o ajeno (H-15).
- Retirar el aviso/excepcion de `compile-contracts.sh` y, si se aprueba (c), el flag `SDD_AJV_STRICT_REQUIRED=false`; recompilar v38 y regenerar `src/generated/**` (lo hace el compilador, no a mano).
- Ajustar pruebas que esperen 400/`ERR-VALIDATION` en 012. Sin cambios en 004..011.

## 7. Decision que Neo debe tomar

1. Firmar S1..S7 (codigo canonico y 400 -> 422) como errata, o exigir PATCH 0.1.1.
2. Elegir (c): eliminar la relajacion corrigiendo esquemas (recomendado, S8) o mantenerla como deuda documentada.
3. Confirmar que "un unico propietario ACTIVE en POST de solicitud" usa 422 `ERR-SCHEMA-VALIDATION-FAILED` y no un codigo nuevo.

Hasta la firma, /keymaker puede implementar 422 en T1617 porque coincide con el codigo real ya en uso; el contrato queda en DRAFT de errata.
