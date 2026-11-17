# Veredicto Oracle — T252 final con decision de Neo (it.skip retirado; GET /api/backup/export con contract:false) — 2026-11-12, base 57b2083

**Veredicto: CONDICIONADO (apto para REVIEW).** Compuertas en verde. Las dos pruebas son fuertes en seguridad de contenido pero NO ejercen la ruta POST de la 002 ni prueban 401/403 de rol; eso queda como deuda explicita de la rebanada 5 (T271), no como bloqueo.

## Salidas literales
- access-control: `Test Files 1 passed (1)  Tests 13 passed (13)`.
- verify-oracles: `Archivos analizados: 83; oraculos debiles: 0 ... Resultado: CUMPLE`.
- tsc --noEmit: sin salida, exit 0.
- session-csrf + households.property: `Test Files 2 passed (2)  Tests 17 passed (17)`.
- tasks.md (git diff): solo T250 y T251 pasan a [x] (previo). T236-T242 y T252 siguen [ ].

## 1. Que afirman las pruebas (lineas ~85-107)
- INV-ACC-001/INV-AUTH-003: login maria.v, GET /api/backup/export con contract:false. Afirma exactamente: status 200; ids de pets == [LUNA_ID]; owners unicos == [exportedByUserId]; el texto NO contiene ARGOS_ID; el texto NO coincide con /password|passwordHash|token/i.
- INV-ACC-002: exporta con maria.v, importa ese texto con lucia.r: 409 ERR-BACKUP-REFERENTIAL-INTEGRITY, finalState ROLLED_BACK y api.dump() identico (estado intacto).
- Oraculo: FUERTE en aislamiento de datos y no-fuga de secretos (valores concretos, toEqual) y en la integridad del import ajeno. NO cubre 401 sin sesion ni 403 para rol sin EXPORT_IMPORT_BACKUP; solo usa actores maria.v (dueno) y lucia.r. Alcance real: "un dueno solo exporta lo suyo" y "no se puede apropiar mascotas ajenas por import", no "un rol no autorizado no exporta".

## 2. Ruta que sirve el codigo real
backup.routes.ts:20 `app.get('/api/backup/export', { onRequest }, ...)` y :25 `app.post(BACKUP_IMPORT_PATH ...)`. Solo GET para export (contrato 001); no hay POST export. onRequest = requireSession (401 sin sesion); no hay verificacion de permiso EXPORT_IMPORT_BACKUP (grep en src/infrastructure/http: 0 coincidencias; solo aparece en src/generated). OpenAPI 002 (linea 196): POST /backup/export, x-sdd-rbac-action EXPORT_IMPORT_BACKUP, rate limit, token efimero, CSRF.
Causa raiz de Neo CONFIRMADA: `git show 72e7e70` cambio las dos llamadas de GET a POST + x-argos-request antes de que existiera la ruta.

## 3. Riesgo de encubrimiento
SI existe. Con GET + contract:false las pruebas pasan aunque la ruta POST de la 002 no exista (hoy no existe: es 404) o este rota, porque nunca la llaman y se desactiva la validacion OpenAPI de esa llamada. Tampoco detectan que la ruta GET carezca de chequeo de rol (cualquier sesion exporta lo propio; sin chequeo RBAC no hay prueba de 403). Protegen contra exfiltracion cruzada de datos (contenido filtrado por dueno, sin secretos, import ajeno rechazado) independientemente del verbo, pero NO contra exfiltracion por rol sin permiso, que es el riesgo propio de la 002.
Mitigacion presente: comentario H-T252-4 en ambas pruebas rotula el GET como temporal hasta T271. Sin it.skip ni fallo de verify-oracles.

## Deuda explicita de rebanada 5 (T271), debe registrarse en tasks.md/T271 por Keymaker o Neo
- D-T271-1: volver a POST /api/backup/export con x-argos-request y retirar contract:false de ambas pruebas (INV-ACC-001/002).
- D-T271-2: anadir celdas 401 sin sesion y 403 ERR-ACC-FORBIDDEN para roles sin EXPORT_IMPORT_BACKUP (REQ-RBAC-001) y 404/405 del GET antiguo.
- D-T271-3: retirar la excepcion deleteRecord del Cuidador cuando la rebanada 4 sirva la ruta (ya registrada en H-T252-R3 previo).
Ruta GET 001 y POST 002 divergen: al implementar T271, esas dos pruebas deben fallar hasta migrar la llamada (comprobar).

## Hallazgos
- H-T252-F1 (deuda, media): pruebas de backup no ejercen la ruta POST de la 002 (limitacion arriba).
- H-T252-F2 (deuda, media): no hay prueba ni codigo de 403 por rol para exportar; la ruta GET solo exige sesion.
- H-T252-F3 (menor): seguir con la excepcion deleteRecord autocaducable.
- Nada que Keymaker deba reintentar. Marcar T236-T242/T252 [x] solo lo puede hacer Neo.

DE: Oracle
PARA: Neo (Andres Vallejo — Nivel 2)
ESTADO: Validacion requerida
