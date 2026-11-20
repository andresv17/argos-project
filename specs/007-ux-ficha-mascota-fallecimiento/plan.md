# Implementation Plan: UX de la ficha de mascota, fechas, Historial/Archivos, mascota fallecida y texto de escena (Feature 007)

**Branch**: `007-ux-ficha-mascota-fallecimiento` | **Date**: 2026-11-19 | **Spec**: `specs/007-ux-ficha-mascota-fallecimiento/spec.md`
**Estado**: `APPROVED` (firmado por Neo, Nivel 2, el 2026-11-19). **Input**: `spec.md`, `claude/inbox-feature-007.md`. **Decisiones de Neo (Nivel 2, 2026-11-19)** asentadas en `spec.md` (`claude/decisiones-neo-007-2026-11-19.md`); pase de revisión único con actas `/mifune`, `/lock`, `/rama`, `/merovingian` y `/mouse` PASS.

## Summary
Cinco cambios de presentación en `src/presentation/web/` (`#11`, `#12`, `#14`, `#15`, `#51`) y un cambio de dominio con modelo, API y respaldo (`#13`). Ningún endpoint nuevo. Ninguna dependencia nueva. El orden mínimo de riesgo: primero los cambios de UI independientes en paralelo, `#13` en su propio carril con compuertas previas (`/merovingian`, `/rama`, `/maggie`) y firma de Neo.

## Technical Context
**Language/Version**: TypeScript 5 estricto, Node 22.23.4, React (Vite) existente. **Testing**: Vitest + Playwright (`es-CO`). **Storage**: SQLite y Postgres con paridad (`#13`). **Constraints**: `package.json` intacto; WCAG 2.1 AA; capas `domain`/`application` sin `fs`/`fetch`/`process.env`. Contratos de 001..006 `LOCKED` sin firma; la enmienda de `#13` se redacta sobre la **línea 002** (no sobre el 001) y se coordina con 004 (pet v3.1.0 `DRAFT`) y 005 (`ClinicalSummary`).

## Constitution Check
- IV (TDD): pruebas rojas primero por cada bloque. Capas: la UI no importa infraestructura; el dominio de `#13` vive en `src/domain/`. Sin dependencias nuevas (no requiere autorización de Nivel 2). `#13` requiere Nivel 2 (enmienda a contratos y migración): `N2-07-01`.

## Decisiones de arquitectura (ADR breves)

| ID | Decisión | Alternativas descartadas | Por qué |
| --- | --- | --- | --- |
| **ADR-007-01** (`#11`) | `DateField` propio de tres segmentos numéricos (`Día`, `Mes`, `Año`) que emite ISO; reemplaza `type="date"` en `RecordForm` y `PetForm`. | `<input type="date">` nativo (no auto-avanza de forma uniforme entre navegadores y no cumple el Issue); librería de máscaras (dependencia nueva, Nivel 2). | Control determinista del foco y cero cambio de contrato. El lógico de avance es una función pura (`date-segments.ts`) testeable sin DOM. |
| **ADR-007-02** (`#12`) | Una séptima pestaña `history` añadida en el render del `tablist`; el tipo de pestaña activa pasa a `RecordModule \| 'history'`. | Añadir `history` a `RECORD_MODULES` (obligaría a esquema, formulario y permisos ficticios). | `RECORD_MODULES` describe módulos con formulario; el historial no lo tiene. |
| **ADR-007-03** (`#14`) | Un único predicado `showsFormOpenByDefault(module, records, canWrite)` (función pura) que implementa **solo la Opción B** decidida por Neo, para Peso, Medidas, Vacunas y Desparasitaciones; sin constante de opción (`M7-09`). | Dos implementaciones, constante de opción; lógica dispersa en el JSX. | Una sola rama probada; testable sin DOM. |
| **ADR-007-04** (`#15`) | Eliminar `canRegisterWeight`/`onRegisterWeight` de `AlertsCard`; retitular. | Mantener el botón oculto por CSS. | Cero UI muerta (NFR-007-003). |
| **ADR-007-05** (`#51`) | `scenePendingText` se sustituye por `scenePendingMessage(view)` (función pura) que devuelve el texto decidido por Neo (neutral) o `null` con `pending = 0`; el conteo numérico va en el `aria-label`. | Texto fijo en el JSX de `SceneBlock`. | Pruebas puras y un solo lugar de cambio. |
| **ADR-007-06** (`#13`) | Estado `lifeStatus` + `deceasedAt` en la entidad `Pet` (no una tabla aparte); invariante en `src/domain/pet/pet-invariants.ts` (directorio existente; sin máquina de estados separada ni código de error `ERR-PET-LIFE-STATUS`: se usa `ERR-SCHEMA-VALIDATION-FAILED`); alertas, edad y escena derivan de ella (ver `REQ-FAL7-004..007`). Migración aditiva con `DEFAULT 'ALIVE'`. Concurrencia: `updatePetProfile` toma `lockPet` primero (`EDGE-007-010`) y el `PATCH` usa control optimista con `412` (`EDGE-007-009`, decidido). | Tabla `pet_memorials` (join extra, sin beneficio); campo booleano `isDeceased` (permite incoherencia fecha/estado); borrado lógico (pierde la ficha). | Mínima superficie, retrocompatible, sin reescritura de datos. |
| **ADR-007-07** (escena, prompt 16-bit) | Un único `buildImagePrompt(payload)` (`src/domain/scene/build-image-prompt.ts`) que, en `FROM_SCRATCH`/`REGENERATE`, compone en orden: estilo 16-bit RPG/cozy (paleta en lenguaje natural, sin `#hex`), hogar, **bloque de fotos** (una línea `Pet k (especie): Use IMG_n …` por mascota con `photoRef`), **bloque JSON** de `sceneSpecBlock` filtrado a las mascotas **sin** `photoRef`, la frase de conteo (N = 1: `Exact animal count: 1 pet in total (G). Draw only this 1 pet and no additional animals.`; N ≥ 2: `Exact animal count: N pets in total (G). Draw only these N pets and no additional animals.`; N = 0: sin frase) y `PET_COUNT_RULE`. `animalCountLine` pasa a producir la frase completa (tras el cierre de 006 `T939`); el filtro por `photoRef` es una función pura en `scene-spec.ts` sobre el payload ya numerado. La numeración `IMG_1` (hogar) / `IMG_2..` (mascotas) la fija el compositor de `ScenePayload` (`decide-mode`), no `buildImagePrompt`. | (a) Dos prompts por mascota según tenga foto (duplica el costo y rompe el conteo único). (b) Que `buildImagePrompt` renumere `IMG_n` (acopla el texto a las ranuras de imágenes). (c) JSON con todas las mascotas y fotos aparte (riesgo de dibujar dos veces al mismo animal, `EDGE-007-023`). | Una sola fuente de verdad del conteo; cada mascota en un único bloque; sin contrato nuevo (`scene-payload.schema.json` intacto); TDD con 4 casos (todas con foto, ninguna, mixto, cero). `PET_COUNT_RULE` se conserva; si resulta redundante `/keymaker` lo eleva como Caso B, no lo borra. |
| **ADR-007-08** (escena, semilla por intento) | `deriveSceneSeed(attemptId: string): number` pura en `src/domain/scene/scene-seed.ts`: FNV-1a de 32 bits sobre los code points de `attempt.id` y máscara `0x7fffffff` (rango int32 no negativo que aceptan Gemini API y Vertex AI en `generationConfig.seed`). La aplicación (`scene-run-use-case.ts`) la invoca con el `attempt.id` que ya emite `IdGeneratorPort` y la pasa como `seed` en la solicitud del puerto `SceneImageGenerator`; el adaptador real la escribe en `generationConfig.seed` (`gemini-api-wire.ts` y el adaptador Vertex) y el `Fake` la usa o la ignora. No entra en `inputs_snapshot` ni en la huella, no se persiste ni se registra. | (a) `Math.random()`/`crypto.randomInt` en el adaptador (no determinista, viola la pureza si se hace en dominio y vuelve irreproducibles los reintentos). (b) Semilla fija global (todas las generaciones saldrían iguales). (c) Derivarla de la huella (dos intentos con las mismas entradas darían la misma imagen: pierde la variedad en «Regenerar»). (d) `node:crypto` en el dominio (rompe INV-ARCH-001/002). | Determinista y reproducible por intento, variada entre intentos, pura (cumple INV-ARCH-001/002 y la pureza de `src/domain/scene/`), sin PII y sin dependencias nuevas. |

**ADR-007-07, decisión H-M7-2 (2026-11-19, Logos 62; `scene-payload.schema.json` intacto)**: `DEFAULT_SCENE_STYLE.artStyle` (`src/domain/scene/scene-payload.ts`) pasa a un estilo 16-bit con la paleta descrita en lenguaje natural, sin la cadena «32-bit» ni valores `#hex`. Consecuencia (corregida por R9 de `/merovingian`, T1070): la huella de escena (`inputs_snapshot`, `src/domain/scene/inputs-snapshot.ts`) no incluye prompt, estilo ni paleta, por lo que **no cambia** (coherente con `spec.md` «sin cambio de huella», `REQ-ESC6-004`); las escenas ya generadas no se invalidan. El texto literal de estilo lo fija `T1069` con los tres ejemplos de Neo (`claude/decisiones-neo-007-2026-11-21.md`); no se inventa aquí. El campo sigue siendo `string` bajo los topes vigentes del esquema, de ahí que no haya enmienda de contrato.


## Ajustes por ítem

### `[GH:#11]` Fechas
- Nuevos: `src/presentation/web/date-segments.ts` (puro, **dos** funciones: entrada tecleada —avance y retroceso— y análisis de texto ISO/`DD/MM/AAAA` ↔ segmentos; `M7-11`) y `components/DateField.tsx`. `Field.tsx` delega `type="date"` en `DateField`. Tests unitarios de la función pura (todas las reglas de `REQ-FEC7-002/003`) y E2E Playwright en 3 navegadores + móvil.

### `[GH:#12]` Pestaña
- `PetDashboard.tsx`: tipo `ActiveTab = RecordModule | 'history'`; pestaña final condicionada a `editSlot === undefined && mediaSlot !== undefined`; el panel `history` renderiza `mediaSlot`; se retira la `<section id="history-files-title">` final. `App.tsx`/páginas que pasan `activeTab` ajustan el tipo.

### `[GH:#13]` Fallecido
- Dominio: `src/domain/pet/pet-invariants.ts` (invariante sobre el estado resultante) y cálculo de edad en `estimated-age.ts`. Aplicación: `pet-use-cases.ts` (crear/editar, `alertsSummary`, filtro, edad), registros (`REQ-FAL7-005`), `scene` (huella `REQ-FAL7-006`). Infraestructura: migración `pets` en SQLite y Postgres, repositorios, mapeadores. API: campos en los DTO existentes, sin rutas nuevas. UI: `PetForm` (selector + `DateField`), insignia en `PetCards`/`PetDashboard`. Contratos: ver `contracts/README.md`; compilación con `bash scripts/compile-contracts.sh`. Respaldo: `backup-envelope`.
- **Decisiones de dominio** (D7-04, D7-05, D7-06, EDGE-007-012..016) decididas por Neo: se escriben pruebas solo para la opción decidida (`M7-17`). Huella: `DECEASED` se filtra antes de `buildInputsSnapshot`, sin campos nuevos en `SnapshotPet`. Migración SQLite `0014` y Postgres `0010` con mapeo en `schema-parity.spec.ts`; `CHECK` cruzado con `NOT VALID` + `VALIDATE` en Postgres y reconstrucción de `pets` en SQLite (asimetría documentada en `data-model.md`).

### Escena — prompt combinado 16-bit (sin `[GH:#N]`; `REQ-ESC7-003..008`)
- Dominio (`src/domain/scene/`): `build-image-prompt.ts`, `pet-phrases.ts` (`animalCountLine` con la frase de Neo), `scene-spec.ts` (filtro del JSON a mascotas sin foto) y nuevo `scene-seed.ts`. Aplicación: `scene-run-use-case.ts` (deriva y pasa `seed`) y `scene-image-generator.port.ts` (campo `seed`). Infraestructura: `gemini-api-wire.ts` y el adaptador Vertex (`generationConfig.seed`), `fake-scene-image-generator.adapter.ts`.
- Pruebas (TDD, rojas primero): casos «todas con foto», «ninguna con foto», «mixto» y «cero mascotas» (con y sin foto del hogar), numeración `IMG_n`, sin duplicados por ordinal, frase de conteo, ausencia de `#hex`/«32-bit», determinismo (100 ejecuciones) y no fuga; semilla pura, en rango, estable por `attempt.id`, en `generationConfig`. Se actualizan las pruebas de referencia `t841-prompt-payload-escena-006.spec.ts` y `t939-prompt-inspiracion-conteo-escena-006.spec.ts` (base 32-bit, paleta hex, línea `N total`, JSON con todas las mascotas); `/merovingian` (`T1070`) lista cualquier otra que fije esos textos.
- Pendiente de Neo (`T1069`): los 3 ejemplos literales (solo la frase de conteo llegó literal) (`D7-ESC-01` ya decidida por Neo: N = 0 sin frase; N = 1 en singular). Hasta entonces el texto de estilo 16-bit no se implementa.

### `[GH:#14]` Registrar vs Guardar
- `PetDashboard.tsx` y `RecordForm`: predicado puro de ADR-007-03 (Opción B, cuatro módulos); `frozenOpen` se conserva. Consultas y Parámetros sin cambio.

### `[GH:#15]` Panel derecho
- `AlertsCard`: quitar botón y props; retitular. Actualizar pruebas que busquen «Alertas sanitarias» y `aria-labelledby`.

### `[GH:#51]` Texto de escena
- `scene-view.ts` + `SceneBlock.tsx`; pruebas de `t851`/`t855`-estilo de vista y E2E del bloque Hogar.

## Orden y dependencias
1. Gobernanza: `/lock`, `/mifune`, `/mouse`; en paralelo `/merovingian` y `/rama` solo para `#13`.
2. Neo aprobó las decisiones de Nivel 2 (2026-11-19); la firma de cierre (`APPROVED`/`LOCKED`) sigue siendo suya.
3. Implementación (tras `/mouse` T1005 y la rama `007-...` creada por Neo desde `006`): `#11`, `#12`, `#14`, `#15`, `#51` en paralelo; `#13` tras `T1013` (enmienda de contratos en la línea 002).
4. Escena 16-bit: `T1069` (Neo) → `T1070` (`/merovingian`) → pruebas y código (`T1071..T1076`) → `T1077` (`/oracle`); independiente de los Bloques A..F y de `#13`, salvo el filtro `DECEASED` de `REQ-FAL7-006` (previo a `buildInputsSnapshot`). `/sati` valida `DateField` y la pestaña (320/1024/1280 px). `/oracle` cierra con la compuerta completa.

## Riesgos
- `#13` cruza 6 capas: concentrar la integración en un solo bloque con migración y paridad primero.
- `#11` con Safari móvil y Android: se implementa `keydown`; solo si el E2E (WebKit o emulación Android) lo demuestra insuficiente, se ejecuta `T1036` (`beforeinput`).
- Cambiar el título de la tarjeta rompe pruebas E2E existentes: se listan en T1043.

## Estructura de la feature
```text
specs/007-ux-ficha-mascota-fallecimiento/
├── spec.md · plan.md · tasks.md · data-model.md
└── contracts/README.md   # solo la enmienda propuesta de #13
```
No hay `research.md` ni `quickstart.md`: no hay incógnitas técnicas sin resolver. No hay carpetas de contrato nuevas hasta la firma de `N2-07-01`.
