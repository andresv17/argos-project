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

## 2026-11-25 — T1502 Lock (EDGE 011, solo lectura)
- Revisadas D11-01..13 y spec/plan/tasks 011; código de transacciones (PG advisory lock, SQLite inmediato, aceptación de invitación bajo runInTransaction) y REQ-VET-002/011 de 005.
- Hallazgos: 5 ALTA (F-01 reactivación sin tope 20; F-03 retirada de raíz sin SUPER_ADMIN; F-05 enlace HOUSEHOLD dinámico sin selector; F-04 SSRF/bomba/tamaño en picture; F-11 etiqueta IA no viaja con descarga), 6 MEDIA, 3 BAJA. EDGE-011-009..019 propuestos a /architect.
- Acta: .specify/memory/audits/lock-011-T1502-edge-2026-11-25.md. Sin ediciones de spec/tasks/código; sin [x]; sin commit ni push; logos.json intacto.

## 2026-11-26 — Lock 012 Fase 0 (auditoría previa, solo lectura)
- Revisados spec/plan/tasks/data-model 012 y acta de decisiones de Neo. Veredicto FAIL corregible por enmienda; no abrir Bloque A sin cambios.
- Hallazgos H-01..H-23: 5 ALTA (VIEW_ONLY vs D12-10; QR ON que pierde teléfono/alergias; aprobaciones versionadas por solicitud y no por mascota; congelación de disputa sin DELETE_PET; índice global que excluye CHIP_CONFLICT). H-08 (co-propietario ausente) requiere decisión de Neo.
- EDGE-012-023..050 propuestos; EDGE-004, 008, 010, 013, 018 y 020 insuficientes o contradictorios.
- Acta: .specify/memory/audits/lock-012-fase0-2026-11-26.md. Sin ediciones de spec/contratos/tasks/código; sin [x]; sin APPROVED; sin add ni push.
- 2026-11-26 Re-auditoría 012 Fase 0 (MAX_RETRY=1): NO CUMPLE. H-01..H-23 cerrados en texto salvo residuales; H-06, H-08, H-18 con reserva; H-09 parcial.
- Residuales ALTA: R-01 END_CO_OWNERSHIP sin precondición objetiva ni ancla (pet_id,target); R-02 carrera LEAVE/promoción sin bloqueo por mascota; R-03 chip liberado por supresión de cuenta o caducidad de congelación (bypass de disputa); R-04 designación y created_at no trazables en la adenda en disco.
- Acta: .specify/memory/audits/lock-012-reauditoria-2026-11-26.md. Solo lectura de specs/012; sin [x], sin APPROVED, sin add ni push. Decisiones N2-R1..R5 elevadas a Neo.

## 2026-11-28 — Lock 012 T1691 (devil's advocate sobre DRAFT 0.1.0 PETS, solo lectura)
- Revisados share-link-subset-annex.md (ENM-005-E), share-links-pets.openapi.yaml, share-link-pets.schema.json, tasks.md T1691, y cruces con ENM-005-A (bloqueo por mascota), co-ownership §4/§6 y SC-012-053..066/108.
- Hallazgos: 1 ALTA (LK-01 re-entrada de mascota desasignada en enlace estático: requiere decisión de Neo), 4 MEDIA (LK-02 retiradas concurrentes de las dos últimas mascotas; LK-03 borrado de mascota deja PETS sin filas; LK-04 creación frente a desasignación sin candado de mascota; LK-05 replay de Idempotency-Key antes de autoridad de hogar y duplicado en vuelo), 4 BAJA (LK-06 ID repetido y variante de mayúsculas, punto abierto 1; LK-07..09), 2 INFO. Cubiertos: tope 20, idempotencia básica, creador eliminado, co-propietario, revocación frente a retirada.
- Veredicto: NO APTO para firma sin enmienda. Propuestos EDGE-012-070..074 a /architect.
- Acta: .specify/memory/audits/lock-012-T1691-2026-11-28.md. Sin ediciones de contratos/código; sin [x]; sin commit ni push; logos.json intacto.

## 2026-11-28 — Lock 012 T1691 r2 (ENM-005-E DRAFT 0.2.0, solo lectura)
- Revisados annex §3-§10 (0.2.0), openapi share-links-pets 0.2.0 y cruces con 005 (PN-08, EDGE-005-15/20), co-ownership §6, schema PETS y migraciones 0008/0012.
- LK-01..LK-11: cerrados en texto salvo LK-08 (parcial, resumen sin snapshot). LK-01 reabierto por concurrencia (N-01).
- Hallazgos: N-01 ALTA (carrera degradación/LEFT del creador vs creación concurrente; enlace ACTIVE con creador READER que resucita al re-promover; sin orden de candado de hogar para cambios de rol), N-02 MEDIA (colateral a co-propietarios de otras mascotas por disparadores ajenos; EDGE-012-075 propuesto; decisión Neo D-1), N-03 MEDIA (resumen sin snapshot; descarga sin tope; D-2), N-04 BAJA (x-sdd-rbac-action contradice 403 independiente del cuerpo), N-05/N-06 INFO.
- Veredicto: NO APTO sin enmienda. Acta: .specify/memory/audits/lock-012-T1691-r2-2026-11-28.md. Sin ediciones de contratos/código; sin [x]; sin commit ni push; logos.json intacto.

## 2026-11-28 — Lock 012 T1691 r3 (ENM-005-E DRAFT 0.2.1, solo lectura)
- Revisados annex §3.2/3.3/3.6/4.1/4.7/4.9/5.1/5.2/6/9, openapi share-links-pets 0.2.1, spec EDGE-012-070..076, 005 openapi revokeShareLink, domain share-link.ts:22/69, traceability gate (CUMPLE).
- Cerrados: N-01 (texto, §3.2+§6+§5.1 fila 3), N-03 (snapshot §4.1, cota ≤300 s), N-04 (creador), N-05 (CUMPLE), N-06. D-1 y D-2 bien escritas salvo destinatario del aviso.
- Veredicto: CUMPLE CON RESERVAS; 0 ALTA; 3 MEDIA (M-01 N-02 sin EDGE ni destinatario del aviso de D-1; M-02a revocacion PETS sin contrato formal y autoridad ambigua; M-02b remanente N-04 en vista previa); 3 BAJA (B-01 nota TTL inexacta, dominio impone 300; B-02 "normalizados" y bloqueo por existencia; B-03 retirada sin 403 CSRF); 1 INFO.
- Acta: .specify/memory/audits/lock-012-T1691-r3-2026-11-28.md. Sin ediciones de contratos/codigo; sin [x]; sin commit ni push; logos.json intacto.
