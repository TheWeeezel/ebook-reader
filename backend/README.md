# SmartReader backend

Two Cloud Run services that power the mobile app:

| Service | Image | Purpose |
|---|---|---|
| `api`    | `europe-west4-docker.pkg.dev/smartreader-app/smartreader/api`    | FastAPI proxy for AI calls + conversion orchestration |
| `worker` | `europe-west4-docker.pkg.dev/smartreader-app/smartreader/worker` | docling + pandoc PDF→EPUB pipeline |

Region: `europe-west4` (Netherlands). Both services scale to zero.

## Project layout

```
backend/
  app/                  # API service
    main.py             # FastAPI entry point, /ai/analyze, /health
    conversions.py      # POST /conversions, /start, GET /conversions/{id}
    storage_utils.py    # GCS V4 signed URLs via IAM SignBlob
    worker_client.py    # OIDC-authed call to the worker
    rate_limit.py       # per-IP fixed-window limiter
  worker/
    worker_app/
      main.py           # POST /convert entry point
      pipeline.py       # download → docling → claude polish → pandoc → upload
  tests/                # API tests (pytest + in-memory firestore fake)
  worker/tests/         # Worker polish/title tests
```

## Cloud resources (in `smartreader-app`)

| Resource | Identifier |
|---|---|
| Project | `smartreader-app` (owner: oozaru89@gmail.com) |
| Region | `europe-west4` |
| GCS bucket | `gs://smartreader-files` (30-day lifecycle delete) |
| Firestore | default database, native mode |
| Artifact Registry | `smartreader` (Docker) |
| Secrets | `anthropic-api-key`, `shared-secret` (latter unused after rate-limit migration; safe to retire) |

## Service accounts & IAM

Both services run as the default compute SA: `858303735604-compute@developer.gserviceaccount.com` (granted `roles/editor` automatically at project create).

Additional bindings required for the pipeline to work:

```bash
SA=858303735604-compute@developer.gserviceaccount.com

# (1) Self-token-creator: lets the SA mint signed URLs via IAM SignBlob.
#     Without this, /conversions returns a 500 from generate_signed_url
#     ("you need a private key to sign credentials").
gcloud iam service-accounts add-iam-policy-binding "$SA" \
  --member="serviceAccount:$SA" \
  --role="roles/iam.serviceAccountTokenCreator" \
  --project=smartreader-app

# (2) Run invoker on the worker: lets the API service POST /convert with an
#     OIDC token. Without this, /conversions/{id}/start returns a 502.
gcloud run services add-iam-policy-binding worker \
  --member="serviceAccount:$SA" \
  --role="roles/run.invoker" \
  --region=europe-west4 \
  --project=smartreader-app

# (3) Secret accessor on both secrets (granted at create time, listed here for
#     reproducibility).
for secret in anthropic-api-key shared-secret; do
  gcloud secrets add-iam-policy-binding "$secret" \
    --member="serviceAccount:$SA" \
    --role="roles/secretmanager.secretAccessor" \
    --project=smartreader-app
done
```

## Environment variables

### `api` service

| Var | Required | Default | Notes |
|---|---|---|---|
| `ANTHROPIC_API_KEY` | yes | — | mounted from Secret Manager (`anthropic-api-key:latest`) |
| `ANTHROPIC_MODEL` | no | `claude-sonnet-4-6` | |
| `MAX_INPUT_CHARS` | no | `500000` | truncation cap on `/ai/analyze` |
| `MAX_TOKENS` | no | `4096` | response cap on `/ai/analyze` |
| `AI_RATE_LIMIT_PER_MINUTE` | no | `20` | per-IP cap on `/ai/analyze` |
| `CONVERSION_RATE_LIMIT_PER_MINUTE` | no | `30` | per-IP cap on `/conversions/*` |
| `GCS_BUCKET` | yes | — | `smartreader-files` |
| `WORKER_URL` | yes | — | `https://worker-858303735604.europe-west4.run.app` |
| `SIGNED_URL_TTL_SECONDS` | no | `3600` | |

### `worker` service

| Var | Required | Default | Notes |
|---|---|---|---|
| `ANTHROPIC_API_KEY` | yes | — | mounted from Secret Manager |
| `ANTHROPIC_MODEL` | no | `claude-sonnet-4-6` | |
| `GCS_BUCKET` | yes | — | `smartreader-files` |
| `POLISH_MAX_INPUT_CHARS` | no | `150000` | larger docs polish prefix only |
| `POLISH_MAX_TOKENS` | no | `16384` | |

## Deploy from scratch

```bash
# Build images.
cd backend
gcloud builds submit --tag europe-west4-docker.pkg.dev/smartreader-app/smartreader/api:vN \
  --project=smartreader-app .

cd worker
gcloud builds submit --tag europe-west4-docker.pkg.dev/smartreader-app/smartreader/worker:vN \
  --project=smartreader-app --timeout=1800s --machine-type=e2-highcpu-32 .

# Deploy worker (CPU-only, scale-to-zero, internal-only).
gcloud run deploy worker \
  --image=europe-west4-docker.pkg.dev/smartreader-app/smartreader/worker:vN \
  --region=europe-west4 \
  --execution-environment=gen2 \
  --memory=8Gi --cpu=4 \
  --timeout=3600 \
  --min-instances=0 --max-instances=2 --concurrency=1 \
  --no-allow-unauthenticated \
  --set-env-vars=GCS_BUCKET=smartreader-files \
  --set-secrets=ANTHROPIC_API_KEY=anthropic-api-key:latest \
  --project=smartreader-app

# Deploy api (public, generous timeout for the long-poll on /start).
gcloud run deploy api \
  --image=europe-west4-docker.pkg.dev/smartreader-app/smartreader/api:vN \
  --region=europe-west4 \
  --allow-unauthenticated \
  --memory=512Mi --cpu=1 \
  --timeout=3600 \
  --min-instances=0 --max-instances=10 --concurrency=80 \
  --set-env-vars=GCS_BUCKET=smartreader-files,WORKER_URL=https://worker-858303735604.europe-west4.run.app \
  --set-secrets=ANTHROPIC_API_KEY=anthropic-api-key:latest \
  --project=smartreader-app
```

## Local development

```bash
cd backend
python3 -m venv .venv
.venv/bin/pip install -r requirements-dev.txt

# Tests are fully offline (fake Firestore + mocked GCS/worker).
.venv/bin/pytest tests/ -v
.venv/bin/pytest worker/tests/ -v
```

To run the API locally (won't work without GCP creds for Firestore/Storage):

```bash
export ANTHROPIC_API_KEY=sk-ant-...
export GCS_BUCKET=smartreader-files
export WORKER_URL=https://worker-858303735604.europe-west4.run.app
.venv/bin/uvicorn app.main:app --reload
```

## Endpoints

| Endpoint | Auth | Notes |
|---|---|---|
| `GET /health` | none | returns `{"status":"ok"}` |
| `POST /ai/analyze` | per-IP rate limit | `{text, instruction, bookTitle}` → Claude proxy |
| `POST /conversions` | per-IP rate limit | creates job + signed upload URL |
| `POST /conversions/{id}/start` | per-IP rate limit | idempotent: returns existing result when status=`done`, 409 when in progress |
| `GET /conversions/{id}` | per-IP rate limit | poll for status + download URL |

State machine: `awaiting_upload` → `queued` → `running` → `done` (or `error`).

## Costs

- Idle: ~$0/mo (both services scale to zero, Firestore + GCS free tier).
- Per AI analyze: Anthropic pass-through.
- Per PDF→EPUB conversion: ~$0.03–0.05 (Cloud Run CPU-seconds on warm instance + Claude polish call). First conversion after idle adds ~3–5 min for docling model download.

## Known limitations (Phase 2 v1)

- **No mid-flight cancellation.** Closing the mobile modal aborts the client's HTTP wait but does NOT stop the worker; the EPUB still lands in GCS and gets cleaned up by lifecycle policy after 30 days.
- **Polish cap at 150K chars.** Documents larger than the cap have only the prefix polished; the tail is appended verbatim. Surfaces as `polish_status: "polished_partial"` to the client.
- **No image extraction** in the EPUB output — docling produces text-only markdown in this configuration.
- **Cold-start tax.** First request to the worker after scale-to-zero downloads docling's model weights (~30 s on top of the usual ~5–10 s container start).
