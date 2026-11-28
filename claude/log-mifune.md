# Bitacora de /mifune

2026-11-15 Mifune: gate 003 emitido: 16 hallazgos (2 altos, 8 medios, 6 bajos) + lista no-recortar. Informe .specify/memory/audits/gate-mifune-003.md. Sin ediciones de specs ni commit.

2026-11-18 Mifune: revisa diseno 006 (plan, data-model, research, contracts) con filtro KISS; 13 hallazgos H-MIF-006-01..13 (1 alto, 4 medios, resto bajos/conservar).
2026-11-18 Mifune: principal H-01: status persistido obliga ganchos recomputeSceneStatus en casos de uso LOCKED 002/004/005; derivar en lectura. H-02/03 fold de scene_images y scene_attempts en home_scenes (EDGE-016 por comprobar).
2026-11-18 Mifune: H-04/05 (REGENERATE y 4 modos incrementales) contradicen REQ-015/D6-08: no se recomiendan. H-09: no anadir tope global ahora (condicion de activacion). Informe .specify/memory/audits/mifune-006-diseno.md; sin ediciones de specs ni commit.

2026-11-19 Mifune: T1002 gate KISS sobre 007 (plan ADR-007-01..06, tasks, spec). 17 hallazgos M7-01..M7-17 (alta: M7-01 maquina de estados, M7-02 error existente, M7-09 sin constante de opcion, M7-10 acotar D7-02 a 4 modulos). Acta .specify/memory/audits/mifune-007-kiss.md. Sin ediciones de specs/src, sin commit ni push. Conteo propuesto 49 -> 44.

2026-11-20 Mifune (008 KISS): revision de spec/plan/tasks 008 en 7614387.
- Hallazgos clave: registro con correo y vinculación por enlace son el mayor coste; D8-05=C (OIDC Core 3.1.3.7) evita jose; portal /admin sin modulo (flag en users + guard); cookie argos_oauth necesaria; callback 302 a validar en T1123; fake de correo en memoria, sin fake-SMTP.
- Acta: .specify/memory/audits/mifune-008-kiss.md. Sin commit, sin [x].

2026-11-23 Mifune (T1205 KISS 009): revision de plan.md 009 con spec y tasks (solo lectura). 10 hallazgos MIF-01..10 (2 alto, 4 medio, 4 bajo). Veredicto PASS CON CAMBIOS.
- Principales: MIF-01 tres mecanismos de cuota (ADR-01/16) -> una via; MIF-02 tres puertos para platform_parameters -> uno; MIF-04 enmienda 009-B de lista de modelos a app-config (pregunta a Neo).
- Acta .specify/memory/audits/mifune-009-kiss.md. Sin ediciones de spec/plan/tasks, sin [x], sin commit ni push.

2026-11-25 Mifune (T1504 KISS 011): revision de plan/spec/tasks 011 y acta D11 (solo lectura). Veredicto PASS CON CAMBIOS; 10 recortes MIF-011-01..10 (alta: MIF-011-04 retirar echo; media: auditoria sin migracion, #78 en columnas de users, album sin ruta nueva si D11-11 es por mascota, orden de migraciones).
- Conserva: tabla de delegados (sub desconocido antes del login), repos en 3 implementaciones, #72 solo texto, #74/#64 sin migracion.
- Acta .specify/memory/audits/mifune-011-T1504-kiss-2026-11-25.md. Preguntas a Neo: D11-11 global o por mascota; migraciones juntas (N2). Sin commit, sin [x], sin ediciones de specs.

2026-11-26 Mifune (Fase 0 Feature 012, filtro KISS previo): revision de plan (8 ADR, no 6), research, data-model y acta D12 en solo lectura. Veredicto PASS CON CAMBIOS.
- Principales podas: 9 tablas nuevas a 7 (una tabla owner_requests para aprobaciones y reclamaciones; sin version, sin idempotency_key, sin position); VIEW_ONLY/BASIC_LOG como concesion (sin fila = VIEW_ONLY); QR de version fija 6-M, PNG en cliente; aviso CHIP_CONFLICT como flag + banner, sin canal.
- Riesgo: la comprobacion de duplicado no debe filtrar chip_conflict (corrección P-06). Acta .specify/memory/audits/mifune-012-fase0-2026-11-26.md. Sin ediciones de specs, sin [x], sin commit ni push.

2026-11-28 Mifune (T1691 KISS sobre ENM-005-E, DRAFT 0.1.0, solo lectura): veredicto PASS CON CAMBIOS. Las 5 operaciones nuevas y la enmienda de revokeShareLink se mantienen (cada una cubre REQ-VET12-001..007); recortes R-01 quitar PET_WITHDRAWN (REQ-VET12-007 solo exige auditar la creacion; evita ampliar el CHECK de 005), R-02 quitar position (orden total REQ-PET-005), R-03 espejo PetsPreviewView -> SharedSummaryView + required petIds (el espejo es open-object y no valida nada), R-04 quitar ruta duplicada de revokeShareLink en OpenAPI, R-05 quitar bloque REVALIDATION del schema; R-06 opcional (ERR-VET12-PETS-EMPTY -> 404/422 estandar, requiere Neo).
- Ningun recorte cambia REQ-VET12-001..008 ni INV-VET12-001..004. N-01 (listado por hogar) y N-02 (listado por mascota) no se pueden quitar: caso de enlace huerfano con tope ocupado.
- Acta .specify/memory/audits/mifune-012-T1691-2026-11-28.md. Sin ediciones de contratos, sin [x], sin commit ni push.

2026-11-28 Mifune (T1691 ronda 2, KISS sobre ENM-005-E 0.2.0, solo lectura): veredicto PASS CON CAMBIOS. Aplicados R-01 (sin PET_WITHDRAWN), R-02 (sin position) y R-06 (decision Neo a). R-03 aplicado pero sobredisenado; R-04 NO aplicado (DELETE revokeShareLink repetida con operationId duplicado respecto de 005, ALTA); R-05 parcial (constante REVALIDATION sigue).
- Propuesta: K-01 borrar path duplicado; K-02 quitar REVALIDATION y prosa de AUDIT_EVENTS; K-03 stub TEMPORAL a objeto de referencia sin validar (conviene referencia, no esquema). K-04..K-07 BAJA (puerto/where, historial x4, maxItems 200, trazas inline).
- Acta .specify/memory/audits/mifune-012-T1691-r2-2026-11-28.md. Sin ediciones de contratos, sin [x], sin commit ni push.

2026-11-28 Mifune (T1691 r3, KISS delta sobre ENM-005-E DRAFT 0.2.1, solo lectura): veredicto PASS CON CAMBIOS, sin ALTA ni MEDIA bloqueante.
- Aplicados: K-01 (DELETE duplicada fuera), K-02 (REVALIDATION fuera, AUDIT_EVENTS sin rule), K-04 (sin where ni puerto), K-06 (sin maxItems 200). K-03 parcial (stub sin propiedades, pero description de ~900 caracteres duplica annex 10.3). K-05 y K-07 NO aplicados.
- Complejidad 0.2.1: §8.5 inventario con numeros de linea (no es norma, caduca) y §8.2.2 bandera con redundancias; la bandera en si se conserva (E-5). Recortes R3-01..R3-06 (MEDIA 1, BAJA 5). Ninguno toca REQ-VET12-001..008 ni INV-VET12-001..004.
- Acta .specify/memory/audits/mifune-012-T1691-r3-2026-11-28.md. Sin ediciones de contratos, sin [x], sin commit ni push.
