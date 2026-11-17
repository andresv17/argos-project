# Veredicto Oracle — Alta con hogar base y panel de hogares en edición (2026-11-14)

**Veredicto global: APTO CONDICIONADO** (validado en disco, sin commit). HEAD `2af8558` en `002-plataforma-v21`; cambios sin commit.

| Punto | Veredicto | Evidencia en disco |
|---|---|---|
| (a) Alcance del diff | APTO | 7 archivos modificados + 2 nuevos, todos de la lista. Sin `.env`, sin `contracts/**`, sin `src/generated/**`, sin secretos. |
| (b) Edición sin `baseHouseholdId` | APTO | `UpdatePetInput.additionalProperties: false` y sin `baseHouseholdId`. En `PetForm.tsx` el campo solo existe cuando `profile === null`. |
| (c) Regla única y transacción | APTO | `assignOwnedPetToHousehold` es la única regla; `pet-use-cases.ts` no duplica la membresía. Hogar ajeno: 403 y mascotas 0→0 (rollback verificado en vivo). Auditoría `ASSIGN` conservada en la asignación directa. |
| (d) `tsc --noEmit` | APTO | exit 0. |
| (e) Pruebas | CONDICIONADO | `pet-create-household` 3/3, `assignments-ownership` y `use-cases`: 50/50 verdes. Presentación + `pets-records`: 15 fallos y 91 aciertos, mismos 5 archivos que antes. |
| (f) API real | APTO | Alta propio → 201 y asignada; ajeno → 403 y sin mascota; DELETE → 204; PUT → 200. Verificado de forma independiente. |

## Condición
- Los 15 fallos heredados incluyen `tests/unit/presentation/components.spec.ts`, que importa `PetForm` y `ShellHeader`, y ahora `PetForm` recibe props nuevas. La causa visible sigue siendo `reading 'editPetBasics'` (fixtures sin permisos). Mismo recuento, pero no pude confirmar nombre por nombre contra HEAD sin alterar Git.
- **Para pasar a APTO:** confirmar esa causa, o corregir los fixtures en una tarea aparte.

## No verificado
- Interfaz en navegador: selector "Hogar base (opcional)" en el alta y panel de hogares dentro de la edición.
- `npm run test:gate` completo (Decisión P).
