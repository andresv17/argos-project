# Bitácora de /merovingian

## 2026-11-15 — Gate 003 (Exiled Programs y causa-efecto)
- Lectura: SKILL, bus (10 últimas líneas), constitución (dependencias autorizadas), informes /lock, /mifune, /rama de la 003, specs/003-cloud-gcp.
- Consultas: npm view, npm audit, OSV, Terraform Registry, GitHub Releases, nodejs.org (sin instalar nada).
- Propuesta de versiones (Neo decide): pg 8.23.1, @types/pg 8.23.1, @fastify/static 10.1.8, esbuild 0.28.2 (dev); proveedor google ~>5.20 resuelve a 5.45.2 (línea congelada).
- 18 hallazgos: 3 altos (H-MERO-001 proveedor/lockfile, 002 HOST=0.0.0.0 rompe app-config.spec.ts:59, 003 compile-contracts solo 001/002 y misma src/generated), 10 medios, 5 bajos.
- Informe: .specify/memory/audits/gate-merovingian-003.md. Sin ediciones de specs/código/package.json ni commit.

## 2026-11-18 — Auditoría 006 dependencia de IA (Exiled Program)
- Lectura: constitution.md (VI, II.4, II.6, precedentes jose/@google-cloud/storage), package.json/lock (sin SDK de IA; google-auth-library 11.3.4 solo transitiva), spec 006 (D6-01, D6-12, REQ-ESC6-017, NFR-ESC6-002), terraform/*.tf.
- Dictamen: SDK solo por enmienda MINOR Nivel 2; fetch nativo no añade dependencia. Costo (D6-12) choca con Principio VI y exige autorización de Neo.
- Recomendación: C en real (puerto + fake), B como diseño objetivo; A solo si REST es inmanejable. Hallazgos H-MERO-006-01..05.
- Informe: .specify/memory/audits/merovingian-006-dependencia-ia.md. Sin instalar ni editar specs/src/tests.

## 2026-11-18 — Grafo de impacto del diseño 006 (plan, contracts, data-model) sobre 001..005
- Lectura en disco: plan/data-model/contracts 006; compile-contracts.sh, verify-traceability.sh; media-keys, audit-entry y CHECK de audit_log, rbac.ts, schema-parity, layer-dependencies, tests de Terraform y OIDC.
- Hallazgos H-MERO-006-11..24: ALTA en auditoría cerrada (11), claves de medios solo `pets/` (12), cuota (13), migraciones/paridad (14), ganchos de transferencia e importación (15), arneses (16), Terraform real en COP 4500 y 12 APIs (18), compuertas sin 006 (20). Capas INV-ARCH sin ruptura (21).
- Informe: .specify/memory/audits/merovingian-006-diseno-impacto.md. Solo lectura; sin ediciones de specs/src/tests/scripts.
- 2026-11-18 | T825 firma: enmiendas (a)(b)(c) y N2-05 verificadas cadena REQ->src->tests; audit-entry 3.2.0 aditivo (SYSTEM pasa de pos.14 a 17; mismo conjunto + 3), paridad cubierta.
- 2026-11-18 | Veredicto NO FIRMADO: H-T825-1 003 plan/research stale, H-T825-2 REQ-ARC-005 sin texto, H-T825-3 listas enum 002/004. Informe .specify/memory/audits/merovingian-T825-firma.md; solo lectura.
- 2026-11-18 | Re-firma T825: H-T825-1/2/3 verificados con grep y git diff (003 plan/research 1Gi/120s/14 APIs/22500 COP; 004 REQ-ARC-005+SC-ALM-013; 002/004 17 valores y 3.2.0; audit-log.port.ts solo comentario).
- 2026-11-18 | Veredicto FIRMADO. Fuera de alcance reportado: specs/005 tasks.md T797 [x] sin commit y .claude/settings.json. Informe .specify/memory/audits/merovingian-T825-refirma.md.

## 2026-11-19 | T912 | Merovingian (grafo causa-efecto N2-14, solo lectura)
- CC: enmienda aditiva scene.schema.json 1.1.0 (SceneActions.retryAfterSeconds, canRegenerate). Sin ediciones de codigo ni contratos.
- H1: src/application/use-cases/scene-use-cases.ts:183 canRegenerate NO consulta limites de REQ-ESC6-034 (contrato 1.1.0 si). Divergencia real; la corrige T915. retryAfterSeconds no se emite hoy (buildView:162-190).
- H2: tests/unit/t851-get-scene-escena-006.spec.ts:127 usa toEqual sobre actions; con retryAfterSeconds:null emitido rompe. Cubrir en T914.
- H3: tests/integration/contracts/openapi-contract-006.ts valida respuestas con ajv contra scene.schema.json (additionalProperties:false) leyendo la fuente, no src/generated; 1.1.0 la acepta. codegen-drift.spec.ts:35 excluye v34: nada alerta si T913 se omite.
- Compatibilidad: campo opcional, cliente 1.0.0 ignora; servidor 1.0.0 no emite. STATE-SCENE-001 y error-catalog ERR-RATE-LIMITED sin cambio semantico (guard REQUEST ya incluye enfriamiento). Pregunta a Neo: visibilidad de retryAfterSeconds a rol ROLE.
- Dictamen enviado a Morpheus. Sin commit.

## 2026-11-19 | T1011 | Merovingian (grafo de impacto 007 Bloque C, solo lectura)
- CC: el encargo cita pet.schema 001 (v2.0.2 REVIEW, no LOCKED). El codigo compila el 002 (pet y backup v3.0.0 MAJOR REVIEW) en src/generated/. El 001 comparte directorios de salida con el 002 y no declara microchipId/speciesOther/birthDateIsEstimate.
- H1: additionalProperties:false en pet y en BackupEnvelopeV2 => respaldo de 007 no importable en builds 006 (rollback). Riesgo alto.
- H2: SnapshotPet/parsePet estricto (inputs-snapshot.ts:73) => no añadir campo a la huella; filtrar DECEASED antes de buildInputsSnapshot.
- H3: SQLite 0013 = PG 0009 (numeracion divergente); CHECK cruzado no expresable en ALTER de SQLite. Paridad manual en schema-parity.spec.ts.
- Dictamen: N2-07-01 condicionalmente segura; 4 condiciones previas. Acta .specify/memory/audits/merovingian-007-impacto.md. Sin ediciones de contratos ni src; sin commit.

## 2026-11-19 — T955 Fase 14 (cadena de suministro)
- Comparado HEAD 8dea731. package.json y package-lock.json sin cambios (diff vacio). 0 imports no relativos en los 9 archivos de la Fase 14. gemini-api-wire.ts e image-metadata-stripper.ts reutilizados por importacion, sin modificar desde HEAD.
- deploy-argos.yml: solo variables de entorno del bloque gcloud run deploy; ninguna accion ni instalacion nueva.
- Dictamen PASS CON OBS. E1 se cumple literalmente. Observaciones: OBS-M1 firma Logos sin fuente en disco; OBS-M2 riesgo residual sin redimensionado; OBS-M5 N2-10/T885 aun cita N2-01 = A.
- Acta: .specify/memory/audits/merovingian-006-fase14-deps.md. Sin commit ni push.
