# Oracle — 009 Fase 5a, ola 3: T1262 / T1268 (reinicio de cuota de cuentas administradoras)

Fecha: 2026-11-23. Rama 009-aprobacion-admin-correo, HEAD 895e233 (cambios sin commit). Veredicto: **PASS CON OBSERVACIONES** (sin FAIL).
Alcance normativo: REQ-CFG9-006 + aclaracion de Neo (opcion A), ADR-009-13, EDGE-009-022/023, SC-009-026.

## Compuerta real
- `npx tsc --noEmit`: exit 0.
- `bash scripts/verify-oracles.sh`: 506 archivos, 0 oraculos debiles, CUMPLE.
- `vitest t1262` (API, SQLite): 18/18 verdes.
- `vitest t1268` con PG17 real (55432): 6/6 verdes (3 motores x 2: SQLite, memoria, PostgreSQL; no se omitio PG).

## Verificaciones
1. Alcance = opcion A: CONFORME. Los tres motores identifican cuentas por `sub` GOOGLE vinculado (`auth_identities`) o por correo con `email_verified_at` no nulo y `lower(email)` en la lista en minuscula; solo ponen a cero `home_scenes` con `owner_user_id = id` y `scene_quota_carry` de esos ids. Ninguna sentencia toca filas con `owner_user_id` NULL ni `platform_parameters` (`scene.global_quota_used.*`). t1262 lo prueba (H1 permanece 3; escena compartida intacta; global 37 con su fecha; MARIA sin verificar y CARLOS intactos).
2. CAS por fila: REAL. SQLite y PG leen (id, valor) y hacen `UPDATE ... WHERE id/clave AND consumed_generations = <leido>` con `changes/rowCount === 1`; cualquier 0 devuelve `null`. El caso de uso lanza `ERR-ADMIN-QUOTA-RESET-CONFLICT` (409 en el catalogo) ANTES de `adminAudit.insert`, dentro de `runInTransaction` (rollback por excepcion; el borrador de memoria se descarta). Sin auditoria en la rama null.
3. Cuerpo no vacio -> 422 (t1262: `{accountsReset}`, `{userId}`, `{all}`, `[1]`) sin reinicio ni auditoria. Auditoria `ADMIN_SCENE_QUOTA_RESET`, `objectRef` nulo, sin ids de cuenta ni contadores (se verifica contra ANDRES/LUCIA/MARIA/CARLOS/correos/sub/H1 y `consumed|37`).
4. Aserciones adaptadas a la opcion A: no relajadas. Test 1 mantiene `accountsReset: 2`, respuesta exacta, H1 = 3 (antes 0) y LUCIA/carry = 0. "no borra historial": mantiene conteo de `scene_attempts`, `imageTag` string y `remaining = max - 1`; H1 sigue en 1 (antes habria sido 0 por el reinicio). "idempotente": segundo 200 y `[3, 0]`. "vuelve a generar": precondicion `ERR-SCENE-QUOTA-EXCEEDED` con consumo 10, tras el reinicio 202 (no vacua). Ninguna sustituye una asercion de comportamiento por una trivial.
5. Rama null sin prueba determinista propia: ver OBS-1.
6. Cobertura PG real de T1268: parcial, ver OBS-2.

## Observaciones
- **OBS-1 (rama null / 409 sin prueba determinista)**: el unico test que podria dar 409 (`reinicio concurrente con la publicacion`) acepta 200 o 409; en SQLite con cola serial casi siempre sera 200, por lo que la rama 409 (rollback total, sin auditoria, sin cambios parciales) y el CAS por fila no tienen aserto que falle si se rompen. Ademas el test de EDGE-009-023 "generacion aceptada" no toca ninguna escena del administrador (H1 compartido). Recomendado: prueba determinista de repositorio (doble cliente que cambia `consumed_generations` entre el SELECT y el UPDATE, o dos conexiones PG) que verifique `null`, y a nivel de caso de uso 409 + estado intacto + 0 auditorias. No bloquea.
- **OBS-2 (PG real: rama de correo y exclusiones sin cubrir)**: t1268 solo ejercita en PG el camino por `sub` (`emails=[]`) y el caso sin coincidencias. La rama `lower(email) = ANY($2)` con `email_verified_at`, la exclusion de correo sin verificar, el `owner_user_id` NULL y `platform_parameters` solo se verifican via t1262 sobre SQLite; en PG no hay evidencia real. El JSDoc de t1268 afirma "hogares compartidos intactos", pero el test no inserta ninguna escena compartida. Recomendado: ampliar t1268 (correo verificado en mayusculas, correo sin verificar, escena `household_id`, fila global) en los tres motores.
- **OBS-3 (menor)**: t1262 comprueba `action.length > 0`, no el literal `ADMIN_SCENE_QUOTA_RESET`; `accountsReset` cuenta cuentas coincidentes aun con contador 0 (coherente con "puede ser 0"). `lower()` de SQLite/PG vs `toLowerCase()` solo coinciden en ASCII; los correos de la lista son ASCII.
- **OBS-4 (lectura de spec)**: `subjects` contiene solo el `sub` del administrador en sesion ("la suya"); un segundo administrador de la lista se alcanza por correo verificado, no por su sub, hasta que inicie sesion. Conforme con REQ-CFG9-006; sin accion.

Sin [x], sin commit, sin push; contratos y `src/generated` sin tocar.
