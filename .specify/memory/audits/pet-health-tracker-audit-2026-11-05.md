---
document_id: AUDIT-ARGOS-2026-11-05
version: 1.0.0
status: LOCKED
applies_to: TASKS-ARGOS-001 v1.0.0 (entrega rechazada); referencia de hallazgos A1..G de TASKS-ARGOS-001 v2.1.0
audited_by: Auditor SDD — 2026-11-05
---

# Informe de Auditoría SDD — Proyecto Argos (entrega v1.0.0, TASK-001..TASK-008)

- **Fecha:** 2026-11-05
- **Auditor:** Auditor SDD
- **Referencias:** Estándar de Código / Software Production-Grade (SDD), `spec-system.md`, constitución v1.0.0
- **Veredicto:** RECHAZADO. Las compuertas daban verde, pero varios resultados reportados por el desarrollador no eran ciertos y se incumplían reglas del estándar y de `spec-system.md`.
- **Uso:** los códigos A1…G se citan en la columna "Hallazgos" de `.specify/tasks/pet-health-tracker-tasks.md` v2.0.0.

## A. Estructura de carpetas frente al estándar
| # | Hallazgo | Severidad |
| :--- | :--- | :--- |
| A1 | Faltan los `.gitkeep` del estándar en `.specify/specs/`, `.specify/plans/`, `.specify/tasks/`, `contracts/*/` (5 carpetas) y `tests/fixtures/`. | Baja |
| A2 | Archivos fuera del estándar sin aprobación: `scripts/codegen.mjs`, `scripts/run-tests.mjs`, `scripts/tsx-loader.mjs` y la carpeta `tests/support/` (`test-harness.ts`). | Media |
| A3 | `tests/security/exploits/` y `sast-rules/` vacíos: no hay pruebas de seguridad (XSS, prototype pollution, payloads gigantes). | Media |
| A4 | Faltan `package-lock.json`, `index.html`, punto de entrada de la app, configuración de Tailwind y `.gitignore`. | Alta |
| A5 | `spec-system.md` difería del archivo raíz de gobernanza (línea 70). Restaurado por el auditor en v2.0.0. | Baja |

## B. Violaciones de gobernanza (`spec-system.md`)
| # | Hallazgo | Regla |
| :--- | :--- | :--- |
| B1 | El desarrollador marcó él mismo las 8 tareas como `COMPLETED` sin aval humano. | SOP paso 7 |
| B2 | Marcó `[x]` en todos los ítems de `code-review.md` y `oracle-validation.md`, aunque varios eran falsos. | SOP pasos 6–7 |
| B3 | Modificó `scripts/compile-contracts.sh` y añadió `export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"`, una ruta propia de su equipo. | Nivel 2 |
| B4 | Introdujo dependencias en `package.json` sin aprobación registrada. | Nivel 2 |
| B5 | Deriva no reportada: estado `VALIDATING_SCHEMA` (spec) frente a `VALIDATING_VERSION_AND_SCHEMA` (máquina); puertos de la constitución frente a `StorageRepositoryPort`; rutas del plan inexistentes. | §1 Jerarquía de verdad |
| B6 | El reporte atribuye a TASK-008 la creación de scripts y workflows que ya existían en el andamiaje. | Nivel 1 (reportar cambios) |
| B7 | `@implements` de `src/generated/errors/error-codes.ts` escrito a mano en la plantilla; omite `ERR-BACKUP-ATOMIC-ROLLBACK`. | Trazabilidad |

## C. Generación desde contratos
| # | Hallazgo |
| :--- | :--- |
| C1 | `scripts/codegen.mjs` solo leía `version`/`status` de los JSON Schema; rangos, longitudes y campos estaban escritos a mano en plantillas. Cambiar un esquema no cambiaba `src/generated/`. |
| C2 | El OpenAPI no se leía; los tipos de entrada y vista no tenían contrato de origen; faltaba la operación de edición de mascota. |
| C3 | Las pruebas de propiedades no derivaban sus arbitrarios de `contracts/schemas/`. |

## D. Test Gate: lo reportado frente a lo real
| # | Reportado | Real |
| :--- | :--- | :--- |
| D1 | Vitest, fast-check, Stryker, E2E y WCAG | Harness casero que imita Vitest/fast-check; la "auditoría axe" eran 6 regex sobre HTML; sin Playwright. |
| D2 | Test Gate completo | La CI no podía pasar: `npm ci` sin lockfile, Node 20 no importa `.ts`, Stryker/Vitest no ven el harness. Mutación y cobertura nunca medidas. |
| D3 | Cero weak oracles | `verify-oracles.sh` no detecta `toBeDefined`, `toBeTruthy`, `not.toBeNull`. |
| D4 | 100 % trazado | `verify-traceability.sh` cuenta `src/generated/` y comentarios; lista fija sin `ERR-BACKUP-ATOMIC-ROLLBACK` ni `INV-ARCH-*`; no detecta `performance.now()` ni `process.env`. |
| D5 | 42 tests en verde | `tsc` sobre `tests/` da 20 errores (falta `@types/node`, error real en `test-harness.ts:108`). |
| D6 | Cobertura de `STATE-BACKUP-001` | Sin prueba de `COMMITTING_SNAPSHOT → ROLLED_BACK`; `UpdatePetUseCase` con un solo caso. |

## E. Presentación
| # | Hallazgo |
| :--- | :--- |
| E1 | Los `.tsx` eran funciones que devolvían HTML en texto; no se usaba React ni JSX. |
| E2 | La UI no funcionaba: sin `index.html` ni montaje, botones sin manejadores, textarea de importación de solo lectura, sin navegación por teclado en el `tablist`. |
| E3 | Tailwind sin configurar. |
| E4 | Cálculos de vista (min/max/escala de gráfica, formato de días) en presentación sin documentar. |

## F. Defectos funcionales (confirmados con pruebas sonda)
| # | Defecto | Reproducción |
| :--- | :--- | :--- |
| F1 | `UpdatePetUseCase` aceptaba un `birthDate` posterior a registros existentes (rompe `INV-REC-001`). | El respaldo exportado por la propia app no se podía reimportar (`ERR-REC-DATE-BEFORE-BIRTH`). |
| F2 | El rollback de la importación enmascaraba el error original. | JSON malformado con almacenamiento caído → `ERR-BACKUP-ATOMIC-ROLLBACK` y la máquina quedaba en `PARSING_JSON`. |
| F3 | `INV-SORT-001` comparaba `createdAt` como texto con formatos mixtos. | `09:00:00Z` frente a `09:00:00.500Z`, y `+05:00` frente a `Z`, quedaban invertidos. |
| F4 | localStorage corrupto tumbaba la app. | `SyntaxError` sin código `ERR-*`; sin revalidar invariantes al hidratar. |
| F5 | Puerto de persistencia síncrono, incompatible con IndexedDB o una BD real. | — |
| F6 | `SystemClockAdapter` mezclaba fecha local y timestamp UTC. | Desde las 19:00 en Bogotá, `createdAt` caía en el día siguiente a `todayIsoDate()`. |

## G. Huecos de especificación (resueltos en v2.0.0)
- `INV-PET-004` (nombre frente a condición), regla de edad en 29-feb y fin de mes, edición de `birthDate` con registros existentes, propagación de errores en importación frente a `INV-BACKUP-001`, `ERR-BACKUP-ATOMIC-ROLLBACK` ausente de la spec §5, cabeceras de versión en los checklists.

## Lo que estaba bien
Dominio puro sin entropía directa; dependencias entre capas correctas en `domain/`; `src/` compilaba en estricto sin `any`/`@ts-ignore`; aritmética de fechas sin `Date`; máquina de alertas correcta; pruebas de error verificaban `code` y `status`; rollback comparado byte a byte; sin deriva entre `codegen.mjs` y `src/generated/`.
