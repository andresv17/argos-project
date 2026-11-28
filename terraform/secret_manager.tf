# Secret Manager (REQ-IAC-005, REQ-IAC-007, REQ-IAC-013, REQ-SEC-001).
# Los valores llegan por TF_VAR_database_url y TF_VAR_audit_hmac_secret (variables sensitive con validation en
# variables.tf); nunca se escriben aquí. La versión se crea siempre: sin count condicional, una variable nula o
# vacía hace fallar el plan en vez de destruir la versión vigente.

resource "google_secret_manager_secret" "database_url" {
  project   = var.project_id
  secret_id = "${var.project_prefix}-database-url"

  labels = {
    app        = "argos"
    managed-by = "terraform"
  }

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

  labels = {
    app        = "argos"
    managed-by = "terraform"
  }

  replication {
    auto {}
  }

  lifecycle {
    prevent_destroy = true
  }

  depends_on = [google_project_service.apis]
}

resource "google_secret_manager_secret" "share_ip_hmac_secret" {
  project   = var.project_id
  secret_id = "${var.project_prefix}-share-ip-hmac-secret"

  labels = {
    app        = "argos"
    managed-by = "terraform"
  }

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

resource "google_secret_manager_secret_version" "share_ip_hmac_secret" {
  secret          = google_secret_manager_secret.share_ip_hmac_secret.id
  secret_data     = var.share_ip_hmac_secret
  deletion_policy = "ABANDON"

  lifecycle {
    create_before_destroy = true
  }
}

# Google OAuth (008, REQ-SSO8-007). Solo el contenedor del secreto: NO hay google_secret_manager_secret_version, así que ni el
# valor ni un marcador entran al repositorio ni al state. Carga inicial (decisión de Neo, fuera de Terraform):
#   printf '%s' "$VALOR" | gcloud secrets versions add argos-google-oauth-client-secret --data-file=- --project=<project_id>
# Hasta que exista una versión, Cloud Run no puede arrancar una revisión que referencie este secreto.
resource "google_secret_manager_secret" "google_oauth_client_secret" {
  project   = var.project_id
  secret_id = "${var.project_prefix}-google-oauth-client-secret"

  labels = {
    app        = "argos"
    managed-by = "terraform"
  }

  replication {
    auto {}
  }

  lifecycle {
    prevent_destroy = true
  }

  depends_on = [google_project_service.apis]
}

# Portal /admin (009, REQ-ADM9-003). Solo el contenedor del secreto: NO hay google_secret_manager_secret_version, así que ni
# los correos ni un marcador entran al repositorio ni al state. Carga inicial (fuera de Terraform):
#   printf '%s' "$CORREOS" | gcloud secrets versions add argos-admin-emails --data-file=- --project=<project_id>
resource "google_secret_manager_secret" "admin_emails" {
  project   = var.project_id
  secret_id = "${var.project_prefix}-admin-emails"

  labels = {
    app        = "argos"
    managed-by = "terraform"
  }

  replication {
    auto {}
  }

  lifecycle {
    prevent_destroy = true
  }

  depends_on = [google_project_service.apis]
}

# Gemini API (009, D9-30 (8), T1316). Solo el contenedor del secreto: NO hay google_secret_manager_secret_version, así que ni la clave
# ni un marcador entran al repositorio ni al state. La carga inicial la hace Neo fuera de Terraform y de GitHub Actions:
#   printf '%s' "$CLAVE" | gcloud secrets versions add argos-gemini-api-key --data-file=- --project=<project_id>
# Opcional: sin versión creada, deploy-argos.yml no referencia GEMINI_API_KEY y el despliegue no falla (el proveedor gemini-api queda
# no disponible y falla cerrado, D9-30 (2) y (4)). Cuando existe, deploy-argos.yml la referencia por versión numérica, nunca latest.
resource "google_secret_manager_secret" "gemini_api_key" {
  project   = var.project_id
  secret_id = "${var.project_prefix}-gemini-api-key"

  labels = {
    app        = "argos"
    managed-by = "terraform"
  }

  replication {
    auto {}
  }

  lifecycle {
    prevent_destroy = true
  }

  depends_on = [google_project_service.apis]
}

# Ficha QR de emergencia (Feature 012, Bloque D, PHONE_HMAC_KEY, T-05; anexo emergency-additive-annex.md §9). Clave HMAC dedicada del
# teléfono: no es la de sesión ni la de IP. El valor llega por TF_VAR_phone_hmac_key (GitHub Secret) y nunca se escribe aquí.
# Sin versión habilitada, la ficha no se conecta en la aplicación (fail-closed); deploy-argos.yml la referencia solo si existe.
resource "google_secret_manager_secret" "phone_hmac_key" {
  project   = var.project_id
  secret_id = "${var.project_prefix}-phone-hmac-key"

  labels = {
    app        = "argos"
    managed-by = "terraform"
  }

  replication {
    auto {}
  }

  lifecycle {
    prevent_destroy = true
  }

  depends_on = [google_project_service.apis]
}

resource "google_secret_manager_secret_version" "phone_hmac_key" {
  secret          = google_secret_manager_secret.phone_hmac_key.id
  secret_data     = var.phone_hmac_key
  deletion_policy = "ABANDON"

  lifecycle {
    create_before_destroy = true
  }
}
