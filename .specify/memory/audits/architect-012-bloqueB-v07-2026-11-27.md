# Acta /architect — Bloque B v0.7 (feature 012, #23), pasada de texto sobre `rama v0.6`

- Fecha: 2026-11-27. Solo DRAFT; sin commits, sin `[x]`, sin `APPROVED`. No se tocó `src/`, `tests/`, `scripts/`, specs 001/004/005, H-01 ni logos. No se ejecutó compile-contracts.
- Entrada: `rama-012-bloqueB-v06-2026-11-27.md`.

| Hallazgo | Sev. | Cambio aplicado | Pendiente Neo |
| --- | --- | --- | --- |
| N-A person_id | ALTO | Solo marcador «PENDIENTE NEO (N-A)» en `data-model.md` (fila de columnas) | Fuente de `person_id` y regla de colisión de cuentas |
| N-B columnas | MEDIO | `data-model.md`: `resolved_by_user_id`/`second_approver_user_id` reemplazadas por `*_admin_id` y `*_person_id`, sin FK a `users` | Fuente de `person_id` (N-A) |
| N-C mapeo aviso | MEDIO | Ninguno | Mapeo desenlace/moot → outcome; `closed_at` en EXPIRED |
| N-D actors | MEDIO | Ninguno | Visibilidad de `actors` del admin lector |
| N-E ancla auditoría | MEDIO | Ninguno | Ancla de 1095 días y tratamiento del motivo |
| N-F barrido huérfanos | MEDIO | `spec.md`: SC-012-120 PROPUESTA (frontera 24 h, sin tocar filas, reintento, idempotencia); `tasks.md` T1641 y Independent Test; `verify-traceability --feature 012` rc=0 (298/298) | Confirmar SC-012-120 (propuesta) |
| N-G MAX_PIXELS/antimalware | BAJO | Referencias T1646 → T1641 en anexo §5.1, `chip-claim.schema.json`, `chip-claim.openapi.yaml`; T1646 aclara que no es suya | Valor de píxeles y producto antimalware |
| N-H constantes | BAJO | `spec.md` l.202: `ADMIN_STEPUP_WINDOW_MINUTES = 5`, `DECISION_REASON_MAX_CHARS = 500` como PROPUESTAS PENDIENTE NEO; `DISPUTE_EVIDENCE_RETENTION_DAYS = 365` añadida a `x-sdd-constants` (valor ya en spec) | Fijar o rechazar las dos propuestas |
| N-I condición F-03 | BAJO | `tasks.md` T1643 recoge validación legal antes de producción | — |
| N-J | info | Sin cambio | — |

Gates: JSON y YAML válidos; `bash scripts/verify-traceability.sh --feature 012` rc=0.
