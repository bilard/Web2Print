#!/usr/bin/env bash
set -euo pipefail

# Setup GCP one-shot : project + APIs + Artifact Registry + IAM.
# Prérequis : gcloud installé + `gcloud auth login` déjà fait.
# Usage : bash scripts/bootstrap.sh

PROJECT_ID="${PROJECT_ID:-web2print-render}"
REGION="${REGION:-europe-west1}"
REPO="${REPO:-hf-render}"
FIREBASE_PROJECT_ID="${FIREBASE_PROJECT_ID:-web2print-6fe5a}"

bold() { printf "\033[1m%s\033[0m\n" "$1"; }
ok()   { printf "  \033[32m✓\033[0m %s\n" "$1"; }
info() { printf "  \033[36m→\033[0m %s\n" "$1"; }
warn() { printf "  \033[33m!\033[0m %s\n" "$1"; }

bold "[1/6] Vérification de la connexion gcloud…"
ACTIVE_ACCOUNT=$(gcloud auth list --filter=status:ACTIVE --format="value(account)" 2>/dev/null || true)
if [ -z "${ACTIVE_ACCOUNT}" ]; then
  warn "Aucun compte gcloud actif. Lance d'abord :  gcloud auth login"
  exit 1
fi
ok "Connecté en tant que ${ACTIVE_ACCOUNT}"

bold "[2/6] Création du projet ${PROJECT_ID}…"
if gcloud projects describe "${PROJECT_ID}" >/dev/null 2>&1; then
  ok "Projet ${PROJECT_ID} déjà existant"
else
  gcloud projects create "${PROJECT_ID}" --name="Web2Print Render"
  ok "Projet créé"
fi
gcloud config set project "${PROJECT_ID}" >/dev/null

bold "[3/6] Liaison du billing…"
LINKED=$(gcloud beta billing projects describe "${PROJECT_ID}" --format="value(billingEnabled)" 2>/dev/null || echo "false")
if [ "${LINKED}" = "True" ]; then
  ok "Billing déjà activé"
else
  if [ -z "${BILLING_ID:-}" ]; then
    info "Comptes de billing disponibles :"
    gcloud beta billing accounts list --format="table(ACCOUNT_ID,DISPLAY_NAME,OPEN)" 2>/dev/null || true
    echo ""
    read -rp "  ID du compte de billing (ex. 01ABCD-234567-89EFGH) : " BILLING_ID
  fi
  if [ -z "${BILLING_ID}" ]; then
    warn "Aucun ID fourni, on saute la liaison. Tu pourras la faire via la console GCP."
    warn "→ https://console.cloud.google.com/billing/linkedaccount?project=${PROJECT_ID}"
  else
    gcloud beta billing projects link "${PROJECT_ID}" --billing-account="${BILLING_ID}"
    ok "Billing lié (${BILLING_ID})"
  fi
fi

bold "[4/6] Activation des APIs…"
gcloud services enable \
  run.googleapis.com \
  artifactregistry.googleapis.com \
  cloudbuild.googleapis.com \
  storage.googleapis.com \
  iam.googleapis.com \
  --project="${PROJECT_ID}" >/dev/null
ok "APIs activées (Run, Artifact Registry, Cloud Build, Storage, IAM)"

bold "[5/6] Repo Artifact Registry…"
if gcloud artifacts repositories describe "${REPO}" --location="${REGION}" --project="${PROJECT_ID}" >/dev/null 2>&1; then
  ok "Repo ${REPO} déjà existant"
else
  gcloud artifacts repositories create "${REPO}" \
    --repository-format=docker \
    --location="${REGION}" \
    --project="${PROJECT_ID}" \
    --description="Images Docker hf-render"
  ok "Repo Docker créé dans ${REGION}"
fi

bold "[6/6] IAM (service account + droits cross-projet)…"
bash "$(dirname "$0")/setup-iam.sh"

echo ""
bold "✅ Setup GCP terminé."
echo ""
info "Étape suivante :  npm run deploy"
echo ""
