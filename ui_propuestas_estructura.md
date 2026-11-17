# ARGOS — Propuestas de estructura de pantalla (Paso 1 del rediseño)

- **Fecha:** 2026-11-14. **Autora:** Sati. **Estado:** REVIEW, a la espera de que Neo elija A o B.
- **Contrato de entrada:** `architecture_spec.md` (inmutable). Tokens, paleta, semáforo y OWNER_COLORS: los de `ui_blueprint.md` v1.1 (aprobados por Neo), sin cambios. Este documento solo mueve y agrupa bloques.
- **No se inventa nada:** cada tarjeta usa un campo que existe en `PetCardView` / `PetDashboardView`. De la imagen "pawly" se toma composición, ligereza del marco y jerarquía. No se toma ningún widget ni métrica (Mood, Water, Activity, Smart Care, Vet Tips, Upgrade, campana de notificaciones, variación %).
- **Verificación:** nada de esto está renderizado. Los contrastes se heredan de la matriz de v1.1 y deben comprobarse con axe tras la implementación.

---

## 0. Diagnóstico del diseño actual (lo que se rompe en ambas propuestas)

| # | Problema | Por qué falla |
|---|---|---|
| P1 | Cabecera sólida pesada fuera del marco | Quita el protagonismo al contenido y duplica el marco |
| P2 | `Nueva mascota` debajo de los filtros | Es la acción principal de creación y queda enterrada; además solo existe en "Mis mascotas" |
| P3 | Filtros arriba del selector, ocupando la mejor zona | Buscar es secundario; con 3 mascotas el filtro pesa más que la lista |
| P4 | Lista de texto plano | `alertsSummary` y `owner` están en la tarjeta y no se leen de un vistazo |
| P5 | Ficha como bloque único: perfil, edad, peso y alertas en una columna | Ninguna cifra domina. El dato urgente (vencidas) no es lo primero que se ve |
| P6 | Formularios de registro siempre abiertos bajo tablas vacías | El 80 % del tiempo el usuario lee, no escribe |
| P7 | Estado vacío "Sin registros." | Es un callejón sin salida, no una invitación |

## 1. Piezas comunes a A y B (no se discuten)

1. **Marco único glass** (L1 de blur: 1 capa desde 640 px, 0 en móvil). La navegación entra al marco: desaparece la cabecera sólida. El enlace "Saltar al contenido" sigue siendo el primer foco, antes del marco.
2. **Hero con el nombre de la mascota como titular** (`h2`, 36–48 px, 700), como el "Your Pet's Health" de la referencia. Es el ancla memorable de la pantalla. Todo lo demás es silencioso.
3. **Bento de 4 piezas con datos reales:**

| Tarjeta | Campo del contrato | Superficie |
|---|---|---|
| Hero | `profile.name`, `species`, `breed`, `sex`, `birthDate` | Blanca |
| Edad | `computedAge` ("N años, M meses") | Blanca, `tabular-nums` |
| Peso | `latestWeightKg` ("X.XX kg" o "Sin peso") | Blanca, `tabular-nums` |
| Alertas | `alertsSummary` (`overdueCount`, `dueSoonCount`, `upToDateCount`) + `owner` + permisos | **Oliva `#1d4f3a`, texto blanco** (único bloque oscuro) |

4. **Tabla + SVG de peso, tabs de módulos y todos los atributos de 4.2 intactos** (ver sección 5).
5. **Formularios bajo demanda** (reglas en la sección 4).
6. **Estados vacíos accionables** (copy en la sección 6).

---

## 2. PROPUESTA A — "Riel y ficha" (la más cercana a la referencia)

**Idea:** la mascota es el contexto. Un riel vertical de avatares a la izquierda (como las miniaturas de la referencia) y la ficha como bento a la derecha. La navegación vive arriba, en el marco.

### 2.1 Desktop (1280 px)

```text
+--[ MARCO GLASS · L1 blur ]------------------------------------------------------+
| Argos  [Mascotas] [Hogares 2 hogares·1 invitación] [Respaldo]   Ana [Cerrar sesión]|
|----------------------------------------------------------------------------------|
| Contexto: (Mis mascotas) (Casa Pérez) (Finca)        [ buscar mascota ] [Especie v]|
|----------------------------------------------------------------------------------|
| RIEL      |  HERO                                              | ALERTAS (oliva)|
| (listbox) |  Argos                    [avatar grande]          | 2 vencidas      |
|  (A) *    |  Perro · Labrador · Macho · 02/03/2019             | 1 próxima       |
|  (B)      |  Dueño: Ana  [Solo lectura]                        | 5 al día        |
|  (C)      |----------------------------------------------------| Dueño: Ana      |
|  (D)      |  EDAD              |  PESO                         | [Registrar peso]|
|  [+ Nueva |  4 años, 2 meses   |  28.40 kg                     | [Editar][Elim.] |
|   mascota]|                                                    |                 |
|           |----------------------------------------------------------------------|
|           |  [Peso] [Medidas] [Vacunas] [Desparasitación] [Consultas] [Parámetros]|
|           |  +--- gráfico SVG (600x220) ---+ +--- tabla de peso ---------------+ |
|           |  |   .      .  .               | | Fecha   Peso    Var. kg  Var. %  | |
|           |  +-----------------------------+ +----------------------------------+ |
|           |  [Registrar peso]  (CTA; el formulario se abre aquí)                  |
+----------------------------------------------------------------------------------+
```

Anchos: riel 96 px; ficha ocupa el resto; hero 7/12 y alertas 5/12; edad y peso 50/50 bajo el hero; módulo a ancho completo, con gráfico y tabla en dos columnas desde 1024 px.

### 2.2 Mobile (320 px)

```text
+------------------------------+
| Argos              [Cerrar s.]|   <- marco glass SIN blur (blanco 90 %)
| (Mis mascotas)(Casa Pérez)>> |   <- tabs con scroll interno
| [ buscar mascota        ]    |
| [Especie v]                  |
| (A)* (B) (C) (D)  [+Nueva]   |   <- listbox horizontal, 64 px, scroll interno
|------------------------------|
| Argos                        |   <- h2 grande
| Perro · Labrador · Macho     |
| Dueño: Ana                   |
| +--------------------------+ |
| | ALERTAS (oliva)          | |
| | 2 vencidas · 1 próxima   | |
| | [Registrar peso][Editar] | |
| +--------------------------+ |
| +-----------++-------------+ |
| | EDAD      || PESO        | |
| | 4a 2m     || 28.40 kg    | |
| +-----------++-------------+ |
| [Peso][Medidas][Vacunas]>>   |
| tabla (región con scroll)    |
|------------------------------|
| [Mascotas][Hogares][Respaldo]|   <- navegación inferior, 56 px
+------------------------------+
```

Las alertas suben antes que edad y peso: es la respuesta a "¿qué requiere mi atención?" en menos de 2 segundos.

### 2.3 Qué moví y por qué

| Elemento | Antes | Ahora (A) | Problema que resuelve |
|---|---|---|---|
| Navegación | Cabecera sólida fuera del marco | Fila superior dentro del marco; en móvil, barra inferior | P1. Alcanzable con el pulgar; el marco manda |
| `Nueva mascota` | Bajo los filtros | Última pieza del riel (escritorio) o de la tira (móvil), junto al selector | P2. Está donde se elige mascota, que es donde se decide añadir otra |
| Búsqueda y especie | Bloque encima del selector | Esquina de la fila de contexto, compacta | P3. Deja de competir con el contenido |
| Selector de mascotas | Columna de cajas de texto | Riel de avatares (`listbox` vertical); tira horizontal en móvil | P4. Escala a muchas mascotas (scroll interno) y muestra estado de alerta por mascota |
| Ficha | Columna única | Bento: hero, edad, peso, alertas | P5. El dato urgente va primero y en el único bloque oscuro |
| Formularios de registro | Siempre abiertos | Abiertos si el módulo está vacío o si Neo/usuario los abrió con el CTA | P6. Ver sección 4 |
| Vacíos | "Sin registros." | Texto con la acción siguiente | P7 |

**Contenido de cada pieza del riel:** avatar (ver decisión D1), nombre (truncado con elipsis a una línea, nombre completo en el nombre accesible) y, si `overdueCount > 0`, insignia roja con "N vencidas"; si no, y `dueSoonCount > 0`, insignia ámbar con "N próximas". Texto + icono + color, nunca solo color. En el contexto de hogar, un aro del `OWNER_COLOR_n` rodea el avatar (decorativo; el texto "Dueño: …" va en la ficha).

### 2.4 Cómo se mapea el contrato a la referencia

| Tarjeta de la referencia | En Argos (A) | Campo real |
|---|---|---|
| Hero con foto y titular | Hero con nombre grande y avatar | `profile.*` |
| "Pet Wellness" (4 mini-métricas) | Dos tiles: Edad y Peso. Nada más | `computedAge`, `latestWeightKg` |
| "Smart Care" (bloque oliva oscuro) | Bloque Alertas | `alertsSummary`, `owner`, `permissions` |
| "Activity" (barras) | Gráfico SVG de peso con tabla equivalente, dentro del módulo Peso | `weights` |
| "Recent Updates" | Pestañas de módulos con su lista o tabla | `weights`, `vaccinations`, etc. |
| Miniaturas de mascotas a la izquierda | Riel `listbox` | `PetCardView` |
| Buscador superior | `role="search"` en la fila de contexto | `q`, `species` |

**Ventaja:** es lo más parecido a la referencia y el menor cambio de estructura de componentes (el riel es la lista actual, estrechada). **Coste:** la tarjeta de mascota en el riel muestra poca información; hay que abrirla para ver edad o peso.

---

## 3. PROPUESTA B — "Tira de tarjetas y mesa"

**Idea:** el usuario cuida varias mascotas, a veces de varios dueños. Cada mascota es una tarjeta rica en una tira horizontal superior; así se ve de un vistazo cuál necesita atención sin abrirla. La navegación pasa a un riel de iconos con texto en el borde izquierdo del marco.

### 3.1 Desktop (1280 px)

```text
+--[ MARCO GLASS · L1 blur ]------------------------------------------------------+
| NAV  | Contexto: (Mis mascotas) (Casa Pérez) (Finca)    [ buscar ] [Especie v]  |
| Argos|---------------------------------------------------------------------------|
|      | TIRA (listbox horizontal)                                                 |
|[Masc]| +-----------+ +-----------+ +-----------+ +-----------+ +--------------+ |
|[Hog.]| | (A) Argos | | (B) Luna  | | (C) Rocky | | (D) Nube  | | + Nueva      | |
|[Resp]| | 28.40 kg  | | 4.10 kg   | | Sin peso  | | 12.0 kg   | |   mascota    | |
|      | | 2 vencid. | | 1 próxima | | al día    | | al día    | |              | |
| Ana  | +-----------+ +-----------+ +-----------+ +-----------+ +--------------+ |
|[Cerr]|---------------------------------------------------------------------------|
|      | HERO Argos (h2 XL) Perro·Labrador·Macho·2019  | ALERTAS (oliva)           |
|      |  Dueño: Ana [Solo lectura]  [Editar][Elim.]   | 2 vencidas 1 próxima 5 ok |
|      |-----------------------------------------------| [Registrar peso]          |
|      | EDAD 4a 2m | PESO 28.40 kg |                   |                           |
|      |---------------------------------------------------------------------------|
|      | [Peso][Medidas][Vacunas][Desparasitación][Consultas][Parámetros]          |
|      | gráfico SVG (ancho completo)  |  tabla de peso                            |
+----------------------------------------------------------------------------------+
```

El formulario de alta o edición se abre como panel derecho de 420 px (vista dividida, sin velo ni blur); la ficha se comprime a la izquierda.

### 3.2 Mobile (320 px)

```text
+------------------------------+
| Argos              [Cerrar s.]|
| (Mis mascotas)(Casa Pérez)>> |
| [ buscar mascota        ]    |
| [Especie v]                  |
| +-----------+ +-----------+> |   <- tarjetas 220 px, la siguiente asoma (scroll-snap)
| | Argos     | | Luna      |  |
| | 28.40 kg  | | 4.10 kg   |  |
| | 2 vencidas| | 1 próxima |  |
| +-----------+ +-----------+  |
| [+ Nueva mascota]            |
|------------------------------|
| Argos (h2)                   |
| ALERTAS (oliva) ...          |
| EDAD | PESO                  |
| [Peso][Medidas]>>  tabla     |
|------------------------------|
| [Mascotas][Hogares][Respaldo]|
+------------------------------+
```

### 3.3 Qué moví y por qué

| Elemento | Antes | Ahora (B) | Problema que resuelve |
|---|---|---|---|
| Navegación | Cabecera sólida | Riel lateral dentro del marco (escritorio) / barra inferior (móvil) | P1. Libera la altura vertical, que es lo escaso en una ficha con tabla |
| `Nueva mascota` | Bajo filtros | Última tarjeta de la tira, con el mismo tamaño que una mascota | P2 |
| Selector | Cajas de texto | Tarjetas con `latestWeightKg` y `alertsSummary` de cada mascota | P4. Compara mascotas sin abrirlas; con varios dueños, ve de quién es cada una |
| Filtros | Encima | Esquina de la fila de contexto | P3 |
| Ficha | Columna única | Hero + alertas arriba, edad y peso, después el módulo | P5 |
| Formularios | Siempre abiertos | Panel derecho dividido; mismo criterio para registros | P6 |

### 3.4 Mapeo a la referencia

| Referencia | En Argos (B) | Campo real |
|---|---|---|
| Hero | Hero con titular grande | `profile.*` |
| Miniaturas | Tira de tarjetas ricas | `PetCardView` completo |
| Bloque oliva | Alertas | `alertsSummary`, `owner` |
| Activity | Gráfico SVG con ancho completo (más aire que en A) | `weights` |
| Pet Wellness | Edad y Peso | `computedAge`, `latestWeightKg` |

**Ventaja:** la tira responde "¿cuál mascota necesita atención?" sin clics; mejor con hogares compartidos. **Coste:** más cambios (tarjeta nueva, riel de navegación nuevo, tira con scroll horizontal). La tira con 8+ mascotas obliga a desplazar; el riel de A lo gestiona mejor. En 320 px la tira exige scroll horizontal interno (permitido; la página no desborda).

---

## 4. Formularios bajo demanda (aplica a A y B)

| Formulario | Hoy | Propuesta | Cómo se conservan los selectores |
|---|---|---|---|
| Alta de mascota | Ya se abre al pulsar `Nueva mascota` | Panel derecho (≥1024 px, vista dividida) u hoja a pantalla completa (<1024 px) con botón "Cancelar" | Mismo componente `PetForm`, mismo prefijo `new-pet`: `#new-pet-name`, `#new-pet-species`, `form[aria-labelledby]`. Solo cambia el contenedor |
| Edición | Ya se abre con `Editar` | Igual que el alta | Prefijo `edit-pet-<petId>`; `form[aria-labelledby^="edit-pet-"]` intacto |
| Registro por módulo | **Siempre montado** en cada pestaña | **Abierto si el módulo no tiene registros.** Si los tiene, queda cerrado tras el CTA ("Registrar peso", etc.). **Una vez abierto, no se cierra solo al guardar**, para poder registrar varios seguidos | Mismo `RecordForm`, mismos ids `<módulo>-<campo>` (`#weights-weightKg`, `#vaccinations-nextBoosterAt`). El componente se monta al abrirse; sus ids no cambian |
| Eliminar mascota | `alertdialog` en línea | Se mantiene en línea (no modal, `aria-modal="false"`), ahora sobre el bloque hero | `delete-pet-title`, `delete-pet-desc`, "Eliminar definitivamente" intactos |

**Riesgo declarado.** Las pruebas `pet-dashboard.spec.ts:58-85` rellenan `#weights-*` y `#vaccinations-*` sin pulsar ningún botón y en bucle. Con la regla "abierto si está vacío y no se cierra solo", ese flujo sigue pasando (el primer registro se hace con el módulo vacío, y el formulario ya está abierto). No lo he ejecutado. Si Neo prefiere "cerrado siempre salvo CTA", hay que añadir un clic previo en esas pruebas, que lo hace `/keymaker` y lo audita `/oracle`.

**Foco y teclado.** Al abrir un panel, el foco va a su encabezado; `Escape` lo cierra y devuelve el foco al botón que lo abrió. El panel es una región con nombre, no un diálogo modal: no atrapa el foco y no usa velo ni blur. **Presupuesto de blur: 1 capa (el marco) desde 640 px; 0 en móvil.** Los paneles son blancos sólidos.

## 5. Preservación técnica (checklist que cumplen A y B)

- **Roles ARIA:** `tablist` "Contexto de mascotas" (`context-tab-<id>`, `aria-controls` = `PET_PANEL_ID`, panel `tabpanel`); `listbox` "Mascotas" con `option` y `aria-selected`; `tablist` "Módulos de la ficha" con `module-tab-<id>` y `module-panel-<id>`; `alertdialog` (mascota y hogar); `status` ("Cargando…", resultado de importación); `alert` (errores de formulario y de ficha).
- **Teclado del `listbox`:** Inicio, Fin, Enter, Espacio, flechas. En vertical (A) arriba/abajo; en horizontal (B) izquierda/derecha. Se aceptan los cuatro sentidos en ambos para no romper pruebas.
- **Atributos `data-*`:** `data-pet-id` (opción y ficha), `data-owner-badge`, `data-read-only="true"`, `data-alert-status`, `data-ui-badge`, `data-household-count`, `data-pending-invitations`, `data-household-id`, `data-membership-status`.
- **Tabla y SVG de peso:** `caption` solo para lectores, `th scope="col"`, región con `tabIndex=0`, `svg[role="img"]` con `circle` por punto, `table tbody tr` por fila.
- **Un único botón `Nueva mascota`.** Debe haber exactamente uno en el DOM (Playwright falla por modo estricto si hay dos). El estado vacío no repite el botón; apunta al existente.
- **Se mantienen los nombres exactos** de botones, etiquetas y textos de 4.2.C ("Entrar", "Guardar", "Editar", "Eliminar", "Filtrar por especie", "Solo lectura", "Dueño: Ana", etc.). Si una etiqueta pasa a estar oculta visualmente se usa `sr-only`, nunca se elimina.
- **`searchbox`** sigue visible y accesible, con `role="search"` y nombre "Filtrar mascotas".
- **Contadores de Hogares:** `data-household-count` y `data-pending-invitations` con texto visible "hogares" e "invitaciones". En la barra inferior móvil el ítem crece a dos líneas.
- **320 px:** sin desbordamiento horizontal de página; scroll interno solo en tabs, tira y tabla; táctil ≥ 48 px.
- **Gating de B-3 intacto.** Los formularios de registro siguen dependiendo de `permissions.editPetBasics`. Esta propuesta no corrige esa brecha.

## 6. Textos de estados vacíos y de solo lectura

| Estado | Texto propuesto |
|---|---|
| Sin mascotas en "Mis mascotas" | "Aún no has registrado mascotas. Usa «Nueva mascota» para empezar." (literal "No hay mascotas en este contexto." se conserva como texto de `status` para pruebas; ver nota) |
| Sin mascotas en un hogar | "Nadie ha asignado mascotas a este hogar. Quien sea dueño puede asignarlas desde Editar." |
| Sin selección | "Selecciona una mascota para ver su ficha." (se conserva literal) |
| Módulo vacío (con permiso) | "Sin pesos registrados. Registra el primero para ver la evolución." |
| Módulo vacío (sin permiso) | "Sin registros. Quien cuida a esta mascota aún no ha cargado datos." |
| Solo lectura | Etiqueta "Solo lectura" (se conserva) con icono de candado |

**Nota:** los literales "No hay mascotas en este contexto.", "Sin registros." y "Sin mediciones de peso." aparecen en el contrato como textos de estado. Si alguna prueba los lee, hay que conservarlos como texto accesible y añadir la frase de acción debajo. Lo verificará Keymaker antes de tocar copy.

## 7. Las otras rutas, en el mismo marco

| Ruta | Estructura (A y B) |
|---|---|
| `/households` | Misma navegación. Izquierda: tarjeta "Crear hogar" (un campo, siempre visible) e "Invitaciones" (lista con Aceptar y Rechazar). Derecha: tarjetas de hogar. `Invitar miembro` queda **en línea** dentro de la tarjeta del propietario con `username` y **[FIX B-1]** `roleOnJoin` (Administrador, Cuidador, Lector; valor inicial Lector). `Eliminar hogar` abre el `alertdialog` en línea |
| `/backup` | Dos tarjetas: "Descargar respaldo" en bloque oliva y "Importar respaldo" en blanco (archivo + botón + resultado `status` o `alert`) |
| `/login`, `/register` | Marco glass centrado. Escritorio: panel de marca (`h1` "Argos") a la izquierda y formulario a la derecha. Móvil: apilado. Sin navegación |

## 8. Recomendación

**Elijo A.** Razones: (1) es la composición de la referencia (miniaturas a la izquierda, contenido protagonista); (2) escala a muchas mascotas sin que el selector crezca; (3) cambia menos código de presentación, lo que reduce el riesgo sobre las 38 pruebas E2E que acaban de quedar en verde. B gana si el uso real es de hogares con muchas mascotas de varios dueños y la comparación rápida es el trabajo principal.

## 9. Decisiones que necesito de Neo

1. **A o B** (o híbrido: riel de A con insignia de alertas por mascota, que ya trae A).
2. **D1: `avatarUrl`.** Existe en el contrato y el formulario ya lo envía, pero ninguna pantalla lo muestra (B-5). Mostrarlo da vida a riel y hero, pero un `<img>` con URL `http(s)` externa deja que un tercero vea cuándo abre la app (fuga de privacidad). Opciones: (a) mostrar solo `data:` y, para `http(s)`, iniciales; (b) mostrar todo; (c) solo iniciales + glifo de especie. **Recomiendo (a), y que `/rama` lo revise.**
3. **D2: formularios de registro.** Regla propuesta "abierto si vacío, no se cierra solo", o "cerrado siempre salvo CTA" (exige tocar pruebas).
4. **D3: `upToDateCount` y `myRole`.** Existen en el contrato y hoy no se muestran. Propongo mostrar `upToDateCount` ("5 al día") en el bloque oliva y **no** mostrar `myRole` (sería un dato nuevo en pantalla sin caso de uso aprobado).

Tras tu elección sigo con la ganadora: tokens Tailwind definitivos, estados (`LOADING`, vacíos, errores, "Solo lectura"), Brand Kit multicanal y `ui_blueprint.md` v2.0, más maqueta HTML a 320, 1024 y 1280 px.
