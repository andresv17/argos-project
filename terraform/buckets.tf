# Bucket de dumps de Postgres (REQ-IAC-008, REQ-PG-016, SC-CLD-008). STANDARD en us-central1 (cupo gratis de
# 5 GB), acceso uniforme y sin acceso público. Los dumps de dumps/ viven 14 días (R-14, D-R-14): con cadencia
# semanal quedan al menos 2 copias restaurables. soft_delete_policy en 0 s: el borrado es definitivo
# (H-MIF-010, H-RAMA-002). Sin permisos para la cuenta de ejecución: la app no escribe aquí; el acceso lo
# usa Neo con su identidad (ver iam.tf).

resource "google_storage_bucket" "exports" {
  project       = var.project_id
  name          = "${var.project_prefix}-${var.project_id}-exports"
  location      = "us-central1"
  storage_class = "STANDARD"

  uniform_bucket_level_access = true
  public_access_prevention    = "enforced"

  soft_delete_policy {
    retention_duration_seconds = 0
  }

  lifecycle_rule {
    action {
      type = "Delete"
    }

    condition {
      age            = 14
      matches_prefix = ["dumps/"]
    }
  }

  labels = {
    app        = "argos"
    managed-by = "terraform"
  }

  lifecycle {
    prevent_destroy = true
  }

  depends_on = [google_project_service.apis]
}
