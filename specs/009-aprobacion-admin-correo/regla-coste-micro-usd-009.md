# Regla de coste en micro-USD enteros (T1300) — Feature 009

- Estado: **`DRAFT`** (sin `APPROVED` ni `LOCKED`). Autor: `/architect`, 2026-11-23, HEAD dc535bd. Decisiones de Neo (Nivel 2) aplicadas: `D-2` (unidad y cifras) y `D-3`.
- Traza: `T1300`, `P5-02` = A, `D9-21` = A corregida, `D9-22` = A, `REQ-CFG9-004`, `NFR-009-003`, `EDGE-009-036`, `EDGE-009-045`, `SC-009-051`. Anexo A de la Enmienda 009-B (`.specify/memory/constitution.md`, `DRAFT` 3.10.0).
- Desarrollo extendido y ejemplos: `.specify/memory/audits/architect-009-5b-borradores.md` Parte 3 (este documento es la versión normativa breve y prevalece sobre ella donde difieran).

## 1. Unidad

- Coste `T[m, r]` = **micro-USD enteros por intento** (1 USD = 1 000 000), **cota superior** (imagen de salida a la resolución fija de la plataforma + entradas máximas por intento), **redondeado hacia arriba**. Sin `Number` de punto flotante en el cálculo; sin conversión a COP en código.
- **Sin cifras de coste** por orden de Morpheus (2026-11-23): cotas de la directiva D-2: no transcritas aquí; se llenan con tarifa oficial de Vertex (T1301 pendiente). `T1301` deja las tarifas `NO VERIFICADA (pendiente tarifa oficial Vertex)`. Un par modelo × región solo es seleccionable cuando su celda del Anexo A tenga valor con fuente y disponibilidad verificada.
- `TOPE_USD` = 5, es decir `TOPE_MICRO` = 5_000_000 (constante de la Enmienda 009-B; no editable desde `/admin`).

## 2. Regla de guardado (fórmula)

Se evalúa en el servidor, antes de escribir y sin escribir si falla (422 `ERR-SCHEMA-VALIDATION-FAILED`, sin valor en el cuerpo), cuando cambia `scene.provider_model`, `scene.provider_location` o `scene.global_quota_max`. Con los valores resultantes `m'`, `r'`, `max'`:

```
Seleccionable(m', r')            // T[m', r'] definido; global solo si SCENE_GLOBAL_LOCATION_ENABLED = true
gastoAcumuladoMes + max(0, max' − usadas) × T[m', r']  ≤  5_000_000
```

- `gastoAcumuladoMes` = Σ de `T[provider_model, provider_location]` sobre los intentos del mes (`America/Bogota`, `quota_window` = `YYYY-MM`) con `provider_call_started_at` no nulo; si `provider_model`/`provider_location` son nulos (filas previas a `T1298`) o el par ya no figura en la tabla, se valora con `costeMax` (cota conservadora).
- Un intento con llamada ejecutada y resultado fallido cuenta completo; los cerrados antes del proveedor no cuentan.

## 3. Techo de `scene.global_quota_max`

```
techo = floor( 5_000_000 / costeMin )      // costeMin = mínimo de T sobre los pares seleccionables
```

- El valor numérico del techo queda **sin determinar** hasta que exista tarifa oficial.
- Sustituye y **elimina** `SCENE_GLOBAL_QUOTA_MAX_CEILING = 1000`. El defecto de `scene.global_quota_max` debe ser ≤ `techo` (`T1296` lo verifica con la tabla real).
- El techo es una cota de entrada más débil; la garantía real del tope es la fórmula de la sección 2 con el par efectivo.

## 4. Fail-closed

- Sin ningún par seleccionable: `costeMin` y `techo` no existen y `scene.global_quota_max`, el modelo y la región **no son editables** desde `/admin` (422, sin escribir). No se cae a 1000 ni a otro valor.
- Un par con fila en BD no seleccionable no rige: rige el defecto de código con aviso sin valor (`INV-CFG9-003`); el rechazo aplica en `/admin`, al leer BD y en el adaptador (`INV-CFG9-001`).
- Falta de dato (nulo, par ausente, error de lectura del gasto) = rechazo, nunca aceptación.

## 5. Reinicio no reduce el gasto

`resetAdminSceneQuota` (ADR-009-13) pone a cero `consumed_generations` de la cuenta pero **no reduce `gastoAcumuladoMes` ni `scene.global_quota_used`**: el gasto de plataforma (dinero) y las imágenes por cuenta son contadores distintos. Ninguna acción de `/admin` devuelve crédito de gasto del mes.

## 6. Criterio de bloque `EDGE-009-044` (`D-3`)

Un bloque de prompt es válido si `trim().length >= 1` y `<= maxBlockLength` (1000); la emisión única de `PRESERVATION_BLOCK` se impone en código, no en el JSON editable.

## 7. Estado y dependencias

`DRAFT`. Dep. `T1278`, `T1256`, `T1301` (cifras con fuente: pendiente, sin cifras provisionales). `T1292` y `T1296` usan costes de configuración de prueba propios, nunca cifras de producción, hasta `T1301`.
