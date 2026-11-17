#!/usr/bin/env bash
# Verifica, ANTES de terraform/bootstrap.sh, herramientas y variables NO secretas. Solo lectura local: sin efectos en GCP ni GitHub.
# Uso: ARGOS_PROJECT_ID=... ARGOS_GITHUB_REPO=dueno/repo ARGOS_BILLING_ACCOUNT=XXXXXX-XXXXXX-XXXXXX \
#        [ARGOS_REGION=us-central1] [ARGOS_GITHUB_REVIEWER=login] bash scripts/verify-bootstrap-inputs.sh
# Salida: 0 = todo pasa, 1 = alguna comprobación falla, 2 = faltan variables obligatorias.
# No imprime valores de variables ni la cuenta de gcloud; no lee DATABASE_URL, TF_VAR_database_url ni TF_VAR_audit_hmac_secret.
set -u

FAILS=0
pass() { printf 'PASA   %s\n' "$1"; }
fail() { printf 'FALLA  %s\n' "$1"; FAILS=$((FAILS + 1)); }
check() { # check "descripcion" comando...
  local desc="$1"; shift
  if "$@" >/dev/null 2>&1; then pass "$desc"; else fail "$desc"; fi
}

MISSING=()
for v in ARGOS_PROJECT_ID ARGOS_GITHUB_REPO ARGOS_BILLING_ACCOUNT; do
  [ -n "${!v:-}" ] || MISSING+=("$v")
done
if [ "${#MISSING[@]}" -gt 0 ]; then
  echo "Faltan variables obligatorias: ${MISSING[*]}"
  echo "Defínalas antes de ejecutar terraform/bootstrap.sh."
  exit 2
fi

echo "== Herramientas =="
for t in gh gcloud terraform; do
  check "$t instalada" command -v "$t"
done
if command -v gh >/dev/null 2>&1; then
  check "gh autenticado (gh auth status)" gh auth status
fi
has_gcloud_account() { [ -n "$(gcloud auth list --filter=status:ACTIVE --format='value(account)' 2>/dev/null)" ]; }
if command -v gcloud >/dev/null 2>&1; then
  check "gcloud con cuenta activa" has_gcloud_account
fi

echo "== Variables =="
matches() { printf '%s' "$2" | grep -Eq "$1"; }
project_id_ok() { matches '^[a-z][a-z0-9-]{4,28}[a-z0-9]$' "$ARGOS_PROJECT_ID"; }
check "ARGOS_PROJECT_ID con formato de ID de proyecto GCP (6-30, minúsculas/dígitos/guiones, empieza por letra, no termina en guion)" project_id_ok
check "ARGOS_GITHUB_REPO con formato dueño/repo" matches '^[A-Za-z0-9._-]+/[A-Za-z0-9._-]+$' "$ARGOS_GITHUB_REPO"
check "ARGOS_BILLING_ACCOUNT con formato XXXXXX-XXXXXX-XXXXXX" matches '^[0-9A-F]{6}-[0-9A-F]{6}-[0-9A-F]{6}$' "$ARGOS_BILLING_ACCOUNT"
if [ -n "${ARGOS_REGION:-}" ]; then
  check "ARGOS_REGION con forma de región GCP (p. ej. us-central1)" matches '^[a-z]+-[a-z]+[0-9]+$' "$ARGOS_REGION"
else
  echo "OMITE  ARGOS_REGION no definida (se usará us-central1)"
fi
if [ -n "${ARGOS_GITHUB_REVIEWER:-}" ]; then
  reviewer_ok() { [ "${#ARGOS_GITHUB_REVIEWER}" -le 39 ] && matches '^[A-Za-z0-9]+(-[A-Za-z0-9]+)*$' "$ARGOS_GITHUB_REVIEWER"; }
  check "ARGOS_GITHUB_REVIEWER es un login de GitHub válido" reviewer_ok
else
  echo "OMITE  ARGOS_GITHUB_REVIEWER no definida (bootstrap usará un marcador)"
fi

echo "== Recordatorio (no se comprueba) =="
echo "Los secretos DATABASE_URL, TF_VAR_database_url y TF_VAR_audit_hmac_secret deben estar en GitHub Secrets (quickstart.md §6)."

echo "== Resumen =="
if [ "$FAILS" -eq 0 ]; then
  echo "PASA   todas las comprobaciones"
  exit 0
fi
echo "FALLA  $FAILS comprobación(es) con error"
exit 1
