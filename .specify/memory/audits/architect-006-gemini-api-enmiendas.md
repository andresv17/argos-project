# Architect 006 — Enmiendas mínimas del tramo `gemini-api` (Opción 2 firmada por Neo, Nivel 2)

Fecha: 2026-11-18. Rama `006-escena-hogar-pixel-art`. Estado: `DRAFT` (sin `APPROVED` ni `LOCKED`; sin commit, sin push, sin `[x]`/`COMPLETED`). No se leyó ni escribió `.env` ni la clave.

## (a) Archivos modificados
1. `.specify/memory/constitution.md`: 3.6.0 a **3.7.0** (MINOR). Informe de impacto, párrafo nuevo en el Principio VI («Excepción acotada de desarrollo local privado: `gemini-api`», condiciones a..g), línea de versión e historial. La excepción de Vertex queda intacta.
2. `specs/006-escena-hogar-pixel-art/spec.md`: `REQ-ESC6-017` y `REQ-ESC6-031` aceptan {real, fake, gemini-api} con `gemini-api` solo fuera de producción; `SC-ESC6-025` y `SC-ESC6-061` ajustados; nuevos `REQ-ESC6-037..038`, `INV-ESC6-020`, `SC-ESC6-097..103`, `D6-18`, `N2-13`; filas de trazabilidad; conteo; registro de la enmienda.
3. `specs/006-escena-hogar-pixel-art/plan.md`: componente `GeminiApiSceneImageGenerator`, variables `ARGOS_SCENE_DRIVER` (3 valores), `GEMINI_API_KEY`, `ARGOS_SCENE_GEMINI_MODEL`, filas de trazabilidad REQ-037/038, fila del Principio VI y nota de entrega por etapas.
4. `specs/006-escena-hogar-pixel-art/tasks.md`: Fase 9 con `T886..T900` (todas `[ ]`), regla transversal, conteo (100 tareas) y dependencias.
5. `scripts/verify-traceability.sh`: solo el comentario de cabecera (rango `SC-ESC6-001..103`). El patrón es de tres dígitos y no tenía tope en código: el rango nuevo no exigió cambio funcional.
6. `src/infrastructure/http/cloud-logging.ts` (única línea de `src/` tocada, autorizada): patrones `AIza[0-9A-Za-z_-]{35}` y `x-goog-api-key` (texto, JSON y query) en `redactSecrets`, y `x-goog-api-key` en `SENSITIVE_FIELDS`; `@implements REQ-ESC6-038`. Comprobado a mano con clave sintética (4 formas, 0 fugas); `tests/unit/cloud-logging.spec.ts` 13/13.
7. `.specify/memory/audits/architect-006-gemini-api-enmiendas.md` (este informe) y bitácoras `claude/log-architect.md` y `claude/registro-proceso-argos.md`.

No tocado: enmiendas firmadas de 002/003/004, `scene-composition.ts`, `app-config.ts`, `notice.ts`, `.env*`, `terraform/`, workflows, `package.json`.

## (b) IDs y tareas nuevas
IDs: `REQ-ESC6-037` (driver `gemini-api` local privado), `REQ-ESC6-038` (credencial y registros), `INV-ESC6-020` (jamás en producción), `SC-ESC6-097..103`, decisiones `D6-18` y `N2-13`.

| Tarea | Tipo | Contenido | Dep |
|---|---|---|---|
| T886 | [N2] | Constitución 3.7.0 (redactada) | T884 |
| T887 | [N2] | Enmiendas spec/plan (redactadas) | T886 |
| T888 | [N2] | Cabecera del script de trazabilidad (redactada) | T887 |
| T889 | [N2] | Guarda T879 con lista blanca estricta + guarda estática nueva (no reabre T879) | T888 |
| T890 | | Pruebas rojas de configuración | T887 |
| T891 | | `app-config.ts` (enum, `GEMINI_API_KEY`, `ARGOS_SCENE_GEMINI_MODEL`) | T890 |
| T892 | | Pruebas rojas del adaptador (`fetch` simulado) | T887 |
| T893 | | Adaptador y `gemini-api-wire.ts` | T892, T889, T891 |
| T894 | | Pruebas rojas de composición y consentimiento | T891 |
| T895 | | `scene-composition.ts` (`realDriver: true`, en proceso, `providerId` `gemini-api`) y aviso borrador con `noticeVersion` propia | T893, T894 |
| T896 | | Prueba de no-fuga (la redacción ya está aplicada) | T887 |
| T897 | | `.env.example` solo con líneas comentadas | T891 |
| T898 | | Compuertas del tramo | T889, T893, T895, T896, T897 |
| T899 | [GOV] | `/oracle` audita; techo REVIEW | T898 |
| T900 | [HUM] | Neo: clave restringida, tope 5 USD en consola, términos de datos, texto del aviso | T886 |

## (c) Compuertas ejecutadas tras los cambios
- `bash scripts/verify-traceability.sh --feature 006`: exit 0, **CUMPLE** (205/205 IDs propios mapeados en `tasks.md`; pureza 0 violaciones).
- `npx tsc --noEmit`: exit 0, 0 errores.
- `vitest` (corrida completa por glob accidental): 4700 pasan, 201 omitidas (sin PostgreSQL), 0 fallos.

## Notas para Neo y /keymaker
- Se dejaron a `/keymaker` las pruebas (T889, T890, T892, T894, T896) y todo el código de producto salvo la línea de `cloud-logging.ts`, conforme a la restricción. El ajuste de la guarda T879 vive en T889 por prohibir el Architect editar `tests/**`.
- `REQ-ESC6-028`, N2-10 y T885 (Vertex/producción) no cambian; `SCENE_REAL_DRIVER_ACTIVATED` sigue `false`.
- Riesgos abiertos (T900): términos de datos de la Developer API sin verificar con fuente; no hay corte duro de gasto en la aplicación (solo el tope de consola); texto legal del aviso firmado por Neo antes de usar fotos reales.
- Aclaraciones C5 y C10 de `audits-gemini-api-diseno.md` quedan cubiertas por `REQ-ESC6-037` (5) y `REQ-ESC6-038` (2).
