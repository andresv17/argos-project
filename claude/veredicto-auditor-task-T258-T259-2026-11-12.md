# Veredicto de The Oracle — T258 y T259 (fase VERDE, sin commit) — 2026-11-12

Rama 002-plataforma-v21 @ d83cb77 (arbol de trabajo con cambios de Keymaker sin commit). Veredicto: **CONDICIONADO (apto para REVIEW)**. Sin marcar tareas; la firma es de Neo.

## Integridad
- Keymaker NO toco specs/**/contracts/**, src/generated/**, tasks.md, scripts/handoff.py ni logos.json/scripts/logos.py (estos dos ya eran no versionados). Cambios en src: ports, record-use-cases, record-invariants, app-config, pets.routes, use-cases, in-memory-uow, sqlite-database/repositories + nuevos src/domain/audit/*, superseded-guard.ts, migracion 0005. Pruebas tocadas: species-migration, sqlite-repositories, app-config (listas de migracion / auditHmacSecret).

## Verificaciones
1. Migracion 0005: audit_log sin FK; STRICT; CHECK mutation_type (10 valores) y entity_type (13) coinciden con src/generated/schemas/types.ts; fila MIGRATION exige SYSTEM/SYSTEM/hashes nulos; INSERT de exactamente 1 fila MIGRATION; schema_migrations impide repetirla; PRAGMA secure_delete=ON en la migracion y en openSqliteDatabase (sqlite-database.ts:73). roles-migration 13/13.
2. Dominio audit: lista de secretos completa (canonical-view.ts), recursiva (incluye arreglos), sessionId no excluido, copia nueva (no muta), sin node:crypto (sha256 puro; los unicos imports son locales). 
3. ARGOS_AUDIT_HMAC_SECRET (app-config.ts:~108-112): obligatoria con NODE_ENV=production, patron hex par >=64 caracteres, AppConfigError solo recibe el NOMBRE de la variable. grep: ningun otro uso en src (el valor no se loguea ni se lanza).
4. superseded-guard.ts: lanza DomainError ERR-REC-SUPERSEDED-IMMUTABLE (409 por catalogo), @implements REQ-REC2-003, SC-015, ERR-REC-SUPERSEDED-IMMUTABLE.
5. PATCH/DELETE vacunas (pets.routes.ts:48-55; record-use-cases): requirePetAction (404 antes que 403) -> registro inexistente ERR-PET-NOT-FOUND -> esquema/dominio -> guarda 409. DELETE responde 204 con accion DELETE_HEALTH_EVENTS.

## Veredicto sobre CC-T258-2 (en la bitacora figura como CC-T258-1): columnas VIRTUAL sobre data JSON — ACEPTABLE, con reserva
- Evidencia: las tablas reales (vaccinations/dewormings, 0001_init.sql) guardan el registro en `data` JSON; las columnas nuevas son GENERATED VIRTUAL anulables derivadas de data (sin copia que sincronizar, sin NULL falso: ausencia = NULL). Cumple la directiva de Neo de columnas clinicas anulables y "requiere proxima dosis = next_* IS NOT NULL" (data-model §2.7).
- INV-REC-004/005: se hacen cumplir en dominio (record-invariants.ts, ERR-REC-INVALID-BOOSTER-DATE y equivalente; record-invariants 32/32, record-next-dose verde), no como CHECK de tabla como describe data-model §2.7 (que supone tablas vaccination_records/deworming_records normalizadas que no existen en esta base). Reserva: no hay CHECK en BD; un INSERT directo saltaria el invariante. Riesgo bajo (unico escritor es la capa de aplicacion). Debe constar como desviacion declarada de data-model §2.7; la normalizacion queda para Architect/Neo si se quiere el CHECK.

## Regresion access-control.security.spec.ts:247
- Confirmada con salida real: 12 pasan, 1 falla; diferencia unica: la lista esperada trae ['eliminar evento sanitario','eliminar otro registro'] y se recibe ['eliminar otro registro']. notForbidden=[] (la celda 'eliminar evento sanitario' ya responde 403 ERR-ACC-FORBIDDEN). Es el comportamiento CORRECTO.
- La excepcion H-T252-2a (ratificada por Neo) se declaro autocaducable "cuando la Rebanada 4 sirva la ruta". Se sirve solo para vacunas; 'eliminar otro registro' (otros modulos) sigue 404 hasta T260-T263.
- Dictamen: la correccion minima (dejar solo 'eliminar otro registro' en la lista esperada y actualizar el comentario) es la correcta y NO amplia la excepcion. Como toca una excepcion ratificada por Neo, requiere su visto bueno (Nivel 2) antes de que Keymaker la aplique. Retirar la ultima celda al cerrar T260-T263.

## Pruebas (ejecutadas por mi)
audit-canonical 18/18; audit.property 4/4; record-invariants 32/32; app-config 20/20 (74/74 en total); roles-migration 13/13; species-migration 13/13; sqlite-repositories 37/37 (63/63). audit-pseudonym.spec: sin fallos en el filtro (cubierto por T257 rojo -> verde).

## Compuertas
tsc --noEmit: exit 0. verify-oracles: 88 archivos, 0 debiles, CUMPLE. verify-traceability --feature 002 --task T258: CUMPLE; --task T259: CUMPLE.

## Suite completa: 116 fallos (19 archivos), ninguno propio de T258/T259 salvo access-control
- access-control:247 (arriba) — unica roja dentro de alcance; condicion C1.
- audit.api (15), account-deletion (5), assignments-ownership (1, fila OWNERSHIP_TRANSFER): auditoria real, T264-T265. 
- backup-use-cases (49), backup-atomicity (11), sqlite-backup-import (4), backup-import-atomicity (1), credentials/malicious-input (4, exportBackup 404/ contrato), openapi-conformance (2): rebanada 5 / T271.
- pets-records GET /pets (3): deuda de base ya registrada. canonical-fixtures (4), generated-contracts (3), presentation (11), infrastructure-adapters scrypt timeout (1): pruebas 001 desfasadas frente a generados 002 / base, previas.
- Observacion H-T258-O1 (no bloqueante): openapi-conformance.spec lista como "sin ruta" updateRecord/deleteRecord porque Keymaker registro /records/vaccinations/:recordId en vez de la plantilla {collection}/{recordId}; el test ya fallaba por exportBackup. Resolver en T260 al generalizar a los 6 modulos.
- Observacion H-T258-O2 (menor): CHECK de hash solo mide longitud 64, no que sea hexadecimal. El hash lo produce stateHash (hex minuscula); aceptable.

## Condiciones para Neo
C1. Autorizar la correccion minima de access-control:247 (Keymaker la aplica; Oracle revalida).
C2. Aceptar CC-T258-2 como desviacion declarada de data-model §2.7 (INV-REC-004/005 en dominio, sin CHECK de BD).
C3. Tomar nota de H-T258-O1 para T260 y de que el resto de rojas queda en T264-T266/T271/deudas previas.
