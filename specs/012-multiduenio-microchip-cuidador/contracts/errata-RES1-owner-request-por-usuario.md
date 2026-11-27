# Errata RES1 — Tope de solicitudes de propiedad por usuario (no por mascota)

- **Estado**: APPROVED (Nivel 2, Neo / Andrés Vallejo, 2026-11-27). Reserva 1, opción (a).
- **Feature**: 012 · **Ámbito**: `OWNER_REQUEST` de `rate_limit_events`.

## Decisión
El tope de creación de solicitudes de propiedad es de **10 por día POR USUARIO**, no por mascota, porque `rate_limit_events` no guarda `pet_id`. Nombre canónico: `OWNER_REQUESTS_PER_USER_PER_DAY = 10`. Sustituye al nombre `OWNER_REQUESTS_PER_USER_PER_PET_PER_DAY`.

## Cambios en la especificación
| Archivo | Línea | Cambio |
|---|---|---|
| `specs/012-multiduenio-microchip-cuidador/spec.md` | 419 (cierre `trinity` T1612, `H-10`) | `OWNER_REQUESTS_PER_USER_PER_PET_PER_DAY` pasa a `OWNER_REQUESTS_PER_USER_PER_DAY (10, por usuario y no por mascota; errata RES1)` |
| `specs/012-multiduenio-microchip-cuidador/contracts/openapi/co-ownership.openapi.yaml` | 16 (`info.description`, LIMITES `H-10`) | Mismo cambio de nombre y aclaración |

Revisados sin hallazgos: `data-model.md`, `research.md`, `plan.md`, `quickstart.md`, `contracts/schemas/**`, `contracts/state-machines/**`, `contracts/errors/**` y anexos (las menciones «por mascota» restantes se refieren a versión, bloqueo, QR o rutinas, no a este tope).

## Pendiente para /keymaker (fuera de esta errata)
`src/domain/platform/feature-012-limits.ts:18` y `src/infrastructure/adapters/sliding-window-rate-limiter.adapter.ts:14,28` aún usan `OWNER_REQUESTS_PER_USER_PER_PET_PER_DAY`; renombrar a `OWNER_REQUESTS_PER_USER_PER_DAY`.
