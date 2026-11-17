# ARGOS — Blueprint de interfaz (diseño visual y de componentes)

- **Fecha:** 2026-11-14. **Autora:** Sati (Art Director & Product Designer). **Versión:** 1.1 (auditada contra `architecture_spec.md`; correcciones en el Apéndice D). **Estado:** REVIEW. Las 5 decisiones del Apéndice C fueron aprobadas por Neo el 2026-11-14; implementación sin despachar (pausa ordenada por Neo).
- **Contrato funcional de entrada (inmutable):** `architecture_spec.md` (raíz del repositorio), secciones 2, 3 y 4.
- **Alcance:** especificación visual y de componentes. No modifica código fuente, contratos ni especificaciones. La implementación la hace `/keymaker` en `src/presentation/web/`.
- **Referencia visual:** la imagen adjunta se usó solo como inspiración de paleta (cielo, verdes naturales, oliva profundo, lima, pastel), de jerarquía de superficies (marco translúcido, tarjetas blancas, bloque oliva) y de tipografía (titulares gruesos, texto ligero). No se toma ningún widget, métrica, botón ni texto de esa imagen (*Mood*, *Water Intake*, *Activity*, *Smart Care*, *Vet Care Tips*, *Upgrade*, *Pet Wellness*, etc.).
- **Convención:** `[UI]` = existe hoy. `[FIX B-1]` = única adición permitida (control `roleOnJoin`). Lo marcado `[CONTRATO]` o `[BRECHA]` (B-3, B-5, B-7, etc.) queda fuera de este blueprint.

---

## 1. Sistema de Design Tokens (CSS / Tailwind v3)

### 1.1 Paleta de marca y de superficies

Los valores HEX se verificaron en disco y en cálculo de contraste (sección 1.5). Se declaran como `theme.extend.colors` en `tailwind.config.ts` (lo implementa Keymaker; aquí solo se fija el valor).

| Token Tailwind | Nombre | HEX | Uso |
|---|---|---|---|
| `primary` | Oliva Argos | `#1d4f3a` | Cabecera, botón principal, texto de enlace activo sobre claro, anillo de foco, bloque de alto contraste |
| `primary-hover` | Oliva profundo | `#173f2f` | Hover de botón principal |
| `secondary` | Musgo | `#35573f` | Botón secundario relleno, títulos de bloque, pestañas activas |
| `accent` | Lima Argos | `#c5f35a` | Estado activo y punto focal. **Solo como fondo**, con texto `primary` encima (7.32:1). Nunca como texto ni como anillo sobre blanco (1.29:1) |
| `accent-soft` | Lima suave | `#e9fbc4` | Fondo de fila seleccionada (tarjeta activa), sin texto de color lima |
| `sky` | Cielo base | `#eaf6ff` | Inicio del degradado de fondo |
| `meadow` | Pradera | `#e6f2ea` | Mitad del degradado de fondo; base del fondo sin blur |
| `cream` | Crema luz | `#f4f8ef` | Final del degradado de fondo |
| `surface-solid` | Blanco | `#ffffff` | Tarjetas interiores, formularios, filas, tablas |
| `surface-glass` | Blanco translúcido | `#ffffff` a 70 % de opacidad (`bg-white/70`) | Marco principal (L1 de blur, ver 1.4) |
| `text-primary` | Tinta | `#0f172a` | Texto principal (17.85:1 sobre blanco) |
| `text-muted` | Gris texto | `#475569` | Texto secundario (7.58:1 sobre blanco; 7.04:1 sobre crema) |
| `border-subtle` | Borde de cristal | `#ffffff` a 40 % (`border-white/40`) | Canto del marco glass |
| `border-strong` | Borde de control | `#64748b` (slate-500) | Bordes de campos y botones secundarios |
| `pastel-mint` | Menta | `#d9f5e6` | Micro-etiqueta informativa (texto `#14532d`, 7.88:1) |
| `pastel-cream` | Crema pastel | `#fbf5dc` | Micro-etiqueta de registros (texto `#713f12`, 7.93:1) |
| `pastel-sky` | Cielo pastel | `#dbeafe` | Micro-etiqueta de contexto (texto `#1e3a8a`, 8.49:1) |
| `danger` | Rojo de error | `#b91c1c` (texto `#7f1d1d` sobre `#fef2f2`) | Errores y eliminación. Texto de error: `#991b1b` sobre `#fef2f2` (7.60:1) |
| `focus` | Anillo de foco | `primary` sobre superficies claras; `accent` sobre `primary` | Ver 1.6 |

**Colores de dominio (no se cambian de significado):**

| Token | HEX de fondo | Texto | Contraste |
|---|---|---|---|
| `owner-1` (`OWNER_COLOR_1`) | `#1d4ed8` | `#ffffff` | 6.70:1 |
| `owner-2` (`OWNER_COLOR_2`) | `#047857` | `#ffffff` | 5.48:1 |
| `owner-3` (`OWNER_COLOR_3`) | `#b91c1c` | `#ffffff` | 6.47:1 |
| `owner-4` (`OWNER_COLOR_4`) | `#7e22ce` | `#ffffff` | 6.98:1 |
| `owner-5` (`OWNER_COLOR_5`) | `#b45309` | `#ffffff` | 5.02:1 |
| `owner-6` (`OWNER_COLOR_6`) | `#0f766e` | `#ffffff` | 5.47:1 |
| `owner-7` (`OWNER_COLOR_7`) | `#be185d` | `#ffffff` | 6.04:1 |
| `owner-8` (`OWNER_COLOR_8`) | `#4338ca` | `#ffffff` | 7.90:1 |

Los 8 colores coinciden con `OWNER_COLORS` de `view-model.ts`. Se conservan tal cual; ninguno se aclara para "armonizar", porque bajaría el contraste por debajo de 4.5:1.

**Semáforo sanitario (`UI_BADGE_STYLE`, `uiBadge` de STATE-ALERT-001):**

| `uiBadge` | Fondo | Texto | Borde | Contraste texto | Color que se nombra |
|---|---|---|---|---|---|
| `DANGER_RED` | `bg-red-100` (`#fee2e2`) | `text-red-900` (`#7f1d1d`) | `border-red-700` | 8.20:1 | Rojo |
| `WARNING_AMBER` | `bg-amber-100` (`#fef3c7`) | `text-amber-900` (`#78350f`) | `border-amber-700` | 8.15:1 | Ámbar |
| `SUCCESS_GREEN` | `bg-emerald-100` (`#d1fae5`) | `text-emerald-900` (`#064e3b`) | `border-emerald-700` | 8.57:1 | Verde |
| `NEUTRAL_GRAY` | `bg-slate-100` (`#f1f5f9`) | `text-slate-800` (`#1e293b`) | `border-slate-500` | 13.35:1 | Gris |

Decisión: el semáforo conserva los tonos semánticos estándar (rojo, ámbar, verde, gris) porque son los que el usuario reconoce como estado. Se integra armónicamente con los pastel de marca mediante el mismo radio de píldora y el mismo borde fino. El texto siempre acompaña al color (`uiBadge` + etiqueta + "Semáforo …" para lector de pantalla).

### 1.2 Degradados y fondo

| Token | Valor | Uso |
|---|---|---|
| `bg-app` | `bg-gradient-to-br from-sky via-meadow to-cream` (`#eaf6ff` → `#e6f2ea` → `#f4f8ef`) | Fondo de `body` en todas las rutas |
| `bg-auth` | igual que `bg-app` | Fondo de `/login` y `/register` |
| `bg-deco` | SVG de líneas concéntricas finas, trazo `primary` a 8 % de opacidad, `aria-hidden="true"`, `pointer-events-none` | Decorativo, detrás del marco. No contiene texto ni controles |

El fondo es sólido en su color base: el degradado nunca baja de `#e6f2ea` en la zona donde hay texto, y el texto siempre se evalúa contra ese mínimo (sección 1.5).

### 1.3 Tipografía

- **Familia:** pila del sistema, sin fuentes web. Razón: las fuentes web requieren autorización de Neo (regla de la guía). La pila es geométrica en iOS/macOS (SF) y limpia en Android/Windows.
  - `font-sans`: `ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif`.
- **Datos numéricos:** clase `tabular-nums` en pesos, medidas, edades, contadores y fechas de tablas.
- **Escala:**

| Uso | Clase | Tamaño / line-height | Peso |
|---|---|---|---|
| Wordmark "Argos" (cabecera) | `text-lg` | 18px / 28px | 700, `tracking-tight` |
| Título de página (`h1`) | `text-2xl` | 24px / 32px | 700 |
| Nombre de mascota en ficha (`h2`) | `text-2xl` | 24px / 32px | 700 |
| Título de sección / tarjeta (`h2`, `h3`) | `text-lg` | 18px / 28px | 600 |
| Texto de cuerpo | `text-base` | 16px / 24px | 400 |
| Texto de apoyo, metadatos | `text-sm` | 14px / 20px | 400, color `text-muted` |
| Etiqueta de campo | `text-sm` | 14px / 20px | 600 |
| Micro-etiqueta (semáforo, contadores) | `text-xs` | 12px / 16px | 600 |

- **Regla de medida:** líneas de texto ≤ 80 caracteres (`max-w-prose` en párrafos).
- **Contraste tipográfico:** títulos en 700 y cuerpo en 400; la jerarquía sale del peso y del tamaño, no de color adicional.

### 1.4 Radios, espaciado, sombras y superficies glass

| Elemento | Clases exactas |
|---|---|
| Marco principal (única capa de blur, solo rutas autenticadas) | `bg-white/90 border border-white/40 rounded-3xl shadow-[0_8px_32px_rgba(15,23,42,0.06)] p-4 sm:p-6 sm:supports-[backdrop-filter]:bg-white/70 sm:supports-[backdrop-filter]:backdrop-blur-md`. Debajo de 640 px: blanco al 90 % **sin blur**. Desde 640 px y solo si el navegador soporta `backdrop-filter`: blanco al 70 % con `backdrop-blur-md`. Sin soporte: se queda en blanco al 90 % |
| Marco de autenticación (`/login`, `/register`) | `bg-white/90 border border-white/40 rounded-3xl shadow-[0_8px_32px_rgba(15,23,42,0.06)] p-6 sm:supports-[backdrop-filter]:bg-white/70 sm:supports-[backdrop-filter]:backdrop-blur-md` (misma regla que el marco principal) |
| Tarjeta interior (tarjeta de mascota, ficha, hogar, formularios, listas) | `bg-white border border-slate-200 rounded-2xl shadow-sm p-4` (**sin blur**) |
| Fila de tabla o lista | `bg-white` con `divide-y divide-slate-200`, sin blur |
| Cabecera (AppShell) | `bg-primary text-white` sólido, sin blur |
| Diálogo `alertdialog` (en línea, no modal, `aria-modal="false"`, igual que hoy) | `bg-red-50 border-2 border-danger rounded-2xl p-4` dentro de la página, **sin velo y sin blur** |
| Botón principal (píldora) | `rounded-full bg-primary text-white min-h-12 px-5 font-semibold hover:bg-primary-hover disabled:opacity-60` |
| Botón secundario (píldora) | `rounded-full border border-primary text-primary bg-white min-h-12 px-5 font-semibold hover:bg-meadow` |
| Botón de peligro (píldora) | `rounded-full bg-danger text-white min-h-12 px-5 font-semibold hover:bg-red-800` |
| Pestaña activa (módulo o contexto) | `rounded-full bg-accent text-primary font-semibold min-h-12 px-4` |
| Pestaña inactiva | `rounded-full text-text-primary font-medium min-h-12 px-4 hover:bg-white` |
| Campo de texto / select | `rounded-xl border border-border-strong bg-white px-3 py-3 min-h-12 text-text-primary placeholder:text-slate-500` (el placeholder `slate-500` da 4.76:1 sobre blanco; el valor por defecto de Tailwind no cumple) |
| Micro-etiqueta de contexto | `rounded-full px-2.5 py-0.5 text-xs font-semibold` + color pastel |

- **Espaciado:** base de 4 px (`gap-1`=4, `gap-2`=8, `gap-3`=12, `gap-4`=16, `gap-6`=24). Gutter lateral en todos los viewports: 16 px (`px-4`), con 24 px desde `sm` (`sm:px-6`).
- **Radios:** `rounded-full` (píldoras y botones), `rounded-2xl` (tarjetas), `rounded-3xl` (marcos glass).
- **Sombras:** solo la del marco glass (`0 8 32 / 6 %`) y `shadow-sm` en tarjetas. Ninguna otra sombra.

### 1.5 Regla de rendimiento para `backdrop-filter` (presupuesto de capas)

| Capa | Elemento | Blur | Máximo activo |
|---|---|---|---|
| L0 | Fondo de `body` (degradado + `bg-deco`) | No | — |
| L1 | Marco principal: `main` en rutas autenticadas, marco de autenticación en `/login` y `/register` | `backdrop-blur-md` solo desde 640 px y con soporte de `backdrop-filter` | 1 en tablet y escritorio; **0 en móvil (<640 px)** |
| — | Cabecera, tarjetas, badges, pestañas, filas de tabla, campos, botones, diálogos `alertdialog` (son en línea y no modales) | **Prohibido** | 0 |

**Garantía:** en cualquier momento hay como máximo **un** elemento con `backdrop-filter` (el marco L1) en tablet y escritorio, y **ninguno** en móvil. No existe una segunda capa: los diálogos son bloques en línea (`aria-modal="false"`) y no llevan velo. Ninguna tarjeta interior ni fila de tabla lleva blur. Sin soporte de `backdrop-filter`, el marco queda en blanco al 90 % y el contraste no cambia.

**Matriz de contraste garantizado.** Cálculo WCAG 2.1 (luminancia relativa) sobre los valores de este blueprint. Peor caso de fondo del marco: la línea decorativa `bg-deco` al 8 % sobre `meadow` (`#d6e5dc`), y sobre él el marco: blanco al 70 % da `#f3f7f5`, al 90 % `#fbfcfc`, al 95 % `#fdfefd`. Los colores de Tailwind usados (`red-50/100/700/800/900`, `amber-100/300/700/900`, `emerald-50/100/700/900`, `slate-100/200/500/800/900`) se leyeron de la librería instalada y coinciden con los valores de este documento. Los 8 `OWNER_COLORS` y los 4 estilos de `UI_BADGE_STYLE` se leyeron de `view-model.ts` y coinciden con las tablas de 1.1.

| Combinación | Texto / fondo | Ratio | Estado |
|---|---|---|---|
| Texto principal sobre blanco | `#0f172a` / `#ffffff` | 17.85:1 | ✔ AA |
| Texto principal sobre marco glass al 70 % (compuesto peor caso `#f3f7f5`) | `#0f172a` / `#f3f7f5` | 16.52:1 | ✔ AA |
| Texto muted sobre marco glass al 70 % | `#475569` / `#f3f7f5` | 7.01:1 | ✔ AA |
| Enlace y título en oliva sobre marco glass al 70 % | `#1d4f3a` / `#f3f7f5` | 8.71:1 | ✔ AA |
| Texto muted sobre marco al 90 % (móvil, sin blur) | `#475569` / `#fbfcfc` | 7.37:1 | ✔ AA |
| Texto muted sobre marco al 95 % (respaldo sin `backdrop-filter`) | `#475569` / `#fdfefd` | 7.50:1 | ✔ AA |
| Texto muted directo sobre fondo con línea decorativa (sin marco) | `#475569` / `#d6e5dc` | 5.81:1 | ✔ AA |
| Texto muted sobre tarjeta activa (`accent-soft`) | `#475569` / `#e9fbc4` | 6.88:1 | ✔ AA |
| Texto principal sobre tarjeta activa | `#0f172a` / `#e9fbc4` | 16.20:1 | ✔ AA |
| Texto oliva sobre tarjeta activa | `#1d4f3a` / `#e9fbc4` | 8.54:1 | ✔ AA |
| Título de diálogo (`danger` sobre `red-50`) | `#b91c1c` / `#fef2f2` | 5.91:1 | ✔ AA |
| Texto de diálogo y error (`red-900` sobre `red-50`) | `#7f1d1d` / `#fef2f2` | 9.16:1 | ✔ AA |
| Texto de resultado (`emerald-900` sobre `emerald-50`) | `#064e3b` / `#ecfdf5` | 9.23:1 | ✔ AA |
| Insignia de invitaciones (`slate-900` sobre `amber-300`) | `#0f172a` / `#fcd34d` | 12.38:1 | ✔ AA |
| Botón de peligro y su hover | `#ffffff` / `#b91c1c` y `#991b1b` | 6.47:1 y 8.31:1 | ✔ AA |
| Texto de "Solo lectura" | `#1e293b` / `#ffffff` | 14.63:1 | ✔ AA |
| Placeholder de campos (`slate-500`) | `#64748b` / `#ffffff` | 4.76:1 | ✔ AA |
| Borde de control (`slate-500`, no texto) | `#64748b` / `#ffffff` | 4.76:1 | ✔ AA no-texto (≥3:1) |
| Borde de error (`red-700`, no texto) | `#b91c1c` / `#fef2f2` | 5.91:1 | ✔ AA no-texto |
| Texto muted sobre blanco | `#475569` / `#ffffff` | 7.58:1 | ✔ AA |
| Texto muted sobre crema | `#475569` / `#f4f8ef` | 7.04:1 | ✔ AA |
| Botón principal (texto blanco sobre oliva) | `#ffffff` / `#1d4f3a` | 9.41:1 | ✔ AA |
| Botón secundario (texto oliva sobre blanco) | `#1d4f3a` / `#ffffff` | 9.41:1 | ✔ AA |
| Pestaña activa (texto oliva sobre lima) | `#1d4f3a` / `#c5f35a` | 7.32:1 | ✔ AA |
| Anillo de foco sobre superficie clara | `#1d4f3a` / `#ffffff` | 9.41:1 | ✔ AA no-texto (≥3:1) |
| Anillo de foco sobre cabecera oliva | `#c5f35a` / `#1d4f3a` | 7.32:1 | ✔ AA no-texto |
| Texto de error | `#991b1b` / `#fef2f2` | 7.60:1 | ✔ AA |
| Micro-etiqueta menta | `#14532d` / `#d9f5e6` | 7.88:1 | ✔ AA |
| Micro-etiqueta crema | `#713f12` / `#fbf5dc` | 7.93:1 | ✔ AA |
| Micro-etiqueta cielo | `#1e3a8a` / `#dbeafe` | 8.49:1 | ✔ AA |
| Texto blanco sobre cabecera oliva | `#ffffff` / `#1d4f3a` | 9.41:1 | ✔ AA |
| Insignias de dueño (8 colores) | `#ffffff` / `owner-N` | 5.02 a 7.90:1 | ✔ AA (ver 1.1) |
| Semáforo (4 combinaciones) | ver 1.1 | 8.15 a 13.35:1 | ✔ AA |
| **Lima como texto o anillo sobre blanco (prohibido)** | `#c5f35a` / `#ffffff` | **1.29:1** | ✘ no se usa |

**Reglas que la garantizan:** el lima nunca es texto ni borde sobre blanco; el texto sobre lima siempre es `primary`; el texto de cualquier insignia de dueño siempre es blanco; el color nunca transmite por sí solo (siempre hay texto y, en el semáforo, el texto del `uiBadge`).

### 1.6 Foco, toque y movimiento

- **Foco visible (todos los controles):** `focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-white`. En la cabecera oliva: `focus-visible:ring-accent focus-visible:ring-offset-primary`.
- **Área táctil:** mínimo 48×48 px (`min-h-12` = 48 px) en botones, pestañas, casillas, filas de la lista de mascotas y campos.
- **Movimiento:** sin animaciones de entrada; transiciones de color de 150 ms. Respeto a `prefers-reduced-motion` (sin transiciones).

---

## 2. Arquitectura del Fondo y Marco Compartido (`AppShell`)

### 2.1 Fondo

| Viewport | Comportamiento |
|---|---|
| Desktop (≥1024 px) | Degradado `bg-app` sobre `body` a pantalla completa. `bg-deco` visible en el borde superior derecho. Marco L1 centrado con `max-w-7xl` |
| Tablet (640–1023 px) | Igual que desktop, marco a ancho completo con margen de 24 px |
| Mobile (320–639 px) | Igual; `bg-deco` se oculta (reduce ruido visual y coste de render). Marco a ancho completo con margen de 16 px |

Nunca hay texto sobre el `bg-deco`. Desde 320 px, `body` tiene `min-width: 320px` (regla existente en `styles.css`).

### 2.2 Cabecera (`ShellHeader`, solo rutas autenticadas)

Estructura de arriba abajo en mobile y en una sola fila en desktop:

```
[Enlace "Saltar al contenido" (oculto; visible al foco)]
<header bg-primary text-white>
  <p (wordmark) "Argos">       <nav aria-label="Principal">   <div usuario + "Cerrar sesión">
```

| Elemento | Especificación |
|---|---|
| Enlace de salto | `sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:rounded-full focus:bg-white focus:px-4 focus:py-2 focus:text-primary` (mismo `href="#main-content"`) |
| Wordmark | Texto "Argos" con `text-lg font-bold tracking-tight text-white` (ver 5.3). Sin logo gráfico |
| Navegación (`aria-label="Principal"`) | Tres `NavLink`. Mobile: fila que envuelve (`flex-wrap`); cada enlace `min-h-12` |
| Enlace "Mascotas" (`to="/"`, `end`) | Activo: `bg-accent text-primary`. Inactivo: `text-white underline-offset-4 hover:underline` |
| Enlace "Hogares" (`to="/households"`) | Igual; contiene dos insignias (abajo) |
| Insignia de hogares `[data-household-count]` | Pastilla `rounded-full bg-white text-primary px-2 text-xs font-bold` con el número (`aria-hidden`), y el texto "hogares" visible junto al número (`aria-hidden`). Texto accesible `sr-only` ("1 hogar" / "N hogares") |
| Insignia de invitaciones `[data-pending-invitations]` | Pastilla `rounded-full bg-amber-300 text-slate-900 px-2 text-xs font-bold` con el número y "invitaciones" visible (`aria-hidden`). Texto accesible `sr-only` ("1 invitación pendiente" / "N invitaciones pendientes") |
| Enlace "Respaldo" (`to="/backup"`) | Igual que "Mascotas" |
| Nombre del usuario | `text-sm text-white` (`displayName` de `UserSelfProfile`). Mobile (<480 px): se oculta visualmente con `sr-only min-[480px]:not-sr-only` para ganar espacio y sigue disponible para lectores de pantalla |
| "Cerrar sesión" | `rounded-full bg-white text-primary min-h-12 px-4 font-semibold` (botón secundario sobre oliva; contraste 9.41:1) |

**Estados de la cabecera:** sin contadores (0) se muestran como "0" sin ocultarse (el dato existe y es cero). Sin sesión no hay cabecera.

### 2.3 Contenido (`<main id="main-content" tabIndex="-1">`)

- Rutas autenticadas: el contenido vive dentro del marco L1 (`bg-white/70 backdrop-blur-md border border-white/40 rounded-3xl p-4 sm:p-6`).
- Rutas públicas: el marco L1 de autenticación ocupa el centro; no hay cabecera.
- `tabIndex="-1"` en `main` se mantiene para el enfoque programático tras el salto.

---

## 3. Layout, Jerarquía y Mapeo por Ruta

Breakpoints: base (320 px), `sm` (640 px), `lg` (1024 px), `xl` (1280 px). Probar siempre en 320, 768, 1024 y 1280 px.

### 3.1 `/login`

**Distribución**
- **Mobile (320 px):** marco de autenticación a ancho completo con margen 16 px. Orden vertical: título "Argos" (`h1`), subtítulo "Iniciar sesión" (`h2`), formulario, enlace "Regístrate".
- **Desktop (≥1024 px):** marco centrado de `max-w-md` (448 px) sobre el degradado.

**Mapeo de componentes**

| Elemento de `architecture_spec.md` (§3.1) | Componente visual |
|---|---|
| Formulario "Iniciar sesión" (`aria-label`) | `<form>` dentro del marco: `grid gap-4` |
| Campo "Usuario" (`username`) | Campo de texto, `autoComplete="username"`, obligatorio (asterisco `aria-hidden`) |
| Campo "Contraseña" (`password`) | Campo con botón "Mostrar contraseña" (`aria-pressed`, `aria-controls`); botón secundario pequeño (`min-h-12`) dentro del campo |
| Error general (`role="alert"`) | Bloque `rounded-2xl border border-danger bg-red-50 px-4 py-3 text-red-900` (7.60:1) |
| Botón "Entrar" (submit, `busy`) | Botón principal píldora; deshabilitado con `opacity-60` mientras envía |
| Enlace "Regístrate" | Enlace `text-primary font-semibold underline` |

### 3.2 `/register`

**Distribución**
- **Mobile:** una columna. Campos en orden: usuario, nombre visible, correo (opcional), contraseña, confirmar contraseña. Botón al final.
- **Desktop (≥1024 px):** marco de `max-w-lg` (512 px), campos a una columna (el formulario es corto y de lectura lineal).

**Mapeo de componentes**

| Elemento (§3.2) | Componente visual |
|---|---|
| Formulario "Crear cuenta" | `<form>` en el marco de autenticación |
| "Usuario (minúsculas, números, . _ -)" | Campo de texto; ayuda visible bajo la etiqueta (`text-sm text-text-muted`) |
| "Nombre visible" | Campo de texto |
| "Correo (opcional)" | Campo `type="email"`; la etiqueta indica "(opcional)" |
| "Contraseña (10 a 128, con mayúscula, número y símbolo)" | Campo con "Mostrar contraseña"; la etiqueta incluye la regla completa |
| "Confirmar contraseña" | Campo con "Mostrar contraseña" |
| Errores por campo | `aria-invalid="true"` + `aria-describedby` apuntando a un párrafo `text-sm text-red-900` bajo el campo |
| Error general (`role="alert"`) | Igual que `/login` |
| Botón "Registrarme" | Botón principal píldora |
| Enlace "Inicia sesión" | Enlace `text-primary font-semibold underline` |

### 3.3 `/` — Mascotas (la pantalla principal)

**Distribución**

| Zona | Mobile (320–1023 px) | Desktop (≥1024 px) |
|---|---|---|
| Selector de contexto (`tablist`) | Fila horizontal con scroll (`overflow-x-auto`), pestañas de 48 px de alto | Igual, con el mismo ancho del panel |
| Columna izquierda: filtro + botón "Nueva mascota" + lista de tarjetas | Apilada encima de la ficha. Lista de tarjetas en 1 columna (≤ 32 rem de alto con scroll interno) | Columna fija de `22rem`; lista en 1 columna con scroll interno (`max-h-[32rem]`) |
| Columna derecha: ficha de la mascota activa | Debajo de la lista, ancho completo | Columna flexible (`minmax(0,1fr)`) |
| Módulos de la ficha (`tablist`) | Fila con scroll horizontal | Fila completa |

Nota: en mobile la ficha queda debajo de la lista. Seleccionar una mascota no desplaza la pantalla por sí solo: ese comportamiento no existe hoy y este blueprint no lo añade.

**Mapeo de componentes**

| Elemento (§3.4) | Componente visual |
|---|---|
| Pestañas de contexto (`role="tablist"`, `aria-label="Contexto de mascotas"`) | Píldoras: activa `bg-accent text-primary`, inactiva `text-primary` sobre blanco. Cada pestaña `role="tab"` y `id="context-tab-<id>"` |
| Filtro (`role="search"`, `aria-label="Filtrar mascotas"`) | Etiqueta visible "Buscar mascota" y campo de búsqueda (`type="search"`, `aria-label="Buscar mascota por nombre"`, `maxLength=50`, `placeholder="Escribe un nombre"`); etiqueta visible "Filtrar por especie" y selector con "Todas", "Perro", "Gato". Ambos controles con `min-h-12` |
| Botón "Nueva mascota" | Solo en "Mis mascotas". Botón principal píldora |
| Lista de tarjetas (`role="listbox"`, `aria-label="Mascotas"`) | Tarjetas `role="option"` (`li`), `bg-white border rounded-2xl p-4`, `data-pet-id`. Activa: `border-primary ring-2 ring-primary` + fondo `bg-accent-soft`. Inactiva: `border-slate-200` |
| Contenido de cada tarjeta | Nombre (`text-base font-semibold`), línea de especie/edad/peso ("Perro · 3 años, 2 meses · 12.40 kg"), línea "Alertas: N vencidas · M próximas" (`text-sm text-text-muted`), insignia del dueño |
| Insignia del dueño (`data-owner-badge`) | Texto "Dueño: nombre" siempre. Con color (solo en contexto de hogar): píldora con `style` del `OWNER_COLORS` y texto blanco. Sin color: solo texto `text-text-muted` |
| "Solo lectura" (`data-read-only="true"`) | Píldora `border border-border-strong text-slate-800 text-xs font-semibold` |
| Ficha: cabecera de la mascota (`<article aria-labelledby="pet-title" data-pet-id>`) | Tarjeta `bg-white rounded-2xl p-4` con `h2#pet-title` (`text-2xl`), línea de datos ("Especie · raza · sexo · edad · nació AAAA-MM-DD") y "Alertas: …" |
| Botón "Editar" | Secundario píldora; solo si `permissions.editPetBasics` |
| Botón "Eliminar" | Peligro píldora; solo si `permissions.deletePet` |
| Pestañas de módulo (`role="tablist"`, `aria-label="Módulos de la ficha"`) | Seis pestañas: Peso, Medidas, Vacunas, Desparasitación, Consultas, Parámetros. Activa `bg-accent text-primary`; inactiva texto oliva. `id="module-tab-<id>"`, `aria-controls` |
| Panel del módulo (`role="tabpanel"`, `id="module-panel-<id>"`) | Contenedor `bg-white rounded-2xl p-4` |

**Contenido por módulo (solo datos `[UI]`):**

| Módulo | Contenido | Estructura |
|---|---|---|
| Peso | Gráfico SVG (`role="img"`) + tabla "Evolución de peso" | SVG 600×220, puntos equiespaciados en orden cronológico, línea `primary` de 2 px y puntos `primary` de radio 4 (cada punto es un `<circle>`), `aria-label` exacto "Evolución de peso: N mediciones, mínimo X, máximo Y". Tabla de 4 columnas (`<th scope="col">`): Fecha, Peso, Variación (kg), Variación (%) (esta última muestra "—") en `tabular-nums`, con `<caption>` solo para lector de pantalla |
| Medidas | Tabla "Medidas corporales" (región desplazable, `tabIndex=0`) | 5 columnas: Fecha, Cuello, Pecho, Lomo, Cintura; `tabular-nums` |
| Vacunas | Lista (`ul` con `divide-y`) | Por fila: nombre en negrita, "aplicada AAAA-MM-DD · refuerzo AAAA-MM-DD" y la insignia del semáforo a la derecha |
| Desparasitación | Lista | Por fila: producto en negrita, "(Interna|Externa) · aplicada … · próxima …" y semáforo |
| Consultas | Lista | Por fila: "fecha · motivo · clínica" y línea "Diagnóstico: … Tratamiento: …" en `text-muted` |
| Parámetros | Lista | Por fila: categoría (etiqueta pastel), título en negrita y descripción |

**Formularios dentro de la ficha:**

| Formulario | Cuándo aparece | Especificación visual |
|---|---|---|
| Alta de mascota (`PetForm`, `aria-labelledby="new-pet-title"`) | Modo `CREATE` (solo "Mis mascotas") | Tarjeta `bg-white rounded-2xl p-4`, grid de 1 columna en mobile y 2 en `sm`. Campos: Nombre, Especie (select: Perro, Gato; valor inicial Perro), Raza, Fecha de nacimiento (tipo fecha), Sexo (select: Macho, Hembra; valor inicial Macho), "URL del avatar (opcional)" (campo tipo `url`), "Hogar base (opcional)" (select con "Sin hogar base" por defecto). Botones "Guardar" (principal) y "Cancelar" (secundario) en fila |
| Edición de mascota (`PetForm`, `aria-labelledby="edit-pet-<id>-title"`) | Modo `EDIT` con `permissions.editPetBasics` | Igual que el alta sin "Hogar base". Al final, panel "Hogares de la mascota" (ver abajo) solo si `permissions.assignPetToHouseholds` |
| Panel "Hogares de la mascota" (`PetAssignments`, `fieldset`) | Dentro de la edición, solo si `assignPetToHouseholds` | Leyenda "Hogares de la mascota" y una casilla por hogar del usuario con etiqueta visible (nombre del hogar). Casilla ≥48 px de área táctil. Error general (`role="alert"`) arriba del grupo |
| Registro por módulo (`RecordForm`) | Bajo la lista del módulo activo, solo si `permissions.editPetBasics` | Título `h3` según el módulo (tabla siguiente). Grid de 1 columna en mobile y 2 en `sm`. Campos de la tabla siguiente (fuente: `architecture_spec.md` §3.4). Botón "Guardar" |

**Campos de los formularios de registro (`RecordForm`)**: el id de cada control es `<módulo>-<campo>`; `*` = obligatorio en la UI. Los controles de fecha son de tipo fecha (`YYYY-MM-DD`); los numéricos usan `step="0.01"`.

| Módulo | Título del formulario (`h3`) | Campos (etiqueta visible → tipo) |
|---|---|---|
| `weights` | Registrar peso | Fecha* (fecha), Peso (kg)* (número), Notas (texto) |
| `measurements` | Registrar medidas | Fecha* (fecha), Cuello (cm)* (número), Pecho (cm)* (número), Largo de lomo (cm)* (número), Cintura (cm)* (número), Notas (texto) |
| `vaccinations` | Registrar vacuna | Vacuna* (texto), Fecha de aplicación* (fecha), Próximo refuerzo* (fecha), Lote o clínica (texto), Notas (texto) |
| `dewormings` | Registrar desparasitación | Producto* (texto), Tipo* (select: Interna, Externa; valor inicial Interna), Fecha de aplicación* (fecha), Próxima dosis* (fecha), Notas (texto) |
| `visits` | Registrar consulta | Fecha de la consulta* (fecha), Motivo* (texto), Diagnóstico* (texto), Tratamiento* (texto), Clínica o veterinario* (texto), Observaciones (texto) |
| `customParameters` | Registrar parámetro | Fecha* (fecha), Categoría* (select: Cambio de dieta, Alergia, Cirugía, Comportamiento, Otro; valor inicial Cambio de dieta), Título* (texto), Descripción* (texto), Notas (texto) |

**Diálogo de eliminación de mascota (`DeletePetDialog`, `role="alertdialog"`, `aria-describedby`):**
- Bloque `bg-red-50 border-2 border-danger rounded-2xl p-4`, dentro de la ficha (no superpuesto; `aria-modal="false"`).
- Título `h3` "Eliminar a {nombre}" (`text-danger`, `font-semibold`). Texto de advertencia "Se eliminarán la mascota y todos sus registros. No se puede deshacer; exporta un respaldo antes. Escribe el nombre para confirmar."
- Campo de confirmación con etiqueta visible; botón "Eliminar definitivamente" (peligro) deshabilitado hasta que el texto coincida exactamente; botón "Cancelar" (secundario).

**Modos de la ficha:** `VIEW` (ficha y módulos), `CREATE` (alta sobre la ficha), `EDIT` (edición sobre la ficha), `DELETE` (diálogo sobre la ficha). Solo un modo a la vez; el paso entre modos no cambia la URL.

**Mascota ajena o sin permiso de edición:** la cabecera muestra "Solo lectura" (`data-read-only`), no aparecen "Editar" ni "Eliminar", no hay formulario de registro por módulo ni formulario de edición.

### 3.4 `/households` — Hogares

**Distribución**
- **Mobile:** columna única, orden: título "Hogares", bloque "Invitaciones" (lista), formulario "Crear hogar", tarjetas de hogar.
- **Desktop (≥1024 px):** misma secuencia en columna, con ancho máximo `max-w-4xl` para la lectura de tablas de miembros.

**Mapeo de componentes**

| Elemento (§3.5) | Componente visual |
|---|---|
| Título `h1` "Hogares" | `text-2xl font-bold` |
| Bloque "Invitaciones" (`aria-labelledby="invitations-title"`) | Tarjeta `bg-white rounded-2xl p-4`; título `h2` con contador "(N invitaciones pendientes)" o "(1 invitación pendiente)"; lista con `divide-y`. Por fila: "**Nombre del hogar** · invita Nombre (@usuario)" y botones "Aceptar" (principal) y "Rechazar" (secundario) |
| Estado vacío de invitaciones | Texto "No tienes invitaciones pendientes." (`text-text-muted`) |
| Formulario "Crear hogar" (`aria-label`) | Tarjeta `bg-white rounded-2xl p-4`. Campo "Nombre del nuevo hogar" + botón "Crear hogar" (principal); en mobile apilados, en `sm` en fila |
| Tarjeta de hogar (`section`, `data-household-id`, `aria-labelledby`) | Tarjeta `bg-white rounded-2xl p-4`. Cabecera: nombre del hogar (`h3`, `text-lg font-semibold`) + "· tu rol: Propietario | Miembro" (`text-sm text-text-muted`). Botón "Eliminar hogar" (peligro, solo si `isHouseholdOwner`) a la derecha |
| Lista de miembros (`aria-label="Miembros de …"`) | `ul divide-y`. Por fila: nombre visible (con color de `colorToken` si existe, texto blanco sobre el color, píldora), "@usuario", etiqueta de estado (`data-membership-status`, píldora `border-border-strong`: "Activo", "Abandonó", "Retirado"), "Propietario" si aplica. Acciones a la derecha: "Retirar" (peligro) o "Abandonar hogar" (secundario), según `memberActions` |
| **[FIX B-1] Formulario "Invitar miembro"** (`aria-label="Invitar miembro"`, solo si `isHouseholdOwner`) | Fila `flex flex-wrap items-end gap-3` con tres controles: campo "Invitar por usuario" (texto, obligatorio), **select "Rol al unirse" (obligatorio, `name="roleOnJoin"`, id `invite-<householdId>-roleOnJoin`)** con opciones "Administrador" (`ADMIN`), "Cuidador" (`CAREGIVER`), "Lector" (`READER`), y botón "Invitar" (principal). El select no tiene opción vacía por defecto; el valor inicial es `READER` (rol mínimo). Errores por campo bajo cada control; error general (`role="alert"`) debajo |
| Diálogo "Eliminar hogar" (`role="alertdialog"`, `aria-labelledby`) | Bloque `bg-red-50 border-2 border-danger rounded-2xl p-4` debajo de la tarjeta. Texto "¿Eliminar el hogar {nombre}? Las mascotas no se borran; dejan de compartirse." Botones "Confirmar eliminación" (peligro) y "Cancelar" (secundario) |
| Estado vacío de hogares | Texto "Aún no perteneces a ningún hogar." |
| Error general de la página (`role="alert"`) | Bloque de error de la sección 4 |

**Nota para el desarrollador [FIX B-1]:** el select `roleOnJoin` es el único control nuevo de la página. Su valor se envía en el cuerpo de `POST /households/{id}/invitations` junto a `username`. No se añade ningún otro campo.

### 3.5 `/backup` — Respaldo

**Distribución**
- **Mobile:** dos bloques apilados: "Exportar" e "Importar".
- **Desktop (≥1024 px):** dos bloques en columna con `max-w-3xl` (lectura lineal, sin dos columnas).

**Mapeo de componentes**

| Elemento (§3.6) | Componente visual |
|---|---|
| Título `h1` "Respaldo" | `text-2xl font-bold` |
| Bloque "Exportar" (`aria-labelledby="export-title"`) | Tarjeta `bg-white rounded-2xl p-4`. Título `h2`, texto de apoyo ("Descarga un archivo JSON con tus mascotas y sus registros. No incluye datos de otros usuarios ni de tus hogares.") y botón "Descargar respaldo" (principal) |
| Bloque "Importar" (`aria-labelledby="import-title"`) | Tarjeta `bg-white rounded-2xl p-4`. Título `h2`, texto de advertencia ("Reemplaza todos tus datos por los del archivo (máximo 10 MB). Si el archivo no es válido, no se cambia nada.") |
| Selector de archivo (`input type="file"`, `accept="application/json,.json"`) | Etiqueta visible "Archivo de respaldo (.json)" y el input con estilo de botón secundario: `file:mr-3 file:rounded-full file:border file:border-primary file:bg-white file:px-4 file:py-3 file:font-semibold file:text-primary` |
| Botón "Importar respaldo" | Principal; deshabilitado sin archivo o con envío en curso (`busy`) |
| Resultado de importación (`role="status"`) | Bloque `rounded-2xl border border-emerald-700 bg-emerald-50 px-4 py-3 text-emerald-900` (contraste 8.57:1) |
| Error de importación (`role="alert"`) | Bloque de error de la sección 4 |

### 3.6 Reglas transversales de layout

- **Contenedor de página:** `grid gap-4` con `h1` arriba; ancho máximo `max-w-7xl` en la cabecera y `max-w-7xl` en el contenido de `/` (dos columnas en `lg`).
- **Ninguna tabla desborda la página:** toda tabla vive en un `div role="region" tabIndex="0" overflow-x-auto` (ya existente).
- **Sin scroll horizontal de página en 320 px:** pestañas con scroll interno; tablas con scroll interno; ningún elemento con ancho fijo mayor que 288 px (320 − 2×16).
- **Textos largos:** nombres de mascota, hogar y títulos usan `break-words` y permiten hasta 3 líneas antes de truncar (`line-clamp-3`) en tarjetas de la lista; en la ficha no se truncan.

### 3.7 Contrato de preservación técnica (checklist obligatorio para Keymaker)

El rediseño cambia clases, no estructura semántica. Todo lo siguiente debe quedar idéntico (fuente: `architecture_spec.md` §4.2). Ninguna fila se puede quitar ni renombrar.

**A. Atributos `data-*`**

| Atributo | Elemento | Valor |
|---|---|---|
| `data-pet-id` | Tarjeta `role="option"` y `<article>` de la ficha | `PetProfile.id` |
| `data-owner-badge` | Insignia del dueño | `colorToken` o `none` |
| `data-read-only="true"` | Etiqueta "Solo lectura" | — |
| `data-alert-status` | Insignia del semáforo | `UP_TO_DATE`, `DUE_SOON`, `OVERDUE`, `SUPERSEDED` |
| `data-ui-badge` | Insignia del semáforo | `NEUTRAL_GRAY`, `DANGER_RED`, `WARNING_AMBER`, `SUCCESS_GREEN` |
| `data-household-count` | Insignia de hogares de la cabecera | número |
| `data-pending-invitations` | Insignia de invitaciones de la cabecera | número |
| `data-household-id` | Tarjeta de hogar | `Household.id` |
| `data-membership-status` | Estado del miembro | `ACTIVE`, `LEFT`, `REMOVED` |

**B. Roles y estados ARIA**

| Patrón | Atributos que se conservan |
|---|---|
| Pestañas de contexto | `role="tablist"` `aria-label="Contexto de mascotas"`; cada pestaña `role="tab"`, `id="context-tab-<id>"`, `aria-selected`, `aria-controls="pet-panel"`; panel `id="pet-panel"` `role="tabpanel"` `aria-labelledby="context-tab-<id>"` |
| Lista de mascotas | `role="listbox"` `aria-label="Mascotas"`; tarjetas `role="option"` con `aria-selected` y `tabIndex` (0 en la enfocable, -1 en las demás) |
| Pestañas de módulo | `role="tablist"` `aria-label="Módulos de la ficha"`; `role="tab"`, `id="module-tab-<módulo>"`, `aria-selected`, `aria-controls="module-panel-<módulo>"`; panel `id="module-panel-<módulo>"` `role="tabpanel"` `aria-labelledby="module-tab-<módulo>"` `tabIndex=0` |
| Formularios con nombre | `aria-label` "Iniciar sesión", "Crear cuenta", "Crear hogar", "Invitar miembro"; `role="search"` `aria-label="Filtrar mascotas"`; `aria-labelledby` en alta (`new-pet-title`), edición (`edit-pet-<id>-title`) y registros (`form-<módulo>-title`) |
| Campos | Etiqueta asociada con `htmlFor`; con error: `aria-invalid="true"` y `aria-describedby` hacia el texto de error; asterisco de obligatorio con `aria-hidden` |
| Botón "Mostrar contraseña" | `aria-pressed`, `aria-controls` hacia el campo |
| Mensajes | Errores: `role="alert"`. Resultado de importación y "Cargando…": `role="status"` |
| Diálogos | `role="alertdialog"`: eliminar mascota (`aria-modal="false"`, `aria-labelledby="delete-pet-title"`, `aria-describedby="delete-pet-desc"`) y eliminar hogar (`aria-labelledby="delete-<householdId>"`) |
| Tablas | `<caption>` solo para lector de pantalla ("Evolución de peso", "Medidas corporales"), `<th scope="col">`, contenedor `role="region"` con `aria-label` "Evolución de peso (desplazable)" o "Medidas corporales (desplazable)" y `tabIndex=0` |
| Gráfico de peso | `<svg role="img">` con `aria-label` "Evolución de peso: N mediciones, mínimo X, máximo Y"; un `<circle>` por medición |
| Navegación | `aria-label="Principal"`; `<main id="main-content" tabIndex=-1>`; enlace de salto `href="#main-content"` |
| Semáforo | Texto oculto "Semáforo {color}: " antes del texto visible |

**C. Identificadores que usan las pruebas E2E**

`#new-pet-name`, `#new-pet-species`, `#weights-recordedAt`, `#weights-weightKg`, `#vaccinations-vaccineName`, `#vaccinations-appliedAt`, `#vaccinations-nextBoosterAt`; patrones `new-pet-<campo>`, `edit-pet-<id>-<campo>`, `<módulo>-<campo>`, `invite-<householdId>`, `household-name`, `login-username`, `login-password`, `register-<campo>`. El atributo `name` de cada control es el nombre del campo del contrato. **[FIX B-1]:** el nuevo select usa `name="roleOnJoin"` e `id="invite-<householdId>-roleOnJoin"`.

**D. Selectores CSS y de rol que usan las pruebas**

`input[type="file"]`, `form[aria-labelledby] input[name="name"]`, `form[aria-labelledby^="edit-pet-"]`, `svg[role="img"] circle`, `table tbody tr`, `getByRole('searchbox')` (el `input type="search"`), `getByRole('status')`, `getByRole('tab', {name})`, `getByRole('option', {name})`, `getByRole('heading', {level: 2})` para el nombre de la mascota.

**E. Textos y nombres accesibles que no se pueden cambiar**

- Botones: "Entrar", "Registrarme", "Cerrar sesión", "Nueva mascota", "Guardar", "Cancelar", "Editar" (nombre exacto), "Eliminar" (nombre exacto), "Eliminar definitivamente", "Aceptar", "Rechazar", "Crear hogar", "Invitar", "Eliminar hogar", "Confirmar eliminación", "Retirar", "Abandonar hogar", "Descargar respaldo", "Importar respaldo", "Mostrar contraseña".
- Enlaces: "Mascotas", "Hogares", "Respaldo", "Regístrate", "Inicia sesión", "Saltar al contenido".
- Etiquetas: las listadas en `architecture_spec.md` §4.2 C, incluida "Contraseña (10 a 128, con mayúscula, número y símbolo)" y "Usuario (minúsculas, números, . _ -)".
- Estados: "Cargando…", "No hay mascotas en este contexto.", "Selecciona una mascota para ver su ficha.", "Sin registros.", "Sin mediciones de peso.", "Aún no perteneces a ningún hogar.", "No tienes invitaciones pendientes.", "Solo lectura", "Sin próxima fecha", "Usuario o contraseña incorrectos.", "Dueño: nombre".

**F. Teclado**

- Pestañas de contexto, pestañas de módulo y lista de mascotas: flechas (con ciclo), Inicio y Fin; en la lista, además Enter y Espacio seleccionan.
- Foco visible en todo control (1.6). Orden de tabulación = orden visual: salto, navegación, usuario, "Cerrar sesión", contenido.

**G. Responsive**

Sin scroll horizontal de página desde 320 px; `body { min-width: 320px }`; tablas y pestañas con scroll interno; gutter lateral de 16 px.

**H. Rutas sin diseño propio**

`*` redirige a `/` (y la guardia a `/login` sin sesión); no tiene pantalla. Las rutas públicas conservan `<main id="main-content">`.

---

## 4. Estados de Interfaz (Vacío, Carga, Error y Permisos)

### 4.1 Carga

| Estado | Render |
|---|---|
| Sesión inicial (`LOADING`, consulta a `GET /auth/me`) | `<p role="status" class="p-4 text-text-primary">Cargando…</p>` dentro del marco de autenticación; sin layout de cabecera |
| Botones en envío (`busy`) | Botón con `disabled` y `opacity-60`, mismo texto. No hay spinner (no se añaden librerías de iconos) |
| Listas, fichas y hogares mientras cargan | Sin skeleton ni spinner: el contenedor conserva su altura mínima (`min-h-24`) y no muestra contenido hasta que llega la respuesta. Esto evita inventar un estado que el contrato no define |
| Gráfico de peso y tablas | Mismo criterio: sin placeholder |

### 4.2 Vacío (`[]`)

| Pantalla | Texto exacto | Componente |
|---|---|---|
| Lista de mascotas sin resultados | "No hay mascotas en este contexto." | `p text-text-muted` dentro de la columna de la lista |
| Ficha sin mascota seleccionada | "Selecciona una mascota para ver su ficha." | `p text-text-muted` dentro de la tarjeta de la ficha |
| Módulo de registros vacío | "Sin registros." | `p text-text-muted` dentro del panel del módulo |
| Módulo de peso vacío | "Sin mediciones de peso." | En lugar del gráfico y la tabla |
| Sin hogares | "Aún no perteneces a ningún hogar." | `p text-text-muted` debajo del formulario "Crear hogar" |
| Sin invitaciones | "No tienes invitaciones pendientes." | `p text-text-muted` dentro del bloque "Invitaciones" |
| Vacuna o desparasitación sin próxima fecha (`alert` nulo) | "Sin próxima fecha" | `span text-xs text-text-muted` en el lugar de la insignia del semáforo |

Los estados vacíos son texto con el mismo ancho de la tarjeta; no hay ilustraciones ni llamadas a la acción añadidas (no se inventan).

### 4.3 Errores

| Tipo | Componente y ARIA | Estilo |
|---|---|---|
| Error de campo | Bajo el control: `<p id="<campo>-error" class="text-sm text-red-900">`. El control lleva `aria-invalid="true"` y `aria-describedby="<campo>-error"` | Control con `border-red-700`; texto `#991b1b` sobre `#fef2f2` (7.60:1) |
| Error general de formulario | `<p role="alert" class="rounded-2xl border border-red-700 bg-red-50 px-4 py-3 text-red-900">` | Igual que el de campo, en bloque |
| Error general de página | Mismo bloque `role="alert"`, bajo el `h1` | Igual |
| Error de la ficha (carga o eliminación) | Mismo bloque `role="alert"`, dentro de la columna de la ficha | Igual |
| Credenciales incorrectas en `/login` | Texto exacto "Usuario o contraseña incorrectos." en el bloque `role="alert"` del formulario (lo espera una prueba E2E) | Igual |
| Error de red o no catalogado | Texto del catálogo `ERR-INTERNAL-UNEXPECTED` en el bloque de error correspondiente | Igual |
| Error de importación | `role="alert"` con el texto del catálogo y, si aplica, "No se modificó ningún dato." o "Estado final desconocido: revisa tus datos." | Igual |

**Regla:** el color nunca es el único canal del error: siempre hay texto y, en campos, el icono se omite (sin librerías) y se usa el borde `border-red-700` más el texto.

### 4.4 Mensajes de resultado

| Mensaje | Componente | Estilo |
|---|---|---|
| Importación completada | `<p role="status">` "Importación completada (versión X): N mascotas y M registros." | `rounded-2xl border border-emerald-700 bg-emerald-50 px-4 py-3 text-emerald-900` |
| Cargando la sesión | `<p role="status">` "Cargando…" | `text-text-primary` |

### 4.5 Permisos (qué se ve y qué se oculta)

| Condición | Efecto visual |
|---|---|
| Sin sesión | Solo `/login` y `/register`; el resto redirige a `/login` |
| Con sesión en `/login` o `/register` | Redirige a `/` |
| `permissions.editPetBasics` falso | Sin "Editar", sin formulario de edición, sin formularios de registro por módulo; "Solo lectura" visible |
| `permissions.deletePet` falso | Sin "Eliminar" en la ficha |
| `permissions.assignPetToHouseholds` falso | Sin panel "Hogares de la mascota" en la edición |
| Mascota de otro usuario | Cabecera con "Solo lectura" y sin acciones de edición |
| `isHouseholdOwner` falso | Sin "Eliminar hogar", sin formulario "Invitar miembro"; en miembros, solo "Abandonar hogar" en la propia fila |
| `isHouseholdOwner` verdadero | "Eliminar hogar" y formulario "Invitar miembro" visibles; "Retirar" en miembros ACTIVE distintos de sí mismo |

---

## 5. Base de Identidad de Marca (Brand Kit para uso futuro)

### 5.1 Tabla de color multi-canal

RGB exacto. CMYK es la conversión aritmética de RGB, sin perfil ICC: para impresión, convertir con el perfil de la imprenta. Pantone es **orientativo**: se indica la familia cromática; el código exacto se debe elegir en el catálogo físico o en Pantone Connect comparando contra el HEX, porque no se puede calcular de forma fiable desde RGB.

| Color de marca | Rol | HEX | RGB | CMYK (aprox.) | Pantone (orientativo, verificar en catálogo) |
|---|---|---|---|---|---|
| Oliva Argos | Primario | `#1d4f3a` | 29, 79, 58 | 63, 0, 27, 69 | Familia verde oliva oscuro |
| Musgo | Secundario | `#35573f` | 53, 87, 63 | 39, 0, 28, 66 | Familia verde musgo |
| Lima Argos | Acento | `#c5f35a` | 197, 243, 90 | 19, 0, 63, 5 | Familia verde lima brillante |
| Lima suave | Acento de fondo | `#e9fbc4` | 233, 251, 196 | 7, 0, 22, 2 | Familia verde lima claro |
| Cielo base | Neutro de fondo | `#eaf6ff` | 234, 246, 255 | 8, 4, 0, 0 | Familia azul cielo muy claro |
| Pradera | Neutro de fondo | `#e6f2ea` | 230, 242, 234 | 5, 0, 3, 5 | Familia verde menta muy claro |
| Crema luz | Neutro de fondo | `#f4f8ef` | 244, 248, 239 | 2, 0, 4, 3 | Familia crema muy claro |
| Menta pastel | Pastel de marca | `#d9f5e6` | 217, 245, 230 | 11, 0, 6, 4 | Familia menta pastel |
| Crema pastel | Pastel de marca | `#fbf5dc` | 251, 245, 220 | 0, 2, 12, 2 | Familia crema pastel |
| Cielo pastel | Pastel de marca | `#dbeafe` | 219, 234, 254 | 14, 8, 0, 0 | Familia azul cielo pastel |
| Tinta | Texto | `#0f172a` | 15, 23, 42 | 64, 45, 0, 84 | Familia azul grisáceo muy oscuro |
| Gris texto | Texto secundario | `#475569` | 71, 85, 105 | 32, 19, 0, 59 | Familia gris pizarra |
| Blanco | Superficie | `#ffffff` | 255, 255, 255 | 0, 0, 0, 0 | Blanco (sin código de tinta) |

Los colores de dominio (OWNER_COLOR_1 a 8 y los del semáforo) pertenecen al sistema de datos y no forman parte de la identidad de marca: no deben usarse como colores de marca en piezas externas.

### 5.2 Proporción de uso (regla 60-30-10)

| Proporción | Qué ocupa | En web | En piezas futuras |
|---|---|---|---|
| **60 %** | Base luminosa: cielo, pradera y crema (degradado de fondo y superficies de fondo) | Fondo de la app y de las páginas de autenticación | Fondos de tarjetas, cabeceras y láminas claras |
| **30 %** | Blanco y cristal: tarjetas blancas, marco translúcido y textos | Tarjetas, formularios y tablas | Cuerpo del contenido, textos largos y superficies de lectura |
| **10 %** | Acentos: oliva (identidad y botones) y lima (estado activo) | Cabecera, botón principal, pestaña activa, foco | Titulares, sellos y elementos de llamada a la acción |

Reglas: el lima nunca supera el 5 % de la superficie visible de una pantalla; el oliva puede ocupar la cabecera completa (única superficie oscura); los pastel solo aparecen como micro-etiquetas.

### 5.3 Uso de la marca "Argos"

**Wordmark**
- Texto "Argos" en minúsculas con inicial mayúscula ("Argos"), en la pila del sistema (sección 1.3), peso 700, `tracking-tight` (−0.02 em).
- Sin logotipo gráfico todavía: el wordmark es texto. Cualquier símbolo gráfico se propondrá en una iteración aparte, sin librerías nuevas.

**Variantes**

| Fondo | Color del wordmark | Contraste | Uso |
|---|---|---|---|
| Claro / cristal (crema, pradera, cielo, blanco) | Oliva `#1d4f3a` | 9.41:1 sobre blanco | Títulos de página, marco de autenticación |
| Oscuro (cabecera oliva) | Blanco `#ffffff` | 9.41:1 sobre oliva | Cabecera de la aplicación |
| Oscuro, alternativa (musgo) | Blanco `#ffffff` | 8.12:1 sobre musgo `#35573f` | Piezas futuras sobre fondos musgo |

**Prohibido:** wordmark en lima sobre blanco; wordmark sobre fotografías sin velo oscuro; wordmark en color de dominio (OWNER_COLOR).

### 5.4 Iconografía

- **Estilo:** trazo fino, 1.5 px a 24 px de lienzo, `stroke-linecap="round"`, `stroke-linejoin="round"`, sin relleno, esquinas redondeadas.
- **Fuente:** SVG en línea, escrito a mano, sin librerías de iconos (regla de Nivel 2: no añadir dependencias sin autorización).
- **Color:** `currentColor` para que hereden el color del texto y mantengan contraste.
- **Accesibilidad:** iconos decorativos con `aria-hidden="true"`; un icono que comunica estado siempre va acompañado de texto.
- **Tamaños:** 16 px en texto, 20 px en botones, 24 px en cabeceras.

### 5.5 Detalles técnicos: líneas concéntricas y etiquetas flotantes

- **Líneas concéntricas (`bg-deco`):** círculos concéntricos de trazo 1 px, color `primary` a 8 % de opacidad, separación de 48 px. Solo en el borde superior derecho del fondo de escritorio. Nunca detrás de texto ni de controles; `aria-hidden` y `pointer-events-none`.
- **Etiquetas flotantes:** píldoras pequeñas (`rounded-full px-2.5 py-0.5 text-xs font-semibold`) con fondo pastel y texto oscuro (sección 1.5). Solo informan datos existentes (por ejemplo "Alertas" o un contador); no decoran.
- **Detalle técnico:** se usa una sola línea fina de 1 px como separador en tablas y listas (`divide-y divide-slate-200`). No se añaden líneas decorativas sobre el texto.

---

## Apéndice A — Elementos del contrato excluidos de este blueprint

Se dejan fuera por la regla de mapeo fiel y el alcance de `[UI]`. Quedan como pendientes para cuando se decida implementarlos:

| Elemento | Motivo |
|---|---|
| Cambio de contraseña, perfil y eliminación de cuenta (§3.7) | `[CONTRATO]`, sin pantalla hoy |
| Transferencia de propiedad de mascota y de hogar (§3.7) | `[CONTRATO]`, sin pantalla hoy |
| Cambio de rol de miembros y cancelación de invitaciones (§3.5) | `[CONTRATO]`, sin pantalla hoy |
| Edición y eliminación de registros (§3.4) | `[CONTRATO]`, sin pantalla hoy |
| Vista previa de importación (§3.6) | `[CONTRATO]`, sin pantalla hoy |
| Vacunas y desparasitaciones reemplazadas (`supersededVaccinations`, `supersededDewormings`) | `[CONTRATO]`, no se renderizan (B-8) |
| Especies 3 a 8, `speciesOther`, `estimatedAge`, `birthDateIsEstimate`, `neutered`, `microchipId`, `avatarUrl` visible | B-5 (T284 pendiente) |
| Rol de cuidador para registros | B-3 (la UI oculta formularios a CAREGIVER) |
| Manejo de sesión expirada con redirección | B-7 |
| Porcentaje de variación de peso | B-8 (el contrato 002 ya no lo trae) |
| Tema oscuro | No está en el contrato ni en la especificación pedida |

## Apéndice B — Verificación de este blueprint

| Verificación | Resultado |
|---|---|
| Contrastes de la matriz 1.5 | Calculados con WCAG 2.1 (fórmula de luminancia relativa) con un script sobre 59 pares: 0 fallos. Texto ≥ 4.5:1 (mínimo 4.76:1, placeholder) y no texto ≥ 3:1 (mínimo 4.76:1). El único valor bajo (lima sobre blanco, 1.29:1) está prohibido explícitamente. Los colores de Tailwind, `OWNER_COLORS` y `UI_BADGE_STYLE` se leyeron de la librería instalada y de `view-model.ts` |
| Presupuesto de blur | Máximo un elemento con `backdrop-filter` (marco L1) en tablet y escritorio; ninguno en móvil (<640 px); sin segunda capa porque los diálogos son en línea y no modales |
| Atributos `data-*`, roles y textos de la sección 4.2 del contrato | Todos conservados en el mapeo (3.3, 3.4, 3.5, 3.6) |
| Escenarios de viewport | 320, 768, 1024 y 1280 px definidos por ruta |
| Ítems `[UI]` de `architecture_spec.md` | Todas las rutas (5), campos, botones, diálogos (2), tablas y gráfico mapeados. Ver Apéndice A para los excluidos |
| Control `[FIX B-1]` | Único control añadido; marcado en 3.4 |
| Nuevas dependencias | Ninguna (sin librerías de iconos ni fuentes web) |
| Renderizado real en navegador | **No verificado.** Este documento es especificación; la comprobación visual debe hacerse tras la implementación con las pruebas E2E y axe-core |

## Apéndice C — Decisiones de Neo (5 de 5 aprobadas el 2026-11-14)

> Neo aprobó los cinco puntos. Orden vigente: **no se despacha a Keymaker todavía**; la implementación queda en pausa hasta nueva orden de Neo.

1. **Aprobar la paleta y la proporción 60-30-10** (sección 1.1 y 5.2).
2. **Aprobar el uso del lima solo como fondo** (texto siempre oliva sobre lima) por el contraste de 1.29:1 sobre blanco.
3. **Aprobar la pila del sistema** en lugar de una fuente web (requiere autorización de Neo para fuentes web).
4. **Aprobar el control `[FIX B-1]`** (select "Rol al unirse", valor inicial `READER`) y sus etiquetas en español.
5. **Aprobar los Pantone orientativos** o pedir la verificación en catálogo físico antes de piezas impresas.

## Apéndice D — Registro de la auditoría v1.0 → v1.1

Auditoría de este documento contra `architecture_spec.md` y las reglas del encargo original. Método: script de cobertura (cadenas obligatorias del contrato), búsqueda de términos de la imagen de referencia y de elementos inventados, y script de contraste WCAG 2.1 con los valores leídos de Tailwind y de `view-model.ts`.

| # | Brecha encontrada en v1.0 | Corrección en v1.1 |
|---|---|---|
| 1 | Cobertura: 17 elementos del contrato no estaban en el documento (ids E2E `#new-pet-name`, `#new-pet-species`, `#weights-*`, `#vaccinations-*`; `data-alert-status`; `data-ui-badge`; `aria-selected`; `caption`; `scope="col"`; ids `delete-pet-title` y `delete-pet-desc`; etiqueta "Buscar mascota"; texto "Sin próxima fecha"; texto "Usuario o contraseña incorrectos.") | Se añadió la sección 3.7 (contrato de preservación) y filas en 3.3, 4.2 y 4.3. Segunda pasada de cobertura: ver resultado abajo |
| 2 | **Incoherencia con el contrato:** el blueprint ponía un velo con `backdrop-blur` detrás de los diálogos (segunda capa de blur), pero los diálogos de la UI son en línea y no modales (`aria-modal="false"`). El velo inventaba un comportamiento | Velo eliminado. Los diálogos son bloques en línea sin blur (1.4, 1.5, 3.3, 3.4) |
| 3 | **Presupuesto de blur insuficiente para móvil:** el marco con `backdrop-blur-md` se aplicaba también debajo de 640 px | Marco con blanco al 90 % y sin blur debajo de 640 px; blur solo desde 640 px y con soporte de `backdrop-filter` (`sm:supports-[backdrop-filter]:`). Presupuesto final: 1 capa en tablet y escritorio, 0 en móvil |
| 4 | **Comportamiento inventado:** "al seleccionar una mascota, la pantalla se desplaza hasta la ficha" no existe en el contrato | Eliminado (3.3) |
| 5 | Contraste del marco glass calculado solo contra `meadow`, sin considerar la línea decorativa ni el compuesto real de la translucidez | Recalculado con el compuesto peor caso (`#f3f7f5` al 70 %, `#fbfcfc` al 90 %, `#fdfefd` al 95 %). Todos los textos sobre el marco ≥ 7.01:1 |
| 6 | Pares no calculados que el documento usaba: texto muted sobre tarjeta activa (`accent-soft`), título de diálogo (`danger` sobre `red-50`), `slate-900` sobre `amber-300`, placeholder, bordes de control | Calculados e incorporados a la matriz 1.5. Placeholder: se fija `placeholder:text-slate-500` (4.76:1) porque el valor por defecto de Tailwind no cumple |
| 7 | Redacción ambigua: el nombre de usuario "se oculta" en móvil pero "sigue en el árbol de accesibilidad" | Clases exactas `sr-only min-[480px]:not-sr-only` (2.2) |
| 8 | Segunda pasada de cobertura (etiquetas de selectores y formularios): faltaban las opciones de Sexo (Macho, Hembra), las categorías de parámetros (Cambio de dieta, Alergia, Cirugía, Comportamiento, Otro), los títulos de los 6 formularios de registro y los campos de cada módulo. Además, el documento remitía a una sección inexistente ("4.3 de `architecture_spec.md`"; los campos están en su §3.4) | Tabla completa de campos de `RecordForm` y opciones de los selectores en 3.3; referencia corregida a §3.4 |

**Resultado de la verificación de los cuatro puntos**
1. **Mapeo 1-a-1:** completo tras la corrección 1. Todas las rutas (5), campos, botones, diálogos (2), tabla y SVG de peso, estados `[UI]` y el `[FIX B-1]` están mapeados.
2. **Imagen de referencia:** ningún widget, métrica ni texto copiado. Los términos de la imagen aparecen únicamente en la lista de prohibiciones del encabezado.
3. **Preservación técnica:** `data-*`, ARIA, ids, selectores y textos E2E quedan en 3.7; 320 px+ en 3.7 G.
4. **Contraste y blur:** 0 fallos en 59 pares; presupuesto de blur corregido a 1 capa (escritorio) y 0 (móvil).

**Límites declarados:** el render real en navegador no se verificó (este documento es especificación); `axe-core` solo puede confirmarse tras la implementación y la ejecución de las pruebas E2E; los Pantone siguen siendo orientativos.
