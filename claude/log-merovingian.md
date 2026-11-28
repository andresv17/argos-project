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

## 2026-11-19 | Revalidación Caso B 007 (grafo REQ->INV->STATE->ERR->src->tests, solo lectura)
- CC: enmiendas 002 (exportBackup V32, ImportPreview lifeStatusChanges, commit a49ccbe) y 005 (share-link 1.1.0 e openapi 3.4.0, commit a63e285) verificadas en la worktree argos-007 (HEAD a63e285). Sin ediciones de contratos, src ni tests.
- Consumidores: 003 no referencia el sobre de respaldo (solo ProblemDetails); transferencia SQLite->PG pinea 3.2.0 en la misma build. 006 sin referencias a backup. Sin rotura.
- Opt-in: default false seguro (clinical-summary.ts:72); INV-005-004 y hashes pineados (t778) intactos. Hallazgos: O-1 includeDeceasedAt sin cablear (MEDIA), O-3 004 openapi cambia sin bump y dice LOCKED en 005 (MEDIA).
- Veredicto PASS CON OBSERVACIONES. Acta .specify/memory/audits/merovingian-007-revalidacion-caso-b.md (worktree argos-007). Sin commit ni push ni [x].

## 2026-11-20 | T1070 | Merovingian (grafo de impacto Bloque G 007, solo lectura)
- Worktree argos-007 (HEAD 94e0865). Acta: .specify/memory/audits/merovingian-007-T1070-grafo-16bit.md (sin commit, sin [x]).
- H1: T1069 no entregado (claude/decisiones-neo-007-2026-11-21.md inexistente); bloquea solo texto 16-bit. Conteo y estructura no esperan.
- H2: R1 ALTA: filtro JSON sin foto choca con renderedPetsCount/PET_COUNT_RULE. Requiere decision /architect antes de T1072.
- H3: 351bf9a implementa T1073/T1074/T1076 (semilla) con tasks.md en [ ]. Drift a reportar.
- H4: householdBlock (build-image-prompt.ts:34) tambien dice 32-bit; no estaba en el backlog de T1070.
- Contrato: scene-payload.schema.json no fija el JSON del prompt; sin enmienda. Confirmado.

## 2026-11-20 — Feature 008 impacto y dependencias (solo lectura, rama 008-sso-portal-roles @7614387)
- Constitución vigente 3.7.0 (no 3.4.0 como indica el encargo). `jose` 6.2.17 autorizada solo para `/internal/maintenance` y `/internal/scene-worker` en `src/infrastructure/http/oidc-verify.ts` (comentario de código: "No se reimplementa criptografía a mano").
- Hallazgos: enmienda de cookie `argos_oauth` SameSite=Lax exige enmienda constitucional (T1111); registro con sesión (D8-02) rompe contrato STATE-AUTH-SESSION-001 sin tarea asignada; REQ-PRM-003 de 005 contradicho por Bloques D/E; backup 004 sin impacto (envelope excluye usuarios).
- npm audit (lockfile) sin salida en este entorno: no verificado. package.json y lock sin cambios; jose 6.2.17 confirmado.
- Acta: .specify/memory/audits/merovingian-008-impacto.md (sin commit, sin [x], sin instalación).

## 2026-11-23 — T1205 (parte /merovingian), Feature 009
- Veredicto PASS CON CAMBIOS. Cero dependencias npm nuevas (package.json sin diff); jose ya autorizada, reutilización requiere Enmienda 009-A.
- Hallazgos clave: MER-01 (ALTO) registerUser/login/STATE-AUTH-SESSION cambian en 002/004 sin declarar (T1241 dice «sin editar»); MER-02 (ALTO) tope 5 USD no protege gasto acumulado al cambiar de modelo (contraejemplo 4,80+4,20=9,00 USD); MER-07 (ALTO) REQ-PRO9-007 toca 007 APPROVED sin enmienda firmada.
- Acta: .specify/memory/audits/merovingian-009-impacto.md. Sin commit, sin [x], spec/plan/tasks intactos.

## 2026-11-25 — T1504 (parte /merovingian), Feature 011
- Veredicto PASS CON CAMBIOS. Cero dependencias npm nuevas propuestas (package.json y lock sin diff); reutilizar stripImageMetadata, AvatarCropper/avatar-crop y fetch nativo. Riesgo: miniatura 96 px (#59) tentaría sharp/jimp (Nivel 2); recomendado canvas en cliente.
- Hallazgo MER-11-01 (ALTO, bloqueante de diseño): D11-09 contradice REQ-SUM-003/006, INV-005-002 y las pruebas t750, t770, t778 de 005; no relajar pruebas (Nivel 3). Ruta recomendada: endpoint dedicado de avatar, resumen sin cambios. D11-06 = A sin enmienda 005; corregir fila obsoleta en contracts/README 011.
- Acta: .specify/memory/audits/merovingian-011-T1504-impacto-2026-11-25.md. Sin commit, sin [x], sin tocar spec/plan/tasks.

## 2026-11-26 — Auditoría previa Fase 0, Feature 012 (solo lectura)
- CC: veredicto BLOQUEADO PARA ENMIENDA. H-01: unicidad global de microchip YA vigente (002 E-04, 004, migraciones 0008 SQLite / 0004 PG); ENM-002-MINOR-012-CHIP se re-enmarca a cambio de alcance del índice + split de error. H-02: citas INV-ACC-* obsoletas (son INV-ACC2-*) y falta INV-OWN2-001.
- H-03: REQ-VET-002/011 dependen de #22 (Bloque A) pero T1690 los pone en E: dividir ENM-005. H-04: D12-08 (CHIP_CONFLICT, no abortar) contradice el precheck SC-CAT-025: decisión de Neo.
- npm: package.json y lock sin diferencias vs HEAD; cero dependencias nuevas (D12-17 confirmado).
- Acta: .specify/memory/audits/merovingian-012-fase0-2026-11-26.md. Sin ediciones de specs/contratos/código, sin commit, sin push, sin [x].

## 2026-11-28 | T1691 (parte /merovingian), Feature 012, causa y efecto de ENM-005-E (solo lectura, HEAD f4f9ed1)
- Veredicto PASS CON CAMBIOS. Sin dependencias npm nuevas (package.json y lock sin diff); refs solo argos.local.
- Hallazgos: H-1 ALTA (share_link_audit.event_type CHECK de 005 no admite PET_WITHDRAWN; T1692 no lo migra; sin columna de mascota); H-2 ALTA (listHouseholdShareLinks: activeCount suma PETS sin especificar consulta ni items; ShareLinkView sin rama PETS); H-3 MEDIA (MINOR no aditivo para consumidores con enum cerrado; SPA ShareLinks.tsx:93 rotula PETS como «Hogar compartido»).
- H-4 MEDIA (descripción pets de clinical-summary), H-5 BAJA (summary abierto en preview PETS).
- Acta: .specify/memory/audits/merovingian-012-T1691-2026-11-28.md. Sin commit, sin [x], sin tocar contratos ni código.

## 2026-11-28 | T1691 r2 (parte /merovingian), Feature 012, re-auditoría ENM-005-E DRAFT 0.2.0 (solo lectura)
- CC: veredicto PASS CON CAMBIOS, 0 ALTA. ALTA-1 (PET_WITHDRAWN) y ALTA-2 (activeCount, listas, fuente única) CERRADAS en texto; contraste en disco con 005 (share-link 1.2.0), sqlite, use-cases y SPA.
- Hallazgos: MEDIA-1 despliegue sin compuerta de SPA (Fase 2 no condicionada, SharedSummary.tsx:206); MEDIA-2 §8.3 incompleta (ShareLinks.tsx:329/362/402, share-api.ts:74/101 caen a PET); MEDIA-3 activeCount cambia semántica en campo existente (MINOR no es solo aditivo). BAJA: ref §5.3 en vez de §5.2 (línea 18), rama PETS de ShareLinkView atómica con el enum, H-5 abierto.
- Verificado: stub de PetsPreviewView justificado (compile 012 carga solo 004 en schemas); fallthrough §8.1 confirmado; supply chain sin dependencias nuevas. Acta .specify/memory/audits/merovingian-012-T1691-r2-2026-11-28.md. Sin commit, sin [x], contratos intactos.

## 2026-11-28 | T1691 r3 (parte /merovingian), Feature 012, re-auditoría ENM-005-E DRAFT 0.2.1 (solo lectura)
- CC: veredicto PASS CON CAMBIOS, 0 ALTA. MEDIA-1 (precondición SPA §8.2.3), MEDIA-2 (§8.3 completa, líneas verificadas) y MEDIA-3 (semántica de activeCount declarada en §1(c), §5.5 y change_notes) CERRADAS en texto; BAJA-1 y BAJA-2 cerradas; BAJA-3 abierta.
- Hallazgos nuevos: MEDIA-4 (inventario §8.5 mal localizado: resolveShare está en shared-view-use-cases.ts:58, no en share-link-use-cases.ts:144 que es mayRevoke); MEDIA-5 (activeCount de la lista se calcula en ListShareLinksUseCase:136 sobre items, no en countActive); MEDIA-6 (MINOR frente a cambio semántico, regla SemVer de spec-system.md:17, decisión de Neo); BAJA-N1..N3 (bandera: lectura al arrancar, posición en §3.4, openapi preview; cota 300 s no forzada).
- Bandera ARGOS_SHARE_PETS_CREATE_ENABLED: sin efecto en contratos de 005 (ni enum, ni openapi 3.5.0, ni deploy). Sin dependencias nuevas. Acta .specify/memory/audits/merovingian-012-T1691-r3-2026-11-28.md. Sin commit, sin [x], contratos intactos.
