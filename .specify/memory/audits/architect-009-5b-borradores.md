# Acta Architect · Feature 009 · Fase 5b · borradores T1254, T1299, T1300 y dictamen de contrato de `prompt-blocks`

- Fecha: 2026-11-23 · HEAD de referencia: dc535bd · Rama 009-aprobacion-admin-correo · Autor: `/architect` (subagente de Morpheus)
- Estado de TODO el documento: **`DRAFT`**. Sin `APPROVED` ni `LOCKED`. La firma de la Enmienda es de Neo (`T1255`, `[HUM][N2]`). Nada de este acta se ha aplicado a `constitution.md`, `spec.md`, `plan.md`, contratos, `src/` ni `tests/`.
- Fuentes leídas en disco: `tasks.md` (T1254, T1255, T1261, T1295, T1299, T1300, T1301), `spec.md` (REQ-CFG9-004/005, EDGE-009-018/036/044/045/046, NFR-009-003/005, INV-CFG9-001/002, D9-09/21/22/23, P5-02/04/06), `constitution.md` 3.9.0 (Principio VI, excepción 006), acta `rama-009-T1294-ubicacion.md` (global = FAIL), `research-tarifas-vertex-009.md` (T1301: tarifas NO VERIFICADAS), pruebas rojas `t1261` y `t1295`, y el código actual de `src/domain/scene/` y `src/domain/platform/admin-parameter-catalog.ts`.
- Regla de cifras: **no se escribe ninguna tarifa**. Toda celda de coste queda vacía con la referencia a `T1301`.

---

# PARTE 1 · T1254 — Enmienda constitucional MINOR 009-B (borrador)

## 1.1 Versión y alcance

- **MINOR `3.9.0` → `3.10.0`**. La 009-A ya ocupó `3.9.0` (firmada, `T1225`, 2026-11-23); por eso 009-B es `3.10.0` sin ambigüedad de orden.
- Justificación MINOR (Gobernanza «Versionado»): se acota, con una lista cerrada, el alcance ya autorizado de una excepción existente (Principio VI, condición (d) de la excepción 006); no se retira ni redefine ningún principio, no se añade proveedor, servicio ni dependencia npm, y el tope de 5 USD/mes no cambia.
- Sección afectada: **Principio VI** (párrafo «Excepción acotada de la feature 006»), cabecera «SYNC IMPACT REPORT» y línea final «Versión 3.10.0 …». Principios I..V y resto de secciones: sin cambio.
- Traza: `P5-02` = A, `D9-09` = A, `REQ-CFG9-004`, `NFR-009-003`, `NFR-009-005`(b), `EDGE-009-036`; `SC-009-023`.

## 1.2 Texto propuesto de la cláusula (se añade tras el párrafo de la excepción 006; no lo reemplaza)

> **Acotación de modelos de la excepción 006 (Enmienda 009-B, `P5-02`, 2026-11-XX [fecha de la firma]).** Sin modificar el servicio, el proveedor (Google Vertex AI, Gemini Image), el tope ni las condiciones (a)..(d) de la excepción de la feature 006, la condición (d) se concreta así: el único conjunto de modelos de generación de imágenes que la plataforma puede configurar es la **lista cerrada** `gemini-2.5-flash-image`, `gemini-3.1-flash-image` y `gemini-3-pro-image`. Condiciones: (e) el tope de 5 USD equivalentes (22500 COP) por mes **no se amplía** y se garantiza sobre el gasto acumulado del mes por modelo × región, calculado con la tabla de costes unitarios del Anexo A de esta Enmienda; un par modelo × región sin coste con fuente oficial en esa tabla **no es seleccionable**; (f) `scene.global_quota_max` es el freno de imágenes y su techo se deriva de la tabla (no es un valor fijo de código); (g) la región `global` **no forma parte** de las regiones admitidas por esta Enmienda: su habilitación exige una decisión posterior de Nivel 2 tras el dictamen de ubicación de `/rama` y la enmienda versionada de la feature 006 (`T1299`); (h) `gemini-2.5-flash-image` figura **deprecado por el proveedor con retiro el 2027-03-15** [fuente: `research-tarifas-vertex-009.md` §4, página oficial del modelo, consulta 2026-11-23]; la Enmienda lo mantiene en la lista **únicamente hasta esa fecha** y a partir de ella deja de ser seleccionable sin necesidad de nueva enmienda; (i) añadir, quitar o sustituir un modelo de la lista, o modificar la tabla del Anexo A con valores nuevos, requiere una autorización nueva (Nivel 2).

Notas de redacción del Architect:
- La cláusula (h) responde al hallazgo de `T1301` (ver 1.4). Es **propuesta**; Neo decide (duda D-1).
- Ningún texto menciona cifras.

## 1.3 Anexo A (propuesto) — tabla de costes unitarios por modelo × región

**Estado: `NO VERIFICADA` en todas las celdas.** Fuente prevista: página oficial de precios de Vertex AI (`https://cloud.google.com/vertex-ai/generative-ai/pricing`), que `T1301` no pudo leer (truncada; ver `research-tarifas-vertex-009.md` §1 y §3). Las cifras de agregadores o de resúmenes de búsqueda se descartan. **Ninguna celda se rellena hasta que `T1301` cite fuente, URL y fecha de consulta.**

Unidad definida por esta Enmienda (propuesta, ver duda D-2): **USD por intento de generación**, entendido como **cota superior** que incluye la imagen de salida a la resolución que fija la plataforma y las imágenes de entrada máximas por intento. La conversión desde la unidad del proveedor (tokens) y su fórmula se documentan junto a la fuente en `T1301`; el código solo recibe el valor por intento. Moneda: USD; no hay conversión a COP en código.

Columnas: modelo; entre paréntesis el estado de ciclo de vida verificado por `T1301`.

| Región (`scene.provider_location`) | `gemini-2.5-flash-image` (deprecado, retiro 2027-03-15) | `gemini-3.1-flash-image` (nombre exacto vigente por confirmar) | `gemini-3-pro-image` |
|---|---|---|---|
| `us-central1` | — NO VERIFICADA (T1301) | — NO VERIFICADA (T1301) | — NO VERIFICADA (T1301) |
| `us-east1` | — | — | — |
| `us-east4` | — | — | — |
| `us-east5` | — | — | — |
| `us-south1` | — | — | — |
| `us-west1` | — | — | — |
| `us-west4` | — | — | — |
| `northamerica-northeast1` | — | — | — |
| `europe-west1` | — | — | — |
| `europe-west2` | — | — | — |
| `europe-west3` | — | — | — |
| `europe-west4` | — | — | — |
| `europe-west9` | — | — | — |
| `asia-northeast1` | — | — | — |
| `asia-southeast1` | — | — | — |
| `global` | **FUERA DE LA ENMIENDA** (no habilitada; ver 1.5 y Parte 2) | **FUERA DE LA ENMIENDA** | **FUERA DE LA ENMIENDA** |

Reglas de lectura del Anexo (viajan con la tabla):
1. Celda vacía o sin fuente = par **no seleccionable** (`EDGE-009-036`).
2. Un par con coste pero cuya disponibilidad regional del modelo no esté verificada por `T1301` tampoco es seleccionable (la tabla solo lista pares que el proveedor sirve; `T1301` reportó celdas de disponibilidad vacías, §2 del research).
3. Cada fila llena debe llevar URL, fecha de consulta y estado de modelo (GA/Preview/Deprecado).
4. Efecto operativo mientras el Anexo siga vacío: `/admin` **no puede guardar** cambio de modelo, de región ni de `scene.global_quota_max` (fail-closed, Parte 3). La configuración vigente (modelo y región por defecto del código) **sigue rigiendo**; no se edita, y por tanto no se evalúa.

## 1.4 Decisión sobre `gemini-2.5-flash-image` (deprecado)

Datos verificados por `T1301` (Link): Google marca el modelo «deprecado; retirado el 2027-03-15»; reemplazo sugerido por el proveedor: Gemini 3.1 Flash-Lite Image (que **no** está en la lista de `D9-09`).

Opciones:
- **A (recomendada, borrador): mantenerlo en la lista con marca de deprecación y vigencia hasta 2027-03-15** (cláusula (h)). Razones: (1) `D9-09` = A, firmada por Neo, lo nombra; (2) es el valor por defecto del código en producción hoy (`SCENE_DEFAULT_MODEL = 'gemini-2.5-flash-image'` en `provider-parameters.ts`); quitarlo dejaría huérfana la configuración vigente y la semilla de 5a; (3) la lista de tres es la que Neo aprobó; (4) mantener una fecha explícita evita que el modelo siga seleccionable cuando el proveedor ya lo haya retirado.
- **B: quitarlo ahora** (lista de 2). Contradice `D9-09` = A y obliga a cambiar el defecto de producción antes de firmar. No recomendada.
- **C: mantenerlo sin fecha.** Descartada: dejaría seleccionable un modelo retirado.

Consecuencia técnica (no ejecutar ahora): antes de 2027-03-15 hace falta una tarea nueva para cambiar el valor por defecto de `scene.provider_model` y la semilla; se propone abrirla como deuda con fecha límite 2027-02-01 (dueño `/link` + `/architect`, `[N2]` por tocar defectos de producción). Se anota como **H-5b-01** para Morpheus; no se crea en `tasks.md` desde este borrador.

## 1.5 Condiciones previas a la firma (`T1255`)

Todas deben constar en disco antes de que Neo firme. Ninguna se da por cumplida hoy.

| # | Condición | Estado hoy | Evidencia |
|---|---|---|---|
| C1 | Coste unitario por modelo × región, con fuente oficial, URL y fecha, para cada par que se quiera dejar seleccionable (`T1301`; MER-03/MER-04) | **ABIERTA** (`T1301` BLOQUEADO: tarifas NO VERIFICADAS) | `research-tarifas-vertex-009.md` §3, §6, §7 |
| C2 | Disponibilidad de los tres nombres de modelo y confirmación del nombre exacto de 3.1 (`gemini-3.1-flash-image` frente a `-preview`) y de la disponibilidad regional de `gemini-3-pro-image` | **ABIERTA** (parcial) | research §2, §6 |
| C3 | Dictamen de `REQ-ESC6-028` (retención, entrenamiento, borrado, región de proceso y SLA de datos de Vertex AI con fuente); es la condición (a) de la excepción 006 y sigue abierto | **ABIERTA** | `rama-009-T1294-ubicacion.md` O-5; `006 research.md` §2.3 `[verificar]` |
| C4 | Decisión de Neo sobre el modelo deprecado (duda D-1) y sobre la unidad del coste (duda D-2) | **ABIERTA** | esta acta |
| C5 | `global` fuera del alcance de esta Enmienda mientras `/rama` T1294 diga FAIL; la Enmienda no puede firmar `global` sin las condiciones 1..8 del acta de rama | **CUMPLIDA POR DISEÑO** (cláusula (g) y celdas «fuera de la Enmienda») | acta T1294 §4, §5 |
| C6 | Coordinación con `T1299` (enmienda 006) y con el orden de versión (`3.10.0`) | **PENDIENTE** (esperan firma) | Parte 2 |
| C7 | Revisión de `/oracle` del texto antes de pasar a Neo (no sustituye la firma) | **PENDIENTE** | — |

Efecto sobre el plan: **`T1255` no se puede ejecutar mientras C1, C2 y C3 estén abiertas.** Su firma no bloquea 5a (declarado en `tasks.md`); sí bloquea toda escritura de modelo, región o `scene.global_quota_max` desde `/admin` (5b) y la validación por lista cerrada (`T1265`, `T1296`).

## 1.6 Cabecera «SYNC IMPACT REPORT» propuesta (se añade al aplicar, no ahora)

```
SYNC IMPACT REPORT (3.9.0 -> 3.10.0, [fecha de la firma])
Version change: 3.9.0 -> 3.10.0
Bump rationale: MINOR. Enmienda 009-B (P5-02 = A, D9-09 = A, tarea T1255): acotación de modelos de la excepción
  de pago de Vertex AI (Principio VI) a la lista cerrada gemini-2.5-flash-image (deprecado, retiro 2027-03-15),
  gemini-3.1-flash-image y gemini-3-pro-image; tabla de costes unitarios modelo x region (Anexo A) y regla de gasto
  acumulado sobre el tope de 5 USD/mes (sin ampliarlo); region `global` fuera de la Enmienda.
Modified principles: VI (condicion (d) de la excepcion 006, concretada).
Modified sections: ninguna otra.
Added/Removed sections: ninguna.
Follow-up TODOs: T1299 (enmienda 006), T1300 (regla de coste), T1301 (cifras con fuente), cambio del defecto
  scene.provider_model antes de 2027-03-15.
```

---

# PARTE 2 · T1299 — Enmienda versionada de 006 (`REQ-ESC6-017` / `REQ-ESC6-031`) para `global` (borrador)

## 2.1 Declaración central

> **`global` NO está habilitada hoy.** El dictamen de `/rama` de `T1294` (`.specify/memory/audits/rama-009-T1294-ubicacion.md`, 2026-11-23, HEAD dc535bd) es **FAIL** para habilitar `global`. Esta enmienda **no añade `global` a ninguna lista activa**: ni a `SCENE_ALLOWED_LOCATIONS`, ni a la lista que ofrece `/admin`, ni al validador del adaptador, ni a `REQ-ESC6-017/031`. Lo que fija es el **texto latente** que entrará en vigor solo cuando se cumplan las ocho condiciones de la sección 2.3 y Neo lo firme.

Decisión de diseño (Architect): el estado «habilitada» no puede vivir en `platform_parameters` (un administrador podría activarlo desde `/admin`, lo que contradice `D9-23` = A). Se propone una **constante de código** `SCENE_GLOBAL_LOCATION_ENABLED = false` en `src/domain/scene/provider-parameters.ts`, hermana de `SCENE_REAL_DRIVER_ACTIVATED` (que ya es una constante de código con activación autorizada por Neo). Cambiarla a `true` exige el mismo ciclo de Nivel 2. `T1265` (puerto único) y `T1271` (anti-SSRF) la consumen: con `false`, `global` se rechaza en `/admin`, al leer de BD y en el adaptador, incluso si estuviera en BD (`EDGE-009-046`). Es una propuesta que Morpheus debe trasladar a `T1265`; no toca contratos normativos.

## 2.2 Texto latente propuesto para la spec 006 (NO se aplica hoy)

Para `REQ-ESC6-017` y `REQ-ESC6-031`, cuando entre en vigor, se añadiría: «la lista cerrada de regiones admite además `global`, con host literal fijo `aiplatform.googleapis.com` y ruta `locations/global` (no compuesto con ningún valor de entrada); el procesamiento con `global` **no está fijado a una región concreta** (puede ocurrir en cualquier región de la fuente citada por la condición 1) y el aviso vigente declara `us-central1`; su uso exige aviso versionado y nuevo consentimiento (`REQ-ESC6-023`, `EDGE-ESC6-018`)».

Nota de versión para el historial de la spec 006 (patrón de las líneas «Autor: `/architect`. Estado: `DRAFT`»): «Enmienda 009 (`T1299`, `P5-04` = A, `D9-23` = A): **sin cambio de requisito vigente**. Declara que `global` no está habilitada por el dictamen FAIL de `T1294` y enumera sus condiciones. Cita la feature 009, la Enmienda 009-B (`T1254`) y el acta de rama. Sin cambio de contratos (006 OpenAPI 3.6.0, `scene.schema.json` 1.2.0, catálogo 1.1.0 intactos).»

Contratos de 006: **sin cambio** (la región no aparece en el OpenAPI de 006; es parámetro de plataforma). Versionado: no sube versión de contrato; la nota va en el historial de la spec 006.

## 2.3 Condiciones 1..8 (del acta de `/rama`, sección 4; todas, en orden)

| # | Condición | Estado hoy |
|---|---|---|
| 1 | Fuente oficial citada (URL, fecha, cláusula) que documente para `global`: (i) regiones posibles de procesamiento; (ii) retención de entradas y salidas; (iii) no entrenamiento con datos del cliente; (iv) borrado a petición. Registrada en `006 research.md` §2.3-bis (como `T958`) | ABIERTA (`REQ-ESC6-028`, O-5) |
| 2 | Decisión de Neo (Nivel 2) sobre la transferencia internacional de `global` y sobre si la apertura de la 009 a usuarios distintos de Neo reabre `D-28` (`specs/003-cloud-gcp/spec.md`, línea 40) | ABIERTA |
| 3 | Aviso versionado: subir `SCENE_NOTICE_VERSION` (hoy `'2'`) y declarar que con `global` el procesamiento puede ocurrir en cualquier región de la fuente de la condición 1; reexige consentimiento. El texto final lo firma Neo | ABIERTA |
| 4 | Enmienda 006 (`T1299`) y Enmienda 009-B (`T1254`) aprobadas por Neo | ABIERTA (ambas `DRAFT`) |
| 5 | Tarifa propia de `global` en la tabla de `T1301`, con fuente oficial; sin tarifa el par no es seleccionable (`EDGE-009-036`) | ABIERTA (`T1301` BLOQUEADO) |
| 6 | Anti-SSRF con host literal para `global` y prueba de `SC-009-022`, incluida en `T1271` | ABIERTA (`T1271` pendiente) |
| 7 | Registro por intento de `provider_location = global` (`EDGE-009-045`), verificado en `T1298` | ABIERTA (`T1295` rojas; `T1298` pendiente) |
| 8 | Firma de `T1255` y paso de `/oracle` antes de activar en producción; además la compuerta del driver real (`REQ-ESC6-028`, `N2-10`) | ABIERTA |

Procedimiento de habilitación futura (para que no se improvise): (1) cumplir 1..7 con evidencia en disco; (2) Neo firma `T1255` y esta enmienda; (3) un cambio `[N2]` pone `SCENE_GLOBAL_LOCATION_ENABLED = true`, añade `global` a la lista cerrada, sube `SCENE_NOTICE_VERSION` y crea la fila de tarifa; (4) `/oracle` valida; (5) sin otro paso intermedio.

## 2.4 Dependencias y estado

`T1299` dep. `T1253`, `T1278`, `T1254`. Este borrador **no** depende de la firma para existir, pero su aplicación sí. Mientras el dictamen sea FAIL, `T1299` queda en `REVIEW` como declaración, no como habilitación.

---

# PARTE 3 · T1300 — Regla de coste acumulado y techo derivado (documento de regla)

Sin cifras. Los valores de la tabla los entrega `T1301`; la tabla en código es `app-config.ts` y se anexa con fuente a la Enmienda 009-B (`P5-02` = A). `EDGE-009-036`, `D9-21` = A corregida, `D9-22` = A, `SC-009-051`.

## 3.1 Definiciones

- `TOPE_USD` = 5 (constante de la Enmienda 009-B; no editable por `/admin`).
- `T[m, r]` = coste unitario por intento del par modelo `m` × región `r` en la tabla del Anexo A, o **indefinido** si la celda no tiene valor con fuente.
- `Seleccionable(m, r)` ⇔ `T[m, r]` definido. `global` solo si además `SCENE_GLOBAL_LOCATION_ENABLED = true` (Parte 2).
- `costeMax` = máximo de `T` sobre todos los pares seleccionables (cota conservadora).
- `costeMin` = mínimo de `T` sobre todos los pares seleccionables.
- `intentosMes` = intentos de la ventana mensual en `America/Bogota` (campo `quota_window` = `YYYY-MM`) con `provider_call_started_at` no nulo, de toda la plataforma.
- `gastoAcumuladoMes` = Σ sobre `intentosMes` de: `T[provider_model, provider_location]` si ambos no son nulos y el par figura en la tabla; en otro caso (columnas nulas por filas previas a la migración de `T1298`, o par que ya no está en la tabla) se valora con `costeMax`.
- `restantes` = `max(0, scene.global_quota_max − scene.global_quota_used.YYYY-MM)` (valores leídos en la misma transacción de guardado).

## 3.2 Regla de guardado (`/admin`)

Se evalúa en el servidor, **antes de escribir y sin escribir si falla** (422 con `ERR-SCHEMA-VALIDATION-FAILED`, sin valor del parámetro en el cuerpo), cada vez que cambia **cualquiera** de: `scene.provider_model`, `scene.provider_location`, `scene.global_quota_max`. Con los valores **resultantes** del guardado (`m'`, `r'`, `max'`):

```
Seleccionable(m', r')                                  (si no: rechazo, par sin coste con fuente)
gastoAcumuladoMes + restantes' × T[m', r'] ≤ TOPE_USD
  donde restantes' = max(0, max' − used)
```

Consecuencias (todas verificables con `SC-009-051`):
1. Un solo número por guardado: la regla usa el **par nuevo** para todas las imágenes aún por generar y el **gasto ya incurrido** por modelo × región registrado por intento. Eso cierra el contraejemplo de `/merovingian` (gasto previo con modelo caro, paso al barato con tope alto).
2. El resultado `(TOPE_USD − gastoAcumuladoMes) / T[m', r']` (hacia abajo) se muestra **antes de guardar** como «imágenes que aún caben»; es informativo, la regla la aplica el servidor.
3. Una fila de BD con par no seleccionable que llegue por otra vía (migración, edición manual) no rige: rige el defecto de código con aviso sin valor (`INV-CFG9-003`); el rechazo aplica en `/admin`, al leer BD y en el adaptador (`INV-CFG9-001`).

## 3.3 Techo derivado de `scene.global_quota_max`

```
techo = floor( TOPE_USD / costeMin )
```

- Sustituye a `SCENE_GLOBAL_QUOTA_MAX_CEILING = 1000` en `provider-parameters.ts`; ese literal se **elimina** (no queda como respaldo).
- **Fail-closed**: si la tabla no tiene ningún par seleccionable, `costeMin` no existe, `techo` es indefinido y `scene.global_quota_max` **no es editable** desde `/admin` (422, sin escribir). No se cae a 1000 ni a ningún valor por defecto.
- `techo` es una cota de código **más débil** que la regla de guardado (usa el coste mínimo): sirve para acotar el rango del campo y de validación de entrada; la garantía real del tope de gasto es la regla 3.2 con el par efectivo.
- El defecto de `scene.global_quota_max` (hoy 5 imágenes) debe ser ≤ `techo`; `T1296` lo verifica con la tabla real.

## 3.4 Decisiones técnicas del Architect

1. **Aritmética entera**: los costes se guardan en **micro-USD enteros** (1 USD = 1 000 000), con el valor de `T1301` redondeado **hacia arriba**, y el cálculo es entero, sin `Number` de punto flotante. Evita que `5,00 ≤ 5` falle o pase por error de redondeo. `T1296` lo implementa; la conversión del valor de la fuente al entero queda documentada junto a la fila.
2. **Filas previas sin modelo ni región** (acordado en `T1295`/`D9-22`): se valoran con `costeMax` (cota conservadora). Esto puede sobreestimar el gasto del mes de la migración; es deliberado (falla hacia el lado seguro). Tras el cambio de mes la distorsión desaparece.
3. **Intento con llamada ejecutada, resultado fallido**: cuenta completo (el proveedor puede cobrar); la regla no devuelve crédito por intentos fallidos. Solo cuentan los intentos con `provider_call_started_at` no nulo (los cerrados antes del proveedor no cuestan, como `EDGE-009-021`/`T1208`).
4. **Reinicio de cuota de cuentas administradoras** (`resetAdminSceneQuota`): no reduce `gastoAcumuladoMes` ni `scene.global_quota_used`; gasto de plataforma e imágenes por cuenta son contadores distintos.
5. **Tabla vacía hoy**: el efecto operativo es que 5b no permite editar modelo, región ni `scene.global_quota_max` hasta que `T1301` llene al menos un par. La configuración en vigor sigue funcionando.
6. **Fuente de verdad del tope**: la regla protege el tope de la Enmienda, pero el control económico final sigue siendo el presupuesto de la consola del proveedor bajo control de Neo (excepción 006, `RR-06-04`). La regla no sustituye a la alerta de presupuesto.

## 3.5 Qué entrega y qué no este documento

- Entrega: fórmula, dominio, fail-closed y decisiones para que `T1296` (implementar), `T1292` (pruebas rojas, ya redactadas contra `EDGE-009-036`) y `T1305` (UI 5b) trabajen sin inventar cifras.
- No entrega: valor alguno de `T[m, r]`, `costeMin`, `costeMax` ni `techo` numérico. Los pone `T1301`.
- **Dependencias**: `T1300` dep. `T1278`, `T1301`, `T1256`. Con `T1301` bloqueado, este documento queda como regla en `DRAFT`; no se puede pasar a `REVIEW` completo (falta el valor de tabla).

---

# PARTE 4 · Dictamen de contrato interno: `prompt-blocks` y registro por intento

Alcance: contrato **interno** de módulo y de repositorio fijado por las pruebas rojas `t1261` y `t1295`. No toca contratos normativos de `contracts/` ni requiere a Neo. Es decisión técnica del Architect (`LCK-24`, `D9-22`). **Veredicto general: CONFIRMADO con los ajustes A-1..A-6 de abajo.**

## 4.1 `src/domain/scene/prompt-blocks.ts`

Confirmado como hoja del dominio (puro, sin entorno ni E/S, `INV-ESC6-001`):

```ts
export const PROMPT_BLOCK_NAMES = [
  'STYLE_BASE_TEXT', 'HOUSEHOLD_WITH_PHOTO', 'HOUSEHOLD_GENERIC',
  'PRESERVATION_BLOCK', 'PIXEL_REDRAW_RULE', 'STYLE_CLOSING',
] as const;                                              // orden fijo = el de la prueba
export type PromptBlockName = (typeof PROMPT_BLOCK_NAMES)[number];
export type PromptBlocks = Readonly<Record<PromptBlockName, string>>;
export const RECOGNIZED_MARKERS = ['{photoRef}'] as const;   // conjunto cerrado de INV-CFG9-002
export const DEFAULT_PROMPT_BLOCKS: PromptBlocks;           // semilla byte a byte (#57)
export type PromptBlocksValidation =
  | { readonly ok: true; readonly blocks: PromptBlocks }
  | { readonly ok: false; readonly code: 'ERR-SCHEMA-VALIDATION-FAILED' };
export function validatePromptBlocks(raw: string, maxBlockLength: number): PromptBlocksValidation;
```

Ajustes:

- **A-1 (dirección de dependencias, evita ciclo de importación).** Las tres constantes ya existentes (`STYLE_BASE_TEXT`, `PRESERVATION_BLOCK`, `PIXEL_REDRAW_RULE`) y los textos de hogar y cierre pasan a vivir en `prompt-blocks.ts` (fuente de verdad), y `build-image-prompt.ts` las **re-exporta** con los mismos nombres (las pruebas importan `STYLE_BASE_TEXT`, `PIXEL_REDRAW_RULE` y `PRESERVATION_BLOCK` de `build-image-prompt.ts`). `prompt-blocks.ts` no importa `build-image-prompt.ts`. Dos nombres nuevos (`HOUSEHOLD_WITH_PHOTO`, `HOUSEHOLD_GENERIC`, `STYLE_CLOSING`) cierran `H-5a-02`.
- **A-2 (reglas de `validatePromptBlocks`).** Cada fallo devuelve `{ ok:false, code:'ERR-SCHEMA-VALIDATION-FAILED' }`, sin mensaje que contenga el valor (`INV-CFG9-003`). Reglas, en este orden de comprobación:
  1. `raw` parsea como JSON y es un objeto plano (no arreglo, nulo, número ni cadena).
  2. Claves **exactamente** las 6 de `PROMPT_BLOCK_NAMES` (ni faltantes ni extra). JSON con clave duplicada se resuelve por `JSON.parse` (gana la última); la prueba de duplicado cae por «clave faltante», sin detección adicional.
  3. Cada valor es `string`, con `trim().length ≥ 1` y `length ≤ maxBlockLength`.
  4. Marcadores: tras retirar las apariciones exactas de `{photoRef}` solo en `HOUSEHOLD_WITH_PHOTO`, el texto **no puede contener** `{`, `}`, `$` ni `%` (cubre `{petName}`, `{{photoRef}}`, `${photoRef}`, `{photoref}`, `{ photoRef }`, `{}`, `%s`, `{0}`). `HOUSEHOLD_WITH_PHOTO` debe contener `{photoRef}` al menos una vez; ningún otro bloque puede contenerlo.
  5. Texto que imite lo que fija el código: se rechaza cualquier bloque que contenga `IMG_` seguido de dígito, `renderedPetsCount`, `Scene specification`, `Exact animal count` o una línea que empiece por `Pet <dígitos>`.
  6. Invariante de una aparición: ningún bloque distinto de `PRESERVATION_BLOCK` puede contener el texto de código de `PRESERVATION_BLOCK` ni el texto editado de `PRESERVATION_BLOCK`.
  7. Caracteres de control distintos de `\n` y `\t` rechazados (higiene de `INV-CFG9-002`; sin test, propuesta de refuerzo).
- **A-3 (`maxBlockLength`).** El número **no está** fijado en spec ni en contrato (`admin.openapi.yaml` línea 760: «lo fija T1261/T1303»; `H-5a-02`). Medido en disco: el bloque semilla más largo mide 422 caracteres (`STYLE_BASE_TEXT`). **Propuesta técnica: 1000 caracteres por bloque** (≈ 2,4× el máximo sembrado; el JSON de 6 bloques ≤ ~6,5 KB). Va en `ADMIN_PARAMETER_CATALOG['scene.prompt.blocks'].constraints.maxBlockLength` (código). Es una cota de ergonomía, no de coste ni de seguridad; si Neo prefiere otro valor es un cambio de una constante. La prueba exige que exista y que la semilla quepa; 1000 cumple.
- **A-4 (criterio de «sin la instrucción de preservación», `EDGE-009-044`).** La spec dice que un texto «vacío o sin la instrucción de preservación» se rechaza, pero no hay criterio **verificable por máquina** de qué es «la instrucción». Decisión: el criterio objetivo es **no vacío** (regla 3). La verificación semántica queda como **observación** para Neo (duda D-3); no se inventa una lista de palabras clave.
- **A-5 (`H-5a-01`, abierto).** `PlatformParameter.value` en 005 declara `maxLength: 200` en el esquema, y el JSON de 6 bloques lo supera. La columna es `TEXT` (verificado en la migración de 005), así que solo el **esquema** limita. Esto debe resolverse antes de `T1303`/5b-escritura: o 005 sube a un MINOR con firma de Neo, o `/admin` usa una forma de transporte distinta para este valor. No lo decide este dictamen; se mantiene como `H-5a-01` para Morpheus.

## 4.2 `buildImagePrompt(payload, blocks?)`

**Confirmado**: `buildImagePrompt(payload: ScenePayload, blocks: PromptBlocks = DEFAULT_PROMPT_BLOCKS): string`, pura y determinista. Ajustes:

- **A-6 (sustitución segura de `{photoRef}`).** Se sustituye con `split('{photoRef}').join(ref)` y **no** con `String.replace` (el patrón de reemplazo interpretaría `$&`, `$1`, etc.). `blocks` se asume ya validado; `buildImagePrompt` no revalida (la validación vive en `/admin`, al leer BD y en el adaptador; un valor inválido nunca llega a `buildImagePrompt`, que usa el defecto de código).
- El bloque `PRESERVATION_BLOCK` editado se emite **una vez y solo si** hay mascota con foto: la regla la impone el código, no el texto (`EDGE-009-044`, `INV-PRO9-001`). El orden, el JSON, `IMG_n` y la frase de conteo permanecen en código.
- Con `blocks` omitido, el resultado es idéntico al de hoy (prueba `SC-009-024`).

## 4.3 `markProviderCall` y columnas por intento (`D9-22` = A)

**Confirmado** con precisiones:

- Puerto: `markProviderCall(attemptId: string, now: string, call: ProviderCallRecord): Promise<void>` con `ProviderCallRecord = { readonly model: string; readonly location: string }`. El tercer parámetro es **obligatorio en el puerto** (la prueba lo declara opcional solo por el casteo previo a implementar); `null-scene-adapters.ts` y los tres repositorios se ajustan.
- Escritura: en la **misma** sentencia que fija `provider_call_started_at` (atómica; sin ventana donde exista la marca sin modelo/región). Los valores son los que el caso de uso **leyó una vez** (lectura en caliente) y los mismos que usa para componer la llamada al adaptador: un reintento usa la configuración de **su** marca (`EDGE-009-045`).
- `SceneAttemptRecord`: `providerModel` y `providerLocation`. **Tipo propuesto: `readonly providerModel?: string | null` y `readonly providerLocation?: string | null`** (opcionales en el tipo; los repositorios devuelven siempre `string` o `null` explícito, nunca `undefined`). Razón: la prueba roja `t1295` y ≥ 8 pruebas existentes de 006/009 (`t834`, `t835`, `t851`, `t853`, `t855`, `t862` ×2, `t1207`, `t1208`, `t1279`) construyen `SceneAttemptRecord` sin esos campos; hacerlos obligatorios rompería `tsc` en todas sin cambio de comportamiento. Alternativa descartada: obligatorios + editar las fixtures (más ruido sobre pruebas firmadas). Si `/oracle` prefiere obligatorios, es un ajuste mecánico de fixtures.
- Migración (`T1298`, Nivel 2): `ALTER TABLE scene_attempts ADD COLUMN provider_model TEXT` y `... provider_location TEXT`, **nulables y sin `DEFAULT`** (las pruebas lo exigen), paridad SQLite/Postgres. `scene-row-mappers.ts` mapea `null` explícito. Sin identificadores de usuario/hogar/mascota ni prompt en estas columnas (obs. O-1/O-2 de `/rama`); `provider_location` guarda solo el código de región (nunca el host).
- Retención: sigue la fila (30 días); sin política propia (acta de rama, punto (a)).

## 4.4 Resumen del dictamen de contrato

| Elemento | Veredicto |
|---|---|
| `PROMPT_BLOCK_NAMES` (6, orden fijo) | CONFIRMADO |
| `RECOGNIZED_MARKERS = ['{photoRef}']` | CONFIRMADO |
| `DEFAULT_PROMPT_BLOCKS` (semilla byte a byte) | CONFIRMADO con A-1 (constantes se mueven a `prompt-blocks.ts`, re-export) |
| `validatePromptBlocks(raw, maxBlockLength)` | CONFIRMADO con A-2, A-3, A-4; abierto `H-5a-01` (A-5) |
| `buildImagePrompt(payload, blocks?)` | CONFIRMADO con A-6 |
| `markProviderCall(id, now, {model, location})` | CONFIRMADO, tercer parámetro obligatorio en el puerto |
| `providerModel` / `providerLocation` en `SceneAttemptRecord` | CONFIRMADO como opcionales en el tipo, `null` explícito en datos |

---

# Observaciones y dudas

## Dudas para Neo (Nivel 2) — cuando se vaya a firmar `T1255`

- **D-1.** `gemini-2.5-flash-image` (deprecado por Google, retiro 2027-03-15): ¿se mantiene en la lista con vigencia hasta esa fecha (opción A, recomendada) o se quita ahora? Si se mantiene, ¿se abre desde ya una tarea para cambiar el defecto de producción antes de esa fecha?
- **D-2.** Unidad del coste del Anexo A: «USD por intento como cota superior (salida + entradas máximas)». ¿Aprueba esa definición o prefiere otra (por imagen de salida solo)? Cambia cómo `/link` documenta la fuente.
- **D-3.** `EDGE-009-044` dice «sin la instrucción de preservación» pero la regla verificable por máquina es «no vacío». ¿Acepta ese criterio o quiere una verificación adicional (p. ej. contenido mínimo)?
- **D-4 (ya conocida, recordatorio).** La habilitación de `global` sigue FAIL; sus condiciones 2 (transferencia internacional y `D-28`) y 3 (texto del aviso) son de Neo.

## Hallazgos para Morpheus

- **H-5b-01.** Modelo deprecado como defecto de producción: tarea nueva con fecha límite antes de 2027-03-15 (no creada).
- **H-5b-02.** `T1265` debe consumir `SCENE_GLOBAL_LOCATION_ENABLED` (constante de código, Parte 2.1) y no una fila de BD; actualizar su descripción cuando se firme.
- **H-5a-01 (abierto desde 5a).** Límite `maxLength: 200` de 005 frente al JSON de 6 bloques; decisión necesaria antes de `T1303` y de la escritura de `scene.prompt.blocks` desde `/admin`.
- **H-5b-03.** `T1301` sigue bloqueado; mientras tanto el Anexo A, `T1254` y `T1300` quedan en `DRAFT`, `T1255` no puede ejecutarse y la edición de modelo, región y `scene.global_quota_max` desde `/admin` permanece cerrada.
- **H-5b-04.** Los textos de `T1254` y `T1299` dicen «2026-11-XX [fecha de la firma]»: se rellena al firmar.

## Estado de las tareas (techo del agente = `REVIEW`; no se marca nada)

| Tarea | Estado tras este acta |
|---|---|
| T1254 | Borrador `DRAFT` completo salvo cifras del Anexo A (esperan `T1301`) |
| T1255 | Sin ejecutar (Neo; bloqueada por C1, C2, C3) |
| T1299 | Borrador `DRAFT` (declaración de no habilitación + condiciones 1..8) |
| T1300 | Regla `DRAFT` completa; valores de tabla esperan `T1301` |
| Contrato prompt-blocks / markProviderCall | Dictamen emitido (confirmado con A-1..A-6); `/keymaker` puede implementar contra él en 5b cuando Morpheus lo autorice |
