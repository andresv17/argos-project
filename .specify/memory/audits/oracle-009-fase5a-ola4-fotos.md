# Acta Oracle 009 Fase 5a ola 4 (T1293 + T1297, EDGE-009-048) - 2026-11-23
Veredicto: PASS CON OBS. Sin [x], sin commit, sin tocar src/ ni contratos.

## Evidencia en disco
- src/application/use-cases/media-use-cases.ts: sin diff (git diff HEAD vacio; ultimo commit 3fef7b4). Lineas 162-165: runInTransaction + lockOwnerThenPet + countByPetAndKind + assertAlbumHasRoom antes del insert, misma transaccion (INV-005-003). Linea 145 es solo rechazo barato previo.
- Archivo nuevo (untracked): tests/integration/media/t1293-tope-fotos-concurrente-009.spec.ts (93 lineas).
- npx tsc --noEmit: exit 0. verify-oracles.sh: 507 archivos, 0 debiles, CUMPLE.
- vitest sin PG: 2 passed, 1 skipped (PG). Con PG17 (55432): 3 passed. SQLite dos conexiones tarda ~5.2 s.

## Decisiones
1. T1297 cierra sin cambio de codigo: ACEPTADO. El requisito ya se cumple en los tres motores; EDGE-009-048 pide "verificar antes en src/" y el resultado de esa verificacion es "ya transaccional". Rojo previo imposible sin inventarlo; el mutante (conteo comentado) es la evidencia sustituta aceptable. Condicion: T1297 debe documentar en tasks "sin cambio de codigo, cubierto por T1293 y INV-005-003".
2. T1293 no vacua y cubre memoria, SQLite y PG: ACEPTADO. Aserciones: resultados exactos [LIMIT, OK], total 10 en BD, 1 objeto en storage, cola vacia. Memoria+SQLite en proceso via createMediaEngines; SQLite con dos conexiones; PG real con dos clientes, omitido sin TEST_DATABASE_URL (ejecutado aqui: verde). Mutante reportado por Keymaker (rojo en PG y memoria): NO reproducido por Oracle porque la regla me prohibe tocar src/; se acepta como reporte con la logica del codigo que lo respalda.
3. Mutante pasa en SQLite: no es fallo de la prueba. BEGIN IMMEDIATE serializa escrituras, asi que el conteo sin candado explicito sigue siendo seguro; la prueba verifica el invariante de resultado, no el mecanismo. Observacion: en SQLite la prueba no distingue "candado de mascota" de "serializacion del motor".
4. Reintento SQLITE_BUSY no enmascara: ACEPTADO. Solo se reintenta la entrada (BUSY al abrir transaccion, antes de leer conteo); no reintenta ERR-MEDIA-ALBUM-LIMIT ni otros errores (se relanzan); el resultado final sigue exigiendo exactamente un OK y un LIMIT.

## OBS
- OBS-1 SQLite sin sensibilidad al mutante (ver 3); la deteccion de ausencia de candado descansa en PG y memoria.
- OBS-2 Prueba SQLite ~5.2 s (busy-wait); vigilar flakiness/timeout (60 s configurado).
- OBS-3 Mutante no reproducido independientemente.
- OBS-4 Archivo del test aun untracked; incluirlo en el commit de Neo/Morpheus.
