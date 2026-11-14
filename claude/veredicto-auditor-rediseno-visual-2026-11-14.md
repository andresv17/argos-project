# Veredicto Oracle — Rediseño visual según ui_blueprint.md v1.1 (2026-11-14)

**Veredicto global: APTO CONDICIONADO.** Validado en disco y en vivo. HEAD `7b6e576` en `002-plataforma-v21`; cambios sin commit. No se hizo commit ni se alteró Git.

| # | Punto | Veredicto | Evidencia |
|---|---|---|---|
| a | Alcance y dependencias | APTO | 10 archivos de `src/presentation/web/**`, `tailwind.config.ts` y el propio `styles.css`. Ningún cambio en `src/infrastructure`, `src/application`, `src/domain`, `src/generated`, `contracts/`, `specs/`, `tests/` ni `package.json`. Sin fuentes web ni librerías de iconos (grep vacío). |
| b | Prohibiciones (exports, data-*, ARIA, ids, names, textos) | APTO | Comparación de atributos semánticos (con `className` eliminado) entre HEAD y el árbol: el único cambio es la adición de `name="roleOnJoin"`, `value` y el id del select de [FIX B-1]. Ningún atributo existente se eliminó. Exports de todos los archivos idénticos a HEAD. |
| c | [FIX B-1] | APTO | `HouseholdsPage.tsx:123` `initial: { username: '', roleOnJoin: 'READER' }`; `:134` `id="invite-${householdId}-roleOnJoin"`; `:136` `name="roleOnJoin"`; opciones ADMIN/CAREGIVER/READER con etiquetas Administrador/Cuidador/Lector. Verificado en navegador por Keymaker: valor inicial READER y envío sin 422. |
| d | Presupuesto de blur | APTO | `backdrop-filter` solo en dos elementos, ambos marcos principales (`AppShell.tsx:98`, `AuthPages.tsx:16`), bajo `sm:supports-[backdrop-filter]:`. Ninguno en tarjetas, filas, cabecera, badges ni diálogos. Móvil (<640 px): sin blur. |
| e | Gates | APTO | `typecheck` exit 0; `build` exit 0; Vitest 26 fallos / 1645 aciertos, **mismos archivos con el mismo recuento** que antes (`diff` por archivo idéntico). Sin regresiones. |
| f | E2E Playwright | APTO CONDICIONADO | 23 pasan, 2 fallan (idéntico en dos ejecuciones). Ver abajo. |
| g | Accesibilidad en el DOM real | APTO | Reproducido: axe-core (`wcag2a`, `wcag2aa`, `wcag21a`, `wcag21aa`) sobre la app viva, 5 rutas × 320/1024/1280 px: **0 violaciones**, 0 desbordamiento horizontal, 0 errores de página. Comprobado que las páginas son contenido real (h1 y navegación presentes). |
| h | Contraste de los pares usados en el código | APTO | 31 pares calculados con WCAG 2.1 sobre clases y tokens que aparecen en el código (no sobre el documento): 0 fallos. Mínimo texto 4.76:1 (placeholder), mínimo no-texto 4.76:1. Los 8 `OWNER_COLORS` cumplen (5.02 a 7.90:1). |

## Punto f: causas de los 2 fallos E2E (ajenas al diseño)

1. `tests/e2e/accessibility/wcag.spec.ts`: su `beforeAll` siembra una mascota con `species: 'DOG'` mediante `createPetViaApi`. La API (contrato 002) responde **422** `species must be equal to one of the allowed values`, en la misma ejecución, sin pasar por la UI. Al fallar el `beforeAll`, **las 7 pruebas axe de ese archivo no se ejecutan**. Esto significa que la suite E2E del repositorio no está validando el DOM rediseñado; la evidencia de accesibilidad es el punto g (reproducido fuera del repo).
2. `tests/e2e/visual/pet-dashboard.spec.ts`: registra `duena.e2e`, que ya crea `tests/e2e/visual/household-counter.spec.ts:41` en la **misma base SQLite compartida**. La API responde "Ya existe una cuenta con ese nombre de usuario" (confirmado en `test-results/…/error-context.md`).

**Matiz de honestidad:** en esta sesión no se ejecutó la suite E2E sobre el estado previo al rediseño. Que son preexistentes se afirma por causa raíz: ambas son respuestas del servidor y del contrato que no dependen de clases ni de la UI, y los archivos de test no fueron modificados. No hay evidencia de un fallo E2E nuevo.

## Condiciones para pasar a APTO (ninguna bloquea el rediseño)
- Autorizar a Keymaker a corregir **en la suite de test** (no en la app): cambiar el seed `'DOG'` por `'CANINE'` en `wcag.spec.ts:29` y el usuario duplicado en `pet-dashboard.spec.ts` (p. ej. usuario distinto). Así las 7 pruebas axe del repositorio correrán y validarán el diseño de forma continua.

## Lo no verificado
- Ejecutar la suite E2E sobre el estado previo al rediseño (para la comparación formal de regresiones de E2E).
- Revisión visual de todas las rutas a ojo: solo se revisaron las capturas de la ficha en 320 y 1280 px. Las demás rutas están cubiertas por axe, pero no por revisión visual.
- Pruebas de `backdrop-filter` en navegadores sin soporte (solo se verificó el código del respaldo).

RECOMMENDED NEXT STEP: Neo decide si autoriza la corrección de la suite (seed `DOG` y usuario duplicado). Con su visto bueno, Morpheus despacha a Keymaker la corrección de tests y después a Oracle para confirmar que las 7 pruebas axe del repositorio pasan. Si no hay cambios, el diseño puede pasar a revisión visual de Neo.
