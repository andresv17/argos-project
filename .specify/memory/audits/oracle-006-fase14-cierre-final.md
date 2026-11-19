# Acta Oracle - Feature 006, Fase 14 cierre final y activacion T885 (2026-11-20)
Rama 006-escena-hogar-pixel-art @ 8dea731 (diff sin commit). Veredicto: PASS CON OBS. Techo REVIEW; sin [x], sin commit, sin push.

## Compuertas reales en disco
- verify-traceability --feature 006: rc 0, CUMPLE, 241/241 spec->tasks, 198/278 informativo, pureza 0 violaciones.
- verify-oracles: rc 0, 381 archivos, 0 debiles, CUMPLE.
- tsc --noEmit: rc 0.
- npm run test:gate con PostgreSQL 17 REAL (contenedor proyectoargos-postgres-1, postgres:17, 127.0.0.1:55432): rc 0; 331 archivos pasan; 5289 pasan, 1 omitida (5290). Las 3 trazabilidades (002/003/006) y oraculos CUMPLE dentro del gate.
- scan-secrets repo: rc 0, 0 hallazgos (.env no leido).
- package.json, package-lock.json, src/generated, contracts/: sin diff vs HEAD. terraform/: solo README.md (2 lineas cambiadas en el runbook, 0 recursos).

## Puntos de la mision
6. SCENE_REAL_DRIVER_ACTIVATED = true (app-config.ts:133). Guardas conservadas (guarda-driver-real-escena-006.spec.ts): sceneRealDriverActivated:false bloquea real (L54-59, produccion y test); NODE_ENV=production rechaza fake y sin variable (L49-52) y gemini-api (gemini-api-config-escena-006.spec.ts:35); composicion real sin tope global lanza (L68-72).
7. metadata-token-client.ts: promesa en vuelo memoizada (inFlight, se descarta al terminar, no memoiza fallos), json() en try/catch con error literal; cloud-logging.ts redacta ya29. y Bearer. t953-endurecimiento-token-escena-006.spec.ts: 8 pruebas verdes (en el gate).
8. Runbook: terraform/README.md (bullet Estado del driver y CI/CD) dice real en produccion por metadata server, fake en CI/dev, produccion rechaza fake; runbook-escena-006.spec.ts verde. Sin cambios de recursos Terraform.
9. Firmas de Neo en spec.md (seccion "Registro de las firmas de Nivel 2", L768+): T958, OBS-M1, OBS-M2, H-F14-2 y D6-23 asentadas. tasks.md: unico [x] nuevo = T824 (confirmada por Neo); T885 y T944..T960 siguen [ ].
10. Cambio de comportamiento: deploy-argos.yml fija ARGOS_SCENE_DRIVER=real solo en el despliegue (push a main). La CI de pruebas y el modo por defecto usan fake; las pruebas Vertex usan fetch y metadata server simulados (vi.fn), 0 red. No hay ARGOS_SCENE_DRIVER en otros workflows ni playwright.config. Con la constante en true, el real arranca en produccion si estan modelo, proyecto y cuota global (server.ts resuelve platform_parameters al arrancar).

## Hallazgos
- H-CF-1 (IMPORTANTE, decision de Neo, no bloqueante): H-F14-1 queda resuelto en el codigo (constante true), pero el riesgo se traslada: un merge a main dispara deploy con driver real EN VIVO. El smoke test (--no-traffic) solo prueba arranque, no una generacion; la cuota 5 generaciones/mes acota el gasto. Fusion y activacion siguen bajo N2-10/T885: no fusionar hasta que Neo marque T885, valide T956 (revisores del entorno produccion) y conceda el rol de uso de Vertex a la cuenta de servicio de Cloud Run (runbook).
- H-CF-2 (MENOR): el aviso v2 fija us-central1 en el texto; cambiar la region en platform_parameters exige subir la version del aviso (heredado H-F14-4).
- H-CF-3 (OBS): H-F14-3 (runbook) y H-F14-5 (borrador del aviso, archivado en specs/006.../archivo/) quedan cerrados.
- H-CF-4 (OBS): el primer intento de la compuerta fallo solo por entorno (`timeout` inexistente en macOS), no por codigo; el gate reportado es la segunda ejecucion completa (rc 0).

## Decision
PASS CON OBS. Sin hallazgos bloqueantes. Neo marca [x] T944..T960 y T885 (si decide); el commit local lo hace Morpheus/Neo. Sin merge ni push.
