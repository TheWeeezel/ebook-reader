import httpx
import pytest
import respx
from fastapi.testclient import TestClient

from app.main import app

ANTHROPIC_URL = "https://api.anthropic.com/v1/messages"


@pytest.fixture
def client() -> TestClient:
    return TestClient(app)


def test_health(client: TestClient) -> None:
    r = client.get("/health")
    assert r.status_code == 200
    assert r.json() == {"status": "ok"}


def test_analyze_rejects_empty_instruction(client: TestClient) -> None:
    r = client.post(
        "/ai/analyze",
        json={"text": "x", "instruction": "   ", "bookTitle": "z"},
    )
    assert r.status_code == 400


@respx.mock
def test_analyze_forwards_to_anthropic_and_returns_text(client: TestClient) -> None:
    route = respx.post(ANTHROPIC_URL).mock(
        return_value=httpx.Response(
            200,
            json={"content": [{"type": "text", "text": "AI says hello"}]},
        )
    )
    r = client.post(
        "/ai/analyze",
        json={
            "text": "the document body",
            "instruction": "summarize",
            "bookTitle": "Some Book",
        },
    )
    assert r.status_code == 200
    assert r.json() == {"text": "AI says hello"}

    assert route.called
    sent = route.calls[0].request
    assert sent.headers["x-api-key"] == "test-anthropic-key"
    assert sent.headers["anthropic-version"] == "2023-06-01"
    body = sent.read().decode()
    assert "the document body" in body
    assert "summarize" in body
    assert "Some Book" in body
    assert "claude-sonnet-4-6" in body


@respx.mock
def test_analyze_truncates_huge_input(client: TestClient) -> None:
    route = respx.post(ANTHROPIC_URL).mock(
        return_value=httpx.Response(
            200, json={"content": [{"type": "text", "text": "ok"}]}
        )
    )
    huge = "a" * 600_000
    r = client.post(
        "/ai/analyze",
        json={"text": huge, "instruction": "summarize", "bookTitle": "Big"},
    )
    assert r.status_code == 200
    body = route.calls[0].request.read().decode()
    # Truncation marker is inserted after the cap, and the 600k-char body is cut.
    assert "[Text wurde gekuerzt]" in body
    # The prompt should not contain anywhere near 600k characters of payload.
    assert len(body) < 600_000


@respx.mock
def test_analyze_maps_anthropic_error_to_502(client: TestClient) -> None:
    respx.post(ANTHROPIC_URL).mock(
        return_value=httpx.Response(
            500, json={"error": {"message": "anthropic exploded"}}
        )
    )
    r = client.post(
        "/ai/analyze",
        json={"text": "x", "instruction": "y", "bookTitle": "z"},
    )
    assert r.status_code == 502
    assert r.json()["detail"] == "anthropic exploded"


@respx.mock
def test_analyze_maps_empty_response_to_502(client: TestClient) -> None:
    respx.post(ANTHROPIC_URL).mock(
        return_value=httpx.Response(200, json={"content": []})
    )
    r = client.post(
        "/ai/analyze",
        json={"text": "x", "instruction": "y", "bookTitle": "z"},
    )
    assert r.status_code == 502
