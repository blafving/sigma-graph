# GCP CI/CD Setup for research-graph-sigma

## Prerequisites
- gcloud CLI installed and authenticated (`gcloud auth login`)
- Project: `research-graph-2026`
- Region: `us-central1`

## Step 1: Create Cloud Storage Bucket

```bash
gcloud auth login

# Create bucket
gsutil mb -p research-graph-2026 -l us -c standard gs://research-graph-sigma/

# Set public read access
gsutil iam ch allUsers:objectViewer gs://research-graph-sigma/

# Enable website hosting (404 fallback to index.html for SPA routing)
gsutil web set -m index.html -e 404.html gs://research-graph-sigma/
```

**Note:** If `allUsers` is blocked by an org policy, use:
```bash
gsutil iam ch allAuthenticatedUsers:objectViewer gs://research-graph-sigma/
```

Frontend URL: `https://storage.googleapis.com/research-graph-sigma/index.html`

## Step 2: Enable Cloud Build API

```bash
gcloud services enable cloudbuild.googleapis.com
```

## Step 3: Create GitHub Trigger

```bash
gcloud builds triggers create github \
  --name=sigma-frontend-deploy \
  --repo-owner=<your-github-username> \
  --repo-name=research-graph-sigma \
  --branch-pattern=^main$ \
  --build-config=cloudbuild.yaml \
  --project=research-graph-2026
```

This creates a trigger that runs on every push to `main`.

## Step 4: Service Account Permissions

The Cloud Build service account needs:
- `Storage Object Creator` (`roles/storage.objectCreator`) — to write to the bucket

The project default Cloud Build SA is:
`<project-number>@cloudbuild.gserviceaccount.com`

Grant permissions:
```bash
PROJECT_NUM=$(gcloud projects describe research-graph-2026 --format='value(projectNumber)')
gcloud projects add-iam-policy-binding research-graph-2026 \
  --member="serviceAccount:${PROJECT_NUM}@cloudbuild.gserviceaccount.com" \
  --role="roles/storage.objectCreator"
```

## Step 5: Update API Base URL

Edit `src/lib/api-client.ts` and update the `API_BASE` to point to your backend:

```typescript
const API_BASE = import.meta.env.VITE_API_URL || 'http://10.1.0.2:8080';
```

For production, set this via environment variable or a Cloud DNS domain.

## Architecture

```
GitHub push (main)
    ↓
Cloud Build trigger
    ↓
npm ci → npm run build → gsutil rsync dist/ → gs://research-graph-sigma/
    ↓
Users visit: https://storage.googleapis.com/research-graph-sigma/
    ↓
Frontend fetches data from FastAPI on GCE VM (10.1.0.2:8080)
```

## Alternative: Cloud Run Frontend (if org policy changes)

If the org policy blocking `allUsers` on Cloud Run is lifted:

```bash
# Build Docker image
gcloud builds submit --tag gcr.io/research-graph-2026/sigma-frontend:latest

# Deploy to Cloud Run v2
gcloud run deploy sigma-frontend \
  --image gcr.io/research-graph-2026/sigma-frontend:latest \
  --platform managed \
  --region us-central1 \
  --allow-unauthenticated \
  --ingress=all

# Update ingress after every deploy
gcloud run services update sigma-frontend --ingress=all
```

## VM Schedule Consideration

The backend VM runs 7:55am-10:55pm UTC. The frontend is always available (Cloud Storage),
but API calls will fail outside those hours. The UI shows a status indicator (green/red dot).

Long-term options:
1. **Graph caching** — Cron job fetches full graph JSON, stores in Cloud Storage
2. **Move FastAPI to Cloud Run** with VPC connector to VM (always-available API)
3. **Keep VM always-on** — +$10/month (e2-small)
