# hf-render-service

Service backend de rendu vidéo HyperFrames pour Web2Print.

## Architecture

```
Web2Print (SPA)  ──POST /render──▶  Cloud Run "hf-render"
                                       │
                                       ├─ npx hyperframes render
                                       │  (Chromium + ffmpeg)
                                       │
                                       ├─ Firebase Storage   (MP4 sortie)
                                       └─ Firestore /renders (job state)
```

## Endpoints

| Méthode | URL              | Description                                      |
|---------|------------------|--------------------------------------------------|
| GET     | `/healthz`       | Liveness                                         |
| POST    | `/render`        | Lance un rendu (Firebase Auth Bearer requis)     |
| GET     | `/render/:id`    | Statut + URL signée                              |

### POST /render

```http
POST /render
Authorization: Bearer <Firebase ID token>
Content-Type: application/json

{
  "template": "ken-burns",
  "variables": {
    "imageUrl": "https://…/page.png",
    "caption":  "Soldes -30%",
    "brand":    "Acme"
  },
  "fps": 30,
  "quality": "standard",
  "format": "mp4"
}
```

Réponse (synchrone, < 60s en POC) :

```json
{
  "renderId": "abc123",
  "status": "done",
  "url": "https://storage.googleapis.com/…/abc123.mp4?…",
  "durationMs": 42100
}
```

## Templates disponibles

| Nom         | Format        | Durée | Variables                          |
|-------------|---------------|-------|------------------------------------|
| `ken-burns` | 1080×1080 MP4 | 8 s   | `imageUrl` (requis), `caption`, `brand` |

## Setup local

```bash
cd hf-render-service
npm install

# Auth Firebase Admin (Application Default Credentials)
gcloud auth application-default login

# Lancer en dev
npm run dev

# Tester /healthz
curl http://localhost:8080/healthz
```

## Déploiement Cloud Run

Prérequis GCP (une seule fois) :

```bash
gcloud auth login
gcloud auth application-default login

gcloud projects create web2print-render --name="Web2Print Render"
gcloud config set project web2print-render

gcloud billing projects link web2print-render --billing-account=BILLING_ACCOUNT_ID

gcloud services enable \
    run.googleapis.com \
    artifactregistry.googleapis.com \
    cloudbuild.googleapis.com \
    storage.googleapis.com \
    --project=web2print-render

gcloud artifacts repositories create hf-render \
    --repository-format=docker \
    --location=europe-west1 \
    --project=web2print-render
```

Puis :

```bash
npm run deploy
```

## Variables d'environnement

| Nom                          | Défaut                          | Rôle                              |
|------------------------------|---------------------------------|-----------------------------------|
| `PORT`                       | `8080`                          | Port HTTP                         |
| `FIREBASE_PROJECT_ID`        | `web2print-6fe5a`               | Projet Firebase cible (Auth/Storage/Firestore) |
| `FIREBASE_STORAGE_BUCKET`    | `${FIREBASE_PROJECT_ID}.firebasestorage.app` | Bucket Storage   |
| `GOOGLE_APPLICATION_CREDENTIALS` | _(unset, ADC)_              | Path vers service-account.json (optionnel)     |
| `HF_RENDER_VERBOSE`          | `0`                             | `1` pour streamer stdout HF       |
| `RENDER_TMP_ROOT`            | `/tmp/hf-renders`               | Racine des dossiers de travail    |

## Permissions IAM

Le service account de Cloud Run a besoin de :

- `roles/firebaseauth.viewer` (vérifier les ID tokens)
- `roles/datastore.user` (Firestore lecture/écriture)
- `roles/storage.objectAdmin` sur le bucket `web2print-6fe5a.appspot.com`

## Câblage côté Web2Print (SPA)

Après déploiement, récupère l'URL Cloud Run :

```bash
gcloud run services describe hf-render \
  --project=web2print-render --region=europe-west1 \
  --format='value(status.url)'
```

Puis ajoute-la à `Web2Print/.env.local` :

```
VITE_HF_RENDER_URL=https://hf-render-xxx-ew.a.run.app
```

Redémarre le dev server. Le bouton **Vidéo** apparaît dans l'`EditorHeader`,
à gauche de **Exporter**.

## Coûts

Cloud Run (Frankfurt/Belgium) : ~$0.02–0.10 par rendu Ken Burns 8s 1080p
selon CPU sec consommé. Scale-to-zero entre rendus.
