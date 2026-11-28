# Acta Seraph — 012 Bloque B, ciclo claim/finish/release (HEAD c8abd7a) — 2026-11-27
Veredicto: APTO CON RESERVAS (0 bloqueantes; 3 observaciones Low/Info). Solo lectura de src/ y tests/.
Ejecucion: tests/unit/admin-stepup-store-012.spec.ts rc=0 (2/2); tests/integration/api/sentinels-012-bloqueB-T1638.api.spec.ts rc=0 (25/25).

## Foco 1 — AdminStepUpStore (src/infrastructure/http/admin-stepup-store.ts) y withGrant (routes/admin-disputes.routes.ts:70-80)
- Concurrencia: claim es sincrono (sin await entre get y set); el reservado queda con usedAt!=null, la segunda peticion falla en assertStepUpGrant (L100) y el catch (L41) exige usedAt===null, asi que NO borra la reserva ajena. OK.
- Fallo: withGrant llama release (L77) si el caso de uso lanza; restaura usedAt=null conservando issuedAt (vencimiento original). OK.
- Quema: grant del dueno con otra disputa/accion o vencido (usedAt null, adminId igual) se borra (L41). Grant de otro admin o reservado no se borra. OK.
- Cuota: MAX_GRANTS_PER_ADMIN=20 solo borra grants del mismo admin (L23-24). Almacen lleno (5000) lanza AdminForbiddenError sin expulsar (L25). OK.
- Orden en rutas: validacion de cuerpo/ids antes del claim; claim dentro de guarded tras actorOf. OK.

## Foco 2 — hasForeignOrigin
- resolve L131, confirm L148, extend-freeze L105, cancel-execution L159, close-moot L166: foreign() antes de leer cuerpo. step-up L118. POST /api/chip-disputes: ownOrigin en onRequest tras sesion y antes de gate (chip.routes.ts:75-77,80). OK.

## Foco 3 — ARBITRATION-CONFLICT no quema el grant
- Cubierto en sentinels spec L348-358 (rc=0); consistente con release en withGrant.

## Hallazgos
- SER-01 Low admin-disputes.routes.ts:73-78: si el caso de uso ya mutó y falla adminDisputeFile (vista), el catch libera un grant ya efectivo; un replay chocaria con conflicto de estado, impacto bajo. Sugerencia: distinguir fallo previo/posterior a la mutacion o finish tras execute.
- SER-02 Info admin-disputes.routes.ts:112-118: step-up valida cuerpo (400) antes del chequeo de Origin (403), a diferencia del resto; no emite grant, sin impacto de seguridad. Alinear por consistencia.
- SER-03 Info admin-stepup-store.ts:23-25: issue() descarta el grant propio mas antiguo antes de verificar el lleno global (si lanza, ya borro uno propio) y puede expulsar uno propio en vuelo (finish/release quedan no-op, inocuo). Cobertura unitaria no cubre quema por mismatch/vencido ni almacen lleno (solo integracion).
