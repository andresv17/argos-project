# Acta /oracle — Bloque B DRAFT 0.6 (T1630..T1632, T1648) — 2026-11-27
Validacion de consistencia en disco (no es aprobacion). Veredicto: CUMPLE CON RESERVAS.

Gates: verify-traceability --feature 012 rc=0 (297/297 propios; 69/338 trazados con codigo, informativo); verify-oracles rc=0 (642 archivos, 0 debiles); JSON (4 schemas + error-catalog) parsean; YAML (chip-claim, admin-disputes) parsean con node `yaml`. compile-contracts NO ejecutado.

Verificado: tasks.md solo anade T1648 (sin [x] nuevas atribuibles; T1619 [x] es decision de Neo 1-13); errata-MINOR-bloqueB-v04.md APPROVED por Neo 2026-11-27; chip-claim.* (0.2.0 DRAFT, change_type MINOR), admin-disputes.* (0.1.0 DRAFT), error-catalog bloque 0.2.0 (x-sdd-metadata DRAFT; raiz 0.1.0 APPROVED es bloque previo) sin APPROVED nuevos; constantes 1095/30/24 con valor; sin PENDIENTE NEO / [CONTENIDO / PENDIENTE T1646 en specs/012; propuestas abiertas explicitas: ADMIN_STEPUP_WINDOW_MINUTES=5, DECISION_REASON_MAX_CHARS=500, 403 vs ERR-ADM12-STEPUP-REQUIRED. Sin cambios en specs/001, specs/004; src/, terraform/, .github, .env.example, app-config/server/app modificados pero con mtime anterior (app.ts 06:33, iam.tf 25-nov) y son H-01/otra linea; scripts/ y tests/ solo untracked previos (gh-project-sync, logos.py, origin-verify*).

Incidencias:
1. chip-claim.schema.json y admin-disputes.schema.json son DRAFT; error-catalog raiz dice "APPROVED" 0.1.0 con bloque 0.2.0 DRAFT en x-sdd-metadata (documentado; riesgo de lectura equivocada por herramientas).
2. Arbol de trabajo con cambios H-01 (app-config, server, app, origin-verify*, deploy-argos.yml, terraform/**, .env.example) y specs/005/tasks.md T797 (marca de Neo) sin commit: excluir del commit selectivo.
3. Actas 012 del Bloque B (architect v03..v06, oracle v04/v05, rama y trinity) siguen untracked tras 8dee07e: incluirlas.
4. Python local sin modulo yaml: YAML validado con node.

Archivos de la iteracion: ver reporte a /morpheus.
