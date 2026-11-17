# Veredicto Oracle — Correcciones del portal local (2026-11-14)

**Veredicto global: APTO CONDICIONADO** (validado en disco, sin commit). HEAD `2af8558` en `002-plataforma-v21`; cambios sin commit.

| Punto | Veredicto | Evidencia en disco |
|---|---|---|
| (1) `server.ts`: mantenimiento antes de `listen` | APTO | diff de 2 líneas; orden verificado en `startServer` |
| (2) `package.json`: script `dev` con `.env` | APTO | diff de 1 línea; `.env` no trackeado, ignorado por `.gitignore:7` |
| (3) `PetForm.tsx`: default `CANINE` | APTO | diff de 1 línea; `DOG` no está en el enum `Species` del contrato |
| (4) `AppShell.tsx`: etiquetas visibles | APTO | diff de 2 líneas, `aria-hidden`; el texto accesible `sr-only` se mantiene |
| (5) `PetsPage.tsx`: montaje condicionado | APTO | diff de 2 líneas; gate `dashboard.permissions.assignPetToHouseholds` |
| (6) `PetAssignments.tsx` (nuevo) | APTO | sin `any`, `@ts-ignore`, `skip` ni `todo`; checkbox con label visible |

## Gates
- `npx tsc --noEmit`: exit 0.
- Secretos en diff: ninguno. `.env`, `contracts/**` y `src/generated/**`: sin cambios.
- Presentación + `pets-records`: 15 fallos y 91 aciertos (mismo recuento que antes del cambio, según Keymaker).
- API real (Keymaker): PUT asignar 200, GET lista 200, DELETE 204.

## Condición (por qué no es APTO limpio)
- `tests/unit/presentation/components.spec.ts` importa `PetForm` y `ShellHeader`, que cambié. Sus fallos son `Cannot read properties of undefined (reading 'editPetBasics')`, causado por fixtures sin `permissions`, no por el código nuevo. Pero no pude confirmar nombre por nombre contra HEAD sin alterar Git, así que solo consta que el recuento es igual.
- **Condición para pasar a APTO:** confirmar que esas pruebas siguen fallando por el mismo motivo, o corregir los fixtures en una tarea aparte.

## No verificado
- Navegación real en navegador (render de la ficha, la cabecera y el panel de hogares). Requiere revisión de Neo con el dev en marcha.
- `npm run test:gate` completo (Decisión P de Neo).
