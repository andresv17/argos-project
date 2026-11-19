# Architect 006: Fase 12 (T924..T934), tercera ronda de la prueba en vivo T910

Fecha: 2026-11-19. Rama `006-escena-hogar-pixel-art`, HEAD `a088f1c`. Estado: `DRAFT`. Autor: `/architect` (sonnet). Sin `src/`, `tests/`, `contracts/`, `src/generated/`, `vite.config.ts` ni constitución; sin commit; ninguna tarea `[x]`; `T910` y `T923` siguen `[ ]`. Directivas de Neo (`D6-20`, alcance no reabierto).

## 1. Hallazgos de diseño

**Directiva 1 (hogar principal en «Mascotas»).** `PetsPage.tsx:191` pasa `householdId={isMine ? null : contextId}`; por eso en «Mis mascotas» nunca hay imagen. Regla fijada: **hogar principal** = primero de los hogares `ACTIVE` del usuario (los de `GET /households`, que `PetsPage` ya carga) ordenados por `household.createdAt` ascendente y desempate por `household.id` ascendente. El orden lo aplica el cliente con la función pura `principalHouseholdId` (`scene-view.ts`); hoy el servidor ya ordena así (`ListMyHouseholdsUseCase`), pero el OpenAPI no lo garantiza, por eso no se depende de él. Sin llamadas nuevas; `HomeSceneImage` no cambia (lee por cambio del `householdId` resuelto: elegir en el selector el mismo hogar que ya era principal no repite la lectura). Con 0 hogares, `imageTag = null` o error: nada, sin caer al segundo hogar. Relación con N2-15 B: con 0 hogares rige el bloque `OWNER` de «Hogar» y «Mascotas» no muestra nada; con 1 o más hogares rige esta regla y no hay bloque `OWNER`; las dos reglas se excluyen por número de hogares. Con la directiva 1 de la Fase 11 (solo visualización): se mantiene íntegra (0 controles, 0 estado, 0 llamadas a `/me/scene`). Limitación declarada: si el usuario ingresó antes a un hogar ajeno más antiguo que el que él creó, el principal es ese hogar ajeno (la escena `OWNER` migra al primer hogar que él crea, `REQ-ESC6-032`); el otro se elige en el selector. No requiere decisión de Nivel 2 (Neo dijo «el primero del usuario» y el orden es determinista); si prefiere otro criterio es cambio de una función.

**Directiva 2 (fotos `KEEP` en incrementales).**
- Causa: `decide-mode.ts` asigna `ref` solo a `petAction !== 'KEEP'`. `scene-payload.ts` deriva `hasReferencePhoto = ref !== null` y `scene-spec.ts` copia el valor del payload, así que **`scene-spec.ts` no necesita cambio de código** (el JSON saneado refleja la ranura sola). Cambios reales: `decide-mode.ts` (ranuras) y `scene-run-use-case.ts` (orden de lectura y manejo de omisión); `scene-composition.ts` solo si N2-16 lo exige.
- Modos: `INCREMENTAL_ADD`, `INCREMENTAL_REPLACE` e `INCREMENTAL_MIXED` según la directiva. `INCREMENTAL_REMOVE` queda fuera (no dibuja nada, no hay foto necesaria: `INV-ESC6-010`); lo declaro por si Neo lo quería incluido.
- **¿Contrato o solo prompt?** Solo prompt y carga útil derivada: **no toca contrato**. `scene-payload.schema.json` ya define `hasReferencePhoto`/`photoRef` por foto y consentimiento, sin depender de `action` (verificado: la única regla condicional enlaza `hasReferencePhoto` con `photoRef`; ninguna ata `KEEP` a `null`). El JSON del prompt cambia solo de valor (claves y orden iguales). Única prosa afectada: el `change_note` del payload dice «mascotas por orden de selección»; solo la opción B de N2-16 la volvería inexacta.
- Invariantes: `INV-ESC6-001` (pura) intacta; `INV-ESC6-010` (a la IA solo las imágenes necesarias del payload actual): las `KEEP` pasan a ser «necesarias» por la directiva de Neo; las fotos solo viajan con consentimiento vigente (`REQ-ESC6-024`) y el conjunto de dueños de `scene_image_sources` no gana usuarios (las `KEEP` ya figuraban en la imagen previa). `INV-ESC6-017` intacta (cero `id`, nombres, `biography`). Observación para `/rama` o `/oracle`: cada incremental reenvía fotos de mascotas ya incorporadas (más tráfico de datos personales al proveedor, mismo consentimiento).
- Cota de imágenes: incremental pasa de `1 + (#ADD + #REPLACE)` a `1 + #mascotas con foto` ≤ `1 + N`, igual a la cota `N + 1` desde cero; `D6-02`/`SC-ESC6-060` no cambian. `research.md` §2.2 tenía la frase «`KEEP` no necesitan su foto»: corregida.
- `PIXEL_REDRAW_RULE` en incrementales: condición sin cambio (foto en `ADD` o `REPLACE`; una `KEEP` no se redibuja). No se añade frase nueva al prompt. Riesgo: el proveedor podría no asociar la foto `KEEP` con su entrada del JSON; se comprueba en la repetición en vivo (T934). Una frase fija nueva sería decisión de texto de Neo.
- **Decisión de producto abierta (N2-16)**: ver sección 4.

**Directiva 3 (textos de ayuda).** Presentación pura, sin contrato. Cada botón pasa a un grupo (botón + `p` visible debajo). Ayuda de «Actualizar» se omite cuando el botón dice «Reintentar» (tras fallo no actualiza contenido sobre la imagen actual; criterio mío, reversible); ayuda de «Regenerar» solo con el botón renderizado (`imageTag` no nulo). A11y: `aria-describedby` con ids únicos (`useId`); el botón de actualizar combina el id del motivo de deshabilitado y el de la ayuda separados por espacio (`Button.describedBy` ya es `string`, sin cambio de componente); sin `role=alert` ni `aria-live`; texto visible aunque el botón esté deshabilitado. Responsive: contenedor `flex flex-wrap items-start gap-3`, grupos `min-w-0 max-w-full`; 320 px apilado sin desborde, 1024 y 1280 px en fila con salto; `text-sm` (14 px), `text-slate-800` sobre blanco (>= 4.5:1). Sin jsdom: pruebas por inspección de fuente y helpers puros (limitación OBS-3 de T923); verificación visual [HUM] en T934.

## 2. Artefactos modificados
- `specs/006-escena-hogar-pixel-art/spec.md`: `REQ-ESC6-006`, `008`, `016`, `019`, `027`, `EDGE-ESC6-028` (enmiendas); `SC-ESC6-119..130` nuevos (Given/When/Then); `D6-20`; `N2-16` (pendiente); matriz `REQ → SC → tareas` (cabecera regenerada: 134 tareas, 118 `[x]`, 16 abiertas; 12 filas actualizadas); conteo (130 SC, 20 D6, 16 N2); registro final.
- `specs/006-escena-hogar-pixel-art/plan.md`: §3 (referencias `KEEP`), §5.3.1, §5.7, §8 `ADR-006-14..16`, §11 (4 filas), §12 (5 filas).
- `specs/006-escena-hogar-pixel-art/tasks.md`: Fase 12 `T924..T934` todas `[ ]`; cabecera, conteo (134), cobertura (233 IDs) y dependencias.
- `specs/006-escena-hogar-pixel-art/research.md`: una frase de §2.2.
- `claude/log-architect.md` (bitácora propia) y esta acta.

## 3. Tareas y SC nuevos
| Tarea | Contenido | Dep | SC |
|---|---|---|---|
| T924 [GOV] | aplicar enmiendas DRAFT | T922 | 119..130 |
| T925 [P] | pruebas rojas hogar principal | T924 | 119, 120, 121 |
| T926 | `principalHouseholdId` y `PetsPage` | T925 | 119, 120, 121 |
| T927 [P] | pruebas rojas `KEEP` con foto | T924 | 122, 123, 124, 126, 127 |
| T928 [N2] | `decide-mode.ts` | T927, N2-16 | 122, 123, 127 |
| T929 [P][N2] | pruebas rojas tope de bytes y `degraded` | T924, N2-16 | 125 |
| T930 [N2] | `scene-run-use-case.ts` | T928, T929 | 124, 125, 126 |
| T931 [P] | pruebas rojas textos de ayuda | T924 | 128, 129, 130 |
| T932 | `SceneBlock.tsx` | T931 | 128, 129, 130 |
| T933 | compuertas | T926, T930, T932 | 119..130 |
| T934 [GOV] | `/oracle` + repetición [HUM] | T933 | 119..130 |

Orden sugerido para `/keymaker`: T925..T926 y T931..T932 y T927 ya; T928..T930 al resolverse N2-16.

## 4. Decisión de Nivel 2 para Neo: N2-16 (pendiente, no resuelta)
Hoy `fitReferencesWithinBudget` conserva el mayor prefijo de las ranuras (32 MiB; 13 MiB con `gemini-api`) y cualquier omisión marca el intento `degraded` (queda `outdated` con 1 cambio pendiente, `EDGE-ESC6-028`). Con fotos `KEEP` surgen dos preguntas:
- (a) Qué foto se descarta si no cabe: A) por orden de selección (una `ADD` o `REPLACE` posterior a varias `KEEP` podría perderse antes que una `KEEP`, justo la que debe dibujarse); B) **recomendada**: ranuras de `ADD`/`REPLACE` primero y `KEEP` después, de modo que las `KEEP` se descartan antes (la escena previa nunca se descarta). B obliga a corregir la prosa del `change_note` de `scene-payload.schema.json` (sin cambio de esquema): es contrato, requiere autorización de Neo.
- (b) Si omitir una `KEEP` marca `degraded`: C) **recomendada**: no (su apariencia ya está en la escena previa; con D la escena quedaría `outdated` en cada actualización y el usuario consumiría cuota repetida con el mismo descarte); D) sí, como cualquier referencia.
Pregunta exacta: «Neo, ¿para las fotos de mascotas `KEEP` que no quepan en el tope de bytes, descarto primero las `KEEP` (B) o por orden de selección (A), y la omisión de una `KEEP` marca el intento como degradado (D) o no (C)? Recomiendo B + C.»

## 5. Otras observaciones no bloqueantes
- Matriz: verificada por script contra `tasks.md`; todas las tareas nuevas figuran en cada fila que las cita. Quedan 3 diferencias heredadas ajenas a esta ronda: `REQ-ESC6-006` lista `T905` sin citarlo (T905 cita `REQ-ESC6-016`), `REQ-ESC6-031` y `REQ-ESC6-038` omiten `T883` y `T898` por citarlos con rango. No las toqué.
- Oracle T923 desviación (a) (frase de `PET_COUNT_RULE` con «When renderedPetsCount is zero» frente a la redacción del spec «With renderedPetsCount 0»): sigue pendiente de decisión de Neo; el spec de `REQ-ESC6-016` conserva la redacción original. No la toqué (fuera de alcance).
- Consultas a `/mifune`, `/lock`, `/merovingian` y `/mouse` no invocadas (sin contrato modificado); recomendable `/mouse` tras T924 y `/rama` en T934 por el reenvío de fotos `KEEP`.

## 6. Compuertas
`bash scripts/verify-traceability.sh --feature 006`: CUMPLE. 233/233 IDs propios mapeados en `tasks.md` (antes 221), 191/270 trazados (270 IDs vigentes), pureza 0 violaciones.
