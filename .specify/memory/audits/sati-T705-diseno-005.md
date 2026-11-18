# T705 — Diseño de las pantallas nuevas de 005 (Sati)

Fecha: 2026-11-18 · Rama `005-album-archivos-clinicos` (HEAD 9627f32) · Estado: PROPUESTA para aprobación de Neo antes de que `/keymaker` implemente. Sin prototipo HTML (los wireframes de texto bastan; no se tocó `src/`, `specs/`, `contracts/` ni `tests/`).

Base: `spec.md` (REQ-ALB5-*, REQ-CLI5-*, REQ-CAN-*, REQ-VET-*, REQ-SUM-*, D5-01..D5-15), `tailwind.config.ts` y `styles.css` existentes (se reutilizan los tokens; **no se crea ningún token nuevo**), y los componentes actuales `PhotoAlbum.tsx` / `MediaPanel.tsx` / `AlbumPage.tsx`.

---

## 0. Hallazgos que condicionan el diseño (leer primero)

| Id | Hallazgo | Quién lo resuelve |
|---|---|---|
| **B-1 (bloqueante)** | La UI debe decir «7 de 10 fotos» y «Álbum completo», pero `maxPhotosPerPet` vive solo en servidor (`REQ-PRM-002`, y puede ser 12). Hoy ningún contrato de 005 lo expone (no existe `contracts/` en 005 aún; T706). Cablear «10» en la presentación sería lógica de negocio en UI y mentiría si el parámetro cambia. | `/architect` (T706): el listado `GET …/media?kind=PHOTO` devuelve `maxPhotosPerPet`, o el 409 lo trae como extensión RFC 9457. Mientras tanto el diseño degrada a «N fotos» sin denominador (§2.1, variante sin tope). |
| **B-2 (bloqueante)** | `REQ-VET-009` pide nombre original solo en la vista, pero `REQ-SUM-003` lo saca del `ClinicalSummary` y `REQ-VET-006` deja **una sola ruta** `GET /shared/{token}/summary`. Falta el canal por el que la vista recibe (a) el nombre y (b) la URL firmada de cada archivo. Además una URL firmada de TTL corto incrustada en el HTML caduca mientras el veterinario lee; y una URL a `storage.googleapis.com` choca con «no enlaza a terceros / sin recursos externos» y con la CSP. | `/architect` + `/trinity` (T706/T763). Diseño supuesto: archivos como **filas de texto con enlace de descarga**, sin miniaturas ni `<img>` externos (§4.4). |
| **B-3 (bloqueante menor)** | La vista previa del propietario (`D5-15`) y la casilla de microchip (`D5-14`): la vista previa se abre **antes** de que exista el enlace. Hace falta un parámetro `includeMicrochip` en la ruta autenticada de vista previa; si no, la previa mostrará algo distinto de lo que verá el veterinario. | `/architect` (T706). |
| H-1 | La etiqueta del alcance «hogar» no debe llevar el nombre del hogar: `REQ-SUM-003` excluye identificadores y nombres de miembros, y un nombre como «Casa de Andrés» es dato personal. Propuesta: «Hogar compartido · 2 mascotas». | PENDIENTE NEO (P-2) |
| H-2 | **Fuga del token por la impresión.** El pie de página que el navegador añade al imprimir o «Guardar como PDF» contiene la URL de la página, que **es el token**. Un PDF reenviado deja un enlace vivo hasta que caduque. Mitigación de diseño: `@page { margin: 0 }` con relleno en el cuerpo (Chrome y Firefox omiten encabezado y pie con margen 0) y no imprimir `href` (`a[href]::after`). Debe verificarse con impresión real; Safari no está garantizado. | `/trinity` (verificar), `/keymaker` (T777) |
| H-3 | Hoy `PhotoAlbum.tsx` usa `alt={item.originalName}` (p. ej. `IMG_2231.jpg`): ruido para lector de pantalla y expone un dato que no aporta. Corregir en T726 (§5.3). | `/keymaker` |
| H-4 | `MediaPanel` tiene un selector «Tipo» (`media-kind`) y un filtro de tipo. Con la separación de 005 ambos son **Dead UI** y deben desaparecer: Álbum sube solo `PHOTO`; Archivos sube solo `FILE`. | `/keymaker` (T722/T730) |

---

## 1. Inventario de pantallas

| # | Pantalla / superficie | Dónde vive | Rol | REQ |
|---|---|---|---|---|
| S1 | **Álbum** (sección de la ficha) | Ficha de mascota, autenticada | OWNER/ADMIN/CAREGIVER escriben; READER solo ve | REQ-ALB5-001..004 |
| S2 | **Archivos** (panel nuevo de «Historial / Archivos») | Misma ficha, junto a los 6 módulos | ídem | REQ-CLI5-001..003 |
| S3 | **Botón «Cancelar»** en los 6 formularios de edición | Formularios existentes | quien edita | REQ-CAN-001/002 |
| S4 | **Compartir con mi veterinario** (crear enlace + lista de enlaces + revocar) | Ficha (alcance mascota) y página de hogar (alcance hogar) | Solo propietario legal y `ADMIN` de hogar (D5-10) | REQ-VET-001..005 |
| S5 | **Vista del resumen clínico** (una sola, dos puertas) | (a) Pública `/shared/{token}` sin cuenta; (b) «Vista previa del resumen» autenticada (D5-15) | veterinario / propietario | REQ-SUM-004, REQ-VET-006 |
| S6 | **Versión impresa** (`@media print` de S5) | Mismo documento | veterinario | REQ-SUM-005 / D5-08 |
| S7 | **Enlace no disponible** (404 uniforme) y **demasiados intentos** (429) | Pública | cualquiera | REQ-VET-007 |

Decisión de estructura: S4 **no es un modal**. En 320 px un modal con trampa de foco es frágil; se diseña como sección/subpágina con encabezado propio («Compartir con mi veterinario»), a la que se vuelve con «Volver a la ficha». Cero librerías (Nivel 2).

Lenguaje visual: se heredan los tokens vigentes (`primary #1d4f3a`, `text-muted #475569`, `danger #b91c1c`, `meadow`, `cream`, `pastel-*`). S5/S6 abandonan el degradado y los círculos de `bg-deco`: es un **documento clínico**, hoja blanca sobre fondo `cream` plano; el decorado solo estorba a la lectura y a la impresión.

---

## 2. S1 — Álbum

Jerarquía (arriba abajo): `h2` «Álbum de {nombre}» → contador → zona de subida → cuadrícula de fotos. El contador es información funcional (explica por qué desaparece la subida), no decoración.

### 2.1 Estados

**E1 Vacío (0 fotos)**
```
Álbum de Luna                      0 de 10 fotos
┌───────────────────────────────────────────────┐
│ Aún no hay fotos de Luna.                     │
│ Sube la primera. Formatos: JPEG, PNG o WebP.  │
│ [ Elegir foto ]   [ Subir ]                   │
└───────────────────────────────────────────────┘
```
Acción clara; sin ilustración ni mascota genérica. Texto de estado vacío accionable, sin disculpa.

**E2 Con contenido (1..9 de 10)**: contador «7 de 10 fotos»; zona de subida arriba (compacta); cuadrícula. Sin paginación (`REQ-ALB5-004`): se **elimina** el `nav` «Páginas del álbum» cuando hay ≤ tope.

**E3 Tope alcanzado (10 de 10)**: el control de subida **se sustituye** por un bloque de texto fijo (no un botón deshabilitado, que los lectores de pantalla no pueden explicar):
```
10 de 10 fotos
[i] Álbum completo. Elimina una foto para subir otra.
```
Al borrar una foto con el álbum completo, reaparece la subida y un `role="status"` anuncia «Ya puedes subir otra foto».

**E4 Error `ERR-MEDIA-ALBUM-LIMIT` (409)** — llega aunque la UI mostrara 9 (carrera, EDGE-005-02, o dato viejo). `role="alert"` persistente hasta la siguiente acción, con icono y texto (el color no habla solo):
> «No se subió la foto: el álbum ya tiene 10 fotos. Elimina una para subir otra.»

Tras el error: se vuelve a pedir la lista (corrige contador), el foco permanece en el control de subida, el archivo elegido se limpia. Texto humano sin código ni «ERR-…». Si el límite no llega en la respuesta (B-1) el texto es «…el álbum ya está completo…» sin cifra.

**E5 Sobre el tope (mascota heredada con 14 fotos, D5-03)**: contador «14 fotos · máximo 10» y aviso informativo (no error; fondo `pastel-cream` `#fbf5dc`, texto `#92400e`, 6.48:1, con icono):
> «Luna tiene más fotos que el máximo actual. Se conservan todas. Para subir nuevas, deja el álbum por debajo de 10.»

Las 14 son visibles y eliminables; se sustituye la zona de subida por el mismo bloque de E3.

**E6 Solo lectura (READER)**: sin zona de subida ni «Eliminar» (no se pinta lo que el servidor rechazaría con `ERR-ACC-FORBIDDEN`; sería Dead UI). Nota «Solo lectura» bajo el título.

**E7 Subiendo**: botón con «Subiendo…», `aria-busy` en la zona y `role="status"`; no hay barra de progreso (no existe dato de progreso en el contrato; una barra falsa sería slop).

**E8 Cargando / error de red / tipo no permitido / tamaño**: se reutilizan los mensajes vigentes de 004 sin cambios.

### 2.2 Cuadrícula y fotos
- 320 px: 2 columnas, hueco 8 px (foto ≈ 140 px). 1024 px: 4 columnas. 1280 px: 5 columnas (10 fotos = 2 filas exactas), contenedor `max-w-6xl`.
- Foto cuadrada `object-cover` (patrón vigente). Bajo cada foto: fecha («12 nov 2026», `tabular-nums`) y botón «Eliminar». Los botones **no se superponen** a la imagen (una superposición exige contraste sobre fondo variable).
- Abrir en grande: la foto es un `button` con el `img` dentro; el visor existente se conserva.
- Eliminar: confirmación en línea, patrón vigente «¿Eliminar esta foto? Esta acción no se puede deshacer.» con «Eliminar» / «Cancelar» (la confirmación de borrado es de 004; D5-09 aplica solo a «Cancelar» de edición).

---

## 3. S2 — Panel «Archivos» (Historial / Archivos)

Estructura distinta a S1 a propósito: **lista de documentos, no cuadrícula**, para que nadie confunda una radiografía con una foto de paseo.

Fila: icono de tipo con texto («PDF» / «Imagen») → nombre original (texto, ver §5) → fecha `created_at` («12 nov 2026») → tamaño → acciones «Ver», «Descargar», «Eliminar». Orden: más reciente primero. Sin miniaturas (no hay miniaturas en servidor, D5 «fuera»; y las radiografías no deben cargarse en masa).

Estados:
- **Vacío**: «Aún no hay archivos clínicos. Guarda aquí resultados de exámenes, radiografías o fotos médicas de control. Formatos: PDF, JPEG, PNG o WebP.» + zona de subida.
- **Con contenido**: lista; paginación vigente de 24 (`REQ-ALB-001` acotado a `FILE`) con el `nav` existente.
- **Subida de `FILE` con álbum en 10**: se acepta (SC-005-006); no se muestra nada del álbum aquí.
- **Errores**: `ERR-MEDIA-TYPE-NOT-ALLOWED` («Ese formato no se admite. Usa PDF, JPEG, PNG o WebP.»), `ERR-MEDIA-QUOTA-EXCEEDED` («No hay espacio suficiente en tu cuota. Elimina archivos o fotos para liberar espacio.»), `ERR-ACC-FORBIDDEN` (para READER no se pinta la subida).
- No se muestra «espacio usado de 1 GiB»: no hay endpoint y no se inventa (decisión de producto futura; PENDIENTE NEO solo si Neo lo quiere, P-6).
- Sin tipo de examen ni fecha del examen (D5-04): la fila no tiene esos campos ni su espacio reservado.

---

## 4. S3, S4, S5, S6, S7

### 4.1 S3 — «Cancelar» (6 formularios)
- Botón secundario (borde `primary`, fondo blanco; el de «Guardar» es el primario) **después** de «Guardar» en el orden del DOM y de tabulación.
- 320 px: ambos botones a ancho completo, apilados, «Guardar» primero. ≥ 1024 px: en fila, alineados a la izquierda, 48 px de alto.
- Sin confirmación (D5-09); sin petición de escritura; el formulario se cierra y el foco vuelve al botón «Editar» de la fila que lo abrió (o al encabezado de la lista si la fila ya no está).
- Con guardado en curso: «Cancelar» con `aria-disabled="true"` (no `disabled`, para que siga enfocable y se lea) y el estado «Guardando…» en `role="status"`. Un clic se ignora.
- Mismo texto «Cancelar» en los 6 formularios; no se reutiliza «Cancelar» del borrado en un sentido distinto al de «volver sin guardar»: en la confirmación de borrado se mantiene la etiqueta vigente porque el contexto es explícito.

### 4.2 S4 — Compartir con mi veterinario
Visible solo para propietario legal y `ADMIN` de hogar; para CAREGIVER/READER el acceso **no se pinta** (el servidor igual responde `ERR-ACC-FORBIDDEN`, SC-005-025).

**Formulario «Crear enlace»** (orden):
1. `fieldset` «¿Qué quieres compartir?» (radio): «Solo esta mascota ({nombre})» / «Todo el hogar ({N} mascotas)». En la ficha la opción hogar solo aparece si la mascota pertenece a un hogar.
2. `fieldset` «¿Cuánto tiempo estará disponible?» (radio): 1 día / **7 días (por defecto)** / 30 días. Texto de apoyo con la fecha resultante, p. ej. «Vence el 25 nov 2026».
3. Casilla **«Incluir el número de microchip»**, **desmarcada por defecto** (D5-14), con descripción asociada por `aria-describedby`: «Si no la marcas, el resumen no muestra el microchip.» No se llama «avanzado» ni se esconde en un desplegable: es un dato de privacidad y debe verse siempre.
4. Aviso permanente (texto, no color): «Quien tenga el enlace puede ver el resumen sin iniciar sesión, hasta que venza o lo revoques.»
5. Botones: «Crear enlace» y «Cancelar». Enlace secundario «Ver vista previa del resumen» (abre S5b; refleja la casilla, B-3).

**Resultado de crear (se muestra una sola vez, REQ-VET-001)**:
```
Enlace creado
[ https://…/shared/Xk3…43 caracteres… ]   [ Copiar enlace ]
Este enlace no se vuelve a mostrar. Cópialo ahora.
Alcance: Luna · Vence: 25 nov 2026 · Microchip: no incluido
[ Listo ]
```
- Campo de solo lectura (`readonly`, `autocomplete="off"`, no `autofocus` para no abrir teclado en móvil), se selecciona completo al enfocar.
- «Copiar enlace» usa el portapapeles del navegador; confirmación en `role="status"`: «Enlace copiado». Si el portapapeles falla: «No se pudo copiar. Selecciona el texto y cópialo.» No se anuncia el token en la región viva.
- Foco: al crearse, pasa al encabezado «Enlace creado» (`tabindex="-1"`). «Listo» descarta el token del estado de React; no se guarda en `localStorage`, historial, título, ni URL de la SPA.

**Lista de enlaces (solo metadatos, nunca el token)**: columnas/campos: Alcance (nombre de mascota u «Hogar compartido · N mascotas»), Creado, Vence, Microchip («Incluido»/«No incluido»), Estado, Acción.
- Estado como **insignia con icono + texto**, nunca color solo: ACTIVO (`pastel-mint` `#d9f5e6`, texto `#1d4f3a`, 8.13:1), REVOCADO (`#f1f5f9` / `#334155`, 9.45:1), VENCIDO (`#fbf5dc` / `#92400e`, 6.48:1). Los nombres visibles son «Activo», «Revocado», «Vencido» (texto de `REQ-VET-005`).
- «Revocar» solo en filas ACTIVO. Confirmación en línea: «¿Revocar este enlace? Dejará de funcionar de inmediato.» con «Revocar» (estilo `danger` con texto, borde y icono) / «Cancelar». Tras revocar: la insignia cambia y `role="status"` anuncia «Enlace revocado». Quién puede revocar: creador, propietario, `ADMIN` (REQ-VET-005).
- 320 px: tarjetas apiladas (`dl` por enlace), sin scroll horizontal. ≥ 1024 px: `table` real con `caption`, `th scope="col"`/`scope="row"`; sin columnas ocultas.
- Vacío: «Todavía no has compartido nada. Crea un enlace para que tu veterinario vea el resumen sin cuenta.»
- Sin «Eliminar enlace» ni «Reactivar»: no existen casos de uso (Dead UI).

### 4.3 S5 — Vista del resumen (pública y vista previa)
Misma pieza, dos puertas. Solo lectura: cero formularios, cero campos editables. Cabecera propia y mínima (palabra «ARGOS», sin menú de la app, sin enlaces salientes; nada de analytics ni fuentes externas: system font stack ya vigente).

Jerarquía:
1. `h1` «Resumen clínico de {mascota}» (alcance hogar: «Resumen clínico · Hogar compartido · N mascotas», H-1).
2. Línea de metadatos: «Generado el 18 nov 2026, 14:32 (UTC)» (se indica la zona explícita para evitar ambigüedad; `generatedAt` viene del resumen). Debajo, aviso fijo: «Este resumen no sustituye la consulta veterinaria.» (visible en pantalla y en impresión, no escondido en un pie).
3. Botón «Imprimir / Guardar como PDF» (único control de la página; 48 px; oculto en impresión).
4. Alcance hogar: lista de anclas «Mascotas: Luna · Max» (índice funcional), cada mascota como `section` con `h2`.
5. Por mascota: perfil mínimo (nombre, especie, sexo, nacimiento; **microchip solo si el enlace lo incluye**) y módulos como `h3`: Peso, Medidas, Vacunas, Desparasitaciones, Consultas, Síntomas, Otros parámetros, Archivos clínicos.
6. Cada módulo **siempre aparece**; vacío = «Sin registros.» (para un veterinario, la ausencia explícita es información; omitir el módulo sería ambiguo).

Presentación de registros: lista `ul` de filas, cada una con fecha a la izquierda y valor a la derecha en `dl` (<1024: dos líneas apiladas; ≥1024: dos columnas). Cifras con `tabular-nums`. Se evita `table` con scroll horizontal en 320 px (WCAG 1.4.10). Si `/architect` fija más de 4 campos por módulo, revisar a `table` con contenedor desplazable enfocable.
Sin gráfico de peso: es documento, no panel; un gráfico no se imprime ni se lee bien y requeriría script.

**S5b Vista previa (propietario)**: franja superior fija solo en pantalla: «Vista previa — así lo verá tu veterinario. Aún no se ha compartido nada.» (`role="note"`; distingue la previa de la pública y evita que se confunda con un enlace activo). Enlace «Volver». No aparece en impresión.

### 4.4 Archivos clínicos dentro del resumen (D5-06)
Lista de filas de texto: icono de tipo + texto («PDF»/«Imagen»), **nombre original** (§5), fecha, tamaño y enlace «Descargar». Sin `<img>`, sin miniaturas, sin visor incrustado (B-2: evita recursos de terceros y CSP). El enlace de descarga lleva `rel="noopener noreferrer"` y el nombre accesible incluye el archivo («Descargar Análisis Luna.pdf»). Si la descarga falla por URL vencida o enlace caducado durante la lectura (EDGE-005-07): mensaje en página «No se pudo descargar. Recarga la página; si el enlace venció, pide uno nuevo.»; la vista ya cargada sigue visible y no se hace ninguna petición periódica.

### 4.5 S6 — Impresión (`@media print`, D5-08)
- Se ocultan: cabecera de marca, franja de vista previa, botón de imprimir, índice de anclas, enlaces de descarga como controles (se imprime solo el texto de la fila), cualquier fondo.
- Fondo blanco, texto negro/`#0f172a` 11 pt, hoja sin sombra ni borde redondeado; títulos con borde inferior fino. Contraste ≥ 16:1.
- Se **conservan**: título, alcance, «Generado el …», aviso «no sustituye la consulta veterinaria» (parte superior de la primera página), perfil y módulos.
- Saltos: `break-after: avoid` en `h2/h3`; `break-inside: avoid` en cada fila de registro; cada mascota (alcance hogar) con `break-before: page` salvo la primera; encabezados de lista repetidos si se usa `table`.
- `a[href]::after` desactivado (no imprimir URLs); `@page { margin: 0 }` y relleno en el cuerpo para suprimir el pie con la URL-token (H-2).
- Archivos clínicos en papel: se imprime la lista; los archivos no se imprimen. Nombres originales en papel: PENDIENTE NEO (P-3).
- Verificación de T777: `emulateMedia({media:'print'})` + captura PDF de Playwright en 320/1024/1280 (SC-005-032), y comprobar que el PDF no contiene el token.

### 4.6 S7 — Enlace no disponible y límite de tasa
- **404 uniforme**: una sola página estática, cuerpo idéntico para inexistente/vencido/revocado/mascota inaccesible (REQ-VET-007). `h1` «Este enlace no está disponible». Texto: «El enlace no existe, venció o fue revocado. Pide a quien te lo compartió que genere uno nuevo.» Nombrar las tres causas **no** discrimina porque el texto es el mismo para todas. Sin botón, sin enlace de salida, sin logotipo vivo, sin temporizador. `noindex`. Esta página **nunca** debe decir «revocado» o «vencido» como diagnóstico específico: esa distinción existe **solo** en la lista del propietario (S4).
- **429**: `h1` «Demasiados intentos». «Espera unos minutos y vuelve a abrir el enlace.» No se promete duración (la ventana es de 10 min pero la espera por IP no es contrato público).
- Ambas: `role` sin trampa, foco al `h1` al cargar, mismo layout, sin script.

---

## 5. Nombre original del archivo (D5-06) y microchip (D5-14)

### 5.1 Nombre original — solo en la vista
- Se renderiza como **nodo de texto** (nunca HTML interpretado ni atributo sin escapar). Hereda la escapatoria de React; prohibido `dangerouslySetInnerHTML`.
- Es contenido de usuario: puede ser larguísimo o sin espacios. CSS: `overflow-wrap: anywhere; min-width: 0;` y, en 320 px, hasta 2 líneas (`line-clamp`) con el nombre completo en `title` y accesible mediante el nombre del enlace; en impresión sin recorte.
- No se escribe en registros, auditoría, `stdout`, URL, `Content-Disposition` visible en logs, ni en el JSON del `ClinicalSummary`; la capa de presentación lo recibe por el canal que defina B-2 y no lo cachea.
- Etiqueta en `lang`: el nombre se marca con `translate="no"` (evita que un traductor automático altere nombres propios).
- Las fotos del álbum **no** usan el nombre como texto alternativo (H-3).

### 5.2 Casilla de microchip — D5-14
- Desmarcada por defecto y no recordada entre sesiones (no `localStorage`): cada enlace es una decisión nueva.
- Etiqueta visible «Incluir el número de microchip» + descripción de consecuencias; no se usa interruptor (toggle): una casilla expresa una elección de envío, y es el control que el usuario de lector de pantalla espera.
- La decisión queda **visible después**: en la lista de enlaces («Microchip: Incluido / No incluido») y en el resultado de creación. En S5 el campo microchip aparece solo si se incluyó; si no, **no** hay fila vacía ni «oculto» (ni siquiera revela que existe).
- La vista previa refleja la casilla (B-3), con la nota de S5b.

### 5.3 Texto alternativo de las fotos del álbum
No existe campo de descripción (no se inventa uno: sería Dead UI). Alt = «Foto {n} de {total} de {nombre}, subida el {fecha}» (p. ej. «Foto 3 de 7 de Luna, subida el 12 nov 2026»), compuesto en la presentación solo a partir de datos de la lista; sin el nombre del archivo. Fotos decorativas no existen en esta feature. Imágenes de archivos clínicos: no se muestran miniaturas; el visor usa «Imagen clínica: {nombre}, {fecha}» solo en la vista web.

---

## 6. Requisitos WCAG 2.1 AA por viewport

Tokens y contrastes calculados (relación de luminancia WCAG):

| Par | Relación | Requisito | OK |
|---|---|---|---|
| `#0f172a` / blanco | 17.85 | 4.5 | sí |
| `#475569` (muted) / blanco · / `#e6f2ea` | 7.58 · 6.59 | 4.5 | sí |
| `#1d4f3a` / blanco · / `#e6f2ea` · / `#d9f5e6` | 9.41 · 8.18 · 8.13 | 4.5 | sí |
| `#b91c1c` / `#fef2f2` · `#7f1d1d` / `#fef2f2` | 5.91 · 9.16 | 4.5 | sí (texto de alerta: `#7f1d1d`) |
| `#92400e` / `#fbf5dc` | 6.48 | 4.5 | sí |
| `#334155` / `#f1f5f9` | 9.45 | 4.5 | sí |
| Borde de control `#64748b` / blanco | 4.76 | 3 (no textual, 1.4.11) | sí |
| Anillo de foco `#1d4f3a` 2 px + 2 px de separación blanca | ≥ 8.1 | 3 | sí |

### Transversal (los tres viewports)
1. **1.1.1** Alt de fotos según §5.3; iconos de tipo/estado con texto adyacente (`aria-hidden` en el SVG).
2. **1.3.1 / 4.1.2** `h1→h2→h3` sin saltos; `fieldset/legend` en los radios de S4; `label` asociado a cada control; `dl`/`table` semánticos; el contador de S1 es texto, no `aria-label` oculto.
3. **1.4.1** Estados (Activo/Revocado/Vencido, tope, errores) = icono + texto + color.
4. **1.4.3 / 1.4.11** Valores de la tabla; ningún texto sobre foto.
5. **2.1.1 / 2.4.3** Todo operable por teclado; orden DOM = orden visual; sin trampas; sin modal.
6. **2.4.7** Foco visible en todo control, incluido «Cancelar» con `aria-disabled`; el anillo no se recorta por `overflow:hidden` de la tarjeta de foto.
7. **3.3.1 / 3.3.3** Errores en texto, junto al control, con la acción de recuperación («Elimina una para subir otra»).
8. **4.1.3** Mensajes de estado (`role="status"` / `role="alert"`): «Foto subida», «Ya puedes subir otra foto», «Enlace copiado», «Enlace revocado», «Guardando…». Un solo `role="alert"` a la vez; el 409 es `alert`, lo informativo es `status`.
9. **2.5.3** El nombre accesible contiene el texto visible («Eliminar foto 3» contiene «Eliminar»).
10. Reglas del proyecto: objetivos táctiles ≥ 48 × 48 px; respetar `prefers-reduced-motion` (sin animaciones obligatorias; no hay).
11. **Público (S5/S7)**: `lang="es"`, `<title>` distinto por pantalla, sin cookies ni scripts de terceros, `noindex`.

### 320 px (referencia móvil con una mano)
- **1.4.10 Reflow**: cero scroll horizontal (la cuadrícula del álbum, la lista de enlaces como tarjetas, los registros como filas apiladas); nombres largos con `overflow-wrap:anywhere`.
- Álbum 2 columnas; botones de formulario apilados a ancho completo; «Cancelar» y «Guardar» separados ≥ 8 px.
- S4 en subpágina, no modal; el campo del enlace permite selección sin teclado de pantalla forzado.
- **1.4.4**: a 200 % de zoom el texto no se recorta (sin alturas fijas en contenedores de texto).
- **1.4.12**: tolerar interlineado 1.5, espaciado de párrafo 2×.

### 1024 px
- Álbum 4 columnas; lista de enlaces como `table`; formularios con botones en fila.
- Resumen: filas en dos columnas (fecha | valor), ancho de lectura ≤ 70 caracteres por línea de texto corrido (`max-w-prose`).
- Teclado: orden Guardar → Cancelar; el índice de anclas del resumen lleva a `h2` con `scroll-margin` para que el foco no quede bajo la franja de vista previa.

### 1280 px
- Contenedor `max-w-6xl` (álbum 5 columnas: 10 fotos = 2 filas); resumen centrado en `max-w-3xl` (la hoja se parece a la hoja impresa; no se estira).
- Sin barra lateral ni paneles extra (no hay contenido que los justifique).
- Comprobar 2.4.11 no es requisito de 2.1; igualmente la franja fija de vista previa no oculta el foco (`scroll-padding-top`).

---

## 7. Comprobación anti «AI Slop»

| Elemento | Función real | Veredicto |
|---|---|---|
| Contador «N de 10 fotos» | Explica el tope y la desaparición de la subida | Conservar (depende de B-1) |
| Bloque «Álbum completo» | Reemplaza un botón muerto | Conservar |
| Selector «Tipo» y filtro de tipo en `MediaPanel` | Ninguna tras la separación | **Eliminar** (H-4) |
| Barra de progreso de subida | No hay dato de progreso | **No crear** |
| «Espacio usado / 1 GiB» | No hay endpoint | **No crear** (P-6) |
| Miniaturas de archivos clínicos | No hay miniaturas en servidor | **No crear** |
| Gráfico de peso en el resumen | No se imprime, requiere script | **No crear** |
| Franja «Vista previa» | Diferencia la previa de un enlace activo | Conservar |
| Insignias de estado | Datos reales (REQ-VET-005) con icono y texto | Conservar |
| Tarjetas de métricas, hero, ilustraciones de vacío, gradientes en S5, emojis | Ninguna | No existen en el diseño |
| «Reactivar»/«Eliminar enlace»/«Editar caducidad» | Sin caso de uso | No crear |
| Fondo `bg-deco` en S5/S6 | Estorba a impresión y lectura | No usar |

Presentación sin lógica de negocio: la UI formatea fechas/etiquetas y compone el alt; nunca calcula el tope, la elegibilidad por rol, ni la vigencia del enlace (todo viene del servidor).

---

## 8. Decisiones PENDIENTE NEO

| Id | Decisión | Recomendación de Sati |
|---|---|---|
| P-1 | Confirmación al «Revocar» un enlace (D5-09 solo cubre «Cancelar» de edición) | Sí, en línea (la revocación es irreversible; costo: un clic) |
| P-2 | Etiqueta del alcance hogar en el resumen | «Hogar compartido · N mascotas», sin nombre del hogar |
| P-3 | Nombres originales de archivo en la **hoja impresa** (D5-06 permite la vista web; el papel/PDF reenviado los difunde) | Imprimir «PDF · 12 nov 2026 · 1.2 MB» sin nombre; el nombre queda solo en pantalla |
| P-4 | La vista previa respeta la casilla de microchip (depende de B-3) | Sí |
| P-5 | Hora de «Generado el …»: UTC explícito vs. hora local con zona | Hora local con zona visible (el veterinario lee su hora); el JSON queda en UTC |
| P-6 | Mostrar uso de cuota (1 GiB) al propietario | Diferir; sin endpoint hoy |

Ninguna de estas decisiones bloquea la construcción de S1–S3; P-2/P-3/P-4 afectan T775–T777.

---

## 9. Entrega a siguientes roles

- `/architect` (T706): B-1, B-2, B-3; endpoints de lista de enlaces y de vista previa; exponer `maxPhotosPerPet`.
- `/trinity`: B-2 (CSP + descargas), H-2 (token en pie de impresión), `rel` de enlaces de descarga.
- `/keymaker` (T722, T726, T730, T733, T740..T744, T754..T757, T775..T777): este documento como especificación visual; corregir H-3 y H-4.
- `/seraph`: SC-005-010 y SC-005-031: axe en 320/1024/1280; teclado de S1–S5; impresión (SC-005-032).
- Sin prototipo HTML; si Neo quiere ver S5 antes de implementar, Sati lo produce como `.specify/memory/audits/sati-T705-prototipo-resumen.html` (artefacto, no `src/`).

FROM: Sati (/sati)
TO: Morpheus
STATUS: Validation Required
