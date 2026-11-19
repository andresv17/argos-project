# Acta Oracle - Feature 006, Fase 14 (T944..T952) - 2026-11-20
Rama 006-escena-hogar-pixel-art @ 8dea731 (diff sin commit). Veredicto: PASS CON OBS. Techo REVIEW; sin [x], sin commit.

## Compuertas en disco (reales)
- verify-traceability --feature 006: CUMPLE, 241/241 spec->tasks, 198/278 informativo, pureza 0 violaciones, rc 0.
- verify-oracles: 380 archivos, 0 debiles, CUMPLE.
- tsc --noEmit: rc 0.
- npm run test:gate con PostgreSQL 17 real (contenedor postgres:17 en 127.0.0.1:55432, TEST_DATABASE_URL): rc 0; 330 archivos pasan; 5281 pasan, 1 omitida (5282). Incluye 002/003/006 traceability, oraculos, tsc, vitest --coverage.
- scan-secrets repo: 0 hallazgos (.env no leido).
- package.json, package-lock.json, terraform/, src/generated, contracts: sin cambios vs HEAD (git status vacio). Solo cambia .github/workflows/deploy-argos.yml (+3/-2).
- SCENE_REAL_DRIVER_ACTIVATED = false (app-config.ts:133). T885 sigue [ ]. Unico [x] nuevo: T824 (confirmada por Neo, ya notada por Mouse).

## Hallazgos
- H-F14-1 (IMPORTANTE, no bloqueante, decision de Neo): deploy-argos.yml dispara con push a main y ahora fija ARGOS_SCENE_DRIVER=real. Con la constante false, loadAppConfig rechaza el arranque en produccion: un merge prematuro a main produciria revision que no arranca (--no-traffic + smoke test la frena). Es el diseno declarado (T952, "no se fusiona"), pero el merge queda doblemente bloqueado: T885 y este efecto. No fusionar hasta T885.
- H-F14-2 (MENOR) Cuota global (punto 8): lectura del Keymaker CORRECTA. Una sola sentencia UPDATE ... WHERE CAST(value)<max tras INSERT ON CONFLICT DO NOTHING (scene-global-quota.ts), autocomite sobre pool (fuera del UoW), falla cerrado, fila por mes, tope releido en cada llamada, sin migracion. Coincide con REQ-ESC6-017/NFR-ESC6-001/T947/T948. Matices: (a) descuenta antes de markProviderCall: si esa transaccion devuelve CANCELLED o hay redelivery el contador queda consumido sin llamada (sesgo conservador, aceptable para tope de gasto); (b) la ventana mensual usa la fecha local (zona app), no UTC de facturacion de Google; (c) cuota agotada cierra FAILED con ERR-SCENE-GENERATION-FAILED y ese intento cuenta en el limite de 3 FAILED/24 h por escena (REQ-ESC6-034) y el usuario ve un fallo generico. Recomendacion: /architect decide si el agotamiento global debe contar como FAILED de escena o tener codigo propio (cambio de contrato, Nivel 3); no bloquea.
- H-F14-3 (MENOR) Runbook (punto 9): terraform/README.md:242 dice "ARGOS_SCENE_DRIVER=fake ... el adaptador del proveedor no existe como codigo seleccionable"; ahora falso. tests/unit/runbook-escena-006.spec.ts:33 exige textualmente 'ARGOS_SCENE_DRIVER=fake', por eso el Keymaker no lo toco (ademas terraform/ debe quedar sin cambios en la fase). Correccion propuesta a /link tras autorizacion de Neo: reescribir el parrafo (driver real=Vertex por metadata server, fake en CI/dev, activacion bloqueada por SCENE_REAL_DRIVER_ACTIVATED=false/T885) y que /keymaker ajuste la asercion del test para exigir 'ARGOS_SCENE_DRIVER=real' y 'SCENE_REAL_DRIVER_ACTIVATED = false'. Mantener el texto 'fake' como valor de CI.
- H-F14-4 (OBS) Aviso (punto 10): sin BORRADOR ni "usa solo imagenes de prueba" en src/ (grep; solo hits ajenos); declara Google Cloud Vertex AI, us-central1 con transferencia internacional, y reenvio en cada regeneracion; SCENE_NOTICE_VERSION '1'->'2' (cliente igual; gemini-api-2). Observacion: la region us-central1 esta escrita fija en el texto pero es parametrizable en platform_parameters; cambiarla exige subir la version del aviso. Retencion/borrado sin fuente quedan "pendientes de confirmar" (D6-23 d). Texto en REVIEW hasta firma de Neo (T958) y revision de /rama.
- H-F14-5 (OBS) specs/006-escena-hogar-pixel-art/aviso-consentimiento-borrador.md sigue existiendo como documento de spec; no es texto de UI. /architect puede archivarlo o renombrarlo.
- H-F14-6 (OBS) Pendientes de la fase no ejecutados por Oracle: T953 (terraform verificado por Neo en solo lectura; Oracle confirma terraform/ sin cambios), T955 requiere /rama (aviso), /trinity (token metadata) y /merovingian (0 deps; verificado aqui por git: package*.json intactos).

## Decision
PASS CON OBS. Neo debe firmar T958 (texto del aviso) y decidir H-F14-1/H-F14-2. No se marca [x] ni COMPLETED.
