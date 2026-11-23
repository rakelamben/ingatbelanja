import io
import json
import uuid

from app import create_app
from app.config import Settings
from app.db import connect, migrate
from app.worker import Worker
from PIL import Image


def make_app(tmp_path):
    settings = Settings(
        storage_dir=tmp_path / "storage", database_path=tmp_path / "storage" / "db.sqlite3"
    )
    connection = connect(settings.database_path)
    migrate(connection)
    connection.close()
    return create_app(settings)


def image_bytes() -> bytes:
    output = io.BytesIO()
    Image.new("RGB", (640, 480), (240, 240, 240)).save(output, format="JPEG", exif=b"")
    return output.getvalue()


def register(app):
    client = app.test_client()
    response = client.post(
        "/api/v1/auth/register", json={"username": "photo", "password": "password-aman"}
    )
    return client, response.json["csrf_token"], response.json["personal_ledger_id"]


def test_photo_upload_writes_safe_variants_and_queues_job(tmp_path):
    app = make_app(tmp_path)
    client, csrf, ledger_id = register(app)
    key = str(uuid.uuid4())
    response = client.post(
        f"/api/v1/ledgers/{ledger_id}/receipts/photo",
        data={"file": (io.BytesIO(image_bytes()), "receipt.jpg"), "note": "test"},
        headers={"Idempotency-Key": key, "X-CSRF-Token": csrf},
        content_type="multipart/form-data",
    )

    assert response.status_code == 202
    assert response.json["status"] == "processing"
    receipt_id = response.json["id"]
    receipt_dir = tmp_path / "storage" / "receipts" / receipt_id
    assert (receipt_dir / "original.jpg").exists()
    assert (receipt_dir / "processed.jpg").exists()
    assert (receipt_dir / "thumb.jpg").exists()
    connection = connect(tmp_path / "storage" / "db.sqlite3")
    try:
        assert (
            connection.execute(
                "SELECT status FROM jobs WHERE receipt_id = ?", (receipt_id,)
            ).fetchone()[0]
            == "queued"
        )
    finally:
        connection.close()


def test_photo_upload_is_idempotent_and_detects_mismatch(tmp_path):
    app = make_app(tmp_path)
    client, csrf, ledger_id = register(app)
    key = str(uuid.uuid4())
    first = client.post(
        f"/api/v1/ledgers/{ledger_id}/receipts/photo",
        data={"file": (io.BytesIO(image_bytes()), "receipt.jpg")},
        headers={"Idempotency-Key": key, "X-CSRF-Token": csrf},
        content_type="multipart/form-data",
    )
    repeated = client.post(
        f"/api/v1/ledgers/{ledger_id}/receipts/photo",
        data={"file": (io.BytesIO(image_bytes()), "receipt.jpg")},
        headers={"Idempotency-Key": key, "X-CSRF-Token": csrf},
        content_type="multipart/form-data",
    )
    different = client.post(
        f"/api/v1/ledgers/{ledger_id}/receipts/photo",
        data={"file": (io.BytesIO(b"not-an-image"), "receipt.jpg")},
        headers={"Idempotency-Key": key, "X-CSRF-Token": csrf},
        content_type="multipart/form-data",
    )

    assert first.status_code == 202
    assert repeated.status_code == 200
    assert repeated.json["id"] == first.json["id"]
    assert different.status_code == 422
    assert different.json["code"] == "IDEMPOTENCY_MISMATCH"


def test_photo_upload_rejects_small_or_invalid_image(tmp_path):
    app = make_app(tmp_path)
    client, csrf, ledger_id = register(app)
    output = io.BytesIO()
    Image.new("RGB", (100, 100), "white").save(output, format="JPEG")
    response = client.post(
        f"/api/v1/ledgers/{ledger_id}/receipts/photo",
        data={"file": (io.BytesIO(output.getvalue()), "small.jpg")},
        headers={"Idempotency-Key": str(uuid.uuid4()), "X-CSRF-Token": csrf},
        content_type="multipart/form-data",
    )
    assert response.status_code == 422
    assert response.json["code"] == "IMAGE_TOO_SMALL"


def test_empty_fake_ocr_result_is_not_reported_as_llm_failure(tmp_path):
    app = make_app(tmp_path)
    settings = app.config["SETTINGS"]
    settings.ocr_engine = "fake"
    client, csrf, ledger_id = register(app)
    response = client.post(
        f"/api/v1/ledgers/{ledger_id}/receipts/photo",
        data={"file": (io.BytesIO(image_bytes()), "receipt.jpg")},
        headers={"Idempotency-Key": str(uuid.uuid4()), "X-CSRF-Token": csrf},
        content_type="multipart/form-data",
    )
    receipt_id = response.json["id"]

    assert Worker(settings, "worker-test").run_once() is True
    connection = connect(settings.database_path)
    try:
        receipt = connection.execute(
            "SELECT status, issues FROM receipts WHERE id = ?", (receipt_id,)
        ).fetchone()
    finally:
        connection.close()

    issues = json.loads(receipt["issues"])
    assert receipt["status"] == "needs_attention"
    assert "EXTRACTION_FAILED" in issues
    assert "LLM_UNAVAILABLE" not in issues
