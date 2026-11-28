# Oracle 012 Bloque B DRAFT 0.4 — validacion de consistencia (2026-11-27)
Veredicto: CUMPLE CON RESERVAS (consistencia forense; NO es aprobacion; aprobar es de Neo, Nivel 2). Sin commits ni cambios al arbol salvo esta acta y una linea en el bus.

## Gates
- verify-traceability.sh --feature 012: rc=0 CUMPLE (295/295 IDs propios en tasks.md; pureza 0 violaciones).
- verify-oracles.sh: rc=0 CUMPLE (642 archivos, 0 oraculos debiles).
- compile-contracts: NO ejecutado (instruccion).

## Parseo
- chip-claim.schema.json y error-catalog.json: JSON valido. chip-claim.openapi.yaml: YAML valido (ruby).

## Diff de la iteracion (specs/012, tracked): 8 archivos, +119/-61
admin-disputes-annex.md, error-catalog.json, microchip-error-split-annex.md, chip-claim.openapi.yaml, chip-claim.schema.json, data-model.md, spec.md, tasks.md. Sin tracked: errata-MINOR-bloqueB-v03.md (DRAFT) y actas architect v03/v04.
- tasks.md: 1 linea cambiada (T1641: "365 dias desde closed_at, RESOLVED o EXPIRED" y "hasta closed_at + retencion"); 0 marcas [x] nuevas.
- Sin cambios atribuibles en src/ generated, tests/, scripts/, specs/001, specs/004.
- AJENOS preexistentes (H-01 y otros): .env.example, deploy-argos.yml, terraform/iam.tf, secret_manager.tf, app-config.ts, app.ts, server.ts, playwright.config.ts, .gitignore, CLAUDE.md, .claude/settings.json, specs/005/tasks.md (1 linea), claude/log-*.

## Estados
- Nuevos/tocados en DRAFT: admin-disputes-annex (DRAFT), microchip-error-split-annex (DRAFT), errata-MINOR-bloqueB-v03 (DRAFT), openapi x-sdd-status DRAFT, schema x-sdd-metadata DRAFT, catalogo x-sdd-metadata 0.2.0 DRAFT. Ningun contrato nuevo en APPROVED/LOCKED.

## Incidencias
1. (MEDIA) error-catalog.json: metadata dice 0.2.0 DRAFT, pero el nivel raiz conserva "version": "0.1.0", "status": "APPROVED" (lineas ~117-118, preexistente, no tocado). Lectura ambigua del estado del archivo; architect debe documentar que el raiz cubre solo el bloque 0.1.0 o alinearlo. Verificar que compile-contracts/keymaker no consuma el status raiz.
2. (MEDIA) ERR-OWN12-RETRYABLE (codigo de bloque 0.1.0 APPROVED) cambia su nota (candado global 3000 ms, chip_hmac, antimalware). Es cambio de TEXTO a contenido aprobado; la change_note lo declara "pendiente de aprobacion de Neo" pero el catalogo es un solo archivo: requiere ratificacion explicita de Neo (errata MINOR) antes de implementar.
3. (BAJA) chip-claim.openapi.yaml y chip-claim.schema.json cambian (66 y 27 lineas) sin subir version (siguen 0.1.0 DRAFT); el catalogo si sube a 0.2.0. Inconsistencia de versionado entre contratos hermanos.
4. (BAJA) Nombre errata-MINOR-bloqueB-v03.md mientras la iteracion vigente es 0.4; confirmar que cubre 0.4 o renombrar/anexar.
5. (INFO) Quedan PENDIENTE NEO: H-A2, trinity N-1, criterio contador bloqueado, DEUDA-012-LEGAL-DISPUTAS-QR; T1648 es propuesta sin numerar.
6. (INFO) verify-traceability: IDs trazados en codigo 68/336 es informativo (gate de spec->tasks 1:1 completo).
