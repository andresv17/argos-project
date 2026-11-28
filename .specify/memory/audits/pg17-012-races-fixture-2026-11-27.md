# PG17 012 races: correccion de fixture (2026-11-27)

Causa: depsA(uow) creaba DeterministicIdAdapter y reloj nuevos por llamada; holdingA reiniciaba la secuencia aaaaaaa2 y violaba audit_log_pkey (23505).
Cambio (solo tests/fixtures): concurrent-engines.ts stableDepsA (deps de A construidas una vez por motor, depsA(uow) = {...shared, uow}) en SQLite y PG; co-ownership-012.ts fromRace reutiliza `a` en holdingA y setNow (antes setNow cambiaba un reloj descartable: era no-op sobre race.a; ahora actua sobre el reloj real).

Resultados
- npx tsc --noEmit: rc=0
- races-012 sin PG (SQLite+memoria): 14 passed, 8 skipped, rc=0
- PG17 (postgres:17, contenedor argos-pg17-012, eliminado): races-012 21 passed, 1 failed; parity-012 59 passed, 3 failed, 1 skipped.
- Fixture arreglado: ya no hay 23505 ni timeout de 120 s; el LEAVE retenido llega a entered().
- parity: unica roja EDGE-012-044 x3 motores (ERR-BACKUP-REFERENTIAL-INTEGRITY vs ERR-CHP12-MICROCHIP-REGISTERED), asertos intactos (B-2).

Hallazgo residual (NO es de fixture; src intacto)
Test T1615 lock_timeout (PG, 2 sesiones): B espera en pg_advisory_xact_lock global (postgres-unit-of-work.ts:88, transaction()), no en un bloqueo por mascota; PG_LOCK_TIMEOUT y PG_STATEMENT_TIMEOUT son ambos 10s, vence statement_timeout ("canceling statement due to statement timeout") en vez de mapearse a ERR-OWN12-RETRYABLE en ~3000 ms (OWNERSHIP_LOCK_TIMEOUT_MS), y PG_IDLE_IN_TRANSACTION_TIMEOUT 15s mata la sesion retenida. Requiere decision de /architect (bloqueo por mascota con lock_timeout=OWNERSHIP_LOCK_TIMEOUT_MS y mapeo a RETRYABLE) y trabajo en src (Bloque B).
