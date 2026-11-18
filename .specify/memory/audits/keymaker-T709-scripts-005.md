# Keymaker T709 — soporte `--feature 005` en las compuertas (2026-11-18)

Worktree `argos-005`, rama `005-album-archivos-clinicos`, base `ad525ee`. Alcance: solo `scripts/compile-contracts.sh`, `scripts/verify-traceability.sh`, `scripts/verify-oracles.sh`. Sin `src/`, sin tests, sin contratos. Estado de tarea: REVIEW (no `[x]`).

## 1. Línea base (antes de editar; mismos resultados en la carpeta principal)
| Compuerta | Resultado base |
|---|---|
| `verify-traceability.sh` (001) | rc 1, **113/118 FALLA** (no 96/96: ese dato del encargo no coincide con disco; idéntico en la carpeta principal 44c83e0) |
| `--feature 002` | rc 0, 119/119 CUMPLE |
| `--feature 003` | rc 0, 25/114 CUMPLE (evidencia informativa) |
| `--feature 004` | rc 0, 162/246 CUMPLE (spec→tasks 126/126) |
| `--feature 005` | ya aceptaba 005 por el glob `specs/005-*`, pero con el patrón de 001: 62 IDs, 21/62, sin NFR/SC ni INV-005-* |
| `verify-oracles.sh` y `--feature 004/005` | rc 0, 265 archivos, 0 débiles, CUMPLE |
| `npx tsc --noEmit` | 0 |
| `compile-contracts.sh --feature 001/002/004` | salida de referencia capturada con `--out` a un directorio temporal usando el script de HEAD |

## 2. Cambios
- `compile-contracts.sh`: rama `005` (7 contratos, destino `<out>/v33`, nunca v31/api/errors/machines/schemas/ops/catalogs; `v33` añadido a los directorios ajenos que conservan 001/002). Fusiona en un directorio de ensayo el catálogo de 004 con el incremental de 005: falla por código duplicado, por `inherited` inexistente en 004, o si `added` no coincide con los códigos; valida `x-sdd-metadata` de los esquemas de 005; luego `codegen.mjs`. El ensayo normaliza lo que `codegen.mjs` (fuera de alcance) no admite: `$id/$ref contracts/005/schemas/` -> `contracts/schemas/`, retira el `$ref` raíz de `album` y `clinical-summary`, y reescribe los `$ref` del OpenAPI a `004-*/contracts/schemas/` -> `../schemas/`. Los contratos de origen no se tocan.
- `verify-traceability.sh`: `FEAT5` (NUM_ID con NFR/SC y segmento numérico `005`; rangos `SC-005-001..006`; `OWNED_005`; spec->tasks 1:1 de IDs propios; evidencia **bloqueante**). `REQ-CLD-007`/`REQ-SIN-003` NO son excepciones. Además `--task` admite sufijo de letra (`T764a`, `T779a`), que antes daba exit 2.
- `verify-oracles.sh`: documenta 005 y cuenta informativamente `tests/integration/contracts/*-005-*.spec.ts` (no obligatorias aún). Criterio de oráculos sin cambio.

## 3. Resultados post-cambio
- `compile-contracts.sh --feature 001/002/004 --out tmp`: `diff -r` contra HEAD **sin diferencias** (3/3). `--feature 005 --out tmp`: rc 0, 11 archivos en `v33/`, `git diff --stat -- src/generated/api` vacío. Negativos: `inherited` falso -> rc 1 con mensaje; `--out src/generated/api` -> rc 2. **No se escribió `src/generated/v33`.**
- Trazabilidad 001/002/003/004: salida **byte a byte igual** a la base (113/118, 119/119, 25/114, 162/246). Modo por tarea 004 T514, 002 T204, 003 T406: iguales.
- `--feature 005`: 128 IDs vigentes, spec->tasks 99/99, 23/128 con prueba sintética (21/128 sin ella), rc 1 (esperado: sin src/tests de 005). Con tests sintéticos temporales (retirados) `REQ-CLD-007` y `REQ-SIN-003` pasaron a trazados por título it. Fallos distintos de «falta implementar 005»: ninguno; `SC-ALM-013/021` (IDs de 004 citados por 005) piden `@implements` en src: lo darán las tareas de 005 (no es excepción).
- `verify-oracles.sh` (sin feature, 004, 005): CUMPLE, 0 débiles; un `toBeDefined` sintético temporal en `tests/` hizo FALLAR la de 005 (detecta).
- `npx tsc --noEmit`: 0. Symlink `node_modules` temporal retirado.

## 4. Salvedades para Oracle
1. README §6.2 pedía `v33/errors/error-codes.ts` solo con los 4 códigos; sin tocar `codegen.mjs` queda el catálogo fusionado (004 + 4) y los tipos de 004 se regeneran duplicados en v33. Si `/architect` exige lo literal, es cambio de `codegen.mjs` (fuera de T709).
2. `codegen.mjs` no admite el `$ref` raíz ni el prefijo `contracts/005/schemas/`; el ensayo lo absorbe. Ambas normalizaciones son candidatas a corregirse en los contratos o el generador (Caso B de `/architect`).
3. Ambigüedades de `/architect`: T795 (paso `UPDATE share_links SET revoked_at = :now WHERE revoked_at IS NULL` del script de restauración) no bloquea T709. T766 no lista `pet_owner_user_id_at_creation` en su línea, pero `data-model.md:43` y T768 sí lo exigen: sugerir a `/architect` añadirlo a T766 (migración); no bloquea T709.
