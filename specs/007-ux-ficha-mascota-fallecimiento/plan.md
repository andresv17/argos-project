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
| **ADR-007-06** (`#13`) | Estado `lifeStatus` + `deceasedAt` en la entidad `Pet` (no una tabla aparte); invariante en `src/domain/pet/pet-invariants.ts` (directorio existente; sin máquina de estados separada ni código de error `ERR-PET-LIFE-STATUS`: se usa `ERR-SCHEMA-VALIDATION-FAILED`); alertas, edad y escena derivan de ella (ver `REQ-FAL7-004..007`). Migración aditiva con `DEFAULT 'ALIVE'`. Concurrencia: `updatePetProfile` toma `lockPet` primero (`EDGE-007-010`) y el `PUT` usa control optimista con `412` (`EDGE-007-009`, decidido). | Tabla `pet_memorials` (join extra, sin beneficio); campo booleano `isDeceased` (permite incoherencia fecha/estado); borrado lógico (pierde la ficha). | Mínima superficie, retrocompatible, sin reescritura de datos. |

## Ajustes por ítem

### `[GH:#11]` Fechas
- Nuevos: `src/presentation/web/date-segments.ts` (puro, **dos** funciones: entrada tecleada —avance y retroceso— y análisis de texto ISO/`DD/MM/AAAA` ↔ segmentos; `M7-11`) y `components/DateField.tsx`. `Field.tsx` delega `type="date"` en `DateField`. Tests unitarios de la función pura (todas las reglas de `REQ-FEC7-002/003`) y E2E Playwright en 3 navegadores + móvil.

### `[GH:#12]` Pestaña
- `PetDashboard.tsx`: tipo `ActiveTab = RecordModule | 'history'`; pestaña final condicionada a `editSlot === undefined && mediaSlot !== undefined`; el panel `history` renderiza `mediaSlot`; se retira la `<section id="history-files-title">` final. `App.tsx`/páginas que pasan `activeTab` ajustan el tipo.

### `[GH:#13]` Fallecido
- Dominio: `src/domain/pet/pet-invariants.ts` (invariante sobre el estado resultante) y cálculo de edad en `estimated-age.ts`. Aplicación: `pet-use-cases.ts` (crear/editar, `alertsSummary`, filtro, edad), registros (`REQ-FAL7-005`), `scene` (huella `REQ-FAL7-006`). Infraestructura: migración `pets` en SQLite y Postgres, repositorios, mapeadores. API: campos en los DTO existentes, sin rutas nuevas. UI: `PetForm` (selector + `DateField`), insignia en `PetCards`/`PetDashboard`. Contratos: ver `contracts/README.md`; compilación con `bash scripts/compile-contracts.sh`. Respaldo: `backup-envelope`.
- **Decisiones de dominio** (D7-04, D7-05, D7-06, EDGE-007-012..016) decididas por Neo: se escriben pruebas solo para la opción decidida (`M7-17`). Huella: `DECEASED` se filtra antes de `buildInputsSnapshot`, sin campos nuevos en `SnapshotPet`. Migración SQLite `0014` y Postgres `0010` con mapeo en `schema-parity.spec.ts`; `CHECK` cruzado con `NOT VALID` + `VALIDATE` en Postgres y reconstrucción de `pets` en SQLite (asimetría documentada en `data-model.md`).

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
4. `/sati` valida `DateField` y la pestaña (320/1024/1280 px). `/oracle` cierra con la compuerta completa.

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
