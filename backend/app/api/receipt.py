from __future__ import annotations

import hashlib
import json
import uuid
from datetime import date
from pathlib import Path

from flask import Blueprint, current_app, g, jsonify, request
from pydantic import BaseModel, ConfigDict, Field, ValidationError

from ..db import connect, tx
from ..errors import ProblemError
from ..fx import FxService
from ..image_pipeline import ImageValidationError, decode_image, render_variants
from ..money import FxUnavailable, convert_minor
from ..security import require_auth
from ..storage import write_atomic
from ..utils import new_id, normalize_text, utc_now
from .ledger import log_activity, require_member

receipt_api = Blueprint("receipt", __name__, url_prefix="/api/v1")


class ManualReceiptRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    purchased_on: date
    currency: str | None = Field(default=None, min_length=3, max_length=3)
    amount_minor: int = Field(gt=0)
    merchant_name: str | None = Field(default=None, max_length=160)
    category_id: str | None = None
    note: str | None = Field(default=None, max_length=1000)
    fx_rate: str | None = None


def body(model):
    try:
        return model.model_validate(request.get_json(silent=True) or {})
    except ValidationError as error:
        raise ProblemError(422, "VALIDATION_ERROR", "Request body is invalid") from error


def _user_id() -> str:
    return g.current_user["user_id"]


def _upload_response(row):
    return {
        "id": row["id"],
        "ledger_id": row["ledger_id"],
        "status": row["status"],
        "source": row["source"],
        "created_at": row["created_at"],
    }


@receipt_api.post("/ledgers/<ledger_id>/receipts/photo")
@require_auth
def upload_photo(ledger_id: str):
    key = request.headers.get("Idempotency-Key", "").strip()
    try:
        uuid.UUID(key)
    except (ValueError, AttributeError) as error:
        raise ProblemError(
            422, "IDEMPOTENCY_KEY_REQUIRED", "Idempotency-Key must be a UUID"
        ) from error
    uploaded = request.files.get("file")
    if uploaded is None or not uploaded.filename:
        raise ProblemError(422, "FILE_REQUIRED", "A receipt image is required")
    data = uploaded.read()
    note = request.form.get("note")
    is_handwritten = request.form.get("is_handwritten", "false").casefold() in {
        "1",
        "true",
        "yes",
        "on",
    }
    request_hash = hashlib.sha256(
        data + b"\0" + (note or "").encode("utf-8") + b"\0" + str(is_handwritten).encode("ascii")
    ).hexdigest()
    settings = current_app.config["SETTINGS"]
    connection = connect(settings.database_path)
    try:
        require_member(connection, ledger_id, _user_id())
        existing_key = connection.execute(
            "SELECT request_hash, response_json FROM idempotency_keys WHERE user_id = ? AND key = ?",
            (_user_id(), key),
        ).fetchone()
        if existing_key:
            if existing_key["request_hash"] != request_hash:
                raise ProblemError(
                    422, "IDEMPOTENCY_MISMATCH", "Idempotency-Key was used with different content"
                )
            return jsonify(json.loads(existing_key["response_json"])), 200
        try:
            image, info = decode_image(
                data,
                max_bytes=settings.max_upload_mb * 1024 * 1024,
                max_pixels=settings.max_image_pixels,
                min_short_side=settings.min_image_short_side,
            )
        except ImageValidationError as error:
            raise ProblemError(error.status, error.code, str(error)) from error
        receipt_id = new_id()
        image_id = new_id()
        job_id = new_id()
        now = utc_now()
        relative_dir = Path("receipts") / receipt_id
        variants = render_variants(
            image,
            original_side=settings.max_original_side,
            processed_side=settings.max_processed_side,
            thumb_side=settings.max_thumb_side,
        )
        for name, value in variants.items():
            write_atomic(settings.storage_dir, relative_dir / name, value)
        with tx(connection, write=True):
            connection.execute(
                "INSERT INTO receipts(id, ledger_id, created_by, status, currency_code, source, note, issues, created_at, updated_at) "
                "SELECT ?, ?, ?, 'processing', currency_code, 'photo', ?, ?, ?, ? FROM ledgers WHERE id = ?",
                (
                    receipt_id,
                    ledger_id,
                    _user_id(),
                    note,
                    json.dumps(["HANDWRITTEN"] if is_handwritten else []),
                    now,
                    now,
                    ledger_id,
                ),
            )
            connection.execute(
                "INSERT INTO receipt_images(id, receipt_id, original_path, processed_path, thumb_path, sha256, width, height, created_at) "
                "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
                (
                    image_id,
                    receipt_id,
                    str(relative_dir / "original.jpg"),
                    str(relative_dir / "processed.jpg"),
                    str(relative_dir / "thumb.jpg"),
                    request_hash,
                    info.width,
                    info.height,
                    now,
                ),
            )
            connection.execute(
                "INSERT INTO jobs(id, receipt_id, kind, status, available_at, created_at, updated_at) VALUES (?, ?, 'extract_receipt', 'queued', ?, ?, ?)",
                (job_id, receipt_id, now, now, now),
            )
            response = _upload_response(
                connection.execute("SELECT * FROM receipts WHERE id = ?", (receipt_id,)).fetchone()
            )
            connection.execute(
                "INSERT INTO idempotency_keys(user_id, key, request_hash, response_json, created_at) VALUES (?, ?, ?, ?, ?)",
                (_user_id(), key, request_hash, json.dumps(response), now),
            )
        return jsonify(response), 202
    finally:
        connection.close()


@receipt_api.get("/meta/currencies")
def currencies():
    connection = connect(current_app.config["SETTINGS"].database_path)
    try:
        rows = connection.execute(
            "SELECT code, name, symbol, minor_unit FROM currencies ORDER BY code"
        ).fetchall()
        return jsonify({"currencies": [dict(row) for row in rows]})
    finally:
        connection.close()


@receipt_api.post("/ledgers/<ledger_id>/receipts/manual")
@require_auth
def create_manual_receipt(ledger_id: str):
    payload = body(ManualReceiptRequest)
    currency = payload.currency.upper() if payload.currency else None
    settings = current_app.config["SETTINGS"]
    connection = connect(settings.database_path)
    try:
        ledger = require_member(connection, ledger_id, _user_id())
        book_currency = connection.execute(
            "SELECT code, minor_unit FROM currencies WHERE code = ?", (ledger["currency_code"],)
        ).fetchone()
        if (
            currency
            and not connection.execute(
                "SELECT 1 FROM currencies WHERE code = ?", (currency,)
            ).fetchone()
        ):
            raise ProblemError(422, "CURRENCY_UNKNOWN", "Currency is not supported")
        receipt_currency = currency or ledger["currency_code"]
        receipt_currency_row = connection.execute(
            "SELECT code, minor_unit FROM currencies WHERE code = ?", (receipt_currency,)
        ).fetchone()
    finally:
        connection.close()

    try:
        fx = current_app.extensions.get("fx_service") or FxService(settings)
        resolved = fx.resolve(
            payload.purchased_on.isoformat(),
            receipt_currency,
            ledger["currency_code"],
            payload.fx_rate,
        )
    except ValueError as error:
        raise ProblemError(422, "FX_RATE_INVALID", str(error)) from error
    except FxUnavailable as error:
        raise ProblemError(
            409, "FX_RATE_NEEDED", "Exchange rate is unavailable; provide fx_rate"
        ) from error

    amount_ledger_minor = convert_minor(
        payload.amount_minor,
        receipt_currency_row["minor_unit"],
        book_currency["minor_unit"],
        resolved["rate"],
    )
    receipt_id = new_id()
    item_id = new_id()
    now = utc_now()
    merchant = (payload.merchant_name or "Manual expense").strip()
    connection = connect(settings.database_path)
    try:
        with tx(connection, write=True):
            ledger = require_member(connection, ledger_id, _user_id())
            if payload.category_id:
                category = connection.execute(
                    "SELECT id FROM categories WHERE id = ? AND (ledger_id IS NULL OR ledger_id = ?)",
                    (payload.category_id, ledger_id),
                ).fetchone()
                if not category:
                    raise ProblemError(
                        422, "CATEGORY_INVALID", "Category does not belong to this ledger"
                    )
            connection.execute(
                "INSERT INTO receipts(id, ledger_id, created_by, status, merchant, merchant_norm, purchased_on, "
                "currency_code, total_minor, total_ledger_minor, fx_rate, fx_date, fx_source, source, note, created_at, updated_at) "
                "VALUES (?, ?, ?, 'confirmed', ?, ?, ?, ?, ?, ?, ?, ?, ?, 'manual', ?, ?, ?)",
                (
                    receipt_id,
                    ledger_id,
                    _user_id(),
                    merchant,
                    normalize_text(merchant),
                    payload.purchased_on.isoformat(),
                    receipt_currency,
                    payload.amount_minor,
                    amount_ledger_minor,
                    resolved["rate"],
                    resolved["fx_date"],
                    resolved["source"],
                    payload.note,
                    now,
                    now,
                ),
            )
            connection.execute(
                "INSERT INTO line_items(id, receipt_id, category_id, name, name_norm, qty_milli, unit_minor, "
                "amount_minor, amount_ledger_minor, created_at) VALUES (?, ?, ?, ?, ?, 1000, ?, ?, ?, ?)",
                (
                    item_id,
                    receipt_id,
                    payload.category_id,
                    merchant,
                    normalize_text(merchant),
                    payload.amount_minor,
                    payload.amount_minor,
                    amount_ledger_minor,
                    now,
                ),
            )
            if ledger["type"] == "tracker":
                log_activity(connection, ledger_id, "receipt_created", "receipt", receipt_id)
        return jsonify(
            {
                "id": receipt_id,
                "ledger_id": ledger_id,
                "status": "confirmed",
                "merchant": merchant,
                "purchased_on": payload.purchased_on.isoformat(),
                "currency": receipt_currency,
                "total_minor": payload.amount_minor,
                "total_ledger_minor": amount_ledger_minor,
                "fx_rate": resolved["rate"],
                "fx_date": resolved["fx_date"],
                "fx_source": resolved["source"],
                "items": [{"id": item_id, "name": merchant, "amount_minor": payload.amount_minor}],
            }
        ), 201
    finally:
        connection.close()
