# Presupuesto de 1 USD con alerta preventiva por correo (D-13, NFR-CLD-001, plan.md §2.1). Crear un presupuesto
# no cuesta, pero NO detiene el gasto: solo avisa (research.md). Umbrales 50/90/100 %. Se filtra por la etiqueta
# app=argos para no contar el gasto de otros proyectos de la misma cuenta de facturación. El correo llega a los
# destinatarios IAM por defecto de la cuenta (administradores y usuarios de facturación): all_updates_rule se
# omite porque el proveedor 7.46.2 exige canal de Monitoring o Pub/Sub en ese bloque y D-13 no fija ninguna
# dirección. PENDIENTE de Neo: confirmar si basta el correo por defecto o se requiere una dirección propia.
# Sin labels: el recurso no admite etiquetas (spec.md, decisión R-2 de T440).

resource "google_billing_budget" "argos" {
  billing_account = var.billing_account
  display_name    = "${var.project_prefix}-presupuesto-1-usd"

  budget_filter {
    labels = {
      app = "argos"
    }
  }

  amount {
    specified_amount {
      currency_code = var.budget_currency
      units         = var.budget_units
    }
  }

  depends_on = [google_project_service.apis["billingbudgets.googleapis.com"]]

  threshold_rules {
    threshold_percent = 0.5
  }

  threshold_rules {
    threshold_percent = 0.9
  }

  threshold_rules {
    threshold_percent = 1.0
  }
}
