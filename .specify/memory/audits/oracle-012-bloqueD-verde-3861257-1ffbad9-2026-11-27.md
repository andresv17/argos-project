# Acta Oracle — Bloque D (#32) FASE VERDE, commits 3861257, 1b68ac8, 5365585, 1ffbad9 (2026-11-27)

Veredicto global: CUMPLE CON RESERVAS. 0 bloqueantes (CRITICA/ALTA). Rama 012-multiduenio-microchip-cuidador @ 1ffbad9.

## Veredicto por tramo
- T1675 (3861257): CUMPLE CON RESERVAS (H-D1 MEDIA, H-D3 BAJA, H-D4 INFO)
- T1680 (1b68ac8): CUMPLE
- T1684 (5365585): CUMPLE CON RESERVAS (H-D2 MEDIA: loadEmergencyServices sin cableado, pendiente H-01 declarado)
- T1662 (1ffbad9): CUMPLE CON RESERVAS (H-D1: actorRole solo como hash)

## Puntos 1..8
1. CUMPLE CON RESERVAS. Constantes en src/domain/platform/feature-012-limits.ts (90/90/20/60/30/"/emergency"); exposeHeadRoute:false; 404/429 uniformes con instance constante; shell con cabeceras annex §5; token 32 bytes base64url, solo SHA-256 en BD, devuelto una vez (shownOnce); reconcileCard tras autorizar y mutar; espera 90d (> estricto); rotacion recalcula o borra; lastChange lista blanca 4 tipos; criticalAllergiesChange derivado; topes por usuario en rate_limit_events; CSRF; 3 motores (memory/sqlite/pg). BAJA-1 y BAJA-2 cerrados. Reservas H-D1, H-D3, H-D4.
2. CUMPLE. EMERGENCY_PATH_PATTERN sin anclar, cualquier longitud, sufijo, barra final, %2f, req.url y Route not found (scrubValue).
3. CUMPLE CON RESERVAS. URL ASCII, 106 bytes, base unica por parametro (sin Host/X-Forwarded); LRU 10000 con expiradas primero; IPv6 /64 via normalizeClientIp; buckets QR_CARD_MUTATION 20/h y QR_PRIVATE_WRITE 60/h. Reserva H-D2 (cableado) y H-D5 (sin prueba de 61.a escritura en QR_PRIVATE_WRITE).
4. CUMPLE CON RESERVAS. Auditoria sin contenido ni conteo, tambien ADMIN (actorRoleOf); texto m-6 identico al esquema (schema l.261, emergency-texts.ts). Reserva H-D1.
5. CUMPLE CON RESERVAS (3a). Sin columna details ni migracion en los 4 commits. PERO recordEmergencyAudit escribe newStateHash = hash de metadatos ({actorRole}, {visible,noticeVersion,origin}, {reason}): es un "cuerpo" hasheado fuera de "entidad, actor, tipo, fecha" -> H-D1.
6. CUMPLE. Esquema l.162 y l.480 usan EMERGENCY_CARD_REGENERATED; codigo emergency-support.ts:30, emergency-use-cases.ts:110, emergency-card-rules.ts; cero ROTATED.
7. CUMPLE. app.ts: solo 3861257 lo toca (+5/-1: import, frameworkErrors, registerEmergencyRoutes); 1b68ac8, 5365585, 1ffbad9 no lo tocan. Los cambios H-01 de app.ts siguen sin commitear en el arbol de trabajo (ajenos).
8. CUMPLE. Ningun commit toca terraform/, .env.example, .github/workflows/, app-config.ts, server.ts, origin-verify.ts, origin-verify-guard.spec.ts, specs/005, package.json ni contracts/.

## Hallazgos
- H-D1 MEDIA — src/application/use-cases/emergency-support.ts:53-64 y emergency-use-cases.ts:212: annex §1 (l.32) exige campo actorRole en PET_CRITICAL_ALLERGIES_UPDATED y annex §9 exige origin=PHONE_HMAC_KEY_ROTATION; con la decision 3a (sin details) solo se guarda newStateHash=hash({actorRole}) / hash({origin}). No es legible ni consultable; con 3 valores posibles es reversible por fuerza bruta (hash de metadato, no de contenido de alergias). Contradiccion annex vs 3a: Neo/architect debe decidir si basta el hash (aceptar y anotar en el contrato) o si pasa a null (cumple 3a literal, pierde actorRole/origin). La prueba critical-allergies-audit-012 verifica el rol por hash.
- H-D2 MEDIA (declarada) — src/infrastructure/config/emergency-config.ts: loadEmergencyServices no tiene consumidor (grep sin referencias en server.ts/app.ts); sin cableado, deps.emergency es undefined y ninguna ruta de la ficha existe en produccion; la validacion de arranque de ARGOS_PUBLIC_BASE_URL/PHONE_HMAC_KEY no corre. Pendiente de Morpheus (H-01, server.ts/app-config.ts).
- H-D3 BAJA — src/application/use-cases/emergency-use-cases.ts:280-286: try/catch de touchLastScanned dentro de runInTransaction; en PostgreSQL un error de sentencia aborta la transaccion y la respuesta publica seguiria devolviendo la vista (COMMIT degrada a ROLLBACK). Sin impacto de seguridad; solo se pierde last_scanned_at.
- H-D4 INFO — emergency-routes: el contador del shell/HEAD/OPTIONS se prueba en parte (tests api l.114, l.168); no hay prueba del Retry-After de 429 sobre HEAD/OPTIONS especificamente.
- H-D5 BAJA — falta prueba de integracion de la 61.a escritura de QR_PRIVATE_WRITE (solo la 21.a de QR_CARD_MUTATION, emergency-routes-012.api.spec.ts:86; limites cubiertos en limits-012.spec.ts).
- H-D6 INFO — emergency-migration-012.spec.ts "[SC-012-127]" agoto 5000 ms bajo carga (tsc/verify en paralelo); pasa aislado en 1.2 s. Posible flaky; sugerir testTimeout explicito.
- H-D7 INFO — commit 1ffbad9 describe "Auditoria sin contenido con actorRole..." pero su diff solo trae emergency-texts.ts y la prueba; la implementacion de T1662 vive en 3861257 (UpdateCriticalAllergiesUseCase). Trazabilidad por commit imprecisa, sin impacto.

## Gates (PG real 127.0.0.1:55432)
- npx tsc --noEmit: rc=0
- bash scripts/verify-oracles.sh: rc=0 (685 archivos, 0 debiles)
- bash scripts/verify-traceability.sh --feature 012: rc=0 (309/309 IDs propios mapeados; 151/350 trazados)
- vitest (tests/unit/emergency-012, tests/integration/emergency-012, emergency-routes-012.api, critical-allergies-audit-012.api): 15 archivos, 311/312 verdes en la corrida conjunta; 1 timeout de 5 s (H-D6); re-ejecutado aislado 2/2 verde. Efectivo 312/312.
- test:gate completo no ejecutado (instruccion).
No se modifico codigo, tests, contratos ni tasks.md; sin commits.
