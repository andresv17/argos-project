# IAM mínimo (REQ-IAC-006, plan.md §5). Solo recursos *_iam_member acotados a cada recurso: ni roles de
# proyecto, ni owner/editor, ni claves JSON (el despliegue usa WIF). argos-run solo tiene permisos sobre el bucket
# de medios (T562, REQ-GCS-002) y no tiene ninguno sobre exports (H-MIF-010, REQ-IAC-008). El servicio google_cloud_run_v2_service.argos lo define T440.

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

# Cuenta que usa Cloud Tasks para firmar el OIDC hacia el worker de la escena (006, REQ-ESC6-033, INV-ESC6-018): solo run.invoker sobre el servicio.
resource "google_service_account" "scene_tasks" {
  project      = var.project_id
  account_id   = "argos-scene-tasks"
  display_name = "Argos: Cloud Tasks hacia el worker de la escena"

  depends_on = [google_project_service.apis]
}

# argos-run: lectura de sus 3 secretos, a nivel de secreto.
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

resource "google_secret_manager_secret_iam_member" "run_share_ip_hmac_secret" {
  project   = var.project_id
  secret_id = google_secret_manager_secret.share_ip_hmac_secret.secret_id
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

# argos-deployer: WIF solo para el flujo deploy-argos.yml en refs/heads/main (T489, D-30; antes paso 5c manual).
# Sin comodines ni attribute.repository. El pool lo crea bootstrap.sh (paso 5): "${var.project_prefix}-github".
data "google_project" "this" {
  project_id = var.project_id
}

resource "google_service_account_iam_member" "deployer_wif" {
  service_account_id = google_service_account.deployer.name
  role               = "roles/iam.workloadIdentityUser"
  member             = "principalSet://iam.googleapis.com/projects/${data.google_project.this.number}/locations/global/workloadIdentityPools/${var.project_prefix}-github/attribute.job_workflow_ref/${var.github_repository}/.github/workflows/deploy-argos.yml@refs/heads/main"
}

# argos-deployer: solo metadatos de versiones (secretmanager.versions.list/get) de sus 2 secretos, a nivel de secreto.
# NUNCA secretAccessor (no lee el valor): el paso "Resolver versiones numéricas" de deploy-argos.yml lo necesita (D-30).
resource "google_secret_manager_secret_iam_member" "deployer_secret_viewer_database_url" {
  project   = var.project_id
  secret_id = google_secret_manager_secret.database_url.secret_id
  role      = "roles/secretmanager.viewer"
  member    = "serviceAccount:${google_service_account.deployer.email}"
}

resource "google_secret_manager_secret_iam_member" "deployer_secret_viewer_audit_hmac" {
  project   = var.project_id
  secret_id = google_secret_manager_secret.audit_hmac_secret.secret_id
  role      = "roles/secretmanager.viewer"
  member    = "serviceAccount:${google_service_account.deployer.email}"
}

resource "google_secret_manager_secret_iam_member" "deployer_secret_viewer_share_ip_hmac" {
  project   = var.project_id
  secret_id = google_secret_manager_secret.share_ip_hmac_secret.secret_id
  role      = "roles/secretmanager.viewer"
  member    = "serviceAccount:${google_service_account.deployer.email}"
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

# argos-run: objetos del bucket de medios y nada más (T562, REQ-GCS-002). Sin acceso a exports ni a nivel de proyecto.
resource "google_storage_bucket_iam_member" "run_media_object_user" {
  bucket = google_storage_bucket.media.name
  role   = "roles/storage.objectUser"
  member = "serviceAccount:${google_service_account.run.email}"
}

# argos-run firma URL V4 con signBlob (iamcredentials) sobre sí misma: sin llaves de cuenta de servicio.
resource "google_service_account_iam_member" "run_token_creator_self" {
  service_account_id = google_service_account.run.name
  role               = "roles/iam.serviceAccountTokenCreator"
  member             = "serviceAccount:${google_service_account.run.email}"
}

# --- Enmienda 006 (N2-05, aprobada por Neo el 2026-11-18; REQ-ESC6-033, INV-ESC6-018). Terraform solo declara: el apply lo ejecuta Neo. ---

# EXCEPCIÓN DOCUMENTADA a REQ-IAC-006 («cero roles de proyecto», enmienda 006, N2-05): roles/aiplatform.user de PROYECTO para argos-run. Vertex AI no ofrece
# un rol por recurso para predict; el rol personalizado y la cuenta dedicada con impersonación se descartaron (H-TRI-006-10). Es el ÚNICO rol de proyecto
# y el único google_project_iam_member de este archivo; sin llaves de cuenta de servicio (la identidad la entrega el servidor de metadatos).
resource "google_project_iam_member" "run_aiplatform_user" {
  project = var.project_id
  role    = "roles/aiplatform.user"
  member  = "serviceAccount:${google_service_account.run.email}"
}

# argos-scene-tasks: invocar el servicio (OIDC hacia POST /internal/scene-worker); la verificación en la aplicación es la barrera real.
resource "google_cloud_run_v2_service_iam_member" "scene_tasks_invoker" {
  project  = var.project_id
  location = var.region
  name     = google_cloud_run_v2_service.argos.name
  role     = "roles/run.invoker"
  member   = "serviceAccount:${google_service_account.scene_tasks.email}"
}

# argos-run: encolar solo en la cola argos-scene (nunca de proyecto).
resource "google_cloud_tasks_queue_iam_member" "run_scene_enqueuer" {
  project  = var.project_id
  location = google_cloud_tasks_queue.scene.location
  name     = google_cloud_tasks_queue.scene.name
  role     = "roles/cloudtasks.enqueuer"
  member   = "serviceAccount:${google_service_account.run.email}"
}

# argos-run: actuar como argos-scene-tasks (solo esa cuenta) para que la tarea lleve su OIDC.
resource "google_service_account_iam_member" "run_acts_as_scene_tasks" {
  service_account_id = google_service_account.scene_tasks.name
  role               = "roles/iam.serviceAccountUser"
  member             = "serviceAccount:${google_service_account.run.email}"
}

# argos-run: lectura del secreto de Google OAuth (008, REQ-SSO8-007), solo a nivel de secreto. Sin roles de proyecto.
resource "google_secret_manager_secret_iam_member" "run_google_oauth_client_secret" {
  project   = var.project_id
  secret_id = google_secret_manager_secret.google_oauth_client_secret.secret_id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.run.email}"
}
