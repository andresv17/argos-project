# Rebanada 2 — Validación clínica de Maggie (T234, Feature 002)

- **Autora:** Maggie (Especialista Clínico Veterinario) · **Fecha:** 2026-11-11 · **Rama:** `002-plataforma-v21`
- **Despachada por:** Morpheus. Solo documentación; no modifica código, spec ni contratos. T234 sigue sin marcar `[x]`: solo Neo la marca.
- **Alcance leído en código:** `src/domain/pet/{species,estimated-age,pet-invariants}.ts`, `src/domain/records/weight-limits.ts`, `src/domain/records/record-invariants.ts`, `src/domain/alerts/sanitary-alert-evaluator.ts`, `src/application/use-cases/pet-use-cases.ts`, `src/presentation/web/view-model.ts`. Insumo previo: `.specify/memory/audits/f4-insumo-maggie-especies.md`.
- **Aviso:** esto no sustituye a un veterinario profesional. Los puntos que necesitan uno están en la sección 7.

## 1. Las 8 especies: cotas de peso (`INV-REC2-002`, decisiones 7B y M1)

La tabla del código (`SPECIES_WEIGHT_LIMITS`, `weight-limits.ts` líneas 29-40) coincide con la que propuse en F4.

| Especie | Mínimo (kg) | Máximo (kg) | Decimales | Estado de la cota |
|---|---|---|---|---|
| `CANINE` | 0.05 | 150.00 | 2 | **Validada** (regla de captura heredada de la 001; `maxIsProvisional: false`) |
| `FELINE` | 0.05 | 150.00 | 2 | **Validada** (igual) |
| `RABBIT` | 0.001 | 150.000 | 3 | Mínimo y decimales decididos (7B); máximo **provisional** (M1) |
| `FERRET` | 0.001 | 150.000 | 3 | Igual |
| `BIRD` | 0.001 | 150.000 | 3 | Igual |
| `REPTILE` | 0.001 | 150.000 | 3 | Igual |
| `SMALL_MAMMAL` | 0.001 | 150.000 | 3 | Igual |
| `OTHER` | 0.001 | 150.000 | 3 | Igual |

- Las seis especies pequeñas comparten la constante `SMALL_SPECIES` con `maxIsProvisional: true` (línea 28).
- La cota de 150 kg es de **plausibilidad de captura** (evitar tecleos como 1500), no un límite clínico ni un peso sano. Sigue **provisional, a validar** por un veterinario (P-1, P-2).
- `assertWeightWithinSpeciesLimits` (línea 59) rechaza fuera de rango, exceso de decimales o valor no finito con `ERR-REC-WEIGHT-OUT-OF-RANGE`; no emite ningún juicio sobre el peso. La conversión usa gramos enteros, sin multiplicar flotantes.
- Resumen: **2 validadas, 6 provisionales** (en la cota máxima).

## 2. Sin alertas automáticas de peso ni de edad: CONFIRMADO

Comprobado leyendo el código, no supuesto:

- `weight-limits.ts` solo exporta la tabla y funciones de conversión y validación (`weightKgToGrams`, `gramsToKg`, `assertWeightWithinSpeciesLimits`). No hay ninguna función que devuelva una alerta, un estado, una etiqueta ni una comparación contra un peso de referencia. Su cabecera (línea 7) lo declara.
- `species.ts` solo contiene `SPECIES`, `isOtherSpecies`, `speciesFilterGroup` y `assertSpeciesConsistency`. Ninguna decide nada clínico (cabecera, línea 5).
- `estimated-age.ts` solo convierte años y meses aproximados a `birthDate`. No evalúa umbrales de edad.
- `sanitary-alert-evaluator.ts` (única lógica de alertas del sistema) evalúa **solo** las próximas fechas que el usuario registra en vacunas (`nextBoosterAt`) y desparasitaciones (`nextSuggestedDoseAt`). Sus cuatro estados (`SUPERSEDED`, `OVERDUE`, `DUE_SOON`, `UP_TO_DATE`) dependen de `daysRemaining` y de `hasNewerRecordOfSameKey`, nunca de especie, peso o edad. `evaluateByKey` no recibe la especie.
- Búsqueda en `src/` (sin `src/generated/`) de `ideal`, `geriatric`, `sobrepeso`, `underweight`, `overweight`, `humanYears`, `años humanos`: ninguna coincidencia de lógica; solo los comentarios que declaran la ausencia.
- Resultado: **no hay alertas automáticas de peso ni de edad en ninguna de las 8 especies**, ni en perro y gato.

## 3. Edad solo en años reales (`REQ-PET-002`): CONFIRMADO

- `formatAge` (`view-model.ts` líneas 124-128) muestra `{years} año(s), {months} mes(es)` a partir de la `ComputedAge` que calcula la API. No aplica factores de equivalencia.
- `estimatedAgeToBirthDate` (`estimated-age.ts` línea 20) solo resta años y meses a la fecha de `ClockPort` y devuelve un `birthDate` ISO; la cabecera (línea 5) declara «años reales, sin años humanos equivalentes». `pet-invariants.ts` (líneas 153-157) exige `birthDateIsEstimate` verdadero y guarda ese `birthDate`. `estimatedAge` no produce ningún campo de años humanos.
- El tipo generado `ComputedAge` (`src/generated/schemas/types.ts`, línea 1430) repite que son años reales para las 8 especies.
- La fecha actual llega como argumento (`currentDate`, `command.today`); no hay `new Date()` ni `Date.now()` en `src/domain/` (comprobado con búsqueda).
- Recomendación abierta (no bloquea): rotular la edad como «aprox.» en la interfaz cuando `birthDateIsEstimate = true` (decisión de Sati y Zee).

## 4. ADR-002-15: registro sin próxima fecha seguido de otro de la misma clave

**Lo que dice el plan** (`plan.md` línea 101 y punto 11 de la línea 142): un registro sin próxima fecha y sin posterior de la misma clave queda fuera del semáforo (`alert: null`); si tiene un posterior de la misma clave queda `SUPERSEDED` (no `null`), inmutable, en el acordeón de reemplazados. Pendiente de validar por Maggie.

**Lo que hace el código** (`sanitary-alert-evaluator.ts`, `evaluateByKey`, líneas 89-103):
- Ordena con `sortHistoricalRecords` (INV-SORT-001) y recorre; la clave es `petId + normalizeVaccineKey(vaccineName)` en vacunas y `petId + dewormingType` en desparasitaciones.
- `hasNewer` es verdadero si ya se vio un registro de la misma clave.
- `alert = target === null && !hasNewer ? null : evaluateSanitaryAlertState(target ?? currentDate, ...)`. Con `hasNewer` verdadero, el guard `SUPERSEDED` va primero en `evaluationOrder` y gana, aunque la fecha sea nula. Con fecha nula y sin posterior, `alert` es `null`.
- `pet-use-cases.ts` (líneas 163-166) separa los `SUPERSEDED` en `supersededVaccinations` y `supersededDewormings`, y `summarizeSanitaryAlerts` no los cuenta.
- Conclusión: **la implementación hace lo que dice el plan.**

**Decisión de Maggie: ACEPTO**, con una condición de redacción y una nota abierta.
- Razón clínica: un registro más reciente de la misma vacuna o del mismo tipo de desparasitación significa que el animal volvió a recibir esa aplicación. El recordatorio anterior ya no representa la situación y mantenerlo vencido generaría una alarma falsa. Que el registro nuevo sin próxima fecha quede fuera del semáforo evita un falso «al día».
- Condición (interfaz, no cambia contrato): la fila del registro más reciente sin próxima fecha debe mostrarse **sin insignia** y con un texto neutro tipo «sin próxima fecha registrada». Nunca debe aparecer «al día».
- Nota abierta: si un animal tenía un `OVERDUE` y el cuidador registra una nueva aplicación sin próxima fecha, la alerta desaparece sin recordatorio posterior. Es coherente con la regla y con el principio de no inventar fechas, pero un veterinario puede preferir un aviso de «registre la próxima fecha». Va a P-5 (redacción del aviso), no cambia la decisión.
- El comentario `T255 PENDIENTE` en el evaluador (línea 99) se refiere a la inmutabilidad de reemplazados de REQ-REC2-002/003 (otra rebanada). No afecta a esta validación clínica.
- La clave de la vacuna es `vaccineName.trim().toLowerCase()`: «Rabia» y «Antirrábica» cuentan como vacunas distintas. Es correcto: el sistema no tiene catálogo clínico y no debe suponer equivalencias (ver P-4).

## 5. `OTHER` y `speciesOther`: CONFIRMADO

- `OTHER` usa `SMALL_SPECIES` (0.001 a 150.000 kg, 3 decimales, máximo provisional), igual que las otras cinco; el rango no depende de `speciesOther`.
- `speciesOther` (texto libre de 1 a 60 caracteres) es obligatorio solo con `OTHER` y nulo en las demás (`assertSpeciesConsistency`, `species.ts` líneas 40-48; `INV-PET2-001`). Es solo una etiqueta; no activa reglas clínicas.
- `speciesFilterGroup` agrupa `OTHER` junto con las otras cinco en `OTHERS` (filtro del listado). Es solo presentación.
- Sin alertas automáticas de peso ni de edad para `OTHER` (sección 2).

## 6. Lo que el sistema NO hace (las diez prohibiciones de F4, con su comprobación)

| N.º | El sistema NO... | Comprobación en el código |
|---|---|---|
| 1 | Diagnostica ni interpreta pesos o edades como enfermedad | No existe función que interprete peso o edad; `weight-limits.ts` solo valida rango. Hay un campo de texto libre `diagnosis` en el formulario de consultas (`presentation/web/records.ts`, línea 105): lo escribe el veterinario o el dueño, el sistema no lo genera ni lo interpreta |
| 2 | Prescribe ni recomienda medicamentos, dosis o productos | El evaluador solo compara fechas registradas; no hay catálogo ni sugerencias. `treatment` y `vaccineName` son texto libre del usuario |
| 3 | Sustituye la consulta veterinaria | Aviso de interfaz **aún no comprobado** en esta rebanada (el sistema no lo impide, pero no lo vi en el código revisado). Recomendado, queda en P-5 |
| 4 | Calcula «peso ideal», sobrepeso, bajo peso o «geriátrico» | Búsqueda sin coincidencias en `src/`; ninguna función compara contra un peso o edad de referencia |
| 5 | Muestra años humanos equivalentes | `formatAge` solo imprime años y meses reales (`view-model.ts` 124-128); sin campo de equivalencia en `ComputedAge` |
| 6 | Aplica calendarios de perro y gato a otras especies, ni genera próximas fechas | `evaluateByKey` no recibe especie; `target` viene del registro (`nextBoosterAt`, `nextSuggestedDoseAt`), nunca se calcula |
| 7 | Muestra «al día» como garantía de salud | `null` sin próxima fecha (sección 4); `UP_TO_DATE` solo significa que la fecha registrada tiene más de 15 días. Texto de interfaz: ver nota de la sección 4 |
| 8 | Trata `OTHER` como especie conocida | `OTHER` sin reglas propias (sección 5) |
| 9 | Rechaza un peso por «poco realista» con criterios no documentados | Solo `assertWeightWithinSpeciesLimits` con la tabla de `INV-REC2-002` |
| 10 | Usa el reloj del sistema en dominio | Sin `new Date()` ni `Date.now()` en `src/domain/`; fecha por argumento (`ClockPort`) |

Observación: la prohibición 3 es la única que no puedo marcar como cumplida por el código revisado, porque depende del texto de la interfaz. No bloquea T234; queda para P-5.

## 7. Puntos para veterinario (P-1 a P-5)

| Punto | Tema | Estado tras la rebanada 2 |
|---|---|---|
| **P-1** | Cota máxima de peso para RABBIT, FERRET, BIRD, REPTILE, SMALL_MAMMAL y OTHER | **Sigue abierto.** La rebanada 2 implementa 150 kg marcado provisional (`maxIsProvisional: true`). Eso cierra el marcado, no la validación clínica |
| **P-2** | Si SMALL_MAMMAL y REPTILE necesitan cotas por subgrupo | **Sigue abierto.** Sin cambios |
| **P-3** | Reglas de peso ideal y alerta geriátrica (+10 años) | **Sigue abierto** y fuera de alcance: el código confirma que no existen. Requiere fuente clínica y decisión de Neo antes de entrar en una spec |
| **P-4** | Pautas de vacunación y desparasitación por especie | **Sigue abierto.** El sistema no las necesita (sección 2). Incluye si hay equivalencias de nombre de vacuna |
| **P-5** | Aviso al dueño en la interfaz y redacción del aviso de «sin próxima fecha» | **Sigue abierto**, ampliado con la nota de la sección 4 |

**Se cierra con esta rebanada:** la validación clínica de ADR-002-15 (aceptada) y la confirmación de que no hay alertas de peso ni de edad, ni años humanos, en las 8 especies. **No se cierra ninguno de P-1 a P-5.**

## 8. Resumen para Morpheus

- Cotas: 2 validadas (CANINE, FELINE) y 6 provisionales (máximo 150 kg); mínimo 0.001 kg y 3 decimales decididos (7B).
- Alertas automáticas de peso o edad: **No**, en ninguna de las 8 especies (`weight-limits.ts` línea 7 y el evaluador, que no recibe la especie).
- Edad solo en años reales: **Sí** (`formatAge`, `estimated-age.ts`).
- ADR-002-15: **aceptado**, con la condición de que la interfaz muestre «sin próxima fecha registrada» y nunca «al día».
- Cambios de spec, contrato o código que pido: ninguno. Escalamiento a Neo: ninguno obligatorio.
- Firma clínica de T234 lista para revisión de Oracle; el cierre `[x]` es de Neo.
