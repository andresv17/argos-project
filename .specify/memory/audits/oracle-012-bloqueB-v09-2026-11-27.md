# Acta /oracle — Bloque B DRAFT v0.9 (T1630..T1632, T1633 dep., T1640, T1641, T1648) — 2026-11-27

Validacion en disco, solo lectura. No es aprobacion (solo Neo aprueba). Base: HEAD 687fd7c + cambios sin commit v0.7..v0.9.

STATUS: CUMPLE CON RESERVAS (3 menores).

## Gates
- `bash scripts/verify-traceability.sh --feature 012`: rc=0 (298/298 IDs propios mapeados; 339 vigentes; purity 0).
- `bash scripts/verify-oracles.sh`: rc=0 (642 archivos, 0 oraculos debiles).
- compile-contracts: no ejecutado (por mision).

## Verificaciones
- Sin cambios de esta iteracion en src/, tests/, scripts/, specs/001, specs/004. Los src/terraform/.env.example/deploy-argos/origin-verify/app-config/server/app modificados en el arbol son H-01 previos, ajenos. specs/005/tasks.md (T797) es marca de Neo.
- tasks.md: 25 `[x]` antes y despues (ninguna marca nueva). Cambian T1633, T1640, T1641, T1648 y ademas (frases) linea 70 (SC-012-120), T1643 (condicion F-03) y T1646 (aclaracion).
- Contratos Bloque B: ninguno APPROVED (las APPROVED son Fase 0/Bloque A previos); anexos con "Aprobar DRAFT -> APPROVED" pendiente de Neo.
- data-model.md: `DRAFT 0.9`.
- JSON (chip-claim.schema, admin-disputes.schema, error-catalog) y YAML (chip-claim.openapi, admin-disputes.openapi) parsean.
- ChipRequestOutcome, AdminActorView, AdminActorIdentity, DisputeResolutionNotice y ARBITER_AUDIT_RETENTION_DAYS (closed_at, 1095) presentes y referenciados (annex, schemas, openapi, data-model, spec).

## Incidencias
1. (menor) data-model.md:85 (`ip_rate_events`) aun dice "valor en `T1646` (`CHIP_MULTIPART_MAX_PER_USER_PER_DAY`)"; debe apuntar a T1640 (contador) / T1641 (cuerpo 411/413). Linea no tocada por el diff.
2. (menor) tasks.md cambia ademas linea 70, T1643 y T1646 (fuera de la lista T1633/T1640/T1641/T1648); coherentes con SC-012-120 y rama N-I/N-G, solo frases.
3. (menor) PENDIENTE NEO declarado por architect v0.9: FK/baja de operador (NUEVO-7) y aviso de resolucion al propietario; no cerrable por agentes.
