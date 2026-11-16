# Proveedor y versiones fijados por D-25 (REQ-IAC-002): versión EXACTA, sin rangos.
# El archivo .terraform.lock.hcl se versiona en el repositorio (T444/T456):
#   terraform providers lock -platform=linux_amd64 -platform=darwin_arm64
terraform {
  required_version = "1.17.2"

  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "7.46.2"
    }
  }
}

provider "google" {
  project = var.project_id
  region  = var.region
}
