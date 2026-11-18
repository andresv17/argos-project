# Exclusión de Cloud Logging para la ruta pública /shared/ (T793 (b), EDGE-005-32/P1, trinity-T792 A-01).
# El token del enlace compartido viaja en la URL; el registro de solicitudes de Cloud Run (httpRequest.requestUrl)
# lo guardaría en claro. La exclusión actúa sobre el sumidero _Default del proyecto y solo descarta las
# solicitudes de Cloud Run cuya URL contiene /shared/; el resto de los registros de la aplicación se conserva.
# Autorizada por Neo (Nivel 2). Aplicar solo tras revisar `terraform plan` (lo ejecuta Neo).
resource "google_logging_project_exclusion" "shared_token_requests" {
  project     = var.project_id
  name        = "${var.project_prefix}-exclude-shared-requests"
  description = "Excluye del sumidero _Default las solicitudes a /shared/ (el token del enlace no debe quedar en el registro)."
  filter      = "resource.type=\"cloud_run_revision\" AND httpRequest.requestUrl:\"/shared/\""

  depends_on = [google_project_service.apis]
}
