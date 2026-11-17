# Veredicto de cierre — Rebanada 6 (T284 a T293 y T287), feature 002

- **Fecha:** 2026-11-14. **Emisor:** Morpheus (Tech Lead). **Rama:** 002-plataforma-v21, `ahead 2`, sin push.
- **Estado de las tareas:** REVIEW. Ninguna marcada COMPLETED: esa potestad es de Neo.

## Commits locales
| Hash | Mensaje | Alcance |
|---|---|---|
| 8da9bc1 | feat(002): rebanada 6, directorio, ficha, cuenta, hogares y respaldo (T284-T293) | 36 archivos, implementación y pruebas |
| 0f9804d | docs(002): blueprint v2.4, maquetas y enmiendas de navegación (T287, T288, REQ-UI2-001) | 6 archivos, documentación y especificación |

## Compuertas
- `npx tsc --noEmit`: exit 0.
- Trazabilidad 002: 118/118 tras citar INV-HOUSE-001 en `tests/unit/household-policies.spec.ts:111`.
- `verify-oracles.sh`: CUMPLE (111 archivos, 0 débiles).
- Playwright suite completa: 52/52 en verde (Oracle, una corrida).
- `npm run test:gate`: exit 1 con 26 fallos. **Aceptados como deuda B-11** por decisión de Neo.
  - Los 26 fallaban ya en `ff0fe62` (mismos archivos y títulos), 0 nuevos de la 002.
  - Precisión: `ff0fe62` ya incluye la presentación de la 002; "heredado" significa que fallaba en el último commit, no que venga de la 001.
  - Evidencia: `claude/veredicto-auditor-fallos-gate-t296.md`.

## Hallazgos resueltos
- H-K-3 (auth-pet-forms:63), H-K-4 (rol en tarjeta de hogar), H-K-5 (aviso sin botón): opción A de Neo.
- H-V22-1 (registro por permiso granular por módulo): opción A, blueprint v2.4 §4.5, verificado contra `records.ts`.
- H-V22-6 (disparador del aviso de sesión): definido en blueprint v2.4 §6.
- H-V22-2/3/4/5 y N-1: reconfirmados por Oracle.

## Pendientes para Neo (no bloquean el cierre técnico)
1. **Commit 3 para pruebas de la rebanada no stageadas:** `tests/e2e/accessibility/wcag.spec.ts`, `tests/e2e/visual/e2e-support.ts`, `tests/integration/presentation/web-client.spec.ts`. Keymaker reconoce que son suyas (T284 y T285). Decide si van en un commit 3.
2. **spec.md en el commit 2:** incluye tres cambios de la misma enmienda de navegación (REQ-UI2-001, dos escenarios de US8 y una frase de consistencia). Decide si se queda o si se rehace el commit sin él.
3. **Cambios previos de otros personajes:** no entran en ningún commit de la rebanada: `CLAUDE.md`, `GUIA-SKILLS-MATRIX.md`, `SKILLS-PROPUESTAS.MD` y bitácoras ajenas. Revisión de Neo.
4. **Sin seguimiento:** `logos.json`, `scripts/logos.py`, `gate-T296-output.txt`, `.playwright-mcp/`, `claude/archivo/`, veredictos y handovers. Decide qué se versiona.

## Restricciones respetadas
Sin push. Sin `--no-verify`. Sin COMPLETED. Sin APPROVED ni LOCKED. `src/generated` sin cambios tras la regeneración.
