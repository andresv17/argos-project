# Acta Oracle — Borradores 5b sin cifras (T1254, T1299, T1300, MINOR 005) — 2026-11-23

Veredicto: **PASS CON OBS**. HEAD dc535bd, cambios sin commit. Sin [x], sin commit, sin push, sin tocar src/tests/contratos.

## Evidencia (salidas reales)
- `bash scripts/verify-oracles.sh`: 514 archivos, 0 oraculos debiles, CUMPLE, exit 0.
- tsc no ejecutado (sin codigo nuevo, segun mision).
- Schema JSON: `JSON.parse` ok.

## (1) T1299 nota latente 006 spec.md: PASS
Seccion «Nota de enmienda 009 (T1299)»: declara `SCENE_GLOBAL_LOCATION_ENABLED = false`, global no habilitada, no se anade a ninguna lista activa (REQ-ESC6-017/031, /admin, validador), condiciones 1..8 todas ABIERTAS, contratos 006 intactos. Cita acta rama T1294 (FAIL para habilitar global).

## (2) T1300 regla-coste-micro-usd-009.md: PASS
Formula `gastoAcumuladoMes + max(0, max'-usadas) x T <= 5_000_000`; techo `floor(5_000_000/costeMin)` sin valor; fail-closed (sin par seleccionable no editable, falta de dato = rechazo); reinicio no reduce gasto (§5); D-3 EDGE-009-044 (trim 1..1000). Elimina SCENE_GLOBAL_QUOTA_MAX_CEILING=1000.

## (3) MINOR 005 platform-parameter.schema.json 1.0.1 -> 1.1.0: PASS
Diff: solo `version`, `supersedes`, `change_type` MINOR, `change_note` y `value.maxLength` 200 -> 8192. `description.maxLength` intacto (200), sin cambio de propiedades/tipos/enum/required. Retrocompatible, sin migracion (columna TEXT).

## (4) Constitucion 009-B DRAFT: PASS
- Linea `**Version**: 3.9.0` (l.326) intacta; 3.10.0 solo como PROPUESTA en cabecera.
- Cabecera nueva y Anexo A marcados DRAFT; el unico APPROVED nuevo es la negacion «Sin APPROVED ni LOCKED» (otras apariciones son de 3.9.0 y previas, firmadas por Neo).
- Anexo A: 15 filas regionales x 3 modelos = 45 celdas `NO VERIFICADA (pendiente tarifa oficial Vertex)` (grep -c = 15 lineas); fila `global` = FUERA DE LA ENMIENDA.
- Sin cifras de coste por intento en celdas ni en la regla.

## (5) tasks.md 009: PASS
`git diff -U0`: solo 4 lineas cambiadas (T1254, T1255, T1299, T1300), todas notas de estado «No marcada [x]». Ningun `[x]` nuevo en 009.

## Observaciones
- OBS-1 (cifras): el grep 45_000/75_000/150_000 SI da coincidencias: constitution.md l.349 (Anexo A) y regla-coste l.10 las nombran, junto con 158.160, **como cotas de la directiva D-2 NO confirmadas por fuente y no transcritas como valor**. No son decreto ni celda; no valido tarifa. Recomiendo que Morpheus decida si un Anexo normativo debe nombrar cifras no verificadas (riesgo de que se lean como oficiales al firmar T1255); opcion: dejar solo «cotas D-2 no confirmadas» sin numeros. El grep `111` solo da falsos positivos (REQ/SC-ESC6-111, etc.).
- OBS-2 (regla de lectura 1 del Anexo A): con las 45 celdas no verificadas, /admin no puede guardar modelo, region ni global_quota_max (fail-closed deliberado). Neo debe saberlo al firmar T1255.
- OBS-3 (drift de contratos): el schema 005 1.1.0 modifica un contrato compilado (`src/generated/v33/schemas/*`); requiere `bash scripts/compile-contracts.sh`/nueva version generada (antecedente: «v34 requerido por drift CI») antes de la compuerta; no ejecutado por mi (prohibido tocar contratos/src). `platform-parameters.ts` y el validador generado aun llevan maxLength 200 hasta regenerar.
- OBS-4 (ajeno al alcance): `src/domain/platform/admin-parameter-catalog.ts` y `src/domain/scene/build-image-prompt.ts` figuran modificados sin commit (olas 5a/5b previas); no auditados aqui. `specs/005 tasks.md` T797 `[x]` es pre-existente (2026-11-18, firma de Neo, registrada). `specs/006 research.md` anade nota T1301 de Link (REQ-ESC6-028 sigue abierto), coherente con la condicion 1 abierta.
- OBS-5: la nota de T1299 dice que SCENE_GLOBAL_LOCATION_ENABLED no existe aun en src (grep vacio); lo implementan T1265/T1271 (consistente, no es defecto).
