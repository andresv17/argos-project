# Acta SENTINELS — 012 Bloque B, T1638 (#23)

- Fecha: 2026-11-27
- Rama: `012-multiduenio-microchip-cuidador` (local)
- Entorno: local y de prueba (arnés `tests/integration/api` con SQLite y adaptador antimalware determinista). Sin red, sin servicios externos.
- Alcance: lectura de `src/` y `tests/`; prueba nueva añadida en `tests/integration/api/sentinels-012-bloqueB-T1638.api.spec.ts`. Sin cambios en `src/`, contratos ni specs. Sin commit, sin push, sin `[x]`, sin tocar `logos.json`/`logos.py`.
- Rutas auditadas: `src/infrastructure/http/routes/chip.routes.ts`, `admin-disputes.routes.ts`, `src/infrastructure/http/multipart-form.ts`, y casos de uso `src/application/use-cases/chip-dispute-use-cases.ts`, `chip-dispute-admin-use-cases.ts`, `src/infrastructure/http/admin-stepup-store.ts`.

## Resultados de los 9 vectores

| # | Vector | Resultado | Evidencia | Archivo:línea |
|---|---|---|---|---|
| V1 | Tamaño multipart | PASS | `Content-Length` 15728641 → 413 sin consumir cupo. Cuerpo real de 16 MiB con CL honesto → 413 o 422 (no 202). La aserción acepta ambos; no se fijó cuál. | `chip.routes.ts:68`; `chip.routes.ts:73` (`bodyLimit`) |
| V2 | Tipo (petición y evidencia) | PASS | `application/json` → 422. PNG declarado `application/pdf` → 422. Texto plano declarado `image/png` → 422. | `chip.routes.ts:65`; `multipart-form.ts:77` |
| V3 | Boundary malformado | PASS | Sin boundary → 422. Boundary de 71 caracteres → 422. Boundary con `;` o inyección CRLF → 422. Delimitador distinto o preámbulo → 422. | `multipart-form.ts:30-34`, `multipart-form.ts:51` |
| V4 | 411 / 413 por cabeceras | PASS | `transfer-encoding: chunked` → 411. `Content-Length` no numérico o negativo → 411. `Content-Length` > tope → 413. Ninguno consume el contador (el 11.º envío válido da 429). | `chip.routes.ts:66-68`, `chip.routes.ts:69` |
| V5 | Chip formato | PASS | `chip-claims` con 14 dígitos, 16 dígitos, letra o campo extra → 422 en los cuatro casos. Disputa con chip mal formado → 422. Son validaciones de forma previas a cualquier consulta de existencia, sin oráculo. | `chip-dispute-use-cases.ts:31`, `chip-claim-use-cases.ts:50` |
| V6 | Chip duplicados | **FAIL** | Dos usuarios distintos reclaman el mismo chip ocupado: respuestas idénticas (202, cuerpo y `Cache-Control: private, no-store`); PASS en esa parte. FAIL en la repetición de disputa: chip libre → 202, 202; chip ocupado → 202, **409** `ERR-CHP12-DISPUTE-LIMIT`. El 409 deja distinguir chip registrado de chip libre, lo que contradice INV-CHP12-003 (sin oráculo). | `chip-dispute-use-cases.ts:90` (chip libre: 202 sin fila) frente a `:101` (`ERR-CHP12-DISPUTE-LIMIT` por `open.some(chipHmac === anchor)`) |
| V7 | Step-up reutilizado | PASS | Mismo `stepUpGrantId` en dos `resolve`: 1.º 200, 2.º 403 genérico. Grant de `resolve` usado en `confirm` → 403. | `admin-stepup-store.ts:28-35`; `chip-dispute-admin-use-cases.ts:99-103` |
| V8 | Grant ajeno | PASS | Grant del administrador dos usado por el uno → 403. El grant del dueño sigue válido para el dueño (200). | `admin-stepup-store.ts:33` (solo quema si `adminId` coincide) |
| V9 | IDOR entre disputas | PASS | Grant de la disputa A en `resolve` de la disputa B → 403; el detalle de B no cambia (comparación de texto). Evidencia de A leída por la ruta de B → 404 uniforme; por la ruta de A → 200. | `admin-disputes.routes.ts:84-88`, `:93`, `:119`; `admin-stepup-store.ts:31` |

Recuento: 8 PASS y 1 FAIL (V6).

## Hallazgos

- **H-T1638-01 (MEDIO, FAIL V6): oráculo de chip ocupado en la repetición de disputa.** Un chip libre devuelve 202 en todos los envíos (`chip-dispute-use-cases.ts:90`). Un chip con mascota devuelve 202 en el primero y 409 `ERR-CHP12-DISPUTE-LIMIT` en el segundo (`:101`), aunque la disputa sea la misma. Así el reclamante confirma que un chip está registrado, en contra de INV-CHP12-003 y del 202 uniforme de REQ-CHP12-005. Recomendación: devolver el mismo 202 también cuando el límite se alcanza por una disputa propia repetida (o tratar la repetición como idempotente), manteniendo el 409 solo para el límite general de disputas abiertas si no depende del chip. Corrección a cargo de `/keymaker`; `/architect` debe confirmar la semántica en el contrato.
- **H-T1638-02 (BAJO, comportamiento documentado): el grant del dueño se quema aunque la validación falle.** `AdminStepUpStore.consume` borra el grant en el `finally` cuando el `adminId` coincide, incluso si la disputa o la acción no cuadran (`admin-stepup-store.ts:31-34`). Es intencional según su comentario. Consecuencia: un administrador que usa un grant de otra disputa pierde el grant propio. No es una fuga ni permite una acción indebida. Se registra como nota de diseño.
- **H-T1638-03 (BAJO, cobertura): V1 acepta 413 o 422 para el cuerpo de 16 MiB.** La aserción es tolerante. Conviene fijar el código exacto en una prueba posterior.
- Sin hallazgos nuevos de PASS en tamaño, tipo, boundary, 411/413, formato de chip, step-up reutilizado, grant ajeno ni IDOR.

## Pruebas (rc reales)

- `node node_modules/vitest/vitest.mjs run tests/integration/api/sentinels-012-bloqueB-T1638.api.spec.ts`: **rc=1**, 19 pass y 1 fail (V6, H-T1638-01). Arranque con Node v22.23.4 del fnm local.
- `node node_modules/vitest/vitest.mjs run tests/integration/api/chip-routes-012.api.spec.ts` (línea base de T1636): **rc=0**, 11/11 pass.
- No ejecutado en esta misión: `npx tsc --noEmit`, `npm run test:gate`, `verify-oracles.sh`, `verify-traceability.sh`. Corresponden a T1639.

## Recomendación

- Mantener la prueba V6 en rojo hasta que `/keymaker` corrija H-T1638-01. No marcar T1638 como cerrado.
- Tras la corrección, rerun del archivo sentinels y de `chip-routes-012`, y después T1639.
- El resto de vectores pasa; el estado de seguridad sigue sujeto a `DEUDA-012-ADMIN-STEPUP-PROD`, ya registrada por T1647.

Sin marcas `[x]`. Sin estado `COMPLETED`. Reporte hacia Neo solo vía escalamiento con `TO: Neo (Andrés Vallejo — Level 2)` si procede.
