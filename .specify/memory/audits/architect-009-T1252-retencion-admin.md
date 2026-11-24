# Architect 009 / T1252 — Retención de `admin_audit_entries` (RAMA-T1239-03, punto 5 de /rama)

Fecha: 2026-11-23. Solo diseño; sin cambios en src, contratos, src/generated, tasks.md.

## Veredicto
Recomendado: opción (a). Sumar las filas purgadas de `admin_audit_entries` a la clave existente `auditRowsPurged`. NO requiere Neo: el contrato `MaintenanceResult` (`specs/003-cloud-gcp/contracts/openapi/ops.openapi.yaml:127-136`, 5 claves, `additionalProperties: false`) no cambia en forma ni en versión.

## Evidencia
- Semántica: el contrato solo define `auditRowsPurged: integer >= 0`, sin descripción que lo ate a `audit_log`; el nombre es «filas de auditoría purgadas». `admin_audit_entries` es auditoría (REQ-ADM9-004, ADR-009-08) con el mismo plazo de 24 meses que `audit_log` (`ADR-002-05`, `ADR-002-14`), por lo que cae bajo el mismo concepto y el mismo umbral `auditBefore`.
- Spec: `spec.md:141` y `:190` piden «el mantenimiento programado existente purga … y registra solo un conteo»: «existente» y «un conteo» son compatibles con (a) y no con añadir una sexta clave. Plan `ADR-009-08`/`ADR-009-16 (8)` idem.
- Precedente en el mismo código: las purgas de `login_attempts`, `oauth_flow_states`, `admin_*` y `users` PENDING/REJECTED se hacen «sin conteo propio» para no tocar las 5 claves (`sqlite-unit-of-work.ts:87-98`, `postgres-maintenance.ts:76-97`). Aquí la spec exige conteo, así que se agrega a la clave de auditoría en vez de omitirlo.
- Opción (b) (sexta clave, p. ej. `adminAuditRowsPurged`): cambia `MaintenanceResult` (003, MINOR/MAJOR por `additionalProperties:false` y `required`), `MaintenanceCounts`, `maintenance-routes.ts:45`, tipos generados y ≥8 pruebas con `toEqual` de 5 claves (t542, t558, sqlite/postgres-maintenance). Contrato de 003 = Nivel 2, requiere Neo. Costo alto sin beneficio exigido por la spec. Descartada.
- Pérdida de granularidad aceptada: el log del Scheduler no distingue cuántas filas fueron de cada tabla. Es solo un conteo operativo, sin identificadores (INV-AUD-001); no se pide desglose.

## Diseño mínimo (para keymaker)
1. Sin cambios en `MaintenanceCutoffs` ni en `maintenanceCutoffs()`: reutilizar `auditBefore`.
2. SQLite `sqlite-unit-of-work.ts` (dentro de la misma transacción de `purgeExpired`): `auditRowsPurged: run('DELETE FROM audit_log WHERE timestamp < @auditBefore') + run('DELETE FROM admin_audit_entries WHERE occurred_at < @auditBefore')`. Comparación de texto ISO, igual que `audit_log`.
3. PG `postgres-maintenance.ts`: segundo paso en `STEPS` con `key: 'auditRowsPurged'`, `table: 'admin_audit_entries'`, `where: occurred_at::timestamptz < $1::timestamptz`, `cutoff: c => c.auditBefore`. El bucle por lotes ya acumula `counts[step.key] +=`, no requiere otro cambio. `ctid` y lotes ya son válidos para la tabla.
4. Actualizar los comentarios/JSDoc de `MaintenanceCounts.auditRowsPurged`, de `maintenance-use-cases.ts:2-4` y del encabezado de `postgres-maintenance.ts` («auditoría y administración, 24 meses»). Sin tocar `src/generated`.
5. Ninguna fila de auditoría ni log nuevo por la purga (no es mutación de usuario); el log sigue con solo conteos.

## Prueba roja (ambos motores)
Hallazgo `RAMA-T1239-03`, en `tests/security/t1239-retencion-privacidad-admin-009.security.spec.ts` (SQLite, junto a -01/-02) y en `tests/integration/persistence/postgres-maintenance.spec.ts` (PG; usa `TEST_DATABASE_URL`):
- Sembrar 3 filas en `admin_audit_entries` con un `admin_id` válido de 36 caracteres: A con `occurred_at` = `auditBefore` menos 1 día (vencida), B igual a `auditBefore` exacto o 1 día después (frontera: se conserva, `<` estricto como `audit_log`), C reciente (hoy).
- Sembrar además 1 fila vencida en `audit_log` para probar la suma.
- Ejecutar `purgeExpired(maintenanceCutoffs(NOW))`.
- Esperar: A ausente; B y C presentes; `counts.auditRowsPurged === 2` (1 de `audit_log` + 1 de admin); las otras 4 claves intactas; `Object.keys(counts)` sigue siendo exactamente las 5 claves.
- Caso por lotes en PG: con `batchSize` pequeño (p. ej. 2) y 5 filas vencidas, `auditRowsPurged` acumula 5.
- Falla en rojo hoy porque A sigue presente y el conteo da 1.
- Regresión: las pruebas existentes de 5 claves y de `auditRowsPurged` deben seguir verdes sin edición (la tabla admin vacía suma 0).

## Decisión y Neo
- No requiere Neo (Nivel 2): sin cambio de contrato 003/ops, sin dependencia nueva, el plazo ya lo decidió Neo (`RAMA-T1239-03`). Basta con que Morpheus lo registre.
- Neo solo intervendría si prefiere desglose en el log (opción b); queda ofrecida como alternativa no recomendada.
- Observación para /oracle: aclarar en `spec.md:141/190` (a cargo de /architect en una pasada documental futura, no editado aquí) que el conteo se suma a `auditRowsPurged`.
