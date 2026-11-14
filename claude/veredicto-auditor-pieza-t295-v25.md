# Veredicto Oracle — ui_blueprint v2.5 y arreglos D1, D2, D3 (pieza T295)

- Fecha: 2026-11-14. Rama `002-plataforma-v21`, HEAD `425c006`. Auditoría de solo lectura sobre disco; sin commits ni cambios en src/, tests/, specs/, contratos ni logos.json.
- **VEREDICTO: APTO CONDICIONADO.** §5.3 coincide con REQ-UI2-007 y los subcampos existen en el contrato. Las desviaciones D4 y D8 tienen una justificación imprecisa (corregible en texto). D1 introduce un desorden de foco en < 1024 px que contradice §3.2 y WCAG 2.4.3 (hallazgo ALTO). Quedan dos decisiones para Neo.

## Tabla por punto

| # | Punto | Dictamen | Evidencia |
|---|---|---|---|
| 1 | §5.3 vs REQ-UI2-007 | CUMPLE | `spec.md:269` exige arrastre, previsualización y barra de fases (Validando, Previsualizando, Aplicando, Terminada o Revertida), sin porcentaje. `ui_blueprint.md` §5.3 (líneas 487-499) trae las cuatro fases + "Revertida", `<ol aria-label>` con `aria-current="step"`, sin `progressbar`, zona de arrastre con `input file` equivalente por teclado, previsualización y "nunca importa solo". No inventa fases. Coincide con `BackupPage.tsx` (`PHASE_LABELS`, `CURRENT_STEP`, `PhaseBar`). Matiz bajo H-V25-4. |
| 2 | Subcampos de la previsualización | CUMPLE, sin campos inventados | `backup-envelope.schema.json:1223-1320` (`ImportPreviewResult`, `additionalProperties:false`): `counts.{pets, weights, bodyMeasurements, vaccinations, dewormings, medicalVisits, customParameters}`, `collisions.{petsReplacedCount, sameIdPetsCount}`, `affectedSharedPets.{petsCount, householdsCount}`, `sourceSchemaVersion`, `fileDigest`. Idénticos en `src/generated/schemas/types.ts:893-923`. Endpoint `POST /backup/import/preview` en `pet-tracker-api.openapi.yaml:224-244`. `architecture_spec.md` §3.6 solo nombra los cinco campos de primer nivel; los subcampos no están allí, solo en el schema. 0 dead UI. |
| 3 | Conflicto §3.6 vs REQ-UI2-007 | NO DECIDIDO (decisión de Neo) | `architecture_spec.md:296-297` y 3.7 ("vista previa de importación" sin interfaz) y la lista de endpoints consumidos (solo export e import). `BackupPage.tsx` ya consume `/backup/import/preview` (`previewBackupFile`, `PreviewSummary`); `spec.md:269` lo exige. Ver decisión D-N1. |
| 4 | D4 a D9 | PARCIAL | D5, D6, D7, D9 correctas. D4 y D8 con justificación imprecisa (H-V25-2, H-V25-3). |
| 5 | Arreglos D1, D2, D3 | NO CUMPLE en D1 (foco); D2 y D3 cumplen | Ver detalle abajo. |
| 6 | Gates | CUMPLE | `npx tsc --noEmit`: exit 0. `vitest run tests/unit/presentation`: 11 fallos, 56 pasan (67); los 11 son exactamente los ítems 1 a 11 de la línea base heredada (`veredicto-auditor-fallos-gate-t296.md:17-28`; el 12 es de `tests/integration/presentation`, fuera de este comando). 0 nuevos. `playwright test tests/e2e/accessibility` con `E2E_API_PORT=3210 E2E_WEB_PORT=5210` y `.env` cargado sin imprimirlo: 14 passed. Los puertos 3180/5180/3100/5173 estaban libres; tras la corrida 3210/5210 quedaron libres (sin procesos residuales). |

## Detalle punto 4 (D4 a D9)

- **D4 (`bg-deco` solo desde 1024 px):** `styles.css:20-29` confirma la imagen solo en `@media (min-width:1024px)`, trazo `stroke-opacity 0.08` y comentario "Nunca detrás de texto". Contrato: sin efecto. Imprecisión: la justificación dice "sin texto encima", pero en 1024+ el círculo (720 px, esquina superior derecha) queda detrás del marco y de su texto; sí es seguro porque el trazo es 8 % de `#1d4f3a` sobre fondo claro y el marco es blanco/translúcido, pero la frase literal es inexacta. Además §1.2/§2 (`ui_blueprint.md:145,149`) dicen "se oculta en < 640 px", no < 1024 px: la desviación real es entre 640 y 1023 px y debe decirlo. Severidad baja (H-V25-2).
- **D5 ("Cargando…" sin marco):** `App.tsx:22-26`, `<p role="status" className="p-4 text-slate-800">`. Correcta: texto legible, tiene rol de estado, no altera foco ni contrato.
- **D6 (glifo genérico):** consistente con pendiente 2 de §9. Correcta (la especie va en texto).
- **D7 (orden contexto/filtro):** `PetsPage` y `PetCards.tsx:36` (`role="search"`) siguen el orden DOM = visual; correcta.
- **D8 (`snap-x` sin efecto):** `PetCards.tsx:104` lleva `snap-x`. Con Tailwind 3.4.19, `snap-x` emite `scroll-snap-type: x var(--tw-scroll-snap-strictness)` y el valor por defecto es `proximity` (`node_modules/tailwindcss/lib/corePlugins.js:1501-1509`), con `snap-start` en cada opción (`PetCards.tsx:120`). Por tanto sí tiene efecto (ajuste suave por proximidad) a < 1024 px. Sigue siendo inocuo para teclado, lectores y contrato, pero la frase "no ajusta nada" es falsa. Corregir a "ajuste por proximidad, inocuo" (H-V25-3, baja).
- **D9:** coincide con §5.3 y con `BackupPage.tsx`; el selector sigue accesible por teclado; sin `progressbar`. Correcta.

## Detalle punto 5 (D1, D2, D3), según `git diff`

- **No cambian** `aria-pressed`, `aria-controls`, `data-pet-id`, `h2#pet-title` (`PetDashboard.tsx:~325`, intacto) ni roles. **No añaden** colores nuevos (solo utilidades de layout: `order-*`, `shrink-0`, `whitespace-nowrap`, `overflow-x-auto`, `basis-56`, `min-w-[14rem]`, `sm:px-4`) ni `backdrop-filter`. Ningún diff toca "Nueva mascota": sigue habiendo uno solo.
- **D2 (`PetDashboard.tsx`):** quita `flex-wrap` de la sección hero y envuelve el avatar en `div.shrink-0`. Sin impacto en semántica. Cumple.
- **D3 (`Field.tsx`, `PasswordField`):** `flex-wrap`, `basis-56`, `min-w-[14rem]`. Control con la misma etiqueta, `aria-invalid` y `aria-describedby`. Cumple.
- **D1 (`AppShell.tsx`):** 
  - Las insignias pierden la palabra visible "hogares"/"invitaciones" en < 640 px (`hidden ... sm:inline`, `AppShell.tsx:55,60`); `sr-only` se conserva, así que no hay pérdida para lectores. Pero §3.2 (`ui_blueprint.md`, filas de insignias) manda la palabra visible dentro de la píldora y la v2.5 no registra esta desviación.
  - **Hallazgo ALTO H-V25-1 (foco):** el `<nav>` pasa a `order-3` y el bloque de cuenta a `order-2` en < 1024 px (`AppShell.tsx:46,70`). Orden DOM: Argos, nav, cuenta (nombre, "Cerrar sesión"). Orden visual en < 1024 px: Argos y cuenta en la fila 1, nav en la fila 2. El Tab recorre nav (fila 2) y luego vuelve a "Cerrar sesión" (fila 1): foco ≠ orden visual. Viola WCAG 2.4.3 (y 1.3.2) y la regla explícita de `ui_blueprint.md` §3.2 y C2 ("Orden de tabulación = orden visual: salto, wordmark, navegación, nombre, Cerrar sesión"). axe no lo detecta, por eso el 14/14 no lo cubre.
  - **Limitación de 320 px (hallazgo MEDIO H-V25-5):** la navegación de cuatro enlaces se desplaza dentro de su región (`overflow-x-auto`, 254 px disponibles frente a 389 px de contenido). §3.2 prescribe "Móvil: fila que envuelve (`flex-wrap`)", no scroll. Por teclado es operable (cada enlace es focalizable y el navegador lo desplaza a la vista al enfocarlo), y a nivel de página no hay scroll horizontal (la prueba "sin desbordamiento horizontal a 320 px" pasa). Pero WCAG 1.4.10 (Reflow) pide no depender de desplazamiento en dos dimensiones; un contenedor con scroll interno para la navegación principal es una excepción dudosa (la excepción cubre tablas, mapas, gráficos, no menús), el último enlace ("Perfil") queda fuera de la vista sin pista visual y un usuario de zoom/baja visión puede no descubrirlo. No es un fallo de axe ni de contrato, pero se aparta del blueprint (que tiene "fila que envuelve") y tampoco figura entre las desviaciones aceptadas de v2.5.

## Hallazgos por severidad

| ID | Sev. | Hallazgo | Archivo:línea |
|---|---|---|---|
| H-V25-1 | ALTA | D1 rompe orden de foco = orden visual en < 1024 px (`order-2`/`order-3` sobre un DOM nav → cuenta). Contradice §3.2, C2 y WCAG 2.4.3. | `AppShell.tsx:46,70` |
| H-V25-5 | MEDIA | Nav con scroll interno a 320 px (254 de 389 px) en lugar de "fila que envuelve"; riesgo 1.4.10 y descubribilidad; no registrada como desviación. | `AppShell.tsx:46` |
| H-V25-6 | MEDIA | Insignias sin palabra visible en < 640 px (§3.2 la exige visible); no registrada como desviación. | `AppShell.tsx:55,60` |
| H-V25-4 | BAJA | `BackupPage` fija la fase en "Revertida" ante cualquier error de importación, incluido `finalState: UNKNOWN` o errores sin `finalState` (413, red). §5.3 dice "Revertida si el servidor revierte". | `BackupPage.tsx` (rama `catch` de `upload`) |
| H-V25-2 | BAJA | D4 mal justificada ("sin texto encima"; la desviación real es 640-1023 px). | `ui_blueprint.md` §9, `styles.css:20` |
| H-V25-3 | BAJA | D8 mal justificada: `snap-x` = proximity en Tailwind 3.4.19. | `ui_blueprint.md` §9, `PetCards.tsx:104` |

Sin hallazgos de contrato: 0 campos inventados, 0 dead UI en la previsualización.

## Decisiones para Neo

**D-N1 (punto 3, conflicto §3.6 vs REQ-UI2-007).** Evidencia: `architecture_spec.md` §3.6/§3.7 dice "[CONTRATO], sin pantalla" y "la UI solo expone el resultado final"; `spec.md:269` (REQ-UI2-007) exige previsualización y barra de fases; el contrato (`ImportPreviewResult`, OpenAPI, STATE-BACKUP-001 con `PREVIEW_READY`) la soporta; `BackupPage.tsx` y blueprint v2.5 §5.3 ya la implementan; el blueprint declara `architecture_spec.md` como "contrato funcional de entrada inmutable".
- Opción A: enmendar `architecture_spec.md` §3.6/§3.7 para que registre `POST /backup/import/preview` como consumido y las fases visibles (la spec 002, posterior, prevalece). Es lo coherente con el código actual y REQ-UI2-007.
- Opción B: retirar la previsualización y las fases de la UI y de §5.3 (incumple REQ-UI2-007, que habría que enmendar).
- Opción C: dejar `architecture_spec.md` como histórico de la 001 y declarar en el blueprint que REQ-UI2-007 lo sustituye en §3.6, sin editarlo.
- Recomendación de Oracle: A o C; no B.

**D-N2 (D1: navegación en < 1024 px).** Opciones:
- Opción A (recomendada): restaurar el blueprint, es decir, `nav` con `flex-wrap` sin `order-*` ni `overflow-x-auto`; las cuatro entradas se envuelven en dos filas a 320 px. Cumple 2.4.3, 1.4.10 y §3.2 sin enmendar nada.
- Opción B: conservar el scroll interno, pero eliminar el desorden de foco (poner el bloque de cuenta antes de la nav en el DOM solo en móvil es incompatible con escritorio; la alternativa es dejar nav en la fila 1 y la cuenta en la 2) y enmendar §3.2 y el blueprint para registrar la desviación (scroll interno como D10), con aviso visual de continuación.
- Opción C: aceptar tal cual como desviación D10 (no recomendado: deja H-V25-1 abierto).

## Siguiente paso

1. Neo decide D-N1 y D-N2.
2. Sati corrige el texto de D4 y D8 (y registra las insignias si se mantienen); Keymaker aplica D-N2 (rebote MAX_RETRY = 1 si se elige A o B) y propone el ajuste de `BackupPage` para "Revertida" solo con `finalState === 'ROLLED_BACK'`.
3. Tras eso, Oracle reconfirma solo los puntos corregidos. Ninguna tarea pasa a COMPLETED sin firma de Neo.
