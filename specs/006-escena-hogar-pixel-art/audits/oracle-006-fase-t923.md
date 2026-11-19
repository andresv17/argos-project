# Oracle 006 Fase 11 (T911..T922), auditoría T923

Autora: /oracle. Fecha: 2026-11-19. Rama 006-escena-hogar-pixel-art, HEAD 80a8ccf con cambios sin commit. Veredicto: PASS CON OBSERVACIONES. No se marcó [x] ni COMPLETED.

## 1. Estado de tareas (disco)
T901..T909 [x] (commit 80a8ccf); T910 y T911..T923 todas [ ]. Sin desviación de estado. Observación: la línea T904 ([x]) cambió de texto (aclaración de OBS-3: igualdad byte a byte solo sin PIXEL_REDRAW_RULE); la marca [x] se conserva, pero es edición normativa de una tarea firmada: Neo debe tenerla presente al firmar.

## 2. Contratos
scene.schema.json x-sdd-metadata 1.1.0 (MINOR, supersedes 1.0.0); SceneActions.retryAfterSeconds integer|null, minimum 1, maximum 86400, fuera de required; additionalProperties:false intacto. src/generated/v34 recompilado (retryAfterSeconds en types.ts:2218, validators.mjs, openapi-types.ts). OpenAPI sigue en 3.4.0 (info.version y x-sdd-metadata.version), con change_note de alineación.

## 3. Decisiones de Neo verificadas en código
- N2-14: scene-use-cases.ts emite retryAfterSeconds = limits.allowed ? null : limits.retryAfterSeconds. CUMPLE.
- N2-15 B: HouseholdsPage muestra HomeScene OWNER solo si ownerSceneVisible(loaded, households.length) (lista cargada y 0 hogares); el retiro de consentimiento vive en ese bloque. CUMPLE.
- Directiva 1: PetsPage solo importa HomeSceneImage (sin HomeScene, sin petsRevision); el componente no tiene botones ni enlaces, no pinta con imageTag null (sceneImagePath devuelve null), con householdId null no hace petición, y no usa /me/scene. CUMPLE.
- Directiva 2: canRegenerate incluye limits.allowed; SceneBlock deshabilita acciones con espera, muestra "Espera N s/min/h para volver a intentarlo" y programa una relectura a t+1 s (scheduleCooldownRefresh, cancelada al desmontar). "demasiados intentos" ausente en src/presentation/web (grep 0). CUMPLE.
- Directiva 3: scene-spec.ts construye el JSON con claves en orden fijo (mode, household, renderedPetsCount = pets.length, pets), serializa con JSON.stringify(spec, null, 2); sin household.id, pets[].id, nombres, biography ni breed libre (breed = canonicalBreedName o mixed-breed; speciesOther solo tras sanitizeFreeText). Orden: JSON, PET_COUNT_RULE, PIXEL_REDRAW_RULE solo con photoRef (desde cero) o ADD/REPLACE con foto (incremental). decide-mode.ts, pet-phrases.ts y STYLE_BASE_TEXT sin diff. CUMPLE.

## 4. Desviaciones del keymaker
(a) PET_COUNT_RULE usa "When renderedPetsCount is zero, draw no animals." El plan §5.3.1 no fija esa frase literal (pide "sin número quemado" y "cero animales" con N = 0; no existe "With renderedPetsCount 0" en spec ni plan). ACEPTABLE por la auditora; queda a decisión de Neo por ser texto del prompt.
(b) t874: el rechazo de textos hostiles se mantiene: sigue sin aparecer ningún fragmento hostil en lo enviado (sent.includes false); el regex <>{}NUL/RLO se aplica fuera del bloque JSON y <>NUL/RLO dentro; el bloque se valida con JSON.parse. Fortalece o iguala, no debilita.
(c) Sin jsdom: el hook de SceneBlock se prueba con helpers puros (scheduleCooldownRefresh, sceneRetryAfter) e inspección de fuente. Limitación real, NO BLOQUEANTE, a declarar como deuda de prueba de componente.

## 5. Escáner de secretos
Corregí el literal de la clave centinela en oracle-006-fixes-en-vivo-t910.md:22 (ahora AIzaSyTEST-SENTINEL-[redactada]); dictamen intacto. node scripts/scan-secrets.mjs repo: 0 hallazgos. scan-secrets.mjs sin tocar.

## 6. Compuertas (ejecutadas por la auditora)
- verify-traceability.sh --feature 006: rc 0, CUMPLE (221/221 IDs propios mapeados, 191/258 trazados, pureza 0 violaciones).
- verify-oracles.sh: CUMPLE (373 archivos, 0 oráculos débiles).
- npx tsc --noEmit: rc 0.
- npm run test:gate con PostgreSQL 17 real (proyectoargos-postgres-1, 127.0.0.1:55432, TEST_DATABASE_URL): rc 0; 323 archivos pasan; 5022 pasan, 1 omitida (5023), 0 rojas; cobertura Statements 98.84 %, Branches 95.5 %, Functions 99.64 %, Lines 98.84 %. T591R-2 pasó. Reposo: la máquina no estaba en reposo absoluto (load average 6 a 12 por Claude.app y una VM); DEUDA-006-T591R2-TIMING sigue abierta y no resuelta.
- Red externa: ninguna (adaptador fake; sin llamadas a proveedores).

## 7. Observaciones
OBS-1 PetsPage.tsx tiene una línea mal sangrada (`        await loadCards();` tras el borrado): cosmético, no bloquea.
OBS-2 T904 editada en estado [x] (ver §1).
OBS-3 Sin prueba de componente con DOM (sin jsdom).
OBS-4 Versión OpenAPI 3.4.0 con contenido ampliado (retryAfterSeconds por $ref): decisión de Neo (mantener 3.4.0 o subir a 3.5.0).

## 8. Ámbito de commit propuesto (sin commit hecho)
specs/006-escena-hogar-pixel-art/{spec.md,plan.md,tasks.md}; contracts/openapi/home-scene.openapi.yaml; contracts/schemas/scene.schema.json; audits/{architect-006-fase-t911.md,architect-006-fase-t912.md,oracle-006-fixes-en-vivo-t910.md,oracle-006-fase-t923.md}.
src/domain/scene/{build-image-prompt.ts,scene-spec.ts}; src/application/use-cases/scene-use-cases.ts; src/generated/v34/{api/openapi-types.ts,errors/field-errors.ts,schemas/types.ts,schemas/validators.cjs,validators.d.cts,validators.d.mts,validators.mjs}; src/presentation/web/{scene-api.ts,scene-view.ts,components/SceneBlock.tsx,components/HomeSceneImage.tsx,pages/HouseholdsPage.tsx,pages/PetsPage.tsx}.
tests/security/t874-escena.security.spec.ts; tests/unit/{t841-prompt-payload-escena-006.spec.ts,t851-get-scene-escena-006.spec.ts}; tests/unit/presentation/{escena-fixtures.ts,t876-escena-integracion.spec.ts,t916-escena-espera.spec.ts,t918-mascotas-solo-imagen.spec.ts,t919-hogar-owner-sin-hogar.spec.ts}.
Excluidos: claude/*, .claude/*, tests/chaos/, scripts/logos.py, specs/005/tasks.md, .gitignore, gate-T296-output.txt, .playwright-mcp/, audits ajenos en .specify/memory/audits/.
