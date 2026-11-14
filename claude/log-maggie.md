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
