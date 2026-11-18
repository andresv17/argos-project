# Architect: D-B y O2 en 005 (2026-11-18)

Estado: DRAFT. Rama 005-album-archivos-clinicos, base ebb4665.

## D-B (opción a, Neo, Nivel 2)
- contracts/README.md §6.2 reescrito: v33/errors/error-codes.ts contiene el catálogo fusionado (004 + 4 códigos de 005), sin tocar scripts/codegen.mjs. Justificación: codegen genera un único catálogo por salida; los tipos de 004 se duplican en v33 y el catálogo queda duplicado entre v31 y v33 (efecto aceptado).
- Cabecera de §6 y línea 3 del README ajustadas (ya no "no ejecutado" / "no hay generador"); plan.md línea 118 alineada. spec.md y data-model.md no contradecían.

## O2 (Caso B de Oracle T709)
- $id de los 4 esquemas: https://argos.local/contracts/schemas/<archivo> (mismo patrón que 004; sin colisión de nombres).
- Eliminado el $ref raíz de album y clinical-summary (los $defs se registran uno a uno).
- share-link: $ref a clinical-summary con la nueva URL. README §10 documenta el patrón.
- OpenAPI sin cambios (sus refs relativas a 004 ya las maneja el script). codegen.mjs y contratos 001..004 intactos.

## Verificación
- grep '\$ref.*005/schemas' en contracts: 0.
- compile-contracts.sh --feature 005 --out <tmp>: rc=0 (v33 generado; catálogo fusionado con ERR-MEDIA-ALBUM-LIMIT y códigos 004). src/generated no escrito.
- npx tsc --noEmit: 0 (symlink node_modules temporal, retirado).
- Ajv 2020: 4 esquemas de 005 + 7 de 004 registrados y resueltos: OK.
- Nota: el comentario de compile-contracts.sh sobre normalizaciones queda obsoleto (la normalización pasa a no-op); es de Keymaker (D-A), no se tocó.
