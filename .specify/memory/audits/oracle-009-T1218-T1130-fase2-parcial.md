# Acta /oracle — Feature 009, Fase 2 parcial (T1218, T1219, T1284, T1130)

Fecha: 2026-11-23. Alcance: contraste en disco; T1220/T1221 no auditadas. Sin cambios de código, sin [x].
**Veredicto: PASS CON OBSERVACIONES** (3 decisiones de Neo pendientes, ningún defecto bloqueante).

| # | Verificación | Resultado |
|---|---|---|
| 1 | Archivos nuevos presentes (tests t1218/t1219/t1130, reauthentication-policy, account-google-deletion-use-cases, 0018 sqlite, 0014 pg) y `account-use-cases.ts` modificado | OK |
| 2 | 0017 (sqlite) y 0013 (pg) sin modificar (`git status`/`git diff HEAD` vacíos) | OK |
| 3 | CHECK de `intent` = LOGIN/LINK/DELETE; STRICT conservado en sqlite; filas copiadas con INSERT..SELECT; índices `_expires` y `_user_id` recreados; PG sin STRICT (igual que 0013) | OK |
| 4 | Sin duplicar la regla: `ERR-ACCOUNT-DELETE-HOUSEHOLDS-ACTIVE` viene del catálogo compilado (T1217); `eraseAccountInTransaction` única cascada, `deleteAccount` conserva `ERR-ACCOUNT-OWNS-SHARED-HOUSEHOLD/PETS` | OK |
| 5 | Sin `log/console` en el caso de uso; `reauthRequired` uniforme; detail solo con nombres de hogares, sin `sub` ni correo | OK (ver O3) |
| 6 | `backupConfirmationToken` opcional (esquema y B3b) | OK, decisión de Neo abierta |
| 7 | `npx tsc --noEmit` | exit 0 |
| 8 | vitest t1218 (23) + t1219 (7) + t1130 (7) + schema-parity (18, 1 skipped sin PG) | 54 passed, 1 skipped, exit 0 |
| 9 | `verify-oracles.sh` | exit 0, 464 archivos, 0 oráculos débiles |
| 10 | `verify-traceability.sh --feature 008` | exit 0, 66/66, pureza 0 violaciones |
| 11 | PG real (127.0.0.1:55432 vivo) con TEST_DATABASE_URL: t1219, schema-parity, postgres-pool, t1116 | 42 passed, 0 skipped, exit 0 (schema-parity ejecutó su caso PG, antes skipped). t1219 no usa TEST_DATABASE_URL por sí mismo: la 0014 se cubre vía schema-parity, no con prueba de preservación de filas en PG |

## Divergencia con tasks.md (decisión de Neo, no aprobada por Oracle)
T1219 dice ampliar el CHECK en «`0017_google_sso.sql`, que exige reconstruir la tabla, y Postgres `0013`». Keymaker creó migraciones NUEVAS 0018 (sqlite) y 0014 (pg) y dejó 0017/0013 intactas. Es técnicamente más seguro (008 ya está en producción, commit 917bbf8) pero difiere del texto literal; requiere que Neo (o /architect) corrija o confirme la redacción de T1219.

## Observaciones
- O1: las migraciones cambian además el CHECK de fase AUTHORIZATION (`pending_subject` permitido solo si intent=DELETE) y exigen `user_id`/`origin_session_hash` para DELETE. Es alcance extra al "ampliar intent" de tasks.md (marca de titularidad en `pending_subject`); confirmar.
- O2: `backupConfirmationToken` opcional: decisión de Neo en T1217 abierta.
- O3: el `detail` del 409 incluye nombres de hogares (dato del propio usuario, no `sub`/correo); validar en T1222 (/rama, /trinity).
- O4: la 0014 en PG se borra y recrea la tabla vía tabla temporal; sin prueba PG directa de conservación de filas.
- O5: esta acta no audita T1220/T1221/T1222; `test:gate` completo no corrido (corresponde a T1223).
