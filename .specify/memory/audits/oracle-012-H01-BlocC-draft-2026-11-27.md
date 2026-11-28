# Acta Oracle — Feature 012: H-01 (a) + H-06 (commits 1d294b8..75d9c38) y Bloque C DRAFT 0.1.1 (arbol de trabajo)

Fecha: 2026-11-27. Auditor: /oracle (sonnet). Solo lectura; sin commits, sin push, sin [x]/COMPLETED/APPROVED, sin tocar logos.*.

## Veredicto: CUMPLE CON RESERVAS

## Gates (rc reales)
| Gate | rc | Resultado |
|---|---|---|
| npx tsc --noEmit | 0 | limpio |
| bash scripts/verify-traceability.sh --feature 012 | 0 | CUMPLE (298/298 IDs propios de la 012; pureza 0 violaciones) |
| bash scripts/verify-oracles.sh | 0 | CUMPLE (652 archivos, 0 oraculos debiles) |
| vitest tests/integration/api/chip-routes-012.api.spec.ts | 0 | 11/11 |
| vitest tests/integration/persistence | 0 | 79 archivos pasan, 3 omitidos; 902 pasan, 282 omitidos |
PostgreSQL real: NO disponible (TEST_DATABASE_URL sin definir). El caso "PostgreSQL real" de h01-admin-audit-metadata-012.spec.ts y los de paridad PG quedaron omitidos; la 0034 solo se verifico por lectura y con cliente doble.

## Alcance A (commits)
1. H-01 (a) CUMPLE. SQLite 0038 y PG 0034 son un unico `ALTER TABLE admin_audit_entries ADD COLUMN metadata TEXT CHECK (metadata IS NULL OR length(metadata) BETWEEN 2 AND 4096)`; sin DROP/CREATE/RENAME (la prueba lo exige por regex); filas previas quedan NULL y se leen sin la clave. Paridad en SQLite, PG y memoria (memoria replica el CHECK). El motivo se persiste solo en `resolve` (chip-dispute-admin-use-cases.ts:224) y `confirm` (:301) como `{"reason": ...}` NFC; el resto de auditorias (:175 prorroga, :319 cancel, :337 moot, :357 lectura, views:194, use-cases.ts:219) no pasan motivo. Sin persona_*: la prueba de ruta comprueba que `SELECT * FROM admin_audit_entries` no contiene `persona_000`.
2. H-06 CUMPLE, pruebas no triviales. (i) OPERATOR delegado real (fila en admin_delegates, quitado de ARGOS_ADMIN_EMAILS): vista cerrada con `actors` = [Resolutor SUPER_ADMIN, Segundo aprobador OPERATOR], `actorIdentities` ausente para el OPERATOR y para la respuesta de confirm, y presente (2) para el SUPER_ADMIN: contraste positivo y negativo. (ii) step-up: grant ajeno -> 403; grant propio a exactamente 5 min -> 403; a 5 min - 1 s -> 200 (frontera bilateral con reloj controlado).

## Alcance B (arbol de trabajo)
3. Bloque C es DRAFT coherente: care.openapi.yaml, care-routine, care-log-entry y caregiver-access declaran version 0.1.1, status DRAFT, change_type MINOR; ninguna marca APPROVED en ellos. Consistente con el acta architect-012-bloqueC-v011 (IU, grupos CANINE_FELINE/OTHER_SPECIES, seriesId obligatorio, maxItems 100, ALREADY-LOGGED por status distinto, pendientes H-C1/H-C2/H-C3/T-C5 marcados "PENDIENTE DE NEO" en el texto, ADMIN-administra-niveles contradictorio senalado y no resuelto). ERR-CAR12-* ya existen en errors/error-catalog.json (no se anadieron codigos).
4. tasks.md: el diff es solo 10 marcas [x] (T1633, T1634, T1635, T1640, T1641, T1642, T1643, T1645, T1646, T1648); 38 lineas `^- [x]` en total (T1636, T1650, T1651, T1652, T1660 siguen [ ]). Coherente con las marcas de Neo (no verificable en disco quien las puso; ningun agente puede).
5. Errata chip-claim 0.2.1 CUMPLE: schema `status` APPROVED conservado, change_type MINOR, value 15728640 coherente con feature-012-limits.ts; la errata declara APPROVED con cita de Neo. README y quickstart: solo texto (nota DRAFT 0.1.1 del Bloque C; seccion de operacion inicial /admin).
6. claude/deuda-012-admin-stepup-prod.md: ABIERTA, bloqueante de release, sin cierre por agente. Coherente con H-03.
7. src/generated sin cambios. src/: sin ediciones del Bloque C; sin embargo el arbol tiene cambios sin commitear en app-config.ts, app.ts, server.ts y origin-verify.ts (ARGOS_ORIGIN_VERIFY_SECRET, Cloudflare), ajenos a la 012 (el item H-01 de aislamiento: son de Neo/Link, no del Bloque C).

## Hallazgos
| ID | Sev | Ubicacion | Detalle |
|---|---|---|---|
| R-1 | MENOR | src/infrastructure/persistence/sqlite/migrations/0038_admin_audit_metadata.sql:4 y commit 75d9c38 | El comentario y la mision dicen que el motivo se purga "con la auditoria (1095 dias)". Falso en disco: `admin_audit_entries` se purga a 24 meses de calendario (maintenance-use-cases.ts:19-25; sqlite-unit-of-work.ts:107; postgres-maintenance.ts:57); 1095 (ARBITER_AUDIT_RETENTION_DAYS) rige solo el expediente de disputa. El motivo si se purga con su fila (misma tabla), pero antes de 1095 d. Ninguna prueba cubre la purga de metadata. Neo debe decidir si N-E exige 1095 d para la fila de auditoria del arbitraje o corregir el comentario a 24 meses. |
| R-2 | MENOR | chip-dispute-admin-use-cases.ts:165 y :309 (prorroga y cancel-execution) | Ambas validan `reason` con assertReason y lo descartan (auditArbiter sin motivo, :175, :319). El H-01 original citaba el motivo "obligatorio y auditado" tambien para ellas; la opcion (a) aplicada cubre solo resolve/confirm. Confirmar con Neo que es el alcance deseado. |
| R-3 | INFO | pruebas | Sin PG real no se ejercito 0034 contra un motor; el CHECK de PG solo se prueba con TEST_DATABASE_URL. Ejecutar en CI/local con PG antes de cerrar. |
| R-4 | INFO | Bloque C | Siguen abiertas las decisiones de Neo H-C1, H-C2, H-C3 (M-01/M-03), T-C5 y la eleccion inclusivo de careUntil (T-C3); el contrato no puede pasar a APPROVED hasta entonces. |

Sin hallazgos ALTO/BLOQUEANTE nuevos.
