# Propuesta de regla de UI H-K1 — «Eliminar» y «Transferir» con varios propietarios ACTIVE

- **Estado**: `APPROVED` — **Opción A** (ocultar «Eliminar»/«Transferir» en la ficha cuando hay > 1 propietario `ACTIVE` + mitigación de descubribilidad con enlace a «Propietarios», manteniendo el `409 ERR-OWN12-APPROVAL-PENDING` en servidor como defensa en profundidad). Firmado por Neo (Nivel 2), 2026-11-27.
- **Feature**: 012 · **Origen**: hallazgo H-K1 de `/kid` (`.specify/memory/audits/kid-012-T1619-2026-11-27.md`, T1619) · **Redacta**: `/architect` por encargo de `/morpheus` · **Fecha**: 2026-11-27
- **Sin efecto sobre**: `spec.md`, `tasks.md`, `src/`, `scripts/`, contratos OpenAPI/esquemas. Este archivo solo propone.

## 1. Problema

La UI ofrece «Eliminar» y «Transferir» a todo co-propietario `ACTIVE`, porque `permissions` sale de `petPermissionsFor('OWNER')` (`src/domain/access/rbac.ts:70-77`) y se consume en `PetDashboard.tsx:404-416` y `PetsPage.tsx:302-321`. El servidor rechaza ambas acciones directas con más de un propietario `ACTIVE` (`pet-use-cases.ts:178`, `ownership-use-cases.ts:30`, `ERR-OWN12-APPROVAL-PENDING`, 409). No hay fuga de permisos (la barrera está en servidor); el defecto es de experiencia: se ofrece una acción que siempre falla y con un texto que no corresponde (H-K2, tratado aparte).

## 2. Texto vigente de la especificación (solo referencia, sin cambio)

| Dónde | Qué dice | Relación con H-K1 |
|---|---|---|
| `spec.md` REQ-OWN12-004 (j) | «con un solo propietario `ACTIVE` no hay aprobaciones y las acciones se ejecutan como hoy» | Implica a contrario que con más de uno sí hay aprobación. **No dice nada de qué muestra la UI.** |
| `spec.md` US (escenario 4, línea 37) | La acción crítica «queda `PENDING` y se ejecuta solo cuando todos los demás co-propietarios `ACTIVE` la aprueban» | La vía prevista es la solicitud, no la acción directa. |
| `spec.md` REQ-OWN12-005 | El co-propietario `ACTIVE` cuenta como Propietario Legal en la matriz para lo cotidiano; las filas «Eliminar expediente» y «Transferir propiedad legal» pasan a REQ-OWN12-004 | Es la regla de permisos que H-K1 toca. **Se referencia, no se cambia.** |
| `contracts/co-ownership-rbac-annex.md` filas de «Eliminar expediente» / «Transferir» (líneas 33-34) y §4 | Con más de uno, aprobación de todos los demás | Misma regla en el anexo. |
| `INV-OWN12-004` | Aislamiento y anti-enumeración: `404` uniforme a terceros | Restringe qué puede revelar la UI (ver §5). |

Hallazgo de verificación: `spec.md` no contiene ninguna regla de permisos de **interfaz** (qué botones se muestran). Todas sus menciones de permisos son de servidor y no se contradicen con ninguna de las dos opciones. La matriz de `permissions` (9 banderas, `REQ-RBAC-001`) sigue siendo por rol; ninguna opción exige cambiarla.

## 3. Opción A — Ocultar

Cuando hay más de un propietario `ACTIVE` (principal más al menos un co-propietario `ACTIVE`), la ficha **no muestra** «Eliminar» ni «Transferir» a ningún propietario. El camino único para esas acciones es el panel «Propietarios» (`CoOwners.tsx`), que ya ofrece «Pedir eliminar la mascota» (a cualquier `ACTIVE`) y «Pasar el principal a…» (solo al principal). Con un solo propietario `ACTIVE` todo queda como hoy.

- Fuente de la condición: el número de propietarios `ACTIVE` que el panel ya conoce para un propietario `ACTIVE` (lista de co-propietarios de la propia mascota). Variante A2 (opcional, cambio de contrato): que el servidor devuelva una bandera derivada en el dashboard; se desaconseja salvo que Neo lo pida, porque toca OpenAPI y T1617 ya cerrada.
- Esfuerzo: bajo. Un predicado en `PetsPage`/`PetDashboard` que anula `deletePet` y `transferPetOwnership` en la proyección de UI; sin ruta nueva.

## 4. Opción B — Convertir en «Pedir…»

Con más de un propietario `ACTIVE`, los mismos botones cambian de texto y de efecto: «Pedir eliminar…» y «Pedir transferir…», que crean una solicitud sellada `DELETE_PET` / `TRANSFER_PRINCIPAL` por el flujo existente de `owner_requests`.

- Ventaja: la acción sigue visible y descubrible desde la ficha.
- Costes: duplica el punto de entrada (ficha y panel «Propietarios»), exige que el botón de la ficha abra un diálogo de solicitud distinto del `DeletePetDialog` actual (que borra de inmediato y tiene copia de «irreversible»), y la UI debe seguir distinguiendo la solicitud ya `PENDING` (409 `ERR-OWN12-APPROVAL-PENDING` legítimo). `TRANSFER_PRINCIPAL` además exige elegir destinatario co-propietario `ACTIVE` y hoy solo el principal ofrece «Pasar el principal a…»; un botón «Pedir transferir…» en la ficha de un co-propietario no principal no tiene correspondencia en el anexo y habría que decidir quién puede pedirla (pregunta abierta, ver §8).

## 5. Recomendación: Opción A

1. **Coherencia con REQ-OWN12-004**: con varios propietarios la acción deja de ser directa; la solicitud sellada ya tiene su superficie en el panel «Propietarios». Un único punto de entrada evita dos caminos que pueden divergir.
2. **Coherencia con INV-OWN12-004**: A no añade llamadas ni ramas de respuesta; la condición se calcula con datos que un propietario `ACTIVE` ya puede leer de su propia mascota. B añade un camino nuevo de creación de solicitudes desde la ficha, que ampliaría la superficie del tope `OWNER_REQUESTS_PER_USER_PER_DAY` (errata RES1) y de los 404 uniformes.
3. **Riesgo y coste**: A es de presentación pura y no toca contratos ni dominio; B toca diálogos, copia, estados vacíos y el caso de `TRANSFER_PRINCIPAL` para no principal.
4. **Mitigación de descubribilidad** (parte de A): en lugar de dejar un hueco, la ficha muestra una línea/enlace «Con más de un propietario, eliminar o transferir necesita la aprobación de todos. Ir a Propietarios», que lleva a la pestaña del panel (texto equivalente ya existe en `CoOwners.tsx:156`).

## 6. Impacto en `tasks.md` (solo descripción; no se edita ni se marca)

- `T1618` (prueba manual, HUM, `[ ]`): el recorrido «Bloque #22» de `quickstart.md` debe incluir «con dos propietarios la ficha no ofrece Eliminar/Transferir y sí el camino por Propietarios» (A) o «los botones piden solicitud» (B).
- `T1619` (`/kid`, `/seraph`, `/sati`, `[ ]`): H-K1 queda como condición de cierre de la parte `/kid`; `/sati` debe revisar el enlace de la mitigación en 320/1024/1280 (WCAG 2.2 AA).
- `T1620` (cierre del Bloque A): no se puede cerrar con H-K1 abierta sin decisión de Neo.
- Tarea nueva sugerida (a numerar por `/architect` tras `APPROVED`, p. ej. en el hueco `T1628..` del Bloque A): «Ajustar la proyección de `permissions` en la UI según la regla H-K1» con dependencia de `T1617`, y pruebas ligadas a `REQ-OWN12-004` / `INV-OWN12-004`.
- Etiqueta `[GH:#22]` se conserva en cualquier tarea nueva.

## 7. Pruebas afectadas

| Prueba | Efecto |
|---|---|
| `tests/unit/presentation/t1617-propietarios-012.spec.ts` (4 verdes) | No cubre rol ni gating del panel; hay que **añadir** casos: con 1 propietario se muestran Eliminar/Transferir; con 2 o 3 `ACTIVE` no se muestran (A) o muestran «Pedir…» (B). |
| `tests/unit/can-act-on-pet-012.spec.ts` (47) | Sin cambio (dominio de servidor intacto). |
| `tests/integration/api/co-ownership.api.spec.ts`, `tests/security/exploits/co-ownership-012.security.spec.ts` (17) | Sin cambio en A. En B, casos nuevos de creación de `DELETE_PET`/`TRANSFER_PRINCIPAL` desde la ficha y del tope por usuario. |
| Pruebas de página/E2E de ficha (`PetDashboard`/`PetsPage`) | Revisar las que asumen que `deletePet`/`transferPetOwnership` se ven siempre para `OWNER`. |
| Tras decisión | Mantener la prueba de servidor que el 409 `ERR-OWN12-APPROVAL-PENDING` sigue ocurriendo si alguien llama a la ruta directa (defensa en profundidad). |

## 8. Preguntas abiertas para Neo

1. ¿Opción A (recomendada) o B?
2. Si B: ¿quién puede pedir `TRANSFER_PRINCIPAL` desde la ficha: solo el principal (como hoy en el panel) o cualquier `ACTIVE`?
3. ¿Aceptas la mitigación de descubribilidad (enlace a «Propietarios»)?
4. H-K2 (texto engañoso de `ERR-OWN12-APPROVAL-PENDING`) se resuelve por separado; no depende de esta decisión.

## 9. Trazabilidad

`REQ-OWN12-004`, `REQ-OWN12-005`, `INV-OWN12-004`, `REQ-RBAC-001`, `NFR-012-001`, errata RES1, hallazgo `H-K1` (T1619). Decisión de Nivel 2: cambio de estado a `APPROVED` solo por Neo.
