# Architect 006: T941 y enmiendas documentales de la Fase 13

Fecha: 2026-11-19. Rama `006-escena-hogar-pixel-art`, HEAD `ea2c0f7` (Fase 13 sin commit). Estado: `DRAFT`. Sin `src/`, `tests/`, `src/generated/`, `vite.config.ts` ni constitución; sin commit; ninguna tarea `[x]`; T935..T943, T910, T923 y T934 siguen `[ ]`.

## Contratos (N2-17, opción A, T941 prosa)
- `contracts/schemas/scene.schema.json`: 1.1.0 -> **1.1.1 PATCH** (`supersedes` 1.1.0, `change_type` PATCH, `change_note` con historial). Prosa de `GenerateSceneInput.action`, `SceneActions.canUpdate`, `canRegenerate` y `blockedReason`: ya no nombran «Actualizar imagen del hogar» ni «Regenerar escena desde cero». `traceability` +SC-ESC6-134. Propiedades, tipos, enum, `required` y `additionalProperties` sin cambio.
- `contracts/openapi/home-scene.openapi.yaml`: versión **3.4.0** sin cambio; `summary` de `generateHouseholdScene` y `generateOwnerScene`, descripción de `generateOwnerScene` y una frase de la descripción de `generateHouseholdScene`. Sin cambio de rutas ni esquemas. YAML y JSON parsean.
- Sin consulta a `/merovingian`: cambio solo de prosa, sin forma que pueda romper rutas, puertos ni pruebas (el impacto en `src/generated/` es solo `description`).
- Observación (no tocada, fuera del alcance aprobado): la descripción de `revokeSceneConsent` en el OpenAPI aún dice «el boton Actualizar queda deshabilitado». Proponer incluirla en una próxima pasada de prosa.

## Enmienda de INV-ESC6-010 (A1, N2-18, ADR-006-20)
«**Enmienda 2026-11-19 (`T941`, `N2-18`, `A1` de `/rama`, aprobada por Neo, `ADR-006-20`)**: con el botón único que genera siempre desde cero (`D6-21`, `action = REGENERATE`), el "mínimo funcional necesario" de una generación es exactamente (a) la foto del hogar, si existe y su propietario tiene consentimiento vigente, y (b) las fotos vigentes de las mascotas `RENDER` cuyo propietario tiene consentimiento vigente de fotos de mascota, acotadas por `maxPets` (`REQ-ESC6-034`) y por el tope agregado de bytes (`REQ-ESC6-027`: 32 MiB, o 13 MiB con `gemini-api`). Cada pulsación reenvía ese conjunto completo al proveedor; no se envía ninguna otra imagen. No cambia ningún valor del párrafo anterior ni hay cambio de código.»
ADR-006-20 en `plan.md` §8 (alternativas descartadas y consecuencia). Se asienta como `N2-18` en `spec.md`.

## A2 y M4
- A2 diferido: no se sube `noticeVersion`. Registrado como `DEUDA-006-AVISO-REGENERACION` en `tasks.md` y como condición (8) obligatoria de T885.
- M4: `DEUDA-006-M4-TOPE-REGENERATE` (menor, no bloqueante).

## Higiene (e)
- `N2-16` asentada como resuelta (B + C): fila de decisiones, nota de `SC-ESC6-125` y resumen de conteo (18 decisiones `N2-01..N2-18`).
- `PET_COUNT_RULE` ratificada: «When renderedPetsCount is zero, draw no animals.» Corregida la cita en `REQ-ESC6-016` (decía «With renderedPetsCount 0»); coincide con `scene-spec.ts:20`.
- Registro de cierre añadido al final de `spec.md`.

## Matriz y conteo
Sin REQ/INV/EDGE/SC ni tareas nuevos (la deuda no es tarea): 241 IDs propios, 143 tareas. Fila de INV-ESC6-010 sin cambio de SC.

## Compuerta
`bash scripts/verify-traceability.sh --feature 006`: rc 0, CUMPLE, 241/241 IDs propios mapeados, 198/278 trazados, pureza 0 violaciones.

## Siguiente
`/keymaker`: `bash scripts/compile-contracts.sh`, `npx tsc --noEmit` en 0 (T941), más M1 (guarda de acoplamiento a realDriver) y M2 (prueba negativa KEEP/REGENERATE sin consentimiento).
