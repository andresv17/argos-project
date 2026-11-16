# IAM mínimo (REQ-IAC-006, plan.md §5). Solo recursos *_iam_member acotados a cada recurso: ni roles de
# proyecto, ni owner/editor, ni claves JSON (el despliegue usa WIF). argos-run no tiene permisos sobre ningún
# bucket (H-MIF-010, REQ-IAC-008). El servicio google_cloud_run_v2_service.argos lo define T440.

resource "google_service_account" "run" {
  project      = var.project_id
  account_id   = "argos-run"
  display_name = "Argos: ejecución de Cloud Run"

  depends_on = [google_project_service.apis]
}

resource "google_service_account" "deployer" {
  project      = var.project_id
  account_id   = "argos-deployer"
  display_name = "Argos: despliegue desde GitHub (WIF)"

  depends_on = [google_project_service.apis]
}

resource "google_service_account" "scheduler" {
  project      = var.project_id
  account_id   = "argos-scheduler"
  display_name = "Argos: Cloud Scheduler (mantenimiento)"

  depends_on = [google_project_service.apis]
}

# argos-run: lectura de sus 2 secretos, a nivel de secreto.
resource "google_secret_manager_secret_iam_member" "run_database_url" {
  project   = var.project_id
  secret_id = google_secret_manager_secret.database_url.secret_id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.run.email}"
}

resource "google_secret_manager_secret_iam_member" "run_audit_hmac_secret" {
  project   = var.project_id
  secret_id = google_secret_manager_secret.audit_hmac_secret.secret_id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.run.email}"
}

# argos-deployer: desplegar el servicio, subir imágenes al repositorio y actuar como argos-run (solo esa cuenta).
resource "google_cloud_run_v2_service_iam_member" "deployer_developer" {
  project  = var.project_id
  location = var.region
  name     = google_cloud_run_v2_service.argos.name
  role     = "roles/run.developer"
  member   = "serviceAccount:${google_service_account.deployer.email}"
}

resource "google_artifact_registry_repository_iam_member" "deployer_writer" {
  project    = var.project_id
  location   = google_artifact_registry_repository.argos.location
  repository = google_artifact_registry_repository.argos.name
  role       = "roles/artifactregistry.writer"
  member     = "serviceAccount:${google_service_account.deployer.email}"
}

resource "google_service_account_iam_member" "deployer_acts_as_run" {
  service_account_id = google_service_account.run.name
  role               = "roles/iam.serviceAccountUser"
  member             = "serviceAccount:${google_service_account.deployer.email}"
}

# argos-scheduler: invocar el servicio (OIDC hacia POST /internal/maintenance, REQ-CLD-007).
resource "google_cloud_run_v2_service_iam_member" "scheduler_invoker" {
  project  = var.project_id
  location = var.region
  name     = google_cloud_run_v2_service.argos.name
  role     = "roles/run.invoker"
  member   = "serviceAccount:${google_service_account.scheduler.email}"
}

# Acceso público al servicio: la autenticación es de la aplicación.
resource "google_cloud_run_v2_service_iam_member" "public_invoker" {
  project  = var.project_id
  location = var.region
  name     = google_cloud_run_v2_service.argos.name
  role     = "roles/run.invoker"
  member   = "allUsers"
}
