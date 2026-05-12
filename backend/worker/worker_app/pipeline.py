import logging
import os
import re
import subprocess
import tempfile
from pathlib import Path

import httpx
from google.cloud import firestore, storage

GCS_BUCKET = os.environ["GCS_BUCKET"]
ANTHROPIC_API_KEY = os.environ["ANTHROPIC_API_KEY"].strip()
ANTHROPIC_MODEL = os.environ.get("ANTHROPIC_MODEL", "claude-sonnet-4-6")
POLISH_MAX_INPUT_CHARS = int(os.environ.get("POLISH_MAX_INPUT_CHARS", 150_000))
POLISH_MAX_TOKENS = int(os.environ.get("POLISH_MAX_TOKENS", 16384))

log = logging.getLogger("worker.pipeline")

_CONVERTER = None


def _get_converter():
    """Lazy-init the docling converter (~30 s first call, then cached)."""
    global _CONVERTER
    if _CONVERTER is None:
        from docling.document_converter import DocumentConverter

        log.info("loading docling converter")
        _CONVERTER = DocumentConverter()
        log.info("docling ready")
    return _CONVERTER


async def run_conversion(job_id: str) -> None:
    fs = firestore.AsyncClient()
    doc_ref = fs.collection("conversions").document(job_id)
    snapshot = await doc_ref.get()
    if not snapshot.exists:
        raise RuntimeError(f"job {job_id} not found")
    job = snapshot.to_dict() or {}
    pdf_object = job.get("input_object")
    if not pdf_object:
        raise RuntimeError(f"job {job_id} missing input_object")

    title = _safe_title(job.get("title"))

    await doc_ref.update(
        {"status": "running", "started_at": firestore.SERVER_TIMESTAMP}
    )

    storage_client = storage.Client()
    bucket = storage_client.bucket(GCS_BUCKET)

    with tempfile.TemporaryDirectory() as tmpdir:
        tmp = Path(tmpdir)
        pdf_path = tmp / "input.pdf"
        md_path = tmp / "doc.md"
        epub_path = tmp / "output.epub"

        bucket.blob(pdf_object).download_to_filename(str(pdf_path))
        log.info(
            "downloaded %s (%d bytes)", pdf_object, pdf_path.stat().st_size
        )

        markdown = _run_docling(pdf_path)
        log.info("docling output: %d chars", len(markdown))

        polished, polish_status = await _polish_markdown(markdown, title)
        log.info("polish status: %s (%d chars)", polish_status, len(polished))

        md_path.write_text(polished, encoding="utf-8")

        subprocess.run(
            [
                "pandoc",
                str(md_path),
                "-o",
                str(epub_path),
                "--metadata",
                f"title={title}",
                "--toc",
                "--toc-depth=2",
            ],
            check=True,
            cwd=tmpdir,
            capture_output=True,
        )
        log.info("pandoc output: %d bytes", epub_path.stat().st_size)

        output_object = f"output/{job_id}.epub"
        out_blob = bucket.blob(output_object)
        out_blob.upload_from_filename(
            str(epub_path), content_type="application/epub+zip"
        )
        log.info("uploaded %s", output_object)

    await doc_ref.update(
        {
            "status": "done",
            "output_object": output_object,
            "polish_status": polish_status,
            "completed_at": firestore.SERVER_TIMESTAMP,
        }
    )


def _safe_title(raw: object) -> str:
    """Strip control characters, collapse whitespace, cap length.

    Pandoc reads --metadata title=... as a single token thanks to argv (no
    shell injection), but a title with embedded newlines or NULs produces a
    malformed EPUB. Sanitize defensively.
    """
    if not isinstance(raw, str):
        raw = "" if raw is None else str(raw)
    cleaned = re.sub(r"[\x00-\x1f\x7f]+", " ", raw)
    cleaned = re.sub(r"\s+", " ", cleaned).strip()
    return cleaned[:200] or "Document"


def _run_docling(pdf_path: Path) -> str:
    """Run docling on a PDF and return markdown."""
    converter = _get_converter()
    result = converter.convert(str(pdf_path))
    return result.document.export_to_markdown()


async def _polish_markdown(markdown: str, title: str) -> tuple[str, str]:
    """Polish markdown via Claude. Returns (text, status_flag).

    Status flag is one of: "polished", "polished_partial", "skipped_error".
    On any failure we fall back to unpolished markdown so the user still
    gets an EPUB.
    """
    if len(markdown) > POLISH_MAX_INPUT_CHARS:
        log.warning(
            "markdown too large to polish (%d > %d); polishing prefix only",
            len(markdown),
            POLISH_MAX_INPUT_CHARS,
        )
        head = markdown[:POLISH_MAX_INPUT_CHARS]
        tail = markdown[POLISH_MAX_INPUT_CHARS:]
        try:
            polished_head = await _call_claude_polish(head, title)
        except Exception:
            log.exception("polish call failed; returning unpolished markdown")
            return markdown, "skipped_error"
        return polished_head + "\n\n" + tail, "polished_partial"

    try:
        polished = await _call_claude_polish(markdown, title)
    except Exception:
        log.exception("polish call failed; returning unpolished markdown")
        return markdown, "skipped_error"
    return polished, "polished"


async def _call_claude_polish(markdown: str, title: str) -> str:
    prompt = (
        "You are cleaning up automated PDF-to-markdown extraction for an "
        "e-reader. Return ONLY the cleaned markdown, with no preamble, no "
        "commentary, and no surrounding code fences.\n\n"
        "Rules:\n"
        "- Preserve all substantive content. Do NOT summarize or shorten.\n"
        "- Fix obvious OCR errors (rn → m, l1 → ll, etc.).\n"
        "- Promote section labels to proper markdown headings (#, ##, ###).\n"
        "- Remove repeated page-header/footer artifacts and standalone page "
        "numbers.\n"
        "- Keep paragraphs intact; do not insert hard line breaks mid-sentence.\n"
        "- Preserve image references exactly as written if any.\n"
        "- Preserve lists, tables, code blocks, and math.\n\n"
        f'Document title: "{title}"\n\n---\n\n{markdown}'
    )

    async with httpx.AsyncClient(timeout=600.0) as client:
        resp = await client.post(
            "https://api.anthropic.com/v1/messages",
            headers={
                "x-api-key": ANTHROPIC_API_KEY,
                "anthropic-version": "2023-06-01",
                "content-type": "application/json",
            },
            json={
                "model": ANTHROPIC_MODEL,
                "max_tokens": POLISH_MAX_TOKENS,
                "messages": [{"role": "user", "content": prompt}],
            },
        )

    if resp.status_code >= 400:
        raise RuntimeError(
            f"anthropic polish error {resp.status_code}: {resp.text[:200]}"
        )

    data = resp.json()
    for block in data.get("content", []):
        if block.get("type") == "text":
            return block["text"]
    raise RuntimeError("empty response from claude polish")
