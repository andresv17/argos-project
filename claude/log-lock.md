# Bitácora de Lock (Anti-Bias Lens)

2026-11-15 Lock: revisión adversarial de specs/003-cloud-gcp (spec, plan, research, data-model, quickstart, tasks, contracts/README).
- Resultado: 29 hallazgos H-LOCK-001..029 (10 altos, 14 medios, 5 bajos). Informe: .specify/memory/audits/gate-lock-003.md.
- Altos: verificación de schema_migrations al arrancar vs pool perezoso (001), /readyz público mantiene Neon despierto (002), transacción zombi con candado global (003), terraform apply reasigna tráfico (004), imagen marcadora sin /healthz (005), versión de secreto sin guarda (006), secret latest y rotación (007), WIF PR con SA admin (008), VACUUM por rol sin privilegio (009), DDL sin lock_timeout y expand/contract sin prueba (010).
- Sin ediciones de specs ni código; sin commit ni push; nada marcado APPROVED.

2026-11-18 Lock: revisión adversarial del diseño de 006 (spec, plan, data-model, research, home-scene.machine.json). Solo lectura.
- 23 hallazgos H-LCK-006-01..23 (6 altos, 10 medios, 7 bajos). Informe: .specify/memory/audits/lock-006-diseno.md.
- Altos: T2 publica datos de consentimiento retirado/desasignado (01), clave INTENT no persistida (02), lease nace en T1 y cola saturada (03), doble entrega concurrente sin claim (04), salida JPEG/filtro sin tope de fallos (05), referencia degradada publicada como ready (06). Sin ediciones; sin commit ni push.

2026-11-19 Lock: revisión adversarial de la Feature 007 (spec, plan, tasks, data-model), foco #13. Solo lectura de specs y src.
- 9 hallazgos nuevos EDGE-007-009..022 (3 altos: 009 edición con formulario obsoleto revierte estado; 010 carrera registro vs marcado; 011 birthDate posterior a deceasedAt). Medios: 012, 013, 014, 015, 016, 017, 018. Bajos: 019..022.
- Verificado: record-use-cases toma lockPet; pet-use-cases:112-120 no lo muestra; UpdatePetInput sin versión; backup-envelope additionalProperties false.
- Acta: .specify/memory/audits/lock-007-edge.md. Sin ediciones de specs/tasks/src; sin commit ni push; sin [x].

## 2026-11-20 — T1107 Lock 008 (spec 7614387, solo lectura)
- Revisión adversarial de specs/008/spec.md contrastada con src/ (session-auth.ts:51, 0002_account_identity.sql:12, auth-use-cases.ts:55-62,114-121, media-use-cases.ts:136/165).
- 18 hallazgos H-LCK-008-01..18: 6 ALTA, 8 MEDIA, 4 BAJA. Propuestos EDGE-008-023..040.
- Acta: .specify/memory/audits/lock-008-spec.md (sin commit, sin ediciones de spec/src/tests, sin [x]).

## 2026-11-23 — T1204 Lock 009 (compuerta Fase 0, solo lectura)
- Revisión de spec 009 contra plan, tasks, acta de preguntas, inbox, spec 007 (APPROVED) y código (`scene-run-use-case.ts:151,162`, sin `refund`).
- 26 hallazgos: 3 ALTO (LCK-01 umbrales /admin sin fijar; LCK-02 tope USD no garantizado al cambiar modelo; LCK-03 D9-18 aprobado no reflejado), 13 MEDIO, 10 BAJO. EDGE propuestos EDGE-009-035..049 con texto exacto.
- Veredicto PASS CON CAMBIOS. Acta: .specify/memory/audits/lock-009-edge.md. Sin ediciones de spec/plan/tasks/src/tests; sin [x]; sin commit ni push.

## 2026-11-24 — T1402 Lock 010 (edge-review, solo lectura)
- Veredicto FAIL corregible por enmienda. Acta: .specify/memory/audits/lock-010-T1402-edge-2026-11-24.md
- H-01..H-06 (contradicciones con D10-03/D10-05/D10-07 y prueba del Bloque C), EDGE-010-008..013 propuestos a /architect. Sin ediciones de spec/tasks/código; sin [x]; sin commit ni push.

## 2026-11-25 — T1426 Lock (parte Google 18+, solo lectura)
- Revisado T1424 (2dce52f): google-auth-use-cases.ts:273-275 (422 antes de consumir), :302-303 (CAS USERNAME), routes:102-113 (cookie), adult-declaration.ts:23-28; persistencia CAS PG/SQLite/memoria; validadores v36 y v31 probados en vivo.
- Veredicto PASS CON OBS: 0 críticos/altos. H-01 BAJA (perdedor de carrera con misma cookie recibe 400 tras creación; cookie no retirada en fallo); H-02 BAJA (cuerpo sin objeto da ERR-SCHEMA en vez de ERR-MEN10).
- Acta: .specify/memory/audits/lock-010-T1426-google-2026-11-25.md. Sin ediciones de código/pruebas/specs; sin [x]; sin push; logos.json intacto.
