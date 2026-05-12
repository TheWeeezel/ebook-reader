"""Tests for the worker pipeline's polish logic.

The docling conversion path is not exercised here — it requires real model
weights and a real PDF. Live end-to-end testing against the deployed worker
covers that.
"""
import httpx
import pytest
import respx

from worker_app.pipeline import _polish_markdown, _safe_title

ANTHROPIC_URL = "https://api.anthropic.com/v1/messages"


def test_safe_title_strips_controls_and_collapses_whitespace() -> None:
    assert _safe_title("Hello\n\nWorld") == "Hello World"
    assert _safe_title("Tabs\there") == "Tabs here"
    assert _safe_title("with\x00null") == "with null"


def test_safe_title_handles_none_and_non_str() -> None:
    assert _safe_title(None) == "Document"
    assert _safe_title("") == "Document"
    assert _safe_title("   ") == "Document"
    assert _safe_title(123) == "123"


def test_safe_title_caps_length() -> None:
    long = "a" * 500
    assert len(_safe_title(long)) == 200


@respx.mock
@pytest.mark.asyncio
async def test_polish_happy_path() -> None:
    respx.post(ANTHROPIC_URL).mock(
        return_value=httpx.Response(
            200, json={"content": [{"type": "text", "text": "polished output"}]}
        )
    )
    polished, status = await _polish_markdown("# Hello\n\nworld", "Test Book")
    assert status == "polished"
    assert polished == "polished output"


@respx.mock
@pytest.mark.asyncio
async def test_polish_falls_back_to_unpolished_on_anthropic_error() -> None:
    respx.post(ANTHROPIC_URL).mock(
        return_value=httpx.Response(
            500, json={"error": {"message": "boom"}}
        )
    )
    original = "original markdown"
    polished, status = await _polish_markdown(original, "Test")
    assert status == "skipped_error"
    assert polished == original


@respx.mock
@pytest.mark.asyncio
async def test_polish_partial_on_oversized_input() -> None:
    respx.post(ANTHROPIC_URL).mock(
        return_value=httpx.Response(
            200, json={"content": [{"type": "text", "text": "polished head"}]}
        )
    )
    huge = "x" * 200_000  # Greater than POLISH_MAX_INPUT_CHARS (150_000).
    polished, status = await _polish_markdown(huge, "Big")
    assert status == "polished_partial"
    assert polished.startswith("polished head")
    # The tail (chars after POLISH_MAX_INPUT_CHARS) is appended verbatim.
    assert polished.endswith("x" * 1000)


@respx.mock
@pytest.mark.asyncio
async def test_polish_partial_falls_back_when_head_fails() -> None:
    respx.post(ANTHROPIC_URL).mock(
        return_value=httpx.Response(500, json={"error": {"message": "boom"}})
    )
    huge = "x" * 200_000
    polished, status = await _polish_markdown(huge, "Big")
    assert status == "skipped_error"
    assert polished == huge


@respx.mock
@pytest.mark.asyncio
async def test_polish_sends_expected_request_shape() -> None:
    route = respx.post(ANTHROPIC_URL).mock(
        return_value=httpx.Response(
            200, json={"content": [{"type": "text", "text": "ok"}]}
        )
    )
    await _polish_markdown("body text", "Some Title")

    assert route.called
    sent = route.calls[0].request
    assert sent.headers["x-api-key"] == "test-anthropic-key"
    assert sent.headers["anthropic-version"] == "2023-06-01"
    body = sent.read().decode()
    assert "Some Title" in body
    assert "body text" in body
    assert "claude-sonnet-4-6" in body
