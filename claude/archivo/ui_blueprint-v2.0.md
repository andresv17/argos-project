# ARGOS — Blueprint de interfaz v2.0 (diseño visual, estructura y componentes)

- **Fecha:** 2026-11-14. **Autora:** Sati (Directora de Arte y Diseñadora de Producto). **Versión:** 2.0. **Estado:** REVIEW (pendiente de auditoría de `/oracle`).
- **Sustituye a:** v1.1 (archivada en `claude/archivo/ui_blueprint-v1.1.md`). La v1.1 definía tokens y apéndices; sus tokens se conservan aquí sin cambio de valor.
- **Decisión de estructura:** Propuesta A, "Riel y ficha" (`ui_propuestas_estructura.md`), aprobada por Neo el 2026-11-14 como arquitectura visual definitiva.
- **Contrato funcional de entrada (inmutable):** `architecture_spec.md` (raíz del repositorio), secciones 2, 3 y 4.
- **Alcance:** especificación visual y de componentes. No modifica código fuente, contratos ni especificaciones. La implementación la hace `/keymaker` en `src/presentation/web/` **solo tras la auditoría de `/oracle` y la orden de Neo**.
- **Referencia visual "pawly":** se toma composición (riel de miniaturas, hero con titular grande, bento), ligereza del marco glass y paleta. No se toma ningún widget, métrica ni texto (Mood, Water Intake, Activity %, Smart Care, Vet Care Tips, Upgrade, campana, variación %).
- **Convención:** `[UI]` = existe hoy. `[FIX B-1]` = única adición (control `roleOnJoin`). Lo marcado `[CONTRATO]` o `[BRECHA]` queda fuera (ver Apéndice A).

---

## 0. Cambios respecto a v1.1

| # | Cambio | Motivo |
|---|---|---|
| C1 | La cabecera sólida pasa a una fila dentro del marco glass | Propuesta A; el marco manda y el contenido gana protagonismo |
| C2 | Navegación en el flujo superior en todos los viewports (no hay barra inferior fija) | Mantiene el orden de foco = orden visual (WCAG 2.4.3). La barra inferior de la propuesta se descarta en v2.0 |
| C3 | `/`: lista de mascotas pasa de columna de tarjetas a riel de avatares (`listbox`) | Propuesta A aprobada |
| C4 | Ficha: columna única pasa a bento (hero, edad, peso, alertas) | Propuesta A aprobada; datos reales del contrato |
| C5 | Tarjeta oliva de alertas con recuento completo de `alertsSummary` | Decisión D3 de Neo |
| C6 | Avatar con foto: `data:` directo; `http(s)` con `referrerPolicy="no-referrer"` y fallback a iniciales | Decisión D1 de Neo |
| C7 | Formulario de registro: abierto si el módulo está vacío; si hay registros, panel inline con `<details>` que no se cierra al guardar | Decisión D2 de Neo |
| C8 | Exactamente un botón "Nueva mascota" en el DOM | Decisión 5 de Neo (modo estricto de Playwright) |
| C9 | Tokens, paleta, semáforo, colores de dueño, tipografía y matriz de contraste | Sin cambios de valor (ratificados por Neo) |

---

## 1. Decisiones aprobadas por Neo (2026-11-14)

| # | Decisión | Aplicación en esta versión |
|---|---|---|
| 1 | Arquitectura: Propuesta A. Marco glass único (L1 blur desde 640 px; 0 en móvil 320 px). Bento de 4 piezas con datos reales | Secciones 3 y 4 |
| 2 | D1 avatarUrl: prioridad a `data:image/*`. URL `http(s)` con `referrerPolicy="no-referrer"` y fallback automático en `onError` a círculo con iniciales y glifo de especie | Sección 4.2 |
| 3 | D2 formularios: el formulario del módulo activo está en el DOM. Abierto si la lista está vacía; si hay registros, en panel inline accesible. No se cierra al guardar | Sección 4.5 |
| 4 | D3 indicadores: tarjeta oliva con el recuento completo de `alertsSummary`. Solo "Solo lectura" existente; sin `myRole` | Sección 4.3 y 4.6 |
| 5 | Un único "Nueva mascota" en el DOM | Sección 4.1 |

---

## 2. Sistema de design tokens (CSS / Tailwind v3)

Los valores se declaran como `theme.extend.colors` en `tailwind.config.ts` (lo implementa Keymaker). Los valores HEX son los de v1.1, verificados en contraste.

### 2.1 Paleta de marca y superficies

| Token | Nombre | HEX | Uso |
|---|---|---|---|
| `primary` | Oliva Argos | `#1d4f3a` | Botón principal, tarjeta de alertas, texto de enlace activo, anillo de foco |
| `primary-hover` | Oliva profundo | `#173f2f` | Hover de botón principal |
| `secondary` | Musgo | `#35573f` | Fondo de iniciales de avatar sin color de dueño |
| `accent` | Lima Argos | `#c5f35a` | Pestaña activa, punto focal. **Solo como fondo**, con texto `primary` (7.32:1). Nunca texto ni anillo sobre blanco (1.29:1) |
| `accent-soft` | Lima suave | `#e9fbc4` | Fondo de tarjeta de mascota activa en el riel |
| `sky` / `meadow` / `cream` | Cielo / Pradera / Crema | `#eaf6ff` / `#e6f2ea` / `#f4f8ef` | Degradado de fondo (`bg-app`) |
| `surface-solid` | Blanco | `#ffffff` | Tarjetas interiores, formularios, filas |
| `surface-glass` | Blanco translúcido | `#ffffff` al 70 % (`sm:bg-white/70`) | Marco L1 (desde 640 px) |
| `text-primary` | Tinta | `#0f172a` | Texto principal (17.85:1 sobre blanco) |
| `text-muted` | Gris texto | `#475569` | Texto secundario (7.58:1 sobre blanco) |
| `border-subtle` | Borde de cristal | `#ffffff` al 40 % (`border-white/40`) | Canto del marco |
| `border-strong` | Borde de control | `#64748b` | Campos y botones secundarios |
| `pastel-mint` / `pastel-cream` / `pastel-sky` | Micro-etiquetas | `#d9f5e6` / `#fbf5dc` / `#dbeafe` | Etiquetas de categoría (texto `#14532d` / `#713f12` / `#1e3a8a`) |
| `danger` | Rojo de error | `#b91c1c` (texto `#991b1b` sobre `#fef2f2`) | Errores y eliminación |

### 2.2 Colores de dominio (sin cambio de significado)

| Token | Fondo | Texto | Contraste |
|---|---|---|---|
| `owner-1` (`OWNER_COLOR_1`) | `#1d4ed8` | `#ffffff` | 6.70:1 |
| `owner-2` | `#047857` | `#ffffff` | 5.48:1 |
| `owner-3` | `#b91c1c` | `#ffffff` | 6.47:1 |
| `owner-4` | `#7e22ce` | `#ffffff` | 6.98:1 |
| `owner-5` | `#b45309` | `#ffffff` | 5.02:1 |
| `owner-6` | `#0f766e` | `#ffffff` | 5.47:1 |
| `owner-7` | `#be185d` | `#ffffff` | 6.04:1 |
| `owner-8` (`OWNER_COLOR_8`) | `#4338ca` | `#ffffff` | 7.90:1 |

Fuente: `OWNER_COLORS` y `OWNER_TEXT_COLOR` de `view-model.ts`. Ninguno se aclara.

**Semáforo sanitario (`UI_BADGE_STYLE`, `uiBadge`):**

| `uiBadge` | Fondo | Texto | Borde | Contraste |
|---|---|---|---|---|
| `DANGER_RED` | `bg-red-100` | `text-red-900` (`#7f1d1d`) | `border-red-700` | 8.20:1 |
| `WARNING_AMBER` | `bg-amber-100` | `text-amber-900` (`#78350f`) | `border-amber-700` | 8.15:1 |
| `SUCCESS_GREEN` | `bg-emerald-100` | `text-emerald-900` (`#064e3b`) | `border-emerald-700` | 8.57:1 |
| `NEUTRAL_GRAY` | `bg-slate-100` | `text-slate-800` (`#1e293b`) | `border-slate-500` | 13.35:1 |

El texto siempre acompaña al color: el `label` del `alert` y el prefijo "Semáforo {color}: " para lector de pantalla.

### 2.3 Tipografía

- **Familia:** pila del sistema, sin fuentes web (requiere autorización de Neo, no concedida para web fonts). `font-sans`: `ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif`.
- **Datos numéricos:** `tabular-nums` en edades, pesos, medidas, fechas, contadores y tablas.

| Uso | Clase | Tamaño / line-height | Peso |
|---|---|---|---|
| Wordmark "Argos" | `text-lg` | 18/28 | 700, `tracking-tight` |
| Titular de la mascota (hero, `h2`) | `text-4xl lg:text-5xl` | 36/40 y 48/52 | 700 |
| Título de página (`h1`) | `text-2xl` | 24/32 | 700 |
| Título de tarjeta (`h3`) | `text-lg` | 18/28 | 600 |
| Cifra del bento | `text-2xl` | 24/32 | 700, `tabular-nums` |
| Cuerpo | `text-base` | 16/24 | 400 |
| Apoyo y metadatos | `text-sm` | 14/20 | 400, `text-muted` |
| Etiqueta de campo | `text-sm` | 14/20 | 600 |
| Micro-etiqueta | `text-xs` | 12/16 | 600 |

Regla: líneas de párrafo ≤ 80 caracteres (`max-w-prose`).

### 2.4 Radios, espaciado, sombras y superficies

| Elemento | Clases |
|---|---|
| Marco principal (L1) | `bg-white/90 sm:bg-white/70 sm:supports-[backdrop-filter]:backdrop-blur-md border border-white/40 rounded-3xl shadow-[0_8px_32px_rgba(15,23,42,0.06)] p-4 sm:p-6` |
| Marco de autenticación | Misma regla; `p-6` |
| Tarjeta interior (edad, peso, hogar, formularios, módulo) | `bg-white border border-slate-200 rounded-2xl shadow-sm p-4` (sin blur) |
| Tarjeta de alertas (bloque oscuro) | `bg-primary text-white rounded-2xl p-5 shadow-sm` (sin blur) |
| Avatar del riel y del hero | `rounded-full` (ver 4.2) |
| Riel item activo | `bg-accent-soft border-2 border-primary` |
| Diálogo `alertdialog` (en línea, `aria-modal="false"`) | `bg-red-50 border-2 border-danger rounded-2xl p-4` sin velo y sin blur |
| Botón principal | `rounded-full bg-primary text-white min-h-12 px-5 font-semibold hover:bg-primary-hover disabled:opacity-60` |
| Botón secundario | `rounded-full border border-primary text-primary bg-white min-h-12 px-5 font-semibold hover:bg-meadow` |
| Botón sobre oliva (secundario invertido) | `rounded-full bg-white text-primary min-h-12 px-5 font-semibold hover:bg-meadow` (9.41:1) |
| Botón de peligro | `rounded-full bg-danger text-white min-h-12 px-5 font-semibold hover:bg-red-800` |
| Pestaña activa | `rounded-full bg-accent text-primary font-semibold min-h-12 px-4` |
| Pestaña inactiva | `rounded-full text-primary font-medium min-h-12 px-4 hover:bg-white` |
| Campo de texto / select | `rounded-xl border border-border-strong bg-white px-3 py-3 min-h-12 text-text-primary placeholder:text-slate-500` |

- **Espaciado:** múltiplos de 4 px (`gap-2`=8, `gap-3`=12, `gap-4`=16, `gap-6`=24). Gutter lateral 16 px; 24 px desde `sm`.
- **Radios:** `rounded-full` (píldoras, avatares), `rounded-2xl` (tarjetas), `rounded-3xl` (marcos).
- **Sombras:** solo la del marco y `shadow-sm` en tarjetas.

### 2.5 Fondo y presupuesto de `backdrop-filter`

| Capa | Elemento | Blur | Máximo |
|---|---|---|---|
| L0 | `body`: degradado `bg-app` (`sky` → `meadow` → `cream`) + `bg-deco` (líneas concéntricas, `primary` al 8 %, `aria-hidden`, `pointer-events-none`) | No | — |
| L1 | Marco principal (rutas autenticadas) y marco de autenticación | `backdrop-blur-md` solo ≥ 640 px y con soporte | **1** en tablet y escritorio; **0** en móvil < 640 px |
| — | Cabecera (dentro del marco, sin blur propio), tarjetas, bento, riel, pestañas, diálogos en línea | **Prohibido** | 0 |

Garantía: como máximo un `backdrop-filter` activo en cualquier viewport. `bg-deco` se oculta en < 640 px.

**Contraste del marco (peor caso):** texto sobre marco al 70 % (compuesto `#f3f7f5`) y sobre marco al 90 % (`#fbfcfc`). Ver 2.6.

### 2.6 Matriz de contraste

Cálculo WCAG 2.1 (luminancia relativa). Se conservan los 59 pares de v1.1 (0 fallos). Pares nuevos de v2.0:

| Combinación | Texto / fondo | Ratio | Estado |
|---|---|---|---|
| Texto principal sobre marco 70 % | `#0f172a` / `#f3f7f5` | 16.52:1 | ✔ AA |
| Texto muted sobre marco 70 % | `#475569` / `#f3f7f5` | 7.01:1 | ✔ AA |
| Enlace de navegación inactivo (oliva sobre marco 70 %) | `#1d4f3a` / `#f3f7f5` | 8.71:1 | ✔ AA |
| Pestaña de navegación activa (oliva sobre lima) | `#1d4f3a` / `#c5f35a` | 7.32:1 | ✔ AA |
| Texto blanco sobre tarjeta de alertas | `#ffffff` / `#1d4f3a` | 9.41:1 | ✔ AA |
| Botón secundario invertido (oliva sobre blanco) | `#1d4f3a` / `#ffffff` | 9.41:1 | ✔ AA |
| Iniciales de avatar sin dueño (blanco sobre musgo) | `#ffffff` / `#35573f` | 8.12:1 | ✔ AA |
| Iniciales de avatar con dueño | `#ffffff` / `owner-N` | 5.02 a 7.90:1 | ✔ AA |
| Insignia "Solo lectura" | `#1e293b` / `#ffffff` con borde `border-strong` | 14.63:1 | ✔ AA |
| Foco sobre cabecera-marco (lima sobre oliva) | `#c5f35a` / `#1d4f3a` | 7.32:1 | ✔ AA no-texto |
| **Lima como texto o anillo sobre blanco (prohibido)** | `#c5f35a` / `#ffffff` | **1.29:1** | ✘ no se usa |

**Reglas:** el lima nunca es texto ni borde sobre blanco; el texto sobre lima es `primary`; el texto de insignias de dueño es blanco; el color nunca transmite solo: siempre hay texto y, en el semáforo, el `uiBadge` visible o su texto.

### 2.7 Foco, toque y movimiento

- **Foco visible:** `focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-white`. Sobre la tarjeta de alertas (oliva): `focus-visible:ring-accent focus-visible:ring-offset-primary`.
- **Área táctil:** ≥ 48 × 48 px en botones, pestañas, casillas, campos, opciones del riel y botones del avatar.
- **Movimiento:** sin animaciones de entrada; transición de color de 150 ms; con `prefers-reduced-motion` se elimina.

---

## 3. Marco compartido y navegación (`AppShell`)

### 3.1 Estructura

```
<body>  (bg-app + bg-deco)
  <a href="#main-content">Saltar al contenido</a>      (oculto; visible al foco)
  <div class="marco L1">                               (única capa de blur)
    <header>
      <p>Argos (wordmark)</p>
      <nav aria-label="Principal">Mascotas · Hogares · Respaldo</nav>
      <div>displayName · [Cerrar sesión]</div>
    </header>
    <main id="main-content" tabIndex="-1">…</main>
  </div>
</body>
```

Rutas públicas (`/login`, `/register`): el mismo marco L1 centrado, sin `<header>` de navegación; el `<main id="main-content">` vive dentro.

### 3.2 Cabecera dentro del marco

| Elemento | Especificación |
|---|---|
| Wordmark "Argos" | `text-lg font-bold tracking-tight text-primary`. Texto, sin logo gráfico |
| Navegación (`aria-label="Principal"`) | Tres `NavLink`. Escritorio: fila a la derecha del wordmark. Móvil: fila que envuelve (`flex-wrap`); cada enlace `min-h-12` |
| Enlace "Mascotas" (`to="/"`, `end`) | Activo: `bg-accent text-primary`. Inactivo: `text-primary underline-offset-4 hover:underline` |
| Enlace "Hogares" (`to="/households"`) | Igual; contiene las dos insignias de contadores |
| Insignia `[data-household-count]` | `rounded-full bg-primary text-white px-2 text-xs font-bold tabular-nums` con el número (`aria-hidden`) y el texto "hogares" visible (`aria-hidden`). `sr-only`: "1 hogar" / "N hogares" |
| Insignia `[data-pending-invitations]` | `rounded-full bg-amber-300 text-slate-900 px-2 text-xs font-bold tabular-nums` con el número y "invitaciones" (`aria-hidden`). `sr-only`: "1 invitación pendiente" / "N invitaciones pendientes" |
| Enlace "Respaldo" (`to="/backup"`) | Igual que "Mascotas" |
| Nombre del usuario | `text-sm text-text-primary`. En < 480 px: `sr-only min-[480px]:not-sr-only` |
| "Cerrar sesión" | Botón secundario (`border-primary text-primary`) |

Orden de tabulación = orden visual: salto, wordmark (no focalizable), navegación, nombre, "Cerrar sesión", contenido.

Estados: sin contadores (0) se muestra "0", no se oculta.

---

## 4. `/` — Mascotas (Propuesta A: "Riel y ficha")

Breakpoints: base 320 px, `sm` 640 px, `lg` 1024 px, `xl` 1280 px. Verificar siempre en 320, 1024 y 1280 px.

### 4.1 Composición

**Escritorio (≥ 1024 px):**

```text
+--[ MARCO GLASS · L1 blur ]------------------------------------------------------+
| Argos                       [Mascotas] [Hogares 2 hogares·1 invitación] [Respaldo]  Ana [Cerrar sesión] |
|----------------------------------------------------------------------------------|
| Contexto: (Mis mascotas) (Casa Pérez)                  [Buscar mascota] [Especie v]|
|----------------------------------------------------------------------------------|
| RIEL (listbox)| HERO                                           | ALERTAS (oliva)  |
|  (A) *        |  Argos                       [avatar 96 px]    | 5 alertas activas|
|  (B)          |  Perro · Labrador · Macho · nació 2019-03-02   | ! 2 vencidas     |
|  (C)          |  [Dueño: Ana]  [Solo lectura]                  | ◷ 1 próxima      |
|  (D)          |  [Editar] [Eliminar]                           | ✓ 2 al día       |
|               |------------------------------------------------| Dueño: Ana       |
| [+ Nueva      |  EDAD              |  PESO                     | [Registrar peso] |
|   mascota]    |  4 años, 2 meses   |  28.40 kg                 |                  |
|               |------------------------------------------------|------------------|
|               |  [Peso][Medidas][Vacunas][Desparasitación][Consultas][Parámetros]|
|               |  <details> Registrar peso (abierto si vacío)                     |
|               |  gráfico SVG 600×220 (izq.)  |  tabla de peso (der.)            |
+----------------------------------------------------------------------------------+
```

- Riel: columna de 104 px. Hero y bento: 7/12 y 5/12 de la fila. Edad y peso: 50/50 bajo el hero.
- Módulo: gráfico y tabla en dos columnas desde `lg`.

**Móvil (320 px):**

```text
+------------------------------+
| Argos        [Cerrar sesión] |   marco sin blur (90 %)
| [Mascotas][Hogares 2][Resp.] |
| (Mis mascotas)(Casa Pérez)>> |   pestañas con scroll interno
| [Buscar mascota          ]   |
| [Especie v]                  |
| (A)* (B) (C) (D) [+ Nueva]>> |   riel horizontal, scroll interno
|------------------------------|
| Argos                        |   h2
| Perro · Labrador · Macho     |
| [Dueño: Ana] [Solo lectura]  |
| +--------------------------+ |
| | 5 alertas activas        | |   ALERTAS primero
| | ! 2 vencidas  ◷ 1 próxima| |
| | ✓ 2 al día               | |
| | Dueño: Ana               | |
| | [Registrar peso]         | |
| +--------------------------+ |
| +-----------++-------------+ |
| | EDAD      || PESO        | |
| | 4 años 2m || 28.40 kg    | |
| +-----------++-------------+ |
| [Peso][Medidas][Vacunas]>>   |
| <details> o tabla (región)   |
+------------------------------+
```

En móvil las alertas van antes que edad y peso: responde "¿qué requiere atención?" en menos de 2 segundos.

### 4.2 Riel de mascotas y avatar (D1)

**Contenedor:** `<ul role="listbox" aria-label="Mascotas">`. Escritorio: columna vertical de 104 px, scroll interno con `max-h-[36rem]`. Móvil: fila horizontal `overflow-x-auto` (`flex`, `snap-x`).

**Opción:** `<li role="option" aria-selected data-pet-id tabIndex>`; dentro: avatar (64 px), nombre (`text-sm font-semibold`, una línea con elipsis; el nombre completo queda en el nombre accesible) y un texto de estado: "N vencidas" (rojo: `bg-red-100 text-red-900`) o "N próximas" (ámbar: `bg-amber-100 text-amber-900`); si no hay alertas, sin texto de estado. Área ≥ 48 px.

**Nombre accesible de la opción:** "{nombre}, N vencidas" (o "{nombre}, N próximas", o solo "{nombre}"). Compatible con búsquedas por nombre parcial.

**Teclado:** flechas arriba/abajo **y** izquierda/derecha (aceptadas en ambos layouts); Inicio, Fin, Enter y Espacio seleccionan. Foco roving: `tabIndex=0` en la opción activa, `-1` en las demás.

**Avatar (`PetAvatar`), reglas de render según `avatarUrl`:**

| Valor de `avatarUrl` | Render | Notas |
|---|---|---|
| Nulo | Círculo con iniciales | Caso habitual |
| `data:image/png\|jpeg\|webp;base64,…` | `<img src alt="" >` | Sin petición de red |
| `http://` o `https://` | `<img src alt="" referrerPolicy="no-referrer" loading="lazy">` con `onError` | Al fallar (red, 404, bloqueo) cambia a iniciales. La recarga de página no reintenta el fallo |
| Cualquier otro | Iniciales | No se renderiza el valor |

**Iniciales:** primera letra de las dos primeras palabras del nombre, en mayúscula; `text-lg font-bold text-white`; fondo `owner-N` si hay `colorToken`, o musgo `#35573f` si no.

**Glifo de especie:** insignia de 20 px en la esquina inferior derecha del avatar, SVG en línea (`currentColor`, `aria-hidden`). Para `CANINE` y `FELINE` (las dos especies que hoy ofrece la UI) y para el resto, una huella genérica. Los glifos específicos por las 8 especies quedan para una iteración posterior; no se añaden dependencias.

**Aro de dueño:** si hay `colorToken`, anillo de 3 px del color del dueño alrededor del avatar (decorativo; el texto "Dueño: …" está en el hero).

**Privacidad (nota de Rama):** `referrerPolicy="no-referrer"` evita enviar la URL de la app, pero el navegador sigue haciendo la petición al servidor de la imagen (dirección IP y momento de la visita). Esa exposición la acepta Neo al decidir D1. Keymaker debe documentarla en el informe de implementación.

### 4.3 Hero y bento de la ficha

Contenedor de la ficha: `<article aria-labelledby="pet-title" data-pet-id="<id>">`. Grid: `grid grid-cols-2 gap-3 lg:grid-cols-12`.

| Pieza | Escritorio | Móvil | Contenido (campo real) | Superficie |
|---|---|---|---|---|
| **Hero** | 7 columnas | 2 columnas | `h2#pet-title` con `profile.name`; línea "Especie · raza · sexo · nació AAAA-MM-DD" (`profile.species`, `breed`, `sex`, `birthDate`); insignia de dueño (`owner`); "Solo lectura" si `!permissions.editPetBasics`; avatar 96 px (ver 4.2); botones "Editar" y "Eliminar" según permisos | Blanca, `rounded-2xl` |
| **Alertas** | 5 columnas, 2 filas | fila completa | Ver 4.4 | **Oliva `bg-primary`, texto blanco** |
| **Edad** | 3 columnas bajo el hero | 1 columna | `computedAge`: "N años, M meses" | Blanca |
| **Peso** | 4 columnas bajo el hero | 1 columna | `latestWeightKg`: "X.XX kg" o "Sin peso" | Blanca |

**Edad:** etiqueta "Edad" (`text-sm text-text-muted`) y valor `text-2xl font-bold tabular-nums`.
**Peso:** etiqueta "Último peso" y valor en `text-2xl font-bold tabular-nums`. Sin variación en % (no existe en el contrato).

### 4.4 Tarjeta de alertas (oliva, D3)

| Línea | Campo | Texto visible | Icono (SVG, `aria-hidden`) |
|---|---|---|---|
| Título `h3` | — | "Alertas sanitarias" | — |
| Total | `alertsSummary.totalActiveAlerts` | "N alertas activas" (`text-2xl font-bold tabular-nums`) | — |
| Vencidas | `alertsSummary.overdueCount` | "N vencidas" | Triángulo de aviso |
| Próximas | `alertsSummary.dueSoonCount` | "N próximas" | Reloj |
| Al día | `alertsSummary.upToDateCount` | "N al día" | Marca de verificación |
| Dueño | `owner.displayName` | "Dueño: nombre" | — |
| Acción | — | "Registrar peso" (solo si `permissions.editPetBasics`) | — |

- Cada línea tiene icono, número y texto: cumple el "doble código" sin depender del color.
- La línea de vencidas usa `data-alert-status` solo en las insignias del semáforo de los registros; aquí no se duplica el atributo.
- Acción "Registrar peso": abre el módulo Peso y su formulario (4.5). Es la única acción rápida; no hay controles sin endpoint.
- Sin alertas: "0 alertas activas" y "Todo al día" (copy de apoyo, no métrica nueva).
- Textos y color en blanco sobre oliva: 9.41:1.

### 4.5 Módulos de registros y formularios (D2)

**Pestañas de módulo:** `role="tablist"` `aria-label="Módulos de la ficha"`; seis pestañas (Peso, Medidas, Vacunas, Desparasitación, Consultas, Parámetros), `id="module-tab-<id>"`, `aria-controls="module-panel-<id>"`. Activa: `bg-accent text-primary`.

**Panel del módulo:** `role="tabpanel"` `id="module-panel-<id>"` `aria-labelledby="module-tab-<id>"` `tabIndex=0`. Orden dentro del panel:

1. **Bloque de registro** (solo si `permissions.editPetBasics`; gating B-3 preservado):
   - **Si el módulo tiene cero registros:** `<details open>` con el formulario visible. Se renderiza abierto.
   - **Si tiene registros:** `<details>` cerrado con `<summary>` en forma de píldora primaria ("Registrar peso", "Registrar medidas", "Registrar vacuna", "Registrar desparasitación", "Registrar consulta", "Registrar parámetro"). Al abrirlo, el formulario queda visible y accesible.
   - **Al guardar no se cierra** (ni el `<details>` ni el formulario). El formulario se limpia y muestra el resultado con `role="status"`.
2. **Contenido del módulo:** lista, tabla, gráfico o texto de vacío (4.6).

Así el formulario está siempre en el DOM y, cuando se muestra, es visible. Las pruebas de `pet-dashboard.spec.ts:58-85` (rellenan `#weights-*` sobre un módulo vacío) quedan cubiertas por el estado "abierto si vacío". **Riesgo declarado:** si una prueba rellena un módulo que ya tiene registros sin pulsar el `summary`, fallará porque el `<details>` estará cerrado. Keymaker debe verificarlo antes de tocar pruebas; si falla, la corrección es añadir el clic en la prueba, no abrir el formulario por defecto.

**Contenido por módulo (solo datos `[UI]`):**

| Módulo | Contenido | Estructura |
|---|---|---|
| Peso | Gráfico SVG y tabla "Evolución de peso" | SVG `viewBox="0 0 600 220"`, `role="img"`, `aria-label` "Evolución de peso: N mediciones, mínimo X, máximo Y". Puntos equiespaciados en orden cronológico, un `<circle>` por medición, línea `primary` de 2 px. Tabla de 4 columnas (`th scope="col"`): Fecha, Peso, Variación (kg), Variación (%) ("—"). `<caption>` solo para lector. Región `role="region"` desplazable con `tabIndex=0` |
| Medidas | Tabla "Medidas corporales" | 5 columnas: Fecha, Cuello, Pecho, Lomo, Cintura; `tabular-nums`; región desplazable |
| Vacunas | Lista | Nombre en negrita; "aplicada AAAA-MM-DD · refuerzo AAAA-MM-DD" o "Sin próxima fecha"; semáforo a la derecha |
| Desparasitación | Lista | Producto en negrita; "(Interna \| Externa) · aplicada … · próxima …"; semáforo |
| Consultas | Lista | "fecha · motivo · clínica"; "Diagnóstico: … Tratamiento: …" en `text-muted` |
| Parámetros | Lista | Categoría (micro-etiqueta pastel), título en negrita y descripción |

**Campos de los formularios (`RecordForm`):** el id de cada control es `<módulo>-<campo>`; `*` = obligatorio en la UI.

| Módulo | Título `h3` | Campos (etiqueta → tipo) |
|---|---|---|
| `weights` | Registrar peso | Fecha* (fecha), Peso (kg)* (número, `step="0.01"`), Notas (texto) |
| `measurements` | Registrar medidas | Fecha* (fecha), Cuello (cm)* , Pecho (cm)*, Largo de lomo (cm)*, Cintura (cm)* (número, `step="0.01"`), Notas |
| `vaccinations` | Registrar vacuna | Vacuna* (texto), Fecha de aplicación* (fecha), Próximo refuerzo* (fecha), Lote o clínica (texto), Notas |
| `dewormings` | Registrar desparasitación | Producto* (texto), Tipo* (select: Interna, Externa; inicial Interna), Fecha de aplicación* (fecha), Próxima dosis* (fecha), Notas |
| `visits` | Registrar consulta | Fecha de la consulta* (fecha), Motivo*, Diagnóstico*, Tratamiento*, Clínica o veterinario* (texto), Observaciones |
| `customParameters` | Registrar parámetro | Fecha* (fecha), Categoría* (select: Cambio de dieta, Alergia, Cirugía, Comportamiento, Otro; inicial Cambio de dieta), Título*, Descripción* (texto), Notas |

Los botones de envío de todos los registros: "Guardar" (principal).

### 4.6 Formularios de mascota y modos de la ficha

**Modos:** `VIEW` (hero, bento y módulos), `CREATE`, `EDIT`, `DELETE`. Solo un modo a la vez; no cambia la URL.

| Modo | Dónde se muestra | Formulario / diálogo | Foco al abrir |
|---|---|---|---|
| `CREATE` | Sustituye la ficha en "Mis mascotas". Panel a ancho completo en móvil y en escritorio | `PetForm` (`aria-labelledby="new-pet-title"`); botones "Guardar" y "Cancelar" | `h2` del formulario |
| `EDIT` | Sección superior de la ficha, sustituye el hero y el bento mientras dura | `PetForm` (`aria-labelledby="edit-pet-<id>-title"`) y, si `permissions.assignPetToHouseholds`, `PetAssignments` | `h2` del formulario |
| `DELETE` | Bloque en línea bajo el hero | `alertdialog` (ver abajo) | Título del diálogo |

Campos de `PetForm` (sin cambios respecto a v1.1): Nombre*, Especie* (select: Perro, Gato; inicial Perro), Raza*, Fecha de nacimiento*, Sexo* (select: Macho, Hembra; inicial Macho), "URL del avatar (opcional)" (tipo `url`), y en `CREATE` "Hogar base (opcional)" (select con "Sin hogar base"). Cada control con etiqueta visible.

**Panel "Hogares de la mascota" (`PetAssignments`):** `fieldset` con leyenda "Hogares de la mascota"; una casilla por hogar del usuario con su nombre. Solo si `permissions.assignPetToHouseholds`.

**Diálogo de eliminación (`DeletePetDialog`, `role="alertdialog"`, `aria-labelledby="delete-pet-title"`, `aria-describedby="delete-pet-desc"`, `aria-modal="false"`):**
- Bloque en línea `bg-red-50 border-2 border-danger rounded-2xl p-4`. Sin velo, sin blur.
- Título "Eliminar a {nombre}". Texto: "Se eliminarán la mascota y todos sus registros. No se puede deshacer; exporta un respaldo antes. Escribe el nombre para confirmar."
- Campo de confirmación con etiqueta visible; "Eliminar definitivamente" deshabilitado hasta que el texto coincida exactamente con el nombre; "Cancelar".

**Mascota sin permiso de edición:** "Solo lectura" visible; sin "Editar", sin "Eliminar", sin formulario de edición, sin bloque de registro en los módulos.

### 4.7 Estados de la lista y la ficha

| Estado | Render |
|---|---|
| Riel sin mascotas (contexto "Mis mascotas") | Texto "No hay mascotas en este contexto." y, debajo, "Usa «Nueva mascota» para añadir la primera." El botón es el único "Nueva mascota" del DOM |
| Riel sin mascotas (contexto hogar) | "No hay mascotas en este contexto." y "Quien sea dueño puede asignar mascotas al hogar desde Editar." |
| Riel con resultados vacíos por búsqueda | "No hay mascotas en este contexto." sin texto adicional |
| Sin selección | "Selecciona una mascota para ver su ficha." |
| Módulo sin registros (con permiso) | "Sin registros." y "Registra el primero con el formulario de arriba." Peso: "Sin mediciones de peso." y "Registra el primer peso para ver la evolución." |
| Módulo sin registros (sin permiso) | "Sin registros." |
| Vacuna o desparasitación sin próxima fecha | Insignia "Sin próxima fecha" (`text-xs text-text-muted`) |

**Nota de microcopy:** las frases de la segunda línea son propuestas nuevas. Si Neo prefiere solo los textos literales de `architecture_spec.md`, se eliminan sin afectar la estructura.

---

## 5. Resto de rutas en el mismo marco

### 5.1 `/login` y `/register`

- **Escritorio (≥ 1024 px):** marco de `max-w-4xl`, dos columnas. Izquierda: wordmark "Argos" como `h1`, subtítulo "Pet Health Tracker" (texto ya presente en `index.html`). Derecha: formulario.
- **Móvil:** marco a ancho completo con margen 16 px; apilado: `h1` "Argos", `h2` con el título ("Iniciar sesión" o "Crear cuenta"), formulario, enlace.
- Sin navegación.

**`/login`:** formulario `aria-label="Iniciar sesión"`; "Usuario" (`autoComplete="username"`), "Contraseña" con "Mostrar contraseña" (`aria-pressed`, `aria-controls`); error general en `role="alert"` (texto exacto "Usuario o contraseña incorrectos." cuando corresponda); botón "Entrar"; enlace "Regístrate".

**`/register`:** formulario `aria-label="Crear cuenta"`; campos en orden: "Usuario (minúsculas, números, . _ -)", "Nombre visible", "Correo (opcional)" (tipo `email`), "Contraseña (10 a 128, con mayúscula, número y símbolo)" con "Mostrar contraseña", "Confirmar contraseña" con "Mostrar contraseña". Errores por campo con `aria-invalid` y `aria-describedby`. Botón "Registrarme"; enlace "Inicia sesión".

### 5.2 `/households`

- **Escritorio (≥ 1024 px):** dos columnas. Izquierda (1/3): bloque "Invitaciones" y "Crear hogar". Derecha (2/3): tarjetas de hogar. **Móvil:** una columna en el mismo orden (Invitaciones, Crear hogar, Hogares).
- **Invitaciones** (`aria-labelledby="invitations-title"`): título `h2` con contador "(N invitaciones pendientes)" o "(1 invitación pendiente)"; por fila: "**Nombre del hogar** · invita Nombre (@usuario)" y "Aceptar" (principal) y "Rechazar" (secundario). Vacío: "No tienes invitaciones pendientes."
- **Crear hogar** (`aria-label="Crear hogar"`): campo "Nombre del nuevo hogar" y "Crear hogar" (principal).
- **Tarjeta de hogar** (`section`, `data-household-id`, `aria-labelledby`): nombre (`h3`), "tu rol: Propietario | Miembro" (`text-sm text-text-muted`). "Eliminar hogar" (peligro) solo si `isHouseholdOwner`.
- **Miembros** (`ul` con `aria-label="Miembros de {nombre}"`): por fila, nombre visible con color de `colorToken` (píldora, texto blanco), "@usuario", estado (`data-membership-status`: "Activo", "Abandonó", "Retirado"), "Propietario" si aplica; acciones "Retirar" (peligro) o "Abandonar hogar" (secundario) según `memberActions`.
- **[FIX B-1] "Invitar miembro"** (`aria-label="Invitar miembro"`, solo si `isHouseholdOwner`): fila con campo "Invitar por usuario" (obligatorio), **select "Rol al unirse"** (`name="roleOnJoin"`, `id="invite-<householdId>-roleOnJoin"`, obligatorio, sin opción vacía; opciones "Administrador" `ADMIN`, "Cuidador" `CAREGIVER`, "Lector" `READER`; inicial `READER`) y botón "Invitar" (principal). Errores por campo; error general en `role="alert"`. Único control nuevo de la página; su valor se envía junto a `username`.
- **Diálogo "Eliminar hogar"** (`role="alertdialog"`, `aria-labelledby="delete-<householdId>"`): bloque en línea bajo la tarjeta: "¿Eliminar el hogar {nombre}? Las mascotas no se borran; dejan de compartirse." "Confirmar eliminación" (peligro) y "Cancelar".
- Vacío de hogares: "Aún no perteneces a ningún hogar."

### 5.3 `/backup`

- **Escritorio y móvil:** una columna con `max-w-3xl`: dos tarjetas blancas.
- **Exportar** (`aria-labelledby="export-title"`): texto "Descarga un archivo JSON con tus mascotas y sus registros. No incluye datos de otros usuarios ni de tus hogares." y "Descargar respaldo" (principal).
- **Importar** (`aria-labelledby="import-title"`): advertencia "Reemplaza todos tus datos por los del archivo (máximo 10 MB). Si el archivo no es válido, no se cambia nada." Etiqueta "Archivo de respaldo (.json)" con `input type="file"` `accept="application/json,.json"` estilizado como botón secundario (`file:` utilities). "Importar respaldo" (principal), deshabilitado sin archivo o en envío.
- Resultado `role="status"`: `rounded-2xl border border-emerald-700 bg-emerald-50 px-4 py-3 text-emerald-900`. Error `role="alert"`.

---

## 6. Estados transversales

| Estado | Render |
|---|---|
| Sesión inicial (`LOADING`) | `<p role="status">Cargando…</p>` dentro del marco; sin cabecera |
| Envío en curso (`busy`) | Botón `disabled` con `opacity-60`, mismo texto; sin spinner |
| Listas y ficha cargando | Sin skeleton ni spinner; el contenedor conserva `min-h-24`. El contrato no define estado de carga |
| Error de campo | `<p id="<campo>-error" class="text-sm text-red-900">` bajo el control; `aria-invalid="true"` y `aria-describedby` |
| Error general de formulario o página | `<p role="alert" class="rounded-2xl border border-red-700 bg-red-50 px-4 py-3 text-red-900">` |
| Error de ficha (carga o eliminación) | Mismo bloque `role="alert"`, dentro de la ficha |
| Error de red o no catalogado | Texto del catálogo `ERR-INTERNAL-UNEXPECTED` |
| Error de importación | `role="alert"` con el texto del catálogo y, si aplica, "No se modificó ningún dato." o "Estado final desconocido: revisa tus datos." |
| Sesión expirada (`401`) | El texto del catálogo en el área de error (la redirección a `/login` queda fuera: B-7) |

**Regla:** el color nunca es el único canal del error. El texto siempre está; el borde `red-700` refuerza.

**Sin dependencias:** los iconos son SVG en línea escritos a mano; no hay librerías nuevas ni fuentes web.

---

## 7. Brand kit

### 7.1 Color multi-canal

RGB exacto. CMYK es la conversión aritmética de RGB, sin perfil ICC; para impresión, convertir con el perfil de la imprenta. Pantone es **orientativo**: la familia cromática; el código exacto se elige en catálogo físico comparando contra el HEX.

| Color | Rol | HEX | RGB | CMYK (aprox.) | Pantone (familia, verificar en catálogo) |
|---|---|---|---|---|---|
| Oliva Argos | Primario | `#1d4f3a` | 29, 79, 58 | 63, 0, 27, 69 | Verde oliva oscuro |
| Musgo | Secundario | `#35573f` | 53, 87, 63 | 39, 0, 28, 66 | Verde musgo |
| Lima Argos | Acento | `#c5f35a` | 197, 243, 90 | 19, 0, 63, 5 | Verde lima brillante |
| Lima suave | Acento de fondo | `#e9fbc4` | 233, 251, 196 | 7, 0, 22, 2 | Verde lima claro |
| Cielo base | Fondo | `#eaf6ff` | 234, 246, 255 | 8, 4, 0, 0 | Azul cielo muy claro |
| Pradera | Fondo | `#e6f2ea` | 230, 242, 234 | 5, 0, 3, 5 | Verde menta muy claro |
| Crema luz | Fondo | `#f4f8ef` | 244, 248, 239 | 2, 0, 4, 3 | Crema muy claro |
| Menta pastel | Pastel | `#d9f5e6` | 217, 245, 230 | 11, 0, 6, 4 | Menta pastel |
| Crema pastel | Pastel | `#fbf5dc` | 251, 245, 220 | 0, 2, 12, 2 | Crema pastel |
| Cielo pastel | Pastel | `#dbeafe` | 219, 234, 254 | 14, 8, 0, 0 | Azul cielo pastel |
| Tinta | Texto | `#0f172a` | 15, 23, 42 | 64, 45, 0, 84 | Azul grisáceo muy oscuro |
| Gris texto | Texto secundario | `#475569` | 71, 85, 105 | 32, 19, 0, 59 | Gris pizarra |
| Blanco | Superficie | `#ffffff` | 255, 255, 255 | 0, 0, 0, 0 | Blanco |

Los colores de dominio (`OWNER_COLOR_1..8`, semáforo) pertenecen a los datos, no a la identidad: no se usan como color de marca en piezas externas.

### 7.2 Proporción 60-30-10

| Proporción | Qué ocupa | En web |
|---|---|---|
| 60 % | Base luminosa: cielo, pradera, crema | Fondo de la app y de autenticación |
| 30 % | Blanco y cristal | Tarjetas, formularios, tablas, marco |
| 10 % | Oliva (identidad, botón principal, tarjeta de alertas) y lima (estado activo) | Cabecera de marco, botón principal, pestaña activa, tarjeta de alertas, foco |

Reglas: el lima no supera el 5 % de la superficie visible; el oliva es la única superficie oscura y solo aparece en la tarjeta de alertas y el botón principal; los pastel solo son micro-etiquetas.

### 7.3 Wordmark

- "Argos", inicial mayúscula, peso 700, `tracking-tight`, pila del sistema. Sin logotipo gráfico todavía.
- Sobre marco claro: oliva `#1d4f3a` (9.41:1 sobre blanco).
- Sobre oliva (tarjeta de alertas o pieza externa oscura): blanco `#ffffff`.
- **Prohibido:** lima sobre blanco; sobre fotos sin velo oscuro; en color de dominio.

### 7.4 Iconografía

- Trazo de 1.5 px a 24 px de lienzo, `stroke-linecap` y `stroke-linejoin` redondeados, sin relleno.
- SVG en línea, `currentColor`, sin librerías.
- Tamaños: 16 px en texto, 20 px en botones, 24 px en cabeceras.
- Decorativos: `aria-hidden="true"`. Un icono que comunica estado siempre va acompañado de texto.

---

## 8. Preservación técnica (checklist obligatorio para Keymaker)

El rediseño cambia clases y disposición, no la semántica. Fuente: `architecture_spec.md` §4.2. Ninguna fila se quita ni se renombra.

**A. Atributos `data-*`**

| Atributo | Elemento | Valor |
|---|---|---|
| `data-pet-id` | Opción del riel y `<article>` de la ficha | `PetProfile.id` |
| `data-owner-badge` | Insignia de dueño | `colorToken` o `none` |
| `data-read-only="true"` | "Solo lectura" | — |
| `data-alert-status` | Insignia del semáforo en registros | `UP_TO_DATE`, `DUE_SOON`, `OVERDUE`, `SUPERSEDED` |
| `data-ui-badge` | Insignia del semáforo en registros | `NEUTRAL_GRAY`, `DANGER_RED`, `WARNING_AMBER`, `SUCCESS_GREEN` |
| `data-household-count` | Insignia de hogares de la cabecera | número |
| `data-pending-invitations` | Insignia de invitaciones de la cabecera | número |
| `data-household-id` | Tarjeta de hogar | `Household.id` |
| `data-membership-status` | Estado de miembro | `ACTIVE`, `LEFT`, `REMOVED` |

**B. Roles y estados ARIA**

| Patrón | Atributos que se conservan |
|---|---|
| Pestañas de contexto | `role="tablist"` `aria-label="Contexto de mascotas"`; `role="tab"`, `id="context-tab-<id>"`, `aria-selected`, `aria-controls="pet-panel"`; panel `id="pet-panel"` `role="tabpanel"` `aria-labelledby="context-tab-<id>"` |
| Riel de mascotas | `role="listbox"` `aria-label="Mascotas"`; opciones `role="option"` con `aria-selected` y `tabIndex` roving |
| Pestañas de módulo | `role="tablist"` `aria-label="Módulos de la ficha"`; `role="tab"`, `id="module-tab-<módulo>"`, `aria-selected`, `aria-controls="module-panel-<módulo>"`; panel `id="module-panel-<módulo>"` `role="tabpanel"` `aria-labelledby` `tabIndex=0` |
| Formularios con nombre | `aria-label` "Iniciar sesión", "Crear cuenta", "Crear hogar", "Invitar miembro"; `role="search"` `aria-label="Filtrar mascotas"`; `aria-labelledby` en alta (`new-pet-title`), edición (`edit-pet-<id>-title`) y registros (`form-<módulo>-title`) |
| Campos | `htmlFor`; con error, `aria-invalid="true"` y `aria-describedby`; asterisco con `aria-hidden` |
| "Mostrar contraseña" | `aria-pressed`, `aria-controls` |
| Mensajes | Errores: `role="alert"`. Resultado de importación y "Cargando…": `role="status"` |
| Diálogos | `role="alertdialog"`: eliminar mascota (`aria-modal="false"`, `delete-pet-title`, `delete-pet-desc`) y eliminar hogar (`aria-labelledby="delete-<householdId>"`) |
| Tablas | `<caption>` solo para lector ("Evolución de peso", "Medidas corporales"), `th scope="col"`, región `role="region"` con `aria-label` y `tabIndex=0` |
| Gráfico | `<svg role="img">` con `aria-label` "Evolución de peso: N mediciones, mínimo X, máximo Y"; un `<circle>` por medición |
| Navegación | `aria-label="Principal"`; `<main id="main-content" tabIndex="-1">`; enlace `href="#main-content"` |
| Semáforo | Texto oculto "Semáforo {color}: " antes del texto visible |

**C. Identificadores de las pruebas E2E**

`#new-pet-name`, `#new-pet-species`, `#weights-recordedAt`, `#weights-weightKg`, `#vaccinations-vaccineName`, `#vaccinations-appliedAt`, `#vaccinations-nextBoosterAt`; patrones `new-pet-<campo>`, `edit-pet-<id>-<campo>`, `<módulo>-<campo>`, `invite-<householdId>`, `household-name`, `login-username`, `login-password`, `register-<campo>`. El `name` de cada control es el nombre del campo del contrato. **[FIX B-1]:** `name="roleOnJoin"`, `id="invite-<householdId>-roleOnJoin"`.

**Nuevo en v2.0 (sin riesgo para E2E existentes):** el riel, el avatar y la tarjeta de alertas no añaden ids nuevos a los controles de prueba. Un único "Nueva mascota" en el DOM.

**D. Selectores y roles de prueba**

`input[type="file"]`, `form[aria-labelledby] input[name="name"]`, `form[aria-labelledby^="edit-pet-"]`, `svg[role="img"] circle`, `table tbody tr`, `getByRole('searchbox')`, `getByRole('status')`, `getByRole('tab', {name})`, `getByRole('option', {name})` (nombre por subcadena), `getByRole('heading', {level: 2})` para la mascota, `getByRole('button', {name: 'Nueva mascota'})` (única instancia).

**E. Textos y nombres accesibles**

- Botones: "Entrar", "Registrarme", "Cerrar sesión", "Nueva mascota", "Guardar", "Cancelar", "Editar" (exacto), "Eliminar" (exacto), "Eliminar definitivamente", "Aceptar", "Rechazar", "Crear hogar", "Invitar", "Eliminar hogar", "Confirmar eliminación", "Retirar", "Abandonar hogar", "Descargar respaldo", "Importar respaldo", "Mostrar contraseña", "Registrar peso" (y equivalentes por módulo).
- Enlaces: "Mascotas", "Hogares", "Respaldo", "Regístrate", "Inicia sesión", "Saltar al contenido".
- Etiquetas: las de `architecture_spec.md` §4.2 C, incluidas "Contraseña (10 a 128, con mayúscula, número y símbolo)" y "Usuario (minúsculas, números, . _ -)".
- Estados: "Cargando…", "No hay mascotas en este contexto.", "Selecciona una mascota para ver su ficha.", "Sin registros.", "Sin mediciones de peso.", "Aún no perteneces a ningún hogar.", "No tienes invitaciones pendientes.", "Solo lectura", "Sin próxima fecha", "Usuario o contraseña incorrectos.", "Dueño: nombre".

**F. Teclado**

- Pestañas de contexto y de módulo: flechas (con ciclo), Inicio, Fin.
- Riel: flechas (las cuatro), Inicio, Fin, Enter, Espacio.
- Foco visible en todo control (2.7).

**G. Responsive**

Sin scroll horizontal de página desde 320 px; `body { min-width: 320px }`; pestañas, riel, tabla y tira con scroll interno; gutter de 16 px.

---

## 9. Verificación, límites y pendientes

| Verificación | Resultado |
|---|---|
| Contrastes (2.6) | Los 59 pares de v1.1 (0 fallos) más los pares nuevos de 2.6: todos ≥ 4.5:1 en texto y ≥ 3:1 en no-texto. El único valor bajo (lima sobre blanco, 1.29:1) está prohibido |
| Presupuesto de blur (2.5) | 1 capa en ≥ 640 px; 0 en móvil. Diálogos en línea sin velo |
| Preservación técnica (8) | Todos los atributos, roles, ids y textos de `architecture_spec.md` §4.2 conservados |
| Mapeo de rutas `[UI]` | Cinco rutas, todos los campos, botones, diálogos (2), tabla y SVG de peso mapeados |
| `[FIX B-1]` | Único control nuevo; marcado en 5.2 |
| Dependencias nuevas | Ninguna |
| Maqueta HTML | `ui_maqueta_v2.html` en la raíz: 320, 1024 y 1280 px (ver entregable de la sesión) |
| Render real en navegador con `axe-core` | **No verificado.** Requiere implementación y la compuerta E2E |

**Pendientes y límites**

1. Auditoría de `/oracle` sobre este documento antes de cualquier cambio en `src/` (orden de Neo).
2. Glifos de especie específicos para las 8 especies: fuera de v2.0 (solo huella genérica).
3. Riesgo E2E de 4.5 (módulos con registros y formularios sin clic previo): Keymaker lo valida antes de editar pruebas.
4. Exposición de IP por imágenes remotas (4.2): documentar en el informe de implementación.
5. Microcopy de segunda línea en vacíos (4.7): Neo confirma.

---

## Apéndice A — Elementos del contrato excluidos de este blueprint

| Elemento | Motivo |
|---|---|
| Cambio de contraseña, perfil y eliminación de cuenta (§3.7) | `[CONTRATO]`, sin pantalla hoy |
| Transferencia de propiedad de mascota y de hogar | `[CONTRATO]`, sin pantalla hoy |
| Cambio de rol de miembros y cancelación de invitaciones | `[CONTRATO]`, sin pantalla hoy |
| Edición y eliminación de registros | `[CONTRATO]`, sin pantalla hoy |
| Vista previa de importación | `[CONTRATO]`, sin pantalla hoy |
| `supersededVaccinations`, `supersededDewormings` | `[CONTRATO]`, no se renderizan (B-8) |
| Especies 3 a 8, `speciesOther`, `estimatedAge`, `birthDateIsEstimate`, `neutered`, `microchipId` | B-5 (T284 pendiente) |
| Rol de cuidador para registros | B-3 (la UI oculta formularios a CAREGIVER) |
| Redirección de sesión expirada | B-7 |
| Variación de peso en % | B-8 (el contrato 002 ya no lo trae) |
| `myRole` | Decisión D3: no se muestra |
| `globalAlertStatus`, `totalDays`, `observations` | `[CONTRATO]`, no se muestran |
| Tema oscuro | No está en el contrato |
| Barra de navegación inferior fija | Descartada en v2.0 (C2) |

## Apéndice B — Decisiones de Neo (2026-11-14)

- **Propuesta A aprobada** como arquitectura visual definitiva.
- **Marco glass único:** L1 blur ≥ 640 px; 0 en móvil 320 px. Bento de 4 piezas con datos reales.
- **D1 avatarUrl:** `data:` prioritario; `http(s)` con `referrerPolicy="no-referrer"` y fallback automático a iniciales y glifo de especie.
- **D2 formularios:** el formulario del módulo activo está en el DOM (abierto si vacío; panel inline accesible si hay registros); no se cierra al guardar.
- **D3 indicadores:** recuento completo de `alertsSummary` en la tarjeta oliva; "Solo lectura" existente; sin `myRole`.
- **Botón "Nueva mascota":** una sola instancia en el DOM.
- **Orden vigente:** no alterar `src/` hasta la auditoría de `/oracle` sobre este documento.

## Apéndice C — Registro de cambios

| Versión | Fecha | Cambio |
|---|---|---|
| 1.0 | 2026-11-14 | Primera versión |
| 1.1 | 2026-11-14 | Auditoría de cobertura, corrección de blur y de comportamiento inventado; decisiones de Neo (5 de 5) |
| 2.0 | 2026-11-14 | Estructura Propuesta A aprobada. Avatar D1, formularios D2, indicadores D3, botón único. Nav dentro del marco (C1), sin barra inferior (C2). Tokens y paleta sin cambio. Archivo v1.1 en `claude/archivo/ui_blueprint-v1.1.md` |
