# Architect 006: T912, enmienda aditiva del contrato `retryAfterSeconds` (N2-14 = SI)

Fecha: 2026-11-19. Rama `006-escena-hogar-pixel-art`, HEAD `80a8ccf`. Estado: `DRAFT`. Sin `src/`, `tests/`, `src/generated/`, `vite.config.ts` ni constitucion; sin commit; ninguna tarea `[x]`.

## 1. Cambios
- `contracts/schemas/scene.schema.json`: `x-sdd-metadata.version` 1.0.0 -> 1.1.0, `supersedes` "1.0.0", `change_type` MINOR, `change_note` ampliada, `traceability` + SC-ESC6-112 y SC-ESC6-113. `SceneActions.retryAfterSeconds`: `["integer","null"]`, minimo 1, maximo 86400, opcional (no entra en `required`); `additionalProperties: false` intacto. Descripcion de `canRegenerate` corregida: restante >= 1, rol y limites de intentos de REQ-ESC6-034 que permitan un intento.
- `contracts/openapi/home-scene.openapi.yaml`: `SceneView` llega por `$ref` al esquema, de modo que hereda el campo sin editar operaciones ni cabeceras. Solo se amplia `change_note`. La version del documento se mantiene en 3.4.0: esta fijada en `src/generated/v34`, `src/infrastructure/http/plugins/problem-details.ts` y `tests/integration/contracts/openapi-contract-006.ts` (fuera de mi alcance). Si Neo prefiere 3.5.0, es decision aparte.
- Sin diff en `contracts/state-machines/` ni `contracts/errors/`.
- JSON del esquema y YAML de OpenAPI parsean sin error.

## 2. Dictamen de /merovingian (resumen; log `claude/log-merovingian.md`)
- H1: `src/application/use-cases/scene-use-cases.ts:183` `canRegenerate` no consulta los limites de REQ-ESC6-034 y `buildView` (162-190) no emite `retryAfterSeconds`. Divergencia real con el contrato 1.1.0, ya cubierta por T915.
- H2: `tests/unit/t851-get-scene-escena-006.spec.ts:127` usa `toEqual` sobre `actions`; al emitir `retryAfterSeconds: null` se rompe. Cubrir en T914.
- H3: `tests/integration/contracts/openapi-contract-006.ts` valida con ajv contra la fuente `scene.schema.json` (no contra `src/generated`) y acepta 1.1.0. `codegen-drift.spec.ts:35` excluye v34: nada alerta si T913 se omite; T913 es obligatoria.
- Compatibilidad: campo opcional; cliente 1.0.0 ignora el campo nuevo; servidor 1.0.0 no lo emite y un cliente 1.1.0 debe tratar la ausencia como `null`. Aditivo y MINOR correcto.
- `STATE-SCENE-001` y `ERR-RATE-LIMITED` no cambian semanticamente (el guard REQUEST ya incluye el enfriamiento; el cooldown es motivo de bloqueo, no estado).

## 3. Compuertas
`bash scripts/verify-traceability.sh --feature 006`: CUMPLE (221/221 IDs propios mapeados; 258 IDs vigentes; pureza 0 violaciones).

## 4. Bloqueos y preguntas
Ningun bloqueo. Pregunta no bloqueante (de /merovingian) para Neo: `retryAfterSeconds` se calcula con los intentos del actor; para un lector con `blockedReason = ROLE`, que ve la escena pero no puede escribir, el spec actual dice «con independencia de `blockedReason`». Recomiendo mantener el spec (valor real) salvo que Neo prefiera `null` para roles sin escritura; no se resuelve aqui.
