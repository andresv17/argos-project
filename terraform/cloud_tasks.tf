# Cola de la escena del hogar (006, D6-15, NFR-ESC6-002; enmienda N2-05): Cloud Tasks entrega POST /internal/scene-worker al mismo servicio de Cloud Run.
# Sin reintentos automáticos (max_attempts = 1: el reintento lo decide el usuario con su cuota), 2 despachos concurrentes (igual que max_instance_count) y 1 por segundo.
# El destino, la audiencia OIDC y el dispatchDeadline (130 s, por encima del timeout de 120 s del servicio) se fijan al crear cada tarea desde la aplicación; la URL sale
# solo de ARGOS_SCENE_WORKER_URL (INV-ESC6-018), por eso la cola no declara http_target. El apply lo ejecuta Neo.

resource "google_cloud_tasks_queue" "scene" {
  project  = var.project_id
  name     = "argos-scene"
  location = var.region

  rate_limits {
    max_concurrent_dispatches = 2
    max_dispatches_per_second = 1
  }

  retry_config {
    max_attempts = 1
  }

  depends_on = [google_project_service.apis["cloudtasks.googleapis.com"]]
}
