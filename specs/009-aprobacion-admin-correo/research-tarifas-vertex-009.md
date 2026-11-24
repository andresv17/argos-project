# Research 009 — Tarifas y disponibilidad de modelos de imagen en Vertex AI (T1301)

- **Feature:** 009-aprobacion-admin-correo (GH:#20)
- **Tarea:** T1301 [GOV] — `/link` con red (segunda pasada, 2026-11-23)
- **Fecha de consulta:** 2026-11-23
- **Autor:** Link (subagente de Morpheus)
- **Estado global:** tarifas Vertex **NO VERIFICADAS** (la página oficial de precios de Vertex sigue truncada). Tarifas de la API de Gemini Developer (`aistudio.google.com/docs/pricing`) **VERIFICADAS como referencia cruzada, NO son la tarifa de Vertex**. Disponibilidad y ciclo de vida **parcialmente verificados**.
- **Alcance:** solo lectura de fuentes oficiales de Google Cloud / Google AI. No modifica contratos, spec, plan ni tasks.md. No es requisito firmado ni fuente normativa hasta que Neo lo confirme.

## 1. Resumen de lo confirmado y de lo NO confirmado

**Confirmado (texto oficial leído por WebFetch):**
- Deprecación de `gemini-2.5-flash-image`, retiro 2027-03-15, reemplazo "Gemini 3.1 Flash-Lite Image" (ver §4).
- Tokens por imagen de entrada de `gemini-3.1-flash-image`: 1120; por imagen de salida: 1120 (1K).
- Tarifas de la API de Gemini Developer (no Vertex) para `gemini-2.5-flash-image`, `gemini-3.1-flash-image` y `gemini-3-pro-image` (§3.2).

**NO confirmado:**
- Cualquier tarifa de la página oficial de precios de Vertex AI (`cloud.google.com/vertex-ai/generative-ai/pricing`). Cinco intentos (incluido `offset` 20000 y 60000) devolvieron solo el título "Agent Platform Pricing | Google Cloud" y "[Content truncated due to length...]"; con `offset` 20000 el texto restante fue de 78 caracteres, es decir, la página no entregó su cuerpo.
- Tokens de salida por imagen 1K de `gemini-2.5-flash-image` (1290): solo aparece en un resumen de búsqueda previo, no leído en la página del modelo.

## 2. Tabla modelo × región (disponibilidad)

Leyenda: **V** = listado en la página oficial de modelo o de ubicaciones (leído por WebFetch en la primera pasada); **NV** = no verificado.

| Modelo | Global (`global`) | Multirregión US | Multirregión EU | Regiones individuales (`us-central1`, etc.) | Estado |
|---|---|---|---|---|---|
| `gemini-2.5-flash-image` | Conflicto: tabla de ubicaciones la lista (V); la página del modelo no (NV) | V (ML processing) | V (ML processing) | NV | **Deprecado** (§4) |
| `gemini-3.1-flash-image` | V (Provisioned Throughput y Standard PayGo; Priority PayGo solo global) | V | V | NV | Sin estado GA/Preview en la página |
| `gemini-3-pro-image` | V (Provisioned Throughput, Standard PayGo y Priority PayGo) | NV | NV | NV | Sin estado GA/Preview; sin fecha de retiro |

Notas:
- La página de ubicaciones recomienda **no usar el endpoint global** si hay requisitos de procesamiento de ML (ver §5, política de datos). Esto afecta a `REQ-ESC6-028` y a la lista cerrada de regiones (`T1299`).
- Nombre vigente de 3.1: la tabla de precios de Developer API lista solo `gemini-3.1-flash-image` (no `-preview`). Sin confirmar para Vertex.

## 3. Tabla de costo unitario (modelo × región), micro-USD

### 3.1 Vertex AI (la que aplica al proyecto)

| Modelo | Región | Tarifa Vertex (micro-USD) | Estado |
|---|---|---|---|
| `gemini-2.5-flash-image` | global / US / EU / us-central1 | No leída | **NO VERIFICADA** |
| `gemini-3.1-flash-image` | global / US / EU / us-central1 | No leída | **NO VERIFICADA** |
| `gemini-3-pro-image` | global | No leída | **NO VERIFICADA** |

Ninguna tarifa de Vertex quedó verificada. **No usar cifras de este documento en `app-config.ts`, en la Enmienda 009-B (`T1254`), en `T1300` ni en `T1296` sin confirmación de Neo contra la página de Vertex.**

### 3.2 Referencia cruzada: API de Gemini Developer (NO es Vertex)

Fuente: https://aistudio.google.com/docs/pricing (redirección 301 desde `https://ai.google.dev/gemini-api/docs/pricing`), leída 2026-11-23. Precios de nivel pagado, USD.

| Modelo | Entrada (texto/imagen) | Salida imagen | Equivalencia por imagen | Estado |
|---|---|---|---|---|
| `gemini-2.5-flash-image` | 0,30 USD / 1M | 30 USD / 1M | 0,039 USD por imagen | VERIFICADA como referencia Developer API |
| `gemini-3.1-flash-image` | 0,50 USD / 1M | 60 USD / 1M | 0,045 (0,5K), 0,067 (1K), 0,101 (2K), 0,151 (4K) | VERIFICADA como referencia Developer API |
| `gemini-3-pro-image` | 2,00 USD / 1M | 120 USD / 1M | 0,134 (1K/2K), 0,24 (4K) | VERIFICADA como referencia Developer API |

Equivalencia de entrada: la tabla de Developer API lista `gemini-3-pro-image` como "$2.00 (text/image)" por 1M tokens (equivale a 0,0011 USD por imagen de entrada).

### 3.3 Cálculo de cota superior con los números de la directiva de Neo, contrastados

Fórmula (directiva de Neo): cota = salida 1K + entradas máximas (9 imágenes + 2000 tokens de texto), en micro-USD enteros redondeados hacia arriba.

Entradas máximas (verificado aritméticamente): 2.5 → 9×1290 + 2000 = 13.610 tokens (con 1290 NO verificado); 3.1 → 9×1120 + 2000 = 12.080 tokens (con 1120 verificado en página de modelo).

| Modelo | Cálculo con tarifas Developer API (referencia, no Vertex) | Resultado | Cifra de la directiva de Neo | Comentario |
|---|---|---|---|---|
| `gemini-2.5-flash-image` | salida 1290×30 = 38.700; entrada 13.610×0,30 = 4.083 | 42.783 µUSD | 45.000 µUSD | La cifra de Neo es mayor (cota conservadora). No es la fórmula exacta; el resultado con Developer API es 42.783. |
| `gemini-3.1-flash-image` | salida 1120×60 = 67.200; entrada 12.080×0,50 = 6.040 | 73.240 µUSD | 75.000 µUSD | Cifra de Neo mayor (cota conservadora). |
| `gemini-3-pro-image` | salida 1K 134.000 (por imagen Developer API); entrada 12.080×2,00 = 24.160 | 158.160 µUSD | 150.000 µUSD | **INCONSISTENTE**: la cifra de Neo queda por debajo del cálculo con tarifas Developer API. Requiere confirmar la tarifa Vertex antes de usar 150.000. |

Techo derivado: `floor(5.000.000 / cota)`.
- Con 45.000 (cifra de Neo): 111 imágenes/mes (`floor(111,1)`).
- Con 42.783 (Developer API): 116 imágenes/mes.
- Con 158.160 (Developer API, 3-pro): 31 imágenes/mes.

Estos techos son **orientativos**; el techo válido es el que resulte de la tarifa Vertex confirmada.

## 4. Estado de ciclo de vida

| Modelo | Estado | Fecha | Reemplazo | Fuente | Estado de verificación |
|---|---|---|---|---|---|
| `gemini-2.5-flash-image` | Deprecado; "will be retired on March 15, 2027" | 2027-03-15 | Gemini 3.1 Flash-Lite Image | https://docs.cloud.google.com/vertex-ai/generative-ai/docs/models/gemini/2-5-flash-image | VERIFICADA (texto oficial leído en primera pasada) |
| `gemini-3.1-flash-image` | Sin estado GA/Preview; sin fecha de retiro | — | — | https://docs.cloud.google.com/vertex-ai/generative-ai/docs/models/gemini/3-1-flash-image | VERIFICADA (ausencia de dato) |
| `gemini-3-pro-image` | Sin estado GA/Preview; sin fecha de retiro | — | — | https://docs.cloud.google.com/vertex-ai/generative-ai/docs/models/gemini/3-pro-image | VERIFICADA (ausencia de dato) |

**Hallazgo para el arquitecto:** la lista cerrada de `T1254` incluye `gemini-2.5-flash-image`, deprecado con retiro el 2027-03-15. Decidir antes de firmar la Enmienda 009-B.

## 5. Gobernanza de datos (REQ-ESC6-028)

Fuente: https://docs.cloud.google.com/vertex-ai/generative-ai/docs/data-governance (redirección 301 desde `cloud.google.com/...`), leída 2026-11-23. La página no muestra fecha.

| Punto | Texto verificado | Estado |
|---|---|---|
| No entrenamiento | "Google won't use your data to train or fine-tune any AI/ML models without your prior permission or instruction." Aplica a todos los modelos gestionados, incluidos los pre-GA. | **VERIFICADA** |
| Caché implícita | "It's used only to serve your requests faster, and is never used to train or fine-tune models." | VERIFICADA |
| Retención de prompts y salidas (general) | La página no da plazo general para prompts/salidas de modelos de imagen. Solo: Interactions API `store` por defecto `true`; Google Maps grounding 30 días; Deep Research 7 días (incluye "generated images"); Gemini Live resumption hasta 24 h, desactivado por defecto. | **NO VERIFICADA** para imágenes Gemini (no hay plazo explícito) |
| Residencia regional | "It's processed in the region that serves the request." (caché en memoria). Global: "requests and their cached data can be served from any region." | **PARCIAL**: la región se garantiza con endpoint regional; con `global` no. |
| Borrado a petición | No tratado en esta página | NO VERIFICADA |
| Imágenes | Sin declaración específica para modelos de imagen (solo mención en Deep Research) | NO VERIFICADA |

Conclusión para REQ-ESC6-028: **no entrenamiento VERIFICADO**; **retención NO VERIFICADA** para el modelo de imagen; **residencia solo garantizable con endpoint regional** (no `global`), lo que contradice la lista cerrada si incluye `global`. REQ-ESC6-028 sigue abierto.

## 6. Fuentes consultadas (2026-11-23)

| URL | Qué aportó | Resultado |
|---|---|---|
| https://cloud.google.com/vertex-ai/generative-ai/pricing (y `docs.cloud.google.com/...`) | Precios Vertex | Truncada en 5 intentos; sin cifras. Página devuelve solo título y "[Content truncated due to length...]". **NO leída.** |
| https://aistudio.google.com/docs/pricing (de `ai.google.dev/gemini-api/docs/pricing`) | Precios API Gemini Developer | Leída. **No es Vertex.** Usada solo como referencia cruzada. |
| https://docs.cloud.google.com/vertex-ai/generative-ai/docs/data-governance | Gobernanza de datos | Leída (primera redirección no seguida; segunda pasada completa). |
| https://docs.cloud.google.com/vertex-ai/generative-ai/docs/models/gemini/3-1-flash-image | Modelo 3.1: tokens, regiones | Leída en primera pasada. |
| https://docs.cloud.google.com/vertex-ai/generative-ai/docs/models/gemini/2-5-flash-image | Deprecación 2.5 | Leída en primera pasada. |
| https://docs.cloud.google.com/vertex-ai/generative-ai/docs/models/gemini/3-pro-image | Modelo 3 Pro | Leída en primera pasada. |
| https://docs.cloud.google.com/vertex-ai/generative-ai/docs/learn/locations | Ubicaciones | Leída en primera pasada; celdas de disponibilidad vacías. |

Nota de método: las lecturas son resúmenes de WebFetch, no copia literal. Antes de firmar, Neo o `/architect` deben abrir la página de precios de Vertex en navegador y copiar las cifras.

## 7. Qué queda pendiente (NO VERIFICADO)

- Tarifas Vertex de los tres modelos (USD y micro-USD), por tier y por región/global. Bloqueo principal de T1301.
- Confirmar si la tarifa `global` difiere de US/EU en Vertex.
- Tokens de salida 1K de `gemini-2.5-flash-image` (1290) en la página del modelo.
- Confirmar la cifra de `gemini-3-pro-image` (150.000 µUSD de la directiva frente a 158.160 de referencia Developer API).
- Retención y borrado de salidas de imagen (REQ-ESC6-028).
- Disponibilidad de `gemini-3-pro-image` en `us`/`eu`.
- Nombre vigente de 3.1 en Vertex (`gemini-3.1-flash-image` frente a `-preview`).

## 8. Recomendación

1. Neo abre https://cloud.google.com/vertex-ai/generative-ai/pricing en navegador y copia la tabla de imagen de Vertex; luego se contrasta con §3.2 y §3.3.
2. No cerrar T1254 con 2.5 sin decidir su deprecación (retiro 2027-03-15).
3. Decidir si `global` entra en la lista de regiones, dado §5.
