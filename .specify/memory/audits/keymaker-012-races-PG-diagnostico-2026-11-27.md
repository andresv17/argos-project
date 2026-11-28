# Diagnostico races-012 lock_timeout en PG17 — 2026-11-27 (/keymaker, solo lectura)

Veredicto: BUG DE PRUEBA (fixture). No es bug de produccion.

## Causa raiz
`depsA(uow)` en tests/fixtures/concurrent-engines.ts:115 (SQLite) y :159 (PostgreSQL) construye CADA VEZ un `DeterministicIdAdapter` nuevo (`depsWithIds`, :86-88) con la misma secuencia `aaaaaaa2-0000-4000-8000-000000000001...`; el cursor reinicia en 0.
En tests/fixtures/co-ownership-012.ts:
- `fromRace` :103 fija `a: engine.depsA()` una vez (adaptador #1).
- `holdingA` :106-110 llama `engine.depsA(holdBeforeCommit(...))` => adaptador #2 con cursor en 0.

## Secuencia
1. `makeCoOwners(seeded(engine), [MARIA])` usa `race.a` (adaptador #1): invite/accept llaman `recordOwnershipAudit` (co-ownership-use-cases.ts:149, :203) y consumen aaaaaaa2-...0001 y 0002 -> filas en audit_log.
2. `engine.holdingA(leave(MARIA))` (races-012.spec.ts) usa el adaptador #2: `applyLeave` -> `recordOwnershipAudit` (co-ownership-support.ts:48-58, `deps.auditIds.nextId()`) emite de nuevo aaaaaaa2-...0001.
3. INSERT en audit_log viola audit_log_pkey (23505). `work` de la transaccion lanza ANTES de `entered()` en holdBeforeCommit (concurrent-engines.ts:49-52).
4. `holder.entered` nunca resuelve -> `await holder.entered` cuelga 120 s (timeout). `holder.result` rechaza sin handler -> error no manejado 23505.
5. Nunca se toma/retiene el candado de la mascota, asi que LEAVE de B jamas llega a ejercer lock_timeout / ERR-OWN12-RETRYABLE: la prueba no llega a ejercitar produccion.

Por que SQLite no lo muestra: `holdingA` solo se usa en este test, que es solo PG; el resto de pruebas usa un unico `race.a`, sin segunda instancia con cursor reiniciado. Memoria: holdingA no retiene nada.

Produccion no se ve afectada: IdGenerator real (UUID aleatorio) no reinicia secuencias; el 23505 por id fijo no tiene relevancia ni ruta de reintento a RETRYABLE (no aplica).

## Cambio minimo recomendado (NO aplicado)
En tests/fixtures/concurrent-engines.ts, `depsA` debe compartir los adaptadores de ids entre llamadas: crear una vez por motor `const idsA = new DeterministicIdAdapter(ids('aaaaaaa1')); const auditIdsA = new DeterministicIdAdapter(ids('aaaaaaa2'));` y que `depsA(uow)` los reutilice (`depsWithIds(uow, idsA, auditIdsA)`), en createSqliteConcurrentEngine y createPostgresConcurrentEngine. Alternativa de una linea: en fromRace.holdingA usar `{ ...engine.a, uow: holdBeforeCommit(engine.uowA, ...) }` (reutiliza ids y clock de `race.a`).
Observacion adicional: `fromRace.setNow` (co-ownership-012.ts ~:113) llama `engine.depsA().clock`, que tambien es una instancia nueva: el reloj de `race.a` no cambia; usar `a.clock`. Revisar con /oracle.
Reproduccion contra PG17 no repetida: la lectura es concluyente (colision determinista).
