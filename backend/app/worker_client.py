"""Calls the worker Cloud Run service with a Google-issued OIDC token."""
import os

import httpx
import google.auth.transport.requests
import google.oauth2.id_token

WORKER_URL = os.environ.get("WORKER_URL", "")
WORKER_TIMEOUT_SECONDS = float(os.environ.get("WORKER_TIMEOUT_SECONDS", 3500.0))


def _identity_token() -> str:
    auth_req = google.auth.transport.requests.Request()
    return google.oauth2.id_token.fetch_id_token(auth_req, WORKER_URL)


async def invoke_convert(job_id: str) -> dict:
    if not WORKER_URL:
        raise RuntimeError("WORKER_URL is not configured")
    token = _identity_token()
    async with httpx.AsyncClient(timeout=WORKER_TIMEOUT_SECONDS) as client:
        resp = await client.post(
            f"{WORKER_URL}/convert",
            headers={
                "Authorization": f"Bearer {token}",
                "Content-Type": "application/json",
            },
            json={"job_id": job_id},
        )
    if resp.status_code >= 400:
        raise RuntimeError(
            f"worker returned {resp.status_code}: {resp.text[:300]}"
        )
    return resp.json()
