# Mapeo de firmas de checklists a ítems CHK###

**Fecha:** 2026-11-09 · **Estado:** `REVIEW` (pendiente de validación del Auditor)

Propósito: demostrar que cada ítem `CHK###` conserva el número, estado y criterio del ítem anterior de la tabla firmada. Los hashes son del archivo firmado en su último commit de firma humana. Verificación de texto hecha por el Reconstructor, contra HEAD: en `code-review` y `oracle-validation`, el criterio y la evidencia de cada ítem anterior están completos dentro de su `CHK###`; en `spec-review`, el texto de cada ítem es idéntico tras normalizar formato, salvo el prefijo `CHK###`. La validación final la hace el Auditor.

## code-review

Firma previa: commit `e54b9de`, SHA-256 del archivo firmado `df463142b2113493793e1ac0cbd1867eafef1ef1b3af6d34e6044f51d12a7b95`.

| CHK | Ítem anterior | Estado anterior | Estado nuevo | Coincide |
|---|---|---|---|---|
| CHK001 | 1 | [x] | [x] | sí |
| CHK002 | 2 | [x] | [x] | sí |
| CHK003 | 3 | [x] | [x] | sí |
| CHK004 | 4 | [x] | [x] | sí |
| CHK005 | 5 | [x] | [x] | sí |
| CHK006 | 6 | [x] | [x] | sí |
| CHK007 | 7 | [x] | [x] | sí |
| CHK008 | 8 | [x] | [x] | sí |
| CHK009 | 9 | [ ] | [ ] | sí |
| CHK010 | 10 | [x] | [x] | sí |

Ítems nuevos sin fila anterior: ninguno.

## oracle-validation

Firma previa: commit `76a31bf`, SHA-256 del archivo firmado `1f102790dc8558f700da83e53daccdb4ff60df006bbe8617aa259a026e05e7b6`.

| CHK | Ítem anterior | Estado anterior | Estado nuevo | Coincide |
|---|---|---|---|---|
| CHK001 | 1 | [x] | [x] | sí |
| CHK002 | 2 | [x] | [x] | sí |
| CHK003 | 3 | [x] | [x] | sí |
| CHK004 | 4 | [x] | [x] | sí |
| CHK005 | 5 | [x] | [x] | sí |
| CHK006 | 6 | [x] | [x] | sí |
| CHK007 | 7 | [x] | [x] | sí |
| CHK008 | 8 | [x] | [x] | sí |

Ítems nuevos sin fila anterior: ninguno.

## Notas

- `spec-review.md` tiene mapeo propio más abajo (13 ítems, todos coinciden en estado con HEAD).
- `requirements.md` es nuevo y no tiene firma previa.

## spec-review

Firma previa: versión HEAD del archivo (último cambio en commit `b38fa48`), SHA-256 `7e5069011131631638859f6a054e96f1b1cc2cf42d7aad7e790e18305a0f43fb`. El campo `human_signature` de HEAD registraba 2026-11-05, pero su nota indicaba que no había firma confirmada. En la versión de trabajo el campo queda como «pendiente de confirmación de Andrés»; la firma no se da por válida hasta que él la confirme.

| CHK | Ítem anterior | Estado anterior | Estado nuevo | Coincide |
|---|---|---|---|---|
| CHK001 | 1. Cero prosa abierta o subjetiva | [x] | [x] | sí |
| CHK002 | 2. Identificadores inmutables de trazabilidad | [x] | [x] | sí |
| CHK003 | 3. Clausura de contratos de datos | [x] | [x] | sí |
| CHK004 | 4. Modelado formal de estados | [x] | [x] | sí |
| CHK005 | 5. Taxonomía exhaustiva de errores | [x] | [x] | sí |
| CHK006 | 6. Aislamiento de entropía especificado | [x] | [x] | sí |
| CHK007 | 7. Seguridad y autorización especificadas | [x] | [x] | sí |
| CHK008 | 8. Migración para cambios MAJOR | [x] | [x] | sí |
| CHK009 | i. D-106-6 coincide con `householdView` | [x] | [x] | sí |
| CHK010 | ii. D-107-2 coincide con `assertDomainRules` | [x] | [x] | sí |
| CHK011 | iii. Sin cambios en contratos ni en `src/` | [x] | [x] | sí |
| CHK012 | iv. Cabecera e historial | [ ] | [ ] | sí |
| CHK013 | iv. Cabecera e historial | [x] | [x] | sí |

Ítems HEAD: 13; ítems CHK: 13. Todas las coincidencias de estado: sí.
