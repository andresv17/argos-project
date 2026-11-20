# Keymaker 006 — Tramo `gemini-api` (T889..T898), entrega a REVIEW

Fecha: 2026-11-18. Rama `006-escena-hogar-pixel-art`. Sin commit, sin push, sin `[x]`/`COMPLETED`. No se leyó `.env` ni ninguna clave; todas las pruebas usan una clave sintética con prefijo de centinela de prueba (valor omitido para no activar el escáner de secretos) y `fetch` simulado (0 red).

## Tareas (pruebas rojas primero, luego verde)
- T889: guarda T879 ajustada con lista blanca por ruta (`gemini-api-scene-image-generator.adapter.ts`, `gemini-api-wire.ts`); siguen prohibidos `aiplatform.googleapis.com`, SDK de IA y `google-auth-library`; nueva `tests/unit/gemini-api-aislamiento-escena-006.spec.ts` (4).
- T890/T891: `tests/unit/gemini-api-config-escena-006.spec.ts` (10; 7 rojas antes) y `app-config.ts` (enum de 3 valores, `GEMINI_API_KEY` 20..256 visibles sin espacios, `ARGOS_SCENE_GEMINI_MODEL` `gemini-...`; `geminiApiKey` NO enumerable).
- T892/T893: `tests/unit/gemini-api-scene-generator.spec.ts` (24) y `gemini-api-wire.ts` + `GeminiApiSceneImageGenerator` (fetch nativo, `x-goog-api-key`, `redirect:'error'`, 1 sola llamada, timeout propio, firma PNG/WebP, sin eco).
- T894/T895: `tests/unit/gemini-api-composicion-escena-006.spec.ts` (12), `scene-composition.ts`, `domain/scene/notice.ts`, `presentation/web/scene-notice.ts` y `SceneConsent.tsx` (aviso BORRADOR propio, `providerId='gemini-api'`, `noticeVersion='gemini-api-draft-1'`).
- T896: `tests/unit/gemini-api-no-fuga-escena-006.spec.ts` (10); halló que `util.inspect` mostraba la clave del adaptador: corregido con `#apiKey`.
- T897: `.env.example` con `# GEMINI_API_KEY=` y `# ARGOS_SCENE_GEMINI_MODEL=` comentadas y sin valor; `git check-ignore .env` imprime `.env`.

## Compuertas
- `npx tsc --noEmit`: rc 0.
- `npm run test:gate`: rc 0; 316 archivos pasan, 3 omitidos (319); 4759 pasan, 201 omitidas, 0 fallidas. Las 201 omitidas son las de PostgreSQL (PG en 127.0.0.1:55432 NO estaba levantado; la corrida previa con PG real fue 4900/1 omitida). Cobertura 98.83 / 95.46. Trazabilidad 002, 003, 006 CUMPLE; verify-oracles 369 archivos, 0 débiles.
- `bash scripts/verify-traceability.sh --feature 006`: rc 0, CUMPLE (205/205 IDs propios).
- `package.json`, lock, `terraform/`, `.github/`, `src/generated/`, `specs/**/contracts`: sin diff.

## Desviaciones y puntos para /oracle y Neo
1. `ARGOS_SCENE_GEMINI_MODEL` NO tiene valor por defecto: SC-ESC6-097/T890 exigen que su ausencia falle nombrándola (el encargo decía «con defecto válido»; prevaleció la spec). Neo debe fijarlo en su `.env`.
2. Se tocaron dos pruebas existentes solo para añadir `geminiModel: null` al objeto esperado de `SceneConfig`: `tests/unit/app-config.spec.ts` y `tests/unit/t829-app-config-escena-006.spec.ts`.
3. UI: `SceneConsent.tsx` recibe `sections` opcional (defecto = aviso Vertex) y `consentBody(providerId)`; el texto de gemini-api es BORRADOR y declara «pendiente de confirmar» región, retención y entrenamiento (sin fuente en disco, REQ-ESC6-028). Firma legal: Neo (T900).
4. No verificados por falta de red: `responseModalities: ['IMAGE']` por defecto (alternativa `['TEXT','IMAGE']` inyectable, no cableada a config), tope inline 18 MiB y tope de referencias de 13 MiB para este driver.
5. Archivos ajenos aparecidos durante la sesión y NO míos: `.gitignore` (`+.superdesign`) y `.claude/skills/superdesign/`.
6. Sin PG real en esta corrida: se recomienda a /oracle repetir `test:gate` con `TEST_DATABASE_URL` si quiere paridad con 4900.

## Archivos
Creados: `src/infrastructure/adapters/gemini-api-scene-image-generator.adapter.ts`, `src/infrastructure/adapters/gemini-api-wire.ts`, `tests/unit/gemini-api-{aislamiento,composicion,config,no-fuga}-escena-006.spec.ts`, `tests/unit/gemini-api-scene-generator.spec.ts`, este informe.
Modificados: `src/infrastructure/config/app-config.ts`, `src/infrastructure/http/scene-composition.ts`, `src/domain/scene/notice.ts`, `src/presentation/web/scene-notice.ts`, `src/presentation/web/components/SceneConsent.tsx`, `.env.example`, `tests/unit/guarda-driver-real-escena-006.spec.ts`, `tests/unit/app-config.spec.ts`, `tests/unit/t829-app-config-escena-006.spec.ts`, `claude/log-keymaker.md`, `claude/registro-proceso-argos.md`.
