---
document_id: CHECKLIST-SPEC-REVIEW
version: 2.3.0
status: REVIEW
applies_to: SPEC-ARGOS-001 v2.2.0 (revisión 2 de contratos, rama spec/v2.2.0-review)
approved_by: Andrés Vallejo, 2026-11-05 (en frontmatter de la spec)
audited_by: Auditor SDD — 2026-11-05. Re-auditoría de la revisión 2 verificada en disco: criterios 1 a 8 cumplidos. Pendiente solo la firma humana en human_signature.
human_signature: Andres Vallejo 
note: v2.3.0 (2026-11-09): migrado a la plantilla `checklist-template.md` de GitHub Spec Kit; se añade un `CHK###` a cada ítem sin cambiar su texto, estado ni firmas. Requiere revalidación del Auditor. Nota anterior: Las marcas `[x]` de v2.1.0 fueron eliminadas (H-13). v2.1.0 quedó firmada en 42e9f0d. Este checklist no registra firma humana hasta que Andrés la confirme.
---

# Spec Review Checklist: Argos Pet Health & Biometric Tracker

**Purpose**: Compuerta de la Fase 1 a la Fase 2. Ninguna especificación en `specs/<NNN-feature>/spec.md` puede pasar a `APPROVED` ni habilitar el diseño en `specs/<NNN-feature>/plan.md` sin cumplir el 100 % de estos criterios deterministas.

**Created**: 2026-11-05

**Feature**: [spec.md](../spec.md) (SPEC-ARGOS-001)

**Note**: Título anterior: «Checklist de Compuerta Fase 1 -> Fase 2: Revisión de Especificación (`spec-review.md`)». Las secciones siguientes son auditorías firmadas de versiones concretas de la spec, identificadas por hash; las rutas `.specify/specs/pet-health-tracker.md` que citan son las del archivo auditado en esa fecha (hoy `specs/001-pet-health-tracker/spec.md`). El ítem CHK012 quedó `[ ]` en la auditoría de v2.2.1 y fue resuelto por CHK013 en el addendum del mismo día; se conserva sin marcar porque es el registro del Auditor. La re-auditoría anterior de v2.2.0 (no apta) está en `.specify/memory/audits/spec-review-v2.2.0-auditor-r2.md`. La spec v2.4.0 no tiene todavía auditoría propia.

**Review Ownership**: Checklist de compuerta propiedad del revisor. Un ítem se marca `[x]` solo cuando existe evidencia verificable y, donde aplica, firma humana.

**Marker Semantics**: `[x]` significa que el criterio fue revisado y cumplido. `[ ]` significa pendiente, en revisión o aceptado como deuda abierta; `/speckit.implement` lee estas casillas como compuerta y no debe modificarlas.

## Auditoría de `SPEC-ARGOS-001` v2.2.0, revisión 2

- [x] CHK001 **1. Cero prosa abierta o subjetiva.** Umbrales numéricos sin cambios frente a v2.1.0. `INV-AUTH-006` sin umbral temporal (D-02). *Verificado en disco.*
- [x] CHK002 **2. Identificadores inmutables de trazabilidad.** Sin altas ni bajas de IDs REQ/INV/STATE. Nuevo `INV-AUTH-007` (CSRF). *Verificado en disco.*
- [x] CHK003 **3. Clausura de contratos de datos.** Dos evidencias, con su origen:
  - *Metaesquema 2020-12:* salida aportada por el Arquitecto, `jsonschema 4.26.0`, `Draft202012Validator.check_schema` sobre los cinco esquemas de `contracts/schemas/`: OK en `backup-envelope`, `common`, `identity`, `medical-records` y `pet`. El Auditor verificó en disco que los hashes SHA-256 (primeros 16 caracteres) coinciden con los archivos evaluados: `7155767b901ee176`, `e3f8ab6ee919bd02`, `77b31916d0241d2e`, `0f89627497f56641`, `842225c18d6d544c`. Los esquemas no tienen cambios respecto al último commit.
  - *Recorrido de `additionalProperties`:* verificado en disco por el Auditor. Ningún objeto con `properties` carece de `additionalProperties: false` (0 casos).
- [x] CHK004 **4. Modelado formal de estados.** Verificado en disco: ningún estado `"type": "final"` con transiciones salientes en `auth-session` y `household-membership`. Los únicos `final` son `COMPLETED` y `ROLLED_BACK` en `backup-import`, sin salidas. La spec §4 (líneas 143–144) describe las mismas transiciones. `ROLLBACK_FAILED` aparece como clave en `backup-import.machine.json` (línea 103), fuera de `states`; no es un estado, y su `finalState: UNKNOWN` está admitido en `common.schema.json`.
- [x] CHK005 **5. Taxonomía exhaustiva de errores.** Catálogo y spec §5 coinciden. `CONST-6.3` ya no aparece en `.specify` ni en `contracts`. `ERR-PET-FUTURE-BIRTHDATE` está trazado en TASK-104. Verificado en disco.
- [x] CHK006 **6. Aislamiento de entropía especificado.** Constitución §3 sin cambios desde v2.1.0; puertos y `APP_TIMEZONE` presentes. *Verificado por diff.*
- [x] CHK007 **7. Seguridad y autorización especificadas.** `INV-AUTH-007` aparece en spec §3 (línea 125) y §5.1 (línea 185), en el catálogo (`ERR-AUTH-CSRF-REJECTED.invariantRef`, línea 93) y en EDGE-018 (línea 613). Constitución §4 (línea 71) lo cubre por rango `INV-AUTH-001..007`, sin ID explícito. Verificado en disco.
- [x] CHK008 **8. Migración para cambios MAJOR.** El fixture `validLegacyBackupEnvelopeV1` pasa contra `BackupEnvelopeV1Legacy` con 0 errores, y un campo extra sí se rechaza (control negativo). Validación hecha con draft-07 por el Auditor; la confirmación 2020-12 queda cubierta por el criterio 3.

**Resultado:** 8 de 8 criterios cumplidos. La spec queda lista para `APPROVED` en cuanto Andrés confirme la firma en `human_signature`. Este checklist no firma por Andrés.

## Auditoría de `SPEC-ARGOS-001` v2.2.1 (PATCH), veredicto del Auditor 2026-11-06

Spec verificada en disco: `.specify/specs/pet-health-tracker.md`, SHA-256 `8c264a03072f3d443a6caf4c6ed59e93b1e5e2cf9a45cdd276e36f5c6ec88825`, sin commit (`M` frente a HEAD `56f0ac6`).

- [x] CHK009 **i. D-106-6 coincide con `householdView`.** `members` = `ACTIVE` ordenados por `firstJoinedAt` ASC, `userId` ASC; después, solo para el OWNER, `INVITED` por `invitedAt` ASC, `userId` ASC. *Verificado en `src/domain/households/household-policies.ts`, líneas 336–362 y 301–305.*
- [x] CHK010 **ii. D-107-2 coincide con `assertDomainRules`.** Orden: (a) decimales, (b) ventana temporal, (c) fecha siguiente. *Verificado en `src/domain/records/record-invariants.ts`, líneas 183–198.*
- [x] CHK011 **iii. Sin cambios en contratos ni en `src/`.** `git diff --stat HEAD -- contracts src tests scripts` vacío. El único archivo modificado es la spec.
- [ ] CHK012 **iv. Cabecera e historial.** El historial (fila v2.2.1) y el front matter (`version: 2.2.1`, `status: REVIEW`, `change_type: PATCH`, `supersedes: 2.2.0`) son correctos. **Pendiente: la línea 24 sigue diciendo `(v2.2.0)` en el título.** El Arquitecto la corrige a `(v2.2.1)` antes de pasar a `APPROVED`. Falta además una justificación SemVer para 2.2.1, opcional.

**Veredicto: 3 de 4 criterios cumplidos. Corrección menor pendiente en la línea 24.** Tras corregirla, el Auditor vuelve a verificar el hash. Esta sección no firma ni aprueba nada: el paso a `APPROVED` lo decide el Arquitecto.

### Addendum del Auditor, 2026-11-06 (hash nuevo)

Spec verificada en disco: SHA-256 `1dc7d096d5d353fea8999d1dc090ea4b4fad56fd76c0cd6ce0921ea20bab26d7`. El cambio desde la versión anterior (`8c264a03…`) es solo la línea 24: `(v2.2.0)` → `(v2.2.1)`. Diff frente a HEAD: 9 inserciones, 8 eliminaciones, con los mismos hunks que antes más el de la línea 24. `contracts/`, `src/`, `tests/` y `scripts/` sin cambios.

- [x] CHK013 **iv. Cabecera e historial.** Corregido. Título, front matter e historial coherentes con 2.2.1.

**Veredicto: 4 de 4 criterios cumplidos** para el hash `1dc7d096…`. Esta sección no aprueba: el paso a `APPROVED` lo decide el Arquitecto.

### Addendum del Auditor, 2026-11-06 (hash final, APPROVED)

Spec verificada en disco: SHA-256 `135a67c72dccbe5338ae4c672a109c5d886251daada4ec1e24bd98543bbfad29`. Respecto del hash validado `1dc7d096…`, solo cambian el front matter (`status` y `approved_by`). El cuerpo es idéntico: título (línea 24), historial, `INV-HOUSE-004`, §5.1 punto 5 y resto del contenido. Diff frente a HEAD: 8 inserciones, 7 eliminaciones. `status: APPROVED` coincide con HEAD; el cambio de estado respecto a la versión de trabajo es lo que hizo el Arquitecto.

**Veredicto final: 4 de 4 criterios cumplidos** para el hash `135a67c7…`. El paso a `APPROVED` lo ejecuta el Arquitecto; el Auditor no aprueba.
