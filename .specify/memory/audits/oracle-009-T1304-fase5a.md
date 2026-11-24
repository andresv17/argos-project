# Acta Oracle - 009 T1304: compuerta final de la subfase 5a (2026-11-23)
Veredicto: **PASS CON OBS** (sin [x], sin commit, sin push; contratos y src/generated no tocados por Oracle). HEAD 895e233 + cambios sin commit. PG17 real en 55432.

## Compuerta real (en serie)
- npx tsc --noEmit: exit 0.
- verify-oracles.sh: 511 archivos, 0 debiles, CUMPLE (exit 0).
- verify-traceability.sh --feature 009: 67/78, 11 FAIL (clasificacion abajo), purity 0, exit 1.
- test:gate (PG17): corrida 1 = 435/436 archivos, 6677 pass, 1 fallo = t591-revalidacion (cociente de tiempos scrypt 2.47 < 2); corrida 2 = 435/436, 6677 pass, 1 fallo = t1238 [EDGE-009-012] medianas (0.436..1.268 ms). Ambos son pruebas de TIEMPO distintas en cada corrida; aisladas pasan 3/3 (t591 9/9, t1238 28/28). Sin fallo funcional. Salida de cobertura no impresa (vitest termina con fallo antes del resumen). Exit 1 en ambas: la compuerta NO esta verde por flakiness.
- E2E admin chromium (3141/5241, workers=1): 64/64 passed (4.8 m), incluye t1270 6/6.

## (a) Disco
- Rango 1..50 y formato (0,-1,abc,' 12 ',12.5,51 -> 422 ERR-SCHEMA-VALIDATION-FAILED sin escritura): t1258 API + t1270 UI y API reales verdes.
- Autoria: updated_by_user_id NULL, autor desde admin_audit_entries (t1258, 'Editado por: Tu' en t1270).
- Propagacion <= 60 s: PARAMETER_CACHE_TTL_MS = 60_000 (platform-parameters.ts:25), cached-platform-parameter.ts rechaza ttl > 60 s; t1270 espera con sondeo hasta 75 s y ve 12, disabled=true/false.
- Sin claves nuevas desde la interfaz: migraciones 0021 (SQLite) / 0017 (PG) siembran solo scene.enabled; comentario explicito de que global_quota_max, modelo, region y prompt NO se siembran; t1263 14/14 con PG real.
- scene.global_quota_max NO editable en 5a (P5-06=B): las 5 claves de 5b son writable=false (t1269 e2e "claves de 5b sin campo ni boton", verde) y el PUT de claves 5b da 422 (t1258, acta ola 1).
## (b) Tareas REVIEW
T1256/T1257/T1302 (contratos architect-009-fase5a-contratos.md), T1258/T1260/T1262/T1263 (ola 1), T1264/T1266 (ola 2), T1268 (ola 3), T1293/T1297 (ola 4), T1269 (olas 5-7), T1270 (esta acta): todas con veredicto PASS CON OBS previo y pruebas verdes en esta corrida (e2e 64/64; vitest completo salvo 1 flaky de tiempo por corrida).
## T1270 en disco
Aserciones no vacuas: 10->12 con 10 subidas 201, undecima 409 antes, 11 y 12 = 201, 13 = 409, limits {12,12} y "12 de 12 fotos"; 6 invalidos por API real = 422 + codigo + valor intacto; 412: PUT externo cambia a 20, la UI recibe aviso y recarga 20, PUT sin If-Match 422, valor no escrito; ERR-SCENE-DISABLED: 409 + code exacto, quota.remaining invariante, imagen vigente igual (imageTag), caja gris y botones deshabilitados, habilitar reanuda y consume exactamente 1; reinicio: cancelar no reinicia, cuenta vinculada vuelve al maximo, cuenta ajena y escena de hogar compartido (owner NULL) intactas con quota consumida verificada < maximo, idempotente. API real (createProductionApp, SQLite, portal y SPA reales); simulados solo Google admin y generador.
OBS T1270 (bajas): (1) el 412 se afirma por mensaje de UI y valor del servidor, no por el codigo HTTP 412 en esa prueba (el status 412 lo cubre t1258); (2) test 3 `if (list.status === 200 && Array.isArray(...))` hace condicional la verificacion de 12 fotos (limits {12,11} la cubre igual); (3) la propagacion espera hasta 75 s por sondeo, suite lenta (4.8 m); (4) la vinculacion admin<->cuenta se siembra por SQL (no por flujo 008).
## Trazabilidad 009: 11 FAIL
- Fase 5b (no bloquean 5a): ERR-ADMIN-SCENE-COST-CAP-EXCEEDED, INV-CFG9-001, INV-CFG9-002, REQ-CFG9-004, REQ-CFG9-005 (T1259/T1261/T1265/T1267/T1296/T1305).
- Fase 5a: **INV-CFG9-003** (sin titulo it/test; solo en describe t1258:128) y **REQ-CFG9-008** (sin @implements ni test; solo catalogo cerrado, es regla negativa). Ambos son de trazabilidad textual, no de comportamiento (INV-CFG9-003 esta probado por t1258/t1260 "fila invalida"; REQ-CFG9-008 por 5b writable=false y 422). Fix trivial: anadir ID al titulo de un it y @implements (keymaker), antes de T1273.
- Deuda registrada Fase 1 (T1273): REQ-LIM9-004, REQ-LIM9-005, REQ-PRO9-007, INV-LIM9-001.
## OBS
1. test:gate no verde por 2 pruebas de tiempo flaky distintas (t591 scrypt cociente 2, t1238 medianas sub-ms); estabilizar (tolerancia absoluta/reintentos) o excluirlas del paralelo antes de T1273; cobertura sin medir.
2. INV-CFG9-003 y REQ-CFG9-008 trazables en 5a: cerrar etiqueta.
3. OBS previas abiertas: OBS-3 ola 1 / OBS-5 sati / sati formal 320-1024-1280 pendiente; archivos de test untracked (t1293 y otros) deben entrar al commit.
