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

variable "database_url" {
  description = "URL de Postgres con -pooler y sslmode=require (REQ-SEC-002). Llega por TF_VAR_database_url."
  type        = string
  sensitive   = true

  validation {
    condition     = length(trimspace(var.database_url)) > 0 && !can(regex("[\\r\\n]", var.database_url))
    error_message = "database_url no puede estar vacía ni contener saltos de línea (REQ-IAC-013)."
  }
}
