# Acta /oracle — Feature 012, Bloque B (#23): migraciones T1633/T1648 y rojas T1634 (2026-11-27)

Alcance: commits ea3801c, dbb826b, 206e80b (solo lectura; sin cambios). Veredicto: **CUMPLE CON RESERVAS**.

## Aislamiento de hunks
- ea3801c: 8 archivos, solo contratos de 012 (annex, error-catalog, openapi, schemas) y tasks.md de 012 (T1630..T1632 a [x]). T1633 queda [ ] (techo REVIEW respetado).
- dbb826b: 4 migraciones (SQLite 0036/0037, PG 0032/0033) y 7 specs de persistencia; sin otros src/.
- 206e80b: 5 archivos de tests (fixture + 4 specs); cero src/.
- Cero hunks de H-01 (app-config, server, app, origin-verify*, deploy-argos.yml, terraform/**, .env.example), de specs/005 ni de logos.json/logos.py.

## Migraciones
- dispute_evidence: SQLite STRICT; FK request_id -> owner_requests ON DELETE RESTRICT; content_type CHECK cerrado (pdf/jpeg/png/webp); bytes>=1; object_key UNIQUE (indice). Idem en PG (con CHECK/FK).
- ip_rate_events: sin FK a users; scope CHECK IN (CHIP_LOOKUP, CHIP_MULTIPART).
- admin_identities.person_id TEXT NULL, CHECK 8..64 + charset (GLOB en SQLite, regex en PG), UNIQUE parcial WHERE NOT NULL.
- owner_requests: resolved_by_admin_id y second_approver_admin_id FK RESTRICT a admin_identities(admin_id); *_person_id sin FK (CHECK 8..64); second_approved_at.
- pets_microchip_global NO modificada (prueba explicita en t1633-t1648 verifica su DDL).
- Paridad SQLite/PG: schema-parity verde (lista de versiones 0036/0037 actualizada).

## Gates
- npx tsc --noEmit: rc=0
- verify-traceability.sh --feature 012: rc=0 (CUMPLE)
- verify-oracles.sh: rc=0 (648 archivos, 0 oraculos debiles)
- vitest tests/integration/persistence (SQLite/memoria, sin TEST_DATABASE_URL): 78 passed, 3 skipped files; incluye t1633-t1648 verde.
- PG17 efimero (argos-pg17-012, puerto 55499, TEST_DATABASE_URL solo en shell): persistence 81/81 archivos, 1197 passed, 1 skipped; contenedor eliminado.
- Rojas T1634: 46 failed | 23 skipped (69); todas por "Failed to load url" (chip-claim-use-cases, chip-dispute-use-cases, chip-ip-rate-limit, chip-uniqueness); ningun AssertionError. Import dinamico con @vite-ignore en tests/fixtures/chip-012.ts, por lo que tsc rc=0.

## Reservas
1. Columnas resolved_by_user_id y second_approver_user_id (owner_requests, migracion de about/admin previa) quedan EN DESUSO sin retirar (SQLite no elimina columnas con FK sin reconstruir tabla). Decision pendiente de Neo/architect (reconstruccion o dejarlas).
2. Los comentarios de 0037 SQLite remiten a "0033" y los de PG a "0029" para la misma migracion de origen (numeraciones distintas por motor, coherente), pero conviene unificar la redaccion.
3. Las rojas estan en estado rojo intencional: su commit queda excluido del gate hasta T1635+ (keymaker); la fase 2 sigue bloqueada por MicrochipId duplicado (decision de Neo).
4. Un puerto 55432 estaba ocupado por otro contenedor (proyectoargos-postgres); la primera corrida con ese puerto no es evidencia valida y fue repetida en 55499.
5. T1633 sigue [ ] en tasks.md (correcto: techo REVIEW); T1648 no verificado en tasks.md por este alcance.
