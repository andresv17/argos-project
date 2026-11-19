# Oracle 006 — Auditoria T899 del tramo `gemini-api` (T889..T898)

Fecha: 2026-11-18. Rama `006-escena-hogar-pixel-art`. Auditoria forense en disco; no se modifico codigo ni `tasks.md`; sin commit. Veredicto: **PASS CON OBSERVACIONES**.

## Evidencia verificada (propia, no del informe del keymaker)
- `bash scripts/verify-traceability.sh --feature 006`: rc=0, CUMPLE (205/205 IDs propios; pureza 0 violaciones).
- `npx tsc --noEmit`: rc=0.
- `vitest run` de los 5 `gemini-api-*.spec.ts` + guarda T879 + `app-config.spec.ts` + `t829`: 8 archivos, 218 pruebas, todas pasan.
- `npm run test:gate` NO repetido: evidencia del orquestador (PG 17 real: 319 archivos, 4959 pasan, 1 omitida). Los 4759/201 omitidas del informe del keymaker eran sin PG; no son la referencia.
- `git diff` de `package.json` y `package-lock.json`: vacio. `terraform/`, `.github/`, `src/generated/` sin cambios. `GEMINI_API_KEY` ausente de `terraform/` y `.github/`.

## Seguridad
- Clave solo en cabecera `x-goog-api-key` (`GEMINI_API_KEY_HEADER`); URL = `geminiGenerateUrl(model)` sin `?`; ninguna aparicion de `key=` en codigo del adaptador. Host/ruta constantes (anti-SSRF), modelo validado por patron `gemini-...` sin `/ ? ..`. `redirect:'error'`, 1 sola llamada, sin reintento.
- Clave en campo `#apiKey` (no sale en `util.inspect`) y `toJSON()` vacio; `geminiApiKey` en `SceneConfig` es NO enumerable. Errores del adaptador sin valores; el cuerpo de error del proveedor se cancela, no se lee. Sin `console.*` en el adaptador.
- `git grep AIza -- ':!tests'`: solo `scripts/scan-secrets.mjs` (patron), `cloud-logging.ts` (patron de redaccion), spec/tasks/logs (texto). Ninguna clave real. `.env`: ignorado (`.gitignore:7`), 0 archivos rastreados; no se leyo.
- Tests sin red real: todos usan `fetch` simulado; el unico acceso al global es `vi.stubGlobal('fetch', double)`; 0 usos de `node:http/https/net`.
- Produccion: `app-config.ts` rechaza todo driver distinto de `real` con `NODE_ENV=production` (fake y gemini-api nombran solo `ARGOS_SCENE_DRIVER`); `real` sigue exigiendo `SCENE_REAL_DRIVER_ACTIVATED` (sigue false) y `composeSceneServices` lanza para `real`. La clave/modelo solo se validan y exponen si `gemini-api` y no produccion.
- SC-ESC6-101: guarda T879 con lista blanca de 2 rutas; el literal `generativelanguage.googleapis.com` y la clase `GeminiApiSceneImageGenerator` solo en esos archivos; `scene-composition.ts` usa la fabrica `createGeminiApiSceneGenerator` (no nombra la clase). `aiplatform.googleapis.com`, SDK de IA y `google-auth-library` siguen prohibidos.

## Consentimiento (INV-ESC6-014)
- `gemini-api` fija `realDriver: true`, `providerId='gemini-api'`, `noticeVersion='gemini-api-draft-1'`, despachador en proceso, tope de referencias 13 MiB. Las pruebas de composicion (12) cubren 0 llamadas sin consentimiento vigente o con version/proveedor antiguos y cancelacion en vuelo.
- Aviso BORRADOR: declara region, retencion y entrenamiento «pendientes de confirmar»; no afirma region ni retencion sin fuente (REQ-ESC6-028). `consentStep` marca OUTDATED cualquier par proveedor/version desconocido.

## Observaciones (no bloqueantes)
1. Discrepancia menor de informe: el keymaker declara 24 pruebas en `gemini-api-scene-generator.spec.ts`; en disco son 22. Total del tramo coherente (suite verde); sin impacto.
2. El adaptador lee `response.text()` completo antes de comparar `text.length` con el limite cuando no hay `content-length`: el tope solo es efectivo con cabecera. Aceptable para uso local privado con una API de confianza; no apto como base para produccion.
3. Se tocaron `app-config.spec.ts` y `t829` solo para anadir `geminiModel: null` (confirmado en diff); `SceneConsent.tsx` cambia firma con `sections` opcional (retrocompatible). Archivos ajenos (`.gitignore` +`.superdesign`, `.claude/skills/superdesign/`) fuera del tramo.
4. Cobertura mutacional de los archivos nuevos no verificada aqui (fuera del alcance de T899).

## Pendientes explicitos para Neo (T900 [HUM])
1. `ARGOS_SCENE_GEMINI_MODEL` NO tiene defecto (por SC-ESC6-097): Neo debe fijarlo en su `.env`.
2. `responseModalities: ['IMAGE']` no verificado contra la API (alternativa `['TEXT','IMAGE']` solo inyectable, no cableada a configuracion).
3. Limites inline (18 MiB JSON, 13 MiB de referencias) no verificados con la API.
4. Terminos de datos de la Developer API (retencion, entrenamiento, region) sin fuente: usar solo imagenes de prueba hasta verificarlos (REQ-ESC6-028); texto del aviso pendiente de su firma (REQ-ESC6-026).
5. Tope de gasto (5 USD/mes) solo de consola; el codigo no lo impone.
6. Constitucion 3.7.0 sigue en borrador hasta su firma; T885 sigue bloqueada y `real` inactivo.

T889..T900 permanecen `[ ]`; techo REVIEW; solo Neo marca `COMPLETED`.
