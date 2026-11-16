# Salidas. Toda salida derivada de un secreto DEBE llevar sensitive = true (REQ-SEC-001); hoy no hay ninguna.

output "project_id" {
  description = "Proyecto GCP donde vive ARGOS."
  value       = var.project_id
}

output "artifact_registry_repository" {
  description = "Ruta del repositorio Docker de Artifact Registry."
  value       = "${google_artifact_registry_repository.argos.location}-docker.pkg.dev/${var.project_id}/${google_artifact_registry_repository.argos.repository_id}"
}
