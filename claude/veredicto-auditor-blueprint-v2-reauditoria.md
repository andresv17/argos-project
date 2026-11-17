# Veredicto Oracle (reauditoría única, MAX_RETRY = 1): ui_blueprint.md v2.1 + ui_maqueta_v2.html + ui_maqueta_cuenta.html (2026-11-14)

- **Auditora:** Oracle (SDD Auditor). Solo lectura sobre `src/`, `tests/`, `specs/`, contratos y `logos.json` (intactos). Único escrito: este veredicto, el log y el bus.
- **Método:** lectura línea a línea de `ui_blueprint.md` (705 líneas) y de ambas maquetas; contraste por script propio de luminancia relativa WCAG 2.1 (scratchpad `c.py`, 41 pares); Chromium + axe-core 4.x servidos por `python3 -m http.server` (scratchpad `b.cjs`, `d.cjs`) a 320, 639, 640, 768, 1024 y 1280 px sobre las dos maquetas; contraste de `identity.schema.json` y `pet-tracker-api.openapi.yaml` por lectura. Nada de lo declarado por Sati se aceptó sin recalcular.

## VEREDICTO: APTO CONDICIONADO

Los 7 hallazgos reauditados (H-BP2-1, 2, 3, 5, 6, 7 y la decisión H-BP2-4) quedan corregidos y verificados en disco y en DOM. Las 5 compuertas cumplen. Queda **un solo punto que no puedo cerrar yo y se eleva a Neo (Nivel 2)**: la forma del enlace "Perfil" en la cabecera (H-BP2-12). No pido otro rebote. El blueprint puede pasar a Keymaker en cuanto Neo responda ese punto; ninguna otra corrección bloquea.

## Tabla por punto

| Punto | Resultado | Evidencia |
|---|---|---|
| H-BP2-1 datos de tarjeta en el riel | CUMPLE | Blueprint §4.2 L306-317 (6 líneas: nombre, "Especie · edad", "N.NN kg", **"Alertas: N vencidas · M próximas"** literal con ambos números, "Dueño: nombre" sin color en Mis mascotas y píldora `owner-N` en hogar), §8.E L626. DOM (3 opciones, 320/768/1024): `AR \| Argos \| Perro · 7 años, 8 meses \| 28.40 kg \| Alertas: 2 vencidas · 1 próximas \| Dueño: Ana`. Al pulsar "Casa Pérez": `data-owner-badge` pasa de `none` a `OWNER_COLOR_1`, fondo `rgb(29,78,216)` y texto blanco. En Mis mascotas fondo transparente, `data-owner-badge="none"`. Cubre `pet-dashboard.spec.ts:112` y `components.spec.ts:29` en texto |
| H-BP2-2 ids y landmark | CUMPLE | 0 ids duplicados en ambas maquetas en 6 anchos. `<main id="main-content">` (sin `role`; 1 solo `main`) contiene `<div id="pet-panel" role="tabpanel">`; `getElementById('pet-panel')` existe y `main.contains(pet-panel) = true`; `aria-labelledby` pasa de `context-tab-mine` a `context-tab-casa` al cambiar. Blueprint §3.1 L204-211, §8.B L598. axe-core (wcag2a/aa, 21a/aa): **0 violaciones** en las 2 maquetas a 320, 768, 1024 y 1280 (la crítica `aria-valid-attr-value` del veredicto anterior ya no aparece) |
| H-BP2-3 D2 sin autocierre | CUMPLE (documento) | Blueprint §4.5 L389-392: `open` es estado local, se inicializa una sola vez al montar a `registros === 0`, no se recalcula tras guardar, ni al cambiar registros, ni al cambiar de pestaña; escenario obligatorio "guardar 3 veces seguidas sin pulsar `summary`" y regla inversa (con registros arranca cerrado y exige clic). Maqueta: `details.rec` cerrado (módulo con 4 registros) con comentario D2 (L254-255). La lógica de estado es de implementación; Keymaker debe probar el escenario |
| H-BP2-5 excepciones D3 | CUMPLE | §4.4 L356-364 tabla de excepciones con cita ("ratificada por Neo el 2026-11-14", `architecture_spec.md:170,414` B-8): `totalActiveAlerts`, `upToDateCount`, botón "Registrar peso". Cifra coherente: total = vencidas + próximas = 2 + 1 = "3 alertas activas"; "2 al día" aparte. Maqueta L228-236 coincide (3 / 2 / 1 / 2). Encabezado L9 y §9 L649 listan las excepciones |
| H-BP2-6 indicador no cromático 2 px | CUMPLE | Blueprint §2.4 L133, §2.6 L169-170. Maqueta CSS L48-49 (`::after` 2 px `#1d4f3a`); computedStyle: enlace activo `2px rgb(29,79,58)`, pestaña activa `2px`. Contraste calculado: indicador/lima 7.32; indicador/marco 70 % (`#f9fcff`, `#f8fbf9`, `#fcfdfa`) 9.14 / 9.03 / 9.22; marco 90 % 9.32 / 9.29 / 9.32. Mínimo 3:1 |
| H-BP2-7 formato de peso | CUMPLE | §4.5 L401 y §8.E L626: "valor + espacio + kg", 2 decimales, "+0.30 kg", signo U+2212 "−0.40 kg". Maqueta tabla: `28.40 kg`, `+0.30 kg`, `−0.40 kg` (U+2212 verificado en el HTML), "—" sin variación. Coincide con `view-model.ts:131,135` según mi lectura previa. Además corregidos H-BP2-10: gráfico `aria-label` mínimo 26.90 / máximo 28.40 igual al de la tabla; polilínea recalculada (y=142.7 / 180 / 68 / 40) proporcional a 27.30 / 26.90 / 28.10 / 28.40 |
| H-BP2-4 Opción A (decisión de Neo) | REFLEJADA | §1 fila 6 L44, §4 L238, §4.2 L304, §4.8 L456-460, §8.G, §9 L657. Riel `flex` (DOM: `display:flex`, `row` a 320 y 768, `column` a 1024). No se reabre. Aviso: `rebanada6-recorridos.spec.ts:84-86` sigue en conflicto; la enmienda es de Keymaker (declarado) |
| 768 px (REQ-UI2-008) | CUMPLE | §4 L238 y §8.G L637, §9 L651-652 citan `specs/002-plataforma-v21/spec.md:270` ("320, 768, 1024 y 1280"), línea que verifiqué. En 768: `scrollWidth == innerWidth` en las 2 maquetas, riel en fila, 1 "Nueva mascota", 1 blur |
| Perfil en cabecera | **ELEVADO A NEO** | Ver H-BP2-12 |
| §5.4 `/cuenta` y maqueta | CUMPLE con observaciones bajas | Ver tabla de trazabilidad abajo. Sin Dead UI ni métricas |
| 320 px: tabla de peso | CUMPLE la regla del blueprint | Ver apartado |
| Asterisco en línea propia (cuenta) | BAJA | Ver H-BP2-14 |

## Compuerta 1: cobertura de `/cuenta` frente al contrato 002

| Control o dato en blueprint §5.4 / `ui_maqueta_cuenta.html` | Respaldo en contrato | Estado |
|---|---|---|
| "Usuario: ana" solo lectura | `UserSelfProfile.username` (identity.schema.json) | OK |
| Nombre visible* (`displayName`), Correo (`email`, `type=email`), Idioma (`preferredLanguage`: es/en/pt), Zona horaria (`timezone`); botón Guardar | `UpdateProfileInput` (cerrado, `minProperties:1`), `PATCH /account/profile` (openapi L142) | OK. Los campos del formulario son exactamente los 4 de `UpdateProfileInput` |
| Contraseña actual*, Contraseña nueva* (`password-<campo>`); texto "Las demás sesiones se cierran; esta se conserva." | `ChangePasswordInput` (2 campos), `POST /account/password` (L120); REQ-AUTH2-003 | OK. No hay campo de confirmación (correcto: no existe en el esquema) |
| Descargar respaldo (paso 1) | `POST /backup/export` (L196), token efímero 10 min en cabecera `X-Argos-Confirmation-Token`; REQ-ACC-002 | OK |
| ELIMINAR MI CUENTA* (`confirmationPhrase`), Contraseña actual* (`password`), "Eliminar mi cuenta" deshabilitado hasta tener el token | `DeleteAccountInput` (`confirmationPhrase` const, `password`, `backupConfirmationToken`), `POST /account/deletion` (L166) | OK. El token no es campo visible (es de memoria, correcto) |
| Errores `ERR-ACCOUNT-OWNS-SHARED-HOUSEHOLD`, `...-PETS`, `...-CONFIRMATION-MISMATCH` | `x-sdd-error-order` del endpoint | OK |
| Texto de la zona de peligro (maqueta): "Se eliminan tu cuenta, tus mascotas con todos sus registros, tus asignaciones, membresías, invitaciones y sesiones" | REQ-ACC-002 y trazabilidad de borrado (spec.md:198, 249) | OK, derivado del contrato; no es métrica |
| Controles totales de `<main>` (Chromium): 4 campos, Guardar, 2 campos, Cambiar contraseña, Descargar respaldo, 2 campos, Eliminar mi cuenta | Cada uno con endpoint | **0 controles sin endpoint** |
| Excluidos explícitamente (L502): cuentas vinculadas, foto de perfil, recuperación por correo, tema oscuro, cambio de usuario, verificación de correo | No existen en contrato | OK; ninguno pintado |

Métricas inventadas: ninguna (ni en v2 ni en cuenta). En la maqueta de v2 siguen ausentes Mood, Water, Activity, Smart Care, Tips, Upgrade, campana y variación %.

## Compuerta 2: contraste (script, WCAG 2.1 AA; 41 pares, 1 "falla" explicado)

| Par nuevo o modificado | Ratio | Mínimo | Estado |
|---|---|---|---|
| Indicador 2 px `#1d4f3a` / lima `#c5f35a` | 7.32 | 3 | OK |
| Indicador / marco 70 % (3 fondos) y 90 % (3 fondos) | 9.03 a 9.32 | 3 | OK |
| Texto de enlace oliva / marco 70 % y 90 % | 9.03 a 9.32 | 4.5 | OK |
| Opción activa del riel: tinta `#0f172a` / `#e9fbc4` | 16.20 | 4.5 | OK |
| Opción activa: muted `#475569` / `#e9fbc4` | 6.88 | 4.5 | OK |
| Opción activa: borde `#1d4f3a` / `#e9fbc4` y / blanco | 8.54 / 9.41 | 3 | OK |
| "Dueño: nombre" sin color `#1e293b` / blanco y / `#e9fbc4` (insignia de dueño sin color) | 14.63 / 13.28 | 4.5 | OK |
| Insignia de dueño con color, blanco / `owner-1`, `owner-2` | 6.70 / 5.48 | 4.5 | OK |
| Línea "Alertas" roja / ámbar / neutra | 8.20 / 8.15 / 13.35 | 4.5 | OK |
| Zona de peligro: texto `#7f1d1d` / `#fef2f2` | 9.16 | 4.5 | OK |
| Zona de peligro: texto de paso `#0f172a` / `#fef2f2` | 16.32 | 4.5 | OK |
| Zona de peligro: borde `#b91c1c` / `#fef2f2` y / marco | 5.91 / 6.28 | 3 | OK |
| Botón de peligro blanco / `#b91c1c` | 6.47 | 4.5 | OK |
| Botón de peligro **deshabilitado** (`opacity .6`) | 3.24 | n/a | **Exento por WCAG 1.4.3** (componente inactivo); no cuenta como fallo. Nota: el mismo criterio ya vale para `disabled:opacity-60` en el resto del blueprint |
| Pares heredados de v2.0 (texto, muted, owner-1..8, semáforo, error) | sin cambio | | OK según mi veredicto anterior |

Los valores del blueprint §2.6 coinciden con los míos (L159-178); el blueprint usa `#f3f7f5` como marco "peor caso", más conservador que los reales (`#f8fbf9` a `#fcfdfa`).

## Compuerta 3: blur (Chromium, `getComputedStyle`)

| Ancho | v2 | cuenta |
|---|---|---|
| 320 | 0 | 0 |
| 639 | 0 | 0 |
| 640 | 1 | 1 |
| 768 | 1 | 1 |
| 1024 | 1 | 1 |
| 1280 | 1 | 1 |

Máximo 1 a >= 640 y 0 a < 640. CUMPLE. Sin scroll horizontal de página en ninguno de los 12 casos (`scrollWidth == innerWidth`).

## Compuerta 4: no regresión Playwright (solo lo cambiado)

- Un único `button` "Nueva mascota": 1 en v2 a 6 anchos; 0 en cuenta (correcto). El botón va fuera del `ul[role=listbox]`.
- Formularios accesibles en DOM sin autocierre: blueprint §4.5 define el estado y el escenario de 3 guardados. Maqueta con `details` cerrado por tener registros (coherente con la regla).
- "Guardar" único en la ficha de v2; "Registrar peso" aparece como botón de la tarjeta oliva y como `summary` (el `summary` no es `button` para `getByRole`, y ningún test en `tests/e2e/**` usa `getByRole('button', {name: 'Registrar peso'})`: verificado por grep). Riesgo bajo, que Keymaker revise al implementar.
- Enlaces: los tests usan `link {name: 'Mascotas'|'Respaldo'|/Mascotas/}`; el cuarto enlace "Perfil" no choca con ninguno. `rebanada6-recorridos.spec.ts:93` solo exige la navegación visible.
- Conflicto conocido ya decidido: `rebanada6-recorridos.spec.ts:84-86` (grilla) por la Opción A. No se ejecutó Playwright del repo (no hay implementación v2).

## Compuerta 5: UI muerta y métricas inventadas

Sin hallazgos nuevos. Todo control de `/cuenta` tiene endpoint. Único control nuevo de presentación en v2.1 fuera de contrato: el botón "Registrar peso" de la tarjeta oliva, ya declarado y citado como D3 (H-BP2-5), y el enlace "Perfil" (H-BP2-12).

## Límite conocido de Sati: tabla de peso a 320 px

Medido: región `role="region" tabindex="0"` de 220 px de ancho útil con tabla de 313 px (Sati declaró 272 px; con el CSS entregado mido 313 px por `white-space:nowrap` en las 4 columnas). `scrollWidth` de la página = 320 px = `innerWidth`: la página no desborda. La regla del blueprint (§8.G L637: "sin scroll horizontal de página; tablas en región desplazable") **se cumple**: no es fallo de página. La región es alcanzable por teclado (`tabindex=0`, `aria-label`), y axe no reporta nada (`scrollable-region-focusable` limpia). Sugerencia opcional (no bloquea): ocultar la columna "Variación (%)" (siempre "—") o permitir salto de línea en la cabecera para reducir el scroll.

## Hallazgos (por severidad)

**ALTA / BLOQUEANTE:** ninguno.

**MEDIA (se eleva a Neo; condición del APTO)**

- **H-BP2-12. Enlace "Perfil" en la cabecera, forma sin ratificación explícita de Neo.**
  - **Respaldo que sí existe:** REQ-UI2-001 (`specs/002-plataforma-v21/spec.md:263`) exige que "Perfil" exista y lleve a `/cuenta`; REQ-UI2-004 (`:266`) y T290 (`tasks.md:249`) crean `/cuenta`. `architecture_spec.md:57` solo dice que `/cuenta` no existe **hoy** (inventario descriptivo; no declara una prohibición literal de controles y su pie L422 se limita a no proponer cambios por sí mismo). Por tanto **no es un control inventado**: tiene destino y spec.
  - **Lo que no tiene respaldo:** la spec pide en escritorio (>= 768 px) "menú del avatar con «Perfil» y «Cerrar sesión»" y en móvil "barra inferior con Mascotas, Hogares, Respaldo y Perfil" (también T287, `tasks.md:243`). El blueprint (§3.2 L226, §4 L240, Apéndice A L685) sustituye ambos por un cuarto enlace directo en la cabecera y afirma "se ratifica ... (decisión 7)". La decisión 7 de Neo (§1 L45) ratifica el **descarte de la barra inferior** y el ancho 768; **no** menciona reemplazar el menú de avatar por un enlace directo. Es un ajuste de REQ-UI2-001 que solo Neo (o `/architect` por enmienda de spec) puede autorizar.
  - **Corrección:** o bien (a) Neo confirma que el enlace directo reemplaza el menú de avatar (y se enmienda REQ-UI2-001/T287 en la spec, o se deja como excepción documentada), o (b) se deja el menú de avatar como pide la spec. Hasta que Neo responda, Keymaker no debe implementar la cabecera.
  - **Atenuantes (por eso no bloquea el APTO):** el enlace es de bajo riesgo, no añade endpoint ni métrica, no choca con tests E2E (verificado), y el contraste y foco cumplen.

**BAJA**

- **H-BP2-13. Apéndice A desactualizado.** `ui_blueprint.md:672` sigue listando "Cambio de contraseña, perfil y eliminación de cuenta (§3.7)" como excluido `[CONTRATO]`, "sin pantalla hoy", mientras §5.4 ya los define. Aclarar "excluido de las rutas existentes; ver §5.4" para no inducir a error a Keymaker. Corrección documental.
- **H-BP2-14. Asterisco de campo obligatorio en línea propia** (`ui_maqueta_cuenta.html`, etiquetas con `<span aria-hidden>*</span>` dentro de `label.field` que es `display:grid`). Medido a 320 y 768: el `span` está 21 px más abajo que el texto (501 vs 480; 345 vs 324) porque cada hijo del grid ocupa su fila. Clasificación **BAJA, cosmética**: el `*` es `aria-hidden`, no afecta a lectores ni a contraste. Corrección: envolver texto y asterisco en un solo `<span>` dentro del label, o usar `display:flex`. Misma causa existe en `ui_maqueta_v2.html` (formulario de peso, "Fecha *", "Peso (kg) *"); Keymaker debe renderizarlo en línea en la implementación real.
- **H-BP2-15. Menor texto de maqueta vs blueprint.** La maqueta dice "Usuario: ana (no editable)"; blueprint §5.4 dice "Usuario: {username}" en solo lectura. Es inocuo; alinear texto.
- **H-BP2-16. Texto mínimo de la ficha vs blueprint.** Sigue sin reabrirse H-BP2-9d ("Sin hogar base" sin respaldo literal): §4.6 L431 y §9 L663 ya lo declaran como pendiente de Neo (aceptado por cierre de rebote).

## Límites declarados

1. axe-core corrió solo sobre las maquetas estáticas (0 violaciones en 8 combinaciones); no equivale a la compuerta E2E del repo ni valida la implementación.
2. `/cuenta` solo cubre estructura y campos; estados de error, el flujo con token y el estado `disabled` real dependen de la implementación (blueprint §9 L664 lo admite).
3. Contraste calculado por fórmula sobre valores declarados y componentes de CSS; no se midieron píxeles renderizados ni estados hover.
4. No se ejecutó Vitest ni Playwright del repo. El conflicto `rebanada6-recorridos.spec.ts:84-86` queda anotado para Keymaker.
5. La maqueta de v2 alterna Mis mascotas y hogar con JS de demostración; la coherencia datos de ejemplo/contrato (edad 7 años, 8 meses con nacimiento 2019-03-02 a 2026-11-14) se verificó aritméticamente: coherente.

## Cierre

Un solo rebote consumido. No quedan hallazgos que justifiquen otro. Pasos: Neo decide H-BP2-12; con su respuesta, `/architect` enmienda REQ-UI2-001/T287 si se elige el enlace directo (no lo hago yo: es spec); `/morpheus` deriva a Keymaker. Ningún agente puede marcar COMPLETED ni aprobar el blueprint: eso queda para Neo.
