from __future__ import annotations

import json
from pathlib import Path

from .db import connect, tx
from .ocr import FakeOcrEngine, OcrEngine, grouped_rows
from .receipt_parser import parse_rule_candidate
from .utils import new_id, utc_now


def process_photo_receipt(
    database_path, storage_dir, receipt_id: str, engine: OcrEngine | None = None
) -> dict:
    """Run the deterministic S2-S4 pipeline for one queued photo receipt.

    The worker can call this function later; it deliberately has no HTTP or Flask dependency.
    """
    connection = connect(database_path)
    try:
        receipt = connection.execute(
            "SELECT * FROM receipts WHERE id = ? AND source = 'photo'", (receipt_id,)
        ).fetchone()
        image = connection.execute(
            "SELECT processed_path FROM receipt_images WHERE receipt_id = ?", (receipt_id,)
        ).fetchone()
        if not receipt or not image:
            raise ValueError("photo receipt not found")
        path = Path(storage_dir) / image["processed_path"]
        ocr = engine or FakeOcrEngine()
        lines = ocr.read(path)
        rows = grouped_rows(lines)
        candidate = parse_rule_candidate(rows, receipt["currency_code"])
        mean_conf = sum(line.score for line in lines) / len(lines) if lines else 0.0
        issues = list(candidate["issues"])
        if mean_conf < 0.80:
            issues.append("LOW_OCR_CONF")
        status = (
            "ready" if candidate["total_minor"] is not None and not issues else "needs_attention"
        )
        now = utc_now()
        with tx(connection, write=True):
            connection.execute(
                "INSERT INTO extraction_runs(id, receipt_id, attempt, pipeline_version, ocr_engine, stage_ms, "
                "mean_ocr_conf, ocr_lines, rule_candidate, validation_result, created_at) VALUES (?, ?, 1, 'phase8', ?, '{}', ?, ?, ?, ?, ?)",
                (
                    new_id(),
                    receipt_id,
                    type(ocr).__name__,
                    mean_conf,
                    json.dumps([line.__dict__ for line in lines]),
                    json.dumps(candidate),
                    json.dumps({"issues": issues}),
                    now,
                ),
            )
            connection.execute(
                "UPDATE receipts SET status = ?, merchant = ?, merchant_norm = ?, total_minor = ?, issues = ?, updated_at = ? WHERE id = ?",
                (
                    status,
                    candidate.get("merchant"),
                    (candidate.get("merchant") or "").casefold(),
                    candidate.get("total_minor"),
                    json.dumps(issues),
                    now,
                    receipt_id,
                ),
            )
            connection.execute(
                "UPDATE jobs SET status = 'succeeded', updated_at = ? WHERE receipt_id = ? AND status IN ('queued', 'running')",
                (now, receipt_id),
            )
        return {
            "receipt_id": receipt_id,
            "status": status,
            "issues": issues,
            "candidate": candidate,
        }
    finally:
        connection.close()
