# Acta /merovingian — Feature 006, Fase 14 (T955, parte cadena de suministro)

- **Fecha**: 2026-11-20
- **Autor**: `/merovingian` (subagente, modelo haiku)
- **Base de comparación**: HEAD `8dea731` (`feat(006): fase 13 ...`), rama `006-escena-hogar-pixel-art`
- **Alcance**: solo lectura. Sin edición de specs, `src/`, `tests/`; sin instalación de paquetes; sin commit; sin push; sin marcas `[x]`.
- **Fuentes**: `spec.md` (D6-22, D6-23 (f), N2-01 sustituido, SC-ESC6-042, SC-ESC6-050), `plan.md` (§5.8, ADR-006-21), `tasks.md` (T945, T946, T955, T960 E1).

## Dictamen

**PASS CON OBS**

E1 («0 dependencias npm nuevas») **se cumple literalmente** en el estado de disco de HEAD `8dea731`.

## Verificaciones

| # | Control | Evidencia en disco | Resultado |
|---|---------|--------------------|-----------|
| 1 | `package.json` y `package-lock.json` sin cambios | `git diff 8dea731 -- package.json package-lock.json` vacío; `git status --short` sin líneas para ambos. Bloques `dependencies` (13) y `devDependencies` (28) sin entradas nuevas respecto a HEAD | PASS |
| 2 | Cero imports nuevos de paquetes externos | Sobre los 9 archivos de la Fase 14 (`vertex-scene-image-generator.adapter.ts`, `metadata-token-client.ts`, `domain/scene/provider-parameters.ts`, `persistence/scene-global-quota.ts`, `config/scene-provider-parameters.ts`, `domain/scene/notice.ts`, `presentation/web/scene-notice.ts`, más `gemini-api-wire.ts` e `image-metadata-stripper.ts`): ningún `import`/`export ... from`/`require`/`import()` con especificador no relativo. Sin `google-auth-library`, `@google/genai`, `googleapis`, `sharp`, `jimp`, `exif`, `gcp-metadata` | PASS |
| 3 | Reutilización por importación, sin copia | `vertex-scene-image-generator.adapter.ts` línea 14-22 importa `GEMINI_INLINE_MAX_BYTES`, `buildGeminiBody`, `decodeGeminiImage`, `isSafeGeminiModel`, `parseGeminiResponse` desde `./gemini-api-wire.ts`. `gemini-api-wire.ts` solo importa un `type` de un puerto propio. `image-metadata-stripper.ts` no tiene imports externos; lo usa `src/infrastructure/http/scene-composition.ts:111` y ya existía en HEAD. `git diff 8dea731 --stat` de ambos archivos vacío (no modificados en la Fase 14). Sin duplicación de protocolo detectada | PASS |
| 4 | `deploy-argos.yml` sin acciones de terceros nuevas ni versiones sin fijar | `git diff 8dea731 -- .github/workflows/deploy-argos.yml`: 3 líneas añadidas y 2 eliminadas, todas dentro del bloque `gcloud run deploy` (`ARGOS_SCENE_DRIVER=fake` → `real`, `+ARGOS_SCENE_MODEL`, `+ARGOS_SCENE_LOCATION`) y comentarios. Ningún `uses:` nuevo, ningún `npm i`/`pip`/`curl`/`wget` nuevo | PASS |
| 5 | Red de la Fase 14 | `fetch` nativo a `metadata.google.internal` (`metadata-token-client.ts`, `Metadata-Flavor: Google`, `redirect: 'error'`) y a `{location}-aiplatform.googleapis.com` (host construido con `location` de lista cerrada). Sin `node:https`, `child_process` ni SDK | PASS |

## Observaciones (no bloquean)

- **OBS-M1 (naturaleza de E1)**: la sustitución de `N2-01` = A por «0 dependencias npm nuevas» está asentada en `spec.md` (D6-23 (f), SC-ESC6-042), `plan.md` §5.8 y `tasks.md` (T960 «Resuelto por Neo»). El repositorio no contiene la firma de Neo fuera de esa transcripción; en `spec.md` consta que las firmas de Nivel 2 se recogen por el canal Logos. Es la misma limitación documentada para `N2-01..N2-12`. Este dictamen valida el contenido de E1 frente al código, no la autoridad de la firma.
- **OBS-M2 (coste residual asumido)**: sin dependencia de imagen no hay recodificación ni redimensionado. La normalización es la lista blanca de `image-metadata-stripper.ts` (pre-existente). `REQ-ESC6-027` conserva en su texto el redimensionado con `ARGOS_SCENE_REF_MAX_PX`, y `SC-ESC6-042` queda condicionada con la limitación aceptada en `RR-06-10`. Riesgo residual: imágenes de gran tamaño llegan al proveedor tal cual si pasan la lista blanca (límite de bytes en `GEMINI_INLINE_MAX_BYTES`, a verificar por `/oracle`). Esto no es una dependencia nueva, pero sí un cambio de causalidad frente a `REQ-ESC6-027`.
- **OBS-M3 (causalidad del workflow)**: el cambio de `deploy-argos.yml` fija `ARGOS_SCENE_DRIVER=real` en el despliegue. Su efecto depende de la fusión a `main`, que `T885` mantiene bloqueada (`N2-10`). Ya registrado por `/oracle` como H-F14-1. Desde la cadena de suministro no añade dependencias, pero conviene no fusionar hasta que `T885` esté desbloqueada.
- **OBS-M4 (pines preexistentes, fuera de alcance)**: `actions/checkout@v4` y `actions/setup-node@v4` están fijadas por etiqueta, no por SHA. Son anteriores a la Fase 14 y no se tocan aquí.
- **OBS-M5 (enlace a T885)**: `D6-23` (f) dice que `E1` sustituye `N2-01`. `N2-10` y `T885` (condición 3) todavía citan «`N2-01` = A». Antes de desbloquear `T885`, `/architect` debe alinear esa condición con E1 para que no quede una compuerta contradictoria.

## Causalidad (resumen)

- Origen: `T944..T952` (Keymaker, sin commit) → `vertex-scene-image-generator.adapter.ts`, `metadata-token-client.ts`, `gemini-api-wire.ts` (reuso), `scene-global-quota.ts`, `scene-provider-parameters.ts`, `deploy-argos.yml`.
- Efecto en dependencias: ninguno (`package.json`/lock intactos).
- Efecto en contratos: `REQ-ESC6-017, 026, 027, 028, 031`, `NFR-ESC6-001`, `SC-ESC6-042, 050, 083/084`.
- Efecto en pruebas: `T945` (pruebas rojas del adaptador con `fetch` y metadata simulados); `SC-ESC6-050` (comparación de `package.json` y lock con los previos) queda cubierta por este dictamen.

## Estado de las tareas

- `T955` se queda `[ ]`. El techo del agente es `REVIEW`. Solo Neo marca `COMPLETED`.
- `T885` sigue `[ ]` y bloqueada.
- Sin commit ni push.
