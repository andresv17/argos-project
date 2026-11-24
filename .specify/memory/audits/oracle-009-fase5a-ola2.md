# Acta Oracle — 009 Fase 5a, ola 2 (T1264 parametros admin, T1266 interruptor scene.enabled) — 2026-11-23

Veredicto: **PASS CON OBS**. Sin [x], sin commit, sin push; contratos y src/generated sin tocar. HEAD 895e233 + cambios sin commit.

## Compuerta real
- `npx tsc --noEmit`: exit 0. `bash scripts/verify-oracles.sh`: 505 archivos, 0 debiles, CUMPLE.
- vitest t1258 (71) + t1260 api (24) + t1260 unit (5): 3 archivos, 100/100 verdes.
- t1264 persistencia con PG17 real (55432): 12/12 verdes (6 casos x SQLite y PG).
- t1262 no ejecutado (T1268 pendiente, informativo).

## Verificaciones
1. Orden del PUT (admin-parameter-use-cases.ts): clave del catalogo -> escribible (P5-06=B, 422) -> If-Match con forma de etag -> cuerpo cerrado `{value}` -> valor canonico exacto -> en transaccion etag vs fila (412) -> compareAndSet. 412 real (etag sha256 de clave+valor+updated_at) y CAS real: una sentencia `INSERT ON CONFLICT DO NOTHING` o `UPDATE ... WHERE key AND value AND updated_at` con `changes/rowCount === 1`; si pierde, 412. Ruta: CSRF (hook global) -> sesion -> caso de uso. Test de carrera real en ambos motores (exactamente una gana).
2. `updated_by_user_id` NULL en insert y update (SQL explicito en SQLite y PG; no se enlaza). Auditoria: `{id, adminId, action, objectRef=clave, occurredAt}`, sin valor; probado `not.toContain('37')`. Autor mostrado = ultimo admin de `admin_audit_entries`, nunca el userId.
3. Guarda ERR-SCENE-DISABLED en `RequestSceneGenerationUseCase`: tras `resolveSceneAccess` + rol (404/403) y antes de consentimiento, idempotencia, cuota y limites de tasa; lanza dentro de la transaccion (rollback, sin intento/cuota/job/generador). `RunSceneGenerationUseCase` sin diff (D9-16=A). Tests T1260 comparan conteos antes/despues y el orden con 429/consentimiento.
4. Fila ausente o ilegible = habilitado (`interpretSceneEnabled`: solo 'false' exacto deshabilita; sin puerto o sin metodo = habilitado). Cubierto por 7 filas en t1260.
5. Tope de fotos: `getInt` sin cambios; `isSceneEnabled` usa su propia entrada con el mismo `ttlMs` (<= 60 s, validado). La lectura admin lee la fila directa (sin cache). EDGE-009-015 cubierto en t1258 (conserva fotos).
6. Asercion t1258 acotada (linea 144): `not.toContain('"value":' + JSON.stringify(bad))`. Sigue siendo valida y no vacua: para cada valor invalido (incl. '') la respuesta lleva value=defecto "10", asi que el literal `"value":"<bad>"` seria detectado si se filtrara; el original `'""'` era imposible (el etag JSON contiene `\""`). Se acompana de asercion de source DEFAULT y de valor efectivo. No relajada.
7. Paridad t1264: `describe.each(ENGINES)` SQLite + PG real, 12/12 con PG; incluye find/insert, CAS desfasado, lastEditor y carrera.
8. OBS-1 (`expect(start).toBeGreaterThanOrEqual(0)`, t1260 unit linea 51) y OBS-2 (`toBe(200)` del reinicio en t1262) aplicadas. OBS-3 (alcance del reinicio de escena de hogar) sigue abierta para T1268.

## Observaciones
- OBS-1 (bajo): `lastEditor` desempata distinto entre motores: SQLite `occurred_at DESC, rowid DESC` (orden de insercion) y PG `occurred_at DESC, id DESC` (id aleatorio si es uuid). Dos ediciones de la misma clave en el mismo ms podrian mostrar autor distinto segun motor. Irreal con ms de resolucion y un solo admin por ms; documentar o desempatar por columna monotona.
- OBS-2 (bajo): el etag no cambia si dos escrituras del mismo valor ocurren en el mismo ms (clave+valor+updated_at iguales); el CAS tambien las acepta. Inocuo (mismo valor).
- OBS-3 (bajo): la cache de `isSceneEnabled` es por instancia; con N instancias el apagado tarda hasta 60 s en todas. Documentado y avisado en UI; coherente con REQ-CFG9-002.
- OBS-4 (bajo): `updated_at` en PG se lee con `String(...)`; correcto solo mientras la columna sea TEXT (lo es hoy; pasa PG real). Un cambio a timestamptz rompe etag sin que tsc lo detecte.

## Recomendacion
Pasar a /keymaker para T1268 (reinicio de cuota) tras resolver OBS-3 de la ola 1 con /architect o Neo; /sati revisa la caja. [x] solo Neo.
