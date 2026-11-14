# Decisión de arquitectura — Asignar mascota a hogar desde alta y edición (2026-11-14)

**Estado:** REVIEW (diseño, sin cambios de contrato). **Autor:** Architect. **Ejecuta:** Keymaker. **Auditoría:** Oracle.
**Normas afectadas:** REQ-HOUSE2-003, SC-017, INV-HOUSE-004, ERR-ACC-FORBIDDEN, ERR-PET-NOT-FOUND.

## Evidencia en disco
1. `contracts/schemas/pet.schema.json`, `CreatePetInput.baseHouseholdId`: opcional, UUID, "asignación inicial; el dueño debe ser miembro ACTIVE [REQ-HOUSE2-003]". **Ya existe en el contrato.**
2. `UpdatePetInput`: `additionalProperties: false` y **sin** `baseHouseholdId`. La edición no puede asignar por el cuerpo; debe usar `PUT/DELETE /pets/{petId}/assignments/{householdId}` (ya implementados, 200/204).
3. **Defecto de implementación confirmado en vivo:** `POST /api/pets` con `baseHouseholdId` de un hogar del que el dueño es miembro → **201**, pero `GET /pets/{id}/assignments` → `[]`. El campo se valida y se ignora.
   - Causa: `src/application/use-cases/pet-use-cases.ts`, `RegisterPetUseCase.execute` (línea ~71) crea la mascota y no lee `baseHouseholdId`. No hay referencia a `baseHouseholdId` en `src/application` ni `src/infrastructure` (solo en `src/generated`).
   - Es un drift caso A (código incumple spec), no caso B: la spec y el contrato ya dicen lo correcto. **No requiere cambio de contrato.**
4. Regla de asignación existente, `AssignPetToHouseholdUseCase`: exige que el dueño sea `ACTIVE` en el hogar; si no, `ERR-ACC-FORBIDDEN`; registra auditoría `ASSIGN`; es idempotente.

## Decisión
| Modo | Control en UI | Llamada a la API | Regla |
|---|---|---|---|
| **Alta** | Selector "Hogar base (opcional)" con los hogares del usuario, vacío por defecto | `POST /api/pets` con `baseHouseholdId` solo si se elige | Dentro de la **misma transacción** que la creación: si el dueño no es `ACTIVE`, `ERR-ACC-FORBIDDEN` y **no se crea la mascota** (atomicidad). Auditoría `ASSIGN` además de `CREATE`. |
| **Edición** | Casillas por hogar (componente `PetAssignments` movido al formulario) | `PUT` / `DELETE /pets/{petId}/assignments/{householdId}` | Igual que hoy; solo si `permissions.assignPetToHouseholds`. |

- `PetAssignments` **se retira del panel bajo la ficha** y pasa a formar parte del formulario de edición. Evita dos puntos de acción para lo mismo.
- No se cambia ningún contrato, ni `src/generated`, ni la lista de especies (T284 queda aparte).

## Archivos
- Backend: `src/application/use-cases/pet-use-cases.ts` (`RegisterPetUseCase`). Reutilizar la misma comprobación y auditoría de `assignment-use-cases.ts`; extraer una función pura compartida si hace falta, sin duplicar la regla.
- Frontend: `src/presentation/web/components/PetForm.tsx` (selector en alta; `PetAssignments` en edición, prop `canAssign`), `src/presentation/web/pages/PetsPage.tsx` (pasar hogares a `PetForm`; quitar el montaje bajo la ficha), `src/presentation/web/components/PetAssignments.tsx` (sin cambios de lógica).
- Pruebas: `tests/integration/api/` (alta con `baseHouseholdId`: miembro → 201 y asignada; no miembro → `ERR-ACC-FORBIDDEN` y cero mascotas creadas) y `tests/unit/presentation/` (selector y casillas no aparecen sin permiso).

## Criterios de aceptación (verificables con curl contra la API real)
1. `POST /api/pets` con `baseHouseholdId` de hogar propio → **201**; `GET /api/pets/{id}/assignments` contiene ese `householdId`.
2. `POST /api/pets` con `baseHouseholdId` de hogar ajeno/no miembro → **403 ERR-ACC-FORBIDDEN**; `GET /api/pets` no incluye la mascota (rollback).
3. `PUT /api/pets/{id}/assignments/{hid}` → **200**; `DELETE` → **204**; `GET` vuelve a `[]`.
4. `POST /api/pets` sin `baseHouseholdId` → 201 y sin asignaciones (comportamiento actual intacto).

## Gate de salida
- `npx tsc --noEmit` = 0.
- Presentación + `pets-records`: los **15 fallos heredados** no crecen; las pruebas nuevas deben pasar.
- Oracle audita en disco antes de cualquier commit.

## Fuera de alcance / pendiente
- Registrar la tarea en `tasks.md` (propuesta: nueva T-ID [US3] "Asignación en alta y edición"). La asigna Neo o Architect en su turno; no la marco yo.
- Tratamiento de las 15 pruebas heredadas: deuda aparte (Decisión J).

## Orden para Keymaker
Implementar en este orden: (1) `RegisterPetUseCase` con asignación atómica y auditoría; (2) pruebas de API de los criterios 1–4; (3) `PetForm` (selector en alta, `PetAssignments` en edición) y `PetsPage` (quitar montaje bajo ficha); (4) `tsc` y gate. Sin commit. Morpheus recibe el informe.
