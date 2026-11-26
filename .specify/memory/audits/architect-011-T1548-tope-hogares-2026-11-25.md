# Acta Architect — T1548 (Bloque H, #74) tope de hogares — 2026-11-25
Estado: DRAFT (el estado del catálogo lo fija solo Neo). T1548 sigue `[ ]` (fundida en T1549).

## Decisión Neo
`MAX_HOUSEHOLDS_PER_USER = 5` preautorizado (Logos iter 240); `D11-12` = B+C.

## 1. Código de catálogo (011 v1.2.0, MINOR aditiva)
`ERR-HOG11-HOUSEHOLD-LIMIT-REACHED`, HTTP **409**, `invariantRef` INV-HOG11-001 (nuevo en spec.md), `requirementRef` REQ-HOG11-004, EDGE-011-008/010/016.
- Título: «Alcanzaste el límite de hogares». Detalle: «Ya perteneces al máximo de hogares permitido. Sal de alguno de tus hogares antes de crear otro o de aceptar esta invitación.» (sin número; vive solo en app-config).
- Justificación 409 vs 422: el catálogo usa 409 para conflictos con el estado del recurso/capacidad (`ERR-ADM11-DELEGATE-LIMIT-REACHED`, `LAST-SUPER-ADMIN`, `ERR-HOUSE-MEMBER-ALREADY-EXISTS`) y 422 solo para forma/validación de entrada (`SCHEMA-VALIDATION`, `EMAIL-CONFIRMATION-MISMATCH`). Un tope depende del estado, no de la forma de la petición: 409.
- Aplica a `createHousehold` y `acceptInvitation` (contratos 002/004 intactos; no se editó ninguno). Código nuevo en `src/generated/v37/errors/error-codes.ts` (compilador).

## 2. Constante y regla (para el keymaker, por hunk)
- `src/infrastructure/config/app-config.ts`: `export const MAX_HOUSEHOLDS_PER_USER = 5;` (constante única, INV-ARCH-006; NO escrita por Architect por los cambios H-01 sin commit). Ubicación sugerida: junto a las demás constantes `export const` de dominio (p. ej. cerca de `SCENE_MAX_CLOSED_WITHOUT_CALL_PER_DAY`, línea ~155).
- `src/domain/households/household-policies.ts`: función pura, p. ej. `assertHouseholdCapacity(activeCount: number, max: number)` que lanza/devuelve `ERR-HOG11-HOUSEHOLD-LIMIT-REACHED` si `activeCount >= max`. Dominio puro: el máximo se inyecta (sin `process.env` ni import de config en dominio). `activeCount` = membresías `ACTIVE` del usuario (propietario incluido; sin LEFT/REMOVED/INVITED/DECLINED).

## 3. Puntos de aplicación
- Crear hogar y aceptar invitación. Sin tope de invitaciones pendientes. Invitar NO se limita.
- Transacción: conteo `ACTIVE` del usuario + inserción/transición en la misma `runInTransaction`; serialización real en PostgreSQL (bloqueo/`FOR UPDATE` o guarda equivalente sobre el usuario) y SQLite (`BEGIN IMMEDIATE`); prueba de carrera contra ambos motores reales (la implementación en memoria no sirve como evidencia, EDGE-011-010).
- Orden en aceptar: invitación existente y del usuario (404 uniforme existente) antes del tope; rechazo por tope deja la invitación `OPEN` (EDGE-011-016) sin escribir nada.
- Quien ya supera 5 conserva sus hogares (sin expulsión ni migración); solo no puede crear ni aceptar (EDGE-011-008). Salir (`LEFT`) libera cupo.
- Cliente: avisa antes de intentar con la lista de hogares ya cargada; sin endpoint de conteo nuevo (MIF-011-09). El servidor es la guarda autoritativa.

## 4. Archivos tocados (solo texto)
`specs/011-.../contracts/errors/error-catalog.json` (1.1.0→1.2.0), `spec.md` (+INV-HOG11-001), `tasks.md` (Dep de T1548/T1549 mapean INV/ERR, sin [x]), `src/generated/v37/errors/error-codes.ts` (compilador). Sin tocar H-01, 005/tasks.md, 004, estados.

## 5. Compuertas
- `compile-contracts.sh --feature 011`: OK.
- `verify-traceability.sh --feature 011`: CUMPLE (132/132 spec→tasks; antes INV/ERR huérfanos hasta mapear en tasks).
- `--feature 011 --task T1549`: FALLA esperado (PENDING: REQ-HOG11-004, INV-HOG11-001, SC-011-053..056 sin pruebas); pasará en rc 0 cuando T1549 las añada con títulos/@implements.

## 6. Desglose SC-011-054..056 (2026-11-25, autorizado por Neo, Logos iter 240)
Sin alcance nuevo; criterios tomados de T1549, REQ-HOG11-004, INV-HOG11-001 y EDGE-011-008/010/016. Bullets individuales tras SC-011-053 en spec.md:
- SC-011-054: tope en crear y aceptar; sexta falla con `409` ERR-HOG11-HOUSEHOLD-LIMIT-REACHED sin escribir; invitación queda `OPEN`; activo = ACTIVE (EDGE-011-016, INV-HOG11-001).
- SC-011-055: quien ya supera 5 conserva hogares; sin expulsiones (EDGE-011-008).
- SC-011-056: dos aceptaciones simultáneas desde 4 hogares, solo una prospera; misma `runInTransaction`; PG y SQLite reales (EDGE-011-010).
Compuertas: `--feature 011` rc 0; `--task T1549` sin bloqueo por rangos (queda solo PENDING de @implements en src/, llega con T1550).
