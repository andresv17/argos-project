# Bitácora Incremental — The Architect (`/architect` — Arquitecto SDD)

> **Regla Write-Ahead Log:** Cada vez que `/architect` tome una decisión (`CC-*`), modifique `spec.md`, `plan.md`, `.specify/memory/constitution.md` o `contracts/**`, debe añadir una entrada fechada al final de este archivo antes de responder en el chat.

---

## `[2026-11-09 | Bootstrap Inicial desde Commit 329c392]`
- **Estado Normativo Vigente:**
  - `.specify/memory/constitution.md` v2.4.0 (`REVIEW` — §1–§6 intactos, §7 añadido para estructura Spec Kit).
  - `specs/001-pet-health-tracker/spec.md` v2.4.0 (Aprobada por Arquitecto con hash `2eef58a2fc8944fe`; 63 IDs normativos intactos).
  - `specs/001-pet-health-tracker/plan.md` v2.3.0 (`REVIEW`).
  - `specs/001-pet-health-tracker/tasks.md` v2.3.0 (`REVIEW`; líneas `T001..T016` con alias `TASK-100..TASK-115`).
  - `contracts/**`: 12 contratos formales intactos en la raíz del proyecto (96 IDs vigentes verificados por `scripts/verify-traceability.sh`).
- **Decisiones Recientes Registradas:**
  - Ratificadas las 6 decisiones de migración Spec Kit en `.specify/memory/speckit-migration-2026-11-09.md` (líneas 190–197).
  - Re-ubicado `spec-review.md` en `.specify/memory/audits/spec-review.md` como checklist de gobernanza ARGOS fuera de la carpeta de la feature.
- **Pendiente para `/architect`:**
  - Acompañar a `/oracle` y a **Neo** en el cierre formal de `spec-review.md` y `TASK-115` (`T016`).

## 2026-11-10 — Migración real a Spec Kit
- Contratos reubicados en la feature; scripts y tests actualizados; spec-system.md, README y CLAUDE.md con rutas nuevas.
- Historia no canónica preservada en .specify/memory/history-001-pet-health-tracker.md.
- Verificado: verify-traceability 96/96, verify-oracles OK, tsc limpio, vitest 580/580, src/generated idéntico.

## 2026-11-10 — Hallazgo 6 y backlog Feature 002 (checkpoint)
- Escrito `.specify/memory/audits/hallazgo-6-traduccion-errores.md`: diagnóstico, diseño solo en presentación (nuevo schema-messages.ts), archivos, REQ-UI-*, criterios. Decisiones para Neo: D1 (solo presentación vs cambio de contrato para 422 de servidor) y D2 (REQ-UI-005 dice "mensajes del catálogo").
- Escrito `.specify/memory/backlog-feature-002.md` con hallazgos 2, 5 y 7 y preguntas abiertas. No se creó specs/002-*.
- Sin cambios en specs/**, contracts/**, src/**, tests/**, tasks.md. Sin commit.

## 2026-11-10 — Fase 2: análisis v2.1 contra 001 (checkpoint)
- Escrito `.specify/memory/audits/fase-2-analisis-v21.md`: A (24 filas de brecha + 19 pantallas + 10 incoherencias internas de la v2.1), B (timeout de sesión, especies, cuenta/perfil, hogares), C (Ruta 1 enmienda vs Ruta 2 Feature 002), D (hoja de ruta F0..F8, marcas Nivel 2).
- Recomendación: Ruta 2 (Feature 002 tras cerrar 001), implementación por rebanadas; SSO, recuperación por correo y adjuntos PDF diferidos. Pendiente decisión Nivel 2 de Neo.
- Numeración de hallazgos inconsistente entre la orden de Fase 2 y los archivos previos (nota en el documento). Sin cambios en specs/**, contracts/**, src/**, tests/**, tasks.md. Sin commit ni push.

## 2026-11-10 — Hoja de ruta Feature 002 (checkpoint)
- Escrito `.specify/memory/audits/hoja-de-ruta-feature-002.md`: A decisiones de Neo con impacto en contratos/RBAC, B fases F0–F8 con [N2], C tabla de sustitución de pruebas 001→002, D seis rebanadas con criterio verificable, E fuera de alcance (003), F correcciones previas en la 001, G pendientes (6-A/6-B sin confirmar).
- Sin cambios en specs/**, contracts/**, src/**, tests/**, tasks.md, constitución. Sin commit ni push. `specs/002-*` requiere autorización aparte (F3).

## 2026-11-10 — Hallazgo 6-A: alta de T058 en tasks.md (checkpoint)
- Decisión de Neo (opción A de REQ-UI-005, confirmada dos veces): traducir errores de esquema solo en presentación; el código ERR-SCHEMA-VALIDATION-FAILED no cambia; spec 001 sin enmienda.
- Se añade T058 (`[ ]`) al final de la Fase 9 de `tasks.md` y se cita en Dependencies. Sin tocar contratos, src, tests, constitución, spec ni package.json. Sin commit ni push.
