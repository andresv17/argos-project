# Veredicto forense T261 (2026-11-12) - The Oracle
Rama 002-plataforma-v21 @ 18c8754 (cambios T261 sin commit). Veredicto: APTO CONDICIONADO a firma de Neo sobre dos desviaciones declaradas.

## Evidencia
- git status/diff: T261 toca solo ports (audit-log, audit-pseudonym, account-deletion-audit, index), use-case-support.ts, null-audit-log.adapter.ts, hmac-audit-pseudonym.adapter.ts, app-config.ts, .env.example, tests/unit/{app-config,account-deletion}.spec.ts. Sin cambios en specs/**/contracts, src/generated, tasks.md ni logos.json/scripts/logos.py (los dos ultimos sin rastrear, preexistentes).
- Puertos: AuditLogPort solo append y pseudonymizeUser; AuditPseudonymPort solo hmacUserId; sin imports de infraestructura (solo tipos generados y RepositorySet).
- Adaptador: HMAC-SHA256 hex con clave hex (>=32 bytes, par). Unico throw: 'Clave HMAC de auditoría inválida' (sin clave ni mensaje); sin console/log. Probado con claves 'abcd', no hex y impar: mensaje no contiene la clave.
- Vectores audit-fixtures: 2/2 coinciden (tsx, sin persistir).
- app-config: ARGOS_AUDIT_RETENTION_DAYS patron ^[1-9][0-9]{0,3}$, default 730, AppConfigError por nombre de variable; .env.example trae ARGOS_AUDIT_RETENTION_DAYS=730 (coincide). ARGOS_AUDIT_HMAC_SECRET ya existia de tareas previas.
- Pruebas: app-config 20/20, account-deletion 26/26, audit-pseudonym (persistence) 4/4: 50/50.
- Compuertas: tsc --noEmit sin errores; verify-oracles CUMPLE (88 archivos, 0 debiles); verify-traceability --feature 002 --task T261 CUMPLE (4/4, pureza 0).
- account-deletion.spec: diff de 2 lineas (import y tipo); aserciones intactas. app-config.spec: +1 linea (auditRetentionDays: 730 en el esperado), refuerza.

## Dictamen CC-T261-1
ACEPTABLE como forma transitoria: preserva comportamiento de DeleteAccountUseCase, aserciones sin cambios, el nuevo AuditLogPort cumple la tarea. Condicion: T265 debe eliminar AccountDeletionAuditPort, NullAuditLogAdapter y la dependencia ApplicationDeps.audit transitoria (el puerto ya lo declara en su cabecera). Recomendado registrarlo como deuda con ID en tasks.md/T265 (lo hace Morpheus/Neo, no Oracle).

## Dictamen firma con repositories
ACEPTABLE como desviacion declarada: plan.md y data-model.md dicen append(entry)/pseudonymizeUser(userId, hmac), pero ADR-002-05 exige misma transaccion y el patron RepositorySet como primer parametro es el de BackupTokenPort. No viola "solo dos operaciones". Requiere que Architect/Morpheus anote la firma real en data-model.md/plan.md (Caso B menor, documental) para evitar deriva; no bloquea codigo.

## Hallazgos (no bloqueantes)
- H-261-1 (bajo): audit-pseudonym.spec.ts (persistence) no ejercita el adaptador HMAC ni la validacion de clave en prueba propia; verificado manualmente aqui. T262/T264 deberian cubrirlo (o prueba unitaria directa).
- H-261-2 (bajo): KEY_PATTERN del adaptador y AUDIT_SECRET_PATTERN de app-config son regex duplicadas; riesgo de divergencia.

## Para Neo
Firmar: (1) forma transitoria con eliminacion obligatoria en T265; (2) desviacion de firma con repositories. COMPLETED es de Neo.
