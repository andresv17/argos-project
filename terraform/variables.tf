# Variables de entrada. Valores por TF_VAR_* (D-05); los secretos nunca llevan default (REQ-SEC-001).

variable "project_id" {
  description = "ID del proyecto GCP de ARGOS (D-01)."
  type        = string
}

variable "region" {
  description = "Región de los recursos (D-02)."
  type        = string
  default     = "us-central1"
}

variable "project_prefix" {
  description = "Prefijo de todos los recursos (REQ-IAC-003)."
  type        = string
  default     = "argos"
}

variable "custom_domain" {
  description = "Dominio propio opcional (F3). Vacío = sin mapeo de dominio (T481)."
  type        = string
  default     = ""

  validation {
    condition     = var.custom_domain == "" || can(regex("^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\\.)+[a-z]{2,}$", var.custom_domain))
    error_message = "custom_domain debe ser vacío o un nombre de dominio en minúsculas (por ejemplo app.ejemplo.org)."
  }
}

variable "audit_hmac_secret" {
  description = "Secreto HMAC de auditoría (>= 32 bytes hex, REQ-SEC-002). Llega por TF_VAR_audit_hmac_secret."
  type        = string
  sensitive   = true

  validation {
    condition     = length(trimspace(var.audit_hmac_secret)) > 0 && !can(regex("[\\r\\n]", var.audit_hmac_secret))
    error_message = "audit_hmac_secret no puede estar vacío ni contener saltos de línea (REQ-IAC-013)."
  }
}

variable "share_ip_hmac_secret" {
  description = "Secreto HMAC de la IP en la auditoría de accesos a enlaces compartidos (>= 32 bytes hex, REQ-SEC-002). Llega por TF_VAR_share_ip_hmac_secret."
  type        = string
  sensitive   = true

  validation {
    condition     = length(trimspace(var.share_ip_hmac_secret)) > 0 && !can(regex("[\\r\\n]", var.share_ip_hmac_secret))
    error_message = "share_ip_hmac_secret no puede estar vacío ni contener saltos de línea (REQ-IAC-013)."
  }
}

variable "database_url" {
  description = "URL de Postgres con -pooler y sslmode=require (REQ-SEC-002). Llega por TF_VAR_database_url."
  type        = string
  sensitive   = true

  validation {
    condition     = length(trimspace(var.database_url)) > 0 && !can(regex("[\\r\\n]", var.database_url))
    error_message = "database_url no puede estar vacía ni contener saltos de línea (REQ-IAC-013)."
  }
}

variable "billing_account" {
  description = "ID de la cuenta de facturación (formato AAAAAA-BBBBBB-CCCCCC) a la que se asocia el presupuesto preventivo (5 USD equivalentes, D-13 y enmienda 006). No es un secreto. Llega por TF_VAR_billing_account."
  type        = string

  validation {
    condition     = can(regex("^[0-9A-F]{6}-[0-9A-F]{6}-[0-9A-F]{6}$", var.billing_account))
    error_message = "billing_account debe tener el formato AAAAAA-BBBBBB-CCCCCC (hexadecimal en mayúsculas)."
  }
}

variable "budget_currency" {
  description = "Código ISO de moneda de la cuenta de facturación (p. ej. COP o USD). GCP exige que coincida con la moneda de la cuenta."
  type        = string
  default     = "COP"

  validation {
    condition     = can(regex("^[A-Z]{3}$", var.budget_currency))
    error_message = "budget_currency debe ser un código ISO-4217 de 3 letras en mayúsculas (p. ej. COP, USD)."
  }
}

variable "budget_units" {
  description = "Monto entero del presupuesto preventivo en la moneda de budget_currency: 5 USD equivalentes (22500 si es COP a 4500 COP/USD; 5 si es USD). Enmienda 006, N2-05 y N2-04: Neo verifica la moneda real antes del apply."
  type        = string
  default     = "22500"

  validation {
    condition     = can(regex("^[1-9][0-9]*$", var.budget_units))
    error_message = "budget_units debe ser un entero positivo en texto (p. ej. 22500)."
  }
}

variable "github_repository" {
  description = "Repositorio de GitHub (owner/name) cuyo flujo deploy-argos.yml puede usar argos-deployer@ por WIF (T489, D-30). Llega por TF_VAR_github_repository."
  type        = string

  validation {
    condition     = can(regex("^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$", var.github_repository))
    error_message = "github_repository debe tener la forma owner/name (por ejemplo dueno/argos)."
  }
}

# Google OAuth (008, REQ-SSO8-007). El client secret NO es variable: nunca pasa por Terraform ni por el state; lo carga Neo
# en Secret Manager fuera de banda (ver secret_manager.tf). El client id no es secreto, pero se trata como configuración por entorno.
variable "google_oauth_client_id" {
  description = "Client ID de OAuth 2.0 de Google (no es secreto). Lo inyecta el pipeline como GOOGLE_OAUTH_CLIENT_ID. Llega por TF_VAR_google_oauth_client_id."
  type        = string

  validation {
    condition     = can(regex("^[0-9]+-[a-z0-9]+\\.apps\\.googleusercontent\\.com$", var.google_oauth_client_id))
    error_message = "google_oauth_client_id debe tener la forma NUMERO-XXXX.apps.googleusercontent.com."
  }
}

# URI de redirección autorizada en la consola de Google, FIJA por entorno (REQ-SSO8-007): nunca se deriva del encabezado Host.
variable "google_oauth_redirect_uri" {
  description = "URI de redirección OAuth fija de este entorno (REQ-SSO8-007). Debe coincidir exactamente con la registrada en la consola de Google. Llega por TF_VAR_google_oauth_redirect_uri."
  type        = string

  validation {
    condition     = can(regex("^https://([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\\.)+[a-z]{2,}/api/auth/google/callback$", var.google_oauth_redirect_uri))
    error_message = "google_oauth_redirect_uri debe ser https://<host-del-entorno>/api/auth/google/callback (REQ-SSO8-007)."
  }
}
