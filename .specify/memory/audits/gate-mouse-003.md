# Gate /mouse — Feature 003 (estructura SDD)

**Fecha**: 2026-11-15. **Modo**: Native SDD Audit (sin lógica de negocio). **Invocación**: única. **Veredicto**: PASS (estructural) con condiciones no estructurales.

## Resultados
| # | Comprobación | Resultado |
|---|---|---|
| 1 | Trazabilidad 1:1 REQ/NFR/SC ↔ tareas | 96 IDs en spec (58 REQ + 13 NFR + 25 SC) = 96 filas del mapa de tasks.md; 0 huérfanos, 0 desconocidos, 0 tareas inexistentes en el mapa. Confirmado con `map.py` y con `grep` independiente de conteo por prefijo. |
| 2 | Historias sin tarea | US1..US5 presentes en spec; etiquetas [US1]=21, [US2]=23, [US3]=13, [US4]=10, [US5]=4. 0 sin tarea. |
| 3 | Contratos declarados | `contracts/README.md` declara 1 contrato nuevo (`openapi/ops.openapi.yaml`: getHealthz, getReadyz, runMaintenance), "por crear" en T408 (US1, [P]). Contrato de dominio: ninguno nuevo (declarado). Ver condición C1. |
| 4 | Plantilla Spec Kit (002) | spec: User Scenarios & Testing, Requirements, Success Criteria, Assumptions (`Supuestos`), Open Questions (`DECISIONES ABIERTAS`) presentes; Independent Test por historia. tasks: Format, Reglas transversales, Phases 1..9, Dependencias, mapa. plan: Arquitectura, ADR, riesgos. Equivalentes en español aceptados como en la 002. Sin `checklists/` (la 002 tiene 3; no es sección obligatoria de plantilla; ver observación O2). |
| 5 | IDs únicos y referencias | 81 tareas T401..T483 sin duplicados (huecos T470/T476 declarados). 28 filas D-xx únicas, todas las D-xx citadas tienen fila. Grafo de dependencias: 0 referencias a tareas inexistentes, 0 ciclos. ADR-003-01..11 definidos. Referencias "sin definición" halladas (REQ-CICD-010, REQ-IAC-011, NFR-CLD-003, NFR-CLD-013, ADR-003-07/10/12/13, T470, T476) son retiros declarados explícitamente (spec nota 014, tasks línea 7/286, plan §4); T001/T116/T201/T311 son citas a otras features. No son defectos. |
| 6 | Tareas [x] | 0 tareas `[x]` (el único `[x]` textual es la regla de la línea 5). |
| 7 | Estado | spec/plan/tasks/data-model/contracts README: `DRAFT`; ningún `APPROVED` ni `LOCKED` como estado (solo menciones negativas). |

## Defectos estructurales
Ninguno.

## Condiciones (no son fallos de estructura)
- C1: `ops.openapi.yaml` no existe aún; su redacción y compilación son T408. Hasta entonces no se puede validar `additionalProperties:false` ni el sobre de errores.
- C2: `scripts/verify-traceability.sh` es ejecutable (`-rwx`) y resuelve `--feature 003` por `specs/003-*`, pero aún no reconoce los prefijos `REQ-CLD/PG/IAC/CICD/SEC`, `NFR-CLD`, `SC-CLD`: depende de T406 (abierta). Mismo caso para `compile-contracts.sh` y `verify-oracles.sh`. Keymaker debe ejecutar T406 antes de cualquier compuerta de 003.
- C3 (formal): T407 (este gate) sigue `[ ]`; solo Neo marca `[x]`, y `APPROVED` queda reservado a Neo tras `/oracle`.

## Observaciones
- O1: Tareas con IDs retirados citados solo en notas de numeración; coherente, sin acción.
- O2: Considerar `checklists/requirements.md` como en la 002 (opcional, a criterio de /architect).
