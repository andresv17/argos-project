-- Evidencia de disputas de chip y contadores por IP (Feature 012, Bloque B, #23; T1633; Nivel 2 pre-autorizada por Neo, 2026-11-27; REQ-CHP12-005, REQ-CHP12-008, INV-CHP12-004; data-model.md Bloque #23).
-- Equivale a la 0036 de SQLite. Sin BEGIN/COMMIT: el migrador corre cada migracion en una transaccion y registra la version.
-- @implements REQ-CHP12-005, REQ-CHP12-008, INV-CHP12-004, NFR-012-006
-- Migracion NUEVA y ADITIVA: dos tablas. NO toca `pets_microchip_global` ni ninguna tabla existente; sin `chip_conflict`, sin deteccion de duplicados.
-- `dispute_evidence`: la FK a `owner_requests` es RESTRICT (sin cascada, INV-CHP12-005); `deleted_at` NO se crea (borrado fisico, rama N-04). `ip_rate_events`: sin FK a `users`; `'*'` = contador global.
CREATE TABLE dispute_evidence (
  id TEXT PRIMARY KEY CHECK (length(id) = 36),
  request_id TEXT NOT NULL REFERENCES owner_requests (id) ON DELETE RESTRICT,
  object_key TEXT NOT NULL CHECK (length(object_key) >= 1),
  content_type TEXT NOT NULL CHECK (content_type IN ('application/pdf', 'image/jpeg', 'image/png', 'image/webp')),
  bytes INTEGER NOT NULL CHECK (bytes >= 1),
  created_at TEXT NOT NULL,
  delete_after TEXT
);
CREATE UNIQUE INDEX dispute_evidence_object_key ON dispute_evidence (object_key);
CREATE INDEX dispute_evidence_request ON dispute_evidence (request_id);
CREATE INDEX dispute_evidence_delete_after ON dispute_evidence (delete_after) WHERE delete_after IS NOT NULL;

CREATE TABLE ip_rate_events (
  id TEXT PRIMARY KEY CHECK (length(id) = 36),
  scope TEXT NOT NULL CHECK (scope IN ('CHIP_LOOKUP', 'CHIP_MULTIPART')),
  ip_hmac TEXT NOT NULL CHECK (length(ip_hmac) >= 1),
  occurred_at TEXT NOT NULL
);
CREATE INDEX ip_rate_events_window ON ip_rate_events (scope, ip_hmac, occurred_at);
