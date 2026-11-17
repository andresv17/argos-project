# Servicio Cloud Run "carcasa" (REQ-CLD-002, REQ-IAC-010, REQ-IAC-012, ADR-003-11). Terraform posee escala,
# recursos, cuenta de ejecución e ingress. Imagen, env, sondas /healthz, secretos (versión numérica) y tráfico
# los fija y mueve el pipeline de aplicación (deploy-argos.yml); por eso ignore_changes los cubre.
# Primer apply: imagen marcadora pública SIN sondas propias (sonda TCP por defecto) y SIN referencias a
# secretos ni env (REQ-CLD-005 los inyecta CI). Los nombres de atributo de ignore_changes son [verificar] en T469.

# Medios (T561, ADR-004-01, E3-05): el entorno de medios NO se declara aquí (REQ-IAC-012; ignore_changes lo
# cubre y --set-env-vars de deploy-argos.yml reemplaza todo el entorno). Valores que debe inyectar el pipeline:
# ARGOS_MEDIA_DRIVER=gcs, ARGOS_MEDIA_BUCKET=<project_prefix>-<project_id>-media (google_storage_bucket.media),
# ARGOS_MEDIA_SIGNED_URL_TTL_SECONDS=300, ARGOS_MEDIA_MAX_BYTES=10485760,
# ARGOS_MEDIA_MAX_BYTES_PER_OWNER=1073741824, ARGOS_MEDIA_MAX_CONCURRENT_UPLOADS=4.
# Memoria: 512Mi alcanza para 4 subidas simultáneas de 10 MiB (40 MiB en vuelo, lectura en streaming con corte)
# más el SDK de GCS; la concurrencia 20 por instancia no cambia porque el tope de subidas lo impone la app.

resource "google_cloud_run_v2_service" "argos" {
  project  = var.project_id
  name     = "argos"
  location = var.region
  ingress  = "INGRESS_TRAFFIC_ALL"

  deletion_protection = true

  labels = {
    app        = "argos"
    managed-by = "terraform"
  }

  template {
    service_account                  = google_service_account.run.email
    timeout                          = "60s"
    max_instance_request_concurrency = 20

    scaling {
      min_instance_count = 0
      max_instance_count = 2
    }

    containers {
      image = "us-docker.pkg.dev/cloudrun/container/hello"

      resources {
        limits = {
          cpu    = "1"
          memory = "512Mi"
        }
        cpu_idle          = true
        startup_cpu_boost = true
      }
    }
  }

  lifecycle {
    ignore_changes = [
      traffic,
      client,
      client_version,
      template[0].revision,
      template[0].labels,
      template[0].annotations,
      template[0].containers[0].image,
      template[0].containers[0].env,
      template[0].containers[0].startup_probe,
      template[0].containers[0].liveness_probe,
    ]
  }

  depends_on = [google_project_service.apis]
}
