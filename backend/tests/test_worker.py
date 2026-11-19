from datetime import UTC, datetime, timedelta

from app.config import Settings
from app.db import connect, migrate
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
