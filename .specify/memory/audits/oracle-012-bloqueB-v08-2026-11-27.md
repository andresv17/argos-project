# Acta /oracle — Bloque B v0.8 (T1630..T1632, T1648) — 2026-11-27
Estado: validacion en disco, SIN aprobacion (la aprobacion de contratos es de Neo, Nivel 2). HEAD 687fd7c + cambios sin commit de architect v0.7/v0.8.

## Veredicto: CUMPLE CON RESERVAS (3 menores, ninguna bloqueante)

## Gates
- verify-traceability.sh --feature 012: rc=0, 298/298 IDs mapeados (SC-012-120 incluida), Purity 0 violaciones.
- verify-oracles.sh: rc=0, 642 archivos, 0 oraculos debiles.
- JSON (4 schemas + error-catalog) y YAML (chip-claim, admin-disputes openapi) parsean. compile-contracts NO ejecutado (segun mision).

## Comprobaciones
- Alcance: cero cambios de esta iteracion en src/, tests/, scripts/, specs/001, specs/004. specs/005/tasks.md solo T797 -> [x] (marca de Neo). Archivos H-01 (app-config.ts, app.ts, server.ts, origin-verify*, deploy-argos.yml, terraform/**, .env.example) modificados pero previos y ajenos (presentes en el git status inicial); no atribuibles.
- tasks.md (specs/012): cambios en T1641 (+N-F/N-G, 16 MP, ClamAV), T1643 (condicion F-03/N-I), T1646 (aclara que pixeles/antimalware no son suyos), cabecera Independent Test (+SC-012-120), SC-012-120 mapeada. Cero marcas [x] nuevas. T1648 sin cambios en tasks.md en esta iteracion.
- Estados: ningun contrato del Bloque B en APPROVED; admin-disputes-annex y microchip-error-split-annex DRAFT; schemas y openapi DRAFT; solo errata-MINOR-bloqueB-v04 APPROVED (firma Neo 2026-11-27).
- chip-claim.schema.json: version 0.2.0, change_type MINOR, DISPUTE_EVIDENCE_MAX_PIXELS value=16000000, +DISPUTE_EVIDENCE_RETENTION_DAYS=365.
- admin-disputes.schema.json: ADMIN_STEPUP_WINDOW_MINUTES value=5, DECISION_REASON_MAX_CHARS value=500; +AdminActorView (alias/rol; ids solo SUPER_ADMIN); outcome RESOLVED_APPROVED/RESOLVED_REJECTED/EXPIRED.
- Marcadores: 0 "PENDIENTE NEO", 0 "PROPUESTA", 0 "POR DETERMINAR" en specs/012.

## Reservas
1. chip-claim.schema.json:69 conserva "valor a fijar en T1646" para el tope de bytes multipart de openChipDispute (M-1). Es parametro de implementacion derivado (MAX_FILES x tope 004 + margen), no un N-A..N-E; pero la referencia a T1646 esta desfasada (T1646 ya no es la duena de limites de evidencia; ahora T1641). Sugerir corregir la referencia a T1641 o fijar la formula.
2. tasks.md modifica ademas T1643 y T1646 (aditivo, coherente con N-I/N-G); no estaban en la lista esperada (T1641, T1648, SC-012-120). Revisar que Neo las acepte al aprobar.
3. admin-disputes.schema.json declara change_type MAJOR (documento nuevo 0.1.0); correcto para doc nuevo, solo verificar que sea la convencion buscada.

## Archivos de esta iteracion (commit selectivo)
specs/012-multiduenio-microchip-cuidador/{spec.md, data-model.md, tasks.md,
 contracts/admin-disputes-annex.md,
 contracts/openapi/admin-disputes.openapi.yaml, contracts/openapi/chip-claim.openapi.yaml,
 contracts/schemas/admin-disputes.schema.json, contracts/schemas/chip-claim.schema.json}
.specify/memory/audits/{architect-012-bloqueB-v07-2026-11-27.md, architect-012-bloqueB-v08-2026-11-27.md, oracle-012-bloqueB-v08-2026-11-27.md}
(no usar git add de audits/ completo: hay >300 actas sin trackear de otras features; excluir specs/005/tasks.md, H-01 y claude/ salvo que Morpheus decida.)
