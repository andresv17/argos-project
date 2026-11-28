# Oracle 012 Bloque D (#32) — lote final de backend (1506c8a..0166edd, desde 1ffbad9) — 2026-11-27

Rama 012-multiduenio-microchip-cuidador @ 0166edd. Veredicto global: CUMPLE CON RESERVAS (1 hallazgo alto: purga de auditoria EMERGENCY_* a 90 d sin implementar).

## Gates (PG real 127.0.0.1:55432)
- npx tsc --noEmit: rc=0
- verify-oracles.sh: rc=0, 687 archivos, 0 debiles
- verify-traceability.sh --feature 012: rc=0, 309/309 IDs propios mapeados, 151/350 trazados en codigo, pureza 0 violaciones
- vitest (tests/unit/emergency-012, tests/integration/emergency-012, api emergency-routes/critical-allergies-audit/emergency-maintenance-hook, t1517): 18 archivos, 352 tests, rc=0

## Veredicto por punto
1. H-D1 (b): CUMPLE. recordEmergencyAudit sin parametro de estado, newStateHash=null fijo (emergency-support.ts:49-63); actorRoleOf eliminado; 0 usos de actorRole/origin de auditoria en src/ y tests/ (solo menciones en titulo/negacion de tests y un comentario). actorUserId NULL en sistema (SYSTEM_EXECUTOR -> null en emergency-support.ts:173). Contrato (anexo 1/4/9, schema AUDIT_EVENTS, data-model L125, SC-012-122, openapi) coherente. Reserva menor: comentario obsoleto emergency-use-cases.ts:336 ("origin = PHONE_HMAC_KEY_ROTATION"); el anexo (status APPROVED) fue editado por 0166edd en ejecucion de la decision de Neo H-D1 b, el estado no cambio.
2. H-D2 (a): CUMPLE. server.ts:184-185,223 compone loadEmergencyServicesFromProcess(config.publicBaseUrl) -> deps.emergency; sin PHONE_HMAC_KEY null y sin rutas; clave corta/URL invalida lanza EmergencyConfigError sin eco de valores (emergency-config.ts:41-55; server-composition-012.spec 4 pruebas verdes). git show b5816b5 -- server.ts: 4 lineas, 0 originVerify. process.env solo en config/ (INV-ARCH-006, gate de pureza 0).
3. Mantenimiento: NO CUMPLE en la purga. RunEmergencyMaintenanceUseCase y RotatePhoneHmacKeyUseCase enganchados (maintenance-use-cases.ts:383-387) con prueba. PERO la purga de audit_log EMERGENCY_* a 90 d (decision 3a, anexo rule/retencion) NO existe: clearHistoryBefore solo limpia columnas de pet_emergency_cards (sqlite-emergency-repositories.ts:63-66,90) y no hay DELETE sobre audit_log por tipo EMERGENCY_*; solo rige la purga general (auditBefore, sqlite-unit-of-work.ts:107). Sin prueba. El keymaker lo declaro pendiente en el bus. La lectura (withinHistory) filtra a 90 d, asi que no hay fuga hacia la UI, pero la retencion en disco excede 90 d. Cuando se implemente, debe usar solo mutation_type y timestamp (no details/metadata; hoy no se escriben, consistente con H-D1 b).
4. touchLastScanned: CUMPLE. emergency-use-cases.ts:269-293: lectura en transaccion, marca en segunda transaccion con try/catch tras la respuesta; la vista no depende de last_scanned_at; regresion en SQLite y PG (parity spec, SC-012-050/051) verde.
5. t1517: CUMPLE. at(-12) = 0026 en SQLite y PG; ultimas migraciones 0041_emergency_card.sql (SQLite) y 0037_emergency_card.sql (PG); 30 tests verdes.
6. 61.a escritura y Retry-After en HEAD/OPTIONS: CUMPLE (emergency-routes-012.api.spec, 10 tests verdes; asercion Retry-After>0 y cubo de mutaciones independiente).
7. T1674 (las tres aserciones cambiaron en 3861257, no en el rango auditado; verificado con git diff cc5edcc 3861257):
   a) text-policy.spec L128 'Niña'->'Niña': CORRECTA. El oraculo rojo original tenia entrada 'Nĩa' (i con tilde combinante) y esperaba 'Niña' (n con enie): imposible, NFC('Nĩa')='Nĩa'. La entrada corregida es NFD de 'Niña' (n + U+0303) y sigue ejerciendo la normalizacion NFC (entrada != salida); no se debilita. Nota: la linea "sin cambios si ya es valido" (Luna) se conserva.
   b) parity SC-012-087 unshare: CORRECTA. La regla ERR-ACCOUNT-OWNS-SHARED-PETS es de 002 (REQ-ACC-002, account-deletion.machine.json:41,149); unshare (fixtures/co-ownership-012.ts:221) solo borra asignaciones y membresia del hogar y es precedente en 6 suites de 012. La prueba sigue afirmando borrado de consentimientos (consentRows vacio tras haber creado uno), consentedBy=NULL, OFF/AUTO_GUARD_LOST y 1 evento de desactivacion. Reserva menor preexistente: el titulo promete seudonimizar eventos EMERGENCY_* pero no se afirma en esta prueba (cubierto en otras suites de borrado de cuenta, no verificado aqui).
   c) parity SC-012-083 lazy: CORRECTA. Mismos 6 llamados y misma asercion (codeOf(call()) === NOT_FOUND); solo cambia que las promesas se crean al evaluarse; no es vacua y aun verifica sin escritura (cardRow null, consentRows vacio). Efecto colateral: ya no se ejercita concurrencia entre las 6, que no era el objeto de la prueba.
   Ninguna necesita decision de Neo.
8. CUMPLE. git diff --name-only 1ffbad9 HEAD no toca terraform/, .env.example, workflows, app-config.ts, origin-verify, tests/unit/origin-verify-guard.spec.ts, specs/005, package.json ni care.*. Sin index.lock.

## Hallazgos
- H-BD-F1 (ALTO, no bloquea el cierre de las rutas pero si el de #32 segun decision 3a): purga de audit_log EMERGENCY_* a 90 d ausente (ver punto 3). Ruta: keymaker, ampliar RunEmergencyMaintenanceUseCase o purgeExpired con DELETE ... WHERE mutation_type LIKE 'EMERGENCY\_%' AND timestamp < cutoff, en SQLite, PG y memoria, con prueba que fije que no lee details.
- H-BD-F2 (BAJO): maintenance-use-cases.ts:385-386 traga errores con .catch(() => null) sin registro; un barrido que falla de forma persistente queda invisible. Sugerido: contar/loguear sin PII.
- H-BD-F3 (BAJO): comentario obsoleto emergency-use-cases.ts:336 menciona origin.
- Observacion: la prueba de enganche (emergency-maintenance-hook-012) solo observa la purga QR_*; no cubre wait-expired ni rotacion via runMaintenance (cubiertos por casos de uso en otras suites).
