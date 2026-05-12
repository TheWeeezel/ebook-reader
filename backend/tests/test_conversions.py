"""Tests for the conversion endpoints in app/conversions.py.

Uses an in-memory Firestore fake + monkey-patched storage and worker clients so
the suite is fully offline. Verifies state transitions and error mapping for
all three conversion endpoints.
"""
from __future__ import annotations

from typing import Any

import pytest
from fastapi.testclient import TestClient

from app import conversions, storage_utils, worker_client
from app.main import app

# ---------------------------------------------------------------------------
# Fake Firestore implementation
# ---------------------------------------------------------------------------


class _Sentinel:
    """Placeholder used in place of firestore.SERVER_TIMESTAMP in fakes."""

    def __repr__(self) -> str:
        return "<server_timestamp>"


def _is_sentinel(value: Any) -> bool:
    cls = type(value).__name__
    return "Sentinel" in cls or cls in {"_ServerTimestamp", "SentinelDict"}


class FakeSnapshot:
    def __init__(self, data: dict | None) -> None:
        self._data = data

    @property
    def exists(self) -> bool:
        return self._data is not None

    def to_dict(self) -> dict | None:
        return dict(self._data) if self._data is not None else None


class FakeDocRef:
    def __init__(self, store: dict, key: tuple) -> None:
        self._store = store
        self._key = key

    @staticmethod
    def _clean(data: dict) -> dict:
        return {
            k: (_Sentinel() if _is_sentinel(v) else v) for k, v in data.items()
        }

    async def set(self, data: dict) -> None:
        self._store[self._key] = self._clean(data)

    async def update(self, data: dict) -> None:
        existing = self._store.setdefault(self._key, {})
        existing.update(self._clean(data))

    async def get(self) -> FakeSnapshot:
        return FakeSnapshot(self._store.get(self._key))


class FakeCollection:
    def __init__(self, store: dict, name: str) -> None:
        self._store = store
        self._name = name

    def document(self, doc_id: str) -> FakeDocRef:
        return FakeDocRef(self._store, (self._name, doc_id))


class FakeFirestore:
    def __init__(self) -> None:
        self.store: dict = {}

    def collection(self, name: str) -> FakeCollection:
        return FakeCollection(self.store, name)


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
def fake_fs(monkeypatch: pytest.MonkeyPatch) -> FakeFirestore:
    fs = FakeFirestore()
    monkeypatch.setattr(conversions, "_fs_client", fs)
    return fs


@pytest.fixture
def fake_storage(monkeypatch: pytest.MonkeyPatch) -> dict:
    state = {"uploaded": set(), "exists_default": True}

    def upload_url(object_name: str, content_type: str) -> str:
        return f"https://fake.example/upload/{object_name}?ct={content_type}"

    def download_url(object_name: str) -> str:
        return f"https://fake.example/download/{object_name}"

    def exists(object_name: str) -> bool:
        if object_name in state["uploaded"]:
            return True
        return state["exists_default"]

    monkeypatch.setattr(storage_utils, "signed_upload_url", upload_url)
    monkeypatch.setattr(storage_utils, "signed_download_url", download_url)
    monkeypatch.setattr(storage_utils, "blob_exists", exists)
    return state


@pytest.fixture
def fake_worker_ok(monkeypatch: pytest.MonkeyPatch, fake_fs: FakeFirestore) -> list:
    """Worker that simulates successful conversion (writes output to Firestore)."""
    calls: list[str] = []

    async def invoke(job_id: str) -> dict:
        calls.append(job_id)
        # Simulate the worker writing the done state to Firestore.
        await conversions._fs().collection("conversions").document(job_id).update(
            {
                "status": "done",
                "output_object": f"output/{job_id}.epub",
                "polish_status": "polished",
            }
        )
        return {"status": "completed", "job_id": job_id}

    monkeypatch.setattr(worker_client, "invoke_convert", invoke)
    return calls


@pytest.fixture
def fake_worker_fail(monkeypatch: pytest.MonkeyPatch) -> None:
    async def invoke(job_id: str) -> dict:
        raise RuntimeError("worker exploded")

    monkeypatch.setattr(worker_client, "invoke_convert", invoke)


@pytest.fixture
def client() -> TestClient:
    return TestClient(app)


# ---------------------------------------------------------------------------
# Happy path
# ---------------------------------------------------------------------------


def test_create_returns_job_and_upload_url(
    client: TestClient, fake_fs: FakeFirestore, fake_storage: dict
) -> None:
    r = client.post("/conversions", json={"title": "My Book"})
    assert r.status_code == 200
    body = r.json()
    assert body["job_id"]
    assert body["upload_url"].startswith("https://fake.example/upload/input/")
    assert body["upload_method"] == "PUT"
    assert body["upload_content_type"] == "application/pdf"

    # Doc must have been written.
    job_id = body["job_id"]
    stored = fake_fs.store[("conversions", job_id)]
    assert stored["title"] == "My Book"
    assert stored["status"] == "awaiting_upload"
    assert stored["input_object"] == f"input/{job_id}.pdf"


def test_create_falls_back_to_default_title(
    client: TestClient, fake_fs: FakeFirestore, fake_storage: dict
) -> None:
    r = client.post("/conversions", json={})
    assert r.status_code == 200
    job_id = r.json()["job_id"]
    assert fake_fs.store[("conversions", job_id)]["title"] == "Document"


def test_start_invokes_worker_and_returns_download_url(
    client: TestClient,
    fake_fs: FakeFirestore,
    fake_storage: dict,
    fake_worker_ok: list,
) -> None:
    create = client.post("/conversions", json={"title": "Book"})
    job_id = create.json()["job_id"]

    r = client.post(f"/conversions/{job_id}/start")
    assert r.status_code == 200
    body = r.json()
    assert body["job_id"] == job_id
    assert body["status"] == "done"
    assert body["download_url"] == f"https://fake.example/download/output/{job_id}.epub"
    assert body["polish_status"] == "polished"

    assert fake_worker_ok == [job_id]
    assert fake_fs.store[("conversions", job_id)]["status"] == "done"


def test_status_returns_record(
    client: TestClient,
    fake_fs: FakeFirestore,
    fake_storage: dict,
    fake_worker_ok: list,
) -> None:
    create = client.post("/conversions", json={"title": "Book"})
    job_id = create.json()["job_id"]
    client.post(f"/conversions/{job_id}/start")

    r = client.get(f"/conversions/{job_id}")
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "done"
    assert body["title"] == "Book"
    assert body["polish_status"] == "polished"
    assert body["download_url"] == f"https://fake.example/download/output/{job_id}.epub"


# ---------------------------------------------------------------------------
# Error / edge cases
# ---------------------------------------------------------------------------


def test_start_returns_404_for_unknown_job(
    client: TestClient, fake_fs: FakeFirestore, fake_storage: dict
) -> None:
    r = client.post("/conversions/nonexistent/start")
    assert r.status_code == 404


def test_start_returns_400_when_upload_missing(
    client: TestClient, fake_fs: FakeFirestore, fake_storage: dict
) -> None:
    # Mark all objects as missing in storage.
    fake_storage["exists_default"] = False

    create = client.post("/conversions", json={"title": "Book"})
    job_id = create.json()["job_id"]
    r = client.post(f"/conversions/{job_id}/start")
    assert r.status_code == 400
    assert "upload" in r.json()["detail"].lower()


def test_start_marks_job_error_when_worker_fails(
    client: TestClient,
    fake_fs: FakeFirestore,
    fake_storage: dict,
    fake_worker_fail: None,
) -> None:
    create = client.post("/conversions", json={"title": "Book"})
    job_id = create.json()["job_id"]
    r = client.post(f"/conversions/{job_id}/start")
    assert r.status_code == 502
    assert "worker exploded" in r.json()["detail"]

    # Doc state should have been updated to error with the message.
    stored = fake_fs.store[("conversions", job_id)]
    assert stored["status"] == "error"
    assert "worker exploded" in stored["error"]


def test_status_returns_404_for_unknown_job(
    client: TestClient, fake_fs: FakeFirestore
) -> None:
    r = client.get("/conversions/nonexistent")
    assert r.status_code == 404


def test_status_omits_download_url_before_done(
    client: TestClient, fake_fs: FakeFirestore, fake_storage: dict
) -> None:
    create = client.post("/conversions", json={"title": "Book"})
    job_id = create.json()["job_id"]

    r = client.get(f"/conversions/{job_id}")
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "awaiting_upload"
    assert body["download_url"] is None


def test_start_is_idempotent_when_already_done(
    client: TestClient,
    fake_fs: FakeFirestore,
    fake_storage: dict,
    fake_worker_ok: list,
) -> None:
    create = client.post("/conversions", json={"title": "Book"})
    job_id = create.json()["job_id"]
    first = client.post(f"/conversions/{job_id}/start")
    assert first.status_code == 200
    assert first.json()["status"] == "done"

    # A second /start on the same job should return the existing result, NOT
    # re-invoke the worker.
    second = client.post(f"/conversions/{job_id}/start")
    assert second.status_code == 200
    assert second.json()["status"] == "done"
    assert second.json()["download_url"] == first.json()["download_url"]
    # Worker invoked exactly once across both calls.
    assert fake_worker_ok == [job_id]


def test_start_rejects_when_already_in_progress(
    client: TestClient, fake_fs: FakeFirestore, fake_storage: dict
) -> None:
    create = client.post("/conversions", json={"title": "Book"})
    job_id = create.json()["job_id"]
    # Manually force status into a non-awaiting state.
    fake_fs.store[("conversions", job_id)]["status"] = "running"

    r = client.post(f"/conversions/{job_id}/start")
    assert r.status_code == 409
    assert "running" in r.json()["detail"]
