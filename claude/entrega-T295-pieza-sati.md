# Entrega T295 — Revisión de Sati de lo construido contra ui_blueprint v2.4

- **Fecha:** 2026-11-14. **Autora:** Sati. **Rama:** 002-plataforma-v21 (commits 8da9bc1 y 425c006). **Para:** Neo, vía Morpheus.
- **REQ cubiertos:** REQ-UI2-001 (navegación), REQ-UI2-003 (distinción del dueño), REQ-UI2-008 (responsivo y accesible, 320/768/1024/1280 px).
- **Alcance:** solo lectura. No se tocó `src/`, `tests/`, `specs/`, contratos, `logos.json` ni el blueprint. T295 sigue abierta hasta tu aprobación visual.

## 1. Resumen: construido vs diseño

Lo construido sigue el blueprint v2.4 con fidelidad alta. Sin desviaciones bloqueantes.

- **Marco y navegación (§3):** un único marco L1; `<nav aria-label="Principal">` con Mascotas, Hogares (dos insignias de contadores, literales "N hogares" y "N invitaciones"), Respaldo y Perfil; sin menú del avatar ni barra inferior; estado activo con relleno lima y línea de 2 px; nombre y "Cerrar sesión" a la derecha; nombre oculto bajo 480 px; salto al contenido; `main#main-content` y `#pet-panel` son elementos distintos.
- **`/` Riel y ficha (§4):** riel `listbox` con foco itinerante, opción de 148 px con los seis datos (nombre, especie y edad, peso, "Alertas: N vencidas · M próximas" con tono, "Dueño: …"), riel horizontal bajo `lg` y vertical desde `lg`, un único "Nueva mascota" (fuera del `<ul>`, solo en "Mis mascotas"), hero con avatar de 96 px, edad y peso, tarjeta oliva ("N alertas activas", vencidas, próximas, al día, dueño, "Registrar peso"), pestañas de módulo y gráfico más tabla de peso con formato "valor kg" y signo U+2212.
- **Avatar (§4.2):** `data:` directo, `http(s)` con `no-referrer`, `loading="lazy"` y caída a iniciales en `onError`; aro de dueño solo en hogar; glifo de especie de 20 px, decorativo.
- **Dueño (REQ-UI2-003):** `OwnerBadge` muestra siempre "Dueño: nombre" en texto; con `colorToken` usa píldora de color con texto blanco; "Solo lectura" se muestra con borde y texto; sin controles que la matriz niega.
- **`/households`, `/backup`, `/cuenta` (§5.2 a §5.4):** dos columnas desde `lg` en hogares (rol real más "(Propietario)", `roleOnJoin` con inicial Lector, "Eliminar hogar" solo al propietario); respaldo con exportar e importar; perfil con tres bloques en el orden del blueprint y zona de peligro en dos pasos.
- **Estados (§6):** aviso de sesión con `role="status"` y temporizador en `idle-notice.ts`; errores con `role="alert"`.

## 2. Verificación en navegador (4 anchos × 4 rutas = 16 mediciones)

Entorno: API `127.0.0.1:3190` y web `127.0.0.1:5190` (3180 y 5180 estaban ocupados por otra ejecución en paralelo), base SQLite temporal en el scratchpad, usuario de prueba con 2 mascotas, 1 hogar y 1 invitación enviada.

| Ancho | Rutas `/`, `/households`, `/backup`, `/cuenta` | Desborde horizontal (`scrollWidth` = ancho) | `backdrop-filter` activos | "Nueva mascota" en `/` | Zonas táctiles < 48 px |
|---|---|---|---|---|---|
| 320 | 4/4 | Sin desborde (320 = 320) | 0 | 1 | 0 |
| 768 | 4/4 | Sin desborde | 1 (`blur(12px)`) | 1 | 0 |
| 1024 | 4/4 | Sin desborde | 1 | 1 | 0 |
| 1280 | 4/4 | Sin desborde | 1 | 1 | 0 |

Las otras rutas tienen 0 "Nueva mascota", como corresponde. Cada pantalla tiene un `h1`. No se ejecutó axe-core (queda a cargo de T294 de Seraph); el contraste no se recalculó, porque los tokens coinciden con el blueprint (`tailwind.config.ts`).

## 3. Desviaciones

| # | Archivo:línea | Blueprint | Código | Clase |
|---|---|---|---|---|
| D1 | `pages/AppShell.tsx:41-75` | §4.1 móvil: "Argos [Cerrar sesión]" en una fila y la navegación en otra; en total 2 filas | A 320 px el `flex-wrap` produce 4 filas (wordmark, Mascotas, Hogares con insignias, Respaldo y Perfil) más "Cerrar sesión" en otra: unos 230 px antes del contenido (ver `inicio-320.png`). Cumple el texto de §3.2 ("fila que envuelve"), no el esquema. Sin impacto WCAG | A corregir |
| D2 | `pages/AccountPage.tsx`, campos de contraseña en `components/Field.tsx:83-89` | §5.4: dos columnas desde 768 px | El botón "Mostrar contraseña" (`shrink-0`) deja el campo en unos 138 px a 768 px (ver `cuenta-768.png`). Es utilizable, pero queda estrecho para una contraseña de 10 a 128 caracteres | A corregir |
| D3 | `components/PetDashboard.tsx:323` (hero) | §4.1: avatar de 96 px a la derecha del titular | A 320 px el avatar cae debajo de "Editar" y "Eliminar" porque el hero envuelve (`flex-wrap`). Es legible, pero desperdicia altura y rompe la jerarquía del hero | A corregir |
| D4 | `styles.css:21` | §2.5: `bg-deco` se oculta solo bajo 640 px | Se muestra solo desde 1024 px (a 768 px no aparece). El comentario cita §1.2 y §5.5 de la v1.1. Es decorativo y no está detrás de texto | Aceptable |
| D5 | `App.tsx:22-28` | §6: "Cargando…" dentro del marco | Va como `<p>` suelto, sin marco, con `p-4` | Aceptable |
| D6 | `components/PetAvatar.tsx:15-25` | §4.2: glifo por especie (CANINE y FELINE) y genérico para el resto | Siempre la huella genérica (icono de 12 px en una insignia de 20 px). El blueprint admite posponer los específicos | Aceptable |
| D7 | `pages/PetsPage.tsx:142-172` | §4.1 escritorio: el contexto va sobre el filtro, y el filtro a la derecha del contexto | Contexto, luego el filtro de dos campos en su propia fila y después riel y ficha. Orden de foco coherente con el visual | Aceptable |
| D8 | `components/PetCards.tsx:104` | §4.2: riel con `snap-x` | `snap-x` sin `snap-mandatory`: no hay ajuste real. Efecto nulo | Aceptable |
| D9 | `pages/BackupPage.tsx` | §5.3 solo describe un `input type="file"`, sin arrastre ni barra de fases | El código tiene zona de arrastre, previsualización y barra "Validando, Previsualizando, Aplicando, Terminada" (REQ-UI2-007, spec L269). A 320 px las píldoras caben (derecha en 283 de 287 px) | Aceptable (ver contradicción) |

**Bloqueantes: ninguna.**

### Contradicción objetiva (no editada)

El blueprint v2.4 §5.3 (`/backup`) no recoge lo que pide REQ-UI2-007 en `specs/002-plataforma-v21/spec.md:269` (selección por arrastre, previsualización, barra de fases sin porcentaje). El código implementa el REQ. El blueprint está desfasado respecto a la spec en esa sección. Propuesta: que Sati añada en v2.5 la subsección de arrastre, previsualización y fases (sin tocar el código). Decisión de Neo.

## 4. Capturas

Carpeta: `/Users/andresvalejo/Documents/Tecnica/Proyecto Argos/.playwright-mcp/pieza-T295/`. Página completa, nombre `<ruta>-<ancho>.png`:

- `inicio-320.png`, `inicio-768.png`, `inicio-1024.png`, `inicio-1280.png` (`/`)
- `hogares-320.png`, `hogares-768.png`, `hogares-1024.png`, `hogares-1280.png` (`/households`)
- `respaldo-320.png`, `respaldo-768.png`, `respaldo-1024.png`, `respaldo-1280.png` (`/backup`)
- `cuenta-320.png`, `cuenta-768.png`, `cuenta-1024.png`, `cuenta-1280.png` (`/cuenta`)

## 5. Cómo ver la pieza

Desde la raíz del proyecto, con `.env` presente:

```bash
npm run dev        # API en http://127.0.0.1:3100 y web en http://127.0.0.1:5173
```

Abre `http://127.0.0.1:5173/register`, crea una cuenta y recorre `/`, `/households`, `/backup` y `/cuenta`. Para ver el riel, la tarjeta oliva y "Casa Pérez", crea dos mascotas, un peso y un hogar. Redimensiona a 320, 768, 1024 y 1280 px. Las mediciones de arriba se hicieron con una base temporal en 3190 y 5190.

## 6. Recomendación

**Aprobar con correcciones menores.** Ninguna desviación afecta WCAG ni el contrato; los cuatro anchos pasan las comprobaciones de desborde, un único "Nueva mascota" y `backdrop-filter` (1 desde 640 px, 0 por debajo).

Correcciones antes de aprobar (todas de presentación, para Keymaker, sin bloquear el cierre si Neo prefiere aprobar tal cual):

1. D1: compactar la cabecera móvil (wordmark y "Cerrar sesión" en una fila, navegación en otra).
2. D2: apilar el botón "Mostrar contraseña" bajo el campo o reducir su ancho en `sm`/`md` en los formularios de dos columnas.
3. D3: mantener el avatar del hero junto al titular a 320 px.
4. Decisión de Neo: actualizar el blueprint §5.3 (v2.5) para alinearlo con REQ-UI2-007.

Pendiente fuera de esta revisión: axe-core completo (T294, Seraph).
