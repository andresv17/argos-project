# Bitácora de Trinity


## 2026-11-10 — Checkpoint F4 (insumo de seguridad, Feature 002)
- Entregado `.specify/memory/audits/f4-insumo-trinity-seguridad.md`: sesiones (cambios propuestos a STATE-AUTH-SESSION-001, sin editarla), auditoría HMAC/SHA-256, respaldo (token y no escalada).
- 14 PROPUESTAS (P-01..P-14), 7 vectores nuevos (V10..V16), 6 decisiones para Neo (D1..D6). Sin edición de specs/contratos/src; sin commit.

## 2026-11-11 — Checkpoint T223 (vectores sesión expirada y CSRF, Feature 002)
- `session-csrf.security.spec.ts`: 14/14 pasan; sin it.skip/it.todo/toBeTruthy. Mutación 1 (quitar EXPIRED_IDLE en `src/domain/auth/session-policy.ts`): fallan 3. Mutación 2 (anular la comprobación en `csrf-guard.ts`): fallan 4.
- Ambos archivos restaurados idénticos (hash y git diff vacíos); 14/14 de nuevo. Sin vectores débiles. Sin commit ni marca de tarea.

## 2026-11-14 — T302 batería V1..V16 (Feature 002, Fase 8 ola 2)
- `npx vitest run tests/security`: 13 archivos, 267/267 estable (6 corridas); un fallo transitorio de V14 D1 durante edición concurrente de Keymaker (mtime 16:28:39), no reproducible.
- SAST: Semgrep no instalado (no se instaló); grep manual de las 4 reglas sobre src/: 0 coincidencias; npm audit: 0 vulnerabilidades.
- Hallazgos: Caso A solo M-1 (V9 con 1 prueba); Caso B ninguno. Informe: `claude/hallazgos-t302-trinity.md`. Sin cambios en src/specs/tests; sin commit; T302 sin marcar.
