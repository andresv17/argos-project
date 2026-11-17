# Bucket de medios de ARGOS (REQ-GCS-001, INV-GCS-001, NFR-ALM-001, ADR-004-01). Distinto del bucket exports:
# guarda las imágenes y PDF de los registros y los avatares. STANDARD en us-central1, acceso uniforme y sin
# acceso público. soft_delete_policy en 0 s: el borrado es definitivo (la cola media_deletion_queue ya garantiza
# la consistencia). Sin versionado ni ciclo de vida: los objetos viven mientras exista su registro. Sin
# registros de acceso a datos (REQ-GCS-001). Acceso solo para argos-run@ (ver iam.tf); las lecturas del
# navegador usan URL firmadas V4 de 300 s sin llaves de cuenta de servicio.

resource "google_storage_bucket" "media" {
  project       = var.project_id
  name          = "${var.project_prefix}-${var.project_id}-media"
  location      = "us-central1"
  storage_class = "STANDARD"

  uniform_bucket_level_access = true
  public_access_prevention    = "enforced"

  soft_delete_policy {
    retention_duration_seconds = 0
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
