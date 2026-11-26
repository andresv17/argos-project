# Sati — T1544 Bloque G (#62) álbum del hogar — accesibilidad y diseño (2026-11-25)

Veredicto: **PASS CON OBS** (sin hallazgos bloqueantes; 4 observaciones, 2 de ellas WCAG AA menores).
Método: API y SPA reales en puertos aparte (3200/5273, base SQLite nueva), hogar "Casa Sati" con 2 mascotas (Nube, Atlas) con 3 fotos PNG 800x600 cada una; total de Nube simulado a 30 con `page.route` para exhibir «Ver más». axe-core (wcag2a/aa, 21a/aa, 22aa) + medidas DOM + Tab real. Sin editar código ni specs (script y capturas en scratchpad).

## Medidas
| Ancho | scrollWidth / clientWidth | axe | Miniatura mostrada |
|---|---|---|---|
| 320 | 320 / 320 | 0 violaciones | 102x102 |
| 1024 | 1024 / 1024 | 0 | 134x134 |
| 1280 | 1280 / 1280 | 0 | 176x176 |

- Encabezados: h1 Hogares > h2 Casa Sati > h3 «Álbum» (sr-only) > h4 «Álbum de Atlas» / «Álbum de Nube». Sin saltos; orden alfabético correcto.
- Cada mascota es `region` con nombre único («Álbum de X»); la lista externa se llama «Álbum de Casa Sati».
- Botón: nombre accesible «Ver más fotos de Nube» (único por mascota; contiene el texto visible «Ver más fotos», 2.5.3 OK en reposo); alto 48 px, ancho 135 px (2.5.8 OK).
- Alt: «Foto 1 de 30 de Nube, subida el 26 nov 2026» (útil, único, con mascota y fecha). Placeholder sin URL: `aria-hidden`.
- Foco: anillo `box-shadow` blanco 2 px + terracota #C4552D 2 px (outline transparente para forced-colors); contraste del anillo sobre blanco ~4,6:1 (OK 2.4.7/1.4.11). Orden de tabulación lógico (panel > botón).

## Hallazgos
- **OBS-1 (WCAG 2.4.3 / 3.2.2, medio)**: tras «Ver más fotos» el foco se pierde: tras la carga `document.activeElement` pasó a `BODY` (medido). El botón se deshabilita durante la carga y desaparece al completarse el álbum; no se devuelve el foco (p. ej. a la primera foto nueva o al encabezado de la mascota). Usuarios de teclado y lector vuelven al inicio de la página.
- **OBS-2 (WCAG 4.1.3, medio)**: no hay `role=status`/`aria-live` para el progreso: durante «Cargando…» y al terminar, las regiones vivas medidas estaban vacías (`[]`). El contador «3 de 30 fotos» no es región viva. Un lector de pantalla no sabe que llegaron N fotos más. Falta un `role="status"` (visualmente discreto) con «Cargadas 27 de 30 fotos de Nube». El «Cargando fotos…» inicial sí tiene `role=status` (OK).
- **OBS-3 (WCAG 2.5.3 Label in Name, bajo)**: con `loadingMore` el texto visible pasa a «Cargando…» pero el `aria-label` sigue «Ver más fotos de X»; nombre sin el texto visible (control deshabilitado, riesgo bajo). Mejor `aria-disabled` + `aria-label` condicional.
- **OBS-4 (rendimiento/diseño, bajo)**: se carga la imagen completa (naturalWidth 800 para una celda de 102–176 px; el propio componente documenta «sin miniaturas»). Con 24 fotos por mascota, `loading=lazy`, es aceptable para solo lectura, pero conviene miniatura bajo demanda (existe `photo-thumbnail.ts` del Bloque F). No incumple WCAG.
- **Nota fuera del alcance del álbum**: a 320 px la tira de pestañas del hogar queda recortada («Masc…»), con desplazamiento interno; el documento no desborda (1.4.10 OK a nivel de página), pero la pestaña activa «Álbum» puede quedar fuera de vista; revisar `HouseholdTabs` (scroll-into-view de la activa).
- Limitaciones: «Ver más» probado con total simulado (la API limita 10 fotos/mascota); no se probó lector de pantalla real (se usó el árbol de accesibilidad de Playwright); contraste del texto slate sobre meadow no medido salvo por axe (0 violaciones).

## Re-chequeo tras corrección de /keymaker (2026-11-25)

Método: igual que la medición anterior (API 3200 / SPA 5273, base SQLite nueva, hogar «Casa Sati», Nube y Atlas con 3 fotos). Total simulado a 30 en ambas con `page.route`; la página 2 se retrasa 1,2 s; para Nube devuelve 3 fotos nuevas (ids simulados) y para Atlas ninguna (cubre el caso «sin fotos nuevas»). Sin editar código ni specs.

| Obs | Medida | Veredicto |
|---|---|---|
| OBS-1 (2.4.3) | Nube: tras la carga `document.activeElement` = `LI` índice 3 de la lista de Nube, es decir la primera foto nueva (antes `BODY`). Atlas (sin fotos nuevas): `H4` «Álbum de Atlas». Nunca queda en `BODY` al terminar. | **CERRADO** |
| OBS-2 (4.1.3) | `role=status` por mascota: tras la carga de Nube pasa a «6 de 30 fotos de Nube» (antes 3 de 30); Atlas queda en «3 de 30 fotos de Atlas», sin cambio porque no llegaron fotos. Antes del arreglo las regiones vivas estaban vacías. | **CERRADO** |
| OBS-3 (2.5.3) | Durante la carga el nombre accesible es «Cargando fotos de Nube» / «Cargando fotos de Atlas», con texto visible «Cargando…» y `disabled`; en reposo vuelve a «Ver más fotos de X». | **CERRADO** |

Reflow y axe (wcag2a/aa, 21a/aa, 22aa), con el álbum recién cargado:
| Ancho | scrollWidth / clientWidth | axe |
|---|---|---|
| 320 | 320 / 320 | 0 |
| 1024 | 1024 / 1024 | 0 |
| 1280 | 1280 / 1280 | 0 |
Axe tras las dos cargas de «Ver más»: 0 violaciones.

Observación residual (informativa, no bloqueante): durante la carga (≈300 ms medidos) el foco pasa a `BODY` porque el botón se deshabilita mientras tiene el foco. Se corrige solo al terminar (primera foto nueva o encabezado). Si se quisiera evitarlo, usar `aria-disabled` en lugar de `disabled`. OBS-4 (miniaturas) y la nota de la tira de pestañas a 320 px no se re-midieron: fuera del alcance de esta misión.
Limitaciones: ids de fotos nuevas simulados (la URL firmada de esas fotos no se resuelve, solo importa el foco y el texto); sin lector de pantalla real.
