# Evidencia Keymaker — T254 a T257 (fase ROJA) y ajuste de T253 — 2026-11-12

Rama 002-plataforma-v21, base 7c079e9. Sin cambios en src/**, specs/**, contracts/**, migraciones ni .specify/**. tasks.md sin marcar.

## Autorización de Neo (Nivel 2) aplicada a T253 (lista canónica de secretos)
Secretos: password, passwordHash/password_hash, token, tokenHash/token_hash, confirmationToken/confirmation_token, cookie. sessionId se retira de la lista (no es secreto; ahora hay un caso que exige conservarlo). email, displayName y microchipId siguen excluidos.
- tests/unit/audit-canonical.spec.ts: un caso concreto por cada credencial nueva (password_hash, tokenHash, token_hash, confirmationToken, confirmation_token), caso de sessionId conservado y hash que cambia con sessionId.
- tests/property/audit.property.spec.ts: SECRET_KEYS ampliada, sessionId pasa a clave pública, la propiedad del hash altera ahora todas las credenciales.
- Rojo: ambos siguen fallando por módulo ausente (Failed to load url ../../src/domain/audit/canonical-json.ts).

## Archivos
Nuevos: tests/fixtures/audit-fixtures.ts (secreto y vectores HMAC del contrato, hmacHex, auditRows/insertAuditRow), tests/integration/api/audit.api.spec.ts (T254), tests/integration/persistence/audit-pseudonym.spec.ts (T256, configuración).
Ajustados: tests/integration/api/account-deletion.api.spec.ts (T256), tests/integration/persistence/roles-migration.spec.ts (T257), tests/unit/record-invariants.spec.ts, tests/property/records.property.spec.ts, tests/property/alerts.property.spec.ts, tests/integration/api/pets-records.api.spec.ts (T255), audit-canonical y audit.property (T253).

## Causas rojas por archivo (literales)
- tests/unit/audit-canonical.spec.ts y tests/property/audit.property.spec.ts: `Error: Failed to load url ../../src/domain/audit/canonical-json.ts ... Does the file exist?` (módulo ausente; también state-hash.ts y canonical-view.ts).
- tests/integration/api/audit.api.spec.ts (rojas las que leen audit_log; el vector HMAC del contrato pasa): `SqliteError: no such table: audit_log`. El mantenimiento (`src/application/use-cases/maintenance-use-cases.ts`, `runMaintenance`) se importa de forma dinámica; faltará también tras crearse la tabla.
- tests/integration/api/account-deletion.api.spec.ts (5 nuevas rojas): `SqliteError: no such table: audit_log`. Las 8 anteriores siguen verdes.
- tests/integration/persistence/audit-pseudonym.spec.ts (3 rojas, 1 verde): `AssertionError: expected 'sin error' to deeply equal { variables: ['ARGOS_AUDIT_HMAC_SECRET'], leaked: false }` (loadAppConfig no conoce ARGOS_AUDIT_HMAC_SECRET).
- tests/integration/persistence/roles-migration.spec.ts (5 nuevas rojas; las 8 de T241 verdes): `SqliteError: no such table: audit_log` y, en la de columnas, `expected [ [], [] ] to deeply equal [ [ 'id', 'timestamp', ... ], [] ]`.
- tests/unit/record-invariants.spec.ts (2 rojas): `Failed to load url ../../src/domain/records/superseded-guard.ts`. Las demás (30) verdes.
- tests/integration/api/pets-records.api.spec.ts (3 nuevas rojas): `AssertionError: contrato OpenAPI de PATCH|DELETE /api/pets/{petId}/records/vaccinations/{recordId}` (rutas de edición y borrado de registros no existen, T260-T263). Fallan además 3 pruebas previas de GET /pets (base, ver abajo).
- tests/property/records.property.spec.ts y tests/property/alerts.property.spec.ts: 13/13 verdes (las propiedades nuevas ya las cumple la implementación vigente; quedan como regresión).

## Pruebas de T255 que ya pasan (honestidad)
Lote, veterinario y colegiado, próxima fecha opcional, semáforo con nulos y SUPERSEDED calculado ya funcionan en dominio y API (T251). Lo que falta es: guarda `superseded-guard.ts`, y las rutas PATCH/DELETE de registros.

## Reparación de fixtures de la base (T255 PENDIENTE)
Los fixtures 001 no traían category/batchOrClinic/veterinarianName/veterinarianLicense: 10 pruebas de record-invariants y 1 de records.property estaban rojas en la base (verificado ejecutando las versiones de HEAD). Se llevó el fixture a la forma 002 en las propias pruebas; ahora están verdes. Quedan 3 rojas ajenas de pets-records (GET /pets, ya registradas como deuda en la evidencia de T251).

## Compuertas
- vitest audit-canonical + audit.property: 2 archivos rojos, "no tests", por módulo ausente.
- vitest audit.api + record-invariants + account-deletion + roles-migration: `Test Files 4 failed (4) / Tests 28 failed | 49 passed (77)`.
- vitest audit-pseudonym: `3 failed | 1 passed (4)`; pets-records: `6 failed | 36 passed (42)` (3 base + 3 nuevas).
- npx tsc --noEmit: solo 6 TS2307 (src/domain/audit/{canonical-json,state-hash,canonical-view}.ts desde los dos archivos de T253); cero en el resto.
- bash scripts/verify-oracles.sh: `Archivos analizados: 88; oráculos débiles: 0 / Resultado: CUMPLE`.

## Decisiones y supuestos para la fase verde
1. Las pruebas leen audit_log por SQL con columnas snake_case del data-model §2.12; el secreto de pruebas es el del contrato (auditHmac.secretHexForTestsOnly, decodificado de hex). El arnés deberá inyectarlo como ARGOS_AUDIT_HMAC_SECRET.
2. entityId de PET_ASSIGNMENT = HMAC("<petId>:<householdId>"); ACCOUNT_DELETE: executor y entityId = HMAC(userId).
3. Mantenimiento: `runMaintenance(deps)` devuelve solo conteos y la clave `auditRowsPurged` (supuesto para T266). Fechas de la purga lejos del borde de 730 días.
4. Modo producción en la configuración: NODE_ENV=production; secreto válido = 64 hex (32 bytes). Con secreto presente e inválido también se rechaza fuera de producción (supuesto).
5. Guarda: `assertRecordNotSuperseded(status)` lanza DomainError ERR-REC-SUPERSEDED-IMMUTABLE 409.
6. La fila MIGRATION cuelga de la migración que crea audit_log (schema_migrations usa `version`=nombre de archivo, no `id` del data-model); entityId solo debe cumplir `MIG-[A-Za-z0-9._-]{1,64}`.
7. Al añadirse la configuración, tests/unit/app-config.spec.ts (toEqual del objeto completo) deberá ajustarse.
8. dumpSqlite (tests/fixtures/sqlite-harness.ts) no incluye audit_log; las pruebas usan auditText aparte.
