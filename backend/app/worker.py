from __future__ import annotations

import json
import logging
import signal
import threading
import uuid
from datetime import UTC, datetime, timedelta
from pathlib import Path

from .db import connect, tx
from .extraction import process_photo_receipt
from .storage import cleanup_orphans
from .utils import utc_now

LOGGER = logging.getLogger(__name__)


def _parse_time(value: str) -> datetime:
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def _backoff(settings, attempt: int) -> int:
    values = [int(item.strip()) for item in settings.job_retry_delays_s.split(",") if item.strip()]
    return values[min(max(attempt - 1, 0), len(values) - 1)] if values else 10


class JobQueue:
    def __init__(self, settings):
        self.settings = settings

    def claim(self, worker_id: str | None = None):
        worker_id = worker_id or uuid.uuid4().hex
        now = utc_now()
        lease = (datetime.now(UTC) + timedelta(seconds=self.settings.job_lease_s)).isoformat()
        connection = connect(self.settings.database_path)
        try:
            with tx(connection, write=True):
                job = connection.execute(
                    "UPDATE jobs SET status = 'running', lease_until = ?, worker_id = ?, attempts = attempts + 1, updated_at = ? "
                    "WHERE id = (SELECT id FROM jobs WHERE status = 'queued' AND available_at <= ? ORDER BY available_at, id LIMIT 1) "
                    "RETURNING *",
                    (lease, worker_id, now, now),
                ).fetchone()
            return job
        finally:
            connection.close()

    def heartbeat(self, worker_id: str, metadata: dict | None = None) -> None:
        connection = connect(self.settings.database_path)
        try:
            with tx(connection, write=True):
                connection.execute(
                    "INSERT INTO worker_heartbeat(worker_id, seen_at, metadata) VALUES (?, ?, ?) "
                    "ON CONFLICT(worker_id) DO UPDATE SET seen_at = excluded.seen_at, metadata = excluded.metadata",
                    (worker_id, utc_now(), json.dumps(metadata or {})),
                )
        finally:
            connection.close()

    def extend_lease(self, job_id: str, worker_id: str) -> bool:
        lease = (datetime.now(UTC) + timedelta(seconds=self.settings.job_lease_s)).isoformat()
        connection = connect(self.settings.database_path)
        try:
            with tx(connection, write=True):
                return (
                    connection.execute(
                        "UPDATE jobs SET lease_until = ?, updated_at = ? WHERE id = ? AND worker_id = ? AND status = 'running'",
                        (lease, utc_now(), job_id, worker_id),
                    ).rowcount
                    == 1
                )
        finally:
            connection.close()

    def sweep(self) -> dict[str, int]:
        now = utc_now()
        queued = dead = timed_out = 0
        connection = connect(self.settings.database_path)
        try:
            with tx(connection, write=True):
                expired = connection.execute(
                    "SELECT * FROM jobs WHERE status = 'running' AND lease_until IS NOT NULL AND lease_until <= ?",
                    (now,),
                ).fetchall()
                for job in expired:
                    if job["attempts"] >= self.settings.job_max_attempts:
                        connection.execute(
                            "UPDATE jobs SET status = 'dead', last_error = ?, updated_at = ? WHERE id = ?",
                            ("lease expired; attempts exhausted", now, job["id"]),
                        )
                        self._fail_receipt(connection, job["receipt_id"], "EXTRACTION_FAILED")
                        dead += 1
                    else:
                        available = (
                            datetime.now(UTC)
                            + timedelta(seconds=_backoff(self.settings, job["attempts"]))
                        ).isoformat()
                        connection.execute(
                            "UPDATE jobs SET status = 'queued', available_at = ?, lease_until = NULL, worker_id = NULL, last_error = ?, updated_at = ? WHERE id = ?",
                            (available, "lease expired", now, job["id"]),
                        )
                        queued += 1
                hanging = connection.execute(
                    "SELECT r.id FROM receipts r WHERE r.status = 'processing' AND r.deleted_at IS NULL "
                    "AND r.updated_at <= datetime(?, '-10 minutes') AND NOT EXISTS "
                    "(SELECT 1 FROM jobs j WHERE j.receipt_id = r.id AND j.status IN ('queued', 'running'))",
                    (now,),
                ).fetchall()
                for receipt in hanging:
                    self._fail_receipt(connection, receipt["id"], "PROCESSING_TIMEOUT")
                    timed_out += 1
        finally:
            connection.close()
        return {"requeued": queued, "dead": dead, "timed_out": timed_out}

    @staticmethod
    def _fail_receipt(connection, receipt_id: str | None, issue: str) -> None:
        if not receipt_id:
            return
        row = connection.execute(
            "SELECT issues FROM receipts WHERE id = ?", (receipt_id,)
        ).fetchone()
        if not row:
            return
        issues = json.loads(row["issues"] or "[]")
        if issue not in issues:
            issues.append(issue)
        connection.execute(
            "UPDATE receipts SET status = 'failed', issues = ?, updated_at = ? WHERE id = ? AND status = 'processing'",
            (json.dumps(issues), utc_now(), receipt_id),
        )


class Worker:
    def __init__(self, settings, worker_id: str | None = None):
        self.settings = settings
        self.worker_id = worker_id or f"worker-{uuid.uuid4().hex}"
        self.queue = JobQueue(settings)
        self.stop_event = threading.Event()

    def run_once(self) -> bool:
        self.queue.heartbeat(self.worker_id)
        job = self.queue.claim(self.worker_id)
        if not job:
            return False
        try:
            if job["kind"] == "extract_receipt":
                process_photo_receipt(
                    self.settings.database_path, self.settings.storage_dir, job["receipt_id"]
                )
            else:
                raise ValueError(f"unsupported job kind: {job['kind']}")
        except Exception as error:  # Job failures are persisted before the worker continues.
            LOGGER.exception("job failed: %s", job["id"])
            connection = connect(self.settings.database_path)
            try:
                with tx(connection, write=True):
                    if job["attempts"] >= self.settings.job_max_attempts:
                        connection.execute(
                            "UPDATE jobs SET status = 'dead', last_error = ?, updated_at = ? WHERE id = ?",
                            (str(error), utc_now(), job["id"]),
                        )
                        self.queue._fail_receipt(connection, job["receipt_id"], "EXTRACTION_FAILED")
                    else:
                        available = (
                            datetime.now(UTC)
                            + timedelta(seconds=_backoff(self.settings, job["attempts"]))
                        ).isoformat()
                        connection.execute(
                            "UPDATE jobs SET status = 'queued', available_at = ?, lease_until = NULL, worker_id = NULL, last_error = ?, updated_at = ? WHERE id = ?",
                            (available, str(error), utc_now(), job["id"]),
                        )
            finally:
                connection.close()
        return True

    def run_forever(self) -> None:
        def stop(_signum, _frame):
            self.stop_event.set()

        for signum in (signal.SIGINT, signal.SIGTERM):
            signal.signal(signum, stop)
        while not self.stop_event.is_set():
            self.queue.sweep()
            if not self.run_once():
                self.stop_event.wait(self.settings.worker_cycle_s)


def cleanup(settings, *, dry_run: bool = False) -> dict[str, int]:
    connection = connect(settings.database_path)
    try:
        if dry_run:
            expired_sessions = connection.execute(
                "SELECT COUNT(*) FROM sessions WHERE expires_at <= ?", (utc_now(),)
            ).fetchone()[0]
            old_keys = connection.execute(
                "SELECT COUNT(*) FROM idempotency_keys WHERE created_at <= datetime(?, '-7 days')",
                (utc_now(),),
            ).fetchone()[0]
            old_runs = connection.execute(
                "SELECT COUNT(*) FROM extraction_runs WHERE created_at <= datetime(?, '-90 days')",
                (utc_now(),),
            ).fetchone()[0]
        else:
            with tx(connection, write=True):
                expired_sessions = connection.execute(
                    "DELETE FROM sessions WHERE expires_at <= ?", (utc_now(),)
                ).rowcount
                old_keys = connection.execute(
                    "DELETE FROM idempotency_keys WHERE created_at <= datetime(?, '-7 days')",
                    (utc_now(),),
                ).rowcount
                old_runs = connection.execute(
                    "UPDATE extraction_runs SET ocr_lines = NULL, llm_output = NULL WHERE created_at <= datetime(?, '-90 days')",
                    (utc_now(),),
                ).rowcount
    finally:
        connection.close()
    orphaned = cleanup_orphans(settings.storage_dir, settings.database_path, dry_run=dry_run)
    purged = purge_deleted(settings, dry_run=dry_run)
    return {
        "expired_sessions": expired_sessions,
        "old_idempotency_keys": old_keys,
        "compacted_runs": old_runs,
        "orphan_files": len(orphaned),
        "purged_receipts": purged,
    }


def purge_deleted(settings, *, dry_run: bool = False) -> int:
    cutoff = (datetime.now(UTC) - timedelta(days=settings.soft_delete_days)).isoformat()
    connection = connect(settings.database_path)
    try:
        rows = connection.execute(
            "SELECT id FROM receipts WHERE deleted_at IS NOT NULL AND deleted_at <= ?", (cutoff,)
        ).fetchall()
        if not dry_run and rows:
            with tx(connection, write=True):
                connection.executemany(
                    "DELETE FROM receipts WHERE id = ?", [(row["id"],) for row in rows]
                )
        for row in rows:
            receipt_dir = Path(settings.storage_dir) / "receipts" / row["id"]
            if not dry_run and receipt_dir.exists():
                for path in sorted(receipt_dir.rglob("*"), reverse=True):
                    if path.is_file():
                        path.unlink(missing_ok=True)
                    elif path.is_dir():
                        path.rmdir()
                receipt_dir.rmdir()
        return len(rows)
    finally:
        connection.close()
