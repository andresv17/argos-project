# Acta Oracle — Feature 012 Bloque A, dominio y casos de uso (68ec963..1283ba5) — 2026-11-26
Veredicto: CUMPLE CON RESERVAS. Solo lectura; sin add/commit/push, sin [x], sin APPROVED/LOCKED.

## Gates
- tsc --noEmit rc=0; verify-oracles rc=0 (635 archivos, 0 debiles); verify-traceability --feature 012 rc=0 (62/331 trazados, pureza 0 violaciones); semgrep tests/security/sast-rules src/ rc=0, 0 hallazgos (y t1621 con semgrep --test verde).
## Vitest 012 (9 archivos)
- 197 verdes, 2 rojas, 43 omitidas (PG sin TEST_DATABASE_URL y casos sharing). Las 2 rojas son el MISMO caso (REQ-OWN12-008 (b) / EDGE-012-044, importar respaldo con chip registrado) en memoria y SQLite: se recibe ERR-BACKUP-REFERENTIAL-INTEGRITY en lugar de ERR-CHP12-MICROCHIP-REGISTERED. Es B-2 (Bloque B). Aserto intacto: el archivo parity conserva 20 it (igual que ce59bca) y la linea 333 no fue editada.
- T1614: can-act-on-pet 47 + co-ownership-domain 51 = 98 verdes.
## Alcance de commits
- Ninguno toca terraform, deploy-argos.yml, app-config, app.ts, server.ts, .env.example, origin-verify, specs/005/tasks.md ni tests/unit/origin-verify-guard. Contratos 001..011: ninguno; solo se agregan src/generated/v38 (nuevo) y scripts/compile-contracts.sh/codegen.mjs. El archivo codegen-drift.spec.ts (1 linea) solo anade 'v38' a la lista de exclusion.
## Migraciones
- 0034 SQLite: reconstruccion identica a 0013 (columnas, CHECK entity_type, CHECK MIGRATION, STRICT, 3 indices, INSERT..SELECT de las 8 columnas, sin FK ni dependientes); 0019 y posteriores no redefinen audit_log. Sin perdida de datos. 0030 PG: DROP/ADD del CHECK audit_log_mutation_type_check con la misma lista de 27 tipos (10 previos + 17 nuevos); paridad textual con 0034. Paridad 0033/0029 intacta (no modificadas). Es propuesta Nivel 2 pendiente de Neo (B-1).
## Debilitacion de pruebas
- Sin aserciones eliminadas ni it removidos. Cambios: firma DomainError por forma, campo principalUserId, listas de migraciones por la nueva 0034/0030 (aceptable), fixture makeCoOwners (flujo de aprobacion), unshare ampliado, relectura de la solicitud tras supresion (mas estricta).
## Hallazgos
1. [Reserva] 2 rojas = B-2 pendiente (Bloque B), no debilitacion.
2. [Reserva] Tests parity/races cambian TRANSFER_PRINCIPAL por CHANGE_PRINCIPAL en 2 casos (SC solicitud pendiente; carrera aprobar||LEAVE). La accion sigue vigente en dominio y data-model; cambio justificado por el nuevo flujo pero reduce cobertura de TRANSFER_PRINCIPAL en esos casos: confirmar que existe otra prueba que la cubra.
3. [Reserva] 0034/0030 son esquema de Nivel 2 sin firma de Neo (B-1).
4. [Obs] 43 omitidas incluyen todo PG: paridad PG no ejecutada en vivo, solo estatica.
5. [Obs] Working tree conserva H-01 modificado sin commitear (fuera de los 7 commits), correcto.
