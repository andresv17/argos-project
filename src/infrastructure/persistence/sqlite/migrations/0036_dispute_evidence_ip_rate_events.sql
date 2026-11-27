-- Evidencia de disputas de chip y contadores por IP (Feature 012, Bloque B, #23; T1633; Nivel 2 pre-autorizada por Neo, 2026-11-27; REQ-CHP12-005, REQ-CHP12-008, INV-CHP12-004; data-model.md Bloque #23).
-- @implements REQ-CHP12-005, REQ-CHP12-008, INV-CHP12-004, NFR-012-006
-- Migracion NUEVA y ADITIVA: dos tablas. NO toca `pets_microchip_global` ni ninguna tabla existente; sin `chip_conflict`, sin deteccion de duplicados.
-- `dispute_evidence`: la FK a `owner_requests` es RESTRICT (sin cascada, INV-CHP12-005): el expediente no se borra mientras existan filas de evidencia; la purga de maquina las borra FISICAMENTE primero (SC-012-118).
--   `delete_after` = `closed_at` de la disputa + retencion (365 d con evidencia de apropiacion, 90 d en ausencia); se escribe al cerrar la disputa. `deleted_at` NO se crea: el borrado es fisico (rama N-04); su eventual columna reservada la decide T1641.
--   `object_key` es la clave no derivable `claims/{uuid}/{uuid}` del almacen de medios; el maximo de 5 archivos por disputa es regla de dominio.
-- `ip_rate_events`: contadores por IP del limite de chip (rama F-08), ventana movil de 24 h y purga de mantenimiento a las 25 h; SIN FK a `users`. `ip_hmac` = HMAC de la IP (IPv6 /64) con clave de dominio propia; `'*'` = contador global.
CREATE TABLE dispute_evidence (
  id TEXT PRIMARY KEY CHECK (length(id) = 36),
  request_id TEXT NOT NULL REFERENCES owner_requests (id) ON DELETE RESTRICT,
  object_key TEXT NOT NULL CHECK (length(object_key) >= 1),
  content_type TEXT NOT NULL CHECK (content_type IN ('application/pdf', 'image/jpeg', 'image/png', 'image/webp')),
  bytes INTEGER NOT NULL CHECK (bytes >= 1),
  created_at TEXT NOT NULL,
  delete_after TEXT
) STRICT;
CREATE UNIQUE INDEX dispute_evidence_object_key ON dispute_evidence (object_key);
CREATE INDEX dispute_evidence_request ON dispute_evidence (request_id);
CREATE INDEX dispute_evidence_delete_after ON dispute_evidence (delete_after) WHERE delete_after IS NOT NULL;

CREATE TABLE ip_rate_events (
  id TEXT PRIMARY KEY CHECK (length(id) = 36),
  scope TEXT NOT NULL CHECK (scope IN ('CHIP_LOOKUP', 'CHIP_MULTIPART')),
  ip_hmac TEXT NOT NULL CHECK (length(ip_hmac) >= 1),
  occurred_at TEXT NOT NULL
) STRICT;
CREATE INDEX ip_rate_events_window ON ip_rate_events (scope, ip_hmac, occurred_at);
