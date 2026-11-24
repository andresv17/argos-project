# Regla de coste en micro-USD enteros (T1300) — Feature 009

- Estado: **`APROBADA` como parte de la Enmienda 009-B (3.10.0)** (`APPROVED` por Neo, Nivel 2, 2026-11-23, `T1255`; esta regla no tiene aprobación propia ni `LOCKED`). Autor: `/architect`, 2026-11-23, HEAD dc535bd. Decisiones de Neo (Nivel 2) aplicadas: `D-2` (unidad y cifras) y `D-3`.
- Traza: `T1300`, `P5-02` = A, `D9-21` = A corregida, `D9-22` = A, `REQ-CFG9-004`, `NFR-009-003`, `EDGE-009-036`, `EDGE-009-045`, `SC-009-051`. Anexo A de la Enmienda 009-B (`.specify/memory/constitution.md`, `APPROVED` 3.10.0).
- Desarrollo extendido y ejemplos: `.specify/memory/audits/architect-009-5b-borradores.md` Parte 3 (este documento es la versión normativa breve y prevalece sobre ella donde difieran).

## 1. Unidad

- Coste `T[m, r]` = **micro-USD enteros por intento** (1 USD = 1 000 000), **cota superior** (imagen de salida a la resolución fija de la plataforma + entradas máximas por intento), **redondeado hacia arriba**. Sin `Number` de punto flotante en el cálculo; sin conversión a COP en código.
- **Cifras de coste** (fuente única: Anexo A de la Enmienda 009-B, `.specify/memory/constitution.md`, `APPROVED` 3.10.0; esta regla no las modifica, cambiarlas exige autorización de Nivel 2):

| Región | `gemini-2.5-flash-image` | `gemini-3.1-flash-image` | `gemini-3-pro-image` |
|---|---|---|---|
| `us-central1` | `45_000` µUSD por intento | `75_000` µUSD por intento | no seleccionable (solo `global`) |

- `gemini-3-pro-image` solo existe en `global`, región **fuera de la Enmienda** (`SCENE_GLOBAL_LOCATION_ENABLED = false`): su referencia conservadora `158_160` µUSD no habilita ninguna celda. Habilitar `global` exige decisión posterior de Nivel 2 (dictamen de `/rama`, enmienda de la feature 006, `T1299`). Un par sin celda con valor en el Anexo A no es seleccionable (fail-closed).
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

- Con la tabla vigente `costeMin = 45_000` y el techo es `111` imágenes/mes (valor fijado por la Enmienda 009-B, Anexo A).
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

`APROBADA` con la Enmienda 009-B (3.10.0). Dep. `T1278`, `T1256`. `T1292` y `T1296` pueden usar costes de configuración de prueba propios; las cifras de producción son las del Anexo A citado arriba.
