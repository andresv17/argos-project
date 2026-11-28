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

# Búsqueda de colaboradores (008, H-RAMA-008-J-01, EDGE-008-044/NFR-008-004).
# La consulta de prefijo (`q`) viaja en la URL y el registro de solicitudes de Cloud Run la guardaría
# en claro en _Default. La exclusión descarta solo las solicitudes a /invitees?q= de Cloud Run.
# Pendiente de aplicación por Neo (Nivel 2) tras revisar `terraform plan`.
resource "google_logging_project_exclusion" "invitees_search_requests" {
  project     = var.project_id
  name        = "${var.project_prefix}-exclude-invitees-search-requests"
  description = "Excluye del sumidero _Default las solicitudes de búsqueda de colaboradores (el término de búsqueda no debe quedar en el registro)."
  filter      = "resource.type=\"cloud_run_revision\" AND httpRequest.requestUrl:\"/invitees?q=\""

  depends_on = [google_project_service.apis]
}

# Callback de Google (008, H-RAMA-008-J-02): la URL lleva `code` y `state` de OAuth; no deben quedar en _Default.
# Pendiente de aplicación por Neo (Nivel 2) tras revisar `terraform plan`.
resource "google_logging_project_exclusion" "google_auth_callback_requests" {
  project     = var.project_id
  name        = "${var.project_prefix}-exclude-google-callback-requests"
  description = "Excluye del sumidero _Default las solicitudes al callback de Google (code y state no deben quedar en el registro)."
  filter      = "resource.type=\"cloud_run_revision\" AND httpRequest.requestUrl:\"/api/auth/google/callback\""

  depends_on = [google_project_service.apis]
}

# Callback de Google del portal de administración (009, RAMA-01): la URL lleva `code` y `state` de OAuth, igual que el callback de 008
# (`/api/admin/auth/google/callback` no contiene la subcadena `/api/auth/google/callback`, así que necesita su propia exclusión).
# Pendiente de aplicación por Neo (Nivel 2) tras revisar `terraform plan`.
resource "google_logging_project_exclusion" "admin_google_auth_callback_requests" {
  project     = var.project_id
  name        = "${var.project_prefix}-exclude-admin-google-callback-requests"
  description = "Excluye del sumidero _Default las solicitudes al callback de Google del portal de administración (code y state no deben quedar en el registro)."
  filter      = "resource.type=\"cloud_run_revision\" AND httpRequest.requestUrl:\"/api/admin/auth/google/callback\""

  depends_on = [google_project_service.apis]
}

# Ficha QR de emergencia (Feature 012, Bloque D, DEUDA-012-TERRAFORM-LOGS-QR; REQ-QR12-008, SC-012-086/107). El token de la ficha viaja en la URL
# (/e/{token} y /api/emergency/{token}); el registro de solicitudes de Cloud Run lo guardaría en claro en _Default. La exclusión descarta la
# entrada entera de esas solicitudes. Precondición bloqueante de la activación del QR en producción (checklist de release de 012).
resource "google_logging_project_exclusion" "emergency_qr_page_requests" {
  project     = var.project_id
  name        = "${var.project_prefix}-exclude-emergency-qr-page-requests"
  description = "Excluye del sumidero _Default las solicitudes a la vista pública de la ficha QR (/e/{token}; el token no debe quedar en el registro)."
  filter      = "resource.type=\"cloud_run_revision\" AND httpRequest.requestUrl:\"/e/\""

  depends_on = [google_project_service.apis]
}

resource "google_logging_project_exclusion" "emergency_qr_api_requests" {
  project     = var.project_id
  name        = "${var.project_prefix}-exclude-emergency-qr-api-requests"
  description = "Excluye del sumidero _Default las solicitudes a la API pública de la ficha QR (/api/emergency/{token}; el token no debe quedar en el registro)."
  filter      = "resource.type=\"cloud_run_revision\" AND httpRequest.requestUrl:\"/api/emergency/\""

  depends_on = [google_project_service.apis]
}
