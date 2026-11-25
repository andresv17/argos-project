# Acta /sati — Tipografía propia «Tipi Display» v1.0.0 (2026-11-25, rama 010)

Insumo: `tipi-display-fuente.zip` (raíz, 82 733 bytes) extraído en el scratchpad (`/private/tmp/claude-501/-Users-andresvalejo-Documents-Tecnica-Proyecto-Argos/96548194-09d2-4d74-9788-eb0787e5f62c/scratchpad/tipi/`); nada tocado en src/, tests/ ni public/. Prototipo y capturas en `/private/tmp/claude-501/-Users-andresvalejo-Documents-Tecnica-Proyecto-Argos/96548194-09d2-4d74-9788-eb0787e5f62c/scratchpad/proto/` y `/private/tmp/claude-501/-Users-andresvalejo-Documents-Tecnica-Proyecto-Argos/96548194-09d2-4d74-9788-eb0787e5f62c/scratchpad/shots/`. fontTools 4.x instalado solo en un venv del scratchpad. Servidores propios detenidos.

Dictamen: **PASS CON OBS** (técnicamente integrable; 1 OBS MEDIA de glifo ¡, 1 BAJA de Á, 1 de licencia).

## 1. Formato
- Los 2 .woff2 tienen cabecera `wOF2`: 700 = 16 112 B, 800 = 16 464 B (similar al Nunito 800 actual, 16 520 B). Contienen 160 glifos, solo tablas `glyf/loca/cmap/hmtx/kern` (sin GSUB; no hay ligaduras ni alternos).
- Los .ttf (41 KB c/u) y los SVG son de respaldo/diseño: no se sirven. CSS 100 % local, sin CDN, sin dependencia nueva, sin cambio en CSP (mismo origen `/fonts/`, como Nunito/Inter).
- Solo hay pesos 700 y 800, sin cursiva ni 400/600.

## 2. Cobertura (cmap, fontTools)
Faltan 0 de: á é í ó ú ü ñ Á É Í Ó Ú Ü Ñ ¿ ¡ ª º « », 0-9, . , ; : ! ? ( ) - – — " ' “ ” ‘ ’ … / % € $ ° + = & @ #, A-Z, a-z. Dígitos tabulares (avance 725 u en los 10). En Chromium las 16 letras/signos españoles miden con la métrica propia (no caen en la tipografía de respaldo).

## 3. Contraste (WCAG 2.x, calculado)
| Par | Ratio | Uso |
|---|---|---|
| Bosque #1F3D36 / Crema #EFE8D8 y Crema / Bosque | 9.67 | AA y AAA texto normal |
| Bosque / blanco · sky #F7F3E8 · meadow #E8E6D5 | 11.80 · 10.65 · 9.39 | AA |
| Terracota #C4552D / blanco · Crema · sky · meadow | 4.48 · 3.67 · 4.04 · 3.57 | solo texto grande (>=24 px o 18.66 px negrita, umbral 3:1) o no textual; NO texto normal |
| Terracota / Bosque | 2.63 | FALLA incluso grande: prohibido |
Specimen: el titular Terracota 32 px/800 sobre blanco (4.48) cumple como texto grande. Sus rótulos de 12 px con `opacity .65` dan 4.13 (blanco) y 3.94 (sky) = **FALLA AA, solo del specimen**, no se copia al producto. Con el uso actual (h1 800 en Bosque sobre cielo/pradera) hay >= 9.39.
`font-display` no sustituye a Nunito en texto corrido: el snippet y el README lo limitan a wordmark, h1/h2 hero, h3 y cifras; el cuerpo queda en Inter 400/600. Hoy `font-display` en el código solo aparece en 5 titulares (LegalLayout, AuthPages, AdminPortal, AppShell, AboutPage h1), todos con `font-extrabold` (800); el 700 aún no se usa (no es necesario cargarlo hasta que haya consumidor).

## 4. Hallazgos de legibilidad (render a 96, 30 y 18.66 px)
- **OBS-1 (MEDIA)** «¡» es casi idéntico a «i»: bbox ¡ (91..221, -64..712) frente a i (94..244, -57..729). No desciende bajo la línea de base, así que «¡Hola!» se lee «iHola!» (también «¿» tiene su punto abajo y sí se distingue de «?»). Afecta WCAG 1.4.8/legibilidad cognitiva de textos con exclamación apertura. Pedir al diseñador bajar «¡» (~-200 u) o diferenciarlo; mientras tanto, no usar `font-display` en cadenas con «¡» (los 5 titulares actuales no la llevan).
- **OBS-2 (BAJA)** «Á/Ó…» con acento sobre «A» de postes cruzados: el acento choca con el vértice y «Á» parece «A tachada» a tamaños grandes. Legible. Hoy ningún titular comienza con Á.
- **OBS-3 (BAJA)** Metadatos sin licencia (name ID 13 vacío); el comentario actual de styles.css dice «licencia SIL OFL» para Nunito/Inter. Registrar la licencia de Tipi Display (propia de Neo) en el README del repo.
- **OBS-4 (INFO)** Cifras tabulares anchas (725 u) y «.» ancho: «1.234,56» se separa visualmente; aceptable en tarjetas de biometría, evitar en tablas densas.

## 5. Anchos (Chromium, script propio; pruebas con h1 «Acerca de Tipi» 30 px/800/-0.025em, y h1 largo de 56 caracteres)
| Ancho | scrollWidth = clientWidth | h1 «Acerca de Tipi» | h1 largo | Fuentes | Peticiones fallidas |
|---|---|---|---|---|---|
| 320 | 320 = 320 | 1 línea, 36 px alto | 5 líneas, 180 px, sin desborde | 700 y 800 loaded | 0 |
| 1024 | 1024 = 1024 | 1 línea | 2 líneas | loaded | 0 |
| 1280 | 1280 = 1280 | 1 línea | 2 líneas | loaded | 0 |
specimen-real.html también sin scroll H en los 3 anchos (titular 56 px baja de línea, sin desborde). Sin hallazgo de reflow (1.4.10).

## 6. Diff propuesto (NO aplicado)
Archivos: `public/fonts/tipi-display-latin-800-normal.woff2` (copiar; el 700 solo cuando exista consumidor).

`src/presentation/web/styles.css` y `src/presentation/admin/styles.css` (mismo bloque):
```diff
-/* Fuentes locales (woff2 del paquete de marca, licencia SIL OFL; sin CDN): Nunito 800 para el título de la app, Inter 400/600 para el texto. */
+/* Fuentes locales (woff2, sin CDN): Tipi Display 800 (propia, titulares), Inter 400/600 (licencia SIL OFL) para el texto. */
 @font-face {
-  font-family: 'Nunito';
+  font-family: 'Tipi Display';
   font-style: normal;
   font-weight: 800;
   font-display: swap;
-  src: url('/fonts/nunito-latin-800-normal.woff2') format('woff2');
+  src: url('/fonts/tipi-display-latin-800-normal.woff2') format('woff2');
 }
```
`tailwind.config.ts`:
```diff
-        display: ['Nunito', 'Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
+        display: ['"Tipi Display"', 'Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
```
Y retirar `public/fonts/nunito-latin-800-normal.woff2` solo tras confirmar que ningún test ni doc lo referencia (grep en tests/ sin coincidencias de «Nunito»; revisar `ui_blueprint.md` y specs 010). Si se añade el 700, duplicar el @font-face con `font-weight: 700` y `tipi-display-latin-700-normal.woff2`.
Verificación posterior: `npm run test:gate`, E2E wcag 320/1024/1280 y comprobar que el h1 de /acerca-de, AuthPages (text-4xl) y AppShell no desbordan.

## Recomendación
Adoptar solo en titulares (800) tras corregir «¡» con el diseñador o, si Neo acepta el riesgo, documentando que `font-display` no se use en cadenas con «¡». Terracota nunca en texto normal ni sobre Bosque. Sin [x], sin push.
