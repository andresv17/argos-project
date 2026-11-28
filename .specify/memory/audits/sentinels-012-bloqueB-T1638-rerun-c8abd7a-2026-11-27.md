# Acta SENTINELS — re-ejecución 012 Bloque B, T1638 sobre HEAD c8abd7a

- Fecha: 2026-11-27
- Rama: `012-multiduenio-microchip-cuidador` (local). HEAD `c8abd7a`.
- Solicitado por: Morpheus (misión de re-ejecución tras V6 corregido en 5d6b930, S-01..S-03 y T-02 en d742d63, T-03 en c8abd7a).
- Alcance: lectura de `src/` y `tests/`. Sin ediciones en `src/`, contratos ni specs. Sin commit, sin push, sin `[x]`, sin tocar `logos.json` / `logos.py`.
- Entorno: local y de prueba (arnés `tests/integration/api`, SQLite en memoria, adaptador antimalware determinista). Sin red, sin servicios externos.

## Advertencia de base de código (árbol de trabajo no limpio)

La prueba se ejecutó sobre el árbol de trabajo, no sobre HEAD limpio. Hay cambios sin commitear fuera de los ficheros auditados:

- `src/generated/v38/**` (7 ficheros modificados, compilados de contratos).
- `src/infrastructure/config/app-config.ts`, `src/infrastructure/http/app.ts`, `src/infrastructure/http/server.ts` (guardia `X-Origin-Verify`, opcional por `ARGOS_ORIGIN_VERIFY_SECRET`).
- Sin seguimiento: `src/infrastructure/http/plugins/origin-verify.ts` y `tests/unit/origin-verify-guard.spec.ts`.

Los ficheros de la superficie auditada en esta misión son **idénticos a HEAD c8abd7a**: `admin-stepup-store.ts`, `routes/admin-disputes.routes.ts`, `routes/chip.routes.ts`, `chip-dispute-use-cases.ts`, `chip-dispute-admin-use-cases.ts`. La guardia `origin-verify` no fue auditada y no está cubierta por la prueba (su secreto es nulo en el arnés). Los veredictos de abajo valen para la capa de rutas y casos de uso en HEAD.

## Pruebas (rc reales)

- `node node_modules/vitest/vitest.mjs run tests/integration/api/sentinels-012-bloqueB-T1638.api.spec.ts`: **rc=0**, **25/25 pass**, 998 ms. Salida en `/private/tmp/claude-501/-Users-andresvalejo-Documents-Tecnica-Proyecto-Argos/f900d1f8-6315-4a54-803e-49a50b90b7ad/scratchpad/sentinels-rerun.txt`.
- Sonda adicional en proceso sobre `AdminStepUpStore` real (`node node_modules/tsx/dist/cli.mjs <scratchpad>/probe/stepup-probe.mts`): **rc=0**. Script en el scratchpad, no añadido a `tests/`. Resultados en la tabla de T-02.
- No ejecutado en esta misión: `npx tsc --noEmit`, `npm run test:gate`, `verify-oracles.sh`, `verify-traceability.sh`.

## Resultados de los 9 vectores

| # | Vector | Resultado | Evidencia | Archivo:línea |
|---|---|---|---|---|
| V1 | Tamaño multipart | PASS | Prueba `V1 tamaño` (2 casos) en verde. CL por encima del tope → 413. Cuerpo de 16 MiB con CL honesto → 413 o 422, nunca 202 (aserción tolerante, ver H-T1638-03). | `tests/integration/api/sentinels-012-bloqueB-T1638.api.spec.ts:96-110`; `chip.routes.ts:68,73` (líneas de la acta previa, no re-leídas) |
| V2 | Tipo (petición y evidencia) | PASS | Prueba `V2` (3 casos) en verde. | spec:112-130 |
| V3 | Boundary malformado | PASS | Prueba `V3` (4 casos) en verde. | spec:132-158 |
| V4 | 411 / 413 por cabeceras | PASS | Prueba `V4` (2 casos) en verde. | spec:160-175 |
| V5 | Chip formato | PASS | Prueba `V5` (2 casos) en verde. Validación de forma antes de cualquier consulta. | spec:177-191 |
| V6 | Chip duplicados (202 uniforme) | PASS | Chip ocupado repetido por el mismo usuario → 202 sin fila (`chip-dispute-use-cases.ts:91`). Chip libre sin mascota ni reserva → 202 sin fila (`:94`). Dos reclamantes distintos → respuestas idénticas, incl. `Cache-Control: private, no-store`. Corrige H-T1638-01 (409 previo). Ver reserva R-V6. | spec:193-217; `chip-dispute-use-cases.ts:90-94` |
| V7 | Step-up reutilizado (un solo uso) | PASS | Mismo grant en dos `resolve`: 200 y después 403 genérico (sin texto "grant/usad/reus/expir"). Grant de `resolve` usado en `confirm` → 403. Sonda C1: tras `finish`, replay → 403. | spec:219-242; `admin-stepup-store.ts:35-49`; `admin-disputes.routes.ts:141,154` |
| V8 | Grant ajeno | PASS | Grant del admin dos usado por el admin uno → 403. El dueño sigue con 200. Sonda C2: un `claim` ajeno no quema la reserva del dueño. | spec:244-255; `admin-stepup-store.ts:41` (borra solo si `adminId` coincide) |
| V9 | IDOR entre disputas | PASS (con reserva R-V9) | Grant de A sobre B → 403 y B no cambia (texto idéntico). Evidencia de A leída por la ruta de B → 404 uniforme; por la ruta de A → 200. Pero el grant de A queda quemado (ver T-02 y H-T1638-02). | spec:257-291; `admin-disputes.routes.ts:84-88,93,119`; `admin-stepup-store.ts:41` |

Recuento: **9 PASS** (V9 con reserva), **0 FAIL**. El FAIL de V6 de la acta anterior queda cerrado.

## Nuevos puntos: S-02 (Origin ajeno) y T-02 (ciclo del grant)

### S-02 Origin ajeno en las mutaciones de disputa: PASS

- `step-up` con `Origin` ajeno → 403 antes de emitir el grant (`admin-disputes.routes.ts:118`). Con origen propio → 201 (prueba spec:297-306).
- `resolve`, `extend-freeze`, `confirm`, `cancel-execution`, `close-moot` llaman a `foreign()` antes de tocar el caso (`admin-disputes.routes.ts:105,131,148,159,166`). La prueba spec:308-325 confirma 403 en cuatro mutaciones sin cambiar el caso ni quemar el grant.
- `chip-disputes` con `Origin` ajeno → 403 sin fila (`chip.routes.ts:76`; spec:327-333).
- Origen ausente se acepta como propio (`admin.routes.ts:75`). Es decisión de diseño y se mantiene.
- Observación BAJA S-02-b: en `step-up` el cuerpo se valida (`strictBody`, `:113`) antes de la comprobación de origen (`:118`). Una petición con origen ajeno y cuerpo inválido responde 422 y no 403. No hay efecto de estado, pero el orden no coincide con el de las demás mutaciones.

### T-02 el grant se reserva, se consume o se libera: PARCIAL

Diseño verificado: `claim` reserva (`usedAt` no nulo) antes del caso de uso; `finish` consume; `release` libera ante cualquier error (`admin-disputes.routes.ts:70-80`; `admin-stepup-store.ts:35-55`).

| Caso | Resultado | Evidencia |
|---|---|---|
| Fallo del caso de uso (`ARBITRATION-CONFLICT`) no quema el grant; tras corregir, el mismo grant sirve una vez | PASS | Prueba `T-02` spec:347-363 (verde) |
| Petición concurrente con grant reservado → 403, y la reserva no se borra | PASS | Sonda C1: `claim` concurrente → `AdminForbiddenError`. Sonda C2: un `claim` ajeno no borra la reserva. **No cubierto por la suite**: no hay prueba de concurrencia. |
| Tras `release` el grant vuelve a servir; tras `finish` no | PASS | Sonda C1 (reintento OK tras release, replay 403 tras finish) y C4 |
| Fallo de validación del `claim` con disputa o acción ajena **quema el grant del dueño** | **NO CUMPLE el criterio literal** (reserva, ver H-T1638-02) | Sonda C3: dueño usa grant con disputa ajena → 403; reintento con el grant correcto → 403. Causa: `admin-stepup-store.ts:41` borra el grant si el `adminId` coincide, para cualquier fallo de `assertStepUpGrant` distinto de vencido. La prueba V9 (spec:271-273) codifica este comportamiento como "documentado". |

Riesgo a verificar (no probado en esta misión): si un caso de uso confirma una escritura y después lanza error, `release` deja el grant reutilizable. Depende de la transaccionalidad de `adminResolveDispute`/`adminConfirmDispute`. Pendiente para `/keymaker` o `/oracle`.

## Hallazgos

- **H-T1638-02 (BAJO, T-02/V9): el grant del dueño se quema si el `claim` falla por disputa o acción ajena.** `admin-stepup-store.ts:41`. Impacto: autoconsumo del propio administrador (no fuga, no acción indebida). Probado en sonda C3. El criterio literal de T-02 ("un fallo no debe quemar el grant del dueño") se cumple para el fallo del caso de uso y no para el fallo del `claim`. Decisión de diseño a confirmar por `/architect`.
- **H-T1638-03 (BAJO, cobertura): V1 acepta 413 o 422 en el cuerpo de 16 MiB.** Sigue abierto, sin cambio.
- **H-T1638-04 (BAJO a confirmar, cobertura T-02): falta prueba de concurrencia sobre el grant reservado.** Verificado por sonda, no por la suite.
- **H-T1638-05 (BAJO a confirmar, posible oráculo): `ERR-CHP12-DISPUTE-COOLDOWN` depende del estado del chip.** `chip-dispute-use-cases.ts:105`. Un chip libre sin reserva devuelve 202 antes (`:94`). Un chip ocupado devuelve 409 COOLDOWN al reclamante que tuvo REJECT sobre ese chip en los últimos días. Solo lo ve quien ya disputó el chip, así que la fuga es acotada. Requiere confirmación de `/architect` frente a INV-CHP12-003 y REQ-CHP12-005. Fuera del alcance de los 9 vectores, anotado.
- **R-V6 (cobertura débil):** la prueba de repetición (spec:204-216) afirma `toBeLessThanOrEqual(2)` filas. El valor correcto es exactamente 1 para `CHIP_A`. La aserción no detectaría una fila duplicada. Recomendación: fijar `toBe(1)`.
- **R-V9:** la prueba V9 codifica la quema del grant del dueño (H-T1638-02) como comportamiento esperado. Si `/architect` decide cambiarlo, esa aserción cambiará.

## Recomendación

- Veredicto de la re-ejecución: **25/25, rc=0**. V1..V9 sin FAIL. S-02 PASS. T-02 PARCIAL (criterio literal no cumplido en el fallo de `claim`; el caso de uso y la concurrencia son correctos).
- Antes de cerrar T1638, Neo debe decidir si H-T1638-02 (quema del grant propio en fallo de `claim`) se acepta como deuda o se corrige. Los hallazgos BAJO no bloquean.
- Pedir a `/keymaker` que añada prueba de concurrencia sobre grant reservado (H-T1638-04) y que fije la aserción de V6 a `toBe(1)` (R-V6).
- `/architect` debe confirmar H-T1638-05 con el contrato antes de tratarlo como hallazgo.
- Sin marcas `[x]`. Sin estado `COMPLETED`. Cierre de T1638 solo por Neo.

Sin commit. Sin cambios en `src/`, contratos ni specs. `logos.json` y `logos.py` no tocados.
