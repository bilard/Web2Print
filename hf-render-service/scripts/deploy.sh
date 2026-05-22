#!/usr/bin/env bash
set -euo pipefail

# Deploy hf-render-service to Cloud Run.
# Prerequisites:
#   - gcloud authenticated (gcloud auth login + gcloud auth application-default login)
#   - GCP project created with billing enabled
#   - APIs enabled: run, artifactregistry, cloudbuild, storage
#   - Artifact Registry repo "hf-render" exists in REGION

PROJECT_ID="${PROJECT_ID:-web2print-render}"
REGION="${REGION:-europe-west1}"
SERVICE="${SERVICE:-hf-render}"
REPO="${REPO:-hf-render}"
FIREBASE_PROJECT_ID="${FIREBASE_PROJECT_ID:-web2print-6fe5a}"
FIREBASE_STORAGE_BUCKET="${FIREBASE_STORAGE_BUCKET:-${FIREBASE_PROJECT_ID}.firebasestorage.app}"
SA_EMAIL="${SA_EMAIL:-hf-render-runtime@${PROJECT_ID}.iam.gserviceaccount.com}"

IMAGE="${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPO}/${SERVICE}:$(date +%Y%m%d-%H%M%S)"

echo "→ Project:  ${PROJECT_ID}"
echo "→ Region:   ${REGION}"
echo "→ Service:  ${SERVICE}"
echo "→ Image:    ${IMAGE}"
echo ""

echo "→ Building image with Cloud Build…"
gcloud builds submit \
  --project="${PROJECT_ID}" \
  --tag="${IMAGE}" \
  .

echo ""
echo "→ Deploying to Cloud Run…"
gcloud run deploy "${SERVICE}" \
  --project="${PROJECT_ID}" \
  --region="${REGION}" \
  --image="${IMAGE}" \
  --platform=managed \
  --allow-unauthenticated \
  --memory=4Gi \
  --cpu=2 \
  --timeout=600 \
  --concurrency=1 \
  --max-instances=10 \
  --min-instances=0 \
  --service-account="${SA_EMAIL}" \
  --set-env-vars="FIREBASE_PROJECT_ID=${FIREBASE_PROJECT_ID},FIREBASE_STORAGE_BUCKET=${FIREBASE_STORAGE_BUCKET}"

echo ""
echo "✓ Deployed. Service URL:"
gcloud run services describe "${SERVICE}" \
  --project="${PROJECT_ID}" \
  --region="${REGION}" \
  --format='value(status.url)'
