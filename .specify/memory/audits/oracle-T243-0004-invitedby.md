# Oracle T243 - revalidacion 0004 (invited_by_user_id nulo) - 2026-11-11
Veredicto: PASS CON OBSERVACIONES.
- Reconstruccion fiel: 0004 l.21-43 vs 0002 l.47-62: 9 columnas, 3 CHECK, STRICT, FK ON DELETE CASCADE y 3 indices identicos; unica diferencia: invited_by_user_id sin NOT NULL (l.31).
- Transaccional y repetible: sqlite-database.ts l.50-53 (db.transaction exec + INSERT schema_migrations).
- Sin otras FK a household_invitations (grep en src: solo consultas en sqlite-repositories.ts:193-194).
- INSERT l.46 usa json_extract(m.data,'$.invitedByUserId'); NULL si falta (data-model §2.10, l.171).
- Cabecera l.15-18 coincide con el codigo.
- vitest roles+species 20/20; sqlite-repositories 12 rojos / 25 verdes, todos CHECK status ACTIVE/LEFT/REMOVED (clase i); tsc 2 errores T248; trazabilidad T243 4/4 CUMPLE.
Observaciones: (1) ningun test fuerza la ruta invitedByUserId ausente (roles-migration.spec.ts:51 siempre lo trae). (2) sqlite-database.ts tambien cambia (solo comentario @implements). (3) 12 rojos sqlite-repositories (clase i) pendientes de T244+/Keymaker; previos 16 de persistencia en total.
