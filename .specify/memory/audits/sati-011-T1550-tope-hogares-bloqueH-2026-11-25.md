# Sati — T1550 Bloque H (#74) aviso de tope de hogares — 2026-11-25

Veredicto: **FAIL** (1 hallazgo MEDIA que incumple el criterio pedido; 3 OBS). Sin código ni specs tocados.

Método: API real (3200) + SPA Vite (5273) con SQLite nueva; Playwright Chromium + axe-core (wcag2a, wcag2aa, wcag21a, wcag21aa, wcag22aa). Usuarios: cinco.sati (5 hogares ACTIVE + 1 invitación), cuatro.sati (4 hogares + 2 invitaciones), cuatrob.sati (4 + 1), cuatroc.sati (4 + 2). Capturas y guiones en el scratchpad de la sesión.

## Medidas
| Estado | 320 sw/cw | 1024 sw/cw | 1280 sw/cw | axe violaciones (22aa) |
|---|---|---|---|---|
| 5 hogares | 320/320 | 1024/1024 | 1280/1280 | 0 / 0 / 0 |
| 4 hogares (normal) | 320/320 | 1024/1024 | 1280/1280 | 0 / 0 / 0 |
Aviso a 320 px: 2 filas de texto envueltas (h=100 px), borde derecho 270 px (< 320). Botones 94x48 y 121x48 px (objetivo >= 24x24, WCAG 2.5.8 OK). Contraste del aviso: rgb(30,41,59) 14 px/600 sobre blanco (~14:1). axe "incomplete" (color-contrast, duplicate-id-aria) son del encabezado/pestañas existentes, no del aviso.

## Lo que cumple
- Aviso `role="status"` en ambas superficies (invitaciones y crear hogar); aparece solo con >= 5 hogares cargados; con 4 no hay aviso y los botones están habilitados.
- Texto: «Ya perteneces al máximo de hogares permitido. Sal de alguno de tus hogares antes de crear otro o de aceptar una invitación.» Sin cifras ni nombres ajenos (REQ-HOG11-004).
- El aviso es texto visible, no solo color/opacidad; se lee en el orden del DOM junto a los botones (snapshot de accesibilidad: `status` dentro del formulario, antes del botón).
- «Rechazar» sigue habilitado con el tope alcanzado.

## Hallazgos
**S-1 (MEDIA, WCAG 1.3.1 / 3.3.2 / 4.1.2; incumple el criterio de la misión): los botones deshabilitados NO tienen motivo accesible.** `HouseholdsPage.tsx` líneas 81 y 521 pasan `aria-describedby`, pero el componente `Button` (`components/Field.tsx:213`) solo reconoce la propiedad `describedBy` y descarta cualquier otra. Medido en DOM: `aria-describedby = null` en «Aceptar» y «Crear hogar» con 5 hogares; el árbol de accesibilidad muestra `button "Crear hogar" [disabled]` sin descripción. TypeScript no lo detecta (los atributos con guion no se tipan). Corrección propuesta (Keymaker): usar `describedBy={atLimit ? 'invitations-limit-notice' : undefined}` y `describedBy={... 'household-limit-notice' ...}`; además un test que afirme el atributo en el DOM (el test actual no lo detectó).

**S-2 (MEDIA, WCAG 2.4.3 / 3.2.2): el foco se pierde a `BODY` y no se recupera.** Tres escenarios medidos (8 muestreos de 150 ms, siempre `BODY`):
 a) usuario con 4 hogares, foco en «Crear hogar», Enter -> crea el 5.º -> el botón queda `disabled` -> `activeElement = BODY`.
 b) 4 hogares, una invitación, foco en «Aceptar» -> acepta -> botón desaparece/queda deshabilitado -> `BODY`.
 c) 4 hogares, dos invitaciones, foco en «Aceptar» -> acepta una -> el otro «Aceptar» queda deshabilitado -> `BODY`.
Al perder el foco, el usuario de teclado vuelve al inicio de la página (el siguiente Tab cae en «Saltar al contenido») y el lector de pantalla no recibe contexto. Propuesta: tras la acción, llevar el foco al aviso (con `tabIndex={-1}`) o al campo «Nombre del nuevo hogar»/primer elemento válido, siguiendo el patrón usado en Bloque F/G (S-1 de T1538).

**OBS-1 (BAJA): doble aviso.** Con invitaciones y tope, hay dos `role="status"` con el mismo texto (3 regiones `status` en DOM con 5 hogares). Un lector de pantalla puede leerlo dos veces. Aceptable, pero considerar un único aviso o texto distinto en cada superficie.

**OBS-2 (BAJA): anuncio dinámico poco fiable.** Al pasar de 4 a 5 en la misma sesión, el `<p role="status">` se inserta ya con contenido; muchos lectores no anuncian regiones insertadas con el texto. Para el aviso que aparece tras crear, conviene renderizar el contenedor `role="status"` siempre (vacío) y rellenarlo, o resolverlo con el foco de S-2. Verificado solo por DOM, sin lector de pantalla real.

**OBS-3 (BAJA, fuera de alcance): navegación.** El enlace «Hogares» expone nombre accesible con texto repetido («Hogares55 hogareshogares11 inv...»); axe lo marca como `incomplete` (duplicate-id-aria sobre `.text-xl`). No es de T1550.

## Verificación
axe 0 violaciones en todos los anchos/estados; reflow sin desborde; S-1 y S-2 se corrigen con cambios mínimos y exigen re-verificación en navegador.

## Correcciones de /keymaker (2026-11-25)
- S-1 corregida: `HouseholdsPage.tsx` pasa `describedBy` (no `aria-describedby`) a «Crear hogar» y «Aceptar»; firma de `Button` intacta. Prueba DOM en `tests/unit/presentation/t1550-a11y-tope-hogares-011.spec.ts`.
- S-2 corregida: `limitFocusTarget` (puro, `household-limit.ts`) decide el destino; la página enfoca el aviso (`tabIndex=-1`) o el encabezado de invitaciones tras la acción que alcanza el tope. `applyDialogFocus` de la 006 sin cambios.
- OBS-1 corregida: el aviso de invitaciones ya no lleva `role="status"` (queda uno solo, el del formulario).
- OBS-2 DEUDA: el aviso se inserta ya con contenido, por lo que algunos lectores no lo anuncian; pendiente de regla de región viva persistente.
- OBS-3 DEUDA: nav «Hogares» fuera de alcance; no tocado.

## Re-auditoría tras corrección de /keymaker (2026-11-25)
Veredicto: **S-1 CERRADO, S-2 CERRADO, OBS-1 CERRADO.** Sin código ni specs tocados.

Método: API real (3200) + SPA Vite (5273, proxy a 3200) con SQLite nueva; Playwright Chromium + CDP `Accessibility.getFullAXTree` + axe-core (wcag2a, wcag2aa, wcag21a, wcag21aa, wcag22aa). Usuarios: cinco.sati (5 hogares + 1 invitación), cuatro.sati (4 + 2 invitaciones), cuatrob.sati (4 + 1), cuatroc.sati (4 + 2). El servidor de 5173 preexistente no se tocó; mis procesos 3200/5273 se detuvieron al terminar.

| Criterio | Medida | Veredicto |
|---|---|---|
| S-1 | Con 5 hogares «Crear hogar» tiene `aria-describedby="household-limit-notice"` y «Aceptar» `="invitations-limit-notice"`; ambos ids existen y su texto es el aviso. Árbol de accesibilidad (CDP): ambos botones `disabled` con `description` = «Ya perteneces al máximo de hogares permitido…». Con 4 hogares `aria-describedby = null` y botones habilitados. | CERRADO |
| S-2 a | 4 hogares, foco en «Crear hogar», Enter crea el 5.º: `activeElement` = `P#household-limit-notice` en las 8 muestras (150 ms), nunca BODY. | CERRADO |
| S-2 b | 4 hogares + 1 invitación, foco en «Aceptar»: tras aceptar, `H2#invitations-title` («Invitaciones (0 …)») en las 8 muestras. | CERRADO |
| S-2 c | 4 hogares + 2 invitaciones, foco en «Aceptar»: tras aceptar una, `P#invitations-limit-notice` en las 8 muestras; el otro «Aceptar» queda disabled con describedby. | CERRADO |
| OBS-1 | Con invitaciones y tope coinciden: un solo `role=status` con el texto del tope (`#household-limit-notice`); `#invitations-limit-notice` sin role. El otro `role=status` del DOM es `invite-…-status`, vacío y ajeno al tope. | CERRADO |

Reflow (scrollWidth / clientWidth) y axe (violaciones, 22aa) en 5 hogares, 4 hogares con 2 invitaciones y 4 hogares con 1: 320 = 320/320, 1024 = 1024/1024, 1280 = 1280/1280; 0 violaciones en todas las combinaciones. `incomplete` (color-contrast, duplicate-id-aria) idénticos a la acta original (encabezado/nav, no del aviso). Contraste del aviso rgb(30,41,59) 14 px/600 sobre blanco (~14:1).

Residuales (sin cambio, ya registrados): OBS-2 región viva insertada con contenido (mitigada por mover el foco al aviso); OBS-3 nombre accesible del enlace «Hogares» repetido, fuera de alcance. Capturas y guiones en el scratchpad de la sesión (`.../scratchpad/re/`).
