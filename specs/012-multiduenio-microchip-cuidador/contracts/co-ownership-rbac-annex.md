# Anexo T1611 — `ENM-002-MINOR-012`: co-propiedad en RBAC, propiedad, hogar y eliminación de cuenta (Bloque A, #22)

Estado: `APPROVED` (texto de la enmienda `ENM-002-MINOR-012`, firmado por Neo — Nivel 2, 2026-11-26; redactó `/architect` el 2026-11-26). Los contratos máquina hermanos (OpenAPI, schemas, state-machines, `error-catalog.json`) siguen `DRAFT` hasta superar `T1612`. Documento **nuevo** de la 012: **no edita** ningún contrato ni texto de la 002 (`LOCKED`/`APPROVED`). Las enmiendas rigen para la 012 por referencia a este anexo y la 002 queda intacta como historial. Contratos hermanos: `openapi/co-ownership.openapi.yaml` 0.1.0, `schemas/pet-co-owner.schema.json` 0.1.0, `schemas/owner-request.schema.json` 0.1.0, `state-machines/co-owner.machine.json` (`STATE-COOWN12-001`), `state-machines/owner-request.machine.json` (`STATE-OWNREQ12-001`), `errors/error-catalog.json` 0.1.0. Trazabilidad: `REQ-OWN12-001..011`, `INV-OWN12-001..007`, `STATE-COOWN12-001`, `EDGE-012-015`, `EDGE-012-051`, `EDGE-012-052`, `SC-012-001..012`.

Los IDs vigentes de la 002 son **`INV-ACC2-001`**, **`INV-ACC2-002`** e **`INV-OWN2-001`** (la 002 reemplazó a `INV-ACC-001/002` y `INV-OWN-001` de la 001; `Neo-H`). Texto fuente verificado en `specs/002-plataforma-v21/spec.md` (líneas 284–286).

## 1. Registro de enmiendas

| Enmienda | Qué cambia | Contrato de la 002 que NO se toca | Aprobación |
| --- | --- | --- | --- |
| `ENM-002-MINOR-012` | Los cinco apartados de este anexo (§2–§6) | `INV-ACC2-001`, `INV-ACC2-002`, `INV-OWN2-001`, `REQ-RBAC-001`, `REQ-OWN-001`, `REQ-ACC-002`, poda de `household-policies` | `APPROVED` por Neo (2026-11-26) |
| `ENM-002-MINOR-012-CHIP` | Split de error del chip (anexo propio, `T1631`) | `E-04` de la 002/004 | Neo (pendiente) |

## 2. Invariantes enmendados

Definiciones: **principal** = `pets.owner_user_id`; **co-propietario `ACTIVE`** = fila de `pet_co_owners` con `status = 'ACTIVE'`; **propietario** = principal o co-propietario `ACTIVE`.

### `INV-ACC2-001` (lectura, enmendado)
`U` lee la mascota `P` si y solo si: (i) `U` es el propietario principal de `P`; o (ii) `U` tiene una fila `pet_co_owners` `ACTIVE` sobre `P`; o (iii) existe un hogar `H` con `P` asignada y `U` miembro `ACTIVE` de `H` (regla vigente de la 002). Los estados `INVITED`, `DECLINED`, `CANCELLED`, `EXPIRED`, `LEFT`, `PROMOTED` y `ENDED` **no leen**. En cualquier otro caso se responde `ERR-PET-NOT-FOUND` **idéntico en cuerpo, cabeceras y coste**. La condición se evalúa en el instante de cada petición y en la misma transacción que cualquier escritura (sin caché de rol, `EDGE-012-015`).

### `INV-ACC2-002` (escritura, enmendado)
`U` escribe datos cotidianos de `P` si es propietario principal o co-propietario `ACTIVE` (paridad, `REQ-OWN12-005`), o si el rol de hogar de `REQ-RBAC-001` lo permite. Las cuatro acciones críticas (`DELETE_PET`, `TRANSFER_PRINCIPAL`, `CHANGE_PRINCIPAL`, `INVITE_CO_OWNER`) solo se ejecutan por aprobación conjunta (`INV-OWN12-001`) cuando hay más de un propietario `ACTIVE`. Solo el principal exporta el respaldo (`D12-05`). Quien puede leer sin poder escribir recibe `ERR-ACC-FORBIDDEN`; quien no puede leer, `ERR-PET-NOT-FOUND`. **Regla de implementación** (`REQ-OWN12-010`): una única función de dominio `canActOnPet(user, pet, action)`; queda prohibido (regla Semgrep del proyecto) comparar `ownerUserId` con el usuario fuera de ella.

### `INV-OWN2-001` (propiedad, enmendado)
Toda mascota tiene **exactamente un propietario principal** (`ownerUserId`) y de **cero a `MAX_CO_OWNERS_PER_PET − 1` (= 2)** co-propietarios `ACTIVE` (tope 3 incluido el principal). `ownerUserId` solo cambia por: `TRANSFER_PRINCIPAL` o `CHANGE_PRINCIPAL` aprobadas, sucesión por salida o supresión del principal (`REQ-OWN12-006`) o `REQUEST_CHANGE_PRINCIPAL` resuelta por `/admin` (`REQ-CHP12-009`, también `PRINCIPAL_ABSENT`, `P-3`). **Nunca** queda una mascota sin propietario `ACTIVE`, y `pets.owner_user_id` nunca apunta a quien ya salió (`INV-OWN12-007`). Nadie elimina ni degrada a otro co-propietario (`INV-OWN12-002`).

## 3. `REQ-RBAC-001`: filas críticas y paridad

Un co-propietario `ACTIVE` cuenta como **Propietario Legal** (primera columna de la matriz) para editar datos básicos, registrar/editar/eliminar eventos y registros y subir/eliminar archivos (`REQ-OWN12-005`). Las filas que **cambian**:

| Acción | Antes (002) | Con ENM-002-MINOR-012 |
| --- | --- | --- |
| Eliminar expediente de la mascota | Propietario Legal | Propietario `ACTIVE`; con más de uno, **aprobación de todos los demás** (`DELETE_PET`, `REQ-OWN12-004`); con uno solo, como hoy |
| Transferir propiedad legal de una mascota | Propietario Legal, inmediata | `TRANSFER_PRINCIPAL`: propietario `ACTIVE`; con más de uno, aprobación de todos los demás; el destinatario es un co-propietario `ACTIVE` (ver §4) |
| Cambiar el principal | (no existía) | `CHANGE_PRINCIPAL` por aprobación conjunta; el principal anterior queda como co-propietario `ACTIVE` |
| Invitar co-propietario | (no existía) | Propietario `ACTIVE`; con más de uno, `INVITE_CO_OWNER` aprobada por todos los demás |
| Asignar y desasignar mascotas a hogares | Propietario Legal | Cada propietario `ACTIVE` solo a hogares donde es miembro `ACTIVE` y solo desasigna lo que asignó (`REQ-OWN12-007`) |
| Exportar e importar respaldo | de cuenta, sobre mascotas propias | Solo mascotas donde es **principal** (`D12-05`); al importar queda como principal |
| Expulsar o degradar a otro propietario | (no existía) | **No existe** (ninguna acción, ruta, función SQL ni rol, incluidos `ADMIN` de hogar y `OPERATOR`; `INV-OWN12-002`, `SC-012-007`) |

Las demás filas (eventos, pesos, medidas, citas, parámetros, medios, `CREATE_SHARE_LINK`) no cambian de contenido: solo se amplía quién es «Propietario Legal».

## 4. `REQ-OWN-001`: `TRANSFER_PRINCIPAL`, `CHANGE_PRINCIPAL` y sucesión

La 002 define la transferencia como **inmediata y sin aceptación** a un miembro `ACTIVE` de un hogar de la mascota. Con ENM-002-MINOR-012:

1. **`TRANSFER_PRINCIPAL`** y **`CHANGE_PRINCIPAL`** son acciones críticas de `owner_requests` (`STATE-OWNREQ12-001`): con más de un propietario `ACTIVE` exigen la aprobación de todos los demás; con uno solo se ejecutan directo. El destinatario es un **co-propietario `ACTIVE`** de esa mascota (no un miembro de hogar cualquiera: un tercero entra primero por `INVITE_CO_OWNER`). En `TRANSFER_PRINCIPAL` el principal anterior **sigue como co-propietario `ACTIVE`** salvo que ya haya salido; la efectividad es la de la 002 (sin segunda aceptación del destinatario más allá de su condición `ACTIVE`).
2. **Sucesión** (`REQ-OWN12-006`, `N2-R3`): si el principal sale o elimina su cuenta y queda al menos un co-propietario `ACTIVE`, hereda el designado válido (`successorUserId`) o, sin designación válida o por supresión de cuenta, el de menor `(joined_at ASC, user_id ASC)`; en la misma transacción y bajo el bloqueo por mascota; auditoría `PRINCIPAL_SUCCESSOR_DESIGNATED` o `PRINCIPAL_AUTO_PROMOTED`. Si no queda nadie, aplica `REQ-PET-004` (la mascota se elimina).
3. **Efectos de la transferencia de 002 que se conservan**: se auditan las transiciones; los seis tipos de registro siguen a la mascota; la microchip no debe chocar (`REQ-CHP12-006`).
4. **Efectos de 005 asociados** (anexo `enm-005-a-annex.md`): el enlace `PET` ya no depende de `pet_owner_user_id_at_creation` (`ENM-005-A`); la transferencia deja de revocar «todos los enlaces `PET`» y pasa a revocar solo los de quien deja de tener autoridad.

## 5. Invariante de hogar y poda (`household-policies`)

Texto vigente de la 002, citado por `specs/002-*/spec.md`: `REQ-OWN-001` dice que la transferencia «mantiene el invariante «el dueño de una mascota es miembro `ACTIVE` de todo hogar donde está asignada»» y poda las asignaciones a hogares donde el nuevo dueño no es miembro `ACTIVE`; `REQ-HOUSE2-003` dice «El Propietario Legal asigna o desasigna sus mascotas a hogares donde es miembro `ACTIVE`». La poda en expulsión y abandono es lectura de las tareas `T245/T247` de la 002, no cita literal.

Con co-propiedad **cada co-propietario puede asignar a hogares distintos**, de modo que la regla se reformula (`REQ-OWN12-007`):

> **Todo hogar donde la mascota está asignada tiene como miembro `ACTIVE` al co-propietario que la asignó** (`pet_household_assignments.assigned_by_user_id`).

- La **poda** de `household-policies` se hace por **`assigned_by_user_id`** y no por `ownerUserId`: al `LEFT`/`REMOVED` de un miembro, o al salir o suprimirse un co-propietario, se retiran solo las asignaciones hechas por esa persona a ese hogar.
- Un co-propietario solo **desasigna** lo que asignó.
- La visibilidad por hogar (`INV-HOUSE-004` de la 001: «visibilidad solo por membresía activa») **no cambia**.
- **Identificador**: la regla se referencia solo como `REQ-OWN12-007` y este §5; no usa `INV-HOUSE-004`, cuyo texto en la 001 es otro. Un ID propio de la 012 queda **pendiente de decisión de Neo** y no se usa en la spec.

## 6. Eliminación de cuenta (`REQ-ACC-002`) y `ERR-ACCOUNT-OWNS-SHARED-PETS`

- La supresión toma el bloqueo por mascota **en orden `pet_id ASC`** y revalida dentro de la transacción (`REQ-OWN12-011`).
- **Ninguna mascota con co-propietarios `ACTIVE` se elimina nunca por la supresión de su principal** (con o sin disputa): se aplica la sucesión automática sin designación. Un co-propietario `ACTIVE` que elimina su cuenta pasa a `LEFT`; se retiran sus asignaciones (`assigned_by_user_id`), se cancelan sus invitaciones emitidas y se seudonimizan las referencias.
- **`ERR-ACCOUNT-OWNS-SHARED-PETS` (002, 409) se emite únicamente** cuando el usuario es **principal sin co-propietario `ACTIVE`** (no hay sucesor) **y** la mascota está compartida en los términos vigentes de la 002 (asignada a un hogar con otros miembros `ACTIVE`). Con un co-propietario `ACTIVE` **nunca** se emite. **La 012 no añade supuestos nuevos** (`rama R-03`).
- **Con disputa `CHIP_APPROPRIATION` `UNDER_REVIEW`** (`N2-R2`): la supresión procede, los datos personales se borran o seudonimizan según `REQ-PET-004` y `/rama`, y el chip queda **reservado** mientras la disputa esté `UNDER_REVIEW` (no se libera ni se permite bypass); la disputa se retiene hasta `RESOLVED` o `EXPIRED` (`P-1`) más la retención de `P-2`.
- Los enlaces `share_links` creados por la cuenta suprimida se **eliminan con ella** por la cascada vigente de 005 (`P-7`; `created_by_user_id ON DELETE CASCADE`), por lo que no queda ID ni enlace.
- Auditoría de toda alta, aprobación, rechazo, salida, promoción y cambio de principal, sin correos en registros (`REQ-AUD-*`).

## 7. Compatibilidad y migración (resumen; el diseño es de `T1616`)

Sin migración de datos de usuario: `pets.owner_user_id` no cambia; las mascotas existentes quedan con cero co-propietarios y `ownership_version = 1`. Antes de aplicar la migración, **desactivar las rutas de transferencia de la 002 o abrir una ventana de mantenimiento** (`R-08`, `NFR-012-010`; lo ejecuta `/link`, `T1626`).

## 8. Fuera de alcance de este anexo

La cola de disputas de `/admin` (`admin-disputes-annex.md`, `T1632`), el split de error del chip (`T1631`), el alcance `PETS` (`T1690`) y la autoridad de enlaces `PET` (`enm-005-a-annex.md`, `T1624`).
