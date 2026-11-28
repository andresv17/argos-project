# Rama · Re-auditoría T1644 (Bloque B, feature 012) con D8 · HEAD f96e16d

- Fecha: 2026-11-27 · Solicitante: Morpheus · Modo: solo lectura (sin ediciones de src, contratos ni tests; sin commit, push, [x] ni logos.*).
- Delta auditado: b3b1cd4..f96e16d (f754467 puerto/adaptadores D8, 9004754 purga D8 + M-03, f96e16d M-01). Texto D8 ya firmado (6900551, 7a269b9).

## Dictamen

**CUMPLE CON RESERVAS** para T1644 con D8.

Motivo: el código cumple el invariante D8 en memoria, SQLite y PostgreSQL (lectura línea a línea), y el test nuevo pasa en memoria y SQLite. Quedan reservas: la rama PostgreSQL de la nueva prueba no se ha ejecutado (sin `TEST_DATABASE_URL`), no hay prueba de regresión del camino M-01 y el adaptador en memoria no reproduce la restricción RESTRICT.

## Cierre por hallazgo

| Hallazgo | Estado | Evidencia |
|---|---|---|
| A-01 (purga de delegados borra identidades con expedientes) | CERRADO | `maintenance-use-cases.ts` (`purgeDelegateData`): si `listAll()` de `owner_requests` cita al `adminId` en `resolvedByAdminId` o `secondApproverAdminId`, llama a `anonymizeIdentity`; si no, `deleteById`. La única FK hacia `admin_identities` son esas dos columnas (RESTRICT, migraciones PG 0033 y SQLite 0037) más `admin_sessions` (CASCADE, que `anonymizeIdentity` replica borrando sesiones). |
| A-01b (`person_id = NULL` tras el plazo) | CERRADO en código y en test de memoria/SQLite; PG sin ejecutar | `releaseExpiredPersonIds`: `closed_at = resolvedAt ?? decidedAt ?? expiresAt`; plazo 1095 días (`ARBITER_AUDIT_RETENTION_DAYS`) si `CHIP_DISPUTE` + `CHIP_APPROPRIATION`; 90 días (`DISPUTE_ABSENCE_RETENTION_DAYS`) en ausencia; 90 (`OWNERSHIP_TERMINAL_RETENTION_DAYS`) en el resto. Constantes verificadas en `feature-012-limits.ts:22,32,79`. Estados abiertos: `PENDING` y `UNDER_REVIEW`. Un arbitraje programado (`executesAfter`) sigue en `UNDER_REVIEW` con `resolvedAt` ya fijado (`chip-dispute-admin-use-cases.ts:220`), así que queda correctamente como abierto. `closeDispute` pasa a `RESOLVED` con `executesAfter = null`. El enum `OwnerRequestStatus` no contiene otro estado abierto. |
| M-01 (`claimIdentity` con try) | CERRADO en código; sin prueba de regresión | `admin-use-cases.ts:199-207`: el `deleteById` fallido devuelve `false`. Ver análisis PG más abajo. |
| M-03 (traza de mantenimiento sin PII) | CERRADO | `reportMaintenanceFailure` (`maintenance-use-cases.ts:230-232`) registra solo el nombre de la tarea y `error.name`, nunca `message`. Es la única traza `console` del módulo. Se ejercita en el test fail-safe (salida `[maintenance] purgeDelegateData falló y se revirtió (Error)...`, sin PII). |
| Prueba D8 `t1580-purga-delegados-011.spec.ts` | PARCIAL | `npx vitest run` sobre el spec: 14 pasan y 7 se omiten. Las omitidas son todas PostgreSQL (`TEST_DATABASE_URL` no definido; `.env` no lo contiene). El test D8 (expediente RESOLVED con apropiación y ausencia, límites 994/996 días) pasa en memoria y SQLite. |

## Nota de Keymaker: transacción PostgreSQL abortada tras DELETE fallido (análisis, no ejecutado)

Un DELETE que viola la FK RESTRICT (SQLSTATE 23503) deja la transacción PostgreSQL en estado abortado. Trazo las dos rutas que llaman a `claimIdentity`:

1. **Ruta `anchor` (`admin-use-cases.ts:166`)**: `claimIdentity` devuelve `false` y se lanza `AnchorAborted`. `runInTransaction` ejecuta rollback y `execute` responde `DENIED`. Correcto y sin efectos.

2. **Ruta ACTIVE (`resolveDelegate`, `admin-use-cases.ts:158`)**: tras el `false` no hay más sentencias. `resolveIdentity`/`resolveDelegate` devuelve `null`, `execute` devuelve `DENIED` dentro de `runInTransaction` y `transaction()` emite `COMMIT`. En PostgreSQL, un `COMMIT` sobre transacción abortada se comporta como `ROLLBACK` sin error de servidor, así que el cliente recibe `DENIED` y no queda ninguna escritura persistida. El resultado es correcto hoy.

Riesgos derivados, todos BAJOS:
- **Frágil ante cambios:** cualquier sentencia añadida tras el `false` en la misma transacción fallaría con 25P02 ("current transaction is aborted") y se propagaría como error 500 al operador, justo lo que M-01 pretendía evitar. Conviene un comentario o un `SAVEPOINT` alrededor del borrado.
- **Divergencia de motor:** en SQLite el fallo es de sentencia y no aborta la transacción. Si hay dos titulares (`bySubject` y `byEmail`) y el primer borrado tiene éxito, el `COMMIT` persiste ese borrado parcial mientras el acceso se deniega. En PostgreSQL se revierte. El efecto es una identidad obsoleta sin expedientes retirada, sin fuga, pero rompe la expectativa de "denegar sin efectos".
- **`catch` genérico:** el `catch {}` convierte cualquier error (conexión, lock, bug) en `false` sin traza. Debería distinguir el 23503 de los demás y registrar solo el nombre del error, como hace M-03.

## Riesgos abiertos

- **R-PG-1 (MEDIO):** la rama PostgreSQL de la prueba D8 y las consultas nuevas (`anonymizeIdentity`, `listAnonymizedWithPersonId`, `clearPersonId`, borrado RESTRICT real) no se han ejecutado. Sin `TEST_DATABASE_URL` no hay verificación en PG. Requiere PostgreSQL 17 real.
- **R-MEM-1 (BAJO):** `deleteById` del adaptador en memoria (`in-memory-unit-of-work.ts:867`) no aplica RESTRICT. El camino M-01 no es reproducible en memoria y la prueba en memoria no detectaría una regresión de RESTRICT.
- **R-TST-1 (BAJO):** no hay prueba de regresión para el `false` de `claimIdentity` con expedientes en ningún motor. `t1633` solo verifica la FK en el esquema.
- **R-ACT-1 (BAJO, decisión de producto para Neo):** un delegado que vuelva a entrar con un correo aún anclado a una identidad con expedientes (menos de 365 días tras la baja) recibe `DENIED` hasta que se anonimice esa identidad. Es conservador; conviene documentarlo.
- **R-PEND-1 (BAJO):** un expediente `PENDING` que nunca pasa a `EXPIRED` retiene su `person_id` indefinidamente. Es conservador y no contradice el spec.
- **R-MEM-2 (BAJO):** `purgeDelegateData` envuelve toda la pasada en una transacción; un fallo en `releaseExpiredPersonIds` revierte también las anonimizaciones del mismo ciclo. Es aceptable (reintento en la siguiente pasada) pero conviene saberlo.

## Verificación ejecutada (solo lectura)

- `git diff b3b1cd4 f96e16d -- src/`: 17 ficheros, revisados los 9 de dominio y persistencia.
- `npx vitest run tests/integration/persistence/t1580-purga-delegados-011.spec.ts`: 14 pasan, 7 omitidas (PG).
- No se ejecutó tsc, verify-traceability ni verify-oracles (fuera del alcance de la misión de solo lectura).

## Recomendación

1. Morpheus: ejecutar la suite PG con `TEST_DATABASE_URL` (PostgreSQL 17) antes de dar T1644 por cerrado sin reservas.
2. Keymaker: añadir prueba de regresión M-01 en SQLite y PG (FK real) y discriminar el 23503 en el `catch` de `claimIdentity`; opcional, `SAVEPOINT` alrededor del borrado.
3. Neo: decidir R-ACT-1. No es tarea de agentes marcar `[x]`; T1644 sigue `[ ]` hasta decisión de Neo.

TO: Neo (Andrés Vallejo — Level 2) para la decisión R-ACT-1 y el cierre de T1644.
