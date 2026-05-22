#!/usr/bin/env bash
set -euo pipefail

# One-shot IAM setup for hf-render-service.
# Creates a dedicated service account in PROJECT_ID and grants it
# the necessary roles on the Firebase project FIREBASE_PROJECT_ID
# (cross-project: Auth verify, Firestore, Storage).
#
# Re-runs are idempotent (gcloud commands either succeed or fail gracefully).

PROJECT_ID="${PROJECT_ID:-web2print-render}"
REGION="${REGION:-europe-west1}"
SERVICE="${SERVICE:-hf-render}"
FIREBASE_PROJECT_ID="${FIREBASE_PROJECT_ID:-web2print-6fe5a}"

SA_NAME="hf-render-runtime"
SA_EMAIL="${SA_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"

echo "→ Création du service account ${SA_EMAIL}…"
gcloud iam service-accounts create "${SA_NAME}" \
  --project="${PROJECT_ID}" \
  --display-name="HF Render Runtime" \
  --description="Cloud Run runtime SA for hf-render-service" \
  || echo "  (déjà existant, on continue)"

echo ""
echo "→ Droits sur le projet Firebase ${FIREBASE_PROJECT_ID}…"

# Firebase Auth — vérifier les ID tokens
gcloud projects add-iam-policy-binding "${FIREBASE_PROJECT_ID}" \
  --member="serviceAccount:${SA_EMAIL}" \
  --role="roles/firebaseauth.viewer" \
  --condition=None \
  --quiet

# Firestore — read/write /renders/{id}
gcloud projects add-iam-policy-binding "${FIREBASE_PROJECT_ID}" \
  --member="serviceAccount:${SA_EMAIL}" \
  --role="roles/datastore.user" \
  --condition=None \
  --quiet

# Storage — upload des MP4
gcloud projects add-iam-policy-binding "${FIREBASE_PROJECT_ID}" \
  --member="serviceAccount:${SA_EMAIL}" \
  --role="roles/storage.objectAdmin" \
  --condition=None \
  --quiet

# Pour signer les URLs (getSignedUrl), le SA doit pouvoir s'impersonner.
gcloud iam service-accounts add-iam-policy-binding "${SA_EMAIL}" \
  --project="${PROJECT_ID}" \
  --member="serviceAccount:${SA_EMAIL}" \
  --role="roles/iam.serviceAccountTokenCreator" \
  --quiet

echo ""
echo "✓ IAM prêt. Service account à utiliser au déploiement :"
echo "  ${SA_EMAIL}"
echo ""
echo "  Ajoute --service-account=\"${SA_EMAIL}\" au gcloud run deploy"
echo "  (déjà câblé dans scripts/deploy.sh si tu utilises ce script)"
