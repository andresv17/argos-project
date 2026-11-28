# Acta Architect 012 — decisiones D1, D6, D7, D8, D9 (2026-11-27)
Origen: decisiones de Neo aprobadas por Logos, despachadas por Morpheus. Solo texto (spec, anexo, data-model); sin src/, tests/, commits, push ni `[x]`.

- D1 (cooldown B): `spec.md` REQ-CHP12-004 y SC-012-111 alineados con `chip-claim.openapi.yaml` y `error-catalog.json`: LIMIT y COOLDOWN se evalúan ANTES de resolver el chip, sobre filas propias, mismo 409 para cualquier chip (trinity M-4). `chip-claim.openapi.yaml` y el catálogo YA estaban en B (no existía la frase «tras las precondiciones»): sin cambios en contratos.
- D6: motivo de decisión se purga con `admin_audit_entries` a 24 meses (R-1) en `spec.md` REQ-CHP12-007, `contracts/admin-disputes-annex.md` (§auditoría) y fila «Auditoría 012» de `data-model.md`; 1095 solo expedientes.
- D7: solo titulares (principal y co-propietario ACTIVE) en spec.md: escenario 52 y 56, REQ-CAR12-001, REQ-CAR12-003 (reversión), SC-012-025, SC-012-033. ADMIN de hogar no define rutinas ni concede niveles.
- D8: `data-model.md` fila `admin_identities.person_id`: baja con anonimización y vínculo conservado (RESTRICT/fila desactivada); `person_id` = NULL al vencer el último expediente cerrado. Quitado PENDIENTE NEO.
- D9: `data-model.md` fila `resolved_by_person_id...`: 1095 días desde `closed_at` en apropiación (evidencia 365, fila después, como `maintenance-use-cases.ts`), 90 en ausencia.
- Aviso: `admin-disputes-annex.md` está `APPROVED`; se editó solo texto por D6 (explícito), sin tocar el estado. Neo debe confirmar que ese cambio de texto no requiere re-firma.
- Gates: verify-traceability --feature 012 rc=0 (299/299 CUMPLE); verify-oracles rc=0.
