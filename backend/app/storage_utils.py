"""GCS helpers: signed upload + download URLs, blob existence checks.

On Cloud Run, the default compute service account has no private key — so we
use the IAM SignBlob API for signing, surfaced via the storage client's
`service_account_email + access_token` arguments. This requires the SA to
have `roles/iam.serviceAccountTokenCreator` on itself.
"""
import datetime
import os
import threading

import google.auth
from google.auth.transport.requests import Request
from google.cloud import storage

GCS_BUCKET = os.environ.get("GCS_BUCKET", "")
SIGNED_URL_TTL_SECONDS = int(os.environ.get("SIGNED_URL_TTL_SECONDS", 3600))

_client: storage.Client | None = None
_signing_creds = None
_signing_lock = threading.Lock()


def _client_lazy() -> storage.Client:
    global _client
    if _client is None:
        _client = storage.Client()
    return _client


def _signing_context() -> tuple[str, str]:
    """Return (service_account_email, access_token) for IAM SignBlob signing.

    Refresh tokens lazily; they're valid for ~1 hour so we refresh on each
    call by default (cheap, just a metadata server hit).
    """
    global _signing_creds
    with _signing_lock:
        if _signing_creds is None:
            creds, _ = google.auth.default()
            _signing_creds = creds
        if not _signing_creds.valid:
            _signing_creds.refresh(Request())
        return _signing_creds.service_account_email, _signing_creds.token


def signed_upload_url(object_name: str, content_type: str) -> str:
    """V4 signed PUT URL for direct upload from the mobile client."""
    email, token = _signing_context()
    bucket = _client_lazy().bucket(GCS_BUCKET)
    blob = bucket.blob(object_name)
    return blob.generate_signed_url(
        version="v4",
        expiration=datetime.timedelta(seconds=SIGNED_URL_TTL_SECONDS),
        method="PUT",
        content_type=content_type,
        service_account_email=email,
        access_token=token,
    )


def signed_download_url(object_name: str) -> str:
    """V4 signed GET URL for the converted EPUB."""
    email, token = _signing_context()
    bucket = _client_lazy().bucket(GCS_BUCKET)
    blob = bucket.blob(object_name)
    return blob.generate_signed_url(
        version="v4",
        expiration=datetime.timedelta(seconds=SIGNED_URL_TTL_SECONDS),
        method="GET",
        service_account_email=email,
        access_token=token,
    )


def blob_exists(object_name: str) -> bool:
    bucket = _client_lazy().bucket(GCS_BUCKET)
    return bucket.blob(object_name).exists()
