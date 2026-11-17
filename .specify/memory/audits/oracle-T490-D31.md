# Oracle T490 / D-31 (91c538f prueba, 1d8163e impl; diseno 4114acb)
Veredicto: CUMPLE CON RESERVAS

1. bootstrap.sh 4b: L153-154 concede --role=roles/billing.viewer a ${PLAN_SA} sobre "$ARGOS_BILLING_ACCOUNT" (gcloud billing accounts), mismo estilo `run`. PLAN_SA definido en L45, antes de usarse. Las unicas apariciones de PLAN_SA/terraform-plan: L45,106,125-135 (4a, solo lectura previa), 154, 173,189. Sin costsManager/billing.admin para la cuenta de plan. costsManager sigue solo en APPLY_SA (L151-152).
2. Comentario L148-151: coherente con D-31/REQ-IAC-009; no afirma nada falso.
3. Prueba: exige exactamente 2 lineas, ambas con la cuenta de facturacion; 1 linea por SA; apply=costsManager sin terraform-plan; plan=billing.viewer sin costsManager; salida sin billing.admin|owner|editor. Oraculo fuerte. Rojo reproducido en worktree desechable (91c538f^ + solo la prueba): "expected [ Array(1) ] to have a length of 2 but got 1", 1 failed/12 passed. Worktree eliminado; `git worktree list` solo muestra el principal.
4. Alcance minimo: 1d8163e solo terraform/bootstrap.sh (+4/-1); 91c538f solo tests/unit/terraform-bootstrap.spec.ts. La prueba se refuerza (1->2 lineas, mas asserts), nada debilitado.
5. Unica concesion de facturacion nueva: la de PLAN_SA; la de APPLY_SA intacta (grep add-iam-policy-binding).
6. Compuertas: vitest 3 archivos 29/29; tsc 0; traza 003 CUMPLE (purity 0); scan-secrets 0 hallazgos; bash -n 0.

Hallazgos
- H-O-T490-1 (menor): el regex anti-escalada solo cubre roles/billing.admin|owner|editor; otro rol de escritura (billing.user, billing.creator, costsManager en otra linea) lo atrapa solo el conteo de 2 lineas y el not.toContain por linea. Aceptable.
- H-O-T490-2 (menor): que billing.viewer incluya billing.budgets.get no es verificable sin GCP; confirmar con un plan real de PR #3 tras el paso 4b.
- H-O-T490-3 (RIESGO operativo): el permiso solo existe tras ejecutar bootstrap.sh paso 4b por Neo (no ejecutado aqui). Hasta entonces el plan de PR #3 sigue en 403.
