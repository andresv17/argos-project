# Veredicto Oracle — suite E2E en verde (pre-commit 4A) — 2026-11-14

**Veredicto: APTO** para el commit local 4A (solo tests/e2e).

## Alcance del diff
Solo `tests/e2e/accessibility/wcag.spec.ts` y `tests/e2e/visual/pet-dashboard.spec.ts`. Sin cambios en src/, contracts/, src/generated/, specs/, package.json ni tailwind (git status).

## Hunks
| Archivo:línea (nuevo) | Cambio | Clase |
|---|---|---|
| wcag:29-31 | DOG/CAT -> CANINE/FELINE | A |
| wcag:44 | PUT /pets/{petId}/assignments/{householdId}, espera 200 | E |
| wcag:45 | invitación con roleOnJoin 'READER', 202 | A (1A) |
| wcag:71 | contraseña "entre 10 y 128" | A (1A) |
| wcag:84 | vacunas: 3 insignias, sin SUPERSEDED | C |
| wcag:110,113 | heading h3 del hogar / h2 Invitaciones (en lugar de data-membership-status) | D |
| pet-dashboard:10 | usuario duena.dashboard.e2e | A |
| pet-dashboard:61 | texto "El peso está fuera del rango de la especie" | D |
| pet-dashboard:71 | Variación % -> '—' | B |
| pet-dashboard:76-80 | se elimina la Rabia antigua (-400d); SUPERSEDED omitido con comentario (T289) | C |
| pet-dashboard:115 | CAT -> FELINE | F |
| pet-dashboard:157 | schemaVersion '3.0.0' | G |

Contrato: PUT /pets/{petId}/assignments/{householdId} existe (openapi:668, operationId assignPetToHousehold, 200 PetAssignment); backup-envelope.schema.json const "3.0.0" (línea 158).

## Compuertas
- `npx tsc --noEmit`: 0.
- `npx playwright test --reporter=list`: **38 pasan, 0 fallan, 0 no ejecutadas, 0 flaky** (38/38, 39.5 s).

## Assertions débiles
Grep sobre líneas añadidas (toBeDefined, toBeTruthy, not.toBeNull, skip, todo, any, ts-ignore): ninguna. Vacío.

## Observaciones (no bloqueantes)
- El semáforo ya no cubre NEUTRAL_GRAY/SUPERSEDED: cobertura reducida, pendiente en T289 (declarado en comentario). Neo debe saberlo.
- pet-dashboard:71 '—' es una assertion de texto más laxa que el valor numérico anterior; coherente con 2A autorizado.

## No verificado
- Que la UI/API actual realmente no renderice SUPERSEDED (se acepta lo declarado por Keymaker; no se auditó src/).
- Solo proyecto chromium; sin repetición para flakiness.
- Ruido en git status por archivos no E2E (claude/, CLAUDE.md, logos.json, scripts/logos.py) fuera del alcance de 4A: no deben entrar al commit.

## Limpieza
Dev servers terminados; pgrep sin procesos.

DE: The Oracle
PARA: Neo (Andrés Vallejo — Nivel 2)
ESTADO: Validación requerida
DETALLE: Suite 38/38, tsc 0, diff acotado a tests/e2e.
SIGUIENTE PASO RECOMENDADO: autorizar commit 4A solo con los 2 archivos de tests/e2e.
