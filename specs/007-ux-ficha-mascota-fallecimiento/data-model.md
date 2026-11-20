# Data Model — Feature 007 (solo `[GH:#13]`)

**Estado**: `DRAFT` (Architect, 2026-11-19). Sin `APPROVED`/`LOCKED`. `N2-07-01` aprobada por Neo (2026-11-19) sobre la línea 002; la enmienda no se aplica a `contracts/` hasta `T1013`.

## Tabla `pets` (ampliación aditiva)

| Columna | Tipo | Nulo | Defecto | Regla |
| --- | --- | --- | --- | --- |
| `life_status` | `TEXT` | no | `'ALIVE'` | `IN ('ALIVE','DECEASED')` |
| `deceased_at` | `TEXT` ISO `YYYY-MM-DD` (SQLite) / `DATE` (Postgres) | sí | `NULL` | `CHECK ((life_status = 'DECEASED') = (deceased_at IS NOT NULL))` |
| `version` (o `updated_at`) | entero / marca de tiempo | no | inicial | Control optimista del `PATCH` de mascota (`EDGE-007-009`, decidido); tipo fijado en `T1013`: entero `integer` ≥ 1 (no `updated_at`); aplicado en `T1064` |

Reglas de dominio (no expresables en `CHECK`): `deceased_at >= birth_date` y `deceased_at <= hoy (America/Bogota)`; se validan en `src/domain/pet/pet-invariants.ts` sobre el **estado resultante** y en el esquema JSON.

## Migración y paridad (`/merovingian` H3, H4, C2, C5)
- SQLite `0014` y Postgres `0010`, con el mapeo manual en `tests/integration/persistence/schema-parity.spec.ts` (no hay correspondencia numérica entre motores) y prueba sobre una base con filas previas: todas quedan `ALIVE`/`NULL`. La prueba de paridad forma parte de la tarea de migración (`T1017`).
- **Postgres**: `CHECK` cruzado con `ALTER TABLE ... ADD CONSTRAINT ... NOT VALID` y después `VALIDATE CONSTRAINT`, sin bloquear la tabla.
- **SQLite**: no admite `ADD CONSTRAINT`; el `CHECK` cruzado exige reconstruir la tabla `pets` con las claves foráneas apagadas y copia de datos, cubierta por una prueba con datos reales.
- **Asimetría documentada**: los motores llegan al mismo `CHECK` por caminos distintos (validación diferida en Postgres, reconstrucción en SQLite); si la reconstrucción resultara inviable, la alternativa aceptada es `CHECK` de rango en ambos motores y la invariante cruzada solo en dominio en SQLite, previa confirmación de Neo.
- No hay migraciones inversas: el único retroceso es restaurar un respaldo (ver «Respaldo»).
- Sin índices nuevos. Sin tabla nueva.

## Invariante y transiciones
El invariante de `REQ-FAL7-002` define por sí solo las transiciones (`ALIVE → DECEASED` exige `deceasedAt`; `DECEASED → ALIVE` borra la fecha; `DECEASED → DECEASED` edita la fecha). **No hay máquina de estados separada** (`M7-01`); `spec-system.md` exige `STATE-XXX` para transiciones modeladas como máquina, no para cada campo enumerado.

## Respaldo
`lifeStatus` y `deceasedAt` opcionales en `pets[]` del `backup-envelope` (nunca `required`); ausentes → `ALIVE`/nulo. Formato versionado (decisión de Neo, `EDGE-007-015`): builds anteriores rechazan con error explícito de versión no soportada. Importación por reemplazo: previsualización de `DECEASED → ALIVE` con confirmación (`REQ-FAL7-009`).

## Lecturas derivadas
- `computedAge` de `DECEASED`: entre `birth_date` y `deceased_at`, «aprox.» si `birthDateIsEstimate` (`REQ-FAL7-007`).
- `alertsSummary`/`globalAlertStatus`/`WITH_ALERTS` de `DECEASED`: ceros y estado neutro (`REQ-FAL7-004`, D7-04).
- Huella de escena (006): `DECEASED` se filtra antes de `buildInputsSnapshot`; sin campos nuevos en `SnapshotPet` (`REQ-FAL7-006`, D7-06).
