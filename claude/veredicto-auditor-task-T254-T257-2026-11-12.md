# Veredicto Oracle T254-T257 [US5/US6] — fase ROJA (2026-11-12) — commit d83cb77

VEREDICTO: APTO (con supuestos de fase verde declarados; ninguno bloquea el rojo)

## Evidencia literal
1. Alcance: 13 archivos, 896 inserciones/13 borrados. Fuera de tests/ y claude/: ninguno (git show --name-only filtrado = vacio). Nada en src/, specs/, contracts/, src/generated/, migraciones ni tasks.md (git diff --stat HEAD~1 HEAD -- src specs = vacio).
2. vitest (8 archivos): audit-canonical y audit.property: "Failed to load url src/domain/audit/canonical-json.ts" (0 tests, modulo ausente). record-invariants: 2 fallas, "Failed to load url src/domain/records/superseded-guard.ts". audit-pseudonym: 3 de 4 fallan con "expected 'sin error'" (config sin validacion de ARGOS_AUDIT_HMAC_SECRET; el cuarto pasa). roles-migration: 5 de 13, "no such table: audit_log" y esquema sin tabla (4 con tabla ausente + 1 con columnas []). account-deletion: 5 de 14, "no such table: audit_log". audit.api: 16 de 18; 15 por "no such table: audit_log" y 1 (DELETE peso) por contrato OpenAPI: respuesta application/json en vez de problem+json (ruta DELETE inexistente). pets-records: 6 fallas = 3 nuevas (PATCH vacuna, DELETE vacuna, PATCH lector; mismo "application/json en vez de problem+json" = ruta inexistente) + 3 GET /pets preexistentes (REQ-PET-005, D-03/EDGE-039, REQ-PET2-002), que NO estan en el diff (grep = 0) y la evidencia de Keymaker ya declara de la base.
3. Secretos: password, passwordHash/password_hash, token, tokenHash/token_hash, confirmationToken/confirmation_token, cookie en audit-canonical y audit.property (SECRET_KEYS). sessionId retirado de la lista; aparece solo en el caso "sessionId NO es secreto" (vista lo conserva) y en "sessionId cuenta como campo publico" (hash cambia) y como PUBLIC_KEYS en la propiedad.
4. Oraculos: sin toBeDefined/toBeTruthy/toBeFalsy/any/skip/todo/only. Observaciones menores en el diff: toHaveLength(1) sobre filas (cuenta exacta, aceptable, 3 usos), .length comparado con valores numericos exactos (audit-pseudonym/account-deletion), `not.toContain('auditoria inyectada')` (negativo de texto, audit.api) y `expect([...]).toContain(estado)` en alerts.property (pertenencia a conjunto cerrado de 3 estados, oraculo concreto). Ninguno es solo longitud ni debilita la prueba.
5. Saneamiento Keymaker: record-invariants y records.property solo llevan el fixture 001 a forma 002 (category, veterinarianName/License null, batchOrClinic) dentro de las pruebas; los oraculos existentes siguen intactos (unicos cambios en lineas existentes: la definicion del fixture y un delete input['category']). src intacto. records.property y alerts.property: 13/13 verdes hoy (las pruebas nuevas ahi son guardas de regresion, no rojas; coherente porque la validacion 002 ya existe en dominio).
6. tsc --noEmit: 6 errores, todos TS2307 de src/domain/audit/{canonical-json,state-hash,canonical-view}.ts (las 2 suites T253); cero en el resto (superseded-guard se importa dinamico). verify-oracles.sh: 88 archivos, 0 debiles, CUMPLE.

## Hallazgos
- H-T254-1 (menor): pets-records mezcla 3 nuevas rojas con 3 GET /pets preexistentes; T260-T263/verde no debe atribuir estas ultimas a la rebanada. Conviene registrarlas como deuda de base.
- H-T254-2 (menor): las fallas de PATCH/DELETE se ven como violacion de contrato (content-type) y no por status 404/405; la causa es ausencia de ruta, pero el oraculo de status solo se ejercita cuando la ruta exista.
- H-T254-3 (menor): audit-pseudonym conserva 1 prueba verde (la de secreto presente valido), es regresion y no rojo.

## Supuestos para la fase verde (no bloquean)
1. Secreto de prueba fijo en desarrollo/test (contrato de config).
2. NODE_ENV=production exige ARGOS_AUDIT_HMAC_SECRET de 64 hex (>= 32 bytes); vacio, corto o no hex falla sin copiar el valor al error.
3. assertRecordNotSuperseded(status) en src/domain/records/superseded-guard.ts lanza DomainError ERR-REC-SUPERSEDED-IMMUTABLE 409.
4. Ajustar tests/unit/app-config.spec.ts al exigir el secreto en produccion.
