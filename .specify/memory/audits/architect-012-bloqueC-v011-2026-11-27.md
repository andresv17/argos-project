# Acta /architect — Feature 012, Bloque C (Modo Cuidador), T1650: draft 0.1.1 — 2026-11-27

**Estado:** `DRAFT` 0.1.1 (MINOR: cambian reglas). Sin `APPROVED`, sin `[x]`, sin commit, sin push, sin tocar `src/`, `logos.*` ni el catálogo de errores. El estado solo lo fija Neo (Nivel 2).
**Entradas:** `maggie-012-bloqueC-T1651-2026-11-27.md` y `trinity-012-bloqueC-T1651-2026-11-27.md` (hallazgos de contrato, vía Morpheus).

## 1. Archivos y versiones (todos en `specs/012-multiduenio-microchip-cuidador/contracts/`)
| Archivo | 0.1.0 → 0.1.1 |
| --- | --- |
| `openapi/care.openapi.yaml` | MINOR |
| `schemas/care-routine.schema.json` | MAJOR(0.1.0) → MINOR |
| `schemas/care-log-entry.schema.json` | idem |
| `schemas/caregiver-access.schema.json` | idem (solo textos y reglas de invalidación) |

## 2. Puntos cerrados
**Maggie**
- **A-01**: `IU` añadida a `DoseUnit`; paso y umbral de IU sin cifra, pendientes de veterinario.
- **A-02**: `DOSE_CONFIRM_THRESHOLDS` deja de ser universal: grupos `CANINE_FELINE` (cifras heredadas de 0.1.0, valores de trabajo) y `OTHER_SPECIES` (todo `null`). `null` = sin guarda numérica y la UI no promete seguridad. Guarda relativa queda como alternativa pendiente. Descripción de `confirmHighDose` = guarda de tecleo.
- **A-03**: `DONE` solo si la ocurrencia ≤ ahora + `CARE_LOG_EARLY_TOLERANCE_MINUTES`; `SKIPPED` anticipado rechazado; 422 `ERR-CAR12-OUT-OF-WINDOW`, todos los roles. La tolerancia de 15 min es el valor de trabajo que propuso Maggie (la única cifra que entra en 0.1.1; marcada de trabajo, validación veterinaria).
- **A-04**: `effectiveFrom`/`effectiveTo` pasan a `date-time` (vigencia por instante); la ocurrencia pertenece a la versión que cubre su instante; `doseAmountAtTime`/`doseUnitAtTime` salen de esa versión, no de la vigente al registrar; desactivar a las 15:00 no cancela la toma de las 08:00.
- **A-05**: `+seriesId` en `CareRoutine` (obligatorio); UNIQUE parcial `(series_id, occurrence_date, occurrence_time) WHERE reverted_at IS NULL`. Nota para T1652: la migración debe prever la columna de serie.
- **M-02** y **T-C1**: mismo autor, mismo estado = 200; estado distinto = 409 `ERR-CAR12-ALREADY-LOGGED` (revertir y volver a registrar).
- **M-04** (H-C4): `SKIPPED` en MEDICATION exige `note` 1–140; `late` también para omisiones; la omisión de MEDICATION se muestra al propietario como toma omitida sin push; MEAL/WALK/OTHER `note` opcional; `BASIC_LOG` puede `SKIPPED`.
- **M-05**: ventana de 24 h igual para todos los roles, contada desde el instante de la ocurrencia hasta el reloj del servidor, sin excepción por rol.
- **M-06**: la reversión sale del tope de escritura de registros (cubo propio o exención, sin cifras); 429 con `Retry-After` declarado en el OpenAPI.
- **B-01**: `CareRoutineList.items.maxItems` = 100.

**Trinity (contrato)**
- **T-C2**: la fila de nivel se borra/invalida en la misma transacción al salir el cuidador, cambiar de rol o desasignarse la mascota; reinvitar no revive niveles.
- **T-C3**: `careUntil` **inclusivo** (vigente mientras hoy en America/Bogota ≤ `careUntil`; deja de aplicar a las 00:00 de Bogotá del día siguiente), reloj del servidor. Es una elección mía a falta de decisión: Neo puede cambiarla a exclusiva.
- **T-C4**: orden explícito en `revertCareLogEntry` (potestad 403 antes de 404 de entrada y de la idempotencia 200) y en `setCaregiverAccess` (404 destino antes de 409/422); `routineId` ajeno = mismo 422 que inexistente.
- **T-C7**: cursor atado a petId, filtros y rol (422 uniforme si no coincide); `routineId` ajeno = 200 con `items` vacíos; `includeReverted` de no titulares se ignora en silencio.
- **T-C9**: auditoría interna de grant/cambio/retiro y de reversión; `revertedByDisplayName` y `revertReason` (nulables, no obligatorios) solo para titulares con `includeReverted`.
- **T-C12**: `CaregiverAccessList` aclarada: solo filas; el cuidador sin fila se ve en la lista de miembros del hogar (002) y se le concede con PUT. Sin cambio de esquema.
- **T-C13**: `Cache-Control: private, no-store` y `Vary: Cookie` declarados para todas las respuestas autenticadas y definidos como `components.headers`. No añadí `$ref` en cada respuesta individual.

## 3. Pendientes de Neo (NO decididos)
- **H-C1**: cifras de `CARE_LOG_WRITES_PER_USER_PER_HOUR` (120/h) y `CARE_ROUTINE_WRITES_PER_USER_PER_HOUR` (60/h) y del cubo de reversión: el contrato ya no las fija, quedan marcadas «PENDIENTE DE NEO».
- **H-C2**: se mantiene `ERR-PET-VERSION-CONFLICT`; la alternativa `ERR-CAR12-ROUTINE-STALE` (enmienda MINOR del catálogo) marcada como pendiente. En ambos casos la UI recarga la rutina y avisa de revisar dosis (requisito de Maggie).
- **H-C3 con M-01 y M-03**: la matriz del OpenAPI sigue diciendo que ADMIN «administra niveles», contradiciendo las operaciones de niveles (solo propietarios); también sigue abierto si ADMIN define MEDICATION. Ambas marcadas como pendientes en el texto, sin cambiar la regla.
- **T-C5**: si `MEMBER`/`READER` ven rutinas (y `criticalAllergies`, T-C15). Anotado, sin tabla rol×operación.
- **T-C3** (inclusivo/exclusivo) queda como elección del Architect, revisable por Neo.

## 4. Sin cubrir en 0.1.1 (para el seguimiento)
- `CarePendingToday.items.maxItems` sigue en 720 (Maggie sugirió 120); no estaba en el alcance.
- Fuera de alcance de contrato y no tocados: T-C6, T-C8, T-C10, T-C11, T-C14, T-C15. `T1660` (`DEUDA-012-VALIDACION-VET-UMBRALES`) sigue abierta y debe incluir IU, umbrales por especie y la tolerancia de 15 min.
- Las pruebas rojas (T1654) y las migraciones (T1652) deben incorporar `series_id`, `revertedBy`, `revert_reason` y la auditoría.

## 5. Compuertas
- `bash scripts/verify-traceability.sh --feature 012`: **rc=0** (CUMPLE; 298/298 IDs de la 012 mapeados).
- `bash scripts/verify-oracles.sh`: **rc=0** (CUMPLE; 0 oráculos débiles; no apareció el fallo ajeno de `h01-admin-audit-metadata-012.spec.ts`).
- JSON de los tres esquemas y YAML del OpenAPI parsean sin error.
