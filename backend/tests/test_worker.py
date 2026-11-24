import sys
from datetime import UTC, datetime, timedelta
from types import ModuleType

from app.config import Settings
from app.db import connect, migrate
from app.ocr import FakeOcrEngine, PaddleOcrEngine, build_ocr_engine
from app.utils import new_id, utc_now
from app.worker import JobQueue, Worker


def make_settings(tmp_path):
    settings = Settings(
        storage_dir=tmp_path / "storage", database_path=tmp_path / "storage" / "db.sqlite3"
    )
    connection = connect(settings.database_path)
    migrate(connection)
    connection.close()
    return settings


def test_only_one_claimant_gets_a_queued_job(tmp_path):
    settings = make_settings(tmp_path)
    connection = connect(settings.database_path)
    try:
        now = utc_now()
        connection.execute(
            "INSERT INTO jobs(id, kind, status, available_at, created_at, updated_at) VALUES (?, 'cleanup', 'queued', ?, ?, ?)",
            (new_id(), now, now, now),
        )
    finally:
        connection.close()

    queue = JobQueue(settings)
    first = queue.claim("worker-a")
    second = queue.claim("worker-b")

    assert first is not None
    assert first["worker_id"] == "worker-a"
    assert second is None
    assert first["attempts"] == 1


def test_expired_lease_requeues_then_dead_after_max_attempts(tmp_path):
    settings = make_settings(tmp_path)
    settings.job_max_attempts = 2
    connection = connect(settings.database_path)
    try:
        now = utc_now()
        job_id = new_id()
        connection.execute(
            "INSERT INTO jobs(id, kind, status, attempts, available_at, lease_until, worker_id, created_at, updated_at) "
            "VALUES (?, 'cleanup', 'running', 1, ?, ?, 'worker-a', ?, ?)",
            (job_id, now, (datetime.now(UTC) - timedelta(seconds=1)).isoformat(), now, now),
        )
    finally:
        connection.close()

    queue = JobQueue(settings)
    result = queue.sweep()
    assert result["requeued"] == 1
    connection = connect(settings.database_path)
    try:
        assert (
            connection.execute("SELECT status FROM jobs WHERE id = ?", (job_id,)).fetchone()[0]
            == "queued"
        )
    finally:
        connection.close()


def test_worker_unknown_job_retries_then_dead(tmp_path):
    settings = make_settings(tmp_path)
    settings.job_max_attempts = 1
    connection = connect(settings.database_path)
    try:
        now = utc_now()
        job_id = new_id()
        connection.execute(
            "INSERT INTO jobs(id, kind, status, available_at, created_at, updated_at) VALUES (?, 'unknown', 'queued', ?, ?, ?)",
            (job_id, now, now, now),
        )
    finally:
        connection.close()

    assert Worker(settings, "worker-a").run_once() is True
    connection = connect(settings.database_path)
    try:
        assert (
            connection.execute("SELECT status FROM jobs WHERE id = ?", (job_id,)).fetchone()[0]
            == "dead"
        )
    finally:
        connection.close()


def test_build_ocr_engine_uses_configured_provider(tmp_path):
    settings = Settings(
        storage_dir=tmp_path / "storage",
        database_path=tmp_path / "storage" / "db.sqlite3",
        ocr_engine="fake",
    )
    assert isinstance(build_ocr_engine(settings), FakeOcrEngine)

    settings.ocr_engine = "paddle"
    assert isinstance(build_ocr_engine(settings), PaddleOcrEngine)


def test_paddle_engine_disables_mkldnn(monkeypatch):
    observed = {}
    paddleocr = ModuleType("paddleocr")

    def fake_paddle_ocr(**kwargs):
        observed.update(kwargs)
        return object()

    paddleocr.PaddleOCR = fake_paddle_ocr
    monkeypatch.setitem(sys.modules, "paddleocr", paddleocr)

    engine = PaddleOcrEngine(Settings(ocr_device="cpu"))
    engine._load()

    assert observed["enable_mkldnn"] is False


def test_worker_passes_configured_engine_to_receipt_extraction(monkeypatch, tmp_path):
    settings = make_settings(tmp_path)
    settings.ocr_engine = "paddle"
    engine = object()
    observed = {}

    class FakeQueue:
        def heartbeat(self, _worker_id):
            pass

        def claim(self, _worker_id):
            return {
                "id": "job-1",
                "kind": "extract_receipt",
                "receipt_id": "receipt-1",
                "attempts": 1,
            }

    def fake_extract(database_path, storage_dir, receipt_id, *, engine):
        observed.update(
            database_path=database_path, storage_dir=storage_dir, receipt_id=receipt_id, engine=engine
        )

    monkeypatch.setattr("app.worker.build_ocr_engine", lambda _settings: engine)
    monkeypatch.setattr("app.worker.process_photo_receipt", fake_extract)
    worker = Worker(settings, "worker-test")
    worker.queue = FakeQueue()

    assert worker.run_once() is True
    assert observed["engine"] is engine
    assert observed["receipt_id"] == "receipt-1"
