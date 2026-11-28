# DEUDA-012-WITHDRAW-AUDIT — retirada parcial de una mascota de un enlace PETS sin evento de auditoría

- **Abierta:** 2026-11-28 por `/architect`, por decisión de Neo (Nivel 2), `ENM-005-E` DRAFT 0.2.0, `E-3` (opción b).
- **Origen:** `mifune R-01`, `trinity MEDIA-3`, `merovingian H-1`, `rama H-RAMA-T1691-03`: el evento `PET_WITHDRAWN` chocaba con el `CHECK` de `share_link_audit.event_type` de 005 (`CREATED`, `REVOKED`, `ACCESS_OK`, `ACCESS_FAILED`).

## Motivo
Se quitó `PET_WITHDRAWN` del contrato (anexo §5, §9.3, OpenAPI `x-sdd-audit`, `AUDIT_EVENTS` del esquema) para **no** alterar el `CHECK` de 005 ni abrir una migración de auditoría, una tabla de retención y una vía de lectura nuevas (KISS). Retirar la **última** mascota sigue emitiendo `REVOKED`.

## Riesgo (aceptado)
Cuando un co-propietario retira su mascota de un enlace `PETS` que conserva otras mascotas, **no queda evento de auditoría**: los demás co-propietarios no ven quién ni cuándo la retiró (`REQ-VET12-007` se cumple para `CREATED` y `REVOKED`, no para la retirada parcial). Mitigación actual: la mascota retirada desaparece de `listPetPetsShareLinks` para **todos** los co-propietarios de esa mascota (la fila `share_link_pets` se borra; no solo para quien la retiró, `R2-02`) y el enlace sigue vivo para las demás; retirar la **última** mascota sí emite `REVOKED`; el contrato no registra el ID de mascota en auditoría (minimización, `rama H-RAMA-T1691-03`).

## Condición de reapertura
Reabrir si ocurre cualquiera: (1) Neo pide trazabilidad de la retirada parcial; (2) una auditoría legal o de soporte necesita reconstruir quién retiró una mascota; (3) se abre otra feature que ya amplíe el `CHECK` de `share_link_audit.event_type`. Al reabrir: ampliar el `CHECK` (SQLite reconstrucción; PostgreSQL `NOT VALID` + `VALIDATE`), definir campos mínimos (`share_link_id`, `actor_user_id` nulable, sin `pet_id` o con `pet_id` a `NULL` al borrar la mascota), retención de 90 días y la operación por la que los co-propietarios la ven.

Estado: `OPEN` (deuda de baja prioridad). Responsable propuesto: `/architect` + `/rama`.
