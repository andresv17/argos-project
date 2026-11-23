# Sati — Diseño de pantallas del portal /admin (T1235, feature 009, [GH:#19])

- Fecha: 2026-11-23 · Rama 009-aprobacion-admin-correo · HEAD 82ae495 · Autor: /sati (diseño, sin código)
- Trazas: REQ-ADM9-001, NFR-009-001; SC-009-009, SC-009-010; EDGE-009-008, INV-ADM9-001/002.
- Fuentes leídas: línea T1235 de tasks.md, spec REQ-ADM9-001/002 y NFR-009-001, `admin.openapi.yaml` 1.2.0, `tailwind.config.ts`, `styles.css`, `AuthPages.tsx` (`GoogleAccess`), `AppShell.tsx` (`ShellHeader`), `static-assets.ts`, `admin.routes.ts`.
- Estado: PROPUESTA para implementar; no toca `src/**`.

## 0. Principios

1. Portal sobrio y utilitario: es herramienta de una o dos personas, no producto de cara al público. Sin ilustraciones, sin degradado, sin círculos decorativos (`bg-deco`), sin vidrio (`backdrop-blur`), sin animaciones. Cada elemento cumple una función.
2. Mismos tokens que la app de usuarios (no se inventa paleta) para que el portal sea coherente, pero con fondo plano `bg-cream` (#f4f8ef) en lugar del degradado: así no se confunde con la app de usuarios y se evita el SVG decorativo.
3. Nada revela la lista de administradores ni el motivo de un fallo (EDGE-009-008): la pantalla de acceso es idéntica para quien no tiene sesión, tiene sesión vencida o fue rechazado. No hay mensaje de error de acceso posible, porque el callback fallido responde el 404 uniforme (texto plano) y nunca vuelve a esta pantalla con un motivo.
4. Cero enlaces desde la app de usuarios. En sentido inverso, el portal tampoco enlaza a la app de usuarios (no hay «Volver a ARGOS»): separación total (INV-ADM9-001).

## 1. Punto de entrada y bundle (requisitos de diseño para keymaker)

- Entrada propia: documento HTML propio servido en `GET /admin` (p. ej. `admin.html` + `src/presentation/admin/main.tsx`), con su propio bundle JS/CSS. NO importa `App.tsx`, `session.tsx`, el router ni las páginas de usuario; solo puede compartir tokens (`tailwind.config.ts`) y, si hace falta, el componente `Button` de `components/Field.tsx` si no arrastra dependencias de sesión de usuario (si las arrastra, se duplica el botón: 6 líneas).
- Sin React Router: una sola ruta `/admin`; las dos vistas (acceso / shell) son estados del mismo componente según `GET /api/admin/session`.
- `<html lang="es">`, `<title>Administración — ARGOS</title>`, `<meta name="viewport" content="width=device-width, initial-scale=1">`, `<meta name="robots" content="noindex, nofollow">`, `<meta name="referrer" content="no-referrer">`.
- Las rutas `/admin/*` distintas de `/admin` siguen en 404 uniforme (ya lo hace `static-assets.ts`); el bundle debe cargar sus activos desde una ruta que no sea `/admin/...` (p. ej. `/assets/admin-*.js`) para no chocar con esa regla. Decisión de infraestructura de keymaker; no cambia el diseño.
- Verificación de aislamiento (T1236 la repite): `grep -rn "/admin" src/presentation/web` = 0 coincidencias; ninguna cadena «Administrador» / «admin» en la app de usuarios.

## 2. Lógica de vista (qué se muestra y cuándo)

| Estado | Disparador | Vista |
|---|---|---|
| `checking` | Carga inicial: `GET /api/admin/session` en curso | Contenedor `main` con `aria-busy="true"` y texto «Comprobando sesión…» (`role="status"`). Sin spinner animado. |
| `anonymous` | Respuesta 404 (o cualquier no-200, o fallo de red) | Pantalla de acceso (sección 3) |
| `authenticated` | Respuesta 200 con `authenticated: true` | Shell vacío (sección 4) |
| `signing-out` | Clic en «Cerrar sesión», `DELETE /api/admin/session` con cabecera `X-Argos-Request: 1` | Botón deshabilitado con `aria-disabled="true"` y texto «Cerrando sesión…» |
| tras 204 | Cierre correcto | Estado `anonymous`; el foco pasa al `h1` de la pantalla de acceso (`tabIndex=-1`) y un `role="status"` anuncia «Sesión cerrada.» |
| cierre fallido | 403/404/500/red | Si 404: tratar como ya cerrada → `anonymous`. Si 403/500/red: mensaje `role="alert"` en el shell (copy 5.3), foco al botón, botón habilitado. |

- No hay sondeo ni temporizador: `GET /api/admin/session` no renueva la inactividad, pero un sondeo es superfluo y consume el límite. Se vuelve a comprobar solo al recuperar el foco de la pestaña (`visibilitychange` a visible) para que una sesión vencida pase a `anonymous` sin recargar. Si el servidor responde 404 en ese momento: `anonymous` sin mensaje de error (copy neutro 5.1 ya cubre «Si tu sesión terminó…»).
- No se muestra `adminId`, correo, `sub` ni identificadores (el contrato tampoco los devuelve salvo `adminId` opaco; no se pinta).
- Se descarta `idleExpiresAt`/`expiresAt` como reloj en pantalla: un contador regresivo añade ruido y exige `aria-live`. Se informa de los límites con texto estático (copy 5.2).

## 3. Pantalla de acceso (`anonymous`)

### 3.1 Componentes

1. `AdminFrame`: `div.min-h-screen.bg-cream`, contiene un único `main#main-content`.
2. Skip link «Saltar al contenido» (primer elemento enfocable; visible solo al enfocarse). En una pantalla con un solo control es redundante pero se mantiene por coherencia con la app de usuarios y para el shell; si el implementador decide omitirlo en esta pantalla, que sea con un único enfocable (el enlace de acceso) y se anote en el acta. Recomendación: mantenerlo.
3. `AccessCard`: tarjeta `rounded-2xl border border-slate-300 bg-white p-6 shadow-sm` (sin `backdrop-blur`, sin transparencia: contraste determinista).
4. Marca: `h1` «Argos» (`text-3xl font-bold text-primary`) + `p` «Administración» (`text-sm text-text-muted`). El `h1` es lo único con ese rol en la página.
5. Párrafo de contexto (copy 5.1).
6. `GoogleAccessLink`: enlace `<a href="/api/admin/auth/google/start">` con aspecto de botón. Es una navegación GET (el contrato lo exige: `startAdminGoogleLogin` es un 302), por eso es un enlace y no un `button` con script. Clases base: las de `GoogleAccess` de la app de usuarios (`inline-flex min-h-12 w-full items-center justify-center rounded-full border border-primary bg-primary px-5 text-sm font-semibold text-white hover:bg-primary-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2`). Aquí se usa relleno sólido `primary` (acción única y principal), a diferencia de la variante contorno de la app de usuarios; contraste texto blanco sobre #1d4f3a = 9.5:1 (verificar con axe/medición).
7. Nota al pie (copy 5.1): `text-sm text-text-muted` (14 px, contraste 7.58:1 sobre blanco).

No hay formulario, campo de correo, contraseña, «recordarme», «olvidé», ni logo de Google (no se añade el SVG de marca de Google: es decoración de terceros que no aporta; el texto basta).

### 3.2 Layout por ancho

| Ancho | Layout |
|---|---|
| 320 px | Columna única. Padding exterior `px-4 py-8` (gutter 16 px). Tarjeta ancho 100 % (288 px de contenido útil; sin `min-width` mayor), padding interno `p-5`. Enlace de acceso ancho completo, alto 48 px. Sin scroll horizontal; el texto envuelve (`break-words` solo si hiciera falta). |
| 1024 px | Una columna centrada: `mx-auto max-w-md` (448 px), tarjeta a 64 px del borde superior (`pt-16`). No se usa el diseño de dos columnas de la app de usuarios: no hay nada que poner en la segunda columna. |
| 1280 px | Igual que 1024: `max-w-md` centrado, `pt-24`. Sin fondo decorativo. |

Tipografía: pila `font-sans` de Tailwind del proyecto; `h1` 30 px/bold; cuerpo 16 px (`text-base`) para el párrafo principal; secundarios 14 px. Respeta zoom 200 % y reflujo a 320 px (WCAG 1.4.4, 1.4.10).

### 3.3 Orden de foco (pantalla de acceso)

1. Skip link → 2. `GoogleAccessLink`. Orden de DOM = orden visual: `h1` → contexto → enlace → nota. El foco inicial al cargar es el del navegador (inicio de documento): no se roba el foco al cargar. Al volver de un cierre de sesión, foco programático al `h1`.

## 4. Shell autenticado vacío (`authenticated`)

### 4.1 Componentes

1. Skip link «Saltar al contenido».
2. `header` (rol banner): barra `border-b border-slate-300 bg-white`, contenido `mx-auto max-w-5xl` con la marca «Argos · Administración» (texto, `p`/`span` en `font-semibold text-primary`; no es un enlace: no hay a dónde ir) y el botón «Cerrar sesión» a la derecha. El botón es `button type="button"`, `min-h-12`, estilo contorno (`border border-primary bg-white text-primary hover:bg-meadow`), siempre visible (mismo criterio que la app de usuarios).
3. `nav aria-label="Principal"`: NO se renderiza todavía (sin funciones no hay destinos; un `nav` vacío o con un único elemento muerto sería ruido para lectores de pantalla). T1241/T1256 lo añadirán. Se deja anotado como punto de extensión: la `main` ya tiene hueco previo para él.
4. `main#main-content` con:
   - `h1` «Administración» (el `h1` único de esta vista; `tabIndex=-1` para el foco tras iniciar).
   - `EmptyNotice`: bloque `rounded-2xl border border-slate-300 bg-white p-6` con `h2` «Sin funciones habilitadas» y dos párrafos (copy 5.2). Sin icono, sin ilustración.
   - `div role="alert"` condicional para el error de cierre (copy 5.3), vacío y no renderizado cuando no hay error (evitar `role="alert"` vacío permanente).
5. Región `role="status"` (visualmente oculta con `sr-only`, siempre presente) para anunciar «Sesión cerrada.» y «Comprobando sesión…».

### 4.2 Layout por ancho

| Ancho | Layout |
|---|---|
| 320 px | Cabecera en dos filas flexibles (`flex-wrap`): marca arriba, botón «Cerrar sesión» debajo a ancho completo (`w-full`) si no cabe en la misma línea; nunca se oculta ni recorta. Gutter 16 px. `main` con `px-4 py-6`; `EmptyNotice` ancho completo, `p-5`. |
| 1024 px | Cabecera en una fila: marca a la izquierda, botón a la derecha (`sm:flex-nowrap sm:justify-between`, botón `w-auto px-5`). `main` `mx-auto max-w-5xl px-6 py-8`; `EmptyNotice` limitado a `max-w-2xl` para mantener línea de lectura ≤ 75 caracteres. |
| 1280 px | Igual que 1024; contenedores `max-w-5xl` (1024 px) centrados, márgenes laterales libres. |

### 4.3 Orden de foco (shell)

1. Skip link → 2. «Cerrar sesión». (Sin más controles.) Orden DOM = visual: cabecera primero, contenido después. Tras un cierre fallido, el foco vuelve a «Cerrar sesión».

## 5. Textos (español, tuteo, igual registro que la app de usuarios)

### 5.1 Pantalla de acceso

- `h1`: **Argos**
- Subtítulo: **Administración**
- Contexto: **Este acceso es solo para el equipo administrador. Entra con la cuenta de Google autorizada.**
- Enlace/botón: **Entrar con Google**
- Nota: **Si tu sesión terminó, vuelve a entrar con Google.**
- Estado inicial (`status`): **Comprobando sesión…**
- Anuncio tras cerrar sesión (`status`, `sr-only`): **Sesión cerrada.**

Prohibido en esta pantalla: «correo no autorizado», «no eres administrador», «solicita acceso», cualquier alusión a lista, a roles o a cuentas pendientes, y cualquier enlace a registro, inicio de sesión de usuarios o ayuda (EDGE-009-008, REQ-ADM9-001).

### 5.2 Shell vacío

- Marca: **Argos · Administración**
- Botón: **Cerrar sesión** (estado ocupado: **Cerrando sesión…**)
- `h1`: **Administración**
- `h2`: **Sin funciones habilitadas**
- Párrafo 1: **Por ahora este portal no ofrece acciones. Las funciones de administración se irán habilitando aquí.**
- Párrafo 2: **Tu sesión dura 30 minutos como máximo y se cierra sola tras 10 minutos sin actividad.**

### 5.3 Error de cierre (solo 403/500/red)

- **No se pudo cerrar la sesión. Inténtalo de nuevo.** (`role="alert"`, texto `text-danger` #b91c1c sobre blanco = 6.47:1; además prefijo textual «No se pudo…» e icono NO necesario: el mensaje no depende del color).

## 6. Estados interactivos del enlace/botones

| Estado | Regla |
|---|---|
| Foco (`:focus-visible`) | Anillo de 2 px `ring-primary` con `ring-offset-2` (offset blanco o cream); nunca `outline: none` sin sustituto. Contraste del anillo ≥ 3:1 (#1d4f3a vs. #f4f8ef ≈ 9:1). |
| Hover | Acceso: `bg-primary-hover` (#173f2f). Cerrar sesión: `bg-meadow`. |
| Deshabilitado (cerrando) | `aria-disabled="true"` (no `disabled`, para no perder el foco ni el anuncio); estilo `opacity-70`; el manejador ignora clics. |
| Objetivo táctil | `min-h-12` (48 px) y ancho ≥ 120 px; en 320 px el acceso ocupa todo el ancho. |
| Movimiento | Sin transiciones ni animaciones; si el implementador añade `transition-colors`, debe ir bajo `motion-reduce:transition-none`. No hay spinner. |

## 7. Lista de accesibilidad WCAG 2.1 AA

- [ ] 1.1.1: no hay imágenes ni iconos informativos; ninguna decoración (sin SVG de fondo, sin logo de Google).
- [ ] 1.3.1: estructura semántica: `header` (banner), `main`, `h1` único por vista, `h2` solo en el aviso del shell; el aviso no salta niveles.
- [ ] 1.3.4/1.4.10: sin bloqueo de orientación; reflujo sin scroll horizontal a 320 px (`scrollWidth ≤ clientWidth`) y con zoom 200 %.
- [ ] 1.4.3: texto normal ≥ 4.5:1. Pares: `#0f172a` sobre `#fff` (≈17.8:1); `#475569` sobre `#fff` 7.58:1 y sobre `#f4f8ef` ≥ 7:1; `#1d4f3a` sobre `#fff` ≈ 9.5:1; `#fff` sobre `#1d4f3a` ≈ 9.5:1; `#fff` sobre `#173f2f` (hover) ≈ 11:1; `#b91c1c` sobre `#fff` ≈ 6.5:1. Keymaker confirma cada par con medición real (axe + cálculo), no solo cita.
- [ ] 1.4.11: borde del botón de contorno `#1d4f3a` ≥ 3:1; bordes de tarjeta `slate-300` son decorativos (el contenido no depende de ellos).
- [ ] 1.4.12: texto sin alturas fijas; soporta espaciado ampliado.
- [ ] 1.4.13: sin contenido emergente ni tooltips.
- [ ] 2.1.1/2.1.2: todo operable con teclado; ninguna trampa. El «Entrar con Google» se activa con Enter (es un enlace; la barra espaciadora no lo activa, es el comportamiento nativo y válido). «Cerrar sesión» (`button`) con Enter y Espacio.
- [ ] 2.4.1: skip link a `#main-content` en ambas vistas.
- [ ] 2.4.2: `<title>` «Administración — ARGOS» en ambas vistas (no cambia: es una sola página).
- [ ] 2.4.3: orden de foco: sección 3.3 y 4.3. Sin `tabindex` positivo.
- [ ] 2.4.6/2.4.7: encabezados descriptivos; foco siempre visible (2 px).
- [ ] 2.5.5 (referencia AAA, criterio del proyecto): objetivos ≥ 44 px (48 px).
- [ ] 3.1.1: `lang="es"` en `<html>`.
- [ ] 3.2.x: el único cambio de contexto es la navegación por activación explícita («Entrar con Google»); el foco no cambia de contexto por sí solo.
- [ ] 3.3.x: no hay campos de entrada.
- [ ] 4.1.2: el enlace tiene nombre «Entrar con Google»; el botón «Cerrar sesión» cambia de nombre accesible a «Cerrando sesión…» durante la solicitud; `aria-disabled` coherente.
- [ ] 4.1.3: mensajes de estado en `role="status"` (no roban foco) y errores en `role="alert"`; sin regiones vivas vacías con `role="alert"` permanente.
- [ ] `prefers-reduced-motion`: sin animaciones; cualquier transición se anula con `motion-reduce:transition-none`.
- [ ] Modo de contraste alto (`forced-colors`): bordes del botón y de la tarjeta visibles porque son `border` reales, no sombras.
- [ ] Privacidad: ningún dato personal en el DOM (sin correo, sin `adminId`, sin `sub`); la página no incluye scripts de terceros ni fuentes remotas.

## 8. Comprobaciones de aceptación exactas (para keymaker, Playwright + axe)

Entorno: servidor real (API + bundle de `/admin`), Chromium; WebKit si el proyecto ya lo corre. Anchos: 320×800, 1024×768, 1280×800. Utilidad axe del proyecto (`@axe-core/playwright`) con etiquetas `wcag2a, wcag2aa, wcag21a, wcag21aa, best-practice`. **Violaciones esperadas: 0 en cada combinación vista × ancho (6 ejecuciones mínimas).**

| ID | Comprobación | Resultado esperado |
|---|---|---|
| A1 | `GET /admin` sin cookie; esperar a `Entrar con Google` visible; correr axe | `violations.length === 0` a 320, 1024 y 1280 |
| A2 | Con sesión de administración válida (cookie real obtenida por el flujo de prueba o sembrada con el helper de pruebas del proyecto), `GET /admin`; esperar `h1` «Administración»; correr axe | `violations.length === 0` a 320, 1024 y 1280 |
| A3 | Desbordamiento: `document.documentElement.scrollWidth <= window.innerWidth` en ambas vistas y los 3 anchos | verdadero |
| A4 | Objetivo táctil: caja de «Entrar con Google» y de «Cerrar sesión» | altura ≥ 44 px (se espera 48) y ancho ≥ 44 px |
| A5 | Enlace de acceso | `href` exacto `/api/admin/auth/google/start`; `getByRole('link', { name: 'Entrar con Google' })` único |
| A6 | Teclado en acceso: pulsar Tab desde el inicio | 1.º `Saltar al contenido`, 2.º `Entrar con Google`; 3.º Tab sale del documento; el elemento enfocado tiene contorno/anillo visible (`box-shadow` o `outline` de ≥ 2 px, comprobado con `getComputedStyle`) |
| A7 | Teclado en shell: Tab | 1.º skip link, 2.º `Cerrar sesión`; mismos criterios de anillo |
| A8 | Cierre de sesión: clic en «Cerrar sesión» | request `DELETE /api/admin/session` con cabecera `x-argos-request: 1`; tras 204 se muestra la pantalla de acceso; el foco está en el `h1` «Argos»; `role="status"` contiene «Sesión cerrada.» |
| A9 | Cierre fallido (interceptar la ruta con 500) | aparece `role="alert"` con «No se pudo cerrar la sesión. Inténtalo de nuevo.»; el foco vuelve al botón; el botón sigue habilitado; axe 0 violaciones con el aviso visible |
| A10 | Estructura | exactamente 1 `h1`, 1 `main`, 1 `header` (solo shell); `html[lang="es"]`; `document.title === 'Administración — ARGOS'` |
| A11 | Contraste medido (CDP o cálculo con colores computados) de: texto principal, texto secundario, enlace de acceso, botón «Cerrar sesión», mensaje de error | todos ≥ 4.5:1 |
| A12 | Movimiento reducido: `page.emulateMedia({ reducedMotion: 'reduce' })` | `getComputedStyle(...).transitionDuration` = `0s` en enlace, botón y tarjeta |
| A13 | Texto al 200 %: a 320 px fijar `document.documentElement.style.fontSize = '200%'` en ambas vistas | sin pérdida de contenido ni desbordamiento horizontal; botones siguen visibles |
| A14 | Aislamiento de aplicación de usuarios (SC-009-010, repite T1236) | `grep -rn "/admin" src/presentation/web` = 0; la app de usuarios en `/`, `/login`, `/register` no contiene el texto «Administrador» ni enlaces a `/admin` (assert `page.locator('a[href*="admin"]').count() === 0`, y captura idéntica a la de referencia) |
| A15 | SC-009-009: `GET /admin` sin sesión; `GET /admin/otra` y `GET /api/admin/session` sin sesión | `/admin` sirve la pantalla de acceso; las otras dos responden 404 uniforme (`text/plain`, cuerpo `Not Found`) |
| A16 | Sin fuga: DOM de ambas vistas | no contiene `adminId`, correo, `@`, ni la palabra «lista»; ninguna petición a dominios distintos del propio salvo la navegación del enlace de acceso (que no se ejecuta en la prueba) |
| A17 | Sin scripts en línea ni recursos remotos (CSP del proyecto): consola sin errores ni avisos CSP | 0 mensajes de error en consola |

Verificaciones manuales de /sati tras la entrega (revisión posterior, no las implementa keymaker): lector de pantalla (VoiceOver) en ambas vistas, captura de los 6 casos, medición de contraste en pantalla.

## 9. Fuera de alcance de T1235 (para que nadie lo añada)

- Contador de pendientes, lista, aprobar/rechazar, parámetros y coste (T1241/T1256).
- Menú/`nav` del portal, cuenta atrás de sesión, selector de idioma, tema oscuro.
- Enlaces a la app de usuarios y desde ella.
- Mensajes distintos de error de acceso: no existen por diseño.

## 10. Decisiones abiertas (menores, para Morpheus)

- D-S1: ¿se desea que el shell muestre ya el contador de pendientes (`GET /api/admin/pending-count`, ya implementado en T1231)? Esta propuesta lo omite porque T1235 pide «shell vacío de funciones» y el contador se asocia a la lista de T1241. Si Neo lo quiere, es una línea (`Cuentas pendientes: N`) en `EmptyNotice` con `role="status"`; no cambia los demás ítems.
- D-S2: el relleno sólido del botón «Entrar con Google» difiere del contorno de la app de usuarios a propósito (una sola acción principal y diferenciación visual del portal). Reversible a contorno sin impacto en axe.
