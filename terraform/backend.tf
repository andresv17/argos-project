# Backend remoto vacío (REQ-IAC-002, D-12): sin bucket ni prefijo en el código.
# CI inyecta: -backend-config="bucket=<TF_STATE_BUCKET>" -backend-config="prefix=terraform/argos-state"
terraform {
  backend "gcs" {}
}
