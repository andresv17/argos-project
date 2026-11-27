# Errata MINOR — REQ-OWN12-011 / NFR-012-008: candado global vs candado por mascota

- **Estado:** APPROVED (Nivel 2, Neo, 2026-11-27)
- **Clase:** MINOR (texto normativo; no cambia valores ni IDs)
- **Afecta:** `spec.md` REQ-OWN12-011 (linea ~85) y NFR-012-008 (linea ~413). Spec 003 `REQ-PG-004` queda intacta.

## Antes
- REQ-OWN12-011: "La toma del bloqueo usa `lock_timeout` acotado (constante `OWNERSHIP_LOCK_TIMEOUT_MS` en `feature-012-limits.ts`, valor a fijar en `T1616`) y devuelve el mismo error reintentable, de modo que una supresion que bloquea N mascotas no espera sin limite;"
- NFR-012-008: "... reevaluacion acotada a una sola vez con rollback reintentable y `lock_timeout` (`trinity C-1`); son idempotentes."

## Despues
- REQ-OWN12-011: se distinguen dos candados: (i) candado global del UnitOfWork (`pg_advisory_xact_lock`, spec 003 `REQ-PG-004`) con `lock_timeout` de 3000 ms solo en transacciones de propiedad, que al vencer devuelve `503 ERR-OWN12-RETRYABLE`; (ii) candado por mascota (`SELECT ... FOR UPDATE` en `pet_id ASC`) tomado dentro del candado global. Se anade el residual aceptado en la clausula de orden autorizacion -> bloqueo.
- NFR-012-008: el `lock_timeout` de 3000 ms rige solo sobre el candado global en transacciones de propiedad (`503 ERR-OWN12-RETRYABLE`); el candado por mascota se toma dentro de aquel.

## Residual declarado
Un no propietario que espera el candado global del UnitOfWork puede recibir `503 ERR-OWN12-RETRYABLE` tras 3 s en vez de `404` inmediato. Aceptado por Neo.
