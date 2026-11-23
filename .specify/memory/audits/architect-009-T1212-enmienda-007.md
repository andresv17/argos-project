# T1212 — Enmienda 009 de 007 (orden del prompt): inventario de pruebas y criterios afectados

Fecha: 2026-11-23. Autor: `/architect`. Autoridad: `D9-26` = A, `P5-03` = A (Neo, Nivel 2). Normativa: `REQ-PRO9-001..007`, `ADR-009-03`. Lo ejecuta `T1215` (código y pruebas; no `T1212`).
Regla: cada oráculo se **actualiza**, nunca se borra ni se relaja (se mantienen y se añaden las aserciones de preservación). Sin cambio de `ScenePayload` ni de OpenAPI.

Abreviaturas: PB = `PRESERVATION_BLOCK` (literal de `REQ-PRO9-002`), JSON = `Scene specification (JSON):`, Place = `Place all N pets…`, DNA = `Draw no animals in this room.`

Orden nuevo desde cero: STYLE, hogar, `Pet k`, PB (solo si hay mascota con foto), JSON (solo sin foto), Place (N>=2), conteo (N>=1) o DNA (N=0), REDRAW.
Incrementales: `PET_COUNT_RULE` se conserva; PB inmediatamente antes de REDRAW si hay `ADD`/`REPLACE` con foto.

## A. Criterios de 007 (`spec.md`, enmendados en este cambio)
| Criterio | Cambio | Motivo |
|---|---|---|
| `SC-007-043` | Marcado «Enmienda 009»: ejemplo 1 gana PB tras `Pet k`; ejemplo 3 pasa a STYLE, hogar, `Pet 1`, PB, JSON, Place, conteo, REDRAW; ejemplo 2 solo mueve JSON antes de Place; N=0 usa DNA | Orden JSON-antes-de-Place (`REQ-PRO9-001`), PB (`REQ-PRO9-002/003`), N=0 (`REQ-PRO9-005`) |
| `SC-007-039` | N=0: DNA en lugar de `PET_COUNT_RULE` | `REQ-PRO9-005`, `D9-13` = A |
| `SC-007-035` | **No cambia.** Es «Fallecido → Vivo» (auditoría, `EDGE-007-016`), sin relación con el prompt; su prueba es `pet-life-status-use-cases-007.spec.ts`. La tarea `T1212` la cita por error de numeración: los criterios de prompt afectados son `SC-007-039` y `SC-007-043`; `SC-007-036..038`, `040`, `041` conservan texto y su oráculo se refuerza (ver B) | Se pide a Neo/`/morpheus` confirmar la corrección de la cita en `T1212`/`T1215` |
| `REQ-ESC7-003`, `R4`, `R1`, `REQ-ESC7-006` | Notas «Enmienda 009» con texto previo conservado | Orden y N=0 |

## B. Pruebas (las edita `T1215`)
### B1. `tests/unit/t1071-prompt-combinado-16bit-007.spec.ts`
- L108-118 (ejemplo 1, `blocks[3..5]`): PB entra como `blocks[3]`; Place pasa a `[4]`, conteo a `[5]`, REDRAW a `[6]`. Motivo: PB (hay mascotas con foto).
- L337 (ejemplo 1 byte a byte): array esperado = STYLE, hogar, líneas, PB, Place, conteo, REDRAW. Motivo: PB.
- L343 (ejemplo 2, sin foto): array = STYLE, genérico, JSON, Place, conteo (JSON antes de Place); sin PB. Motivo: `REQ-PRO9-001`.
- L349 (ejemplo 3 mixto con hogar): array = STYLE, hogar, `Pet 1`, PB, JSON, Place, conteo, REDRAW. Motivo: orden y PB.
- L153-160 (SC-007-038 ejemplo 3) y L160 `at(-1)` = REDRAW: se mantiene; se añade aserto de posición JSON < Place y PB una vez.
- L91-106, L143-148 (con foto): se añade `countOf(PB) === 1`. L124-133, L136-140 (sin foto de mascota, también hogar con foto): `countOf(PB) === 0`. Motivo: `INV-PRO9-001`.
- L192-203 (SC-007-039, N=0 con y sin hogar): el aserto L201 `toContain(PET_COUNT_RULE)` pasa a `toContain(DNA)` y se añade `includes(PET_COUNT_RULE) === false` y `includes('renderedPetsCount') === false`. Motivo: `REQ-PRO9-005`.
- L280-299 (R1): el título y L295-299 (N=0 `countOf(PET_COUNT_RULE) === 1`) pasan a `=== 0` con `countOf(DNA) === 1`; L289 (N>=1 nunca `PET_COUNT_RULE`) se mantiene. Motivo: `REQ-PRO9-005`.
- L234-241: se mantiene (JSON antes del conteo y sin `PET_COUNT_RULE`); se añade `indexOf(JSON) < indexOf('Place all')`.
- L358-371 (incrementales): se mantiene el cierre 16-bit; si el `ADD` lleva foto, se añade PB antes de REDRAW (una vez); sin foto, 0.
- L69-80, L245-277 (sin `#hex`/`32-bit`, determinismo, no fuga): se mantienen y se ejecutan también con PB (el literal contiene «16-bit», sin hex ni ids).

### B2. `tests/unit/t1071-hogar-sin-consentimiento-escena-007.spec.ts`
- Caso único (`N = 1`, mascota con foto `IMG_1`, hogar genérico): ningún aserto actual falla; se **añade** `countOf(PB) === 1` y que PB va después de la línea `Pet 1` y antes de `PIXEL_REDRAW_RULE`; se mantienen `['IMG_1']`, ausencia de `IMG_2` e `inspired by`. Motivo: `INV-PRO9-001` (hay mascota con foto, `SC-009-029`).

### B3. `tests/unit/t841-prompt-payload-escena-006.spec.ts`
- L161-167 (N=0 sin foto, byte a byte `STYLE\n\nGENERIC\n\nPET_COUNT_RULE`): el último bloque pasa a DNA. Motivo: `REQ-PRO9-005`.
- L169-181 (fixture hogar + 2 mascotas con foto): array = STYLE, hogar, líneas, PB, Place, conteo, REDRAW. Motivo: PB.
- L376-388 (orden de bloques mixto): `positions` pasa a STYLE, hogar, `Pet 1`, PB, JSON header, `Place all 2 pets`, conteo, REDRAW (JSON antes de Place). Motivo: `REQ-PRO9-001/003`.
- L364-375 (SC-ESC6-118): `zero.split(PET_COUNT_RULE)` pasa de length 2 a 1 y `includes(DNA)`; N>=1 sin `PET_COUNT_RULE` y el incremental (length 2, tras JSON) se mantienen. Motivo: `REQ-PRO9-005`.
- L389-402 (incremental MIXED con `REPLACE` con foto): `order` gana PB entre `PET_COUNT_RULE` y `PIXEL_REDRAW_RULE`. Motivo: `REQ-PRO9-004`.
- L144-160 (SC-ESC6-106): `incremental.endsWith(REDRAW\n\nCLOSING)` pasa a `…PB\n\nREDRAW\n\nCLOSING` para el caso `addPhoto`; el caso `withPetPhoto` gana PB; hogar con N=1 sin foto de mascota no lleva PB. Motivo: `REQ-PRO9-002/004`.
- L106-111 (SC-ESC6-002, N=1 con foto): se añade `countOf(PB) === 1`. L538-550 (solo `KEEP` con foto): se mantiene `PIXEL_REDRAW_RULE` 0 y se añade PB 0 (`EDGE-009-026`).
- L128-138 y L97-104: se mantienen; L97-104 gana PB 0 (sin foto).

### B4. `tests/unit/t939-prompt-inspiracion-conteo-escena-006.spec.ts`
- L210-221 (SC-ESC6-137 desde cero): `includes(JSON + '\n\n' + countLine)` ya no vale (entre ambos va Place si N>=2): pasa a `JSON\n\nPlace all 2 pets…\n\ncountLine`; `endsWith(count\n\nREDRAW)` se mantiene. Motivo: `REQ-PRO9-001/003`.
- L251-266 (SC-ESC6-138 canónica con fotos): array = STYLE, hogar, líneas, PB, Place, conteo, REDRAW. Motivo: PB.
- L282-286 (SC-ESC6-138, sin mascotas y sin foto): `[STYLE, GENERIC_ROOM, PET_COUNT_RULE]` pasa a `[STYLE, GENERIC_ROOM, DNA]`. Motivo: `REQ-PRO9-005`.
- L222-231 (SC-ESC6-137 incremental con `REPLACE` con foto): `endsWith` pasa a `…PET_COUNT_RULE\n\nPB\n\nREDRAW\n\nCLOSING`. Motivo: `REQ-PRO9-004`.
- L267-281 (incremental `ADD` sin foto): se mantiene byte a byte (sin PB). L181-187 (N=0 sin línea de conteo): se mantiene. L76-83: se mantiene; se añade PB una vez con la mascota con foto.

## C. Hallazgo adicional (fuera de la lista de la tarea)
- `tests/security/t874-escena.security.spec.ts` L270-277: calcula el fin del JSON con `'\n\nExact animal count: '` o `PET_COUNT_RULE`; con el orden nuevo el JSON termina antes de `\n\nPlace all` (N>=2) y `JSON.parse(slice)` fallaría. `T1215` debe ampliar el cálculo del fin (siguiente `\n\n` tras el JSON, de una sola línea) sin relajar el aserto de caracteres hostiles. Se recomienda añadirla al alcance de `T1215`.
- `tests/unit/t938-regenerar-caracterizacion-escena-006.spec.ts` L107 (`includes('Exact animal count: ')`) y `t849`/`t848b` (cadenas `Place all 2 pets` ajenas al prompt real): sin cambio.
- Comentario de cabecera de `build-image-prompt.ts` y `@implements`: los actualiza `T1215` (lista de 7 bloques → 8 puntos de `REQ-PRO9-003`).
