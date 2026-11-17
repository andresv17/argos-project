# Veredicto Oracle — T265 REVALIDACION (2026-11-13)

VEREDICTO: APTO CONDICIONADO a decision de Neo sobre H-1 y H-4 (sin hallazgos nuevos; H-2 y H-3 CERRADOS). Techo del agente: REVIEW.

## H-2 CERRADO
sqlite-unit-of-work.ts: `truncateWal()` lee `busy` de `wal_checkpoint(TRUNCATE)`; `busy === 0` es exito, `busy !== 0` o excepcion es fallo. `checkpointAfterCommit` hace 2 intentos y luego `process.emitWarning` con texto fijo sin identificadores. No revierte nada (corre tras el commit y nunca lanza).

## H-3 CERRADO
tests/integration/persistence/sqlite-checkpoint.spec.ts (nuevo, base en archivo): 4 pruebas fuertes.
1. WAL > 0 antes; tras borrar: 204, 0 filas de cuenta, -wal de 0 bytes.
2. busy simulado 1 luego 0: exactamente 2 llamadas, 0 avisos.
3. busy persistente: 2 llamadas, 1 aviso; el texto no contiene userId, seudonimo HMAC (comprobado igual a hmacHex), email ni 'elena.solo'.
4. excepcion persistente: 204, cuenta borrada, 1 fila ACCOUNT_DELETE en audit_log, 1 aviso.
Sin relajar nada existente (archivo nuevo; verify-oracles 0 debiles).

## H-1 y H-4: estado conocido, SIN CAMBIOS (no es fallo de esta entrega)
- H-1: tests/unit/account-deletion.spec.ts sin diff; siguen fallando 2 pruebas por el puerto `audit` transitorio.
- H-4: `ApplicationDeps.audit?` sigue como opcional @deprecated y account-deletion-audit.port.ts sigue vivo.
Ambos esperan decision de Neo.

## Alcance del diff (git diff -- src tests)
Solo: unit-of-work.port.ts (+`checkpointAfterCommit?` opcional), account-use-cases.ts (HMAC, ACCOUNT_DELETE, pseudonymizeUser, checkpoint tras commit), use-case-support.ts (audit opcional deprecado), server.ts (retira NullAuditLog), sqlite-repositories.ts (parametros nombrados), sqlite-unit-of-work.ts, y el spec nuevo. Nada fuera de lo declarado. logos.json y scripts/logos.py sin tocar por esta revision.

## Compuertas
- npx tsc --noEmit: 0 errores
- verify-oracles.sh: 90 archivos, 0 debiles, CUMPLE
- verify-traceability.sh --feature 002 --task T265: 4/4, pureza 0, CUMPLE
- vitest sqlite-checkpoint.spec.ts: 4/4 pasan
- vitest run: 98 fallos / 1486 pruebas (1388 pasan). Mismo conteo esperado. Desglose por archivo: backup-use-cases 49, backup-atomicity 11, components 8, canonical-fixtures 4, sqlite-backup-import 4, y el resto 1 a 3 cada uno; incluye 2 de H-1 (account-deletion.spec.ts) y el scrypt preexistente. El resto es la deuda de la suite que ya existia en el veredicto previo (98/1482, sin fallos nuevos).

## Para Neo
Decidir H-1 (actualizar los 2 tests de account-deletion.spec.ts) y H-4 (retirar el puerto transitorio). T265 no puede pasar a COMPLETED por agentes.
