# Secret Manager (REQ-IAC-005, REQ-IAC-007, REQ-IAC-013, REQ-SEC-001).
# Los valores llegan por TF_VAR_database_url y TF_VAR_audit_hmac_secret (variables sensitive con validation en
# variables.tf); nunca se escriben aquí. La versión se crea siempre: sin count condicional, una variable nula o
# vacía hace fallar el plan en vez de destruir la versión vigente.

resource "google_secret_manager_secret" "database_url" {
  project   = var.project_id
  secret_id = "${var.project_prefix}-database-url"

  replication {
    auto {}
  }

  lifecycle {
    prevent_destroy = true
  }

  depends_on = [google_project_service.apis]
}

resource "google_secret_manager_secret" "audit_hmac_secret" {
  project   = var.project_id
  secret_id = "${var.project_prefix}-audit-hmac-secret"

  replication {
    auto {}
  }

  lifecycle {
    prevent_destroy = true
  }

  depends_on = [google_project_service.apis]
}

# ABANDON: Terraform nunca destruye una versión que una revisión de Cloud Run conserva (rollback de tráfico
# recupera su secreto, REQ-CICD-009). create_before_destroy: la versión nueva existe antes de soltar la anterior.
resource "google_secret_manager_secret_version" "database_url" {
  secret          = google_secret_manager_secret.database_url.id
  secret_data     = var.database_url
  deletion_policy = "ABANDON"

  lifecycle {
    create_before_destroy = true
  }
}

resource "google_secret_manager_secret_version" "audit_hmac_secret" {
  secret          = google_secret_manager_secret.audit_hmac_secret.id
  secret_data     = var.audit_hmac_secret
  deletion_policy = "ABANDON"

  lifecycle {
    create_before_destroy = true
  }
}
