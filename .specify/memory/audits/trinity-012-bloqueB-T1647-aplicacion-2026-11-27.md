# Acta Trinity — Feature 012, Bloque B, T1647: pase de capa de aplicación y persistencia (R-02, R-03, R-09) — HEAD 09d913e

Fecha: 2026-11-27. Auditor: /trinity (sonnet). Solo lectura: sin ediciones en src/contratos/tests, sin commits/push, sin [x]. Complementa `trinity-012-bloqueB-T1647-R02-R03-R09-c8abd7a-2026-11-27.md`. Numeración con el sentido de `lock` (R-02 sucesión concurrente, R-03 supresión del único propietario con disputa / reserva del chip, R-09 cifras y contador).

## Corrección de premisa (R-03)
La misión pedía verificar que la supresión NO permite borrar a un propietario con disputa abierta. La especificación dice lo contrario: `N2-R2`, SC-012-096, EDGE-012-053, data-model.md:159 y tasks.md T1622/T1646 exigen que la supresión PROCEDA, que el expediente y el `chip_hmac` se conserven con `pet_id` nulo y que el chip quede RESERVADO hasta `RESOLVED`/`EXPIRED`. Verifiqué ese comportamiento, no el bloqueo.

## Veredictos
- R-02 (sucesión concurrente): CUMPLE por lectura, con cobertura de pruebas parcial (ver huecos).
- R-03 (supresión del único propietario + reserva del chip): CUMPLE por lectura; el compuesto supresión -> re-registro del chip NO tiene una prueba de extremo a extremo (hueco T1647-A2).
- R-09 (cifras y contador): CUMPLE, sin cambios desde la acta anterior (`feature-012-limits.ts`, `recordChipAttempt` chip-ip-rate-limit.ts:67-90; ningún archivo de esos cambió tras c8abd7a).

## R-02, evidencia
- Autorización antes del bloqueo (H-03): `requireOwner` co-ownership-support.ts:70-76; `LeavePetUseCase` lo llama antes de `applyLeave` (co-ownership-use-cases.ts:318-319).
- Punto único de entrada con espera acotada: `runOwnershipTransaction` co-ownership-support.ts:83-85 -> `boundedLockWait: true`. Uso verificado en accept/invite/leave/erase (account-use-cases.ts:133), absence-dispute (:33,:117), chip-claim (:54), chip-dispute (:86). `chargeOwnershipAttempt` (:92) y Decline/Cancel usan transacción ordinaria o sin bloqueo de mascota; Decline/Cancel se protegen con `transition ... WHERE status = expected` (condicional), correcto.
- Bloqueo por mascota: PG `SELECT ... FROM pets WHERE id = $1 FOR UPDATE` con `SET LOCAL lock_timeout = 3000ms`, 55P03 -> `ERR-OWN12-RETRYABLE` (postgres-ownership-repositories.ts:143-153). Candado asesor global del UoW con el mismo mapeo (postgres-unit-of-work.ts:92-103). SQLite: `BEGIN IMMEDIATE` (sqlite-unit-of-work.ts:125) y `findOwnershipForUpdate` solo lee (sqlite-ownership-repositories.ts:151). Memoria: cola serial (in-memory-unit-of-work.ts:1184-1203).
- `UPDATE ... WHERE` condicional: `compareAndSetOwner` (owner + ownership_version) y `bumpOwnershipVersion` (version) en PG :155-166; `transition(id, expectedStatus)` WHERE status (PG :35-44, SQLite :20-45, memoria :52). Todos devuelven recuento y el llamador lo evalúa.
- Reintento único: `applyLeave` (co-ownership-use-cases.ts:279-310) itera 2 veces; 0 filas -> `continue`; tras la segunda, `retryable()` (:309); `transition` falso -> `retryable()` (:296,:300). Aceptar: bucle de 2 intentos (:195-203). Rollback completo (la excepción sale de la transacción).
- Orden `pet_id ASC`: `eraseAccountInTransaction` ordena propias (account-use-cases.ts:199) y aplica `applyLeave` sobre `[...staying].sort()` (:226). Con el candado global del UoW el orden es defensa en profundidad.

## R-02, qué prueban realmente los tests (corrida local, 6 archivos: 96 pasan, 47 omitidos, 0 fallan)
- `co-ownership-races-012.spec.ts` (22 tests; 14 corren, 8 omitidos = 7 PG + el de `lock_timeout`): memoria (cola serial: NO es una carrera real, solo prueba equivalencia serial de la lógica) y SQLite con DOS conexiones reales al mismo archivo (B con `busy_timeout=0`, reintento ante SQLITE_BUSY en el harness; sí hay solapamiento real y `BEGIN IMMEDIATE` real). Cubren 6 combinaciones de SC-012-095 con invariante, no con orden fijo.
- PostgreSQL (`TEST_DATABASE_URL` no definida aquí): OMITIDOS los 7 de carreras y la prueba de `lock_timeout` que fija ERR-OWN12-RETRYABLE por 55P03 y `>= 2950 ms`. Sin verificar empíricamente: `FOR UPDATE` real, candado asesor, 55P03 -> 503. Solo hay `pg-lock-acotado-012.spec.ts` (unitaria, 4 pasan).
- Reintento único: `co-ownership-parity-012.spec.ts` `withZeroRowOwnerWrites` (3 motores salvo PG omitido): fuerza 0 filas en las escrituras de propietario y exige `ERR-OWN12-RETRYABLE`, 2 intentos, sin escritura parcial. Solo ejercita la rama PRINCIPAL_SUCCEEDED de `applyLeave`.
- NO cubiertas (declarado en el encabezado del propio spec): END_CO_OWNERSHIP vs LEAVE, apertura de disputa por ausencia vs LEAVE, ADD_CO_OWNER(claimant) vs LEAVE; y ningún test con DOS mascotas cruzadas que pruebe el orden `pet_id ASC`.

## R-03, evidencia
- Reserva: `hasOpenChipReservation` en PG :119-122, SQLite :124 (sentencia :74) y memoria :128 con el mismo predicado (`chip_hmac`, `CHIP_DISPUTE`, `CHIP_APPROPRIATION`, `UNDER_REVIEW`, `expires_at > now`). No depende de la mascota ni de `frozen_until`; la disputa nace con `expiresAt = +60 d` (chip-dispute-use-cases.ts:125), de modo que la reserva dura hasta el cierre o el vencimiento (alineado con SC-012-096).
- Comprobador único: `assertMicrochipAvailable` chip-uniqueness.ts:34-47 consulta SIEMPRE `findMicrochipHolder` y la reserva (:42-44) y lanza el mismo 409 (:46); `ERR-PET-MICROCHIP-DUPLICATE` solo si el mismo principal (:45). Cuenta de la reserva en la apertura: chip-dispute-use-cases.ts:97.
- Supresión (`eraseAccountInTransaction`, account-use-cases.ts:185-): la mascota sin sucesor se elimina (B9) y `owner_requests.pet_id` pasa a NULL por `ON DELETE SET NULL` (migración PG 0029:36; SQLite 0033:38; memoria in-memory-unit-of-work.ts:428-437); en B9 las solicitudes `PENDING` no-disputa se cancelan y la disputa `CHIP_DISPUTE` NO se toca (conserva `UNDER_REVIEW`, `chip_hmac`, `chip_last4`). `pseudonymizeUser` anula referencias al usuario (PG :104-117) sin tocar `chip_hmac` ni el estado.
- Pruebas: `co-ownership-parity-012.spec.ts:315-330` (supresión del único propietario con disputa abierta: OK, mascota eliminada, expediente sobrevive con `petId: null`, `chipHmac`, `UNDER_REVIEW`); `chip-dispute-012.spec.ts:64` (la reserva sobrevive a congelación caducada y a `pets.delete`, mismo 409 y mismas llamadas); `chip-split-error-012.spec.ts:54` (consulta de reserva siempre ejecutada).

## Hallazgos
| ID | Sev | Ubicación | Evidencia |
|---|---|---|---|
| T1647-A1 | MEDIA (cobertura) | tests/integration/co-ownership-races-012.spec.ts | R-02 en PostgreSQL (FOR UPDATE, 55P03 -> 503, candado asesor) solo se verifica con `TEST_DATABASE_URL`; omitido aquí. Debe correrse una vez con PG real antes de cerrar T1647/T1639. |
| T1647-A2 | BAJA (cobertura) | parity-012.spec.ts:315 / chip-dispute-012.spec.ts:64 | El test de supresión usa `chipHmac = 'c'.repeat(64)` y no intenta re-registrar el chip tras `erase`; el de reserva borra la mascota con `pets.delete`, no con la supresión. Falta un test que una ambos: abrir disputa real, `erase(único propietario)`, `RegisterPet(CHIP)` -> 409 y tras `RESOLVED`/`EXPIRED` -> libre. Riesgo bajo: ambas mitades están probadas y el código es el mismo. |
| T1647-A3 | INFO | account-use-cases.ts:234 (B9) | Las mascotas SIN sucesor se eliminan sin `findOwnershipForUpdate` previo; la exclusión la dan el candado global (PG advisory / `BEGIN IMMEDIATE`) y el test aceptación-vs-supresión. Defensa en profundidad por mascota ausente en esa rama; sin explotación posible mientras exista el candado global. |
| T1647-A4 | INFO | co-ownership-use-cases.ts:288-297 | En el reintento de `applyLeave`, `sceneHooks.onPetOwnershipTransferred` se ejecuta antes del CAS, así que corre dos veces si el primer CAS falla y el segundo triunfa. Requiere que el hook sea idempotente (no verificado aquí; es código de 006). |
| T1647-A5 | INFO | postgres-ownership-repositories.ts:145 | `SET LOCAL lock_timeout` de 3 s persiste el resto de la transacción (también tras la espera de mascota). Sin efecto de seguridad. |

Sin hallazgos CRÍTICO/MAYOR. T-01 (DEUDA-012-ADMIN-STEPUP-PROD) sigue abierto como bloqueante de release (no se reabrió).

## Sin verificar y por qué
- PostgreSQL real para R-02: sin `TEST_DATABASE_URL`.
- Idempotencia del hook de escena (T1647-A4): fuera del alcance de 012.
- /rama (retención, `rejected_by`) y la pasada de /mouse: fuera de este pase.
