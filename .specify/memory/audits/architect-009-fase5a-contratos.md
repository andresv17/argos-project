# Acta Architect — 009 Fase 5a: contratos T1256, T1257, T1302 (2026-11-23)

Estado: REVIEW (ninguna casilla marcada). Pre-autorización Nivel 2 de Neo para T1256, T1257 y T1302. Sin compilar, sin tocar src/generated, sin commit.

## Versiones
| Archivo | Antes | Después | Tipo |
|---|---|---|---|
| 009 `contracts/openapi/admin.openapi.yaml` | 1.3.0 | 1.4.0 DRAFT | MINOR (+3 operaciones) |
| 009 `contracts/errors/error-catalog.json` | 1.0.0 | 1.0.0 (sin cambio) | — |
| 006 `schemas/scene.schema.json` | 1.1.1 | 1.2.0 DRAFT | MINOR aditiva |
| 006 `openapi/home-scene.openapi.yaml` | 3.5.0 | 3.6.0 DRAFT | MINOR aditiva |
| 006 `errors/error-catalog.json` | 1.0.0 | 1.1.0 DRAFT | MINOR (+ERR-SCENE-DISABLED) |
| 005 `schemas/platform-parameter.schema.json` | 1.0.0 | 1.0.1 DRAFT | PATCH documental |

## T1256 (admin.openapi.yaml 1.4.0)
- `GET /admin/parameters` (listAdminParameters): 6 claves cerradas (`AdminParameterKey`), valor efectivo, `default`, `source` (DATABASE|DEFAULT), `constraints` (min/max/allowed/maxBlockLength leídos del catálogo de código), `writable`, `lastEditedAt` (updated_at), `lastEditedBy` (id de admin de `admin_audit_entries`, nunca `updated_by_user_id`) y `etag`.
- `PUT /admin/parameters/{key}` (updateAdminParameter): `If-Match` obligatorio, 412 `ERR-ADMIN-PARAMETER-PRECONDITION-FAILED`; valor/clave/If-Match inválido = 422 `ERR-SCHEMA-VALIDATION-FAILED` (referenciado, no redefinido); 403 CSRF antes de sesión; 404 uniforme; `ERR-ADMIN-SCENE-COST-CAP-EXCEEDED` (422) referenciado pero emitible solo en 5b. Orden: CSRF, sesión, esquema, 412, coste. Auditoría sin valor.
- `POST /admin/parameters/scene-quota/reset` (resetAdminSceneQuota): sin cuerpo, 200 `{accountsReset >= 0, resetAt}`, 409 `ERR-ADMIN-QUOTA-RESET-CONFLICT`; no toca `scene.global_quota_used.YYYY-MM` ni cuentas ajenas; no falla sin escena u hogar.
- P5-06 = B: `writable = false` para `scene.global_quota_max`, `scene.provider_model`, `scene.provider_location` y `scene.prompt.blocks` en 5a (dato de respuesta; habilitarlo en 5b no cambia el contrato). La escritura de esas claves en 5a responde 422 sin escribir.
- Sin claves nuevas: enum cerrado; fila ausente de clave del catálogo se inserta al escribir (no es clave nueva).
- Catálogo de errores 009: los tres códigos ERR-ADMIN-* YA existían desde T1217 (1.0.0, estados 412/422/409 coherentes). No se añadió ni cambió ninguno; no se subió versión. IDs añadidos en esta tarea: ninguno nuevo en 009.

## T1257 (006)
- Verificación MIF-07: ningún estado de 006 sirve. `SceneStatus` es el ciclo de la imagen (STATE-SCENE-001) y `actions.blockedReason` es un enum cerrado de causas por usuario (ampliarlo rompería clientes con enum cerrado).
- `SceneView.disabled` (boolean, opcional, fuera de `required`), compatible hacia atrás; `canUpdate`/`canRegenerate` false cuando `disabled`; blockedReason intacto.
- `ERR-SCENE-DISABLED` (409, no SCENE_STATE) en catálogo 006 1.1.0 (`added` actualizado); se evalúa tras autorizar y antes de consentimiento, cuota y límites de tasa. Reflejado en los dos POST de generación y en la cabecera 3.6.0.
- Corregida la nota «se mantiene en 3.4.0» de la 3.5.0 («era entonces 3.4.0») y registrada en 3.6.0.

## T1302 (005)
- PATCH 1.0.1: descripción del esquema y de `updatedByUserId` actualizadas (ya hay interfaz de edición; `updated_by_user_id` queda NULL en /admin; autor en `admin_audit_entries`). Forma idéntica (propiedades, enum, required, límites). `KnownParameterKey` no se amplía.

## Hallazgos para Neo / Morpheus
- H-5a-01: `PlatformParameter.value` en 005 tiene `maxLength: 200`; el JSON de `scene.prompt.blocks` (6 bloques) lo superará. T1302 prohíbe cambio de forma, así que queda como decisión de 5b (T1303 siembra / T1261): revisar si el límite es solo del esquema (la columna es TEXT) y, si hace falta, un MINOR de 005 con firma de Neo. En 009 el cuerpo usa una cota de transporte de 16384 (no es el rango real, que viene de `constraints`).
- H-5a-02: los nombres de los dos bloques de hogar (con foto / genérico) no existen como constantes en `build-image-prompt.ts` (`householdBlock` es función); T1261/T1303 deben fijar nombres y la longitud máxima por bloque (el contrato no inventa números).
- H-5a-03: `KnownParameterKey` de 005 sigue con una sola clave; las 5 claves `scene.*` ya viven en `platform_parameters` por 006/009. Sin efecto de forma hoy; anotado por coherencia documental.
- H-5a-04: versiones fijadas en código/pruebas (006 OpenAPI 3.5.0, scene 1.1.1; headers de `src/generated/v35` dicen 1.3.0): el recompilado de /keymaker las actualizará; pruebas que fijen versiones deberán ajustarse.
- Estado `DRAFT` en todos; ratificación solo de Neo. Validados: YAML (`yaml`) y JSON parsean; 95 `$ref` locales de admin.openapi.yaml resuelven.
