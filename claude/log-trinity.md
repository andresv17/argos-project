# Bitácora de Trinity


## 2026-11-10 — Checkpoint F4 (insumo de seguridad, Feature 002)
- Entregado `.specify/memory/audits/f4-insumo-trinity-seguridad.md`: sesiones (cambios propuestos a STATE-AUTH-SESSION-001, sin editarla), auditoría HMAC/SHA-256, respaldo (token y no escalada).
- 14 PROPUESTAS (P-01..P-14), 7 vectores nuevos (V10..V16), 6 decisiones para Neo (D1..D6). Sin edición de specs/contratos/src; sin commit.

## 2026-11-11 — Checkpoint T223 (vectores sesión expirada y CSRF, Feature 002)
- `session-csrf.security.spec.ts`: 14/14 pasan; sin it.skip/it.todo/toBeTruthy. Mutación 1 (quitar EXPIRED_IDLE en `src/domain/auth/session-policy.ts`): fallan 3. Mutación 2 (anular la comprobación en `csrf-guard.ts`): fallan 4.
- Ambos archivos restaurados idénticos (hash y git diff vacíos); 14/14 de nuevo. Sin vectores débiles. Sin commit ni marca de tarea.
