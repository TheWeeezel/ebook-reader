"""PDF→EPUB conversion endpoints (Phase 2)."""
import os
import uuid
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from google.cloud import firestore
from pydantic import BaseModel

from .rate_limit import require_rate_limit
from . import storage_utils, worker_client

CONVERSION_RATE_LIMIT_PER_MINUTE = int(
    os.environ.get("CONVERSION_RATE_LIMIT_PER_MINUTE", "30")
)

router = APIRouter(prefix="/conversions", tags=["conversions"])

_fs_client: firestore.AsyncClient | None = None


def _fs() -> firestore.AsyncClient:
    global _fs_client
    if _fs_client is None:
        _fs_client = firestore.AsyncClient()
    return _fs_client


def _doc_ref(job_id: str):
    return _fs().collection("conversions").document(job_id)


def require_conversion_rate_limit(request: Request) -> None:
    require_rate_limit(
        request, limit=CONVERSION_RATE_LIMIT_PER_MINUTE, scope="conversions"
    )


class CreateRequest(BaseModel):
    title: Optional[str] = None


class CreateResponse(BaseModel):
    job_id: str
    upload_url: str
    upload_method: str = "PUT"
    upload_content_type: str = "application/pdf"


class StartResponse(BaseModel):
    job_id: str
    status: str
    download_url: Optional[str] = None
    polish_status: Optional[str] = None


class StatusResponse(BaseModel):
    job_id: str
    status: str
    title: Optional[str] = None
    download_url: Optional[str] = None
    error: Optional[str] = None
    polish_status: Optional[str] = None


@router.post("", response_model=CreateResponse)
async def create(
    payload: CreateRequest,
    _: None = Depends(require_conversion_rate_limit),
) -> CreateResponse:
    job_id = uuid.uuid4().hex
    input_object = f"input/{job_id}.pdf"
    upload_url = storage_utils.signed_upload_url(
        input_object, content_type="application/pdf"
    )
    await _doc_ref(job_id).set(
        {
            "status": "awaiting_upload",
            "title": payload.title or "Document",
            "input_object": input_object,
            "created_at": firestore.SERVER_TIMESTAMP,
        }
    )
    return CreateResponse(job_id=job_id, upload_url=upload_url)


@router.post("/{job_id}/start", response_model=StartResponse)
async def start(
    job_id: str,
    _: None = Depends(require_conversion_rate_limit),
) -> StartResponse:
    doc = await _doc_ref(job_id).get()
    if not doc.exists:
        raise HTTPException(status_code=404, detail="job not found")
    job = doc.to_dict() or {}
    status_now = job.get("status")

    # Idempotent: if the job already completed, return the existing result
    # instead of re-running the worker.
    if status_now == "done":
        output_object = job.get("output_object")
        download_url = (
            storage_utils.signed_download_url(output_object)
            if output_object
            else None
        )
        return StartResponse(
            job_id=job_id,
            status="done",
            download_url=download_url,
            polish_status=job.get("polish_status"),
        )

    # Anything other than awaiting_upload (e.g. queued/running/error) means a
    # /start was already issued. Force the client to create a new conversion.
    if status_now != "awaiting_upload":
        raise HTTPException(
            status_code=409,
            detail=f"job is in state {status_now!r}; create a new conversion",
        )

    input_object = job.get("input_object")
    if not input_object or not storage_utils.blob_exists(input_object):
        raise HTTPException(
            status_code=400, detail="upload not found in storage"
        )

    await _doc_ref(job_id).update({"status": "queued"})
    try:
        await worker_client.invoke_convert(job_id)
    except Exception as exc:
        await _doc_ref(job_id).update(
            {"status": "error", "error": str(exc)[:500]}
        )
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    final = (await _doc_ref(job_id).get()).to_dict() or {}
    output_object = final.get("output_object")
    download_url = (
        storage_utils.signed_download_url(output_object) if output_object else None
    )
    return StartResponse(
        job_id=job_id,
        status=final.get("status", "unknown"),
        download_url=download_url,
        polish_status=final.get("polish_status"),
    )


@router.get("/{job_id}", response_model=StatusResponse)
async def status(
    job_id: str,
    _: None = Depends(require_conversion_rate_limit),
) -> StatusResponse:
    doc = await _doc_ref(job_id).get()
    if not doc.exists:
        raise HTTPException(status_code=404, detail="job not found")
    job = doc.to_dict() or {}
    output_object = job.get("output_object")
    download_url = (
        storage_utils.signed_download_url(output_object) if output_object else None
    )
    return StatusResponse(
        job_id=job_id,
        status=job.get("status", "unknown"),
        title=job.get("title"),
        download_url=download_url,
        error=job.get("error"),
        polish_status=job.get("polish_status"),
    )
