# Veredicto Oracle - H-T249-2 contra d193d9c (2026-11-12)

## Veredicto: APTO

## Evidencia en disco
1. `git diff 497c12d..d193d9c --stat`: 5 archivos; codigo solo en tests/fixtures/repository-contract-suite.ts (+7/-4) y tests/integration/persistence/sqlite-repositories.spec.ts (+3/-3); el resto son claude/ (evidencia, log-keymaker, registro). Sin cambios en src/, migraciones, specs/, contracts/ ni src/generated/.
2a. INV-ARCH-005: Carlos se guarda ACTIVE y pasa a LEFT; oraculo concreto `carlos: ['LEFT']`; ofHousehold/ofAndres/ofBoth siguen derivando de MEMBERSHIPS (mismos membershipId).
2b. REQ-ACC-002: filtro `status !== 'INVITED'`; aserciones sin cambio. La invitacion vive en household_invitations (cubierta por prueba REQ-HOUSE2-001 de la suite, repository-contract-suite.ts:359).
2c. INV-HOUSE-003: titulo "ACTIVE", mismo ID; duplicate ACTIVE rechazado con SQLITE_CONSTRAINT_UNIQUE (household_members_one_open_per_user) y oraculo concreto de statuses. La unicidad de INVITED abierta sigue cubierta por repository-contract-suite.ts:359 (segunda INVITED rechazada, indice household_invitations_one_open en migraciones 0002/0004), y INV-HOUSE-003 mantiene cobertura en unit household-policies, property households y households.api.
3. Oraculos: lineas cambiadas sin toBeDefined/toBeTruthy/toBeFalsy/any/skip/todo/only/toContain ni solo longitudes.
4. Ejecucion: sqlite-repositories 37/37; account-deletion.api + account.api 22/22; unit account-deletion 26/26; tsc exit 0; verify-oracles 81 archivos, 0 debiles, CUMPLE.

## Hallazgos
- H-T249-2: CERRADO.
- Menor (no bloqueante): el rechazo de la segunda INVITED en la suite se afirma con `rejection(...).not.toBe('resolved')`, sin nombrar el indice; preexistente, candidato a DEUDA para endurecer.
- Arrastre: 32 fallos de integracion documentados (B2 audit_log/OpenAPI/backup), no atribuibles a este commit.
