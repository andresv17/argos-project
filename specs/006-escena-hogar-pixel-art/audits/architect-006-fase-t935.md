# Architect 006: Fase 13 (T935..T943), cuarta ronda de la prueba en vivo T910

Fecha: 2026-11-19. Rama `006-escena-hogar-pixel-art`, HEAD `ea2c0f7`. Estado: `DRAFT`. Autor: `/architect` (sonnet). Sin `src/`, `tests/`, `contracts/`, `src/generated/`, `vite.config.ts` ni constitución; sin commit; ninguna tarea `[x]`; `T910`, `T923` y `T934` siguen `[ ]`. Directivas de Neo `D6-21` (alcance no reabierto).

## 1. Botón único y generación limpia (directiva 1)
- **Ruta de contrato elegida: ninguna nueva.** `POST /households/{id}/scene/generate` (y `/me/scene/generate`) con `GenerateSceneInput.action = REGENERATE` ya produce `mode = REGENERATE`, `currentSceneRef = null`, todas las mascotas `RENDER`, foto del hogar si existe y fotos vigentes con consentimiento de todas las mascotas; no exige cambios (`canRegenerate = roleOk && remaining >= 1 && !consentRequired && status !== generating && limits.allowed`). Verificado en `decide-mode.ts` y `scene-use-cases.ts`. Cambio 100 % de cliente.
- **Etiquetas**: «Reintentar» (`status = failed`, precedencia) > «Regenerar imagen del hogar» (`imageTag` no nulo) > «Crear imagen del hogar». Se eliminan el segundo botón, los dos textos de ayuda y `onUpdate`.
- **Habilitación**: `canRegenerate`, sin espera (`retryAfterSeconds`), no `generating`, más una regla de cliente: `status = idle` deshabilitado («Agrega una mascota o la foto del hogar para crear la imagen.»). Razón: hoy el botón inicial se bloquea por `NO_CHANGES` cuando no hay entradas; sin esta regla el botón único gastaría cuota generando una sala vacía, y la máquina rechaza `idle -> generating`. `NO_CHANGES` y `canUpdate` dejan de leerse en la UI.
- **STATE-SCENE-001**: sin cambio (`REGENERATE` ya se expresa como `outdated` derivado, ADR-006-05). **Cooldown**: sin cambio (REQ-034 aplica a ambas acciones; el botón sigue deshabilitado por `retryAfterSeconds`). **Idempotencia**: clave nueva por clic, alcance (actor, escena, acción).
- **INCREMENTAL_***: quedan en el servidor, alcanzables solo con `action = UPDATE` por API (`ADR-006-18`, deuda `DEUDA-006-INCREMENTAL-SIN-UI`). Retirarlos cambia el enum `SceneMode` (MAJOR) y reescribe decenas de pruebas; no se hace sin decisión de Neo. Efecto lateral: el trabajo de la Fase 12 sobre `KEEP` queda sin camino desde la UI.
- **Costo**: cada pulsación envía foto del hogar y todas las fotos vigentes (hasta N + 1) al proveedor; antes, un incremental enviaba menos. Misma cuota (1 por publicación). Observación para `/rama` en T943; el tope de 60 s y 12 intentos por actor no cambia.
- Servidor: REGENERATE desde `idle` por API directa sigue permitido (contradice a la máquina); la UI lo bloquea. Observación, no se toca.

## 2. Foto del hogar como inspiración (directiva 2)
Cambio de plantilla aprobado por Neo en `householdBlock` (solo con foto): «Use IMG_n only as loose inspiration for the room's color palette, mood, and general furniture types. Do not copy or trace its camera angle, photographic perspective, or real textures. Reimagine the entire room from scratch as an isometric cutaway diorama in 32-bit pixel art.» Sustituye una sola frase existente. Intactos byte a byte: `STYLE_BASE_TEXT`, frase sin foto del hogar, frases de mascota, «Place all N pets…», `PIXEL_REDRAW_RULE` (texto y condición), bloque incremental, `STYLE_CLOSING`, `PET_COUNT_RULE`. `STYLE_BASE_TEXT` ya dice «cutaway» y 32-bit isométrico: coherente.

## 3. Conteo por especie (directiva 3)
- `pet-phrases.ts` exporta `petSpeciesLabel(pet)` (reutiliza `speciesLabel`) y `animalCountLine(pets)`. `scene-spec.ts` y el JSON no cambian.
- Línea exacta: `Exact animal count: {N} total ({n1} {etiqueta1}, {n2} {etiqueta2}, …).` Ejemplos: `Exact animal count: 3 total (2 dogs, 1 cat).`; `Exact animal count: 1 total (1 dog).`. N = 0: sin línea. Plural regular con `s`; `OTHER` con valor entre comillas e invariable (`2 "hamster"`); `OTHER` sin valor: `animal(s)`. Grupos por primera aparición (sin `sort`/`localeCompare`).
- Orden: JSON saneado, **línea de conteo**, `PET_COUNT_RULE`, `PIXEL_REDRAW_RULE` (desde cero) o JSON, línea, `PET_COUNT_RULE`, `PIXEL_REDRAW_RULE`, `STYLE_CLOSING` (incremental). `PET_COUNT_RULE` queda sin número literal y sin cambio de byte.
- Líneas `Pet {k} ({especie}): …` siempre, con o sin foto. Incrementales «- Add:»/«- Remove only:»/«- Replace only:» sin cambio.
- Invariantes: `INV-ESC6-001`, `010`, `011` y `017` se mantienen (solo enums y `speciesOther` saneado). Esto reintroduce el cierre numérico por especie que `T911` había descartado, ahora además del JSON, por instrucción de Neo.

## 4. Artefactos modificados
`spec.md` (REQ-005, 007, 016, 019 enmendados; SC-128..130 sustituidas; SC-ESC6-131..138; D6-21; N2-17; matriz con cabecera y 12 filas; conteo; registro), `plan.md` (§2.1, §2.3, §5.3, §5.3.1, §5.7, ADR-006-17..19, §11, §12), `tasks.md` (Fase 13), `claude/log-architect.md`, esta acta.

## 5. Tareas y SC nuevos
| Tarea | Contenido | Dep | SC |
|---|---|---|---|
| T935 [GOV] | enmiendas DRAFT | T933 | 131..138 |
| T936 [P] | pruebas rojas botón único | T935 | 131, 132, 133 |
| T937 | `scene-view.ts` y `SceneBlock.tsx` | T936 | 131, 132, 133 |
| T938 [P] | caracterización servidor `REGENERATE` (sin cambio de `src/`) | T935 | 134 |
| T939 [P] | pruebas rojas del prompt | T935 | 135..138 |
| T940 | `pet-phrases.ts`, `build-image-prompt.ts` | T939 | 135..138 |
| T941 [N2] | prosa de contrato (solo con N2-17) | T935, N2-17 | 134 |
| T942 | compuertas | T937, T938, T940 | 131..138 |
| T943 [GOV] | `/oracle` + `/rama` + [HUM] T910 | T942 | 131..138 |
Orden: T936..T937, T938 y T939..T940 en paralelo; T941 solo tras N2-17. Pruebas de Fase 12 que se reescriben: `t875`/`t876` (T931) y la verificación de `SC-128..130`.

## 6. Propuesta de contrato (decisión de Neo, N2-17, no bloqueante)
Cambio solo de prosa, sin campos ni rutas: `scene.schema.json` 1.1.0 -> 1.1.1 PATCH (`GenerateSceneInput.action`, `SceneActions.canUpdate`, `canRegenerate`: dejar de nombrar los botones «Actualizar…»/«Regenerar escena desde cero») y `home-scene.openapi.yaml` (summary y descripción de `generateHouseholdScene`/`generateOwnerScene`; versión 3.4.0 igual); recompilar. Opción A recomendada; opción B: dejar la prosa desactualizada como `DEUDA-006-PROSA-BOTONES`. Solo bloquea T941.

## 7. Otras observaciones
- `spec.md` conserva `N2-16` como PENDIENTE aunque el bus registra B + C resuelta y la Fase 12 la implementó; no lo toqué (firma de Neo), conviene que lo asiente `/morpheus`.
- Desviación de `PET_COUNT_RULE` («When renderedPetsCount is zero» frente a «With renderedPetsCount 0», `T923`) sigue pendiente de Neo.
- Sin consultas a `/mifune`, `/lock`, `/merovingian` ni `/mouse` (sin contrato modificado); recomendable `/mouse` tras T935.

## 8. Compuerta
`bash scripts/verify-traceability.sh --feature 006`: CUMPLE. 241/241 IDs propios mapeados (antes 233), 195/278 trazados, pureza 0 violaciones.
