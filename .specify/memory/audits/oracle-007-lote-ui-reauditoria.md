# Acta Oracle — Reauditoría lote UI Feature 007 (tras H-007UI-1)

Fecha: 2026-11-19. Rama `007-ux-ficha-mascota-fallecimiento` @ `4fc480a` (sobre `2862bed`) + cambio sin commit en `PetDashboard.tsx`.
Veredicto: **PASS CON OBS**. H-007UI-1 cerrado; quedan solo pendientes por autorización/revisión visual y una OBS menor.

## Integridad
- `git status`: solo `M src/presentation/web/components/PetDashboard.tsx` (+11/-1: `useEffect` y `scrollIntoView({block:'nearest',inline:'nearest'})` de la pestaña activa, sin disparo al montar), más `?? ` acta previa y `node_modules`. Sin commits nuevos.

## Tareas
| Tarea | Estado | Nota |
|---|---|---|
| T1003 | PARCIAL | Falta aprobación visual de Neo |
| T1031, T1032, T1033, T1034 | HECHA | |
| T1035 | PARCIAL | Firefox/390 px/Android pendientes de autorización de instalar navegadores y revisión /sati |
| T1036 | NO APLICA | condicional a T1035 |
| T1037 | HECHA | t1037 ahora verde |
| T1038 | HECHA | scrollIntoView presente |
| T1039 | HECHA | |
| T1040 | HECHA | pestanas-007 6/6 verde, incluido 1024 px |
| T1042, T1043, T1044 | HECHA | |
| T1045 | NO HECHA | revisión visual /sati pendiente |
| T1046, T1047, T1049 | HECHA | |
| T1048 | PARCIAL | `pet-dashboard.spec.ts:31` rojo, preexistente en `2862bed`, fuera de 007 (7 pruebas sin ejecutar) |
| T1051, T1052, T1053 | HECHA | |

## Gates (salidas reales)
- `npx tsc --noEmit`: rc 0.
- vitest `tests/unit/presentation` + t10* + 007: 51 archivos, 539 pruebas, todo verde.
- Playwright `pestanas-007.spec.ts`: 6 de 6 verdes (320, 1024, 1280 px).
- `npm run test:gate` con PostgreSQL 17 real (127.0.0.1:55432): **RC 0**; 337 archivos pasan; 5381 pruebas pasan, 1 omitida; cobertura 98.85 % líneas, 95.62 % ramas.
- `verify-oracles.sh`: rc 0 (389 archivos, 0 débiles). `scan-secrets.mjs repo`: rc 0 (0 hallazgos).
- `verify-traceability.sh --feature 007`: rc 2, fuente ausente `contracts/errors/error-catalog.json`. Esperado hasta T1013.
- Aparte (no es de 007): `pet-dashboard.spec.ts:31` rojo (preexistente en 2862bed).

## OBS
- OBS-1: `tests/e2e/visual/pestanas-007.spec.ts:73` deja un `console.log('DBG', ...)` de depuración; conviene retirarlo antes de cerrar (no afecta al resultado).

Sin commit, sin `[x]`, sin push.
