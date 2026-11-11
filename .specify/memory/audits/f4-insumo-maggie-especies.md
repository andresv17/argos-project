# F4 — Insumo clínico de Maggie: pesos, cotas, edad y avisos por especie (Feature 002)

- **Autora:** Maggie (Especialista Clínico Veterinario) · **Fecha:** 2026-11-10 · **Rama:** `002-plataforma-v21`
- **Despachada por:** Morpheus, con autorización de Neo (Nivel 2). Solo documentación; no modifica spec, contratos ni código.
- **Fuentes leídas:** `specs/002-plataforma-v21/spec.md` (`REQ-REC2-001`, `REQ-REC2-002`, `INV-REC2-002`, `REQ-PET2-001..003`, SC-013, decisión 7B, sección Assumptions), `specs/001-pet-health-tracker/spec.md` (`REQ-REC-001`, `REQ-REC-003`, `REQ-REC-004`, `REQ-PET-002`, `INV-REC-002`, `INV-REC-004..006`, `INV-PET-002`), `.specify/memory/constitution.md` (principio II, determinismo, `INV-ARCH-001`).
- **Regla de honestidad clínica:** no tengo en este repositorio ninguna fuente clínica citable (guía veterinaria, tabla de razas, consenso de sociedad profesional). Por eso no invento cifras. Todo lo que no sea una regla ya escrita en la 001/002 se marca **«provisional, a validar»**, con la fuente que falta.

## 1. Tabla de pesos y cotas por especie (`INV-REC2-002`, `REQ-REC2-001`, decisión 7B)

| Especie | Peso mínimo (kg) | Peso máximo (kg) | Decimales | Origen del rango | Estado | Alertas automáticas de peso ideal / geriátricas |
|---|---|---|---|---|---|---|
| `CANINE` | 0.05 | 150.00 | 2 | Heredado de `INV-REC-002` (001), repetido en `INV-REC2-002` | **Validado por spec** (es una regla de captura, no una norma clínica) | **No** (ver nota A) |
| `FELINE` | 0.05 | 150.00 | 2 | Igual que CANINE | **Validado por spec** | **No** (ver nota A) |
| `RABBIT` | 0.001 | 150.000 | 3 | Mínimo y decimales: decisión 7B. Máximo: `INV-REC2-002` | Mín./decimales **decididos**; máx. **provisional, a validar** | **No** |
| `FERRET` | 0.001 | 150.000 | 3 | Igual | Igual | **No** |
| `BIRD` | 0.001 | 150.000 | 3 | Igual | Igual | **No** |
| `REPTILE` | 0.001 | 150.000 | 3 | Igual | Igual | **No** |
| `SMALL_MAMMAL` | 0.001 | 150.000 | 3 | Igual | Igual | **No** |
| `OTHER` | 0.001 | 150.000 | 3 | Igual | Igual | **No** |

**Notas**

- **A. CANINE y FELINE.** La 001 no define alertas de peso ideal ni alertas geriátricas automáticas: el semáforo de la 001 (`STATE-ALERT-001`, `REQ-REC-003`, `REQ-REC-004`) cubre solo vacunas y desparasitaciones. Por tanto «mantener lo de la 001» significa **sin alertas automáticas de peso ni de edad** tampoco para perro y gato. Mi ficha de rol menciona curvas de peso ideal y alerta geriátrica (+10 años), pero eso **no está en la spec aprobada**; implementarlo sería ampliar el alcance y requiere decisión de Neo (Nivel 2) y fuente clínica (ver sección 5, punto P-3).
- **B. Cota máxima de 150.000 kg.** `INV-REC2-002` la declara provisional y me delega la tabla definitiva. Mi recomendación, para no rechazar datos reales sin base clínica, es **mantener 150.000 kg para las seis especies hasta que un veterinario revise**. Es una cota de **plausibilidad de captura** (evitar errores de tecleo como 1500), no un límite clínico ni un peso «sano».
- **C. Cotas más estrictas (opcional, provisional).** Una cota máxima menor atraparía más errores de tecleo (un conejo de 90 kg), pero sin fuente rechazaría animales legítimos y poco comunes (razas gigantes, ejemplares de reptiles o aves grandes, `OTHER`). **No propongo cifras concretas** porque no tengo base clínica. Si Neo quiere cotas más estrictas, la revisión profesional debe aportarlas por especie y, si es posible, con un margen holgado sobre el máximo documentado.
- **D. Mínimo 0.001 kg.** Es lo decidido en 7B (1 gramo), coherente con aves y roedores muy pequeños. El caso límite de la spec (0.0005 kg se rechaza, 0.001 es válido) y SC-013 ya lo cubren. Es una resolución de captura: no afirma que 1 g sea un peso clínicamente plausible para cada especie.
- **E. `deltaKg`.** Se calcula en la unidad entera más fina de la especie (centésimas para CANINE/FELINE, milésimas para las demás), exacto y sin redondeo (`REQ-REC2-001`). Es aritmética pura, sin juicio clínico.
- **F. Orden de validación.** Se mantiene el de la 001 (D-107-2): decimales (`INV-REC2-002`), ventana temporal (`INV-REC-001`), fecha siguiente. Error de peso: `ERR-REC-WEIGHT-OUT-OF-RANGE`.
- **G. Peso en `OTHER`.** El rango no depende de `speciesOther` (texto libre, `REQ-PET2-001`). Sin especie conocida no hay base para ninguna cota distinta de la genérica.

## 2. Regla de edad por especie (`REQ-PET-002` de la 001, `REQ-PET2-001`, `REQ-PET2-003`, constitución principio II)

- **La 002 mantiene solo años reales** para las 8 especies. `REQ-PET-002` no se reemplaza en la 002 (no figura en la tabla de reemplazos de la spec): edad = `{ years, months, totalDays }` entre `birthDate` y la fecha actual, con aniversarios completos y regla del último día del mes (`2024-02-29` → `2025-02-28` = `{1, 0, 365}`).
- **Determinismo (constitución II, `INV-ARCH-001`):** la fecha actual llega por `ClockPort`; nunca `new Date()` en dominio ni aplicación.
- **No se calculan «años humanos equivalentes»** para ninguna especie, ni se muestran. Razón clínica: los factores de equivalencia varían mucho entre especies, razas y tallas y no tengo fuente citable; presentarlos como dato sería inventar una cifra. **Provisional, a validar:** si algún día se quiere, requiere fuente clínica y spec nueva.
- **Edad estimada (`REQ-PET2-001`):** cuando `birthDateIsEstimate = true` (animal rescatado, aves, reptiles de edad incierta), la edad mostrada es **aproximada**. Recomendación para la interfaz (a decidir por Sati/Zee, no cambia contratos): rotular la edad como «aprox.» en ese caso. La aritmética no cambia.
- **Sin umbral geriátrico por especie.** No hay umbral aprobado; «+10 años» es una referencia de mi ficha, no una regla de la spec. No se usa en el sistema (sección 1, nota A).
- `INV-PET-002` (nacimiento no futuro) y `INV-PET-006` (coherencia con historial) aplican igual a las 8 especies.

## 3. Vacunas y desparasitaciones por especie (`REQ-REC2-002`, `STATE-ALERT-001`, `INV-REC-004..006`)

**Qué hace hoy la spec (hecho, no opinión).** `STATE-ALERT-001` evalúa **la próxima fecha que el usuario registra** (`nextBoosterAt` / `nextSuggestedDoseAt`) contra la fecha actual. No contiene un calendario clínico: el sistema **no genera fechas ni dosis, no sabe qué vacuna corresponde a qué especie**. `REQ-REC2-002` es genérica y sirve para las 8 especies; un registro sin próxima fecha no entra al semáforo.

**Decisión recomendada (la más segura para la mascota):**

1. **No aplicar ningún calendario de perro y gato a las demás especies, y no sugerir vacunas ni desparasitaciones por especie.** Una pauta de perro/gato aplicada a un conejo, hurón, ave o reptil podría inducir al dueño a administrar un producto inadecuado o a creer que «está al día» cuando no lo está. Un falso «al día» es el peor error en salud preventiva.
2. **Sí mantener el semáforo sobre las fechas que el propio usuario o su veterinario registran**, para las 8 especies: es solo un recordatorio de una fecha elegida por el usuario, no una pauta clínica. Esto es lo que ya dicen `REQ-REC2-002` y `STATE-ALERT-001`.
3. **Sin recomendaciones automáticas** («toca vacuna», «falta desparasitar») para ninguna especie, ni para perro y gato: el sistema nunca calcula el calendario (en la 001 tampoco lo hace; solo evalúa la fecha registrada).
4. **Interfaz (sugerencia, no cambia contratos):** para especies distintas de CANINE y FELINE, un aviso fijo en el formulario: «Consulte a su veterinario la pauta de vacunas y desparasitación de su animal». **Provisional, a validar** con un veterinario de animales exóticos.

**Campos clínicos de `REQ-REC2-002` (mandato de «Maggie valida los campos clínicos en F4»):**

| Campo | Observación clínica | Estado |
|---|---|---|
| `category` (`VACCINE` / `DEWORMING`) | Válido para las 8 especies como categorías de registro. | Validado como estructura |
| `dewormingType` (`INTERNAL` / `EXTERNAL`) | Válido como etiqueta. | Validado como estructura |
| `vaccineName`, `productBrand` (1–100) | Texto libre; sin catálogo cerrado. Correcto: no hay lista clínica citable por especie. | Validado como texto libre |
| `batchOrClinic` (≤ 120), `veterinarianName` (≤ 120), `veterinarianLicense` (≤ 60) | Opcionales, texto libre. Formato de licencia varía por país y no debe validarse con patrón. | Validado como texto libre sin patrón |
| Próxima fecha (`INV-REC-004`, `INV-REC-005`) | Solo exige fecha posterior a la aplicación; no impone intervalos. Correcto: no inventar intervalos por especie. | Validado |
| Intervalos mínimo/máximo entre dosis por especie | **No definidos y no debe definirlos el sistema.** Falta fuente: calendario de una guía veterinaria reconocida por especie. | Provisional, a validar (no implementar) |

## 4. Lo que el sistema NO debe hacer (cada punto responde a un ID)

1. **No emitir diagnósticos** ni interpretar pesos, edades o variaciones como señal de enfermedad (`REQ-REC2-001`: el `deltaKg` es aritmética; la interpretación es del veterinario).
2. **No prescribir ni recomendar** medicamentos, dosis, productos, vacunas o desparasitantes (`REQ-REC2-002`: registra lo aplicado, no lo indica).
3. **No reemplazar la consulta veterinaria.** Los textos de la interfaz deben decirlo donde se muestren pesos, edades y semáforos. Aviso breve sugerido: «Registro informativo. No sustituye la consulta veterinaria.»
4. **No calcular ni mostrar «peso ideal», «sobrepeso», «bajo peso» ni «mascota geriátrica»** para ninguna especie, hasta que existan reglas clínicas aprobadas (spec 002, Assumptions, última viñeta de «Sin alertas automáticas…»).
5. **No mostrar años humanos equivalentes** (sección 2; `REQ-PET-002`).
6. **No aplicar calendarios de perro/gato a otras especies** ni generar próximas fechas automáticamente (sección 3; `STATE-ALERT-001`).
7. **No mostrar un estado «al día» como garantía de salud.** El semáforo solo indica que la fecha registrada no ha vencido. Un registro sin próxima fecha no cuenta (`REQ-PET2-002`); una mascota sin registros evaluables no muestra insignia (se evita un falso «al día»).
8. **No tratar `OTHER` como si fuera una especie conocida:** sin reglas propias (`REQ-PET2-001`, `speciesOther`).
9. **No rechazar un peso por «poco realista» con criterios no documentados:** solo se aplica la cota de `INV-REC2-002`.
10. **No usar el reloj del sistema en dominio** para ninguno de estos cálculos (constitución II, `INV-ARCH-001`).

## 5. Puntos que requieren un profesional veterinario (revisión posterior, no bloquea F4)

- **P-1.** Cota máxima de peso por especie para RABBIT, FERRET, BIRD, REPTILE, SMALL_MAMMAL y OTHER (hoy 150.000 kg provisional, `INV-REC2-002`). Fuente que falta: pesos adultos máximos documentados por especie en una referencia veterinaria reconocida, de preferencia revisada por un veterinario de exóticos.
- **P-2.** Si SMALL_MAMMAL y REPTILE necesitan cotas separadas por subgrupo (p. ej. roedores vs. tortugas grandes), porque «especie» agrupa animales de pesos muy distintos. Hoy no hay base para dividirlos.
- **P-3.** Reglas de peso ideal y de alerta geriátrica (incluido el umbral «+10 años» de mi ficha) para CANINE y FELINE, y para las demás especies. Requieren fuente clínica y decisión de Neo antes de entrar en una spec.
- **P-4.** Pautas de vacunación y desparasitación por especie (sección 3). El sistema no las necesita para operar hoy.
- **P-5.** Aviso para el dueño en la interfaz (sección 3, punto 4, y sección 4, punto 3): redacción final a confirmar por un profesional.

## 6. Resumen para Morpheus

- **Rangos validados (por regla de la spec):** 2 de 8 (CANINE, FELINE).
- **Provisionales:** 6 de 8 (RABBIT, FERRET, BIRD, REPTILE, SMALL_MAMMAL, OTHER) en la cota máxima; el mínimo 0.001 kg y los 3 decimales están decididos (7B).
- **Cambios de spec o contrato que pido:** ninguno. Recomiendo que el contrato de F4 ponga 150.000 kg como máximo para las seis especies, con comentario «provisional, a validar» (referencia a este documento).
- **Escalamiento a Neo:** ninguno obligatorio. Opcional: decidir si P-3 (peso ideal/geriátrico) se abre como feature futura.
