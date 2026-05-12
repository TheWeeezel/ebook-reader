import os

import httpx
from fastapi import Depends, FastAPI, HTTPException, Request
from pydantic import BaseModel, Field

from .conversions import router as conversions_router
from .rate_limit import require_rate_limit

ANTHROPIC_API_KEY = os.environ["ANTHROPIC_API_KEY"].strip()
ANTHROPIC_MODEL = os.environ.get("ANTHROPIC_MODEL", "claude-sonnet-4-6")
MAX_INPUT_CHARS = int(os.environ.get("MAX_INPUT_CHARS", 500_000))
MAX_TOKENS = int(os.environ.get("MAX_TOKENS", 4096))
AI_RATE_LIMIT_PER_MINUTE = int(os.environ.get("AI_RATE_LIMIT_PER_MINUTE", "20"))

app = FastAPI(title="SmartReader Backend")
app.include_router(conversions_router)


class AnalyzeRequest(BaseModel):
    text: str
    instruction: str
    book_title: str = Field(alias="bookTitle")

    model_config = {"populate_by_name": True}


class AnalyzeResponse(BaseModel):
    text: str


def require_ai_rate_limit(request: Request) -> None:
    require_rate_limit(request, limit=AI_RATE_LIMIT_PER_MINUTE, scope="ai")


@app.get("/health")
async def health() -> dict:
    return {"status": "ok"}


@app.post("/ai/analyze", response_model=AnalyzeResponse)
async def analyze(
    payload: AnalyzeRequest,
    _: None = Depends(require_ai_rate_limit),
) -> AnalyzeResponse:
    instruction = payload.instruction.strip()
    if not instruction:
        raise HTTPException(status_code=400, detail="instruction is required")

    text = payload.text
    if len(text) > MAX_INPUT_CHARS:
        text = text[:MAX_INPUT_CHARS] + "\n\n[Text wurde gekuerzt]"

    prompt = (
        f'Here is the content of a document titled "{payload.book_title}":\n\n'
        f"<document>\n{text}\n</document>\n\n"
        f"Please follow this instruction regarding the document:\n\n{instruction}"
    )

    async with httpx.AsyncClient(timeout=120.0) as client:
        resp = await client.post(
            "https://api.anthropic.com/v1/messages",
            headers={
                "x-api-key": ANTHROPIC_API_KEY,
                "anthropic-version": "2023-06-01",
                "content-type": "application/json",
            },
            json={
                "model": ANTHROPIC_MODEL,
                "max_tokens": MAX_TOKENS,
                "messages": [{"role": "user", "content": prompt}],
            },
        )

    if resp.status_code >= 400:
        detail = "anthropic error"
        try:
            detail = resp.json().get("error", {}).get("message", detail)
        except Exception:
            pass
        raise HTTPException(status_code=502, detail=detail)

    data = resp.json()
    blocks = data.get("content") or []
    text_block = next((b.get("text") for b in blocks if b.get("type") == "text"), None)
    if not text_block:
        raise HTTPException(status_code=502, detail="empty response from anthropic")

    return AnalyzeResponse(text=text_block)
