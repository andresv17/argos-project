# Mapeo de las 24 filas pendientes de `sustitucion-pruebas-001.md` (T304)

**Autor**: Keymaker (SDD Developer) | **Fecha**: 2026-11-14 | **Modo**: lectura y verificación (sin cambios en `specs/`, `tests/`, `src/` ni en la tabla; sin commit)
**Regla aplicada**: regla 6 (el archivo listado contiene la prueba de la 002 indicada y está en verde; ninguna prueba listada se excluye).

## Ejecuciones (literales)

| Ejecución | Alcance | Resultado literal |
|---|---|---|
| E1 `npx vitest run` (31 archivos de las filas) | filas 1 a 16, 18, 22, 24, 25, 28, 29, 34 (vía spec) | **663 passed, 0 failed** (31 archivos `passed`) |
| E2 `npx vitest run` (14 archivos nuevos + 2 ayudantes) | fila 23 | **192 passed, 0 failed** (14 archivos `passed`) |
| E3 `npx playwright test tests/e2e/visual tests/e2e/accessibility` | fila 20 (con `ARGOS_AUDIT_HMAC_SECRET` efímero solo en el entorno del proceso) | **41 passed, 1 failed, 10 did not run** (7.0 min). Falla `wcag.spec.ts:91` por `Test timeout of 60000ms exceeded`; el resto del archivo no corrió (modo serial) |
| E4 `npx playwright test tests/e2e/accessibility/wcag.spec.ts` (repetición) | fila 20 | **11 passed, 1 failed, 2 did not run** (5.5 min). Falla `wcag.spec.ts:173` (`login y registro a los cuatro anchos`): `expect(getByRole('main')).toBeVisible()` no encontró el elemento en 5000 ms. La prueba de E3 `:91` pasó en E4 |

Los ayudantes sin `describe` (`application-harness.ts`, `repository-contract-suite.ts`, `openapi-contract.ts`, `security-harness.ts`) no se ejecutan solos: se verificaron por contenido y por las pruebas verdes que los importan (E1/E2).

## Tabla

| # | Archivo(s) listado(s) | Prueba de la 002 (evidencia en disco) | Resultado | Clasificación |
|---|---|---|---|---|
| 1 | `tests/unit/pet-and-alerts.spec.ts`, `tests/property/pet.property.spec.ts`, `tests/unit/date-and-sort.spec.ts` | `[INV-PET2-001]` 8 especies y `speciesOther` (pet-and-alerts:429-441), propiedad `species`/`speciesOther` (pet.property:66), edad estimada (pet-and-alerts:483, pet.property:80), 8 especies en date-and-sort:285; sin `DOG`/`CAT` | VERDE (35 + 5 + 31) | SUSTITUIDA_VERDE |
| 2 | `tests/property/records.property.spec.ts`, `tests/unit/record-invariants.spec.ts` | `[INV-REC2-002][SC-013]` límites por especie en gramos (records.property:95, :114; record-invariants:138-183) | VERDE (7 + 32) | SUSTITUIDA_VERDE |
| 4 | `tests/unit/backup-migration.spec.ts`, `tests/integration/persistence/sqlite-backup-import.spec.ts` | backup-migration:65-98 `[REQ-BACKUP2-002]` DOG a CANINE y CAT a FELINE desde 1.0.0 y 2.0.0. **sqlite-backup-import.spec.ts no contiene caso de migración 1.0.0/2.0.0**: importa un sobre `v3()` (sin `CANINE`, `3.0.0` ni `2.0.0` por texto) | VERDE (37 + 4) | SUSTITUIDA_VERDE **con reserva**: el caso de migración vive solo en backup-migration.spec.ts; Architect decide si el segundo archivo exige caso propio |
| 5 | `tests/unit/backup-use-cases.spec.ts`, `tests/unit/backup-import-atomicity.spec.ts`, `tests/integration/api/backup-atomicity.spec.ts` | Regresión conservada; añadidos en backup-use-cases: T271 token (:533-571), T278 previsualización y `fileDigest` (:587-613), `[SC-004]` inyector determinista (:671); exportación por los 4 roles queda cubierta por la matriz pura (comentario :525 y `permissions-matrix.spec.ts`); API: sobre 3.0.0 (backup-atomicity.api:30, :54) | VERDE (78 + 1 + 18) | SUSTITUIDA_VERDE |
| 6 | `tests/unit/access-policy.spec.ts`, `tests/property/access.property.spec.ts` (+ `tests/unit/permissions-matrix.spec.ts`) | `[REQ-RBAC-001][INV-ACC2-001]` rol efectivo, visibilidad por asignación, escalera de roles (access.property:188-231; access-policy:173-195); matriz de 44 casos | VERDE (19 + 6 + 44) | SUSTITUIDA_VERDE |
| 7 | `tests/unit/household-policies.spec.ts`, `tests/unit/use-cases.households.spec.ts`, `tests/property/households.property.spec.ts` | `ADMIN`/`CAREGIVER`/`READER`, propietario único con `[INV-HOUSE2-001]` (household-policies:110, :283, :308), `CHANGE_ROLE` (:469) y `TRANSFER_OWNERSHIP` (:493); invariante de propietario (households.property:59, :170) | VERDE (37 + 23 + 3) | SUSTITUIDA_VERDE |
| 8 | `tests/integration/api/households.api.spec.ts` | `[REQ-HOUSE2-001]` invitación con `roleOnJoin`, siempre por `username`, `{received:true}` uniforme, `ERR-RATE-LIMITED` (:87, :108, :124, :170, :191) | VERDE (30) | SUSTITUIDA_VERDE |
| 9 | `tests/integration/persistence/sqlite-repositories.spec.ts`, `tests/fixtures/repository-contract-suite.ts`, `tests/fixtures/application-harness.ts` | 8 especies, microchip, `weight_grams`, migración 0002 (sqlite-repositories:93, :166-217); suite con invitaciones en `household_invitations` (repository-contract-suite:361-378); `upgradePet` y roles en el arnés | VERDE (37; los ayudantes por sus importadores) | SUSTITUIDA_VERDE |
| 10 | `tests/unit/auth-policies.spec.ts`, `tests/property/auth.property.spec.ts` | `[INV-AUTH2-001]` 10 a 128, `[INV-AUTH2-002]` 30 min y 24 h, reloj inyectado, propiedades de ventanas (auth-policies:107-263; auth.property:41, :51, :78) | VERDE (25 + 5) | SUSTITUIDA_VERDE |
| 11 | `tests/unit/use-cases.spec.ts` | `[REQ-AUTH2-001/002]` política nueva, `lastActivityAt`, tope de 24 h (:71, :103, :189) | VERDE (36) | SUSTITUIDA_VERDE |
| 12 | `tests/integration/api/auth.api.spec.ts` | `[REQ-AUTH-003][SC-009]` logout que revoca (:155), `GET /auth/me` tras recargar (:175), expiración por inactividad (:200) | VERDE (18) | SUSTITUIDA_VERDE |
| 13 | `tests/security/exploits/session-csrf.security.spec.ts` | Inactividad, tope, sesión expirada que no revive, rechazadas que no renuevan, revocada que no reactiva (:84-154) | VERDE (18) | SUSTITUIDA_VERDE |
| 14 | `tests/security/exploits/access-control.security.spec.ts` | `[INV-ACC2-002]` cada celda «No» (:220), control positivo (:247), IDOR por rol (:256), hogar ajeno (:269) | VERDE (13) | SUSTITUIDA_VERDE |
| 15 | `tests/security/exploits/malicious-input.security.spec.ts` | `speciesOther` y `email` en vectores de prototype pollution (:52) | VERDE (13) | SUSTITUIDA_VERDE |
| 16 | `tests/security/exploits/credentials.security.spec.ts`, `tests/security/exploits/log-redaction.security.spec.ts` | Política 10/128 (credentials:112), `[INV-AUD-001]` auditoría y eliminación sin secretos (credentials:160, :175; log-redaction:137) | VERDE (12 + 3) | SUSTITUIDA_VERDE |
| 18 | `tests/property/alerts.property.spec.ts`, `tests/unit/record-invariants.spec.ts` | Regresión `[STATE-ALERT-001]`; `[REQ-REC2-002]` próxima fecha opcional (alerts.property:150), `[REQ-REC2-003]` SUPERSEDED calculado (alerts.property:130; record-invariants:407) | VERDE (6 + 32) | SUSTITUIDA_VERDE |
| 20 | `tests/e2e/visual/*.spec.ts`, `tests/e2e/visual/e2e-support.ts`, `tests/e2e/accessibility/wcag.spec.ts` | 4 anchos (`VIEWPORT_WIDTHS_V21` con 768; wcag.spec:159-201), recargar y seguir autenticado (auth-pet-forms:103), tres navegadores por rol (household-counter:34). La prueba existe, **pero `wcag.spec.ts` no cierra en verde**: E3 timeout de 60 s en `:91`; E4 `main` no visible en `:173`. Fallos distintos y no reproducibles de forma idéntica; el modo serial deja 2 a 10 pruebas sin correr | ROJO (visuales 41 passed; wcag 1 failed en cada ejecución) | PENDIENTE_ROJO (inestable, no atribuible a un caso fijo) |
| 22 | `tests/unit/layer-dependencies.spec.ts`, `tests/integration/gates/verify-gates.spec.ts` | `T201: compuertas multi-feature` con `--feature 002` (verify-gates:311-356). **layer-dependencies.spec.ts no contiene rutas multi-feature**: lee solo `src/` y no estaba modificado; no hay nada que ajustar | VERDE (4 + 43) | SUSTITUIDA_VERDE **con reserva**: el ajuste multi-feature solo existe en verify-gates |
| 23 | (no existe) pruebas nuevas de T210, T211, T239, T241, T253 a T257, T297 a T299 | account.api (13), account-deletion unit (26) y api (14), assignments-ownership.api (11), ownership-transfer (4), roles-migration (13), species-migration (13), audit-canonical (18), audit.property (4), audit.api (18), audit-pseudonym (4), backup-token (10), audit-secret (11), session-audit-import (33), V13 en session-csrf | VERDE (192 passed, 0 failed) | SUSTITUIDA_VERDE |
| 24 | `tests/unit/household-policies.spec.ts`, `tests/unit/use-cases.households.spec.ts`, `tests/property/households.property.spec.ts` | Invitación uniforme sin efecto en duplicado (household-policies:180, EDGE-016); `{received:true}`, `household_invitations` inerte y `ERR-RATE-LIMITED` en api (households.api:87-191) | VERDE (37 + 23 + 3) | SUSTITUIDA_VERDE |
| 25 | `tests/unit/backup-use-cases.spec.ts` | Sesión sembrada con `lastActivityAt` y sin `expiresAt` (:96, :553) | VERDE (78) | SUSTITUIDA_VERDE |
| 28 | `tests/unit/app-config.spec.ts` | `[INV-ARCH-006][ERR-RATE-LIMITED]` las 4 variables `EXPORT_*`/`INVITE_*` y sus rechazos (:49-70) | VERDE (20) | SUSTITUIDA_VERDE |
| 29 | `tests/security/exploits/security-harness.ts`, `tests/security/exploits/session-csrf.security.spec.ts` | Inventario del OpenAPI 3.0.0: 40 operaciones, 37 protegidas, 32 mutantes (session-csrf:61-64); `NOT_YET_SERVED = []` (:36); el arnés importa `openapi` y `OPERATIONS` | VERDE (18) | SUSTITUIDA_VERDE |
| 34 | `tests/fixtures/application-harness.ts`, `tests/integration/contracts/openapi-contract.ts` | `upgradePet` al construir el estado (application-harness:23, :35, :42); Ajv con `multipleOfPrecision: 10` y rutas `specs/002-plataforma-v21` (openapi-contract:13, :37) | VERDE (los importadores en E1/E2 y 663/663) | SUSTITUIDA_VERDE |

## Conteo

- **SUSTITUIDA_VERDE: 23** — filas 1, 2, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 18, 22, 23, 24, 25, 28, 29, 34. Con reserva documentada: **4** y **22**.
- **PENDIENTE_ROJO: 1** — fila 20 (`wcag.spec.ts` inestable).
- **NO_PRUEBA: 0**.

## Hallazgo Caso A (fila 20)

`tests/e2e/accessibility/wcag.spec.ts` falla en cada ejecución, en una prueba distinta: E3 `:91` (timeout de 60 s) y E4 `:173` (`getByRole('main')` no visible en 5 s tras `page.goto`). Las visuales pasan. Sospecha: pruebas lentas (axe en 3 o 4 anchos, 23 a 55 s por prueba) sin margen de timeout, y el modo serial convierte un fallo en 2 a 10 pruebas sin correr. No se tocó el archivo. Antes de marcar la fila 20, Keymaker debe aislar la causa (lentitud del entorno frente a defecto de la pantalla `/login` o `/register` a 768 px) y repetir en verde.

## Observaciones

- Las reservas de las filas 4 y 22 son del criterio «el archivo listado contiene la prueba»: la sustitución real está en otro archivo de la fila. Si Architect aplica la regla 6 de forma estricta por archivo, ambas pasan a NO_PRUEBA parcial.
- `ARGOS_AUDIT_HMAC_SECRET` no está en el entorno por defecto de `npx playwright test`; el `webServer` sale con «Configuración inválida». Se generó un valor aleatorio solo para el proceso. Aviso para la compuerta `test:gate`.
- No se corrió la suite completa ni `test:mutation`. No se imprimió ningún valor de `.env`.

DE: Keymaker (SDD Developer)
PARA: Morpheus (Capitán del Nebuchadnezzar y Tech Lead)
ESTADO: Validación requerida
DETALLE: 24 filas revisadas. SUSTITUIDA_VERDE 23 (1, 2, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 18, 22, 23, 24, 25, 28, 29, 34; con reserva 4 y 22). PENDIENTE_ROJO 1 (fila 20, wcag.spec.ts inestable en dos ejecuciones). NO_PRUEBA 0. Vitest 663/663 y 192/192; Playwright 41 pasan y 1 falla. Evidencia en claude/mapeo-filas-pendientes-t304.md.
SIGUIENTE PASO RECOMENDADO: Morpheus pide a Architect que marque las SUSTITUIDA_VERDE (decidiendo sobre las reservas de 4 y 22) y a Keymaker que corrija la PENDIENTE_ROJO (fila 20).
