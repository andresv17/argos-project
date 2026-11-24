# Acta Oracle — 006 fix/006-escena-defectos-uso-real (T961..T967) — 2026-11-24
Estado: DRAFT (informe de auditoría; sin APPROVED/LOCKED). Veredicto: **PASS CON OBS**. Sin commit, sin push, sin [x].

## 1. Alcance en disco
- Cambios fuera del alcance (specs/006-*, src/**, tests/**, Dockerfile, claude/): solo preexistentes ajenos a este fix (.claude/settings.json, .gitignore, CLAUDE.md, playwright.config.ts, specs/005 tasks.md y untracked de logos/audits/zip). El Dockerfile NO tiene cambios.
- Contratos: 4 archivos de specs/006/contracts editados por /architect (DRAFT, documentado en log-architect 2026-11-24). src/generated: recompilado con scripts/compile-contracts.sh --feature 006 es idempotente (hash idéntico antes/después): nada a mano.

## 2. Gates (reales, TEST_DATABASE_URL=postgres://argos_test:***@127.0.0.1:55432/argos_test, PG17 vivo)
- npx tsc --noEmit: rc=0
- bash scripts/verify-oracles.sh: CUMPLE (528 archivos, 0 débiles) rc=0
- bash scripts/verify-traceability.sh --feature 006: CUMPLE, spec→tasks 251/251, pureza 0 violaciones, rc=0
- npm run test:gate: rc=0; 450 archivos, 6949 pasan, 1 omitida; cobertura L 98.9 / B 95.09 / F 99.72.

## 3. Las 6 decisiones
1. SCENE_PAYLOAD_SCHEMA_VERSION '1.0.0' (scene-payload.ts:17) vs spec 1.1.0: CUMPLE. La spec (nota de enmienda, punto 1) dice que pasa a '1.1.0' "solo si el payload lo declara (decisión de keymaker)"; el const de SchemaVersion del contrato sigue '1.0.0' (scene-payload.schema.json:32) y el 1.1.0 es solo de descripciones. No bloquea.
2. visibilitychange no cableado: CUMPLE. El gancho onVisible existe inyectable (scene-view.ts:112-183) y no se usa; tests/unit/presentation/session-client.spec.ts:79 y tests/security/exploits/ui-invitation-logs.security.spec.ts:49 (INV-AUTH2-002) prohíben el evento en la SPA. La cuenta usa reloj real. No bloquea; decisión de Neo si quiere relajar INV-AUTH2-002.
3. PRESERVATION_BLOCK singular: CUMPLE CON OBS (no bloquea el cierre, SÍ condiciona el efecto en producción). La fila sembrada (0018 PG / 0022 SQLite) conserva el texto plural y promptBlocks() la lee en caliente (scene-run-use-case.ts:144), así que en bases existentes el texto viejo sigue ganando al nuevo del código hasta migración nueva o edición admin. Las demás correcciones del prompt mixto (renderedPetsCount, referencePhotoPets, etiquetas IMG_n) son de código y sí rigen. Test t1303 documenta el límite. Neo debe decidir: migración nueva (0019 PG / 0023 SQLite) o edición admin al desplegar.
4. Literales del ejemplo 3 (t1071 / t1213): CUMPLE. Cambian solo por la nueva semántica renderedPetsCount = total visible + referencePhotoPets (CC-KEY-F15-6); no se debilitó ningún oráculo (verify-oracles 0 débiles). OBS: este defecto (punto 1 prompt mixto), «Actualizando…», el contador y la prueba del Dockerfile NO están descritos en spec.md ni en tasks.md Fase 15 (solo en log-keymaker CC-KEY-F15-5..7 y la directiva de 7 correcciones); la nota de enmienda dice "únicamente estas tres enmiendas". Recomendado que /architect registre T969 o nota en T961/T963/T966 para trazabilidad.
5. t1185 reescrita: CUMPLE. Mantiene exacta la lista blanca de lectores de "biography" (igualdad estricta, t1185:~288-306) y sigue prohibiendo vertex|gemini|image-generator; la raíz del payload sigue ignorada (rootOnly == clean); la biografía maliciosa solo sale como cadena JSON de `bio`. Saneador cubierto en t961:75-89 (NFKC, delimitadores, controles, 280, idempotencia). OBS menor: t1182 perdió los asertos "no contiene 'truenos' / no /biography/i" en snapshot (solo conserva not.toContain(BIOGRAPHY)); aceptable porque la huella/snapshot siguen sin biografía.
6. Cobertura PG de isExhausted: CUMPLE CON OBS (no bloquea). scene-global-quota.ts:81-91 con SQL PG (:62-65 lector compartido con tryConsume) solo tiene prueba SQLite (t961:205-220); no hay prueba PG viva de isExhausted. Falla a false por diseño. Recomendado añadir caso PG con TEST_DATABASE_URL en una ronda posterior.

## 4. Tareas y trazabilidad
- tasks.md: T961..T968 siguen en `[ ]` (ningún [x] añadido; techo de agentes respetado; el diff solo añade la Fase 15 y quita la fila Total). OBS: no figuran como REVIEW textual; Morpheus puede anotarlas.
- Trazabilidad: 251/251 spec→tasks; IDs con código 202/296 (informativo). Sin degradación detectada por la compuerta.
- HONESTIDAD TDD (reportada por keymaker): las pruebas nuevas se escribieron tras la implementación (sin fase roja registrada). Se acepta como OBS; los asertos son concretos (verify-oracles 0 débiles).

## 5. Privacidad (biografía y aviso)
- Biografía: cruda solo leída en scene-run-use-case.ts:146-153 desde el repositorio; saneada en scene-payload.ts:56 y build-image-prompt.ts:58 / scene-spec.ts:69; fuera de huella/instantánea (t1182) y sin console/logger en el adaptador Gemini ni en el worker; fallbackContext no se emite (t961:110). `prompt` solo se pasa a generator.generate (scene-run-use-case.ts:202).
- Aviso '3': SCENE_NOTICE_VERSION='3' y 'gemini-api-3' (notice.ts:9,16) y NOTICE_VERSION='3' / NOTICE_GEMINI_API_VERSION='gemini-api-3' (scene-notice.ts:16,75); el texto declara el envío de la biografía (scene-notice.ts:31,33). T968 (/oracle + /rama + firma de Neo) pendiente: /rama debe revisar antes de activar producción.
