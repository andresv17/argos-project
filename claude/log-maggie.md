# Bitácora de Maggie (Especialista Clínico Veterinario)

## 2026-11-10 — F4 insumo clínico de especies (Feature 002)
- Leídas spec 002 (REQ-REC2-*, INV-REC2-002, REQ-PET2-*, 7B), spec 001 (REQ-REC-*, REQ-PET-002) y constitución II.
- Entregado .specify/memory/audits/f4-insumo-maggie-especies.md: 2/8 especies validadas por spec (CANINE, FELINE), 6/8 con cota máxima provisional (150.000 kg).
- Sin alertas de peso ni geriátricas, sin años humanos, sin calendario por especie. 5 puntos para veterinario (P-1..P-5). Sin commit.

## 2026-11-11 — T234 inicio (Feature 002, rebanada 2)
- Leídos src/domain/pet/*, src/domain/records/weight-limits.ts, sanitary-alert-evaluator.ts, insumo F4.
- Voy a escribir .specify/memory/audits/rebanada-2-maggie.md (8 especies, alertas, ADR-002-15, P-1..P-5). Sin commit; no marco T234.

## 2026-11-11 — T234 fin
- Escrito .specify/memory/audits/rebanada-2-maggie.md. 2/8 cotas validadas, 6/8 provisionales; sin alertas de peso/edad (código leído).
- ADR-002-15 ACEPTADO con condición de texto UI ("sin próxima fecha", nunca "al día"). P-1..P-5 siguen abiertos. Sin commit.

## 2026-11-13 — T268 (Feature 002, rebanada 4)
- Leídos spec REQ-REC2-002/003, STATE-ALERT-001, data-model:117, evaluator, superseded-guard, record-invariants y pruebas T255/T260/T263.
- vitest: 107 pruebas, 104 pasan, 3 fallan (GET /pets, ajenas). Escrito .specify/memory/audits/rebanada-4-maggie.md: H-1 media (sin prueba de SUPERSEDED con fecha nula), H-2 baja, H-3 baja. Sin commit; no marco T268.

## 2026-11-26 — Auditoría clínica previa Fase 0 de la Feature 012
- Leídos decisiones-neo-012, spec.md, data-model.md, research.md y tasks.md (T1606). Solo lectura; sin cambios en specs ni contratos.
- Acta: .specify/memory/audits/maggie-012-fase0-2026-11-26.md. Veredicto NO CUMPLE (corregible en texto): 4 ALTO, 7 MEDIO, 7 MENOR.
- ALTO: «Sin alergias críticas registradas» puede leerse como ausencia de alergia; no existe texto del aviso del QR; topes de dosis por unidad sin fijar; unidad `UNIT` ambigua y falta `MCG`.

## 2026-11-27 — Lectura clínica final Modo Cuidador (T1658, GH #26, HEAD 7bff7aa)
- Solo lectura; sin cambios en src/, contratos, logos.json ni tasks.md. T1658 queda `[ ]` (solo Neo marca `[x]`).
- Hallazgo ALTO H-01: `IU` está en schema 0.1.2, `DOSE_UNITS` (care-routine.ts:14), UI (care-view.ts:19, CarePanel.tsx:407) y tests (care-domain-012.spec.ts:85), pero spec REQ-CAR12-001 (spec.md:100) dice «no se sustituye por IU en el Escalón 1». Requiere decisión de Neo.
- Verificados OK: umbrales CANINE_FELINE y OTHER_SPECIES vacío; mapeo especie; retención 1095/365/30/365 (maintenance-use-cases.ts:347-351); R-1 effective_to = updated_at (care-routine-use-cases.ts:90,117); disclaimer y «no la impide» solo MEDICATION (CarePanel.tsx:103).
- Acta: .specify/memory/audits/maggie-012-T1658-2026-11-27.md
