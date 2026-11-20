# Evidencia OBS-A y OBS-C de T883 (006, HEAD ba3c750 / cb31aaa)

Fecha: 2026-11-18. Ejecutado por Morpheus por orden de Neo.

## OBS-A: gate con PostgreSQL 17 real
- Contenedor desechable: `postgres:17` (PostgreSQL 17.12) en 127.0.0.1:55432, contraseña temporal aleatoria no persistida. Se elimina tras la corrida.
- Comando: `TEST_DATABASE_URL=<url> npm run test:gate`, rc=0.
- Resultado: Test Files 314 passed (314); Tests **4900 passed | 1 skipped (4901)**.
- Única omitida: `tests/integration/persistence/t558-login-recorte-purga.spec.ts` (1 de 9, prueba de 004, no de escena/PG de 006). Cero fallos.
- Log completo: `/private/tmp/claude-501/-Users-andresvalejo-Documents-Tecnica-Proyecto-Argos/9da5e1b7-250b-4a77-93e1-d22bb8358f24/scratchpad/test-gate-pg17.log` (scratchpad).
- Compuerta de trazabilidad 006: CUMPLE (195/195 propios mapeados; 180/233 trazados; pureza 0).

## OBS-C: IDs propios de 006 sin @implements en src/
- Universo calculado con grep sobre spec.md y contracts de 006 (IDs REQ/INV/NFR/SC/EDGE-ESC6, STATE-SCENE, ERR-SCENE): 196 IDs.
- Con @implements en src/ (sin generated): 157. Sin trazar: **39**.
- De los 39, **4 pertenecen al alcance de T885 (bloqueada)**: REQ-ESC6-028, SC-ESC6-042, SC-ESC6-043, SC-ESC6-060.
- Los **35 restantes no son de T885 ni son documentación**: son IDs de comportamiento del tramo fake (EDGE, INV, SC y REQ de escena, hogar y consentimiento) cuyas pruebas existen, pero no tienen la etiqueta @implements en src/. Es evidencia informativa para la compuerta final (no bloquea sin SDD_STRICT_EVIDENCE=1).
- Nota: la cifra 53/233 del oracle incluye IDs de 002/003/004 y constitución; este desglose es solo de 006.
