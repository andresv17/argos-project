# Acta Oracle · 009 · 5b Ola 2 · Revalidación de micro-corrección (MAX_RETRY) — 2026-11-23

Veredicto: **PASS** (sin bloqueantes ni nuevas OBS). Solo lectura sobre src/, tests, contratos; sin [x], commit ni push.

## Compuerta real
- tsc --noEmit: exit 0. verify-oracles: 515 archivos, 0 débiles, CUMPLE.
- vitest t1261 + t1298 + t1295 + t1303: 4 archivos, 61 verdes, 7 omitidas (PG sin TEST_DATABASE_URL en esa corrida).
- PG17 (55432) tests/integration/persistence: 65 archivos, 979 verdes, 1 omitida, 0 rojas (incluye t1295/t1303 contra PG real).

## Puntos
- OBS-O2-1 CERRADA. scene-run-use-case.ts:170 pasa `svc.providerCall ?? { model: null, location: null }`. grep SCENE_DEFAULT_MODEL/LOCATION: ya no se usan en application/; solo catálogo admin (valor por defecto del parámetro) y scene-composition.ts:129, donde alimentan providerCall únicamente con driver `real` (efectivos, mismo origen que el generador). fake y gemini-api: providerCall no se fija -> null/null en los 3 motores (SQLite/PG UPDATE con call.model/location null, mapper nullable, memoria idem). t1298 comprueba null sin providerCall (caso de uso), undefined en fake y gemini-api, y {gemini-2.5-flash-image, us-central1} en real; t1295 cubre persistencia en PG real. El cambio de tipo (string -> string|null en el puerto) es ensanche del parámetro: el driver real sigue pasando strings y la composición no cambió en esta micro-corrección.
- OBS-O2-2 CERRADA: los 3 casos INCREMENTAL_ADD de t1261 (líneas 73, 107, 124) usan action 'ADD'; aserciones no relajadas (esperado 1 en el caso de preservación).
- OBS-O2-3 CERRADA: build-image-prompt.ts `withPhoto` = `ADD || REPLACE` (sin RENDER). decide-mode.ts:91 asigna RENDER solo si `scratch`; los incrementales emiten ADD/REPLACE/KEEP/REMOVE, así que el prompt de producción no cambia. decide-mode.ts sin diff.
- Archivos de lista de no permitidos: null-scene-adapters.ts y use-case-support.ts se tocaron por necesidad de tipo (firma del puerto con `string | null`; comentario de SceneServices.providerCall); justificación aceptada, cambio mínimo sin lógica. El resto (scene-repositories.port.ts, scene-run-use-case.ts, build-image-prompt.ts) es el alcance de la corrección.

## Condiciones vigentes (ajenas)
Commitear las 4 migraciones (0022/0018, 0023/0019) junto con el código; H-5a-01 y firma T1255; T1300 ya puede leer provider_model/location sin sumar intentos simulados.
