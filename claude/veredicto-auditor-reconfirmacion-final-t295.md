# Veredicto Oracle — Reconfirmación final de la pieza T295 (blueprint v2.5 + AppShell/BackupPage)

Fecha: 2026-11-14. Modo auditoría (solo lectura; sin commits; sin valores de .env). Veredicto previo: `claude/veredicto-auditor-pieza-t295-v25.md` (APTO CONDICIONADO).

## VEREDICTO: APTO (VALIDADO EN DISCO), con una decisión de producto para Neo (altura de la cabecera a 320 px)

## Tabla por punto

| Punto | Resultado | Evidencia |
|---|---|---|
| H-V25-1 (ALTA) orden DOM = visual | CERRADO | `AppShell.tsx:47-84`: `<header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 pb-4">`; `grep -n "order-"` solo da `:102` y `:105` (`border-white/40`, `border-amber-700`: falsos positivos); en el DOM de la cabecera hay 0 clases `order-*` (medido). DOM: wordmark (p), nav, cuenta (div). Medición Chromium por filas (Playwright, usuario real): 320 px, tres filas apiladas wordmark y=33, nav y=69, cuenta y=229. 768 px, fila 1 wordmark x=49 + nav x=186 (mismo renglón), fila 2 cuenta y=105. 1024 px y 1280 px, una fila: wordmark x=49, nav x=156/284, cuenta x=747/1003. Orden visual = wordmark, nav, cuenta en los cuatro anchos. Orden de Tab medido a 320, 768 y 1024: Mascotas, Hogares, Respaldo, Perfil, Cerrar sesión. (A 1280 px mi primera lectura cayó en "Cargando…" por carrera de carga, no es defecto; el orden DOM es idéntico y la posición visual es la de la fila.) |
| H-V25-5 (MEDIA) nav sin scroll interno | CERRADO | `AppShell.tsx:55`: `<nav aria-label="Principal" className="flex flex-wrap gap-1">`, sin `overflow-x-auto`. Medido: `scrollWidth = clientWidth` = 256/256 (320 px), 533/533 (768, 1024, 1280); `overflow-x: visible`; `documentElement.scrollWidth` = 320 = innerWidth. Los cuatro enlaces visibles, dentro del viewport (`right <= innerWidth`) y operables: clic a Respaldo -> /backup, Perfil -> /cuenta, Mascotas -> /, Hogares -> /households en los cuatro anchos. Coherente con blueprint §3.2 (línea 220: "Móvil: fila que envuelve (`flex-wrap`)"). |
| H-V25-6 (MEDIA) palabras visibles | CERRADO | `AppShell.tsx:62-70`: `<span aria-hidden="true" className="ml-1 font-normal">hogares</span>` e `invitaciones`, sin clase responsiva que las oculte. Medido: en 320, 768, 1024 y 1280 px ambas palabras con ancho > 0. Se conservan `sr-only` ("1 hogar"/"N hogares", `invitationsLabel`), `data-household-count` y `data-pending-invitations`. Blueprint §3.2 (líneas 223-224) lo describe igual. |
| H-V25-4 (BAJA) "Revertida" y aria-current | CERRADO | `BackupPage.tsx:168-169`: `setPhase(problem.finalState === 'ROLLED_BACK' ? 'ROLLED_BACK' : 'APPLYING')`; `:93` solo muestra "Revertida" si `phase === 'ROLLED_BACK'`; `:91` `isCurrent = current === index && !stalled` y `:198` `stalled={phase === 'APPLYING' && error !== null}`: con error sin ROLLED_BACK, "Aplicando" no lleva `aria-current="step"`. Verificado en código; no se forzó un error UNKNOWN en el navegador (no hay vía sin tocar src/tests). El axe de /backup a 4 anchos pasa. |
| H-V25-2 (BAJA) D4 | CORRECTO | `styles.css:21` `@media (min-width: 1024px)` con el SVG de círculos en `body` (stroke-opacity 0.08, solo decorativo); de 640 a 1023 queda solo el degradado. La cita "línea 20" es el comentario (el `@media` está en la 21): desfase de 1 línea, sin consecuencia. |
| H-V25-3 (BAJA) D8 | CORRECTO | `node_modules/tailwindcss/lib/corePlugins.js:1500-1509` (Tailwind 3.4.19): `--tw-scroll-snap-strictness: proximity`, `.snap-x` = `x var(--tw-scroll-snap-strictness)`. `PetCards.tsx:104`: `snap-x ... lg:snap-none`. La justificación (proximidad) es exacta. |
| D-N1 (architecture_spec §3.6/§3.7) | CORRECTO | `architecture_spec.md:277` añade `POST /backup/import/preview`; `:289` describe `sourceSchemaVersion`, `counts`, `collisions`, `affectedSharedPets` (los cuatro existen en `ImportPreviewResult`, `backup-envelope.schema.json:1223+`, junto con `fileDigest`, que el texto declara no mostrado). Fases Validando/Previsualizando/Aplicando/Terminada/Revertida coinciden con REQ-UI2-007 (spec.md:269) y con `PREVIEW_READY` de `backup-import.machine.json:115,143`. Cabecera `X-Argos-Import-Confirm` existe en openapi (:1004). §3.7 ya no lista la vista previa. 0 campos inventados, 0 contradicciones. Observación menor (BAJA): el párrafo "Estados requeridos" de §3.6 no menciona la previsualización ni la barra; no contradice, solo es incompleto. |

## Riesgo dictaminado: cabecera de 260 px a 320 px

- Medición: header 254x260 px (incluye `pb-4`), la nav ocupa 152 px en tres filas: Mascotas (89 px), Hogares con insignias (256 px, ancho completo) y Respaldo + Perfil juntos. Altura de cada enlace 48 px (`min-h-12`, objetivo táctil correcto).
- Cumplimiento del blueprint §3.2: SÍ. Texto literal "Móvil: fila que envuelve (`flex-wrap`); cada enlace `min-h-12`" y la implementación hace exactamente eso. No es fallo de código ni de especificación.
- Aceptabilidad: técnicamente aceptable (sin desbordamiento, sin scroll interno, 14/14 axe, foco = visual). Es un costo de diseño: ~30 % de una pantalla de 900 px de alto queda en cabecera en móvil estrecho, causado porque el enlace "Hogares" con las dos insignias y palabras visibles ocupa una fila completa. Se marca como DECISIÓN DE NEO (producto/diseño), no como hallazgo: opciones, (A) aceptar tal cual; (B) pedir a Sati abreviar las insignias en < 480 px solo visualmente (contradiría la decisión de mantener las palabras en todos los anchos, H-V25-6); (C) reducir `px`/`gap` en < 480 px para que Respaldo y Perfil quepan en fila con Mascotas. Sin ninguna opción bloquea el cierre de T295.

## Compuertas

1. `npx tsc --noEmit`: exit 0.
2. `npx vitest run tests/unit/presentation`: 67 tests, 11 fallos. Coinciden por archivo y título con los ítems 1-11 de `claude/veredicto-auditor-fallos-gate-t296.md` (components.spec.ts x8, validation.spec.ts x1, view-model.spec.ts x2). Ningún fallo nuevo. (El ítem 12, web-client, es de integration y queda fuera de este directorio.)
3. `npx playwright test tests/e2e/accessibility` con puertos 3230/5230 y `.env` cargado sin imprimir: 14 passed (30.7 s).
4. Medición de layout: spec temporal fuera del repo (scratchpad, con `node_modules` enlazado), sin tocar `src/`, `tests/`, specs, contratos, `architecture_spec.md` ni `logos.json`. Tras las pruebas no quedan procesos en 3230/5230 (`lsof` vacío).

## Hallazgos por severidad

- BLOQUEANTES / ALTA / MEDIA: ninguno abierto (H-V25-1, H-V25-5, H-V25-6 cerrados).
- BAJA (no bloquean): (1) D4 cita `styles.css` línea 20, el `@media` está en la 21. (2) `architecture_spec.md` §3.6 "Estados requeridos" no cita previsualización ni barra de fases. (3) H-V25-4 verificado solo en código, no con un UNKNOWN forzado en navegador.
- Decisión de Neo (no es fallo): altura de la cabecera a 320 px (ver arriba).

## Estado del árbol
Sin commits ni cambios en archivos normativos por parte de Oracle. Sigue sin commit el trabajo de la pieza (src/presentation/web/*, ui_blueprint.md, architecture_spec.md, bitácoras, etc.). Solo Neo marca COMPLETED y autoriza commit/push.
