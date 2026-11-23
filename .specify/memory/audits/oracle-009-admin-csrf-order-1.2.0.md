# Acta Oracle — 009 regla x-sdd-admin-mutation-csrf-order (admin.openapi.yaml 1.2.0) — 2026-11-23
Alcance: auditoría forense en disco, solo lectura. Sin ediciones de código/contrato, sin commits, sin [x].

## A. Contraste de la regla 1.2.0 con T1228 / REQ-ADM9-001 / INV-ADM9-001
- CONFIRMADO: el 403 sin sesión NO revela la existencia del portal. `src/infrastructure/http/plugins/csrf-guard.ts:21-28` (preexistente, committed; `app.ts:79`) lanza 403 en `onRequest` para TODA mutación `/api/*` sin `X-Argos-Request: 1` (salvo `/api/shared` e `/internal/*`), incluidas rutas inexistentes. La prueba `tests/integration/api/t1228-aislamiento-admin-009.api.spec.ts:79-92` compara `DELETE /api/admin/session` y `POST /api/admin/registrations/x/approve` con una ruta inexistente: mismo 403, mismas cabeceras y cuerpo salvo `instance`. Pasa (28/28 en t1228+t1231).
- CONFIRMADO: la regla 1.2.0 solo documenta el comportamiento real del guard global (INV-AUTH-007; spec 001:153-155,233 "validada antes que la sesión"). El texto 1.1.0 ("sin sesión responde 404 uniforme", diff del `CsrfHeader`) era el que contradecía INV-AUTH-007 y el código.
- CONFIRMADO: rompe la redacción LITERAL de T1228 (`tasks.md:97` "devuelven el mismo `404`"), de `plan.md` ADR-009-07 (antes) y de SC-009-009 (`spec.md:244`) para mutaciones sin cabecera: ahora el estado es 403, no 404. REQ-ADM9-001 (`spec.md:139`, "responden lo mismo que una ruta inexistente") y INV-ADM9-001 NO se contradicen en sustancia: el 403 es idéntico al de una ruta inexistente. INV-ADM9-001 (`spec.md:145`) trata RBAC de hogares, no aplica.
- PLAUSIBLE (OBS): la prueba t1228:79 ya redefine el criterio ("mismo 403"), pero `tasks.md` T1228 sigue diciendo 404 sin matiz; falta alinear T1228/SC-009-009 (spec/tasks) con la regla.

## B. Código y pruebas actuales
- CONFIRMADO: la cabecera se valida ANTES de resolver la sesión, vía el guard global (`csrf-guard.ts:25`), previo a cualquier handler. En `admin.routes.ts:120-128` (DELETE) ya llega con cabecera; allí el orden es sesión (123) -> origen (124) -> revocar (125).
- CONFIRMADO: la suite NO asume el orden viejo para la cabecera: t1228:79 y t1231:85-88 (`csrf=false`) esperan 403. Los casos "sin sesión" de t1231:95-98 y 101-104 usan cabecera presente (404 correcto con 1.2.0).
- OBS-1 (PLAUSIBLE, ambigüedad contractual): el nuevo texto de `endAdminSession` (diff contrato) dice "PRIMERO se verifica la cabecera X-Argos-Request y el origen ... antes de resolver la sesión", pero el 403 antes de sesión solo se afirma para la FALTA de cabecera. El código verifica el ORIGEN después de la sesión (`admin.routes.ts:123-124`) y t1231:101-104 exige 404 para origen ajeno sin sesión. Si Neo quiso origen también previo a sesión, código y prueba divergen; si no, el contrato debe quitar "y el origen" del orden.
- OBS-2: docstring de `admin.routes.ts:2` cita contrato "1.1.0" (desactualizado) y `:7`/`:122` no menciona la regla de cabecera previa.
- OBS-3: el contrato 1.2.0 sigue `x-sdd-status: DRAFT`; el propio change_note exige "nueva firma de Neo del contrato y del plan"; no existe firma en disco.

## C. Veredicto
1. Contrato 1.2.0 y plan ADR-009-07: PASS CON OBS. Coherente con INV-AUTH-007 y con el guard real; sin fuga. OBS: ambigüedad del origen (OBS-1), pendiente firma Neo (OBS-3) y alinear redacción de T1228/SC-009-009 (A).
2. Código vs regla tal como está escrita: PASS CON OBS (cabecera: cumple; origen: ver OBS-1 si se lee literal; docstring desactualizado OBS-2).
La regla NO contradice REQ-ADM9-001 en sustancia; sí contradice la letra "404" de T1228/SC-009-009. Esto se escala a Neo (Nivel 2, decisión de contrato, ya adoptada por Neo en Logos (g)): firmar 1.2.0 + plan y autorizar el ajuste de redacción de T1228/SC-009-009 (a "mismo 404, y mismo 403 de ruta inexistente para mutaciones sin cabecera"). No se corrige aquí.
