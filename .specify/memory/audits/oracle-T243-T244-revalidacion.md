# Oracle: revalidacion T243/T244 (2026-11-11)
Veredicto: PASS CON OBSERVACIONES.
- Migracion 0004 conforme a data-model §2.9-2.10 (id, invitee_username, READER, created_at=invitedAt, responded_at NULL/updatedAt; CHECK ACTIVE/LEFT/REMOVED; role; is_household_owner; indice unico propietario ACTIVE). Cabecera sin "Discrepancia pendiente".
- roles-migration 7/7 y species-migration 13/13 verdes. persistence: 16 rojos, todos "CHECK constraint failed: status IN ('ACTIVE','LEFT','REMOVED')" (clase i; 4 en sqlite-backup-import.spec.ts, 12 en sqlite-repositories.spec.ts).
- 69/69 en permissions-matrix, access-policy, access.property. tsc: 2 errores (household-policies.spec.ts:351,361). traceability T243 y T244 CUMPLE 4/4; verify-oracles CUMPLE (0 debiles).
Observaciones: (1) tasks.md tiene T226-T235 en [x] sin commit (no solo H-1). (2) invited_by_user_id nulo: data-model §2.10 dice relajar NOT NULL; la 0004 aborta y revierte (documentado en cabecera). (3) 16 rojos, no ~157, en tests/integration/persistence; el resto de rojos fuera de este directorio no se midio.
