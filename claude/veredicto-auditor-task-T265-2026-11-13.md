# Veredicto Oracle — T265 (2026-11-13) — CONDICIONADO

Base: HEAD 435dd98, rama 002-plataforma-v21, cambios sin commit. Diff de src/: 6 archivos (+34/-13); `git diff -- tests` vacío (Keymaker no tocó pruebas).

## Alcance del diff (correcto)
- account-use-cases.ts:119-181: seudónimo `auditPseudonym.hmacUserId(userId, auditHmacSecret)`; una fila `ACCOUNT_DELETE/USER` con `executorUserId = entityId = HMAC` (spec REQ-AUD-001 N-A, SC-014) dentro de la transacción (:153); `pseudonymizeUser(repositories, userId, pseudonym)` (:155) en la misma transacción; `checkpointAfterCommit?.()` fuera de ella (:180) tras el commit (ADR-002-13). `previous: account` solo entra como SHA-256 de la vista pública (T259).
- sqlite-repositories.ts:653-660: corrección real de bug (parámetros `?1/?2` con `run(a,b)` -> `@userId/@hmac` con objeto). Sin ella la seudonimización fallaba.
- server.ts: retirado `NullAuditLogAdapter` de producción; `auditLog`/`auditPseudonym` reales ya cableados (T262).
- secure_delete: ya estaba (sqlite-database.ts:73 por conexión; migración 0005). No es cambio de T265, cumple.
- El seudónimo no aparece en claro ni en logs ni en la fila: el HMAC es el valor guardado (esperado); el userId no aparece en el volcado (account-deletion.api.spec.ts:85 verde, V15). No hay log del seudónimo en el diff. Aviso de checkpoint (sqlite-unit-of-work.ts:43): texto fijo, sin identificadores. OK.

## Compuertas (ejecutadas)
- `npx tsc --noEmit`: 0 errores.
- `verify-oracles.sh`: CUMPLE (89 archivos, 0 débiles).
- `verify-traceability.sh --feature 002 --task T265`: CUMPLE 4/4, pureza 0 violaciones.
- Trío audit.api / account-deletion.api / audit-pseudonym: 34 pasan, 2 fallan; ambos fallos son la purga ADR-002-14 (falta `maintenance-use-cases.ts`) = T266, fuera de alcance. Los tests T265 (ACCOUNT_DELETE HMAC, sin userId en claro) pasan.
- Suite completa: **98 fallos / 1482 (1384 verdes), 17 archivos con fallos**. Línea base declarada 102 (log-keymaker): -6 de T265, +2 nuevos (ver H-1). Los 98 se reparten: 49 backup-use-cases, 11 backup-atomicity, 8 components, 4+3+2 contratos, 4 sqlite-backup-import, 2 audit.api (T266), 2 account-deletion unit (nuevos), 1 scrypt, resto rebanada 5/UI; ninguno en código tocado por T265 salvo H-1.

## Hallazgos
- **H-1 (bloqueante, regresión nueva)**: tests/unit/account-deletion.spec.ts:175 y :201 siguen afirmando el puerto transitorio (`t.auditCalls`); ahora recibe `[]` (`expected [] to deeply equal [...]`, `expected [] to have a length of 1`). La suite pasó de 0 a 2 rojos propios por el cambio. El `setup()` (líneas 36-54) inyecta `audit` y ya no se invoca. Hay que reescribirlas para afirmar la fila ACCOUNT_DELETE vía `auditLog`/snapshot y el rollback sin fila (:143, :201).
- **H-2 (bloqueante, defecto funcional de ADR-002-13)**: sqlite-unit-of-work.ts:40 ignora el resultado de `wal_checkpoint(TRUNCATE)`. Verificado empíricamente con better-sqlite3 y un lector abierto: devuelve `[{busy:1,log:4,checkpointed:3}]` SIN lanzar, y el WAL no se trunca. El `catch` solo cubre excepciones, así que el caso real de fallo (lector concurrente) no reintenta ni avisa, contra "si falla ... se registra un aviso y se reintenta" (plan.md:99). Corrección: leer `busy` y tratar `busy !== 0` como fallo (reintentar una vez y avisar).
- **H-3 (bloqueante, sin evidencia)**: no existe prueba de `checkpointAfterCommit` (grep tests: solo sqlite-repositories.spec.ts:318, ajena). Ni el truncado del WAL tras eliminar, ni el reintento, ni el aviso sin identificadores, ni que un fallo no revierte el 204. Pedir pruebas con base en archivo (WAL de 0 bytes tras eliminar; fallo inyectado/`busy` -> un aviso sin userId/HMAC; 204 se mantiene).
- **H-4 (condición, deuda del título "sustituir")**: el puerto transitorio sigue: `AccountDeletionAuditPort` (account-deletion-audit.port.ts, ports/index.ts), `NullAuditLogAdapter` (null-audit-log.adapter.ts), `audit?` @deprecated en use-case-support.ts, y consumidores tests/fixtures/application-harness.ts:7,98, tests/unit/account-deletion.spec.ts, tests/unit/infrastructure-adapters.spec.ts:7,193-205, tests/security/exploits/log-redaction.security.spec.ts:14. `audit` es ya código muerto (nadie lo invoca). Exigir retirar puerto, adaptador y sus pruebas, o que Morpheus registre diferimiento explícito a una tarea concreta. Mantenerlo "deprecated" no es cierre de T265.
- **H-5 (observación, no bloquea)**: el aviso usa `process.emitWarning` y no el logger pino (sqlite-unit-of-work.ts:43). Cumple "sin identificadores", pero es un canal no estructurado fuera de la redacción de logs. Aceptable si el UoW no tiene acceso al logger; registrar como decisión.
- **H-6 (ya declarado, dictamen)**: ScryptPasswordHasherAdapter (tests/unit/infrastructure-adapters.spec.ts, "N excesivo para la memoria") falla por `Test timed out in 5000ms`; el test no usa auditoría ni los archivos tocados, y log-keymaker.md:393/398 lo declara en la línea base de 102. Preexistente, ajeno a T265 (sin tocar el árbol: no se pudo ejecutar HEAD limpio; la inferencia es por independencia de código y por la línea base de la bitácora).

## Veredicto: CONDICIONADO
Condiciones para APTO (re-validación mínima): corregir H-1, H-2 y H-3 y cumplir H-4 (retirar el puerto transitorio o diferimiento explícito). Resultado esperado: suite = 96 fallos (98 menos los 2 de H-1), tsc 0, oracles CUMPLE, traza T265 CUMPLE.
Decisiones de Neo: ninguna nueva. Marcar `[x]` T265 sigue siendo exclusivo de Neo tras APTO.
