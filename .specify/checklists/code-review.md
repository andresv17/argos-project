# Checklist de Compuerta Fase 4: Revisión Arquitectónica de Código (`code-review.md`)

Antes de dar por completada cualquier tarea de `.specify/tasks/pet-health-tracker-tasks.md`, el agente debe verificar los siguientes puntos sobre los cambios en `src/`:

- [x] **1. Inmutabilidad de `src/generated/` (`INV-ARCH-003`):** Ningún archivo dentro de `src/generated/` fue editado manualmente; todos derivan de `scripts/compile-contracts.sh`.
- [x] **2. Cero Entropía Directa (`INV-ARCH-001`, `INV-ARCH-002`):** No existen llamadas a `new Date()`, `Date.now()`, `Math.random()` ni `crypto.randomUUID()` dentro de `src/domain/` o `src/application/`.
- [x] **3. Respeto de Fronteras Concéntricas (`INV-ARCH-004`):**
  - `src/domain/` no importa módulos de `application`, `infrastructure`, `presentation` ni librerías externas de UI/persistencia.
  - `src/presentation/` no ejecuta lógica de dominio ni muta el almacenamiento sin pasar por los casos de uso de `src/application/`.
- [x] **4. Validación Estricta en Fronteras:** Toda carga o importación en `src/infrastructure/` y `src/presentation/` valida los datos contra los esquemas de `src/generated/` con `additionalProperties: false`.
- [x] **5. Anotaciones de Trazabilidad JSDoc:** Las funciones y clases incluyen comentarios `@implements` con los IDs (`REQ-*`, `INV-*`, `STATE-*`, `ERR-*`) correspondientes a la tarea activa.
- [x] **6. Tipado Estricto sin Escapes:** Cero apariciones de `any`, `@ts-ignore` o `@ts-expect-error` en `src/`.
