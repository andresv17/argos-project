# DEUDA-012-VALIDACION-VET-UMBRALES

- **Registrada**: 2026-11-27, `/architect` (T1660, Feature 012, Bloque C, `[GH:#26]`). Estado: **ABIERTA**. Decide el cierre: Neo (Nivel 2). Ningún agente la da por cerrada.
- **Qué es**: validación por un **veterinario colegiado humano** (no por agentes) de las cifras clínicas de captura del Modo Cuidador. Hoy son valores de trabajo; ARGOS solo registra lo que escribe el propietario y no calcula ni verifica dosis, ni interacciones, ni da consejo clínico (`REQ-CAR12-008`).
- **Dónde viven hoy las cifras**: `specs/012-multiduenio-microchip-cuidador/contracts/schemas/care-routine.schema.json` (`DOSE_CONFIRM_THRESHOLDS`, `DoseUnit`) y `care-log-entry.schema.json` (`CARE_LOG_EARLY_TOLERANCE_MINUTES`). Versión de los contratos: `0.1.2` (`DRAFT`).

## Qué debe validar el veterinario

1. **IU (unidades internacionales, insulina; `A-01` de `/maggie`)**: paso permitido (hoy decimal > 0 con hasta 3 decimales) y umbral de confirmación (hoy `null`, sin cifra). Sin validación, la guarda numérica de IU no se aplica y la interfaz no afirma que la dosis sea segura.
2. **Umbrales de confirmación por especie (`A-02`)**: `confirmHighDose = true` exigido si la dosis por toma supera el umbral del grupo y la unidad. Valores de trabajo heredados, solo `CANINE_FELINE`: `MG` 500, `MCG` 500, `ML` 20, `TABLET` 4, `DROP` 10, `IU` `null`. **Todo `OTHER_SPECIES` (conejo, hurón, ave, reptil, pequeño mamífero, otras) está en `null`: sin cifra.** Debe fijarse, o descartarse a favor de una guarda relativa (confirmar si la dosis nueva difiere de la versión anterior más de un factor).
3. **Tolerancia de 15 min para registrar `DONE` anticipado (`A-03`; `CARE_LOG_EARLY_TOLERANCE_MINUTES = 15`)**: valor de trabajo propuesto por `/maggie`. Validar si 15 min es clínicamente razonable para medicación (y si debe variar por clase: `MEDICATION` frente a `MEAL`/`WALK`).
4. **`TABLET` y fracciones (`B-02`)**: solo múltiplos de 0,25 con mínimo 0,25; `0,125` se rechaza. Validar si algún fármaco exige octavos.

## Ya resuelto (no es parte de la deuda)

- **Dictamen sobre quién puede `SKIPPED` (`EDGE-012-048`, `H-C4`)**: **ya emitido por `/maggie`** (acta `.specify/memory/audits/maggie-012-bloqueC-T1651-2026-11-27.md`, §2.6): `BASIC_LOG` puede marcar `SKIPPED` (ocultar una omisión es más peligroso que registrarla); en `MEDICATION` exige `note` (1–140), también marca `late` y la omisión se muestra al propietario como toma omitida (sin notificación push); en `MEAL`/`WALK`/`OTHER` la `note` es opcional. Los titulares (propietario principal y co-propietario `ACTIVE`) marcan `SKIPPED` con la misma exigencia. Aplicado en los contratos desde `0.1.1`. Esto cierra la parte de `EDGE-012-048` de `T1660`; **no** cierra la validación veterinaria de arriba.

## Condición

- No bloquea el merge del código con valores de trabajo, pero **ningún texto de la interfaz ni de marketing puede presentar estas cifras como validadas ni como límite clínico** mientras la deuda siga abierta.
- Pendiente de Neo: designar o contratar al veterinario colegiado y entregar cifras definitivas; con ellas, `/architect` abre una enmienda MINOR de `care-routine.schema.json` y `/keymaker` actualiza `feature-012-limits.ts`.
