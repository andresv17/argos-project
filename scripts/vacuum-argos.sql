-- SQL compartido de la secuencia de VACUUM (T473 / T473b; REQ-PG-015, REQ-PG-011, SC-CLD-019).
-- Lo usan .github/workflows/vacuum-argos.yml (extrae cada seccion con awk) y la prueba con centinela
-- tests/integration/persistence/postgres-vacuum-sentinel.spec.ts (misma extraccion), para que no diverjan.
-- Cada seccion empieza en una linea `-- @sql <nombre>` y llega hasta la siguiente; sin punto y coma final ni comentarios dentro.
-- Las sentencias VACUUM se completan con ` <esquema.tabla>` y se ejecutan UNA POR UNA (psql -c), fuera de transaccion.

-- @sql vacuum_simple
VACUUM (ANALYZE)
-- @sql vacuum_full
VACUUM (FULL, ANALYZE)
-- @sql listar_tablas
SELECT quote_ident(schemaname) || '.' || quote_ident(relname) AS tabla FROM pg_stat_user_tables WHERE schemaname = 'public' ORDER BY relname
-- @sql estado
SELECT relname, last_vacuum, last_autovacuum, n_dead_tup FROM pg_stat_user_tables WHERE schemaname = 'public' ORDER BY relname
-- @sql vencidas
SELECT relname FROM pg_stat_user_tables WHERE schemaname = 'public' AND (last_vacuum IS NULL OR last_vacuum < now() - interval '10 days')
