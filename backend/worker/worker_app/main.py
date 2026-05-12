import logging

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

from .pipeline import run_conversion

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)
log = logging.getLogger("worker")

app = FastAPI(title="SmartReader Worker")


class ConvertRequest(BaseModel):
    job_id: str


@app.get("/healthz")
async def healthz() -> dict:
    return {"status": "ok"}


@app.post("/convert")
async def convert(payload: ConvertRequest) -> dict:
    log.info("convert: job_id=%s", payload.job_id)
    try:
        await run_conversion(payload.job_id)
        return {"status": "completed", "job_id": payload.job_id}
    except Exception as exc:
        log.exception("conversion failed: job_id=%s", payload.job_id)
        raise HTTPException(status_code=500, detail=str(exc)) from exc
