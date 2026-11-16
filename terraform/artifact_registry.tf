# Artifact Registry (REQ-IAC-004, NFR-CLD-002): repositorio Docker con UNA sola política de limpieza.
# Política KEEP de las 4 versiones más recientes (N = 4, ratificado por Neo tras la medición de T434).
# Sin regla DELETE por antigüedad (H-MIF-013; combinada con KEEP causaría H-LOCK-021).
resource "google_artifact_registry_repository" "argos" {
  project       = var.project_id
  location      = var.region
  repository_id = "${var.project_prefix}-docker"
  format        = "DOCKER"
  description   = "Imágenes de ARGOS"

  labels = {
    app        = "argos"
    managed-by = "terraform"
  }

  cleanup_policy_dry_run = false

  cleanup_policies {
    id     = "keep-recent-versions"
    action = "KEEP"

    most_recent_versions {
      keep_count = 4
    }
  }

  depends_on = [google_project_service.apis]
}
