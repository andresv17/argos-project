# Veredicto Oracle T247 (revalidación tras B1) — 2026-11-12 — APTO
Solo lectura. Sin tocar src/tests/specs/tasks.md/git.

## B1 (diff de households.api.spec.ts)
Separación con certeza: la evidencia trae el diff -U0 de B1 y coincide línea a línea con el archivo en disco. Toca solo 3 aserciones: (1) EDGE-037/038: members ['ACTIVE','ACTIVE'] + pendingInvitations ['carlos_88:INVITED'] (antes ['ACTIVE','ACTIVE','INVITED']); (2) HOUSE2-001: añade la fila concreta de Carlos (householdId, invitee_username, invitee_user_id, invited_by_user_id, role_on_join, status INVITED, responded_at null) al esperado; (3) conteo 422: WHERE invitee_username <> 'carlos_88', toEqual({n:0}). Más el título del it de EDGE-037/038.
## Sin debilitar
Líneas añadidas: 0 toBeDefined/toBeTruthy/toBeFalsy/any/skip/todo/only/solo-longitud. Todos los valores son literales concretos con toEqual. Las tres adaptaciones trasladan el oráculo al modelo 3.0.0 conservando igualdad exacta.
## Alcance
mtime de fixtures (09:29:56) y de assignments/roles specs (<=09:29) es anterior a la edición de B1 (09:42:34): B1 no tocó fixtures, src ni otros tests. Los diffs acumulados de src/fixtures son de T245-T247 ya revisados.
## Gates (salidas literales re-ejecutadas)
- households.api.spec: Test Files 1 passed; Tests 29 passed (29)
- assignments-ownership.api.spec: Tests 1 failed | 10 passed (11); rojo: [REQ-AUD-001][SC-016] no such table: audit_log (B2)
- roles.api.spec: Tests 13 passed (13)
- tsc --noEmit: solo household-policies.spec.ts(366,72) y (376,37) 'permissions' (T248)
- verify-oracles: Archivos analizados: 81; oráculos débiles: 0; CUMPLE
## Fuera de T247 (destino acordado)
B2 audit_log -> T264/T265 (aceptado por Neo); H-T246-5 (422 vs 403) -> Architect; H-T247-1 (GET /households/{id}/pets ignora asignaciones) -> T248; H-T247-2 (microchip duplicada en transferencia) -> Architect. Ninguno bloquea T247. Menores abiertos: H-T247-3, H-T247-4.
## Decisión
APTO. Técnico en REVIEW; el techo es REVIEW: solo Neo marca [x] en tasks.md.
