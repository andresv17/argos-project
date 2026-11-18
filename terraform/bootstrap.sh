#!/usr/bin/env bash
# =============================================================================
# ARGOS - bootstrap del día 0 (T435; REQ-IAC-002, REQ-SEC-006, REQ-CICD-006, REQ-CICD-012; D-05, D-12, D-18)
#
# Lo EJECUTA NEO, UNA SOLA VEZ (T456). Ningún agente lo ejecuta.
# Por defecto es DRY-RUN: solo IMPRIME los comandos. Con --execute los ejecuta.
#
# Uso:
#   export ARGOS_PROJECT_ID=...        # ID del proyecto GCP nuevo (D-01)
#   export ARGOS_GITHUB_REPO=dueno/repo
#   export ARGOS_BILLING_ACCOUNT=XXXXXX-XXXXXX-XXXXXX
#   export ARGOS_GITHUB_REVIEWER=login # revisor del Environment produccion (Neo)
#   # opcionales: ARGOS_REGION (us-central1), ARGOS_PREFIX (argos), ARGOS_ORG_ID / ARGOS_FOLDER_ID
#   bash terraform/bootstrap.sh              # dry-run (imprime)
#   bash terraform/bootstrap.sh --execute    # ejecuta de verdad
#
# Secuencia en dos fases (T469 a; solo comentario, sin cambio de lógica):
#   Fase 1 (este script, Neo, una vez): proyecto, facturación, APIs mínimas, bucket de estado, cuentas de Terraform,
#          WIF, variables de GitHub y Environment produccion. Los secretos los pega Neo por stdin (paso 8).
#   Fase 2 (CI): infraestructura.yml aplica Terraform desde main (imagen marcadora, sin sondas ni secretos) y
#          deploy-argos.yml fija imagen, env, sondas, versiones numéricas de secretos y tráfico.
#   Ver terraform/README.md, sección "Secuencia de bootstrap en dos fases".
#
# Este script NO contiene ni recibe valores de secretos. Los secretos de GitHub
# (TF_VAR_database_url, TF_VAR_audit_hmac_secret, DATABASE_URL_DIRECT) los pega Neo
# por stdin con `gh secret set` (quickstart.md sec. 6); aquí solo se imprimen las órdenes.
# Sin llaves JSON: la autenticación de GitHub Actions es por Workload Identity Federation (D-05).
# =============================================================================
set -euo pipefail

EXECUTE=0
for arg in "$@"; do
  case "$arg" in
    --execute) EXECUTE=1 ;;
    --dry-run) EXECUTE=0 ;;
    -h|--help) sed -n '2,24p' "$0"; exit 0 ;;
    *) echo "Argumento desconocido: $arg (use --dry-run o --execute)" >&2; exit 2 ;;
  esac
done

: "${ARGOS_PROJECT_ID:?Defina ARGOS_PROJECT_ID}"
: "${ARGOS_GITHUB_REPO:?Defina ARGOS_GITHUB_REPO (dueno/repo)}"
: "${ARGOS_BILLING_ACCOUNT:?Defina ARGOS_BILLING_ACCOUNT}"
PROJECT="$ARGOS_PROJECT_ID"
REPO="$ARGOS_GITHUB_REPO"
REGION="${ARGOS_REGION:-us-central1}"
PREFIX="${ARGOS_PREFIX:-argos}"
REVIEWER="${ARGOS_GITHUB_REVIEWER:-<LOGIN_DE_NEO>}"
STATE_BUCKET="${PROJECT}-tfstate"                      # D-12: bucket propio versionado
POOL="${PREFIX}-github"
PROVIDER="github"
PLAN_SA="${PREFIX}-terraform-plan@${PROJECT}.iam.gserviceaccount.com"   # solo lectura
APPLY_SA="${PREFIX}-terraform@${PROJECT}.iam.gserviceaccount.com"       # escritura (solo main)
DEPLOY_SA="${PREFIX}-deployer@${PROJECT}.iam.gserviceaccount.com"       # lo crea Terraform (T439)
WORKFLOW_REF="${REPO}/.github/workflows/infraestructura.yml@refs/heads/main"

say() { printf '\n### %s\n' "$*"; }

# run: en dry-run imprime el comando; con --execute lo ejecuta.
run() {
  if [ "$EXECUTE" -eq 1 ]; then
    "$@"
  else
    printf '+ '; printf '%q ' "$@"; printf '\n'
  fi
}

if [ "$EXECUTE" -eq 1 ]; then
  for tool in gcloud gh; do command -v "$tool" >/dev/null || { echo "Falta $tool" >&2; exit 1; }; done
  echo "MODO EJECUCIÓN: se aplicarán cambios reales en GCP y GitHub."
else
  echo "DRY-RUN: solo se imprimen los comandos. Use --execute para ejecutarlos."
fi

# Identificadores numéricos del repositorio (condición de WIF, REQ-CICD-012). En dry-run son marcadores.
if [ "$EXECUTE" -eq 1 ]; then
  REPO_ID="$(gh api "repos/${REPO}" --jq .id)"
  OWNER_ID="$(gh api "repos/${REPO}" --jq .owner.id)"
  REVIEWER_ID="$(gh api "users/${REVIEWER}" --jq .id)"
else
  REPO_ID="<REPOSITORY_ID>"; OWNER_ID="<REPOSITORY_OWNER_ID>"; REVIEWER_ID="<REVIEWER_ID>"
fi

say "1. Proyecto nuevo y facturación (D-01)"
CREATE_ARGS=(projects create "$PROJECT" --name="ARGOS")
[ -n "${ARGOS_ORG_ID:-}" ] && CREATE_ARGS+=(--organization="$ARGOS_ORG_ID")
[ -n "${ARGOS_FOLDER_ID:-}" ] && CREATE_ARGS+=(--folder="$ARGOS_FOLDER_ID")
run gcloud "${CREATE_ARGS[@]}"
run gcloud billing projects link "$PROJECT" --billing-account="$ARGOS_BILLING_ACCOUNT"

say "2. APIs mínimas para que Terraform pueda empezar (el resto las habilita services.tf, REQ-IAC-009)"
run gcloud services enable \
  cloudresourcemanager.googleapis.com serviceusage.googleapis.com iam.googleapis.com \
  iamcredentials.googleapis.com sts.googleapis.com storage.googleapis.com \
  --project="$PROJECT"

say "3. Bucket de estado de Terraform (D-12, REQ-SEC-006): privado, versionado, sin soft delete"
run gcloud storage buckets create "gs://${STATE_BUCKET}" \
  --project="$PROJECT" --location="$REGION" --default-storage-class=STANDARD \
  --uniform-bucket-level-access --public-access-prevention --soft-delete-duration=0
run gcloud storage buckets update "gs://${STATE_BUCKET}" --versioning
# Elimina las versiones NO vigentes del .tfstate a los 30 días (conservan secretos en claro, R-06).
LIFECYCLE_JSON='{"rule":[{"action":{"type":"Delete"},"condition":{"daysSinceNoncurrentTime":30,"isLive":false}}]}'
if [ "$EXECUTE" -eq 1 ]; then
  LC_FILE="$(mktemp)"; trap 'rm -f "$LC_FILE"' EXIT
  printf '%s' "$LIFECYCLE_JSON" > "$LC_FILE"
  gcloud storage buckets update "gs://${STATE_BUCKET}" --lifecycle-file="$LC_FILE"
else
  echo "+ gcloud storage buckets update gs://${STATE_BUCKET} --lifecycle-file=<archivo con: ${LIFECYCLE_JSON}>"
fi

say "4. Cuentas de Terraform separadas (REQ-CICD-012, D-18)"
run gcloud iam service-accounts create "${PREFIX}-terraform-plan" --project="$PROJECT" \
  --display-name="ARGOS Terraform plan (solo lectura)"
run gcloud iam service-accounts create "${PREFIX}-terraform" --project="$PROJECT" \
  --display-name="ARGOS Terraform apply (escritura, solo main)"

# T441a (REQ-IAC-008, REQ-CICD-012, SC-CLD-008; decisión de Neo 2026-11-16): los permisos de storage de apply y plan
# se acotan por bucket. Ninguna cuenta de CI puede leer objetos de dumps/ (solo Neo lee los dumps): no se concede
# roles/storage.admin ni roles/viewer (que incluye storage.objects.get/list) a nivel de proyecto, ni ningún rol
# de objetos sobre el bucket de exports. A nivel de proyecto solo hay roles personalizados con permisos de
# METADATOS de buckets (sin storage.objects.*, sin get/setIamPolicy; estos van en un rol aparte acotado al bucket de medios): storage.buckets.create no se puede acotar por bucket.
# Verificación real en el ensayo T469.
say "4-pre. Roles personalizados de metadatos de buckets (sin acceso a objetos)"
run gcloud iam roles create argosTerraformApplyBuckets --project="$PROJECT" \
  --title="ARGOS Terraform apply: buckets (sin objetos)" \
  --permissions=storage.buckets.create,storage.buckets.get,storage.buckets.list,storage.buckets.update
run gcloud iam roles create argosTerraformPlanBuckets --project="$PROJECT" \
  --title="ARGOS Terraform plan: buckets (solo metadatos)" \
  --permissions=storage.buckets.get,storage.buckets.list
# Run 44208529984 de infraestructura.yml (REQ-IAC-008, T441a): terraform/iam.tf:114 (run_media_object_user) falló con 403
# storage.buckets.getIamPolicy. DECISIÓN DE NEO (Opción A): getIamPolicy/setIamPolicy NO van en los roles de proyecto
# anteriores (ni a nivel de proyecto ni sobre dumps/). Van en un rol personalizado APARTE, sin storage.objects.*, que se
# concede SOLO sobre el bucket de medios gs://${PREFIX}-${PROJECT}-media (ver paso 4c).
run gcloud iam roles create argosTerraformMediaBucketIam --project="$PROJECT" \
  --title="ARGOS Terraform apply: IAM del bucket de medios (sin objetos)" \
  --permissions=storage.buckets.getIamPolicy,storage.buckets.setIamPolicy

say "4a. Permisos de argos-terraform-plan@: SOLO LECTURA (sin escritura sobre recursos ni estado; sin lectura de dumps/)"
# roles/viewer se sustituye por visores concretos: el básico incluye lectura de objetos de todos los buckets.
for role in roles/run.viewer roles/artifactregistry.reader roles/cloudscheduler.viewer roles/monitoring.viewer \
            roles/logging.viewer roles/serviceusage.serviceUsageViewer roles/iam.serviceAccountViewer roles/cloudtasks.viewer \
            roles/iam.securityReviewer roles/secretmanager.viewer \
            "projects/${PROJECT}/roles/argosTerraformPlanBuckets"; do
  run gcloud projects add-iam-policy-binding "$PROJECT" --member="serviceAccount:${PLAN_SA}" --role="$role" --condition=None
done
# Solo el bucket de ESTADO (nunca el de exports/dumps).
run gcloud storage buckets add-iam-policy-binding "gs://${STATE_BUCKET}" \
  --member="serviceAccount:${PLAN_SA}" --role=roles/storage.objectUser

say "4b. Permisos de argos-terraform@: escritura sobre la infraestructura de ARGOS y el estado (sin lectura de dumps/)"
for role in roles/run.admin roles/artifactregistry.admin roles/secretmanager.admin \
            roles/iam.serviceAccountAdmin roles/iam.serviceAccountUser roles/resourcemanager.projectIamAdmin \
            roles/serviceusage.serviceUsageAdmin roles/cloudscheduler.admin \
            roles/monitoring.admin roles/logging.admin roles/cloudtasks.admin \
            "projects/${PROJECT}/roles/argosTerraformApplyBuckets"; do
  run gcloud projects add-iam-policy-binding "$PROJECT" --member="serviceAccount:${APPLY_SA}" --role="$role" --condition=None
done
# Solo el bucket de ESTADO (nunca el de exports/dumps).
run gcloud storage buckets add-iam-policy-binding "gs://${STATE_BUCKET}" \
  --member="serviceAccount:${APPLY_SA}" --role=roles/storage.objectAdmin

say "4c. IAM del bucket de medios SOLO para argos-terraform@ (Opción A de Neo; run 44208529984; T441a)"
# El bucket de medios lo crea Terraform (buckets_media.tf): si aún no existe, esta orden se repite tras el primer apply.
# Nunca a nivel de proyecto, nunca sobre dumps/ ni sobre el bucket de exports; el rol no incluye storage.objects.*.
MEDIA_BUCKET="${PREFIX}-${PROJECT}-media"
if [ "$EXECUTE" -eq 1 ] && ! gcloud storage buckets describe "gs://${MEDIA_BUCKET}" --project="$PROJECT" >/dev/null 2>&1; then
  echo "AVISO: gs://${MEDIA_BUCKET} aún no existe; repita este paso 4c tras el primer apply de Terraform." >&2
else
  run gcloud storage buckets add-iam-policy-binding "gs://${MEDIA_BUCKET}" \
    --member="serviceAccount:${APPLY_SA}" --role="projects/${PROJECT}/roles/argosTerraformMediaBucketIam"
fi
# REQ-IAC-009 (enmendado): el presupuesto (google_billing_budget) exige un rol SOBRE LA CUENTA DE FACTURACIÓN;
# un rol de proyecto no basta. costsManager solo a argos-terraform@; la cuenta de plan (argos-terraform-plan@) recibe
# SOLO billing.viewer (lectura, D-31) para leer el presupuesto en el plan; sin billing.admin, owner ni editor.
run gcloud billing accounts add-iam-policy-binding "$ARGOS_BILLING_ACCOUNT" \
  --member="serviceAccount:${APPLY_SA}" --role=roles/billing.costsManager
run gcloud billing accounts add-iam-policy-binding "$ARGOS_BILLING_ACCOUNT" \
  --member="serviceAccount:${PLAN_SA}" --role=roles/billing.viewer

say "5. Workload Identity Federation para GitHub Actions (D-05; sin llaves JSON)"
run gcloud iam workload-identity-pools create "$POOL" --project="$PROJECT" --location=global \
  --display-name="ARGOS GitHub"
run gcloud iam workload-identity-pools providers create-oidc "$PROVIDER" --project="$PROJECT" --location=global \
  --workload-identity-pool="$POOL" \
  --issuer-uri="https://token.actions.githubusercontent.com" \
  --attribute-mapping="google.subject=assertion.sub,attribute.repository_id=assertion.repository_id,attribute.repository_owner_id=assertion.repository_owner_id,attribute.ref=assertion.ref,attribute.job_workflow_ref=assertion.job_workflow_ref,attribute.event_name=assertion.event_name" \
  --attribute-condition="assertion.repository_id == '${REPO_ID}' && assertion.repository_owner_id == '${OWNER_ID}'"

if [ "$EXECUTE" -eq 1 ]; then
  PROJECT_NUMBER="$(gcloud projects describe "$PROJECT" --format='value(projectNumber)')"
else
  PROJECT_NUMBER="<PROJECT_NUMBER>"
fi
POOL_PATH="projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/${POOL}"

say "5a. argos-terraform-plan@: lo puede usar cualquier ejecución del repositorio (incluye pull_request)"
run gcloud iam service-accounts add-iam-policy-binding "$PLAN_SA" --project="$PROJECT" \
  --role=roles/iam.workloadIdentityUser \
  --member="principalSet://iam.googleapis.com/${POOL_PATH}/attribute.repository_id/${REPO_ID}"

say "5b. argos-terraform@: SOLO el workflow infraestructura.yml desde refs/heads/main [verificar atributos en T469]"
run gcloud iam service-accounts add-iam-policy-binding "$APPLY_SA" --project="$PROJECT" \
  --role=roles/iam.workloadIdentityUser \
  --member="principalSet://iam.googleapis.com/${POOL_PATH}/attribute.job_workflow_ref/${WORKFLOW_REF}"
# La cuenta argos-deployer@ y su vinculo WIF los crea Terraform (T489, D-30) en terraform/iam.tf.

say "5c. nota: la vinculacion WIF de la cuenta de despliegue ya NO es manual; la declara terraform/iam.tf (T489) y la crea el primer apply"

say "6. Variables de GitHub del día 0 (valores no sensibles; REQ-CICD-006)"
WIF_PROVIDER="${POOL_PATH}/providers/${PROVIDER}"
for kv in "TF_VAR_project_id=${PROJECT}" "TF_VAR_region=${REGION}" "TF_VAR_billing_account=${ARGOS_BILLING_ACCOUNT}" "TF_STATE_BUCKET=${STATE_BUCKET}" \
          "GCP_WIF_PROVIDER=${WIF_PROVIDER}" "GCP_TERRAFORM_SA=${APPLY_SA}" \
          "TF_VAR_github_repository=${REPO}" "GCP_TERRAFORM_PLAN_SA=${PLAN_SA}" "GCP_DEPLOY_SA=${DEPLOY_SA}"; do
  run gh variable set "${kv%%=*}" --repo "$REPO" --body "${kv#*=}"
done
# custom_domain vacío (F3 desactivado). Si GitHub rechaza el valor vacío, omitir (se evalúa como vacío) [verificar en T456].
echo "+ gh variable set TF_VAR_custom_domain --repo ${REPO} --body ''   (omitir si GitHub rechaza el valor vacío)"

say "7. Environment produccion con aprobación de Neo (REQ-CICD-012)"
run gh api -X PUT "repos/${REPO}/environments/produccion" \
  -F "reviewers[][type]=User" -F "reviewers[][id]=${REVIEWER_ID}" \
  -F "deployment_branch_policy[protected_branches]=false" -F "deployment_branch_policy[custom_branch_policies]=true"
run gh api -X POST "repos/${REPO}/environments/produccion/deployment-branch-policies" -f name=main

say "8. Secretos de GitHub: NO los crea este script. Neo los pega por stdin (valores nunca en el historial ni en el repo)"
cat <<MSG
  gh secret set TF_VAR_database_url      --repo ${REPO}   # URL de Neon con -pooler (rol argos_app)
  gh secret set TF_VAR_audit_hmac_secret --repo ${REPO}   # >= 32 bytes hex
  gh secret set DATABASE_URL_DIRECT      --repo ${REPO}   # URL directa sin -pooler (rol argos_migrator)
MSG

say "Listo. Siguiente: apply de infraestructura desde CI (REQ-IAC-012), según terraform/README.md."
