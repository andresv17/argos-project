# Acta Oracle — 009 Fase 5a, ola 1 (T1258, T1260, T1262, T1263) — 2026-11-23

Veredicto: **PASS CON OBS**. Sin [x], sin commit, sin push. Auditoría en disco, HEAD 895e233 + cambios sin commit.

## Compuerta real
- `npx tsc --noEmit`: exit 0.
- `bash scripts/verify-oracles.sh`: 504 archivos, 0 débiles, CUMPLE (exit 0).
- Rojas (4 archivos): 96 failed / 21 passed (117). T1258 = 69 rojas, T1260 api = 12 + unit = 1, T1262 = 14 (coincide con lo declarado por keymaker). Causa roja real: rutas `/api/admin/parameters*` no existen (404), `ERR-SCENE-DISABLED` y `SceneView.disabled` no implementados, caja ausente.
- T1263 con PG17 real (55432): 14/14 verde. Persistencia completa + t803 con PG: 62 archivos, 952 passed / 1 skipped.

## (1) Las rojas prueban requisitos
- T1258: catálogo de 6 claves y orden fijo, forma cerrada de la vista, rango/formato canónico (0, -1, abc, ' 12 ', 12.5, 51, '', 1e1, +5, 012, '5 ', dígitos árabes), cuerpo cerrado, scene.enabled solo true/false, claves fuera del catálogo y de 5b => 422 sin escribir, autoría (updated_at, updated_by NULL, autor en admin_audit_entries sin valor), If-Match/412 y concurrencia 200+412, orden CSRF-sesión-esquema-412, efecto en caliente con cache 60 s y conservación de fotos (EDGE-009-015). Aserciones sobre estado real (fila, auditoría, conteos), no solo códigos. REQ-CFG9-001/002/007, EDGE-009-014/015/016, SC-009-017..020 cubiertos.
- T1260: 409 ERR-SCENE-DISABLED en las dos rutas de generación, `type` urn y detalle exacto (coincide con catálogo 006 1.1.0), sin intento/cuota/job/llamada (counts antes=después), orden tras autorizar y antes de cuota, 429 y consentimiento (cada uno aislado y rojo hoy por su código distinto), imagen vigente visible, `disabled`, canUpdate/canRegenerate false, D9-16=A (generación en curso publica). REQ-CFG9-003, EDGE-009-019, SC-009-021 cubiertos.
- T1262: alcance por sub o correo verificado, ajenas intactas (MARIA sin verificar, CARLOS), contador global intacto, historial/imágenes intactos, cuerpo vacío, EDGE-009-022/023 (CAS, 200|409 sin parciales), auditoría sin ids ni contadores, no es parámetro. REQ-CFG9-006, SC-009-026 cubiertos.

## (2) Las 21 que pasan hoy
Legítimas como regresión (comportamiento vigente que 5a no debe romper): 11.a foto rechazada con fila inválida (INV-CFG9-003, T1258); 7 filas scene.enabled inválidas/ausentes no bloquean (defecto true), imagen 302 sigue, blockedReason intacto, ventana de cache 30 s, 404 sin membresía, 401 sin sesión (T1260); sin falsos verdes por accidente salvo lo anotado en OBS-1/OBS-2. Las pruebas de 404 uniforme y CSRF 403 de /admin pasan hoy porque el guard global ya responde igual (CSRF) o por ruta inexistente (404): correcto para CSRF, trivial para 404 hasta que exista la ruta (queda con valor tras T1264/T1268 porque compara contra el 404 de ruta desconocida).

## (3) Migración
0021 SQLite / 0017 PG: un solo INSERT, `ON CONFLICT (key) DO NOTHING`, valor 'true', autor NULL, sin DDL, sin UPDATE/DELETE, sin BEGIN/COMMIT en PG. 0007 PG y 0011 SQLite sin diff y sin `scene.`. No siembra otras claves (probado en SQLite y PG vivo). Respeta fila existente (probado con 'false' manual y reaplicación doble en PG).

## (4) Paridad
Misma clave, valor, descripción y autor (prueba textual) y paridad viva PG: filas finales idénticas. Única divergencia legítima: expresión de fecha (strftime vs to_char), ambas ISO ms Z, verificada con regex en ambos motores.

## (5) Pins editadas (7 archivos, no 5)
Todas necesarias y no relajan: t803 (+ERR-SCENE-DISABLED y 8 códigos 006 = catálogo 1.1.0), postgres-pool (último 0017, total 17), sqlite-repositories (listas de migraciones + 0021), t1219 y t1242 (posición at(-4)/at(-2) en vez de última; mismas aserciones de contenido), platform-parameter-repository y schema-parity (filtro `WHERE key='album.max_photos_per_pet'` porque ahora hay 2 filas sembradas). Sin deletes de aserciones. Compensación del filtro: T1263 fija el conjunto exacto de filas (`toEqual` de 2 filas en base nueva y PG).

## Observaciones
- OBS-1 (bajo): `t1260-caja-deshabilitada` "no revela la causa" usa `html.indexOf(BOX)` sin afirmar `>= 0`; hoy pasa de forma vacua (slice(-1,299)). Tras T1266 es válido, pero conviene `expect(start).toBeGreaterThanOrEqual(0)` (keymaker, trivial).
- OBS-2 (bajo): `t1262` "NO toca cuentas ajenas" no verifica el 200 del reinicio; hoy pasa porque la ruta no existe. Un reinicio que no hiciera nada pasaría este test (lo cubre el primero de la suite). Añadir `expect(status).toBe(200)`.
- OBS-3 (medio, decisión de spec): T1262 test 1 afirma que la escena DEL HOGAR H1 (owner_user_id NULL, compartida con miembros no administradores) se pone a cero por ser el administrador miembro/propietario. REQ-CFG9-006/D9-10 habla de contadores "por propietario de cuentas de usuario del administrador"; el reinicio de una escena de hogar compartida beneficia a otros miembros. Pedir a /architect confirmar el alcance (o a Neo) antes de T1268.
- OBS-4 (bajo): muchas rojas de T1258 fallan por `TypeError` de `viewOf` (lista 404) y no por la aserción de la operación PUT; rojo válido, pero el diagnóstico será más claro con un helper que afirme 200 en la lista. No bloquea.
- OBS-5 (bajo): `T1263` y t1242/t1219 fijan "última migración"; la 5b (T1303) romperá `at(-1)` si añade migración. Mismo patrón ya asumido en fases previas.
- Documentales: t801 (006) y t796 (005) no bloquean por instrucción.

## Recomendación
Pasar a /keymaker para T1264/T1266/T1268 (puertos, rutas, interruptor, reinicio) y la caja (T1266 UI, revisión /sati). Atender OBS-3 antes de T1268.
