# Enmienda del Principio III de la constitución — Feature 002 (BORRADOR)

**BORRADOR PENDIENTE DE FIRMA NIVEL 2 de Neo**

Autor: `/architect` (F6) · Fecha: 2026-11-10 · Autorizado por Neo para preparar, **no para aplicar**.
Este documento no modifica `.specify/memory/constitution.md`. Hasta que Neo firme, la constitución vigente es la 3.1.0.
Relación: continúa el follow-up de la enmienda 3.1.0 («los identificadores de la 002 se incorporan al principio III cuando existan sus contratos»). La enmienda anterior (`enmienda-constitucion-002-borrador.md`) no tocó el principio III.

---

## 1. Texto actual del Principio III (constitución 3.1.0)

> ### III. Trazabilidad Verificable por Máquina
>
> Fuente de verdad de los identificadores: `specs/001-pet-health-tracker/spec.md`, los contratos de `specs/001-pet-health-tracker/contracts/` y los `INV-ARCH-*` del principio II.
>
> - **Requisitos:** `REQ-AUTH-001`..`004`, `REQ-PET-001`..`005`, `REQ-REC-001`..`006`, `REQ-HOUSE-001`..`005`, `REQ-UI-001`..`007`, `REQ-BACKUP-001`..`002`.
> - **Invariantes:** `INV-PET-002`, `INV-PET-003`, `INV-PET-005`, `INV-PET-006`, `INV-OWN-001`, `INV-ACC-001`, `INV-ACC-002`, `INV-AUTH-001`..`007`, `INV-HOUSE-001`..`005`, `INV-REC-001`..`006`, `INV-SORT-001`, `INV-BACKUP-001`, `INV-ARCH-001`..`006`.
> - **Máquinas de Estado:** `STATE-ALERT-001`, `STATE-BACKUP-001`, `STATE-AUTH-SESSION-001`, `STATE-HOUSE-MEMBERSHIP-001`.
> - **Errores:** todos los códigos de `specs/001-pet-health-tracker/contracts/errors/error-catalog.json`.
> - **IDs retirados (no deben aparecer en código nuevo):** `INV-PET-001`, `INV-PET-004`, `STATE-PET-QUOTA-001`, `ERR-PET-QUOTA-EXCEEDED`.
>
> Cada función o clase de `src/` incluye en su JSDoc los identificadores que implementa (`@implements ...`), y cada `it`/`test` de `tests/` incluye entre corchetes el identificador que verifica. La trazabilidad cuenta como cumplida **solo** si el identificador aparece en un `@implements` de `src/` fuera de `src/generated/` **y** en el título de un `it`/`test` de `tests/`.
>
> **Rationale**: permite auditar por script, sin interpretación, que lo especificado está implementado y probado.

---

## 2. Texto propuesto

Se conserva íntegro lo de la Feature 001 (la 001 está aprobada y su compuerta sigue corriendo) y se añade la Feature 002. Solo entran los identificadores de `specs/002-plataforma-v21/spec.md` (APPROVED, 2026-11-10) y los tres identificadores que Neo aprobó (`STATE-ACCOUNT-DELETE-001`, `ERR-PET-MICROCHIP-DUPLICATE`, `ERR-RATE-LIMITED`). Ningún otro ID nuevo.

> ### III. Trazabilidad Verificable por Máquina
>
> Fuente de verdad de los identificadores, por feature: Feature 001: `specs/001-pet-health-tracker/spec.md` y los contratos de `specs/001-pet-health-tracker/contracts/`. Feature 002: `specs/002-plataforma-v21/spec.md` y los contratos de `specs/002-plataforma-v21/contracts/`. Común a ambas: los `INV-ARCH-*` del principio II. La compuerta se ejecuta por feature (`scripts/verify-traceability.sh --feature 001|002`); un identificador que una feature declara «reemplazado» deja de ser vigente para esa feature y sigue vigente para la anterior mientras esta se mantenga en la compuerta.
>
> **Feature 001**
>
> - **Requisitos:** `REQ-AUTH-001`..`004`, `REQ-PET-001`..`005`, `REQ-REC-001`..`006`, `REQ-HOUSE-001`..`005`, `REQ-UI-001`..`007`, `REQ-BACKUP-001`..`002`.
> - **Invariantes:** `INV-PET-002`, `INV-PET-003`, `INV-PET-005`, `INV-PET-006`, `INV-OWN-001`, `INV-ACC-001`, `INV-ACC-002`, `INV-AUTH-001`..`007`, `INV-HOUSE-001`..`005`, `INV-REC-001`..`006`, `INV-SORT-001`, `INV-BACKUP-001`, `INV-ARCH-001`..`006`.
> - **Máquinas de Estado:** `STATE-ALERT-001`, `STATE-BACKUP-001`, `STATE-AUTH-SESSION-001`, `STATE-HOUSE-MEMBERSHIP-001`.
> - **Errores:** todos los códigos de `specs/001-pet-health-tracker/contracts/errors/error-catalog.json`.
>
> **Feature 002**
>
> - **Requisitos nuevos o que reemplazan:** `REQ-AUTH2-001`..`003`, `REQ-ACC-001`, `REQ-ACC-002`, `REQ-TIME-001`, `REQ-PET2-001`..`003`, `REQ-OWN-001`, `REQ-REC2-001`..`003`, `REQ-RBAC-001`, `REQ-HOUSE2-001`..`004`, `REQ-MIG-001`, `REQ-AUD-001`, `REQ-BACKUP2-001`..`002`, `REQ-UI2-001`..`008`.
> - **Requisitos de la 001 que siguen vigentes:** `REQ-AUTH-003`, `REQ-AUTH-004`, `REQ-PET-002`, `REQ-PET-004`, `REQ-REC-002`, `REQ-REC-005`, `REQ-REC-006`, `REQ-HOUSE-001`, `REQ-HOUSE-003`, `REQ-UI-001`, `REQ-UI-002`, `REQ-UI-003`, `REQ-UI-005`.
> - **Invariantes nuevas o que reemplazan:** `INV-AUTH2-001`, `INV-AUTH2-002`, `INV-PET2-001`, `INV-REC2-002`, `INV-OWN2-001`, `INV-ACC2-001`, `INV-ACC2-002`, `INV-HOUSE2-001`, `INV-AUD-001`.
> - **Invariantes de la 001 que siguen vigentes:** `INV-AUTH-001`, `INV-AUTH-003`, `INV-AUTH-005`, `INV-AUTH-006`, `INV-AUTH-007`, `INV-PET-002`, `INV-PET-003`, `INV-PET-005`, `INV-PET-006`, `INV-HOUSE-003`, `INV-HOUSE-004`, `INV-HOUSE-005`, `INV-REC-001`, `INV-REC-003`, `INV-REC-004`, `INV-REC-005`, `INV-REC-006`, `INV-SORT-001`, `INV-BACKUP-001`, `INV-ARCH-001`..`006`.
> - **Máquinas de Estado:** `STATE-AUTH-SESSION-001` (v3.0.0), `STATE-HOUSE-MEMBERSHIP-001` (v3.0.0), `STATE-ALERT-001` (v2.1.0), `STATE-BACKUP-001` (v2.3.0) y `STATE-ACCOUNT-DELETE-001` (nueva, aprobada por Neo).
> - **Errores:** todos los códigos de `specs/002-plataforma-v21/contracts/errors/error-catalog.json` (35 entradas). Entran 7 códigos nuevos: `ERR-ACCOUNT-CONFIRMATION-MISMATCH`, `ERR-ACCOUNT-OWNS-SHARED-HOUSEHOLD`, `ERR-ACCOUNT-OWNS-SHARED-PETS`, `ERR-OWN-TRANSFER-INVALID-TARGET`, `ERR-REC-SUPERSEDED-IMMUTABLE` y los dos aprobados por Neo, `ERR-PET-MICROCHIP-DUPLICATE` y `ERR-RATE-LIMITED`.
> - **IDs reemplazados por la 002 (vigentes solo para la compuerta de la 001):** `REQ-AUTH-001`, `REQ-AUTH-002`, `REQ-PET-001`, `REQ-PET-003`, `REQ-PET-005`, `REQ-REC-001`, `REQ-REC-003`, `REQ-REC-004`, `REQ-HOUSE-002`, `REQ-HOUSE-004`, `REQ-HOUSE-005`, `REQ-BACKUP-001`, `REQ-BACKUP-002`, `REQ-UI-004`, `REQ-UI-006`, `REQ-UI-007`, `INV-AUTH-002`, `INV-AUTH-004`, `INV-REC-002`, `INV-OWN-001`, `INV-ACC-001`, `INV-ACC-002`, `INV-HOUSE-001` e `INV-HOUSE-002` (esta última absorbida por `REQ-HOUSE2-001` y `REQ-HOUSE2-002`).
>
> - **IDs retirados (no deben aparecer en código nuevo):** `INV-PET-001`, `INV-PET-004`, `STATE-PET-QUOTA-001`, `ERR-PET-QUOTA-EXCEEDED`. Se añaden, con efecto desde que el código de la 001 los deje de usar (tarea T220 de la 002): `ERR-AUTH-USER-NOT-FOUND` y `ERR-HOUSE-MEMBER-ALREADY-EXISTS`, retirados del catálogo de la 002 porque invitar es uniforme.
>
> Cada función o clase de `src/` incluye en su JSDoc los identificadores que implementa (`@implements ...`), y cada `it`/`test` de `tests/` incluye entre corchetes el identificador que verifica. La trazabilidad cuenta como cumplida **solo** si el identificador aparece en un `@implements` de `src/` fuera de `src/generated/` **y** en el título de un `it`/`test` de `tests/`. Los `SC-*` de una spec son criterios de aceptación: se citan en `tasks.md` y se revisan a mano, el script no los exige.
>
> **Rationale**: permite auditar por script, sin interpretación, que lo especificado está implementado y probado, ahora para las dos features con una sola fuente de reglas.

---

## 3. Versión propuesta: 3.1.0 -> 3.2.0 (MINOR)

Justificación, según la regla de versionado de la propia constitución (MINOR para un principio o una sección nuevos; MAJOR para un cambio incompatible o la retirada o redefinición de un principio):

1. **No retira ni redefine el principio III.** La regla central (un ID cuenta solo con `@implements` en `src/` y título de prueba en `tests/`) no cambia; el umbral del principio IV (100 % de IDs vigentes) tampoco.
2. **Añade contenido nuevo:** una fuente de verdad por feature, los identificadores de la 002, el catálogo de errores de la 002 y la lista de IDs reemplazados. Es ampliación de alcance, no cambio incompatible: la compuerta de la 001 sigue dando el mismo resultado.
3. **No es PATCH**, porque no es una aclaración: introduce IDs vigentes nuevos que el Test Gate exige al 100 %.
4. Mismo criterio que la enmienda 3.0.0 -> 3.1.0 (MINOR por interpretación declarada, firmada por Neo). Si Neo considera que retirar dos códigos de error o declarar reemplazados 24 IDs es un cambio incompatible de gobernanza, la alternativa es MAJOR 4.0.0; este borrador recomienda MINOR porque los reemplazos viven en la feature nueva y la 001 conserva sus IDs.

Línea de versión propuesta: `**Version**: 3.2.0 | **Ratified**: 2026-11-05 | **Last Amended**: <fecha de la firma>`.

---

## 4. Efecto en herramientas y puntos de atención para Neo

1. **`scripts/verify-traceability.sh`** lee el principio III de la constitución para los IDs vigentes y toma como retirados los que sigan a la **primera línea que contenga la frase «IDs retirados»**. Consecuencias: (a) la cabecera «Sync Impact Report» de la enmienda no debe contener la frase literal «IDs retirados» (hallazgo ya registrado en la 3.1.0); (b) el formato del texto propuesto (subsecciones por feature) obliga a que T204 (F7) actualice el lector del script; hasta que ambos cambios estén, la compuerta de la 002 toma los IDs de `spec.md` y de los contratos.
2. **Orden recomendado**: Neo firma la enmienda antes de T306 (compuerta final de trazabilidad). La enmienda no debe aplicarse antes de que T204 adapte el script, o la compuerta de la 001 dejaría de leer su lista.
3. **Retiro de dos errores** (`ERR-AUTH-USER-NOT-FOUND`, `ERR-HOUSE-MEMBER-ALREADY-EXISTS`): mientras el código compartido de `src/` los use (rama 001), declararlos retirados haría fallar la compuerta final de la 001. Por eso el borrador los retira con efecto tras T220; Neo puede preferir dejarlos fuera de la enmienda y retirarlos en otra posterior.
4. **Los tres IDs aprobados** (`STATE-ACCOUNT-DELETE-001`, `ERR-PET-MICROCHIP-DUPLICATE`, `ERR-RATE-LIMITED`) entran como oficiales solo con esta firma; hasta entonces el plan y los contratos los marcan como pendientes.
5. **Sin efecto sobre el resto**: ningún otro principio cambia; `spec-system.md` (LOCKED) y las plantillas no requieren cambio por esta enmienda. Si Neo lo pide, el Sync Impact Report 3.2.0 lo confirma al aplicarla con `/speckit-constitution`.

---

DE: Architect (Arquitecto SDD)
PARA: Neo (Andrés Vallejo — Nivel 2)
ESTADO: Validación requerida
DETALLE: borrador de la enmienda del principio III. No aplicado. Constitución 3.1.0 intacta.
SIGUIENTE PASO RECOMENDADO: Neo decide MINOR 3.2.0 (recomendado) o MAJOR 4.0.0 y firma antes de T306; `/speckit-constitution` aplica la enmienda solo con esa firma.
