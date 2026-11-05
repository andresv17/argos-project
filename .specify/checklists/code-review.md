---
document_id: CHECKLIST-CODE-REVIEW
version: 2.2.0
status: REVIEW
applies_to: TASKS-ARGOS-001 v2.2.0
note: re-versionado por el Arquitecto (D-07) a v2.2.0 en REVIEW; el Auditor debe re-validar sobre TASKS v2.2.0 antes de APPROVED.
---

# Checklist de Compuerta Fase 4: Revisión Arquitectónica de Código (`code-review.md`)

Lo completa el agente **con evidencia por ítem** (archivo, comando y salida) al pasar cada tarea a `REVIEW`. Solo el arquitecto humano firma y marca la tarea `COMPLETED`. Prohibido marcar `[x]` sin evidencia verificable.

| # | Criterio | Evidencia requerida | Estado | Firma humana |
| :--- | :--- | :--- | :--- | :--- |
| 1 | **Inmutabilidad de `src/generated/` (`INV-ARCH-003`)**: nada editado a mano; regenerar produce `git diff` vacío; los validadores derivan de `contracts/` (no de plantillas). | Salida de `compile-contracts.sh && git diff --exit-code src/generated/` + test de deriva. | [ ] | [ ] |
| 2 | **Cero entropía directa (`INV-ARCH-001`, `INV-ARCH-002`)** en `src/domain/` y `src/application/` (`Date`, `performance.now`, `Math.random`, `crypto.*`). | Salida de `verify-traceability.sh`. | [ ] | [ ] |
| 3 | **Fronteras concéntricas (`INV-ARCH-004`)**: `domain` solo importa `generated`; `presentation` solo usa el cliente API y tipos; sin reglas de negocio en componentes. | Regla SAST de imports en `tests/security/sast-rules/` en verde. | [ ] | [ ] |
| 4 | **Puertos asíncronos y Cloud-ready (`INV-ARCH-005`)**: los mismos tests de contrato pasan con adaptador en memoria y SQLite. | Salida de la suite de repositorios para ambos adaptadores. | [ ] | [ ] |
| 5 | **Configuración aislada (`INV-ARCH-006`)**: `process.env` solo en `src/infrastructure/config/`; sin secretos versionados; `.env.example` presente. | `grep` + regla SAST. | [ ] | [ ] |
| 6 | **Validación estricta en fronteras**: toda request/response HTTP, lectura de BD e importación validadas con los validadores generados (`additionalProperties: false`). | Tests en `tests/integration/contracts/`. | [ ] | [ ] |
| 7 | **Autorización (`INV-ACC-001`, `INV-ACC-002`)** aplicada en cada caso de uso antes de leer/escribir. | Tests IDOR en `tests/security/exploits/`. | [ ] | [ ] |
| 8 | **Anotaciones `@implements`** con los IDs de la tarea en cada función/clase exportada. | Salida de `verify-traceability.sh`. | [ ] | [ ] |
| 9 | **Tipado estricto sin escapes**: cero `any`, `@ts-ignore`, `@ts-expect-error`, y aserciones no nulas `!` justificadas; `tsc --noEmit` limpio en `src/` y `tests/`. | Salida de `npx tsc --noEmit`. | [ ] | [ ] |
| 10 | **Estructura de repositorio** idéntica al estándar más la lista autorizada (constitución §7); `.gitkeep` presentes. | Árbol de `find . -not -path './node_modules/*'`. | [ ] | [ ] |
