# Acta /architect — Errata MINOR REQ-OWN12-011/NFR-012-008 y limpieza de spec.md (2026-11-27)

Aprobacion Nivel 2: Neo, 2026-11-27.

## 1. Errata MINOR
- spec.md REQ-OWN12-011 (~l.85) y NFR-012-008 (~l.413): distincion candado global UnitOfWork (pg_advisory_xact_lock, lock_timeout 3000 ms solo en transacciones de propiedad, 503 ERR-OWN12-RETRYABLE; spec 003 REQ-PG-004 intacta) vs candado por mascota (FOR UPDATE, pet_id ASC, dentro del global). Residual declarado en REQ-OWN12-011.
- Documento: specs/012-.../contracts/errata-MINOR-REQ-OWN12-011-candado.md (APPROVED).

## 2. Limpieza del diff previo de spec.md
`git diff` previo: 1 solo hunk (l.~419, "Cierre trinity T1612"): `OWNER_REQUESTS_PER_USER_PER_PET_PER_DAY` -> `OWNER_REQUESTS_PER_USER_PER_DAY (10, por usuario y no por mascota; errata RES1)`. Clasificacion (a) aprobado: CONSERVADO. Ningun hunk revertido; ninguno inclasificable. S-4/S-07/S-08 y ERR-SCHEMA-VALIDATION-FAILED no aparecian en el diff (ya en HEAD).
Diff resultante vs HEAD: 3 hunks = RES1 + REQ-OWN12-011 + NFR-012-008 (+ residual).

## 3. Verificacion
`bash scripts/verify-traceability.sh --feature 012` rc=0 (CUMPLE).
