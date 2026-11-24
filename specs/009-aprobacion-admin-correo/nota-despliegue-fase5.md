# Nota de despliegue — 009 Fase 5 (runbook para /link)

- Feature: `009-aprobacion-admin-correo` (Fase 5a + 5b, GH:#20)
- Origen: OBS-1 de `.specify/memory/audits/oracle-009-T1272-fase5.md` (PASS CON OBS, 2026-11-23)
- Estado: DOCUMENTACIÓN. Este runbook no ejecuta nada, no cambia código, contratos ni infraestructura.
- Autoridad: los cambios de cuota, modelo, región y la habilitación de `global` son decisiones de Nivel 2 (Neo). Ningún agente marca `[x]`, `APPROVED` ni `LOCKED`.

## Hechos de referencia (verificados en disco)

| Concepto | Valor | Fuente |
|---|---|---|
| Defecto de cuota global | `scene.global_quota_max` = 5 | `src/domain/scene/provider-parameters.ts` (`SCENE_DEFAULT_GLOBAL_QUOTA_MAX`) |
| Defecto de modelo | `gemini-2.5-flash-image` | `SCENE_DEFAULT_MODEL` |
| Defecto de región | `us-central1` | `SCENE_DEFAULT_LOCATION` |
| Techo derivado de la cuota | `floor(5_000_000 / 45_000)` = 111 | Constitución 3.10.0, Anexo A y Enmienda 009-B |
| Pares seleccionables | `gemini-2.5-flash-image` y `gemini-3.1-flash-image` en `us-central1` (45_000 y 75_000 µUSD por intento) | Constitución 3.10.0, Anexo A |
| `gemini-3-pro-image` | En la lista cerrada, pero sin celda regional verificada (solo `global`); no seleccionable | Constitución 3.10.0, Anexo A |
| Región `global` | `SCENE_GLOBAL_LOCATION_ENABLED = false`; fuera de `SCENE_ALLOWED_LOCATIONS` | `provider-parameters.ts` |
| Retiro de `gemini-2.5-flash-image` | 2027-03-15 | Constitución 3.10.0, cláusula (h) |
| Deuda de defecto de modelo | `DEUDA-009-MODEL-DEFAULT-2027`, fecha límite 2027-02-01 | Constitución 3.10.0 |
| Clave de cuota global en BD | `scene.global_quota_max`, tabla `platform_parameters` (columnas `key`, `value`, `description`, `updated_at`, `updated_by_user_id`) | `src/infrastructure/persistence/{postgres,sqlite}/migrations/0007` y `0011` |

Nota: `ARGOS_SCENE_QUOTA_MAX` (defecto 10) es la cuota **por usuario** y no es la cuota global. No confundir ambas variables.

## Puntos obligatorios

### (a) No fijar variables de cuota, modelo ni región distintas de los defectos de código

- No definir `ARGOS_SCENE_GLOBAL_QUOTA_MAX`, `ARGOS_SCENE_MODEL` ni `ARGOS_SCENE_LOCATION` con valores distintos de los defectos (5, `gemini-2.5-flash-image`, `us-central1`).
- La cuota, el modelo y la región se gestionan solo desde `/admin` (fila de `platform_parameters`, que prevalece sobre el entorno).
- Observación para Morpheus: `.github/workflows/deploy-argos.yml` (línea 247) fija hoy `ARGOS_SCENE_MODEL=gemini-2.5-flash-image` y `ARGOS_SCENE_LOCATION=us-central1` en `--set-env-vars`. Son iguales a los defectos, así que cumplen la letra de (a), pero contradicen su espíritu porque duplican la fuente de verdad. Se recomienda que Neo decida retirarlas en un cambio aparte. Este runbook no modifica el workflow. `ARGOS_SCENE_GLOBAL_QUOTA_MAX` no aparece en el workflow, lo cual es correcto.

### (b) Verificación previa a desplegar en la BD de producción

Antes de desplegar, comprobar con una consulta de solo lectura que `scene.global_quota_max` no tiene un valor fuera de rango:

```sql
SELECT key, value, updated_at, updated_by_user_id
FROM platform_parameters
WHERE key = 'scene.global_quota_max';
```

- Resultado aceptable: fila ausente (aplica el defecto 5) o un entero entre 1 y 111.
- Resultado bloqueante: cualquier valor **mayor que 111**. La condición real del parser es `<= 111`, no solo «112 a 1000»: el parser rechaza también 112..1000 y cualquier valor superior. Con valor bloqueante, el arranque se rechaza (fallo cerrado; la escena responde con error en lugar de degradar).
- Si el resultado es bloqueante, no desplegar. Corregir el valor solo desde `/admin` por Neo o por quien tenga autorización, y repetir la consulta.
- Ejecutar la consulta en el mismo entorno y motor de producción que usa el despliegue (Neon PostgreSQL, adaptador `postgres`).

### (c) No escribir modelo ni región por SQL con pares fuera del Anexo A

- Prohibido escribir `scene.provider_model` o `scene.provider_location` por SQL directo.
- Si hiciera falta un cambio, solo son válidos los pares del Anexo A: `gemini-2.5-flash-image` + `us-central1` y `gemini-3.1-flash-image` + `us-central1`.
- Cualquier otro par (incluido `gemini-3-pro-image`, `global` o cualquier región distinta de `us-central1`) no es seleccionable y debe rechazarse. La vía aprobada de escritura es `/admin`, que aplica la regla de coste.

### (d) Variable del worker de escena (ya cubierta por 009)

- `ARGOS_SCENE_WORKER_URL` se deriva de `OIDC_AUDIENCE` (`${OIDC_AUDIENCE}/internal/scene-worker`) en `deploy-argos.yml`, no de `PUBLIC_BASE_URL`. Ya está corregido (INV-ESC6-018, 2026-11-23).
- No hace falta acción manual. No sobrescribir `ARGOS_SCENE_WORKER_URL` ni `ARGOS_OIDC_AUDIENCE` a mano.

### (e) Retiro de gemini-2.5-flash-image el 2027-03-15

- `gemini-2.5-flash-image` está deprecado por el proveedor con retiro el **2027-03-15**. La Enmienda 009-B lo mantiene en la lista solo hasta esa fecha.
- Deuda `DEUDA-009-MODEL-DEFAULT-2027`: cambiar el defecto de `scene.provider_model` y su semilla antes del **2027-02-01**. Ese cambio requiere trabajo de `/keymaker` con su compuerta, y el nuevo par debe estar en el Anexo A. No se hace en esta nota.
- Mientras tanto, no cambiar el modelo por SQL (ver (c)).

### (f) Región global oculta y sin habilitar

- `SCENE_GLOBAL_LOCATION_ENABLED = false`. `global` no aparece en `/admin` ni en las listas activas.
- Habilitarla exige una decisión de Nivel 2 de Neo, el dictamen de ubicación de `/rama` (`T1294`), la enmienda versionada de 006 (`T1299`) y tarifa propia en `T1301`.
- Aviso: `T1294` figura como `[x]` en `tasks.md`, pero la nota de `T1299` deja abiertas las condiciones 1..8 de `global`. Antes de cualquier habilitación hay que revisar ese estado completo, no solo `T1294`.
- No habilitar en esta nota ni en el despliegue.

## Lista de verificación previa al despliegue

1. Consulta de (b) ejecutada y resultado aceptable (fila ausente o 1..111).
2. Ninguna variable `ARGOS_SCENE_GLOBAL_QUOTA_MAX`, `ARGOS_SCENE_MODEL` ni `ARGOS_SCENE_LOCATION` añadida fuera de los defectos (ver (a)).
3. Ningún UPDATE/INSERT sobre `platform_parameters` para modelo o región (ver (c)).
4. `SCENE_GLOBAL_LOCATION_ENABLED` sigue en `false`.
5. Las migraciones de `scene_attempts` (PG 0019 y sqlite 0023) están commiteadas junto con el código que las usa (condición de `oracle-009-5b-T1296-final` / `T1298`).

## Riesgos residuales (de la auditoría)

- OBS-3 (ola 4, `oracle-009-5b-T1296-final`): `assertSpendRule` usa el defecto del catálogo, no el valor de entorno. Con `ARGOS_SCENE_GLOBAL_QUOTA_MAX=111` y modelo `gemini-3.1-flash-image`, el gasto supera el tope (8_325_000 > 5_000_000 µUSD). Por eso no fijar esa variable (ver (a)).
- OBS-2 (auditoría T1272): no hay comprobación del par en tiempo de ejecución, solo al guardar en `/admin`. Una fila escrita por SQL fuera de `/admin` no se bloquea al generar. Se mitiga con (c).
- OBS-3 (auditoría T1272): flake de Playwright (ENOENT de traza) en t1270; no afecta al despliegue.

## Fuera de alcance de esta nota

- No ejecutar `terraform`, `gcloud` ni `git push`.
- No modificar `src/`, `tests/`, contratos, ni `deploy-argos.yml`.
- No marcar `[x]`, `APPROVED` ni `LOCKED`.
