# Job diario de mantenimiento (REQ-CLD-007, NFR-CLD-001, ADR-003-06). UN solo job: 1 de 3 gratis (los otros 2
# son de Mirror, que Argos no toca). Horario 06:00 America/Bogota (plan.md §2.2). Llama por OIDC a
# POST /internal/maintenance con la cuenta argos-scheduler (run.invoker en iam.tf). La audiencia es la URL del
# servicio sin ruta: la misma que la app recibe en ARGOS_OIDC_AUDIENCE (REQ-SEC-007). Sin cuerpo ni cabeceras.

resource "google_cloud_scheduler_job" "maintenance" {
  project     = var.project_id
  region      = var.region
  name        = "argos-maintenance"
  description = "Mantenimiento diario de Argos (ADR-002-14)"
  schedule    = "0 6 * * *"
  time_zone   = "America/Bogota"

  http_target {
    http_method = "POST"
    uri         = "${google_cloud_run_v2_service.argos.uri}/internal/maintenance"

    oidc_token {
      service_account_email = google_service_account.scheduler.email
      audience              = google_cloud_run_v2_service.argos.uri
    }
  }

  depends_on = [google_project_service.apis, google_cloud_run_v2_service_iam_member.scheduler_invoker]
}
