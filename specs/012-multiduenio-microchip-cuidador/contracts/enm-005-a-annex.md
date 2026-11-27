# Anexo T1624 — `ENM-005-A`: autoridad de enlaces para el veterinario por co-propiedad (Bloque A, #22)

Estado: `APPROVED` (firmado por Neo — Nivel 2, 2026-11-26; redactó `/architect` el 2026-11-26). Documento **nuevo** de la 012: **no edita** `specs/005-album-archivos-clinicos/` (`LOCKED`/`APPROVED`) ni el contrato OpenAPI de 005. `ENM-005-A` es la parte del Bloque A (`Neo-H`); el alcance `PETS` y `REQ-VET-012` son `ENM-005-E` (`T1690`, Bloque E). Trazabilidad: `REQ-OWN12-008` (a), `REQ-VET12-006`, `REQ-VET12-007`, `INV-OWN12-005`, `INV-VET12-003`, `EDGE-012-021`, `SC-012-011`, `SC-012-059`, `SC-012-108`.

## 1. Qué cambia respecto de 005

| Texto de 005 | Enmienda `ENM-005-A` |
| --- | --- |
| **`REQ-VET-002`** — `HOUSEHOLD` expone las mascotas asignadas al hogar **y cuyo propietario legal es el creador** (`D5-19`) | «Cuyo propietario legal es el creador» pasa a **«sobre las que el creador es propietario principal o co-propietario `ACTIVE` en el momento del acceso»**. Un `ADMIN` que no es propietario de una mascota sigue sin compartirla (`D5-19` se mantiene). Un `ADMIN` sin mascotas con esa condición recibe `ERR-ACC-FORBIDDEN` al crear (conjunto vacío) |
| **`REQ-VET-011`** — autoridad vigente del creador revalidada en cada acceso; `PET`: rol efectivo `OWNER` o `ADMIN`; `PN-08`: el enlace `PET` no sobrevive a la transferencia (compara `pets.owner_user_id` con `pet_owner_user_id_at_creation`) | La autoridad del creador de un enlace `PET` se evalúa **en cada acceso** como **propietario principal o co-propietario `ACTIVE` de esa mascota** (o rol de hogar que la 005 ya admita). El enlace **deja de depender de `pet_owner_user_id_at_creation`** para decidir si resuelve |
| **`PN-08`** (`EDGE-005-20`) — el enlace `PET` no sobrevive a la transferencia, ni aunque el ex-propietario conserve `ADMIN` | Se **conserva el efecto buscado**: quien deja de ser propietario principal **y** deja de ser co-propietario `ACTIVE` pierde el enlace al instante (`404` uniforme, `INV-OWN12-005`). La diferencia: **el principal que cede el principal y queda como co-propietario `ACTIVE` conserva sus enlaces** (sigue teniendo autoridad); si sale, el `404` es inmediato |
| **`B-1`** (`EDGE-005-20-bis`, A→B→A) — la transferencia revoca todos los enlaces `PET` `ACTIVOS` de la mascota en la misma transacción para que el enlace no «resucite» | **Se reformula sin comparar propietarios históricos**: ya no hace falta la igualdad con `pet_owner_user_id_at_creation`; la autoridad es la condición viva y el riesgo de «resurrección» se cierra por **revocación explícita** (ver §2). Al `LEAVE`/`ENDED`/supresión de cuenta de quien creó el enlace y al cambiar el principal, los enlaces `PET` de quien **ya no es propietario** se **revocan** (`revoked_at = now`, auditoría `REVOKED` con `actor_user_id`) en la misma transacción, de modo que A→B→A no reactiva ninguno |

## 2. Reglas de aplicación (efecto inmediato, `INV-OWN12-005`)

1. **Evaluación por acceso.** Cada petición pública y la vista previa revalidan, con una sola consulta acotada, que el creador sea propietario principal o co-propietario `ACTIVE` de la mascota (sin caché de rol). Si no, `404` uniforme `ERR-SHARE-NOT-FOUND`, sin borrar la fila.
2. **Salida o pérdida de condición.** Al salir (`LEFT`), `ENDED`, supresión de cuenta o cambio de principal que deje al creador sin condición de propietario, sus enlaces `PET` de esa mascota se revocan en la misma transacción y bajo el bloqueo por mascota (`REQ-OWN12-011`).
3. **Quien conserva la condición** (el principal anterior que queda co-propietario `ACTIVE`, o el sucesor): conserva sus enlaces; los demás co-propietarios pueden **revocarlos** (`REQ-VET12-007`, solo para `PETS` en el Bloque E; para `PET` rige el `REQ-VET-005` de 005 ampliado a cualquier propietario `ACTIVE`).
4. **Supresión de la cuenta del creador** (`P-7`, Neo): los enlaces `share_links` se **eliminan con el creador** por la cascada vigente de 005 (`created_by_user_id ON DELETE CASCADE`; también con la mascota). **No se relaja `NOT NULL`** ni se conserva una columna seudonimizada: `pet_owner_user_id_at_creation` desaparece con la fila y no queda ID en claro (`SC-012-108`). `ENM-005-A` no introduce columna nueva ni cambia el esquema de 005.
5. **Compatibilidad.** Los enlaces `PET` y `HOUSEHOLD` y sus tokens existentes **no cambian**; la columna `pet_owner_user_id_at_creation` **se conserva en el esquema** (sin migración que reescriba filas) pero **ya no participa en la decisión de acceso**.
6. **Tope y respuesta uniforme** (`REQ-VET-007`, `REQ-VET-012`): sin cambios; ningún enlace nuevo expone más que antes (`INV-VET12-004`).

## 3. Escenarios que debe cubrir `/keymaker` (rojas primero)

- `SC-012-011`: un co-propietario `ACTIVE` crea un enlace `PET`; el principal sale; el enlace del co-propietario sigue resolviendo; si el co-propietario sale, `404` inmediato.
- A→B→A: A crea enlace, cede el principal a B (A queda co-propietario `ACTIVE`) y B lo devuelve: el enlace de A no cambia de estado por la cesión; si A sale y vuelve a ser co-propietario por una invitación nueva, su enlace anterior ya está **revocado**.
- `EDGE-012-021`: un `ADMIN` de hogar degradado a `READER` pierde la autoridad sobre un enlace `HOUSEHOLD`/`PETS`: `404` uniforme.
- `SC-012-108`: eliminar la cuenta del creador borra sus filas `share_links`; no queda ningún ID en claro.

## 4. Fuera de alcance

El alcance `PETS`, `share_link_pets`, `MAX_SHARE_LINK_PETS` y la revocación parcial de `D11-06 = A` son **`ENM-005-E`** (`T1690`, `share-link-subset-annex.md`). Las rutas de 005 no se modifican aquí: la implementación aplica la autoridad ampliada sobre el contrato vigente.
