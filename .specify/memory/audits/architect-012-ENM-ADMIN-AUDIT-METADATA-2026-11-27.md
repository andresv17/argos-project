# Acta architect — ENM-012-ADMIN-AUDIT-METADATA (2026-11-27)

Origen: conflicto Nivel 2 entre el invariante de privacidad de la 009 (t1231/t1239) y la columna `admin_audit_entries.metadata` (H-01). Neo aprobó la opción (a): enmienda acotada en el anexo 012.

Cambio: nueva §11 en `specs/012-multiduenio-microchip-cuidador/contracts/admin-disputes-annex.md` (MINOR; estado `APPROVED` intacto; sin editar texto previo ni archivos de la 009; sin src/ ni tests/).
Contenido: columna `metadata` (TEXT NULL, CHECK 2..4096; migraciones 0038 SQLite / 0034 PG); uso exclusivo = motivo de arbitraje (<=500, JSON {reason}) solo en resolve y confirm; purga con la fila a 24 meses (R-1/D6); la 009 sigue vigente para el resto; aviso UI «No incluyas datos personales de terceros en el motivo.» (rama B-01).
Pendiente para keymaker: asertos de t1231/t1239 y UI con el aviso.
