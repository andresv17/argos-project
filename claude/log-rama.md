# Bitácora Incremental — Rama (`/rama` — Privacidad, Habeas Data y Respaldos Atómicos)

> Regla Write-Ahead Log: cada micro-hito se registra aquí y en `claude/registro-proceso-argos.md` antes de responder.

## `[2026-11-10 | F4: insumo de privacidad y atomicidad, Feature 002]`
- Checkpoint: entregado `.specify/memory/audits/f4-insumo-rama-privacidad.md` (datos por entidad, secuencia de eliminación A1-A4 y B1-B11, atomicidad de importación, 11 riesgos R-01..R-11, 7 decisiones D-1..D-7).
- Todo lo fuera de la spec 002 va marcado PROPUESTA. Fase B de la eliminación es 100 % atómica; los pasos no atómicos (NA-1..NA-6) son externos y tienen compensación.
- Solo documentación; sin edición de specs, contratos, src, tests, tasks ni constitución; sin commit ni push; nada marcado COMPLETED.

## 2026-11-11 · T224 verificación de privacidad (rebanada 1) · checkpoint
- credentials.security.spec.ts (11) y log-redaction.security.spec.ts (3): 14/14 pasan; buscan correo, contraseñas, token, cookie, hash, userId y username en logs, respuestas y volcado de la base.
- Mutation check: hook temporal en src/infrastructure/http/app.ts que registraba el cuerpo de la petición; las 3 pruebas de log-redaction fallaron; archivo restaurado (shasum OK, git diff vacío en src/). Primer intento con Buffer sin convertir no filtraba texto y no valía como mutante.
- Pendiente de cobertura: displayName en logs sin aserción; correo ausente en respuestas de export/hogar sin aserción. T224 no marcada (techo REVIEW); informe rebanada-1-rama.md sin escribir por restricción.

## 2026-11-11 · T224 informe · checkpoint (inicio)
- Escribo .specify/memory/audits/rebanada-1-rama.md con la evidencia ya registrada arriba.
- Solo ese archivo; sin tocar src/tests/tasks; T224 no se marca.

## 2026-11-11 · T224 informe · checkpoint (fin)
- Entregado .specify/memory/audits/rebanada-1-rama.md (5 secciones, 4 brechas B1-B4 hacia T225).
- T224 no marcada; sin commit ni push.
