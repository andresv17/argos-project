# Acta /architect — 012 Bloque C, correccion D-1..D-3 de /mouse (2026-11-27)

- D-1: error-catalog.json (specs/012-.../contracts/errors) x-sdd-metadata: status APPROVED se conserva solo para lo previo; añadido `amendment_status` {"0.3.0": DRAFT pendiente de Neo, alcance ERR-CAR12-ROUTINE-STALE} (linea 7). Version 0.3.0 y change_note intactos. El formato no admite estado por entrada sin tocar el compilador.
- D-2: tasks.md T1653 (linea 103) cita REQ-CAR12-002; T1654 (linea 104) cita SC-012-040 por separado (antes rango 037..040). Sin [x].
- D-3: ERR-HOUSE-NOT-FOUND añadido a `inherited` (linea 42), solo el nombre, sin redefinir (definido en 001/002/004).
- Gates: verify-traceability --feature 012 rc=0 (299/299 CUMPLE); verify-oracles rc=0 (0 debiles).
- No ejecutado compile-contracts.sh (regenera src/generated); keymaker debe correrlo al aprobar. Riesgo: validacion de `inherited` contra 004/002; ERR-HOUSE-NOT-FOUND existe en ambos.
