# Mapa SC-001..SC-017 a pruebas nombradas (T307, feature 002)

Fecha: 2026-11-14. Revisión manual con grep en `tests/` (el ID `SC-0NN` aparece en el título `it/test`). Fuente: `specs/002-plataforma-v21/quickstart.md` §4 y `spec.md`. Nota: el mapa §4 no tiene filas para SC-002 ni SC-007; se añaden aquí.

| SC | Descripción corta | Archivo de prueba (ruta:línea) | Estado |
|---|---|---|---|
| SC-001 | Registro, sesión, cierre y nuevo inicio con la política nueva | tests/integration/api/auth.api.spec.ts:24 y :39 | CUBIERTO |
| SC-002 | 100 % de REQ/INV/STATE/ERR con implementación y prueba por ID | Ninguna prueba en tests/ cita SC-002. Solo la compuerta `scripts/verify-traceability.sh` (T306), cuyo comportamiento se prueba en tests/integration/gates/verify-gates.spec.ts:146-175 sin citar SC-002 | SC-002: aceptado por Neo (iteración 70, 2026-11-14) como cubierto por T306 + T305 + suite verde; sin prueba propia en tests/ (reserva documentada) |
| SC-003 | Cero accesos cruzados con todos los roles | tests/security/exploits/idor-matrix.security.spec.ts:114; tests/security/exploits/nine-vectors-four-roles.security.spec.ts (cabecera L2) | CUBIERTO |
| SC-004 | Importación fallida deja datos idénticos | tests/unit/backup-use-cases.spec.ts:671; tests/unit/fault-injector.spec.ts:26 | CUBIERTO |
| SC-005 | axe sin critical/serious a 320, 768, 1024, 1280 px | tests/e2e/accessibility/wcag.spec.ts:159 | CUBIERTO |
| SC-006 | El timezone del perfil no altera edades, orden ni alertas | tests/integration/api/account.api.spec.ts:185 | CUBIERTO |
| SC-007 | Muchas mascotas, navegación por teclado sin recarga | tests/e2e/visual/rebanada6-recorridos.spec.ts:63 | CUBIERTO |
| SC-008 | Matriz 11 acciones x 4 roles (44 casos) | tests/unit/permissions-matrix.spec.ts:45 (describe; casos por it.each) | CUBIERTO |
| SC-009 | Expiración a 30 min inactivos y 24 h absolutas; recarga no cierra | tests/security/exploits/session-csrf.security.spec.ts:84 y :96; tests/property/auth.property.spec.ts:41 y :51 | CUBIERTO |
| SC-010 | Contraseñas fuera de política rechazadas; cuenta 001 de 8 caracteres inicia sesión | tests/security/exploits/credentials.security.spec.ts:112; tests/property/auth.property.spec.ts:78; tests/integration/persistence/sqlite-repositories.spec.ts:93 | CUBIERTO |
| SC-011 | Migración desde la 001 conserva datos y es repetible | tests/integration/persistence/species-migration.spec.ts:72, :81, :102, :138 | CUBIERTO |
| SC-012 | Una fila por mutación, hash estable, sin secretos, vista canónica | tests/unit/audit-canonical.spec.ts:43 y :115; tests/property/audit.property.spec.ts:33 | CUBIERTO |
| SC-013 | Límites de peso por especie con propiedades | tests/property/records.property.spec.ts:95 y :114 | CUBIERTO |
| SC-014 | Eliminación de cuenta bloqueada o limpia; HMAC; arranque sin secreto | tests/unit/account-deletion.spec.ts:146 y :244; tests/security/exploits/audit-secret.security.spec.ts:73; tests/security/exploits/session-audit-import.security.spec.ts:155 | CUBIERTO |
| SC-015 | Editar un registro SUPERSEDED se rechaza con cualquier rol | tests/integration/api/pets-records.api.spec.ts:551 | CUBIERTO |
| SC-016 | Transferencia con poda de asignaciones y una fila de auditoría | tests/integration/api/audit.api.spec.ts:113 | CUBIERTO |
| SC-017 | Visibilidad exacta tras asignar, desasignar, expulsar, abandonar, eliminar hogar | tests/integration/api/assignments-ownership.api.spec.ts:34 y :47 | CUBIERTO |

## Conteo
- CUBIERTO: 16 (SC-001, 003 a 017)
- SIN PRUEBA PROPIA: 0 (SC-002 aceptado por Neo, iteración 70, cubierto por T306 + T305 + suite verde)

## SC sin prueba
- SC-002: ningún título de prueba en `tests/` lo cita. Se evalúa con la compuerta `bash scripts/verify-traceability.sh --feature 002` (T306), que es un script y no una prueba en `tests/`. Decisión de Neo (Logos, iteración 70, 2026-11-14): SC-002 queda SATISFECHO por la compuerta de trazabilidad T306 (118/118 IDs, pureza 0), la compuerta de oráculos T305 (0 débiles) y la suite verde (tests/unit, integración, e2e). SC-002: aceptado por Neo (iteración 70, 2026-11-14) como cubierto por T306 + T305 + suite verde; sin prueba propia en tests/ (reserva documentada).

## Reservas
- Verificado que el ID o título existe y está en el lugar indicado; no se reejecutó ninguna prueba (el verde lo aporta Keymaker/Oracle).
- SC-005 y SC-007 son pruebas e2e (Playwright); SC-008 depende de `it.each` para sus 44 casos.
