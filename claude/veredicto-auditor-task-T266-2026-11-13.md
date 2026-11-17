# Veredicto Oracle — T266 [US6] mantenimiento ADR-002-14 (2026-11-13)

VEREDICTO: APTO (sin bloqueantes; 6 decisiones de Keymaker elevadas a Neo y 3 hallazgos informativos). Base HEAD 7b0820b, sin commit.

## Medido en disco
- verify-traceability --feature 002 --task T266: CUMPLE (IDs 2/2, pureza 0 violaciones).
- verify-oracles: CUMPLE, 91 archivos, 0 debiles.
- tsc --noEmit: exit 0, 0 errores.
- audit.api.spec 18/18; sqlite-maintenance.spec 3/3.
- Suite completa: 94 fallos de 1488 (15 archivos fallidos, 53 OK). Base T265: 96/1485. Los fallos estan en backup-use-cases, backup-atomicity, presentation (components/view-model/validation), sqlite-backup-import, canonical-fixtures, generated-contracts, openapi-conformance, pets-records.api, security (malicious-input, credentials) e infrastructure-adapters (scrypt timeout). Ninguno es archivo tocado por T266 (diff: unit-of-work.port.ts, sqlite-unit-of-work.ts, server.ts, maintenance-use-cases.ts, sqlite-maintenance.spec.ts; sin cambios en tests/ previos ni contratos).

## Verificaciones del diff
a) Sin escritura en audit_log: la unica sentencia sobre audit_log es DELETE (sqlite-unit-of-work.ts:66); no se usa AuditLogPort. La prueba confirma COUNT = antes - 1 y la fila MIGRATION intacta. OK.
b) Salida solo conteos (MaintenanceCounts, 5 enteros); server.ts registra {maintenance: counts}; el fallo se loguea sin detalle. OK.
c) maintenance-use-cases.ts sin new Date ni Date.now (el unico match del grep generico es "parseIsoCalendarDate(nowIso", falso positivo); usa clock.nowIsoTimestamp() y monthlyAnniversary. OK (INV-ARCH-001).
d) purgeExpired: las 5 DELETE dentro de un unico runInTransaction; checkpointAfterCommit() se invoca despues de que la promesa de la transaccion resuelve (sqlite-unit-of-work.ts:68-69). Si una DELETE falla, se revierte todo y no hay checkpoint. OK.
e) Reglas contra spec: sesiones (data-model.md:53 y plan.md:100 "expiradas o revocadas con mas de 7 dias"): la formula revoked_at < now-7d OR created_at < now-7d-24h OR last_activity_at < now-7d-30min equivale a expiracion derivada (INV-AUTH2-002) mas 7 dias. Terminales 90 dias (data-model.md:149, :165). Tokens vencidos (plan.md:100). Auditoria 24 meses (data-model.md:207). OK.

## Hallazgos
- H-T266-I1 (informativo): el valor ARGOS_AUDIT_RETENTION_DAYS esta cargado y validado en app-config.ts pero nada lo consume; el contrato AuditRetentionPolicy (types.ts:151-161) declara retentionMonths 24 y a la vez configName en dias con default 730. Dos fuentes de verdad para la misma retencion: configuracion muerta. Decision de Neo (D5).
- H-T266-I2 (informativo): invitaciones ACCEPTED se purgan a los 90 dias; data-model.md:179 solo menciona DECLINED y CANCELLED como terminales con purga. La prueba no cubre ACCEPTED. Decision de Neo (D4).
- H-T266-I3 (informativo): scheduleMaintenance/startServer (arranque + 24 h, unref, clearInterval en onClose) no tiene prueba automatizada; solo se verifica por lectura. No bloquea (tsc y trazabilidad OK) pero conviene una prueba con temporizadores falsos.

## Decisiones de Keymaker
| # | Decision | Respaldo | Cita |
|---|---|---|---|
| D1 | Arranque + cada 24 h | NO respaldada: decision de Neo | grep de arranque/cada 24/periodic en spec, plan y data-model: sin coincidencias; plan.md:100 solo dice "Mantenimiento" sin frecuencia |
| D2 | Sesion: reglas por created_at, last_activity_at, revoked_at | Respaldada en lo esencial; la formula exacta es derivacion | data-model.md:53 "Se purgan las filas expiradas o revocadas con mas de 7 dias (P-03)"; INV-AUTH2-002 (spec.md:275) |
| D3 | Token vencido = expires_at < ahora | Respaldada | plan.md:100 "tokens vencidos"; data-model.md 2.4 define expires_at = created_at + 10 min |
| D4 | Membresias por data.updatedAt; invitaciones COALESCE(responded_at, created_at) | Parcial: 90 dias respaldado; columna de referencia de membresias y ACCEPTED, decision de Neo | data-model.md:149 "Las filas terminales (LEFT, REMOVED) se retienen 90 dias"; :179 "contados desde responded_at" (solo DECLINED/CANCELLED) |
| D5 | 24 meses de calendario; ARGOS_AUDIT_RETENTION_DAYS sin usar | Tension en spec: decision de Neo | data-model.md:207 "retencion de 24 meses desde timestamp"; types.ts:151-160 retentionMonths 24 vs configUnit dias, defaultDays 730; plan.md:126 "unidad: dias, valor por defecto provisional 730" |
| D6 | InMemoryUnitOfWork sin purgeExpired | Sin pronunciamiento de spec; coherente con port opcional y runMaintenance devuelve ceros (probado) | unit-of-work.port.ts: purgeExpired opcional; plan sin mencion de memoria |

Nada de lo anterior requiere cambios de codigo antes de REVIEW; Neo decide D1, D4 (ACCEPTED y campo), D5. Marcar [x] en tasks.md es potestad exclusiva de Neo.
