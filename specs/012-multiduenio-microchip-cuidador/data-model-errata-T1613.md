# Anexo de erratas del data-model 012 (T1613)

Estado: **`FUNDIDA`** en `data-model.md` el 2026-11-26 (aprobación Nivel 2 de Neo vía Logos; E-1 en `data-model.md`, `plan.md`, `spec.md`, `tasks.md` y `contracts/co-ownership-rbac-annex.md`; alineación de E-3: `target_username_sealed` solo `PENDING`, `message` solo `PENDING`/`UNDER_REVIEW`, `target_response` solo `UNDER_REVIEW`, supera el texto original de abajo). Se conserva como histórico. Estado original: `DRAFT` (redactó `/architect` el 2026-11-26; el estado lo fija solo Neo). Enmienda **MINOR**: no edita `data-model.md` (`APPROVED`), `plan.md`, `spec.md`, `tasks.md` ni `contracts/co-ownership-rbac-annex.md` (`APPROVED`). Rige para la 012 por referencia hasta que Neo apruebe y se funda en `data-model.md` en una revisión posterior. Origen: desviaciones D1..D3 halladas por `/keymaker` en T1613 (migraciones `0033_co_ownership.sql` SQLite y `0029_co_ownership.sql` PostgreSQL).

## E-1 Nombre canónico de la tabla de asignaciones
- La tabla real (002) se llama **`pet_assignments`**. `pet_household_assignments` es un nombre erróneo del texto y **no existe** en disco; donde aparezca léase `pet_assignments`.
- Ocurrencias a corregir en la próxima revisión aprobada (no se tocan ahora por ser `APPROVED`): `data-model.md` línea 71 (bloque `pet_household_assignments`); `plan.md` línea 13; `spec.md` línea 81 (`REQ-OWN12-007`); `tasks.md` línea 48 (T1613); `contracts/co-ownership-rbac-annex.md` línea 58 (§invariante de hogar). Cambio puramente nominal, sin efecto semántico ni de contrato máquina (OpenAPI, schemas, máquinas y catálogo de errores no lo mencionan).
- `assigned_by_user_id TEXT NULL REFERENCES users(id) ON DELETE SET NULL` se añade a `pet_assignments` tal como se implementó.

## E-2 Marcas de tiempo: TEXT ISO 8601 UTC (excepción documentada a «INTEGER»)
- Toda columna de instante de la 012 (`invited_at`, `expires_at`, `joined_at`, `left_at`, `promotion_notice_ack_at`, `created_at`, `decided_at`, `frozen_until`, `freeze_extended_at`, `sla_due_at`, `escalated_at`, `resolved_at`, `executes_after`, y las de #22..#32 que lleguen) es **`TEXT` ISO 8601 UTC** (`YYYY-MM-DDTHH:mm:ss.sssZ`), convención de todo el repositorio. Donde `data-model.md` dice `INTEGER` para instantes léase `TEXT ISO UTC`.
- Justificación: coherencia con las 11 features previas, comparación lexicográfica válida en SQLite y PostgreSQL, y `INTEGER` de PostgreSQL es de 32 bits y desborda con epoch en milisegundos. No se usa `BIGINT` para no divergir del resto del esquema.
- Los **contadores y versiones** (`version`, `ownership_version`, `pet_version`, `bytes`) siguen `INTEGER`. Los intervalos en días/horas son constantes de dominio, no columnas.
- El techo de 60 días de `frozen_until` (`N2-R5`) **no** lleva `CHECK` numérico (no aplicable a TEXT de forma portable): es **regla de dominio** dentro de la transacción, verificada en las pruebas de T1614/T1616. Equivale al CHECK descrito en `data-model.md`.

## E-3 CHECK de vida de `message`, `target_username_sealed` y `target_response`
Se **mantienen** los CHECK adicionales de la migración, porque implementan «se borra al decidir/al resolver» (`INV-OWN12-005`, `N2-R1`, `trinity R-09`, `P-4`):
- `message`: no nulo solo si `status IN ('PENDING','UNDER_REVIEW')`.
- `target_username_sealed`: no nulo solo si `status = 'PENDING'` (alineado con el SQL, aprobado por Neo; `NULL` en todo otro estado).
- `target_response`: no nulo solo si `status = 'UNDER_REVIEW'` (o `PENDING` previa a la apertura formal, si la migración así lo admite) y se pone a `NULL` en la misma transacción que resuelve la disputa.
- Consecuencia para `/keymaker`: toda transición a estado terminal debe anular las tres columnas **en el mismo `UPDATE`** (si no, el CHECK aborta). Las pruebas de purga/retención deben asumirlo.
- Los CHECK no contradicen ningún contrato máquina (el esquema `owner-request` ya declara los tres campos opcionales).

## E-4 Fuera de este anexo
- `dispute_evidence` queda para el Bloque #23 (según T1613). `pet_co_owners.user_id` NULLable y el resto de columnas del bloque #22 se ratifican como implementadas.
