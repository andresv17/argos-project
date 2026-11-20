# Architect — 006: correcciones de la prueba en vivo (T900) y proxy `/__dev/media`

Fecha: 2026-11-19. Rama `006-escena-hogar-pixel-art`, HEAD `824d82c`. Autor: `/architect`. Estado: `DRAFT`, propuesta. **No se editó `spec.md`, `plan.md`, `tasks.md` ni contratos**: la 006 tiene T886..T899 `COMPLETED` firmadas por Neo, y todo cambio normativo sobre ellas necesita su autorización antes de aplicarse. Este informe lleva el texto exacto de las enmiendas y las tareas T901..T910 para aplicarlas tras el visto bueno. Sin `src/`, sin `tests/`, sin commit, sin `[x]`.

## 0. Veredicto

| # | Falla de Neo | Estado en disco | Tipo | Bloqueo normativo |
|---|---|---|---|---|
| 1 | Bloque de escena visible en «Mis mascotas» sin mascotas sueltas | `PetsPage.tsx:191` ya oculta con `cards.length === 0`, pero `cards` es la lista de `/pets` (incluye mascotas de hogares y se vacía con el filtro de búsqueda), no el `pets.total` de la escena `OWNER`. Condición equivocada | Defecto UI | Ninguno |
| 2 | «Regenerar» activo sin imagen | `SceneBlock.tsx:91` usa solo `view.actions.canRegenerate` (servidor: rol, cuota, consentimiento), que no mira la imagen | Defecto UI | Ninguno (REQ-007 calla; se precisa) |
| 3 | El modelo no distingue `IMG_1`, `IMG_2` | `buildGeminiBody` emite `[{text: prompt}, inlineData...]` sin etiqueta | Defecto de cableado | Ninguno |
| 4a | Cambio de foto del hogar debe ser regeneración completa | **Ya se cumple**: `decide-mode.ts:84` hace `scratch = ... \|\| householdChanged` y `mode = FROM_SCRATCH`; `householdBlock` solo se emite en `FROM_SCRATCH`/`REGENERATE` y el prompt de ambos modos es idéntico (`scratchBlocks`). REQ-ESC6-006 punto 2 lo exige | Sin cambio de código | Ver §3.4 |
| 4b | Redibujar toda foto de referencia en pixel art | Falta en el prompt | Cambio de prompt | Requiere visto bueno de Neo (plantilla viene del requerimiento) |
| 4c | Numerar mascotas «Pet 1:» | Falta | Cambio de prompt | Idem |
| P | Proxy `/__dev/media` | Solo desarrollo; dentro del ámbito 006 | Configuración | Ninguno |

**No hay contradicción con documentos `LOCKED` ni con la constitución 3.7.0**: ninguna enmienda toca `spec-system.md`, contratos de 001..005, ni el Principio VI. Los textos normativos de la 006 están en `DRAFT`. Lo que sí exige a Neo es aprobar el cambio de plantilla de prompt (puntos 4b y 4c), porque `STYLE_BASE_TEXT` y las frases de hogar/mascota son byte a byte del requerimiento de Neo (`claude/requerimiento-escena-hogar-pixel-art.md`) y las fixtures canónicas (`SC-ESC6-023`) cambian. **No se modifica `STYLE_BASE_TEXT` ni las frases existentes**; solo se añaden un prefijo y un bloque.

## 1. Punto 1: ocultar la escena `OWNER` sin mascotas sueltas

Causa: la condición usa `cards.length`; en el contexto «Mis mascotas» `cards` trae todas las mascotas accesibles (también las asignadas a hogares), así que con mascotas solo en un hogar el bloque `OWNER` aparece con `pets.total = 0`. Además, con un filtro de búsqueda sin resultados el bloque desaparece aunque haya mascotas sueltas.

Decisión: el dato de verdad es la propia escena (`SceneViewData.pets.total`), no la lista filtrada. Regla (en el contenedor `SceneBlock`/`HomeScene`, solo con `scope.kind === 'OWNER'`): no renderizar el bloque cuando se cumplen **a la vez** `view.pets.total === 0`, `view.imageTag === null` y `consent.householdPhotoGranted === false` y `consent.petPhotosGranted === false`. Las dos últimas condiciones protegen: (i) una imagen ya generada cuyas mascotas pasaron a un hogar (hay `REMOVE` pendiente y la imagen debe poder verse y actualizarse), y (ii) la acción visible «Retirar consentimiento y borrar imágenes» (REQ-ESC6-025), que vive en los hijos del bloque. Sin ellas el usuario perdería el único acceso a retirar un consentimiento vigente. Mientras `view === null` (cargando) no se pinta nada para `OWNER`; con `READY` y la condición cumplida, `null`.
Recarga: el bloque debe volver a leer la escena cuando la lista de mascotas cambie (alta o asignación). `HomeScene key="escena-mine"` no se remonta con `refreshAll`; la tarea debe cubrirlo (p. ej. `key` que incluya `cards.length` o un `reload` invocado por `PetsPage` tras crear/asignar). El caso `HOUSEHOLD` no cambia (el hogar siempre se muestra: puede tener foto del hogar sin mascotas, REQ-ESC6-010).
Alternativa rechazada: ocultar solo con `pets.total === 0` (la literal de Neo): oculta una imagen vigente y el retiro de consentimiento. Se propone la regla con guardas; Neo puede pedir la literal.

## 2. Punto 2: «Regenerar» sin imagen

Decisión: **solo presentación** (`SceneBlockView`). Con `view.imageTag === null` no se renderiza «Regenerar escena desde cero» (se oculta, no se deja deshabilitado: la regla del proyecto es cero UI muerta). «Actualizar imagen del hogar» se mantiene, gobernado por `canUpdate`/`blockedReason`. Con `status = failed` sin imagen sigue «Reintentar». Etiqueta del botón sin imagen: se conserva; renombrarla a «Crear imagen del hogar» es opcional y de Neo (T875/t875 tienen la cadena).
Alternativa rechazada: `canRegenerate = false` sin imagen en el servidor (`scene-use-cases.ts:183`, `scene.schema.json:147`, `t851`). Motivo: toca contrato y caso de uso para un defecto visual; con `REGENERATE` sin imagen el servidor ya compone un `REGENERATE` equivalente a `FROM_SCRATCH` con la misma cuota. Si Neo prefiere defensa en profundidad queda como tarea aparte (no incluida).
Enmienda mínima: REQ-ESC6-007 añade «La interfaz solo ofrece esta acción cuando existe imagen vigente (`imageTag` no nulo)»; la semántica del servidor no cambia.

## 3. Punto 3 y 4: cableado y prompt

### 3.3 Punto 3: etiqueta de referencia en el cuerpo `generateContent`

`buildGeminiBody` emite `parts = [{text: prompt}, {text:"IMG_1:"}, {inlineData}, {text:"IMG_2:"}, {inlineData}, ...]`, con `r.ref` del puerto (`SceneReferenceImage.ref`, ya `IMG_${n}`), en el mismo orden recibido. Sin referencias: `parts = [{text: prompt}]` (sin cambio). La etiqueta es una cadena fija derivada de un enum de ranura: no contiene datos de usuario (INV-ESC6-010, INV-ESC6-016 intactos). Sin cambio de contrato, de puerto ni del fake. El tope inline (`GEMINI_INLINE_MAX_BYTES`) cambia en bytes irrelevantes (≈8 por referencia). Enmienda: REQ-ESC6-037 (3) añade «el cuerpo antepone a cada `inlineData` una parte de texto `IMG_n:` con la etiqueta de su ranura». Nuevo `SC-ESC6-104`.

### 3.4 Punto 4a: cambio de foto del hogar (sin cambio de código; con prueba de regresión)

`REQ-ESC6-006` punto 2 y la precedencia (`REGENERATE` > sin imagen > cambio de foto del hogar > incrementales) ya imponen `FROM_SCRATCH` ante alta, reemplazo o borrado de la foto del hogar, con `householdRef = IMG_1` y todas las mascotas en `RENDER`. El prompt de `FROM_SCRATCH` y el de `REGENERATE` son el mismo (`scratchBlocks`), y `householdBlock` no puede emitirse en modos incrementales. Convertir ese caso a `REGENERATE` **no cambia el texto enviado** y sí rompe la semántica del enum (`REGENERATE` = elección explícita del usuario, REQ-007), `t839`, la precedencia y el contrato `scene-payload`. Decisión: **no cambiar `decide-mode.ts`**; añadir una prueba de regresión (SC-ESC6-107) que fije «foto del hogar nueva o reemplazada con imagen vigente → `FROM_SCRATCH`, `currentSceneRef = null`, `householdRef = IMG_1`, todas las mascotas `RENDER`, prompt con `householdBlock` y sin bloque incremental».
Si en la repetición en vivo (T910) Neo sigue viendo la foto del hogar sin redibujar con esta regla cumplida, la causa es de prompt (4b) o de la huella: el keymaker debe comprobar con una prueba que `inputs-snapshot` cambia al reemplazar la foto (nuevo identificador de objeto, REQ-ESC6-004) antes de tocar `decide-mode`. Hallazgo para `/oracle`: ese caso no figura hoy en `t839` como prueba explícita de «reemplazo con la misma mascota»; confirmar.

### 3.5 Punto 4b: reforzar el redibujado en pixel art

Nueva constante de dominio `PIXEL_REDRAW_RULE` (texto fijo, inglés, sin contenido variable):
`Treat every photographic reference image strictly as a visual guide: redraw the room and every pet entirely in the 32-bit isometric pixel art style, and leave no photographic pixels, textures, or realistic regions anywhere in the image.`
Emisión: un bloque propio, separado por línea en blanco, **solo si algún bloque emitido lleva `photoRef` no nulo** (hogar o mascota con foto). Ubicación: en modos desde cero, tras el bloque de mascotas y su cierre «Place all N pets…»; en modos incrementales, antes de `STYLE_CLOSING` («Match the exact 32-bit…»), cuando una mascota `ADD`/`REPLACE` lleva foto. Los casos sin foto no cambian de byte (menos fixtures afectadas). No se tocan las frases existentes «Use IMG_n as the exact visual reference…» (conservan «translating it into this 32-bit isometric pixel art style» y «preserving its species, fur colors…»: preservar identidad no contradice redibujar; el bloque lo explicita).

### 3.6 Punto 4c: numerar mascotas

En `scratchBlocks`, cada línea de mascota `RENDER` pasa a `Pet {k}: {petSentence}` con `k` = posición 1-based en el orden del payload (que es el orden de selección de `decide-mode`). Aplica a modos desde cero; el bloque incremental conserva «- Add: …» (no hay referencia cruzada que numerar y la ranura `IMG_n` ya identifica la foto). El número es ordinal, no es id ni nombre (INV-ESC6-010/017 intactos). «Place all {N} pets…» no cambia.
Ejemplo (desde cero, hogar con foto, 2 mascotas con foto):
```
{STYLE_BASE_TEXT}

Use IMG_1 as the exact visual reference for the room's layout, ...

Pet 1: Use IMG_2 as the exact visual reference for this pet, ...
Pet 2: Use IMG_3 as the exact visual reference for this pet, ...

Place all 2 pets naturally and separately ...

Treat every photographic reference image strictly as a visual guide: ...
```
Enmienda: `plan.md` §5.3 puntos 2, 3 y 4 (texto en §6 de este informe) y `REQ-ESC6-016` (bloque (3) numerado; bloque (5) de redibujado condicional). `SC-ESC6-023/066/082` y las fixtures de `t841` cambian byte a byte solo en los casos con foto o con ≥1 mascota `RENDER`.

## 4. Proxy `/__dev/media` (vite.config.ts)

- **Solo desarrollo**: `server.proxy` pertenece al servidor de `vite dev`; no entra en `vite build` ni en la imagen (`dist/`). Reenvía a la API local (`E2E_API_PORT`, 3100) la ruta que ya sirve `registerDevMediaRoutes` (T571, REQ-GCS-003 de 004), la cual: exige sesión, no se registra con `NODE_ENV=production` y solo existe con `ARGOS_MEDIA_DRIVER=memory`. El proxy no añade superficie: sin él, el 302 de la imagen de escena hacia `/__dev/media/...` caía en el servidor de Vite (SPA) y la imagen no se veía en desarrollo.
- **Producción**: queda fuera por construcción (no se empaqueta); la guarda existente (T566: driver `memory` rechazado con `NODE_ENV=production`) más la ausencia de la ruta lo garantizan. No requiere enmienda a 004 (`LOCKED`) ni a la constitución.
- **Ámbito**: entra en la 006 como soporte de la prueba local T900 (la imagen de escena se sirve por ese camino en desarrollo). Recomendación: incluirlo en el commit de la tarea T909 (compuertas) con una línea de justificación; no necesita tarea de código propia ni SC. Prueba opcional barata: aserción estática sobre `vite.config.ts` (claves de proxy = `/api` y `/__dev/media`, ambas a `127.0.0.1`), que lo fije sin red. Evidencia de seguridad ya existente: `tests/integration/media/t571-dev-media-route.spec.ts`.
- Sigue siendo diff sin commit; el commit debe aislar `vite.config.ts` por ruta (no mezclar `.claude/`, `claude/`, `.gitignore`, etc.).

## 5. Impacto en pruebas existentes

| Prueba | Efecto |
|---|---|
| `tests/unit/gemini-api-scene-generator.spec.ts` (≈línea 77, `parts` esperadas) | Cambia: partes con etiquetas `IMG_n:` intercaladas (rojo previsto) |
| `tests/unit/t841-prompt-payload-escena-006.spec.ts` (fixtures canónicas, SC-023/066/082) | Cambian solo los casos con foto o con mascotas `RENDER`; los sin foto y sin mascotas quedan intactos |
| `t848b`, `t849`, `t855` (usan «exact visual reference» / «Place all») | Revisar si comparan texto exacto o fragmentos; si exacto, actualizar con las mismas fixtures |
| `tests/unit/t839-decide-mode-escena-006.spec.ts` | Sin cambio de comportamiento; se añade el caso de regresión 4a |
| `tests/unit/presentation/t875-escena-presentacion.spec.ts`, `t876-escena-integracion.spec.ts` (aserta `<HomeScene[^>]*kind: 'OWNER'` sobre el fuente de `PetsPage`) | t876 puede romper si cambia la forma de montar `HomeScene` en `PetsPage`; mantener la forma o actualizar el patrón. t875: nuevo caso «sin imagen sin Regenerar» |
| `tests/unit/t851-get-scene-escena-006.spec.ts` | Sin cambio (servidor intacto) |
| `escena-fixtures.ts` (`canRegenerate: true`) | Sin cambio; añadir variante `imageTag: null` |
| Trazabilidad | Nuevos `SC-ESC6-104..109` deben figurar en la tabla de cobertura y `verify-traceability.sh --feature 006` (rango de gemini-api ya comentado en el script) |

## 6. Enmiendas mínimas propuestas (texto aplicable tras visto bueno de Neo)

1. `spec.md` REQ-ESC6-007: añadir al final «La interfaz solo ofrece esta acción cuando existe imagen vigente (`imageTag` no nulo); sin imagen la acción disponible es la creación inicial (`REQ-ESC6-005`).»
2. `spec.md` REQ-ESC6-019: añadir «El bloque de la escena del propietario sin hogar no se muestra si la escena no tiene mascotas (`pets.total = 0`), ni imagen vigente, ni consentimiento concedido; con cualquiera de esas tres cosas se muestra.»
3. `spec.md` REQ-ESC6-016: en (3) «cada mascota `RENDER` en una línea `Pet {k}:` (`k` ordinal 1-based en el orden del payload)»; añadir (5) «bloque de redibujado (`PIXEL_REDRAW_RULE`) cuando algún bloque emitido lleva `photoRef`».
4. `spec.md` REQ-ESC6-037 (3): «antepone a cada `inlineData` una parte de texto `IMG_n:`».
5. `plan.md` §5.3: puntos 2, 3, 4 según §3.5 y §3.6; ejemplo canónico del §3.6.
6. SC nuevos (Given/When/Then medibles):
   - `SC-ESC6-104` (REQ-037): Given 3 referencias, When `buildGeminiBody`, Then `parts` = `[prompt, "IMG_1:", inline, "IMG_2:", inline, "IMG_3:", inline]` en ese orden y 0 etiquetas con 0 referencias.
   - `SC-ESC6-105` (REQ-016): Given 3 mascotas `RENDER` (con y sin foto), Then las líneas son `Pet 1:`, `Pet 2:`, `Pet 3:` en orden del payload, 0 apariciones de id o nombre, y el cierre sigue «Place all 3 pets…».
   - `SC-ESC6-106` (REQ-016): Given payload con ≥1 `photoRef`, Then el texto contiene exactamente 1 vez `PIXEL_REDRAW_RULE`; sin `photoRef`, 0 veces y salida byte a byte igual a la anterior; misma entrada, misma salida.
   - `SC-ESC6-107` (REQ-006): Given imagen vigente y foto del hogar nueva, reemplazada o borrada, When `decideMode` con `UPDATE`, Then `FROM_SCRATCH`, `currentSceneRef = null`, mascotas `RENDER`, y el prompt tiene el bloque de hogar y ningún bloque incremental.
   - `SC-ESC6-108` (REQ-007, REQ-019): Given `imageTag = null`, When se renderiza `SceneBlockView`, Then 0 botones «Regenerar escena desde cero» y «Actualizar»/«Reintentar» según `canUpdate`; con `imageTag` no nulo el botón sigue.
   - `SC-ESC6-109` (REQ-019): Given `OWNER` con `pets.total = 0`, `imageTag = null` y sin consentimiento, Then 0 elementos de la escena; con una de esas tres condiciones distinta, el bloque se muestra; `HOUSEHOLD` siempre se muestra.

## 7. Tareas nuevas (Fase 10, todas nacen `[ ]`; dependen de la aprobación de Neo de §6)

- [ ] T901 [GOV] Aplicar a `spec.md`, `plan.md`, `tasks.md` las enmiendas de §6 y la tabla de cobertura (`SC-ESC6-104..109`); dejar `DRAFT` y pedir a `/oracle` verificación documental. Aceptación: `verify-traceability.sh --feature 006` CUMPLE y 0 IDs sin tarea. Autor: `/architect`. Dep: visto bueno de Neo.
- [ ] T902 [P] Pruebas rojas de cableado (`tests/unit/gemini-api-scene-generator.spec.ts`): etiquetas `IMG_n:` — SC-ESC6-104; REQ-037. Aceptación: rojo antes, verde tras T903; 0 llamadas de red. Dep: T901.
- [ ] T903 `src/infrastructure/adapters/gemini-api-wire.ts` `buildGeminiBody`: antepone `{text: r.ref + ':'}` a cada `inlineData`; sin cambio de puerto ni de adaptador — REQ-ESC6-037; INV-ESC6-016. Dep: T902.
- [ ] T904 [P] Pruebas rojas de prompt y modo (`t841`, `t839`): numeración `Pet k:`, `PIXEL_REDRAW_RULE` condicional, regresión 4a — SC-ESC6-105, 106, 107; REQ-ESC6-006, 016. Aceptación: fixtures canónicas nuevas solo con foto/mascotas; los casos sin foto sin cambio de byte. Dep: T901.
- [ ] T905 `src/domain/scene/build-image-prompt.ts` (y `pet-phrases.ts` si hace falta): numeración y bloque de redibujado; `decide-mode.ts` **sin cambio**; función pura, sin `id`, nombre ni texto libre nuevo — REQ-ESC6-016; INV-ESC6-001, 010, 017. Dep: T904.
- [ ] T906 [P] Pruebas rojas e implementación de `SceneBlockView`: sin `imageTag` no hay «Regenerar» — SC-ESC6-108; REQ-ESC6-007, 019 (`t875` + variante en `escena-fixtures.ts`). Dep: T901.
- [ ] T907 [P] Pruebas rojas e implementación del ocultamiento `OWNER` en `HomeScene`/`SceneBlock` y de la recarga al cambiar mascotas en `PetsPage` — SC-ESC6-109; REQ-ESC6-019; cuidar `t876` (patrón `<HomeScene[^>]*kind: 'OWNER'`). Dep: T901.
- [ ] T908 Incluir `vite.config.ts` (proxy `/__dev/media`, solo desarrollo) en el commit de la fase, con aserción estática opcional de las claves del proxy — REQ-GCS-003 (004), INV-ESC6-020 por coherencia. Dep: T901.
- [ ] T909 Compuertas: `bash scripts/verify-traceability.sh --feature 006`, `bash scripts/verify-oracles.sh`, `npx tsc --noEmit`, `npm run test:gate` (PostgreSQL 17 real); `package.json` y lock sin cambios — SC-ESC6-104..109. Dep: T903, T905, T906, T907, T908.
- [ ] T910 [GOV] `/oracle` audita en disco T901..T909 y emite veredicto; el techo de agentes es `REVIEW`; solo Neo marca `COMPLETED`. Luego [HUM] repetición de la prueba en vivo por Neo (mismas imágenes de prueba; comprobar redibujado del hogar y de cada mascota, numeración y orden de `IMG_n`). Dep: T909.

Orden recomendado para `/keymaker`: T902→T903, T904→T905, T906, T907, T908 (las tres ramas son independientes; ninguna toca contratos ni `src/generated/`). Cuota de la prueba en vivo: las tres primeras ramas no consumen llamadas.

## 8. Riesgos y límites

- La eficacia de 4b y 4c sobre el modelo (`gemini-2.5-flash-image`) no es verificable en disco: la prueba mide el texto enviado y el orden de partes, no el resultado visual. Queda a la repetición de Neo (T910); si persisten regiones fotorrealistas, la siguiente palanca es el orden de partes (referencias antes del texto) o un cambio de modelo, ambos fuera de esta enmienda.
- Con 4b el texto del prompt crece unos 250 caracteres solo en casos con foto; sin impacto en cuota ni en `GEMINI_INLINE_MAX_BYTES`.
- La regla `OWNER` del §1 se aparta de la literal de Neo (`pets.total === 0`); decisión suya.
- Hallazgo menor, sin tarea: el filtro de búsqueda de `PetsPage` vacía `cards` y hoy oculta la escena por error; lo corrige T907.
- Consultas previas del flujo (`/mifune`, `/lock`, `/merovingian`, `/mouse`) no se invocaron: el cambio no toca contratos ni dependencias, y la enmienda queda en `DRAFT` pendiente de Neo; recomendable `/mouse` tras T901 si Neo aprueba.
