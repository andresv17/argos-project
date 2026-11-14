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

## 2026-11-13 · T269 revisión de la rebanada 4 · checkpoint (inicio)
- Revisión de privacidad de T265-T267 en HEAD 14a9b3d: ACCOUNT_DELETE con HMAC, pseudonymizeUser, secure_delete + checkpoint WAL, purga ADR-002-14, fila MIGRATION.
- Solo se escribe .specify/memory/audits/rebanada-4-rama.md; sin tocar src/tests/tasks/logos; T269 no se marca; sin commit ni push.

## 2026-11-13 · T269 · checkpoint (fin)
- Pruebas del alcance: 6 archivos, 68/68 pasan (incluye log-redaction 3/3). Prueba física propia (script en scratchpad): userId 20 apariciones en db tras commit, 0 tras wal_checkpoint(TRUNCATE).
- Hallazgos: H-1 baja (ARGOS_AUDIT_RETENTION_DAYS configurada pero ignorada: purga fija en 24 meses); D-1 y D-2 decisiones para Neo (clave de desarrollo fija si NODE_ENV != production; secure_delete/UPDATE sin prueba de bytes en la suite). Fuera de alcance: 4 pruebas rojas en sqlite-backup-import.spec.ts (US7).
- Informe entregado: .specify/memory/audits/rebanada-4-rama.md.

## 2026-11-13 · T281 auditoría de exportación/respaldo (Rebanada 5) · checkpoint (inicio)
- Auditoría de privacidad HEAD 304ed41: exportación sin datos ajenos, token solo en cabecera/hash, vista previa genérica, auditoría sin PII. Solo se escribe .specify/memory/audits/rebanada-5-rama.md; sin tocar src/tests/tasks/logos; T281 no se marca; sin commit ni push.

## 2026-11-13 · T281 · checkpoint (fin)
- 4 archivos, 76/76 en verde. 0 logs en archivos de respaldo. Token solo cabecera y SHA-256 en base. Vista previa sin oráculo de IDs ajenos.
- H-1 baja: access-control.security.spec.ts:86-98 compara ownerUserId/exportedByUserId inexistentes (undefined=undefined, aserción vacua). O-1: 409 de importación confirma existencia de UUID ajeno (diseño de spec).
- Informe entregado: .specify/memory/audits/rebanada-5-rama.md; sin commit, push ni [x].
