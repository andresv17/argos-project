# Oracle: reauditoría T489 / D-30 (MAX_RETRY = 1, última)
Fecha: 2026-11-16. Objeto: f2aae21 (prueba), 27edc2f (implementación). Referencia: oracle-T489-D30.md.

## Veredicto: CUMPLE CON RESERVAS

## Verificación en disco
1. H-O-T489-1 CERRADO. infraestructura.yml (leído por job): job plan (línea 51-147) tiene `TF_VAR_github_repository: ${{ github.repository }}` en línea 67; job apply (148-) lo tiene en línea 165; validate no lo tiene. Una vez por job. La prueba parte `jobs:` por claves de 2 espacios, cuenta por job (plan y apply = 1 cada uno) y el total global = 2. Rojo reproducido en worktree desechable en f2aae21 (YAML previo): "job apply: expected +0 to be 1", 1 fallo / 5 pasan. Worktree eliminado, `git worktree list` limpio.
2. H-O-T489-2 CERRADO. La regex ahora ancla `workloadIdentityPools/\$\{var\.project_prefix\}-github/`; iam.tf línea 76 usa exactamente `workloadIdentityPools/${var.project_prefix}-github/attribute.job_workflow_ref/${var.github_repository}/...deploy-argos.yml@refs/heads/main`. Coincide.
3. Cambio mínimo. f2aae21: solo tests/unit/terraform-iam-secrets.spec.ts (+12/-3). 27edc2f: solo infraestructura.yml (+1). El diff de la prueba endurece (regex más estricta, conteo por job) y no elimina ni relaja ninguna aserción; `not.toContain('*')` y `not.toMatch` se conservan.
4. Compuertas (salidas reales): vitest 3 archivos 29/29 verde; tsc --noEmit = 0; verify-traceability --feature 003: Violaciones de pureza 0, CUMPLE; scan-secrets repo: 0 hallazgos.

## Reservas (no bloqueantes)
- H-O-T489-3 MENOR: argos-terraform-plan@ depende implícitamente de resourcemanager.projects.get para el data google_project (cubierto hoy por sus roles; no declarado).
- H-O-T489-4 MENOR: un ARGOS_PREFIX distinto exige TF_VAR_project_prefix en el workflow; hoy sin mecanismo explícito.
- H-O-T489-5 MENOR: quickstart §6 y terraform/README.md sin el binding declarativo (deuda documental, requiere ID).
- H-O-T489-6 MENOR: actionlint no instalado (`which` = 1); YAML no validado por linter dedicado (deuda con ID). Sintaxis cubierta indirectamente por la prueba.
