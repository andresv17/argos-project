# Acta Trinity — Feature 006, Fase 14 (T955, parte seguridad): token del metadata server y adaptador Vertex

Fecha: 2026-11-20 · Autor: /trinity · Alcance: `src/infrastructure/adapters/metadata-token-client.ts`, `src/infrastructure/adapters/vertex-scene-image-generator.adapter.ts` (+ composicion y tests T945 en lectura). Sin edicion de specs/src/tests. `.env` no leido.

## Dictamen: PASS CON OBS (0 CRITICO, 0 ALTO, 0 MEDIO, 1 BAJO, 3 OBS)

## Matriz de controles
| Control | Resultado | Evidencia |
|---|---|---|
| Token solo del metadata server (sin claves, sin SDK) | PASS | URL constante `METADATA_TOKEN_URL`, `Metadata-Flavor: Google`, `redirect:'error'`; sin `google-auth-library`, sin `process.env`, sin `console.*` en ambos archivos (T945 lo prueba) |
| Cache: vencimiento anticipado 60 s, tope 55 min | PASS | `Math.min(expires_in*1000, 55 min) - 60 s`; si <=0 no se cachea; `#` privado por instancia |
| Token no sale en logs ni errores | PASS | errores del cliente son literales sin datos; el adaptador captura todo y devuelve solo `ERR-SCENE-*`; `toJSON()` devuelve `{}`; T945 (l.231-258, 317-322) prueba que ni resultado ni dump contienen el token |
| Validacion del token | PASS | `^[\x21-\x7e]{1,4096}$` (sin CR/LF: bloquea inyeccion de cabecera); `$` de JS sin flag `m` |
| AbortSignal propagado | PASS | una sola `AbortController` (T_GEN + senal de peticion) cubre token (`getAccessToken(controller.signal)`) y proveedor; se re-comprueba `aborted` entre ambos; listener y timer se limpian en `finally` |
| Sin inyeccion en la ruta | PASS | `projectId` regex `^[a-z][a-z0-9-]{4,28}[a-z0-9]$` (6..30, sin `.`, `/`, `?`, `#`); `location` por lista cerrada `SCENE_ALLOWED_LOCATIONS` (misma lista rige en app-config); `model` regex `^gemini-[A-Za-z0-9][A-Za-z0-9._-]{0,56}$` sin `..`; mensajes de error sin valores |
| Errores tipados, sin eco del cuerpo | PASS | `!response.ok` -> `body.cancel()` y `FAILED`; nunca se lee el cuerpo de error; sin reintento interno |
| Sin `x-goog-api-key` | PASS | `grep` en `src/`: solo `gemini-api-wire.ts` (driver local) y el patron de redaccion de `cloud-logging.ts`; el adaptador Vertex usa `authorization: Bearer` |
| SSRF / host fijo | PASS | host = `{location}-aiplatform.googleapis.com` con `location` cerrada; https; `redirect:'error'`; la URL se construye una sola vez en el constructor |
| Tope de lectura de respuesta | PASS | `content-length` y `text.length` contra `readLimit` |
| Token ausente de fixtures/tests exportados | PASS | solo literales sinteticos (`ya29.TOKEN-SENTINEL-DE-PRUEBA`, marcado `argos-scan:allow`) en `t945` y `t873`; `scan-secrets.mjs repo` = 0 hallazgos |

## Hallazgos
- **H-F14-T1 [BAJO]** `getAccessToken` sin simple-flight: dos generaciones concurrentes con cache fria piden dos tokens (inocuo; coste nulo). Opcional: memoizar la promesa en vuelo.
- **H-F14-T2 [OBS]** `response.json()` del metadata server sin tope de bytes y un `SyntaxError` nativo puede citar un fragmento del cuerpo si el JSON es invalido. Hoy el unico consumidor (el adaptador) lo traga en su `catch`, asi que no hay fuga; si el cliente se reutiliza, envolver el parseo en `try/catch` con el mensaje literal.
- **H-F14-T3 [OBS]** `cloud-logging.ts` redacta `AIza...` y `x-goog-api-key` pero no un patron de token OAuth2 (`ya29.`, `Bearer ...`). Defensa en profundidad: hoy el token no llega a ningun registro; anadir el patron seria endurecimiento (tarea futura, no bloquea).
- **H-F14-T4 [OBS]** El metadata server se consulta por HTTP plano (`metadata.google.internal`), que es el contrato de Cloud Run; mitigado por host constante y `redirect:'error'`. Sin accion.

## SAST
- `semgrep`: no instalado (`which semgrep` vacio) y el repo no define script ni reglas (`tests/security/sast-rules/` inexistente, sin script en `package.json`). No se instalo nada (sin dependencias nuevas).
- Sustituto ejecutado: `node scripts/scan-secrets.mjs repo` -> `0 hallazgos`; `npx tsc --noEmit` -> sin salida (rc 0); busqueda de `eval(`, `new Function`, `child_process`, `innerHTML` en los dos archivos -> 0 coincidencias.

## Limites
Techo de agente = REVIEW. T945/T946/T955 siguen `[ ]`; solo Neo marca COMPLETED. T885 sigue bloqueada.
