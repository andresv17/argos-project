# Veredicto Oracle: ui_blueprint.md v2.0 + ui_maqueta_v2.html (2026-11-14)

- **Auditora:** Oracle (SDD Auditor). **Modo:** solo lectura sobre `src/`, `tests/`, contratos y specs. Único escrito: este veredicto, el log y el bus. `logos.json` no se tocó.
- **Material auditado:** `ui_blueprint.md` (634 líneas, estado REVIEW), `ui_maqueta_v2.html` (288 líneas), contra `architecture_spec.md` (422 líneas, inmutable). Pre-verificación de Sati: no aceptada; todo recalculado.
- **Método:** lectura línea a línea; script propio de luminancia relativa WCAG 2.1 (scratchpad `c.py`, 64 pares); Chromium + axe-core ejecutados por Oracle SOLO sobre la maqueta (scratchpad `b.cjs`); lectura de `tests/e2e/**` completo en lo que toca a la UI.

## VEREDICTO: NO APTO (corregible con una enmienda de Sati; 1 rebote, `MAX_RETRY = 1`)

Motivo: la compuerta 1 (cobertura contractual 100%) no se cumple, porque el riel descarta datos `[UI]` de la tarjeta de mascota. Esa omisión rompe además una aserción literal de E2E (compuerta 3). La maqueta tiene un defecto ARIA crítico confirmado con axe. Contraste y blur cumplen. Ningún hallazgo exige cambiar contratos: son correcciones de documento y de maqueta.

## Resumen por compuerta

| # | Compuerta | Resultado | Evidencia principal |
|---|---|---|---|
| 1 | Cobertura contractual 100% | NO CUMPLE | Faltan datos `[UI]` de la tarjeta (H-BP2-1) y 4 omisiones menores (H-BP2-9). Rutas, campos, botones, 2 diálogos y los 9 `data-*` sí están en blueprint |
| 2 | Contraste WCAG 2.1 AA y blur | CUMPLE con 1 reserva | todos los pares de texto >= 4.5:1; no-texto >= 3:1 salvo el indicador de estado activo por relleno lima (H-BP2-6). Blur: 0 en 320 y 639; 1 en 640, 1024 y 1280 |
| 3 | No regresión Playwright | NO CUMPLE | Un solo "Nueva mascota" OK. Rotos: `pet-dashboard.spec.ts:112`, riesgo en `:63-68` y `:82-87`, celdas `:67` y `:70`, y `rebanada6-recorridos.spec.ts:84-86` |
| 4 | Cero UI muerta / métricas inventadas | CUMPLE CON RESERVAS | Sin Mood, Water, Activity, Smart Care, Tips, Upgrade ni variación %. Hay datos `[CONTRATO]` visibles por decisión D3 sin declararse como excepción (H-BP2-5) |

## Compuerta 1: listado cruzado contrato -> blueprint / maqueta

| Elemento de `architecture_spec.md` | Blueprint | Maqueta | Estado |
|---|---|---|---|
| Rutas `/login`, `/register`, `/`, `/households`, `/backup`, `*` | §5.1, §3, §4, §5.2, §5.3 | solo `/` | OK (maqueta cubre una pantalla; ver límites) |
| `/login`: Usuario, Contraseña, Mostrar contraseña (`aria-pressed`), Entrar, Regístrate, error general | §5.1 L418 | no | OK |
| `/register`: 5 campos, errores por campo, Mostrar contraseña x2, Registrarme, Inicia sesión | §5.1 L420 | no | OK |
| Cabecera: salto, Argos, nav Principal (3 enlaces), `displayName`, Cerrar sesión | §3.1-3.2 | L130-141 | OK |
| `data-household-count`, `data-pending-invitations` + texto visible "hogares"/"invitaciones" | §3.2 L200-201 | L137: badges solo con número, sin los `data-*` y sin las palabras visibles | Blueprint OK; maqueta incompleta (H-BP2-8) |
| Pestañas de contexto + panel `pet-panel` `role=tabpanel` | §8.B L534 | L144-146, L158 | Maqueta defectuosa (H-BP2-2) |
| Búsqueda `role=search`, filtro de especie | §4.1 | L148-155 | OK |
| Riel `listbox`/`option`, teclado, `data-pet-id` | §4.2, §8 | L161-174, L268-285 | OK |
| Tarjeta `[UI]`: nombre, especie, edad, peso, "N vencidas · M próximas", insignia "Dueño" con color (en hogar) | §4.2 solo da nombre y UN estado | idem | **FALTA** (H-BP2-1) |
| "Nueva mascota" visible SOLO en "Mis mascotas" | no se dice | no | **FALTA** (H-BP2-9) |
| Ficha: nombre, especie, raza, sexo, `birthDate`, dueño, Solo lectura, edad, peso | §4.3 | L181-213 | OK |
| Editar / Eliminar según permisos; EDIT con "Cancelar" | §4.6: "Cancelar" solo en CREATE | L192-193 | Parcial (H-BP2-9) |
| `PetAssignments`, `PetForm` (7 campos + Hogar base) | §4.6 L383-385 | no | OK |
| `alertdialog` eliminar mascota (`delete-pet-title`, `delete-pet-desc`) | §4.6 L387-390 | no | OK; falta la etiqueta literal "Nombre de la mascota" que usa `pet-dashboard.spec.ts:48` |
| 6 módulos: pestañas, ids `module-tab-*`/`module-panel-*`, formularios y campos | §4.5 L337-371 | solo Peso (L216-260) | OK |
| Semáforo `data-alert-status` + `data-ui-badge` + texto | §2.2, §8.A | no hay vacunas en maqueta | Blueprint OK |
| Gráfico SVG `role=img`, `circle` por punto, tabla con `caption`, `th scope`, región `tabIndex=0` | §4.5 L353 | L238-259 | OK |
| Estados vacíos y errores (`role=alert`, `role=status`, "Cargando…") | §4.7, §6 | no | OK |
| `/households`: Crear hogar, Invitar (+ [FIX B-1]), Aceptar/Rechazar, Retirar, Abandonar, Eliminar hogar + `alertdialog` con Confirmar/Cancelar, `data-household-id`, `data-membership-status` | §5.2 L424-431 | no | OK |
| `/backup`: Descargar, `input[type=file]`, Importar (deshabilitado sin archivo), `role=status`/`alert`, límite 10 MB | §5.3 L435-438 | no | OK |
| §4.2 A: los 9 atributos `data-*` | §8.A L516-528 | `data-pet-id`, `data-owner-badge`, `data-read-only` presentes (L162, L188-189); el resto ausente | Blueprint OK |
| §4.2 B/C/D: roles ARIA, ids E2E, textos | §8.B-E | parcial | OK salvo lo marcado |

## Compuerta 2: contraste y blur (calculado)

Script `c.py` con luminancia relativa (sRGB lineal, umbral 0.03928). Se verificaron los pares usados por `ui_maqueta_v2.html` (L9-126) y por `ui_blueprint.md` §2.2, §2.6, §4.2, §4.4 y §6.

| Par (texto / fondo) | Ratio | Mínimo | Estado |
|---|---|---|---|
| `#0f172a` / `#fff` | 17.85 | 4.5 | OK |
| `#475569` / `#fff`, `#eaf6ff`, `#e6f2ea`, `#f4f8ef` | 7.58 / 6.90 / 6.59 / 7.04 | 4.5 | OK |
| Placeholder `#64748b` / `#fff` | 4.76 | 4.5 | OK (margen estrecho) |
| `#1d4f3a` / `#fff`, marco, `#e9fbc4`, `#c5f35a` | 9.41 / 9.03 / 8.54 / 7.32 | 4.5 | OK |
| `#fff` / `#1d4f3a`, `#173f2f`, `#35573f`, `#b91c1c` | 9.41 / 11.74 / 8.12 / 6.47 | 4.5 | OK |
| Dueño 1 a 8, blanco sobre fondo | 6.70 / 5.48 / 6.47 / 6.98 / 5.02 / 5.47 / 6.04 / 7.90 | 4.5 | OK (coinciden con blueprint §2.2) |
| Insignia ámbar `#0f172a` / `#fcd34d` | 12.38 | 4.5 | OK |
| Flags rojo `#7f1d1d`/`#fee2e2`; ámbar `#78350f`/`#fef3c7` | 8.20 / 8.15 | 4.5 | OK |
| Semáforo verde `#064e3b`/`#d1fae5`; gris `#1e293b`/`#f1f5f9` | 8.57 / 13.35 | 4.5 | OK |
| Error `#991b1b`/`#fef2f2`; `#7f1d1d`/`#fef2f2`; éxito `#064e3b`/`#ecfdf5` | 7.60 / 9.16 / 9.23 | 4.5 | OK |
| Pasteles 14532d/713f12/1e3a8a sobre su fondo | 7.88 / 7.93 / 8.49 | 4.5 | OK |
| Marco 70% y 90%: valores del blueprint (`#f3f7f5`) y reales compuestos (`#f9fcff` a `#fcfdfa`) | texto 16.5 a 17+, muted 7.01 a 7.36, oliva 8.71 a 9.14 | 4.5 | OK; el blueprint es conservador |
| No-texto: borde `#64748b` / blanco y marco | 4.76 / 4.62 | 3 | OK |
| No-texto: anillo de foco `#1d4f3a` / blanco; lima / oliva | 9.41 / 7.32 | 3 | OK |
| No-texto: borde selección `#1d4f3a` / `#e9fbc4` (riel) | 8.54 | 3 | OK |
| **No-texto: relleno lima `#c5f35a` de pestaña/enlace activo / marco o blanco** | **1.25 / 1.29** | 3 | **No cumple como único indicador** (H-BP2-6) |
| `#e9fbc4` / blanco (fondo opción activa) | 1.10 | 3 | No es el único indicador (tiene borde 8.54): OK |
| Lima sobre blanco como texto | 1.29 | 4.5 | Prohibido y NO se usa como texto ni anillo: OK |
| Eje del gráfico `#cbd5e1` (1.48) y borde de tarjeta `#e2e8f0` (1.23) | n/a | n/a | Decorativos; sin información propia |

**Blur (computedStyle en Chromium, maqueta):** elementos con `backdrop-filter` activo: 320 px = 0; 639 px = 0; 640 px = 1 (`.frame`); 1024 px = 1; 1280 px = 1. Scroll horizontal: `scrollWidth == innerWidth` en los 5 anchos. CSS: `ui_maqueta_v2.html:27-31` (blur solo dentro de `@media (min-width:640px)` y `@supports`). Blueprint §2.4 L113 y §2.5 L134-140 coinciden. CUMPLE.

## Compuerta 3: no regresión Playwright (lectura de `tests/e2e/**`)

| Prueba / línea | Resultado | Nota |
|---|---|---|
| Un único `button "Nueva mascota"` en `/` | OK | Maqueta: 1 (verificado en DOM a 5 anchos). Blueprint §4.7 L398 y §8 L551 lo exigen. Cuidado: no meterlo dentro del `ul[role=listbox]` |
| Formularios de registro en DOM sin autocierre (D2) | EN RIESGO | Ver H-BP2-3 |
| `pet-dashboard.spec.ts:58-60` (peso con módulo vacío) | OK | `<details open>` si hay 0 registros |
| `pet-dashboard.spec.ts:63-68` y `:82-87` (varios guardados seguidos) | EN RIESGO | Tras el 1.er guardado el módulo ya tiene registros; si el estado abierto se recalcula, `fill` falla |
| `pet-dashboard.spec.ts:67`, `:70` | EN RIESGO | Piden celda "32.85 kg" y variación "−0.45 kg" (U+2212). La maqueta (L252-255) muestra "28.40" y "-0.40" sin unidad ni signo menos real |
| `pet-dashboard.spec.ts:112` | **ROTO** | Espera `Alertas: 1 vencidas · 1 próximas` dentro de la opción. El blueprint muestra un solo estado |
| `pet-dashboard.spec.ts:43,124`, `wcag.spec.ts:78,125`, `household.spec.ts:251` | OK | Nombre de opción por subcadena; h2 de la ficha; `Dueño: Ana` con `.first()` (aparece 2 veces en la ficha: hero y tarjeta oliva) |
| `auth-pet-forms.spec.ts:52-95` | OK | El formulario de edición va sobre el módulo y `Guardar` usa `.first()`. EDIT necesita "Cancelar" (L65), hoy no está en blueprint (H-BP2-9) |
| `rebanada6-recorridos.spec.ts:84-86` (sin commitear) | **CONFLICTO** | Exige `listbox` en `display:grid` con 1, 2 y 3 columnas a 320, 768 y 1280. El riel es `flex` (L66): `gridTemplateColumns` daría `none` |
| `tests/unit/presentation/components.spec.ts:29` | RIESGO | Aserta en `PetCardList`: "Perro · 6 años, 6 meses · 32.40 kg", "Alertas: 1 vencidas · 2 próximas", "Dueño: Andrés" |

## Compuerta 4: UI muerta y métricas inventadas

- Ausentes (correcto): Mood, Water Intake, Activity %, Smart Care, Vet Care Tips, Upgrade, campana, variación %. La columna "Variación (%)" muestra "—", como el contrato.
- Controles: todos tienen endpoint o estado de contrato. Único control nuevo declarado: select `roleOnJoin` [FIX B-1] (`ui_blueprint.md:429`); respaldado por B-1 del contrato.
- Sin respaldo `[UI]` (ver H-BP2-5): "N al día" (`upToDateCount`), "N alertas activas" (`totalActiveAlerts`), botón "Registrar peso" en la tarjeta oliva (acceso rápido nuevo), copy "Todo al día", segunda línea de vacíos (§4.7, ya marcada como pendiente de Neo). Los dos recuentos son `[CONTRATO]` según `architecture_spec.md:170,414` (B-8) y solo se amparan en la decisión D3.

## Hallazgos (por severidad)

**ALTA (bloquean el paso a Keymaker)**

- **H-BP2-1. El riel elimina datos `[UI]` de la tarjeta.** `ui_blueprint.md:280` (opción = avatar + nombre + UN estado) frente a `architecture_spec.md:166-172` (tarjeta muestra nombre, especie, edad, peso, "N vencidas · M próximas" e insignia de dueño con color en hogar) y `:242`. El texto del dueño solo está en la ficha del seleccionado, y en el riel el dueño se indica solo por el aro de color (1.4.1). Rompe `pet-dashboard.spec.ts:112` y `components.spec.ts:29`; también choca con REQ-UI2-003 (`specs/002-plataforma-v21/spec.md:265`).
  Corrección para Sati: en §4.2 la opción incluye "Alertas: N vencidas · M próximas" (siempre ambos números, plural literal), y en contexto de hogar el texto "Dueño: nombre" con su color; especie, edad y peso pueden ir visibles desde `lg` o en texto solo para lector, pero deben existir en el DOM de la opción. Añadir esa decisión a §8.E y a la maqueta (L162-173).
- **H-BP2-2. Maqueta: atributo `id` duplicado en `<main>`.** `ui_maqueta_v2.html:158` declara `id="main-content"` e `id="pet-panel"`; el navegador conserva el primero, así que `#pet-panel` no existe (confirmado: `getElementById('pet-panel') = null` a 5 anchos). axe-core: `aria-valid-attr-value` (critical) en `#context-tab-mine`. Además `role="tabpanel"` sobre `<main>` quita el landmark `main`.
  Corrección: `<main id="main-content" tabindex="-1">` con un `<div id="pet-panel" role="tabpanel" aria-labelledby="context-tab-mine">` dentro; y en blueprint §3.1/§8.B decir expresamente que `main` y `pet-panel` son elementos distintos. La pestaña "Casa Pérez" también controla `pet-panel`.
- **H-BP2-3. Regla D2 ambigua frente a E2E.** `ui_blueprint.md:342-344`: "con registros: `<details>` cerrado" y a la vez "no se cierra al guardar". Si Keymaker deriva `open` del número de registros, el 1.er guardado cerraría el panel y `pet-dashboard.spec.ts:63-68` (2 pesos) y `:82-87` (3 vacunas) fallarían en el 2.º `fill`.
  Corrección: especificar que `open` es estado local, inicializado a `registros === 0` solo al montar el panel del módulo, y que no se recalcula tras guardar (ni al cambiar de pestaña dentro de la misma ficha). Añadir al §4.5 el escenario "módulo vacío -> guardar 3 veces seguidas sin pulsar `summary`".

**MEDIA**

- **H-BP2-4. Conflicto con la Rebanada 6 y la spec 002.** `tests/e2e/visual/rebanada6-recorridos.spec.ts:84-86` (grilla de 1/2/3 columnas) y REQ-UI2-001/002/008 (`spec.md:263-270`: ancho 768, barra inferior, `/cuenta`) contradicen riel `flex` (L66), 3 anchos de verificación y descarte de barra inferior (C2). Requiere decisión de Neo: o se enmienda la spec/tests de Rebanada 6 o el blueprint declara qué tiene prioridad. Sati debe al menos añadir 768 px a §4 y a §9 y aclarar la grilla del directorio.
- **H-BP2-5. Datos `[CONTRATO]` y control nuevo sin declarar como excepción.** `ui_blueprint.md:9` dice que [FIX B-1] es "la única adición", pero §4.4 (L322-327, L331-332) añade `totalActiveAlerts`, `upToDateCount`, botón "Registrar peso" y copy "Todo al día". Corrección: listarlos como excepciones D3 ratificadas por Neo (con cita de la decisión) o retirarlos. La maqueta (L201-206) muestra "5 alertas activas" con 2+1+2: incoherente con "activas" (las "al día" no son activas); usar un total coherente.
- **H-BP2-6. Estado activo solo por relleno lima.** `ui_maqueta_v2.html:39,53` y blueprint §2.4 L124: pestaña y enlace activos se distinguen del inactivo por lima (1.25:1 contra el marco) y un salto de peso 500 -> 600. WCAG 1.4.11 y 1.4.1. Corrección: añadir borde o subrayado de 2 px `primary` (8.5:1 o más) al activo, p. ej. `box-shadow: inset 0 -3px 0 var(--primary)`, y reflejarlo en §2.4 y §2.6.
- **H-BP2-7. Formato de la tabla de peso.** `ui_maqueta_v2.html:252-255` y blueprint §4.5 L353 no fijan unidad ni signo. `view-model.ts:131,135` produce "32.85 kg" y "−0.45 kg" (U+2212) y las pruebas dependen de ello. Corrección: documentar "valor con ` kg`" y signo U+2212 en la tabla y en la maqueta.

**BAJA**

- **H-BP2-8. Maqueta frente al contrato.** (a) `L188` y `L81` pintan color de dueño y aro `owner-1` en "Mis mascotas", donde `colorToken` es nulo (`architecture_spec.md:178,242`): debe ser texto "Dueño: Ana" sin color y `data-owner-badge="none"`. (b) `L137`: faltan `data-household-count`, `data-pending-invitations` y las palabras visibles "hogares"/"invitaciones" (`architecture_spec.md:139`). (c) `.flag` a 11 px (`L72`) frente a mínimo de blueprint 12 px (`text-xs`).
- **H-BP2-9. Omisiones menores del blueprint.** (a) Regla "Nueva mascota solo en 'Mis mascotas'" (`architecture_spec.md:200`) no escrita. (b) "Cancelar" del modo EDIT (`auth-pet-forms.spec.ts:65`) no escrito. (c) Etiqueta literal "Nombre de la mascota" del campo de confirmación (`pet-dashboard.spec.ts:48`; `PetDashboard.tsx:149`) ausente de §8.E. (d) Opción "Sin hogar base" de §4.6 sin respaldo literal en el contrato.
- **H-BP2-10. Datos de muestra incoherentes (maqueta).** Edad "4 años, 2 meses" con nacimiento 2019-03-02 (`L186,L211`; serían 7 años, 8 meses a 2026-11-14). `aria-label` del gráfico dice "mínimo 26.10" (`L240`) pero la tabla tiene 26.90 como mínimo. La línea del gráfico (`L242`) no sigue los datos (26.90 queda más alto que 27.30). Textos "1 próxima" (singular) frente al literal plural de las pruebas.
- **H-BP2-11. Higiene documental del blueprint.** `ui_blueprint.md:159` cita "cabecera-marco (lima sobre oliva)", pero la cabecera ya no es oliva en v2.0. `:146` y `:580` citan "59 pares de v1.1" que no se enumeran; no pude verificarlos uno a uno, solo los que aparecen en v2.0 (todos verificados). Hay que enumerarlos en un anexo o archivarlos en `claude/archivo/`.

## Límites declarados

1. **axe-core y E2E NO se ejecutaron sobre la implementación ni sobre un build real.** Como diligencia propia, Oracle corrió axe-core (wcag2a/aa, 21a/aa) únicamente sobre la maqueta estática a 5 anchos; resultado: 1 violación crítica (H-BP2-2), nada más. Eso no equivale a la compuerta E2E del repo y no valida el blueprint.
2. La maqueta cubre solo `/` con el módulo Peso y datos de ejemplo. Login, registro, hogares, respaldo, diálogos `alertdialog`, formularios, semáforo y estados vacíos/error solo existen como texto en el blueprint. No hay evidencia visual de su contraste en pantalla.
3. Contraste calculado por fórmula sobre los valores declarados; no se midieron píxeles renderizados ni estados hover/disabled (`opacity:.6`).
4. No se ejecutó Vitest ni Playwright. Los riesgos E2E se infieren por lectura de `tests/e2e/**` y `view-model.ts`. `rebanada6-recorridos.spec.ts` está sin commitear.
5. No se verificó si `tests/unit/presentation/components.spec.ts` pasa hoy (B-11 del contrato indica fixtures rotos).

## Rebote y siguiente paso

Devolver a Sati con H-BP2-1 a H-BP2-3 como obligatorios y H-BP2-4 a H-BP2-7 como recomendados antes de Keymaker (H-BP2-4 requiere decisión de Neo). Tras la enmienda, Oracle reaudita solo esos puntos (un único rebote). Ningún agente puede marcar COMPLETED ni aprobar el blueprint: eso queda para Neo.
