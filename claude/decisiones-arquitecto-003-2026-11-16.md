# Decisiones de arquitectura 003-cloud-gcp (2026-11-16)

## Enmienda REQ-IAC-009: 12ª API `billingbudgets` y rol de facturación
- **Fecha:** 2026-11-16. **Autor:** The Architect. **Estado:** REVIEW.
- **Autorización:** Neo (Andrés Vallejo, Nivel 2) autorizó formalmente la enmienda (resolución D1/D2 tras el veredicto de Oracle).
- **Motivo:** Oracle T443/T444 (`.specify/memory/audits/oracle-T443-T444-veredicto.md`): `google_billing_budget` (T443, 1 USD, umbrales 50/90/100 %) requiere `billingbudgets.googleapis.com`, fuera de las 11 APIs de REQ-IAC-009.
- **Cambio:** REQ-IAC-009 pasa a 12 APIs (se añade `billingbudgets`). Se documenta en la misma REQ el requisito de bootstrap: `roles/billing.costsManager` para `argos-terraform@` a nivel de cuenta de facturación (no de proyecto), concedido por Neo en `bootstrap.sh`; no se otorga a `argos-terraform-plan@`.
- **Archivos:** `specs/003-cloud-gcp/spec.md` (REQ-IAC-009), `specs/003-cloud-gcp/plan.md` (fila `google_billing_budget`). Sin cambios en contratos, constitución ni `spec-system.md`.
- **Pendiente para Keymaker (tarea posterior):** añadir `billingbudgets` a `terraform/services.tf` (con su prueba primero) y el `add-iam-policy-binding` de `roles/billing.costsManager` sobre la cuenta de facturación en `terraform/bootstrap.sh`; reflejarlo en `terraform/README.md`.
