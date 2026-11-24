# Oracle 009 Fase 5b Ola 1 - Auditoria del rojo legitimo (T1261, T1295)
Fecha: 2026-11-23. Veredicto: PASS CON OBS. Sin [x], sin commit, sin tocar src/ ni contratos ni tests.

## Compuerta real
- npx tsc --noEmit: exit 0. verify-oracles: 513 archivos, debiles 0, CUMPLE.
- vitest (2 archivos): t1261 39 tests, 36 rojos, 3 verdes; t1295 15 tests, 11 rojos, 4 skip (PG sin URL). Test Files 2 failed.
- PG real (127.0.0.1:55432): t1295 15 failed (15), 0 skip; rojos de PG incluyen el contrato PG por intento y la paridad de migracion.

## Causa del rojo (por ausencia, no por la prueba)
- t1261: "Failed to load url ../../src/domain/scene/prompt-blocks.ts" (modulo inexistente) en los tests que lo cargan; buildImagePrompt(payload) ignora el 2.o argumento (build-image-prompt.ts:86) -> "expected ... to contain 'A tidy test room...'"; catalogo scene.prompt.blocks defaultValue '{}' sin constraints.maxBlockLength (writable false).
- t1295: markProviderCall(attemptId, now) sin tercer parametro (port:148) -> providerModel/providerLocation undefined ("expected undefined to be null"); pragma_table_info sin provider_model/provider_location; SQL PG sin ALTER TABLE scene_attempts ADD COLUMN.

## Cobertura y no vacuidad
- REQ-CFG9-005: 6 bloques nombrados, semilla byte a byte, prompt identico con valores iniciales (6 payloads), reemplazo por bloque, {photoRef} sustituido, pureza.
- LCK-24/INV-CFG9-002: RECOGNIZED_MARKERS == ['{photoRef}'] y 13 marcadores hostiles x 6 bloques (78 combinaciones), {photoRef} solo en HOUSEHOLD_WITH_PHOTO y obligatorio alli.
- EDGE-009-044: PRESERVATION_BLOCK editado 1 vez solo con foto (5 casos 0/1) y no aparece el literal; bloque editado con el texto de preservacion se rechaza.
- EDGE-009-020/SC-009-025: JSON invalido, vacio, tipos, faltante/extra/repetido, vacio por bloque (x6), largo > limite y justo = limite, texto que imita JSON/IMG_n/conteo.
- D9-22=A: modelo y region guardados al marcar, dos intentos con config distinta conservan cada uno la suya (reintento), null sin marca, solo 3 campos provider*, paridad Memoria/SQLite/PG, columnas TEXT nulables sin DEFAULT (sin coste simulado).
- Sin numero inventado: maxBlockLength se lee de catalogo (constraints) y se exige tipo number; no hay literal.
- Sin it.todo; los pendientes (PUT /admin, lectura en caliente, gasto por modelo x region, filas previas con coste maximo) estan como comentario.

## Los 3 verdes
1. "hogar con foto no usa generico y viceversa", 2. "pura y determinista", 3. "valor invalido -> defecto". Son guardas de regresion legitimas del comportamiento actual (no dependen de funcionalidad ausente).

## OBS
- OBS-1: los 3 verdes son hoy debiles: (1) pasa trivialmente porque los bloques se ignoran, (2) y (3) comparan buildImagePrompt consigo mismo; adquieren dientes tras T1267. Aceptable como guarda, no como oraculo de cierre.
- OBS-2: EDGE-009-044 "texto sin la instruccion de preservacion se rechaza": solo se prueba vacio/espacios y duplicacion; falta caso de PRESERVATION_BLOCK no vacio sin instruccion (depende de definir criterio de "contiene instruccion"; Architect/Keymaker en T1254).
- OBS-3: reintento "usa su propia configuracion" se prueba solo a nivel repositorio (dos marcas); la lectura vigente por el caso de uso queda como pendiente comentado (T1298/T1267).
- OBS-4: contrato de nombres (prompt-blocks.ts, markProviderCall(..., {model, location}), providerModel/providerLocation) es propuesta de keymaker; requiere confirmacion de /architect antes de T1267/T1298.
